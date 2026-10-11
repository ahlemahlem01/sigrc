import { Award, CalendarCheck, Flag, Gauge, Layers, ShieldCheck, Target, Trophy, type LucideIcon } from 'lucide-react';

/** One brand colour for every badge: the emblem shape and icon tell them apart, not a rainbow. */
export const BADGE_COLOR = '#000168';

export interface BadgeDto {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  earnedAt?: string;
  source?: 'computed' | 'admin';
}

interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  condition: (opts: {
    plans: any[];
    completedCount: number;
    onTimeRate: number;
    avgProgress: number;
    fastCompletions: number;
    hasOverdue: boolean;
  }) => boolean;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'first-plan',
    name: 'Premier Plan',
    description: "A complété son premier plan d'action",
    icon: Flag,
    color: BADGE_COLOR,
    condition: ({ completedCount }) => completedCount >= 1,
  },
  {
    id: 'triple-completion',
    name: 'Triple Succès',
    description: 'A complété 3 plans ou plus',
    icon: Trophy,
    color: BADGE_COLOR,
    condition: ({ completedCount }) => completedCount >= 3,
  },
  {
    id: 'on-track',
    name: 'Ponctuel',
    description: 'Taux de respect des délais ≥ 80 %',
    icon: CalendarCheck,
    color: BADGE_COLOR,
    condition: ({ onTimeRate, completedCount }) => onTimeRate >= 80 && completedCount >= 1,
  },
  {
    id: 'fast-completer',
    name: 'Rapide',
    description: 'A terminé un plan avant son échéance',
    icon: Gauge,
    color: BADGE_COLOR,
    condition: ({ fastCompletions }) => fastCompletions >= 1,
  },
  {
    id: 'perfectionist',
    name: 'Perfectionniste',
    description: 'Progression moyenne ≥ 90 % sur 2+ plans',
    icon: Target,
    color: BADGE_COLOR,
    condition: ({ avgProgress, plans }) => plans.length >= 2 && avgProgress >= 90,
  },
  {
    id: 'active-juggler',
    name: 'Multi-tâches',
    description: 'Gère 3 plans actifs simultanément',
    icon: Layers,
    color: BADGE_COLOR,
    condition: ({ plans }) => plans.filter((p: any) => p.status === 1 || p.status === 2).length >= 3,
  },
  {
    id: 'no-overdue',
    name: 'Sans Retard',
    description: 'Aucun plan en retard dans le portefeuille',
    icon: ShieldCheck,
    color: BADGE_COLOR,
    condition: ({ hasOverdue, plans }) => plans.length >= 1 && !hasOverdue,
  },
];

export function computeEarnedBadges(plans: any[]): BadgeDto[] {
  const now = new Date();
  const completedCount = plans.filter((p: any) => p.status === 3).length;
  const overduePlans = plans.filter((p: any) => {
    if (!p.deadline || p.status === 3) return false;
    return new Date(p.deadline) < now;
  });
  const avgProgress = plans.length > 0
    ? Math.round(plans.reduce((s: number, p: any) => s + (p.progress ?? 0), 0) / plans.length)
    : 0;
  const onTimeRate = plans.length > 0
    ? Math.round(((plans.length - overduePlans.length) / plans.length) * 100)
    : 0;
  const fastCompletions = plans.filter(
    (p: any) => p.status === 3 && p.deadline && new Date(p.deadline) > now
  ).length;
  const hasOverdue = overduePlans.length > 0;

  const ctx = { plans, completedCount, onTimeRate, avgProgress, fastCompletions, hasOverdue };

  return BADGE_DEFINITIONS
    .filter(def => def.condition(ctx))
    .map(({ id, name, description, icon, color }) => ({
      id, name, description, icon, color, source: 'computed' as const,
    }));
}

// Fusionne badges calculés + badges DB (admin), sans doublons (par id)
export function mergeBadges(computed: BadgeDto[], dbBadges: any[]): BadgeDto[] {
  const normalizedDb: BadgeDto[] = dbBadges.map((b: any) => ({
    id: b.id ?? `db-${b.name}`,
    name: b.name,
    description: b.description,
    icon: Award, // DB-issued badges default to the Award icon (DB stores no icon component)
    color: BADGE_COLOR,
    earnedAt: b.earnedAt ?? b.awardedAt ?? b.createdAt,
    source: 'admin' as const,
  }));

  // Map par nom normalisé pour éviter les doublons visuels
  const map = new Map<string, BadgeDto>();

  // 1. D'abord les computed (base)
  computed.forEach(b => {
    const key = b.name.toLowerCase().trim();
    map.set(key, b);
  });

  // 2. Ensuite les DB - ne pas écraser si même nom, mais fusionner earnedAt
  normalizedDb.forEach(b => {
    const key = b.name.toLowerCase().trim();
    if (map.has(key)) {
      // Fusion : garder le computed mais ajouter earnedAt du DB si présent
      const existing = map.get(key)!;
      map.set(key, {
        ...existing,
        earnedAt: b.earnedAt ?? existing.earnedAt,
        // source: 'both' ? Ou garder 'computed'
      });
    } else {
      map.set(key, b);
    }
  });

  return Array.from(map.values());
}
// Retourne les badges calculés qui n'existent pas encore en base (par nom)
export function getMissingBadges(computed: BadgeDto[], dbBadges: any[]): BadgeDto[] {
  const existingNames = new Set(dbBadges.map((b: any) => (b.name ?? '').toLowerCase().trim()));
  return computed.filter(b => !existingNames.has(b.name.toLowerCase().trim()));
}
