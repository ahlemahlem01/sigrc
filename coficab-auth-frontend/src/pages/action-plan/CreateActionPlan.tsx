import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  createActionPlan,
  getDepartments,
  getUsersForAssignment,
} from '../../services/actionPlanService';
import { Plus, Trash2, Save, ArrowLeft } from 'lucide-react';
import {
  CapaPageHeader,
  CapaPageShell,
  CapaPanel,
  capaBtnPrimary,
  capaBtnSecondary,
  capaInputCls,
  capaSelectCls,
} from '../../components/capa/CapaAdminUi';
import { EmployeeRecommendationBanner } from '../../components/EmployeeRecommendationBanner';
import './CreateActionPlan.css';
import { useTranslation } from 'react-i18next';
import { useReferenceLists } from '../../hooks/useReferenceLists';
import { DEFAULT_DOMAIN, domainLabel } from '../../utils/planDomain';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';

interface DepartmentDto {
  id: string;
  name: string;
  code: string;
}

interface UserDto {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  departmentId?: string;
}

interface PlanActionForm {
  id: number;
  title: string;
  description: string;
  priority: number;
  deadline: string;
  assignedToId: string;
}

const PLAN_TYPE_TO_DEFECT: Record<number, string> = {
  1: 'Dimensionnel',
  2: 'Fonctionnel',
  3: 'Documentation',
};

const PLAN_PRIORITY_TO_SEVERITY: Record<number, string> = {
  1: 'HIGH',
  2: 'MEDIUM',
  3: 'LOW',
};

const userLabel = (u: UserDto) =>
  u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : u.email;

export default function CreateActionPlan() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState(1);
  const [claimQuery, setClaimQuery] = useState('');
  const [claimResults, setClaimResults] = useState<Array<{ id: string; title: string; isInternal: boolean; lotNumber?: string; productionLine?: string | null }>>([]);
  const [linkedClaim, setLinkedClaim] = useState<{ id: string; title: string; isInternal: boolean } | null>(null);
  const [domain, setDomain] = useState(DEFAULT_DOMAIN);
  const { domains } = useReferenceLists();
  const [departmentId, setDepartmentId] = useState('');

  const [actions, setActions] = useState<PlanActionForm[]>([
    { id: 1, title: '', description: '', priority: 2, deadline: '', assignedToId: '' },
  ]);
  /** Action explicitement ciblée par le bandeau IA (null = aucune). */
  const [selectedActionId, setSelectedActionId] = useState<number | null>(1);

  useEffect(() => {
    if (accessToken) {
      getDepartments(accessToken).then((res) => setDepartments(res.data));
      getUsersForAssignment(accessToken).then((res) => {
        const raw = Array.isArray(res.data) ? res.data : (res.data?.$values ?? res.data?.items ?? []);
        setUsers(
          (raw as any[])
            .map((u) => ({
              id: String(u.id ?? u.userId ?? ''),
              email: String(u.email ?? ''),
              firstName: u.firstName,
              lastName: u.lastName,
              department: u.department ?? u.Department ?? undefined,
              departmentId: u.departmentId
                ? String(u.departmentId)
                : u.DepartmentId
                  ? String(u.DepartmentId)
                  : undefined,
            }))
            .filter((u) => u.id)
        );
      });
    }
  }, [accessToken]);

  const selectedAction = useMemo(
    () => actions.find((a) => a.id === selectedActionId) ?? null,
    [actions, selectedActionId]
  );

  const recommendEmployees = useMemo(
    () =>
      users.map((u) => ({
        employeeId: u.id,
        name: userLabel(u),
        email: u.email,
        department: u.department,
        departmentId: u.departmentId,
      })),
    [users]
  );

  const selectedDepartment = useMemo(
    () => departments.find((d) => d.id === departmentId) ?? null,
    [departments, departmentId]
  );

  const addAction = () => {
    setActions((prev) => {
      const nextId = Math.max(0, ...prev.map((a) => a.id)) + 1;
      return [
        ...prev,
        {
          id: nextId,
          title: '',
          description: '',
          priority: 2,
          deadline: '',
          assignedToId: '',
        },
      ];
    });
  };

  const removeAction = (index: number) => {
    if (actions.length <= 1) return;
    setActions((prev) => {
      const removed = prev[index];
      const next = prev.filter((_, i) => i !== index);
      setSelectedActionId((cur) => {
        if (cur == null) return next[0]?.id ?? null;
        if (removed && cur === removed.id) return next[0]?.id ?? null;
        if (!next.some((a) => a.id === cur)) return next[0]?.id ?? null;
        return cur;
      });
      return next;
    });
  };

  const updateAction = (index: number, field: keyof PlanActionForm, value: string | number) => {
    setActions((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  };

  // search among the open claims while the person types (a short list, never the whole base)
  useEffect(() => {
    const text = claimQuery.trim();
    if (!accessToken || text.length < 2) { setClaimResults([]); return undefined; }
    const id = window.setTimeout(async () => {
      try {
        const page = await qualityAnalysisService.getClaimsHistory({ search: text, page: 1, pageSize: 6, scope: 'open' } as any, accessToken);
        setClaimResults((page.items ?? []).map((c: any) => ({ id: c.id, title: c.title, isInternal: !!c.isInternal, lotNumber: c.lotNumber, productionLine: c.productionLine })));
      } catch {
        setClaimResults([]);
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [claimQuery, accessToken]);

  const pickClaim = (c: { id: string; title: string; isInternal: boolean }) => {
    setLinkedClaim(c);
    setClaimQuery('');
    setClaimResults([]);
    if (c.isInternal) setType(2);   // an internal problem is closed with a corrective plan (PAC)
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    setSaving(true);
    try {
      const planResponse = await createActionPlan(accessToken, {
        title,
        description,
        type,
        domain,
        departmentId,
        claimId: linkedClaim?.id,
      });

      const newPlanId = planResponse.data.id;
      navigate(`/admin/action-plans/${newPlanId}`);
    } catch (err: any) {
      alert(err.response?.data?.error || t('createPlan.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  const typeLabel =
    type === 1 ? t('createPlan.typeSumPA') : type === 2 ? t('createPlan.typeSumPAC') : t('createPlan.typeSumPAP');

  return (
    <CapaPageShell>
      <button
        type="button"
        className={`${capaBtnSecondary} mb-4`}
        onClick={() => navigate('/admin/action-plans')}
      >
        <ArrowLeft size={16} /> {t('planDetailFront.backToPlans')}
      </button>

      <CapaPageHeader
        eyebrow={t('createPlan.eyebrow')}
        title={t('admin.newPlan')}
        subtitle={t('createPlan.subtitle')}
      />

      <form onSubmit={handleSubmit} className="capa-create-form">
        <div className="capa-create-grid">
          <div className="capa-create-main">
            <CapaPanel className="mb-4">
              <h2 className="capa-create-sec-title">{t('qrqc.linkedClaim')}</h2>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#64748b' }}>{t('qrqc.linkedClaimHint')}</p>
              {linkedClaim ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 13 }}>{linkedClaim.title}</strong>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: linkedClaim.isInternal ? '#fff7e6' : '#f1f5f9', color: linkedClaim.isInternal ? '#92400e' : '#475569' }}>
                    {linkedClaim.isInternal ? t('qrqc.internalBadge') : t('qrqc.customerClaim')}
                  </span>
                  <button type="button" className={capaBtnSecondary} onClick={() => setLinkedClaim(null)}>{t('qrqc.unlinkClaim')}</button>
                  {linkedClaim.isInternal && type !== 2 && (
                    <span style={{ fontSize: 12, color: '#92400e' }}>{t('qrqc.planNeedsCorrective')}</span>
                  )}
                </div>
              ) : (
                <>
                  <input className={capaInputCls} value={claimQuery} onChange={(e) => setClaimQuery(e.target.value)} placeholder={t('qrqc.searchClaim')} />
                  {claimResults.length > 0 && (
                    <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      {claimResults.map((c) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => pickClaim(c)} style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 0, borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: 13 }}>
                            {c.title} <span style={{ color: '#64748b', fontSize: 11 }}>· {c.productionLine || '—'} · {c.lotNumber || '—'}{c.isInternal ? ` · ${t('qrqc.internalBadge')}` : ''}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </CapaPanel>
            <CapaPanel className="mb-4">
              <h2 className="capa-create-sec-title">
                <span className="capa-create-sec-num">1</span> {t('createPlan.section1')}
              </h2>

              <div className="mb-3">
                <label className="capa-create-label">{t('dashboard.colTitle')} *</label>
                <input
                  className={capaInputCls}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('createPlan.titlePh')}
                  required
                />
              </div>

              <div className="capa-create-two-col mb-3">
                <div>
                  <label className="capa-create-label">{t('planDetail.type')} *</label>
                  <select
                    className={capaSelectCls}
                    value={type}
                    onChange={(e) => setType(parseInt(e.target.value, 10))}
                    required
                  >
                    <option value={1}>{t('createPlan.typeOptPA')}</option>
                    <option value={2}>{t('createPlan.typeOptPAC')}</option>
                    <option value={3}>{t('createPlan.typeOptPAP')}</option>
                  </select>
                </div>
                <div>
                  <label className="capa-create-label">{t('planDetail.department')} *</label>
                  <select
                    className={capaSelectCls}
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    required
                  >
                    <option value="">{t('myActionPlans.select')}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-3">
                <label className="capa-create-label">{t('planDomain.label')} *</label>
                <select className={capaSelectCls} value={domain} onChange={(e) => setDomain(e.target.value)} required title={t('planDomain.help')}>
                  {domains.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="capa-create-label">{t('claimDetail.description')}</label>
                <textarea
                  className={capaInputCls}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder={t('createPlan.descriptionPh')}
                />
              </div>
            </CapaPanel>

            <CapaPanel>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="capa-create-sec-title mb-0">
                  <span className="capa-create-sec-num">2</span> {t('planDetailFront.planActions')}
                </h2>
                <button type="button" className={capaBtnSecondary} onClick={addAction}>
                  <Plus size={14} /> {t('planActionsMgmt.addAction')}
                </button>
              </div>

              <p className="capa-create-select-hint">
                {t('createPlan.selectHint')}
                {selectedAction
                  ? ` ${t('createPlan.currentTarget')} : A${selectedAction.id}${
                      selectedAction.title ? ` — ${selectedAction.title}` : ''
                    }.`
                  : ` ${t('createPlan.noneSelected')}`}
              </p>

              <EmployeeRecommendationBanner
                defectType={PLAN_TYPE_TO_DEFECT[type] || 'Fonctionnel'}
                severity={
                  PLAN_PRIORITY_TO_SEVERITY[selectedAction?.priority ?? 2] || 'MEDIUM'
                }
                departmentId={departmentId || null}
                departmentCode={selectedDepartment?.code || null}
                departmentName={selectedDepartment?.name || null}
                employees={recommendEmployees}
                assignDisabled={selectedActionId == null}
                assignDisabledHint={t('createPlan.selectFirst')}
                onAssign={(employeeId) => {
                  if (selectedActionId == null) return;
                  setActions((prev) =>
                    prev.map((a) =>
                      a.id === selectedActionId ? { ...a, assignedToId: employeeId } : a
                    )
                  );
                }}
              />

              <div className="flex flex-col gap-3">
                {actions.map((action, index) => {
                  const isSelected = action.id === selectedActionId;
                  return (
                    <div
                      key={action.id}
                      role="button"
                      tabIndex={0}
                      className={`capa-create-action-row${isSelected ? ' is-selected' : ''}`}
                      onClick={() => setSelectedActionId(action.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedActionId(action.id);
                        }
                      }}
                      aria-pressed={isSelected}
                    >
                      <div className="capa-create-action-num">A{action.id}</div>
                      <div className="flex-1 flex flex-col gap-2">
                        <input
                          className={capaInputCls}
                          type="text"
                          value={action.title}
                          onChange={(e) => updateAction(index, 'title', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onFocus={() => setSelectedActionId(action.id)}
                          placeholder={t('planActionsMgmt.titlePh')}
                          required
                        />
                        <input
                          className={capaInputCls}
                          type="text"
                          value={action.description}
                          onChange={(e) => updateAction(index, 'description', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onFocus={() => setSelectedActionId(action.id)}
                          placeholder={t('claimDetail.description')}
                        />
                        <div className="capa-create-three-col">
                          <select
                            className={capaSelectCls}
                            value={action.priority}
                            onChange={(e) =>
                              updateAction(index, 'priority', parseInt(e.target.value, 10))
                            }
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => setSelectedActionId(action.id)}
                          >
                            <option value={1}>{t('createPlan.priorityHigh')}</option>
                            <option value={2}>{t('createPlan.priorityMedium')}</option>
                            <option value={3}>{t('createPlan.priorityLow')}</option>
                          </select>
                          <input
                            className={capaInputCls}
                            type="date"
                            value={action.deadline}
                            onChange={(e) => updateAction(index, 'deadline', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => setSelectedActionId(action.id)}
                          />
                          <select
                            className={capaSelectCls}
                            value={action.assignedToId}
                            onChange={(e) => updateAction(index, 'assignedToId', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={() => setSelectedActionId(action.id)}
                          >
                            <option value="">{t('createPlan.assignTo')}</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>
                                {userLabel(u)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="capa-create-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAction(index);
                        }}
                        disabled={actions.length === 1}
                        title={t('common.delete')}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </CapaPanel>
          </div>

          <aside className="capa-create-aside">
            <CapaPanel className="mb-4">
              <h3 className="text-sm font-bold text-[#000168] mb-3 pb-2 border-b border-slate-100">
                {t('createPlan.summary')}
              </h3>
              <div className="capa-create-sum-row">
                <span>{t('createPlan.actionsDefined')}</span>
                <span className="font-semibold text-[#000168]">{actions.length}</span>
              </div>
              <div className="capa-create-sum-row">
                <span>{t('planDetail.type')}</span>
                <span className="font-semibold text-[#000168]">{typeLabel}</span>
              </div>
              <div className="capa-create-sum-row">
                <span>{t('planDomain.label')}</span>
                <span className="font-semibold text-[#000168]">{domainLabel(domain)}</span>
              </div>
              <div className="capa-create-sum-row">
                <span>{t('planDetail.department')}</span>
                <span className="font-semibold text-[#000168]">
                  {departments.find((d) => d.id === departmentId)?.name || '—'}
                </span>
              </div>
              <div className="capa-create-sum-row">
                <span>{t('createPlan.aiAction')}</span>
                <span className="font-semibold text-[#000168]">
                  {selectedAction ? `A${selectedAction.id}` : '—'}
                </span>
              </div>
            </CapaPanel>

            <div className="flex flex-col gap-2">
              <button type="submit" className={`${capaBtnPrimary} justify-center w-full`} disabled={saving}>
                <Save size={16} />
                {saving ? t('createPlan.creating') : t('createPlan.create')}
              </button>
              <button
                type="button"
                className={`${capaBtnSecondary} justify-center w-full`}
                onClick={() => navigate('/admin/action-plans')}
              >
                {t('common.cancel')}
              </button>
            </div>
          </aside>
        </div>
      </form>
    </CapaPageShell>
  );
}
