import PageTabs, { usePageTab } from '../../components/PageTabs';
import AdminCapaDashboard from '../front/AdminCapaDashboard';
import AdminCapaIndicators from './AdminCapaIndicators';
import AssignmentsOverview from './Assignmentsoverview ';

const TABS = [
  { id: 'capa', labelKey: 'adminNav.boardAttention' },
  { id: 'overview', labelKey: 'adminNav.boardAssignments' },
  { id: 'indicators', labelKey: 'adminNav.indicators' },
] as const;

export default function CapaBoardPage() {
  const [tab, setTab] = usePageTab(TABS);

  return (
    <div className="ap-tabs-page">
      <style>{BODY_CSS}</style>
      <PageTabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="ap-tab-body">
        {tab === 'capa' && <AdminCapaDashboard />}
        {tab === 'overview' && <AssignmentsOverview />}
        {tab === 'indicators' && <AdminCapaIndicators />}
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
