import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { getUsersForAssignment } from '../../services/actionPlanService';
import type { Claim } from '../../types/qualityAnalysis';
import { resolveClaimStatus } from '../../utils/Claimutils';
import { exportCapaPdf } from '../../utils/capaPdfExport';
import { buildReportSummary, previousPeriod } from '../../utils/reportSummary';
import { capaBtnSecondary } from '../../components/capa/CapaAdminUi';
import { ListSkeleton } from '../../components/TableSkeleton';

const COFICAB = '#000168';

type GroupBy = 'responsible' | 'severity' | 'status' | 'defect' | 'client' | 'department';
type StatusFilter = 'all' | 'open' | 'closed' | 'late';
type DateField = 'detection' | 'created' | 'deadline';

type Criteria = {
  from: string; to: string; groupBy: GroupBy; status: StatusFilter; dateField: DateField; q: string;
  department: string; responsible: string; severity: string;
};

type Row = { claim: Claim; closed: boolean; late: boolean };
type GroupRow = { key: string; label: string; total: number; closed: number; late: number; open: number; rate: number; rows: Row[] };
type Generated = {
  generatedAt: string;
  criteria: Criteria;
  groups: GroupRow[];
  totals: { total: number; closed: number; late: number; open: number; groups: number; rate: number };
  /** the same filters over the period just before: for the comparison of the summary */
  previous?: { total: number; closed: number; late: number; open: number; groups: number; rate: number } | null;
};

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const defaultCriteria = (): Criteria => {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  return { from: toDateInput(from), to: toDateInput(to), groupBy: 'severity', status: 'all', dateField: 'detection', q: '', department: 'all', responsible: 'all', severity: 'all' };
};
const inRange = (iso: string | null | undefined, from: string, to: string) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= new Date(from).setHours(0, 0, 0, 0) && t <= new Date(to).setHours(23, 59, 59, 999);
};
const severityKey = (raw?: string) => {
  const s = (raw ?? '').trim().toUpperCase();
  if (s.startsWith('CRIT')) return 'critical';
  if (s.startsWith('HIGH') || s.startsWith('ELEV') || s.startsWith('ÉLEV')) return 'high';
  if (s.startsWith('MED') || s.startsWith('MOY')) return 'medium';
  return 'low';
};

/** On-demand claims report: period, filters and grouping, then the result with CSV and PDF export (as for the CAPA sub-actions). */
export default function AdminClaimsReportGenerator() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Criteria>(defaultCriteria);
  const [report, setReport] = useState<Generated | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deptByUser, setDeptByUser] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const list = await qualityAnalysisService.getClaims(undefined, accessToken);
      setClaims((Array.isArray(list) ? list : []).filter((c) => resolveClaimStatus(c) !== 'DRAFT'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('reportClaims.gen.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  // the department of a claim: the one of its assignee, else of its creator (same rule as the rest of the console)
  useEffect(() => {
    if (!accessToken) return;
    getUsersForAssignment(accessToken).then((res) => {
      const payload: any = res.data;
      const list: any[] = Array.isArray(payload) ? payload : payload?.data ?? payload?.items ?? payload?.['$values'] ?? [];
      const map: Record<string, string> = {};
      for (const u of list) {
        const id = String(u.id ?? u.Id ?? '').toLowerCase();
        const dept = String(u.department ?? u.Department ?? u.departmentName ?? u.DepartmentName ?? '').trim();
        if (id && dept) map[id] = dept;
      }
      setDeptByUser(map);
    }).catch(() => setDeptByUser({}));
  }, [accessToken]);

  const departmentOf = (c: Claim) =>
    deptByUser[String(c.assignedToId ?? '').toLowerCase()] || deptByUser[String(c.createdById ?? '').toLowerCase()] || '';
  const departments = Array.from(new Set(claims.map(departmentOf).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const responsibles = Array.from(new Set(claims.map((c) => c.assignedToName).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));

  const sevLabel = (raw?: string) => t(`claimStatus.severity${{ critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }[severityKey(raw)]}`);
  const statusLabel = (c: Claim) => t(`claimStatus.${({
    OUVERTE: 'open', ASSIGNED: 'assigned', EN_ANALYSE: 'inAnalysis', PENDING_VALIDATION: 'pendingValidation',
    VALIDATED: 'validated', REJECTED: 'rejected', CLOTUREE: 'closed',
  } as Record<string, string>)[resolveClaimStatus(c)] ?? 'open'}`);
  const rowState = (r: Row) => (r.closed ? t('actionsReport.statusOpt.closed') : r.late ? t('actionsReport.statusOpt.late') : t('actionsReport.statusOpt.open'));

  const build = (criteria: Criteria): Generated => {
    const today = new Date().setHours(0, 0, 0, 0);
    const term = criteria.q.trim().toLowerCase();
    const rows: Row[] = claims
      .map((claim) => {
        const closed = resolveClaimStatus(claim) === 'CLOTUREE';
        return { claim, closed, late: !closed && !!claim.deadline && new Date(claim.deadline).getTime() < today };
      })
      .filter(({ claim, closed, late }) => {
        const dateIso = criteria.dateField === 'created' ? claim.createdAt : criteria.dateField === 'deadline' ? claim.deadline : claim.detectionDate;
        if (!inRange(dateIso, criteria.from, criteria.to)) return false;
        if (criteria.status === 'open' && closed) return false;
        if (criteria.status === 'closed' && !closed) return false;
        if (criteria.status === 'late' && !late) return false;
        if (criteria.department !== 'all' && departmentOf(claim) !== criteria.department) return false;
        if (criteria.responsible === '__unassigned__' && claim.assignedToName) return false;
        if (criteria.responsible !== 'all' && criteria.responsible !== '__unassigned__' && claim.assignedToName !== criteria.responsible) return false;
        if (criteria.severity !== 'all' && severityKey(claim.severity) !== criteria.severity) return false;
        if (!term) return true;
        return [claim.title, claim.clientId, claim.defectType, claim.lotNumber, claim.assignedToName]
          .some((v) => String(v ?? '').toLowerCase().includes(term));
      });

    const groupOf = (r: Row): { key: string; label: string } => {
      const c = r.claim;
      switch (criteria.groupBy) {
        case 'responsible': return { key: c.assignedToId || '—', label: c.assignedToName || t('reportClaims.gen.unassigned') };
        case 'status': return { key: resolveClaimStatus(c), label: statusLabel(c) };
        case 'defect': return { key: c.defectType || '—', label: c.defectType || '—' };
        case 'client': return { key: c.clientId || '—', label: c.clientId || '—' };
        case 'department': return { key: departmentOf(c) || '—', label: departmentOf(c) || t('reportClaims.noDepartment') };
        default: return { key: severityKey(c.severity), label: sevLabel(c.severity) };
      }
    };
    const map = new Map<string, GroupRow>();
    for (const r of rows) {
      const g = groupOf(r);
      const row = map.get(g.key) ?? { key: g.key, label: g.label, total: 0, closed: 0, late: 0, open: 0, rate: 0, rows: [] };
      row.total += 1;
      if (r.closed) row.closed += 1; else row.open += 1;
      if (r.late) row.late += 1;
      row.rows.push(r);
      map.set(g.key, row);
    }
    const groups = Array.from(map.values())
      .map((g) => ({ ...g, rate: g.total ? Math.round((g.closed / g.total) * 100) : 0 }))
      .sort((a, b) => b.late - a.late || b.total - a.total);
    const closed = rows.filter((r) => r.closed).length;
    return {
      generatedAt: new Date().toISOString(),
      criteria,
      groups,
      totals: { total: rows.length, closed, late: rows.filter((r) => r.late).length, open: rows.length - closed, groups: groups.length, rate: rows.length ? Math.round((closed / rows.length) * 100) : 0 },
    };
  };

  const generate = () => {
    if (draft.from > draft.to) { setError(t('actionsReport.invalidRange')); return; }
    setError(null);
    setGenerating(true);
    setExpanded(null);
    window.setTimeout(() => {
      const prev = previousPeriod(draft.from, draft.to);
      setReport({ ...build(draft), previous: build({ ...draft, from: prev.from, to: prev.to }).totals });
      setGenerating(false);
    }, 180);
  };

  const applyPreset = (p: '7d' | '1m' | '3m' | '1y' | 'ytd') => {
    const to = new Date();
    const from = new Date();
    if (p === '7d') from.setDate(from.getDate() - 7);
    else if (p === '1m') from.setMonth(from.getMonth() - 1);
    else if (p === '3m') from.setMonth(from.getMonth() - 3);
    else if (p === '1y') from.setFullYear(from.getFullYear() - 1);
    else { from.setMonth(0); from.setDate(1); }
    setDraft((d) => ({ ...d, from: toDateInput(from), to: toDateInput(to) }));
  };

  const exportCsv = () => {
    if (!report) return;
    const header = ['group', 'claim', 'client', 'defect', 'severity', 'status', 'detection', 'deadline', 'responsible', 'state'];
    const rows = report.groups.flatMap((g) => g.rows.map((r) => [
      g.label, r.claim.title, r.claim.clientId, r.claim.defectType, sevLabel(r.claim.severity), statusLabel(r.claim),
      r.claim.detectionDate || '', r.claim.deadline || '', r.claim.assignedToName || '', rowState(r),
    ]));
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header.join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `claims-report-${report.criteria.from}_${report.criteria.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const summaryOf = (r: Generated) =>
    buildReportSummary(t, t('reportSummary.nounClaims'), r.totals, r.previous, r.groups.map((g) => ({ label: g.label, total: g.total, late: g.late, rate: g.rate })));

  const exportPdf = () => {
    if (!report) return;
    const c = report.criteria;
    exportCapaPdf({
      title: t('reportClaims.title'),
      subtitle: t('reportClaims.gen.generatedSubtitle'),
      filename: `claims-report-${c.from}_${c.to}`,
      meta: [
        `${t('actionsReport.generatedAt')}: ${new Date(report.generatedAt).toLocaleString()}`,
        `${t('actionsReport.from')}: ${c.from} → ${t('actionsReport.to')}: ${c.to}`,
        `${t('actionsReport.groupBy')}: ${t(`reportClaims.gen.by.${c.groupBy}`)} · ${t('actionsReport.status')}: ${t(`actionsReport.statusOpt.${c.status}`)}`,
        [
          c.department !== 'all' ? `${t('planDetail.department')}: ${c.department}` : '',
          c.responsible !== 'all' ? `${t('reportClaims.gen.colResponsible')}: ${c.responsible === '__unassigned__' ? t('reportClaims.gen.unassigned') : c.responsible}` : '',
          c.severity !== 'all' ? `${t('reportClaims.gen.colSeverity')}: ${t(`claimStatus.severity${{ critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }[c.severity as 'critical']}`)}` : '',
          c.q ? `${t('actionsReport.search')}: ${c.q}` : '',
        ].filter(Boolean).join(' · '),
        `${t('reportClaims.cardAll')}: ${report.totals.total} · ${t('actionsReport.kpiClosed')}: ${report.totals.closed} · ${t('actionsReport.kpiLate')}: ${report.totals.late} · ${t('reportClaims.colRate')}: ${report.totals.rate}%`,
      ].filter(Boolean),
      summary: [
        ...summaryOf(report),
        '',
        ...report.groups.map((g) => `${g.label}: ${g.total} (${t('actionsReport.kpiClosed').toLowerCase()} ${g.closed}, ${t('actionsReport.kpiLate').toLowerCase()} ${g.late}, ${g.rate}%)`),
      ].join('\n'),
      columns: [
        { key: 'group', label: t('actionsReport.colGroup') },
        { key: 'claim', label: t('reportClaims.gen.colClaim') },
        { key: 'client', label: t('reportClaims.gen.colClient') },
        { key: 'defect', label: t('reportClaims.gen.colDefect') },
        { key: 'severity', label: t('reportClaims.gen.colSeverity') },
        { key: 'status', label: t('actionsReport.status') },
        { key: 'deadline', label: t('reportClaims.gen.colDeadline') },
        { key: 'responsible', label: t('reportClaims.gen.colResponsible') },
        { key: 'state', label: t('reportClaims.gen.colState') },
      ],
      rows: report.groups.flatMap((g) => g.rows.map((r) => ({
        group: g.label,
        claim: r.claim.title,
        client: r.claim.clientId,
        defect: r.claim.defectType,
        severity: sevLabel(r.claim.severity),
        status: statusLabel(r.claim),
        deadline: fmtDate(r.claim.deadline),
        responsible: r.claim.assignedToName || t('reportClaims.gen.unassigned'),
        state: rowState(r),
      }))),
    });
  };

  const summaryLines = report ? summaryOf(report) : [];

  const selectCls = 'px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#000168]/25';

  if (loading) return <div className="mt-8"><ListSkeleton rows={6} /></div>;

  return (
    <div className="text-slate-900 mt-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-[#000168] m-0">{t('reportClaims.gen.sectionTitle')}</h2>
          <p className="text-sm text-slate-500 mt-1 mb-0">{t('reportClaims.gen.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => void load()} className={capaBtnSecondary}>{t('dashboard.refresh')}</button>
          <button type="button" disabled={!report} onClick={exportCsv} className={`${capaBtnSecondary} disabled:opacity-40`}>{t('actionsReport.exportCsv')}</button>
          <button type="button" disabled={!report} onClick={exportPdf} className={`${capaBtnSecondary} disabled:opacity-40`}>{t('common.exportPdf')}</button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 m-0">{t('actionsReport.criteriaTitle')}</h3>
            <p className="text-xs text-slate-500 mt-0.5 mb-0">{t('actionsReport.criteriaHint')}</p>
          </div>
          <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-slate-50 border border-slate-200">
            {(['7d', '1m', '3m', '1y', 'ytd'] as const).map((p) => (
              <button key={p} type="button" onClick={() => applyPreset(p)} className="px-2.5 py-1 text-[11px] font-semibold rounded-lg text-slate-600 hover:bg-white hover:text-[#000168]">
                {t(`actionsReport.preset.${p}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            {t('actionsReport.from')}
            <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={selectCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            {t('actionsReport.to')}
            <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={selectCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            {t('actionsReport.dateField')}
            <select value={draft.dateField} onChange={(e) => setDraft({ ...draft, dateField: e.target.value as DateField })} className={selectCls}>
              <option value="detection">{t('reportClaims.gen.dateDetection')}</option>
              <option value="created">{t('actionsReport.dateCreated')}</option>
              <option value="deadline">{t('actionsReport.dateDeadline')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            {t('actionsReport.groupBy')}
            <select value={draft.groupBy} onChange={(e) => setDraft({ ...draft, groupBy: e.target.value as GroupBy })} className={selectCls}>
              {(['severity', 'department', 'responsible', 'status', 'defect', 'client'] as const).map((g) => <option key={g} value={g}>{t(`reportClaims.gen.by.${g}`)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            {t('actionsReport.status')}
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as StatusFilter })} className={selectCls}>
              {(['all', 'open', 'closed', 'late'] as const).map((s) => <option key={s} value={s}>{t(`actionsReport.statusOpt.${s}`)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            {t('planDetail.department')}
            <select value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} className={selectCls}>
              <option value="all">{t('audit.allDepartments')}</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            {t('reportClaims.gen.colResponsible')}
            <select value={draft.responsible} onChange={(e) => setDraft({ ...draft, responsible: e.target.value })} className={selectCls}>
              <option value="all">{t('reportClaims.gen.allResponsibles')}</option>
              <option value="__unassigned__">{t('reportClaims.gen.unassigned')}</option>
              {responsibles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            {t('reportClaims.gen.colSeverity')}
            <select value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value })} className={selectCls}>
              <option value="all">{t('reportClaims.gen.allSeverities')}</option>
              {(['critical', 'high', 'medium', 'low'] as const).map((s) => (
                <option key={s} value={s}>{t(`claimStatus.severity${{ critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }[s]}`)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-3">
            {t('actionsReport.search')}
            <input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder={t('reportClaims.gen.searchPh')} className={selectCls} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-slate-100">
          <button type="button" onClick={generate} disabled={generating || claims.length === 0} className="px-4 py-2.5 text-sm font-semibold rounded-lg text-white disabled:opacity-50" style={{ background: COFICAB }}>
            {generating ? t('actionsReport.generating') : t('actionsReport.generate')}
          </button>
          <button type="button" onClick={() => { setDraft(defaultCriteria()); setReport(null); setExpanded(null); setError(null); }} className="px-3 py-2.5 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
            {t('common.reset')}
          </button>
          <span className="text-xs text-slate-400 ml-auto">{t('reportClaims.gen.sourceCount', { count: claims.length })}</span>
        </div>
      </div>

      {!report && !generating && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-14 text-center">
          <div className="text-sm font-semibold text-slate-700">{t('actionsReport.awaitTitle')}</div>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{t('actionsReport.awaitHint')}</p>
        </div>
      )}

      {generating && (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#000168] border-t-transparent rounded-full animate-spin" />
          <div className="text-sm text-slate-600">{t('actionsReport.generating')}</div>
        </div>
      )}

      {report && !generating && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="text-xs text-slate-500">
              {t('actionsReport.generatedAt')}: <span className="font-semibold text-slate-700">{new Date(report.generatedAt).toLocaleString()}</span>
              {' · '}{report.criteria.from} → {report.criteria.to}{' · '}{t(`reportClaims.gen.by.${report.criteria.groupBy}`)}
            </div>
            <button type="button" onClick={generate} className="text-xs font-semibold text-[#000168] hover:underline">{t('actionsReport.regenerate')}</button>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 mb-5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-[#000168] mb-1.5">{t('reportSummary.title')}</div>
            <ul className="m-0 pl-4 space-y-1 text-sm text-slate-700">
              {summaryLines.map((line) => <li key={line}>{line}</li>)}
            </ul>
            {report.previous && <p className="text-[11px] text-slate-500 mt-2 mb-0">{t('reportSummary.comparedWith', { from: previousPeriod(report.criteria.from, report.criteria.to).from, to: previousPeriod(report.criteria.from, report.criteria.to).to })}</p>}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-5">
            {[
              { label: t('reportClaims.cardAll'), value: report.totals.total },
              { label: t('actionsReport.kpiClosed'), value: report.totals.closed },
              { label: t('actionsReport.kpiLate'), value: report.totals.late },
              { label: t('actionsReport.kpiOpen'), value: report.totals.open },
              { label: t('reportClaims.colRate'), value: `${report.totals.rate}%` },
            ].map((s) => (
              <div key={s.label} className="rounded-xl px-3 py-3 text-white" style={{ background: COFICAB }}>
                <div className="text-2xl font-bold tabular-nums">{s.value}</div>
                <div className="text-[10px] uppercase tracking-wide text-white/70 font-semibold mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800 m-0">{t('actionsReport.resultTitle')} · {report.totals.groups} {t('actionsReport.kpiGroups').toLowerCase()}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-semibold">{t('actionsReport.colGroup')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reportClaims.colClaims')}</th>
                    <th className="px-4 py-3 font-semibold">{t('actionsReport.kpiClosed')}</th>
                    <th className="px-4 py-3 font-semibold">{t('actionsReport.kpiLate')}</th>
                    <th className="px-4 py-3 font-semibold">{t('reportClaims.colRate')}</th>
                    <th className="px-4 py-3 font-semibold text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.groups.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">{t('reportClaims.empty')}</td></tr>
                  ) : report.groups.map((g) => (
                    <React.Fragment key={g.key}>
                      <tr className="border-t border-slate-100 hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-medium text-slate-900">{g.label}</td>
                        <td className="px-4 py-3 tabular-nums">{g.total}</td>
                        <td className="px-4 py-3 tabular-nums text-emerald-700">{g.closed}</td>
                        <td className="px-4 py-3 tabular-nums text-rose-600">{g.late}</td>
                        <td className="px-4 py-3 min-w-[120px]">
                          <div className="text-xs text-slate-500 mb-1 tabular-nums">{g.rate}%</div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${g.rate}%`, background: COFICAB }} /></div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" className="text-xs font-semibold text-[#000168] hover:underline" onClick={() => setExpanded(expanded === g.key ? null : g.key)}>
                            {expanded === g.key ? t('actionsReport.hide') : t('actionsReport.details')}
                          </button>
                        </td>
                      </tr>
                      {expanded === g.key && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="space-y-2">
                              {g.rows.slice(0, 100).map((r) => (
                                <div key={r.claim.id} className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-slate-900 truncate">{r.claim.title}</div>
                                    <div className="text-[11px] text-slate-500 truncate">
                                      {r.claim.clientId}{' · '}{r.claim.defectType}{' · '}{sevLabel(r.claim.severity)}{' · '}{fmtDate(r.claim.deadline)}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.closed ? 'bg-emerald-50 text-emerald-700' : r.late ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}`}>{rowState(r)}</span>
                                    <button type="button" className="text-xs font-semibold text-[#000168] hover:underline" onClick={() => navigate(`/pages/front/quality-analyses?claimId=${r.claim.id}`)}>
                                      {t('qualityHistory.open')}
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {g.rows.length > 100 && <p className="text-[11px] text-slate-500 m-0">{t('reportClaims.gen.firstOnly', { shown: 100, total: g.rows.length })}</p>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
