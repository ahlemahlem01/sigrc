import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { IshikawaCategory, IshikawaCauseInput, IshikawaProbabilityTier } from '../../types/qualityAnalysis';
import { AnalysisToolsNav } from './AnalysisToolsNav';
import { LockedStep, useD4Order } from './D4Order';
import { useTranslation } from 'react-i18next';
import { useClaimClosed } from '../../hooks/useClaimClosed';
import i18n from '../../i18n';

interface IshikawaPageProps {
  claimId?: string;
  readOnly?: boolean;
}

const CATEGORIES = Object.values(IshikawaCategory);

// ── Design tokens ───────────────────────────────────────────────────────
// Ancrage marque : navy COFICAB. Les 6 teintes 6M sont des tons "pierre
// précieuse" plus profonds que des couleurs Tailwind par défaut, pour un
// rendu plus soigné à l'écran comme à l'impression (rapports 8D).
const NAVY = '#000168';
const NAVY_SOFT = '#1F2A6B';
const INK = '#12162B';
const INK_MUTED = '#5B6178';
const PAPER = '#F6F7FB';
const LINE = '#E3E5F0';
const DANGER = '#C0202B';
const SUCCESS = '#0B7A4B';

const CATEGORY_COLORS: Record<string, string> = {
  [IshikawaCategory.Manpower || 'Manpower']: '#3C3AA8',
  [IshikawaCategory.Machine || 'Machine']: '#0E6E8C',
  [IshikawaCategory.Material || 'Material']: '#0E7A5F',
  [IshikawaCategory.Method || 'Method']: '#A85A0A',
  [IshikawaCategory.Milieu || 'Milieu']: '#6B2FA8',
  [IshikawaCategory.Measurement || 'Measurement']: '#A81357',
};

interface LocalCause extends IshikawaCauseInput {
  id?: string;
  source?: 'MANUAL' | 'AI_FIVE_WHY' | 'AI_CONTEXT';
  fiveWhyStepId?: string;
  aiConfidence?: number;
  probabilityTier?: IshikawaProbabilityTier;
  tierLabel?: string;
  rationale?: string;
}

const TIER_COLORS: Record<IshikawaProbabilityTier, string> = {
  Red: '#C0202B',
  Yellow: '#D97706',
  Green: '#0B7A4B',
};

const simplifyTierLabel = (tier?: IshikawaProbabilityTier) => {
  if (tier === 'Red') return i18n.t('ishikawa.tierRed');
  if (tier === 'Yellow') return i18n.t('ishikawa.tierYellow');
  if (tier === 'Green') return i18n.t('ishikawa.tierGreen');
  return '';
};

// ── Petites icônes ligne (aucun emoji dans toute la page) ───────────────
const Icon: React.FC<{ path: React.ReactNode; size?: number }> = ({ path, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
);
const IconSpark = () => <Icon path={<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.3 2.3M15.2 15.2l2.3 2.3M17.5 6.5l-2.3 2.3M8.8 15.2l-2.3 2.3" />} />;
const IconX = () => <Icon path={<path d="M6 6l12 12M18 6L6 18" />} size={14} />;
const IconFlag = () => <Icon path={<path d="M5 3v18M5 4.5h12l-2.6 3L17 10.5H5" />} size={14} />;
const IconStarFilled = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.7 6.1 6.6.6-5 4.4 1.5 6.5L12 16.8 6.2 20.1l1.5-6.5-5-4.4 6.6-.6L12 2.5z" /></svg>
);
const IconLock = () => <Icon path={<><rect x="5" y="10.5" width="14" height="9" rx="2" /><path d="M8 10.5V7.5a4 4 0 018 0v3" /></>} />;
const IconAlert = () => <Icon path={<><circle cx="12" cy="12" r="9" /><path d="M12 7.5V13M12 16.2h.01" /></>} />;
const IconCheck = () => <Icon path={<path d="M5 13l4 4L19 7" />} />;
const IconLoader: React.FC = () => (
  <svg className="ik-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 3a9 9 0 106.36 2.64" />
  </svg>
);
const IconPlus = () => <Icon path={<path d="M12 5v14M5 12h14" />} size={15} />;

// ── Géométrie du diagramme ───────────────────────────────────────────────
type Pt = { x: number; y: number };
const quadPoint = (p0: Pt, c: Pt, p2: Pt, t: number): Pt => ({
  x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p2.x,
  y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p2.y,
});
const quadTangent = (p0: Pt, c: Pt, p2: Pt, t: number): Pt => ({
  x: 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p2.x - c.x),
  y: 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p2.y - c.y),
});
const perpUnit = (t: Pt): Pt => {
  const len = Math.sqrt(t.x * t.x + t.y * t.y) || 1;
  return { x: -t.y / len, y: t.x / len };
};

// Étiquette hexagonale (ruban à pointes), inspirée des tags de catégorie
// vus dans les diagrammes de référence — plus distinctif qu'un rectangle.
const hexTagPoints = (cx: number, cy: number, w = 132, h = 30, taper = 15) =>
  [
    [cx - w / 2, cy],
    [cx - w / 2 + taper, cy - h / 2],
    [cx + w / 2 - taper, cy - h / 2],
    [cx + w / 2, cy],
    [cx + w / 2 - taper, cy + h / 2],
    [cx - w / 2 + taper, cy + h / 2],
  ]
    .map((p) => p.join(','))
    .join(' ');

/** 6M category label in the UI language (the stored value stays the enum name). */
const categoryLabel = (cat: string) => i18n.t(`ishikawa.cat.${cat}`, { defaultValue: cat });

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export const IshikawaPage: React.FC<IshikawaPageProps> = ({ claimId: propClaimId, readOnly: readOnlyProp = false }) => {
  const { t } = useTranslation();
  const claimId = propClaimId || window.location.pathname.split('/').pop() || '';
  // a closed claim is shown as it was, whoever opens it
  const closedClaim = useClaimClosed(readOnlyProp ? undefined : claimId);
  const readOnly = readOnlyProp || closedClaim;
  const order = useD4Order(readOnly ? undefined : claimId);
  const { user, accessToken, isLoading: isAuthLoading } = useAuth();
  const location = useLocation();
  const paretoVitalFew = (location.state as any)?.suggestedCategory as string | undefined;

  const [causes, setCauses] = useState<LocalCause[]>([]);
  const [pendingArchiveIds, setPendingArchiveIds] = useState<string[]>([]);
  const [newCauseDesc, setNewCauseDesc] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>(CATEGORIES[0] || 'Manpower');
  const [hintBanner, setHintBanner] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [generating, setGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [genSummary, setGenSummary] = useState<{
    total: number;
    red: number;
    yellow: number;
    green: number;
    focus?: string;
  } | null>(null);

  const loadIshikawa = useCallback(async () => {
    if (isAuthLoading) return;
    if (!claimId) return;
    setLoading(true);
    setError(null);

    try {
      const data = await qualityAnalysisService.getIshikawa(claimId, accessToken || undefined);
      const raw = data as any;

      if (raw && Array.isArray(raw.categories)) {
        const mappedCauses: LocalCause[] = raw.categories.flatMap((group: any) =>
          (group.causes || []).map((c: any) => ({
            id: c.id,
            category: group.categoryName,
            causeDescription: c.text ?? c.causeDescription ?? '',
            isRootCause: !!c.isRootCause,
            source: c.source,
            fiveWhyStepId: c.fiveWhyStepId,
            aiConfidence: c.aiConfidence,
          }))
        );
        setCauses(mappedCauses);
      } else {
        setCauses([]);
      }
      setPendingArchiveIds([]);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setCauses([]);
        setPendingArchiveIds([]);
        setError(null);
      } else {
        setError(err.response?.data?.message || i18n.t('ishikawa.loadFailed'));
      }
    } finally {
      setLoading(false);
    }
  }, [claimId, accessToken, isAuthLoading]);

  useEffect(() => {
    loadIshikawa();
  }, [loadIshikawa]);

  useEffect(() => {
    if (paretoVitalFew) {
      setHintBanner(
        i18n.t('ishikawa.paretoHint', { category: paretoVitalFew })
      );
    }
  }, [paretoVitalFew]);

  const handleGenerateContextAware = useCallback(async () => {
    if (readOnly || !claimId) return;
    setGenerating(true);
    setError(null);
    setSuccessMsg(null);
    setGenSummary(null);
    try {
      const result = await qualityAnalysisService.suggestIshikawaCauses(
        claimId,
        paretoVitalFew,
        accessToken || undefined
      );
      const mapped: LocalCause[] = (result.items || []).map((item) => ({
        category: item.category as any,
        causeDescription: item.causeDescription,
        isRootCause: !!item.isRootCauseCandidate && item.probabilityTier === 'Red',
        source: 'AI_CONTEXT',
        aiConfidence: item.confidence,
        probabilityTier: item.probabilityTier,
        tierLabel: simplifyTierLabel(item.probabilityTier),
        rationale: item.rationale,
      }));

      setCauses((prev) => {
        const persisted = prev.filter((c) => !!c.id);
        const existingKeys = new Set(
          persisted.map((c) => `${c.category}|${(c.causeDescription || '').trim().toLowerCase()}`)
        );
        const fresh = mapped.filter(
          (c) => !existingKeys.has(`${c.category}|${(c.causeDescription || '').trim().toLowerCase()}`)
        );
        return [...persisted, ...fresh];
      });

      const red = mapped.filter((c) => c.probabilityTier === 'Red').length;
      const yellow = mapped.filter((c) => c.probabilityTier === 'Yellow').length;
      const green = mapped.filter((c) => c.probabilityTier === 'Green').length;
      setHintBanner(null);
      setGenSummary({
        total: mapped.length,
        red,
        yellow,
        green,
        focus: paretoVitalFew || undefined,
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.response?.data || i18n.t('ishikawa.suggestFailed'));
    } finally {
      setGenerating(false);
    }
  }, [readOnly, claimId, paretoVitalFew, accessToken]);

  const handleAddCause = () => {
    if (readOnly) return;
    if (!newCauseDesc.trim()) return;
    setCauses([
      ...causes,
      { category: selectedCategory as any, causeDescription: newCauseDesc.trim(), isRootCause: false, source: 'MANUAL' },
    ]);
    setNewCauseDesc('');
  };

  const handleRemoveCause = (index: number) => {
    if (readOnly) return;
    const target = causes[index];
    if (target?.id) setPendingArchiveIds((prev) => [...prev, target.id as string]);
    setCauses(causes.filter((_, i) => i !== index));
  };

  const handleToggleRootCause = (index: number) => {
    if (readOnly) return;
    const target = causes[index];
    if (!target) return;
    const updated = [...causes];
    if (target.id) {
      setPendingArchiveIds((prev) => [...prev, target.id as string]);
      updated[index] = {
        category: target.category,
        causeDescription: target.causeDescription,
        isRootCause: !target.isRootCause,
        source: target.source,
        fiveWhyStepId: target.fiveWhyStepId,
        aiConfidence: target.aiConfidence,
      };
    } else {
      updated[index] = { ...target, isRootCause: !target.isRootCause };
    }
    setCauses(updated);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (readOnly) return;
    setError(null);
    setSuccessMsg(null);
    setGenSummary(null);

    if (!user?.id) {
      setError(t('ishikawa.invalidSession'));
      return;
    }

    setSaving(true);
    try {
      await Promise.all(
        pendingArchiveIds.map((causeId) =>
          qualityAnalysisService.archiveIshikawaCause(causeId, { archivedBy: user.id, archiveReason: 'Modifié via l’interface Ishikawa.' }, accessToken || undefined)
        )
      );

      const newCauses = causes.filter((c) => !c.id);
      await Promise.all(
        newCauses.map((c) =>
          qualityAnalysisService.addIshikawaCause(
            {
              claimId,
              category: c.category as any,
              causeDescription: c.causeDescription,
              isRootCause: c.isRootCause,
              createdBy: user.id,
              source: c.source,
              fiveWhyStepId: c.fiveWhyStepId,
              aiConfidence: c.aiConfidence,
            } as any,
            accessToken || undefined
          )
        )
      );

      setSuccessMsg(t('ishikawa.saved'));
      await loadIshikawa();
    } catch (err: any) {
      setError(err.response?.data?.message || t('ishikawa.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (isAuthLoading || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '60px', color: INK_MUTED, fontFamily: "'Inter', sans-serif", fontSize: '14px' }}>
        <IconLoader />
        {t('ishikawa.loading')}
      </div>
    );
  }

  const lockedBy = order.lockReason('ishikawa');
  if (lockedBy) {
    return (
      <div style={{ maxWidth: 1140, margin: '16px auto', padding: '0 16px' }}>
        <AnalysisToolsNav claimId={claimId} active="ishikawa" />
        <LockedStep claimId={claimId} reason={lockedBy} />
      </div>
    );
  }

  return (
    <div className="ik-root">
      <style>{`

        .ik-root {
          --navy: ${NAVY}; --navy-soft: ${NAVY_SOFT}; --ink: ${INK}; --ink-muted: ${INK_MUTED};
          --paper: ${PAPER}; --line: ${LINE}; --danger: ${DANGER}; --success: ${SUCCESS};
          max-width: 1120px; margin: 24px auto; padding: 32px;
          background: #fff; border-radius: 14px; border: 1px solid var(--line);
          box-shadow: 0 1px 2px rgba(18,22,43,0.04), 0 12px 32px -16px rgba(18,22,43,0.12);
          font-family: 'Inter', sans-serif; color: var(--ink);
        }
        .ik-root * { box-sizing: border-box; }

        .ik-eyebrow {
          font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--ink-muted); margin: 0 0 6px;
        }
        .ik-title {
          font-family: Inter, sans-serif; font-weight: 600; font-size: 24px;
          color: var(--navy); margin: 0; letter-spacing: -0.01em;
        }
        .ik-claim-badge {
          display: inline-flex; align-items: center; gap: 6px; margin-top: 8px;
          font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink-muted);
          background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 3px 9px;
        }
        .ik-claim-badge b { color: var(--ink); font-weight: 600; }

        .ik-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px; margin-bottom: 22px; }
        .ik-actions { display: flex; gap: 8px; flex-wrap: wrap; }

        .btn {
          display: inline-flex; align-items: center; gap: 7px; border-radius: 8px;
          font-family: Inter, sans-serif; font-weight: 500; font-size: 13px;
          padding: 8px 14px; border: 1px solid transparent; cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease;
          white-space: nowrap;
        }
        .btn:disabled { cursor: not-allowed; opacity: 0.55; transform: none !important; box-shadow: none !important; }
        .btn:focus-visible { outline: 2px solid var(--navy-soft); outline-offset: 2px; }
        .btn:not(:disabled):hover { transform: translateY(-1px); }

        .btn-primary { background: var(--navy); color: #fff; }
        .btn-primary:not(:disabled):hover { background: var(--navy-soft); box-shadow: 0 6px 16px -6px rgba(0,1,104,0.45); }

        .btn-ghost { background: #fff; color: var(--ink); border-color: var(--line); }
        .btn-ghost:not(:disabled):hover { border-color: #C7CBDD; box-shadow: 0 4px 10px -6px rgba(18,22,43,0.18); }

        .btn-accent { background: #EEF0FF; color: #33339B; border-color: #D8DBFB; }
        .btn-accent:not(:disabled):hover { background: #E3E6FE; box-shadow: 0 4px 12px -6px rgba(51,51,155,0.3); }

        .btn-quiet { background: transparent; color: var(--ink-muted); border-color: transparent; padding: 8px 12px; }
        .btn-quiet:not(:disabled):hover { background: var(--paper); color: var(--ink); }

        .ik-spin { animation: ikSpin 0.8s linear infinite; }
        @keyframes ikSpin { to { transform: rotate(360deg); } }

        .banner { display: flex; align-items: flex-start; gap: 9px; padding: 10px 13px; margin-bottom: 14px; border-radius: 8px; font-size: 13px; border-left: 3px solid; }
        .banner-error { background: #FDF1F1; border-color: var(--danger); color: #7A1620; }
        .banner-success { background: #EFF9F3; border-color: var(--success); color: #0A5E3A; }
        .banner-warning { background: #FFF8ED; border-color: #B67300; color: #7A4E00; }
        .banner svg { flex-shrink: 0; margin-top: 1px; }

        .ik-addbar { display: flex; gap: 10px; background: var(--paper); padding: 14px; border-radius: 10px; margin-bottom: 22px; border: 1px solid var(--line); }
        .ik-select, .ik-input {
          font-family: 'Inter', sans-serif; font-size: 13px; padding: 9px 11px; border-radius: 7px;
          border: 1px solid var(--line); background: #fff; color: var(--ink); transition: border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
        }
        .ik-select { font-weight: 600; padding-left: 26px; appearance: none; -webkit-appearance: none; cursor: pointer;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235B6178' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
          background-repeat: no-repeat; background-position: right 9px center; background-size: 13px; padding-right: 28px;
        }
        .ik-input { flex: 1; }
        .ik-select:focus, .ik-input:focus { outline: none; border-color: var(--navy-soft); box-shadow: 0 0 0 3px rgba(31,42,107,0.12); }
        .ik-select-wrap { position: relative; display: flex; align-items: center; }
        .ik-select-swatch {
          position: absolute; left: 10px; width: 8px; height: 8px; border-radius: 50%; pointer-events: none;
          box-shadow: 0 0 0 2px #fff;
        }

        .ik-diagram-card { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 22px; margin-bottom: 8px; overflow-x: auto; }
        .ik-diagram-title { font-family: Inter, sans-serif; font-weight: 600; font-size: 14px; color: var(--navy); margin: 0 0 12px; }
        .ik-caption { font-size: 11.5px; color: var(--ink-muted); margin: 10px 2px 24px; line-height: 1.5; }
        .ik-caption b { color: var(--ink); }

        .ik-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; margin-bottom: 22px; }
        .ik-cat-card { border: 1px solid var(--line); border-radius: 10px; padding: 14px; background: #fff; transition: box-shadow 0.15s ease, border-color 0.15s ease; }
        .ik-cat-card:hover { box-shadow: 0 6px 18px -12px rgba(18,22,43,0.25); border-color: #D6D9E8; }
        .ik-cat-head { display: flex; justify-content: space-between; align-items: center; margin: 0 0 10px; padding-bottom: 8px; border-bottom: 2px solid; font-family: Inter, sans-serif; font-weight: 600; font-size: 13.5px; }
        .ik-cat-count { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-muted); font-weight: 500; }
        .ik-empty { font-size: 12.5px; color: #A1A6B8; font-style: italic; margin: 0; }

        .ik-cause-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; margin-bottom: 6px; border-radius: 7px; border: 1px solid var(--line); font-size: 13px; transition: background 0.15s ease; }
        .ik-cause-row.is-root { background: #FDF3F3; border-color: #F0C6C9; }
        .ik-cause-text { flex: 1; color: var(--ink); }
        .ik-cause-row.is-root .ik-cause-text { font-weight: 600; color: #8A1B24; }

        .ik-tag-unsaved { margin-left: 6px; font-size: 10px; color: var(--navy-soft); font-style: italic; }
        .ik-tag-ai {
          display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; padding: 1px 7px;
          border-radius: 20px; background: #EEF0FF; color: #33339B; font-size: 10px; font-weight: 600;
          font-family: 'JetBrains Mono', monospace; letter-spacing: 0.02em;
        }
        .ik-tag-tier {
          display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; padding: 1px 8px;
          border-radius: 20px; font-size: 10px; font-weight: 700; color: #fff;
        }
        .ik-tag-tier.red { background: #C0202B; }
        .ik-tag-tier.yellow { background: #D97706; }
        .ik-tag-tier.green { background: #0B7A4B; }
        .ik-legend-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 0 0 14px;
        }
        .ik-legend-chip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid #E3E5F0;
          background: #fff;
          font-size: 12px;
          color: var(--ink-muted);
          font-weight: 500;
        }
        .ik-legend-chip b { color: var(--ink); font-weight: 700; }
        .ik-tier-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

        .ik-result-panel {
          margin: 0 0 14px;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #E3E5F0;
          background: #FAFBFD;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px 18px;
        }
        .ik-result-title {
          margin: 0;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--ink);
          margin-right: 4px;
        }
        .ik-result-chips {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 14px;
          flex: 1;
        }
        .ik-result-chip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 0;
          background: transparent;
          color: var(--ink);
          font-size: 12.5px;
          font-weight: 500;
          min-width: 0;
        }
        .ik-result-chip .count {
          font-size: 14px;
          font-weight: 800;
          font-family: Inter, sans-serif;
          line-height: 1;
          min-width: 1.1em;
        }
        .ik-result-chip.red .count { color: #C0202B; }
        .ik-result-chip.yellow .count { color: #D97706; }
        .ik-result-chip.green .count { color: #0B7A4B; }
        .ik-result-chip .label { color: var(--ink-muted); font-weight: 500; }
        .ik-result-note {
          margin: 0;
          width: 100%;
          font-size: 11.5px;
          color: var(--ink-muted);
        }
        .btn-predict {
          background: linear-gradient(135deg, #0f2b5c 0%, #1d4ed8 100%);
          color: #fff; border-color: transparent;
        }
        .btn-predict:not(:disabled):hover { filter: brightness(1.06); box-shadow: 0 6px 16px -8px rgba(29,78,216,0.55); }

        .ik-icon-btn { display: inline-flex; align-items: center; gap: 5px; border: none; border-radius: 6px; padding: 5px 9px; font-size: 11px; font-weight: 600; font-family: Inter, sans-serif; cursor: pointer; transition: transform 0.15s ease, background 0.15s ease; }
        .ik-icon-btn:disabled { cursor: not-allowed; opacity: 0.5; }
        .ik-icon-btn:not(:disabled):hover { transform: translateY(-1px); }
        .ik-flag-off { background: #EEF0F5; color: #4B5065; }
        .ik-flag-off:not(:disabled):hover { background: #E2E4EF; }
        .ik-flag-on { background: var(--danger); color: #fff; }
        .ik-remove-btn { background: none; border: none; color: #A1A6B8; cursor: pointer; padding: 4px; border-radius: 5px; transition: color 0.15s ease, background 0.15s ease; }
        .ik-remove-btn:hover { color: var(--danger); background: #FDF1F1; }

        .ik-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }

        .ik-fish text { font-family: Inter, sans-serif; }
        .ik-fish .cause-label { font-family: 'Inter', sans-serif; }

        @keyframes ikDraw { to { stroke-dashoffset: 0; } }
        @keyframes ikFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ikHeadIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes ikPulse { 0% { transform: scale(0.85); opacity: 0.9; } 75% { transform: scale(2); opacity: 0; } 100% { opacity: 0; } }
        .ik-spine-anim { stroke-dasharray: 760; stroke-dashoffset: 760; animation: ikDraw 1s ease-out forwards; }
        .ik-branch-anim { opacity: 0; animation: ikFadeIn 0.5s ease-out forwards; }
        .ik-head-anim { opacity: 0; transform-box: fill-box; transform-origin: center; animation: ikHeadIn 0.45s ease-out 0.75s forwards; }
        .ik-pulse-ring { transform-box: fill-box; transform-origin: center; animation: ikPulse 1.7s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ik-spine-anim, .ik-branch-anim, .ik-head-anim, .ik-pulse-ring { animation: none !important; opacity: 1 !important; stroke-dashoffset: 0 !important; transform: none !important; }
        }
      `}</style>

      {claimId && <AnalysisToolsNav claimId={claimId} active="ishikawa" />}

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="ik-header">
        <div>
          <p className="ik-eyebrow">{t('ishikawa.eyebrow')}</p>
          <h2 className="ik-title">{t('ishikawa.title')}</h2>
          <div className="ik-claim-badge">
            {t('analysisTools.claim')} <b>{claimId}</b>
          </div>
        </div>

        <div className="ik-actions">
          {!readOnly && (
            <button
              className="btn btn-predict"
              onClick={handleGenerateContextAware}
              disabled={generating}
              title={t('ishikawa.suggestHint')}
            >
              {generating ? <IconLoader /> : <IconSpark />}
              {generating ? t('ishikawa.suggesting') : t('ishikawa.suggest')}
            </button>
          )}
        </div>
      </div>

      {hintBanner && (
        <div className="banner banner-success">
          <IconSpark />
          <span>{hintBanner}</span>
        </div>
      )}

      <div className="ik-legend-bar">
        <span className="ik-legend-chip">
          <i className="ik-tier-dot" style={{ background: TIER_COLORS.Red }} />
          <span><b>{t('ishikawa.seen')}</b> · {t('ishikawa.seenHint')}</span>
        </span>
        <span className="ik-legend-chip">
          <i className="ik-tier-dot" style={{ background: TIER_COLORS.Yellow }} />
          <span><b>{t('ishikawa.known')}</b> · {t('ishikawa.knownHint')}</span>
        </span>
        <span className="ik-legend-chip">
          <i className="ik-tier-dot" style={{ background: TIER_COLORS.Green }} />
          <span><b>{t('ishikawa.toCheck')}</b> · {t('ishikawa.toCheckHint')}</span>
        </span>
      </div>

      {genSummary && (
        <div className="ik-result-panel">
          <p className="ik-result-title">
            {t('ishikawa.causesCount', { count: genSummary.total })}{genSummary.focus ? ` · ${genSummary.focus}` : ''}
          </p>
          <div className="ik-result-chips">
            <div className="ik-result-chip red">
              <i className="ik-tier-dot" style={{ background: TIER_COLORS.Red }} />
              <span className="count">{genSummary.red}</span>
              <span className="label">{t('ishikawa.seen')}</span>
            </div>
            <div className="ik-result-chip yellow">
              <i className="ik-tier-dot" style={{ background: TIER_COLORS.Yellow }} />
              <span className="count">{genSummary.yellow}</span>
              <span className="label">{t('ishikawa.known')}</span>
            </div>
            <div className="ik-result-chip green">
              <i className="ik-tier-dot" style={{ background: TIER_COLORS.Green }} />
              <span className="count">{genSummary.green}</span>
              <span className="label">{t('ishikawa.toCheck')}</span>
            </div>
          </div>
          <p className="ik-result-note">{t('ishikawa.reviewThenSave')}</p>
        </div>
      )}

      {readOnly && (
        <div className="banner banner-warning">
          <IconLock />
          <span>{t('ishikawa.readOnly')}</span>
        </div>
      )}
      {error && (
        <div className="banner banner-error">
          <IconAlert />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="banner banner-success">
          <IconCheck />
          <span>{successMsg}</span>
        </div>
      )}
      {pendingArchiveIds.length > 0 && (
        <div className="banner banner-warning">
          <IconAlert />
          <span>{t('ishikawa.pendingArchive', { count: pendingArchiveIds.length })}</span>
        </div>
      )}

      {/* ── Barre d'ajout ─────────────────────────────────────────── */}
      {!readOnly && (
        <div className="ik-addbar">
          <div className="ik-select-wrap">
            <span className="ik-select-swatch" style={{ background: CATEGORY_COLORS[selectedCategory] || NAVY_SOFT }} />
            <select
              className="ik-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ borderColor: CATEGORY_COLORS[selectedCategory] || undefined, color: CATEGORY_COLORS[selectedCategory] || INK }}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat} style={{ color: CATEGORY_COLORS[cat] || INK, fontWeight: 600 }}>
                  {categoryLabel(cat)}
                </option>
              ))}
            </select>
          </div>
          <input
            className="ik-input"
            type="text"
            placeholder={t('ishikawa.addPlaceholder')}
            value={newCauseDesc}
            onChange={(e) => setNewCauseDesc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCause())}
          />
          <button className="btn btn-primary" onClick={handleAddCause} type="button">
            <IconPlus /> {t('ishikawa.add')}
          </button>
        </div>
      )}

      {/* ── Diagramme ─────────────────────────────────────────────── */}
      <div className="ik-diagram-card">
        <h3 className="ik-diagram-title">{t('ishikawa.visualisation')}</h3>

        <svg className="ik-fish" width="1120" height="470" viewBox="0 0 1120 470" style={{ width: '100%', height: 'auto' }}>
          {/* Colonne vertébrale */}
          <line className="ik-spine-anim" x1="110" y1="240" x2="830" y2="240" stroke={NAVY} strokeWidth="3.5" strokeLinecap="round" />

          {/* Queue */}
          <polygon className="ik-branch-anim" style={{ animationDelay: '0.05s' }} points="110,240 52,203 66,240 52,277" fill={NAVY} />

          {/* Tête pleine (triangle) — pas d'échancrure concave, donc le
              texte a toujours toute la largeur 830→962 disponible à mi-hauteur,
              quelle que soit sa longueur. Un léger contour clair et un
              second triangle plus petit en transparence donnent de la
              profondeur sans complexifier la géométrie. */}
          <g className="ik-head-anim">
            <polygon points="826,168 968,240 826,312" fill={NAVY} />
            <polygon points="826,168 968,240 826,312" fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1" />
            <polygon points="826,195 900,240 826,285" fill="#ffffff" fillOpacity="0.06" />
            <text x="882" y="246" fill="#fff" fontSize="15" fontWeight="700" textAnchor="middle" letterSpacing="0.03em">
              {t('ishikawa.defect')}
            </text>
          </g>

          {/* Branches 6M */}
          {CATEGORIES.slice(0, 6).map((cat, idx) => {
            const isTop = idx < 3;
            const xTag = 230 + (idx % 3) * 240;
            const yTag = isTop ? 62 : 412;
            const p0: Pt = { x: xTag, y: isTop ? yTag + 20 : yTag - 20 };
            const p2: Pt = { x: xTag + 70, y: 240 };
            const control: Pt = { x: xTag - 55, y: isTop ? 158 : 322 };
            const color = CATEGORY_COLORS[cat] || NAVY_SOFT;
            const catCauses = causes.filter((c) => c.category === cat);

            const branchPath = `M ${p0.x} ${p0.y} Q ${control.x} ${control.y} ${p2.x} ${p2.y}`;

            return (
              <g key={cat} className="ik-branch-anim" style={{ animationDelay: `${0.22 + idx * 0.1}s` }}>
                <path d={branchPath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                <polygon points={hexTagPoints(xTag, yTag)} fill={color} />
                <text x={xTag} y={yTag + 4} fill="#fff" fontSize="11.5" fontWeight="600" textAnchor="middle" letterSpacing="0.01em">
                  {categoryLabel(cat).toUpperCase()} ({catCauses.length})
                </text>

                {catCauses.map((c, cIdx) => {
                  const frac = 0.22 + (cIdx / Math.max(catCauses.length, 1)) * 0.62;
                  const pos = quadPoint(p0, control, p2, frac);
                  const tangent = quadTangent(p0, control, p2, frac);
                  const perp = perpUnit(tangent);
                  const tickLen = 22 + cIdx * 3;
                  const qx = pos.x + perp.x * tickLen * (isTop ? -1 : 1);
                  const qy = pos.y + perp.y * tickLen * (isTop ? -1 : 1);
                  const causeColor = c.probabilityTier
                    ? TIER_COLORS[c.probabilityTier]
                    : c.isRootCause
                      ? DANGER
                      : color;
                  const isAi = c.source === 'AI_FIVE_WHY' || c.source === 'AI_CONTEXT';
                  const anchorLeft = qx >= pos.x;

                  return (
                    <g key={cIdx}>
                      <title>{c.causeDescription}</title>
                      <line x1={pos.x} y1={pos.y} x2={qx} y2={qy} stroke={causeColor} strokeWidth="1.4" strokeDasharray={isAi ? '2.5,3' : undefined} />
                      {c.isRootCause && <circle className="ik-pulse-ring" cx={qx} cy={qy} r="4.5" fill="none" stroke={causeColor} strokeWidth="1.4" />}
                      <circle cx={qx} cy={qy} r="3" fill={causeColor} />
                      {c.isRootCause && <IconStarSvg x={qx + (anchorLeft ? 7 : -21)} y={qy - 7} color={causeColor} />}
                      <text
                        className="cause-label"
                        x={qx + (anchorLeft ? (c.isRootCause ? 22 : 7) : -(c.isRootCause ? 22 : 7))}
                        y={qy + 3}
                        fill={causeColor}
                        fontSize="10"
                        fontWeight={c.isRootCause ? 600 : 400}
                        textAnchor={anchorLeft ? 'start' : 'end'}
                      >
                        {truncate(c.causeDescription, 22)}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        <p className="ik-caption">
          {t('ishikawa.captionDots')}{' '}
          {t('ishikawa.captionRootBefore')} <b>{t('ishikawa.root')}</b> {t('ishikawa.captionRootAfter')}{' '}
          {t('ishikawa.captionClick')} <b>{t('ishikawa.suggest')}</b>{t('ishikawa.captionThen')} <b>{t('common.save')}</b>.
        </p>
      </div>

      {/* ── Grille 6M détaillée ───────────────────────────────────── */}
      <div className="ik-grid">
        {CATEGORIES.map((cat) => {
          const categoryCauses = causes.map((c, index) => ({ ...c, originalIndex: index })).filter((c) => c.category === cat);
          const catColor = CATEGORY_COLORS[cat] || NAVY_SOFT;

          return (
            <div key={cat} className="ik-cat-card">
              <div className="ik-cat-head" style={{ borderColor: catColor, color: catColor }}>
                <span>{categoryLabel(cat)}</span>
                <span className="ik-cat-count">{categoryCauses.length}</span>
              </div>

              {categoryCauses.length === 0 ? (
                <p className="ik-empty">{t('ishikawa.noCause')}</p>
              ) : (
                categoryCauses.map((item) => (
                  <div key={item.originalIndex} className={`ik-cause-row ${item.isRootCause ? 'is-root' : ''}`}>
                    <span className="ik-cause-text">
                      {item.causeDescription}
                      {!item.id && <span className="ik-tag-unsaved">{t('ishikawa.unsaved')}</span>}
                      {item.probabilityTier && (
                        <span
                          className={`ik-tag-tier ${item.probabilityTier.toLowerCase()}`}
                          title={item.rationale || item.tierLabel}
                        >
                          {simplifyTierLabel(item.probabilityTier) || item.probabilityTier}
                        </span>
                      )}
                      {item.source === 'AI_FIVE_WHY' && (
                        <span className="ik-tag-ai" title={t('ishikawa.aiFiveWhyHint')}>
                          {t('ishikawa.aiFiveWhy')}{typeof item.aiConfidence === 'number' ? ` ${Math.round(item.aiConfidence * 100)}%` : ''}
                        </span>
                      )}
                      {item.source === 'AI_CONTEXT' && !item.probabilityTier && (
                        <span className="ik-tag-ai">{t('ishikawa.aiContext')}</span>
                      )}
                    </span>

                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className={`ik-icon-btn ${item.isRootCause ? 'ik-flag-on' : 'ik-flag-off'}`}
                        onClick={() => handleToggleRootCause(item.originalIndex)}
                        disabled={readOnly}
                        title={t('ishikawa.toggleRoot')}
                      >
                        {item.isRootCause ? <IconStarFilled /> : <IconFlag />}
                        {item.isRootCause ? t('ishikawa.root') : t('ishikawa.mark')}
                      </button>
                      {!readOnly && (
                        <button type="button" className="ik-remove-btn" onClick={() => handleRemoveCause(item.originalIndex)} title={t('ishikawa.removeCause')}>
                          <IconX />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>

      {/* ── Pied de page ──────────────────────────────────────────── */}
      <div className="ik-footer">
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => (window.location.href = `/pages/front/quality-analyses/pareto/${claimId}`)}
        >
          {t('ishikawa.goPareto')}
        </button>

        {!readOnly && (
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <IconLoader /> : null}
            {saving ? t('common.saving') : t('ishikawa.save')}
          </button>
        )}
      </div>
    </div>
  );
};

// Petite étoile vectorielle utilisée uniquement pour le marqueur de cause
// racine dans le SVG (positionnement en coordonnées absolues, distinct du
// composant IconStarFilled utilisé dans les boutons HTML).
const IconStarSvg: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
  <g transform={`translate(${x}, ${y}) scale(0.6)`}>
    <path d="M12 2.5l2.7 6.1 6.6.6-5 4.4 1.5 6.5L12 16.8 6.2 20.1l1.5-6.5-5-4.4 6.6-.6L12 2.5z" fill={color} />
  </g>
);

export default IshikawaPage;