import { PageSkeleton } from '../../components/TableSkeleton';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { fetchPlanDetail, type PlanDetail } from '../../services/capaIndicatorsService';
import { capaBtnSecondary } from '../../components/capa/CapaAdminUi';
import ConfirmDialog from '../../components/ConfirmDialog';
import { domainLabel } from '../../utils/planDomain';
import WorkflowStages from '../../components/capa/WorkflowStages';
import ActionProofs from '../../components/capa/ActionProofs';
import PlanTimeline from '../../components/capa/PlanTimeline';
import PlanComments from '../../components/capa/PlanComments';
import { ExtendDeadline } from '../../components/ExtendDeadline';
import {
  archiveActionPlan,
  createPlanAction,
  getUsersForAssignment,
  rejectActionPlan,
  rejectPlanAction,
  validatePlanAction,
  warnActionPlan,
  warnPlanAction,
} from '../../services/actionPlanService';

type Dialog =
  | { kind: 'warnPlan' }
  | { kind: 'work' }
  | { kind: 'rejectPlan' }
  | { kind: 'warnAction'; id: string; title: string; to: string }
  | { kind: 'rejectAction'; id: string; title: string };

type Ask = { title: string; text: string; label: string; danger?: boolean; run: () => Promise<void> };

const NAVY = '#000168';
const GOOD = '#2f855a';
const BAD = '#dc2626';
const ORANGE = '#ea580c';
const MUTED = '#64748b';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

function Card({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-slate-200 rounded-xl p-4 ${className}`}>
      {title && <h2 className="text-sm font-semibold text-slate-800 mb-3">{title}</h2>}
      {children}
    </section>
  );
}

function Stat({ label, value, sub, tone = NAVY, bar }: { label: string; value: string; sub?: string; tone?: string; bar?: number }) {
  return (
    <div className="rounded-xl bg-white shadow-sm px-4 py-3" style={{ border: '1px solid #e4e8f2', borderTop: `3px solid ${tone}` }}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1.5 text-[26px] font-extrabold leading-none tabular-nums" style={{ color: tone === BAD ? BAD : NAVY }}>{value}</div>
      {bar != null && (
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-2"><div className="h-full rounded-full" style={{ width: `${bar}%`, background: GOOD }} /></div>
      )}
      {sub && <div className="text-[11px] mt-1.5 text-slate-500">{sub}</div>}
    </div>
  );
}

function Person({ name, caption }: { name: string; caption: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 h-8 shrink-0 rounded-full text-white text-[11px] font-bold flex items-center justify-center" style={{ background: name ? NAVY : '#cbd5e1' }}>{initials(name)}</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-800 truncate">{name || '—'}</div>
        <div className="text-[11px] text-slate-500">{caption}</div>
      </div>
    </div>
  );
}

/** The page of one CAPA plan, for the people who steer them: where it stands, who carries it, what blocks it, what happened. */
export default function PlanPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [fTo, setFTo] = useState('');
  const [fText, setFText] = useState('');
  const [fTitle, setFTitle] = useState('');
  const [fDeadline, setFDeadline] = useState('');
  const [fPriority, setFPriority] = useState(2);

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setLoading(true);
    setError('');
    try {
      setPlan(await fetchPlanDetail(accessToken, id));
    } catch (err: any) {
      setError(err?.response?.status === 404 ? t('planPage.notFound') : t('planPage.loadError'));
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, id, t]);

  useEffect(() => { void load(); }, [load]);

  // the people list is only needed once a dialog needs it
  useEffect(() => {
    if (!dialog || people.length > 0 || !accessToken) return;
    getUsersForAssignment(accessToken).then((res) => {
      const payload: any = res.data;
      const list: any[] = Array.isArray(payload) ? payload : payload?.data ?? payload?.items ?? payload?.['$values'] ?? [];
      setPeople(list
        .map((u) => ({ id: String(u.id ?? u.Id ?? ''), name: String(u.fullName ?? u.FullName ?? u.email ?? u.Email ?? '') }))
        .filter((u) => u.id && u.name)
        .sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => setPeople([]));
  }, [dialog, people.length, accessToken]);

  const locale = i18n.language === 'en' ? 'en-GB' : i18n.language === 'it' ? 'it-IT' : 'fr-FR';
  const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  if (loading) return <PageSkeleton figures={4} panels={2} />;
  if (error || !plan) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-semibold" style={{ color: BAD }}>{error || t('planPage.loadError')}</p>
        <button type="button" onClick={() => navigate('/admin/action-plans')} className={`${capaBtnSecondary} mt-3`}>{t('planPage.backToPlans')}</button>
      </div>
    );
  }

  const h = plan.health;
  const canReject = plan.status === 'Ongoing' && plan.progress >= 100;

  const fail = (e: any, fallback: string) => setNotice({ ok: false, text: e?.response?.data?.error || fallback });

  const openDialog = (d: Dialog) => {
    setMenuOpen(false);
    setFText('');
    setFTitle('');
    setFDeadline('');
    setFPriority(2);
    setFTo(d.kind === 'warnAction' ? d.to : plan.responsible.userId ?? '');
    setDialog(d);
  };

  const submitDialog = async () => {
    if (!accessToken || !dialog || !id) return;
    setBusy(true);
    setNotice(null);
    try {
      if (dialog.kind === 'warnPlan') {
        await warnActionPlan(accessToken, id, fTo, fText.trim());
        setNotice({ ok: true, text: `Avertissement envoyé à ${people.find((p) => p.id === fTo)?.name ?? 'la personne'}.` });
      } else if (dialog.kind === 'warnAction') {
        await warnPlanAction(accessToken, dialog.id, fText.trim());
        setNotice({ ok: true, text: 'Avertissement envoyé.' });
      } else if (dialog.kind === 'rejectPlan') {
        await rejectActionPlan(accessToken, id, fText.trim());
        setNotice({ ok: true, text: 'Plan renvoyé pour correction ; le responsable a été prévenu.' });
      } else if (dialog.kind === 'rejectAction') {
        await rejectPlanAction(accessToken, dialog.id, fText.trim());
        setNotice({ ok: true, text: `« ${dialog.title} » renvoyée en cours ; la personne a été prévenue.` });
      } else {
        await createPlanAction(accessToken, {
          title: fTitle.trim(),
          description: fText.trim() || undefined,
          deadline: fDeadline || undefined,
          priority: fPriority,
          assignedToId: fTo || undefined,
          actionPlanId: id,
        });
        setNotice({ ok: true, text: `« ${fTitle.trim()} » ajoutée au plan.` });
      }
      setDialog(null);
      await load();
    } catch (e: any) {
      fail(e, "L'opération a échoué.");
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const askValidate = (a: PlanDetail['actions'][number]) => setAsk({
    title: 'Valider la sous-action',
    text: `« ${a.title} » sera verrouillée : son avancement ne pourra plus être modifié.`,
    label: 'Valider',
    run: async () => {
      try { await validatePlanAction(accessToken!, a.id); setNotice({ ok: true, text: `« ${a.title} » validée.` }); await load(); }
      catch (e: any) { fail(e, 'La validation a échoué.'); }
    },
  });

  const askArchive = () => {
    setMenuOpen(false);
    setAsk({
      title: 'Archiver le plan',
      text: `« ${plan.title} » sera retiré des listes actives. L'archive le conserve et il peut être restauré.`,
      label: 'Archiver',
      danger: true,
      run: async () => {
        try { await archiveActionPlan(accessToken!, id!); navigate('/admin/action-plans'); }
        catch (e: any) { fail(e, "L'archivage a échoué."); }
      },
    });
  };

  const runAsk = async () => {
    if (!ask) return;
    setBusy(true);
    try { await ask.run(); } finally { setBusy(false); setAsk(null); }
  };

  const dialogReady = !dialog ? false
    : dialog.kind === 'work' ? fTitle.trim().length >= 3
    : dialog.kind === 'warnPlan' ? !!fTo && fText.trim().length >= 3
    : fText.trim().length >= 3;
  const closed = plan.status === 'Closed' || plan.status === 'Archived';
  const healthTone = h.state === 'late' ? BAD : h.state === 'closedLate' ? ORANGE : h.state === 'noDeadline' ? MUTED : GOOD;
  const healthText = h.state === 'late' ? t('planPage.health.late', { count: h.lateDays })
    : t(`planPage.health.${h.state}`);
  const total = plan.actions.length;
  const done = plan.actions.filter((a) => a.state === 'validated' || a.state === 'cancelled').length;
  const visible = plan.actions.filter((a) => showDone || (a.state !== 'validated' && a.state !== 'cancelled'));
  const hidden = plan.actions.length - plan.actions.filter((a) => a.state !== 'validated' && a.state !== 'cancelled').length;

  const days = plan.deadline ? Math.ceil((new Date(plan.deadline).getTime() - Date.now()) / 86_400_000) : null;
  const deadlineSub = closed ? (plan.completedAt ? t('planPage.closedOn', { date: date(plan.completedAt) }) : undefined)
    : days == null ? t('planPage.noDeadline')
    : days < 0 ? t('planPage.daysLate', { count: -days })
    : t('planPage.daysLeft', { count: days });

  const statusLabel = t(`planPage.status.${plan.status}`, { defaultValue: plan.status });
  const typeLabel = t(`planPage.type.${plan.type}`, { defaultValue: plan.type });

  return (
    <div className="text-slate-900 w-full min-w-0 pb-8">
      {/* identity of the plan */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <button type="button" onClick={() => navigate(-1)} className="text-xs font-semibold mb-2 hover:underline" style={{ color: MUTED }}>← {t('planPage.back')}</button>
          <h1 className="text-xl font-bold m-0" style={{ color: NAVY }}>{plan.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: '#eef0ff', color: NAVY }}>{statusLabel}</span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">{typeLabel}</span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700" title={t('planDomain.label')}>{domainLabel(plan.domain)}</span>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: `${healthTone}1a`, color: healthTone }}>{healthText}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {plan.claim && (
            <Link to={`/admin/claims/eight-d/${encodeURIComponent(plan.claim.id)}`} className={capaBtnSecondary}>{t('planPage.openClaim')}</Link>
          )}
          <button type="button" onClick={() => void load()} className={capaBtnSecondary}>{t('dashboard.refresh')}</button>
          {plan.status !== 'Archived' && (
            <div className="relative">
              <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen} className={capaBtnSecondary}>Gérer ▾</button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div role="menu" className="absolute right-0 mt-1 w-60 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-sm">
                    <button role="menuitem" type="button" disabled={plan.status === 'Closed'} onClick={() => openDialog({ kind: 'warnPlan' })} className="w-full text-left px-3 py-2 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Avertir la personne</button>
                    <button role="menuitem" type="button" disabled={plan.status === 'Closed'} onClick={() => openDialog({ kind: 'work' })} className="w-full text-left px-3 py-2 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">Ajouter du travail</button>
                    <button role="menuitem" type="button" disabled={!canReject} onClick={() => openDialog({ kind: 'rejectPlan' })} className="w-full text-left px-3 py-2 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed" title={canReject ? undefined : 'Seul un plan terminé, en attente de validation, peut être rejeté'}>Rejeter (renvoyer pour correction)</button>
                    <div className="my-1 border-t border-slate-100" />
                    <button role="menuitem" type="button" onClick={askArchive} className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50">Archiver</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{notice.text}</div>
      )}

      {/* the six steps of the general workflow (read from the plan) */}
      <div className="mb-4"><WorkflowStages current={plan.workflowStage} compact /></div>

      {/* what blocks it */}
      {(h.waitingValidation > 0 || plan.lastRejectComment) && (
        <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' }}>
          {h.waitingValidation > 0 && <div><b>{t('planPage.waitingValidation', { count: h.waitingValidation })}</b></div>}
          {plan.lastRejectComment && <div className="mt-1">{t('planPage.rejected', { date: date(plan.lastRejectedAt), comment: plan.lastRejectComment })}</div>}
        </div>
      )}

      {/* four figures */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label={t('planPage.progress')} value={`${plan.progress} %`} bar={plan.progress} tone={NAVY} />
        <Stat label={t('planPage.deadline')} value={date(plan.deadline)} sub={deadlineSub} tone={healthTone} />
        <Stat label={t('planPage.actions')} value={`${done}/${total}`} sub={h.lateActions > 0 ? t('planPage.lateActions', { count: h.lateActions }) : t('planPage.noLateAction')} tone={h.lateActions > 0 ? BAD : GOOD} />
        <Stat label={t('planPage.proofs')} value={String(h.proofCount)} sub={t('planPage.proofsHint')} tone={NAVY} />
      </div>
      {!closed && plan.deadline && (
        <div className="mb-4 flex justify-end">
          <ExtendDeadline kind="plan" id={plan.id} deadline={plan.deadline} open onDone={() => void load()} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* the work */}
        <Card title={t('planPage.workTitle')} className="lg:col-span-2">
          {plan.actions.length === 0 ? (
            <p className="text-sm text-slate-400 m-0">{t('planPage.noActions')}</p>
          ) : (
            <>
              <ul className="m-0 p-0 list-none">
                {visible.map((a) => (
                  <li key={a.id} className="py-2.5 border-t border-slate-100 first:border-t-0 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800">{a.title}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {a.responsible.name || t('planPage.unassigned')}
                          {a.deadline && <> · {date(a.deadline)}</>}
                          {a.lateDays > 0 && <b style={{ color: BAD }}> · {t('planPage.daysLate', { count: a.lateDays })}</b>}
                        </div>
                        {accessToken && <ActionProofs token={accessToken} planActionId={a.id} count={a.proofCount ?? 0} refreshKey={plan.history.length} />}
                      </div>
                      <div className="shrink-0 text-right">
                        {(a.state === 'waitingValidation' || a.state === 'open') && !closed && (
                          <div className="flex justify-end gap-1.5 mb-1.5">
                            {a.state === 'waitingValidation' && (
                              <>
                                <button type="button" onClick={() => askValidate(a)} className="px-2 py-0.5 text-[11px] font-semibold rounded-md text-white" style={{ background: NAVY }}>Valider</button>
                                <button type="button" onClick={() => openDialog({ kind: 'rejectAction', id: a.id, title: a.title })} className="px-2 py-0.5 text-[11px] font-semibold rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">Rejeter</button>
                              </>
                            )}
                            {a.state === 'open' && (
                              <ExtendDeadline kind="action" id={a.id} deadline={a.deadline} open onDone={() => void load()} />
                            )}
                            {a.state === 'open' && a.responsible.userId && (
                              <button type="button" onClick={() => openDialog({ kind: 'warnAction', id: a.id, title: a.title, to: a.responsible.userId ?? '' })} className="px-2 py-0.5 text-[11px] font-semibold rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50">Avertir</button>
                            )}
                          </div>
                        )}
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                          style={a.state === 'waitingValidation' ? { background: '#fff7ed', color: ORANGE }
                            : a.state === 'validated' ? { background: '#f0fdf4', color: GOOD }
                              : a.state === 'cancelled' ? { background: '#f1f5f9', color: MUTED }
                                : { background: '#eef0ff', color: NAVY }}>
                          {t(`planPage.state.${a.state}`)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${a.progress}%`, background: a.lateDays > 0 ? BAD : GOOD }} /></div>
                      <span className="text-[11px] tabular-nums text-slate-600 w-9 text-right">{a.progress} %</span>
                    </div>
                  </li>
                ))}
              </ul>
              {hidden > 0 && (
                <button type="button" onClick={() => setShowDone((v) => !v)} className="mt-2 text-[11px] font-semibold underline" style={{ color: NAVY }}>
                  {showDone ? t('planPage.hideDone') : t('planPage.showDone', { count: hidden })}
                </button>
              )}
            </>
          )}
        </Card>

        {/* who and where */}
        <div className="flex flex-col gap-3">
          <Card title={t('planPage.people')}>
            <div className="space-y-3">
              <Person name={plan.responsible.name} caption={t('planPage.responsible')} />
              <Person name={plan.createdBy.name} caption={t('planPage.createdBy', { date: date(plan.createdAt) })} />
            </div>
            <dl className="m-0 mt-4 pt-3 border-t border-slate-100 text-xs space-y-1.5">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">{t('planPage.organization')}</dt><dd className="m-0 font-semibold text-slate-800">{plan.organizationName || '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-slate-500">{t('planPage.department')}</dt><dd className="m-0 font-semibold text-slate-800">{plan.departmentName || '—'}</dd></div>
            </dl>
          </Card>

          {plan.claim && (
            <Card title={t('planPage.origin')}>
              <div className="text-sm font-semibold text-slate-800">{plan.claim.title}</div>
              <div className="text-[11px] text-slate-500 mt-1">{plan.claim.clientId} · {plan.claim.severity}</div>
            </Card>
          )}

          {plan.description && (
            <Card title={t('planPage.description')}>
              <p className="text-xs text-slate-600 m-0 leading-relaxed">{plan.description}</p>
            </Card>
          )}

          {accessToken && id && <PlanComments token={accessToken} planId={id} />}
        </div>
      </div>

      <Card title={t('planPage.history')} className="mt-3">
        {/* the plan's own events and those of its sub-actions (progress, proofs, validation, rejection) */}
        {accessToken && id ? <PlanTimeline token={accessToken} planId={id} refreshKey={plan.history.length} /> : null}
      </Card>

      {ask && (
        <ConfirmDialog title={ask.title} text={ask.text} confirmLabel={ask.label} danger={ask.danger} busy={busy} onConfirm={() => void runAsk()} onCancel={() => setAsk(null)} />
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => !busy && setDialog(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 m-0">
              {dialog.kind === 'warnPlan' ? 'Avertir une personne'
                : dialog.kind === 'warnAction' ? 'Avertir le responsable'
                : dialog.kind === 'rejectPlan' ? 'Rejeter le plan'
                : dialog.kind === 'rejectAction' ? 'Rejeter la sous-action'
                : 'Ajouter du travail'}
            </h3>
            <p className="text-sm text-slate-500 mt-1 mb-3">
              {dialog.kind === 'warnPlan' ? `Notification envoyée et gardée dans l'historique du plan « ${plan.title} ».`
                : dialog.kind === 'warnAction' ? `À propos de « ${dialog.title} ».`
                : dialog.kind === 'rejectPlan' ? `Le plan repasse en cours (90 %). Indiquez le motif : le responsable le recevra.`
                : dialog.kind === 'rejectAction' ? `« ${dialog.title} » repasse en cours (75 %). Indiquez le motif : la personne le recevra.`
                : `Une nouvelle sous-action est créée dans « ${plan.title} ».`}
            </p>

            {dialog.kind === 'work' && (
              <>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Travail à réaliser</label>
                <input value={fTitle} onChange={(e) => setFTitle(e.target.value)} maxLength={200} placeholder="Intitulé de la sous-action" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3" />
              </>
            )}

            {(dialog.kind === 'warnPlan' || dialog.kind === 'work') && (
              <>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{dialog.kind === 'work' ? 'Responsable' : 'Destinataire'}</label>
                <select value={fTo} onChange={(e) => setFTo(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 bg-white">
                  <option value="">{dialog.kind === 'work' ? 'Non assigné' : 'Choisir une personne…'}</option>
                  {plan.responsible.userId && !people.some((p) => p.id === plan.responsible.userId) && (
                    <option value={plan.responsible.userId}>{plan.responsible.name}</option>
                  )}
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </>
            )}

            {dialog.kind === 'work' && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Échéance</label>
                  <input type="date" value={fDeadline} onChange={(e) => setFDeadline(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Priorité</label>
                  <select value={fPriority} onChange={(e) => setFPriority(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value={1}>Haute</option>
                    <option value={2}>Moyenne</option>
                    <option value={3}>Basse</option>
                  </select>
                </div>
              </div>
            )}

            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {dialog.kind === 'work' ? 'Consignes (facultatif)' : dialog.kind.startsWith('reject') ? 'Motif' : 'Message'}
            </label>
            <textarea value={fText} onChange={(e) => setFText(e.target.value)} rows={4} maxLength={500} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setDialog(null)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Annuler</button>
              <button type="button" disabled={busy || !dialogReady} onClick={() => void submitDialog()} className="px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50" style={{ background: NAVY }}>
                {busy ? 'En cours…' : dialog.kind === 'work' ? 'Ajouter' : dialog.kind.startsWith('reject') ? 'Rejeter' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
