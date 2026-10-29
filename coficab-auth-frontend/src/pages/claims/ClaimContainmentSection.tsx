import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Lock, Plus, Save, Shield } from 'lucide-react';
import { EightDDossier, eightDService } from '../../services/qualityAnalysisService';
import {
  ContainmentAction,
  containmentActionTitle,
  containmentStatusLabel,
  inferContainmentStatus,
  mergeContainmentActions,
  requiredContainmentDone,
  toSaveContainmentActions,
} from '../../utils/eightDContainment';
import { OriginHint } from './EightDOriginHint';
import { useTranslation } from 'react-i18next';

interface ClaimContainmentSectionProps {
  claimId: string | number;
  accessToken: string | null;
  dossier: EightDDossier | null;
  analysisLocked: boolean;
  /** The dossier is closed: the containment is shown as it was, nothing can be changed. */
  closed?: boolean;
  onSaved?: (d: EightDDossier) => void;
}

export const ClaimContainmentSection: React.FC<ClaimContainmentSectionProps> = ({
  claimId,
  accessToken,
  dossier,
  analysisLocked,
  closed = false,
  onSaved,
}) => {
  const { t } = useTranslation();
  const [owner, setOwner] = useState('');
  const [notes, setNotes] = useState('');
  const [verified, setVerified] = useState(false);
  const [actions, setActions] = useState<ContainmentAction[]>(() => mergeContainmentActions());
  const [openId, setOpenId] = useState<string | null>('ica-stop-ship');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const dirty = useRef(false);
  const skipHydrate = useRef(false);

  const d3 = dossier?.steps?.find((s) => s.step === 3);
  const submitted = ['PENDING_VALIDATION', 'VALIDATED', 'CLOSED'].includes(
    String(dossier?.statusCode || '').toUpperCase()
  );
  const frozen = analysisLocked || closed || !d3?.unlocked;
  const locked = frozen || submitted;
  const originals = dossier?.fieldOriginals || {};

  useEffect(() => {
    if (skipHydrate.current) {
      skipHydrate.current = false;
      return;
    }
    if (!dossier) {
      setOwner('');
      setNotes('');
      setVerified(false);
      setActions(mergeContainmentActions());
      return;
    }
    setOwner(dossier.containmentOwner || '');
    setNotes(dossier.containmentNotes || '');
    setVerified(!!dossier.containmentVerified);
    setActions(mergeContainmentActions(dossier.containmentActions).map((a) => ({
      ...a,
      status: inferContainmentStatus(a),
    })));
  }, [dossier]);

  const latest = useRef({ owner, notes, verified, actions, accessToken, frozen, claimId });
  latest.current = { owner, notes, verified, actions, accessToken, frozen, claimId };

  const icaReady = requiredContainmentDone(actions);
  const doneCount = actions.filter((a) => inferContainmentStatus(a) === 'DONE').length;
  const progress = actions.length ? Math.round((doneCount / actions.length) * 100) : 0;
  const pilotName = owner.trim()
    || actions.map((a) => String(a.owner || '').trim()).find(Boolean)
    || String(dossier?.championName || '').trim();
  const canCommit = verified && !saving;
  const d3Done = !!d3?.complete;

  useEffect(() => {
    if (!owner.trim() && pilotName) setOwner(pilotName);
  }, [owner, pilotName]);

  const applyAction = (id: string, next: Partial<ContainmentAction>) => {
    dirty.current = true;
    setActions((prev) => prev.map((a) => {
      if (a.id !== id) return a;
      const merged = { ...a, ...next };
      return { ...merged, status: inferContainmentStatus(merged) };
    }));
  };

  const handleSave = async (commit: boolean) => {
    const snap = latest.current;
    if (!snap.accessToken) {
      setError(t('closedArchive.sessionExpired'));
      return;
    }
    if (snap.frozen) {
      setError(t('containment.frozenError'));
      return;
    }
    if (commit) {
      if (!snap.verified) {
        setError(t('containment.confirmFirst'));
        setMessage(null);
        return;
      }
      if (!icaReady) {
        setError(t('containment.requiredActions'));
        setMessage(null);
        return;
      }
      if (!snap.owner.trim() && !pilotName) {
        setError(t('containment.pilotRequired'));
        setMessage(null);
        return;
      }
    }

    if (commit) {
      setSaving(true);
      setError(null);
      setMessage(null);
    } else {
      setAutoNote(t('common.saving'));
    }

    const timeout = window.setTimeout(() => setSaving(false), 15000);

    try {
      const payload: Record<string, unknown> = {
        containmentOwner: snap.owner.trim() || pilotName,
        containmentNotes: snap.notes,
        containmentActions: toSaveContainmentActions(snap.actions),
      };
      if (commit) payload.containmentVerified = snap.verified;

      const d = await eightDService.save(String(snap.claimId), payload, snap.accessToken);
      skipHydrate.current = true;
      dirty.current = false;
      onSaved?.(d);
      const done = d.steps?.find((s) => s.step === 3)?.complete;
      if (commit) {
        setMessage(done
          ? t('containment.savedDone')
          : t('containment.saved'));
        setAutoNote(null);
      } else {
        setAutoNote(t('containment.draftSaved'));
      }
    } catch (e: any) {
      const apiMessage = e?.response?.data?.message
        || (typeof e?.response?.data === 'string' ? e.response.data : null)
        || e?.message
        || t('containment.saveFailed');
      setError(apiMessage);
      setAutoNote(null);
    } finally {
      window.clearTimeout(timeout);
      setSaving(false);
    }
  };

  useEffect(() => {
    if (locked || !dirty.current) return;
    const timer = window.setTimeout(() => void handleSave(false), 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, owner, notes, locked]);

  return (
    <section className="pfe-containment">
      <div className="pfe-containment-head">
        <div className="pfe-containment-icon">
          <Shield size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <h3>{t('containment.title')}</h3>
          <p>
            {t('containment.intro')}
            {d3?.complete ? ` ${t('containment.introDone')}` : ''}
          </p>
        </div>
        <div className="pfe-containment-score">
          {doneCount}/{actions.length}
        </div>
      </div>

      <div className="pfe-ica-progress" aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </div>

      {frozen && (
        <div className="pfe-containment-lock">
          <Lock size={14} />
          {closed
            ? t('closedDossier.banner')
            : analysisLocked
            ? t('containment.lockedStart')
            : d3?.hint || t('containment.lockedSteps')}
        </div>
      )}

      {error && <div className="pfe-containment-alert err">{error}</div>}
      {message && <div className="pfe-containment-alert ok"><CheckCircle2 size={14} /> {message}</div>}
      {autoNote && !message && (
        <div className="pfe-containment-alert ok" style={{ opacity: 0.85 }}>{autoNote}</div>
      )}

      <div className={frozen ? 'pfe-containment-body is-frozen' : 'pfe-containment-body'}>
        <label className="pfe-containment-label">{t('containment.pilotLabel')}</label>
        <p className="pfe-containment-hint" style={{ margin: '0 0 6px' }}>
          {t('containment.pilotHint')}
        </p>
        <input
          className="pfe-containment-input"
          value={owner}
          disabled={locked}
          onChange={(e) => { dirty.current = true; setOwner(e.target.value); }}
          placeholder={t('containment.pilotPlaceholder')}
        />
        <OriginHint original={originals.containmentOwner} current={owner} />

        {actions.map((action) => {
          const status = inferContainmentStatus(action);
          const open = openId === action.id;
          const ownerMissing = !String(action.owner || '').trim();
          const notesMissing = !String(action.notes || '').trim();
          const sortMissing = action.kind === 'SORT_100' && !(Number(action.qtyChecked) > 0);
          const missing = status !== 'DONE'
            ? (ownerMissing
              ? t('containment.missingOwner')
              : sortMissing
                ? t('containment.missingQty')
                : notesMissing
                  ? t('containment.missingNotes')
                  : t('containment.missingOther'))
            : null;
          return (
            <div
              key={action.id}
              className={`pfe-ica${status === 'DONE' ? ' done' : status === 'DOING' ? ' doing' : ''}${open ? ' open' : ''}`}
            >
              <div
                className="pfe-ica-head"
                role="button"
                tabIndex={0}
                onClick={() => setOpenId(open ? null : action.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenId(open ? null : action.id);
                  }
                }}
              >
                <ChevronDown
                  size={16}
                  style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s' }}
                />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{containmentActionTitle(action)}</div>
                  <div className="pfe-containment-hint">
                    {action.required ? t('containment.required') : t('containment.optional')}
                    {action.location ? ` · ${action.location}` : ''}
                    {missing ? ` · ${missing}` : ''}
                  </div>
                </div>
                <span className={`pfe-ica-status ${status.toLowerCase()}`} aria-live="polite">
                  {containmentStatusLabel(status)}
                </span>
              </div>
              {open && (
                <div className="pfe-ica-body">
                  <div className="pfe-ica-grid">
                    <div>
                      <label className="pfe-containment-label">{t('containment.actionOwner')}</label>
                      <input
                        className="pfe-containment-input"
                        value={action.owner}
                        disabled={locked}
                        onChange={(e) => applyAction(action.id, { owner: e.target.value })}
                        placeholder={owner ? t('containment.actionOwnerExample', { name: owner }) : t('containment.personName')}
                      />
                      <p className="pfe-containment-hint">
                        {t('containment.actionOwnerHint')}
                      </p>
                      <OriginHint original={action.originalOwner} current={action.owner} />
                    </div>
                    <div>
                      <label className="pfe-containment-label">{t('containment.where')}</label>
                      <input
                        className="pfe-containment-input"
                        value={action.location}
                        disabled={locked}
                        onChange={(e) => applyAction(action.id, { location: e.target.value })}
                      />
                      <OriginHint original={action.originalLocation} current={action.location} />
                    </div>
                    {action.kind === 'SORT_100' && (
                      <>
                        <div>
                          <label className="pfe-containment-label">{t('containment.qtyChecked')}</label>
                          <input
                            className="pfe-containment-input"
                            type="number"
                            min={0}
                            value={action.qtyChecked}
                            disabled={locked}
                            onChange={(e) =>
                              applyAction(action.id, { qtyChecked: e.target.value === '' ? '' : Number(e.target.value) })
                            }
                          />
                          <OriginHint original={action.originalQtyChecked} current={action.qtyChecked} />
                        </div>
                        <div>
                          <label className="pfe-containment-label">{t('containment.qtyNok')}</label>
                          <input
                            className="pfe-containment-input"
                            type="number"
                            min={0}
                            value={action.qtyNok}
                            disabled={locked}
                            onChange={(e) =>
                              applyAction(action.id, { qtyNok: e.target.value === '' ? '' : Number(e.target.value) })
                            }
                          />
                          <OriginHint original={action.originalQtyNok} current={action.qtyNok} />
                        </div>
                      </>
                    )}
                  </div>
                  <label className="pfe-containment-label">{t('containment.notesShort')}</label>
                  <input
                    className="pfe-containment-input"
                    value={action.notes}
                    disabled={locked}
                    onChange={(e) => applyAction(action.id, { notes: e.target.value })}
                    placeholder={t('containment.notesShortPlaceholder')}
                  />
                  <OriginHint original={action.originalNotes} current={action.notes} />
                  <OriginHint
                    original={action.originalStatus ? containmentStatusLabel(action.originalStatus as any) : ''}
                    current={containmentStatusLabel(action.status)}
                    label={t('containment.originalStatus')}
                  />
                </div>
              )}
            </div>
          );
        })}

        {!locked && (
          <button
            type="button"
            className="pfe-btn-secondary"
            style={{ width: 'fit-content', marginTop: 4 }}
            onClick={() => {
              const id = `ica-${Date.now()}`;
              dirty.current = true;
              setActions((prev) => [
                ...prev,
                {
                  id,
                  kind: 'OTHER',
                  title: t('containment.otherAction'),
                  owner,
                  location: '',
                  qtyChecked: '',
                  qtyNok: '',
                  status: inferContainmentStatus({ kind: 'OTHER', owner, notes: '', qtyChecked: '', location: '' }),
                  notes: '',
                  required: false,
                },
              ]);
              setOpenId(id);
            }}
          >
            <Plus size={14} /> {t('containment.otherAction')}
          </button>
        )}

        <label className="pfe-containment-label">{t('containment.notesOptional')}</label>
        <textarea
          className="pfe-containment-area"
          value={notes}
          disabled={locked}
          onChange={(e) => { dirty.current = true; setNotes(e.target.value); }}
          placeholder={t('containment.notesPlaceholder')}
        />
        <OriginHint original={originals.containmentNotes} current={notes} />

        <label className="pfe-containment-check">
          <input
            type="checkbox"
            checked={verified}
            disabled={locked}
            onChange={(e) => { dirty.current = true; setVerified(e.target.checked); setError(null); }}
          />
          <span>{t('containment.confirmLabel')}</span>
        </label>
        {!verified && (
          <p className="pfe-containment-hint">{t('containment.confirmHint')}</p>
        )}

        {!locked && (
          <div style={{ marginTop: 8 }}>
            {error && <div className="pfe-containment-alert err">{error}</div>}
            {message && <div className="pfe-containment-alert ok"><CheckCircle2 size={14} /> {message}</div>}
            <button
              type="button"
              className="pfe-btn-primary"
              disabled={!canCommit}
              title={d3Done ? t('containment.saveChange') : (!verified ? t('containment.confirmFirst') : t('containment.saveAndFinish'))}
              onClick={() => void handleSave(true)}
            >
              {saving
                ? <><Save size={14} /> {t('common.saving')}</>
                : d3Done
                  ? <><CheckCircle2 size={14} /> {t('containment.finished')}</>
                  : <><Save size={14} /> {t('containment.save')}</>}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
