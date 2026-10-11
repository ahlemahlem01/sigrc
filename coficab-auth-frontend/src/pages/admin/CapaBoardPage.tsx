import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AdminCapaDashboard from '../front/AdminCapaDashboard';
import AdminCapaIndicators from './AdminCapaIndicators';
import AssignmentsOverview from './Assignmentsoverview ';

const TABS = [
  { id: 'capa', labelKey: 'adminNav.boardAttention' },
  { id: 'overview', labelKey: 'adminNav.boardAssignments' },
  { id: 'indicators', labelKey: 'adminNav.indicators' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function currentTab(value: string | null): TabId {
  if (value === 'overview' || value === 'indicators') return value;
  return 'capa';
}

export default function CapaBoardPage() {
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
      {tab === 'overview' && <AssignmentsOverview />}
      {tab === 'indicators' && <AdminCapaIndicators />}
    </div>
  );
}

const TAB_CSS = `
  .ap-tabs-page { display: flex; flex-direction: column; gap: 16px; }
  .ap-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
  .ap-tab {
    border: 1px solid #e2e8f0; background: #fff; color: #334155;
    border-radius: 8px; padding: 6px 12px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .ap-tab.on { background: #000168; color: #fff; border-color: #000168; }
  .ap-tab:hover { border-color: #c7d2fe; }
`;
