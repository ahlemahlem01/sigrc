import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchEmployeePerformance,
  skillScoreForDefectType,
  workloadRatioFromRow,
  type EmployeePerformanceRow,
} from '../services/employeePerformanceService';
import {
  normalizeSeverityForMl,
  recommendEmployees,
  fetchEmployeeMlStats,
  MlEmployeeStats,
  type MlEmployeeCandidate,
  type MlAction,
  type MlRiskLevel,
} from '../services/mlRecommendService';
import {
  dedupeByEmployeeId,
  filterEmployeesForDepartment,
  resolveMlDepartmentCode,
  type MlDepartmentCode,
} from '../utils/mlDepartment';
import './EmployeeRecommendationBanner.css';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

export interface RecommendationEmployee {
  employeeId: string;
  name: string;
  email?: string | null;
  /** UUID département employé (Auth). */
  departmentId?: string | null;
  /** Libellé / code département employé. */
  department?: string | null;
  /** Si fournis, utilisés tels quels (sinon chargés via employeePerformanceService). */
  EmployeeSkill?: number | null;
  Workload?: number | null;
  DepartmentId?: string | null;
}

export interface EmployeeRecommendationBannerProps {
  /** Days given to do the work (from the deadline chosen): a model feature, so a change of deadline asks for a new recommendation. */
  allocDays?: number | null;
  defectType?: string | null;
  severity?: string | null;
  /**
   * Département dossier : UUID et/ou code/nom.
   * Sera mappé vers QUALITE|PRODUCTION|MAINTENANCE|LOGISTIQUE pour le ML.
   */
  departmentId?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  employees: RecommendationEmployee[];
  onAssign: (employeeId: string) => void;
  /**
   * Si false, le département n’est pas exigé (claims) : pas de filtre département.
   * Un fallback ML « QUALITE » est alors envoyé.
   */
  requireDepartment?: boolean;
  className?: string;
  assignDisabled?: boolean;
  assignDisabledHint?: string;
}

type BannerRec = {
  employeeId: string;
  name: string;
  scorePct: number;
  reason: string;
  rank: number;
  skill: number;
  workload: number;
  riskLevel: MlRiskLevel;
};

// Same thresholds as the ML service (above 80 %: low, 50 to 80 %: moderate, below 50 %: high), used when it does not send them.
function riskFromPct(pct: number): MlRiskLevel {
  return pct > 80 ? 'low' : pct >= 50 ? 'moderate' : 'high';
}

function buildReason(skill: number, workload: number): string {
  const loadPct = Math.round(Math.min(1, Math.max(0, workload)) * 100);
  return i18n.t('recommend.reason', { skill, load: loadPct });
}

function featuresFromPerf(
  row: EmployeePerformanceRow | undefined,
  defectType: string,
  fallback?: Pick<RecommendationEmployee, 'EmployeeSkill' | 'Workload'>
): { skill: number; workload: number } {
  if (row) {
    return {
      skill: skillScoreForDefectType(row.competencies, defectType),
      workload: workloadRatioFromRow(row),
    };
  }
  const skill =
    fallback?.EmployeeSkill != null && !Number.isNaN(Number(fallback.EmployeeSkill))
      ? Math.max(1, Math.min(5, Number(fallback.EmployeeSkill)))
      : 3;
  const workload =
    fallback?.Workload != null && !Number.isNaN(Number(fallback.Workload))
      ? Math.min(0.98, Math.max(0.05, Number(fallback.Workload)))
      : 0.5;
  return { skill, workload };
}

export const EmployeeRecommendationBanner: React.FC<EmployeeRecommendationBannerProps> = ({
  defectType,
  severity,
  departmentId,
  departmentCode,
  departmentName,
  employees,
  allocDays,
  onAssign,
  requireDepartment = true,
  className = '',
  assignDisabled = false,
  assignDisabledHint,
}) => {
  const { t } = useTranslation();
  const { accessToken } = useAuth();
  const [recs, setRecs] = useState<BannerRec[]>([]);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [perfById, setPerfById] = useState<Record<string, EmployeePerformanceRow>>({});
  const [perfReady, setPerfReady] = useState(false);
  const [validated, setValidated] = useState<boolean | null>(null);
  const [trainedOn, setTrainedOn] = useState<string | null>(null);
  const [action, setAction] = useState<MlAction | null>(null);

  const defect = String(defectType ?? '').trim();
  const sev = normalizeSeverityForMl(severity);

  const deptCtx = useMemo(
    () => ({
      departmentUuid: departmentId,
      departmentCode,
      departmentName,
      departmentRaw: departmentCode || departmentName || departmentId,
    }),
    [departmentId, departmentCode, departmentName]
  );

  const mlDept: MlDepartmentCode | null = useMemo(
    () =>
      resolveMlDepartmentCode(
        departmentCode,
        departmentName,
        departmentId
      ) || (requireDepartment ? null : 'QUALITE'),
    [departmentCode, departmentName, departmentId, requireDepartment]
  );

  const filteredEmployees = useMemo(
    () =>
      filterEmployeesForDepartment(employees, deptCtx, {
        requireDepartment,
      }),
    [employees, deptCtx, requireDepartment]
  );

  const dossierReady =
    defect.length > 0 &&
    sev.length > 0 &&
    (!requireDepartment || !!mlDept) &&
    filteredEmployees.length > 0;

  const employeeIdsKey = useMemo(
    () =>
      filteredEmployees
        .map((e) => e.employeeId)
        .filter(Boolean)
        .sort()
        .join('|'),
    [filteredEmployees]
  );

  const deptKey = `${mlDept ?? ''}|${String(departmentId ?? '')}`;

  const byId = useMemo(() => {
    const m = new Map<string, RecommendationEmployee>();
    filteredEmployees.forEach((e) => m.set(String(e.employeeId), e));
    return m;
  }, [filteredEmployees]);

  // Performances réelles sur les candidats filtrés / dédupliqués
  useEffect(() => {
    if (!accessToken || !employeeIdsKey || !dossierReady) {
      setPerfById({});
      setPerfReady(false);
      if (!dossierReady) setLoading(false);
      return;
    }

    let cancelled = false;
    setPerfReady(false);
    setLoading(true);
    setVisible(false);
    setRecs([]);

    const profiles = filteredEmployees.map((e) => ({
      id: String(e.employeeId),
      fullName: e.name,
      name: e.name,
      email: e.email || undefined,
      department: e.department || undefined,
    }));

    fetchEmployeePerformance(accessToken, profiles)
      .then((rows) => {
        if (cancelled) return;
        const map: Record<string, EmployeePerformanceRow> = {};
        rows.forEach((r) => {
          map[String(r.userId)] = r;
        });
        setPerfById(map);
        setPerfReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPerfById({});
        setPerfReady(false);
        setRecs([]);
        setVisible(false);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, employeeIdsKey, deptKey, dossierReady]);

  // Appel ML à chaque changement dossier (dont département) + candidats filtrés
  useEffect(() => {
    if (!dossierReady || !perfReady || !mlDept) {
      if (!dossierReady) {
        setRecs([]);
        setVisible(false);
        setLoading(false);
      }
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setVisible(false);

    const timer = window.setTimeout(async () => {
      const uniqueCandidates = dedupeByEmployeeId(filteredEmployees);
      let statsById: Record<string, MlEmployeeStats> = {};
      try {
        statsById = await fetchEmployeeMlStats(
          accessToken ?? '',
          uniqueCandidates.map((e) => String(e.employeeId))
        );
      } catch {
        // Sans historique, le modèle retombe sur la moyenne de l'équipe.
      }
      const candidates: MlEmployeeCandidate[] = uniqueCandidates.map((e) => {
        const id = String(e.employeeId);
        const { skill, workload } = featuresFromPerf(perfById[id], defect, e);
        const empMl =
          resolveMlDepartmentCode(e.department, e.DepartmentId, e.departmentId) ||
          mlDept;
        return {
          employeeId: id,
          EmployeeSkill: skill,
          Workload: workload,
          DepartmentId: empMl,
          OnTimeRate: statsById[id.toLowerCase()]?.onTimeRate ?? null,
          ClosedCount: statsById[id.toLowerCase()]?.closedCount ?? null,
          OpenClaims: statsById[id.toLowerCase()]?.openClaims ?? null,
        };
      });

      if (candidates.length === 0) {
        setRecs([]);
        setVisible(false);
        setLoading(false);
        return;
      }

      try {
        const res = await recommendEmployees(
          {
            DefectType: defect,
            Severity: sev,
            DepartmentId: mlDept,
            AllocDays: allocDays ?? undefined,
          },
          candidates,
          controller.signal
        );

        if (controller.signal.aborted) return;
        setValidated(res.validated ?? null);
        setTrainedOn(res.trainedOn ?? null);
        setAction(res.action ?? null);

        const seenRec = new Set<string>();
        const mapped: BannerRec[] = [];
        for (const r of res.recommendations || []) {
          const id = String(r.employeeId)
            .trim()
            .toLowerCase();
          if (!id || seenRec.has(id)) continue;
          seenRec.add(id);
          const emp = byId.get(String(r.employeeId)) || byId.get(id);
          const source = emp || uniqueCandidates.find(
            (c) => String(c.employeeId).toLowerCase() === id
          );
          const { skill, workload } = featuresFromPerf(
            perfById[String(r.employeeId)] || perfById[id],
            defect,
            source
          );
          const rawPct = Math.min(1, Math.max(0, r.score)) * 100;   // classified as it is, rounded only to be shown
          const scorePct = Math.round(rawPct);
          mapped.push({
            employeeId: String(r.employeeId),
            name: source?.name || String(r.employeeId),
            scorePct,
            riskLevel: r.riskLevel ?? riskFromPct(rawPct),
            reason: statsById[id]
              ? t('recommend.reasonHistory', {
                  rate: Math.round(statsById[id].onTimeRate * 100),
                  closed: statsById[id].closedCount,
                  open: statsById[id].openClaims,
                })
              : buildReason(skill, workload),
            rank: mapped.length + 1,
            skill,
            workload,
          });
          if (mapped.length >= 3) break;
        }

        if (mapped.length === 0) {
          setRecs([]);
          setVisible(false);
          setLoading(false);
          return;
        }

        setRecs(mapped);
        setVisible(true);
        setLoading(false);
      } catch {
        if (controller.signal.aborted) return;
        setRecs([]);
        setVisible(false);
        setLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dossierReady,
    defect,
    sev,
    allocDays,
    mlDept,
    deptKey,
    requireDepartment,
    employeeIdsKey,
    perfReady,
    perfById,
  ]);

  if (!dossierReady) {
    return null;
  }

  if (loading) {
    return (
      <div
        className={`erb-banner erb-banner--loading ${className}`.trim()}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={t('recommend.loadingAria')}
      >
        <div className="erb-header">
          <span className="erb-title">{t('recommend.title')}</span>
          <span className="erb-subtitle erb-subtitle--loading">
            <span className="erb-spinner" aria-hidden />
            {t('recommend.analysing')}
            {mlDept ? ` · ${mlDept}` : ''}
          </span>
        </div>
        <ul className="erb-list">
          {[0, 1, 2].map((i) => (
            <li key={i} className="erb-item erb-item--skeleton">
              <div className="erb-skel erb-skel-rank" />
              <div className="erb-body">
                <div className="erb-name-row">
                  <div className="erb-skel erb-skel-name" />
                  <div className="erb-skel erb-skel-score" />
                </div>
                <div className="erb-skel erb-skel-reason" />
              </div>
              <div className="erb-skel erb-skel-btn" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!visible || recs.length === 0) {
    return null;
  }

  return (
    <div
      className={`erb-banner ${className}`.trim()}
      role="region"
      aria-label={t('recommend.regionAria')}
    >
      <div className="erb-header">
        <span className="erb-title">{t('recommend.title')}</span>
        <span className="erb-subtitle">
          {t('recommend.top', { n: recs.length })}
          {mlDept ? ` · ${mlDept}` : ''}
        </span>
        {validated === true ? (
          <span
            className="erb-badge erb-badge--validated"
            title={t('recommend.validatedHint', { source: trainedOn ?? '' })}
          >
            {t('recommend.validated')}
          </span>
        ) : (
          <span className="erb-badge erb-badge--indicative" title={t('recommend.indicativeHint')}>
            {t('recommend.indicative')}
          </span>
        )}
      </div>
      {assignDisabled && assignDisabledHint ? (
        <p className="erb-hint">{assignDisabledHint}</p>
      ) : null}
      {(() => {
        const lead = recs[0];
        const level = lead.riskLevel;
        const act: MlAction = action ?? (level === 'low' ? 'standard' : level === 'moderate' ? 'adjust' : 'alert');
        return (
          <div className={`erb-action erb-action--${level}`} role={act === 'alert' ? 'alert' : 'status'}>
            <strong>{t(`recommend.risk.${level}`)}</strong> {t(`recommend.action.${act}`)}
          </div>
        );
      })()}
      <ul className="erb-list">
        {recs.map((r) => (
          <li key={r.employeeId} className="erb-item erb-item--enter">
            <div className="erb-rank" aria-hidden>
              {r.rank}
            </div>
            <div className="erb-body">
              <div className="erb-name-row">
                <span className="erb-name">{r.name}</span>
                <span className="erb-score">{r.scorePct}%</span>
                <span className={`erb-risk erb-risk--${r.riskLevel}`}>{t(`recommend.risk.${r.riskLevel}`)}</span>
              </div>
              <div className="erb-reason">{r.reason}</div>
            </div>
            <button
              type="button"
              className="erb-assign-btn"
              disabled={assignDisabled}
              title={assignDisabled ? assignDisabledHint : undefined}
              onClick={() => {
                if (!assignDisabled) onAssign(r.employeeId);
              }}
            >
              {t('recommend.assign')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default EmployeeRecommendationBanner;
