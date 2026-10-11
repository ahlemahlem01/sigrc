import type { HrReportHistoryEntry } from './hrReportHistory';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../../../i18n';

type Props = {
  entries: HrReportHistoryEntry[];
  onRestore: (entry: HrReportHistoryEntry) => void;
  onDelete: (id: string) => void;
  onDownload: (entry: HrReportHistoryEntry) => void;
};

const NAVY = '#000168';
const LINE = '#e4e8f2';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(dateLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function ReportHistorySection({
  entries,
  onRestore,
  onDelete,
  onDownload,
}: Props) {
  const { t } = useTranslation();
  return (
    <section className="hrh">
      <style>{`
        .hrh {
          border: 1px solid ${LINE}; border-radius: 12px; background: #fff;
          padding: 16px 18px; margin-top: 16px;
        }
        .hrh-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #0d1340; }
        .hrh-sub { margin: 0 0 12px; font-size: 12px; color: #64748b; }
        .hrh-empty { font-size: 13px; color: #64748b; margin: 0; padding: 8px 0; }
        .hrh-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
        .hrh-item {
          display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center;
          padding: 10px 12px; border: 1px solid ${LINE}; border-radius: 10px; background: #fafbff;
        }
        @media (max-width: 720px) {
          .hrh-item { grid-template-columns: 1fr; }
        }
        .hrh-name { font-size: 13px; font-weight: 650; color: #0d1340; }
        .hrh-meta { font-size: 11.5px; color: #64748b; margin-top: 2px; }
        .hrh-actions { display: flex; flex-wrap: wrap; gap: 6px; }
        .hrh-btn {
          display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px;
          border-radius: 7px; border: 1px solid ${LINE}; background: #fff; color: ${NAVY};
          font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
        }
        .hrh-btn:hover { background: #eef2ff; }
        .hrh-btn.danger { color: #b91c1c; border-color: #fecaca; }
        .hrh-btn.danger:hover { background: #fef2f2; }
      `}</style>

      <h2 className="hrh-title">{t('hrReports.historyTitle')}</h2>
      <p className="hrh-sub">
        {t('hrReports.historySub')}
      </p>

      {entries.length === 0 ? (
        <p className="hrh-empty">{t('hrReports.historyEmpty')}</p>
      ) : (
        <ul className="hrh-list">
          {entries.map((e) => (
            <li key={e.id} className="hrh-item">
              <div>
                <div className="hrh-name">
                  {t('hrReports.reportOf', { date: fmt(e.createdAt) })} · {t('recognition.employeesShort', { count: e.employeeCount })}
                </div>
                <div className="hrh-meta">
                  {t('hrReports.period')} {e.periodStart || '…'} → {e.periodEnd || '…'}
                  {e.department && e.department !== 'all' ? ` · ${e.department}` : ` · ${t('hrReports.allDepartments')}`}
                </div>
              </div>
              <div className="hrh-actions">
                <button type="button" className="hrh-btn" onClick={() => onRestore(e)}>
                  <i className="ti ti-eye" /> {t('qualityHistory.open')}
                </button>
                <button type="button" className="hrh-btn" onClick={() => onDownload(e)}>
                  <i className="ti ti-file-type-pdf" /> PDF
                </button>
                <button type="button" className="hrh-btn danger" onClick={() => onDelete(e.id)} aria-label={t('common.delete')} title={t('common.delete')}>
                  <i className="ti ti-trash" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
