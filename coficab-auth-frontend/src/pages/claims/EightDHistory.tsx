import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../i18n';
import {
  EightDVersionDetail,
  EightDVersionSummary,
  eightDHistoryService,
} from '../../services/eightDHistoryService';

const NAVY = '#000168';

/** Human text for one stored value: booleans, empty values and the list of containment actions. */
function formatValue(field: string, raw: string | null | undefined, words: { empty: string; yes: string }): string {
  if (raw === null || raw === undefined || raw.trim() === '' || raw === 'false' || raw === '[]') return words.empty;
  if (raw === 'true') return words.yes;
  if (field === 'containmentActions') {
    try {
      const actions = JSON.parse(raw) as { title?: string; status?: string; owner?: string }[];
      return actions
        .map((a) => `• ${a.title || '—'}${a.status ? ` (${a.status})` : ''}${a.owner ? ` — ${a.owner}` : ''}`)
        .join('\n');
    } catch {
      return raw;
    }
  }
  return raw;
}

export default function EightDHistory({ claimId, accessToken }: { claimId: string; accessToken: string | null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<EightDVersionSummary[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<EightDVersionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const list = await eightDHistoryService.versions(claimId, accessToken);
      setVersions(list);
      setSelected((current) => current ?? list[0]?.version ?? null);
    } catch {
      setError(t('eightDHistory.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [claimId, accessToken, t]);

  useEffect(() => { if (open) void loadList(); }, [open, loadList]);

  useEffect(() => {
    if (!open || selected === null || !accessToken) return;
    let cancelled = false;
    setDetail(null);
    eightDHistoryService.version(claimId, selected, accessToken)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setError(t('eightDHistory.loadFailed')); });
    return () => { cancelled = true; };
  }, [open, selected, claimId, accessToken, t]);

  const when = (iso: string) =>
    new Date(iso).toLocaleString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const words = { empty: t('eightDHistory.empty'), yes: t('eightDHistory.yes') };
  const stepLabel = (step: number) => (step === 0 ? t('eightDHistory.statusGroup') : `D${step}`);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="e8d-btn"
        title={t('eightDHistory.open')}
      >
        <History size={14} /> {t('eightDHistory.open')}
      </button>

      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('eightDHistory.title')}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{ background: '#fff', borderRadius: 14, width: 'min(980px, 100%)', maxHeight: '88dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontWeight: 700, color: NAVY, fontSize: 16 }}>{t('eightDHistory.title')}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{t('eightDHistory.subtitle')}</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t('eightDHistory.close')} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {error && <div style={{ margin: 14, padding: '10px 12px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', minHeight: 0, flex: 1 }}>
              <div style={{ borderRight: '1px solid #e2e8f0', overflowY: 'auto' }}>
                {loading && <div style={{ padding: 16, fontSize: 13, color: '#64748b' }}>{t('eightDHistory.loading')}</div>}
                {!loading && versions.length === 0 && <div style={{ padding: 16, fontSize: 13, color: '#64748b' }}>{t('eightDHistory.none')}</div>}
                {versions.map((v) => (
                  <button
                    key={v.version}
                    type="button"
                    onClick={() => setSelected(v.version)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
                      borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontFamily: 'inherit',
                      background: selected === v.version ? '#eef2ff' : '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                      v{v.version}
                      <span style={{ fontWeight: 600, fontSize: 11, color: NAVY }}>{t(`eightDHistory.event.${v.eventType}`, { defaultValue: v.eventType })}</span>
                      {v.isCurrent && <span style={{ fontSize: 10, background: '#dcfce7', color: '#166534', borderRadius: 99, padding: '1px 7px' }}>{t('eightDHistory.current')}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{when(v.savedAt)}</div>
                    <div style={{ fontSize: 12, color: '#475569' }}>{v.savedByName || v.savedById || '—'}</div>
                  </button>
                ))}
              </div>

              <div style={{ overflowY: 'auto', padding: 16 }}>
                {!detail && selected !== null && !error && <div style={{ fontSize: 13, color: '#64748b' }}>{t('eightDHistory.loading')}</div>}
                {detail && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 2 }}>
                      v{detail.version} · {t(`eightDHistory.event.${detail.eventType}`, { defaultValue: detail.eventType })}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                      {when(detail.savedAt)} · {detail.savedByName || detail.savedById || '—'}
                    </div>
                    {detail.comment && (
                      <div style={{ fontSize: 13, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
                        {t('eightDHistory.comment')} : {detail.comment}
                      </div>
                    )}
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                      {detail.version === 1 ? t('eightDHistory.firstState') : t('eightDHistory.changes')}
                    </div>
                    {detail.changes.length === 0 && <div style={{ fontSize: 13, color: '#64748b' }}>{t('eightDHistory.noChange')}</div>}
                    {detail.changes.map((c) => (
                      <div key={c.field} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 10px', marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 4 }}>
                          {stepLabel(c.step)} · {t(`eightDHistory.fields.${c.field}`, { defaultValue: c.field })}
                        </div>
                        {detail.version > 1 && (
                          <div style={{ fontSize: 13, color: '#94a3b8', textDecoration: 'line-through', whiteSpace: 'pre-wrap' }}>
                            {formatValue(c.field, c.before, words)}
                          </div>
                        )}
                        <div style={{ fontSize: 13, color: '#0f172a', whiteSpace: 'pre-wrap' }}>{formatValue(c.field, c.after, words)}</div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
            <div style={{ padding: '10px 18px', borderTop: '1px solid #e2e8f0', fontSize: 12, color: '#64748b' }}>{t('eightDHistory.scopeNote')}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
