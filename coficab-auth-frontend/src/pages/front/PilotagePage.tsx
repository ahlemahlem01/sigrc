import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useOrganizationScope } from '../../context/OrganizationScopeContext';
import { getOrganizations } from '../../services/adminService';
import { departmentService } from '../../services/departmentService';
import { getPilotage, type Pilotage, type PilotageItem } from '../../services/employeeWorkspaceService';
import './FrontWorkspaceHome.styles.css';
import '../../components/employee/WorkspaceExtras.styles.css';

const CLAIM_PATH = (id: string) => `/pages/front/quality-analyses/8d/${id}`;
const PLAN_PATH = (id: string) => `/pages/front/action-plans/${id}`;

/** "Pilotage": what the administrator has to decide or watch today, oldest and most late first. */
export default function PilotagePage() {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<Pilotage | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const { selectedIds, ready } = useOrganizationScope();
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  // '' = every organization / department. Starts on the organization followed in the top bar when there is exactly one.
  const [orgId, setOrgId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState('');
  const locale = i18n.language?.startsWith('en') ? 'en-GB' : i18n.language?.startsWith('it') ? 'it-IT' : 'fr-FR';

  useEffect(() => {
    if (!accessToken) return;
    getOrganizations(accessToken)
      .then((res: any) => {
        const rows = (res?.data ?? res) as Array<{ id: string; name: string }>;
        setOrganizations(Array.isArray(rows) ? rows.map((o) => ({ id: o.id, name: o.name })).sort((a, b) => a.name.localeCompare(b.name)) : []);
      })
      .catch(() => setOrganizations([]));
  }, [accessToken]);

  useEffect(() => {
    if (orgId === null && ready) setOrgId(selectedIds.length === 1 ? selectedIds[0] : '');
  }, [orgId, ready, selectedIds]);

  useEffect(() => {
    setDepartmentId('');
    if (!accessToken || !orgId) { setDepartments([]); return; }
    let live = true;
    departmentService.getByOrganization(orgId, accessToken)
      .then((rows: any[]) => { if (live) setDepartments(rows.filter((d) => !d.isArchived).map((d) => ({ id: d.id, name: d.name })).sort((a, b) => a.name.localeCompare(b.name))); })
      .catch(() => { if (live) setDepartments([]); });
    return () => { live = false; };
  }, [accessToken, orgId]);

  const load = useCallback(async () => {
    if (!accessToken || orgId === null) return;
    setLoading(true);
    try {
      setData(await getPilotage(accessToken, { organizationIds: orgId || undefined, departmentId: departmentId || undefined }));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [accessToken, orgId, departmentId]);

  useEffect(() => { void load(); }, [load]);

  const toValidate = (data?.validations.claims.count ?? 0) + (data?.validations.plans.count ?? 0);
  const lateTotal = (data?.late.claims.count ?? 0) + (data?.late.plans.count ?? 0) + (data?.late.actions ?? 0);

  const days = (n?: number) => t('pilotage.days', { count: n ?? 0 });

  const exportCsv = () => {
    if (!data) return;
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows: string[][] = [[t('pilotage.csvSection'), t('pilotage.csvRef'), t('pilotage.csvTitle'), t('pilotage.csvWho'), t('pilotage.csvDays')]];
    const add = (section: string, items: PilotageItem[]) =>
      items.forEach((i) => rows.push([section, i.reference ?? '', i.title, i.who ?? '', String(i.waitingDays ?? i.lateDays ?? '')]));
    add(t('pilotage.valClaims'), data.validations.claims.items);
    add(t('pilotage.valPlans'), data.validations.plans.items);
    add(t('pilotage.lateClaims'), data.late.claims.items);
    add(t('pilotage.latePlans'), data.late.plans.items);
    data.alerts.items.forEach((a) => rows.push([t('pilotage.alertsTitle'), '', a.defectType, a.productionLine, `z=${a.zScore.toFixed(1)}`]));
    const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pilotage-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updated = useMemo(() => {
    if (!data) return '';
    const d = new Date(data.generatedAt);
    return t('employeeWorkspace.updatedAt', {
      date: d.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' }),
      time: d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
    });
  }, [data, locale, t]);

  const list = (items: PilotageItem[], path: (id: string) => string, kind: 'wait' | 'late') =>
    items.length === 0 ? (
      <div className="fwh-empty soft">{t('pilotage.nothing')}</div>
    ) : (
      <ul className="fwh-rows">
        {items.map((i) => (
          <li key={i.id}>
            <div className="fwh-row" role="button" tabIndex={0} onClick={() => navigate(path(i.id))}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(path(i.id)); }}>
              <span className="fwh-row-main">
                <span className="fwh-todo-title">{i.reference && <span className="fwh-ref">{i.reference}</span>}{i.title}</span>
                <span className="fwh-todo-meta">{[i.detail, i.who].filter(Boolean).join(' · ')}</span>
              </span>
              <span className={`fwh-pill ${kind === 'late' ? 'bad' : (i.waitingDays ?? 0) > 7 ? 'run' : 'info'}`}>
                {kind === 'late' ? t('pilotage.lateFor', { days: days(i.lateDays) }) : t('pilotage.waitingFor', { days: days(i.waitingDays) })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    );

  const kpi = (label: string, value: number | string, hint: string, tone: string, onClick: () => void) => (
    <button type="button" className={`fwh-stat is-link tone-${tone}`} onClick={onClick}>
      <span className="fwh-stat-label">{label}</span>
      <strong className="fwh-stat-value">{loading ? '—' : value}</strong>
      <span className="fwh-stat-hint">{hint}</span>
    </button>
  );

  return (
    <div className="fwh-page">
      <div className="fwh-inner">
        <header className="fwh-top">
          <div className="fwh-welcome">
            <p className="fwh-kicker">{t('pilotage.kicker')}</p>
            <h1>{t('pilotage.title')}</h1>
            <p className="fwh-sub">{t('pilotage.subtitle')}</p>
          </div>
          <div className="fwh-toolbar">
            <div className="fwh-top-actions">
              <button type="button" className="fwh-refresh primary" onClick={() => navigate('/pages/front/validations')}>
                {t('pilotage.openValidations')}
              </button>
              <button type="button" className="fwh-refresh" onClick={() => void load()} disabled={loading}>
                {t('employeeWorkspace.refresh')}
              </button>
              <button type="button" className="fwh-refresh" onClick={exportCsv} disabled={!data}>
                {t('employeeWorkspace.exportCsv')}
              </button>
            </div>
            {updated && <span className="fwh-updated">{updated}</span>}
          </div>
          <div className="fwh-filters">
            <label>
              <span>{t('pilotage.filterOrg')}</span>
              <select value={orgId ?? ''} onChange={(e) => setOrgId(e.target.value)}>
                <option value="">{t('pilotage.filterAllOrgs')}</option>
                {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label>
              <span>{t('pilotage.filterDept')}</span>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={!orgId}>
                <option value="">{t('pilotage.filterAllDepts')}</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          </div>
        </header>

        {failed ? (
          <div className="fwh-empty soft">{t('pilotage.failed')}</div>
        ) : (
          <>
            <section className="fwh-stats fwh-stats-4" aria-label={t('pilotage.kpisAria')}>
              {kpi(t('pilotage.kpiValidate'), toValidate, t('pilotage.kpiValidateHint', { claims: data?.validations.claims.count ?? 0, plans: data?.validations.plans.count ?? 0 }), 'info', () => navigate('/pages/front/validations'))}
              {kpi(t('pilotage.kpiLate'), lateTotal, t('pilotage.kpiLateHint', { claims: data?.late.claims.count ?? 0, plans: data?.late.plans.count ?? 0, actions: data?.late.actions ?? 0 }), 'danger', () => navigate('/pages/front/agenda/deadlines'))}
              {kpi(t('pilotage.kpiAlerts'), data?.alerts.count ?? 0, t('pilotage.kpiAlertsHint'), 'warn', () => navigate('/alerts'))}
              {kpi(t('pilotage.kpiLoad'), data?.load.overloaded ?? 0, t('pilotage.kpiLoadHint', { idle: data?.load.idle ?? 0, avg: (data?.load.average ?? 0).toLocaleString(locale) }), 'navy', () => navigate('/pages/front/action-plans/assignments'))}
            </section>

            <div className="fwh-duo">
              <section className="fwh-card">
                <div className="fwh-card-head">
                  <h2>{t('pilotage.valClaims')}</h2>
                  <button type="button" className="fwh-card-link" onClick={() => navigate('/pages/front/validations?tab=dossiers')}>
                    {t('pilotage.seeAll', { count: data?.validations.claims.count ?? 0 })}
                  </button>
                </div>
                <p className="fwh-card-sub">{t('pilotage.oldestFirst')}</p>
                {loading ? <div className="fwh-skel-row" aria-hidden /> : list(data?.validations.claims.items ?? [], CLAIM_PATH, 'wait')}
              </section>

              <section className="fwh-card">
                <div className="fwh-card-head">
                  <h2>{t('pilotage.valPlans')}</h2>
                  <button type="button" className="fwh-card-link" onClick={() => navigate('/pages/front/validations?tab=capa')}>
                    {t('pilotage.seeAll', { count: data?.validations.plans.count ?? 0 })}
                  </button>
                </div>
                <p className="fwh-card-sub">{t('pilotage.oldestFirst')}</p>
                {loading ? <div className="fwh-skel-row" aria-hidden /> : list(data?.validations.plans.items ?? [], PLAN_PATH, 'wait')}
              </section>
            </div>

            <div className="fwh-duo">
              <section className="fwh-card">
                <div className="fwh-card-head">
                  <h2>{t('pilotage.lateClaims')}</h2>
                  <button type="button" className="fwh-card-link" onClick={() => navigate('/pages/front/agenda/deadlines')}>
                    {t('pilotage.seeAll', { count: data?.late.claims.count ?? 0 })}
                  </button>
                </div>
                <p className="fwh-card-sub">{t('pilotage.mostLateFirst')}</p>
                {loading ? <div className="fwh-skel-row" aria-hidden /> : list(data?.late.claims.items ?? [], CLAIM_PATH, 'late')}
              </section>

              <section className="fwh-card">
                <div className="fwh-card-head">
                  <h2>{t('pilotage.latePlans')}</h2>
                  <button type="button" className="fwh-card-link" onClick={() => navigate('/pages/front/action-plans')}>
                    {t('pilotage.seeAll', { count: data?.late.plans.count ?? 0 })}
                  </button>
                </div>
                <p className="fwh-card-sub">{t('pilotage.mostLateFirst')}</p>
                {loading ? <div className="fwh-skel-row" aria-hidden /> : list(data?.late.plans.items ?? [], PLAN_PATH, 'late')}
              </section>
            </div>

            <div className="fwh-duo">
              <section className="fwh-card">
                <div className="fwh-card-head">
                  <h2>{t('pilotage.alertsTitle')}</h2>
                  <button type="button" className="fwh-card-link" onClick={() => navigate('/alerts')}>
                    {t('pilotage.seeAll', { count: data?.alerts.count ?? 0 })}
                  </button>
                </div>
                <p className="fwh-card-sub">{t('pilotage.alertsSub')}</p>
                {loading ? <div className="fwh-skel-row" aria-hidden /> : (data?.alerts.items.length ?? 0) === 0 ? (
                  <div className="fwh-empty soft">{t('pilotage.nothing')}</div>
                ) : (
                  <ul className="fwh-rows">
                    {data!.alerts.items.map((a) => (
                      <li key={a.id}>
                        <div className="fwh-row" role="button" tabIndex={0} onClick={() => navigate('/alerts')}
                          onKeyDown={(e) => { if (e.key === 'Enter') navigate('/alerts'); }}>
                          <span className="fwh-row-main">
                            <span className="fwh-todo-title">{a.defectType}</span>
                            <span className="fwh-todo-meta">{a.productionLine} · {new Date(a.detectedAt).toLocaleDateString(locale, { day: '2-digit', month: 'short' })}</span>
                          </span>
                          <span className={`fwh-pill ${a.zScore >= 3 ? 'bad' : 'run'}`}>z = {a.zScore.toFixed(1)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="fwh-card">
                <div className="fwh-card-head">
                  <h2>{t('pilotage.loadTitle')}</h2>
                  <button type="button" className="fwh-card-link" onClick={() => navigate('/pages/front/action-plans/assignments')}>
                    {t('pilotage.loadSeeAll')}
                  </button>
                </div>
                <p className="fwh-card-sub">{t('pilotage.loadSub', { avg: (data?.load.average ?? 0).toLocaleString(locale) })}</p>
                {loading ? <div className="fwh-skel-row" aria-hidden /> : (data?.load.busiest.length ?? 0) === 0 ? (
                  <div className="fwh-empty soft">{t('pilotage.nothing')}</div>
                ) : (
                  <ul className="fwh-rows">
                    {data!.load.busiest.map((p) => (
                      <li key={p.userId}>
                        <div className="fwh-row" role="button" tabIndex={0} onClick={() => navigate('/pages/front/action-plans/assignments')}
                          onKeyDown={(e) => { if (e.key === 'Enter') navigate('/pages/front/action-plans/assignments'); }}>
                          <span className="fwh-row-main">
                            <span className="fwh-todo-title">{p.name}</span>
                            <span className="fwh-todo-meta">{p.department}</span>
                          </span>
                          <span className="fwh-pill info">{t('pilotage.openPlans', { count: p.openPlans })}</span>
                          {p.latePlans > 0 && <span className="fwh-pill bad">{t('pilotage.latePlansCount', { count: p.latePlans })}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
