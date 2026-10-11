import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Lock,
  Save,
  Send,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  eightDService,
  EightDDossier,
  SaveEightDDossier,
} from '../../services/qualityAnalysisService';
import {
  ContainmentAction,
  containmentActionTitle,
  containmentStatusLabel,
  mergeContainmentActions,
  requiredContainmentDone,
  toSaveContainmentActions,
} from '../../utils/eightDContainment';
import { OriginHint } from './EightDOriginHint';
import EightDHistory from './EightDHistory';
import { AnalysisToolsNav } from './AnalysisToolsNav';
import { PriorityCauseBanner } from './PriorityCause';
import { D4ChainChecklist } from './D4Chain';
import { useD4Order } from './D4Order';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

const NAVY = '#000168';

/** Coaching copy for D1–D8 in the UI language. */
const stepMeta = (n: number): { title: string; ask: string; why: string; how: string } | undefined =>
  n >= 1 && n <= 8
    ? {
        title: i18n.t(`eightD.step${n}.title`),
        ask: i18n.t(`eightD.step${n}.ask`),
        why: i18n.t(`eightD.step${n}.why`),
        how: i18n.t(`eightD.step${n}.how`),
      }
    : undefined;

function downloadBlob(blob: Blob, name: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.URL.revokeObjectURL(url);
}

function statusLabel(code?: string) {
  switch (String(code || '').toUpperCase()) {
    case 'PENDING_VALIDATION': return { text: i18n.t('eightD.statusPending'), bg: '#fff7ed', color: '#9a3412' };
    case 'CLOSED':
    case 'VALIDATED': return { text: i18n.t('eightD.statusClosed'), bg: '#ecfdf5', color: '#047857' };
    case 'REJECTED': return { text: i18n.t('eightD.statusRejected'), bg: '#fef2f2', color: '#b91c1c' };
    default: return { text: i18n.t('eightD.statusOpen'), bg: '#eff6ff', color: '#1d4ed8' };
  }
}

const EightDPage: React.FC = () => {
  const { t } = useTranslation();
  const { claimId } = useParams<{ claimId: string }>();
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const d4Order = useD4Order(claimId);
  const isAdmin = user && (
    Array.isArray(user.role)
      ? user.role.some((r) => ['admin', 'superadmin', 'admin_quality'].includes(String(r).toLowerCase()))
      : ['admin', 'superadmin', 'admin_quality'].includes(String(user.role).toLowerCase())
  );
  const myName = user?.fullName || user?.name || user?.email || '';

  const [dossier, setDossier] = useState<EightDDossier | null>(null);
  const [active, setActive] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const [championName, setChampionName] = useState('');
  const [teamMembers, setTeamMembers] = useState('');
  const [containmentOwner, setContainmentOwner] = useState('');
  const [containmentVerified, setContainmentVerified] = useState(false);
  const [containmentNotes, setContainmentNotes] = useState('');
  const [containmentActions, setContainmentActions] = useState<ContainmentAction[]>(() => mergeContainmentActions());
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [effectivenessMethod, setEffectivenessMethod] = useState(() => i18n.t('eightD.defaultMethod'));
  const [lotsChecked, setLotsChecked] = useState('3');
  const [defectsFound, setDefectsFound] = useState('0');
  const [effectivenessNotes, setEffectivenessNotes] = useState('');
  const [effectivenessValidated, setEffectivenessValidated] = useState(false);
  const [preventiveDescription, setPreventiveDescription] = useState('');
  const [preventiveScope, setPreventiveScope] = useState(() => i18n.t('eightD.defaultScope'));
  const [preventiveStandardized, setPreventiveStandardized] = useState(false);
  const [congratulationsNote, setCongratulationsNote] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [originals, setOriginals] = useState<Record<string, string>>({});
  // Autosave: the last payload known to be on the server, and when it was stored.
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const baselinePending = useRef(false);

  const hydrate = (d: EightDDossier, keepStep = false) => {
    baselinePending.current = true;
    setDossier(d);
    setOriginals(d.fieldOriginals || {});
    if (!keepStep) setActive(d.currentStep || 1);
    setChampionName(d.championName || myName);
    setTeamMembers(d.teamMembers || '');
    setContainmentOwner(d.containmentOwner || '');
    setContainmentVerified(!!d.containmentVerified);
    setContainmentNotes(d.containmentNotes || '');
    setContainmentActions(mergeContainmentActions(d.containmentActions));
    setEffectivenessMethod(d.effectivenessMethod || i18n.t('eightD.defaultMethod'));
    setLotsChecked(d.lotsChecked != null ? String(d.lotsChecked) : '3');
    setDefectsFound(d.defectsFound != null ? String(d.defectsFound) : '0');
    setEffectivenessNotes(d.effectivenessNotes || '');
    setEffectivenessValidated(!!d.effectivenessValidated);
    setPreventiveDescription(d.preventiveDescription || '');
    setPreventiveScope(d.preventiveScope || i18n.t('eightD.defaultScope'));
    setPreventiveStandardized(!!d.preventiveStandardized);
    setCongratulationsNote(d.congratulationsNote || '');
    setCustomerName(d.customerName || d.clientId || '');
  };

  const load = useCallback(async () => {
    if (!claimId || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const d = await eightDService.get(claimId, accessToken);
      hydrate(d);
      // Coming back from Pareto / Ishikawa / 5 Why: reopen the step the user was on.
      try {
        const stored = Number(sessionStorage.getItem(`e8d.step.${claimId}`));
        if (stored >= 1 && stored <= 8 && d.steps?.find((s) => s.step === stored)?.unlocked) setActive(stored);
      } catch { /* storage unavailable */ }
    } catch (e: any) {
      setError(e?.response?.data?.message || i18n.t('eightD.loadFailed'));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  }, [claimId, accessToken]);

  useEffect(() => { void load(); }, [load]);

  const locked = ['PENDING_VALIDATION', 'VALIDATED', 'CLOSED'].includes(
    String(dossier?.statusCode || '').toUpperCase()
  );

  const buildPayload = (): SaveEightDDossier => ({
    championId: user?.id || user?.sub,
    championName,
    teamMembers,
    containmentOwner,
    containmentVerified,
    containmentNotes,
    containmentActions: toSaveContainmentActions(containmentActions),
    effectivenessMethod,
    lotsChecked: Number(lotsChecked) || 0,
    defectsFound: Number(defectsFound) || 0,
    effectivenessNotes,
    effectivenessValidated,
    preventiveDescription,
    preventiveScope,
    preventiveStandardized,
    congratulationsNote,
    customerName,
  });

  const persist = async (keepStep = true) => {
    if (!claimId || !accessToken) return null;
    const d = await eightDService.save(claimId, buildPayload(), accessToken);
    hydrate(d, keepStep);
    setLastSavedAt(new Date());
    return d;
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await persist(true);
      setMessage(t('eightD.saved'));
    } catch (e: any) {
      setError(e?.response?.data?.message || t('eightD.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const goStep = (n: number) => {
    if (n === 0) {
      navigate('/pages/front/quality-analyses');
      return;
    }
    const step = dossier?.steps?.find((s) => s.step === n);
    if (!step) return;
    if (step.unlocked) {
      setActive(n);
      setError(null);
      return;
    }
    setError(step.hint || t('eightD.stepFrozen'));
  };

  const handleContinue = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const d = await persist(true);
      const current = d?.steps?.find((s) => s.step === active);
      if (!current?.complete) {
        setError(current?.hint || t('eightD.finishStep'));
        return;
      }
      const next = Math.min(8, active + 1);
      const nextStep = d?.steps?.find((s) => s.step === next);
      if (next !== active && nextStep && !nextStep.unlocked && !nextStep.complete) {
        setError(nextStep.hint || t('eightD.nextFrozen'));
        return;
      }
      setActive(next);
      setMessage(t('eightD.stepSaved'));
    } catch (e: any) {
      setError(e?.response?.data?.message || t('eightD.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!claimId || !accessToken) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await persist(true);
      const d = await eightDService.submit(claimId, accessToken);
      hydrate(d, true);
      setMessage(t('eightD.submitted'));
    } catch (e: any) {
      setError(e?.response?.data?.message || t('eightD.submitFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async (approved: boolean) => {
    if (!claimId || !accessToken) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const d = await eightDService.validate(claimId, approved, comment, accessToken);
      hydrate(d, true);
      setMessage(approved ? t('eightD.approved') : t('eightD.returned'));
    } catch (e: any) {
      setError(e?.response?.data?.message || t('eightD.validateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const showPdf = (blob: Blob) => {
    setPdfUrl((prev) => {
      if (prev) window.URL.revokeObjectURL(prev);
      return window.URL.createObjectURL(blob);
    });
  };

  const handlePdf = async () => {
    if (!claimId || !accessToken) return;
    setPdfBusy(true);
    setError(null);
    try {
      const blob = await eightDService.downloadPdf(claimId, accessToken);
      showPdf(blob);
      downloadBlob(blob, `8D_${(dossier?.clientId || 'client').replace(/\s+/g, '_')}.pdf`);
    } catch {
      setError(t('eightD.pdfDownloadFailed'));
    } finally {
      setPdfBusy(false);
    }
  };

  const handlePreviewPdf = async () => {
    if (!claimId || !accessToken) return;
    setPdfBusy(true);
    setError(null);
    try {
      const blob = await eightDService.downloadPdf(claimId, accessToken);
      showPdf(blob);
      if (stepOf(8)?.unlocked || stepOf(8)?.complete) setActive(8);
    } catch {
      setError(t('eightD.previewFailed'));
    } finally {
      setPdfBusy(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!claimId || !accessToken) return;
    setPdfBusy(true);
    setError(null);
    setMessage(null);
    try {
      // Ne pas sauver si le dossier est figé (soumis / clôturé) — sinon « Régénérer » échoue.
      if (!locked) {
        try {
          await persist(true);
        } catch (e: any) {
          const msg = e?.response?.data?.message || '';
          if (!String(msg).includes('plus modifiable')) throw e;
        }
      }
      const blob = await eightDService.generatePdf(claimId, accessToken);
      if (!blob || blob.size === 0 || (blob.type && blob.type.includes('json'))) {
        throw new Error(t('eightD.invalidPdf'));
      }
      showPdf(blob);
      // Rafraîchir métadonnées (hasCustomerPdf / date) sans perdre l’étape D8
      try {
        const d = await eightDService.get(claimId, accessToken);
        hydrate(d, true);
      } catch {
        setDossier((prev) => prev ? {
          ...prev,
          hasCustomerPdf: true,
          customerPdfGeneratedAt: new Date().toISOString(),
        } : prev);
      }
      setMessage(t('eightD.pdfRegenerated'));
      setActive(8);
    } catch (e: any) {
      let msg = e?.response?.data?.message || e?.message || t('eightD.pdfFailed');
      if (e?.response?.data instanceof Blob) {
        try {
          const text = await e.response.data.text();
          const parsed = JSON.parse(text);
          msg = parsed.message || msg;
        } catch { /* ignore */ }
      }
      setError(msg);
    } finally {
      setPdfBusy(false);
    }
  };

  useEffect(() => () => {
    if (pdfUrl) window.URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  const stepOf = (n: number) => dossier?.steps?.find((s) => s.step === n);
  const icaReady = requiredContainmentDone(containmentActions);
  const icaDoneCount = containmentActions.filter((a) => a.status === 'DONE').length;
  const doneCount = (dossier?.steps || []).filter((s) => s.complete).length;
  const meta = stepMeta(active);
  const st = statusLabel(dossier?.statusCode);
  const currentLocked = !stepOf(active)?.unlocked;
  const canAdvance = !!stepOf(active)?.complete || (
    active === 1 ? !!(championName.trim() || teamMembers.trim())
      : active === 2 ? true
      : active === 3 ? icaReady && !!containmentOwner.trim() && containmentVerified
      : active === 6 ? effectivenessValidated && Number(lotsChecked) > 0 && Number(defectsFound) === 0
      : active === 7 ? !!preventiveDescription.trim() && preventiveStandardized
      : active === 8 ? !!congratulationsNote.trim()
      : false
  );
  const blockers = useMemo(
    () => (dossier?.steps || []).filter((s) => !s.complete).map((s) => ({
      step: s.step,
      label: `${s.code} · ${stepMeta(s.step)?.title || s.label}`,
      hint: s.hint || t('eightD.toFinish'),
    })),
    [dossier?.steps, t]
  );

  // What is still missing before the user can move on (shown under the buttons).
  const missing: string[] = [];
  if (!canAdvance && !currentLocked && !locked) {
    if (active === 1) missing.push(t('eightD.needTeam'));
    else if (active === 3) {
      if (!icaReady) missing.push(t('eightD.needIca'));
      if (!containmentOwner.trim()) missing.push(t('eightD.needOwner'));
      if (!containmentVerified) missing.push(t('eightD.needVerified'));
    } else if (active === 6) {
      if (!(Number(lotsChecked) > 0)) missing.push(t('eightD.needLots'));
      if (Number(defectsFound) !== 0) missing.push(t('eightD.needNoDefects'));
      if (!effectivenessValidated) missing.push(t('eightD.needValidated'));
    } else if (active === 7) {
      if (!preventiveDescription.trim()) missing.push(t('eightD.needPreventive'));
      if (!preventiveStandardized) missing.push(t('eightD.needStandardized'));
    } else if (active === 8) {
      if (!congratulationsNote.trim()) missing.push(t('eightD.needClosingNote'));
    } else {
      const h = stepOf(active)?.hint;
      if (h) missing.push(h);
    }
  }
  const submitBlockers = active === 8 && !locked && !dossier?.canSubmit
    ? blockers.filter((b) => b.step !== 8).map((b) => b.label)
    : [];

  // ── Autosave ── nothing is ever deleted: autosave only runs while the user has
  // unsaved edits, never when it would blank a field that already has saved content,
  // and the server keeps the dossier (and the claim) archived after closing.
  const snapshot = JSON.stringify(buildPayload());
  const dirty = !!dossier && !locked && savedSnapshot !== '' && snapshot !== savedSnapshot;
  const wouldBlank = (prev: string, next: SaveEightDDossier) => {
    try {
      const before = JSON.parse(prev) as Record<string, unknown>;
      const after = next as unknown as Record<string, unknown>;
      return ['championName', 'teamMembers', 'containmentOwner', 'containmentNotes', 'effectivenessNotes', 'preventiveDescription', 'congratulationsNote']
        .some((k) => String(before[k] ?? '').trim() && !String(after[k] ?? '').trim());
    } catch { return true; }
  };

  useEffect(() => {
    if (baselinePending.current) {
      baselinePending.current = false;
      setSavedSnapshot(snapshot);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- baseline is taken once per server response
  }, [dossier]);

  const autosave = async () => {
    if (!claimId || !accessToken || !dirty || locked || currentLocked || autoSaving) return;
    const payload = buildPayload();
    if (wouldBlank(savedSnapshot, payload)) return;
    setAutoSaving(true);
    try {
      const d = await eightDService.save(claimId, payload, accessToken);
      setDossier(d);
      setOriginals(d.fieldOriginals || {});
      setSavedSnapshot(JSON.stringify(payload));
      setLastSavedAt(new Date());
    } catch { /* the Save button reports errors */ }
    finally { setAutoSaving(false); }
  };
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;

  useEffect(() => {
    if (!dirty || saving || autoSaving) return;
    const id = window.setTimeout(() => { void autosaveRef.current(); }, 3000);
    return () => window.clearTimeout(id);
  }, [snapshot, dirty, saving, autoSaving]);

  // Leaving the page (sidebar, tools bar, back button): store what was typed.
  useEffect(() => () => { void autosaveRef.current(); }, []);

  // Closing or reloading the tab: warn if edits are still unsaved.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!claimId || !dossier) return;
    try { sessionStorage.setItem(`e8d.step.${claimId}`, String(active)); } catch { /* storage unavailable */ }
  }, [active, claimId, dossier]);

  const saveStatus = locked ? ''
    : saving || autoSaving ? t('eightD.saving')
    : dirty ? t('eightD.unsaved')
    : lastSavedAt ? t('eightD.savedAt', { time: lastSavedAt.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }) })
    : '';

  const appendRole = (label: string) => {
    const chunk = `${label} : `;
    if (teamMembers.includes(label)) return;
    setTeamMembers((prev) => (prev ? `${prev.trim()}\n${chunk}` : chunk));
  };

  if (loading) {
    return <div style={{ padding: 48, color: '#64748b', textAlign: 'center' }}>{t('eightD.loading')}</div>;
  }

  return (
    <div className="e8d-page">
      <style>{`
        .e8d-page { font-family: Inter, system-ui, sans-serif; color: #0f172a; background: #f4f6fb; min-height: calc(100dvh - 56px); padding: 16px; }
        .e8d-wrap { max-width: 1120px; margin: 0 auto; }
        .e8d-wrap.wide { max-width: min(1320px, 100%); }
        .e8d-top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
        .e8d-btn { display: inline-flex; align-items: center; gap: 6px; border-radius: 9px; padding: 8px 12px; font-size: 13px; font-weight: 650; cursor: pointer; border: 1px solid #d6dbe6; background: #fff; font-family: inherit; color: #0f172a; }
        .e8d-btn:disabled { opacity: .55; cursor: not-allowed; }
        .e8d-btn.primary { background: ${NAVY}; color: #fff; border-color: ${NAVY}; }
        .e8d-btn.ok { background: #047857; color: #fff; border-color: #047857; }
        .e8d-btn.warn { color: #9a3412; border-color: #fdba74; }
        .e8d-btn.ghost { background: transparent; }
        .e8d-kicker { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #64748b; font-weight: 700; margin-top: 10px; }
        .e8d-title { margin: 4px 0 6px; font-size: 22px; color: ${NAVY}; line-height: 1.25; }
        .e8d-sub { margin: 0; color: #64748b; font-size: 13px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .e8d-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 9px; font-size: 11px; font-weight: 700; }
        .e8d-progress { height: 6px; background: #e2e8f0; border-radius: 99px; overflow: hidden; margin: 12px 0 16px; }
        .e8d-progress > span { display: block; height: 100%; background: ${NAVY}; border-radius: 99px; }
        .e8d-rail { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 14px; }
        .e8d-dot { flex: 0 0 auto; min-width: 118px; border: 1px solid #e2e8f0; background: #fff; border-radius: 12px; padding: 9px 10px; text-align: left; cursor: pointer; font-family: inherit; }
        .e8d-dot.on { border-color: ${NAVY}; box-shadow: 0 0 0 2px rgba(0,1,104,.12); }
        .e8d-dot.done { background: #ecfdf5; border-color: #a7f3d0; }
        .e8d-dot.wait { opacity: .45; cursor: not-allowed; filter: grayscale(.35); background: #f8fafc; }
        .e8d-dot.d0 { min-width: 96px; }
        .e8d-origin { font-size: 11px; color: #94a3b8; margin: 4px 0 0; line-height: 1.35; }
        .e8d-origin span { color: #64748b; font-style: italic; }
        .e8d-origin em { font-style: normal; color: #94a3b8; }
        .e8d-dot b { display: block; font-size: 10px; color: ${NAVY}; letter-spacing: .04em; }
        .e8d-dot span { display: block; font-size: 12px; font-weight: 650; color: #0f172a; margin-top: 2px; line-height: 1.25; }
        .e8d-layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 14px; align-items: start; }
        .e8d-layout.d8 { grid-template-columns: 1fr; }
        .e8d-card, .e8d-coach { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px 18px 16px; }
        .e8d-mission { margin: 0 0 14px; padding: 12px 14px; border-radius: 12px; background: #eef2ff; border: 1px solid #c7d2fe; }
        .e8d-mission h2 { margin: 0 0 4px; font-size: 18px; color: ${NAVY}; }
        .e8d-mission p { margin: 0; font-size: 13.5px; color: #334155; line-height: 1.45; }
        .e8d-label { display: block; font-size: 12px; font-weight: 700; color: #475569; margin: 12px 0 5px; }
        .e8d-input, .e8d-area { width: 100%; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 9px; padding: 9px 11px; font-size: 14px; font-family: inherit; background: #fff; }
        .e8d-area { min-height: 84px; resize: vertical; }
        .e8d-alert { padding: 10px 12px; border-radius: 10px; margin-bottom: 12px; font-size: 13px; display: flex; gap: 8px; align-items: center; }
        .e8d-alert.err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
        .e8d-alert.ok { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
        .e8d-hint { font-size: 13px; color: #64748b; margin: 0 0 10px; line-height: 1.45; }
        .e8d-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 4px; }
        .e8d-chip { border: 1px dashed #cbd5e1; background: #f8fafc; border-radius: 999px; padding: 4px 10px; font-size: 12px; cursor: pointer; font-family: inherit; }
        .e8d-tool { display: flex; justify-content: space-between; gap: 10px; align-items: center; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 8px; }
        .e8d-tool b { display: block; font-size: 14px; }
        .e8d-ok { color: #047857; font-size: 12px; font-weight: 700; }
        .e8d-wait { color: #9a3412; font-size: 12px; font-weight: 700; }
        .e8d-ica { border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 8px; background: #fff; overflow: hidden; }
        .e8d-ica.done { border-color: #a7f3d0; background: #f0fdf4; }
        .e8d-ica.doing { border-color: #fde68a; background: #fffbeb; }
        .e8d-ica-head { width: 100%; display: flex; gap: 10px; align-items: center; padding: 11px 12px; border: none; background: transparent; text-align: left; cursor: pointer; font-family: inherit; }
        .e8d-ica-body { padding: 0 12px 12px; }
        .e8d-ica-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .e8d-status { border: 1px solid #cbd5e1; background: #fff; border-radius: 999px; padding: 4px 10px; font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit; flex-shrink: 0; }
        .e8d-check { display: flex; align-items: flex-start; gap: 8px; margin-top: 12px; font-size: 13.5px; line-height: 1.4; }
        .e8d-pdf { margin-top: 14px; border: 1px solid #c7d2fe; border-radius: 12px; padding: 14px; background: #f8fafc; }
        .e8d-pdf-frame { width: 100%; height: min(90dvh, 1200px); min-height: 760px; border: 1px solid #e2e8f0; border-radius: 8px; margin-top: 12px; background: #fff; }
        .e8d-pdf-empty { min-height: 220px; display: flex; align-items: center; justify-content: center; text-align: center; color: #64748b; font-size: 13px; padding: 20px; }
        .e8d-coach h3 { margin: 0 0 8px; font-size: 13px; color: ${NAVY}; }
        .e8d-coach p { margin: 0 0 10px; font-size: 13px; color: #475569; line-height: 1.5; }
        .e8d-blockers { margin: 14px 0 0; padding: 0; list-style: none; }
        .e8d-blockers li { font-size: 12.5px; color: #9a3412; padding: 6px 0; border-top: 1px solid #f1f5f9; }
        .e8d-foot { margin-top: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; }
        .e8d-foot-in { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; align-items: center; }
        .e8d-savestate { font-size: 12px; color: #64748b; }
        .e8d-savestate.dirty { color: #9a3412; }
        .e8d-need { margin: 0 0 10px; padding: 9px 12px; border-radius: 10px; background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; font-size: 12.5px; }
        .e8d-need ul { margin: 4px 0 0; padding-left: 18px; }
        .e8d-d4prog { margin-bottom: 10px; font-size: 12.5px; font-weight: 650; color: #475569; }
        .e8d-d4prog .e8d-progress { margin: 6px 0 8px; }
        .e8d-lockbox { padding: 16px; border-radius: 12px; background: #f8fafc; border: 1px dashed #cbd5e1; color: #475569; font-size: 14px; line-height: 1.5; }
        @media (max-width: 900px) {
          .e8d-layout { grid-template-columns: 1fr; }
          .e8d-ica-grid { grid-template-columns: 1fr; }
          .e8d-pdf-frame { height: 78dvh; min-height: 520px; }
        }
      `}</style>

      <div className={`e8d-wrap${active === 8 ? ' wide' : ''}`}>
        {claimId && (
          <AnalysisToolsNav
            claimId={claimId}
            active="eightD"
            claimTitle={dossier?.claimTitle}
          />
        )}
        <div className="e8d-top">
          <div>
            <div className="e8d-kicker">{t('eightD.kicker')}</div>
            <h1 className="e8d-title">{dossier?.claimTitle || t('analysisTools.eightD')}</h1>
            <p className="e8d-sub">
              <span className="e8d-pill" style={{ background: st.bg, color: st.color }}>{st.text}</span>
              <span>{t('eightD.client', { client: dossier?.clientId || '—' })}</span>
              <span>· {t('closedArchive.lot', { lot: dossier?.lotNumber || '—' })}</span>
              <span>· {t('eightD.stepsDone', { done: doneCount, total: 8 })}</span>
            </p>
          </div>
          {claimId && <EightDHistory claimId={claimId} accessToken={accessToken} />}
        </div>

        <div className="e8d-progress" aria-hidden>
          <span style={{ width: `${(doneCount / 8) * 100}%` }} />
        </div>

        {error && <div className="e8d-alert err">{error}</div>}
        {message && <div className="e8d-alert ok"><CheckCircle2 size={15} />{message}</div>}

        <div className="e8d-rail">
          <button
            type="button"
            className="e8d-dot done d0"
            onClick={() => goStep(0)}
            title={t('eightD.backD0')}
          >
            <b>D0 ✓</b>
            <span>{t('workflows.d0Started')}</span>
          </button>
          {(dossier?.steps || []).map((s) => {
            const copy = stepMeta(s.step);
            const frozen = !s.unlocked;
            return (
              <button
                key={s.step}
                type="button"
                className={`e8d-dot${active === s.step ? ' on' : ''}${s.complete ? ' done' : ''}${frozen ? ' wait' : ''}`}
                onClick={() => goStep(s.step)}
                title={frozen ? (s.hint || t('workflows.finishPrevious')) : copy?.title || s.label}
              >
                <b>{s.code} {s.complete ? '✓' : frozen ? <Lock size={10} /> : ''}</b>
                <span>{copy?.title || s.label}</span>
              </button>
            );
          })}
        </div>

        <div className={`e8d-layout${active === 8 ? ' d8' : ''}`}>
          <section className="e8d-card">
            <div className="e8d-mission">
              <h2>{meta?.title}</h2>
              <p>{meta?.ask}</p>
            </div>

            {currentLocked && (
              <div className="e8d-lockbox" style={{ marginBottom: 14 }}>
                <Lock size={14} style={{ marginRight: 6 }} />
                {t('eightD.notOpenYet')} {stepOf(active)?.hint || t('eightD.notOpenHint')}
              </div>
            )}

            {active === 1 && (
              <>
                <label className="e8d-label">{t('eightD.championLabel')}</label>
                <input className="e8d-input" value={championName} onChange={(e) => setChampionName(e.target.value)} disabled={locked || currentLocked} placeholder={t('eightD.yourName')} />
                <OriginHint original={originals.championName} current={championName} />
                <label className="e8d-label">{t('eightD.helpersLabel')}</label>
                <div className="e8d-chips">
                  {[t('eightD.roleProduction'), t('eightD.roleMethods'), t('eightD.roleQuality')].map((r) => (
                    <button key={r} type="button" className="e8d-chip" disabled={locked || currentLocked} onClick={() => appendRole(r)}>+ {r}</button>
                  ))}
                </div>
                <textarea className="e8d-area" value={teamMembers} onChange={(e) => setTeamMembers(e.target.value)} disabled={locked || currentLocked} placeholder={t('eightD.teamPlaceholder')} />
                <OriginHint original={originals.teamMembers} current={teamMembers} />
              </>
            )}

            {active === 2 && (
              <>
                <p className="e8d-hint">{t('eightD.d2Hint')}</p>
                <div className="e8d-tool" style={{ alignItems: 'stretch', flexDirection: 'column' }}>
                  <b>{dossier?.claimTitle}</b>
                  <p className="e8d-hint" style={{ margin: '6px 0 0' }}>{dossier?.description}</p>
                  <p className="e8d-hint" style={{ margin: '8px 0 0' }}>
                    {t('eightD.client', { client: dossier?.clientId })} · {dossier?.defectType} · {t('closedArchive.lot', { lot: dossier?.lotNumber })}
                  </p>
                </div>
              </>
            )}

            {active === 3 && (
              <>
                <p className="e8d-hint">{t('eightD.d3Hint')}</p>
                <div className="e8d-tool">
                  <div>
                    <b>{t('eightD.containmentPlan')}</b>
                    <span className={stepOf(3)?.complete ? 'e8d-ok' : 'e8d-wait'}>
                      {t('eightD.actionsDone', { done: icaDoneCount, total: containmentActions.length })}
                      {containmentOwner ? ` · ${t('eightD.pilot', { name: containmentOwner })}` : ''}
                      {stepOf(3)?.complete ? ` · ${t('eightD.finished')}` : ` · ${t('eightD.toComplete')}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="e8d-btn primary"
                    disabled={currentLocked}
                    onClick={() => navigate(`/pages/front/quality-analyses/confinement/${claimId}`)}
                  >
                    {t('qualityHistory.open')}
                  </button>
                </div>
                {containmentActions.map((action) => (
                  <div key={action.id} className="e8d-tool" style={{ padding: '8px 12px' }}>
                    <div>
                      <b style={{ fontSize: 13 }}>{containmentActionTitle(action)}</b>
                      <span className={action.status === 'DONE' ? 'e8d-ok' : 'e8d-wait'}>
                        {containmentStatusLabel(action.status)}
                        {action.owner ? ` · ${action.owner}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
                {!stepOf(3)?.complete && (
                  <p className="e8d-hint">{stepOf(3)?.hint || t('eightD.d3Todo')}</p>
                )}
              </>
            )}

            {active === 4 && (
              <>
                {claimId && <PriorityCauseBanner claimId={claimId} />}
                {claimId && <D4ChainChecklist claimId={claimId} />}
                <div className="e8d-d4prog">
                  <span>{t('eightD.d4Progress', { done: (dossier?.ishikawaComplete ? 1 : 0) + (dossier?.fiveWhyComplete ? 1 : 0), total: 2 })}</span>
                  <div className="e8d-progress"><span style={{ width: `${((dossier?.ishikawaComplete ? 1 : 0) + (dossier?.fiveWhyComplete ? 1 : 0)) * 50}%` }} /></div>
                  <p className="e8d-hint">{t('eightD.d4AutoSave')}</p>
                  {(['ishikawa', 'pareto', 'fiveWhy'] as const).map((k) => d4Order.lockReason(k)).find(Boolean) && (
                    <p className="e8d-hint" role="note">
                      {t(`d4Order.reason.${(['ishikawa', 'pareto', 'fiveWhy'] as const).map((k) => d4Order.lockReason(k)).find(Boolean)}`)}
                    </p>
                  )}
                </div>
                <div className="e8d-tool">
                  <div>
                    <b>1. Ishikawa</b>
                    <span className={dossier?.ishikawaComplete ? 'e8d-ok' : 'e8d-wait'}>
                      {dossier?.ishikawaComplete ? t('eightD.filled') : t('eightD.toComplete')}
                    </span>
                  </div>
                  <button type="button" className={`e8d-btn${!!dossier?.ishikawaComplete ? '' : ' primary'}`} disabled={currentLocked || !!d4Order.lockReason('ishikawa')} title={d4Order.lockReason('ishikawa') ? t(`d4Order.reason.${d4Order.lockReason('ishikawa')}`) : undefined} onClick={() => navigate(`/pages/front/quality-analyses/ishikawa/${claimId}`)}>{dossier?.ishikawaComplete ? t('eightD.review') : t('qualityHistory.open')}</button>
                </div>
                <div className="e8d-tool">
                  <div>
                    <b>2. Pareto</b>
                    <span className="e8d-hint" style={{ margin: 0 }}>{t('eightD.paretoHint')}</span>
                  </div>
                  <button type="button" className="e8d-btn" disabled={currentLocked || !!d4Order.lockReason('pareto')} title={d4Order.lockReason('pareto') ? t(`d4Order.reason.${d4Order.lockReason('pareto')}`) : undefined} onClick={() => navigate(`/pages/front/quality-analyses/pareto/${claimId}`)}>{t('qualityHistory.open')}</button>
                </div>
                <div className="e8d-tool">
                  <div>
                    <b>3. 5 Why</b>
                    <span className={dossier?.fiveWhyComplete ? 'e8d-ok' : 'e8d-wait'}>
                      {dossier?.fiveWhyComplete ? t('eightD.causesFilled') : t('eightD.toComplete')}
                      {dossier?.fiveWhyComplete && !stepOf(4)?.complete ? ` · ${t('eightD.awaitingAdmin')}` : ''}
                    </span>
                  </div>
                  <button type="button" className={`e8d-btn${dossier?.ishikawaComplete ? ' primary' : ''}`} disabled={currentLocked || !!d4Order.lockReason('fiveWhy')} title={d4Order.lockReason('fiveWhy') ? t(`d4Order.reason.${d4Order.lockReason('fiveWhy')}`) : undefined} onClick={() => navigate(`/pages/front/quality-analyses/5why/${claimId}`)}>{dossier?.fiveWhyComplete ? t('eightD.review') : t('qualityHistory.open')}</button>
                </div>
              </>
            )}

            {active === 5 && (
              dossier?.capaPlanId ? (
                <>
                  <p className="e8d-hint" style={{ fontWeight: 650, color: '#0f172a' }}>{dossier.capaPlanTitle}</p>
                  {(dossier.capaActions || []).map((a) => (
                    <div key={a.id} className="e8d-tool">
                      <div>
                        <b>{a.title}</b>
                        <span className={a.done && a.proofCount > 0 ? 'e8d-ok' : 'e8d-wait'}>
                          {a.progress}% · {a.proofCount ? t('eightD.proofs', { count: a.proofCount }) : t('eightD.proofMissing')} · {a.done ? t('eightD.actionDone') : t('eightD.statusOpen')}
                        </span>
                      </div>
                      <button type="button" className="e8d-btn" onClick={() => navigate(`/pages/front/action-plans/${dossier.capaPlanId}`)}>
                        {t('eightD.continue')}
                      </button>
                    </div>
                  ))}
                  {!stepOf(5)?.complete && (
                    <p className="e8d-hint">{stepOf(5)?.hint || t('eightD.d5Todo')}</p>
                  )}
                </>
              ) : (
                <div className="e8d-lockbox">
                  {t('eightD.capaFromFiveWhy')}
                  <div style={{ marginTop: 10 }}>
                    <button type="button" className="e8d-btn primary" onClick={() => navigate(`/pages/front/quality-analyses/5why/${claimId}`)}>
                      {t('ishikawa.goFiveWhy')}
                    </button>
                  </div>
                </div>
              )
            )}

            {active === 6 && (
              <>
                <label className="e8d-label">{t('eightD.howChecked')}</label>
                <input className="e8d-input" value={effectivenessMethod} onChange={(e) => setEffectivenessMethod(e.target.value)} disabled={locked || currentLocked} />
                <OriginHint original={originals.effectivenessMethod} current={effectivenessMethod} />
                <div className="e8d-ica-grid">
                  <div>
                    <label className="e8d-label">{t('eightD.lotsChecked')}</label>
                    <input className="e8d-input" type="number" min={0} value={lotsChecked} onChange={(e) => setLotsChecked(e.target.value)} disabled={locked || currentLocked} />
                    <OriginHint original={originals.lotsChecked} current={lotsChecked} />
                  </div>
                  <div>
                    <label className="e8d-label">{t('eightD.sameDefects')}</label>
                    <input className="e8d-input" type="number" min={0} value={defectsFound} onChange={(e) => setDefectsFound(e.target.value)} disabled={locked || currentLocked} />
                    <OriginHint original={originals.defectsFound} current={defectsFound} />
                  </div>
                </div>
                <label className="e8d-label">{t('eightD.notes')}</label>
                <textarea className="e8d-area" value={effectivenessNotes} onChange={(e) => setEffectivenessNotes(e.target.value)} disabled={locked || currentLocked} placeholder={t('eightD.notesPlaceholder')} />
                <OriginHint original={originals.effectivenessNotes} current={effectivenessNotes} />
                <label className="e8d-check">
                  <input type="checkbox" checked={effectivenessValidated} onChange={(e) => setEffectivenessValidated(e.target.checked)} disabled={locked || currentLocked || Number(defectsFound) > 0} />
                  <span>{t('eightD.effectivenessOk')}</span>
                </label>
              </>
            )}

            {active === 7 && (
              <>
                <label className="e8d-label">{t('eightD.preventiveLabel')}</label>
                <textarea className="e8d-area" value={preventiveDescription} onChange={(e) => setPreventiveDescription(e.target.value)} disabled={locked || currentLocked} placeholder={t('eightD.preventivePlaceholder')} />
                <OriginHint original={originals.preventiveDescription} current={preventiveDescription} />
                <label className="e8d-label">{t('eightD.scope')}</label>
                <input className="e8d-input" value={preventiveScope} onChange={(e) => setPreventiveScope(e.target.value)} disabled={locked || currentLocked} />
                <OriginHint original={originals.preventiveScope} current={preventiveScope} />
                <label className="e8d-check">
                  <input type="checkbox" checked={preventiveStandardized} onChange={(e) => setPreventiveStandardized(e.target.checked)} disabled={locked || currentLocked} />
                  <span>{t('eightD.standardized')}</span>
                </label>
              </>
            )}

            {active === 8 && (
              <>
                <label className="e8d-label">{t('eightD.customerName')}</label>
                <input className="e8d-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={locked || currentLocked} />
                <OriginHint original={originals.customerName} current={customerName} />
                <label className="e8d-label">{t('eightD.closingNote')}</label>
                <textarea className="e8d-area" value={congratulationsNote} onChange={(e) => setCongratulationsNote(e.target.value)} disabled={locked || currentLocked} placeholder={t('eightD.closingPlaceholder')} />
                <OriginHint original={originals.congratulationsNote} current={congratulationsNote} />
                <div className="e8d-pdf">
                  <h3 style={{ margin: '0 0 4px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={16} /> {t('eightD.pdfTitle')}
                  </h3>
                  <p className="e8d-hint">
                    {dossier?.hasCustomerPdf
                      ? t('eightD.pdfGeneratedOn', { date: dossier.customerPdfGeneratedAt ? new Date(dossier.customerPdfGeneratedAt).toLocaleString(dateLocale()) : '' })
                      : t('eightD.pdfHint')}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="e8d-btn primary" disabled={pdfBusy || (!isAdmin && currentLocked)} onClick={() => void handleGeneratePdf()}>
                      {pdfBusy ? '…' : dossier?.hasCustomerPdf ? t('eightD.regenerate') : t('eightD.generatePdf')}
                    </button>
                    <button type="button" className="e8d-btn" disabled={pdfBusy} onClick={() => void handlePreviewPdf()}><Eye size={14} /> {t('eightD.preview')}</button>
                    <button type="button" className="e8d-btn" disabled={pdfBusy} onClick={() => void handlePdf()}><Download size={14} /> {t('eightD.download')}</button>
                  </div>
                  {pdfUrl ? (
                    <iframe className="e8d-pdf-frame" title={t('eightD.previewTitle')} src={pdfUrl} />
                  ) : (
                    <div className="e8d-pdf-empty">{t('eightD.previewEmpty')}</div>
                  )}
                </div>
                {!dossier?.canSubmit && !locked && blockers.length > 0 && (
                  <ul className="e8d-blockers">
                    {blockers.map((b) => (
                      <li key={b.step}>
                        <button type="button" className="e8d-btn ghost" onClick={() => goStep(b.step)}>{b.label}</button>
                        {' — '}{b.hint}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {isAdmin && dossier?.canValidate && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{t('eightD.adminValidation')}</h3>
                <textarea className="e8d-area" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('eightD.commentPlaceholder')} />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" className="e8d-btn ok" disabled={saving} onClick={() => void handleValidate(true)}>{t('eightD.approve')}</button>
                  <button type="button" className="e8d-btn warn" disabled={saving} onClick={() => void handleValidate(false)}>{t('eightD.sendBack')}</button>
                </div>
              </div>
            )}

            <div className="e8d-foot">
              {(missing.length > 0 || submitBlockers.length > 0) && (
                <div className="e8d-need">
                  <b>{active === 8 ? t('eightD.needBeforeSubmit') : t('eightD.needToContinue')}</b>
                  <ul>
                    {(missing.length > 0 ? missing : submitBlockers).map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </div>
              )}
              <div className="e8d-foot-in">
                <button type="button" className="e8d-btn" disabled={active <= 1} onClick={() => goStep(active - 1)}>
                  <ArrowLeft size={14} /> {t('qualityHistory.previous')}
                </button>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {saveStatus && <span className={`e8d-savestate${dirty ? ' dirty' : ''}`} role="status">{saveStatus}</span>}
                  {!locked && (
                    <button type="button" className="e8d-btn" disabled={saving} onClick={() => void handleSave()}>
                      <Save size={14} /> {saving ? '…' : t('common.save')}
                    </button>
                  )}
                  {active < 8 && (
                    <button type="button" className="e8d-btn primary" disabled={saving || currentLocked || !canAdvance} onClick={() => void handleContinue()}>
                      {t('eightD.continue')} <ArrowRight size={14} />
                    </button>
                  )}
                  {active === 8 && !locked && (
                    <button type="button" className="e8d-btn primary" disabled={saving || !dossier?.canSubmit} onClick={() => void handleSubmit()}>
                      <Send size={14} /> {t('eightD.sendToAdmin')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside className="e8d-coach">
            <h3>{t('eightD.whyStep')}</h3>
            <p>{meta?.why}</p>
            <h3>{t('eightD.howTo')}</h3>
            <p>{meta?.how}</p>
            {blockers[0] && active !== blockers[0].step && (
              <>
                <h3>{t('eightD.nextAction')}</h3>
                <p>
                  <button type="button" className="e8d-btn" onClick={() => goStep(blockers[0].step)}>
                    {blockers[0].label}
                  </button>
                </p>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default EightDPage;
