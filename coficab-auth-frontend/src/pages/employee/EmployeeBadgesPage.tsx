import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getUserActionPlans } from '../../services/actionPlanService';
import { employeeService } from '../../services/employeeService';
import { Award } from 'lucide-react';
import BadgeEmblem from '../../components/BadgeEmblem';
import { BADGE_COLOR, BADGE_DEFINITIONS, computeEarnedBadges } from '../../utils/badges';
import './EmployeeBadgesPage.css';

type EarnedBadge = {
  id: string;
  name: string;
  description: string;
  color: string;
  category?: string;
  typeLabel?: string;
  earnedAt?: string;
  planTitle?: string;
  source: 'admin' | 'computed';
  defId?: string;
};

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const key of ['data', 'items', 'results', 'value', 'list', '$values']) {
      if (Array.isArray(o[key])) return o[key] as T[];
    }
  }
  return [];
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const KNOWN_DEF_IDS = new Set(BADGE_DEFINITIONS.map((d) => d.id));

/** Match API / legacy badge names (FR/EN/IT) to catalog definition ids. */
function resolveBadgeDefId(b: {
  defId?: string;
  category?: string;
  name?: string;
  typeLabel?: string;
}): string | null {
  for (const candidate of [b.defId, b.category, b.typeLabel]) {
    const raw = String(candidate || '').trim();
    if (raw && KNOWN_DEF_IDS.has(raw)) return raw;
  }

  const nameKey = normalizeKey(String(b.name || ''));
  if (!nameKey) return null;

  for (const def of BADGE_DEFINITIONS) {
    if (normalizeKey(def.id) === nameKey || normalizeKey(def.name) === nameKey) {
      return def.id;
    }
  }

  // Common EN aliases returned by backend / older seeds
  const aliases: Record<string, string> = {
    firstplan: 'first-plan',
    premierplan: 'first-plan',
    triplesucces: 'triple-completion',
    triplesuccess: 'triple-completion',
    punctual: 'on-track',
    ontime: 'on-track',
    ontrack: 'on-track',
    ponctuel: 'on-track',
    fast: 'fast-completer',
    rapide: 'fast-completer',
    fastcompleter: 'fast-completer',
    perfectionist: 'perfectionist',
    perfectionniste: 'perfectionist',
    multitasker: 'active-juggler',
    multitasking: 'active-juggler',
    multitaches: 'active-juggler',
    activejuggler: 'active-juggler',
    nooverdue: 'no-overdue',
    noverdue: 'no-overdue',
    sansretard: 'no-overdue',
    nodelay: 'no-overdue',
  };
  return aliases[nameKey] ?? null;
}

export default function EmployeeBadgesPage() {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const dateLocale = i18n.language?.startsWith('en')
    ? 'en-GB'
    : i18n.language?.startsWith('it')
      ? 'it-IT'
      : 'fr-FR';

  const fmtDate = (value?: string): string => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [badgesRaw, plansRes] = await Promise.all([
        employeeService.getBadges(accessToken).catch(() => []),
        getUserActionPlans(accessToken).catch(() => ({ data: [] })),
      ]);

      const fromApi: EarnedBadge[] = unwrapList<any>(badgesRaw).map((b: any) => {
        const name = String(b.name ?? b.Name ?? 'Badge');
        const category = String(b.category ?? b.Category ?? '');
        const typeLabel = String(b.typeLabel ?? b.TypeLabel ?? '');
        const defId =
          resolveBadgeDefId({
            name,
            category,
            typeLabel,
            defId: String(b.badgeId ?? b.BadgeId ?? b.code ?? b.Code ?? ''),
          }) || undefined;
        return {
          id: String(b.id ?? b.Id ?? `${name}-${b.earnedAt}`),
          name,
          description: String(b.description ?? b.Description ?? ''),
          color: String(b.color ?? b.Color ?? '#000168'),
          category,
          typeLabel,
          earnedAt: b.earnedAt ?? b.EarnedAt,
          planTitle: b.planTitle ?? b.PlanTitle,
          defId,
          source: 'admin' as const,
        };
      });

      const plans = unwrapList<any>((plansRes as any).data?.data ?? (plansRes as any).data).map((p: any) => ({
        id: String(p.id ?? p.Id ?? ''),
        status: Number(p.status ?? p.Status ?? 0),
        progress: Number(p.progress ?? p.Progress ?? 0),
        deadline: p.deadline ?? p.Deadline,
      }));

      const computed = computeEarnedBadges(plans).map((b) => ({
        id: `computed-${b.id}`,
        name: b.name,
        description: b.description,
        color: b.color,
        category: b.id,
        defId: b.id,
        earnedAt: b.earnedAt,
        source: 'computed' as const,
      }));

      const seen = new Set(
        fromApi.flatMap((b) => {
          const keys = [normalizeKey(b.name)];
          if (b.defId) keys.push(normalizeKey(b.defId));
          return keys;
        })
      );
      const merged = [
        ...fromApi,
        ...computed.filter(
          (b) => !seen.has(normalizeKey(b.name)) && !seen.has(normalizeKey(b.id))
        ),
      ].sort((a, b) => new Date(b.earnedAt ?? 0).getTime() - new Date(a.earnedAt ?? 0).getTime());

      setBadges(merged);
    } catch (e: any) {
      setError(e?.message || t('employeeBadges.loadError'));
      setBadges([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const earnedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const b of badges) {
      keys.add(normalizeKey(b.name));
      if (b.category) keys.add(normalizeKey(b.category));
      if (b.defId) keys.add(normalizeKey(b.defId));
      const resolved = resolveBadgeDefId(b);
      if (resolved) keys.add(normalizeKey(resolved));
    }
    return keys;
  }, [badges]);

  const catalog = useMemo(
    () =>
      BADGE_DEFINITIONS.map((def) => {
        const earned =
          earnedKeys.has(normalizeKey(def.id)) || earnedKeys.has(normalizeKey(def.name));
        return {
          ...def,
          earned,
          displayName: t(`employeeBadges.defs.${def.id}.name`),
          displayDescription: t(`employeeBadges.defs.${def.id}.description`),
        };
      }),
    [earnedKeys, t]
  );

  const displayBadge = (b: EarnedBadge) => {
    const defId = resolveBadgeDefId(b);
    if (defId) {
      return {
        name: t(`employeeBadges.defs.${defId}.name`),
        description: t(`employeeBadges.defs.${defId}.description`),
      };
    }
    return { name: b.name, description: b.description };
  };

  const lockedCount = catalog.filter((c) => !c.earned).length;
  const latest = badges[0] ?? null;
  const latestDisplay = latest ? displayBadge(latest) : null;

  return (
    <div className="ebp-page">
      <div className="ebp-inner">
        <header className="ebp-header">
          <div>
            <p className="ebp-kicker">{t('employeeBadges.kicker')}</p>
            <h1>{t('employeeBadges.title')}</h1>
            <p className="ebp-sub">{t('employeeBadges.subtitle')}</p>
          </div>
          <div className="ebp-header-actions">
            <button type="button" className="ebp-btn ghost" onClick={() => navigate('/competences')}>
              {t('employeeBadges.competences')}
            </button>
            <button type="button" className="ebp-btn" onClick={() => void load()} disabled={loading}>
              {t('employeeBadges.refresh')}
            </button>
          </div>
        </header>

        {error && <div className="ebp-error">{error}</div>}

        <section className="ebp-summary" aria-label={t('employeeBadges.summaryAria')}>
          <article className="ebp-summary-card">
            <span className="ebp-summary-label">{t('employeeBadges.earned')}</span>
            <strong className="ebp-summary-value">{loading ? '—' : badges.length}</strong>
            <span className="ebp-summary-hint">{t('employeeBadges.earnedHint')}</span>
          </article>
          <article className="ebp-summary-card">
            <span className="ebp-summary-label">{t('employeeBadges.locked')}</span>
            <strong className="ebp-summary-value">{loading ? '—' : lockedCount}</strong>
            <span className="ebp-summary-hint">{t('employeeBadges.lockedHint')}</span>
          </article>
          <article className="ebp-summary-card wide">
            <span className="ebp-summary-label">{t('employeeBadges.latest')}</span>
            <strong className="ebp-summary-value sm">
              {loading ? '—' : latestDisplay ? latestDisplay.name : t('employeeBadges.noneYet')}
            </strong>
            <span className="ebp-summary-hint">
              {latest
                ? t('employeeBadges.earnedOn', { date: fmtDate(latest.earnedAt) })
                : t('employeeBadges.keepGoing')}
            </span>
          </article>
        </section>

        <section className="ebp-panel" aria-labelledby="ebp-earned-title">
          <div className="ebp-panel-head">
            <div>
              <h2 id="ebp-earned-title">{t('employeeBadges.earnedTitle')}</h2>
              <p>{t('employeeBadges.earnedSub')}</p>
            </div>
          </div>

          {loading ? (
            <div className="ebp-grid" aria-hidden>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="ebp-skel" />
              ))}
            </div>
          ) : badges.length === 0 ? (
            <div className="ebp-empty">{t('employeeBadges.empty')}</div>
          ) : (
            <ul className="ebp-grid">
              {badges.map((b) => {
                const shown = displayBadge(b);
                return (
                  <li key={b.id} className="ebp-card" style={{ ['--badge' as string]: BADGE_COLOR }}>
                    <div className="ebp-card-accent" aria-hidden />
                    <div className="ebp-card-emblem">
                      <BadgeEmblem
                        icon={BADGE_DEFINITIONS.find((d) => d.id === b.defId)?.icon ?? Award}
                        size={46}
                      />
                    </div>
                    <div className="ebp-card-body">
                      <div className="ebp-card-top">
                        <span className="ebp-card-name">{shown.name}</span>
                        <span className={`ebp-source ${b.source}`}>
                          {b.source === 'admin'
                            ? t('employeeBadges.attributed')
                            : t('employeeBadges.unlocked')}
                        </span>
                      </div>
                      {shown.description && <p className="ebp-card-desc">{shown.description}</p>}
                      <div className="ebp-card-meta">
                        <span>{fmtDate(b.earnedAt)}</span>
                        {(() => {
                          const chip = (b.typeLabel || b.category || '').trim();
                          if (!chip) return null;
                          const chipDef = resolveBadgeDefId({
                            name: chip,
                            category: chip,
                            typeLabel: chip,
                            defId: chip,
                          });
                          const badgeDef = resolveBadgeDefId(b);
                          // Hide redundant catalog id / alias chips (e.g. "No Overdue")
                          if (chipDef && chipDef === badgeDef) return null;
                          if (KNOWN_DEF_IDS.has(chip)) return null;
                          return <span className="ebp-chip">{chip}</span>;
                        })()}
                      </div>
                      {b.planTitle && (
                        <p className="ebp-card-plan">
                          {t('employeeBadges.linkedPlan', { title: b.planTitle })}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="ebp-panel" aria-labelledby="ebp-catalog-title">
          <div className="ebp-panel-head">
            <div>
              <h2 id="ebp-catalog-title">{t('employeeBadges.catalogTitle')}</h2>
              <p>{t('employeeBadges.catalogSub')}</p>
            </div>
          </div>

          <ul className="ebp-catalog">
            {catalog.map((def) => {
              const Icon = def.icon;
              return (
                <li
                  key={def.id}
                  className={`ebp-catalog-item${def.earned ? ' earned' : ' locked'}`}
                >
                  <BadgeEmblem icon={Icon} earned={def.earned} size={44} />
                  <div className="ebp-catalog-main">
                    <div className="ebp-catalog-top">
                      <strong>{def.displayName}</strong>
                      <span className={`ebp-status ${def.earned ? 'ok' : 'off'}`}>
                        {def.earned
                          ? t('employeeBadges.statusEarned')
                          : t('employeeBadges.statusLocked')}
                      </span>
                    </div>
                    <p>{def.displayDescription}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
