import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { resetReferenceListsCache } from '../../hooks/useReferenceLists';
import {
  DuplicateGroup,
  ReferenceItem,
  ReferenceListKey,
  ReferenceLists,
  referenceListsService,
} from '../../services/referenceListsService';

const NAVY = '#000168';
const LINE = '#e4e8f2';
const LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VOCABULARY: ReferenceListKey[] = ['client', 'production-line', 'shift', 'defect-type'];
const TABS: ReferenceListKey[] = [...VOCABULARY, 'severity'];
const STRICT_KEYS: ReferenceListKey[] = ['client', 'production-line', 'shift'];

const ReferenceListsPage: React.FC = () => {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [lists, setLists] = useState<ReferenceLists['lists'] | null>(null);
  const [dirty, setDirty] = useState<Record<ReferenceListKey, boolean>>({ 'defect-type': false, severity: false, client: false, 'production-line': false, shift: false });
  const [newValue, setNewValue] = useState<Record<string, string>>({});
  const [strict, setStrict] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<ReferenceListKey>('client');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [kept, setKept] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      const got = await referenceListsService.get(accessToken);
      setLists(got.lists);
      setStrict(got.strict ?? {});
    } catch (e: any) {
      setMessage({ kind: 'error', text: e?.response?.data?.message || t('referenceLists.loadFailed') });
    }
  }, [accessToken, t]);

  const loadDuplicates = useCallback(async () => {
    if (!accessToken) return;
    try {
      setDuplicates(await referenceListsService.duplicates(accessToken));
    } catch {
      setDuplicates([]);
    }
  }, [accessToken]);

  useEffect(() => { void load(); void loadDuplicates(); }, [load, loadDuplicates]);

  const patch = (key: ReferenceListKey, value: string, change: Partial<ReferenceItem>) => {
    if (!lists) return;
    setLists({ ...lists, [key]: lists[key].map((i) => (i.value === value ? { ...i, ...change } : i)) });
    setDirty({ ...dirty, [key]: true });
    setMessage(null);
  };

  const run = async (action: () => Promise<ReferenceLists>, key?: ReferenceListKey) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await action();
      setLists(next.lists);
      setStrict(next.strict ?? {});
      resetReferenceListsCache(next);
      void loadDuplicates();
      if (key) setDirty((d) => ({ ...d, [key]: false }));
      setMessage({ kind: 'ok', text: t('referenceLists.saved') });
    } catch (e: any) {
      setMessage({ kind: 'error', text: e?.response?.data?.message || t('referenceLists.saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  const save = (key: ReferenceListKey) =>
    accessToken && lists && run(() => referenceListsService.save(key, lists[key], accessToken), key);

  const addValue = (key: ReferenceListKey) => {
    const value = (newValue[key] ?? '').trim();
    if (!lists || !value) return;
    if (lists[key].some((i) => i.value.toLowerCase() === value.toLowerCase())) {
      setMessage({ kind: 'error', text: t('referenceLists.alreadyListed', { value }) });
      return;
    }
    const sortOrder = Math.max(0, ...lists[key].map((i) => i.sortOrder)) + 1;
    setLists({ ...lists, [key]: [...lists[key], { value, label: null, sortOrder, isActive: true, mergedInto: null }] });
    setDirty({ ...dirty, [key]: true });
    setNewValue({ ...newValue, [key]: '' });
    setMessage(null);
  };

  const toggleStrict = (key: ReferenceListKey, strict: boolean) =>
    accessToken && run(() => referenceListsService.setStrict(key, strict, accessToken));

  const importFromClaims = (key: ReferenceListKey) =>
    accessToken && run(() => referenceListsService.importExisting(key, accessToken), key);

  const merge = (group: DuplicateGroup) => {
    if (!accessToken) return;
    const canonical = kept[group.key] ?? group.variants[0].value;
    const variants = group.variants.map((v) => v.value).filter((v) => v !== canonical);
    return run(() => referenceListsService.merge(canonical, variants, accessToken));
  };

  const unmerge = (value: string) => accessToken && run(() => referenceListsService.unmerge(value, accessToken));

  const input = 'px-2 py-1 text-sm rounded-lg border bg-white';
  const card = { border: `1px solid ${LINE}` } as const;
  const saveButton = (key: ReferenceListKey) => (
    <button
      type="button"
      onClick={() => void save(key)}
      disabled={!dirty[key] || busy}
      className="px-3 py-1.5 text-sm font-bold rounded-lg text-white disabled:opacity-40"
      style={{ background: NAVY }}
    >
      {t('referenceLists.save')}
    </button>
  );

  return (
    <div className="pb-6 max-w-4xl">
      <div className="mb-4">
        <div className="text-[10px] font-bold uppercase tracking-[1.4px] mb-1" style={{ color: NAVY }}>
          {t('referenceLists.eyebrow')}
        </div>
        <h1 className="text-xl font-bold m-0" style={{ color: '#0d1340' }}>{t('referenceLists.title')}</h1>
        <p className="text-sm mt-1 mb-0 text-slate-500">{t('referenceLists.subtitle')}</p>
      </div>

      {message && (
        <div
          className={`mb-4 rounded-xl text-sm px-4 py-3 ${message.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}
          style={{ border: `1px solid ${message.kind === 'ok' ? '#a7f3d0' : '#fecaca'}` }}
        >
          {message.text}
        </div>
      )}

      {lists && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-4" role="tablist">
            {TABS.map((key) => {
              const count = key === 'severity' ? lists.severity.filter((i) => i.isActive).length : lists[key].filter((i) => i.isActive && !i.mergedInto).length;
              const on = tab === key;
              return (
                <button key={key} type="button" role="tab" aria-selected={on} onClick={() => { setTab(key); setMessage(null); }}
                  className="px-3 py-1.5 text-sm font-semibold rounded-lg border"
                  style={on ? { background: NAVY, color: '#fff', borderColor: NAVY } : { background: '#fff', color: NAVY, borderColor: LINE }}>
                  {key === 'severity' ? t('referenceLists.severity') : t(`referenceLists.vocab.${key}.title`)}
                  <span className="ml-1.5 text-xs opacity-70">{count}</span>
                  {dirty[key] && <span className="ml-1" aria-label={t('referenceLists.unsaved')}>•</span>}
                </button>
              );
            })}
          </div>

          {tab === 'defect-type' && duplicates.length > 0 && (
            <section className="rounded-xl bg-amber-50 shadow-sm p-4 mb-4" style={{ border: '1px solid #fde68a' }}>
              <h2 className="text-sm font-bold m-0 mb-1">{t('referenceLists.duplicates')}</h2>
              <p className="text-xs text-slate-600 mt-0 mb-3">{t('referenceLists.duplicatesHelp')}</p>
              {duplicates.map((group) => {
                const keptValue = kept[group.key] ?? group.variants[0].value;
                return (
                  <div key={group.key} className="bg-white rounded-lg p-3 mb-2" style={{ border: `1px solid ${LINE}` }}>
                    <div className="text-xs text-slate-500 mb-1">{t('referenceLists.keepWhich')}</div>
                    {group.variants.map((v) => (
                      <label key={v.value} className="flex items-center gap-2 text-sm py-0.5">
                        <input type="radio" name={`keep-${group.key}`} checked={keptValue === v.value}
                          onChange={() => setKept({ ...kept, [group.key]: v.value })} />
                        <span>{v.value}</span>
                        <span className="text-xs text-slate-500">{t('referenceLists.claimsCount', { count: v.claims })}</span>
                      </label>
                    ))}
                    <button type="button" onClick={() => void merge(group)} disabled={busy}
                      className="mt-2 px-3 py-1 text-sm font-bold rounded-lg text-white disabled:opacity-40" style={{ background: NAVY }}>
                      {t('referenceLists.merge')}
                    </button>
                  </div>
                );
              })}
            </section>
          )}

          {tab === 'defect-type' && lists['defect-type'].some((i) => i.mergedInto) && (
            <section className="rounded-xl bg-white shadow-sm p-4 mb-4" style={card}>
              <h2 className="text-sm font-bold m-0 mb-1">{t('referenceLists.mergedTitle')}</h2>
              <p className="text-xs text-slate-500 mt-0 mb-2">{t('referenceLists.mergedHelp')}</p>
              {lists['defect-type'].filter((i) => i.mergedInto).map((i) => (
                <div key={i.value} className="flex items-center gap-2 text-sm py-0.5">
                  <span>{i.value}</span>
                  <span className="text-slate-400">→</span>
                  <span className="font-semibold">{i.mergedInto}</span>
                  <button type="button" onClick={() => void unmerge(i.value)} disabled={busy}
                    className="ml-2 text-xs underline disabled:opacity-40" style={{ color: NAVY }}>
                    {t('referenceLists.undo')}
                  </button>
                </div>
              ))}
            </section>
          )}

          {VOCABULARY.filter((k) => k === tab).map((key) => {
            const items = lists[key].filter((i) => !i.mergedInto);
            return (
              <section key={key} className="rounded-xl bg-white shadow-sm p-4 mb-4" style={card}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <h2 className="text-sm font-bold m-0">{t(`referenceLists.vocab.${key}.title`)}</h2>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void importFromClaims(key)} disabled={busy}
                      className="px-3 py-1.5 text-sm font-semibold rounded-lg border bg-white disabled:opacity-40" style={{ borderColor: LINE, color: NAVY }}>
                      {t('referenceLists.importFromClaims')}
                    </button>
                    {saveButton(key)}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-0 mb-3">{t(`referenceLists.vocab.${key}.help`)}</p>
                {STRICT_KEYS.includes(key) && (
                  <label className="flex items-start gap-2 text-sm mb-3 p-3 rounded-lg bg-slate-50" style={{ border: `1px solid ${LINE}` }}>
                    <input type="checkbox" className="mt-0.5" checked={!!lists && !!strict[key]} disabled={busy || dirty[key]}
                      onChange={(e) => void toggleStrict(key, e.target.checked)} />
                    <span>
                      <span className="font-semibold">{t('referenceLists.strictLabel')}</span>
                      <span className="block text-xs text-slate-500">{dirty[key] ? t('referenceLists.strictSaveFirst') : t('referenceLists.strictHelp')}</span>
                    </span>
                  </label>
                )}
                <div className="flex gap-2 mb-3">
                  <input className={`${input} w-64`} placeholder={t(`referenceLists.vocab.${key}.placeholder`)} value={newValue[key] ?? ''}
                    onChange={(e) => setNewValue({ ...newValue, [key]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addValue(key); } }} />
                  <button type="button" onClick={() => addValue(key)} disabled={busy || !(newValue[key] ?? '').trim()}
                    className="px-3 py-1 text-sm font-bold rounded-lg text-white disabled:opacity-40" style={{ background: NAVY }}>
                    {t('referenceLists.add')}
                  </button>
                </div>
                {items.length === 0 ? (
                  <p className="text-sm text-slate-400 m-0">{t('referenceLists.emptyList')}</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {items.map((i) => (
                        <tr key={i.value} className={i.isActive ? '' : 'opacity-50'}>
                          <td className="py-1 pr-2">{i.value}</td>
                          <td className="py-1 pr-2 w-20">
                            <input className={`${input} w-16`} type="number" value={i.sortOrder}
                              onChange={(e) => patch(key, i.value, { sortOrder: Number(e.target.value) || 0 })} />
                          </td>
                          <td className="py-1 w-24">
                            <label className="text-xs">
                              <input type="checkbox" checked={i.isActive} onChange={(e) => patch(key, i.value, { isActive: e.target.checked })} />{' '}
                              {t('referenceLists.active')}
                            </label>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}

          {tab === 'severity' && (
          <section className="rounded-xl bg-white shadow-sm p-4" style={card}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-sm font-bold m-0">{t('referenceLists.severity')}</h2>
              {saveButton('severity')}
            </div>
            <p className="text-xs text-slate-500 mt-0 mb-3">{t('referenceLists.severityHelp')}</p>
            <table className="w-full text-sm">
              <tbody>
                {LEVELS.map((level) => {
                  const i = lists.severity.find((x) => x.value === level);
                  if (!i) return null;
                  return (
                    <tr key={level} className={i.isActive ? '' : 'opacity-50'}>
                      <td className="py-1 pr-2 font-mono text-xs">{level}</td>
                      <td className="py-1 pr-2">
                        <input className={`${input} w-56`} placeholder={t('referenceLists.defaultWording')} value={i.label ?? ''}
                          onChange={(e) => patch('severity', level, { label: e.target.value })} />
                      </td>
                      <td className="py-1 pr-2">
                        <input className={`${input} w-16`} type="number" value={i.sortOrder}
                          onChange={(e) => patch('severity', level, { sortOrder: Number(e.target.value) || 0 })} />
                      </td>
                      <td className="py-1">
                        <label className="text-xs">
                          <input type="checkbox" checked={i.isActive} onChange={(e) => patch('severity', level, { isActive: e.target.checked })} />{' '}
                          {t('referenceLists.active')}
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          )}
        </>
      )}
    </div>
  );
};

export default ReferenceListsPage;
