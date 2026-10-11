import React from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  /** Variation absolue (ex. +3 / -2). Null = pas de données. */
  delta: number | null | undefined;
  /**
   * Si true : une baisse (delta < 0) est positive (vert).
   * Ex. backlog / retards / alertes.
   */
  invert?: boolean;
  /** Afficher en % */
  percent?: boolean;
  className?: string;
};

/** Badge hausse / baisse pour l’évolution MoM. */
export default function TrendBadge({ delta, invert = false, percent = false, className = '' }: Props) {
  const { t } = useTranslation();
  if (delta === null || delta === undefined || Number.isNaN(delta)) {
    return (
      <span
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          fontSize: 11,
          fontWeight: 700,
          color: '#94a3b8',
        }}
      >
        —
      </span>
    );
  }

  const flat = delta === 0;
  const rawUp = delta > 0;
  const good = flat ? null : invert ? !rawUp : rawUp;
  const color = flat ? '#64748b' : good ? '#0f766e' : '#b91c1c';
  const bg = flat ? '#f1f5f9' : good ? '#f0fdfa' : '#fef2f2';
  const icon = flat ? 'ti-minus' : rawUp ? 'ti-trending-up' : 'ti-trending-down';
  const label = `${delta > 0 ? '+' : ''}${percent ? `${delta}%` : delta}`;

  return (
    <span
      className={className}
      title={t('adminDashboard.vsPreviousMonth')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 11,
        fontWeight: 700,
        color,
        background: bg,
        borderRadius: 999,
        padding: '2px 7px',
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 12 }} />
      {label}
    </span>
  );
}
