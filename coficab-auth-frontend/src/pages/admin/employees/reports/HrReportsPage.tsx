import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { adminEmployeeService } from '../../../../services/adminEmployeeService';
import { getUsers } from '../../../../services/adminService';
import { departmentService } from '../../../../services/departmentService';
import {
  fetchEmployeePerformance,
  SKILL_LEVEL_LABEL,
  type EmployeePerformanceRow,
} from '../../../../services/employeePerformanceService';
import {
  generateHrReport,
  type HrReportEmployeePayload,
} from '../../../../services/hrReportService';
import { activityStatusLabel, normalizeActivityStatus } from '../../../../utils/activityStatus';
import { buildTeamSummary } from '../../../../utils/teamSummary';
import { downloadCapaReportPdf, type CapaPdfExportOpts } from '../../../../utils/capaPdfExport';
import { inferWorkFieldsFromDepartment } from '../../../../utils/employeeWorkFields';
import type { Department } from '../../../../types/department';
import AiSummarySection from './AiSummarySection';
import ReportCharts from './ReportCharts';
import ReportDetailTable from './ReportDetailTable';
import ReportHistorySection from './ReportHistorySection';
import ReportParametersForm, { type ReportParams } from './ReportParametersForm';
import ReportResultSkeleton from './ReportResultSkeleton';
import {
  loadHrReportHistory,
  pushHrReportHistory,
  removeHrReportHistory,
  type HrReportHistoryEntry,
} from './hrReportHistory';
import { useTranslation } from 'react-i18next';
import i18n from '../../../../i18n';

const NAVY = '#000168';
const LINE = '#e4e8f2';

const unwrap = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.['$values'])) return raw['$values'];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
};

const pick = (obj: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

const defaultPeriod = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { periodStart: iso(start), periodEnd: iso(end) };
};

type EmpBase = {
  id: string;
  fullName: string;
  email: string;
  department: string;
  role: string;
  poste?: string;
  equipe?: string;
  activityStatus: string;
  recentActionCount: number;
};

export default function HrReportsPage() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const period0 = defaultPeriod();
  const [params, setParams] = useState<ReportParams>({
    periodStart: period0.periodStart,
    periodEnd: period0.periodEnd,
    department: 'all',
    employeeMode: 'all',
    selectedIds: [],
  });
  const [employees, setEmployees] = useState<EmpBase[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [perfById, setPerfById] = useState<Map<string, EmployeePerformanceRow>>(new Map());
  const [badgesById, setBadgesById] = useState<Map<string, string[]>>(new Map());
  const [timelineById, setTimelineById] = useState<Map<string, string[]>>(new Map());
  const [loadingBase, setLoadingBase] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [reportRows, setReportRows] = useState<HrReportEmployeePayload[]>([]);
  const [history, setHistory] = useState<HrReportHistoryEntry[]>(() => loadHrReportHistory());
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [automaticSummary, setAutomaticSummary] = useState(false);

  const loadBase = useCallback(async () => {
    if (!accessToken) {
      setLoadingBase(false);
      setError(i18n.t('hrReports.sessionExpired'));
      return;
    }
    setLoadingBase(true);
    setError('');
    try {
      const [profilesRaw, usersRaw, deptsRaw, activity] = await Promise.all([
        adminEmployeeService.getAllProfiles(accessToken),
        getUsers(accessToken),
        departmentService.getAll(accessToken).catch(() => []),
        adminEmployeeService.getActivitySummary(accessToken).catch(() => null),
      ]);

      const authUsers = unwrap(usersRaw);
      const authById = new Map(
        authUsers.map((u: any) => [String(u.id ?? u.Id).toLowerCase(), u]),
      );
      const activityById = new Map(
        (activity?.items ?? []).map((i) => [String(i.userId).toLowerCase(), i]),
      );

      const adminish = (roles: any) => {
        const list = Array.isArray(roles) ? roles : roles ? [roles] : [];
        return list.some((r) => /admin|superadmin/i.test(String(r)));
      };

      const merged: EmpBase[] = [];
      const seen = new Set<string>();

      for (const p of unwrap(profilesRaw)) {
        const id = String(pick(p, 'userId', 'UserId', 'id', 'Id') ?? '').trim();
        if (!id) continue;
        const auth = authById.get(id.toLowerCase());
        if (adminish(auth?.roles ?? pick(p, 'role', 'Role'))) continue;
        const department =
          pick(p, 'department', 'Department') ?? pick(auth, 'department', 'Department') ?? '';
        const act = activityById.get(id.toLowerCase());
        const inferred = inferWorkFieldsFromDepartment(
          department,
          pick(p, 'role', 'Role') ?? auth?.roles?.[0],
        );
        merged.push({
          id,
          fullName:
            pick(p, 'name', 'Name', 'fullName', 'FullName')
            ?? pick(auth, 'fullName', 'FullName')
            ?? '—',
          email: pick(p, 'email', 'Email') ?? pick(auth, 'email', 'Email') ?? '',
          department: department || '—',
          role: pick(p, 'role', 'Role') ?? auth?.roles?.[0] ?? 'user',
          poste: pick(p, 'poste', 'Poste') || inferred.poste,
          equipe: pick(p, 'equipe', 'Equipe') || inferred.equipe,
          activityStatus: normalizeActivityStatus(
            act?.activityStatus ?? pick(p, 'activityStatus', 'ActivityStatus'),
          ),
          recentActionCount: act?.recentActionCount ?? 0,
        });
        seen.add(id.toLowerCase());
      }

      for (const u of authUsers) {
        const id = String(pick(u, 'id', 'Id') ?? '').trim();
        if (!id || seen.has(id.toLowerCase()) || adminish(u.roles)) continue;
        const department = pick(u, 'department', 'Department') ?? '—';
        const act = activityById.get(id.toLowerCase());
        const inferred = inferWorkFieldsFromDepartment(department, u.roles?.[0]);
        merged.push({
          id,
          fullName: pick(u, 'fullName', 'FullName') ?? '—',
          email: pick(u, 'email', 'Email') ?? '',
          department,
          role: u.roles?.[0] ?? 'user',
          poste: inferred.poste,
          equipe: inferred.equipe,
          activityStatus: normalizeActivityStatus(act?.activityStatus),
          recentActionCount: act?.recentActionCount ?? 0,
        });
      }

      setEmployees(merged.sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr')));

      const fromDb = unwrap(deptsRaw)
        .filter((d: Department) => !d.isArchived)
        .map((d: Department) => d.name)
        .filter(Boolean) as string[];
      const fromEmp = merged
        .map((e) => e.department)
        .filter((d) => d && d !== '—');
      const deptMap: Record<string, string> = {};
      for (const d of [...fromDb, ...fromEmp]) deptMap[d] = d;
      setDepartments(Object.keys(deptMap).sort((a, b) => a.localeCompare(b, 'fr')));

      try {
        const perf = await fetchEmployeePerformance(accessToken, merged, { aligned: true });
        setPerfById(new Map(perf.map((r) => [r.userId.toLowerCase(), r])));
      } catch {
        setPerfById(new Map());
      }

      try {
        const badges = await adminEmployeeService.getAllBadgesForEmployees(
          accessToken,
          merged.map((e) => ({ id: e.id })),
        );
        const map = new Map<string, string[]>();
        for (const b of badges) {
          const owner = String(b.__ownerId ?? b.userId ?? b.UserId ?? '').toLowerCase();
          if (!owner) continue;
          const title = String(b.title ?? b.name ?? b.badgeName ?? b.label ?? 'Badge');
          const list = map.get(owner) ?? [];
          list.push(title);
          map.set(owner, list);
        }
        setBadgesById(map);
      } catch {
        setBadgesById(new Map());
      }

      try {
        const timeline = await adminEmployeeService.getAllTimeline(accessToken);
        const map = new Map<string, string[]>();
        for (const ev of timeline) {
          const uid = String(ev.userId ?? ev.UserId ?? '').toLowerCase();
          if (!uid) continue;
          const label = String(ev.title ?? ev.eventType ?? ev.type ?? ev.description ?? i18n.t('hrReports.event'));
          const when = ev.timestamp ?? ev.createdAt ?? '';
          const line = when ? `${label} (${String(when).slice(0, 10)})` : label;
          const list = map.get(uid) ?? [];
          if (list.length < 5) list.push(line);
          map.set(uid, list);
        }
        setTimelineById(map);
      } catch {
        setTimelineById(new Map());
      }

      if (merged.length === 0) {
        setError(i18n.t('hrReports.noEmployees'));
      }
    } catch {
      setError(i18n.t('hrReports.loadFailed'));
      setEmployees([]);
    } finally {
      setLoadingBase(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const scopedEmployees = useMemo(() => {
    let list = employees;
    if (params.department !== 'all') {
      list = list.filter(
        (e) => e.department.trim().toLowerCase() === params.department.trim().toLowerCase(),
      );
    }
    if (params.employeeMode === 'select') {
      const selected = params.selectedIds.map((id) => id.toLowerCase());
      list = list.filter((e) => selected.includes(e.id.toLowerCase()));
    }
    return list;
  }, [employees, params]);

  const buildPayload = useCallback(
    (list: EmpBase[]): HrReportEmployeePayload[] =>
      list.map((e) => {
        const perf = perfById.get(e.id.toLowerCase());
        const levels: Record<string, string> = {};
        if (perf?.competencyLevels) {
          for (const [k, v] of Object.entries(perf.competencyLevels)) {
            levels[k] = SKILL_LEVEL_LABEL[v] ?? v;
          }
        }
        return {
          userId: e.id,
          fullName: e.fullName,
          email: e.email,
          department: e.department,
          role: e.role,
          activityStatus: e.activityStatus,
          activeDossiers: perf?.activeDossiers ?? 0,
          remainingCapacity: perf?.remainingCapacity ?? 0,
          closureRate: perf?.closureRate ?? 0,
          overdueCount: perf?.overdueCount ?? 0,
          avgDelayDays: perf?.avgDelayDays ?? 0,
          claimsOpen: perf?.claims?.open,
          claimsClosureRate: perf?.claims?.rate,
          claimsLate: perf?.claims?.late,
          plansOpen: perf?.plans?.open,
          plansClosureRate: perf?.plans?.rate,
          plansLate: perf?.plans?.late,
          actionsLate: perf?.actions?.late,
          actionsToValidate: perf?.actions?.toValidate,
          plansActivity: perf?.activity?.plans,
          claimsActivity: perf?.activity?.claims,
          workload: perf?.workload ?? 'low',
          recentActionCount: e.recentActionCount,
          competencyLevels: levels,
          badges: badgesById.get(e.id.toLowerCase()) ?? [],
          timelineHighlights: timelineById.get(e.id.toLowerCase()) ?? [],
        };
      }),
    [perfById, badgesById, timelineById],
  );

  const onGenerate = useCallback(async () => {
    if (!accessToken) {
      setError(i18n.t('hrReports.sessionExpired'));
      return;
    }
    if (scopedEmployees.length === 0) {
      setError(
        params.employeeMode === 'select'
          ? i18n.t('hrReports.checkAtLeastOne')
          : i18n.t('hrReports.noneInChosenScope'),
      );
      return;
    }

    setGenerating(true);
    setError('');
    setNotice('');
    setAutomaticSummary(false);
    setSummary('');
    setReportRows([]);
    const payload = buildPayload(scopedEmployees);

    // the figures never depend on the AI: when it is not available the report is shown with an automatic summary
    const showWithoutAi = (reason: string) => {
      const createdAt = new Date().toISOString();
      const text = buildTeamSummary((k, o) => i18n.t(k, o as any) as string, payload);
      setSummary(text);
      setGeneratedAt(createdAt);
      setReportRows(payload);
      // the reason (a missing key, a time-out…) is for the administrators of the server, not for this page
      console.warn('[team report] AI summary unavailable:', reason);
      setAutomaticSummary(true);
      setNotice(i18n.t('hrReports.aiUnavailable'));
      setHistory(
        pushHrReportHistory({
          id: `hr-${Date.now()}`, createdAt, periodStart: params.periodStart, periodEnd: params.periodEnd,
          department: params.department, employeeCount: payload.length, summary: text, rows: payload,
        }),
      );
    };
    try {
      const res = await generateHrReport(accessToken, {
        periodStart: params.periodStart || null,
        periodEnd: params.periodEnd || null,
        department: params.department === 'all' ? null : params.department,
        employees: payload,
      });
      if (!res.summary?.trim()) {
        showWithoutAi(i18n.t('hrReports.emptySummary'));
        return;
      }
      const createdAt = res.generatedAt || new Date().toISOString();
      setSummary(res.summary);
      setGeneratedAt(createdAt);
      setReportRows(payload);
      setHistory(
        pushHrReportHistory({
          id: `hr-${Date.now()}`,
          createdAt,
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          department: params.department,
          employeeCount: payload.length,
          summary: res.summary,
          rows: payload,
        }),
      );
    } catch (err: any) {
      const msg =
        err?.response?.data?.message
        || err?.response?.data?.Message
        || (err?.code === 'ECONNABORTED' ? i18n.t('hrReports.timeout') : null)
        || err?.message
        || i18n.t('hrReports.generateFailed');
      showWithoutAi(String(msg));
    } finally {
      setGenerating(false);
    }
  }, [accessToken, scopedEmployees, params, buildPayload]);

  const buildExportOpts = useCallback(
    (
      rows: HrReportEmployeePayload[],
      text: string,
      metaExtra?: Partial<HrReportHistoryEntry>,
    ): CapaPdfExportOpts => {
      const periodStart = metaExtra?.periodStart ?? params.periodStart;
      const periodEnd = metaExtra?.periodEnd ?? params.periodEnd;
      const department = metaExtra?.department ?? params.department;
      return {
        title: i18n.t('hrReports.pdfTitle'),
        subtitle: i18n.t('hrReports.pdfSubtitle'),
        filename: `rapport-equipes-${periodStart || 'debut'}_${periodEnd || 'fin'}`,
        meta: [
          `${i18n.t('hrReports.period')} : ${periodStart || '…'} → ${periodEnd || '…'}`,
          `${i18n.t('planDetail.department')} : ${department && department !== 'all' ? department : i18n.t('hrReports.allDepartments')}`,
          `${i18n.t('hrReports.employees')} : ${rows.length}`,
        ],
        summary: text.trim() || undefined,
        columns: [
          { key: 'name', label: i18n.t('hrReports.colEmployee') },
          { key: 'department', label: i18n.t('planDetail.department') },
          { key: 'activityPlans', label: i18n.t('hrReports.colActivityPlans') },
          { key: 'activityClaims', label: i18n.t('hrReports.colActivityClaims') },
          { key: 'claims', label: i18n.t('hrReports.colClaims') },
          { key: 'plans', label: i18n.t('hrReports.colPlans') },
          { key: 'capacity', label: i18n.t('hrReports.colCapacity') },
          { key: 'toValidate', label: i18n.t('hrReports.colToValidate') },
          { key: 'overdue', label: i18n.t('comparator.late') },
          { key: 'workload', label: i18n.t('comparator.load') },
          { key: 'badges', label: i18n.t('employeesAdmin.tabBadges') },
        ],
        rows: rows.map((r) => ({
          name: r.fullName,
          department: r.department,
          activityPlans: activityStatusLabel(r.plansActivity ?? r.activityStatus),
          activityClaims: activityStatusLabel(r.claimsActivity ?? r.activityStatus),
          claims: r.claimsOpen == null ? '—' : `${r.claimsOpen} · ${r.claimsClosureRate ?? 0}%`,
          plans: r.plansOpen == null ? '—' : `${r.plansOpen} · ${r.plansClosureRate ?? 0}%`,
          capacity: r.remainingCapacity,
          toValidate: r.actionsToValidate ?? '—',
          overdue: r.overdueCount,
          workload: r.workload,
          badges: (r.badges || []).slice(0, 4).join(', ') || '—',
        })),
      };
    },
    [params.periodStart, params.periodEnd, params.department],
  );

  const onDownload = useCallback(
    (rows: HrReportEmployeePayload[], text: string, metaExtra?: Partial<HrReportHistoryEntry>) => {
      if (rows.length === 0) {
        setError(i18n.t('hrReports.generateBeforeDownload'));
        return;
      }
      setExporting(true);
      setError('');
      try {
        downloadCapaReportPdf(buildExportOpts(rows, text, metaExtra));
      } catch {
        setError(i18n.t('hrReports.downloadFailed'));
      } finally {
        setExporting(false);
      }
    },
    [buildExportOpts],
  );

  const onRestoreHistory = (entry: HrReportHistoryEntry) => {
    setSummary(entry.summary);
    setGeneratedAt(entry.createdAt);
    setReportRows(entry.rows);
    setParams((prev) => ({
      ...prev,
      periodStart: entry.periodStart || prev.periodStart,
      periodEnd: entry.periodEnd || prev.periodEnd,
      department: entry.department || 'all',
    }));
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onDeleteHistory = (id: string) => {
    setHistory(removeHrReportHistory(id));
  };

  return (
    <div className="hrp">
      <style>{`
        .hrp { font-family: Inter, system-ui, sans-serif; color: #0d1340; max-width: 1120px; }
        .hrp-head { margin-bottom: 16px; }
        .hrp-eyebrow {
          margin: 0 0 4px; font-size: 10px; font-weight: 700;
          letter-spacing: 1.2px; text-transform: uppercase; color: ${NAVY};
        }
        .hrp-title { margin: 0; font-size: 20px; font-weight: 700; }
        .hrp-sub { margin: 6px 0 0; font-size: 13px; color: #64748b; max-width: 560px; line-height: 1.45; }
        .hrp-note {
          margin-bottom: 12px; padding: 10px 12px; border-radius: 8px;
          background: #eff6ff; color: #1e40af; font-size: 13px; border: 1px solid #bfdbfe;
        }
        .hrp-err {
          margin-bottom: 12px; padding: 10px 12px; border-radius: 8px;
          background: #fef2f2; color: #b91c1c; font-size: 13px; border: 1px solid #fecaca;
        }
        .hrp-loading {
          padding: 28px; text-align: center; color: #64748b; font-size: 13px;
          border: 1px dashed ${LINE}; border-radius: 12px; margin-bottom: 16px;
        }
      `}</style>

      <div className="hrp-head">
        <p className="hrp-eyebrow">{t('admin.audit')}</p>
        <h1 className="hrp-title">{t('hrReports.title')}</h1>
        <p className="hrp-sub">
          {t('hrReports.subtitle')}
        </p>
      </div>

      {error ? <div className="hrp-err">{error}</div> : null}
      {notice ? <div className="hrp-note">{notice}</div> : null}
      {loadingBase ? (
        <div className="hrp-loading">{t('hrReports.loadingBase')}</div>
      ) : (
        <ReportParametersForm
          value={params}
          onChange={setParams}
          employees={employees.map((e) => ({
            id: e.id,
            fullName: e.fullName,
            department: e.department,
          }))}
          departments={departments}
          scopedCount={scopedEmployees.length}
          generating={generating}
          exporting={exporting}
          onGenerate={() => {
            void onGenerate();
          }}
          canExport={reportRows.length > 0}
          onDownload={() => onDownload(reportRows, summary)}
        />
      )}

      {generating ? <ReportResultSkeleton /> : null}

      {!generating && (summary || reportRows.length > 0) ? (
        <>
          <AiSummarySection
            value={summary}
            onChange={setSummary}
            generatedAt={generatedAt}
            employeeCount={reportRows.length}
            canDownload={reportRows.length > 0}
            downloading={exporting}
            onDownload={() => onDownload(reportRows, summary)}
            automatic={automaticSummary}
          />
          <ReportCharts rows={reportRows} />
          <ReportDetailTable rows={reportRows} />
        </>
      ) : null}

      <ReportHistorySection
        entries={history}
        onRestore={onRestoreHistory}
        onDelete={onDeleteHistory}
        onDownload={(e) => onDownload(e.rows, e.summary, e)}
      />
    </div>
  );
}
