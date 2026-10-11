import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminEmployeeService } from '../../services/adminEmployeeService';
import { employeeService } from '../../services/employeeService';
import { getUsersForAssignment } from '../../services/actionPlanService';
import { getAlertClaims } from '../../services/alertService';
import { qualityAnalysisService, StartAnalysisRequestDto } from '../../services/qualityAnalysisService';
import { Claim, UpdateClaimCommand } from '../../types/qualityAnalysis';
import { matchesStatusFilter, resolveClaimStatus } from '../../utils/Claimutils';
import i18n from '../../i18n';
import {
  ClaimDateSort,
  DEFAULT_CLAIM_DATE_SORT,
  claimMatchesDateRange,
  sortClaimsByDate,
} from '../../utils/claimDateSort';
import { isAdminUser } from '../../utils/roles';
import type { AssignableUserOption } from './ClaimEditModal';

/**
 * Owns every piece of state, data-fetching, and business logic behind the
 * Claims directory page: loading/filtering claims, resolving creator names,
 * the edit-claim modal, the OUVERTE/ASSIGNED -> EN_ANALYSE transition, and the
 * shared production-data modal.
 */
export const useClaimsDirectory = (accessToken: string | null) => {
  const { isLoading: isAuthLoading, user: currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get('status');
  const claimIdFromUrl = searchParams.get('claimId');
  const startFromUrl = searchParams.get('start') === '1';
  const mineOnly = searchParams.get('mine') === '1';
  const defectTypeParam = (searchParams.get('defectType') || '').trim();
  const productionLineParam = (searchParams.get('productionLine') || '').trim();
  const alertIdParam = (searchParams.get('alertId') || '').trim();
  const alertScope = Boolean(alertIdParam || defectTypeParam || productionLineParam);
  const scopeParam = (searchParams.get('scope') || '').trim().toLowerCase();
  const canAssign = isAdminUser(currentUser);
  const assignedOnly =
    !mineOnly &&
    !alertScope &&
    (scopeParam === 'assigned' ||
      location.pathname.includes('/my-claims') ||
      location.pathname.endsWith('/quality-analyses/assigned'));
  const createdOnly =
    !assignedOnly &&
    !alertScope &&
    (mineOnly || scopeParam === 'created' || scopeParam === 'mine');
  const relatedOnly =
    !canAssign &&
    !alertIdParam &&
    (alertScope || scopeParam === 'related' || scopeParam === 'all-related');
  /** Employee: created | assigned | related (alert drill-down). Admin: all unless scoped. */
  const claimScope: 'created' | 'assigned' | 'all' | 'related' = alertIdParam
    ? canAssign
      ? 'all'
      : 'related'
    : canAssign
      ? alertScope
        ? 'all'
        : createdOnly
          ? 'created'
          : assignedOnly
            ? 'assigned'
            : 'all'
      : relatedOnly
        ? 'related'
        : assignedOnly
          ? 'assigned'
          : 'created';
  const viewParam = searchParams.get('view');
  const phaseView: 'all' | 'open' | 'validated' | 'closed' | 'rejected' =
    viewParam === 'all' || viewParam === 'toutes'
      ? 'all'
      : viewParam === 'validated' || statusFilter === 'VALIDATED'
        ? 'validated'
        : viewParam === 'rejected' || statusFilter === 'REJECTED'
          ? 'rejected'
          : viewParam === 'closed' ||
              statusFilter === 'CLOTUREE' ||
              statusFilter === 'CLOSED'
            ? 'closed'
            : 'open';
  const hasAssigneeParam = searchParams.get('hasAssignee');
  const hasAssigneeFilter =
    hasAssigneeParam === 'true' ? true : hasAssigneeParam === 'false' ? false : undefined;

  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedClaimId, setSelectedClaimId] = useState<string | number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({});
  const [assignableUsers, setAssignableUsers] = useState<AssignableUserOption[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [semanticClaimIds, setSemanticClaimIds] = useState<string[] | null>(null);
  const [, setSemanticSearching] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [dateSort] = useState<ClaimDateSort>(DEFAULT_CLAIM_DATE_SORT);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editFormData, setEditFormData] = useState<Partial<Claim>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Production-data modal state
  const [isProductionModalOpen, setIsProductionModalOpen] = useState<boolean>(false);
  const [productionModalMode, setProductionModalMode] = useState<'start' | 'edit'>('start');
  const [productionFormData, setProductionFormData] = useState<StartAnalysisRequestDto>({});
  const [isSavingProduction, setIsSavingProduction] = useState<boolean>(false);
  const [productionSaveError, setProductionSaveError] = useState<string | null>(null);
  const [autoStartHandled, setAutoStartHandled] = useState(false);

  const fetchUserName = useCallback(async (userId: string) => {
    if (!accessToken || !userId || userNameMap[userId]) return;

    try {
      let displayName: string | null = null;

      if (currentUser && (currentUser.id === userId || (currentUser as any).sub === userId)) {
        try {
          const myProfile = await employeeService.getProfile(accessToken);
          displayName = myProfile?.fullName ||
                        (myProfile?.firstName && myProfile?.lastName ? `${myProfile.firstName} ${myProfile.lastName}` : null) ||
                        myProfile?.firstName ||
                        myProfile?.name;
        } catch (e) {
          // Fallback ignore
        }
      }

      if (!displayName) {
        try {
          const profileData = await adminEmployeeService.getProfile(accessToken, userId);
          displayName = profileData?.fullName ||
                        (profileData?.firstName && profileData?.lastName ? `${profileData.firstName} ${profileData.lastName}` : null) ||
                        profileData?.firstName ||
                        profileData?.name;
        } catch (e) {
          // Direct endpoint match failed
        }
      }

      if (!displayName) {
        try {
          const allEmployees = await adminEmployeeService.getAllProfiles(accessToken);
          if (Array.isArray(allEmployees)) {
            const found = allEmployees.find((e: any) =>
              e.id === userId ||
              e.userId === userId ||
              e.user_id === userId ||
              e.guid === userId
            );
            if (found) {
              displayName = found.fullName ||
                            (found.firstName && found.lastName ? `${found.firstName} ${found.lastName}` : null) ||
                            found.firstName ||
                            found.name ||
                            found.email;
            }
          }
        } catch (e) {
          console.warn('Could not fetch employee directory list for resolution', e);
        }
      }

      setUserNameMap(prev => ({ ...prev, [userId]: displayName || 'Utilisateur' }));
    } catch (e) {
      console.warn(`Failed to resolve username for ID: ${userId}`, e);
      setUserNameMap(prev => ({ ...prev, [userId]: 'Utilisateur' }));
    }
  }, [accessToken, currentUser, userNameMap]);

  const resolveCreatorName = useCallback((claim: any): string => {
    if (!claim) return 'Utilisateur';

    const formatEmailToName = (email?: string | null): string | null => {
      if (!email || typeof email !== 'string' || !email.includes('@')) return null;
      const prefix = email.split('@')[0];
      const parts = prefix.split(/[._-]/).filter(Boolean);
      if (parts.length > 0) {
        return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
      }
      return prefix;
    };

    const cleanName = (val?: string | null): string | null => {
      if (!val || typeof val !== 'string') return null;
      let sanitized = val.replace(/\s*\([0-9a-fA-F-]{4,}\)/g, '').trim();
      if (/^[0-9a-fA-F-]{8,}$/.test(sanitized)) return null;
      if (sanitized.toLowerCase() === 'utilisateur' || sanitized.toLowerCase() === 'user') return null;
      return sanitized || null;
    };

    const directName = cleanName(
      claim.createdByName ||
      claim.creatorName ||
      claim.authorName ||
      claim.userName ||
      claim.user_name ||
      claim.created_by_name ||
      claim.creator_name
    );
    if (directName) return directName;

    const userObjects = [claim.createdBy, claim.user, claim.creator, claim.author, claim.created_by];
    for (const obj of userObjects) {
      if (obj && typeof obj === 'object') {
        const nestedName = cleanName(
          obj.fullName ||
          (obj.firstName && obj.lastName ? `${obj.firstName} ${obj.lastName}` : null) ||
          obj.name ||
          obj.username ||
          obj.displayName
        ) || formatEmailToName(obj.email);
        if (nestedName) return nestedName;
      }
    }

    const userId = typeof claim.createdBy === 'string' ? claim.createdBy : claim.userId || claim.user_id;
    if (currentUser && userId && (currentUser.id === userId || (currentUser as any).sub === userId)) {
      const myName = cleanName(
        (currentUser as any).fullName ||
        ((currentUser as any).firstName && (currentUser as any).lastName
          ? `${(currentUser as any).firstName} ${(currentUser as any).lastName}`
          : null) ||
        currentUser.name ||
        currentUser.username
      ) || formatEmailToName(currentUser.email);

      if (myName) return `${myName} (Vous)`;
    }

    if (userId && userNameMap[userId]) {
      const cached = cleanName(userNameMap[userId]);
      if (cached) return cached;
    }

    if (userId && /^[0-9a-fA-F-]{8,}$/.test(userId)) {
      fetchUserName(userId);
      return 'Chargement...';
    }

    return cleanName(claim.createdBy) || formatEmailToName(currentUser?.email) || 'Utilisateur';
  }, [currentUser, userNameMap, fetchUserName]);

  const fetchClaims = useCallback(async () => {
    if (isAuthLoading) return;
    if (!accessToken) {
      setError('User is not authenticated.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Alert drill-down: load EVERY claim of the defect×line series (not only mine).
      if (alertIdParam) {
        try {
          const alertClaims = await getAlertClaims(accessToken, alertIdParam);
          setClaims(alertClaims as Claim[]);
          return;
        } catch (alertErr: any) {
          // Endpoint missing / 404 / 500 → fall back to directory + client filter.
          console.warn('getAlertClaims failed, falling back to directory filter', alertErr);
        }
      }

      const data = await qualityAnalysisService.getClaims(
        undefined,
        accessToken,
        claimScope === 'assigned' ? 'me' : undefined,
        claimScope === 'created'
          ? { createdBy: 'me' }
          : claimScope === 'related'
            ? { relatedTo: 'me' }
            : claimScope === 'all' && hasAssigneeFilter !== undefined
              ? { hasAssignee: hasAssigneeFilter }
              : claimScope === 'all'
                ? undefined
                : undefined
      );
      const claimsData = data || [];
      const getFiveWhyFn = (qualityAnalysisService as any).getFiveWhy || (qualityAnalysisService as any).getFiveWhyAnalysis;

      const enrichedClaims = await Promise.all(
        claimsData.map(async (claim: any) => {
          if (typeof getFiveWhyFn === 'function') {
            try {
              const fiveWhy = await getFiveWhyFn(claim.id, accessToken);
              if (fiveWhy) return { ...claim, fiveWhyAnalysis: fiveWhy };
            } catch (e) {
              // Ignore missing 5-why analysis
            }
          }
          return claim;
        })
      );

      setClaims(enrichedClaims);
    } catch (err: any) {
      const apiMessage =
        err?.response?.data?.message ||
        err?.response?.data?.title ||
        (typeof err?.response?.data === 'string' ? err.response.data : null);
      setError(apiMessage || i18n.t('claimsDir.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAuthLoading, claimScope, hasAssigneeFilter, alertIdParam]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  // Remplace la recherche mots-clés par une recherche sémantique (debounce).
  useEffect(() => {
    const q = searchTerm.trim();
    // Very short queries are answered by the instant keyword match only (no call to the embedding service).
    if (q.length < 3 || !accessToken) {
      setSemanticClaimIds(null);
      setSemanticSearching(false);
      return;
    }

    let cancelled = false;
    setSemanticSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await qualityAnalysisService.semanticSearch(q, accessToken, 50);
        if (cancelled) return;
        const ids = (res.claims || []).map((c: any) => String(c.id ?? c.Id ?? '')).filter(Boolean);
        setSemanticClaimIds(ids);
      } catch (err) {
        console.error('Semantic search failed', err);
        if (!cancelled) setSemanticClaimIds([]);
      } finally {
        if (!cancelled) setSemanticSearching(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm, accessToken]);

  useEffect(() => {
    if (!accessToken || !canAssign) {
      setAssignableUsers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getUsersForAssignment(accessToken);
        const raw = Array.isArray(res.data) ? res.data : (res.data?.$values ?? res.data?.items ?? []);
        if (cancelled) return;
        setAssignableUsers(
          (raw as any[]).map((u) => {
            const id = String(u.id ?? u.userId ?? '');
            const label =
              u.fullName ||
              [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
              u.email ||
              id;
            return {
              id,
              label,
              email: u.email ? String(u.email) : undefined,
              department: u.department ?? u.Department ?? undefined,
              departmentId: u.departmentId
                ? String(u.departmentId)
                : u.DepartmentId
                  ? String(u.DepartmentId)
                  : undefined,
            };
          }).filter((u) => u.id)
        );
      } catch {
        if (!cancelled) setAssignableUsers([]);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, canAssign]);

  const submittedClaims = useMemo(
    () => claims.filter((claim) => resolveClaimStatus(claim) !== 'DRAFT'),
    [claims]
  );

  const isValidatedClaim = useCallback((claim: Claim) => {
    return resolveClaimStatus(claim) === 'VALIDATED';
  }, []);

  const isRejectedClaim = useCallback((claim: Claim) => {
    return resolveClaimStatus(claim) === 'REJECTED';
  }, []);

  const isClosedClaim = useCallback((claim: Claim) => {
    const resolved = resolveClaimStatus(claim);
    return resolved === 'CLOTUREE' || resolved === 'CLOSED';
  }, []);

  const isOpenClaim = useCallback(
    (claim: Claim) => {
      const s = resolveClaimStatus(claim);
      if (s === 'DRAFT') return false;
      return !isValidatedClaim(claim) && !isClosedClaim(claim) && !isRejectedClaim(claim);
    },
    [isClosedClaim, isRejectedClaim, isValidatedClaim]
  );

  const phaseSourceClaims = useMemo(() => {
    if (alertIdParam) return claims;
    if (claimScope !== 'all') return submittedClaims;
    return statusFilter ? claims : submittedClaims;
  }, [alertIdParam, claimScope, submittedClaims, claims, statusFilter]);

  const currentUserId = String(
    (currentUser as any)?.id || (currentUser as any)?.sub || ''
  ).toLowerCase();

  const ownershipFilteredClaims = useMemo(() => {
    // Admin : pas de filtre propriété (scope all).
    if (!currentUserId || claimScope === 'all') {
      return phaseSourceClaims;
    }

    return phaseSourceClaims.filter((claim) => {
      const createdBy = String(
        (claim as any).createdById || (claim as any).CreatedById || ''
      ).toLowerCase();
      const assignedTo = String(
        (claim as any).assignedToId || (claim as any).AssignedToId || ''
      ).toLowerCase();

      // Créées par moi = je les ai créées et elles m'appartiennent (assignées à moi).
      if (claimScope === 'created') {
        return createdBy === currentUserId && assignedTo === currentUserId;
      }
      // Assignées par l'admin : à moi, mais pas créées par moi.
      if (claimScope === 'assigned') {
        return assignedTo === currentUserId && assignedTo.length > 0 && createdBy !== currentUserId;
      }
      // related / alert : créé OU assigné
      return createdBy === currentUserId || assignedTo === currentUserId;
    });
  }, [phaseSourceClaims, claimScope, currentUserId]);

  const mineOpenCount = useMemo(
    () => ownershipFilteredClaims.filter(isOpenClaim).length,
    [ownershipFilteredClaims, isOpenClaim]
  );

  const mineValidatedCount = useMemo(
    () => ownershipFilteredClaims.filter(isValidatedClaim).length,
    [ownershipFilteredClaims, isValidatedClaim]
  );

  const mineClosedCount = useMemo(
    () => ownershipFilteredClaims.filter(isClosedClaim).length,
    [ownershipFilteredClaims, isClosedClaim]
  );

  const mineRejectedCount = useMemo(
    () => ownershipFilteredClaims.filter(isRejectedClaim).length,
    [ownershipFilteredClaims, isRejectedClaim]
  );

  const mineAllCount = useMemo(
    () => ownershipFilteredClaims.length,
    [ownershipFilteredClaims]
  );

  const baseClaims = useMemo(() => {
    const matchesPhase = (claim: Claim) => {
      if (phaseView === 'all') return true;
      if (phaseView === 'validated') return isValidatedClaim(claim);
      if (phaseView === 'closed') return isClosedClaim(claim);
      if (phaseView === 'rejected') return isRejectedClaim(claim);
      return isOpenClaim(claim);
    };

    // Alert series includes every status that contributed to the volume spike.
    if (alertScope || alertIdParam) {
      return ownershipFilteredClaims;
    }

    if (phaseView === 'all') {
      return ownershipFilteredClaims;
    }

    if (claimScope !== 'all' || !statusFilter) {
      return ownershipFilteredClaims.filter(matchesPhase);
    }

    return ownershipFilteredClaims;
  }, [
    alertScope,
    alertIdParam,
    claimScope,
    statusFilter,
    phaseView,
    ownershipFilteredClaims,
    isClosedClaim,
    isOpenClaim,
    isRejectedClaim,
    isValidatedClaim,
  ]);

  const filteredClaims = useMemo(() => {
    const applySemanticOrder = (source: Claim[]): Claim[] => {
      const q = searchTerm.trim();
      if (!q) return source;
      // Keyword matches appear at once, while the semantic ranking is still being computed (or if it fails):
      // typing never empties the list.
      const fold = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const words = fold(q).split(/\s+/).filter(Boolean);
      const local = source.filter((c) => {
        const hay = fold([c.title, c.description, (c as any).defectType, c.clientId, (c as any).lotNumber, (c as any).productionLine].join(' '));
        return words.every((w) => hay.includes(w));
      });
      if (!semanticClaimIds || semanticClaimIds.length === 0) return local;
      const byId = new Map(source.map((c) => [String(c.id), c]));
      const ranked = semanticClaimIds
        .map((id) => byId.get(id))
        .filter((c): c is Claim => Boolean(c));
      const seen = new Set(ranked.map((c) => String(c.id)));
      return [...ranked, ...local.filter((c) => !seen.has(String(c.id)))];
    };

    // Alert endpoint already returns the full defect×line series.
    if (alertIdParam) {
      const searched = applySemanticOrder(baseClaims);
      const bySeverity =
        severityFilter === 'ALL'
          ? searched
          : searched.filter((c) => c.severity?.toUpperCase() === severityFilter);
      const byDate = bySeverity.filter((c) => claimMatchesDateRange(c, dateFrom, dateTo));
      return sortClaimsByDate(byDate, dateSort);
    }

    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const defectFilter = normalize(defectTypeParam);
    const lineFilter = normalize(productionLineParam);

    const fieldMatches = (value: string, filter: string) => {
      if (!filter) return true;
      if (!value) return false;
      return value === filter || value.includes(filter) || filter.includes(value);
    };

    const matchBase = (claim: Claim) => {
      const defectRaw = claim.defectType || (claim as any).defect_type || '';
      const defect = normalize(String(defectRaw));

      const matchesSeverity = severityFilter === 'ALL' || claim.severity?.toUpperCase() === severityFilter;
      const matchesDate = claimMatchesDateRange(claim, dateFrom, dateTo);
      const matchesStatus =
        claimScope === 'related' ||
        claimScope !== 'all' ||
        !statusFilter ||
        matchesStatusFilter(claim, statusFilter);
      const matchesDefect = fieldMatches(defect, defectFilter);
      return matchesSeverity && matchesStatus && matchesDefect && matchesDate;
    };

    const semanticallyOrdered = applySemanticOrder(baseClaims);

    const withLine = semanticallyOrdered.filter((claim) => {
      if (!matchBase(claim)) return false;
      if (!lineFilter) return true;
      const line = normalize(
        String((claim as any).productionLine || (claim as any).production_line || '')
      );
      return fieldMatches(line, lineFilter);
    });

    // Alert drill-down without alertId: if defect+line has no hits, fall back to defect only
    const filtered =
      alertScope && withLine.length === 0 && defectFilter && lineFilter
        ? semanticallyOrdered.filter(matchBase)
        : withLine;

    // Keep semantic ranking when searching; otherwise keep date sort.
    if (searchTerm.trim()) return filtered;
    return sortClaimsByDate(filtered, dateSort);
  }, [
    alertIdParam,
    baseClaims,
    searchTerm,
    semanticClaimIds,
    severityFilter,
    dateFrom,
    dateTo,
    dateSort,
    defectTypeParam,
    productionLineParam,
    claimScope,
    statusFilter,
    alertScope,
  ]);

  const setClaimScope = useCallback(
    (next: 'created' | 'assigned') => {
      setSelectedClaimId(null);
      const params = new URLSearchParams(location.search);
      // Keep alert drill-down context when switching tabs.
      if (next === 'assigned') {
        params.delete('scope');
        params.delete('mine');
        navigate(
          {
            pathname: '/pages/front/my-claims',
            search: params.toString(),
          },
          { replace: true }
        );
        return;
      }
      params.set('scope', 'created');
      params.delete('mine');
      navigate(
        {
          pathname: '/pages/front/quality-analyses',
          search: params.toString(),
        },
        { replace: true }
      );
    },
    [navigate, location.search]
  );

  const setPhaseView = useCallback(
    (next: 'all' | 'open' | 'validated' | 'closed' | 'rejected') => {
      const params = new URLSearchParams(location.search);
      if (claimScope === 'created') {
        params.set('scope', 'created');
        params.delete('mine');
      } else if (claimScope === 'assigned') {
        params.delete('scope');
        params.delete('mine');
      }
      params.delete('status');
      if (next === 'all') params.set('view', 'all');
      else if (next === 'validated') params.set('view', 'validated');
      else if (next === 'closed') params.set('view', 'closed');
      else if (next === 'rejected') params.set('view', 'rejected');
      else params.delete('view');
      setSelectedClaimId(null);
      const pathname =
        claimScope === 'assigned' ? '/pages/front/my-claims' : '/pages/front/quality-analyses';
      navigate({ pathname, search: params.toString() }, { replace: true });
    },
    [navigate, location.search, claimScope]
  );

  // The claim named in the URL is applied once per URL value. Re-applying it on every selection change
  // would undo the user's click on another claim in the list (the detail pane would look frozen).
  useEffect(() => {
    if (claimIdFromUrl) setSelectedClaimId(claimIdFromUrl);
  }, [claimIdFromUrl]);

  useEffect(() => {
    if (!claimIdFromUrl && selectedClaimId === null && filteredClaims.length > 0) {
      setSelectedClaimId(filteredClaims[0].id);
    }
  }, [filteredClaims, selectedClaimId, claimIdFromUrl]);

  const selectedClaim = useMemo(() => {
    if (!selectedClaimId) return filteredClaims[0] || null;
    return baseClaims.find(c => c.id === selectedClaimId)
      || claims.find(c => c.id === selectedClaimId)
      || filteredClaims[0]
      || null;
  }, [baseClaims, selectedClaimId, filteredClaims, claims]);

  useEffect(() => {
    if (autoStartHandled || !startFromUrl || !selectedClaim || loading) return;
    const status = resolveClaimStatus(selectedClaim);
    if (status === 'OUVERTE' || status === 'ASSIGNED') {
      setAutoStartHandled(true);
      setProductionModalMode('start');
      setProductionSaveError(null);
      setProductionFormData({
        productionLine: (selectedClaim as any).productionLine || '',
        shift: (selectedClaim as any).shift || '',
        analysisNotes: (selectedClaim as any).analysisNotes || '',
      });
      setIsProductionModalOpen(true);
    }
  }, [autoStartHandled, startFromUrl, selectedClaim, loading]);

  const handleClearStatusFilter = useCallback(() => {
    setSelectedClaimId(null);
    navigate(location.pathname, { replace: true });
  }, [navigate, location.pathname]);

  // ---- Production-data modal handlers ----
  const openStartAnalysisModal = useCallback(() => {
    if (!selectedClaim) return;
    setProductionModalMode('start');
    setProductionSaveError(null);
    setProductionFormData({
      productionLine: (selectedClaim as any).productionLine || (selectedClaim as any).production_line || '',
      // claim.Shift (C#) serializes as `shift` — that must be checked, not
      // just the shiftTeam/team aliases, or a value the backend actually
      // returns gets silently missed here.
      shift: (selectedClaim as any).shift || (selectedClaim as any).shiftTeam || (selectedClaim as any).shift_team || (selectedClaim as any).team || '',
      analysisNotes: (selectedClaim as any).analysisNotes || '',
    });
    setIsProductionModalOpen(true);
  }, [selectedClaim]);

  const closeProductionModal = useCallback(() => {
    setIsProductionModalOpen(false);
    setProductionSaveError(null);
  }, []);

  const handleProductionInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setProductionFormData(prev => ({ ...prev, [name]: value }));
    },
    []
  );

  // Direct simple action handler (if called directly without modal)
  const handleStartAnalysis = useCallback(async () => {
    if (!selectedClaim?.id || !accessToken) return;

    setIsSavingProduction(true);
    setProductionSaveError(null);
    try {
      await qualityAnalysisService.startAnalysis(String(selectedClaim.id), undefined, accessToken);

      // Optimistically set EN_ANALYSE state locally
      setClaims(prev =>
        prev.map(c =>
          c.id === selectedClaim.id
            ? { ...c, status: 'EN_ANALYSE', claimStatus: 'EN_ANALYSE' }
            : c
        )
      );

      await fetchClaims();
    } catch (err: any) {
      console.error("Erreur lors du passage en analyse :", err);
      setProductionSaveError(err?.response?.data?.message || i18n.t('claimsDir.startAnalysisFailed'));
    } finally {
      setIsSavingProduction(false);
    }
  }, [selectedClaim, accessToken, fetchClaims]);

  const handleSubmitProductionData = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedClaim?.id || !accessToken) return;

      setIsSavingProduction(true);
      setProductionSaveError(null);
      try {
        // Both 'start' and 'edit' go through startAnalysis: UpdateClaimCommand
        // has no ProductionLine/Shift/AnalysisNotes fields at all (they'd be
        // silently dropped by model binding), whereas StartClaimAnalysisCommand
        // already persists all three and is written to be safely re-callable —
        // it only flips OUVERTE -> EN_ANALYSE, never regresses a claim that has
        // already moved past that, so re-submitting traceability edits later is
        // safe.
        await qualityAnalysisService.startAnalysis(String(selectedClaim.id), productionFormData, accessToken);

        // Optimistic local update
        setClaims(prev =>
          prev.map(c =>
            c.id === selectedClaim.id
              ? {
                  ...c,
                  status: 'EN_ANALYSE',
                  claimStatus: 'EN_ANALYSE',
                  productionLine: productionFormData.productionLine,
                  shiftTeam: productionFormData.shift,
                  analysisNotes: productionFormData.analysisNotes,
                }
              : c
          )
        );

        await fetchClaims();
        setIsProductionModalOpen(false);
      } catch (err: any) {
        setProductionSaveError(
          err?.response?.data?.message || i18n.t('claimsDir.productionSaveFailed')
        );
      } finally {
        setIsSavingProduction(false);
      }
    },
    [selectedClaim, accessToken, productionFormData, fetchClaims]
  );

  // ---- Edit Modal Handlers ----
  const openEditModal = useCallback(() => {
    if (!selectedClaim) return;
    setSaveError(null);
    setEditFormData({
      id: selectedClaim.id,
      title: selectedClaim.title || '',
      clientId: selectedClaim.clientId || (selectedClaim as any).client_id || '',
      defectType: selectedClaim.defectType || (selectedClaim as any).defect_type || '',
      severity: selectedClaim.severity || 'Medium',
      lotNumber: selectedClaim.lotNumber || (selectedClaim as any).lot_number || '',
      serialNumber: selectedClaim.serialNumber || (selectedClaim as any).serial_number || '',
      description: selectedClaim.description || '',
      assignedToId: selectedClaim.assignedToId || '',
      assignedToName: selectedClaim.assignedToName || '',
    });
    setIsEditModalOpen(true);
  }, [selectedClaim]);

  const closeEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    setSaveError(null);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setEditFormData(prev => ({ ...prev, [name]: value }));
    },
    []
  );

  const handleSaveClaim = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedClaim?.id || !accessToken) return;

      setIsSaving(true);
      setSaveError(null);
      try {
        const command: UpdateClaimCommand = {
          id: selectedClaim.id,
          title: editFormData.title,
          clientId: editFormData.clientId,
          defectType: editFormData.defectType,
          severity: editFormData.severity,
          lotNumber: editFormData.lotNumber,
          serialNumber: editFormData.serialNumber,
          description: editFormData.description,
          updatedById: (selectedClaim as any).createdById || '00000000-0000-0000-0000-000000000000',
        };

        const response = await qualityAnalysisService.updateClaim(
          String(selectedClaim.id),
          command,
          accessToken
        );

        if (response?.success === false) {
          setSaveError(i18n.t('claimsDir.updateRefused'));
          return;
        }

        const nextAssigneeId = (editFormData.assignedToId || '').trim() || null;
        const prevAssigneeId = (selectedClaim.assignedToId || '').trim() || null;
        if (canAssign && nextAssigneeId !== prevAssigneeId) {
          const assignee = assignableUsers.find((u) => u.id === nextAssigneeId);
          await qualityAnalysisService.assignClaim(
            String(selectedClaim.id),
            {
              assignedToId: nextAssigneeId,
              assignedToName: assignee?.label ?? editFormData.assignedToName ?? null,
            },
            accessToken
          );
        }

        const updatedClaim = { ...selectedClaim, ...editFormData } as Claim;
        setClaims(prev => prev.map(c => (c.id === updatedClaim.id ? updatedClaim : c)));
        setSelectedClaimId(updatedClaim.id);
        setIsEditModalOpen(false);

        await fetchClaims();
      } catch (err: any) {
        setSaveError(err?.response?.data?.message || i18n.t('claimsDir.updateFailed'));
      } finally {
        setIsSaving(false);
      }
    },
    [selectedClaim, editFormData, accessToken, fetchClaims, canAssign, assignableUsers]
  );

  const [applyingDeadline, setApplyingDeadline] = useState(false);
  const [deadlineApplyError, setDeadlineApplyError] = useState<string | null>(null);

  const applySuggestedDeadline = useCallback(
    async (claimId: string, deadlineIso: string) => {
      if (!accessToken) return;
      setApplyingDeadline(true);
      setDeadlineApplyError(null);
      try {
        await qualityAnalysisService.setClaimDeadline(claimId, deadlineIso, accessToken);
        setClaims((prev) =>
          prev.map((c) =>
            String(c.id) === String(claimId)
              ? { ...c, deadline: deadlineIso }
              : c
          )
        );
      } catch (err: any) {
        setDeadlineApplyError(
          err?.response?.data?.message || i18n.t('claimsDir.deadlineFailed')
        );
      } finally {
        setApplyingDeadline(false);
      }
    },
    [accessToken]
  );

  return {
    // list + filters
    claims: filteredClaims,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    severityFilter,
    setSeverityFilter,
    dateSort,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    statusFilter,
    handleClearStatusFilter,

    // selection
    selectedClaim,
    setSelectedClaimId,

    // creator name resolution
    resolveCreatorName,

    // start analysis (direct + backward compatibility)
    handleStartAnalysis,
    isStartingAnalysis: isSavingProduction,
    startAnalysisError: productionSaveError,

    // production-data modal
    isProductionModalOpen,
    productionModalMode,
    productionFormData,
    isSavingProduction,
    productionSaveError,
    openStartAnalysisModal,
    closeProductionModal,
    handleProductionInputChange,
    handleSubmitProductionData,

    // edit modal
    isEditModalOpen,
    editFormData,
    isSaving,
    saveError,
    openEditModal,
    closeEditModal,
    handleInputChange,
    handleSaveClaim,
    canAssign,
    assignableUsers,
    applySuggestedDeadline,
    applyingDeadline,
    deadlineApplyError,

    // misc
    mineOnly,
    assignedOnly,
    alertScope,
    claimScope,
    setClaimScope,
    currentUserId,
    phaseView,
    setPhaseView,
    mineOpenCount,
    mineValidatedCount,
    mineClosedCount,
    mineRejectedCount,
    mineAllCount,
    refetch: fetchClaims,
  };
};