import React from 'react';
import { useNavigate } from 'react-router-dom';
import DashInfoTip from './DashInfoTip';
import { COFICAB } from './dashPalette';

type Props = {
  label: string;
  value: string | number;
  loading?: boolean;
  accent?: string;
  tint?: string;
  icon?: string;
  help?: string;
  helpTitle?: string;
  /** When set, the card opens this route (the matching list). */
  to?: string;
};

export default function KpiMiniCard({
  label,
  value,
  loading,
  accent = COFICAB.navy,
  tint = COFICAB.light,
  icon,
  help,
  helpTitle,
  to,
}: Props) {
  const navigate = useNavigate();
  // A div with link semantics: the help tip inside is a button, which cannot sit inside an <a>.
  const linkProps = to
    ? {
        role: 'link',
        tabIndex: 0,
        onClick: () => navigate(to),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter') navigate(to);
        },
      }
    : {};

  return (
    <div
      {...linkProps}
      className={`group relative overflow-hidden rounded-xl border px-3 py-2.5 min-h-[76px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${to ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400' : 'cursor-default'}`}
      style={{
        borderColor: COFICAB.line,
        background: `linear-gradient(145deg, ${tint} 0%, #fff 88%)`,
      }}
    >
      <div
        className="absolute inset-y-0 left-0 w-[3px] opacity-80 group-hover:opacity-100 transition-opacity"
        style={{ background: accent }}
      />
      <div className="flex items-start justify-between gap-2 pl-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 truncate">
            {label}
          </div>
          {help && (
            // Opening the help must not follow the card link.
            <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <DashInfoTip text={help} title={helpTitle || label} side="bottom" />
            </span>
          )}
        </div>
        {icon && (
          <i
            className={`ti ${icon} opacity-45 group-hover:opacity-80 transition-opacity shrink-0`}
            style={{ fontSize: 14, color: accent }}
          />
        )}
      </div>
      {loading ? (
        <div className="mt-2 h-6 w-12 rounded bg-slate-200 animate-pulse ml-1" />
      ) : (
        <div
          className="mt-1 ml-1 text-xl font-extrabold tabular-nums transition-transform duration-200 group-hover:scale-[1.03]"
          style={{ color: accent }}
        >
          {value}
        </div>
      )}
    </div>
  );
}
