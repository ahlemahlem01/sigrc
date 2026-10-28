import React, { useEffect, useState } from 'react';
import { BarChart3, Sparkles, RefreshCw } from 'lucide-react';
import { paretoService } from '../../../services/paretoService';
import { useAuth } from '../../../context/AuthContext';
import { ParetoItemDto, ParetoSuggestionDto } from '../../../types/pareto.types';
import { useTranslation } from 'react-i18next';
import { defectLabel } from '../../../utils/defectLabel';

interface ParetoImpactPreviewProps {
  defectType?: string;
  clientId?: string;
  productionLine?: string;
  compact?: boolean;
  onSuggestion?: (suggestion: ParetoSuggestionDto | null) => void;
}

/** The server writes defect codes as they are stored; the screen shows their wording. */
const withLabels = (text: string, ...codes: (string | undefined)[]) =>
  codes.reduce<string>((out, code) => (code?.trim() ? out.split(code.trim()).join(defectLabel(code)) : out), text);

export const ParetoImpactPreview: React.FC<ParetoImpactPreviewProps> = ({
  defectType,
  clientId,
  productionLine,
  compact = false,
  onSuggestion,
}) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<ParetoSuggestionDto | null>(null);
  const { accessToken } = useAuth();

  useEffect(() => {
    const dtype = defectType?.trim();
    const cid = clientId?.trim();
    const line = productionLine?.trim();

    if (!accessToken || (!dtype && !cid && !line)) {
      setSuggestion(null);
      onSuggestion?.(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await paretoService.getSuggestion({
          defectType: dtype || undefined,
          clientId: cid || undefined,
          productionLine: line || undefined,
        }, accessToken);
        if (!cancelled) {
          setSuggestion(result);
          onSuggestion?.(result);
        }
      } catch (err) {
        console.error('Pareto suggest error', err);
        if (!cancelled) {
          setSuggestion(null);
          onSuggestion?.(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- parent callbacks are not memoised; listing them would re-run on every render
  }, [defectType, clientId, productionLine, accessToken]);

  if (!defectType?.trim() && !clientId?.trim() && !productionLine?.trim()) {
    return (
      <div className="pareto-ai-box pareto-ai-empty">
        <Sparkles size={14} />
        <span>{t('pareto.previewEmpty')}</span>
      </div>
    );
  }

  return (
    <div className={`pareto-ai-box ${compact ? 'compact' : ''}`}>
      <style>{`
        .pareto-ai-box {
          margin-top: 12px;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid #dbeafe;
          background: linear-gradient(180deg, #f8fbff 0%, #eff6ff 100%);
        }
        .pareto-ai-box.compact { margin-top: 10px; padding: 10px; }
        .pareto-ai-empty {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-size: 11.5px;
          background: #f8fafc;
          border-color: #e2e8f0;
        }
        .pareto-ai-head {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          color: #1e40af;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 8px;
        }
        .pareto-ai-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 4px 0;
          line-height: 1.35;
        }
        .pareto-ai-expl {
          font-size: 11.5px;
          color: #475569;
          margin: 0 0 10px 0;
          line-height: 1.45;
        }
        .pareto-ai-bars { display: flex; flex-direction: column; gap: 6px; }
        .pareto-ai-row { display: grid; grid-template-columns: 88px 1fr 42px; gap: 8px; align-items: center; }
        .pareto-ai-cat {
          font-size: 11px;
          font-weight: 600;
          color: #334155;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pareto-ai-track {
          height: 8px;
          border-radius: 99px;
          background: #e2e8f0;
          overflow: hidden;
        }
        .pareto-ai-fill {
          height: 100%;
          border-radius: 99px;
          background: #d97706;
        }
        .pareto-ai-fill.muted { background: #94a3b8; }
        .pareto-ai-pct {
          font-size: 11px;
          font-weight: 700;
          color: #0f172a;
          text-align: right;
        }
        .pareto-ai-meta {
          margin-top: 8px;
          font-size: 10.5px;
          color: #64748b;
        }
        .pareto-ai-loading {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #475569;
        }
        .pareto-ai-spin { animation: paretoAiSpin 0.8s linear infinite; }
        @keyframes paretoAiSpin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="pareto-ai-head">
        <BarChart3 size={13} />
        {t('pareto.previewTitle')}
      </div>

      {loading && (
        <div className="pareto-ai-loading">
          <RefreshCw size={14} className="pareto-ai-spin" />
          {t('pareto.previewLoading')}
        </div>
      )}

      {!loading && suggestion && !suggestion.hasData && (
        <p className="pareto-ai-expl">{withLabels(suggestion.explanation, defectType)}</p>
      )}

      {!loading && suggestion?.hasData && (
        <>
          <p className="pareto-ai-title">{withLabels(suggestion.recommendedLabel, defectType)}</p>
          <p className="pareto-ai-expl">{withLabels(suggestion.explanation, defectType)}</p>
          <div className="pareto-ai-bars">
            {suggestion.items.slice(0, compact ? 3 : 5).map((item: ParetoItemDto) => (
              <div key={item.category} className="pareto-ai-row">
                <span className="pareto-ai-cat" title={defectLabel(item.category)}>{defectLabel(item.category)}</span>
                <div className="pareto-ai-track">
                  <div
                    className={`pareto-ai-fill ${item.isVitalFew ? '' : 'muted'}`}
                    style={{ width: `${Math.min(100, item.percentage)}%` }}
                  />
                </div>
                <span className="pareto-ai-pct">{item.percentage.toFixed(0)}%</span>
              </div>
            ))}
          </div>
          <div className="pareto-ai-meta">
            {t('pareto.previewTop')} <strong>{defectLabel(suggestion.topCategory)}</strong> · n={suggestion.sampleSize} · {t('pareto.previewScore', { score: suggestion.confidenceScore })}
          </div>
        </>
      )}
    </div>
  );
};

export default ParetoImpactPreview;
