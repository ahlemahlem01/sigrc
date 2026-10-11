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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    setSaving(true);
    try {
      const planResponse = await createActionPlan(accessToken, {
        title,
        description,
        type,
        departmentId,
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
