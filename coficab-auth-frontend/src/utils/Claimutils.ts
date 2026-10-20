import { FileText, Clock, GitFork, Hourglass, UserCheck } from 'lucide-react';
import i18n from '../i18n';

export function resolveClaimStatus(claim: any): string {
  if (!claim) return 'DRAFT';
  // Claim.StatusCode is the workflow source of truth. Nested 5-Why status
  // (often still DRAFT while the claim is EN_ANALYSE / CLOTUREE) must never
  // override it.
  const candidates = [
    claim.statusCode,
    claim.status,
    claim.statut,
    claim.StatusCode,
  ].filter(Boolean).map(s => String(s).trim().toUpperCase());

  const pendingKeywords = ['PENDING_VALIDATION', 'PENDING', 'SUBMITTED', 'EN_ATTENTE', 'EN ATTENTE'];

  for (const c of candidates) {
    if (c.includes('BROUILLON') || c === 'DRAFT') {
      return 'DRAFT';
    }
    if (c.includes('ASSIGNED') || c.includes('ASSIGNE') || c.includes('ASSIGNÉ')) {
      return 'ASSIGNED';
    }
    if (c.includes('OUVERTE') || c.includes('OUVERT') || c.includes('OPEN')) {
      return 'OUVERTE';
    }
    if (c === 'EN_ANALYSE' || c === 'IN_ANALYSIS' || c.includes('EN_ANALYSE')) {
      return 'EN_ANALYSE';
    }
    if (c.includes('CLOTUREE') || c.includes('CLOSED') || c.includes('CLOTUR')) {
      return 'CLOTUREE';
    }
    if (pendingKeywords.some(k => c.includes(k))) {
      return 'PENDING_VALIDATION';
    }
    if (c.includes('VALIDAT') || c.includes('VALIDE')) {
      return 'VALIDATED';
    }
    if (c.includes('REJECT') || c.includes('REJET')) {
      return 'REJECTED';
    }
  }

  return candidates[0] || 'OUVERTE';
}

// Matches a claim against a raw status value coming from the URL
// (?status=IN_ANALYSIS, ?status=VALIDATED, etc.). Unlike resolveClaimStatus
// — which only distinguishes DRAFT vs PENDING_VALIDATION for the list
// page's default view — this checks the claim's raw status fields directly,
// so any status value the backend produces can be deep-linked to without
// the frontend needing to know about it in advance.
export function matchesStatusFilter(claim: any, statusFilter: string | null): boolean {
  if (!statusFilter) return true;
  let target = statusFilter.trim().toUpperCase();
  if (target === 'IN_ANALYSIS' || target === 'INANALYSIS') target = 'EN_ANALYSE';
  if (target === 'ASSIGNEE' || target === 'ASSIGNÉE') target = 'ASSIGNED';
  const resolved = resolveClaimStatus(claim);
  if (resolved === target || resolved.includes(target) || target.includes(resolved)) return true;
  const candidates = [
    claim?.fiveWhyAnalysis?.statusCode,
    claim?.fiveWhyAnalysis?.status,
    claim?.fiveWhyAnalysis?.statut,
    claim?.statusCode,
    claim?.status,
    claim?.statut,
  ].filter(Boolean).map((s: any) => String(s).trim().toUpperCase());

  return candidates.some((c) => c === target || c.includes(target));
}

export function getStatusBadge(rawStatus?: string) {
  const s = rawStatus?.trim().toUpperCase() || '';

  if (s === 'OUVERTE' || s.includes('OPEN') || s === 'OUVERT') {
    return {
      icon: FileText,
      color: '#2563eb',
      bg: 'rgba(59, 130, 246, 0.12)',
      border: 'rgba(37, 99, 235, 0.3)',
      label: i18n.t('claimStatus.open'),
    };
  }

  if (s === 'ASSIGNED' || s.includes('ASSIGNE') || s.includes('ASSIGNÉ')) {
    return {
      icon: UserCheck,
      color: '#000168',
      bg: 'rgba(0, 1, 104, 0.08)',
      border: 'rgba(0, 1, 104, 0.25)',
      label: i18n.t('claimStatus.assigned'),
    };
  }

  if (s === 'EN_ANALYSE' || s === 'IN_ANALYSIS') {
    return {
      icon: GitFork,
      color: '#0891b2',
      bg: 'rgba(6, 182, 212, 0.12)',
      border: 'rgba(8, 145, 178, 0.3)',
      label: i18n.t('claimStatus.inAnalysis'),
    };
  }

  if (s === 'PENDING_VALIDATION' || s.includes('PENDING') || s.includes('ATTENTE')) {
    return {
      icon: Hourglass,
      color: '#d97706',
      bg: 'rgba(251, 191, 36, 0.12)',
      border: 'rgba(245, 158, 11, 0.3)',
      label: i18n.t('claimStatus.pendingValidation'),
    };
  }

  if (s === 'VALIDATED' || s.includes('VALIDE')) {
    return {
      icon: UserCheck,
      color: '#059669',
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(5, 150, 105, 0.3)',
      label: i18n.t('claimStatus.validated'),
    };
  }

  if (s === 'CLOTUREE' || s === 'CLOSED' || s.includes('CLOTUR')) {
    return {
      icon: Clock,
      color: '#475569',
      bg: 'rgba(100, 116, 139, 0.12)',
      border: 'rgba(100, 116, 139, 0.35)',
      label: i18n.t('claimStatus.closed'),
    };
  }

  if (s.includes('REJECT') || s.includes('REJET')) {
    return {
      icon: Clock,
      color: '#b91c1c',
      bg: 'rgba(239, 68, 68, 0.1)',
      border: 'rgba(185, 28, 28, 0.3)',
      label: i18n.t('claimStatus.rejected'),
    };
  }

  if (s === 'DRAFT' || s.includes('BROUILLON')) {
    return {
      icon: Clock,
      color: '#64748b',
      bg: 'rgba(241, 245, 249, 0.8)',
      border: '#cbd5e1',
      label: i18n.t('claimStatus.draft'),
    };
  }

  return {
    icon: Clock,
    color: '#64748b',
    bg: 'rgba(241, 245, 249, 0.8)',
    border: '#cbd5e1',
    label: s || i18n.t('claimStatus.unknown'),
  };
}

/** Libellé métier du statut 5 Why — distinct du brouillon de réclamation. */
export function getFiveWhyStatusMeta(raw?: string | null) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) {
    return {
      code: 'NONE',
      label: i18n.t('claimStatus.fiveWhyNone'),
      hint: i18n.t('claimStatus.fiveWhyNoneHint'),
      color: '#64748b',
      bg: '#f8fafc',
      border: '#e2e8f0',
    };
  }
  if (s === 'DRAFT' || s.includes('BROUILLON')) {
    return {
      code: 'DRAFT',
      label: i18n.t('claimStatus.fiveWhyDraft'),
      hint: i18n.t('claimStatus.fiveWhyDraftHint'),
      color: '#b45309',
      bg: '#fffbeb',
      border: '#fcd34d',
    };
  }
  if (s.includes('PENDING') || s.includes('ATTENTE')) {
    return {
      code: 'PENDING_VALIDATION',
      label: i18n.t('claimStatus.fiveWhyPending'),
      hint: i18n.t('claimStatus.fiveWhyPendingHint'),
      color: '#d97706',
      bg: 'rgba(251, 191, 36, 0.12)',
      border: 'rgba(245, 158, 11, 0.3)',
    };
  }
  if (s === 'VALIDATED' || s.includes('VALIDE')) {
    return {
      code: 'VALIDATED',
      label: i18n.t('claimStatus.fiveWhyValidated'),
      hint: i18n.t('claimStatus.fiveWhyValidatedHint'),
      color: '#059669',
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(5, 150, 105, 0.3)',
    };
  }
  if (s.includes('REJET') || s === 'REJECTED') {
    return {
      code: 'REJECTED',
      label: i18n.t('claimStatus.fiveWhyRejected'),
      hint: i18n.t('claimStatus.fiveWhyRejectedHint'),
      color: '#b91c1c',
      bg: 'rgba(239, 68, 68, 0.12)',
      border: 'rgba(185, 28, 28, 0.3)',
    };
  }
  return {
    code: s,
    label: s,
    hint: i18n.t('claimStatus.fiveWhyTechnical', { status: s }),
    color: '#475569',
    bg: '#f1f5f9',
    border: '#cbd5e1',
  };
}

export function getEightDStatusMeta(raw?: string | null, step?: number | null) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) {
    return { label: i18n.t('claimStatus.eightDNone'), color: '#64748b' };
  }
  if (s === 'CLOSED' || s.includes('CLOTUR') || s === 'VALIDATED' || s.includes('VALIDE')) {
    return { label: i18n.t('claimStatus.eightDClosed'), color: '#0f2b5c' };
  }
  const stepLabel = step && step >= 1 ? `D${step}` : null;
  const status =
    s === 'IN_PROGRESS' || s.includes('PROGRESS') ? i18n.t('claimStatus.eightDInProgress')
    : s.includes('PENDING') ? i18n.t('claimStatus.eightDPending')
    : s === 'REJECTED' || s.includes('REJET') ? i18n.t('claimStatus.fiveWhyRejected')
    : s;
  return { label: stepLabel ? `${stepLabel} · ${status}` : status, color: '#0f2b5c' };
}

export function getSeverityStyle(severity?: string) {
  switch (severity?.trim().toUpperCase()) {
    case 'CRITICAL':
      return { color: '#e11d48', bg: 'rgba(243, 24, 82, 0.1)', border: 'rgba(243, 24, 82, 0.25)', label: i18n.t('claimStatus.severityCritical') };
    case 'HIGH':
      return { color: '#ea580c', bg: 'rgba(234, 88, 12, 0.1)', border: 'rgba(234, 88, 12, 0.25)', label: i18n.t('claimStatus.severityHigh') };
    case 'MEDIUM':
      return { color: '#d97706', bg: 'rgba(217, 119, 6, 0.1)', border: 'rgba(217, 119, 6, 0.25)', label: i18n.t('claimStatus.severityMedium') };
    default:
      return { color: '#0284c7', bg: 'rgba(2, 132, 199, 0.1)', border: 'rgba(2, 132, 199, 0.25)', label: i18n.t('claimStatus.severityLow') };
  }
}

// Reads production-line/shift traceability info from whichever field the
// backend happens to populate on the claim (or a nested production/
// traceability payload). No hardcoded values — unresolved fields fall back
// to 'N/A', same convention as the rest of the detail panel.
export function resolveTraceability(claim: any): { line: string; team: string } | null {
  if (!claim) return null;
  const prod = claim.productionData || claim.production || claim.traceability || {};

  const line =
    claim.productionLine ||
    claim.production_line ||
    claim.workstation ||
    claim.poste ||
    claim.posteLigne ||
    prod.line ||
    prod.workstation ||
    prod.poste ||
    null;

  const team =
    claim.shiftTeam ||
    claim.shift_team ||
    claim.equipe ||
    claim.team ||
    prod.team ||
    prod.equipe ||
    prod.shiftTeam ||
    null;

  const shiftDateRaw =
    claim.shiftDate ||
    claim.shift_date ||
    prod.shiftDate ||
    prod.date ||
    null;

  const shiftDate = shiftDateRaw ? new Date(shiftDateRaw) : null;
  const shiftDateLabel =
    shiftDate && !isNaN(shiftDate.getTime()) ? shiftDate.toLocaleDateString() : (shiftDateRaw || null);

  return {
    line: line || 'N/A',
    team: team && shiftDateLabel ? `${team} (${shiftDateLabel})` : (team || 'N/A'),
  };
}