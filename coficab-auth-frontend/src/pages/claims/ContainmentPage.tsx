import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { eightDService, EightDDossier } from '../../services/qualityAnalysisService';
import { ClaimContainmentSection } from './ClaimContainmentSection';
import { AnalysisToolsNav } from './AnalysisToolsNav';
// @ts-ignore
import './ClaimsListPage.styles.css';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

const NAVY = '#000168';

const ContainmentPage: React.FC = () => {
  const { t } = useTranslation();
  const { claimId } = useParams<{ claimId: string }>();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [dossier, setDossier] = useState<EightDDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!claimId || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const d = await eightDService.get(claimId, accessToken);
      setDossier(d);
    } catch (e: any) {
      setError(e?.response?.data?.message || i18n.t('containmentPage.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [claimId, accessToken]);

  useEffect(() => { void load(); }, [load]);

  const analysisLocked = String(dossier?.claimStatus || '').toUpperCase() === 'OUVERTE';
  const d3 = dossier?.steps?.find((s) => s.step === 3);
  const canContinueToD4 = !!d3?.complete;

  if (loading) {
    return <div className="ica-page-loading">{t('containmentPage.loading')}</div>;
  }

  return (
    <div className="ica-page">
      <div className="ica-page-wrap">
        {claimId && (
          <AnalysisToolsNav
            claimId={claimId}
            active="containment"
            claimTitle={dossier?.claimTitle}
          />
        )}
        <header className="ica-hero">
          <div className="ica-hero-icon">
            <Shield size={20} />
          </div>
          <div>
            <div className="ica-kicker">{t('containmentPage.kicker')}</div>
            <h1>{t('containmentPage.title')}</h1>
            {dossier && (
              <p>
                {dossier.claimTitle} · {t('containmentPage.clientLot', { client: dossier.clientId || '—', lot: dossier.lotNumber || '—' })}
              </p>
            )}
          </div>
        </header>
        {error && <div className="pfe-containment-alert err">{error}</div>}

        {claimId && (
          <ClaimContainmentSection
            claimId={claimId}
            accessToken={accessToken}
            dossier={dossier}
            analysisLocked={analysisLocked}
            onSaved={setDossier}
          />
        )}

        <div className="ica-foot">
          <button
            type="button"
            className="pfe-btn-primary"
            disabled={!canContinueToD4}
            title={canContinueToD4 ? t('containmentPage.goRootCause') : t('containmentPage.finishFirst')}
            onClick={() => canContinueToD4 && navigate(`/pages/front/quality-analyses/ishikawa/${claimId}`)}
          >
            {t('containmentPage.continue')} <ArrowRight size={14} />
          </button>
        </div>
      </div>
      <style>{`
        .ica-page { font-family: Inter, system-ui, sans-serif; background: #f4f6fb; min-height: calc(100dvh - 56px); padding: 16px 16px 40px; }
        .ica-page-wrap { max-width: 860px; margin: 0 auto; }
        .ica-page-loading { padding: 48px; color: #64748b; text-align: center; }
        .ica-hero { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 16px; padding: 14px 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; }
        .ica-hero-icon { width: 42px; height: 42px; border-radius: 11px; background: rgba(0,1,104,.08); color: ${NAVY}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ica-kicker { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #64748b; }
        .ica-hero h1 { margin: 2px 0 4px; font-size: 22px; color: ${NAVY}; }
        .ica-hero p { margin: 0; color: #64748b; font-size: 13px; }
        .ica-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
      `}</style>
    </div>
  );
};

export default ContainmentPage;
