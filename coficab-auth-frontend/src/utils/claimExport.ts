import type { Claim } from '../types/qualityAnalysis';

export type ClaimExportFormat = 'csv' | 'excel';

const HEADERS = [
  'Réf. ID',
  'Titre',
  'Client',
  'Type de défaut',
  'Sévérité',
  'Statut',
  'Ligne',
  'Équipe',
  'N° lot',
  'N° série',
  'Date détection',
  'Date création',
  'Date limite',
  'Date clôture',
  'Dans les délais',
  'Créé par',
  'Assigné à',
  'Qté produite',
  'Qté défectueuse',
  'Description',
] as const;

function claimField(c: Claim, key: string): unknown {
  const rec = c as unknown as Record<string, unknown>;
  return rec[key] ?? rec[key.charAt(0).toUpperCase() + key.slice(1)];
}

function fmtDate(value: unknown): string {
  if (value == null || value === '') return '';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('fr-FR');
}

function fmtBool(value: unknown): string {
  if (value === true) return 'Oui';
  if (value === false) return 'Non';
  return '';
}

function fmtNum(value: unknown): string {
  if (value == null || value === '') return '';
  return String(value);
}

function claimToRow(c: Claim): string[] {
  return [
    String(c.id ?? ''),
    String(c.title ?? ''),
    String(c.clientId ?? ''),
    String(c.defectType ?? ''),
    String(c.severity ?? ''),
    String(c.statusCode ?? ''),
    String(claimField(c, 'productionLine') ?? claimField(c, 'production_line') ?? ''),
    String(claimField(c, 'shift') ?? ''),
    String(c.lotNumber ?? ''),
    String(c.serialNumber ?? ''),
    fmtDate(c.detectionDate),
    fmtDate(c.createdAt),
    fmtDate(c.deadline),
    fmtDate(c.completedAt),
    fmtBool(c.isOnTime),
    String(c.createdBy ?? c.createdById ?? ''),
    String(c.assignedToName ?? c.assignedToId ?? ''),
    fmtNum(c.producedQuantity),
    fmtNum(c.defectiveQuantity),
    String(c.description ?? '').replace(/\r?\n/g, ' '),
  ];
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** CSV UTF-8 (BOM) séparateur `;` — compatible Excel FR. */
export function exportClaimsToCsv(claims: Claim[], basename = 'reclamations'): void {
  const rows = [HEADERS as unknown as string[], ...claims.map(claimToRow)];
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map((r) => r.map(esc).join(';')).join('\r\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(`${basename}_${stamp()}.csv`, blob);
}

export function exportClaimsToExcel(claims: Claim[], basename = 'reclamations'): void {
  const dataRows = claims.map(claimToRow);
  const headerRow = `<Row ss:StyleID="Header">${(HEADERS as unknown as string[])
    .map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`)
    .join('')}</Row>`;
  const bodyRows = dataRows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => `<Cell><Data ss:Type="String">${escapeXml(String(cell ?? ''))}</Data></Cell>`)
          .join('')}</Row>`,
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Réclamations">
  <Table>
   ${headerRow}
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  downloadBlob(`${basename}_${stamp()}.xls`, blob);
}

export function exportClaims(claims: Claim[], format: ClaimExportFormat, basename = 'reclamations'): void {
  if (format === 'csv') exportClaimsToCsv(claims, basename);
  else exportClaimsToExcel(claims, basename);
}
