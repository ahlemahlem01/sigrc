import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { qualityAnalysisService } from '../services/qualityAnalysisService';
import { dateLocale } from '../i18n';
import { useReferenceLists } from '../hooks/useReferenceLists';
import { defectLabel, defectValueFromInput } from '../utils/defectLabel';
import type { Claim, ClaimCreationSheet as Sheet, ValidateClaimCreationPayload } from '../types/qualityAnalysis';

const MAX_DAYS_AHEAD = 180;
const dayOf = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');
const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const show = (day: string) => (day ? new Date(`${day}T00:00:00`).toLocaleDateString(dateLocale()) : '—');

/** Same rule as the server: creation day + ceil(P80) calendar days. */
const suggestedDay = (createdAt?: string | null, daysP80?: number | null): string => {
  if (!createdAt || daysP80 == null || !Number.isFinite(Number(daysP80))) return '';
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return '';
  const d = new Date(Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.ceil(Number(daysP80))));
  return d.toISOString().slice(0, 10);
};

interface Props {
  claimId: string;
  /** 'create' right after the claim was declared, 'detail' when it is reopened from the claim detail. */
  origin: 'create' | 'detail';
  /** Called when the sheet closes; `validated` is true when the creator confirmed it just now. */
  onClose: (validated: boolean) => void;
}

type Form = {
  title: string; clientId: string; defectType: string; severity: string; lotNumber: string; serialNumber: string; description: string;
  producedQuantity: string; defectiveQuantity: string;
};

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

const toForm = (c: Claim): Form => ({
  title: c.title || '', clientId: c.clientId || '', defectType: c.defectType || '', severity: SEVERITIES.find((x) => x.toLowerCase() === (c.severity || '').toLowerCase()) ?? 'Medium',
  lotNumber: c.lotNumber || '', serialNumber: c.serialNumber || '', description: c.description || '',
  producedQuantity: c.producedQuantity != null ? String(c.producedQuantity) : '', defectiveQuantity: c.defectiveQuantity != null ? String(c.defectiveQuantity) : '',
});

const box: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', font: 'inherit', width: '100%', boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600, color: '#0f2b5c' };

/**
 * The sheet the creator sees right after declaring a claim: they confirm it or correct any field, and choose the estimated date
 * (by default the date suggested by the delay model). Everything they change is kept in the claim history with the old and the new value.
 * After confirmation, and for everyone else, the sheet is read-only. The person in charge never edits the date here.
 */
export const ClaimCreationSheet: React.FC<Props> = ({ claimId, origin, onClose }) => {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const { defectTypes, clients } = useReferenceLists();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [liveSuggested, setLiveSuggested] = useState<string | null>(null);
  const [day, setDay] = useState('');
  const [touched, setTouched] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        qualityAnalysisService.getClaimCreationSheet(claimId, accessToken || undefined),
        qualityAnalysisService.getClaimById(claimId, accessToken || undefined),
      ]);
      setSheet(s);
      setClaim(c);
      setForm(toForm(c));
      setDay(dayOf(s.deadline) || dayOf(s.suggestedDeadline));
      setTouched(false);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [claimId, accessToken]);

  useEffect(() => { void load(); }, [load]);

  const editable = !!sheet?.canEdit;
  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = key === 'defectType' ? defectValueFromInput(e.target.value) : e.target.value;
    setForm((f) => (f ? { ...f, [key]: value } : f));
  };

  // the suggestion follows the defect and the severity the creator is correcting
  const dirtyEstimate = !!claim && !!form && (form.defectType !== (claim.defectType || '') || form.severity.toLowerCase() !== (claim.severity || '').toLowerCase());
  useEffect(() => {
    // live estimate when the creator corrects the defect or the severity, or when the claim was stored without an estimate
    const needsLive = dirtyEstimate || !sheet?.suggestedDeadline;
    if (!claim || !form || !needsLive || !form.defectType || !form.severity) { setLiveSuggested(null); return; }
    let cancelled = false;
    qualityAnalysisService.estimateClaimResolution(form.defectType, form.severity, accessToken || undefined)
      .then((r) => { if (!cancelled) setLiveSuggested(r?.available && r.daysP80 != null ? suggestedDay(claim.createdAt, Number(r.daysP80)) : null); })
      .catch(() => { if (!cancelled) setLiveSuggested(null); });
    return () => { cancelled = true; };
  }, [sheet?.suggestedDeadline, claim, form?.defectType, form?.severity, dirtyEstimate, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggested = liveSuggested ?? dayOf(sheet?.suggestedDeadline);
  const shownDay = touched ? day : (dayOf(sheet?.deadline) || suggested || day);
  const differsFromSuggestion = touched && !!shownDay && shownDay !== suggested;
  const today = new Date();
  const max = new Date(today); max.setDate(max.getDate() + MAX_DAYS_AHEAD);

  const changes = useMemo(() => {
    if (!claim || !form) return undefined;
    const base = toForm(claim);
    const out: NonNullable<ValidateClaimCreationPayload['changes']> = {};
    if (form.title.trim() && form.title !== base.title) out.title = form.title.trim();
    if (form.clientId.trim() && form.clientId !== base.clientId) out.clientId = form.clientId.trim();
    if (form.defectType.trim() && form.defectType !== base.defectType) out.defectType = form.defectType.trim();
    if (form.severity && form.severity.toLowerCase() !== base.severity.toLowerCase()) out.severity = form.severity;
    if (form.lotNumber.trim() && form.lotNumber !== base.lotNumber) out.lotNumber = form.lotNumber.trim();
    if (form.serialNumber.trim() && form.serialNumber !== base.serialNumber) out.serialNumber = form.serialNumber.trim();
    if (form.description.trim() && form.description !== base.description) out.description = form.description.trim();
    if (form.producedQuantity !== '' && form.producedQuantity !== base.producedQuantity) out.producedQuantity = Number(form.producedQuantity);
    if (form.defectiveQuantity !== '' && form.defectiveQuantity !== base.defectiveQuantity) out.defectiveQuantity = Number(form.defectiveQuantity);
    return Object.keys(out).length ? out : undefined;
  }, [claim, form]);

  const confirm = async () => {
    if (!sheet || !editable || busy) return;
    setBusy(true);
    setError(null);
    try {
      await qualityAnalysisService.validateClaimCreation(claimId, {
        changes,
        ...(touched && shownDay ? { deadline: shownDay, deadlineReason: reason.trim() } : {}),
      }, accessToken || undefined);
      onClose(true);
    } catch (e: any) {
      const code = e?.response?.data?.code as string | undefined;
      setError(code
        ? t(`creationSheet.errors.${code}`, { defaultValue: t('creationSheet.errors.generic') })
        : (e?.response?.data?.errors && Object.values(e.response.data.errors as Record<string, string[]>).flat()[0]) || e?.response?.data?.message || t('creationSheet.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof Form, text: string, node: React.ReactNode, readValue: string) => (
    <label key={key} style={label}>
      {text}
      {editable ? node : <span style={{ fontWeight: 400, color: '#0f172a', whiteSpace: 'pre-wrap' }}>{readValue || '—'}</span>}
    </label>
  );

  const eventLine = (ev: Sheet['history'][number]) => {
    const when = new Date(ev.createdAt).toLocaleString(dateLocale());
    let detail = ev.detail || '';
    if (ev.actionType === 'claim_creation_edited') {
      detail = detail.split(' ; ').map((part) => {
        const i = part.indexOf(':');
        return i > 0 ? `${t(`creationSheet.fields.${part.slice(0, i)}`, { defaultValue: part.slice(0, i) })}${part.slice(i)}` : part;
      }).join(' ; ');
    }
    return (
      <li key={`${ev.actionType}-${ev.createdAt}`} style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.45 }}>
        <strong>{t(`creationSheet.events.${ev.actionType}`, { defaultValue: ev.actionType })}</strong>
        {' · '}{ev.actorName} · <span style={{ color: '#64748b' }}>{when}</span>
        {detail && ev.actionType !== 'claim_created' && ev.actionType !== 'claim_creation_validated' && <div style={{ color: '#475569' }}>{detail}</div>}
      </li>
    );
  };

  const close = () => !busy && onClose(false);

  return (
    <div role="dialog" aria-modal="true" aria-label={t('creationSheet.title')}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={close}>
      {/* the card clips its corners; only the inner part scrolls, so the scrollbar stays inside the rounded shape */}
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, width: 'min(680px, 100%)', maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', color: '#0f172a', boxShadow: '0 24px 60px rgba(15,23,42,.35)' }}>
      <div className="pfe-sheet-scroll" style={{ padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, scrollbarGutter: 'stable', scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <strong style={{ color: '#0f2b5c', fontSize: 17 }}>{t('creationSheet.title')}</strong>
            {claim?.reference && <span className="pfe-ref-pill" style={{ marginLeft: 8 }}>{claim.reference}</span>}
          </div>
          <button type="button" onClick={close} aria-label={t('creationSheet.close')} style={{ background: 'none', border: 0, cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {loadError && <p role="alert" style={{ margin: 0, color: '#b91c1c', fontSize: 13 }}>{t('creationSheet.loadFailed')}</p>}
        {!sheet || !form ? (!loadError && <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>{t('creationSheet.loading')}</p>) : (
          <>
            <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
              {editable ? t(origin === 'create' ? 'creationSheet.introCreate' : 'creationSheet.introEdit') : sheet.validated ? t('creationSheet.introValidated', { name: sheet.validatedByName || sheet.creatorName, date: sheet.validatedAt ? new Date(sheet.validatedAt).toLocaleDateString(dateLocale()) : '' }) : sheet.isCreator ? t('creationSheet.introClosed') : t('creationSheet.introReadOnly', { name: sheet.creatorName })}
            </p>
            <p style={{ margin: 0, fontSize: 12.5, color: '#475569' }}>
              {t('creationSheet.createdBy')} <strong>{sheet.creatorName || '—'}</strong> · {t('creationSheet.assignedTo')} <strong>{sheet.assigneeName || t('creationSheet.notAssigned')}</strong> <span style={{ color: '#94a3b8' }}>({t('creationSheet.readOnly')})</span>
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {field('title', t('creationSheet.fields.title'), <input style={box} value={form.title} onChange={set('title')} />, form.title)}
              {field('clientId', t('creationSheet.fields.client'), <><input style={box} list="sheet-clients" value={form.clientId} onChange={set('clientId')} /><datalist id="sheet-clients">{clients.map((d) => <option key={d} value={d} />)}</datalist></>, form.clientId)}
              {field('defectType', t('creationSheet.fields.defect'), <><input style={box} list="sheet-defects" value={defectLabel(form.defectType)} onChange={set('defectType')} /><datalist id="sheet-defects">{defectTypes.map((d) => <option key={d} value={defectLabel(d)} />)}</datalist></>, defectLabel(form.defectType))}
              {field('severity', t('creationSheet.fields.severity'), (
                <select style={box} value={form.severity} onChange={set('severity')}>
                  <option value="Low">{t('claimStatus.severityLow')}</option>
                  <option value="Medium">{t('claimStatus.severityMedium')}</option>
                  <option value="High">{t('claimStatus.severityHigh')}</option>
                  <option value="Critical">{t('claimStatus.severityCritical')}</option>
                </select>
              ), t(`claimStatus.severity${form.severity.charAt(0).toUpperCase()}${form.severity.slice(1).toLowerCase()}`, { defaultValue: form.severity }))}
              {field('lotNumber', t('creationSheet.fields.lot'), <input style={box} value={form.lotNumber} onChange={set('lotNumber')} />, form.lotNumber)}
              {field('serialNumber', t('creationSheet.fields.serial'), <input style={box} value={form.serialNumber} onChange={set('serialNumber')} />, form.serialNumber)}
              {field('producedQuantity', t('creationSheet.fields.produced'), <input style={box} type="number" min={0} value={form.producedQuantity} onChange={set('producedQuantity')} />, form.producedQuantity)}
              {field('defectiveQuantity', t('creationSheet.fields.defective'), <input style={box} type="number" min={0} value={form.defectiveQuantity} onChange={set('defectiveQuantity')} />, form.defectiveQuantity)}
            </div>
            {field('description', t('creationSheet.fields.description'), <textarea style={{ ...box, resize: 'vertical' }} rows={3} value={form.description} onChange={set('description')} />, form.description)}

            <div style={{ border: '1px solid #dbe4f3', borderRadius: 10, padding: 12, background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <CalendarClock size={16} style={{ color: '#0f2b5c' }} />
                <strong style={{ color: '#0f2b5c', fontSize: 14 }}>{t('creationSheet.estimatedDate')}</strong>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{show(editable ? shownDay : (dayOf(sheet.deadline) || suggested))}</span>
                {editable && (
                  <button type="button" className="pfe-cv-btn" onClick={() => { setEditingDate((v) => !v); if (!touched) setDay(shownDay); }}
                    style={{ padding: '5px 10px', fontSize: 12 }}>{t('creationSheet.modifyDate')}</button>
                )}
              </div>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {suggested ? t('creationSheet.suggestedBy', { date: show(suggested) }) : t('creationSheet.noSuggestion')}
              </span>
              {editable && shownDay && <span style={{ fontSize: 12, color: '#0f2b5c', fontWeight: 600 }}>{t('creationSheet.appliedOnConfirm')}</span>}
              {editable && editingDate && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={label}>
                    {t('creationSheet.newDate')}
                    <input type="date" style={{ ...box, maxWidth: 200 }} value={shownDay} min={toInput(today)} max={toInput(max)}
                      onChange={(e) => { setDay(e.target.value); setTouched(true); }} />
                  </label>
                  {differsFromSuggestion && (
                    <label style={label}>
                      {t('creationSheet.reason')} <span style={{ fontWeight: 400, color: '#64748b' }}>({t('creationSheet.reasonHint')})</span>
                      <textarea style={{ ...box, resize: 'vertical' }} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                    </label>
                  )}
                </div>
              )}
            </div>

            <div>
              <strong style={{ fontSize: 13, color: '#0f2b5c' }}>{t('creationSheet.trace')}</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {sheet.history.map(eventLine)}
              </ul>
            </div>

            {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={close} disabled={busy} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>
                {editable ? t('creationSheet.later') : t('creationSheet.close')}
              </button>
              {editable && (
                <button type="button" onClick={confirm} disabled={busy}
                  style={{ padding: '8px 14px', borderRadius: 8, border: 0, background: '#1d4ed8', color: '#fff', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.55 : 1 }}>
                  <CheckCircle2 size={15} /> {busy ? t('creationSheet.saving') : shownDay ? t('creationSheet.confirmWithDate', { date: show(shownDay) }) : t('creationSheet.confirm')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
};
