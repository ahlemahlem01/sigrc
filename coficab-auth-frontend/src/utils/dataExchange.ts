import { jsPDF } from 'jspdf';

export type ExportFormat = 'excel' | 'pdf' | 'csv';
export type ImportFormat = 'excel' | 'csv';

export type TableData = { columns: string[]; rows: string[][] };

const PREF_KEY = 'coficab_user_prefs';

export type StoredPrefs = {
  theme: 'light' | 'dark';
  exportFormat: ExportFormat;
  importFormat: ImportFormat;
};

export const defaultPrefs: StoredPrefs = {
  theme: 'light',
  exportFormat: 'csv',
  importFormat: 'csv',
};

export function readPrefs(): StoredPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return defaultPrefs;
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
    return {
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      exportFormat: parsed.exportFormat === 'excel' || parsed.exportFormat === 'pdf' ? parsed.exportFormat : 'csv',
      importFormat: parsed.importFormat === 'excel' ? 'excel' : 'csv',
    };
  } catch {
    return defaultPrefs;
  }
}

export function writePrefs(prefs: StoredPrefs) {
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  document.documentElement.dataset.theme = prefs.theme;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function downloadTable(format: ExportFormat, filename: string, columns: string[], rows: string[][]) {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${filename}-${stamp}`;
  if (format === 'pdf') {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(11);
    doc.text(columns.join('  |  '), 10, 12);
    doc.setFontSize(9);
    rows.slice(0, 40).forEach((row, index) => {
      doc.text(row.map((cell) => String(cell ?? '').slice(0, 28)).join('  |  '), 10, 20 + index * 6);
    });
    doc.save(`${base}.pdf`);
    return;
  }
  if (format === 'excel') {
    const cells = (values: string[]) =>
      values.map((value) => `<Cell><Data ss:Type="String">${escapeXml(String(value ?? ''))}</Data></Cell>`).join('');
    const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Export"><Table>
<Row>${cells(columns)}</Row>
${rows.map((row) => `<Row>${cells(row)}</Row>`).join('')}
</Table></Worksheet></Workbook>`;
    downloadBlob(`${base}.xls`, new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' }));
    return;
  }
  const esc = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [columns.map(esc).join(';'), ...rows.map((row) => row.map(esc).join(';'))].join('\n');
  downloadBlob(`${base}.csv`, new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
}

export const IMPORT_TEMPLATES = {
  plans: ['Title', 'Type', 'Department', 'Description', 'Deadline'],
  claims: ['Title', 'ClientId', 'DefectType', 'Severity', 'LotNumber', 'Description'],
  employees: ['FullName', 'Email', 'Department', 'Role', 'Poste', 'Equipe'],
} as const;

export type ImportColumnSpec = { key: string; label: string; required?: boolean };

export function downloadImportTemplate(columns: string[], format: ImportFormat, filename: string) {
  downloadTable(format === 'excel' ? 'excel' : 'csv', `modele-${filename}`, columns, []);
}

export async function downloadServerTemplate(url: string, token: string, format: ImportFormat) {
  const response = await fetch(`${url}?format=${format}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Le modèle est indisponible.');
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  downloadBlob(match?.[1] || `modele.${format === 'excel' ? 'xls' : 'csv'}`, blob);
}

function headerName(cell: string) {
  return cell.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, '').toLowerCase();
}

function rowsToCsvFile(columns: string[], rows: string[][], name: string) {
  const esc = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [columns.map(esc).join(';'), ...rows.map((row) => row.map(esc).join(';'))].join('\n');
  return new File([csv], name.replace(/\.\w+$/, '.csv'), { type: 'text/csv' });
}

export async function normalizeImportFile(file: File, columns: Array<string | ImportColumnSpec>): Promise<File> {
  const specs = columns.map((column) =>
    typeof column === 'string' ? { key: column, label: column, required: true } : column,
  );
  const text = await file.text();
  if (text.includes('<Workbook') && text.includes('<Row')) {
    const rows = Array.from(text.matchAll(/<Row>([\s\S]*?)<\/Row>/g)).map((match) =>
      Array.from(match[1].matchAll(/<Data[^>]*>([\s\S]*?)<\/Data>/g)).map((cell) =>
        cell[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'),
      ),
    );
    if (rows.length === 0) throw new Error('Le fichier Excel ne contient aucune ligne.');
    return rowsToCsvFile(rewriteHeader(rows[0], specs), rows.slice(1), file.name);
  }
  const delimiter = text.includes(';') ? ';' : ',';
  const clean = text.replace(/^\uFEFF/, '');
  const breakAt = clean.indexOf('\n');
  const headerLine = (breakAt < 0 ? clean : clean.slice(0, breakAt)).replace(/\r$/, '');
  const rest = breakAt < 0 ? '' : clean.slice(breakAt + 1);
  const header = headerLine.split(delimiter).map(headerName);
  const rewritten = rewriteHeader(header, specs);
  const esc = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csv = `${rewritten.map(esc).join(delimiter)}\n${rest}`;
  return new File([csv], file.name.replace(/\.\w+$/, '.csv'), { type: 'text/csv' });
}

function rewriteHeader(header: string[], specs: ImportColumnSpec[]) {
  const missing = specs.filter((spec) => spec.required !== false && !header.some((cell) => matchesColumn(cell, spec)));
  if (missing.length > 0) {
    const labels = missing.map((spec) => spec.label || spec.key);
    throw new Error(`Colonnes manquantes : ${labels.join(', ')}.`);
  }
  return header.map((cell) => specs.find((spec) => matchesColumn(cell, spec))?.key || cell);
}

function matchesColumn(cell: string, spec: ImportColumnSpec) {
  const value = headerName(cell);
  return value === spec.key.toLowerCase() || value === spec.label.toLowerCase();
}
