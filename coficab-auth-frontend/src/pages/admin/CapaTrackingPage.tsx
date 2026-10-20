import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useOrganizationScope } from '../../context/OrganizationScopeContext';
import { fetchCapaIndicators, type CapaIndicators } from '../../services/capaIndicatorsService';
import PageTabs from '../../components/PageTabs';
import SegmentedToggle from '../../components/SegmentedToggle';
import AssignmentsList from './AssignmentsList';
import AdminCapaAssociatedActions from './AdminCapaAssociatedActions';
import ActionFollowUpPage from '../front/ActionFollowUpPage';
import AdminCapaDashboard from '../front/AdminCapaDashboard';

const TABS = [
  { id: 'todo', labelKey: 'tracking.todo' },
  { id: 'assignments', labelKey: 'adminNav.assignments' },
] as const;

const VIEWS = [
  { id: 'all', labelKey: 'tracking.viewAll' },
  { id: 'plans', labelKey: 'tracking.viewPlans' },
  { id: 'actions', labelKey: 'tracking.viewActions' },
] as const;

type TabId = (typeof TABS)[number]['id'];
type ViewId = (typeof VIEWS)[number]['id'];

/** The four old tabs became two; their links (tab=capa, associated, follow-up) still open the right view. */
function resolve(tab: string | null, view: string | null): { tab: TabId; view: ViewId } {
  if (tab === 'assignments') return { tab: 'assignments', view: 'all' };
  if (tab === 'associated') return { tab: 'todo', view: 'plans' };
  if (tab === 'follow-up') return { tab: 'todo', view: 'actions' };
  const v = VIEWS.find((x) => x.id === view)?.id ?? 'all';
  return { tab: 'todo', view: v };
}

const NAVY = '#000168';
const BAD = '#dc2626';
const ORANGE = '#ea580c';
const GOOD = '#2f855a';

function Figure({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: string }) {
  return (
    <div className="rounded-xl bg-white shadow-sm px-4 py-3" style={{ border: '1px solid #e4e8f2', borderTop: `3px solid ${tone}` }}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1.5 text-[26px] font-extrabold leading-none tabular-nums" style={{ color: tone === BAD ? BAD : NAVY }}>{value}</div>
      <div className="text-[11px] mt-1.5 text-slate-500">{hint}</div>
    </div>
  );
}

/**
 * Follow-up of the CAPA work in two tabs: what to handle (one set of figures on top, then the same items seen as a mix of
 * plans and actions, by plan, or as detailed actions) and who may see or edit which plan.
 */
export default function CapaTrackingPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const { param: scopeParam } = useOrganizationScope();
  const [params, setParams] = useSearchParams();
  const { tab, view } = resolve(params.get('tab'), params.get('view'));
  const [figures, setFigures] = useState<CapaIndicators['kpis'] | null>(null);

  useEffect(() => {
    if (!accessToken || tab !== 'todo') return;
    let live = true;
    fetchCapaIndicators(accessToken, 90, scopeParam).then((d) => { if (live) setFigures(d.kpis); }).catch(() => { if (live) setFigures(null); });
    return () => { live = false; };
  }, [accessToken, scopeParam, tab]);

  const go = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    p.delete('tab'); p.delete('view');
    Object.entries(next).forEach(([k, v]) => p.set(k, v));
    setParams(p);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTabs tabs={TABS} active={tab} onChange={(id) => go({ tab: id })} />

      {tab === 'todo' && (
        <>
          {figures && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Figure label={t('tracking.latePlans')} value={figures.latePlans} tone={figures.latePlans > 0 ? BAD : GOOD} hint={t('tracking.latePlansHint', { open: figures.openPlans })} />
              <Figure label={t('tracking.lateActions')} value={figures.lateActions} tone={figures.lateActions > 0 ? BAD : GOOD} hint={t('tracking.lateActionsHint')} />
              <Figure label={t('tracking.toValidate')} value={figures.actionsToValidate} tone={figures.actionsToValidate > 0 ? ORANGE : GOOD} hint={t('tracking.toValidateHint')} />
              <Figure label={t('tracking.noActionPlans')} value={figures.plansWithoutActions} tone={NAVY} hint={t('tracking.noActionPlansHint')} />
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SegmentedToggle options={VIEWS.map((v) => ({ id: v.id, labelKey: v.labelKey }))} value={view} onChange={(id) => go({ tab: 'todo', view: id })} />
            <span className="text-xs text-slate-500">{t(`tracking.viewHint.${view}`)}</span>
          </div>

          <div className="ap-tab-body" style={{ width: '100%', minWidth: 0 }}>
            {view === 'all' && <AdminCapaDashboard />}
            {view === 'plans' && <AdminCapaAssociatedActions />}
            {view === 'actions' && <ActionFollowUpPage />}
          </div>
        </>
      )}

      {tab === 'assignments' && <AssignmentsList />}

      <style>{`.ap-tab-body .max-w-7xl { max-width: none; margin-left: 0; margin-right: 0; }`}</style>
    </div>
  );
}
