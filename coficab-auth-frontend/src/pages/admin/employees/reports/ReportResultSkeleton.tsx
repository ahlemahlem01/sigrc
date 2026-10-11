import { useTranslation } from 'react-i18next';

const NAVY = '#000168';
const LINE = '#e4e8f2';

export default function ReportResultSkeleton() {
  const { t } = useTranslation();
  return (
    <section className="hrs" aria-busy="true" aria-live="polite">
      <style>{`
        .hrs {
          border: 1px solid ${LINE}; border-radius: 12px; background: #fff;
          padding: 20px 18px; margin-bottom: 16px;
        }
        .hrs-head {
          display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
        }
        .hrs-spin {
          width: 22px; height: 22px; border-radius: 50%;
          border: 2.5px solid #e4e8f2; border-top-color: ${NAVY};
          animation: hrs-rot .7s linear infinite; flex-shrink: 0;
        }
        @keyframes hrs-rot { to { transform: rotate(360deg); } }
        .hrs-title { margin: 0; font-size: 14px; font-weight: 700; color: #0d1340; }
        .hrs-sub { margin: 2px 0 0; font-size: 12.5px; color: #64748b; }
        .hrs-block { margin-bottom: 14px; }
        .hrs-line {
          height: 12px; border-radius: 6px; background: linear-gradient(90deg, #f1f5f9, #e8ecf5, #f1f5f9);
          background-size: 200% 100%; animation: hrs-shimmer 1.2s ease-in-out infinite;
          margin-bottom: 8px;
        }
        .hrs-line.lg { height: 16px; width: 42%; }
        .hrs-line.md { width: 88%; }
        .hrs-line.sm { width: 64%; }
        .hrs-charts {
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px;
        }
        @media (max-width: 800px) { .hrs-charts { grid-template-columns: 1fr; } }
        .hrs-card {
          height: 180px; border-radius: 10px; border: 1px solid ${LINE};
          background: linear-gradient(90deg, #f8f9fc, #eef2ff, #f8f9fc);
          background-size: 200% 100%; animation: hrs-shimmer 1.2s ease-in-out infinite;
        }
        @keyframes hrs-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
      `}</style>

      <div className="hrs-head">
        <div className="hrs-spin" />
        <div>
          <h2 className="hrs-title">{t('hrReports.generatingTitle')}</h2>
          <p className="hrs-sub">
          {t('hrReports.generatingSub')}
          </p>
        </div>
      </div>

      <div className="hrs-block">
        <div className="hrs-line lg" />
        <div className="hrs-line md" />
        <div className="hrs-line md" />
        <div className="hrs-line sm" />
        <div className="hrs-line md" />
      </div>

      <div className="hrs-charts">
        <div className="hrs-card" />
        <div className="hrs-card" />
      </div>
    </section>
  );
}
