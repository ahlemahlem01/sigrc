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
        .hrt table { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 0; }
        .hrt th {
          text-align: left; padding: 10px 12px; font-size: 11px; font-weight: 650;
          color: #64748b; text-transform: uppercase; letter-spacing: .04em;
          border-bottom: 1px solid ${LINE}; background: #f8f9fc; line-height: 1.25;
        }
        .hrt td {
          padding: 8px 10px; border-bottom: 1px solid #f0f2f8; color: #0d1340;
          vertical-align: middle;
        }
        .hrt td.nw { white-space: nowrap; }
        .hrt th { padding: 8px 10px; }
        .hrt-line { display: flex; align-items: center; gap: 6px; }
        .hrt-line + .hrt-line { margin-top: 3px; }
        .hrt-k { width: 40px; font-size: 10.5px; color: #64748b; }
        .hrt-clip { max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
        .hrt-lv { display: inline-flex; flex-wrap: wrap; gap: 4px; max-width: 210px; }
        .hrt-lv span { white-space: nowrap; display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border-radius: 6px; font-size: 11px; font-weight: 650; }
        .hrt-lv .e { background: #dcfce7; color: #166534; }
        .hrt-lv .c { background: #dbeafe; color: #1e40af; }
        .hrt-lv .b { background: #f1f5f9; color: #475569; }
        .hrt tr:last-child td { border-bottom: none; }
        .hrt-name { font-weight: 650; }
        .hrt-muted { color: #64748b; font-size: 11.5px; margin-top: 2px; }
        .hrt-empty { padding: 24px; text-align: center; color: #64748b; font-size: 13px; }
        .hrt-pill {
          display: inline-flex; align-items: center; height: 22px; padding: 0 8px;
          border-radius: 6px; font-size: 11px; font-weight: 650; background: #eef2ff; color: ${NAVY}; white-space: nowrap;
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
                <th>{t('activityTracking.activity')}</th>
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
                const levels = Object.entries(r.competencyLevels || {});
                const count = (names: string[]) => levels.filter(([, v]) => names.includes(String(v).toLowerCase())).length;
                const expert = count(['expert']);
                const confirmed = count(['confirme', 'confirmé', 'confirmed']);
                const beginner = levels.length - expert - confirmed;
                const detail = levels.map(([k, v]) => `${k}: ${levelLabel(v)}`).join(' · ');
                const badges = r.badges || [];
                return (
                  <tr key={r.userId}>
                    <td>
                      <div className="hrt-name">{r.fullName}</div>
                      <div className="hrt-muted">{r.department || '—'}</div>
                    </td>
                    <td className="nw">
                      <div className="hrt-line"><span className="hrt-k">{t('hrReports.shortPlans')}</span><span className="hrt-pill">{activityStatusLabel(r.plansActivity ?? r.activityStatus)}</span></div>
                      <div className="hrt-line"><span className="hrt-k">{t('hrReports.shortClaims')}</span><span className="hrt-pill">{activityStatusLabel(r.claimsActivity ?? r.activityStatus)}</span></div>
                    </td>
                    <td className="nw">{r.claimsOpen == null ? r.activeDossiers : <>{r.claimsOpen} <span className="hrt-muted">· {r.claimsClosureRate ?? 0}%</span></>}</td>
                    <td className="nw">{r.plansOpen == null ? '—' : <>{r.plansOpen} <span className="hrt-muted">· {r.plansClosureRate ?? 0}%</span></>}</td>
                    <td className="nw">{r.remainingCapacity}</td>
                    <td className="nw">{r.actionsToValidate ?? '—'}</td>
                    <td className="nw">{r.overdueCount}</td>
                    <td className="nw">{workloadLabel(r.workload)}</td>
                    <td title={detail}>
                      {levels.length === 0 ? '—' : (
                        <span className="hrt-lv">
                          {expert > 0 && <span className="e">{levelLabel('expert')} {expert}</span>}
                          {confirmed > 0 && <span className="c">{levelLabel('confirme')} {confirmed}</span>}
                          {beginner > 0 && <span className="b">{levelLabel('debutant')} {beginner}</span>}
                        </span>
                      )}
                    </td>
                    <td className="nw" title={badges.join(', ')}>{badges.length || '—'}</td>
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
