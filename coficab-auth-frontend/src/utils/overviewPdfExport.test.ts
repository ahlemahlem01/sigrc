import { buildOverviewPdf } from './overviewPdfExport';
import type { OverviewData } from '../types/dashboardOverview';

const sample = (): OverviewData => ({
  days: 90,
  generatedAt: '2026-10-17T14:03:00.000Z',
  targets: { onTimeGreen: 85, onTimeOrange: 70, resolutionDays: 14, ppmTolerancePct: 10 },
  headline: {
    openClaims: 748, closedInPeriod: 305,
    onTimeRate: { value: 77.6, previous: 71.8 }, onTimeCount: 225, onTimeBase: 290,
    avgResolutionDays: { value: 13.6, previous: 16.1 }, ppm: { value: 9539, previous: 11100 }, ppmClaims: 383,
    latePlans: 72, plansClosureRate: 55.9,
  },
  actions: {
    pendingValidation: 108, unassigned: 114, lateClaims: 559, noDeadline: 189, latePlans: 72, openAlerts: 1,
    alerts: [{ id: 'a', defectType: 'Dimension hors tolerance', productionLine: 'WR-04', zScore: 3.2, currentCount: 12, detectedAt: '2026-10-10T00:00:00Z' }],
  },
  problems: {
    claimsInPeriod: 413,
    topDefects: [{ name: 'Soudure défectueuse', count: 111, sharePct: 26.9 }],
    topLines: [{ name: 'WR-04', count: 94, sharePct: 23.9 }],
    topClients: [{ name: 'VALEO-TUNIS', count: 55, sharePct: 13.3 }],
    rising: [{ defectType: 'Soudure', recent: 8, previous: 0 }],
  },
  months: [{ month: '2026-09', opened: 150, closed: 251, onTime: 180, onTimeRate: 71.7 }],
  watch: {
    critical: { open: 313, oldestDays: 448, criticalCount: 120, highCount: 193, late: 240, unassigned: 18 },
    eightD: { inProgress: 252, pendingValidation: 107, stalled: 249, byStep: [1, 2, 3, 4, 5, 6, 7, 8].map((step) => ({ step, count: step })) },
    recurrence: { repeatedLots: 14, claimsWithLot: 413, topLots: [{ lot: 'LOT-1', claims: 3, defects: 1, clientId: 'CLIENT-A' }], recurringPairs: 37, topPairs: [{ defectType: 'Soudure défectueuse', productionLine: 'WR-04', claims: 74 }] },
    workload: { averagePerPerson: 20.5, people: 31, overloaded: 3, top: [{ name: 'Amine Ben Youssef', openClaims: 35, lateClaims: 25 }], leastLoaded: null },
  },
  simulatedData: true,
  scope: { organizationId: null, organizationName: null },
  organizations: [
    { organizationId: 'o1', name: 'Coficab Group', employees: 20, openClaims: 561, lateClaims: 425, noDeadline: 136, pendingValidation: 82, onTimeCount: 1, onTimeBase: 2, onTimeRate: 77.6, ppm: 9681, openPlans: 3, latePlans: 0 },
    { organizationId: null, name: '', employees: 0, openClaims: 26, lateClaims: 6, noDeadline: 20, pendingValidation: 2, onTimeCount: 1, onTimeBase: 2, onTimeRate: 76.7, ppm: 16901, openPlans: 0, latePlans: 0 },
  ],
  claimAging: { under30: 100, from30To90: 250, over90: 209 },
  capa: {
    openPlans: 72, latePlans: 60, openActions: 210, lateActions: 150, closedInPeriod: 20, onTimeCount: 8, onTimeBase: 18, onTimeRate: 44.4,
    avgClosureDays: 31.5, actionsAwaitingValidation: 12, aging: { under30: 5, from30To90: 20, over90: 35 },
    byType: [{ type: 'PA', openPlans: 20, latePlans: 15 }, { type: 'PAC', openPlans: 40, latePlans: 35 }, { type: 'PAP', openPlans: 12, latePlans: 10 }],
  },
  clients: [
    { clientId: 'YAZAKI', openClaims: 40, criticalOpen: 12, lateClaims: 30, onTimeCount: 5, onTimeBase: 10, onTimeRate: 50, ppm: 12000 },
  ],
  priority: [
    { id: 'p1', title: 'Débordement étain', clientId: 'YAZAKI', severity: 'CRITICAL', overdueDays: 433, responsibleName: null, statusCode: 'OUVERTE' },
  ],
});

// a plain "key" translator: the export must not depend on a loaded i18n
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

describe('buildOverviewPdf', () => {
  it('writes a dated PDF with every section, and the time of the figures under the title and on each page', () => {
    const { doc, fileName } = buildOverviewPdf(sample(), t, 'fr-FR');
    expect(fileName).toMatch(/^overview-\d{8}-\d{4}\.pdf$/);

    const pdf = doc.output();
    const updated = pdf.split('overviewPage.updatedAt').length - 1;
    expect(updated).toBeGreaterThanOrEqual(1 + doc.getNumberOfPages());   // under the title + the footer of every page
    ['overviewPage.first', 'overviewPage.q0', 'overviewPage.q1', 'overviewPage.q2', 'overviewPage.q3', 'overviewPage.q4', 'overviewPage.q5', 'overviewPage.agingTitle', 'overviewPage.qCapa', 'overviewPage.qClients']
      .forEach((key) => expect(pdf).toContain(key));
    expect(pdf).toContain('overviewPage.simulated');                       // simulated data is flagged
    expect(pdf).toContain('Amine Ben Youssef');                            // the workload is in the report
    expect(pdf).toContain('YAZAKI');                                       // the customers table
    expect(pdf).not.toContain('CRITICAL');                                 // severities are translated, never printed raw
  });

  it('does not list a single-organization comparison', () => {
    const data = sample();
    data.organizations = data.organizations.slice(0, 1);
    expect(buildOverviewPdf(data, t, 'fr-FR').doc.output()).not.toContain('overviewPage.q0');
  });
});
