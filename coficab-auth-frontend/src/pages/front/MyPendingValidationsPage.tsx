import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getMyValidations, remindValidators, resubmitPlan, MyValidationItem } from '../../services/validationsService';

const NAVY = '#000168';
const BORDER = '#E2E8F0';

/** From this many days of waiting, the item is highlighted: it is time to remind the validators. */
export const LONG_WAIT_DAYS = 2;
export const PAGE_SIZES = [10, 25, 50];

export function waitingDays(since: string, now: number = Date.now()): number {
  const t = new Date(since).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / 86_400_000));
}

type Section = 'claims' | 'plans';
type Wait = 'all' | 'long' | 'reminded' | 'notReminded';
type Step = 'all' | 'toApprove' | 'returned' | 'ready' | 'inProgress';

/** Where a plan stands: waiting for the approval, returned, all actions done (to validate), or being carried out. */
function matchesStep(i: MyValidationItem, step: Step): boolean {
  const approval = i.approval ?? 'approved';
  switch (step) {
    case 'toApprove': return approval === 'pending';
    case 'returned': return approval === 'returned';
    case 'ready': return approval === 'approved' && i.ready;
    case 'inProgress': return approval === 'approved' && !i.ready;
    default: return true;
  }
}

/** What the page shows for a section, after the search and the filters (pure: tested on its own). */
export function selectItems(
  items: MyValidationItem[],
  opts: { section: Section; query: string; kind: string; wait: Wait; step: Step; now?: number },
): MyValidationItem[] {
  const q = opts.query.trim().toLowerCase();
  return items.filter((i) => {
    if ((opts.section === 'plans') !== (i.kind === 'capa')) return false;
    if (q && !`${i.title} ${i.reference ?? ''}`.toLowerCase().includes(q)) return false;
    if (opts.section === 'claims' && opts.kind !== 'all' && i.kind !== opts.kind) return false;
    if (opts.section === 'plans' && !matchesStep(i, opts.step)) return false;
    if (opts.wait === 'long' && waitingDays(i.since, opts.now) < LONG_WAIT_DAYS) return false;
    if (opts.wait === 'reminded' && i.reminderCount === 0) return false;
    if (opts.wait === 'notReminded' && i.reminderCount > 0) return false;
    return true;
  });
}

const KIND_TONE: Record<string, { bg: string; color: string }> = {
  fiveWhy: { bg: '#eff6ff', color: '#1d4ed8' },
  capa: { bg: '#ecfdf5', color: '#047857' },
  eightD: { bg: '#f5f3ff', color: '#6d28d9' },
};

const field: React.CSSProperties = { padding: '7px 10px', border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, background: '#fff', color: '#0f172a' };

/**
 * The employee's own validation queue: the analyses (5 Why, 8D) and the action plans they sent that an administrator has not decided
 * yet, with a button to remind the validators when it takes long (one reminder a day per item).
 */
const MyPendingValidationsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<MyValidationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const [section, setSection] = useState<Section>('claims');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [wait, setWait] = useState<Wait>('all');
  const [step, setStep] = useState<Step>('all');
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!accessToken) return;
    try {
      setItems(await getMyValidations(accessToken));
      setError(null);
    } catch {
      setError(t('myValidations.loadFailed'));
    }
  }, [accessToken, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [section, query, kind, wait, step, pageSize]);

  const all = useMemo(() => items ?? [], [items]);
  const counts = useMemo(() => ({
    claims: all.filter((i) => i.kind !== 'capa').length,
    plans: all.filter((i) => i.kind === 'capa').length,
  }), [all]);
  const shown = useMemo(() => selectItems(all, { section, query, kind, wait, step }), [all, section, query, kind, wait, step]);
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pages);
  const slice = shown.slice((current - 1) * pageSize, current * pageSize);

  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' }) : '');

  const resubmit = async (item: MyValidationItem) => {
    if (!accessToken) return;
    setSending(item.id);
    setNote(null);
    try {
      await resubmitPlan(accessToken, item.id);
      setNote({ ok: true, text: t('myValidations.resubmitted') });
    } catch {
      setNote({ ok: false, text: t('myValidations.remindFailed') });
    } finally {
      setSending(null);
      void load();
    }
  };

  const remind = async (item: MyValidationItem) => {
    if (!accessToken) return;
    setSending(item.id);
    setNote(null);
    try {
      await remindValidators(accessToken, item.kind, item.id);
      setNote({ ok: true, text: t('myValidations.reminded') });
    } catch (e: any) {
      const code = e?.response?.data?.code;
      setNote({
        ok: false,
        text: code === 'tooSoon' ? t('myValidations.tooSoon')
          : code === 'notPending' ? t('myValidations.notPending')
          : code === 'notReady' ? t('myValidations.planNotReady')
          : t('myValidations.remindFailed'),
      });
    } finally {
      setSending(null);
      void load();
    }
  };

  const tab = (id: Section, label: string, count: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={section === id}
      onClick={() => setSection(id)}
      style={{
        padding: '8px 18px', borderRadius: 999, border: `1px solid ${section === id ? NAVY : BORDER}`, cursor: 'pointer', fontWeight: 700, fontSize: 13,
        background: section === id ? NAVY : '#fff', color: section === id ? '#fff' : '#475569',
      }}
    >
      {label} <span style={{ opacity: 0.8 }}>({count})</span>
    </button>
  );

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ margin: 0, fontSize: 24, color: NAVY, fontWeight: 800 }}>{t('myValidations.title')}</h1>
      <p style={{ margin: '4px 0 16px', color: '#64748B', fontSize: 14 }}>{t('myValidations.subtitle')}</p>

      <div role="tablist" style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {tab('claims', t('myValidations.sectionClaims'), counts.claims)}
        {tab('plans', t('myValidations.sectionPlans'), counts.plans)}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('myValidations.search')}
          aria-label={t('myValidations.search')}
          style={{ ...field, flex: '1 1 220px', minWidth: 180 }}
        />
        {section === 'claims' ? (
          <select aria-label={t('myValidations.filterKind')} value={kind} onChange={(e) => setKind(e.target.value)} style={field}>
            <option value="all">{t('myValidations.allKinds')}</option>
            <option value="fiveWhy">{t('myValidations.kind.fiveWhy')}</option>
            <option value="eightD">{t('myValidations.kind.eightD')}</option>
          </select>
        ) : (
          <select aria-label={t('myValidations.filterStep')} value={step} onChange={(e) => setStep(e.target.value as Step)} style={field}>
            <option value="all">{t('myValidations.allSteps')}</option>
            <option value="toApprove">{t('myValidations.stepToApprove')}</option>
            <option value="returned">{t('myValidations.stepReturned')}</option>
            <option value="ready">{t('myValidations.stepReady')}</option>
            <option value="inProgress">{t('myValidations.stepInProgress')}</option>
          </select>
        )}
        <select aria-label={t('myValidations.filterWait')} value={wait} onChange={(e) => setWait(e.target.value as Wait)} style={field}>
          <option value="all">{t('myValidations.allWaits')}</option>
          <option value="long">{t('myValidations.waitLong', { count: LONG_WAIT_DAYS })}</option>
          <option value="notReminded">{t('myValidations.waitNotReminded')}</option>
          <option value="reminded">{t('myValidations.waitReminded')}</option>
        </select>
      </div>

      {note && (
        <p role="status" style={{ margin: '0 0 12px', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: note.ok ? '#ECFDF5' : '#FEF2F2', color: note.ok ? '#065F46' : '#B91C1C' }}>{note.text}</p>
      )}
      {error && <p role="alert" style={{ color: '#B91C1C' }}>{error}</p>}
      {items === null && !error && <p style={{ color: '#64748B' }}>{t('common.loading')}</p>}
      {items !== null && shown.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, color: '#64748B' }}>
          {all.length === 0 ? t('myValidations.empty') : t('myValidations.noMatch')}
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {slice.map((item) => {
          const days = waitingDays(item.since);
          const long = item.ready && days >= LONG_WAIT_DAYS;
          const returned = item.kind === 'capa' && item.approval === 'returned';
          const tone = KIND_TONE[item.kind] ?? KIND_TONE.fiveWhy;
          return (
            <div key={`${item.kind}-${item.id}`} style={{ background: '#fff', border: `1px solid ${BORDER}`, borderLeft: `4px solid ${long ? '#F59E0B' : NAVY}`, borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: tone.bg, color: tone.color }}>
                  {t(`myValidations.kind.${item.kind}`)}
                </span>
                <div style={{ marginTop: 6, fontWeight: 700, color: NAVY, fontSize: 15 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  {item.reference ? `${item.reference} · ` : ''}{t('myValidations.sentOn', { date: fmt(item.since) })}
                </div>
                {item.kind === 'capa' && item.approval === 'returned' ? (
                  <div style={{ fontSize: 12.5, marginTop: 4, fontWeight: 600, color: '#B91C1C' }}>
                    {t('myValidations.planReturned')}
                    {item.approvalComment ? <span style={{ display: 'block', fontWeight: 400, color: '#475569' }}>{t('myValidations.reason', { reason: item.approvalComment })}</span> : null}
                  </div>
                ) : item.kind === 'capa' && item.approval === 'pending' ? (
                  <div style={{ fontSize: 12.5, marginTop: 4, fontWeight: 600, color: long ? '#B45309' : '#475569' }}>
                    {t('myValidations.planToApprove')}
                    {days >= 1 ? ` · ${t('myValidations.waitingDays', { count: days })}` : ''}
                    {item.lastReminderAt ? ` · ${t('myValidations.lastReminder', { date: fmt(item.lastReminderAt) })}` : ''}
                    <span style={{ display: 'block', fontWeight: 400, color: '#64748B' }}>{t('myValidations.planLocked')}</span>
                  </div>
                ) : item.kind === 'capa' && !item.ready ? (
                  <div style={{ fontSize: 12.5, marginTop: 4, fontWeight: 600, color: '#475569' }}>
                    {t('myValidations.planInProgress', { pct: item.progress ?? 0 })}
                    <span style={{ display: 'block', fontWeight: 400, color: '#64748B' }}>{t('myValidations.planNotReady')}</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, marginTop: 4, fontWeight: 600, color: long ? '#B45309' : '#475569' }}>
                    {days < 1 ? t('myValidations.waitingToday') : t('myValidations.waitingDays', { count: days })}
                    {item.lastReminderAt ? ` · ${t('myValidations.lastReminder', { date: fmt(item.lastReminderAt) })}` : ''}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={() => navigate(item.linkPath)}>{t('myValidations.open')}</button>
                {returned ? (
                  <button type="button" className="btn btn-primary" disabled={sending === item.id} onClick={() => void resubmit(item)} style={{ background: NAVY }}>
                    {sending === item.id ? t('myValidations.sending') : t('myValidations.resubmit')}
                  </button>
                ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!item.canRemind || sending === item.id}
                  title={!item.ready ? t('myValidations.planNotReady') : !item.canRemind ? t('myValidations.tooSoon') : undefined}
                  onClick={() => void remind(item)}
                  style={{ background: NAVY, opacity: !item.canRemind || sending === item.id ? 0.4 : 1, cursor: !item.canRemind ? 'not-allowed' : 'pointer' }}
                >
                  {sending === item.id ? t('myValidations.sending') : item.canRemind || !item.ready ? t('myValidations.remind') : t('myValidations.alreadyReminded')}
                </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {shown.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 16, fontSize: 13, color: '#475569' }}>
          <span>{t('myValidations.total', { count: shown.length })}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select aria-label={t('myValidations.perPage')} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={field}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / {t('myValidations.pageWord')}</option>)}
            </select>
            <button type="button" className="btn btn-secondary" disabled={current <= 1} onClick={() => setPage(current - 1)}>{t('myValidations.previous')}</button>
            <span>{t('myValidations.pageOf', { page: current, pages })}</span>
            <button type="button" className="btn btn-secondary" disabled={current >= pages} onClick={() => setPage(current + 1)}>{t('myValidations.next')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyPendingValidationsPage;
