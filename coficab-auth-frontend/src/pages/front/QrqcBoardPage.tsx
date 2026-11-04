import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ACTION_PLAN_API_URL } from '../../config/apiEnv';
import { useAuth } from '../../context/AuthContext';
import { defectLabel } from '../../utils/defectLabel';

type Problem = {
  claimId: string; reference?: string | null; title: string; defectType: string; severity: string; line: string; lotNumber: string;
  statusCode: string; isInternal: boolean; detectedAt: string; minutesOpen: number; level: number;
  hasPhoto: boolean; hasLot: boolean; hasRootCause: boolean; hasCorrective: boolean;
};
type Line = { line: string; state: 'green' | 'orange' | 'red'; open: number; escalated: number };
type Board = {
  generatedAt: string; scope: 'internal' | 'all'; escalationMinutes: number[];
  kpis: { open: number; escalated: number; newToday: number; closureRate30d: number | null };
  lines: Line[]; problems: Problem[];
};

const REFRESH_MS = 30_000;
const LIGHT: Record<Line['state'], string> = { green: '#639922', orange: '#EF9F27', red: '#E24B4A' };
const LEVEL_COLOR = ['#EF9F27', '#D85A30', '#E24B4A'];

const duration = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;

/**
 * The QRQC board of the workshop: the problems that are open, by production line, with the time they have been open and the level that has
 * to deal with them. It only reads the claims, their analyses and their action plans: nothing is typed twice. It refreshes itself, keeps the
 * last data when the network drops, and prints as a one-page sheet for the morning point.
 */
export default function QrqcBoardPage() {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [scope, setScope] = useState<'internal' | 'all'>('internal');
  const [board, setBoard] = useState<Board | null>(null);
  const [offline, setOffline] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lineFilter, setLineFilter] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await axios.get<Board>(`${ACTION_PLAN_API_URL}/qrqc/board`, { headers: { Authorization: `Bearer ${accessToken}` }, params: { scope } });
      setBoard(res.data);
      setOffline(false);
    } catch {
      // the last data stay on screen: a dropped network must not blank the board during the meeting
      setOffline(true);
    }
  }, [accessToken, scope]);

  useEffect(() => {
    void load();
    timer.current = window.setInterval(() => { void load(); }, REFRESH_MS);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [load]);

  const levelLabel = (level: number) => t(`qrqc.level.${level}`);
  const problems = useMemo(() => (board?.problems ?? []).filter((p) => !lineFilter || p.line === lineFilter), [board, lineFilter]);

  const pareto = useMemo(() => {
    const counts: Record<string, number> = {};
    problems.forEach((p) => { counts[p.defectType] = (counts[p.defectType] ?? 0) + 1; });
    const top = Object.keys(counts).map((name) => ({ name, n: counts[name] })).sort((a, b) => b.n - a.n).slice(0, 4);
    const max = top[0]?.n ?? 1;
    return top.map((d) => ({ ...d, pct: Math.round((d.n / max) * 100) }));
  }, [problems]);

  const exportSap = async () => {
    if (!accessToken) return;
    setExporting(true);
    try {
      const res = await axios.get(`${ACTION_PLAN_API_URL}/qrqc/export`, { headers: { Authorization: `Bearer ${accessToken}` }, params: { scope }, responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qrqc-sap-qm-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const chip = (ok: boolean, yes: string, no: string) => (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{ok ? yes : no}</span>
  );

  return (
    <div className="qrqc w-full max-w-[1200px] mx-auto pb-10">
      <style>{`@media print { .qrqc-noprint { display: none !important; } .qrqc { max-width: none; } }`}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-bold text-[#0d1340] m-0">{t('qrqc.title')}</h1>
          <p className="text-xs text-slate-500 mt-1 mb-0">
            {board ? t('qrqc.updated', { time: new Date(board.generatedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) }) : t('qrqc.loading')}
          </p>
        </div>
        <div className="qrqc-noprint flex flex-wrap items-center gap-2">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${offline ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
            {offline ? t('qrqc.offline') : t('qrqc.online')}
          </span>
          <div className="inline-flex p-1 rounded-xl bg-slate-50 border border-slate-200" role="group" aria-label={t('qrqc.scopeLabel')}>
            {(['internal', 'all'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={scope === s} onClick={() => { setScope(s); setLineFilter(null); }}
                className={`px-3 py-1 text-xs font-semibold rounded-lg ${scope === s ? 'bg-white shadow-sm text-[#000168]' : 'text-slate-500'}`}>
                {t(`qrqc.scope.${s}`)}
              </button>
            ))}
          </div>
          <button type="button" className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white" onClick={() => window.print()}>{t('qrqc.print')}</button>
          <button type="button" className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white disabled:opacity-50" disabled={exporting} onClick={() => void exportSap()} title={t('qrqc.exportHint')}>
            {t('qrqc.export')}
          </button>
        </div>
      </div>

      {board && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
            {board.lines.map((l) => {
              const active = lineFilter === l.line;
              return (
                <button key={l.line} type="button" onClick={() => setLineFilter(active ? null : l.line)} aria-pressed={active}
                  className={`text-left rounded-xl bg-white border px-3 py-2.5 ${active ? 'border-[#000168]' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: LIGHT[l.state] }} /><span className="text-sm font-semibold text-slate-800">{l.line}</span></div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{l.open === 0 ? t('qrqc.nothing') : t('qrqc.openCount', { count: l.open })}</div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
            {[
              { label: t('qrqc.kpi.open'), value: board.kpis.open },
              { label: t('qrqc.kpi.newToday'), value: board.kpis.newToday },
              { label: t('qrqc.kpi.escalated'), value: board.kpis.escalated, danger: board.kpis.escalated > 0 },
              { label: t('qrqc.kpi.closure'), value: board.kpis.closureRate30d == null ? '—' : `${board.kpis.closureRate30d} %` },
            ].map((k) => (
              <div key={k.label} className="rounded-xl bg-slate-50 px-4 py-3">
                <div className="text-[11px] text-slate-500">{k.label}</div>
                <div className={`text-2xl font-semibold tabular-nums ${k.danger ? 'text-rose-600' : 'text-slate-900'}`}>{k.value}</div>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h2 className="text-sm font-semibold text-slate-800 m-0">{t('qrqc.problems')}{lineFilter ? ` · ${lineFilter}` : ''}</h2>
                <div className="text-[11px] text-slate-500">{t('qrqc.levels')}</div>
              </div>
              {problems.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center m-0">{t('qrqc.none')}</p>
              ) : (
                <ul className="m-0 p-0 list-none divide-y divide-slate-100">
                  {problems.map((p) => (
                    <li key={p.claimId} className="flex flex-wrap items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {p.title} <span className="text-[11px] font-normal text-slate-500">· {p.line} · {t('qrqc.lot')} {p.lotNumber || '—'} · {defectLabel(p.defectType)}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {chip(p.hasLot, t('qrqc.lotOk'), t('qrqc.lotMissing'))}
                          {chip(p.hasRootCause, t('qrqc.rootCauseOk'), t('qrqc.rootCauseMissing'))}
                          {chip(p.hasCorrective, t('qrqc.correctiveOk'), t('qrqc.correctiveMissing'))}
                          {!p.isInternal && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{t('qrqc.customerClaim')}</span>}
                        </div>
                        <div className="flex gap-1 mt-2 max-w-[220px]" aria-label={levelLabel(p.level)}>
                          {[1, 2, 3].map((n) => <span key={n} className="flex-1 h-1.5 rounded-sm" style={{ background: n <= p.level ? LEVEL_COLOR[p.level - 1] : '#e2e8f0' }} />)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold tabular-nums" style={{ color: p.level >= 3 ? '#E24B4A' : undefined }}>{duration(p.minutesOpen)}</div>
                        <div className="text-[11px] text-slate-500">{t('qrqc.levelShort', { n: p.level })} · {levelLabel(p.level)}</div>
                        <button type="button" className="qrqc-noprint mt-1 text-xs font-semibold text-[#000168] hover:underline" onClick={() => navigate(`/admin/claims/list?q=${encodeURIComponent(p.reference || p.title)}`)}>{t('qrqc.open')}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-slate-800 m-0 mb-3">{t('qrqc.pareto')}</h2>
                {pareto.length === 0 ? <p className="text-xs text-slate-400 m-0">{t('qrqc.none')}</p> : pareto.map((d) => (
                  <div key={d.name} className="mb-2.5">
                    <div className="flex justify-between text-xs text-slate-700"><span className="truncate">{defectLabel(d.name)}</span><span className="tabular-nums">{d.n}</span></div>
                    <div className="h-2 rounded bg-blue-50 mt-1"><div className="h-2 rounded bg-blue-500" style={{ width: `${d.pct}%` }} /></div>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-slate-800 m-0 mb-2">{t('qrqc.closureRule')}</h2>
                <ol className="m-0 pl-4 text-xs text-slate-600 space-y-1">
                  <li>{t('qrqc.rule1')}</li>
                  <li>{t('qrqc.rule2')}</li>
                  <li>{t('qrqc.rule3')}</li>
                </ol>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 mt-4">{t('qrqc.genbutsu')}</p>
        </>
      )}
    </div>
  );
}
