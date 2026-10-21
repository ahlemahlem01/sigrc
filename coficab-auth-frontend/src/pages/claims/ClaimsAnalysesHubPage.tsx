import PageTabs, { usePageTab } from '../../components/PageTabs';
import QualityClaimsHistoryPage from './QualityClaimsHistoryPage';
import AdminEightDList from '../admin/AdminEightDList';
import AdminClaimsReport from './AdminClaimsReport';

/**
 * One page for the claim analyses: the 5 Why / Ishikawa history (which is also the claims report: same list, same
 * export) and the 8D list.
 */
const TABS = [
  { id: 'analyses', labelKey: 'adminNav.analysesSummary' },
  { id: 'eightd', labelKey: 'adminNav.eightD' },
] as const;

export default function ClaimsAnalysesHubPage() {
  const [tab, setTab] = usePageTab(TABS);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'analyses' && (
        <>
          <AdminClaimsReport />
          <div className="max-w-7xl mx-auto w-full"><QualityClaimsHistoryPage adminView /></div>
        </>
      )}
      {tab === 'eightd' && <AdminEightDList />}
    </div>
  );
}
