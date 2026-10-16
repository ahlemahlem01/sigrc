import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import QualityClaimsHistoryPage from './QualityClaimsHistoryPage';
import AdminEightDList from '../admin/AdminEightDList';

/**
 * One page for the claim analyses: the 5 Why / Ishikawa history (which is also the claims report: same list, same export)
 * and the 8D list. Same tab pattern as the CAPA steering page.
 */
const TABS = [
  { id: 'analyses', labelKey: 'adminNav.analysesTab' },
  { id: 'eightd', labelKey: 'adminNav.eightD' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function currentTab(value: string | null): TabId {
  return value === 'eightd' ? 'eightd' : 'analyses';
}

export default function ClaimsAnalysesHubPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = currentTab(params.get('tab'));

  return (
    <div className="ca-hub">
      <style>{HUB_CSS}</style>
      <div className="ca-hub-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`ca-hub-tab${tab === item.id ? ' on' : ''}`}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set('tab', item.id);
              setParams(next);
            }}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>
      {tab === 'analyses' && <QualityClaimsHistoryPage />}
      {tab === 'eightd' && <AdminEightDList />}
    </div>
  );
}

const HUB_CSS = `
  .ca-hub { display: flex; flex-direction: column; gap: 16px; }
  .ca-hub-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
  .ca-hub-tab {
    border: 1px solid #e2e8f0; background: #fff; color: #334155;
    border-radius: 8px; padding: 6px 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .ca-hub-tab.on { background: #000168; color: #fff; border-color: #000168; }
  .ca-hub-tab:hover { border-color: #c7d2fe; }
`;
