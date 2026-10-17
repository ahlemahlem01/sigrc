import PageTabs, { usePageTab } from '../../components/PageTabs';
import Dashboard from './dashboard/Dashboard';

const TABS = [
  { id: 'steering', labelKey: 'adminNav.claimsDashboard' },
  { id: 'indicators', labelKey: 'adminNav.claimsIndicators' },
] as const;

/** Claims steering and claims indicators: one page, two tabs (same pattern as the CAPA steering page). */
export default function ClaimsBoardPage() {
  const [tab, setTab] = usePageTab(TABS);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageTabs tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ width: '100%', minWidth: 0 }}>
        {tab === 'steering' ? <Dashboard focus="claims" /> : <Dashboard focus="indicators" />}
      </div>
    </div>
  );
}
