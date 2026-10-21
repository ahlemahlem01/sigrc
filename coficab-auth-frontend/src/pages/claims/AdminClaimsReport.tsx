import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useOrganizationScope } from '../../context/OrganizationScopeContext';
import { fetchClaimsReport, type ClaimsReport, type ClaimsReportGroup } from '../../services/capaIndicatorsService';
import { CapaPageHeader } from '../../components/capa/CapaAdminUi';
import { ExportSplit } from '../../components/ExportSplit';
import { PageSkeleton } from '../../components/TableSkeleton';

const COFICAB = '#000168';
const btn =
  'inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-indigo-200';
const btnPrimary =
  'inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#000168] text-white border border-[#000168] hover:bg-[#00009e]';

type HelpId = 'all' | 'critical' | 'high' | 'others';

const rate = (g: { total: number; closed: number }) => (g.total ? Math.round((g.closed / g.total) * 100) : 0);

/** The claims counterpart of the plans report: cards, closure rates, department table and what needs attention. */
export default function AdminClaimsReport() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const { param: scopeParam } = useOrganizationScope();
  const navigate = useNavigate();
  const [report, setReport] = useState<ClaimsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openHelp, setOpenHelp] = useState<HelpId | null>(null);
  const [attentionOpen, setAttentionOpen] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchClaimsReport(accessToken, scopeParam));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('reportClaims.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, scopeParam, t]);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const by = (k: string) => report?.bySeverity.find((g) => g.key === k);
    const sum = (list: (ClaimsReportGroup | undefined)[]): ClaimsReportGroup => {
      const items = list.filter(Boolean) as ClaimsReportGroup[];
      return {
        key: 'others', name: 'others',
        total: items.reduce((n, g) => n + g.total, 0),
        closed: items.reduce((n, g) => n + g.closed, 0),
        open: items.reduce((n, g) => n + g.open, 0),
        late: items.reduce((n, g) => n + g.late, 0),
        departments: Array.from(new Set(items.flatMap((g) => g.departments))).sort(),
      };
    };
    return {
      all: report?.overall,
      critical: by('critical'),
      high: by('high'),
      others: sum([by('medium'), by('low')]),
    };
  }, [report]);

  const noDepartment = t('reportClaims.noDepartment');
  const departments = useMemo(
    () => (report?.byDepartment ?? []).map((d) => ({ ...d, name: d.name || noDepartment })),
    [report, noDepartment],
  );

  const attention = useMemo(() => {
    const items: { key: string; label: string; total: number; late: number; rate: number; depts: string[] }[] = [];
    // worth a look: at least half of the open claims are late (and not just a couple)
    const share = (g: ClaimsReportGroup) => (g.open ? Math.round((g.late / g.open) * 100) : 0);
    const worrying = (g: ClaimsReportGroup) => g.late >= 5 && share(g) >= 50;
    for (const d of departments) {
      if (worrying(d)) items.push({ key: `dept-${d.name}`, label: d.name, total: d.total, late: d.late, rate: share(d), depts: [d.name] });
    }
    for (const d of report?.byDefect ?? []) {
      if (worrying(d)) items.push({ key: `defect-${d.name}`, label: d.name, total: d.total, late: d.late, rate: share(d), depts: d.departments });
    }
    return items.sort((a, b) => b.rate - a.rate || b.late - a.late);
  }, [departments, report]);

  if (loading && !report) return <PageSkeleton figures={4} panels={2} />;

  const cards: { id: HelpId; title: string; g: ClaimsReportGroup | undefined; color: string }[] = [
    { id: 'all', title: t('reportClaims.cardAll'), g: groups.all, color: '#3b82f6' },
    { id: 'critical', title: t('claimStatus.severityCritical'), g: groups.critical, color: '#f43f5e' },
    { id: 'high', title: t('claimStatus.severityHigh'), g: groups.high, color: '#f59e0b' },
    { id: 'others', title: t('reportClaims.cardOthers'), g: groups.others, color: '#10b981' },
  ];

  return (
    <div className="text-slate-900 max-w-7xl mx-auto">
      <CapaPageHeader
        eyebrow={t('reportClaims.eyebrow')}
        title={t('reportClaims.title')}
        subtitle={t('reportClaims.subtitle')}
        actions={
          <>
            <ExportSplit
              className={btn}
              label={t('reportClaims.export')}
              filename="report-claims"
              getTable={() => ({
                columns: [t('planDetail.department'), t('reportClaims.colClaims'), t('reportClaims.colClosed'), t('reportClaims.colOpen'), t('reportClaims.colLate'), t('reportClaims.colRate')],
                rows: departments.map((d) => [d.name, String(d.total), String(d.closed), String(d.open), String(d.late), `${rate(d)}%`]),
              })}
            />
            <button type="button" onClick={() => navigate('/admin/claims/create')} className={btnPrimary}>+ {t('adminNav.newClaim')}</button>
          </>
        }
      />

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{c.title}</div>
            <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{c.g?.total ?? 0}</div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">{c.g?.closed ?? 0} {t('reportClaims.statusClosed')}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">{c.g?.open ?? 0} {t('reportClaims.statusOpen')}</span>
              {(c.g?.late ?? 0) > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700">{c.g?.late} {t('reportClaims.statusLate')}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800">{t('reportClaims.closureRate')}</h2>
          <span className="text-[11px] text-emerald-600 font-medium">{t('reportPlans.live')}</span>
        </div>
        {cards.map((c) => {
          const r = c.g ? rate(c.g) : 0;
          return (
            <div key={c.id} className="mb-3 last:mb-0">
              <div className="flex justify-between items-center gap-2 text-xs mb-1">
                <button type="button" className="font-medium text-slate-700 hover:text-[#000168]" onClick={() => setOpenHelp(openHelp === c.id ? null : c.id)}>{c.title}</button>
                <span className="tabular-nums text-slate-600">{r}% · {c.g?.closed ?? 0}/{c.g?.total ?? 0}</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${r}%`, background: c.color }} />
              </div>
              {openHelp === c.id && (
                <p className="mt-2 text-xs leading-relaxed text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{t(`reportClaims.help.${c.id}`)}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">{t('reportClaims.byDeptTitle')}</h2>
          <p className="text-xs text-slate-500 mt-1">{t('reportClaims.byDeptSub')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">{t('planDetail.department')}</th>
                <th className="px-4 py-3 font-semibold">{t('reportClaims.colClaims')}</th>
                <th className="px-4 py-3 font-semibold">{t('reportClaims.colOpen')}</th>
                <th className="px-4 py-3 font-semibold">{t('reportClaims.colClosed')}</th>
                <th className="px-4 py-3 font-semibold">{t('reportClaims.colLate')}</th>
                <th className="px-4 py-3 font-semibold">{t('reportClaims.colRate')}</th>
              </tr>
            </thead>
            <tbody>
              {departments.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">{t('reportClaims.empty')}</td></tr>
              ) : departments.map((d) => (
                <tr key={d.name} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{d.total}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{d.open}</td>
                  <td className="px-4 py-3 tabular-nums text-emerald-700">{d.closed}</td>
                  <td className="px-4 py-3 tabular-nums text-rose-700">{d.late}</td>
                  <td className="px-4 py-3 min-w-[140px]">
                    <div className="text-xs text-slate-500 mb-1 tabular-nums">{rate(d)}%</div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${rate(d)}%`, background: COFICAB }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 mt-6">
        <button type="button" className="w-full flex items-center justify-between gap-3 text-left" onClick={() => attention.length > 4 && setAttentionOpen((open) => !open)}>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{t('reportClaims.attentionTitle')}</h2>
            <p className="text-xs text-slate-500 mt-1">{t('reportClaims.attentionSub')}</p>
          </div>
          <span className="text-xs font-semibold tabular-nums text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">{attention.length}</span>
        </button>
        {(attention.length <= 4 || attentionOpen) && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {attention.length === 0 ? (
              <p className="text-sm text-slate-400 sm:col-span-2">{t('reportClaims.attentionEmpty')}</p>
            ) : attention.map((item) => (
              <div key={item.key} className="border border-rose-200 bg-rose-50/60 rounded-2xl p-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide truncate" title={item.label}>{item.label}</div>
                <div className="text-3xl font-bold text-rose-800 mt-1 tabular-nums">{item.rate}%</div>
                {item.depts.length > 0 && (
                  <div className="mt-2 text-[11px] text-slate-600" title={item.depts.join(', ')}>
                    {t('planDetail.department')} : <span className="font-semibold text-slate-800">{item.depts.slice(0, 3).join(', ')}{item.depts.length > 3 ? ` +${item.depts.length - 3}` : ''}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white text-slate-700">{t('reportClaims.claimsCount', { count: item.total })}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white text-rose-700">{t('reportClaims.lateCount', { count: item.late })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {attention.length > 4 && (
          <button type="button" className="mt-3 text-xs font-semibold text-[#000168] hover:underline" onClick={() => setAttentionOpen((open) => !open)}>
            {attentionOpen ? t('reportPlans.collapse') : t('reportPlans.showAll', { count: attention.length })}
          </button>
        )}
      </div>
    </div>
  );
}
