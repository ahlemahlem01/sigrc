import React from 'react';

/** Avatars style Google Account — personnages plats, fonds pastel. */

type FaceProps = {
  id: string;
  bg: string;
  skin: string;
  hair: string;
  shirt: string;
  hairPath: string;
  extras?: React.ReactNode;
};

function Face({ id, bg, skin, hair, shirt, hairPath, extras }: FaceProps) {
  return (
    <svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden>
      <defs>
        <clipPath id={`${id}-clip`}>
          <rect width="80" height="80" rx="0" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width="80" height="80" fill={bg} />
        {/* shoulders / shirt */}
        <ellipse cx="40" cy="82" rx="28" ry="18" fill={shirt} />
        {/* neck */}
        <rect x="34" y="52" width="12" height="12" rx="3" fill={skin} />
        {/* head */}
        <ellipse cx="40" cy="38" rx="18" ry="20" fill={skin} />
        {/* hair */}
        <path d={hairPath} fill={hair} />
        {/* eyes */}
        <circle cx="33" cy="38" r="2.2" fill="#1F2937" />
        <circle cx="47" cy="38" r="2.2" fill="#1F2937" />
        <circle cx="33.7" cy="37.3" r="0.7" fill="#fff" />
        <circle cx="47.7" cy="37.3" r="0.7" fill="#fff" />
        {/* smile */}
        <path
          d="M34 46 Q40 51 46 46"
          fill="none"
          stroke="#1F2937"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {extras}
      </g>
    </svg>
  );
}

export function AvatarArt({ art }: { art: string }) {
  switch (art) {
    case 'nova':
      return (
        <Face
          id="nova"
          bg="#E8F0FE"
          skin="#F6C7A5"
          hair="#2D1B0E"
          shirt="#1A73E8"
          hairPath="M22 36 Q24 14 40 12 Q56 14 58 36 Q52 22 40 20 Q28 22 22 36 Z"
        />
      );
    case 'coral':
      return (
        <Face
          id="coral"
          bg="#FCE8E6"
          skin="#E8B48A"
          hair="#5C2B1A"
          shirt="#EA4335"
          hairPath="M20 40 Q18 16 40 10 Q62 16 60 40 L58 28 Q40 18 22 28 Z"
          extras={
            <g>
              <path d="M26 38 Q28 34 30 38" fill="none" stroke="#1F2937" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M50 38 Q52 34 54 38" fill="none" stroke="#1F2937" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          }
        />
      );
    case 'sage':
      return (
        <Face
          id="sage"
          bg="#E6F4EA"
          skin="#C68642"
          hair="#1A1A1A"
          shirt="#34A853"
          hairPath="M22 34 Q26 12 40 11 Q54 12 58 34 Q50 24 40 23 Q30 24 22 34 Z"
          extras={
            <rect x="26" y="35" width="28" height="8" rx="4" fill="none" stroke="#1F2937" strokeWidth="1.5" opacity="0.55" />
          }
        />
      );
    case 'amber':
      return (
        <Face
          id="amber"
          bg="#FEF7E0"
          skin="#FFDBAC"
          hair="#C9A227"
          shirt="#FBBC04"
          hairPath="M24 38 Q22 18 40 14 Q58 18 56 38 Q48 26 40 25 Q32 26 24 38 Z"
        />
      );
    case 'lilac':
      return (
        <Face
          id="lilac"
          bg="#F3E8FD"
          skin="#F1C27D"
          hair="#4A2C6A"
          shirt="#A142F4"
          hairPath="M20 42 Q16 20 40 12 Q64 20 60 42 Q54 28 40 24 Q26 28 20 42 Z"
          extras={
            <path d="M28 28 Q32 22 36 28 M44 28 Q48 22 52 28" fill="none" stroke="#4A2C6A" strokeWidth="2" strokeLinecap="round" />
          }
        />
      );
    case 'slate':
      return (
        <Face
          id="slate"
          bg="#E8EAED"
          skin="#8D5524"
          hair="#111827"
          shirt="#5F6368"
          hairPath="M22 32 Q28 10 40 10 Q52 10 58 32 L56 22 Q40 14 24 22 Z"
        />
      );
    case 'mint':
      return (
        <Face
          id="mint"
          bg="#E0F7F4"
          skin="#F6C7A5"
          hair="#E8E8E8"
          shirt="#00BFA5"
          hairPath="M21 40 Q20 16 40 12 Q60 16 59 40 Q52 24 40 22 Q28 24 21 40 Z"
        />
      );
    case 'rose':
      return (
        <Face
          id="rose"
          bg="#FDE7F3"
          skin="#E0AC69"
          hair="#2C1810"
          shirt="#F538A0"
          hairPath="M22 38 Q24 14 40 12 Q56 14 58 38 Q50 20 40 19 Q30 20 22 38 Z M18 30 Q14 42 22 48 Q20 36 18 30 Z M62 30 Q66 42 58 48 Q60 36 62 30 Z"
        />
      );
    case 'sky':
      return (
        <Face
          id="sky"
          bg="#E8F5E9"
          skin="#FFDBAC"
          hair="#6B3A2A"
          shirt="#4285F4"
          hairPath="M24 36 Q28 16 40 14 Q52 16 56 36 Q48 26 40 25 Q32 26 24 36 Z"
          extras={
            <>
              <ellipse cx="28" cy="42" rx="3" ry="2" fill="#F4A6A6" opacity="0.45" />
              <ellipse cx="52" cy="42" rx="3" ry="2" fill="#F4A6A6" opacity="0.45" />
            </>
          }
        />
      );
    case 'ink':
      return (
        <Face
          id="ink"
          bg="#E8EAED"
          skin="#C68642"
          hair="#0F172A"
          shirt="#202124"
          hairPath="M20 36 Q22 12 40 10 Q58 12 60 36 Q54 20 40 18 Q26 20 20 36 Z"
          extras={
            <g stroke="#1F2937" strokeWidth="1.4" fill="none" strokeLinecap="round">
              <path d="M24 40 H20 M24 44 H18" />
              <path d="M56 40 H60 M56 44 H62" />
            </g>
          }
        />
      );
    default:
      return (
        <svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden>
          <rect width="80" height="80" fill="#E8F0FE" />
          <circle cx="40" cy="36" r="16" fill="#F6C7A5" />
          <ellipse cx="40" cy="72" rx="22" ry="16" fill="#1A73E8" />
        </svg>
      );
  }
}

