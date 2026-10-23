import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import {
  WORKFLOW_ROLES,
  WorkflowConfig,
  WorkflowStatus,
  WorkflowTransition,
  workflowService,
} from '../../services/workflowService';

const NAVY = '#000168';
const LINE = '#e4e8f2';

const DEFAULT_LABELS: Record<string, { fr: string; key: string }> = {
  DRAFT: { fr: 'Brouillon', key: 'draft' },
  OUVERTE: { fr: 'Ouverte', key: 'open' },
  ASSIGNED: { fr: 'Assignée', key: 'assigned' },
  EN_ANALYSE: { fr: 'En analyse', key: 'inAnalysis' },
  PENDING_VALIDATION: { fr: 'En attente de validation', key: 'pendingValidation' },
  CLOTUREE: { fr: 'Clôturée', key: 'closed' },
  VALIDATED: { fr: 'Validée', key: 'validated' },
  REJECTED: { fr: 'Rejetée', key: 'rejected' },
};

const WorkflowConfigPage: React.FC = () => {
  const { t } = useTranslation();
  const { accessToken, hasRole } = useAuth();
  const canEdit = hasRole('superadmin');

  // the seeded French names follow the language of the interface; a status renamed by an administrator keeps its own name
  const shown = (code: string, stored: string) => {
    const known = DEFAULT_LABELS[code];
    return known && known.fr === stored ? t(`claimStatus.${known.key}`) : stored;
  };

  const [config, setConfig] = useState<WorkflowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [newStatus, setNewStatus] = useState({ code: '', label: '' });
  const [newMove, setNewMove] = useState({ from: '', to: '' });

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setConfig(await workflowService.get(accessToken));
      setDirty(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || t('workflowConfig.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  const labelOf = useMemo(() => {
    const map = new Map((config?.statuses ?? []).map((s) => [s.code, shown(s.code, s.label)]));
    return (code: string) => map.get(code) || code;
  }, [config]);

  const change = (next: WorkflowConfig) => {
    setConfig(next);
    setDirty(true);
    setSaved(false);
  };

  const patchStatus = (code: string, patch: Partial<WorkflowStatus>) =>
    config && change({ ...config, statuses: config.statuses.map((s) => (s.code === code ? { ...s, ...patch } : s)) });

  const patchMove = (from: string, to: string, patch: Partial<WorkflowTransition>) =>
    config && change({
      ...config,
      transitions: config.transitions.map((m) => (m.from === from && m.to === to ? { ...m, ...patch } : m)),
    });

  const toggleRole = (move: WorkflowTransition, role: string) => {
    const roles = move.roles.includes(role) ? move.roles.filter((r) => r !== role) : [...move.roles, role];
    patchMove(move.from, move.to, { roles });
  };

  const addStatus = () => {
    if (!config) return;
    const code = newStatus.code.trim().toUpperCase().replace(/\s+/g, '_');
    const label = newStatus.label.trim();
    if (!code || !label || config.statuses.some((s) => s.code === code)) return;
    change({
      ...config,
      statuses: [...config.statuses, { code, label, sortOrder: config.statuses.length + 1, isFinal: false, isActive: true }],
    });
    setNewStatus({ code: '', label: '' });
  };

  const addMove = () => {
    if (!config || !newMove.from || !newMove.to || newMove.from === newMove.to) return;
    if (config.transitions.some((m) => m.from === newMove.from && m.to === newMove.to)) return;
    change({
      ...config,
      transitions: [...config.transitions, { from: newMove.from, to: newMove.to, roles: ['admin', 'superadmin'], isActive: true }],
    });
    setNewMove({ from: '', to: '' });
  };

  const save = async () => {
    if (!config || !accessToken) return;
    setSaving(true);
    setError(null);
    try {
      setConfig(await workflowService.save(config, accessToken));
      setDirty(false);
      setSaved(true);
    } catch (e: any) {
      setError(e?.response?.data?.message || t('workflowConfig.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const input = 'px-2 py-1 text-sm rounded-lg border bg-white disabled:bg-slate-50';
  const card = { border: `1px solid ${LINE}` } as const;
  const activeStatuses = (config?.statuses ?? []).filter((s) => s.isActive);

  return (
    <div className="pb-6 max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[1.4px] mb-1" style={{ color: NAVY }}>
            {t('workflowConfig.eyebrow')}
          </div>
          <h1 className="text-xl font-bold m-0" style={{ color: '#0d1340' }}>{t('workflowConfig.title')}</h1>
          <p className="text-sm mt-1 mb-0 text-slate-500">{t('workflowConfig.subtitle')}</p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="px-4 py-2 text-sm font-bold rounded-xl text-white disabled:opacity-40"
            style={{ background: NAVY }}
          >
            {saving ? t('workflowConfig.saving') : t('workflowConfig.save')}
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="mb-4 rounded-xl text-sm px-4 py-3 bg-amber-50 text-amber-800" style={{ border: '1px solid #fde68a' }}>
          {t('workflowConfig.readOnly')}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl text-sm px-4 py-3 bg-red-50 text-red-700" style={{ border: '1px solid #fecaca' }}>{error}</div>
      )}
      {saved && !error && (
        <div className="mb-4 rounded-xl text-sm px-4 py-3 bg-emerald-50 text-emerald-800" style={{ border: '1px solid #a7f3d0' }}>
          {t('workflowConfig.saved')}
        </div>
      )}
      {loading && <div className="text-sm text-slate-500">{t('workflowConfig.loading')}</div>}

      {config && (
        <>
          <section className="rounded-xl bg-white shadow-sm p-4 mb-4" style={card}>
            <h2 className="text-sm font-bold m-0 mb-1">{t('workflowConfig.statuses')}</h2>
            <p className="text-xs text-slate-500 mt-0 mb-3">{t('workflowConfig.statusesHelp')}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-slate-500">
                    <th className="py-1 pr-2">{t('workflowConfig.code')}</th>
                    <th className="py-1 pr-2">{t('workflowConfig.label')}</th>
                    <th className="py-1 pr-2">{t('workflowConfig.order')}</th>
                    <th className="py-1 pr-2">{t('workflowConfig.final')}</th>
                    <th className="py-1">{t('workflowConfig.active')}</th>
                  </tr>
                </thead>
                <tbody>
                  {config.statuses.map((s) => (
                    <tr key={s.code} className={s.isActive ? '' : 'opacity-50'}>
                      <td className="py-1 pr-2 font-mono text-xs">{s.code}</td>
                      <td className="py-1 pr-2">
                        <input className={`${input} w-56`} value={s.label} disabled={!canEdit}
                          onChange={(e) => patchStatus(s.code, { label: e.target.value })} />
                      </td>
                      <td className="py-1 pr-2">
                        <input className={`${input} w-16`} type="number" value={s.sortOrder} disabled={!canEdit}
                          onChange={(e) => patchStatus(s.code, { sortOrder: Number(e.target.value) || 0 })} />
                      </td>
                      <td className="py-1 pr-2">
                        <input type="checkbox" checked={s.isFinal} disabled={!canEdit}
                          onChange={(e) => patchStatus(s.code, { isFinal: e.target.checked })} />
                      </td>
                      <td className="py-1">
                        <input type="checkbox" checked={s.isActive} disabled={!canEdit}
                          onChange={(e) => patchStatus(s.code, { isActive: e.target.checked })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <input className={`${input} w-44`} placeholder={t('workflowConfig.newCode')} value={newStatus.code}
                  onChange={(e) => setNewStatus({ ...newStatus, code: e.target.value })} />
                <input className={`${input} w-56`} placeholder={t('workflowConfig.newLabel')} value={newStatus.label}
                  onChange={(e) => setNewStatus({ ...newStatus, label: e.target.value })} />
                <button type="button" onClick={addStatus} className="px-3 py-1 text-sm font-semibold rounded-lg border" style={{ color: NAVY, borderColor: NAVY }}>
                  {t('workflowConfig.addStatus')}
                </button>
              </div>
            )}
          </section>

          <section className="rounded-xl bg-white shadow-sm p-4" style={card}>
            <h2 className="text-sm font-bold m-0 mb-1">{t('workflowConfig.transitions')}</h2>
            <p className="text-xs text-slate-500 mt-0 mb-3">{t('workflowConfig.transitionsHelp')}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-slate-500">
                    <th className="py-1 pr-2">{t('workflowConfig.from')}</th>
                    <th className="py-1 pr-2">{t('workflowConfig.to')}</th>
                    {WORKFLOW_ROLES.map((r) => (
                      <th key={r} className="py-1 pr-2">{t(`workflowConfig.role.${r}`)}</th>
                    ))}
                    <th className="py-1">{t('workflowConfig.active')}</th>
                  </tr>
                </thead>
                <tbody>
                  {config.transitions.map((m) => (
                    <tr key={`${m.from}>${m.to}`} className={m.isActive ? '' : 'opacity-50'}>
                      <td className="py-1 pr-2">{labelOf(m.from)}</td>
                      <td className="py-1 pr-2">→ {labelOf(m.to)}</td>
                      {WORKFLOW_ROLES.map((r) => (
                        <td key={r} className="py-1 pr-2">
                          <input type="checkbox" checked={m.roles.includes(r)} disabled={!canEdit}
                            onChange={() => toggleRole(m, r)} />
                        </td>
                      ))}
                      <td className="py-1">
                        <input type="checkbox" checked={m.isActive} disabled={!canEdit}
                          onChange={(e) => patchMove(m.from, m.to, { isActive: e.target.checked })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <select className={input} value={newMove.from} onChange={(e) => setNewMove({ ...newMove, from: e.target.value })}>
                  <option value="">{t('workflowConfig.from')}</option>
                  {activeStatuses.map((s) => <option key={s.code} value={s.code}>{shown(s.code, s.label)}</option>)}
                </select>
                <span>→</span>
                <select className={input} value={newMove.to} onChange={(e) => setNewMove({ ...newMove, to: e.target.value })}>
                  <option value="">{t('workflowConfig.to')}</option>
                  {activeStatuses.map((s) => <option key={s.code} value={s.code}>{shown(s.code, s.label)}</option>)}
                </select>
                <button type="button" onClick={addMove} className="px-3 py-1 text-sm font-semibold rounded-lg border" style={{ color: NAVY, borderColor: NAVY }}>
                  {t('workflowConfig.addTransition')}
                </button>
              </div>
            )}
          </section>

          <p className="text-xs text-slate-500 mt-3">{t('workflowConfig.note')}</p>
        </>
      )}
    </div>
  );
};

export default WorkflowConfigPage;
