import PageTabs, { usePageTab } from '../../components/PageTabs';
import AdminCapaReportOfPlans from './AdminCapaReportOfPlans';
import AdminCapaActionsReport from './AdminCapaActionsReport';

const TABS = [
  { id: 'plans', labelKey: 'adminNav.reportPlans' },
  { id: 'actions', labelKey: 'adminNav.reportActions' },
] as const;

/** Both CAPA reports in one place: the plans report and the actions report. */
export default function CapaReportsPage() {
  const [tab, setTab] = usePageTab(TABS);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'plans' && <AdminCapaReportOfPlans />}
      {tab === 'actions' && <AdminCapaActionsReport />}
    </div>
  );
}
