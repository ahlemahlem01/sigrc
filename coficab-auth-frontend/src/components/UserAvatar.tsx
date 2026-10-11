import React from 'react';
import { resolveDisplayName, resolveInitials } from '../utils/displayName';
import { getAvatarPreset, resolveUploadedAvatarUrl } from '../utils/avatarPresets';
import { AvatarArt } from './AvatarArt';

type Props = {
  user?: Record<string, unknown> | null;
  src?: string | null;
  name?: string;
  size?: number;
  className?: string;
  radius?: 'full' | 'lg' | number;
  title?: string;
  onClick?: () => void;
};

export default function UserAvatar({
  user,
  src,
  name,
  size = 36,
  className = '',
  radius = 'full',
  title,
  onClick,
}: Props) {
  const display = name || resolveDisplayName(user);
  const initials = resolveInitials(display);
  const raw =
    src ??
    (user?.profilePictureUrl as string | undefined) ??
    (user?.ProfilePictureUrl as string | undefined);
  const preset = getAvatarPreset(raw);
  const uploaded = resolveUploadedAvatarUrl(raw);
  const r =
    radius === 'full' ? '999px' : radius === 'lg' ? '16px' : `${radius}px`;

  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: r,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: preset ? 'transparent' : '#000168',
    color: '#fff',
    fontWeight: 700,
    fontSize: Math.max(11, Math.round(size * 0.34)),
    letterSpacing: '0.02em',
    userSelect: 'none',
    cursor: onClick ? 'pointer' : undefined,
    boxShadow: preset || uploaded
      ? '0 2px 8px rgba(15,23,42,0.10), 0 0 0 1px rgba(15,23,42,0.05)'
      : '0 1px 4px rgba(0,1,104,0.18)',
    transition: 'transform 0.18s ease, box-shadow 0.18s ease',
  };

  return (
    <div
      className={className}
      style={style}
      title={title || display}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      {preset ? (
        <AvatarArt art={preset.art} />
      ) : uploaded ? (
        <img
          src={uploaded}
          alt={display}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
