import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getDepartments, getUsersForAssignment } from '../../services/actionPlanService';
import { loadCapaDataset, unwrapList } from './capaAnalytics';

const COFICAB = '#000168';

type NatureRef = { code: string; labelKey: string; hintKey: string; color: string };

const NATURES: NatureRef[] = [
  { code: 'PA', labelKey: 'dashboard.naturePreventive', hintKey: 'capaSettings.naturePaHint', color: '#047857' },
  { code: 'PAC', labelKey: 'dashboard.natureCorrective', hintKey: 'capaSettings.naturePacHint', color: '#be123c' },
  { code: 'PAP', labelKey: 'dashboard.natureImprovement', hintKey: 'capaSettings.naturePapHint', color: '#6d28d9' },
];

export default function AdminCapaSettings() {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processCount, setProcessCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [actionCount, setActionCount] = useState(0);
  const [topResponsibles, setTopResponsibles] = useState<{ id: string; name: string; count: number }[]>([]);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [depsRes, users, data] = await Promise.all([
        getDepartments(accessToken).catch(() => ({ data: [] })),
        getUsersForAssignment(accessToken).catch(() => []),
        loadCapaDataset(accessToken),
      ]);
      const deps = unwrapList((depsRes as any).data?.data ?? (depsRes as any).data);
      setProcessCount(deps.length);
      const userList = Array.isArray(users) ? users : [];
      setUserCount(userList.length);
      setActionCount(data.actions.length);

      const nameMap: Record<string, string> = {};
      for (const u of userList as any[]) {
        const id = String(u.id || '');
        if (!id) continue;
        nameMap[id] = u.fullName || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || id;
      }

      const counts = new Map<string, number>();
      for (const a of data.actions) {
        if (!a.assignedToId) continue;
        counts.set(a.assignedToId, (counts.get(a.assignedToId) || 0) + 1);
      }
      const top = Array.from(counts.entries())
        .map(([id, count]) => ({ id, name: nameMap[id] || id.slice(0, 8), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
      setTopResponsibles(top);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('capaSettings.loadError'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);

  const cards = useMemo(() => [
    {
      id: 'process',
      title: t('capaSettings.processTitle'),
      desc: t('capaSettings.processDesc'),
      stat: processCount,
      statLabel: t('capaSettings.processStat'),
      path: '/admin/departments',
      icon: 'ti-building',
    },
    {
      id: 'responsible',
      title: t('capaSettings.responsibleTitle'),
      desc: t('capaSettings.responsibleDesc'),
      stat: userCount,
      statLabel: t('capaSettings.responsibleStat'),
      path: '/admin/employees',
      icon: 'ti-user-check',
    },
    {
      id: 'history',
      title: t('capaSettings.historyTitle'),
      desc: t('capaSettings.historyDesc'),
      stat: actionCount,
      statLabel: t('capaSettings.historyStat'),
      path: '/admin/audit-logs?module=capa',
      icon: 'ti-history',
    },
    {
      id: 'reference',
      title: t('capaSettings.referenceTitle'),
      desc: t('capaSettings.referenceDesc'),
      stat: processCount,
      statLabel: t('capaSettings.referenceStat'),
      path: '/admin/action-plans/reference',
      icon: 'ti-barcode',
    },
  ], [t, processCount, userCount, actionCount]);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#000168] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="text-slate-900 max-w-7xl mx-auto">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#000168] mb-1">{t('capaSettings.eyebrow')}</p>
        <h1 className="text-2xl font-bold text-[#000168]">{t('capaSettings.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('capaSettings.subtitle')}</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => navigate(c.path)}
            className="text-left bg-white border border-slate-200 rounded-2xl p-5 hover:border-[#000168]/40 hover:shadow-sm transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.title}</div>
                <div className="text-3xl font-bold text-slate-900 mt-1 tabular-nums">{c.stat}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{c.statLabel}</div>
              </div>
              <i className={`${c.icon} text-xl text-[#000168]`} />
            </div>
            <p className="text-sm text-slate-600 mt-3">{c.desc}</p>
            <span className="inline-block mt-3 text-xs font-semibold text-[#000168]">{t('capaSettings.open')} →</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-1">{t('capaSettings.naturesTitle')}</h2>
          <p className="text-xs text-slate-500 mb-4">{t('capaSettings.naturesDesc')}</p>
          <div className="space-y-3">
            {NATURES.map((n) => (
              <div key={n.code} className="flex items-start gap-3 border border-slate-100 rounded-xl px-3 py-3">
                <span
                  className="shrink-0 w-12 h-8 rounded-md text-xs font-bold text-white flex items-center justify-center"
                  style={{ background: n.color }}
                >
                  {n.code}
                </span>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{t(n.labelKey)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{t(n.hintKey)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-slate-800">{t('capaSettings.topResponsible')}</h2>
            <button
              type="button"
              className="text-xs font-semibold text-[#000168] hover:underline"
              onClick={() => navigate('/admin/action-plans/actions-report')}
            >
              {t('capaSettings.viewReport')}
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-4">{t('capaSettings.topResponsibleDesc')}</p>
          {topResponsibles.length === 0 ? (
            <div className="text-sm text-slate-400 py-8 text-center">{t('capaSettings.noResponsible')}</div>
          ) : (
            <div className="space-y-2">
              {topResponsibles.map((r, i) => (
                <div key={r.id} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{r.name}</div>
                    <div className="h-1.5 mt-1 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(8, Math.round((r.count / (topResponsibles[0]?.count || 1)) * 100))}%`,
                          background: COFICAB,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-xs tabular-nums text-slate-600 font-semibold">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
