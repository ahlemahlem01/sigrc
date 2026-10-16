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
      <div className="ap-tab-body">
        {tab === 'capa' && <AdminCapaDashboard />}
        {tab === 'overview' && <AssignmentsOverview />}
        {tab === 'indicators' && <AdminCapaIndicators />}
      </div>
    </div>
  );
}

const TAB_CSS = `
  .ap-tabs-page { display: flex; flex-direction: column; gap: 18px; }
  .ap-tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid #e2e8f0; }
  .ap-tab {
    position: relative; border: 0; background: transparent; color: #64748b;
    padding: 10px 16px; margin-bottom: -1px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    border-bottom: 2px solid transparent; transition: color .15s ease, border-color .15s ease;
  }
  .ap-tab:hover { color: #000168; }
  .ap-tab.on { color: #000168; border-bottom-color: #000168; }
  .ap-tab:focus-visible { outline: 2px solid #c7d2fe; outline-offset: -2px; border-radius: 6px; }
  /* every tab uses the full width; some embedded pages used to centre themselves in a narrower column */
  .ap-tab-body { width: 100%; min-width: 0; }
  .ap-tab-body .max-w-7xl { max-width: none; margin-left: 0; margin-right: 0; }
`;
