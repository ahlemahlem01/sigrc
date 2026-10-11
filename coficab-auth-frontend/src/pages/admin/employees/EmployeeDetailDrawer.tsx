import UserAvatar from '../../../components/UserAvatar';
import CompetencyRadar from './CompetencyRadar';
import type { EmployeePerformanceRow } from '../../../services/employeePerformanceService';
import { COFICAB } from '../dashboard/dashPalette';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../../i18n';
import { getStatusBadge, resolveClaimStatus } from '../../../utils/Claimutils';

const fmt = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

type Props = {
  row: EmployeePerformanceRow | null;
  open: boolean;
  onClose: () => void;
};

export default function EmployeeDetailDrawer({ row, open, onClose }: Props) {
  const { t } = useTranslation();
  if (!open || !row) return null;

  return (
    <>
      <div className="edd-backdrop" onClick={onClose} role="presentation" />
      <aside className="edd-drawer" aria-label={t('employeeFile.drawerAria')}>
        <div className="edd-head">
          <div className="edd-user">
            <UserAvatar
              user={{ id: row.userId, fullName: row.fullName, profilePictureUrl: row.profilePictureUrl }}
              name={row.fullName}
              size={40}
              radius="lg"
            />
            <div>
              <div className="edd-name">{row.fullName}</div>
              <div className="edd-email">{row.email}</div>
              <div className="edd-email">
                {[row.poste, row.equipe, row.department].filter(Boolean).join(' · ') || '—'}
              </div>
              {(row.telephone || row.ligneProduction) && (
                <div className="edd-email">
                  {[row.telephone, row.ligneProduction].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>
          <button type="button" className="edd-close" onClick={onClose} aria-label={t('fiveWhy.close')}>
            <i className="ti ti-x" />
          </button>
        </div>

        <div className="edd-body">
          <section className="edd-section">
            <h3 className="edd-section-title">{t('employeeProfileAdmin.skillsTitle')}</h3>
            <p className="edd-section-sub">{t('employeeProfileAdmin.skillsSub')}</p>
            <CompetencyRadar scores={row.competencies} />
          </section>

          <section className="edd-section">
            <h3 className="edd-section-title">{t('employeeFile.lastFive')}</h3>
            {row.recentDossiers.length === 0 ? (
              <p className="edd-empty">{t('employeeProfileAdmin.recentEmpty')}</p>
            ) : (
              <ul className="edd-dossiers">
                {row.recentDossiers.map((d) => (
                  <li key={`${d.type}-${d.id}`} className="edd-dossier">
                    <div className="edd-dossier-icon">
                      <i className={`ti ${d.type === 'claim' ? 'ti-clipboard-check' : 'ti-file-description'}`} />
                    </div>
                    <div className="edd-dossier-body">
                      <div className="edd-dossier-title">{d.title}</div>
                      <div className="edd-dossier-meta">
                        <span className={`edd-type ${d.type}`}>{d.type === 'claim' ? t('analysisTools.claim') : 'CAPA'}</span>
                        <span>{d.type === 'claim' ? getStatusBadge(resolveClaimStatus({ statusCode: d.status })).label : d.status}</span>
                        <span>{fmt(d.date)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>

      <style>{`
        .edd-backdrop {
          position: fixed; inset: 0; background: rgba(13, 19, 64, 0.35);
          backdrop-filter: blur(4px); z-index: 1100;
          animation: edd-fade .18s ease;
        }
        @keyframes edd-fade { from { opacity: 0 } to { opacity: 1 } }

        .edd-drawer {
          position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 100vw);
          background: #fff; z-index: 1101; display: flex; flex-direction: column;
          box-shadow: -12px 0 40px rgba(13, 19, 64, 0.12);
          animation: edd-slide .22s cubic-bezier(.34, 1.2, .64, 1);
          font-family: 'Inter', sans-serif;
        }
        @keyframes edd-slide { from { transform: translateX(100%) } to { transform: translateX(0) } }

        .edd-head {
          display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
          padding: 20px 20px 16px; border-bottom: 1px solid ${COFICAB.line};
        }
        .edd-user { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .edd-name { font-size: 16px; font-weight: 700; color: ${COFICAB.ink}; }
        .edd-email { font-size: 12px; color: ${COFICAB.muted}; margin-top: 2px; }
        .edd-close {
          width: 32px; height: 32px; border-radius: 8px; border: 1px solid ${COFICAB.line};
          background: #f8f9fc; cursor: pointer; color: ${COFICAB.muted};
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .edd-close:hover { background: #fee2e2; color: #dc2626; border-color: #fecaca; }

        .edd-body { flex: 1; overflow-y: auto; padding: 16px 20px 24px; }
        .edd-section { margin-bottom: 24px; }
        .edd-section-title { font-size: 13px; font-weight: 700; color: ${COFICAB.ink}; margin: 0 0 4px; }
        .edd-section-sub { font-size: 11.5px; color: #94a3b8; margin: 0 0 8px; }
        .edd-empty { font-size: 12.5px; color: #94a3b8; margin: 8px 0 0; }

        .edd-dossiers { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .edd-dossier {
          display: flex; gap: 10px; align-items: flex-start;
          padding: 10px 12px; border: 1px solid ${COFICAB.line}; border-radius: 10px;
          background: #fafbff;
        }
        .edd-dossier-icon {
          width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
          background: ${COFICAB.light}; color: ${COFICAB.navy};
          display: flex; align-items: center; justify-content: center;
        }
        .edd-dossier-title { font-size: 13px; font-weight: 600; color: ${COFICAB.ink}; }
        .edd-dossier-meta {
          display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;
          font-size: 11px; color: ${COFICAB.muted};
        }
        .edd-type {
          font-weight: 700; text-transform: uppercase; letter-spacing: .3px;
          padding: 1px 6px; border-radius: 4px; font-size: 10px;
        }
        .edd-type.claim { background: #fff1f2; color: #be123c; }
        .edd-type.capa { background: #eef2ff; color: #000168; }
      `}</style>
    </>
  );
}
