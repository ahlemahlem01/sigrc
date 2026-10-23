import { activityStatusLabel } from '../../../../utils/activityStatus';
import { useTranslation } from 'react-i18next';
import i18n from '../../../../i18n';
import type { HrReportEmployeePayload } from '../../../../services/hrReportService';
import { SKILL_LEVEL_LABEL, type SkillLevel } from '../../../../services/employeePerformanceService';

type Props = {
  rows: HrReportEmployeePayload[];
};

const NAVY = '#000168';
const LINE = '#e4e8f2';

const levelLabel = (raw?: string) => {
  const k = String(raw ?? '').toLowerCase() as SkillLevel;
  return SKILL_LEVEL_LABEL[k] ?? raw ?? '—';
};

const workloadLabel = (w?: string) => {
  if (w === 'high') return i18n.t('hrReports.loadHigh');
  if (w === 'medium') return i18n.t('hrReports.loadMedium');
  if (w === 'low') return i18n.t('hrReports.loadLow');
  return w || '—';
};

export default function ReportDetailTable({ rows }: Props) {
  const { t } = useTranslation();
  return (
    <section className="hrt">
      <style>{`
        .hrt {
          border: 1px solid ${LINE}; border-radius: 12px; background: #fff;
          padding: 16px 18px; overflow: hidden;
        }
        .hrt-title { margin: 0 0 4px; font-size: 14px; font-weight: 700; color: #0d1340; }
        .hrt-sub { margin: 0 0 12px; font-size: 12px; color: #64748b; }
        .hrt-scroll { overflow-x: auto; }
        .hrt table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 920px; }
        .hrt th {
          text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 650;
          color: #64748b; text-transform: uppercase; letter-spacing: .04em;
          border-bottom: 1px solid ${LINE}; background: #f8f9fc; white-space: nowrap;
        }
        .hrt td {
          padding: 10px 12px; border-bottom: 1px solid #f0f2f8; color: #0d1340;
          vertical-align: top;
        }
        .hrt tr:last-child td { border-bottom: none; }
        .hrt-name { font-weight: 650; }
        .hrt-muted { color: #64748b; font-size: 11.5px; margin-top: 2px; }
        .hrt-empty { padding: 24px; text-align: center; color: #64748b; font-size: 13px; }
        .hrt-pill {
          display: inline-flex; align-items: center; height: 22px; padding: 0 8px;
          border-radius: 6px; font-size: 11px; font-weight: 650; background: #eef2ff; color: ${NAVY};
        }
      `}</style>

      <h2 className="hrt-title">{t('hrReports.detailTitle')}</h2>
      <p className="hrt-sub">{t('hrReports.detailSub')}</p>

      {rows.length === 0 ? (
        <div className="hrt-empty">{t('hrReports.detailEmpty')}</div>
      ) : (
        <div className="hrt-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('hrReports.colEmployee')}</th>
                <th>{t('hrReports.colActivityPlans')}</th>
                <th>{t('hrReports.colActivityClaims')}</th>
                <th>{t('hrReports.colClaims')}</th>
                <th>{t('hrReports.colPlans')}</th>
                <th>{t('hrReports.colCapacity')}</th>
                <th>{t('hrReports.colToValidate')}</th>
                <th>{t('comparator.late')}</th>
                <th>{t('comparator.load')}</th>
                <th>{t('skills.radarName')}</th>
                <th>{t('employeesAdmin.tabBadges')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const levels = Object.entries(r.competencyLevels || {})
                  .map(([k, v]) => `${k}: ${levelLabel(v)}`)
                  .join(' · ');
                return (
                  <tr key={r.userId}>
                    <td>
                      <div className="hrt-name">{r.fullName}</div>
                      <div className="hrt-muted">
                        {[r.department, r.role].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td>
                      <span className="hrt-pill">{activityStatusLabel(r.plansActivity ?? r.activityStatus)}</span>
                    </td>
                    <td>
                      <span className="hrt-pill">{activityStatusLabel(r.claimsActivity ?? r.activityStatus)}</span>
                    </td>
                    <td>{r.claimsOpen == null ? r.activeDossiers : <>{r.claimsOpen} <span className="hrt-muted">· {r.claimsClosureRate ?? 0}%</span></>}</td>
                    <td>{r.plansOpen == null ? '—' : <>{r.plansOpen} <span className="hrt-muted">· {r.plansClosureRate ?? 0}%</span></>}</td>
                    <td>{r.remainingCapacity}</td>
                    <td>{r.actionsToValidate ?? '—'}</td>
                    <td>{r.overdueCount}</td>
                    <td>{workloadLabel(r.workload)}</td>
                    <td>
                      <div className="hrt-muted" style={{ maxWidth: 220 }}>
                        {levels || '—'}
                      </div>
                    </td>
                    <td>
                      <div className="hrt-muted" style={{ maxWidth: 160 }}>
                        {(r.badges || []).slice(0, 3).join(', ') || '—'}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
