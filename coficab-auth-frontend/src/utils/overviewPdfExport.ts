import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type { OverviewData } from '../types/dashboardOverview';
import { severityKey } from './overviewSeverity';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const NAVY: [number, number, number] = [0, 1, 104];
const GREY: [number, number, number] = [100, 116, 139];

/**
 * The management overview as a PDF: the same five questions as on screen, as tables. The date and time of the figures are
 * printed under the title and on every page, so a printed copy always says how fresh it is.
 */
export function buildOverviewPdf(data: OverviewData, t: Translate, locale: string): { doc: jsPDF; fileName: string } {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const generated = new Date(data.generatedAt);
  const stamp = generated.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
  const num = (n: number | null | undefined, digits = 0) =>
    n == null ? '-' : n.toLocaleString(locale, { maximumFractionDigits: digits });
  const pct = (n: number | null | undefined) => (n == null ? '-' : `${num(n, 1)} %`);
  const days = data.days;
  const share = (part: number, whole: number) => (whole > 0 ? `${num((100 * part) / whole, 0)} %` : '-');
  const severity = (raw: string) => t(`overviewPage.severity.${severityKey(raw)}`);
  const h = data.headline;

  let y = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text(`${t('adminDashboard.navTitle')} - Coficab`, 14, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...GREY);
  const scope = data.scope.organizationNames.length > 0
    ? t('overviewPage.pdfScopeOne', { name: data.scope.organizationNames.join(', ') })
    : t('overviewPage.allOrganizations');
  doc.text(`${scope} - ${t('overviewPage.pdfPeriod', { days })}`, 14, y);
  y += 5;
  doc.text(t('overviewPage.updatedAt', { date: stamp }), 14, y);
  y += 3;

  const section = (title: string) => {
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    const startY = (last?.finalY ?? y) + 8;
    if (startY > 270) doc.addPage();
    const at = startY > 270 ? 16 : startY;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(title, 14, at);
    return at + 2;
  };

  const table = (startY: number, head: string[], body: RowInput[], widths?: Record<number, number>) =>
    autoTable(doc, {
      startY,
      head: [head],
      body,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.8, textColor: [15, 23, 42], lineColor: [228, 232, 242] },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: widths ? Object.fromEntries(Object.entries(widths).map(([k, w]) => [k, { cellWidth: w }])) : undefined,
      margin: { left: 14, right: 14 },
    });

  // key figures
  const tg = data.targets;
  table(
    section(t('overviewPage.q1')),
    [t('overviewPage.colIndicator'), t('overviewPage.colValue'), t('overviewPage.colPrevious', { days }), t('overviewPage.colTarget')],
    [
      [t('overviewPage.openClaims'), num(h.openClaims), '-', '-'],
      [t('overviewPage.lateShare'), share(data.actions.lateClaims, h.openClaims), '-', '-'],
      [t('overviewPage.onTime'), pct(h.onTimeRate.value), pct(h.onTimeRate.previous), `>= ${num(tg.onTimeGreen)} %`],
      [t('overviewPage.resolution'), h.avgResolutionDays.value == null ? '-' : `${num(h.avgResolutionDays.value, 1)} ${t('overviewPage.daysUnit')}`,
        h.avgResolutionDays.previous == null ? '-' : `${num(h.avgResolutionDays.previous, 1)} ${t('overviewPage.daysUnit')}`, `<= ${num(tg.resolutionDays)} ${t('overviewPage.daysUnit')}`],
      [t('overviewPage.ppm'), num(h.ppm.value), num(h.ppm.previous), `+${num(tg.ppmTolerancePct)} % max`],
      [t('overviewPage.latePlans'), num(h.latePlans), '-', '-'],
      [t('overviewPage.plansClosure'), pct(h.plansClosureRate), '-', '-'],
    ],
  );

  // to handle first
  table(
    section(t('overviewPage.first')),
    ['#', t('overviewPage.colTitle'), t('overviewPage.colClient'), t('overviewPage.colResponsible'), t('overviewPage.colSeverity'), t('overviewPage.colDelay')],
    data.priority.length === 0
      ? [[{ content: t('overviewPage.firstNone'), colSpan: 6 }]]
      : data.priority.map((c, i) => [i + 1, c.title, c.clientId, c.responsibleName || t('claimDetail.unassigned'), severity(c.severity), t('overviewPage.firstLate', { count: c.overdueDays })]),
    { 0: 8 },
  );

  // organizations
  if (data.organizations.length > 1) {
    table(
      section(t('overviewPage.q0')),
      [t('overviewPage.colOrganization'), t('overviewPage.colOpen'), t('overviewPage.colLate'), t('overviewPage.colNoDeadline'), t('overviewPage.colValidation'), t('overviewPage.colOnTime'), t('overviewPage.colPpm'), t('overviewPage.colLatePlans'), t('overviewPage.colEmployees')],
      data.organizations.map((o) => [
        o.organizationId ? o.name : t('overviewPage.unattributed'),
        num(o.openClaims), `${num(o.lateClaims)} (${share(o.lateClaims, o.openClaims)})`, num(o.noDeadline), num(o.pendingValidation), pct(o.onTimeRate), num(o.ppm),
        o.organizationId ? num(o.latePlans) : '-', o.organizationId ? num(o.employees) : '-',
      ]),
    );
  }

  // needs action
  const a = data.actions;
  table(
    section(t('overviewPage.q2')),
    [t('overviewPage.colIndicator'), t('overviewPage.colCount')],
    [
      [t('overviewPage.pendingValidation'), num(a.pendingValidation)],
      [t('overviewPage.lateClaims'), `${num(a.lateClaims)} (${share(a.lateClaims, h.openClaims)})`],
      [t('overviewPage.noDeadline'), num(a.noDeadline)],
      [t('overviewPage.unassigned'), num(a.unassigned)],
      [t('overviewPage.latePlans'), num(a.latePlans)],
      [t('overviewPage.openAlerts'), num(a.openAlerts)],
      ...a.alerts.map((al) => [`  ${t('overviewPage.alert')}: ${al.defectType} - ${al.productionLine || '-'}`, t('overviewPage.alertLine', { count: al.currentCount, z: al.zScore })]),
    ],
  );

  // how long the delays last
  const aging = (label: string, a: { under30: number; from30To90: number; over90: number }) => [
    label, num(a.under30), num(a.from30To90), num(a.over90),
  ];
  table(
    section(t('overviewPage.agingTitle')),
    [t('overviewPage.colIndicator'), t('overviewPage.agingUnder30'), t('overviewPage.aging30to90'), t('overviewPage.agingOver90')],
    [aging(t('overviewPage.agingClaims'), data.claimAging), aging(t('overviewPage.agingPlans'), data.capa.aging)],
  );

  // CAPA
  const c = data.capa;
  table(
    section(t('overviewPage.qCapa')),
    [t('overviewPage.colIndicator'), t('overviewPage.colValue')],
    [
      [t('overviewPage.capaOpenPlans'), `${num(c.openPlans)} (${t('overviewPage.capaOpenPlansSub', { actions: num(c.openActions) })})`],
      [t('overviewPage.capaLatePlans'), `${num(c.latePlans)} (${share(c.latePlans, c.openPlans)})`],
      [t('overviewPage.capaLateActions'), `${num(c.lateActions)} (${share(c.lateActions, c.openActions)})`],
      [t('overviewPage.capaOnTime'), `${pct(c.onTimeRate)} (${c.onTimeCount}/${c.onTimeBase})`],
      [t('overviewPage.capaClosure'), c.avgClosureDays == null ? '-' : `${num(c.avgClosureDays, 1)} ${t('overviewPage.daysUnit')}`],
      [t('overviewPage.capaAwaiting'), num(c.actionsAwaitingValidation)],
      ...c.byType.map((x) => [`  ${x.type}`, `${num(x.openPlans)} (${t('overviewPage.lateCount', { count: x.latePlans })})`]),
    ],
  );

  // customers
  table(
    section(t('overviewPage.qClients')),
    [t('overviewPage.colClient'), t('overviewPage.colOpen'), t('overviewPage.colCritical'), t('overviewPage.colLate'), t('overviewPage.colLateShare'), t('overviewPage.colOnTime'), t('overviewPage.colPpm')],
    data.clients.length === 0
      ? [[{ content: t('overviewPage.clientsNone'), colSpan: 7 }]]
      : data.clients.map((x) => [x.clientId, num(x.openClaims), num(x.criticalOpen), num(x.lateClaims), share(x.lateClaims, x.openClaims), pct(x.onTimeRate), num(x.ppm)]),
  );

  // problems
  const p = data.problems;
  const ranked = (title: string, rows: { name: string; count: number; sharePct: number }[]) =>
    table(section(title), [t('overviewPage.colName'), t('overviewPage.colCount'), t('overviewPage.colShare')],
      rows.length === 0 ? [[{ content: t('adminDashboard.noData'), colSpan: 3 }]] : rows.map((r) => [r.name, num(r.count), pct(r.sharePct)]));
  ranked(`${t('overviewPage.q3')} - ${t('overviewPage.topDefects')}`, p.topDefects);
  ranked(t('overviewPage.topLines'), p.topLines);
  ranked(t('overviewPage.topClients'), p.topClients);
  table(
    section(t('overviewPage.rising')),
    [t('overviewPage.colName')],
    p.rising.length === 0
      ? [[t('overviewPage.noRising')]]
      : p.rising.map((r) => [t('overviewPage.risingLine', { defect: r.defectType, recent: r.recent, previous: r.previous })]),
  );

  // trend
  table(
    section(t('overviewPage.q4')),
    [t('overviewPage.colMonth'), t('overviewPage.colOpened'), t('overviewPage.colClosed'), t('overviewPage.colOnTime')],
    data.months.map((m) => [m.month, num(m.opened), num(m.closed), pct(m.onTimeRate)]),
  );

  // to watch
  const w = data.watch;
  table(
    section(t('overviewPage.q5')),
    [t('overviewPage.colIndicator'), t('overviewPage.colValue')],
    [
      [t('overviewPage.criticalTitle'), `${num(w.critical.open)} (${t('overviewPage.criticalSplit', { critical: w.critical.criticalCount, high: w.critical.highCount })})`],
      [t('overviewPage.criticalLateUnassigned', { late: w.critical.late, unassigned: w.critical.unassigned }), w.critical.oldestDays == null ? '-' : t('overviewPage.criticalOldest', { days: w.critical.oldestDays })],
      [t('overviewPage.eightDTitle'), `${num(w.eightD.inProgress)} (${w.eightD.byStep.map((s) => `D${s.step}: ${s.count}`).join(', ')})`],
      [t('overviewPage.eightDStalledLabel'), num(w.eightD.stalled)],
      [t('overviewPage.recurrenceTitle'), `${num(w.recurrence.repeatedLots)} - ${w.recurrence.topLots.map((l) => `${l.lot} (${l.claims})`).join(', ') || '-'}`],
      [t('overviewPage.recurringPairs', { count: w.recurrence.recurringPairs }), w.recurrence.topPairs.map((pair) => `${pair.defectType} / ${pair.productionLine} (${pair.claims})`).join(', ') || '-'],
      [t('overviewPage.workloadTitle'), `${num(w.workload.overloaded)} / ${num(w.workload.people)} - ${t('overviewPage.workloadAvgShort', { avg: num(w.workload.averagePerPerson, 1) })}`],
      ...w.workload.top.map((x) => [`  ${x.name}`, `${x.openClaims} (${t('overviewPage.lateCount', { count: x.lateClaims })})`]),
    ],
  );

  if (data.simulatedData) {
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...GREY);
    doc.text(t('overviewPage.simulated'), 14, (last?.finalY ?? y) + 8);
  }

  // footer on every page: what the document is, when the figures were taken, the page number
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(`${t('adminDashboard.navTitle')} - ${t('overviewPage.updatedAt', { date: stamp })}`, 14, 289);
    doc.text(t('overviewPage.pdfPage', { n: page, total }), 196, 289, { align: 'right' });
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const fileName = `overview-${generated.getFullYear()}${pad(generated.getMonth() + 1)}${pad(generated.getDate())}-${pad(generated.getHours())}${pad(generated.getMinutes())}.pdf`;
  return { doc, fileName };
}

/** Builds the report and downloads it. */
export function exportOverviewPdf(data: OverviewData, t: Translate, locale: string): void {
  const { doc, fileName } = buildOverviewPdf(data, t, locale);
  doc.save(fileName);
}
