import { useEffect, useState } from 'react';
import { usePreferences } from '../context/PreferencesContext';
import { downloadTable, ExportFormat, TableData } from '../utils/dataExchange';

type Props = {
  filename: string;
  getTable: () => TableData;
  className?: string;
  label?: string;
};

export function ExportSplit({ filename, getTable, className, label = 'Exporter' }: Props) {
  const { exportFormat } = usePreferences();
  const [format, setFormat] = useState<ExportFormat>(exportFormat);

  useEffect(() => {
    setFormat(exportFormat);
  }, [exportFormat]);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <select
        aria-label="Format d'export"
        value={format}
        onChange={(e) => setFormat(e.target.value as ExportFormat)}
        style={{ fontSize: 12, padding: '4px 6px', borderRadius: 8, border: '1px solid #e2e8f0' }}
      >
        <option value="excel">Excel</option>
        <option value="pdf">PDF</option>
        <option value="csv">CSV</option>
      </select>
      <button
        type="button"
        className={className}
        onClick={() => {
          const table = getTable();
          downloadTable(format, filename, table.columns, table.rows);
        }}
      >
        {label}
      </button>
    </span>
  );
}
