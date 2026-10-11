// src/utils/iatfSla.ts
/** Délais IATF 16949 indicative pour le suivi CAPA / 8D (jours calendaires). */
import i18n from '../i18n';

export type IatfGate = 'D4' | 'D5' | 'D8';

export const IATF_SLA_DAYS: Record<IatfGate, number> = {
  D4: 14,  // analyse causes / containment
  D5: 30,  // actions correctives définies / mises en œuvre
  D8: 60,  // clôture / efficacité
};

export type SlaTone = 'ok' | 'warn' | 'late' | 'none';

export interface SlaInfo {
  gate: IatfGate;
  label: string;
  dueDate: Date | null;
  daysLeft: number | null;
  tone: SlaTone;
  message: string;
}

function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Calcule le SLA à partir de la date de création (ou date de référence) du dossier/plan. */
export function computeIatfSla(
  createdAt: string | Date | undefined | null,
  options?: { progress?: number; status?: string; gate?: IatfGate }
): SlaInfo {
  const gate: IatfGate =
    options?.gate ??
    ((options?.progress ?? 0) >= 100 || options?.status === 'closed' || options?.status === 'closed'
      ? 'D8'
      : (options?.progress ?? 0) >= 50
        ? 'D5'
        : 'D4');

  const labels: Record<IatfGate, string> = {
    D4: i18n.t('sla.gateD4'),
    D5: i18n.t('sla.gateD5'),
    D8: i18n.t('sla.gateD8'),
  };

  if (!createdAt) {
    return {
      gate,
      label: labels[gate],
      dueDate: null,
      daysLeft: null,
      tone: 'none',
      message: i18n.t('sla.noDate'),
    };
  }

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) {
    return {
      gate,
      label: labels[gate],
      dueDate: null,
      daysLeft: null,
      tone: 'none',
      message: i18n.t('sla.invalidDate'),
    };
  }

  const due = addDays(created, IATF_SLA_DAYS[gate]);
  const today = startOfDay(new Date());
  const dueDay = startOfDay(due);
  const daysLeft = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000);

  let tone: SlaTone = 'ok';
  let message = i18n.t('sla.daysLeft', { days: daysLeft });
  if (daysLeft < 0) {
    tone = 'late';
    message = i18n.t('sla.lateBy', { days: Math.abs(daysLeft) });
  } else if (daysLeft <= 5) {
    tone = 'warn';
    message = i18n.t('sla.daysLeftWarn', { days: daysLeft });
  }

  return {
    gate,
    label: labels[gate],
    dueDate: due,
    daysLeft,
    tone,
    message,
  };
}

export function slaToneStyles(tone: SlaTone): { bg: string; color: string; border: string } {
  switch (tone) {
    case 'late':
      return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
    case 'warn':
      return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
    case 'ok':
      return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
    default:
      return { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
  }
}
