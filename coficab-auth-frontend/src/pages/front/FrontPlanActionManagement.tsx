// src/pages/front/FrontPlanActionManagement.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  getPlanActions,
  createPlanAction,
  updatePlanAction,
  archivePlanAction,
  reorderPlanActions,
  getUsersForAssignment,
  getActionPlanById,
  validatePlanAction,
} from '../../services/actionPlanService';
import { PlanAction, ActionPlanStatus, User, PlanActionPriority } from './action-plan.types';
import { PlanActionHistoryModal } from '../../components/PlanActionHistoryModal';
import { useTranslation } from 'react-i18next';
import { parseProgress, parseProgressRaw } from '../admin/capaAnalytics';

// ── Config ────────────────────────────────────────────────────────────────────
/** label = i18n key */
const priorityConfig: Record<PlanActionPriority, { label: string; color: string; bg: string }> = {
  low:    { label: 'myActionPlans.priorityLow',  color: 'text-blue-700', bg: 'bg-blue-100'  },
  medium: { label: 'myActionPlans.priorityMedium', color: 'text-amber-700', bg: 'bg-amber-100' },
  high:   { label: 'myActionPlans.priorityHigh',   color: 'text-red-700',   bg: 'bg-red-100'   },
};

// ── Enum converters ───────────────────────────────────────────────────────────
// Aligned with backend enum: Created=1, Ongoing=2, Closed=3, Archived=4
const priorityToNumber = (p: PlanActionPriority): number => {
  // backend convention: 1 = High, 2 = Medium, 3 = Low
  const map: Record<PlanActionPriority, number> = { high: 1, medium: 2, low: 3 };
  return map[p];
};

// The API sends enum names ("High", "Closed"); numbers are still accepted.
const numberToPriority = (n: number | string): PlanActionPriority => {
  const v = String(n).trim().toLowerCase();
  if (v === '1' || v === 'high') return 'high';
  if (v === '3' || v === 'low' || v === '0') return 'low';
  return 'medium';
};

// Backend numeric status -> frontend string status
const numberToStatus = (n: number | string): ActionPlanStatus => {
  const v = String(n).trim().toLowerCase();
  if (v === '2' || v === 'ongoing') return 'ongoing';
  if (v === '3' || v === 'closed') return 'closed';     // 100 % done, waiting for admin validation
  if (v === '4' || v === 'archived') return 'archived';
  return 'created';                                       // not yet assigned
};

// Frontend string status -> backend numeric status
const statusToNumber = (status: ActionPlanStatus): number => {
  const map: Record<ActionPlanStatus, number> = {
    created:  1,   // Created
    ongoing:  2,   // Ongoing
    closed:   3,   // Closed
    archived: 4,   // Archived
  };
  return map[status];
};

// (response parsing is handled by reloading from server after mutations)

// ── Component ─────────────────────────────────────────────────────────────────
export const FrontPlanActionManagement: React.FC = () => {
  const { t } = useTranslation();
  const { actionPlanId } = useParams<{ actionPlanId: string }>();
  const { accessToken, hasRole } = useAuth();
  const canValidate = hasRole('admin') || hasRole('superadmin');
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const [planActions, setPlanActions] = useState<PlanAction[]>([]);
  const [users, setUsers]             = useState<User[]>([]);
  const [loading, setLoading]         = useState(true);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [isCreating, setIsCreating]   = useState(false);
  const [historyActionId, setHistoryActionId] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ title: string; code?: string; department?: string; deadline?: string; status?: string; claimId?: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title:        '',
    description:  '',
    assignedToId: '',
    deadline:     '',
    priority:     'medium' as PlanActionPriority,
  });

  const nameById = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u: any) => {
      const id = String(u.id || u.Id || '');
      if (!id) return;
      map[id] =
        u.fullName ||
        u.FullName ||
        `${u.firstName || u.FirstName || ''} ${u.lastName || u.LastName || ''}`.trim() ||
        u.email ||
        u.Email ||
        id;
    });
    return map;
  }, [users]);

  useEffect(() => {
    if (actionPlanId && accessToken) loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [actionPlanId, accessToken]);

  useEffect(() => {
    if (!actionPlanId || !accessToken) return;
    getActionPlanById(accessToken, actionPlanId)
      .then((res) => {
        const p: any = res.data?.data ?? res.data;
        setPlan({ title: String(p.title ?? p.Title ?? ''), code: p.code ?? p.Code, department: p.departmentName ?? p.DepartmentName, deadline: p.deadline ?? p.Deadline, status: String(p.status ?? p.Status ?? ''), claimId: p.claimId ?? p.ClaimId ?? undefined });
      })
      .catch(() => setPlan(null));
  }, [actionPlanId, accessToken]);

  const handleValidate = async (action: PlanAction) => {
    if (!accessToken) return;
    if (!window.confirm(`Valider la sous-action « ${action.title} » ? Elle sera verrouillée : son avancement ne pourra plus être modifié.`)) return;
    setValidatingId(action.id);
    setNotice(null);
    try {
      await validatePlanAction(accessToken, action.id);
      setNotice({ ok: true, text: `Sous-action « ${action.title} » validée.` });
      await loadData();
    } catch (e: any) {
      setNotice({ ok: false, text: e?.response?.data?.error || 'La validation a échoué.' });
    } finally {
      setValidatingId(null);
    }
  };

  const toggleDetails = (id: string) => setOpenId((cur) => (cur === id ? null : id));

  const loadData = async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      const [actionsRes, usersRes] = await Promise.all([
        getPlanActions(accessToken, actionPlanId!),
        getUsersForAssignment(accessToken).catch(() => ({ data: [] })),
      ]);

      // Map backend numeric enums to frontend string types
      const mappedActions = actionsRes.data.map((a: any) => ({
        ...a,
        status:   numberToStatus(a.status),
        progress: parseProgress(a.progress),
        progressRaw: parseProgressRaw(a.progress),
        priority: numberToPriority(a.priority),
      }));

      setPlanActions(
        mappedActions.sort((a: PlanAction, b: PlanAction) => (a.order || 0) - (b.order || 0))
      );
      setUsers(usersRes.data);
    } catch (error) {
      console.error('Failed to load plan actions:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Create ────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!formData.title.trim() || !actionPlanId || !accessToken) return;
    try {
      await createPlanAction(accessToken, {
        title:        formData.title,
        description:  formData.description,
        deadline:     formData.deadline || new Date().toISOString(),
        priority:     priorityToNumber(formData.priority),
        assignedToId: formData.assignedToId || '',
        actionPlanId: actionPlanId,
        order:        planActions.length,
      });
      // Reload from server so we get the real server-assigned ID and state
      await loadData();
      resetForm();
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create plan action:', error);
      alert(t('planActionsMgmt.createFailed'));
    }
  };

  // ── Update ────────────────────────────────────────────────────────────────
  const handleUpdate = async (id: string) => {
    if (!accessToken) return;
    try {
      await updatePlanAction(accessToken, id, {
        title:        formData.title,
        description:  formData.description,
        assignedToId: formData.assignedToId || undefined,
        deadline:     formData.deadline     || undefined,
        priority:     priorityToNumber(formData.priority),
      });
      // Reload from server to get accurate state
      await loadData();
      setEditingId(null);
      resetForm();
    } catch (error) {
      console.error('Failed to update plan action:', error);
      alert(t('planActionsMgmt.updateFailed'));
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm(t('planActionsMgmt.confirmDelete')) || !accessToken) return;
    try {
      await archivePlanAction(accessToken, id);
      setPlanActions(prev => prev.filter(pa => pa.id !== id));
    } catch (error) {
      console.error('Failed to delete plan action:', error);
    }
  };

  // ── Status change ─────────────────────────────────────────────────────────
  const handleStatusChange = async (id: string, status: ActionPlanStatus) => {
    if (!accessToken) return;
    // Optimistic update for instant UI feedback
    setPlanActions(prev =>
      prev.map(pa => pa.id === id ? { ...pa, status } : pa)
    );
    try {
      await updatePlanAction(accessToken, id, { status: statusToNumber(status) });
    } catch (error) {
      console.error('Failed to update status:', error);
      // Revert on failure
      await loadData();
    }
  };

  // ── Reorder ───────────────────────────────────────────────────────────────
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up'   && index === 0)                      return;
    if (direction === 'down' && index === planActions.length - 1) return;

    const newIndex  = direction === 'up' ? index - 1 : index + 1;
    const newActions = [...planActions];
    [newActions[index], newActions[newIndex]] = [newActions[newIndex], newActions[index]];

    try {
      await reorderPlanActions(
        accessToken!,
        actionPlanId!,
        newActions.map(a => a.id).filter((id): id is string => !!id),
      );
      setPlanActions(newActions);
    } catch (error) {
      console.error('Failed to reorder:', error);
    }
  };

  // ── Form helpers ──────────────────────────────────────────────────────────
  const startEdit = (action: PlanAction) => {
    setFormData({
      title:        action.title,
      description:  action.description || '',
      assignedToId: action.assignedToId || '',
      deadline:     action.deadline ? action.deadline.split('T')[0] : '',
      priority:     action.priority || 'medium',
    });
    setEditingId(action.id);
    setIsCreating(false);
  };

  const resetForm = () => {
    setFormData({ title: '', description: '', assignedToId: '', deadline: '', priority: 'medium' });
  };

  const startCreate = () => {
    resetForm();
    setIsCreating(true);
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    resetForm();
  };

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!actionPlanId) {
    return <div className="p-8 text-center text-red-500">{t('planActionsMgmt.missingId')}</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a237e]"></div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('planActionsMgmt.title')}</h1>
              {plan ? (
                <p className="mt-1 text-sm text-gray-600" title={`${t('planActionsMgmt.planId')} : ${actionPlanId}`}>
                  <span className="font-semibold text-gray-800">{plan.title}</span>
                  {plan.code ? ` · ${plan.code}` : ''}
                  {plan.department ? ` · ${plan.department}` : ''}
                  {plan.deadline ? ` · échéance ${new Date(plan.deadline).toLocaleDateString('fr-FR')}` : ''}
                </p>
              ) : (
                <p className="mt-1 text-sm text-gray-500">{t('planActionsMgmt.planId')} : {actionPlanId}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
            {actionPlanId && (
              <Link to={`/pages/front/action-plans/${actionPlanId}`} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50">
                Ouvrir le plan
              </Link>
            )}
            {plan?.claimId && (
              <Link to={`/pages/front/quality-analyses/8d/${encodeURIComponent(String(plan.claimId))}`} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-50">
                Dossier qualité
              </Link>
            )}
            {!isCreating && (
              <button
                onClick={startCreate}
                className="px-4 py-2 bg-[#1a237e] text-white rounded-lg hover:bg-[#0d1642] transition-colors text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('planActionsMgmt.addAction')}
              </button>
            )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {notice && (
          <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{notice.text}</div>
        )}

        {/* Create / Edit Form */}
        {(isCreating || editingId) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4">
            <h3 className="font-semibold text-gray-900 mb-4">
              {editingId ? t('planActionsMgmt.editAction') : t('planActionsMgmt.newAction')}
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('dashboard.colTitle')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1a237e] focus:border-transparent outline-none text-sm"
                placeholder={t('planActionsMgmt.titlePh')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('claimDetail.description')}</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1a237e] focus:border-transparent outline-none text-sm resize-none"
                placeholder={t('planActionsMgmt.descriptionPh')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('claimDetail.assignedTo')}</label>
                <select
                  value={formData.assignedToId}
                  onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1a237e] focus:border-transparent outline-none text-sm bg-white"
                >
                  <option value="">{t('claimDetail.unassigned')}</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('planView.colPriority')}</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as PlanActionPriority })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1a237e] focus:border-transparent outline-none text-sm bg-white"
                >
                  <option value="low">{t('myActionPlans.priorityLow')}</option>
                  <option value="medium">{t('myActionPlans.priorityMedium')}</option>
                  <option value="high">{t('myActionPlans.priorityHigh')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('myActionPlans.deadline')}</label>
                <input
                  type="date"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1a237e] focus:border-transparent outline-none text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={cancelEdit}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => (editingId ? handleUpdate(editingId) : handleCreate())}
                disabled={!formData.title.trim()}
                className="px-4 py-2 bg-[#1a237e] text-white rounded-lg hover:bg-[#0d1642] transition-colors text-sm disabled:opacity-50"
              >
                {editingId ? t('plansAdmin.update') : t('orgs.create')}
              </button>
            </div>
          </div>
        )}

        {/* Plan Actions List */}
        <div className="space-y-3">
          {planActions.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
              <p className="text-sm">{t('planDetailFront.noActions')}</p>
              <p className="text-xs mt-1">{t('planActionsMgmt.emptyHint')}</p>
            </div>
          ) : (
            planActions.map((action, index) => (
              <div
                key={action.id}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-[260px]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500">#{index + 1}</span>
                      <h4 className="font-medium text-gray-900">{action.title}</h4>
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${priorityConfig[action.priority].bg} ${priorityConfig[action.priority].color}`}>
                        {t(priorityConfig[action.priority].label)}
                      </span>
                    </div>
                    {action.description && (
                      <p className="text-sm text-gray-600 mb-2">{action.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {(() => {
                        const u = users.find((x) => String(x.id) === String(action.assignedToId));
                        const name = action.assignedToName
                          || u?.fullName
                          || `${u?.firstName || ''} ${u?.lastName || ''}`.trim()
                          || action.assignedTo?.fullName
                          || '';
                        return (
                          <span className={`flex items-center gap-1 ${name ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            {name || t('claimDetail.unassigned')}
                          </span>
                        );
                      })()}
                      {action.deadline && (
                        <span className={`flex items-center gap-1 ${
                          (() => {
                            const prog = action.progressRaw ?? 0;
                            if (prog >= 100 || action.status === 'closed' || action.status === 'archived') return false;
                            const d = new Date(action.deadline);
                            d.setHours(0, 0, 0, 0);
                            const n = new Date();
                            n.setHours(0, 0, 0, 0);
                            return d.getTime() < n.getTime();
                          })() ? 'text-red-600 font-semibold' : ''
                        }`}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {new Date(action.deadline).toLocaleDateString('fr-FR')}
                          {(() => {
                            const prog = action.progressRaw ?? 0;
                            if (prog >= 100 || action.status === 'closed' || action.status === 'archived') return null;
                            const d = new Date(action.deadline);
                            d.setHours(0, 0, 0, 0);
                            const n = new Date();
                            n.setHours(0, 0, 0, 0);
                            if (d.getTime() >= n.getTime()) return null;
                            return <span> · {t('planDetailFront.lateLower')}</span>;
                          })()}
                        </span>
                      )}
                      {action.createdAt && (
                        <span>Créée le {new Date(action.createdAt).toLocaleDateString('fr-FR')}</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2 max-w-xs">
                      <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, action.progress ?? 0)}%`, background: (action.progressRaw ?? 0) === 101 ? '#2f855a' : (action.progressRaw ?? 0) === 100 ? '#f59e0b' : '#1a237e' }} />
                      </div>
                      <span className="text-[11px] tabular-nums text-gray-600">
                        {(action.progressRaw ?? 0) === 101 ? 'Validée' : (action.progressRaw ?? 0) === 102 ? 'Annulée' : `${action.progress ?? 0} %`}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(action.progressRaw ?? 0) === 101 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">✓ Validée</span>
                    ) : (action.progressRaw ?? 0) === 100 && canValidate ? (
                      <button
                        type="button"
                        disabled={validatingId === action.id}
                        onClick={() => void handleValidate(action)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#1a237e] text-white hover:bg-[#0d1642] disabled:opacity-50"
                      >
                        {validatingId === action.id ? 'Validation…' : 'Valider'}
                      </button>
                    ) : null}
                    <select
                      disabled={(action.progressRaw ?? 0) === 101}
                      value={action.status}
                      onChange={(e) => handleStatusChange(action.id, e.target.value as ActionPlanStatus)}
                      className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white focus:ring-2 focus:ring-[#1a237e] focus:border-transparent outline-none disabled:opacity-60"
                    >
                      <option value="created">{t('planDetailFront.statusAwaitingAssignment')}</option>
                      <option value="ongoing">{t('status.ongoing')}</option>
                      <option value="closed">{t('plansAdmin.statusPending')}</option>
                      <option value="archived">{t('status.archived')}</option>
                    </select>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMove(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                        title={t('planActionsMgmt.moveUp')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleMove(index, 'down')}
                        disabled={index === planActions.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                        title={t('planActionsMgmt.moveDown')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => startEdit(action)}
                        className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
                        title={t('common.edit')}
                        type="button"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setHistoryActionId(action.id)}
                        className="px-2 py-1 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                        title={t('planDetailFront.assignmentHistory')}
                        type="button"
                      >
                        {t('planView.tabHistory')}
                      </button>
                      <button
                        onClick={() => toggleDetails(action.id)}
                        aria-expanded={openId === action.id}
                        className="px-2 py-1 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                        type="button"
                      >
                        {openId === action.id ? 'Masquer' : 'Détails'}
                      </button>
                      <Link
                        to={`/pages/front/action-plans/${actionPlanId}`}
                        className="px-2 py-1 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                        title="Voir cette sous-action dans la page du plan"
                      >
                        Dans le plan
                      </Link>
                      <button
                        onClick={() => handleDelete(action.id)}
                        className="p-1 text-red-600 hover:text-red-800 transition-colors"
                        title={t('common.delete')}
                        type="button"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
                {openId === action.id && (() => {
                  const u = users.find((x) => String(x.id) === String(action.assignedToId));
                  const who = action.assignedToName || u?.fullName || `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || t('claimDetail.unassigned');
                  const statusText = ({ created: t('planDetailFront.statusAwaitingAssignment'), ongoing: t('status.ongoing'), closed: t('plansAdmin.statusPending'), archived: t('status.archived') } as Record<string, string>)[action.status ?? 'created'];
                  const rows: [string, React.ReactNode][] = [
                    ['Responsable', who],
                    ['Priorité', t(priorityConfig[action.priority].label)],
                    ['Statut', statusText],
                    ['Avancement', (action.progressRaw ?? 0) === 101 ? 'Validée' : (action.progressRaw ?? 0) === 102 ? 'Annulée' : `${action.progress ?? 0} %`],
                    ['Échéance', action.deadline ? new Date(action.deadline).toLocaleDateString('fr-FR') : '—'],
                    ['Créée le', action.createdAt ? new Date(action.createdAt).toLocaleDateString('fr-FR') : '—'],
                  ];
                  return (
                    <div className="mt-4 pt-4 border-t border-gray-100 grid gap-4 sm:grid-cols-2">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">Description</div>
                        <p className="text-sm text-gray-700 m-0 whitespace-pre-wrap">{action.description || <span className="text-gray-400">Aucune description.</span>}</p>
                      </div>
                      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        {rows.map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{k}</dt>
                            <dd className="m-0 text-gray-800">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  );
                })()}
              </div>
            ))
          )}
        </div>
      </div>

      {historyActionId && accessToken && (
        <PlanActionHistoryModal
          token={accessToken}
          planActionId={historyActionId}
          actionTitle={planActions.find((a) => a.id === historyActionId)?.title}
          nameById={nameById}
          onClose={() => setHistoryActionId(null)}
          initialTab="assignments"
        />
      )}
    </div>
  );
};

export default FrontPlanActionManagement;