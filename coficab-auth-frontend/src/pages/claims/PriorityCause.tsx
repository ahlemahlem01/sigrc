import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { dateLocale } from '../../i18n';
import { PriorityCause as PriorityCauseRow, PriorityCauseState, priorityCauseService } from '../../services/priorityCauseService';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { IshikawaCauseRead } from '../../types/qualityAnalysis';
import { MiningInsights } from '../../services/miningService';

const CATEGORIES = ['Manpower', 'Machine', 'Material', 'Method', 'Milieu', 'Measurement'] as const;

/** The Ishikawa endpoint groups causes by category (categories[].causes[].text); older payloads carry a flat causes[] list. Both give the same flat rows. */
function flattenIshikawa(d: any): IshikawaCauseRead[] {
  if (Array.isArray(d?.categories)) {
    return d.categories.flatMap((cat: any) => (cat.causes ?? []).map((c: any) => ({
      id: c.id, category: cat.categoryName, causeDescription: c.text ?? c.causeDescription, isRootCause: !!c.isRootCause,
    }))).filter((c: IshikawaCauseRead) => c.id && c.causeDescription);
  }
  return d?.causes ?? [];
}

/** Loads the current priority cause of a claim (and its history). Refetches when `version` changes. */
export function usePriorityCause(claimId: string | undefined, version = 0) {
  const { accessToken } = useAuth();
  const [state, setState] = useState<PriorityCauseState>({ current: null, history: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!claimId || !accessToken) return;
    let cancelled = false;
    priorityCauseService
      .get(claimId, accessToken)
      .then((s) => { if (!cancelled) setState(s); })
      .catch(() => { if (!cancelled) setState({ current: null, history: [] }); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [claimId, accessToken, version]);

  return { ...state, loaded, setState };
}

function describe(c: PriorityCauseRow, t: (k: string, o?: Record<string, unknown>) => string) {
  const who = c.selectedByName || '—';
  const when = new Date(c.selectedAt).toLocaleDateString(dateLocale());
  return t('priorityCause.by', { who, when });
}

/** Read-only reminder shown on the 8D D4 step and on the 5 Why page. Renders nothing until a cause is chosen. */
export function PriorityCauseBanner({ claimId, onUse }: { claimId: string; onUse?: (causeText: string) => void }) {
  const { t } = useTranslation();
  const { current } = usePriorityCause(claimId);
  if (!current) return null;
  return (
    <div
      role="note"
      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '0 0 12px', padding: '10px 12px', borderRadius: 10,
        background: '#eef2ff', border: '1px solid #c7d2fe', color: '#1e1b4b', fontSize: 13.5, lineHeight: 1.45 }}
    >
      <Target size={16} aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
      <div>
        <strong>{t('priorityCause.bannerTitle')}</strong> {current.causeText}
        {current.category && <span style={{ color: '#475569' }}> · {t(`ishikawa.cat.${current.category}`, { defaultValue: current.category })}</span>}
        <div style={{ fontSize: 12, color: '#475569' }}>
          {describe(current, t)} ·{' '}
          <Link to={`/pages/front/quality-analyses/pareto/${claimId}`}>{t('priorityCause.change')}</Link>
          {onUse && (
            <>
              {' · '}
              <button type="button" onClick={() => onUse(current.causeText)} style={{ background: 'none', border: 'none', padding: 0, color: '#1d4ed8', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', fontFamily: 'inherit' }}>
                {t('priorityCause.useAsFirstWhy')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  claimId: string;
  /** Bumped by the parent when a cause was chosen elsewhere on the page (suggestion shortcut). */
  version: number;
  /** What comparable closed dossiers recorded for each of the analyst's own causes (optional). */
  evidence?: MiningInsights['causeEvidence'];
  /** Primary action of the page (next step), shown in the card footer. */
  footer?: React.ReactNode;
  /** Error of a suggestion shortcut used elsewhere on the page. */
  externalError?: string | null;
  /** A closed claim: the current cause and its history are shown, nothing can be chosen. */
  readOnly?: boolean;
  onChanged: () => void;
}

/** Choose, change and review the priority cause. Typing it by hand is always possible. */
export function PriorityCauseCard({ claimId, version, evidence, footer, externalError, readOnly = false, onChanged }: CardProps) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const { current, history, loaded } = usePriorityCause(claimId, version);
  const [text, setText] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const touched = useRef(false);
  const autoText = useRef('');
  const autoCategory = useRef('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ishikawa, setIshikawa] = useState<IshikawaCauseRead[]>([]);

  // The analyst's own Ishikawa causes are the most relevant candidates: offer them first.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    qualityAnalysisService
      .getIshikawa(claimId, accessToken)
      .then((d) => { if (!cancelled) setIshikawa(flattenIshikawa(d)); })
      .catch(() => { if (!cancelled) setIshikawa([]); });
    return () => { cancelled = true; };
  }, [claimId, accessToken]);

  const choose = useCallback(async (causeText: string, causeCategory: string | undefined, source: 'manual' | 'ishikawa') => {
    if (!accessToken || !causeText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await priorityCauseService.select(claimId, { text: causeText.trim(), category: causeCategory, source }, accessToken);
      if (source === 'manual') {
        setText('');
        setCategory('');
      }
      onChanged();
    } catch (e: any) {
      setError(e?.response?.data?.message || t('priorityCause.failed'));
    } finally {
      setBusy(false);
    }
  }, [accessToken, claimId, onChanged, t]);

  // Ranked by history when it can say something (the order of the evidence list); otherwise root-cause flags first.
  const evidenceById = new Map((evidence?.items ?? []).map((e, rank) => [e.id, { ...e, rank }]));
  const ranked = !!evidence?.sufficient;
  const ishikawaSorted = [...ishikawa].sort((a, b) =>
    ranked
      ? (evidenceById.get(a.id)?.rank ?? 999) - (evidenceById.get(b.id)?.rank ?? 999)
      : Number(b.isRootCause) - Number(a.isRootCause));
  const suggestedId = ranked && (evidenceById.get(ishikawaSorted[0]?.id)?.rootDossiers ?? 0) > 0 ? ishikawaSorted[0]?.id : null;

  const previous = history.filter((h) => !h.isCurrent);

  // With no cause kept yet, the field starts with the top suggestion (the one marked "suggested", else the first of the list). It stays editable.
  // The proposal follows the ranking while it is still the untouched proposal (the ranking can arrive after the list) and never replaces what the analyst typed.
  const top = ishikawaSorted.find((c) => c.id === suggestedId) ?? ishikawaSorted[0];
  useEffect(() => {
    if (!loaded || current || !top || touched.current) return;      // typed (or cleared) by hand: leave it
    if (text === top.causeDescription) return;
    autoText.current = top.causeDescription;
    setText(top.causeDescription);
    setPrefilled(true);
    if (!category || autoCategory.current === category) {
      const next = (CATEGORIES as readonly string[]).includes(String(top.category)) ? String(top.category) : '';
      autoCategory.current = next;
      setCategory(next);
    }
  }, [loaded, current, top, text, category]);

  return (
    <section className="pc-card" id="priority-cause-card" aria-labelledby="pc-title">
      <style>{`
        @keyframes pcFlash { 0% { box-shadow: 0 0 0 0 rgba(59,130,246,.55); } 100% { box-shadow: 0 0 0 14px rgba(59,130,246,0); } }
        .pc-card.pc-flash { animation: pcFlash 1.2s ease-out 2; border-color: #3b82f6; }
        .pc-card { margin: 14px 0; background: #fff; border: 1px solid #c7d2fe; border-radius: 14px; padding: 14px 16px; }
        .pc-card h3 { margin: 0 0 4px; font-size: 15px; color: #000168; display: flex; gap: 8px; align-items: center; }
        .pc-hint { margin: 0 0 10px; font-size: 12.5px; color: #64748b; line-height: 1.45; }
        .pc-current { padding: 9px 11px; border-radius: 10px; background: #eef2ff; border: 1px solid #c7d2fe; font-size: 13.5px; margin-bottom: 10px; }
        .pc-meta { font-size: 12px; color: #475569; }
        .pc-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .pc-row input, .pc-row select { border: 1px solid #cbd5e1; border-radius: 9px; padding: 8px 10px; font-size: 13.5px; font-family: inherit; }
        .pc-row input { flex: 1 1 260px; min-width: 0; }
        .pc-btn { border-radius: 9px; padding: 8px 12px; font-size: 13px; font-weight: 650; cursor: pointer; border: 1px solid #000168; background: #000168; color: #fff; font-family: inherit; }
        .pc-btn:disabled { opacity: .55; cursor: not-allowed; }
        .pc-ik { margin: 0 0 10px; }
        .pc-ik ul { margin: 4px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
        .pc-ik li { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 7px 10px; border: 1px solid #e2e8f0; border-radius: 9px; background: #f8fafc; font-size: 13px; }
        .pc-suggested { border-color: #c7d2fe !important; background: #eef2ff !important; }
        .pc-badge { display: inline-block; margin-right: 6px; padding: 1px 7px; border-radius: 999px; background: #000168; color: #fff; font-size: 11px; font-weight: 650; }
        .pc-evidence { display: block; margin-top: 2px; }
        .pc-btn-sm { padding: 4px 10px; font-size: 12px; flex-shrink: 0; }
        .pc-link { background: none; border: none; padding: 0; color: #1d4ed8; cursor: pointer; font-size: 12px; font-family: inherit; text-decoration: underline; }
        .pc-err { color: #b91c1c; font-size: 12.5px; margin-top: 6px; }
        .pc-prev { margin: -4px 0 10px; padding: 0 0 0 4px; list-style: none; display: grid; gap: 2px; font-size: 12.5px; color: #94a3b8; }
        .pc-prev s { color: #94a3b8; }
        .pc-footer { display: flex; justify-content: flex-end; margin-top: 14px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
        .pc-hist { margin: 8px 0 0; padding-left: 18px; font-size: 12.5px; color: #475569; }
      `}</style>
      <h3 id="pc-title"><Target size={16} aria-hidden /> {t('priorityCause.title')}</h3>
      <p className="pc-hint">{t('priorityCause.hint')}</p>

      {current && (
        <div className="pc-current">
          <strong>{current.causeText}</strong>
          {current.category && <span className="pc-meta"> · {t(`ishikawa.cat.${current.category}`, { defaultValue: current.category })}</span>}
          <div className="pc-meta">{describe(current, t)} · {t(`priorityCause.source.${current.source}`, { defaultValue: current.source })}</div>
        </div>
      )}

      {previous.length > 0 && (
        <ul className="pc-prev" aria-label={t('priorityCause.previousList')}>
          {previous.map((h) => (
            <li key={h.id}>
              <s>{h.causeText}</s>
              <span> · {describe(h, t)}</span>
            </li>
          ))}
        </ul>
      )}

      {!readOnly && ishikawaSorted.length > 0 && (
        <div className="pc-ik">
          <div className="pc-meta">{ranked ? t('priorityCause.fromIshikawaRanked') : t('priorityCause.fromIshikawa')}</div>
          <ul>
            {ishikawaSorted.map((c) => {
              const ev = evidenceById.get(c.id);
              return (
              <li key={c.id} className={c.id === suggestedId ? 'pc-suggested' : undefined}>
                <span>
                  {c.id === suggestedId && <strong className="pc-badge">{t('priorityCause.suggested')}</strong>}
                  {c.causeDescription}
                  <span className="pc-meta"> · {t(`ishikawa.cat.${c.category}`, { defaultValue: String(c.category) })}{c.isRootCause ? ` · ${t('priorityCause.rootBadge')}` : ''}</span>
                  {ranked && ev && (
                    <span className="pc-meta pc-evidence">
                      {ev.dossiers === null
                        ? t('priorityCause.evidenceFew')
                        : ev.rootDossiers && ev.rootDossiers > 0
                          ? t('priorityCause.evidenceRoot', { root: ev.rootDossiers, pool: evidence!.pool })
                          : ev.dossiers > 0
                            ? t('priorityCause.evidenceSeen', { count: ev.dossiers, pool: evidence!.pool })
                            : t('priorityCause.evidenceNone', { pool: evidence!.pool })}
                    </span>
                  )}
                </span>
                <button type="button" className="pc-btn pc-btn-sm" disabled={busy} onClick={() => void choose(c.causeDescription, String(c.category), 'ishikawa')}>
                  {t('priorityCause.keepThis')}
                </button>
              </li>
              );
            })}
          </ul>
          {!ranked && evidence && (
            <div className="pc-meta" style={{ marginTop: 6 }}>{t('priorityCause.evidenceThin')}</div>
          )}
        </div>
      )}

      {!readOnly && (
      <div className="pc-row">
        <input
          value={text}
          maxLength={500}
          onChange={(e) => { touched.current = true; setText(e.target.value); setPrefilled(false); }}
          placeholder={t('priorityCause.placeholder')}
          aria-label={t('priorityCause.placeholder')}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('priorityCause.category')}>
          <option value="">{t('priorityCause.noCategory')}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`ishikawa.cat.${c}`)}</option>)}
        </select>
        <button type="button" className="pc-btn" disabled={busy || !text.trim()} onClick={() => void choose(text, category || undefined, 'manual')}>
          {current ? t('priorityCause.replace') : t('priorityCause.keep')}
        </button>
      </div>
      )}
      {prefilled && text.trim() && <div className="pc-meta" style={{ marginTop: 6 }}>{t('priorityCause.prefilled')}</div>}
      {(error || externalError) && <div className="pc-err" role="alert">{error || externalError}</div>}

      {footer && <div className="pc-footer">{footer}</div>}
    </section>
  );
}
