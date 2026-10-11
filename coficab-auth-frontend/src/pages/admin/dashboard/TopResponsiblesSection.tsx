import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import UserAvatar from '../../../components/UserAvatar';
import type { ResponsibleItem } from '../../../types/dashboardSummary';
import DashInfoTip from './DashInfoTip';
import { CLAIMS_ACCENT, COFICAB, PLANS_ACCENT } from './dashPalette';

type Tab = 'claims' | 'actions';

type Props = {
  claims?: ResponsibleItem[];
  actions?: ResponsibleItem[];
  loading?: boolean;
};

export default function TopResponsiblesSection({ claims = [], actions = [], loading }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('claims');
  const rows = tab === 'claims' ? claims : actions;
  const accent = tab === 'claims' ? CLAIMS_ACCENT : PLANS_ACCENT;

  return (
    <section
      className="rounded-xl bg-white shadow-sm mt-5 overflow-hidden"
      style={{ border: `1px solid ${COFICAB.line}` }}
    >
      <div
        className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b"
        style={{ borderColor: COFICAB.line }}
      >
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold m-0" style={{ color: COFICAB.ink }}>
              {t('adminDashboard.topResponsibles.title')}
            </h2>
            <DashInfoTip
              text={t('adminDashboard.help.topResponsibles')}
              title={t('adminDashboard.topResponsibles.title')}
              side="bottom"
            />
          </div>
          <p className="text-[11px] m-0" style={{ color: COFICAB.muted }}>
            {t('adminDashboard.topResponsibles.subtitle')}
          </p>
        </div>
        <div
          className="inline-flex rounded-xl p-0.5"
          style={{ border: `1px solid ${COFICAB.line}`, background: COFICAB.soft }}
        >
          {([
            { id: 'claims' as const, labelKey: 'adminDashboard.topResponsibles.tabClaims' },
            { id: 'actions' as const, labelKey: 'adminDashboard.topResponsibles.tabActions' },
          ]).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className="px-3.5 py-1.5 text-xs font-bold rounded-[10px] transition-colors"
              style={
                tab === item.id
                  ? { background: accent, color: '#fff' }
                  : { background: 'transparent', color: COFICAB.muted }
              }
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">{t('adminDashboard.topResponsibles.empty')}</div>
        ) : (
          <ul className="m-0 p-0 list-none space-y-2.5">
            {rows.map((r) => (
              <li
                key={r.userId}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors"
                style={{ border: `1px solid ${COFICAB.line}` }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLLIElement).style.background = COFICAB.light;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLLIElement).style.background = 'transparent';
                }}
              >
                <UserAvatar src={r.avatarUrl} name={r.name} size={40} radius="full" />
                <div className="min-w-0 w-40 shrink-0">
                  <div className="text-sm font-semibold truncate" style={{ color: COFICAB.ink }}>{r.name}</div>
                  <div className="text-[11px] truncate" style={{ color: COFICAB.muted }}>{r.department}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px]" style={{ color: COFICAB.muted }}>
                      {t('adminDashboard.topResponsibles.closedOf', { closed: r.closed, total: r.total })}
                    </span>
                    <span className="text-[11px] font-bold tabular-nums" style={{ color: accent }}>
                      {r.closureRate.toFixed(1)} %
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: COFICAB.soft }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(0, r.closureRate))}%`,
                        background: accent,
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
