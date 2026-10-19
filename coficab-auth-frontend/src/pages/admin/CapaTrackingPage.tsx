import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AssignmentsList from './AssignmentsList';
import AdminCapaAssociatedActions from './AdminCapaAssociatedActions';
import ActionFollowUpPage from '../front/ActionFollowUpPage';
import AdminCapaDashboard from '../front/AdminCapaDashboard';

const TABS = [
  { id: 'capa', labelKey: 'adminNav.boardAttention' },
  { id: 'assignments', labelKey: 'adminNav.assignments' },
  { id: 'associated', labelKey: 'adminNav.linkedActions' },
  { id: 'follow-up', labelKey: 'adminNav.followUp' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function currentTab(value: string | null): TabId {
  if (value === 'assignments' || value === 'associated' || value === 'follow-up') return value;
  return 'capa';
}

export default function CapaTrackingPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = currentTab(params.get('tab'));

  return (
    <div className="ap-tabs-page">
      <style>{TAB_CSS}</style>
      <div className="ap-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`ap-tab${tab === item.id ? ' on' : ''}`}
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
      {tab === 'capa' && <AdminCapaDashboard />}
      {tab === 'assignments' && <AssignmentsList />}
      {tab === 'associated' && <AdminCapaAssociatedActions />}
      {tab === 'follow-up' && <ActionFollowUpPage />}
    </div>
  );
}

const TAB_CSS = `
  .ap-tabs-page { display: flex; flex-direction: column; gap: 14px; }
  .ap-tabs-page .max-w-7xl { max-width: none; margin-left: 0; margin-right: 0; }
  .ap-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
  .ap-tab {
    border: 1px solid #e2e8f0; background: #fff; color: #334155;
    border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
  }
  .ap-tab.on { background: #000168; color: #fff; border-color: #000168; }
  .ap-tab:hover { border-color: #c7d2fe; color: #000168; }
  .ap-tab.on:hover { color: #fff; }
`;
