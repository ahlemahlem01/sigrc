import { PageSkeleton } from '../../components/TableSkeleton';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { fetchPlanDetail, type PlanDetail } from '../../services/capaIndicatorsService';
import { capaBtnSecondary } from '../../components/capa/CapaAdminUi';

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

  const locale = i18n.language === 'en' ? 'en-GB' : i18n.language === 'it' ? 'it-IT' : 'fr-FR';
  const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const dateTime = (iso: string) => new Date(iso).toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

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

  const eventText = (e: PlanDetail['history'][number]) => {
    if (e.type === 'status_changed' && e.toStatus) return t('planPage.event.status', { from: t(`planPage.status.${e.fromStatus}`, { defaultValue: e.fromStatus ?? '—' }), to: t(`planPage.status.${e.toStatus}`, { defaultValue: e.toStatus }) });
    if (e.type === 'assigned') return t('planPage.event.assigned', { name: e.toAssignee ?? '—' });
    if (e.type === 'unassigned') return t('planPage.event.unassigned');
    return t(`planPage.event.${e.type}`, { defaultValue: e.note || e.type });
  };

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
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: `${healthTone}1a`, color: healthTone }}>{healthText}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {plan.claim && (
            <Link to={`/admin/claims/eight-d/${encodeURIComponent(plan.claim.id)}`} className={capaBtnSecondary}>{t('planPage.openClaim')}</Link>
          )}
          <button type="button" onClick={() => void load()} className={capaBtnSecondary}>{t('dashboard.refresh')}</button>
        </div>
      </div>

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
                      </div>
                      <div className="shrink-0 text-right">
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
        </div>
      </div>

      <Card title={t('planPage.history')} className="mt-3">
        {plan.history.length === 0 ? (
          <p className="text-sm text-slate-400 m-0">{t('planPage.noHistory')}</p>
        ) : (
          <ul className="m-0 p-0 list-none space-y-2">
            {plan.history.map((e, i) => (
              <li key={i} className="flex items-baseline gap-3 text-xs">
                <span className="tabular-nums text-slate-400 w-28 shrink-0">{dateTime(e.at)}</span>
                <span className="text-slate-700"><b>{e.by || '—'}</b> · {eventText(e)}{e.note && e.type !== 'created' ? <span className="text-slate-500"> — {e.note}</span> : null}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
