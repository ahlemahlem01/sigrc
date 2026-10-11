import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Coficab palette: navy seal with a thin gold ring when earned, neutral grey when locked. */
const NAVY_LIGHT = '#1e2a8a';
const NAVY = '#000168';
const GOLD = '#c9a54a';

type Props = {
  icon: LucideIcon;
  earned?: boolean;
  size?: number;
  title?: string;
};

/** Round seal used for every badge, so the catalog and the earned list look like one set. */
export default function BadgeEmblem({ icon: Icon, earned = true, size = 44, title }: Props) {
  const gradientId = useId();
  const iconSize = Math.round(size * 0.42);

  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}
    >
      <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={earned ? NAVY_LIGHT : '#f8fafc'} />
            <stop offset="1" stopColor={earned ? NAVY : '#e2e8f0'} />
          </linearGradient>
        </defs>
        <circle cx="22" cy="22" r="21" fill={`url(#${gradientId})`} />
        <circle
          cx="22"
          cy="22"
          r="17.5"
          fill="none"
          stroke={earned ? GOLD : '#cbd5e1'}
          strokeWidth="1.2"
          strokeDasharray={earned ? undefined : '2 2.4'}
        />
      </svg>
      <Icon
        size={iconSize}
        strokeWidth={1.9}
        color={earned ? '#ffffff' : '#94a3b8'}
        style={{ position: 'absolute', inset: 0, margin: 'auto' }}
        aria-hidden
      />
    </span>
  );
}
