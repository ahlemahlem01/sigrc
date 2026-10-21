import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListSkeleton } from '../../components/TableSkeleton';
import { useAuth } from '../../context/AuthContext';
import { isPlatformAdmin } from '../../utils/roles';
import { getUsersForAssignment } from '../../services/actionPlanService';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import type { Claim } from '../../types/qualityAnalysis';
import { getSeverityStyle, getStatusBadge, resolveClaimStatus } from '../../utils/Claimutils';
import {
  ClaimDateSort,
  DEFAULT_CLAIM_DATE_SORT,
  sortClaimsByDate,
} from '../../utils/claimDateSort';
import { ClaimDateSortSelect } from '../../components/ClaimDateSortSelect';
import { EmployeeRecommendationBanner } from '../../components/EmployeeRecommendationBanner';
import { CreateClaimForm } from '../claims/CreateClaimForm';
import { CsvImportButton } from '../../components/CsvImportButton';
import { CapaKpiStrip } from '../../components/capa/CapaAdminUi';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../../i18n';

type AssignmentToggle = 'assigned' | 'unassigned';
type WorkspaceMode = 'browse' | 'create';

type UserOption = { id: string; label: string; email?: string; department?: string; departmentId?: string };

/** Normalize assignee id from camelCase or PascalCase API payloads. */
const pickAssigneeId = (c: Claim | Record<string, unknown> | null | undefined): string => {
  if (!c) return '';
  const raw = (c as any).assignedToId ?? (c as any).AssignedToId ?? '';
  return String(raw).trim();
};

const pickAssigneeName = (c: Claim | Record<string, unknown> | null | undefined): string => {
  if (!c) return '';
  const raw = (c as any).assignedToName ?? (c as any).AssignedToName ?? '';
  return String(raw).trim();
};

const isAssigned = (c: Claim) => pickAssigneeId(c).length > 0;

const normalizeClaim = (raw: any): Claim => ({
  ...raw,
  id: String(raw.id ?? raw.Id ?? ''),
  assignedToId: pickAssigneeId(raw) || null,
  assignedToName: pickAssigneeName(raw) || null,
  statusCode: String(raw.statusCode ?? raw.StatusCode ?? ''),
  title: raw.title ?? raw.Title ?? '',
  clientId: raw.clientId ?? raw.ClientId ?? '',
  defectType: raw.defectType ?? raw.DefectType ?? '',
  severity: raw.severity ?? raw.Severity ?? '',
  lotNumber: raw.lotNumber ?? raw.LotNumber ?? '',
  serialNumber: raw.serialNumber ?? raw.SerialNumber,
  description: raw.description ?? raw.Description ?? '',
  detectionDate: raw.detectionDate ?? raw.DetectionDate,
  createdAt: raw.createdAt ?? raw.CreatedAt,
  createdById: raw.createdById ?? raw.CreatedById,
  assignedAt: raw.assignedAt ?? raw.AssignedAt,
});

/**
 * Front Admin — réclamations créées par l'admin.
 * Liste + détail + assignation + création, sans quitter la page.
 */
/** `scope`: 'mine' = the claims I created (workspace); 'all' = every open claim of my perimeter (admin menu). */
export default function AdminManagedClaimsPage({ scope = 'mine' }: { scope?: 'mine' | 'all' }) {
  const { t } = useTranslation();
  const { accessToken, user } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dateSort, setDateSort] = useState<ClaimDateSort>(DEFAULT_CLAIM_DATE_SORT);
  const [toggle, setToggle] = useState<AssignmentToggle>('unassigned');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<WorkspaceMode>('browse');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [savingAssign, setSavingAssign] = useState(false);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);
  const [assignErr, setAssignErr] = useState<string | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignModalClaimId, setAssignModalClaimId] = useState<string | null>(null);
  const [modalAssignee, setModalAssignee] = useState('');
  const [modalErr, setModalErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const rows = scope === 'all'
        ? (await qualityAnalysisService.getClaims(undefined, accessToken)).filter((c: any) => {
            const s = resolveClaimStatus(c);
            return s !== 'CLOTUREE' && s !== 'DRAFT';
          })
        : await qualityAnalysisService.getAdminManagedClaims(accessToken);
      const list = (Array.isArray(rows) ? rows : []).map(normalizeClaim);
      setClaims(list);
    } catch {
      setError(i18n.t('managedClaims.loadFailed'));
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, scope]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getUsersForAssignment(accessToken)
      .then((res) => {
        if (cancelled) return;
        const raw = Array.isArray(res.data) ? res.data : (res.data?.$values ?? res.data?.items ?? []);
        setUsers(
          (raw as any[])
            .map((u) => ({
              id: String(u.id ?? u.userId ?? ''),
              label:
                u.fullName ||
                [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
                u.email ||
                String(u.id ?? ''),
              email: u.email ? String(u.email) : undefined,
              department: u.department ?? u.Department ?? undefined,
              departmentId: u.departmentId
                ? String(u.departmentId)
                : u.DepartmentId
                  ? String(u.DepartmentId)
                  : undefined,
            }))
            .filter((u) => u.id)
        );
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const assignedCount = useMemo(() => claims.filter(isAssigned).length, [claims]);
  const unassignedCount = useMemo(() => claims.filter((c) => !isAssigned(c)).length, [claims]);

  const filtered = useMemo(() => {
    let list =
      toggle === 'assigned' ? claims.filter(isAssigned) : claims.filter((c) => !isAssigned(c));
    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (c) =>
          c.title?.toLowerCase().includes(term) ||
          c.clientId?.toLowerCase().includes(term) ||
          c.defectType?.toLowerCase().includes(term) ||
          (c.assignedToName || '').toLowerCase().includes(term)
      );
    }
    return sortClaimsByDate(list, dateSort);
  }, [claims, toggle, search, dateSort]);

  useEffect(() => {
    if (mode !== 'browse') return;
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((c) => c.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId, mode]);

  const selected = useMemo(
    () => claims.find((c) => c.id === selectedId) ?? null,
    [claims, selectedId]
  );

  useEffect(() => {
    setAssignMsg(null);
    setAssignErr(null);
  }, [selected?.id]);

  const saveAssignmentFor = async (claimId: string, nextId: string | null) => {
    if (!accessToken) return false;
    const claim = claims.find((c) => c.id === claimId);
    if (!claim) return false;
    const prevId = pickAssigneeId(claim) || null;
    if ((nextId || null) === prevId) {
      setAssignMsg(t('managedClaims.noChange'));
      return true;
    }
    setSavingAssign(true);
    setAssignErr(null);
    setAssignMsg(null);
    setModalErr(null);
    try {
      const user = users.find((u) => u.id === nextId);
      await qualityAnalysisService.assignClaim(
        claimId,
        { assignedToId: nextId, assignedToName: user?.label ?? null },
        accessToken
      );
      await load();
      setAssignMsg(nextId ? t('managedClaims.assignSaved') : t('managedClaims.assignRemoved'));
      if (nextId) setToggle('assigned');
      else setToggle('unassigned');
      setSelectedId(claimId);
      return true;
    } catch (e: any) {
      const data = e?.response?.data;
      const status = e?.response?.status;
      const msg =
        data?.detail ||
        data?.message ||
        data?.title ||
        (status === 403
          ? t('managedClaims.err403')
          : status === 401
            ? t('managedClaims.err401')
            : status === 404
              ? t('managedClaims.err404')
              : t('managedClaims.assignFailed'));
      setAssignErr(msg);
      setModalErr(msg);
      return false;
    } finally {
      setSavingAssign(false);
    }
  };

  const openAssignModal = (claimId: string) => {
    const claim = claims.find((c) => c.id === claimId);
    setSelectedId(claimId);
    setAssignModalClaimId(claimId);
    setModalAssignee(pickAssigneeId(claim) || '');
    setModalErr(null);
    setAssignModalOpen(true);
  };

  const confirmAssignModal = async () => {
    if (!assignModalClaimId) return;
    if (!modalAssignee.trim()) {
      setModalErr(t('managedClaims.selectEmployee'));
      return;
    }
    const ok = await saveAssignmentFor(assignModalClaimId, modalAssignee.trim());
    if (ok) setAssignModalOpen(false);
  };

  const onCreateSuccess = async () => {
    setMode('browse');
    await load();
    setToggle('assigned');
  };

  const status = selected ? resolveClaimStatus(selected) : null;
  const badge = status ? getStatusBadge(status) : null;
  const sev = selected ? getSeverityStyle(selected.severity) : null;

  return (
    <>
      <style>{`
        .amc-wrap {
          font-family: Inter, sans-serif; background: #f4f6fb;
          height: calc(100dvh - 56px); min-height: 520px; padding: 20px 24px 16px;
          display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden;
        }
        .amc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 14px; flex-shrink: 0; }
        .amc-title { font-family: Inter, sans-serif; font-size: 20px; font-weight: 700; color: #000168; }
        .amc-sub { font-size: 12px; color: #64748b; margin-top: 4px; line-height: 1.4; }
        .amc-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .amc-btn {
          border: none; border-radius: 8px; padding: 9px 14px; font-size: 12px; font-weight: 600;
          cursor: pointer; background: #000168; color: #fff; font-family: inherit;
        }
        .amc-btn.ghost { background: #fff; color: #000168; border: 1px solid #c7d2fe; }
        .amc-btn.accent { background: #1d4ed8; }
        .amc-modal-overlay {
          position: fixed; inset: 0; background: rgba(15, 23, 42, .45); z-index: 80;
          display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .amc-modal {
          width: min(420px, 100%); background: #fff; border-radius: 14px; border: 1px solid #e4e8f2;
          box-shadow: 0 20px 50px rgba(15,23,42,.18); padding: 18px 20px;
        }
        .amc-modal h3 { margin: 0 0 6px; font-size: 16px; color: #000168; font-family: Inter, sans-serif; }
        .amc-modal p { margin: 0 0 14px; font-size: 12px; color: #64748b; line-height: 1.45; }
        .amc-modal select {
          width: 100%; border: 1px solid #e4e8f2; border-radius: 8px; padding: 10px 12px;
          font-size: 13px; margin-bottom: 14px; background: #fff;
        }
        .amc-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .amc-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; flex-shrink: 0; }
        .amc-kpi { background: #fff; border: 1px solid #e4e8f2; border-radius: 10px; padding: 12px 14px; border-top: 3px solid #000168; }
        .amc-kpi-val { font-family: Inter, sans-serif; font-size: 22px; font-weight: 700; color: #000168; }
        .amc-kpi-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: #64748b; margin-top: 2px; }
        .amc-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; flex-shrink: 0; }
        .amc-toggle { display: inline-flex; background: #fff; border: 1px solid #e4e8f2; border-radius: 999px; padding: 3px; gap: 2px; }
        .amc-toggle-btn {
          border: none; background: transparent; cursor: pointer; font-size: 12px; font-weight: 600;
          color: #64748b; padding: 7px 14px; border-radius: 999px; font-family: inherit;
        }
        .amc-toggle-btn.active { background: #000168; color: #fff; }
        .amc-toggle-count {
          display: inline-block; min-width: 16px; margin-left: 6px; font-size: 10px; font-weight: 700;
          padding: 1px 6px; border-radius: 999px; background: rgba(0,0,0,.08);
        }
        .amc-toggle-btn.active .amc-toggle-count { background: rgba(255,255,255,.22); }
        .amc-srch {
          display: flex; align-items: center; background: #fff; border: 1px solid #e4e8f2;
          border-radius: 8px; padding: 7px 12px; min-width: 220px;
        }
        .amc-srch input { border: none; outline: none; font-size: 12px; width: 100%; background: none; color: #0d1340; }
        .amc-date-sort {
          height: 36px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;
          padding: 0 10px; font-size: 12px; color: #334155; min-width: 190px;
        }
        .amc-workspace {
          flex: 1; min-height: 0; display: grid; grid-template-columns: 340px 1fr; gap: 14px;
        }
        .amc-list-pane, .amc-detail-pane {
          background: #fff; border: 1px solid #e4e8f2; border-radius: 12px;
          display: flex; flex-direction: column; min-height: 0; overflow: hidden;
        }
        .amc-list-scroll { flex: 1; overflow: auto; padding: 8px; }
        .amc-row {
          border: 1px solid transparent; border-radius: 10px; padding: 10px 12px; cursor: pointer;
          margin-bottom: 6px; transition: background .12s, border-color .12s;
        }
        .amc-row:hover { background: #f8fafc; }
        .amc-row.active { background: rgba(0,1,104,.05); border-color: rgba(0,1,104,.2); }
        .amc-row-title { font-size: 13px; font-weight: 650; color: #0d1340; margin-bottom: 4px; }
        .amc-row-meta { font-size: 11px; color: #64748b; display: flex; justify-content: space-between; gap: 8px; }
        .amc-chip {
          font-size: 10px; font-weight: 650; padding: 2px 8px; border-radius: 999px; white-space: nowrap;
        }
        .amc-detail-body { flex: 1; overflow: auto; padding: 18px 20px; }
        .amc-detail-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
        .amc-detail-title { font-family: Inter, sans-serif; font-size: 18px; font-weight: 700; color: #000168; margin: 0 0 6px; }
        .amc-grid-info {
          display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px;
        }
        .amc-info-card {
          border: 1px solid #eef2f7; border-radius: 10px; padding: 10px 12px; background: #f8fafc;
        }
        .amc-info-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .7px; color: #94a3b8; font-weight: 600; }
        .amc-info-val { font-size: 13px; color: #0d1340; font-weight: 600; margin-top: 3px; word-break: break-word; }
        .amc-desc {
          border: 1px solid #eef2f7; border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; background: #fff;
        }
        .amc-desc p { margin: 6px 0 0; font-size: 13px; color: #334155; line-height: 1.5; white-space: pre-wrap; }
        .amc-empty {
          flex: 1; display: flex; align-items: center; justify-content: center;
          color: #64748b; font-size: 13px; padding: 24px; text-align: center;
        }
        .amc-err { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; font-size: 12px; }
        .amc-ok { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 8px; padding: 8px 12px; margin-top: 10px; font-size: 12px; }
        .amc-create-wrap { flex: 1; min-height: 0; overflow: auto; border: 1px solid #e4e8f2; border-radius: 12px; background: #fff; }
        @media (max-width: 980px) {
          .amc-workspace { grid-template-columns: 1fr; }
          .amc-list-pane { max-height: 280px; }
          .amc-kpis { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="amc-wrap">
        <div className="amc-head">
          <div>
            <div className="amc-title">{scope === 'all' ? t('managedClaims.titleAll') : t('managedClaims.title')}</div>
            <div className="amc-sub">
              {scope === 'all' ? t('managedClaims.subtitleAll') : t('managedClaims.subtitle')}
            </div>
          </div>
          <div className="amc-actions">
            {scope === 'mine' && isPlatformAdmin(user) && accessToken && (
              <CsvImportButton
                className="amc-btn ghost"
                label={t('claimsList.import')}
                entity="claims"
                columns={['Title', 'ClientId', 'DefectType', 'Severity', 'LotNumber', 'Description']}
                templateName="reclamations"
                summary={(n) => t('claimsList.imported', { count: n })}
                importFile={(file) => qualityAnalysisService.importClaimsCsv(file, accessToken)}
                onImported={() => load()}
              />
            )}
            {mode === 'browse' ? (
              <button type="button" className="amc-btn" onClick={() => setMode('create')}>
                {t('adminNav.newClaim')}
              </button>
            ) : (
              <button type="button" className="amc-btn ghost" onClick={() => setMode('browse')}>
                {t('employeeProfileAdmin.backToList')}
              </button>
            )}
          </div>
        </div>

        {error && <div className="amc-err">{error}</div>}

        {mode === 'create' ? (
          <div className="amc-create-wrap">
            <CreateClaimForm onSuccess={onCreateSuccess} />
          </div>
        ) : (
          <>
            <CapaKpiStrip
              items={[
                { key: 'total', label: scope === 'all' ? t('managedClaims.kpiTotalAll') : t('managedClaims.kpiTotal'), value: claims.length },
                { key: 'unassigned', label: t('frontNav.unassigned'), value: unassignedCount, active: toggle === 'unassigned', onClick: () => setToggle('unassigned') },
                { key: 'assigned', label: t('managedClaims.kpiAssigned'), value: assignedCount, active: toggle === 'assigned', onClick: () => setToggle('assigned') },
                { key: 'rate', label: t('managedClaims.kpiRate'), value: claims.length === 0 ? '—' : `${Math.round((100 * assignedCount) / claims.length)} %` },
              ]}
            />

            <div className="amc-toolbar">
              <div className="amc-toggle" role="tablist" aria-label={t('managedClaims.toggleAria')}>
                <button
                  type="button"
                  className={`amc-toggle-btn${toggle === 'assigned' ? ' active' : ''}`}
                  onClick={() => setToggle('assigned')}
                >
                  {t('managedClaims.toggleAssigned')}
                  <span className="amc-toggle-count">{assignedCount}</span>
                </button>
                <button
                  type="button"
                  className={`amc-toggle-btn${toggle === 'unassigned' ? ' active' : ''}`}
                  onClick={() => setToggle('unassigned')}
                >
                  {t('managedClaims.toggleUnassigned')}
                  <span className="amc-toggle-count">{unassignedCount}</span>
                </button>
              </div>
              <div className="amc-srch">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('activityTracking.searchPh')}
                />
              </div>
              <ClaimDateSortSelect
                className="amc-date-sort"
                value={dateSort}
                onChange={setDateSort}
              />
            </div>

            <div className="amc-workspace">
              <div className="amc-list-pane">
                <div className="amc-list-scroll">
                  {loading ? (
                    <ListSkeleton rows={8} />
                  ) : filtered.length === 0 ? (
                    <div className="amc-empty">
                      {toggle === 'assigned'
                        ? t('managedClaims.emptyAssigned')
                        : t('managedClaims.emptyUnassigned')}
                    </div>
                  ) : (
                    filtered.map((claim) => {
                      const resolved = resolveClaimStatus(claim);
                      const displayStatus =
                        !isAssigned(claim) && resolved === 'ASSIGNED' ? 'OUVERTE' : resolved;
                      const st = getStatusBadge(displayStatus);
                      return (
                        <div
                          key={claim.id}
                          className={`amc-row${selectedId === claim.id ? ' active' : ''}`}
                          style={{ borderLeft: `4px solid ${st.color}`, background: selectedId === claim.id ? '#fff' : st.bg }}
                          onClick={() => setSelectedId(claim.id)}
                        >
                          <div className="amc-row-title">{claim.title}</div>
                          <div className="amc-row-meta">
                            <span>{claim.clientId || '—'}</span>
                            <span
                              className="amc-chip"
                              style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}
                            >
                              {st.label}
                            </span>
                          </div>
                          <div className="amc-row-meta" style={{ marginTop: 4 }}>
                            <span>
                              {isAssigned(claim)
                                ? pickAssigneeName(claim) || t('managedClaims.assigned')
                                : t('claimDetail.unassigned')}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="amc-detail-pane">
                {!selected ? (
                  <div className="amc-empty">{t('managedClaims.selectClaim')}</div>
                ) : (
                  <div className="amc-detail-body">
                    <div className="amc-detail-head">
                      <div>
                        <h2 className="amc-detail-title">{selected.title}</h2>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                          {t('orgs.createdOn')}{' '}
                          {selected.createdAt
                            ? new Date(selected.createdAt).toLocaleString(dateLocale())
                            : '—'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {badge && (
                          <span
                            className="amc-chip"
                            style={{
                              background: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                              padding: '5px 10px',
                              fontSize: 11,
                            }}
                          >
                            {isAssigned(selected) || resolveClaimStatus(selected) !== 'ASSIGNED'
                              ? badge.label
                              : t('claimStatus.open')}
                          </span>
                        )}
                        {sev && (
                          <span
                            className="amc-chip"
                            style={{
                              background: sev.bg,
                              color: sev.color,
                              border: `1px solid ${sev.border}`,
                              padding: '5px 10px',
                              fontSize: 11,
                            }}
                          >
                            {sev.label}
                          </span>
                        )}
                        <button
                          type="button"
                          className="amc-btn accent"
                          onClick={() => openAssignModal(selected.id)}
                        >
                          {isAssigned(selected) ? t('managedClaims.reassign') : t('recommend.assign')}
                        </button>
                      </div>
                    </div>

                    <div className="amc-grid-info">
                      <div className="amc-info-card">
                        <div className="amc-info-lbl">{t('closedArchive.colClient')}</div>
                        <div className="amc-info-val">{selected.clientId || '—'}</div>
                      </div>
                      <div className="amc-info-card">
                        <div className="amc-info-lbl">{t('claimDetail.defectType')}</div>
                        <div className="amc-info-val">{selected.defectType || '—'}</div>
                      </div>
                      <div className="amc-info-card">
                        <div className="amc-info-lbl">{t('closedArchive.lot')}</div>
                        <div className="amc-info-val">{selected.lotNumber || '—'}</div>
                      </div>
                      <div className="amc-info-card">
                        <div className="amc-info-lbl">{t('claimDetail.serialNumber')}</div>
                        <div className="amc-info-val">{selected.serialNumber || '—'}</div>
                      </div>
                      <div className="amc-info-card">
                        <div className="amc-info-lbl">{t('fiveWhy.detection')}</div>
                        <div className="amc-info-val">
                          {selected.detectionDate
                            ? new Date(selected.detectionDate).toLocaleDateString(dateLocale())
                            : '—'}
                        </div>
                      </div>
                      <div className="amc-info-card">
                        <div className="amc-info-lbl">{t('managedClaims.currentAssignee')}</div>
                        <div className="amc-info-val">
                          {pickAssigneeName(selected) || pickAssigneeId(selected) || t('claimDetail.unassigned')}
                        </div>
                      </div>
                    </div>

                    <div className="amc-desc">
                      <div className="amc-info-lbl">{t('claimDetail.description')}</div>
                      <p>{selected.description || t('managedClaims.noDescription')}</p>
                    </div>

                    {assignErr && <div className="amc-err">{assignErr}</div>}
                    {assignMsg && <div className="amc-ok">{assignMsg}</div>}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {assignModalOpen && (
        <div
          className="amc-modal-overlay"
          onClick={() => !savingAssign && setAssignModalOpen(false)}
        >
          <div className="amc-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{pickAssigneeId(claims.find((c) => c.id === assignModalClaimId)) ? t('managedClaims.reassign') : t('recommend.assign')}</h3>
            <p>
              {claims.find((c) => c.id === assignModalClaimId)?.title || t('analysisTools.claim')}
              <br />
              {t('managedClaims.modalHint')}
            </p>
            {(() => {
              const claim = claims.find((c) => c.id === assignModalClaimId);
              return (
                <EmployeeRecommendationBanner
                  defectType={claim?.defectType}
                  severity={claim?.severity}
                  employees={users.map((u) => ({
                    employeeId: u.id,
                    name: u.label,
                    email: u.email,
                    department: u.department,
                    departmentId: u.departmentId,
                  }))}
                  requireDepartment={false}
                  onAssign={(employeeId) => {
                    setModalAssignee(employeeId);
                    setModalErr(null);
                  }}
                />
              );
            })()}
            <select
              value={modalAssignee}
              onChange={(e) => setModalAssignee(e.target.value)}
              autoFocus
            >
              <option value="">{t('managedClaims.chooseEmployee')}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
            {modalErr && <div className="amc-err">{modalErr}</div>}
            <div className="amc-modal-actions">
              <button
                type="button"
                className="amc-btn ghost"
                disabled={savingAssign}
                onClick={() => setAssignModalOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="amc-btn accent"
                disabled={savingAssign || !modalAssignee.trim()}
                onClick={() => void confirmAssignModal()}
              >
                {savingAssign ? t('common.saving') : t('managedClaims.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
