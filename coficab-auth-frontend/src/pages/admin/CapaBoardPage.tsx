import { Navigate, useSearchParams } from 'react-router-dom';
import PageTabs, { usePageTab } from '../../components/PageTabs';
import AdminCapaIndicators from './AdminCapaIndicators';
import CapaIndicatorsPage from './CapaIndicatorsPage';

const TABS = [
  { id: 'steering', labelKey: 'adminNav.capaSteering' },
  { id: 'indicators', labelKey: 'adminNav.indicators' },
] as const;

export default function CapaBoardPage() {
  const [tab, setTab] = usePageTab(TABS);
  const [params] = useSearchParams();
  // "Needs attention" now lives under Tracking: keep the old links working.
  if (params.get('tab') === 'overview') return <Navigate to="/admin/employees/activity?scope=workload" replace />;
  if (params.get('tab') === 'capa') return <Navigate to="/admin/action-plans/tracking?tab=capa" replace />;

  return (
    <div className="ap-tabs-page">
      <style>{BODY_CSS}</style>
      <PageTabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="ap-tab-body">
        {tab === 'steering' && <AdminCapaIndicators />}
        {tab === 'indicators' && <CapaIndicatorsPage />}
      </div>
    </div>
  );
}

const BODY_CSS = `
  .ap-tabs-page { display: flex; flex-direction: column; gap: 18px; }
  /* every tab uses the full width; some embedded pages used to centre themselves in a narrower column */
  .ap-tab-body { width: 100%; min-width: 0; }
  .ap-tab-body .max-w-7xl { max-width: none; margin-left: 0; margin-right: 0; }
`;
