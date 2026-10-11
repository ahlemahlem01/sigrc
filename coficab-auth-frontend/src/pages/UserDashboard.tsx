import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ListSkeleton } from '../components/TableSkeleton';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UserAvatar from '../components/UserAvatar';
import { ClaimDateSortSelect } from '../components/ClaimDateSortSelect';
import { getUserActionPlans } from '../services/actionPlanService';
import { qualityAnalysisService } from '../services/qualityAnalysisService';
import type { Claim } from '../types/qualityAnalysis';
import { getStatusBadge, resolveClaimStatus } from '../utils/Claimutils';
import {
  ClaimDateSort,
  DEFAULT_CLAIM_DATE_SORT,
  sortClaimsByDate,
} from '../utils/claimDateSort';
import { getUserBadges } from '../services/badgeService';
import { computeEarnedBadges, mergeBadges, BADGE_DEFINITIONS, BadgeDto } from '../utils/badges';
import { getMyDocuments, downloadDocument, toggleFavorite, DocumentDto } from '../services/documentService';
import { useNotifications } from '../hooks/useNotifications';


// ── Inline Icons ──
const IconCheck = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
const IconClock = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IconHistory = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IconTrophy = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>;
const IconBrain = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.04z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.04z"/></svg>;
const IconChart = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
const IconFile = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
const IconFileText = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
const IconDownload = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IconStar = ({ filled }: { filled: boolean }) => <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const IconSearch = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IconFilePdf = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15v-4"/><path d="M12 15v-4"/><path d="M15 15v-4"/></svg>;
const IconFileWord = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
const IconFileExcel = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>;
const IconFileImage = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
const IconQuality = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>;

// ── Types ──
interface AssignedPlan {
  id: string;
  title: string;
  status: number;
  progress: number;
  deadline?: string;
}

interface SkillDto {
  name: string;
  level: number;
  plansCompleted: number;
}

// Types pour le module Qualité (Analyse des causes racines : 5-Why / Ishikawa)
interface QualityActivity {
  id: string;
  claimNumber: string;
  message: string;
  timestamp: string;
  type: 'APPROVAL' | 'FEEDBACK' | 'ASSIGNMENT';
}

// ── Constants ──
const STATUS_MAP: Record<number, { label: string; color: string; bg: string; border: string }> = {
  0: { label: 'Brouillon',  color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  1: { label: 'Actif',      color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd' },
  2: { label: 'En pause',   color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' },
  3: { label: 'Terminé',    color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
  4: { label: 'Archivé',    color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' },
};

const getFileIcon = (type: string) => {
  const t = type.toUpperCase();
  if (t === 'PDF') return <IconFilePdf />;
  if (['DOC', 'DOCX'].includes(t)) return <IconFileWord />;
  if (['XLS', 'XLSX'].includes(t)) return <IconFileExcel />;
  if (['IMG', 'JPG', 'JPEG', 'PNG'].includes(t)) return <IconFileImage />;
  return <IconFileText />;
};

const getFileColor = (type: string): string => {
  const t = type.toUpperCase();
  if (t === 'PDF') return '#dc2626';
  if (['DOC', 'DOCX'].includes(t)) return '#2563eb';
  if (['XLS', 'XLSX'].includes(t)) return '#16a34a';
  if (['IMG', 'JPG', 'JPEG', 'PNG'].includes(t)) return '#8b5cf6';
  return '#64748b';
};

export default function UserDashboard() {
  const { user, accessToken } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<AssignedPlan[]>([]);
  const [dbBadges, setDbBadges] = useState<any[]>([]);
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [docLoading, setDocLoading] = useState(true);
  const [docSearch, setDocSearch] = useState('');
  const [docFilterFav, setDocFilterFav] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { notifications, markAsRead } = useNotifications();
  const recognitionNotes = notifications.filter((n) => n.type === 'recognition_podium').slice(0, 3);

  // ── Module Qualité : mes réclamations assignées ──
  const [assignedClaims, setAssignedClaims] = useState<Claim[]>([]);
  const [assignedClaimsLoading, setAssignedClaimsLoading] = useState(true);
  const [claimDateSort, setClaimDateSort] = useState<ClaimDateSort>(DEFAULT_CLAIM_DATE_SORT);

  const [qualityActivities] = useState<QualityActivity[]>([]);

  const qualityMetrics = {
    inProgress: assignedClaims.filter((c) => {
      const s = resolveClaimStatus(c);
      return s === 'ASSIGNED' || s === 'OUVERTE' || s === 'EN_ANALYSE';
    }).length,
    pendingReview: assignedClaims.filter((c) => resolveClaimStatus(c) === 'PENDING_VALIDATION').length,
    closed: assignedClaims.filter((c) => {
      const s = resolveClaimStatus(c);
      return s === 'CLOTUREE' || s === 'VALIDATED';
    }).length,
    total: assignedClaims.length,
  };

  const sortedAssignedClaims = useMemo(
    () => sortClaimsByDate(assignedClaims, claimDateSort),
    [assignedClaims, claimDateSort]
  );

  const displayName = (user as any)?.name || (user as any)?.fullName || 'Utilisateur';

  // ── Data fetching ──────────────────────────────────────────────────
  const loadPlans = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await getUserActionPlans(accessToken);
      setPlans(res.data ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  const loadAssignedClaims = useCallback(async () => {
    if (!accessToken) return;
    setAssignedClaimsLoading(true);
    try {
      const rows = await qualityAnalysisService.getMyAssignedClaims(accessToken);
      setAssignedClaims(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error(e);
      setAssignedClaims([]);
    } finally {
      setAssignedClaimsLoading(false);
    }
  }, [accessToken]);

  const loadBadges = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await getUserBadges(accessToken);
      setDbBadges(res.data ?? []);
    } catch (e) {
      console.error(e);
      setDbBadges([]);
    }
  }, [accessToken]);

  const loadDocuments = useCallback(async () => {
    if (!accessToken) return;
    try {
      setDocLoading(true);
      const res = await getMyDocuments(accessToken);
      setDocuments(res.data ?? []);
    } catch (e) {
      console.error('Failed to load documents:', e);
      setDocuments([]);
    } finally {
      setDocLoading(false);
    }
  }, [accessToken]);

  // Initial load
  useEffect(() => { loadPlans(); }, [loadPlans]);
  useEffect(() => { loadBadges(); }, [loadBadges]);
  useEffect(() => { loadDocuments(); }, [loadDocuments]);
  useEffect(() => { loadAssignedClaims(); }, [loadAssignedClaims]);

  // Re-fetch when tab regains focus
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { loadPlans(); loadBadges(); loadDocuments(); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [loadPlans, loadBadges, loadDocuments]);

  // ── Document handlers ───────────────────────────────────────────────
  const handleDocDownload = async (doc: DocumentDto) => {
    if (!accessToken || downloadingId) return;
    setDownloadingId(doc.id);
    try {
      const blob = await downloadDocument(doc.id, accessToken);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      loadDocuments();
    } catch (e) {
      alert('Échec du téléchargement');
    } finally {
      setDownloadingId(null);
    }
  };

const handleDocToggleFavorite = async (id: string) => {
  if (!accessToken) return;
  try {
    const { isFavorite } = await toggleFavorite(id, accessToken);
    setDocuments(prev =>
      prev.map(d => (d.id === id ? { ...d, isFavorite } : d))
    );
  } catch (e) {
    console.error('Failed to toggle favorite:', e);
  }
};
  // ── Derived metrics ────────────────────────────────────────────────
  const now = new Date();

  const activePlans    = plans.filter(p => p.status === 1 || p.status === 2);
  const completedPlans = plans.filter(p => p.status === 3);
  const overduePlans   = plans.filter(p => {
    if (!p.deadline || p.status === 3) return false;
    return new Date(p.deadline) < now;
  });

  const avgProgress = plans.length > 0
    ? Math.round(plans.reduce((sum, p) => sum + (p.progress ?? 0), 0) / plans.length)
    : 0;

  const onTimeRate = plans.length > 0
    ? Math.round(((plans.length - overduePlans.length) / plans.length) * 100)
    : 0;

  const fastCompletions = plans.filter(
    p => p.status === 3 && p.deadline && new Date(p.deadline) > now
  ).length;

  // ── Documents filtered ────────────────────────────────────────────
  const filteredDocs = documents
    .filter(d => !docFilterFav || d.isFavorite)
    .filter(d => d.name.toLowerCase().includes(docSearch.toLowerCase()));

  // ── Badge computation (calculés côté client + badges DB fusionnés) ─
  const computedBadges = computeEarnedBadges(plans);
  const earnedBadges: BadgeDto[] = mergeBadges(computedBadges, dbBadges);

  // Next badge : première définition pas encore dans earnedBadges
  const nextBadge = BADGE_DEFINITIONS.find(
    def => !earnedBadges.some(b => b.id === def.id)
  );

  // ── Skills (derived from real plan data) ───────────────────────────
  // Each skill is deliberately based on a DIFFERENT slice of the data so that
  // completing every plan doesn't automatically saturate every skill to 100%.
  const skills: SkillDto[] = (() => {
    if (plans.length === 0) return [];

    const total      = plans.length;
    const completed  = completedPlans.length;
    const active     = activePlans.length;
    const notStarted = plans.filter(p => p.status === 0).length;
    const startedCount = total - notStarted;

    // 1. Gestion de Projet — volume/expérience : combien de plans ont été gérés au total.
    //    Ne dépend PAS du statut (terminé ou non) : reflète la charge de travail portée,
    //    donc ne grimpe pas juste parce que tout est terminé. Plafond fixé à 12 plans.
    const workloadLevel = Math.min(100, Math.round((total / 12) * 100));

    // 2. Analyse & Diagnostic — taux d'engagement : proportion de plans réellement démarrés
    //    (ni laissés en brouillon). Indépendant du fait qu'ils soient finis ou non.
    const engagementLevel = Math.min(100, Math.round((startedCount / total) * 100));

    // 3. Exécution & Suivi — avancement des plans EN COURS uniquement. Les plans déjà
    //    terminés sont exclus (ils sont toujours à 100% et fausseraient la mesure).
    //    S'il n'y a aucun plan actif, on se base sur le taux de respect des délais passé
    //    (onTimeRate) plutôt que de retomber sur un simple pourcentage de complétion.
    const executionLevel = active > 0
      ? Math.round(activePlans.reduce((sum, p) => sum + (p.progress ?? 0), 0) / active)
      : onTimeRate;

    // 4. Clôture & Reporting — qualité de clôture : proportion des plans terminés qui l'ont
    //    été AVANT l'échéance (rapidité/anticipation), pas simplement "combien sont finis".
    const closureLevel = completed > 0
      ? Math.round((fastCompletions / completed) * 100)
      : 0;

    return [
      { name: 'Gestion de Projet',    level: workloadLevel,   plansCompleted: completed },
      { name: 'Analyse & Diagnostic', level: engagementLevel, plansCompleted: startedCount },
      { name: 'Exécution & Suivi',    level: executionLevel,  plansCompleted: active },
      { name: 'Clôture & Reporting',  level: closureLevel,    plansCompleted: completed },
    ].sort((a, b) => b.level - a.level);
  })();

  const lowestSkill = [...skills].sort((a, b) => a.level - b.level)[0];
  // Only worth recommending improvement if there's genuine room to grow.
  const SKILL_RECOMMENDATION_THRESHOLD = 95;
  const hasSkillGap = !!lowestSkill && lowestSkill.level < SKILL_RECOMMENDATION_THRESHOLD;

  // ── Helpers ────────────────────────────────────────────────────────
  const getDaysRemaining = (deadline: string) =>
    Math.ceil((new Date(deadline).getTime() - now.getTime()) / 86_400_000);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

  const upcomingDeadlines = [...plans]
    .filter(p => p.status !== 3 && p.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 3);

  const openClaim = (claimId: string, start = false) =>
    navigate(
      `/pages/front/quality-analyses?mine=1&claimId=${encodeURIComponent(claimId)}${start ? '&start=1' : ''}`
    );

  const claimCanStart = (claim: Claim) => {
    const s = resolveClaimStatus(claim);
    return s === 'ASSIGNED' || s === 'OUVERTE';
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.9.0/dist/tabler-icons.min.css');

        :root {
          --navy: #000168; --navy-mid: #00009e; --navy-light: #eef2ff;
          --accent: #0066cc; --white: #ffffff; --bg: #f4f6fb;
          --border: #e4e8f2; --border2: #f0f2f8; --text: #0d1340;
          --text2: #374151; --muted: #64748b; --subtle: #94a3b8;
          --font-head: Inter, sans-serif; --font-body: 'Inter', sans-serif;
        }

        .ud-wrap { font-family: var(--font-body); max-width: 1200px; margin: 0 auto; min-height: 100dvh; padding-bottom: 40px; }
        html, body { overflow-y: auto; height: auto; min-height: 100%; }

        .ud-welcome { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; padding: 20px 24px; background: #fff; border: 1px solid #e4e8f2; border-radius: 16px; }
        .ud-welcome-profile {
          display: flex; align-items: center; gap: 16px; flex: 1; min-width: 0;
          border: none; background: none; padding: 0; cursor: pointer; text-align: left; font: inherit;
        }
        .ud-welcome-profile:hover .ud-welcome-cta { color: #00009e; }
        .ud-welcome-cta { font-size: 12px; font-weight: 650; color: #000168; margin-top: 6px; }
        .ud-recog {
          margin: -12px 0 24px; padding: 14px 16px; border-radius: 14px;
          background: linear-gradient(180deg, #f8faff 0%, #fff 100%);
          border: 1px solid #c7d2fe;
        }
        .ud-recog-item { padding: 8px 0; border-bottom: 1px solid #eef2ff; }
        .ud-recog-item:last-child { border-bottom: none; padding-bottom: 0; }
        .ud-recog-item:first-child { padding-top: 0; }
        .ud-recog-title { font-size: 13px; font-weight: 750; color: #000168; margin: 0 0 4px; }
        .ud-recog-msg { font-size: 12.5px; color: #475569; margin: 0; line-height: 1.45; }
        .ud-avatar { flex-shrink: 0; }
        .ud-welcome-text h1 { font-size: 20px; font-weight: 700; color: #0d1340; margin: 0 0 4px; }
        .ud-welcome-text p { font-size: 13px; color: #64748b; margin: 0; }

        .ud-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
        .ud-stat-card { background: #fff; border: 1px solid #e4e8f2; border-radius: 14px; padding: 20px; border-top: 3px solid #000168; }
        .ud-stat-value { font-size: 28px; font-weight: 700; color: #000168; margin-bottom: 4px; }
        .ud-stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }

        .ud-grid { display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; }

        .ud-section { background: #fff; border: 1px solid #e4e8f2; border-radius: 16px; padding: 20px; margin-bottom: 20px; }
        .ud-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .ud-section-title { font-size: 14px; font-weight: 700; color: #0d1340; }
        .ud-section-link { font-size: 12px; color: #000168; font-weight: 600; cursor: pointer; text-decoration: none; }
        .ud-section-link:hover { text-decoration: underline; }

        .ud-plan-item { display: flex; align-items: center; gap: 14px; padding: 14px 0; border-bottom: 1px solid #f0f2f8; cursor: pointer; transition: background .15s; }
        .ud-plan-item:last-child { border-bottom: none; }
        .ud-plan-item:hover { background: #fafbff; border-radius: 8px; padding-left: 6px; padding-right: 6px; margin: 0 -6px; }
        .ud-plan-icon { width: 40px; height: 40px; border-radius: 10px; background: #eef2ff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ud-plan-icon i { font-size: 18px; color: #000168; }
        .ud-plan-info { flex: 1; min-width: 0; }
        .ud-plan-title { font-size: 13px; font-weight: 600; color: #0d1340; margin-bottom: 2px; }
        .ud-plan-meta { font-size: 11px; color: #94a3b8; }
        .ud-plan-progress { display: flex; align-items: center; gap: 10px; min-width: 100px; }
        .ud-plan-bar { flex: 1; height: 6px; background: #f0f2f8; border-radius: 3px; overflow: hidden; }
        .ud-plan-bar-fill { height: 100%; background: #000168; border-radius: 3px; transition: width .3s; }
        .ud-plan-pct { font-size: 12px; font-weight: 700; color: #000168; min-width: 32px; text-align: right; }

        .ud-status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }

        .ud-dl-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f0f2f8; cursor: pointer; }
        .ud-dl-item:last-child { border-bottom: none; }
        .ud-dl-urgency { width: 40px; height: 40px; border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0; }
        .ud-dl-urgency span { font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
        .ud-dl-info { flex: 1; min-width: 0; }
        .ud-dl-title { font-size: 12px; font-weight: 600; color: #0d1340; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ud-dl-date { font-size: 10px; color: #94a3b8; margin-top: 2px; }
        .ud-dl-pill { padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; flex-shrink: 0; }

        .ud-badge-grid { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
        .ud-badge { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 22px; cursor: default; transition: transform .2s, box-shadow .2s; position: relative; }
        .ud-badge:hover { transform: translateY(-3px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        .ud-badge-tooltip { position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%) scale(0.9); background: #0d1340; color: #fff; padding: 6px 10px; border-radius: 8px; font-size: 10px; font-weight: 500; white-space: nowrap; opacity: 0; visibility: hidden; transition: all .2s; pointer-events: none; z-index: 10; }
        .ud-badge:hover .ud-badge-tooltip { opacity: 1; visibility: visible; transform: translateX(-50%) scale(1); }
        .ud-badge-empty { padding: 20px 0 8px; text-align: center; color: #94a3b8; font-size: 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .ud-next-badge { margin-top: 14px; padding: 10px 14px; background: #f8f9fc; border-radius: 10px; font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 8px; }

        .ud-performance { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 16px; }
        .ud-perf-item { text-align: center; padding: 16px; background: #f8f9fc; border-radius: 12px; }
        .ud-perf-value { font-size: 22px; font-weight: 700; color: #0d1340; margin-bottom: 4px; }
        .ud-perf-value.green  { color: #16a34a; }
        .ud-perf-value.blue   { color: #3b82f6; }
        .ud-perf-value.orange { color: #f59e0b; }
        .ud-perf-value.purple { color: #8b5cf6; }
        .ud-perf-label { font-size: 11px; color: #64748b; }

        .ud-skills-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .ud-skill-item { padding: 14px 0; border-bottom: 1px solid #f0f2f8; }
        .ud-skill-item:last-child { border-bottom: none; }
        .ud-skill-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .ud-skill-name { font-size: 13px; font-weight: 600; color: #0d1340; }
        .ud-skill-level { font-size: 12px; font-weight: 700; color: #000168; }
        .ud-skill-bar { height: 6px; background: #f0f2f8; border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
        .ud-skill-fill { height: 100%; background: #000168; border-radius: 3px; transition: width .4s ease; }
        .ud-skill-plans { font-size: 10px; color: #94a3b8; }
        .ud-skill-rec { margin-top: 16px; padding: 14px 16px; background: #f0fdf4; border-radius: 10px; border-left: 3px solid #16a34a; }
        .ud-skill-rec h4 { font-size: 12px; font-weight: 700; color: #15803d; margin: 0 0 4px 0; }
        .ud-skill-rec p { font-size: 11px; color: #166534; margin: 0; line-height: 1.5; }

        .ud-rank-item { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f0f2f8; }
        .ud-rank-item:last-child { border-bottom: none; }
        .ud-rank-num { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
        .ud-rank-num.gold   { background: #fef3c7; color: #f59e0b; }
        .ud-rank-num.silver { background: #f3f4f8; color: #6b7280; }
        .ud-rank-num.bronze { background: #f8f9fc; color: #9ca3af; }

        .ud-timeline { position: relative; padding-left: 24px; }
        .ud-timeline::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; width: 2px; background: #e4e8f2; }
        .ud-tl-item { position: relative; padding-bottom: 20px; }
        .ud-tl-dot { position: absolute; left: -24px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 2px solid #000168; }
        .ud-tl-dot.completed { border-color: #16a34a; background: #f0fdf4; }
        .ud-tl-content { display: flex; flex-direction: column; gap: 2px; }
        .ud-tl-title { font-size: 12px; font-weight: 600; color: #0d1340; }
        .ud-tl-meta { font-size: 11px; color: #94a3b8; }

        .ud-progress-wrap { padding: 16px 0; }
        .ud-progress-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .ud-progress-label { font-size: 13px; color: #64748b; }
        .ud-progress-value { font-size: 18px; font-weight: 700; color: #000168; }
        .ud-progress-bar { height: 10px; background: #f0f2f8; border-radius: 5px; overflow: hidden; }
        .ud-progress-bar-fill { height: 100%; background: #000168; border-radius: 5px; transition: width .4s; }

        .ud-empty { padding: 32px; text-align: center; color: #94a3b8; font-size: 13px; }
        .ud-empty i { font-size: 32px; display: block; margin-bottom: 8px; opacity: 0.4; }

        /* ── DOCUMENTS SECTION STYLES ── */
        .ud-doc-section { }
        .ud-doc-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .ud-doc-search { position: relative; flex: 1; }
        .ud-doc-search svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--subtle); }
        .ud-doc-search input { width: 100%; padding: 8px 10px 8px 32px; border: 1px solid var(--border); border-radius: 8px; font-size: 12px; font-family: var(--font-body); background: #f8f9fc; color: var(--text); outline: none; transition: all .2s; }
        .ud-doc-search input:focus { border-color: var(--navy); background: #fff; box-shadow: 0 0 0 3px rgba(0,1,104,0.06); }
        .ud-doc-search input::placeholder { color: var(--subtle); }
        .ud-doc-fav-btn { display: flex; align-items: center; gap: 4px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border); background: #f8f9fc; font-size: 11px; font-weight: 600; color: var(--muted); cursor: pointer; transition: all .2s; font-family: var(--font-body); }
        .ud-doc-fav-btn:hover { border-color: #f59e0b; color: #f59e0b; background: #fef3c7; }
        .ud-doc-fav-btn.active { background: #fef3c7; border-color: #f59e0b; color: #f59e0b; }

        .ud-doc-list { display: flex; flex-direction: column; gap: 8px; }
        .ud-doc-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: #f8f9fc; border-radius: 10px; border: 1px solid transparent; transition: all .2s; }
        .ud-doc-item:hover { background: #fff; border-color: var(--border); box-shadow: 0 2px 8px rgba(0,1,104,0.06); }
        .ud-doc-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .ud-doc-icon svg { width: 18px; height: 18px; }
        .ud-doc-info { flex: 1; min-width: 0; }
        .ud-doc-name { font-size: 12px; font-weight: 600; color: var(--text); margin: 0 0 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ud-doc-meta { font-size: 10px; color: var(--subtle); }
        .ud-doc-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .ud-doc-action { width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; transition: all .2s; }
        .ud-doc-action-fav { background: transparent; color: var(--subtle); }
        .ud-doc-action-fav:hover { background: #fef3c7; color: #f59e0b; }
        .ud-doc-action-fav.active { color: #f59e0b; }
        .ud-doc-action-fav.active:hover { background: #fef2f2; color: #dc2626; }
        .ud-doc-action-dl { background: var(--navy-light); color: var(--navy); }
        .ud-doc-action-dl:hover { background: var(--navy); color: #fff; }
        .ud-doc-action-dl:disabled { opacity: 0.5; cursor: not-allowed; }

        .ud-doc-empty { text-align: center; padding: 24px 0; color: var(--subtle); font-size: 12px; }
        .ud-doc-empty svg { margin-bottom: 8px; opacity: 0.4; }

        .ud-doc-count { font-size: 11px; color: var(--muted); font-weight: 500; }

        /* ── QUALITY MODULE STYLES (5-Why / Ishikawa) ── */
        .ud-quality-sub { font-size: 12px; color: var(--muted); margin: -8px 0 16px; }
        .ud-quality-card { padding: 14px; border-radius: 12px; border: 1px solid var(--border); background: #fff; margin-bottom: 12px; cursor: pointer; transition: all .2s; }
        .ud-quality-card:last-child { margin-bottom: 0; }
        .ud-quality-card:hover { border-color: #93c5fd; box-shadow: 0 2px 10px rgba(0,1,104,0.06); }
        .ud-claim-code { font-size: 11px; font-weight: 700; color: var(--navy); background: var(--navy-light); padding: 2px 8px; border-radius: 6px; font-family: monospace; }
        .ud-quality-badge { padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase; flex-shrink: 0; height: fit-content; }
        .ud-claim-btn { background: var(--navy); color: #fff; border: none; font-size: 11px; font-weight: 600; padding: 6px 12px; border-radius: 8px; cursor: pointer; transition: background .2s; }
        .ud-claim-btn:hover { background: var(--navy-mid); }
        .ud-claim-sort {
          height: 32px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff;
          padding: 0 8px; font-size: 11px; color: #334155; max-width: 210px;
        }
        .ud-activity-item { padding: 10px 12px; background: #f8f9fc; border-radius: 10px; margin-bottom: 10px; }
        .ud-activity-item:last-of-type { margin-bottom: 16px; }
        .ud-quality-tip { background: linear-gradient(135deg, #1e293b, #0f172a); color: #fff; padding: 16px; border-radius: 12px; }
        .ud-quality-tip h4 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #60a5fa; margin: 0 0 6px; }
        .ud-quality-tip p { font-size: 11px; color: #cbd5e1; line-height: 1.6; margin: 0; }

        @media (max-width: 900px) {
          .ud-stats { grid-template-columns: repeat(2, 1fr); }
          .ud-grid { grid-template-columns: 1fr; }
          .ud-skills-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="ud-wrap">

        {/* Welcome → même profil que /profile */}
        <div className="ud-welcome">
          <button type="button" className="ud-welcome-profile" onClick={() => navigate('/profile')}>
            <UserAvatar user={user as any} size={56} radius={14} className="ud-avatar" />
            <div className="ud-welcome-text">
              <h1>Bonjour, {displayName}</h1>
              <p>Voici un aperçu de vos activités et réalisations</p>
              <div className="ud-welcome-cta">Voir / modifier mon profil →</div>
            </div>
          </button>
        </div>

        {recognitionNotes.length > 0 && (
          <div className="ud-recog">
            {recognitionNotes.map((n) => (
              <div
                key={n.id}
                className="ud-recog-item"
                role="button"
                tabIndex={0}
                onClick={() => { if (!n.isRead) markAsRead(n.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !n.isRead) markAsRead(n.id); }}
              >
                <p className="ud-recog-title">{n.title}</p>
                <p className="ud-recog-msg">{n.message}</p>
              </div>
            ))}
          </div>
        )}

        {/* Top stats */}
        <div className="ud-stats">
          <div className="ud-stat-card">
            <div className="ud-stat-value">{plans.length}</div>
            <div className="ud-stat-label">Plans assignés</div>
          </div>
          <div className="ud-stat-card" style={{ borderTopColor: '#1d4ed8' }}>
            <div className="ud-stat-value" style={{ color: '#1d4ed8' }}>{activePlans.length}</div>
            <div className="ud-stat-label">En cours</div>
          </div>
          <div className="ud-stat-card" style={{ borderTopColor: '#16a34a' }}>
            <div className="ud-stat-value" style={{ color: '#15803d' }}>{completedPlans.length}</div>
            <div className="ud-stat-label">Terminés</div>
          </div>
          <div className="ud-stat-card" style={{ borderTopColor: '#dc2626' }}>
            <div className="ud-stat-value" style={{ color: '#b91c1c' }}>{overduePlans.length}</div>
            <div className="ud-stat-label">En retard</div>
          </div>
        </div>

        {/* ── QUALITY MODULE : Mes réclamations assignées ── */}
        <div className="ud-section">
          <div className="ud-section-header">
            <span className="ud-section-title">
              <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><IconQuality /></span>
              Mes réclamations assignées
            </span>
            <button
              type="button"
              className="ud-claim-btn"
              style={{ marginLeft: 'auto' }}
              onClick={() => navigate('/pages/front/my-claims')}
            >
              Voir dans le portail
            </button>
            <span className="ud-doc-count">{qualityMetrics.total} dossier(s)</span>
          </div>
          <p className="ud-quality-sub">Analyse qualité : 5-Why, Ishikawa (6M) et 8D</p>

          <div className="ud-stats" style={{ marginBottom: 20 }}>
            <div className="ud-stat-card">
              <div className="ud-stat-value">{qualityMetrics.inProgress}</div>
              <div className="ud-stat-label">À traiter / en analyse</div>
            </div>
            <div className="ud-stat-card" style={{ borderTopColor: '#1d4ed8' }}>
              <div className="ud-stat-value" style={{ color: '#1d4ed8' }}>{qualityMetrics.pendingReview}</div>
              <div className="ud-stat-label">En attente de validation</div>
            </div>
            <div className="ud-stat-card" style={{ borderTopColor: '#16a34a' }}>
              <div className="ud-stat-value" style={{ color: '#15803d' }}>{qualityMetrics.closed}</div>
              <div className="ud-stat-label">Clôturées / validées</div>
            </div>
            <div className="ud-stat-card" style={{ borderTopColor: '#000168' }}>
              <div className="ud-stat-value" style={{ color: '#000168' }}>{qualityMetrics.total}</div>
              <div className="ud-stat-label">Total assignées</div>
            </div>
          </div>

          <div className="ud-grid">
            <div>
              <div className="ud-section-header">
                <span className="ud-section-title" style={{ fontSize: 12 }}>Dossiers qui vous sont assignés</span>
                <ClaimDateSortSelect
                  value={claimDateSort}
                  onChange={setClaimDateSort}
                  className="ud-claim-sort"
                />
              </div>
              {assignedClaimsLoading ? (
                <ListSkeleton rows={5} />
              ) : sortedAssignedClaims.length === 0 ? (
                <div className="ud-empty">Aucune réclamation assignée</div>
              ) : (
                sortedAssignedClaims.map((claim) => {
                  const status = resolveClaimStatus(claim);
                  const st = getStatusBadge(status);
                  const canStart = claimCanStart(claim);
                  const shortId = String(claim.id).slice(0, 8).toUpperCase();
                  return (
                    <div
                      key={claim.id}
                      className="ud-quality-card"
                      onClick={() => openClaim(claim.id)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span className="ud-claim-code">REC-{shortId}</span>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Client : {claim.clientId || '—'}</span>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0d1340', marginTop: 4 }}>{claim.title}</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                            Défaut : {claim.defectType || '—'} · Sévérité : {claim.severity || '—'}
                          </div>
                        </div>
                        <span className="ud-quality-badge" style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
                          {st.label}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f2f8', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>
                          Détection :{' '}
                          <strong style={{ color: '#64748b' }}>
                            {claim.detectionDate
                              ? new Date(claim.detectionDate).toLocaleDateString('fr-FR')
                              : '—'}
                          </strong>
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {canStart && (
                            <button
                              className="ud-claim-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                openClaim(claim.id, true);
                              }}
                            >
                              Démarrer l'analyse
                            </button>
                          )}
                          <button
                            className="ud-claim-btn"
                            style={canStart ? { background: 'transparent', color: '#000168', border: '1px solid #c7d2fe' } : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              openClaim(claim.id);
                            }}
                          >
                            Ouvrir le dossier
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div>
              <div className="ud-section-header">
                <span className="ud-section-title" style={{ fontSize: 12 }}>Retours & relectures</span>
              </div>
              {qualityActivities.length === 0 ? (
                <div className="ud-empty">Aucun retour récent</div>
              ) : (
                qualityActivities.map((act) => (
                  <div key={act.id} className="ud-activity-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="ud-claim-code">{act.claimNumber}</span>
                      <span style={{ color: '#94a3b8', fontSize: 10 }}>{act.timestamp}</span>
                    </div>
                    <p style={{ fontSize: 11, color: '#64748b', margin: '6px 0 0', lineHeight: 1.5 }}>{act.message}</p>
                  </div>
                ))
              )}

              <div className="ud-quality-tip">
                <h4>Rappel méthodologique</h4>
                <p>
                  Utilisez le <strong>5-Pourquoi</strong> pour identifier la cause humaine/procédurale directe,
                  et complétez avec l'<strong>Ishikawa (6M)</strong> pour évaluer l'impact Milieu, Machine et Matière.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column body */}
        <div className="ud-grid">

          {/* LEFT COLUMN */}
          <div>

            {/* Plans list */}
            <div className="ud-section">
              <div className="ud-section-header">
                <span className="ud-section-title"> Mes plans d'action</span>
                <span className="ud-section-link" onClick={() => navigate('/action-plans')}>Voir tout →</span>
              </div>
              {loading ? (
                <ListSkeleton rows={5} />
              ) : plans.length === 0 ? (
                <div className="ud-empty">
                  <i className="ti ti-clipboard-off" />
                  Aucun plan d'action assigné
                </div>
              ) : (
                plans.slice(0, 5).map(plan => {
                  const status = STATUS_MAP[plan.status] ?? STATUS_MAP[0];
                  return (
                    <div key={plan.id} className="ud-plan-item" onClick={() => navigate(`/action-plans/${plan.id}`)}>
                      <div className="ud-plan-icon"><i className="ti ti-file-description" /></div>
                      <div className="ud-plan-info">
                        <div className="ud-plan-title">{plan.title}</div>
                        <div className="ud-plan-meta">
                          <span className="ud-status-pill" style={{ background: status.bg, color: status.color, border: `1px solid ${status.border}` }}>
                            {status.label}
                          </span>
                          {plan.deadline && ` · Échéance ${new Date(plan.deadline).toLocaleDateString('fr-FR')}`}
                        </div>
                      </div>
                      <div className="ud-plan-progress">
                        <div className="ud-plan-bar">
                          <div className="ud-plan-bar-fill" style={{ width: `${plan.progress ?? 0}%` }} />
                        </div>
                        <span className="ud-plan-pct">{plan.progress ?? 0}%</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Skills */}
            {skills.length > 0 && (
              <div className="ud-section">
                <div className="ud-section-header">
                  <span className="ud-section-title">
                    <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><IconBrain /></span>
                    Compétences
                  </span>
                </div>
                <div className="ud-skills-grid">
                  <div>
                    {skills.map(s => (
                      <div key={s.name} className="ud-skill-item">
                        <div className="ud-skill-header">
                          <span className="ud-skill-name">{s.name}</span>
                          <span className="ud-skill-level">{s.level}%</span>
                        </div>
                        <div className="ud-skill-bar">
                          <div className="ud-skill-fill" style={{ width: `${s.level}%` }} />
                        </div>
                        <div className="ud-skill-plans">
                          {s.plansCompleted} plan{s.plansCompleted !== 1 ? 's' : ''} concerné{s.plansCompleted !== 1 ? 's' : ''}
                        </div>
                      </div>
                    ))}
                    {hasSkillGap ? (
                      <div className="ud-skill-rec">
                        <h4> Recommandation</h4>
                        <p>Renforcez vos compétences en <strong>{lowestSkill.name}</strong> — niveau actuel {lowestSkill.level}%.</p>
                      </div>
                    ) : (
                      <div className="ud-skill-rec">
                        <h4> Excellent travail</h4>
                        <p>Vous excellez dans tous les domaines mesurés. Continuez ainsi !</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="ud-section-header" style={{ marginBottom: 12 }}>
                      <span className="ud-section-title" style={{ fontSize: 12 }}>
                        <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><IconChart /></span>
                        Classement
                      </span>
                    </div>
                    {[...skills].sort((a, b) => b.level - a.level).map((s, i) => (
                      <div key={s.name} className="ud-rank-item">
                        <div className={`ud-rank-num ${i === 0 ? 'gold' : i === 1 ? 'silver' : 'bronze'}`}>{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="ud-skill-header">
                            <span className="ud-skill-name">{s.name}</span>
                            <span className="ud-skill-level">{s.level}%</span>
                          </div>
                          <div className="ud-skill-bar">
                            <div className="ud-skill-fill" style={{ width: `${s.level}%`, opacity: 0.7 }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Global progress */}
            <div className="ud-section">
              <div className="ud-section-header">
                <span className="ud-section-title"> Progression globale</span>
              </div>
              <div className="ud-progress-wrap">
                <div className="ud-progress-row">
                  <span className="ud-progress-label">Avancement moyen</span>
                  <span className="ud-progress-value">{avgProgress}%</span>
                </div>
                <div className="ud-progress-bar">
                  <div className="ud-progress-bar-fill" style={{ width: `${avgProgress}%` }} />
                </div>
              </div>
            </div>

            {/* Recent activity */}
            <div className="ud-section">
              <div className="ud-section-header">
                <span className="ud-section-title">
                  <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><IconHistory /></span>
                  Activité récente
                </span>
              </div>
              {plans.length === 0 ? (
                <div className="ud-empty">Aucune activité récente</div>
              ) : (
                <div className="ud-timeline">
                  {plans.slice(0, 4).map(plan => (
                    <div key={plan.id} className="ud-tl-item">
                      <div className={`ud-tl-dot ${plan.status === 3 ? 'completed' : ''}`} />
                      <div className="ud-tl-content">
                        <span className="ud-tl-title">{plan.title}</span>
                        <span className="ud-tl-meta">
                          {plan.status === 3 ? 'Terminé' : plan.status === 0 ? 'Non démarré' : 'En cours'}
                          {plan.deadline && ` · Échéance : ${fmtDate(plan.deadline)}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div>

            {/* DOCUMENTS SECTION */}
            <div className="ud-section ud-doc-section" style={{ marginBottom: 20 }}>
              <div className="ud-section-header">
                <span className="ud-section-title">
                  <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><IconFile /></span>
                  Documents
                  <span className="ud-doc-count">({filteredDocs.length})</span>
                </span>
              </div>

              {/* Toolbar */}
              <div className="ud-doc-toolbar">
                <div className="ud-doc-search">
                  <IconSearch />
                  <input
                    type="text"
                    placeholder="Rechercher..."
                    value={docSearch}
                    onChange={e => setDocSearch(e.target.value)}
                  />
                </div>
                <button
                  className={`ud-doc-fav-btn ${docFilterFav ? 'active' : ''}`}
                  onClick={() => setDocFilterFav(!docFilterFav)}
                >
                  <IconStar filled={docFilterFav} />
                  Favoris
                </button>
              </div>

              {/* Document list */}
              {docLoading ? (
                <ListSkeleton rows={5} />
              ) : filteredDocs.length === 0 ? (
                <div className="ud-doc-empty">
                  <IconFileText />
                  <div>Aucun document trouvé</div>
                </div>
              ) : (
                <div className="ud-doc-list">
                  {filteredDocs.slice(0, 6).map(doc => {
                    const color = getFileColor(doc.type);
                    return (
                      <div key={doc.id} className="ud-doc-item">
                        <div
                          className="ud-doc-icon"
                          style={{ background: `${color}12`, color }}
                        >
                          {getFileIcon(doc.type)}
                        </div>
                        <div className="ud-doc-info">
                          <div className="ud-doc-name" title={doc.name}>{doc.name}</div>
                          <div className="ud-doc-meta">
                            {doc.type.toUpperCase()} · {doc.lastViewed === 'Never' ? 'Jamais consulté' : `Vu le ${doc.lastViewed}`}
                          </div>
                        </div>
                        <div className="ud-doc-actions">
                          <button
                            className={`ud-doc-action ud-doc-action-fav ${doc.isFavorite ? 'active' : ''}`}
                            onClick={() => handleDocToggleFavorite(doc.id)}
                            title={doc.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                          >
                            <IconStar filled={doc.isFavorite} />
                          </button>
                          <button
                            className="ud-doc-action ud-doc-action-dl"
                            onClick={() => handleDocDownload(doc)}
                            disabled={downloadingId === doc.id}
                            title="Télécharger"
                          >
                            <IconDownload />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {filteredDocs.length > 6 && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  <span className="ud-section-link">Voir tout →</span>
                </div>
              )}
            </div>

            {/* Badges */}
            <div className="ud-section" style={{ marginBottom: 20 }}>
              <div className="ud-section-header">
                <span className="ud-section-title">
                  <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><IconTrophy /></span>
                  Badges ({earnedBadges.length})
                </span>
              </div>

              {earnedBadges.length === 0 ? (
                <div className="ud-badge-empty">
                  <IconTrophy />
                  Complétez des plans pour débloquer vos premiers badges
                </div>
              ) : (
                <div className="ud-badge-grid">
                  {earnedBadges.map(badge => {
                    const Icon = badge.icon;
                    return (
                      <div key={badge.id} className="ud-badge" style={{ background: badge.color + '15', border: `2px solid ${badge.color}30` }}>
                        <Icon size={22} color={badge.color} />
                        <div className="ud-badge-tooltip">{badge.name}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {nextBadge && (
                <div className="ud-next-badge">
                  <nextBadge.icon size={14} color={nextBadge.color} />
                  <span>Prochain : <strong style={{ color: '#0d1340' }}>{nextBadge.name}</strong> — {nextBadge.description}</span>
                </div>
              )}
            </div>

            {/* Performance */}
            <div className="ud-section">
              <div className="ud-section-header">
                <span className="ud-section-title"> Performance</span>
              </div>
              <div className="ud-performance">
                <div className="ud-perf-item">
                  <div className="ud-perf-value green">{completedPlans.length}</div>
                  <div className="ud-perf-label">Complétés</div>
                </div>
                <div className="ud-perf-item">
                  <div className="ud-perf-value blue">{plans.length > 0 ? `${onTimeRate}%` : '—'}</div>
                  <div className="ud-perf-label">À l'heure</div>
                </div>
                <div className="ud-perf-item">
                  <div className="ud-perf-value orange">{fastCompletions}</div>
                  <div className="ud-perf-label">Avant échéance</div>
                </div>
                <div className="ud-perf-item">
                  <div className="ud-perf-value purple">{earnedBadges.length}</div>
                  <div className="ud-perf-label">Badges</div>
                </div>
              </div>
            </div>

            {/* Upcoming deadlines */}
            <div className="ud-section" style={{ marginTop: 20 }}>
              <div className="ud-section-header">
                <span className="ud-section-title">
                  <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: 6 }}><IconClock /></span>
                  Échéances proches
                </span>
              </div>
              {upcomingDeadlines.length === 0 ? (
                <div className="ud-empty">
                  <IconCheck />
                  Aucune échéance urgente
                </div>
              ) : (
                upcomingDeadlines.map(plan => {
                  const days       = getDaysRemaining(plan.deadline!);
                  const isOverdue  = days < 0;
                  const isCritical = days >= 0 && days <= 3;
                  return (
                    <div key={plan.id} className="ud-dl-item" onClick={() => navigate(`/action-plans/${plan.id}`)}>
                      <div className="ud-dl-urgency" style={{
                        background: isOverdue ? '#fef2f2' : isCritical ? '#fef3c7' : '#f0fdf4',
                        color:      isOverdue ? '#dc2626' : isCritical ? '#f59e0b' : '#16a34a',
                      }}>
                        {Math.abs(days)}
                        <span>{isOverdue ? 'retard' : 'j'}</span>
                      </div>
                      <div className="ud-dl-info">
                        <div className="ud-dl-title">{plan.title}</div>
                        <div className="ud-dl-date">{fmtDate(plan.deadline!)}</div>
                      </div>
                      <span className="ud-dl-pill" style={{
                        background: isOverdue ? '#fee2e2' : isCritical ? '#fef3c7' : '#dcfce7',
                        color:      isOverdue ? '#dc2626' : isCritical ? '#b45309' : '#16a34a',
                      }}>
                        {isOverdue ? 'Urgent' : isCritical ? 'Critique' : 'Normal'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}