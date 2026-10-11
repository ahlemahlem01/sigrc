import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { UserDto } from '../../services/adminService';
import './EmployeeDashboard.css';
import EmployeeOverview from './EmployeeOverview';
import { computeEarnedBadges, mergeBadges, getMissingBadges } from '../../utils/badges';
import { useTimeline } from '../../hooks/useTimeline';
import { normaliseTimelineEvent } from '../../services/timelineService';
import { ACTION_PLAN_API_URL as API_BASE } from '../../config/apiEnv';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

interface Props {
  employee: UserDto;
  onBack: () => void;
}

const FETCH_TIMEOUT = 10000;

function getTokenFromStorage(): string | null {
  try {
    const auth = localStorage.getItem('auth');
    if (auth) { const p = JSON.parse(auth); if (p?.accessToken) return p.accessToken; }
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  } catch { return null; }
}

const normaliseBadge = (b: any) => ({
  ...b,
  id:       b.id?.toString() ?? `db-${b.name}`,
  earnedAt: b.earnedAt ?? b.awardedAt ?? b.createdAt ?? new Date().toISOString(),
});

const normaliseDocument = (d: any) => ({
  ...d,
  viewedAt: d.viewedAt ?? d.uploadedAt ?? d.createdAt ?? new Date().toISOString(),
});

function computeStatsFromPlans(plans: any[]): {
  totalPlans: number; completed: number; onTimeRate: number; weeklyStreak: number;
  activePlans: number; overduePlans: number; avgProgress: number; fastCompletions: number;
} {
  if (!Array.isArray(plans) || plans.length === 0)
    return { totalPlans: 0, completed: 0, onTimeRate: 0, weeklyStreak: 0, activePlans: 0, overduePlans: 0, avgProgress: 0, fastCompletions: 0 };

  const now   = new Date();
  const total = plans.length;

  const completed      = plans.filter((p: any) => p.status === 3 || p.progress === 100 || p.progress === 101).length;
  const active         = plans.filter((p: any) => p.status === 1 || p.status === 2).length;
  const overdue        = plans.filter((p: any) => !p.deadline || p.status === 3 ? false : new Date(p.deadline) < now).length;
  const avgProgress    = Math.round(plans.reduce((s: number, p: any) => s + (p.progress ?? 0), 0) / total);
  const onTimeRate     = Math.round(((total - overdue) / total) * 100);
  const fastCompletions = plans.filter((p: any) => p.status === 3 && p.deadline && new Date(p.deadline) > now).length;

  const completedDates = plans
    .filter((p: any) => p.status === 3 || p.progress === 100 || p.progress === 101)
    .map((p: any) => new Date(p.completedAt ?? p.updatedAt ?? p.createdAt ?? Date.now()))
    .filter((d: Date) => d.getFullYear() > 2000)
    .sort((a: Date, b: Date) => b.getTime() - a.getTime());

  let streak = 0;
  if (completedDates.length > 0) {
    const getWeek = (d: Date) => {
      const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    };
    streak = Array.from(new Set(completedDates.map((d: Date) => `${d.getFullYear()}-${getWeek(d)}`))).length;
  }

  return { totalPlans: total, completed, onTimeRate, weeklyStreak: streak, activePlans: active, overduePlans: overdue, avgProgress, fastCompletions };
}

function deriveTimelineFromPlans(plans: any[]): any[] {
  const events: any[] = [];

  plans.forEach((p: any) => {
    events.push({
      id:          `assign-${p.id}`,
      type:        'assignment',
      title:       i18n.t('employeeAdminView.planAssigned'),
      description: p.title,
      timestamp:   p.createdAt ?? p.assignedAt ?? new Date().toISOString(),
      planId:      p.id,
    });
  });

  plans.filter((p: any) => p.status === 3 || p.progress === 100).forEach((p: any) => {
    events.push({
      id:          `complete-${p.id}`,
      type:        'completion',
      title:       i18n.t('employeeAdminView.planDone'),
      description: p.title,
      timestamp:   p.completedAt ?? p.updatedAt ?? p.createdAt ?? new Date().toISOString(),
      planId:      p.id,
    });
  });

  return events
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 20);
}

export default function EmployeeAdminView({ employee, onBack }: Props) {
  const { t } = useTranslation();
  const auth  = useAuth();
  const location = useLocation();
  const token = (auth as any)?.token ?? (auth as any)?.accessToken ?? getTokenFromStorage();
  const focusActivePlans = location.hash === '#employee-plans';

  const [loading,    setLoading]    = useState(true);
  const [profile,    setProfile]    = useState<any>(null);
  const [dbBadges,   setDbBadges]   = useState<any[]>([]);
  const [documents,  setDocuments]  = useState<any[]>([]);
  const [quickStats, setQuickStats] = useState<any>({});
  const [plans,      setPlans]      = useState<any[]>([]);

  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [showDocModal,   setShowDocModal]   = useState(false);
  const [selectedFile,   setSelectedFile]   = useState<File | null>(null);
  const [docForm, setDocForm] = useState({ name: '', type: 'PDF', url: '', category: 'General', description: '' });

  const syncedForEmployeeRef = React.useRef<string | null>(null);

  // ── Timeline hook ────────────────────────────────────────────────────────
  const {
    timeline,
    addEvent:    addTimelineEvent,
    setTimeline,
  } = useTimeline({ userId: employee.id, token });

  // ── Badge computation ────────────────────────────────────────────────────
  const computedBadges = computeEarnedBadges(plans);
  const badges         = mergeBadges(computedBadges, dbBadges);

  useEffect(() => {
    if (!employee?.id) { setLoading(false); return; }
    syncedForEmployeeRef.current = null;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id, token]);

  useEffect(() => {
    if (loading || !employee?.id) return;
    if (syncedForEmployeeRef.current === employee.id) return;
    syncedForEmployeeRef.current = employee.id;
    syncComputedBadges(computedBadges, dbBadges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, employee?.id]);

  useEffect(() => {
    if (loading || location.hash !== '#employee-plans') return;
    const t = window.setTimeout(() => {
      document.getElementById('employee-plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [loading, location.hash]);

  const fetchAll = async () => {
    setLoading(true);

    const hdrs: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) hdrs['Authorization'] = `Bearer ${token}`;

    const uid = encodeURIComponent(employee.id);
    const sig = AbortSignal.timeout(FETCH_TIMEOUT);

    setProfile({
      name:        employee.fullName,
      fullName:    employee.fullName,
      email:       employee.email,
      role:        (employee as any).roles?.[0] ?? (employee as any).role ?? 'user',
      department:  (employee as any).department ?? (employee as any).departmentName,
      status:      (employee as any).isLockedOut ? i18n.t('employeeOverview.locked') : i18n.t('activity.active'),
      hireDate:    (employee as any).hireDate ?? null,
      managerName: (employee as any).managerName ?? '—',
      poste:       (employee as any).poste ?? '',
      equipe:      (employee as any).equipe ?? '',
      ligneProduction: (employee as any).ligneProduction ?? '',
      telephone:   (employee as any).telephone ?? (employee as any).phone ?? '',
    });

    const [profileRes, badgesRes, timelineRes, docsRes, plansRes] = await Promise.allSettled([
      fetch(`${API_BASE}/admin/employees/profiles/${uid}`, { headers: hdrs, signal: sig }),
      fetch(`${API_BASE}/admin/employees/badges/${uid}`,    { headers: hdrs, signal: sig }),
      fetch(`${API_BASE}/admin/employees/timeline/${uid}`,  { headers: hdrs, signal: sig }),
      fetch(`${API_BASE}/admin/employees/documents/${uid}`, { headers: hdrs, signal: sig }),
      fetch(`${API_BASE}/actionplan/admin/assigned/${uid}`, { headers: hdrs, signal: sig }),
    ]);

    const unwrap = (raw: any): any[] =>
      Array.isArray(raw) ? raw : (raw?.['$values'] ?? raw?.data ?? raw?.items ?? []);

    if (profileRes.status === 'fulfilled' && profileRes.value.ok) {
      try {
        const apiProfile = await profileRes.value.json();
        setProfile((prev: any) => ({
          ...prev,
          name: apiProfile.name ?? prev?.name,
          fullName: apiProfile.name ?? prev?.fullName,
          email: apiProfile.email ?? prev?.email,
          role: apiProfile.role ?? prev?.role,
          department: apiProfile.department ?? prev?.department,
          status: apiProfile.status ?? prev?.status,
          hireDate: apiProfile.hireDate ?? prev?.hireDate,
          managerName: apiProfile.managerName ?? prev?.managerName,
          poste: apiProfile.poste ?? prev?.poste ?? '',
          equipe: apiProfile.equipe ?? prev?.equipe ?? '',
          ligneProduction: apiProfile.ligneProduction ?? prev?.ligneProduction ?? '',
          telephone: apiProfile.telephone ?? apiProfile.phone ?? prev?.telephone ?? '',
        }));
      } catch (e) {
        console.error('profile error:', e);
      }
    }

    // Badges
    if (badgesRes.status === 'fulfilled' && badgesRes.value.ok) {
      try { setDbBadges(unwrap(await badgesRes.value.json()).map(normaliseBadge)); }
      catch (e) { console.error('badges error:', e); setDbBadges([]); }
    } else { setDbBadges([]); }

    // Timeline — merge DB + événements dérivés des plans
    let dbTimeline: any[] = [];
    if (timelineRes.status === 'fulfilled' && timelineRes.value.ok) {
      try { dbTimeline = unwrap(await timelineRes.value.json()).map(normaliseTimelineEvent); }
      catch (e) { console.error('timeline error:', e); }
    }

    // Documents
    if (docsRes.status === 'fulfilled' && docsRes.value.ok) {
      try { setDocuments(unwrap(await docsRes.value.json()).map(normaliseDocument)); }
      catch (e) { console.error('documents error:', e); setDocuments([]); }
    } else { setDocuments([]); }

    // Plans
    let fetchedPlans: any[] = [];
    if (plansRes.status === 'fulfilled' && plansRes.value.ok) {
      try { fetchedPlans = unwrap(await plansRes.value.json()); }
      catch (e) { console.error('plans error:', e); }
    } else {
      console.error('plans fetch failed:', plansRes.status === 'fulfilled' ? plansRes.value.status : plansRes.reason);
    }

    setPlans(fetchedPlans);

    // Merge timeline DB + dérivée des plans → hook
    const planTimeline = deriveTimelineFromPlans(fetchedPlans);
    setTimeline(
      [...planTimeline, ...dbTimeline]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 20)
    );

    setQuickStats(computeStatsFromPlans(fetchedPlans));
    setLoading(false);
  };

  const syncComputedBadges = async (computed: any[], existingDbBadges: any[]) => {
    if (!token) return;
    const missing = getMissingBadges(computed, existingDbBadges);
    if (missing.length === 0) return;

    for (const badge of missing) {
      try {
        const res = await fetch(`${API_BASE}/admin/employees/badges`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            id: badge.id, userId: employee.id, name: badge.name,
            description: badge.description, icon: badge.icon, color: badge.color,
            category: `performance-${badge.id}`, planTitle: null,
          }),
        });
        if (res.ok) {
          const saved = await res.json();
          setDbBadges(prev => [normaliseBadge(saved), ...prev]);
        } else {
          console.error(`Failed to persist badge "${badge.name}":`, res.status, await res.text());
        }
      } catch (e) {
        console.error(`Error persisting badge "${badge.name}":`, e);
      }
    }
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAssignBadge = async (badgeType: string) => {
    if (!token) { alert(t('managedClaims.err401')); return; }

    const badgeMap: Record<string, { id: string; name: string; color: string; category: string }> = {
      stellar:    { id: 'stellar',    name: 'Stellar Performer', color: '#f59e0b', category: 'Performance'   },
      team:       { id: 'team',       name: 'Team Player',       color: '#3b82f6', category: 'Collaboration' },
      innovator:  { id: 'innovator',  name: 'Innovator',         color: '#8b5cf6', category: 'Innovation'    },
      mentor:     { id: 'mentor',     name: 'Mentor',            color: '#16a34a', category: 'Leadership'    },
      dedication: { id: 'dedication', name: 'Dedication',        color: '#dc2626', category: 'Commitment'    },
      leadership: { id: 'leadership', name: 'Leadership',        color: '#000168', category: 'Leadership'    },
    };
    const info = badgeMap[badgeType] ?? { id: badgeType, name: badgeType, color: '#3b82f6', category: 'General' };

    try {
      const res = await fetch(`${API_BASE}/badges`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          id: info.id, userId: employee.id, name: info.name,
          description: `Badge ${info.name} attribué par l'administrateur`,
          icon: '🏅', color: info.color, category: info.category, planTitle: null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const saved = await res.json();
      setDbBadges(prev => [normaliseBadge(saved), ...prev]);
      setShowBadgeModal(false);
    } catch (e) {
      console.error('Error assigning badge:', e);
      alert(t('employeeAdminView.error', { message: e instanceof Error ? e.message : t('planDetailFront.unknownError') }));
    }
  };

  const handleAddDocument = async () => {
    if (!token) { alert(t('managedClaims.err401')); return; }
    if (!selectedFile && !docForm.url.trim()) {
      alert(t('employeeOverview.fileOrUrl'));
      return;
    }
    try {
      let saved: any;
      if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('userId', employee.id);
        formData.append('name', docForm.name || selectedFile.name || 'Document');
        formData.append('type', docForm.type);
        formData.append('description', docForm.description);
        formData.append('category', docForm.category);
        formData.append('createdBy', (auth.user as any)?.name ?? 'Admin');
        const res = await fetch(`${API_BASE}/admin/employees/documents/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        saved = await res.json();
      } else {
        const res = await fetch(`${API_BASE}/admin/employees/documents`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            userId:       employee.id,
            name:         docForm.name || 'Document',
            type:         docForm.type,
            description:  docForm.description,
            filePath:     docForm.url.trim(),
            thumbnailUrl: null,
            category:     docForm.category,
            createdBy:    (auth.user as any)?.name ?? 'Admin',
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        saved = await res.json();
      }
      setDocuments(prev => [normaliseDocument(saved), ...prev]);
      setShowDocModal(false);
      setSelectedFile(null);
      setDocForm({ name: '', type: 'PDF', url: '', category: 'General', description: '' });
    } catch (e) {
      console.error('Error adding document:', e);
      alert(t('employeeAdminView.error', { message: e instanceof Error ? e.message : t('planDetailFront.unknownError') }));
    }
  };

  const handleAddTimelineEvent = async (event: any) => {
    try {
      await addTimelineEvent({
        title:       event.title,
        description: event.description,
        type:        event.type,
        actorName:   (auth.user as any)?.name ?? 'Admin',
      });
    } catch {
      alert(t('employeeAdminView.eventFailed'));
    }
  };

  // ── File helpers ──────────────────────────────────────────────────────────

  const getFileType = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'PDF';
    if (['doc', 'docx'].includes(ext ?? '')) return 'DOC';
    if (['xls', 'xlsx'].includes(ext ?? '')) return 'XLS';
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext ?? '')) return 'IMG';
    return 'PDF';
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) { setSelectedFile(file); setDocForm(f => ({ ...f, name: file.name, type: getFileType(file.name) })); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setSelectedFile(file); setDocForm(f => ({ ...f, name: file.name, type: getFileType(file.name) })); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <BackButton onBack={onBack} />
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ marginBottom: 12 }}>
            <div className="sk sk-c" style={{ width: 48, height: 48, margin: '0 auto' }} />
          </div>
          <div className="sk sk-r" style={{ width: 180, margin: '0 auto 8px' }} />
          <div className="sk sk-r" style={{ width: 120, margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackButton onBack={onBack} />
      <EmployeeOverview
        profile={profile}
        badges={badges}
        timeline={timeline}
        documents={documents}
        quickStats={quickStats}
        plans={plans}
        isAdmin={true}
        focusActivePlans={focusActivePlans}
        onAssignBadge={() => setShowBadgeModal(true)}
        onAddDocument={() => {
          setShowDocModal(true);
          setSelectedFile(null);
          setDocForm({ name: '', type: 'PDF', url: '', category: 'General', description: '' });
        }}
        onAddTimelineEvent={handleAddTimelineEvent}
      />

      {/* ── Badge Modal ── */}
      {showBadgeModal && (
        <div className="ad-overlay" onClick={e => e.target === e.currentTarget && setShowBadgeModal(false)}>
          <div className="ad-modal" style={{ width: 420 }}>
            <div className="ad-mhead">
              <span className="ad-mtitle">{t('recognition.awardBadge')}</span>
              <button className="ad-mclose" onClick={() => setShowBadgeModal(false)} aria-label={t('fiveWhy.close')}><i className="ti ti-x" /></button>
            </div>
            <div className="ad-mbody">
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
                {t('employeesAdmin.colEmployee')} : <strong>{employee.fullName}</strong>
              </p>
              <div className="ad-fg">
                <label className="ad-lbl">{t('employeeAdminView.badgeType')}</label>
                <div className="ad-pg-grid">
                  {[
                    { id: 'stellar',    name: 'Stellar Performer', color: '#f59e0b' },
                    { id: 'team',       name: 'Team Player',       color: '#3b82f6' },
                    { id: 'innovator',  name: 'Innovator',         color: '#8b5cf6' },
                    { id: 'mentor',     name: 'Mentor',            color: '#16a34a' },
                    { id: 'dedication', name: 'Dedication',        color: '#dc2626' },
                    { id: 'leadership', name: 'Leadership',        color: '#000168' },
                  ].map(badge => (
                    <div
                      key={badge.id}
                      className="ad-pi"
                      onClick={() => handleAssignBadge(badge.id)}
                      style={{ cursor: 'pointer', borderLeft: `3px solid ${badge.color}` }}
                    >
                      <span style={{ color: badge.color, fontSize: 16 }}>🏅</span>
                      {badge.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="ad-mfoot">
              <button className="ad-btn btn-ghost" onClick={() => setShowBadgeModal(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Document Modal ── */}
      {showDocModal && (
        <div className="ad-overlay" onClick={e => e.target === e.currentTarget && setShowDocModal(false)}>
          <div className="ad-modal" style={{ width: 480 }}>
            <div className="ad-mhead">
              <span className="ad-mtitle">{t('employeeAdminView.addDocument')}</span>
              <button className="ad-mclose" onClick={() => setShowDocModal(false)} aria-label={t('fiveWhy.close')}><i className="ti ti-x" /></button>
            </div>
            <div className="ad-mbody">
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => document.getElementById('file-input')?.click()}
                style={{
                  border: `2px dashed ${selectedFile ? 'var(--navy)' : 'var(--border)'}`,
                  borderRadius: 10, padding: 24, textAlign: 'center', cursor: 'pointer',
                  marginBottom: 16,
                  background: selectedFile ? 'var(--navy-light)' : 'var(--bg)',
                  transition: 'all .15s',
                }}
              >
                <input id="file-input" type="file" style={{ display: 'none' }} onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif" />
                <i className="ti ti-cloud-upload" style={{ fontSize: 32, color: 'var(--navy)', display: 'block', marginBottom: 8 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                  {selectedFile ? selectedFile.name : t('employeeAdminView.dropHint')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--subtle)', marginTop: 4 }}>{t('employeeAdminView.fileTypes')}</div>
              </div>

              <div className="ad-fg">
                <label className="ad-lbl">{t('employeeAdminView.orUrl')}</label>
                <input className="ad-inp" value={docForm.url}
                  onChange={e => setDocForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://..." disabled={!!selectedFile} />
              </div>

              <div className="ad-frow">
                <div className="ad-fg">
                  <label className="ad-lbl">{t('employeeAdminView.docName')}</label>
                  <input className="ad-inp" value={docForm.name}
                    onChange={e => setDocForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={t('employeeAdminView.docNamePh')} />
                </div>
                <div className="ad-fg">
                  <label className="ad-lbl">{t('planDetail.type')}</label>
                  <select className="ad-sel" value={docForm.type}
                    onChange={e => setDocForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="PDF">PDF</option>
                    <option value="DOC">Word</option>
                    <option value="XLS">Excel</option>
                    <option value="IMG">Image</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="ad-mfoot">
              <button className="ad-btn btn-ghost" onClick={() => { setShowDocModal(false); setSelectedFile(null); }}>{t('common.cancel')}</button>
              <button className="ad-btn btn-primary" onClick={handleAddDocument}
                disabled={!docForm.name && !selectedFile}>
                {t('employeeAdminView.add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <button onClick={onBack} className="ad-btn btn-ghost"
      style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}>
      <i className="ti ti-arrow-left" /> {t('employeeProfileAdmin.backToList')}
    </button>
  );
}