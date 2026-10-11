import type { HrReportEmployeePayload } from '../../../../services/hrReportService';

export type HrReportHistoryEntry = {
  id: string;
  createdAt: string;
  periodStart: string;
  periodEnd: string;
  department: string;
  employeeCount: number;
  summary: string;
  rows: HrReportEmployeePayload[];
};

const STORAGE_KEY = 'coficab-hr-reports-history';
const MAX_ENTRIES = 25;

export function loadHrReportHistory(): HrReportHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHrReportHistory(entries: HrReportHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
}

export function pushHrReportHistory(entry: HrReportHistoryEntry): HrReportHistoryEntry[] {
  const next = [entry, ...loadHrReportHistory().filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES);
  saveHrReportHistory(next);
  return next;
}

export function removeHrReportHistory(id: string): HrReportHistoryEntry[] {
  const next = loadHrReportHistory().filter((e) => e.id !== id);
  saveHrReportHistory(next);
  return next;
}
