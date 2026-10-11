import { useTranslation } from 'react-i18next';

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  loading?: boolean;
};

export default function TablePagination({ page, pageSize, total, onChange, loading }: Props) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="tp-wrap">
      <span className="tp-info">
        {loading ? (
          <span className="tp-loading"><i className="ti ti-loader-2 tp-spin" /> {t('common.loading')}</span>
        ) : (
          t('pagination.summary', { from, to, total, page, pages })
        )}
      </span>
      <div className="tp-btns">
        <button type="button" className="tp-btn" disabled={loading || page <= 1} onClick={() => onChange(page - 1)}>
          {t('qualityHistory.previous')}
        </button>
        <button type="button" className="tp-btn" disabled={loading || page >= pages} onClick={() => onChange(page + 1)}>
          {t('qualityHistory.next')}
        </button>
      </div>
      <style>{`
        .tp-wrap {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          margin-top: 12px; padding-top: 12px; border-top: 1px solid #eef1f7;
          font-size: 12px; color: #64748b; flex-wrap: wrap;
        }
        .tp-btns { display: flex; gap: 6px; }
        .tp-btn {
          padding: 6px 12px; border-radius: 8px; border: 1px solid #e4e8f2; background: #fff;
          font-size: 12px; font-weight: 600; color: #374151; cursor: pointer; font-family: inherit;
        }
        .tp-btn:hover:not(:disabled) { border-color: #000168; color: #000168; }
        .tp-btn:disabled { opacity: .45; cursor: not-allowed; }
        .tp-loading { display: inline-flex; align-items: center; gap: 8px; color: #000168; font-weight: 600; }
        .tp-spin { animation: tp-spin 0.9s linear infinite; }
        @keyframes tp-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
