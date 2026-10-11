import { useTranslation } from 'react-i18next';

export type ReportParams = {
  periodStart: string;
  periodEnd: string;
  department: string;
  employeeMode: 'all' | 'select';
  selectedIds: string[];
};

type EmployeeOption = {
  id: string;
  fullName: string;
  department: string;
};

type Props = {
  value: ReportParams;
  onChange: (next: ReportParams) => void;
  employees: EmployeeOption[];
  departments: string[];
  scopedCount: number;
  generating: boolean;
  exporting?: boolean;
  onGenerate: () => void;
  canExport: boolean;
  onDownload: () => void;
};

const NAVY = '#000168';
const LINE = '#e4e8f2';

export default function ReportParametersForm({
  value,
  onChange,
  employees,
  departments,
  scopedCount,
  generating,
  exporting = false,
  onGenerate,
  canExport,
  onDownload,
}: Props) {
  const { t } = useTranslation();
  const toggleEmployee = (id: string) => {
    const has = value.selectedIds.includes(id);
    onChange({
      ...value,
      selectedIds: has
        ? value.selectedIds.filter((x) => x !== id)
        : [...value.selectedIds, id],
    });
  };

  const selectAllVisible = () => {
    onChange({ ...value, selectedIds: employees.map((e) => e.id) });
  };

  const clearSelection = () => {
    onChange({ ...value, selectedIds: [] });
  };

  const filteredEmployees =
    value.department === 'all'
      ? employees
      : employees.filter(
          (e) => e.department.trim().toLowerCase() === value.department.trim().toLowerCase(),
        );

  return (
    <section className="hrf">
      <style>{`
        .hrf {
          border: 1px solid ${LINE}; border-radius: 12px; background: #fff;
          padding: 16px 18px; margin-bottom: 16px;
        }
        .hrf-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #0d1340; }
        .hrf-sub { margin: 0 0 14px; font-size: 12px; color: #64748b; }
        .hrf-grid {
          display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;
        }
        @media (max-width: 960px) { .hrf-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 560px) { .hrf-grid { grid-template-columns: 1fr; } }
        .hrf-field label {
          display: block; font-size: 11.5px; font-weight: 650; color: #64748b; margin-bottom: 4px;
        }
        .hrf-field input, .hrf-field select {
          width: 100%; height: 36px; padding: 0 10px; border-radius: 8px;
          border: 1px solid ${LINE}; font: inherit; font-size: 13px; color: #0d1340;
          background: #fff; box-sizing: border-box;
        }
        .hrf-field input:focus, .hrf-field select:focus {
          outline: none; border-color: ${NAVY}; box-shadow: 0 0 0 3px rgba(0,1,104,.08);
        }
        .hrf-mode {
          display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 8px;
        }
        .hrf-chip {
          height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid ${LINE};
          background: #fff; font: inherit; font-size: 12px; font-weight: 600; color: #475569;
          cursor: pointer;
        }
        .hrf-chip.is-on { background: ${NAVY}; border-color: ${NAVY}; color: #fff; }
        .hrf-multi {
          border: 1px solid ${LINE}; border-radius: 10px; max-height: 220px; overflow: auto;
          padding: 8px; background: #fafbff;
        }
        .hrf-multi-tools {
          display: flex; gap: 8px; margin-bottom: 8px;
        }
        .hrf-link {
          border: none; background: none; color: ${NAVY}; font: inherit; font-size: 12px;
          font-weight: 650; cursor: pointer; padding: 0;
        }
        .hrf-opt {
          display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px;
          font-size: 12.5px; color: #0d1340;
        }
        .hrf-opt:hover { background: #eef2ff; }
        .hrf-opt input { accent-color: ${NAVY}; }
        .hrf-opt span { color: #94a3b8; font-size: 11.5px; margin-left: auto; }
        .hrf-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
        .hrf-btn {
          display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px;
          border-radius: 8px; border: 1px solid ${LINE}; background: #fff; color: ${NAVY};
          font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
        }
        .hrf-btn:hover:not(:disabled) { background: #eef2ff; }
        .hrf-btn:disabled { opacity: .55; cursor: not-allowed; }
        .hrf-btn.primary { background: ${NAVY}; border-color: ${NAVY}; color: #fff; }
        .hrf-btn.primary:hover:not(:disabled) { background: #00009e; }
        .hrf-busy {
          margin: 10px 0 0; font-size: 12.5px; color: #64748b;
        }
        .ti-loader-2 { animation: hrf-spin 0.8s linear infinite; }
        @keyframes hrf-spin { to { transform: rotate(360deg); } }
      `}</style>

      <h2 className="hrf-title">{t('hrReports.paramsTitle')}</h2>
      <p className="hrf-sub">
        {t('hrReports.paramsSub')}
      </p>

      <div className="hrf-grid">
        <div className="hrf-field">
          <label htmlFor="hrf-start">{t('hrReports.startDate')}</label>
          <input
            id="hrf-start"
            type="date"
            value={value.periodStart}
            onChange={(e) => onChange({ ...value, periodStart: e.target.value })}
          />
        </div>
        <div className="hrf-field">
          <label htmlFor="hrf-end">{t('hrReports.endDate')}</label>
          <input
            id="hrf-end"
            type="date"
            value={value.periodEnd}
            onChange={(e) => onChange({ ...value, periodEnd: e.target.value })}
          />
        </div>
        <div className="hrf-field">
          <label htmlFor="hrf-dept">{t('planDetail.department')}</label>
          <select
            id="hrf-dept"
            value={value.department}
            onChange={(e) => onChange({ ...value, department: e.target.value })}
          >
            <option value="all">{t('common.all')}</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="hrf-field">
          <label>{t('hrReports.employees')}</label>
          <div className="hrf-mode">
            <button
              type="button"
              className={`hrf-chip${value.employeeMode === 'all' ? ' is-on' : ''}`}
              onClick={() => onChange({ ...value, employeeMode: 'all' })}
            >
              {t('common.all')}
            </button>
            <button
              type="button"
              className={`hrf-chip${value.employeeMode === 'select' ? ' is-on' : ''}`}
              onClick={() => onChange({ ...value, employeeMode: 'select' })}
            >
              {t('hrReports.selection')}
            </button>
          </div>
        </div>
      </div>

      {value.employeeMode === 'select' && (
        <div className="hrf-multi" style={{ marginTop: 8 }}>
          <div className="hrf-multi-tools">
            <button type="button" className="hrf-link" onClick={selectAllVisible}>
              {t('hrReports.checkAll', { count: filteredEmployees.length })}
            </button>
            <button type="button" className="hrf-link" onClick={clearSelection}>
              {t('hrReports.uncheckAll')}
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
              {t('hrReports.selectedCount', { count: value.selectedIds.length })}
            </span>
          </div>
          {filteredEmployees.map((e) => (
            <label key={e.id} className="hrf-opt">
              <input
                type="checkbox"
                checked={value.selectedIds.includes(e.id)}
                onChange={() => toggleEmployee(e.id)}
              />
              {e.fullName}
              <span>{e.department || '—'}</span>
            </label>
          ))}
          {filteredEmployees.length === 0 && (
            <div style={{ padding: 10, fontSize: 12.5, color: '#64748b' }}>
              {t('hrReports.noneForFilter')}
            </div>
          )}
        </div>
      )}

      <div className="hrf-actions">
        <button
          type="button"
          className="hrf-btn primary"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onGenerate();
          }}
          disabled={generating || scopedCount === 0}
          title={
            scopedCount === 0
              ? t('hrReports.noneInScope')
              : t('hrReports.generateFor', { count: scopedCount })
          }
        >
          <i className={`ti ${generating ? 'ti-loader-2' : 'ti-report-analytics'}`} />
          {generating
            ? t('hrReports.generating')
            : t('hrReports.generate', { count: scopedCount })}
        </button>
        <button
          type="button"
          className="hrf-btn"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDownload();
          }}
          disabled={!canExport || generating || exporting}
          title={canExport ? t('hrReports.downloadReport') : t('hrReports.generateFirst')}
        >
          <i className={`ti ${exporting ? 'ti-loader-2' : 'ti-file-type-pdf'}`} />
          {exporting ? t('hrReports.downloading') : t('hrReports.downloadPdf')}
        </button>
      </div>
      {generating ? (
        <p className="hrf-busy">{t('hrReports.busy')}</p>
      ) : null}
    </section>
  );
}
