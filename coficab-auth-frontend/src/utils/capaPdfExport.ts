/** Client-side CAPA report → print / Save as PDF (no backend dependency). */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type CapaPdfColumn = { key: string; label: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml(opts: {
  title: string;
  subtitle?: string;
  filename?: string;
  columns: CapaPdfColumn[];
  rows: Array<Record<string, string | number | undefined | null>>;
  meta?: string[];
  /** Texte libre (synthèse IA) affiché avant le tableau. */
  summary?: string;
  /** Images de graphiques (data URL) à inclure dans l’export. */
  chartImages?: { title: string; dataUrl: string }[];
}): string {
  const generated = new Date().toLocaleString('fr-FR');
  const metaHtml = (opts.meta || [])
    .map((m) => `<div class="meta">${escapeHtml(m)}</div>`)
    .join('');
  const summaryHtml = opts.summary?.trim()
    ? `<div class="summary"><h2>Synthèse</h2><p>${escapeHtml(opts.summary.trim()).replace(/\n/g, '<br/>')}</p></div>`
    : '';
  const chartsHtml = (opts.chartImages || [])
    .filter((c) => c.dataUrl)
    .map(
      (c) =>
        `<div class="chart-block"><h2>${escapeHtml(c.title)}</h2><img src="${c.dataUrl}" alt="${escapeHtml(c.title)}" /></div>`,
    )
    .join('');
  const head = opts.columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body = opts.rows
    .map((row) => {
      const cells = opts.columns
        .map((c) => `<td>${escapeHtml(String(row[c.key] ?? '—'))}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(opts.filename || opts.title)}</title>
  <style>
    @page { margin: 16mm; }
    body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #0f172a; margin: 0; padding: 24px; }
    h1 { color: #000168; font-size: 20px; margin: 0 0 4px; }
    h2 { color: #000168; font-size: 14px; margin: 0 0 8px; }
    .sub { color: #64748b; font-size: 12px; margin-bottom: 12px; }
    .meta { color: #475569; font-size: 11px; margin-bottom: 2px; }
    .stamp { margin: 12px 0 16px; font-size: 10px; color: #94a3b8; }
    .summary {
      border: 1px solid #e4e8f2; border-radius: 8px; padding: 12px 14px;
      background: #f8f9fc; margin: 0 0 18px; font-size: 12px; line-height: 1.55; color: #0d1340;
    }
    .summary p { margin: 0; white-space: pre-wrap; }
    .chart-block { margin: 0 0 18px; page-break-inside: avoid; }
    .chart-block img { max-width: 100%; height: auto; border: 1px solid #e4e8f2; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #000168; color: #fff; text-align: left; padding: 8px 10px; font-weight: 600; }
    td { border-bottom: 1px solid #e2e8f0; padding: 7px 10px; vertical-align: top; word-break: break-word; }
    tr:nth-child(even) td { background: #f8fafc; }
    .empty { text-align: center; color: #94a3b8; padding: 24px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(opts.title)}</h1>
  ${opts.subtitle ? `<div class="sub">${escapeHtml(opts.subtitle)}</div>` : ''}
  ${metaHtml}
  <div class="stamp">COFICAB · ${escapeHtml(generated)}</div>
  ${summaryHtml}
  ${chartsHtml}
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>
      ${body || `<tr><td class="empty" colspan="${opts.columns.length}">—</td></tr>`}
    </tbody>
  </table>
</body>
</html>`;
}

/**
 * Opens the system print dialog (user chooses "Save as PDF").
 * Uses a hidden iframe — more reliable than window.open(..., 'noopener')
 * which returns null in Chromium and silently fails.
 */
export type CapaPdfExportOpts = {
  title: string;
  subtitle?: string;
  filename?: string;
  columns: CapaPdfColumn[];
  rows: Array<Record<string, string | number | undefined | null>>;
  meta?: string[];
  summary?: string;
  chartImages?: { title: string; dataUrl: string }[];
};

export function exportCapaPdf(opts: CapaPdfExportOpts): void {
  const html = buildHtml(opts);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    document.body.removeChild(iframe);
    fallbackBlobPrint(html);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    try { document.body.removeChild(iframe); } catch { /* already removed */ }
  };

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      fallbackBlobPrint(html);
    } finally {
      // Keep iframe briefly so the print dialog can render the content
      setTimeout(cleanup, 1500);
    }
  };

  // Wait for layout / fonts
  if (doc.readyState === 'complete') {
    setTimeout(triggerPrint, 250);
  } else {
    iframe.onload = () => setTimeout(triggerPrint, 250);
    setTimeout(triggerPrint, 600);
  }
}

function safeFilename(name: string): string {
  return name.replace(/[^\w-]+/g, '_') || 'rapport-coficab';
}

/** jsPDF Helvetica = WinAnsi : normalise les caractères hors plage. */
function toPdfText(value: string): string {
  return value
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/·/g, ' | ')
    .replace(/→/g, '->')
    .replace(/€/g, 'EUR');
}

/**
 * Génère et télécharge un vrai fichier PDF (jspdf) — sans dialogue d’impression.
 */
export function downloadCapaReportPdf(opts: CapaPdfExportOpts): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const maxTextW = pageW - margin * 2;
  let y = 16;

  doc.setTextColor(0, 1, 104);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(toPdfText(opts.title), margin, y);
  y += 7;

  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    const subLines = doc.splitTextToSize(toPdfText(opts.subtitle), maxTextW);
    doc.text(subLines, margin, y);
    y += subLines.length * 5 + 2;
  }

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  for (const m of opts.meta || []) {
    doc.text(toPdfText(m), margin, y);
    y += 4.5;
  }

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(toPdfText(`COFICAB · ${new Date().toLocaleString('fr-FR')}`), margin, y);
  y += 8;

  const summary = opts.summary?.trim();
  if (summary) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 1, 104);
    doc.text(toPdfText('Synthèse'), margin, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(13, 19, 64);
    const lines = doc.splitTextToSize(toPdfText(summary), maxTextW);
    for (let i = 0; i < lines.length; i++) {
      if (y > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 16;
      }
      doc.text(lines[i], margin, y);
      y += 4.2;
    }
    y += 4;
  }

  for (const chart of opts.chartImages || []) {
    if (!chart.dataUrl) continue;
    try {
      if (y > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        y = 16;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 1, 104);
      doc.text(toPdfText(chart.title), margin, y);
      y += 4;
      const imgW = Math.min(maxTextW, 180);
      const imgH = 55;
      doc.addImage(chart.dataUrl, 'PNG', margin, y, imgW, imgH);
      y += imgH + 6;
    } catch {
      /* ignore bad image */
    }
  }

  const head = [opts.columns.map((c) => toPdfText(c.label))];
  const body =
    opts.rows.length > 0
      ? opts.rows.map((row) =>
          opts.columns.map((c) => toPdfText(String(row[c.key] ?? '-'))),
        )
      : [opts.columns.map(() => '-')];

  autoTable(doc, {
    startY: Math.min(y, doc.internal.pageSize.getHeight() - 40),
    head,
    body,
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      overflow: 'linebreak',
      valign: 'top',
    },
    headStyles: {
      fillColor: [0, 1, 104],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
  });

  doc.save(`${safeFilename(opts.filename || 'rapport-coficab')}.pdf`);
}

/** @deprecated Prefer downloadCapaReportPdf for a real PDF file. */
export function downloadCapaReportHtml(opts: CapaPdfExportOpts): void {
  const html = buildHtml(opts);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFilename(opts.filename || 'rapport-coficab')}.html`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function fallbackBlobPrint(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    URL.revokeObjectURL(url);
    window.alert(
      'Impossible d’ouvrir l’aperçu PDF. Autorisez les pop-ups pour ce site, puis réessayez.',
    );
    return;
  }
  w.addEventListener('load', () => {
    try {
      w.focus();
      w.print();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  });
}
