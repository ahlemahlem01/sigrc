import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import CompetencyRadar from '../admin/employees/CompetencyRadar';
import { useAuth } from '../../context/AuthContext';
import { employeeService } from '../../services/employeeService';
import { getEmployeeWorkspace } from '../../services/employeeWorkspaceService';
import { closureStats, type ClosureStats } from '../../utils/workspaceStats';
import {
  fetchEmployeePerformance,
  levelsFromScores,
  scoreCapa,
  scoreDeadlines,
  type CompetencyScores,
  type EmployeePerformanceRow,
  type SkillLevel,
} from '../../services/employeePerformanceService';
import './EmployeeCompetenciesPage.css';

const COMPETENCY_KEYS: (keyof CompetencyScores)[] = [
  'fiveWhy',
  'ishikawa',
  'eightD',
  'capa',
  'deadlines',
];

type ApiSkill = {
  name: string;
  level: number;
  plansCompleted?: number;
  plans?: number;
};

function levelClass(level: SkillLevel): string {
  if (level === 'expert') return 'expert';
  if (level === 'confirme') return 'confirme';
  return 'debutant';
}

function resolveUserId(user: any): string {
  return String(user?.id ?? user?.sub ?? user?.userId ?? '').trim();
}

export default function EmployeeCompetenciesPage() {
  const { t } = useTranslation();
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();

  const [row, setRow] = useState<EmployeePerformanceRow | null>(null);
  const [closure, setClosure] = useState<ClosureStats | null>(null);
  const [apiSkills, setApiSkills] = useState<ApiSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const userId = resolveUserId(user);
      const email = String((user as any)?.email ?? '');
      const name =
        String((user as any)?.fullName || (user as any)?.name || email.split('@')[0] || 'Collaborateur');

      const [perfRows, skillsRaw, workspace] = await Promise.all([
        userId
          ? fetchEmployeePerformance(accessToken, [
              {
                id: userId,
                fullName: name,
                email,
                poste: (user as any)?.poste,
                equipe: (user as any)?.equipe,
                department: (user as any)?.department,
                profilePictureUrl: (user as any)?.profilePictureUrl,
              },
            ], { assignedFiles: true })
          : Promise.resolve([] as EmployeePerformanceRow[]),
        employeeService.getSkills(accessToken).catch(() => []),
        getEmployeeWorkspace(accessToken).catch(() => null),
      ]);

      // the same files as the dashboard: what is assigned to this employee
      setClosure(workspace ? closureStats(workspace.claims, workspace.plans as any[]) : null);

      // An employee cannot read the team-wide assignments, so the plan axes come from the plans assigned to them (the dashboard's files).
      let perf = perfRows[0] ?? null;
      if (perf && workspace) {
        const today = Date.now();
        const myPlans = (workspace.plans as any[]).map((p) => ({
          status: Number(p.status ?? 0),
          progress: Number(p.progress ?? 0),
          deadline: p.deadline as string | undefined,
        }));
        const open = myPlans.filter((p) => !(p.status === 3 || p.status === 4 || p.progress >= 100));
        const overdue = open.filter((p) => p.deadline && new Date(p.deadline).getTime() < today).length;
        const competencies = { ...perf.competencies, capa: scoreCapa(myPlans), deadlines: scoreDeadlines(myPlans, overdue) };
        perf = { ...perf, competencies, competencyLevels: levelsFromScores(competencies) };
      }
      setRow(perf);
      const skillsList = Array.isArray(skillsRaw)
        ? skillsRaw
        : Array.isArray((skillsRaw as any)?.data)
          ? (skillsRaw as any).data
          : [];
      setApiSkills(
        skillsList.map((s: any) => ({
          name: String(s.name ?? s.Name ?? t('employeeCompetencies.skillFallback')),
          level: Math.max(0, Math.min(100, Number(s.level ?? s.Level ?? 0))),
          plansCompleted: Number(s.plansCompleted ?? s.PlansCompleted ?? s.plans ?? 0),
        }))
      );
    } catch (e: any) {
      setError(e?.message || t('employeeCompetencies.loadError'));
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, user, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const scores = row?.competencies;
  const levels = row?.competencyLevels;

  const averageScore = useMemo(() => {
    if (!scores) return null;
    const vals = Object.values(scores);
    if (vals.length === 0) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [scores]);

  const strongest = useMemo(() => {
    if (!scores) return null;
    return COMPETENCY_KEYS.slice()
      .sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0];
  }, [scores]);

  const weakest = useMemo(() => {
    if (!scores) return null;
    return COMPETENCY_KEYS.slice()
      .sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0))[0];
  }, [scores]);

  const labelOf = (key: keyof CompetencyScores) => t(`employeeCompetencies.labels.${key}`);

  return (
    <div className="ecp-page">
      <div className="ecp-inner">
        <header className="ecp-header">
          <div>
            <p className="ecp-kicker">{t('employeeCompetencies.kicker')}</p>
            <h1>{t('employeeCompetencies.title')}</h1>
            <p className="ecp-sub">{t('employeeCompetencies.subtitle')}</p>
          </div>
          <div className="ecp-header-actions">
            <button type="button" className="ecp-btn ghost" onClick={() => navigate('/badges')}>
              {t('employeeCompetencies.badges')}
            </button>
            <button type="button" className="ecp-btn ghost" onClick={() => navigate('/dashboard')}>
              {t('employeeCompetencies.dashboard')}
            </button>
            <button type="button" className="ecp-btn" onClick={() => void load()} disabled={loading}>
              {t('employeeCompetencies.refresh')}
            </button>
          </div>
        </header>

        {error && <div className="ecp-error">{error}</div>}

        <section className="ecp-summary" aria-label={t('employeeCompetencies.summaryAria')}>
          <article className="ecp-summary-card">
            <span className="ecp-summary-label">{t('employeeCompetencies.avgScore')}</span>
            <strong className="ecp-summary-value">{loading ? '—' : averageScore == null ? '—' : `${averageScore}%`}</strong>
            <span className="ecp-summary-hint">{t('employeeCompetencies.avgHint')}</span>
          </article>
          <article className="ecp-summary-card">
            <span className="ecp-summary-label">{t('employeeCompetencies.strength')}</span>
            <strong className="ecp-summary-value sm">
              {loading || !strongest || !scores ? '—' : labelOf(strongest)}
            </strong>
            <span className="ecp-summary-hint">
              {!loading && strongest && scores
                ? `${scores[strongest]}%`
                : t('employeeCompetencies.calculating')}
            </span>
          </article>
          <article className="ecp-summary-card">
            <span className="ecp-summary-label">{t('employeeCompetencies.toImprove')}</span>
            <strong className="ecp-summary-value sm">
              {loading || !weakest || !scores ? '—' : labelOf(weakest)}
            </strong>
            <span className="ecp-summary-hint">
              {!loading && weakest && scores
                ? `${scores[weakest]}%`
                : t('employeeCompetencies.calculating')}
            </span>
          </article>
          <article className="ecp-summary-card">
            <span className="ecp-summary-label">{t('employeeCompetencies.closureRate')}</span>
            <strong className="ecp-summary-value">
              {loading ? '—' : closure ? `${closure.rate}%` : row ? `${row.closureRate}%` : '—'}
            </strong>
            <span className="ecp-summary-hint">
              {closure
                ? t('employeeCompetencies.closureCounts', { closed: closure.closed, total: closure.total })
                : t('employeeCompetencies.closureHint')}
            </span>
          </article>
        </section>

        <div className="ecp-grid">
          <section className="ecp-panel" aria-labelledby="ecp-radar-title">
            <div className="ecp-panel-head">
              <div>
                <h2 id="ecp-radar-title">{t('employeeCompetencies.radarTitle')}</h2>
                <p>{t('employeeCompetencies.radarSub')}</p>
              </div>
            </div>
            {loading ? (
              <div className="ecp-skel radar" aria-hidden />
            ) : scores ? (
              <CompetencyRadar scores={scores} height={300} />
            ) : (
              <div className="ecp-empty">{t('employeeCompetencies.radarEmpty')}</div>
            )}
          </section>

          <section className="ecp-panel" aria-labelledby="ecp-detail-title">
            <div className="ecp-panel-head">
              <div>
                <h2 id="ecp-detail-title">{t('employeeCompetencies.detailTitle')}</h2>
                <p>{t('employeeCompetencies.detailSub')}</p>
              </div>
            </div>
            {loading ? (
              <div className="ecp-skel-list" aria-hidden>
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="ecp-skel row" />
                ))}
              </div>
            ) : scores && levels ? (
              <ul className="ecp-skill-list">
                {COMPETENCY_KEYS.map((key) => {
                  const score = scores[key] ?? 0;
                  const level = levels[key];
                  return (
                    <li key={key} className="ecp-skill">
                      <div className="ecp-skill-top">
                        <div>
                          <span className="ecp-skill-name">{labelOf(key)}</span>
                          <span className="ecp-skill-hint">{t(`employeeCompetencies.meta.${key}`)}</span>
                        </div>
                        <div className="ecp-skill-meta">
                          <span className={`ecp-level ${levelClass(level)}`}>
                            {t(`employeeCompetencies.levels.${level}`)}
                          </span>
                          <strong>{score}%</strong>
                        </div>
                      </div>
                      <div className="ecp-bar" aria-hidden>
                        <div className="ecp-bar-fill" style={{ width: `${score}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="ecp-empty">{t('employeeCompetencies.detailEmpty')}</div>
            )}
          </section>
        </div>

        {apiSkills.length > 0 && (
          <section className="ecp-panel" aria-labelledby="ecp-exec-title">
            <div className="ecp-panel-head">
              <div>
                <h2 id="ecp-exec-title">{t('employeeCompetencies.execTitle')}</h2>
                <p>{t('employeeCompetencies.execSub')}</p>
              </div>
            </div>
            <ul className="ecp-exec-list">
              {apiSkills.map((s) => (
                <li key={s.name} className="ecp-exec">
                  <div className="ecp-exec-top">
                    <span>{s.name}</span>
                    <strong>{s.level}%</strong>
                  </div>
                  <div className="ecp-bar" aria-hidden>
                    <div className="ecp-bar-fill soft" style={{ width: `${s.level}%` }} />
                  </div>
                  <span className="ecp-exec-hint">
                    {t('employeeCompetencies.basedOnPlans', { count: s.plansCompleted ?? 0 })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!loading && weakest && scores && (
          <section className="ecp-reco" aria-label={t('employeeCompetencies.recoAria')}>
            <h2>{t('employeeCompetencies.recoTitle')}</h2>
            <p>
              <Trans
                i18nKey="employeeCompetencies.recoBody"
                values={{ label: labelOf(weakest), score: scores[weakest] }}
                components={{ strong: <strong /> }}
              />
            </p>
            <div className="ecp-reco-actions">
              <button type="button" className="ecp-btn" onClick={() => navigate('/action-plans')}>
                {t('employeeCompetencies.myPlans')}
              </button>
              <button
                type="button"
                className="ecp-btn ghost"
                onClick={() => navigate('/pages/front/my-claims')}
              >
                {t('employeeCompetencies.myClaims')}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
