import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useOrganizationScope } from '../../context/OrganizationScopeContext';
import { fetchCapaIndicators, type CapaIndicators } from '../../services/capaIndicatorsService';
import PageTabs from '../../components/PageTabs';
import SegmentedToggle from '../../components/SegmentedToggle';
import AssignmentsList from './AssignmentsList';
import AdminCapaAssociatedActions from './AdminCapaAssociatedActions';
import ActionFollowUpPage from '../front/ActionFollowUpPage';
import CapaFlowOverview from './CapaFlowOverview';
import CapaAssigneeGlance from './CapaAssigneeGlance';

const TABS = [
  { id: 'todo', labelKey: 'tracking.todo' },
  { id: 'assignments', labelKey: 'adminNav.assignments' },
] as const;

const VIEWS = [
  { id: 'plans', labelKey: 'tracking.viewOverview' },
  { id: 'actions', labelKey: 'tracking.viewOperational' },
] as const;

type TabId = (typeof TABS)[number]['id'];
type ViewId = (typeof VIEWS)[number]['id'];

/** The four old tabs became two; their links (tab=capa, associated, follow-up) still open the right view. */
function resolve(tab: string | null, view: string | null): { tab: TabId; view: ViewId } {
  if (tab === 'assignments') return { tab: 'assignments', view: 'plans' };
  if (tab === 'associated') return { tab: 'todo', view: 'plans' };
  if (tab === 'follow-up') return { tab: 'todo', view: 'actions' };
  const v = VIEWS.find((x) => x.id === view)?.id ?? 'plans';
  return { tab: 'todo', view: v };
}

const NAVY = '#000168';
const BAD = '#dc2626';
const ORANGE = '#ea580c';
const GOOD = '#2f855a';

function Figure({ label, value, hint, tone, active, onClick }: { label: string; value: number; hint: string; tone: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="text-left rounded-xl bg-white shadow-sm px-4 py-3 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
      style={{ border: `1px solid ${active ? tone : '#e4e8f2'}`, borderTop: `3px solid ${tone}`, boxShadow: active ? `0 0 0 2px ${tone}33` : undefined }}
    >
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1.5 text-[26px] font-extrabold leading-none tabular-nums" style={{ color: tone === BAD ? BAD : NAVY }}>{value}</div>
      <div className="text-[11px] mt-1.5 text-slate-500">{hint}</div>
    </button>
  );
}

/**
 * Follow-up of the CAPA work in two tabs: what to handle (overview of plans, or detailed actions) and who may see or edit which plan.
 */
export default function CapaTrackingPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const { param: scopeParam } = useOrganizationScope();
  const [params, setParams] = useSearchParams();
  const { tab, view } = resolve(params.get('tab'), params.get('view'));
  const rawFocus = params.get('focus');
  const focus = view === 'plans' ? (rawFocus === 'late' || rawFocus === 'noActions' ? rawFocus : undefined) : (rawFocus === 'belated' || rawFocus === 'realized' ? rawFocus : undefined);
  const navigate = useNavigate();
  const [figures, setFigures] = useState<CapaIndicators['kpis'] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!accessToken || tab !== 'todo') return;
    let live = true;
    fetchCapaIndicators(accessToken, 90, scopeParam).then((d) => { if (live) setFigures(d.kpis); }).catch(() => { if (live) setFigures(null); });
    return () => { live = false; };
  }, [accessToken, scopeParam, tab, refreshKey]);

  useEffect(() => {
    if (!focus) return;
    // the list only exists once its data has loaded
    let tries = 0;
    const id = window.setInterval(() => {
      const el = document.getElementById('capa-focus-list');
      if (el || ++tries > 30) {
        window.clearInterval(id);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [focus, view]);

  const go = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    p.delete('tab'); p.delete('view'); p.delete('focus');
    Object.entries(next).forEach(([k, v]) => p.set(k, v));
    setParams(p);
  };

  // a figure opens the list it counts; a second click on the same figure clears the filter
  const pick = (v: ViewId, f: string) => (view === v && focus === f ? go({ tab: 'todo', view: v }) : go({ tab: 'todo', view: v, focus: f }));

  return (
    <div className="flex flex-col gap-4">
      <PageTabs tabs={TABS} active={tab} onChange={(id) => go({ tab: id })} />

      {tab === 'todo' && (
        <>
          {figures && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Plans</div>
                <div className="grid grid-cols-2 gap-3">
                  <Figure label={t('tracking.latePlans')} value={figures.latePlans} tone={figures.latePlans > 0 ? BAD : GOOD} hint={t('tracking.latePlansHint', { open: figures.openPlans })} active={view === 'plans' && focus === 'late'} onClick={() => pick('plans', 'late')} />
                  <Figure label={t('tracking.noActionPlans')} value={figures.plansWithoutActions} tone={NAVY} hint={t('tracking.noActionPlansHint')} active={view === 'plans' && focus === 'noActions'} onClick={() => pick('plans', 'noActions')} />
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Actions détaillées</div>
                <div className="grid grid-cols-2 gap-3">
                  <Figure label={t('tracking.lateActions')} value={figures.lateActions} tone={figures.lateActions > 0 ? BAD : GOOD} hint={t('tracking.lateActionsHint')} active={view === 'actions' && focus === 'belated'} onClick={() => pick('actions', 'belated')} />
                  <Figure label={t('tracking.toValidate')} value={figures.actionsToValidate} tone={figures.actionsToValidate > 0 ? ORANGE : GOOD} hint={t('tracking.toValidateHint')} active={view === 'actions' && focus === 'realized'} onClick={() => pick('actions', 'realized')} />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SegmentedToggle options={VIEWS.map((v) => ({ id: v.id, labelKey: v.labelKey }))} value={view} onChange={(id) => go({ tab: 'todo', view: id })} />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setRefreshKey((k) => k + 1)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">{t('dashboard.refresh')}</button>
              <button type="button" onClick={() => navigate('/admin/action-plans/create')} className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white" style={{ background: NAVY }}>+ {t('admin.newPlan')}</button>
            </div>
          </div>
          <p className="text-xs text-slate-500 -mt-2 mb-0">{t(`tracking.viewHint.${view}`)}</p>

          <div className="ap-tab-body" style={{ width: '100%', minWidth: 0 }}>
            {view === 'plans' && <><CapaFlowOverview key={refreshKey} /><AdminCapaAssociatedActions key={`${refreshKey}-${focus}`} embedded focus={focus as 'late' | 'noActions' | undefined} /></>}
            {view === 'actions' && <><CapaAssigneeGlance key={refreshKey} /><ActionFollowUpPage key={`${refreshKey}-${focus}`} embedded focus={focus as 'belated' | 'realized' | undefined} /></>}
          </div>
        </>
      )}

      {tab === 'assignments' && <AssignmentsList />}

      <style>{`.ap-tab-body .max-w-7xl { max-width: none; margin-left: 0; margin-right: 0; }`}</style>
    </div>
  );
}
