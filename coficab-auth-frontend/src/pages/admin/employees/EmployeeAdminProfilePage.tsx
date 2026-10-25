import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import UserAvatar from '../../../components/UserAvatar';
import { useAuth } from '../../../context/AuthContext';
import { adminEmployeeService } from '../../../services/adminEmployeeService';
import { getUsers, lockUser, unlockUser, type UserDto } from '../../../services/adminService';
import {
  fetchEmployeePerformance,
  type EmployeePerformanceRow,
  SKILL_LEVEL_LABEL,
  WORKLOAD_CAPACITY_MAX,
  type SkillLevel,
} from '../../../services/employeePerformanceService';
import { inferWorkFieldsFromDepartment, phoneFromId } from '../../../utils/employeeWorkFields';
import {
  activityStatusClass,
  activityStatusLabel,
  normalizeActivityStatus,
  type ActivityStatus,
} from '../../../utils/activityStatus';
import CompetencyRadar from './CompetencyRadar';
import { getStatusBadge, resolveClaimStatus } from '../../../utils/Claimutils';
import EmployeeDocumentsBadgesPanel from './EmployeeDocumentsBadgesPanel';
import { COFICAB } from '../dashboard/dashPalette';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../../i18n';

type InitialEmployee = {
  id?: string;
  email?: string;
  fullName?: string;
  name?: string;
  department?: string;
  organizationName?: string;
  role?: string;
  roles?: string[];
  phone?: string;
  telephone?: string;
  poste?: string;
  equipe?: string;
  ligneProduction?: string;
  profilePictureUrl?: string | null;
  hireDate?: string | null;
  managerName?: string;
  isLockedOut?: boolean;
  activityStatus?: ActivityStatus | string | number;
  lastActivityAt?: string | null;
  lastLoginAt?: string | null;
  recentActionCount?: number;
};

type ProfileState = {
  id: string;
  name: string;
  email: string;
  department: string;
  organizationName: string;
  role: string;
  poste: string;
  equipe: string;
  ligneProduction: string;
  telephone: string;
  managerName: string;
  hireDate: string | null;
  profilePictureUrl: string | null;
  isLockedOut: boolean;
  activityStatus: ActivityStatus;
  lastActivityAt: string | null;
  lastLoginAt: string | null;
  recentActionCount: number;
};

const pick = (...vals: unknown[]) => {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s && s !== 'null' && s !== 'undefined' && s !== '—') return s;
  }
  return '';
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(dateLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const roleLabel = (role?: string) => {
  const r = String(role ?? '').toLowerCase();
  if (r === 'superadmin') return i18n.t('employeeProfileAdmin.roleSuperadmin');
  if (r === 'admin') return i18n.t('portal.tagAdmin');
  if (r === 'manager') return i18n.t('employeeProfileAdmin.roleManager');
  if (!r || r === 'user') return i18n.t('employeeProfileAdmin.roleUser');
  return role!;
};

const workloadLabel = (w?: string) => {
  if (w === 'high') return i18n.t('claimStatus.severityHigh');
  if (w === 'medium') return i18n.t('claimStatus.severityMedium');
  return i18n.t('claimStatus.severityLow');
};

const TOOL_LABELS: { key: keyof EmployeePerformanceRow['competencies']; label: string }[] = [
  { key: 'fiveWhy', label: '5 Why' },
  { key: 'ishikawa', label: 'Ishikawa' },
  { key: 'eightD', label: '8D' },
  { key: 'capa', label: 'CAPA' },
  { key: 'deadlines', label: 'skills.deadlines' },
];

const emptyPerf = (): EmployeePerformanceRow => ({
  userId: '',
  fullName: '',
  email: '',
  activeDossiers: 0,
  remainingCapacity: WORKLOAD_CAPACITY_MAX,
  closureRate: 0,
  avgDelayDays: 0,
  overdueCount: 0,
  workload: 'low',
  competencies: { fiveWhy: 0, ishikawa: 0, eightD: 0, capa: 0, deadlines: 0 },
  competencyLevels: {
    fiveWhy: 'debutant',
    ishikawa: 'debutant',
    eightD: 'debutant',
    capa: 'debutant',
    deadlines: 'debutant',
  },
  recentDossiers: [],
});

export default function EmployeeAdminProfilePage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const initial = (location.state?.employee ?? null) as InitialEmployee | null;

  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [perf, setPerf] = useState<EmployeePerformanceRow | null>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState(false);
  const [draft, setDraft] = useState({ poste: '', equipe: '', ligneProduction: '', telephone: '' });

  const reloadBadges = useCallback(async () => {
    if (!accessToken || !id) return;
    try {
      const b = await adminEmployeeService.getUserBadges(accessToken, id);
      setBadges(Array.isArray(b) ? b : []);
    } catch {
      setBadges([]);
    }
  }, [accessToken, id]);

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setLoading(true);
    setError('');
    try {
      const [rawProfile, users, activity] = await Promise.all([
        adminEmployeeService.getProfile(accessToken, id).catch(() => null),
        getUsers(accessToken).catch(() => [] as UserDto[]),
        adminEmployeeService.getActivitySummary(accessToken).catch(() => null),
      ]);

      const auth = users.find((u) => String(u.id).toLowerCase() === id.toLowerCase());
      const activityItem = activity?.items?.find(
        (i) => String(i.userId).toLowerCase() === id.toLowerCase(),
      );

      const department = pick(
        rawProfile?.department,
        rawProfile?.Department,
        initial?.department,
        auth?.department,
      );
      const inferred = inferWorkFieldsFromDepartment(
        department,
        pick(rawProfile?.role, initial?.role, auth?.roles?.[0]),
      );
      const name =
        pick(rawProfile?.name, rawProfile?.fullName, initial?.fullName, initial?.name, auth?.fullName) ||
        i18n.t('employeeProfileAdmin.employeeFallback');
      const email = pick(rawProfile?.email, initial?.email, auth?.email);
      const role = pick(
        initial?.role,
        initial?.roles?.[0],
        auth?.roles?.[0],
        rawProfile?.role,
      ) || 'user';

      const next: ProfileState = {
        id,
        name,
        email,
        department,
        organizationName: pick(
          rawProfile?.organizationName,
          initial?.organizationName,
          auth?.organizationName,
        ),
        role,
        poste: pick(rawProfile?.poste, initial?.poste) || inferred.poste,
        equipe: pick(rawProfile?.equipe, initial?.equipe) || inferred.equipe,
        ligneProduction:
          pick(rawProfile?.ligneProduction, initial?.ligneProduction) || inferred.ligneProduction,
        telephone:
          pick(rawProfile?.telephone, rawProfile?.phone, initial?.telephone, initial?.phone) ||
          phoneFromId(id),
        managerName: pick(rawProfile?.managerName, initial?.managerName),
        hireDate: rawProfile?.hireDate || initial?.hireDate || null,
        profilePictureUrl:
          pick(rawProfile?.profilePictureUrl, initial?.profilePictureUrl, auth?.email && null) ||
          (rawProfile?.profilePictureUrl ?? initial?.profilePictureUrl ?? null),
        isLockedOut: Boolean(
          auth?.isLockedOut ?? initial?.isLockedOut ?? rawProfile?.isLockedOut,
        ),
        activityStatus: normalizeActivityStatus(
          activityItem?.activityStatus ??
            rawProfile?.activityStatus ??
            initial?.activityStatus,
        ),
        lastActivityAt:
          activityItem?.lastActivityAt ??
          initial?.lastActivityAt ??
          rawProfile?.lastActivityAt ??
          null,
        lastLoginAt:
          activityItem?.lastLoginAt ?? initial?.lastLoginAt ?? rawProfile?.lastLoginAt ?? null,
        recentActionCount:
          activityItem?.recentActionCount ?? initial?.recentActionCount ?? 0,
      };

      setProfile(next);
      setDraft({
        poste: next.poste,
        equipe: next.equipe,
        ligneProduction: next.ligneProduction,
        telephone: next.telephone,
      });

      try {
        const rows = await fetchEmployeePerformance(accessToken, [
          {
            id: next.id,
            fullName: next.name,
            email: next.email,
            profilePictureUrl: next.profilePictureUrl,
            poste: next.poste,
            equipe: next.equipe,
            ligneProduction: next.ligneProduction,
            telephone: next.telephone,
            department: next.department,
          },
        ]);
        setPerf(rows[0] ?? emptyPerf());
      } catch {
        setPerf(emptyPerf());
      }

      await reloadBadges();
    } catch {
      setError(i18n.t('employeeProfileAdmin.loadFailed'));
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, id, initial, reloadBadges]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    const p = perf;
    const remaining = p?.remainingCapacity ?? WORKLOAD_CAPACITY_MAX;
    return [
      { label: t('employeeProfileAdmin.kpiActive'), value: String(p?.activeDossiers ?? 0), icon: 'ti-folders' },
      {
        label: t('employeeProfileAdmin.kpiCapacity'),
        value: remaining === 0 ? t('employeeProfileAdmin.overload') : `${remaining}`,
        icon: 'ti-battery-4',
        hint: t('employeeProfileAdmin.capacityHint', { max: WORKLOAD_CAPACITY_MAX }),
      },
      { label: t('employeeProfileAdmin.kpiClosure'), value: `${p?.closureRate ?? 0}%`, icon: 'ti-circle-check' },
      { label: t('planDetail.late'), value: String(p?.overdueCount ?? 0), icon: 'ti-alert-triangle' },
      {
        label: t('employeeProfileAdmin.kpiActions'),
        value: String(profile?.recentActionCount ?? 0),
        icon: 'ti-activity',
      },
    ];
  }, [perf, profile?.recentActionCount, t]);

  const capacityPct = useMemo(() => {
    const active = perf?.activeDossiers ?? 0;
    return Math.min(100, Math.round((active / WORKLOAD_CAPACITY_MAX) * 100));
  }, [perf?.activeDossiers]);

  const capacityTone = useMemo(() => {
    const rem = perf?.remainingCapacity ?? WORKLOAD_CAPACITY_MAX;
    if (rem === 0) return 'full';
    if (rem <= 3) return 'warn';
    return 'ok';
  }, [perf?.remainingCapacity]);

  const onToggleLock = async () => {
    if (!accessToken || !profile) return;
    setLocking(true);
    try {
      if (profile.isLockedOut) await unlockUser(accessToken, profile.id);
      else await lockUser(accessToken, profile.id);
      setProfile((prev) => (prev ? { ...prev, isLockedOut: !prev.isLockedOut } : prev));
    } catch {
      setSaveErr(true);
      setSaveMsg(t('employeeProfileAdmin.accountActionFailed'));
    } finally {
      setLocking(false);
    }
  };

  const onSaveWork = async () => {
    if (!accessToken || !profile) return;
    if (!draft.poste.trim() || !draft.equipe.trim()) {
      setSaveErr(true);
      setSaveMsg(t('employeeProfileAdmin.posteTeamRequired'));
      return;
    }
    setSaving(true);
    setSaveMsg('');
    setSaveErr(false);
    try {
      await adminEmployeeService.updateProfile(accessToken, profile.id, {
        poste: draft.poste.trim(),
        equipe: draft.equipe.trim(),
        ligneProduction: draft.ligneProduction.trim() || null,
        telephone: draft.telephone.trim() || null,
      });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              poste: draft.poste.trim(),
              equipe: draft.equipe.trim(),
              ligneProduction: draft.ligneProduction.trim(),
              telephone: draft.telephone.trim(),
            }
          : prev,
      );
      setEditOpen(false);
      setSaveErr(false);
      setSaveMsg(t('employeeProfileAdmin.updated'));
    } catch {
      setSaveErr(true);
      setSaveMsg(t('fiveWhy.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!id) return <Navigate to="/admin/employees" replace />;

  return (
    <div className="eap">
      <style>{`
        .eap {
          font-family: Inter, system-ui, sans-serif;
          color: ${COFICAB.ink};
          max-width: 1120px;
        }
        .eap-back {
          display: inline-flex; align-items: center; gap: 6px;
          color: ${COFICAB.navy}; text-decoration: none; font-size: 13px; font-weight: 600;
          margin-bottom: 14px;
        }
        .eap-back:hover { text-decoration: underline; }
        .eap-hero {
          display: flex; flex-wrap: wrap; gap: 16px 20px;
          align-items: flex-start; justify-content: space-between;
          padding-bottom: 18px; border-bottom: 1px solid ${COFICAB.line}; margin-bottom: 18px;
        }
        .eap-id { display: flex; gap: 14px; align-items: center; min-width: 0; }
        .eap-name { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -.02em; }
        .eap-email { margin: 4px 0 0; font-size: 13px; color: ${COFICAB.muted}; }
        .eap-meta {
          display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
        }
        .eap-chip {
          display: inline-flex; align-items: center; gap: 5px;
          height: 26px; padding: 0 10px; border-radius: 6px;
          font-size: 11.5px; font-weight: 650; background: ${COFICAB.soft}; color: ${COFICAB.ink};
          border: 1px solid ${COFICAB.line};
        }
        .eap-pill {
          display: inline-flex; align-items: center; gap: 6px;
          height: 26px; padding: 0 10px; border-radius: 6px;
          font-size: 11.5px; font-weight: 650; border: 1px solid transparent;
        }
        .eap-pill .k { font-weight: 500; opacity: .75; }
        .eap-pill.act-active { background: ${COFICAB.okSoft}; color: ${COFICAB.ok}; }
        .eap-pill.act-low { background: ${COFICAB.warnSoft}; color: ${COFICAB.warn}; }
        .eap-pill.act-inactive { background: #f1f5f9; color: #64748b; }
        .eap-pill.acct-ok { background: ${COFICAB.light}; color: ${COFICAB.navy}; }
        .eap-pill.acct-locked { background: ${COFICAB.dangerSoft}; color: ${COFICAB.danger}; }
        .eap-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .eap-btn {
          display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px;
          border-radius: 8px; border: 1px solid ${COFICAB.line}; background: #fff;
          color: ${COFICAB.navy}; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
        }
        .eap-btn:hover:not(:disabled) { background: ${COFICAB.light}; }
        .eap-btn:disabled { opacity: .55; cursor: not-allowed; }
        .eap-btn.primary { background: ${COFICAB.navy}; border-color: ${COFICAB.navy}; color: #fff; }
        .eap-btn.primary:hover:not(:disabled) { background: #00009e; }
        .eap-btn.danger { color: ${COFICAB.danger}; border-color: #fecaca; }
        .eap-btn.danger:hover:not(:disabled) { background: ${COFICAB.dangerSoft}; }

        .eap-kpis {
          display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px;
          margin-bottom: 20px;
        }
        @media (max-width: 900px) {
          .eap-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        .eap-kpi {
          padding: 12px 14px; border: 1px solid ${COFICAB.line}; border-radius: 10px;
          background: #fff; transition: border-color .15s, background .15s;
        }
        .eap-kpi:hover { border-color: #c7d2fe; background: #fafbff; }
        .eap-kpi-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 600; color: ${COFICAB.muted}; text-transform: uppercase;
          letter-spacing: .04em;
        }
        .eap-kpi-value { margin-top: 6px; font-size: 22px; font-weight: 700; color: ${COFICAB.navy}; }
        .eap-kpi-hint { margin-top: 2px; font-size: 11px; color: ${COFICAB.muted}; }

        .eap-cap {
          margin-top: 12px; padding-top: 12px; border-top: 1px solid ${COFICAB.line};
        }
        .eap-cap-row {
          display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
          font-size: 12.5px; margin-bottom: 8px;
        }
        .eap-cap-row strong { font-weight: 700; color: ${COFICAB.navy}; }
        .eap-cap-bar {
          height: 8px; border-radius: 999px; background: #eef2ff; overflow: hidden;
        }
        .eap-cap-fill {
          height: 100%; border-radius: 999px; background: ${COFICAB.navy};
          transition: width .35s ease;
        }
        .eap-cap-fill.warn { background: #c2410c; }
        .eap-cap-fill.full { background: ${COFICAB.danger}; }

        .eap-levels { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
        .eap-level {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 8px 10px; border: 1px solid ${COFICAB.line}; border-radius: 8px;
        }
        .eap-level-tool { font-size: 13px; font-weight: 650; }
        .eap-level-score { font-size: 11px; color: ${COFICAB.muted}; margin-top: 2px; }
        .eap-level-badge {
          flex-shrink: 0; height: 24px; padding: 0 10px; border-radius: 6px;
          font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center;
        }
        .eap-level-badge.debutant { background: #f1f5f9; color: #64748b; }
        .eap-level-badge.confirme { background: ${COFICAB.light}; color: ${COFICAB.navy}; }
        .eap-level-badge.expert { background: #ecfdf5; color: #047857; }

        .eap-grid {
          display: grid; grid-template-columns: 1.15fr .85fr; gap: 16px; align-items: start;
        }
        @media (max-width: 960px) {
          .eap-grid { grid-template-columns: 1fr; }
        }
        .eap-panel {
          border: 1px solid ${COFICAB.line}; border-radius: 12px; background: #fff; padding: 16px 18px;
        }
        .eap-panel + .eap-panel { margin-top: 12px; }
        .eap-h {
          margin: 0 0 4px; font-size: 14px; font-weight: 700; color: ${COFICAB.ink};
        }
        .eap-sub { margin: 0 0 14px; font-size: 12px; color: ${COFICAB.muted}; line-height: 1.4; }
        .eap-dl {
          display: grid; grid-template-columns: 140px 1fr; gap: 8px 12px; margin: 0;
          font-size: 13px;
        }
        .eap-dl dt { color: ${COFICAB.muted}; font-weight: 500; }
        .eap-dl dd { margin: 0; font-weight: 650; word-break: break-word; }

        .eap-form {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
        }
        @media (max-width: 640px) { .eap-form { grid-template-columns: 1fr; } }
        .eap-field label {
          display: block; font-size: 11.5px; font-weight: 650; color: ${COFICAB.muted};
          margin-bottom: 4px;
        }
        .eap-field input {
          width: 100%; height: 36px; padding: 0 10px; border-radius: 8px;
          border: 1px solid ${COFICAB.line}; font: inherit; font-size: 13px; color: ${COFICAB.ink};
          background: #fff; box-sizing: border-box;
        }
        .eap-field input:focus { outline: none; border-color: ${COFICAB.navy}; box-shadow: 0 0 0 3px rgba(0,1,104,.08); }
        .eap-form-actions { display: flex; gap: 8px; align-items: center; margin-top: 12px; grid-column: 1 / -1; }
        .eap-msg { font-size: 12.5px; color: ${COFICAB.ok}; font-weight: 600; }
        .eap-msg.err { color: ${COFICAB.danger}; }

        .eap-dossiers { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
        .eap-dossier {
          display: flex; gap: 10px; align-items: flex-start;
          padding: 10px 12px; border: 1px solid ${COFICAB.line}; border-radius: 10px;
        }
        .eap-dossier-icon {
          width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
          background: ${COFICAB.light}; color: ${COFICAB.navy};
          display: flex; align-items: center; justify-content: center;
        }
        .eap-dossier-title { font-size: 13px; font-weight: 650; }
        .eap-dossier-meta {
          display: flex; flex-wrap: wrap; gap: 8px; margin-top: 3px;
          font-size: 11px; color: ${COFICAB.muted};
        }
        .eap-type {
          font-weight: 700; text-transform: uppercase; letter-spacing: .3px;
          padding: 1px 6px; border-radius: 4px; font-size: 10px;
        }
        .eap-type.claim { background: #fff1f2; color: #be123c; }
        .eap-type.capa { background: ${COFICAB.light}; color: ${COFICAB.navy}; }
        .eap-empty { font-size: 13px; color: ${COFICAB.muted}; margin: 0; }

        .eap-badges { display: flex; flex-wrap: wrap; gap: 8px; }
        .eap-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 10px; border-radius: 8px; border: 1px solid ${COFICAB.line};
          background: ${COFICAB.soft}; font-size: 12px; font-weight: 650;
        }

        .eap-loading, .eap-err {
          padding: 48px 16px; text-align: center; color: ${COFICAB.muted}; font-size: 14px;
        }
        .eap-err { color: ${COFICAB.danger}; }
      `}</style>

      <Link to="/admin/employees" className="eap-back">
        <i className="ti ti-arrow-left" /> {t('employeeProfileAdmin.backToList')}
      </Link>

      {loading && <div className="eap-loading">{t('employeeProfileAdmin.loading')}</div>}
      {error && !loading && <div className="eap-err">{error}</div>}

      {!loading && profile && (
        <>
          <header className="eap-hero">
            <div className="eap-id">
              <UserAvatar
                user={{ profilePictureUrl: profile.profilePictureUrl }}
                name={profile.name}
                size={56}
                radius="lg"
              />
              <div style={{ minWidth: 0 }}>
                <h1 className="eap-name">{profile.name}</h1>
                <p className="eap-email">{profile.email || t('employeeProfileAdmin.noEmail')}</p>
                <div className="eap-meta">
                  <span className="eap-chip">{roleLabel(profile.role)}</span>
                  {profile.department ? <span className="eap-chip">{profile.department}</span> : null}
                  {profile.poste ? <span className="eap-chip">{profile.poste}</span> : null}
                  <span className={`eap-pill act-${activityStatusClass(profile.activityStatus)}`}>
                    <span className="k">{t('employeeProfileAdmin.activity')}</span>
                    {activityStatusLabel(profile.activityStatus)}
                  </span>
                </div>
              </div>
            </div>

            <div className="eap-actions">
              <button
                type="button"
                className="eap-btn"
                onClick={() => navigate('/admin/organizations/map')}
              >
                <i className="ti ti-hierarchy-2" /> {t('employeeProfileAdmin.orgChart')}
              </button>
              <button
                type="button"
                className="eap-btn"
                onClick={() => {
                  setEditOpen((v) => !v);
                  setSaveMsg('');
                }}
              >
                <i className="ti ti-pencil" /> {editOpen ? t('employeeProfileAdmin.closeEdit') : t('employeeProfileAdmin.editInfo')}
              </button>
              <button
                type="button"
                className={`eap-btn ${profile.isLockedOut ? '' : 'danger'}`}
                onClick={() => void onToggleLock()}
                disabled={locking}
              >
                <i className={`ti ${profile.isLockedOut ? 'ti-lock-open' : 'ti-lock'}`} />
                {locking
                  ? '…'
                  : profile.isLockedOut
                    ? t('employeesAdmin.unlock')
                    : t('employeeProfileAdmin.lock')}
              </button>
              <button type="button" className="eap-btn" onClick={() => void load()} disabled={loading}>
                <i className="ti ti-refresh" /> {t('qualityHistory.refresh')}
              </button>
            </div>
          </header>

          <div className="eap-kpis">
            {kpis.map((k) => (
              <div key={k.label} className="eap-kpi">
                <div className="eap-kpi-label">
                  <i className={`ti ${k.icon}`} /> {k.label}
                </div>
                <div className="eap-kpi-value">{k.value}</div>
                {'hint' in k && k.hint ? <div className="eap-kpi-hint">{k.hint}</div> : null}
              </div>
            ))}
          </div>

          <div className="eap-grid">
            <div>
              <section className="eap-panel">
                <h2 className="eap-h">{t('employeeProfileAdmin.identityTitle')}</h2>
                <p className="eap-sub">{t('employeeProfileAdmin.identitySub')}</p>
                <dl className="eap-dl">
                  <dt>{t('planDetail.department')}</dt>
                  <dd>{profile.department || '—'}</dd>
                  <dt>{t('usersAdmin.organization')}</dt>
                  <dd>{profile.organizationName || '—'}</dd>
                  <dt>{t('employeesAdmin.team')}</dt>
                  <dd>{profile.equipe || '—'}</dd>
                  <dt>{t('pareto.line')}</dt>
                  <dd>{profile.ligneProduction || '—'}</dd>
                  <dt>{t('employeesAdmin.phone')}</dt>
                  <dd>{profile.telephone || '—'}</dd>
                  <dt>{t('planView.owner')}</dt>
                  <dd>{profile.managerName || t('claimDetail.unassigned')}</dd>
                  <dt>{t('employeeProfileAdmin.hireDate')}</dt>
                  <dd>{fmtDate(profile.hireDate)}</dd>
                </dl>
              </section>

              {editOpen && (
                <section className="eap-panel">
                  <h2 className="eap-h">{t('employeeProfileAdmin.editWorkTitle')}</h2>
                  <p className="eap-sub">{t('employeeProfileAdmin.editWorkSub')}</p>
                  <div className="eap-form">
                    <div className="eap-field">
                      <label htmlFor="eap-poste">{t('employeesAdmin.poste')} *</label>
                      <input
                        id="eap-poste"
                        value={draft.poste}
                        onChange={(e) => setDraft((d) => ({ ...d, poste: e.target.value }))}
                      />
                    </div>
                    <div className="eap-field">
                      <label htmlFor="eap-equipe">{t('employeesAdmin.team')} *</label>
                      <input
                        id="eap-equipe"
                        value={draft.equipe}
                        onChange={(e) => setDraft((d) => ({ ...d, equipe: e.target.value }))}
                      />
                    </div>
                    <div className="eap-field">
                      <label htmlFor="eap-ligne">{t('employeesAdmin.line')}</label>
                      <input
                        id="eap-ligne"
                        value={draft.ligneProduction}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, ligneProduction: e.target.value }))
                        }
                      />
                    </div>
                    <div className="eap-field">
                      <label htmlFor="eap-tel">{t('employeesAdmin.phone')}</label>
                      <input
                        id="eap-tel"
                        value={draft.telephone}
                        onChange={(e) => setDraft((d) => ({ ...d, telephone: e.target.value }))}
                      />
                    </div>
                    <div className="eap-form-actions">
                      <button
                        type="button"
                        className="eap-btn primary"
                        onClick={() => void onSaveWork()}
                        disabled={saving}
                      >
                        {saving ? t('common.saving') : t('common.save')}
                      </button>
                      <button
                        type="button"
                        className="eap-btn"
                        onClick={() => {
                          setEditOpen(false);
                          setDraft({
                            poste: profile.poste,
                            equipe: profile.equipe,
                            ligneProduction: profile.ligneProduction,
                            telephone: profile.telephone,
                          });
                        }}
                      >
                        {t('common.cancel')}
                      </button>
                      {saveMsg ? (
                        <span className={`eap-msg${saveErr ? ' err' : ''}`}>
                          {saveMsg}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </section>
              )}

              {!editOpen && saveMsg ? (
                <p className={`eap-msg${saveErr ? ' err' : ''}`} style={{ marginTop: 8 }}>
                  {saveMsg}
                </p>
              ) : null}

              <section className="eap-panel">
                <h2 className="eap-h">{t('employeeProfileAdmin.recentTitle')}</h2>
                <p className="eap-sub">{t('employeeProfileAdmin.recentSub')}</p>
                {(perf?.recentDossiers?.length ?? 0) === 0 ? (
                  <p className="eap-empty">{t('employeeProfileAdmin.recentEmpty')}</p>
                ) : (
                  <ul className="eap-dossiers">
                    {perf!.recentDossiers.map((d) => (
                      <li key={`${d.type}-${d.id}`} className="eap-dossier">
                        <div className="eap-dossier-icon">
                          <i
                            className={`ti ${d.type === 'claim' ? 'ti-clipboard-check' : 'ti-file-description'}`}
                          />
                        </div>
                        <div>
                          <div className="eap-dossier-title">{d.title}</div>
                          <div className="eap-dossier-meta">
                            <span className={`eap-type ${d.type}`}>
                              {d.type === 'claim' ? t('analysisTools.claim') : 'CAPA'}
                            </span>
                            <span>{d.type === 'claim' ? getStatusBadge(resolveClaimStatus({ statusCode: d.status })).label : d.status}</span>
                            <span>{fmtDate(d.date)}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {accessToken && id && (
                <EmployeeDocumentsBadgesPanel
                  token={accessToken}
                  userId={id}
                  employeeName={profile.name || profile.email || t('employeeProfileAdmin.theEmployee')}
                  adminName={pick(user?.fullName, user?.name)}
                  badges={badges}
                  onBadgesChanged={reloadBadges}
                />
              )}
            </div>

            <div>
              <section className="eap-panel">
                <h2 className="eap-h">{t('employeeProfileAdmin.activityTitle')}</h2>
                <p className="eap-sub">{t('employeeProfileAdmin.activitySub')}</p>
                <dl className="eap-dl">
                  <dt>{t('common.status')}</dt>
                  <dd>{activityStatusLabel(profile.activityStatus)}</dd>
                  <dt>{t('employeeProfileAdmin.lastActivity')}</dt>
                  <dd>{fmtDateTime(profile.lastActivityAt)}</dd>
                  <dt>{t('employeeProfileAdmin.lastLogin')}</dt>
                  <dd>{fmtDateTime(profile.lastLoginAt)}</dd>
                  <dt>{t('employeeProfileAdmin.kpiActions')}</dt>
                  <dd>{profile.recentActionCount}</dd>
                  <dt>{t('employeesAdmin.perfDelay')}</dt>
                  <dd>{perf ? t('employeeProfileAdmin.days', { count: perf.avgDelayDays }) : '—'}</dd>
                  <dt>{t('employeesAdmin.perfLoad')}</dt>
                  <dd>{workloadLabel(perf?.workload)}</dd>
                </dl>
                <div className="eap-cap">
                  <div className="eap-cap-row">
                    <span>{t('employeeProfileAdmin.capacityBeforeOverload')}</span>
                    <strong>
                      {(perf?.remainingCapacity ?? WORKLOAD_CAPACITY_MAX) === 0
                        ? t('employeeProfileAdmin.overloadReached')
                        : t('employeeProfileAdmin.remaining', { count: perf?.remainingCapacity ?? WORKLOAD_CAPACITY_MAX })}
                    </strong>
                  </div>
                  <div className="eap-cap-bar" aria-hidden>
                    <div
                      className={`eap-cap-fill ${capacityTone === 'ok' ? '' : capacityTone}`}
                      style={{ width: `${capacityPct}%` }}
                    />
                  </div>
                  <div className="eap-kpi-hint" style={{ marginTop: 6 }}>
                    {t('employeeProfileAdmin.activeOfMax', { active: perf?.activeDossiers ?? 0, max: WORKLOAD_CAPACITY_MAX })}
                  </div>
                </div>
              </section>

              <section className="eap-panel">
                <h2 className="eap-h">{t('employeeProfileAdmin.levelsTitle')}</h2>
                <p className="eap-sub">
                  {t('employeeProfileAdmin.levelsSub')}
                </p>
                <ul className="eap-levels">
                  {TOOL_LABELS.map(({ key, label }) => {
                    const level: SkillLevel =
                      perf?.competencyLevels?.[key] ?? 'debutant';
                    const score = perf?.competencies?.[key] ?? 0;
                    return (
                      <li key={key} className="eap-level">
                        <div>
                          <div className="eap-level-tool">{label.includes('.') ? t(label) : label}</div>
                          <div className="eap-level-score">{t('skills.score')} {score}%</div>
                        </div>
                        <span className={`eap-level-badge ${level}`}>
                          {SKILL_LEVEL_LABEL[level]}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="eap-panel">
                <h2 className="eap-h">{t('employeeProfileAdmin.skillsTitle')}</h2>
                <p className="eap-sub">{t('employeeProfileAdmin.skillsSub')}</p>
                <CompetencyRadar
                  scores={
                    perf?.competencies ?? {
                      fiveWhy: 0,
                      ishikawa: 0,
                      eightD: 0,
                      capa: 0,
                      deadlines: 0,
                    }
                  }
                  height={260}
                />
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
