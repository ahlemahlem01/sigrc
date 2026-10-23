import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../../../i18n';

type Props = {
  value: string;
  onChange: (next: string) => void;
  generatedAt?: string | null;
  employeeCount?: number;
  canDownload?: boolean;
  downloading?: boolean;
  onDownload?: () => void;
  /** the text was written from the figures, not by the AI */
  automatic?: boolean;
};

const NAVY = '#000168';
const LINE = '#e4e8f2';

export default function AiSummarySection({
  value,
  onChange,
  generatedAt,
  employeeCount,
  canDownload = false,
  downloading = false,
  onDownload,
  automatic = false,
}: Props) {
  const { t } = useTranslation();
  const stamp = generatedAt
    ? new Date(generatedAt).toLocaleString(dateLocale(), {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <section className="hra">
      <style>{`
        .hra {
          border: 1px solid ${LINE}; border-radius: 12px; background: #fff;
          padding: 16px 18px; margin-bottom: 16px;
        }
        .hra-head {
          display: flex; flex-wrap: wrap; gap: 8px 16px;
          align-items: center; justify-content: space-between; margin-bottom: 10px;
        }
        .hra-title { margin: 0; font-size: 14px; font-weight: 700; color: #0d1340; }
        .hra-meta { font-size: 11.5px; color: #64748b; }
        .hra-hint { margin: 0 0 8px; font-size: 12px; color: #64748b; }
        .hra-dl {
          display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px;
          border-radius: 8px; border: 1px solid ${LINE}; background: ${NAVY}; color: #fff;
          font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
        }
        .hra-dl:hover:not(:disabled) { background: #00009e; }
        .hra-dl:disabled { opacity: .55; cursor: not-allowed; }
        .hra-dl .ti-loader-2 { animation: hra-spin .8s linear infinite; }
        @keyframes hra-spin { to { transform: rotate(360deg); } }
        .hra textarea {
          width: 100%; min-height: 180px; resize: vertical; box-sizing: border-box;
          border: 1px solid ${LINE}; border-radius: 10px; padding: 12px 14px;
          font: inherit; font-size: 13.5px; line-height: 1.55; color: #0d1340;
          background: #fafbff;
        }
        .hra textarea:focus {
          outline: none; border-color: ${NAVY}; box-shadow: 0 0 0 3px rgba(0,1,104,.08);
          background: #fff;
        }
      `}</style>

      <div className="hra-head">
        <div>
          <h2 className="hra-title">{automatic ? t('teamSummary.title') : t('hrReports.aiSummary')}</h2>
          <div className="hra-meta">
            {stamp ? t('hrReports.generatedOn', { date: stamp }) : null}
            {employeeCount != null ? ` · ${t('recognition.employeesShort', { count: employeeCount })}` : null}
          </div>
        </div>
        {onDownload ? (
          <button
            type="button"
            className="hra-dl"
            onClick={onDownload}
            disabled={!canDownload || downloading}
          >
            <i className={`ti ${downloading ? 'ti-loader-2' : 'ti-file-type-pdf'}`} />
            {downloading ? t('hrReports.downloading') : t('hrReports.downloadPdf')}
          </button>
        ) : null}
      </div>
      <p className="hra-hint">
        {automatic ? t('teamSummary.hint') : t('hrReports.aiHint')}
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('hrReports.aiPh')}
        aria-label={t('hrReports.aiAria')}
      />
    </section>
  );
}
