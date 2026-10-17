import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import {
  archiveNode, createNode, fetchStructure, structureErrorCode, updateNode,
  type OrganizationStructure, type StructureLevel, type StructureNode,
} from '../services/organizationStructureService';

const NAVY = '#000168';
const LINE = '#e4e8f2';
const MUTED = '#64748b';

interface Props {
  organizationId: string;
  organizationName: string;
  onClose: () => void;
}

interface Draft {
  id: string | null;
  name: string;
  code: string;
  parentId: string;
}

const EMPTY: Draft = { id: null, name: '', code: '', parentId: '' };

/**
 * The levels between the corporate level and the sites of one organization. Which levels exist depends on the
 * organization type, which only the superadmin sets: a Local organization is one site, a Country + Corporate one
 * has countries then sites, and so on.
 */
export default function OrganizationStructureModal({ organizationId, organizationName, onClose }: Props) {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [structure, setStructure] = useState<OrganizationStructure | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ level: StructureLevel; draft: Draft } | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setStructure(await fetchStructure(accessToken, organizationId));
    } catch {
      setError(t('orgStructure.loadFailed'));
    }
  }, [accessToken, organizationId, t]);

  useEffect(() => { void load(); }, [load]);

  const explain = (err: unknown) => {
    const e = structureErrorCode(err);
    setError(e ? t(`orgStructure.err.${e.code}`, { count: e.count ?? 0, defaultValue: t('orgStructure.err.generic') }) : t('orgStructure.err.generic'));
  };

  const levels: { level: StructureLevel; nodes: StructureNode[]; parents: StructureNode[]; parentRequired: boolean }[] = structure ? [
    ...(structure.hasRegions ? [{ level: 'regions' as const, nodes: structure.regions, parents: [], parentRequired: false }] : []),
    ...(structure.hasCountries ? [{ level: 'countries' as const, nodes: structure.countries, parents: structure.hasRegions ? structure.regions : [], parentRequired: structure.hasRegions }] : []),
    { level: 'sites' as const, nodes: structure.sites, parents: structure.hasCountries ? structure.countries : [], parentRequired: structure.hasCountries },
  ] : [];

  const save = async () => {
    if (!accessToken || !editing) return;
    setBusy(true);
    setError('');
    const { level, draft } = editing;
    const input = { name: draft.name, code: draft.code, parentId: draft.parentId || null };
    try {
      if (draft.id) await updateNode(accessToken, organizationId, level, draft.id, input);
      else await createNode(accessToken, organizationId, level, input);
      setEditing(null);
      await load();
    } catch (err) {
      explain(err);
    } finally {
      setBusy(false);
    }
  };

  const archive = async (level: StructureLevel, node: StructureNode) => {
    if (!accessToken || !window.confirm(t('orgStructure.archiveConfirm', { name: node.name }))) return;
    setError('');
    try {
      await archiveNode(accessToken, organizationId, level, node.id);
      await load();
    } catch (err) {
      explain(err);
    }
  };

  const parentName = (level: StructureLevel, node: StructureNode) => {
    if (!structure || !node.parentId) return '—';
    const pool = level === 'countries' ? structure.regions : structure.countries;
    return pool.find((p) => p.id === node.parentId)?.name ?? '—';
  };

  const chain = structure
    ? [t('orgStructure.corporate'), ...(structure.hasRegions ? [t('orgStructure.regions')] : []), ...(structure.hasCountries ? [t('orgStructure.countries')] : []), t('orgStructure.sites')]
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('orgStructure.title', { name: organizationName })}
      className="fixed inset-0 z-[70] grid place-items-center p-4"
      style={{ background: 'rgba(13,19,64,.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="w-full max-w-[760px] max-h-[88vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold m-0" style={{ color: NAVY }}>{t('orgStructure.title', { name: organizationName })}</h2>
            {structure && (
              <p className="text-xs mt-1 mb-0" style={{ color: MUTED }}>
                {t('orgStructure.chain')} : <b style={{ color: NAVY }}>{chain.join(' › ')}</b>
                {structure.maxSites === 1 && <> · {t('orgStructure.localOneSite')}</>}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.cancel')} className="text-lg leading-none px-2" style={{ color: MUTED }}>×</button>
        </div>

        {error && <p className="text-xs font-semibold mt-3 mb-0" style={{ color: '#b91c1c' }}>{error}</p>}

        {!structure ? (
          <div className="py-8 text-center text-sm" style={{ color: MUTED }}>{t('orgStructure.loading')}</div>
        ) : levels.map(({ level, nodes, parents, parentRequired }) => {
          const adding = editing?.level === level;
          const full = level === 'sites' && structure.maxSites != null && nodes.length >= structure.maxSites;
          return (
            <section key={level} className="mt-5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wide m-0" style={{ color: NAVY }}>
                  {t(`orgStructure.${level}`)} <span style={{ color: MUTED }}>({nodes.length})</span>
                </h3>
                {!adding && !full && (
                  <button
                    type="button"
                    onClick={() => setEditing({ level, draft: { ...EMPTY } })}
                    disabled={parentRequired && parents.length === 0}
                    title={parentRequired && parents.length === 0 ? t('orgStructure.needParent') : undefined}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg text-white disabled:opacity-40"
                    style={{ background: NAVY }}
                  >
                    + {t(`orgStructure.add_${level}`)}
                  </button>
                )}
              </div>

              {adding && editing && (
                <div className="mb-3 rounded-xl p-3 flex flex-wrap items-end gap-2" style={{ border: `1px solid ${LINE}`, background: '#f8fafc' }}>
                  <label className="text-[11px] font-semibold flex-1 min-w-[160px]" style={{ color: MUTED }}>
                    {t('orgStructure.name')}
                    <input
                      value={editing.draft.name}
                      onChange={(e) => setEditing({ level, draft: { ...editing.draft, name: e.target.value } })}
                      className="block w-full mt-1 rounded-lg border px-2.5 py-1.5 text-sm"
                      style={{ borderColor: LINE }}
                    />
                  </label>
                  <label className="text-[11px] font-semibold w-24" style={{ color: MUTED }}>
                    {t('orgStructure.code')}
                    <input
                      value={editing.draft.code}
                      maxLength={10}
                      onChange={(e) => setEditing({ level, draft: { ...editing.draft, code: e.target.value.toUpperCase() } })}
                      className="block w-full mt-1 rounded-lg border px-2.5 py-1.5 text-sm"
                      style={{ borderColor: LINE }}
                    />
                  </label>
                  {parents.length > 0 && (
                    <label className="text-[11px] font-semibold min-w-[150px]" style={{ color: MUTED }}>
                      {t(level === 'countries' ? 'orgStructure.region' : 'orgStructure.country')}
                      <select
                        value={editing.draft.parentId}
                        onChange={(e) => setEditing({ level, draft: { ...editing.draft, parentId: e.target.value } })}
                        className="block w-full mt-1 rounded-lg border px-2.5 py-1.5 text-sm bg-white"
                        style={{ borderColor: LINE }}
                      >
                        <option value="">—</option>
                        {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                  )}
                  <button type="button" onClick={() => void save()} disabled={busy} className="px-3 py-1.5 text-xs font-bold rounded-lg text-white" style={{ background: NAVY }}>
                    {t('common.save')}
                  </button>
                  <button type="button" onClick={() => { setEditing(null); setError(''); }} disabled={busy} className="px-3 py-1.5 text-xs font-semibold rounded-lg border bg-white" style={{ borderColor: LINE, color: NAVY }}>
                    {t('common.cancel')}
                  </button>
                </div>
              )}

              {nodes.length === 0 ? (
                <div className="text-xs py-3 px-3 rounded-lg" style={{ color: MUTED, background: '#f8fafc' }}>{t('orgStructure.none')}</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: MUTED }}>
                      <th className="text-left py-1.5 font-bold uppercase tracking-wide text-[10px]">{t('orgStructure.name')}</th>
                      <th className="text-left py-1.5 font-bold uppercase tracking-wide text-[10px]">{t('orgStructure.code')}</th>
                      {parents.length > 0 && <th className="text-left py-1.5 font-bold uppercase tracking-wide text-[10px]">{t(level === 'countries' ? 'orgStructure.region' : 'orgStructure.country')}</th>}
                      <th className="text-right py-1.5 font-bold uppercase tracking-wide text-[10px]">{t('orgStructure.departments')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((n) => (
                      <tr key={n.id} style={{ borderTop: `1px solid ${LINE}` }}>
                        <td className="py-2 font-semibold">{n.name}</td>
                        <td className="py-2 font-mono">{n.code}</td>
                        {parents.length > 0 && <td className="py-2">{parentName(level, n)}</td>}
                        <td className="py-2 text-right tabular-nums">{level === 'countries' ? '—' : n.departments}</td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="px-2 font-semibold hover:underline"
                            style={{ color: NAVY }}
                            onClick={() => setEditing({ level, draft: { id: n.id, name: n.name, code: n.code, parentId: n.parentId ?? '' } })}
                          >
                            {t('common.edit')}
                          </button>
                          <button type="button" className="px-2 font-semibold hover:underline" style={{ color: '#b91c1c' }} onClick={() => void archive(level, n)}>
                            {t('alerts.archive')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
