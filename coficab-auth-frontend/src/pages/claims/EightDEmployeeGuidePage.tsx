import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { AnalysisToolsNav } from './AnalysisToolsNav';
import { useTranslation } from 'react-i18next';

const NAVY = '#000168';

// Copy lives in eightDGuide.* (i18n); extras and examples are listed by count.
const STEPS: { code: string; key: string; extras: number; example: boolean }[] = [
  { code: '0', key: 's0', extras: 0, example: false },
  { code: 'D1', key: 's1', extras: 3, example: false },
  { code: 'D2', key: 's2', extras: 0, example: false },
  { code: 'D3', key: 's3', extras: 2, example: false },
  { code: 'D4', key: 's4', extras: 0, example: false },
  { code: 'D5', key: 's5', extras: 0, example: false },
  { code: 'D6', key: 's6', extras: 0, example: true },
  { code: 'D7', key: 's7', extras: 0, example: true },
  { code: 'D8', key: 's8', extras: 0, example: false },
];

const EightDEmployeeGuidePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { claimId } = useParams<{ claimId?: string }>();

  return (
    <div className="eg-page">
      <style>{`
        .eg-page { font-family: Inter, system-ui, sans-serif; background: #f8fafc; min-height: calc(100dvh - 56px); padding: 22px 24px 48px; color: #0f172a; max-width: 860px; margin: 0 auto; }
        .eg-kicker { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #64748b; font-weight: 700; margin-top: 14px; }
        .eg-title { margin: 6px 0 8px; font-size: 24px; color: ${NAVY}; }
        .eg-lead { margin: 0 0 18px; font-size: 14px; line-height: 1.55; color: #475569; }
        .eg-btn { display: inline-flex; align-items: center; gap: 6px; border-radius: 8px; padding: 8px 12px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #cbd5e1; background: #fff; font-family: inherit; }
        .eg-btn.primary { background: ${NAVY}; color: #fff; border-color: ${NAVY}; }
        .eg-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
        .eg-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; margin-bottom: 10px; }
        .eg-code { display: inline-block; font-size: 11px; font-weight: 800; color: ${NAVY}; background: rgba(0,1,104,.06); border-radius: 999px; padding: 2px 8px; margin-bottom: 6px; }
        .eg-card h2 { margin: 0 0 8px; font-size: 16px; color: ${NAVY}; }
        .eg-card p { margin: 0 0 8px; font-size: 13.5px; line-height: 1.5; color: #334155; }
        .eg-why { font-size: 13px; color: #64748b; }
        .eg-extra { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
        .eg-extra li { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
        .eg-extra b { display: block; font-size: 12px; color: ${NAVY}; margin-bottom: 2px; }
        .eg-extra span { font-size: 13px; color: #475569; line-height: 1.4; }
        .eg-ex { margin: 8px 0 0; padding: 8px 10px; background: #eff6ff; border-radius: 8px; font-size: 13px; color: #1e3a8a; line-height: 1.45; }
      `}</style>

      {claimId ? (
        <AnalysisToolsNav claimId={claimId} active="guide" />
      ) : (
        <button type="button" className="eg-btn" onClick={() => navigate('/pages/front/quality-analyses')}>
          <ArrowLeft size={14} /> {t('eightDGuide.back')}
        </button>
      )}

      <div className="eg-kicker">{t('eightDGuide.kicker')}</div>
      <h1 className="eg-title">{t('eightDGuide.title')}</h1>
      <p className="eg-lead">
        {t('eightDGuide.lead1')}{' '}
        {t('eightDGuide.lead2')}
      </p>

      <div className="eg-actions">
        {claimId && (
          <button
            type="button"
            className="eg-btn primary"
            onClick={() => navigate(`/pages/front/quality-analyses/8d/${claimId}`)}
          >
            {t('workflows.openEightD')} <ArrowUpRight size={14} />
          </button>
        )}
      </div>

      {STEPS.map((s) => (
        <article key={s.code} className="eg-card">
          <span className="eg-code">{s.code}</span>
          <h2>{t(`eightDGuide.${s.key}.title`)}</h2>
          <p>{t(`eightDGuide.${s.key}.what`)}</p>
          <p className="eg-why">{t('eightDGuide.why', { text: t(`eightDGuide.${s.key}.why`) })}</p>
          {s.extras > 0 && (
            <ul className="eg-extra">
              {Array.from({ length: s.extras }, (_, i) => i + 1).map((n) => (
                <li key={n}><b>{t(`eightDGuide.${s.key}.extra${n}Label`)}</b><span>{t(`eightDGuide.${s.key}.extra${n}Text`)}</span></li>
              ))}
            </ul>
          )}
          {s.example && <p className="eg-ex">{t(`eightDGuide.${s.key}.example`)}</p>}
        </article>
      ))}
    </div>
  );
};

export default EightDEmployeeGuidePage;
