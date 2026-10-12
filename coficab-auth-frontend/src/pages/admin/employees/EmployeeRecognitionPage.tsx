import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Medal, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { adminEmployeeService } from '../../../services/adminEmployeeService';
import { getUsers } from '../../../services/adminService';
import {
  fetchEmployeePerformance,
  type EmployeePerformanceRow,
} from '../../../services/employeePerformanceService';
import { BADGE_DEFINITIONS } from '../../../utils/badges';
import UserAvatar from '../../../components/UserAvatar';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../../i18n';

const unwrap = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.['$values'])) return raw['$values'];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
};

const pick = (obj: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

type ProfileLite = {
  id: string;
  fullName: string;
  email: string;
  profilePictureUrl?: string | null;
};

function mergeProfiles(profilesRaw: any[], authUsers: any[]): ProfileLite[] {
  const byId = new Map(authUsers.map((u: any) => [String(u.id ?? u.Id).toLowerCase(), u]));
  return unwrap(profilesRaw)
    .map((p: any) => {
      const id = String(p.userId ?? p.UserId ?? p.id ?? p.Id ?? '');
      const auth = byId.get(id.toLowerCase());
      return {
        id,
        fullName:
          pick(p, 'fullName', 'FullName', 'name', 'Name') ??
          pick(auth, 'fullName', 'FullName', 'userName', 'UserName') ??
          '—',
        email: pick(p, 'email', 'Email') ?? pick(auth, 'email', 'Email') ?? '',
        profilePictureUrl:
          pick(p, 'profilePictureUrl', 'ProfilePictureUrl') ??
          pick(auth, 'profilePictureUrl', 'ProfilePictureUrl'),
      };
    })
    .filter((p) => p.id);
}


function deadlineScoreOf(row: EmployeePerformanceRow): number {
  if (typeof row.competencies?.deadlines === 'number') return row.competencies.deadlines;
  return Math.max(0, 100 - Math.min(100, row.avgDelayDays * 4));
}

function computeRecognitionScore(row: EmployeePerformanceRow): number {
  return Math.round(row.closureRate * 0.6 + deadlineScoreOf(row) * 0.4);
}

/** i18n keys */
const WORKLOAD_LABEL: Record<EmployeePerformanceRow['workload'], string> = {
  low: 'recognition.loadLow',
  medium: 'recognition.loadMedium',
  high: 'recognition.loadHigh',
};

function computeRiskScore(row: EmployeePerformanceRow): number {
  const overduePts = row.overdueCount * 20;
  const workloadPts = row.workload === 'high' ? 40 : row.workload === 'medium' ? 15 : 0;
  const closurePts = Math.max(0, 70 - row.closureRate);
  return overduePts + workloadPts + closurePts;
}

function isWatchCandidate(row: EmployeePerformanceRow): boolean {
  return (
    row.overdueCount > 0 ||
    row.workload === 'high' ||
    ((row.activeDossiers > 0 || row.overdueCount > 0) && row.closureRate < 50)
  );
}

function fmtDays(n: number): string {
  const rounded = Math.round(n);
  return i18n.t('recognition.daysShort', { n: rounded });
}

function watchContext(row: EmployeePerformanceRow, teamAvgDelay: number, teamSize: number): string {
  const delayPart = i18n.t('recognition.avgDelay', { days: fmtDays(row.avgDelayDays) });
  if (teamSize < 2 || !Number.isFinite(teamAvgDelay)) return delayPart;
  const delta = Math.round(row.avgDelayDays - teamAvgDelay);
  if (delta > 0) return `${delayPart}, ${i18n.t('recognition.vsTeam', { delta: `+${delta}` })}`;
  if (delta < 0) return `${delayPart}, ${i18n.t('recognition.vsTeam', { delta: String(delta) })}`;
  return `${delayPart}, ${i18n.t('recognition.teamAverage')}`;
}

type PodiumEntry = EmployeePerformanceRow & {
  score: number;
  closurePart: number;
  deadlinePart: number;
  deadlineScore: number;
};

export default function EmployeeRecognitionPage() {
  const { t } = useTranslation();
  const MONTH_LABEL = new Date().toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' });
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [performance, setPerformance] = useState<EmployeePerformanceRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [notifiedIds, setNotifiedIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    userId: '',
    badgeId: BADGE_DEFINITIONS[0]?.id ?? '',
    comment: '',
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const [profilesRaw, usersRaw] = await Promise.all([
        adminEmployeeService.getAllProfiles(accessToken),
        getUsers(accessToken),
      ]);

      const merged = mergeProfiles(profilesRaw, unwrap(usersRaw));
      setProfiles(merged);

      const perf = await fetchEmployeePerformance(accessToken, merged);
      setPerformance(perf);

    } catch (e) {
      console.error(e);
      setError(i18n.t('recognition.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const ranked = useMemo((): PodiumEntry[] => {
    return [...performance]
      .map((row) => {
        const deadlineScore = deadlineScoreOf(row);
        return {
          ...row,
          deadlineScore,
          closurePart: Math.round(row.closureRate * 0.6),
          deadlinePart: Math.round(deadlineScore * 0.4),
          score: computeRecognitionScore(row),
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.closureRate - a.closureRate ||
          a.avgDelayDays - b.avgDelayDays,
      );
  }, [performance]);

  const podium = ranked.slice(0, 3);

  const teamAvgDelay = useMemo(() => {
    if (performance.length === 0) return 0;
    return performance.reduce((sum, r) => sum + r.avgDelayDays, 0) / performance.length;
  }, [performance]);

  const watchList = useMemo(() => {
    return [...performance]
      .filter(isWatchCandidate)
      .map((r) => ({
        ...r,
        riskScore: computeRiskScore(r),
        context: watchContext(r, teamAvgDelay, performance.length),
      }))
      .sort(
        (a, b) =>
          b.riskScore - a.riskScore ||
          b.overdueCount - a.overdueCount ||
          a.fullName.localeCompare(b.fullName, i18n.language),
      )
      .slice(0, 8);
  }, [performance, teamAvgDelay]);

  const openModal = () => {
    setForm({
      userId: profiles[0]?.id ?? '',
      badgeId: BADGE_DEFINITIONS[0]?.id ?? '',
      comment: '',
    });
    setModalOpen(true);
  };

  const submitBadge = async (e: FormEvent) => {
    e.preventDefault();
    if (!accessToken || !form.userId || !form.badgeId) return;
    const def = BADGE_DEFINITIONS.find((d) => d.id === form.badgeId);
    if (!def) return;
    setSaving(true);
    try {
      await adminEmployeeService.awardBadge(accessToken, {
        userId: form.userId,
        name: def.name,
        description: form.comment.trim() || def.description,
        icon: def.id,
        color: def.color,
        category: def.id,
      });
      setModalOpen(false);
      await load();
    } catch (err) {
      console.error(err);
      window.alert(t('employeeFile.badgeFailed'));
    } finally {
      setSaving(false);
    }
  };

  const recalculateBadges = async () => {
    if (!accessToken || recalculating) return;
    setRecalculating(true);
    try {
      const { awarded, employees } = await adminEmployeeService.recalculateBadges(accessToken);
      window.alert(t('recognition.recalculateDone', { count: awarded, employees }));
      await load();
    } catch (err) {
      console.error(err);
      window.alert(t('recognition.recalculateFailed'));
    } finally {
      setRecalculating(false);
    }
  };

  const notifyPodiumMember = async (emp: PodiumEntry, place: number) => {
    if (!accessToken || notifyingId) return;
    setNotifyingId(emp.userId);
    try {
      await adminEmployeeService.notifyPodium(accessToken, {
        monthLabel: MONTH_LABEL,
        recipients: [{
          userId: emp.userId,
          place,
          fullName: emp.fullName,
          score: emp.score,
        }],
      });
      setNotifiedIds((prev) => (prev.includes(emp.userId) ? prev : [...prev, emp.userId]));
    } catch (err) {
      console.error(err);
      window.alert(t('recognition.notifyFailed', { name: emp.fullName }));
    } finally {
      setNotifyingId(null);
    }
  };

  const selectedBadge = BADGE_DEFINITIONS.find((d) => d.id === form.badgeId);

  return (
    <div className="rec-wrap">
      <div className="rec-head">
        <div>
          <div className="rec-title">{t('employeeFile.recognition')}</div>
          <div className="rec-sub">
            {t('recognition.subtitle', { month: MONTH_LABEL })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="rec-btn-primary"
            onClick={recalculateBadges}
            disabled={recalculating}
            title={t('recognition.recalculateHint')}
          >
            {recalculating ? t('recognition.recalculating') : t('recognition.recalculate')}
          </button>
          <button type="button" className="rec-btn-primary" onClick={openModal}>
            {t('recognition.awardBadge')}
          </button>
        </div>
      </div>

      <div className="rec-shell">
        <div className="rec-panel">
          <div className="rec-top">
            <div className="rec-info">
              <div className="rec-info-title">{t('recognition.criteria')}</div>
              <div className="rec-info-grid">
                <div>
                  <div className="rec-info-label">{t('recognition.podiumTop3')}</div>
                  <p>
                    {t('recognition.scoreIs')} <b>{t('recognition.scoreClosure')}</b> + <b>{t('recognition.scoreDeadlines')}</b>.{' '}
                    {t('recognition.tieBreak')}
                  </p>
                </div>
                <div>
                  <div className="rec-info-label">{t('recognition.watch')}</div>
                  <p>
                    {t('recognition.watchHelp')}
                  </p>
                </div>
              </div>
            </div>
            {error && <div className="rec-error">{error}</div>}
          </div>

          <div className="rec-block">
            <div className="rec-block-head">
              <div className="rec-block-title">{t('recognition.podiumTitle')}</div>
              <div className="rec-formula-pill">{t('recognition.formula')}</div>
            </div>

            {loading ? (
              <div className="rec-podium-stage is-loading">
                {[2, 1, 3].map((place) => (
                  <div key={place} className={`rec-podium-col place-${place}`}>
                    <div className="rec-podium-card sk" />
                    <div className="rec-podium-plinth sk" />
                  </div>
                ))}
              </div>
            ) : podium.length === 0 ? (
              <div className="rec-empty-panel">{t('recognition.noRanking')}</div>
            ) : (
              <div className="rec-podium-stage">
                {[1, 0, 2]
                  .filter((idx) => podium[idx])
                  .map((idx) => {
                    const emp = podium[idx];
                    const place = idx + 1;
                    const Icon = place === 1 ? Trophy : Medal;
                    return (
                      <article
                        key={emp.userId}
                        className={`rec-podium-col place-${place}`}
                        style={{ animationDelay: `${place === 1 ? 0.05 : place === 2 ? 0.12 : 0.18}s` }}
                      >
                        <div className={`rec-podium-card place-${place}`}>
                          <div className="rec-podium-glow" />
                          <div className={`rec-place-badge place-${place}`}>
                            <Icon size={14} strokeWidth={2.2} />
                            <span>{t(`recognition.place${place}`)}</span>
                          </div>
                          <div className="rec-podium-avatar-wrap">
                            <UserAvatar
                              user={{
                                id: emp.userId,
                                fullName: emp.fullName,
                                profilePictureUrl: emp.profilePictureUrl,
                              }}
                              name={emp.fullName}
                              size={place === 1 ? 64 : 52}
                              radius="lg"
                            />
                          </div>
                          <div className="rec-podium-name">{emp.fullName}</div>
                          <div className="rec-podium-email">{emp.email}</div>
                          <div className="rec-podium-score">
                            <span className="rec-podium-score-val">{emp.score}</span>
                            <span className="rec-podium-score-lbl">{t('recognition.pts')}</span>
                          </div>
                          <div className="rec-podium-meters">
                            <div className="rec-meter">
                              <div className="rec-meter-top">
                                <span>{t('recognition.closure')}</span>
                                <strong>{emp.closureRate}%</strong>
                              </div>
                              <div className="rec-meter-track">
                                <div
                                  className="rec-meter-fill closure"
                                  style={{ width: `${Math.min(100, emp.closureRate)}%` }}
                                />
                              </div>
                            </div>
                            <div className="rec-meter">
                              <div className="rec-meter-top">
                                <span>{t('skills.deadlines')}</span>
                                <strong>{emp.deadlineScore}</strong>
                              </div>
                              <div className="rec-meter-track">
                                <div
                                  className="rec-meter-fill deadlines"
                                  style={{ width: `${Math.min(100, emp.deadlineScore)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="rec-podium-calc">
                            {emp.closurePart} + {emp.deadlinePart}
                          </div>
                          <button
                            type="button"
                            className="rec-podium-notify"
                            disabled={notifyingId === emp.userId}
                            onClick={(e) => {
                              e.stopPropagation();
                              notifyPodiumMember(emp, place);
                            }}
                          >
                            {notifyingId === emp.userId
                              ? t('fiveWhy.sending')
                              : notifiedIds.includes(emp.userId)
                                ? t('recognition.notifyAgain')
                                : t('recognition.notify')}
                          </button>
                        </div>
                        <div className={`rec-podium-plinth place-${place}`}>{place}</div>
                      </article>
                    );
                  })}
              </div>
            )}
          </div>

          <div className="rec-split">
            <div className="rec-block rec-block-fill">
              <div className="rec-block-head">
                <div className="rec-block-title">{t('recognition.watch')}</div>
                <div className="rec-formula-pill">{t('recognition.watchPill')}</div>
              </div>
              {loading ? (
                <div className="rec-watch-list">
                  {[0, 1, 2].map((i) => <div key={i} className="rec-feed-sk" />)}
                </div>
              ) : watchList.length === 0 ? (
                <div className="rec-empty-panel">
                  {t('recognition.watchEmpty')}
                </div>
              ) : (
                <ul className="rec-watch-list">
                  {watchList.map((r, i) => {
                    const overdueLabel = t('recognition.lateCount', { count: r.overdueCount });
                    return (
                      <li key={r.userId} className="rec-watch-row" style={{ animationDelay: `${i * 0.05}s` }}>
                        <span className="rec-watch-rank">{i + 1}</span>
                        <UserAvatar
                          user={{
                            id: r.userId,
                            fullName: r.fullName,
                            profilePictureUrl: r.profilePictureUrl,
                          }}
                          name={r.fullName}
                          size={32}
                          radius="lg"
                        />
                        <div className="rec-feed-main">
                          <div className="rec-person-name">{r.fullName}</div>
                          <div className="rec-watch-context">{r.context}</div>
                          <div className="rec-watch-tags">
                            <span className={`rec-tag${r.overdueCount > 0 ? ' rec-tag-bad' : ' rec-tag-ok'}`}>
                              {overdueLabel}
                            </span>
                            <span className={`rec-tag${r.workload === 'high' ? ' rec-tag-bad' : r.workload === 'medium' ? ' rec-tag-warn' : ' rec-tag-ok'}`}>
                              {t(WORKLOAD_LABEL[r.workload])}
                            </span>
                            <span className={`rec-tag${r.closureRate < 50 ? ' rec-tag-bad' : r.closureRate < 70 ? ' rec-tag-warn' : ' rec-tag-ok'}`}>
                              {t('recognition.closure')} {r.closureRate}%
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="rec-watch-link"
                          onClick={() =>
                            navigate(`/admin/employees/${r.userId}#employee-plans`, {
                              state: {
                                employee: {
                                  id: r.userId,
                                  email: r.email,
                                  fullName: r.fullName,
                                  department: r.department ?? '',
                                  isLockedOut: false,
                                  roles: [],
                                  permissions: [],
                                },
                              },
                            })
                          }
                        >
                          {t('recognition.viewFiles')}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

          </div>
        </div>
      </div>


      {modalOpen && (
        <div className="rec-overlay" role="dialog" aria-modal="true" onClick={() => !saving && setModalOpen(false)}>
          <form className="rec-modal" onClick={(e) => e.stopPropagation()} onSubmit={submitBadge}>
            <div className="rec-modal-head">
              <div>
                <div className="rec-modal-title">{t('recognition.awardBadge')}</div>
                <div className="rec-modal-sub">{t('recognition.modalSub')}</div>
              </div>
              <button type="button" className="rec-modal-close" onClick={() => setModalOpen(false)} disabled={saving}>
                {t('fiveWhy.close')}
              </button>
            </div>
            <div className="rec-modal-body">
              <label className="rec-field">
                <span>{t('employeesAdmin.colEmployee')}</span>
                <select
                  value={form.userId}
                  onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                  required
                >
                  <option value="" disabled>{t('myActionPlans.select')}</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.fullName}</option>
                  ))}
                </select>
              </label>
              <label className="rec-field">
                <span>{t('employeeFile.badge')}</span>
                <select
                  value={form.badgeId}
                  onChange={(e) => setForm((f) => ({ ...f, badgeId: e.target.value }))}
                  required
                >
                  {BADGE_DEFINITIONS.map((d) => (
                    <option key={d.id} value={d.id}>{t(`employeeBadges.defs.${d.id}.name`, { defaultValue: d.name })}</option>
                  ))}
                </select>
              </label>
              {selectedBadge && (
                <div className="rec-badge-def">
                  <span className="rec-badge-swatch" style={{ background: selectedBadge.color }} />
                  <div>
                    <div className="rec-person-name">{t(`employeeBadges.defs.${selectedBadge.id}.name`, { defaultValue: selectedBadge.name })}</div>
                    <div className="rec-hint">{t(`employeeBadges.defs.${selectedBadge.id}.description`, { defaultValue: selectedBadge.description })}</div>
                  </div>
                </div>
              )}
              <label className="rec-field">
                <span>{t('recognition.comment')}</span>
                <textarea
                  rows={3}
                  value={form.comment}
                  onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                  placeholder={t('recognition.commentPh')}
                />
              </label>
            </div>
            <div className="rec-modal-foot">
              <button type="button" className="rec-btn-ghost" onClick={() => setModalOpen(false)} disabled={saving}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="rec-btn-primary" disabled={saving || !form.userId}>
                {saving ? t('employeeFile.awarding') : t('recognition.award')}
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
  .rec-wrap {
    padding: 20px 24px 28px;
    font-family: 'Inter', sans-serif;
    max-width: none;
  }
  .rec-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; margin-bottom: 18px; flex-wrap: wrap;
  }
  .rec-title {
    font-size: 20px; font-weight: 800; color: #0d1340; letter-spacing: -0.02em;
  }
  .rec-sub {
    font-size: 13px; color: #64748b; margin-top: 4px; max-width: 520px; line-height: 1.45;
    text-transform: capitalize;
  }
  .rec-btn-primary {
    display: inline-flex; align-items: center; height: 36px; padding: 0 14px;
    border-radius: 8px; border: none; background: #000168; color: #fff;
    font-size: 13px; font-weight: 650; cursor: pointer; font-family: inherit;
  }
  .rec-btn-primary:hover:not(:disabled) { background: #00009e; }
  .rec-btn-primary:disabled { opacity: .55; cursor: not-allowed; }
  .rec-btn-ghost {
    height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid #e4e8f2;
    background: #f0f2f8; color: #374151; font-size: 13px; font-weight: 650;
    cursor: pointer; font-family: inherit;
  }
  .rec-btn-ghost:hover:not(:disabled) { background: #e4e8f2; color: #000168; }
  .rec-btn-ghost:disabled { opacity: .55; cursor: not-allowed; }

  .rec-shell {
    background: #fff; border: 1px solid #e4e8f2; border-radius: 16px;
    box-shadow: 0 1px 2px rgba(13,19,64,0.04), 0 10px 30px rgba(13,19,64,0.04);
    overflow: hidden;
  }
  .rec-panel { padding: 18px; }
  .rec-top { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }

  .rec-info {
    background: #f8faff; border: 1px solid #e0e7ff; border-radius: 10px;
    padding: 14px 16px;
  }
  .rec-info-title {
    font-size: 12.5px; font-weight: 700; color: #000168; margin-bottom: 10px;
  }
  .rec-info-grid {
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px;
  }
  .rec-info-label {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .4px; color: #64748b; margin-bottom: 4px;
  }
  .rec-info p {
    margin: 0; font-size: 12.5px; color: #475569; line-height: 1.5;
  }
  .rec-info b { color: #000168; font-weight: 700; }

  .rec-error {
    background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;
    border-radius: 10px; padding: 10px 14px; font-size: 13px;
  }

  .rec-block { margin-bottom: 18px; }
  .rec-block:last-child { margin-bottom: 0; }
  .rec-block-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; margin-bottom: 14px; flex-wrap: wrap;
  }
  .rec-block-title {
    font-size: 14px; font-weight: 700; color: #0d1340; margin: 0;
  }
  .rec-formula-pill {
    font-size: 11.5px; font-weight: 650; color: #000168;
    background: #eef2ff; border: 1px solid #c7d2fe;
    border-radius: 999px; padding: 5px 11px;
  }
  .rec-empty-panel {
    text-align: center; color: #94a3b8; font-size: 13px;
    padding: 36px 16px; border: 1px dashed #e4e8f2; border-radius: 14px;
  }

  .rec-podium-stage {
    display: grid;
    grid-template-columns: 1fr 1.15fr 1fr;
    gap: 14px;
    align-items: end;
    padding: 8px 4px 0;
    min-height: 360px;
    background:
      radial-gradient(ellipse 70% 50% at 50% 100%, rgba(0,1,104,.06), transparent 70%),
      linear-gradient(180deg, #fbfcff 0%, #f4f6fb 100%);
    border: 1px solid #eef1f7;
    border-radius: 16px;
    overflow: hidden;
  }
  .rec-podium-col {
    display: flex; flex-direction: column; align-items: center;
    animation: rec-rise .55s cubic-bezier(.22,1,.36,1) both;
  }
  .rec-podium-col.place-1 { order: 2; z-index: 2; }
  .rec-podium-col.place-2 { order: 1; }
  .rec-podium-col.place-3 { order: 3; }

  @keyframes rec-rise {
    from { opacity: 0; transform: translateY(28px) scale(.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .rec-podium-card {
    position: relative; width: 100%; max-width: 260px;
    background: #fff; border: 1px solid #e4e8f2; border-radius: 16px;
    padding: 16px 14px 14px; text-align: center;
    box-shadow: 0 8px 24px rgba(13,19,64,.06);
    transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
    overflow: hidden;
  }
  .rec-podium-card:hover {
    transform: translateY(-6px);
    box-shadow: 0 16px 36px rgba(13,19,64,.12);
  }
  .rec-podium-card.place-1 {
    border-color: #c7d2fe;
    box-shadow: 0 12px 32px rgba(0,1,104,.12);
    padding-top: 18px;
  }
  .rec-podium-card.place-1:hover {
    box-shadow: 0 20px 44px rgba(0,1,104,.16);
  }
  .rec-podium-glow {
    position: absolute; inset: -40% -20% auto;
    height: 120px; pointer-events: none;
    background: radial-gradient(circle, rgba(0,1,104,.1), transparent 70%);
    opacity: 0; transition: opacity .3s;
  }
  .rec-podium-card.place-1 .rec-podium-glow { opacity: 1; }
  .rec-podium-card.place-2 .rec-podium-glow {
    opacity: .7; background: radial-gradient(circle, rgba(100,116,139,.12), transparent 70%);
  }
  .rec-podium-card.place-3 .rec-podium-glow {
    opacity: .7; background: radial-gradient(circle, rgba(180,83,9,.1), transparent 70%);
  }

  .rec-place-badge {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11.5px; font-weight: 750; border-radius: 999px;
    padding: 4px 10px; margin-bottom: 12px;
  }
  .rec-place-badge.place-1 { background: #000168; color: #fff; }
  .rec-place-badge.place-2 { background: #f1f5f9; color: #475569; }
  .rec-place-badge.place-3 { background: #fff7ed; color: #9a3412; }

  .rec-podium-avatar-wrap {
    display: inline-flex; padding: 3px; border-radius: 16px; margin-bottom: 10px;
    background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
  }
  .rec-podium-card.place-1 .rec-podium-avatar-wrap {
    background: linear-gradient(135deg, #000168, #4f46e5);
    box-shadow: 0 0 0 0 rgba(0,1,104,.25);
    animation: rec-pulse-ring 2.4s ease-in-out infinite;
  }
  .rec-podium-card.place-2 .rec-podium-avatar-wrap {
    background: linear-gradient(135deg, #cbd5e1, #94a3b8);
  }
  .rec-podium-card.place-3 .rec-podium-avatar-wrap {
    background: linear-gradient(135deg, #fdba74, #b45309);
  }
  @keyframes rec-pulse-ring {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0,1,104,.28); }
    50% { box-shadow: 0 0 0 8px rgba(0,1,104,0); }
  }

  .rec-podium-name {
    font-size: 14.5px; font-weight: 750; color: #0d1340;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .rec-podium-card.place-1 .rec-podium-name { font-size: 16px; }
  .rec-podium-email {
    font-size: 11.5px; color: #94a3b8; margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .rec-podium-score {
    display: flex; align-items: baseline; justify-content: center; gap: 4px;
    margin: 12px 0 14px;
  }
  .rec-podium-score-val {
    font-size: 28px; font-weight: 800; color: #000168;
    font-variant-numeric: tabular-nums; letter-spacing: -0.03em;
    animation: rec-count .6s ease both;
  }
  .rec-podium-card.place-1 .rec-podium-score-val { font-size: 34px; }
  .rec-podium-score-lbl { font-size: 12px; font-weight: 700; color: #94a3b8; }
  @keyframes rec-count {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: none; }
  }

  .rec-podium-meters { display: flex; flex-direction: column; gap: 8px; text-align: left; }
  .rec-meter-top {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 11px; color: #64748b; font-weight: 600; margin-bottom: 4px;
  }
  .rec-meter-top strong { color: #0d1340; font-variant-numeric: tabular-nums; }
  .rec-meter-track {
    height: 7px; border-radius: 99px; background: #eef1f7; overflow: hidden;
  }
  .rec-meter-fill {
    height: 100%; border-radius: 99px;
    transform-origin: left;
    animation: rec-bar .8s cubic-bezier(.22,1,.36,1) both;
  }
  .rec-meter-fill.closure { background: linear-gradient(90deg, #000168, #4338ca); }
  .rec-meter-fill.deadlines { background: linear-gradient(90deg, #0f766e, #14b8a6); }
  @keyframes rec-bar {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
  }

  .rec-podium-calc {
    margin-top: 12px; font-size: 11px; color: #94a3b8;
    font-variant-numeric: tabular-nums; font-weight: 600;
  }
  .rec-podium-notify {
    margin-top: 12px; width: 100%;
    height: 32px; border-radius: 8px;
    border: 1px solid #c7d2fe; background: #eef2ff; color: #000168;
    font-size: 12px; font-weight: 650; cursor: pointer; font-family: inherit;
  }
  .rec-podium-notify:hover:not(:disabled) { background: #000168; color: #fff; border-color: #000168; }
  .rec-podium-notify:disabled { opacity: .55; cursor: not-allowed; }

  .rec-podium-plinth {
    width: 100%; max-width: 260px; margin-top: 10px;
    border-radius: 12px 12px 0 0;
    display: flex; align-items: flex-end; justify-content: center;
    font-size: 28px; font-weight: 800; color: rgba(255,255,255,.9);
    letter-spacing: -0.02em;
    transform-origin: bottom center;
    animation: rec-plinth .7s cubic-bezier(.22,1,.36,1) both;
  }
  .rec-podium-plinth.place-1 {
    height: 88px;
    background: linear-gradient(180deg, #1e1b4b 0%, #000168 100%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.12);
  }
  .rec-podium-plinth.place-2 {
    height: 64px;
    background: linear-gradient(180deg, #94a3b8 0%, #64748b 100%);
  }
  .rec-podium-plinth.place-3 {
    height: 48px;
    background: linear-gradient(180deg, #fdba74 0%, #b45309 100%);
  }
  @keyframes rec-plinth {
    from { opacity: 0; transform: scaleY(.35); }
    to { opacity: 1; transform: scaleY(1); }
  }

  .rec-podium-stage.is-loading .rec-podium-card.sk,
  .rec-podium-stage.is-loading .rec-podium-plinth.sk {
    background: linear-gradient(90deg, #e8ecf4 0%, #f5f7fb 40%, #dce3f0 80%);
    background-size: 200% 100%;
    animation: rec-shimmer 1.1s ease-in-out infinite;
    border: none; box-shadow: none;
  }
  .rec-podium-stage.is-loading .rec-podium-card.sk { height: 220px; }
  .rec-podium-stage.is-loading .rec-podium-plinth.sk { height: 56px; margin-top: 10px; }
  .rec-podium-stage.is-loading .place-1 .rec-podium-plinth.sk { height: 88px; }
  @keyframes rec-shimmer {
    0% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
  }

  .rec-split {
    display: grid; grid-template-columns: 1fr; gap: 16px; align-items: start;
  }
  .rec-split .rec-block { margin-bottom: 0; }
  .rec-feed-main { flex: 1; min-width: 0; }
  .rec-feed-sk {
    height: 52px; border-radius: 10px;
    background: linear-gradient(90deg, #e8ecf4 0%, #f5f7fb 40%, #dce3f0 80%);
    background-size: 200% 100%;
    animation: rec-shimmer 1.1s ease-in-out infinite;
  }

  .rec-watch-list, .rec-badge-list, .rec-badge-groups {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column; gap: 8px;
  }
  .rec-watch-row, .rec-badge-row {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 10px 10px 11px; border: 1px solid #eef1f7; border-radius: 10px;
    background: #fff;
    animation: rec-rise .4s cubic-bezier(.22,1,.36,1) both;
    flex-wrap: wrap;
  }
  .rec-badge-group {
    padding: 10px 12px 11px; border: 1px solid #eef1f7; border-radius: 12px;
    background: #fff;
    animation: rec-rise .4s cubic-bezier(.22,1,.36,1) both;
  }
  .rec-badge-group-head {
    display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
  }
  .rec-badge-chips {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-wrap: wrap; gap: 6px;
  }
  .rec-badge-chip {
    display: inline-flex; align-items: center; gap: 6px;
    max-width: 100%;
    padding: 4px 8px 4px 7px;
    border: 1px solid #eef1f7; border-radius: 999px;
    background: #f8faff;
  }
  .rec-badge-chip-name {
    font-size: 12px; font-weight: 650; color: #0d1340;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    max-width: 140px;
  }
  .rec-watch-rank {
    width: 22px; height: 22px; border-radius: 7px;
    background: #f1f5f9; color: #475569;
    font-size: 11px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    margin-top: 5px;
  }
  .rec-watch-context {
    font-size: 11.5px; color: #64748b; margin-top: 2px; line-height: 1.35;
  }
  .rec-watch-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .rec-tag {
    font-size: 10.5px; font-weight: 650;
    border-radius: 999px; padding: 1px 7px;
  }
  .rec-tag-ok {
    color: #0f766e; background: #f0fdfa; border: 1px solid #99f6e4;
  }
  .rec-tag-warn {
    color: #9a3412; background: #fff7ed; border: 1px solid #fed7aa;
  }
  .rec-tag-bad {
    color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca;
  }
  .rec-watch-link {
    margin-left: auto;
    height: 28px; padding: 0 10px;
    border-radius: 7px; border: 1px solid #e4e8f2;
    background: #f8f9fc; color: #000168;
    font-size: 11.5px; font-weight: 650; cursor: pointer;
    font-family: inherit; white-space: nowrap;
    align-self: center;
  }
  .rec-watch-link:hover { background: #eef2ff; border-color: #c7d2fe; }
  .rec-badge-dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  }
  .rec-badge-date {
    font-size: 11px; color: #94a3b8; font-weight: 600; white-space: nowrap;
  }

  .rec-person-name { font-size: 13px; font-weight: 650; color: #0d1340; }
  .rec-hint { font-size: 11.5px; color: #94a3b8; margin-top: 1px; }
  .rec-badge-def {
    display: flex; gap: 10px; align-items: flex-start;
    padding: 10px 12px; border: 1px solid #eef1f7; border-radius: 8px; background: #fafbff;
  }
  .rec-badge-swatch {
    width: 10px; height: 10px; border-radius: 3px; margin-top: 4px; flex-shrink: 0;
  }

  .rec-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.35); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px;
  }
  .rec-modal {
    background: #fff; border-radius: 16px; width: 480px; max-width: 100%;
    box-shadow: 0 24px 64px rgba(0,0,0,.18); overflow: hidden;
  }
  .rec-modal-head {
    display: flex; justify-content: space-between; gap: 12px;
    padding: 20px 22px 14px; border-bottom: 1px solid #f0f2f8;
  }
  .rec-modal-title { font-size: 16px; font-weight: 750; color: #0d1340; }
  .rec-modal-sub { font-size: 12px; color: #94a3b8; margin-top: 3px; }
  .rec-modal-close {
    border: 1px solid #e4e8f2; background: #f8f9fc; color: #64748b;
    border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 600;
    cursor: pointer; font-family: inherit; height: fit-content;
  }
  .rec-modal-close:hover { background: #fee2e2; color: #dc2626; border-color: #fecaca; }
  .rec-modal-body { padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; }
  .rec-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 650; color: #374151; }
  .rec-field select, .rec-field textarea {
    border: 1px solid #e4e8f2; border-radius: 8px; padding: 9px 12px;
    font-size: 13px; font-family: inherit; color: #0d1340; background: #fff;
  }
  .rec-field select:focus, .rec-field textarea:focus {
    outline: none; border-color: #000168; box-shadow: 0 0 0 3px rgba(0,1,104,.06);
  }
  .rec-modal-foot {
    padding: 14px 22px; border-top: 1px solid #f0f2f8;
    display: flex; justify-content: flex-end; gap: 10px;
  }

  @media (max-width: 900px) {
    .rec-info-grid, .rec-split { grid-template-columns: 1fr; }
    .rec-podium-stage {
      grid-template-columns: 1fr; min-height: auto; padding: 16px; gap: 16px;
    }
    .rec-podium-col.place-1,
    .rec-podium-col.place-2,
    .rec-podium-col.place-3 { order: unset; }
    .rec-podium-col.place-1 { order: -1; }
    .rec-podium-plinth { display: none; }
    .rec-podium-card { max-width: none; }
  }
`;
