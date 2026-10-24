import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ClaimKpis } from '../../../services/qualityAnalysisService';
import { CLAIMS_ACCENT, COFICAB } from './dashPalette';
import { defectLabel } from '../../../utils/defectLabel';

const SHOWN = 8;

const card = 'rounded-xl bg-white shadow-sm px-4 py-4';

/** Which defects come back and which customers feel them: the quality side of the claims, over the last 12 months. */
export default function ClaimKpiSection({ kpis, loading }: { kpis: ClaimKpis | null; loading?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (loading && !kpis) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="h-64 rounded-xl bg-slate-100 animate-pulse" />
        <div className="h-64 rounded-xl bg-slate-100 animate-pulse" />
      </div>
    );
  }
  if (!kpis) return null;

  const defects = kpis.topDefects.slice(0, SHOWN);
  const maxDefects = Math.max(1, ...defects.map((d) => d.claims));
  const clients = kpis.ppmByClient.slice(0, SHOWN);
  const noProduction = clients.some((c) => c.ppm == null);

  const open = (term: string) => navigate(`/admin/claims/list?q=${encodeURIComponent(term)}`);

  return (
    <section className="mb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-base font-bold m-0" style={{ color: COFICAB.ink }}>{t('adminDashboard.claimKpis.title')}</h2>
        <p className="text-[11px] m-0" style={{ color: COFICAB.muted }}>
          {t('adminDashboard.claimKpis.period', { count: kpis.months })}
          {kpis.averageTreatmentDays != null && ` · ${t('adminDashboard.claimKpis.avgTreatment', { days: kpis.averageTreatmentDays, count: kpis.closedWithDates })}`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card} style={{ border: `1px solid ${COFICAB.line}` }}>
          <h3 className="text-sm font-bold text-slate-800 m-0">{t('adminDashboard.claimKpis.topDefects')}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{t('adminDashboard.claimKpis.topDefectsHint')}</p>
          {defects.length === 0 ? (
            <p className="text-sm text-slate-400 m-0">{t('adminDashboard.noData')}</p>
          ) : (
            <ul className="m-0 p-0 list-none space-y-2.5">
              {defects.map((d) => (
                <li key={d.defectType}>
                  <button type="button" onClick={() => open(d.defectType)} className="w-full text-left group" title={t('adminDashboard.claimKpis.openList')}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-800 truncate group-hover:underline">{defectLabel(d.defectType)}</span>
                      <span className="tabular-nums shrink-0 text-slate-600"><b className="text-slate-800">{d.claims}</b></span>
                    </div>
                    <div className="h-1.5 mt-1 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(100 * d.claims) / maxDefects}%`, background: CLAIMS_ACCENT }} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={card} style={{ border: `1px solid ${COFICAB.line}` }}>
          <h3 className="text-sm font-bold text-slate-800 m-0">{t('adminDashboard.claimKpis.ppmTitle')}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{t('adminDashboard.claimKpis.ppmHint')}</p>
          {clients.length === 0 ? (
            <p className="text-sm text-slate-400 m-0">{t('adminDashboard.noData')}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[11px] text-slate-500 border-b border-slate-100">
                  <th className="pb-2 font-semibold text-left">{t('adminDashboard.claimKpis.colClient')}</th>
                  <th className="pb-2 font-semibold text-right">{t('adminDashboard.claimKpis.colClaims')}</th>
                  <th className="pb-2 font-semibold text-right">{t('adminDashboard.claimKpis.colPpm')}</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.clientId} onClick={() => open(c.clientId)} className="border-t border-slate-50 cursor-pointer hover:bg-slate-50" title={t('adminDashboard.claimKpis.openList')}>
                    <td className="py-1.5 font-semibold text-slate-800">{c.clientId}</td>
                    <td className="py-1.5 tabular-nums text-right">{c.claims}</td>
                    <td className="py-1.5 tabular-nums text-right font-semibold" style={{ color: c.ppm == null ? '#94a3b8' : COFICAB.ink }}>
                      {c.ppm == null ? '—' : c.ppm.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {noProduction && <p className="text-[11px] text-slate-500 mt-2 mb-0">{t('adminDashboard.claimKpis.noProduction')}</p>}
        </div>
      </div>
    </section>
  );
}
