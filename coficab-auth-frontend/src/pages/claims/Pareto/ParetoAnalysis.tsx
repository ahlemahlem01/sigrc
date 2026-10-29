import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Info, Sparkles } from 'lucide-react';
import ParetoActions from '../../../pages/claims/Pareto/ParetoActions';
import ParetoChart from '../../../pages/claims/Pareto/ParetoChart';
import MiningInsightsPanel, { useMiningInsights } from './MiningInsightsPanel';
import { useClaimClosed } from '../../../hooks/useClaimClosed';
import { ClosedDossierBanner } from '../../../components/ClosedDossierBanner';
import CausesPareto from './CausesPareto';
import ManualParetoPanel from './ManualParetoPanel';
import { activeFilters, EMPTY_MANUAL, ManualParetoConfig, manualRequest } from './manualPareto';
import { LockedStep, useD4Order } from '../D4Order';
import { PriorityCauseCard } from '../PriorityCause';
import { priorityCauseService } from '../../../services/priorityCauseService';
import { AnalysisToolsNav } from '../AnalysisToolsNav';
import { useAuth } from '../../../context/AuthContext';
import { qualityAnalysisService } from '../../../services/qualityAnalysisService';
import { paretoService } from '../../../services/paretoService';
import { ParetoDimension, ParetoItemDto, ParetoMeasure, ParetoSuggestionDto } from '../../../types/pareto.types';
import { Claim } from '../../../types/qualityAnalysis';
// @ts-ignore
import './ParetoAnalysis.styles.css';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import { defectLabel } from '../../../utils/defectLabel';

type ParetoMode = 'byDefect' | 'byLine';

export default function ParetoAnalysis() {
  const { t } = useTranslation();
  const { claimId } = useParams<{ claimId: string }>();
  const order = useD4Order(claimId);
  const { accessToken } = useAuth();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [mode, setMode] = useState<ParetoMode>('byDefect');
  const [modeLockedByAi, setModeLockedByAi] = useState(false);
  const [paretoData, setParetoData] = useState<ParetoItemDto[]>([]);
  const [suggestion, setSuggestion] = useState<ParetoSuggestionDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pcVersion, setPcVersion] = useState(0);
  const [pcError, setPcError] = useState<string | null>(null);
  const closedClaim = useClaimClosed(claimId);
  const [pickedText, setPickedText] = useState<string | null>(null);
  const [measure, setMeasure] = useState<ParetoMeasure>('count');
  // 'guided' = the setup chosen from the claim (axis recommended by the mining); 'manual' = the person sets the axis, filters, period and measure
  const [kind, setKind] = useState<'guided' | 'manual'>('guided');
  const [manual, setManual] = useState<ManualParetoConfig>(EMPTY_MANUAL);
  const manualReq = useMemo(() => manualRequest(manual), [manual]);
  // The whole history counts by default; the user can narrow the period by hand.
  const [period, setPeriod] = useState<'all' | '6' | '12' | '24'>('all');
  const dateFrom = useMemo(() => {
    if (period === 'all') return undefined;
    const d = new Date();
    d.setMonth(d.getMonth() - Number(period));
    return d.toISOString();
  }, [period]);

  useEffect(() => {
    if (!claimId || !accessToken) return;

    qualityAnalysisService
      .getClaimById(claimId, accessToken)
      .then((data) => {
        setClaim(data);
        setLoadError(null);
      })
      .catch((err) => {
        console.error('Erreur chargement claim:', err);
        setLoadError(i18n.t('pareto.claimLoadFailed'));
      });
  }, [claimId, accessToken]);

  useEffect(() => {
    if (!claim || !accessToken) return;
    let cancelled = false;

    paretoService
      .getSuggestion({
        defectType: claim.defectType,
        productionLine: (claim as any).productionLine || undefined,
        clientId: claim.clientId || undefined,
        dateFrom,
      }, accessToken)
      .then((result) => {
        if (cancelled) return;
        setSuggestion(result);
        if (result.hasData && !modeLockedByAi) {
          if (result.recommendedMode === 'byLine') setMode('byLine');
          else setMode('byDefect');
          setModeLockedByAi(true);
        }
      })
      .catch((err) => console.error('Pareto suggest error', err));

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [claim, accessToken, dateFrom]);

  const mining = useMiningInsights(
    claim && claimId
      ? {
          claimId,
          defectType: claim.defectType,
          productionLine: (claim as any).productionLine || undefined,
          shift: (claim as any).shift || undefined,
          clientId: claim.clientId || undefined,
        }
      : null,
  );

  const dimension = mode === 'byDefect' ? ParetoDimension.ProductionLine : ParetoDimension.DefectType;
  const activeDefectType = mode === 'byDefect' ? claim?.defectType : undefined;
  const activeProductionLine = mode === 'byLine' ? (claim as any)?.productionLine : undefined;

  const lockedBy = order.lockReason('pareto');
  if (lockedBy && claimId) {
    return (
      <div className="pareto-container">
        <AnalysisToolsNav claimId={claimId} active="pareto" />
        <LockedStep claimId={claimId} reason={lockedBy} />
      </div>
    );
  }

  return (
    <div className="pareto-container">
      {claimId && (
        <AnalysisToolsNav claimId={claimId} active="pareto" claimTitle={claim?.title} />
      )}
      <div className="pareto-header">
        <h1>{t('workflows.pareto')}</h1>
        {loadError && <p className="pareto-context" style={{ color: '#b91c1c' }}>{loadError}</p>}
        {claim && (
          <p className="pareto-context">
            {t('pareto.context')} <strong style={{ color: '#334155', fontWeight: 650 }}>{defectLabel(claim.defectType) || '—'}</strong>
            {' · '}
            {t('pareto.line')} <strong style={{ color: '#334155', fontWeight: 650 }}>{(claim as any).productionLine ?? 'N/A'}</strong>
          </p>
        )}
      </div>

      {suggestion?.hasData && (
        <div className="pareto-ai-banner">
          <Sparkles size={18} aria-hidden />
          <div>
            <strong>{t('pareto.recommendedAxis', { label: suggestion.recommendedLabel })}</strong>
            <div className="pareto-ai-banner-text">{suggestion.explanation}</div>
          </div>
        </div>
      )}

      {suggestion?.noPattern && (
        <div className="pareto-ai-banner" style={{ background: '#f1f5f9', borderColor: '#cbd5e1', color: '#334155' }} role="status">
          <Info size={18} aria-hidden />
          <div>
            <strong>{t('pareto.noPatternTitle')}</strong>
            <div className="pareto-ai-banner-text">{t('pareto.noPatternText', { count: suggestion.sampleSize })}</div>
          </div>
        </div>
      )}

      {suggestion?.insufficientData && (
        <div className="pareto-ai-banner" style={{ background: '#fff7ed', borderColor: '#fed7aa', color: '#9a3412' }} role="status">
          <Info size={18} aria-hidden />
          <div>
            <strong>{t('pareto.insufficientTitle')}</strong>
            <div className="pareto-ai-banner-text">
              {t('pareto.insufficientText', { count: suggestion.sampleSize, min: suggestion.minSample ?? 8 })}
            </div>
          </div>
        </div>
      )}

      <div className="pareto-mode-toggle" role="group" aria-label={t('pareto.kind.label')} style={{ marginBottom: 12 }}>
        <button type="button" className={`pareto-toggle-btn ${kind === 'guided' ? 'active' : ''}`} onClick={() => setKind('guided')} title={t('pareto.kind.guidedHint')}>
          {t('pareto.kind.guided')}
        </button>
        <button type="button" className={`pareto-toggle-btn ${kind === 'manual' ? 'active' : ''}`} onClick={() => setKind('manual')} title={t('pareto.kind.manualHint')}>
          {t('pareto.kind.manual')}
        </button>
      </div>

      {kind === 'manual' && (
        <ManualParetoPanel
          config={manual}
          onChange={setManual}
          onPrefill={claim ? () => setManual({
            ...manual,   // the period, the dates, the measure and the severity chosen so far are kept
            dimension: manual.dimension,
            defectType: claim.defectType || '',
            productionLine: (claim as any).productionLine || '',
            clientId: claim.clientId || '',
            shift: (claim as any).shift || '',
          }) : undefined}
        />
      )}

      {kind === 'guided' && (<>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 10px', fontSize: 13, color: '#475569' }}>
        <label htmlFor="pareto-period">{t('pareto.period')}</label>
        <select id="pareto-period" className="pareto-select" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
          <option value="all">{t('pareto.periodAll')}</option>
          <option value="6">{t('pareto.period6')}</option>
          <option value="12">{t('pareto.period12')}</option>
          <option value="24">{t('pareto.period24')}</option>
        </select>
      </div>

      <div className="pareto-mode-toggle" role="group" aria-label={t('pareto.modeLabel')}>
        <button
          type="button"
          className={`pareto-toggle-btn ${mode === 'byDefect' ? 'active' : ''}`}
          onClick={() => setMode('byDefect')}
        >
          {t('pareto.byDefect')}
          {suggestion?.recommendedMode === 'byDefect' ? ' ★' : ''}
        </button>
        <button
          type="button"
          className={`pareto-toggle-btn ${mode === 'byLine' ? 'active' : ''}`}
          onClick={() => setMode('byLine')}
          disabled={!(claim as any)?.productionLine}
          title={!(claim as any)?.productionLine ? t('pareto.lineRequired') : undefined}
        >
          {t('pareto.byLine')}
          {suggestion?.recommendedMode === 'byLine' ? ' ★' : ''}
        </button>
      </div>

      <div className="pareto-mode-toggle" role="group" aria-label={t('pareto.measureLabel')} style={{ marginBottom: 8 }}>
        <button type="button" className={`pareto-toggle-btn ${measure === 'count' ? 'active' : ''}`} onClick={() => setMeasure('count')}>
          {t('pareto.measureCount')}
        </button>
        <button type="button" className={`pareto-toggle-btn ${measure === 'impact' ? 'active' : ''}`} onClick={() => setMeasure('impact')} title={t('pareto.measureImpactHint')}>
          {t('pareto.measureImpact')}
        </button>
      </div>
      </>)}

      <h2 style={{ margin: '14px 0 6px', fontSize: 16, color: '#000168' }}>{kind === 'manual' ? t('pareto.manual.resultTitle') : t('pareto.contextTitle')}</h2>

      {kind === 'guided' ? (
        <ParetoChart
          measure={measure}
          dimension={dimension}
          defectType={activeDefectType}
          productionLine={activeProductionLine}
          dateFrom={dateFrom}
          onDataLoaded={setParetoData}
        />
      ) : (
        <ParetoChart
          measure={manualReq.measure}
          dimension={manualReq.dimension}
          defectType={manualReq.defectType}
          productionLine={manualReq.productionLine}
          clientId={manualReq.clientId}
          shift={manualReq.shift}
          severity={manualReq.severity}
          dateFrom={manualReq.dateFrom}
          dateTo={manualReq.dateTo}
          onDataLoaded={setParetoData}
        />
      )}

      {paretoData.length > 0 && kind === 'guided' && (
        <p className="pareto-context" style={{ margin: '6px 0 0' }}>
          {t('pareto.shown', {
            period: t(`pareto.period${period === 'all' ? 'All' : period}`),
            count: paretoData.reduce((sum, item) => sum + item.count, 0),
          })}
        </p>
      )}

      {paretoData.length > 0 && kind === 'manual' && (
        <p className="pareto-context" style={{ margin: '6px 0 0' }}>
          {t('pareto.manual.summary', {
            axis: t(`pareto.dim.${manual.dimension}`),
            count: paretoData.reduce((sum, item) => sum + item.count, 0),
            filters: activeFilters(manual).length === 0
              ? t('pareto.manual.noFilters')
              : activeFilters(manual).map((f) => `${t(`pareto.dim.${f.axis}`)} = ${f.axis === 'DefectType' ? defectLabel(f.value) || f.value : f.value}`).join(' · '),
          })}
        </p>
      )}

      {claimId && <CausesPareto claimId={claimId} evidence={mining.data?.causeEvidence} loading={mining.loading} />}

      {closedClaim && <ClosedDossierBanner />}

      {claimId && <PriorityCauseCard claimId={claimId} version={pcVersion} evidence={mining.data?.causeEvidence} externalError={pcError} readOnly={closedClaim} footer={<ParetoActions claimId={claimId} />} onChanged={() => { setPcError(null); setPickedText(null); setPcVersion((v) => v + 1); }} />}

      {claim && claimId && (
        <MiningInsightsPanel
          data={mining.data}
          loading={mining.loading}
          chosenText={pickedText}
          onPick={closedClaim ? undefined : (cause) => {
            if (!accessToken) return;
            setPcError(null);
            priorityCauseService
              .select(claimId, { text: cause.text, category: cause.category, source: 'mining' }, accessToken)
              .then(() => {
                setPcVersion((v) => v + 1);
                setPickedText(cause.text);
                // the chosen cause is shown in the card at the top: bring it into view so the click visibly did something
                const card = document.getElementById('priority-cause-card');
                if (card) {
                  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  card.classList.add('pc-flash');
                  window.setTimeout(() => card.classList.remove('pc-flash'), 2600);
                }
              })
              .catch((e: any) => setPcError(e?.response?.data?.message || t('priorityCause.failed')));
          }}
        />
      )}
    </div>
  );
}
