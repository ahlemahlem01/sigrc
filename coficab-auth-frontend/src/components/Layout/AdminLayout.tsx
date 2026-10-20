import { useState } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import LanguageSwitcher from '../LanguageSwitcher';
import UserAvatar from '../UserAvatar';
import { LogOut, LayoutDashboard, ChevronDown, Search, Calendar } from 'lucide-react';
import { NotificationBell } from '../NotificationBell';
import { useOrganizationScope } from '../../context/OrganizationScopeContext';
import OrganizationScopePicker from '../OrganizationScopePicker';
import { useEffect, useRef } from 'react';
import QualityAssistantWidget from '../QualityAssistant/QualityAssistantWidget';

type NavLink = { label: string; icon: string; path: string };
type NavSection = { id: string; label: string; children: NavLink[] };
type NavGroup = {
  id: string;
  label: string;
  icon: string;
  children?: NavLink[];
  sections?: NavSection[];
};
type NavSolo = { id: string; label: string; icon: string; path: string; solo: true };
type NavItem = NavGroup | NavSolo;

const LS_OPEN_GROUPS = 'coficab-admin-nav-groups';
const LS_AP_SECTIONS = 'coficab-admin-nav-ap-sections';
const DEFAULT_OPEN_GROUPS = ['users', 'employees', 'orgs', 'actionplans', 'claims', 'audit', 'settings'];
const DEFAULT_AP_SECTIONS = ['ap-overview', 'ap-manage', 'ap-reports', 'cl-overview', 'cl-manage', 'cl-analysis', 'cl-reports'];

function readLsIds(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : fallback;
  } catch {
    return fallback;
  }
}

function writeLsIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

function groupLinks(item: NavGroup): NavLink[] {
  if (item.sections?.length) return item.sections.flatMap((s) => s.children);
  return item.children || [];
}

// ── All paths now use REAL routes — no more /admin?section=X ────────────────
const NAV: NavItem[] = [
  {
    id: 'front',
    label: 'adminNav.frontOffice',
    icon: 'ti-shield-check',
    path: '/pages/front/validations',
    solo: true,
  },
  {
    id: 'dashboard',
    label: 'adminNav.overview',
    icon: 'ti-layout-dashboard',
    path: '/admin/dashboard',
    solo: true,
  },
  {
    id: 'users', label: 'adminNav.admin', icon: 'ti-shield',
    children: [
      { label: 'adminNav.adminList', icon: 'ti-list', path: '/admin/users' },
      { label: 'adminNav.locked', icon: 'ti-lock', path: '/admin/users?locked=1' },
    ],
  },
  {
    id: 'employees', label: 'adminNav.employees', icon: 'ti-users-group',
    children: [
      { label: 'adminNav.employeeList', icon: 'ti-list', path: '/admin/employees' },
      { label: 'adminNav.locked', icon: 'ti-lock', path: '/admin/employees?locked=1' },
      { label: 'adminNav.activity', icon: 'ti-activity', path: '/admin/employees/activity' },
      { label: 'adminNav.compare', icon: 'ti-arrows-diff', path: '/admin/employees/compare' },
      { label: 'adminNav.recognition', icon: 'ti-award', path: '/admin/employees/recognition' },
    ],
  },
  {
    id: 'orgs', label: 'adminNav.organizations', icon: 'ti-building',
    children: [
      { label: 'adminNav.orgList', icon: 'ti-list', path: '/admin/organizations' },
      { label: 'adminNav.departments', icon: 'ti-building', path: '/admin/departments' },
      { label: 'adminNav.orgChart', icon: 'ti-hierarchy-2', path: '/admin/organizations/map' },
    ],
  },
  {
    id: 'perms', label: 'adminNav.permissions', icon: 'ti-key',
    children: [
      { label: 'adminNav.allPermissions', icon: 'ti-list', path: '/admin/permissions' },
      { label: 'adminNav.assign', icon: 'ti-checkbox', path: '/admin/permissions/assign' },
    ],
  },
  {
    id: 'actionplans', label: 'adminNav.actionPlans', icon: 'ti-file-description',
    children: [
      { label: 'adminNav.board', icon: 'ti-layout-dashboard', path: '/admin/action-plans/dashboard' },
      { label: 'adminNav.allPlans', icon: 'ti-list', path: '/admin/action-plans' },
      { label: 'adminNav.tracking', icon: 'ti-list-check', path: '/admin/action-plans/tracking' },
      { label: 'adminNav.reports', icon: 'ti-report-analytics', path: '/admin/action-plans/report' },
    ],
  },
  {
    id: 'claims', label: 'adminNav.claimsQuality', icon: 'ti-clipboard-check',
    children: [
      { label: 'adminNav.claimsDashboard', icon: 'ti-layout-dashboard', path: '/admin/claims/dashboard' },
      { label: 'adminNav.allClaims', icon: 'ti-list', path: '/admin/claims/list' },
      { label: 'adminNav.claimAssignments', icon: 'ti-user-check', path: '/admin/claims/assignments' },
      { label: 'adminNav.importHistory', icon: 'ti-file-import', path: '/admin/claims/import-history' },
      { label: 'adminNav.analysesHub', icon: 'ti-git-fork', path: '/admin/claims/analyses' },
    ],
  },
  {
    id: 'apps', label: 'adminNav.applications', icon: 'ti-layout-grid',
    children: [
      { label: 'adminNav.actionPlans', icon: 'ti-file-description', path: '/admin/action-plans' },
      { label: 'adminNav.quality', icon: 'ti-clipboard-check', path: '/admin/claims/list' },
      { label: 'adminNav.reporting', icon: 'ti-chart-bar', path: '/admin/action-plans/report' },
    ],
  },
  {
    id: 'audit', label: 'adminNav.audit', icon: 'ti-activity',
    children: [
      { label: 'adminNav.fullTrace', icon: 'ti-clock', path: '/admin/audit-logs' },
      { label: 'adminNav.loginLogs', icon: 'ti-eye', path: '/admin/login-logs' },
      { label: 'adminNav.teamReports', icon: 'ti-report-analytics', path: '/admin/reports' },
    ],
  },
  {
    id: 'settings', label: 'adminNav.settings', icon: 'ti-settings',
    children: [
      { label: 'adminNav.preferences', icon: 'ti-adjustments', path: '/admin/preferences' },
      { label: 'adminNav.planReference', icon: 'ti-barcode', path: '/admin/action-plans/reference' },
      { label: 'adminNav.referenceLists', icon: 'ti-list-details', path: '/admin/claims/reference-lists' },
      { label: 'adminNav.workflowConfig', icon: 'ti-route', path: '/admin/claims/workflow' },
    ],
  },
  { id: 'support', label: 'adminNav.support', icon: 'ti-help-circle', path: '/admin/dashboard', solo: true },
];

const getPageMeta = (pathname: string): { title: string; crumb: string } => {
  const map: Record<string, { title: string; crumb: string }> = {
    '/admin/dashboard':                  { title: 'adminNav.overview', crumb: 'adminDashboard.navCrumb' },
    '/admin/validations':                { title: 'adminNav.validations', crumb: 'adminNav.frontOffice' },
    '/admin/users':                      { title: 'adminNav.adminList', crumb: 'adminNav.admin' },
    '/admin/profile':                    { title: 'adminNav.profile', crumb: 'adminNav.profileCrumb' },
    '/admin/organizations':              { title: 'adminNav.organizations', crumb: 'adminNav.organizations' },
    '/admin/action-plans/dashboard':     { title: 'adminNav.board', crumb: 'adminNav.actionPlans' },
    '/admin/action-plans/tracking':      { title: 'adminNav.tracking', crumb: 'adminNav.actionPlans' },
    '/admin/action-plans/report':        { title: 'adminNav.reports', crumb: 'adminNav.actionPlans' },
    '/admin/action-plans/actions-report':{ title: 'adminNav.reporting', crumb: 'adminNav.applications' },
    '/admin/action-plans/indicators':    { title: 'adminNav.indicators', crumb: 'adminNav.actionPlans' },
    '/admin/action-plans/reference':     { title: 'adminNav.planReference', crumb: 'adminNav.settings' },
    '/admin/preferences':                { title: 'adminNav.preferences', crumb: 'adminNav.settings' },
    '/admin/action-plans/create':        { title: 'adminNav.newPlan', crumb: 'adminNav.actionPlans' },
    '/admin/action-plans/assignments':   { title: 'adminNav.assignments', crumb: 'adminNav.actionPlans' },
    '/admin/action-plans/assign':        { title: 'adminNav.overview', crumb: 'adminNav.actionPlans' },
    '/admin/action-plans':               { title: 'adminNav.allPlans', crumb: 'adminNav.actionPlans' },
    '/admin/claims/dashboard':           { title: 'adminNav.claimsDashboard', crumb: 'adminNav.claimsQuality' },
    '/admin/claims/list':                { title: 'adminNav.allClaims', crumb: 'adminNav.claimsQuality' },
    '/admin/claims/assignments':         { title: 'adminNav.claimAssignments', crumb: 'adminNav.claimsQuality' },
    '/admin/claims/analyses':            { title: 'adminNav.analysesHub', crumb: 'adminNav.claimsQuality' },
    '/admin/claims/create':              { title: 'adminNav.newClaim', crumb: 'adminNav.claimsQuality' },
    '/admin/claims/import-history':      { title: 'adminNav.importHistory', crumb: 'adminNav.claimsQuality' },
    '/admin/claims/reference-lists':     { title: 'adminNav.referenceLists', crumb: 'adminNav.settings' },
    '/admin/claims/workflow':            { title: 'adminNav.workflowConfig', crumb: 'adminNav.settings' },
    '/admin/employees':                  { title: 'adminNav.employeeList', crumb: 'adminNav.employees' },
    '/admin/employees/compare':          { title: 'adminNav.compare', crumb: 'adminNav.employees' },
    '/admin/employees/recognition':      { title: 'adminNav.recognition', crumb: 'adminNav.employees' },
    '/admin/employees/activity':         { title: 'adminNav.activity', crumb: 'adminNav.employees' },
    '/admin/reports':                    { title: 'adminNav.teamReports', crumb: 'adminNav.audit' },
    '/admin/departments':                { title: 'adminNav.departments', crumb: 'adminNav.organizations' },
    '/admin/permissions':                { title: 'adminNav.allPermissions', crumb: 'adminNav.permissions' },
    '/admin/permissions/assign':         { title: 'adminNav.assign', crumb: 'adminNav.permissions' },
    '/admin/organizations/map':          { title: 'adminNav.orgChart', crumb: 'adminNav.organizations' },
    '/admin/audit-logs':                 { title: 'adminNav.fullTrace', crumb: 'adminNav.audit' },
    '/admin/login-logs':                 { title: 'adminNav.loginLogs', crumb: 'adminNav.audit' },
    '/pages/front/action-plans':         { title: 'adminNav.actionPlans', crumb: 'adminNav.applications' },
  };

  if (map[pathname]) return map[pathname];
  if (pathname.startsWith('/admin/employees/') && pathname !== '/admin/employees/compare' && pathname !== '/admin/employees/recognition' && pathname !== '/admin/employees/activity')
    return { title: 'adminNav.employeeFile', crumb: 'adminNav.employees' };
    if (pathname.startsWith('/admin/action-plans/'))
    return { title: 'adminNav.planDetail', crumb: 'adminNav.actionPlans' };
  if (pathname.startsWith('/admin/claims/'))
    return { title: 'adminNav.claimDetail', crumb: 'adminNav.claimsQuality' };

  return { title: 'adminNav.adminHome', crumb: 'adminDashboard.navCrumb' };
};

export default function AdminLayout() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const { param: scopeParam, ready: scopeReady } = useOrganizationScope();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(() => readLsIds(LS_OPEN_GROUPS, DEFAULT_OPEN_GROUPS));
  const [openApSections, setOpenApSections] = useState<string[]>(() =>
    readLsIds(LS_AP_SECTIONS, DEFAULT_AP_SECTIONS),
  );
  const userMenuRef = useRef<HTMLDivElement>(null);

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeLsIds(LS_OPEN_GROUPS, next);
      return next;
    });

  const toggleApSection = (id: string) =>
    setOpenApSections((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeLsIds(LS_AP_SECTIONS, next);
      return next;
    });

  // Match pathname; when nav item has ?query, require exact query match
  const isActivePath = (path: string) => {
    const qIdx = path.indexOf('?');
    const base = qIdx >= 0 ? path.slice(0, qIdx) : path;
    const wantQuery = qIdx >= 0 ? path.slice(qIdx + 1) : '';
    const pathOk = location.pathname === base || (
      location.pathname.startsWith(`${base}/`) && base !== '/admin/action-plans'
    );
    if (!pathOk) return false;
    if (wantQuery) {
      const want = new URLSearchParams(wantQuery);
      const have = new URLSearchParams(location.search);
      let ok = true;
      want.forEach((v, k) => { if (have.get(k) !== v) ok = false; });
      return ok;
    }
    if (base === '/admin/employees' && new URLSearchParams(location.search).get('locked') === '1') {
      return false;
    }
    if (base === '/admin/users' && new URLSearchParams(location.search).get('locked') === '1') {
      return false;
    }
    return location.pathname === base;
  };

  const lockedEmployees = location.pathname === '/admin/employees' && new URLSearchParams(location.search).get('locked') === '1';
  const lockedAdmins = location.pathname === '/admin/users' && new URLSearchParams(location.search).get('locked') === '1';
  const meta = getPageMeta(location.pathname);
  const pageTitle = lockedEmployees || lockedAdmins ? t('adminNav.locked') : t(meta.title);
  const crumbLabel = t(meta.crumb);

  const userDisplayName = (user as any)?.email || (user as any)?.name || 'Utilisateur';
  const userRole = (user?.role as string) || 'Admin';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
  }, []);

  useEffect(() => {
    const groups = NAV.filter((item): item is NavGroup => !('solo' in item) && Boolean(item.sections?.length));
    const active = groups
      .map((group) => ({
        groupId: group.id,
        section: group.sections!.find((section) => section.children.some((child) => location.pathname === child.path.split('?')[0])),
      }))
      .find((entry) => entry.section);
    if (!active?.section) return;
    setOpenApSections((prev) => {
      if (prev.includes(active.section!.id)) return prev;
      const next = [...prev, active.section!.id];
      writeLsIds(LS_AP_SECTIONS, next);
      return next;
    });
    setOpenGroups((prev) => {
      if (prev.includes(active.groupId)) return prev;
      const next = [...prev, active.groupId];
      writeLsIds(LS_OPEN_GROUPS, next);
      return next;
    });
  }, [location.pathname]);

  return (
    <div className="al-root">
      <style>{`
        @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.9.0/dist/tabler-icons.min.css');

        *, *::before, *::after { box-sizing: border-box; }
        html, body, #root { overflow-y: auto; overflow-x: hidden; height: auto; min-height: 100dvh; margin: 0; }

        .al-root { min-height: 100dvh; background: #f4f6fb; font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }

        /* ─── SIDEBAR ─── */
        .al-body { display: flex; align-items: flex-start; min-height: 100dvh; }

        .al-sidebar {
          position: fixed; top: 0; left: 0; height: 100dvh;
          width: 68px; background: #fff; border-right: 1px solid #e5e7eb;
          transition: width .22s cubic-bezier(.4,0,.2,1), box-shadow .22s;
          display: flex; flex-direction: column; padding: 14px 10px;
          overflow: hidden; z-index: 200;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .al-sidebar::-webkit-scrollbar { display: none; }

        .al-sidebar.expanded {
          width: 260px;
          background: #fff;
          border-right: 1px solid #e5e7eb;
          box-shadow: 4px 0 24px rgba(0,0,0,.08);
          overflow-y: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .al-sidebar.expanded::-webkit-scrollbar { display: none; }

        /* ─── Sidebar Logo ─── */
        .al-sb-logo-wrap {
          display: flex; align-items: center; justify-content: center;
          padding: 8px 0 12px; flex-shrink: 0;
          min-height: 44px;
        }
        .al-sb-logo-wrap img {
          max-height: 32px; width: auto; max-width: 100%;
          display: block; object-fit: contain;
          transition: max-height .22s ease;
        }
        .al-sidebar:not(.expanded) .al-sb-logo-wrap {
          padding: 6px 4px 10px;
        }
        .al-sidebar:not(.expanded) .al-sb-logo-wrap img {
          max-height: 26px;
        }

        /* ─── Collapsed icon rail — clean, no background chips ─── */
        .al-sidebar:not(.expanded) .al-sidebar-link,
        .al-sidebar:not(.expanded) .al-sidebar-accordion-btn {
          justify-content: center; padding-left: 0; padding-right: 0;
          background: none;
        }
        .al-sidebar:not(.expanded) .al-sidebar-link:hover i,
        .al-sidebar:not(.expanded) .al-sidebar-accordion-btn:hover i { color: #000168; }
        .al-sidebar:not(.expanded) .al-sidebar-link.active { background: none; }
        .al-sidebar:not(.expanded) .al-sidebar-link.active i { color: #000168; }

        /* ─── Section headings ─── */
        .al-sidebar-heading {
          font-size: 9px; font-weight: 700; color: #9ca3af;
          text-transform: uppercase; letter-spacing: 2px;
          padding: 6px 6px 10px; white-space: nowrap;
          opacity: 0; transition: opacity .12s;
        }
        .al-sidebar.expanded .al-sidebar-heading { opacity: 1; transition-delay: .06s; }
        .al-sidebar:not(.expanded) .al-sidebar-heading { display: none; }

        /* ─── Main nav links ─── */
        .al-sidebar-link {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px; border-radius: 8px; text-decoration: none;
          font-size: 12.5px; font-weight: 500; color: #374151;
          transition: background .13s, color .13s;
          margin-bottom: 2px; white-space: nowrap; border: none; background: none; cursor: pointer;
          font-family: inherit; width: 100%; text-align: left;
        }
        .al-sidebar-link i { flex-shrink: 0; font-size: 16px; color: #6b7280; }

        .al-sidebar.expanded .al-sidebar-link { color: #374151; }
        .al-sidebar.expanded .al-sidebar-link i { color: #6b7280; }
        .al-sidebar.expanded .al-sidebar-link:hover { background: #f3f4f6; color: #000168; }
        .al-sidebar.expanded .al-sidebar-link:hover i { color: #000168; }
        .al-sidebar.expanded .al-sidebar-link.active {
          background: #eef2ff;
          color: #000168;
          font-weight: 600;
          border-left: 3px solid #000168;
          border-radius: 0 8px 8px 0;
          padding-left: 9px;
        }
        .al-sidebar.expanded .al-sidebar-link.active i { color: #000168; }

        /* ─── Accordion button ─── */
        .al-sidebar-accordion-btn {
          display: flex; align-items: center; gap: 12px; width: 100%;
          padding: 10px 12px; border-radius: 8px; border: none; background: none; cursor: pointer;
          font-size: 12.5px; font-weight: 500; color: #374151; font-family: inherit;
          transition: background .13s, color .13s; margin-bottom: 2px; white-space: nowrap;
        }
        .al-sidebar-accordion-btn i { color: #6b7280; flex-shrink: 0; font-size: 16px; }
        .al-sidebar-accordion-btn i.chevron { margin-left: auto; transition: transform .18s; opacity: .5; font-size: 14px; }
        .al-sidebar-accordion-btn.open i.chevron { transform: rotate(180deg); }

        .al-sidebar.expanded .al-sidebar-accordion-btn { color: #374151; }
        .al-sidebar.expanded .al-sidebar-accordion-btn i { color: #6b7280; }
        .al-sidebar.expanded .al-sidebar-accordion-btn:hover { background: #f3f4f6; color: #000168; }
        .al-sidebar.expanded .al-sidebar-accordion-btn:hover i { color: #000168; }
        .al-sidebar.expanded .al-sidebar-accordion-btn.active { color: #000168; font-weight: 600; }
        .al-sidebar.expanded .al-sidebar-accordion-btn.active i { color: #000168; }
        .al-sidebar:not(.expanded) .al-sidebar-accordion-btn.active i { color: #000168; }

        /* ─── Submenu ─── */
        .al-sidebar-submenu {
          display: flex; flex-direction: column; gap: 4px;
          max-height: 0; overflow: hidden;
          padding-left: 16px; padding-right: 4px;
          margin-bottom: 2px;
        }
        .al-sidebar:not(.expanded) .al-sidebar-submenu { display: none; }
        .al-sidebar.expanded .al-sidebar-submenu.open {
          max-height: 1200px; transition: max-height .22s ease;
          padding-top: 4px;
          overflow-y: auto;
        }

        /* ─── Nested Action Plan sections ─── */
        .al-sidebar-section {
          margin: 2px 0 6px;
        }
        .al-sidebar-section-btn {
          display: flex; align-items: center; gap: 6px; width: 100%;
          padding: 6px 10px; border: none; background: none; cursor: pointer;
          font: inherit; font-size: 10.5px; font-weight: 700; letter-spacing: .4px;
          text-transform: uppercase; color: #94a3b8; text-align: left;
          border-radius: 6px;
        }
        .al-sidebar-section-btn:hover { color: #000168; background: #f8fafc; }
        .al-sidebar-section-btn.active { color: #000168; }
        .al-sidebar-section-btn i.chevron {
          margin-left: auto; font-size: 12px; opacity: .55;
          transition: transform .18s;
        }
        .al-sidebar-section-btn.open i.chevron { transform: rotate(180deg); }
        .al-sidebar-section-menu {
          display: flex; flex-direction: column; gap: 3px;
          max-height: 0; overflow: hidden; padding-left: 4px;
        }
        .al-sidebar-section-menu.open {
          max-height: 480px; padding-top: 2px; padding-bottom: 4px;
        }

        /* ─── Sublinks — pill style ─── */
        .al-sidebar-sublink {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 14px;
          border-radius: 20px;
          text-decoration: none;
          font-size: 12px; font-weight: 500;
          color: #6b7280;
          transition: background .13s, color .13s;
          white-space: nowrap; border: none; background: none; cursor: pointer;
          font-family: inherit; width: 100%; text-align: left;
        }
        .al-sidebar-sublink::before {
          content: '';
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #d1d5db;
          flex-shrink: 0;
          transition: background .13s;
        }
        .al-sidebar-sublink:hover {
          background: #f3f4f6;
          color: #111827;
        }
        .al-sidebar-sublink:hover::before { background: #000168; }
        .al-sidebar-sublink.active {
          background: #eef2ff;
          color: #000168;
          font-weight: 600;
          box-shadow: 0 1px 4px rgba(0,1,104,.12);
        }
        .al-sidebar-sublink.active::before { background: #000168; }

        /* ─── Divider ─── */
        .al-sidebar-divider { height: 1px; background: #f0f0f4; margin: 10px 2px; flex-shrink: 0; }
        .al-sidebar:not(.expanded) .al-sidebar-divider { display: none; }

        .al-sidebar-label { opacity: 0; transition: opacity .1s; overflow: hidden; }
        .al-sidebar.expanded .al-sidebar-label { opacity: 1; transition-delay: .06s; }

        /* ─── Content shell ─── */
        .al-content-shell {
          flex: 1 1 auto; min-width: 0; margin-left: 68px;
          transition: margin-left .22s cubic-bezier(.4,0,.2,1);
        }
        .al-content-shell.shifted { margin-left: 260px; }
        .al-main { display: block; min-width: 0; max-width: 100%; }

        /* ─── Topbar inside content ─── */
        .al-topbar {
          background: #fff; height: 52px; padding: 0 24px;
          display: flex; align-items: center; justify-content: space-between;
          border-bottom: 1px solid #e4e8f2; flex-shrink: 0;
          position: sticky; top: 0; z-index: 50;
        }
        .al-tb-left { display: flex; flex-direction: column; }
        .al-tb-title {
          font-family: Inter, sans-serif; font-size: 14px; font-weight: 700;
          color: #000168; letter-spacing: -0.2px;
        }
        .al-tb-crumb {
          font-size: 10px; color: #94a3b8;
          display: flex; align-items: center; gap: 4px; margin-top: 2px;
        }
        .al-tb-right { display: flex; align-items: center; gap: 8px; }

        /* ─── Topbar icons ─── */
        .al-tb-ico {
          width: 34px; height: 34px; border-radius: 8px;
          border: 1px solid #e4e8f2; background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #64748b; position: relative; transition: color .15s;
        }
        .al-tb-ico:hover { color: #000168; }
        .al-tb-date {
          font-size: 11px; color: #64748b; background: #f4f6fb;
          border: 1px solid #e4e8f2; border-radius: 8px;
          padding: 6px 11px; display: flex; align-items: center; gap: 5px;
        }

        /* ─── User dropdown in topbar ─── */
        .al-tb-user-wrap { position: relative; }
        .al-tb-user-btn {
          display: flex; align-items: center; gap: 8px; padding: 5px 10px 5px 5px;
          border-radius: 8px; border: 1px solid #e4e8f2;
          background: #fff; cursor: pointer;
          transition: border-color .15s, box-shadow .15s; outline: none;
        }
        .al-tb-user-btn:hover { border-color: #c7cfdc; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
        .al-tb-avatar {
          flex-shrink: 0;
        }
        .al-tb-user-info { display: flex; flex-direction: column; line-height: 1.2; text-align: left; }
        .al-tb-user-name { font-size: 12px; font-weight: 600; color: #111827; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .al-tb-user-role { font-size: 10px; color: #9ca3af; }
        .al-tb-chevron { color: #9ca3af; transition: transform .2s; flex-shrink: 0; }
        .al-tb-chevron.open { transform: rotate(180deg); }

        .al-tb-dropdown {
          position: absolute; top: calc(100% + 8px); right: 0;
          background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;
          box-shadow: 0 8px 32px rgba(0,0,0,.12); min-width: 200px;
          padding: 6px; overflow: hidden; animation: al-drop .15s ease; z-index: 300;
        }
        @keyframes al-drop { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
        .al-tb-drop-header { padding: 10px 12px 8px; border-bottom: 1px solid #f3f4f6; margin-bottom: 4px; }
        .al-tb-drop-name { font-size: 13px; font-weight: 600; color: #111827; }
        .al-tb-drop-email { font-size: 11px; color: #9ca3af; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .al-tb-drop-item {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 12px; border-radius: 6px; cursor: pointer;
          font-size: 13px; font-weight: 500; color: #374151; text-decoration: none;
          transition: background .12s; border: none; background: none; font-family: inherit; width: 100%; text-align: left;
        }
        .al-tb-drop-item:hover { background: #f9fafb; }
        .al-tb-drop-item.danger { color: #dc2626; }
        .al-tb-drop-item.danger:hover { background: #fef2f2; }
        .al-tb-drop-divider { height: 1px; background: #f3f4f6; margin: 4px 0; }

        .al-page { padding: 20px 24px; min-height: calc(100dvh - 52px); min-width: 0; max-width: 100%; box-sizing: border-box; }

        @media (max-width: 768px) {
          .al-tb-user-info { display: none; }
          .al-tb-date { display: none; }
        }
      `}</style>

      <div className="al-body">
        {/* ─── SIDEBAR ─── */}
        <div
          className={`al-sidebar${sidebarExpanded ? ' expanded' : ''}`}
          onMouseEnter={() => setSidebarExpanded(true)}
          onMouseLeave={() => setSidebarExpanded(false)}
        >
          {/* Logo at top of sidebar */}
          <div className="al-sb-logo-wrap">
            <img src="/logo-coficab2.png" alt="COFICAB" />
          </div>

          <div className="al-sidebar-heading">Navigation</div>

          {NAV.map(item => {
            if ('solo' in item) {
              const active = isActivePath(item.path);
              return (
                <button
                  key={item.id}
                  className={`al-sidebar-link ${active ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                >
                  <i className={`ti ${item.icon}`} />
                  {sidebarExpanded && <span className="al-sidebar-label">{t(item.label)}</span>}
                </button>
              );
            }

            const isOpen   = openGroups.includes(item.id);
            const links    = groupLinks(item);
            const isActive = links.some(c => isActivePath(c.path));

            return (
              <div key={item.id}>
                {item.id === 'employees' && sidebarExpanded && <div className="al-sidebar-heading">{t('adminNav.management')}</div>}
                {item.id === 'audit'     && sidebarExpanded && <div className="al-sidebar-heading">{t('adminNav.system')}</div>}
                <button
                  className={`al-sidebar-accordion-btn ${isActive ? 'active' : ''} ${isOpen ? 'open' : ''}`}
                  onClick={() => toggleGroup(item.id)}
                >
                  <i className={`ti ${item.icon}`} />
                  {sidebarExpanded && <span className="al-sidebar-label">{t(item.label)}</span>}
                  {sidebarExpanded && <i className="ti ti-chevron-down chevron" />}
                </button>
                <div className={`al-sidebar-submenu ${isOpen ? 'open' : ''}`}>
                  {item.sections?.length
                    ? item.sections.map((section) => {
                        const secOpen = openApSections.includes(section.id);
                        const secActive = section.children.some((c) => isActivePath(c.path));
                        return (
                          <div key={section.id} className="al-sidebar-section">
                            <button
                              type="button"
                              className={`al-sidebar-section-btn ${secOpen ? 'open' : ''} ${secActive ? 'active' : ''}`}
                              onClick={() => toggleApSection(section.id)}
                            >
                              {t(section.label)}
                              <i className="ti ti-chevron-down chevron" />
                            </button>
                            <div className={`al-sidebar-section-menu ${secOpen ? 'open' : ''}`}>
                              {section.children.map((c) => (
                                <button
                                  key={c.path + c.label}
                                  type="button"
                                  className={`al-sidebar-sublink ${isActivePath(c.path) ? 'active' : ''}`}
                                  onClick={() => navigate(c.path)}
                                >
                                  {t(c.label)}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    : (item.children || []).map((c) => (
                        <button
                          key={c.path + c.label}
                          type="button"
                          className={`al-sidebar-sublink ${isActivePath(c.path) ? 'active' : ''}`}
                          onClick={() => navigate(c.path)}
                        >
                          {t(c.label)}
                        </button>
                      ))}
                </div>
              </div>
            );
          })}

          <div className="al-sidebar-divider" />
          <button
            className="al-sidebar-link"
            onClick={logout}
            style={{ marginTop: 'auto' }}
          >
            <i className="ti ti-logout" />
            {sidebarExpanded && <span className="al-sidebar-label">{t('adminNav.logout')}</span>}
          </button>
        </div>

        {/* ─── CONTENT ─── */}
        <div className={`al-content-shell${sidebarExpanded ? ' shifted' : ''}`}>
          <div className="al-topbar">
            <div className="al-tb-left">
              <div className="al-tb-title">{pageTitle}</div>
              <div className="al-tb-crumb">
                <i className="ti ti-home" style={{ fontSize: 11 }} /> Admin
                <i className="ti ti-chevron-right" style={{ fontSize: 11 }} />
                {crumbLabel}
              </div>
            </div>
            <div className="al-tb-right">
              <OrganizationScopePicker />
              {/* Real bell (was a static icon with a permanent red dot) */}
              <div className="al-tb-ico">
                <NotificationBell />
              </div>
              <div className="al-tb-ico"><Search size={16} /></div>
              <div className="al-tb-date">
                <Calendar size={14} />
                {new Date().toLocaleDateString(i18n.language?.startsWith('en') ? 'en-GB' : i18n.language?.startsWith('it') ? 'it-IT' : 'fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
              <LanguageSwitcher compact />

              {/* User dropdown moved to topbar */}
              <div className="al-tb-user-wrap" ref={userMenuRef}>
                <button className="al-tb-user-btn" onClick={() => setUserMenuOpen(v => !v)}>
                  <UserAvatar user={user as any} size={28} className="al-tb-avatar" />
                  <div className="al-tb-user-info">
                    <span className="al-tb-user-name">{userDisplayName}</span>
                    <span className="al-tb-user-role">{userRole}</span>
                  </div>
                  <ChevronDown size={14} className={`al-tb-chevron${userMenuOpen ? ' open' : ''}`} />
                </button>

                {userMenuOpen && (
                  <div className="al-tb-dropdown">
                    <div className="al-tb-drop-header">
                      <div className="al-tb-drop-name">{userRole}</div>
                      <div className="al-tb-drop-email">{userDisplayName}</div>
                    </div>
                    <Link to="/admin/dashboard" className="al-tb-drop-item" onClick={() => setUserMenuOpen(false)}>
                      <LayoutDashboard size={15} /> Vue globale
                    </Link>
                    <Link to="/admin/profile" className="al-tb-drop-item" onClick={() => setUserMenuOpen(false)}>
                      <i className="ti ti-user" style={{ fontSize: 15 }} /> Mon profil
                    </Link>
                    <Link to="/admin/users" className="al-tb-drop-item" onClick={() => setUserMenuOpen(false)}>
                      <i className="ti ti-users" style={{ fontSize: 15 }} /> Utilisateurs IAM
                    </Link>
                    <div className="al-tb-drop-divider" />
                    <button className="al-tb-drop-item danger" onClick={() => { setUserMenuOpen(false); logout(); }}>
                      <LogOut size={15} /> {t('adminNav.logout')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <main className="al-main">
            <div className="al-page">
              {scopeReady ? <Outlet key={scopeParam ?? 'all'} /> : null}
            </div>
          </main>
        </div>
      </div>
      <QualityAssistantWidget scope="admin" />
    </div>
  );
}