import React from 'react';

export const COFICAB = '#000168';

export const capaSelectCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#000168] focus:ring-2 focus:ring-[#000168]/15';

export const capaInputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#000168] focus:ring-2 focus:ring-[#000168]/15';

export const capaBtnSecondary =
  'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50';

export const capaBtnPrimary =
  'inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold rounded-lg bg-[#000168] text-white hover:bg-[#00009e] disabled:opacity-50';

type ShellProps = {
  children: React.ReactNode;
  className?: string;
};

/** Page container shared by Action Plan Mgmt screens. */
export function CapaPageShell({ children, className = '' }: ShellProps) {
  return (
    <div className={`text-slate-900 max-w-7xl mx-auto ${className}`.trim()}>
      {children}
    </div>
  );
}

type HeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Subtitle and actions only: for a page shown under a tab that already carries its title. */
  compact?: boolean;
};

export function CapaPageHeader({
  eyebrow = 'Action Plan',
  title,
  subtitle,
  actions,
  compact = false,
}: HeaderProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {subtitle ? <p className="text-sm text-slate-500 max-w-2xl m-0">{subtitle}</p> : <span />}
        {actions ? <div className="flex items-center gap-2 flex-wrap">{actions}</div> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#000168] mb-1">
          {eyebrow}
        </p>
        <h1 className="text-2xl font-bold text-[#000168]">{title}</h1>
        {subtitle ? <p className="text-sm text-slate-500 mt-1 max-w-2xl">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 flex-wrap">{actions}</div> : null}
    </div>
  );
}

export type CapaKpiItem = {
  key: string;
  label: string;
  value: string | number;
  hint?: string;
  active?: boolean;
  /** danger: a figure that calls for action (late plans), shown in red. */
  tone?: 'danger';
  onClick?: () => void;
};

type KpiStripProps = {
  items: CapaKpiItem[];
  /** solid = navy tiles; soft = white cards with navy accent */
  variant?: 'solid' | 'soft';
};

export function CapaKpiStrip({ items, variant = 'soft' }: KpiStripProps) {
  if (variant === 'solid') {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {items.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={s.onClick}
            disabled={!s.onClick}
            className={`rounded-xl px-4 py-3 text-left transition-shadow ${
              s.onClick ? 'cursor-pointer hover:shadow-md' : 'cursor-default'
            } ${s.active ? 'ring-2 ring-offset-2 ring-[#000168]' : ''}`}
            style={{ background: COFICAB, color: '#fff' }}
          >
            <div className="text-2xl font-bold tabular-nums">{s.value}</div>
            <div className="text-[10px] uppercase tracking-wide text-white/70 font-semibold mt-0.5">
              {s.label}
            </div>
            {s.hint ? <div className="text-[11px] text-white/60 mt-1">{s.hint}</div> : null}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 ${items.length > 4 ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-3 mb-5`}>
      {items.map((s) => {
        const danger = s.tone === 'danger';
        return (
        <button
          key={s.key}
          type="button"
          onClick={s.onClick}
          disabled={!s.onClick}
          aria-pressed={s.onClick ? !!s.active : undefined}
          className={`rounded-2xl border px-4 py-3.5 text-left transition-all ${danger ? 'bg-rose-50' : 'bg-white'} ${
            s.onClick ? 'cursor-pointer hover:shadow-md' : 'cursor-default'
          } ${
            s.active
              ? danger
                ? 'border-rose-600 ring-2 ring-rose-500/25 shadow-sm'
                : 'border-[#000168] ring-2 ring-[#000168]/20 shadow-sm'
              : danger ? 'border-rose-200' : 'border-slate-200'
          }`}
        >
          <div className={`text-[11px] font-semibold uppercase tracking-wide ${danger ? 'text-rose-600' : 'text-slate-500'}`}>
            {s.label}
          </div>
          <div className={`text-2xl font-bold tabular-nums mt-1 ${danger ? 'text-rose-700' : 'text-[#000168]'}`}>{s.value}</div>
          {s.hint ? <div className="text-[11px] text-slate-400 mt-1">{s.hint}</div> : null}
          <div className={`mt-2 h-1 rounded-full overflow-hidden ${danger ? 'bg-rose-100' : 'bg-slate-100'}`}>
            <div className={`h-full rounded-full ${danger ? 'bg-rose-500' : 'bg-[#000168]/70'}`} style={{ width: '100%' }} />
          </div>
        </button>
        );
      })}
    </div>
  );
}

type PanelProps = {
  children: React.ReactNode;
  className?: string;
  title?: string;
  meta?: React.ReactNode;
  padding?: boolean;
};

export function CapaPanel({
  children,
  className = '',
  title,
  meta,
  padding = true,
}: PanelProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`.trim()}
    >
      {(title || meta) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
          {title ? <h2 className="text-sm font-semibold text-[#000168]">{title}</h2> : <span />}
          {meta}
        </div>
      )}
      <div className={padding ? 'p-4' : ''}>{children}</div>
    </div>
  );
}

export function CapaSpinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="min-h-[40vh] flex flex-col items-center justify-center gap-3 text-slate-500">
      <div className="w-8 h-8 border-2 border-[#000168] border-t-transparent rounded-full animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function CapaErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
      {message}
    </div>
  );
}
