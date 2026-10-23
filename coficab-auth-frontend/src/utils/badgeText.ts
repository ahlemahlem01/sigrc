type TFunc = (key: string, options?: Record<string, unknown>) => string;

interface BadgeLike {
  category?: string;
  name?: string;
  description?: string;
}

const TIER: Record<string, string> = { bronze: 'bronze', argent: 'silver', or: 'gold' };

/**
 * The badges awarded by the engine are stored with French texts (name and description with the figures inside).
 * This gives them in the language of the interface; null when the badge is not one of the engine's.
 */
export function engineBadgeText(b: BadgeLike, t: TFunc): { name: string; description: string } | null {
  const category = String(b.category ?? '');
  const name = String(b.name ?? '');
  const description = String(b.description ?? '');
  const number = (re: RegExp, text: string) => text.match(re)?.[1];

  if (category === 'speed') {
    const tier = TIER[name.replace(/^Rapidité\s+/i, '').toLowerCase()];
    if (tier) {
      const count = number(/^(\d+)\s+réclamations/i, description);
      return {
        name: t('employeeBadges.engine.speedName', { tier: t(`employeeBadges.engine.tier.${tier}`) }),
        description: count ? t('employeeBadges.engine.speedMany', { count: Number(count) }) : t('employeeBadges.engine.speedFirst'),
      };
    }
    if (name === 'CAPA dans les délais') {
      return { name: t('employeeBadges.engine.planOnTimeName'), description: t('employeeBadges.engine.planOnTimeDescription') };
    }
  }
  if (category === 'first_plan' && name === 'Premier plan CAPA') {
    return { name: t('employeeBadges.engine.firstPlanName'), description: t('employeeBadges.engine.firstPlanDescription') };
  }
  if (category === 'streak') {
    const kind = name === "Série d'élite" ? 'streakElite' : name === 'Série solide' ? 'streakSolid' : null;
    if (kind) {
      const count = number(/^(\d+)\s+réclamations/i, description);
      return {
        name: t(`employeeBadges.engine.${kind}`),
        description: count ? t('employeeBadges.engine.streakDescription', { count: Number(count) }) : description,
      };
    }
  }
  if (category === 'perfect_quarter') {
    const m = name.match(/T(\d)\s+(\d{4})/);
    if (m) {
      const count = number(/\((\d+)\)\.?$/, description);
      return {
        name: t('employeeBadges.engine.quarterName', { q: m[1], year: m[2] }),
        description: count ? t('employeeBadges.engine.quarterDescription', { q: m[1], year: m[2], count: Number(count) }) : description,
      };
    }
  }
  if (category === 'reliable') {
    const pct = number(/(\d+)\s*%/, name) ?? '25';
    const min = number(/au moins\s+(\d+)/i, description);
    return {
      name: t('employeeBadges.engine.reliableName', { pct }),
      description: min ? t('employeeBadges.engine.reliableDescription', { pct, count: Number(min) }) : description,
    };
  }
  return null;
}
