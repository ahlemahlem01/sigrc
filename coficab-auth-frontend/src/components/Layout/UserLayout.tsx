import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Outlet, useLocation, useNavigate, Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { AppWindow, LogOut, ChevronDown, Calendar, User } from 'lucide-react';
import { NotificationBell } from '../NotificationBell';
import UserAvatar from '../UserAvatar';
import LanguageSwitcher from '../LanguageSwitcher';
import QualityAssistantWidget from '../QualityAssistant/QualityAssistantWidget';

type NavChild = { labelKey: string; icon: string; path: string };
type NavGroup = { id: string; labelKey: string; icon: string; children: NavChild[] };
type NavSolo  = { id: string; labelKey: string; icon: string; path: string; solo: true };
type NavItem  = NavGroup | NavSolo;

const NAV: NavItem[] = [
  {
    id: 'dashboard',
    labelKey: 'employeeNav.dashboard',
    icon: 'ti-layout-dashboard',
    path: '/dashboard',
    solo: true,
  },
  {
    id: 'profile',
    labelKey: 'employeeNav.profile',
    icon: 'ti-user',
    path: '/profile',
    solo: true,
  },
  {
    id: 'competences',
    labelKey: 'employeeNav.competences',
    icon: 'ti-chart-dots-3',
    path: '/competences',
    solo: true,
  },
  {
    id: 'badges',
    labelKey: 'employeeNav.badges',
    icon: 'ti-award',
    path: '/badges',
    solo: true,
  },
  {
    id: 'documents',
    labelKey: 'employeeNav.documents',
    icon: 'ti-files',
    path: '/documents',
    solo: true,
  },
  {
    id: 'actionplans',
    labelKey: 'employeeNav.myActionPlans',
    icon: 'ti-file-description',
    path: '/action-plans',
    solo: true,
  },
  {
    id: 'eightd',
    labelKey: 'employeeNav.eightD',
    icon: 'ti-list-numbers',
    path: '/eight-d',
    solo: true,
  },
];

function getPageMeta(
  pathname: string,
  t: (key: string) => string
): { title: string; crumb: string } {
  const map: Record<string, { title: string; crumb: string }> = {
    '/dashboard': { title: t('employeeNav.titles.dashboard'), crumb: t('employeeNav.crumbs.dashboard') },
    '/profile': { title: t('employeeNav.titles.profile'), crumb: t('employeeNav.crumbs.profile') },
    '/competences': { title: t('employeeNav.titles.competences'), crumb: t('employeeNav.crumbs.competences') },
    '/badges': { title: t('employeeNav.titles.badges'), crumb: t('employeeNav.crumbs.badges') },
    '/documents': { title: t('employeeNav.titles.documents'), crumb: t('employeeNav.crumbs.documents') },
    '/eight-d': { title: t('employeeNav.titles.eightD'), crumb: t('employeeNav.crumbs.eightD') },
    '/action-plans': { title: t('employeeNav.titles.actionPlans'), crumb: t('employeeNav.crumbs.actionPlans') },
    '/pages/front': { title: t('employeeNav.titles.frontPortal'), crumb: t('employeeNav.crumbs.portal') },
    '/pages/front/my-action-plans': {
      title: t('employeeNav.titles.myPlansFront'),
      crumb: t('employeeNav.crumbs.portal'),
    },
  };

  if (map[pathname]) return map[pathname];
  if (pathname.includes('/action-plans/') && pathname.includes('/summary'))
    return { title: t('employeeNav.titles.planSummary'), crumb: t('employeeNav.crumbs.actionPlans') };
  if (pathname.includes('/action-plans/'))
    return { title: t('employeeNav.titles.planDetail'), crumb: t('employeeNav.crumbs.actionPlans') };

  return { title: t('employeeNav.titles.default'), crumb: t('employeeNav.crumbs.home') };
}

export default function UserLayout() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>(['actionplans']);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const toggleGroup = (id: string) =>
    setOpenGroups(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

  const isActivePath = (path: string) => {
    const base = path.split('?')[0];
    if (base === '/dashboard') return location.pathname === '/dashboard';
    if (base === '/profile') return location.pathname === '/profile';
    if (base === '/competences') return location.pathname === '/competences';
    if (base === '/badges') return location.pathname === '/badges';
    if (base === '/documents') return location.pathname === '/documents';
    return location.pathname === base || location.pathname.startsWith(base + '/');
  };

  const { title, crumb } = useMemo(
    () => getPageMeta(location.pathname, t),
    [location.pathname, t]
  );

  const dateLocale = i18n.language?.startsWith('en')
    ? 'en-GB'
    : i18n.language?.startsWith('it')
      ? 'it-IT'
      : 'fr-FR';

  const userDisplayName =
    (user as any)?.name || (user as any)?.fullName || (user as any)?.email || t('employeeNav.roles.user');
  
  const getRoleLabel = (role: string | string[]) => {
    const r = Array.isArray(role) ? role[0] : role;
    if (r === 'superadmin') return t('employeeNav.roles.superadmin');
    if (r === 'admin') return t('employeeNav.roles.admin');
    return t('employeeNav.roles.user');
  };

  // Fermeture du menu de profil lors d'un clic à l'extérieur
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

        /* ─── Collapsed Rail Icons ─── */
        .al-sidebar:not(.expanded) .al-sidebar-link,
        .al-sidebar:not(.expanded) .al-sidebar-accordion-btn {
          justify-content: center; padding-left: 0; padding-right: 0;
          background: none;
        }
        .al-sidebar:not(.expanded) .al-sidebar-link:hover i,
        .al-sidebar:not(.expanded) .al-sidebar-accordion-btn:hover i { color: #000168; }
        .al-sidebar:not(.expanded) .al-sidebar-link.active { background: none; }
        .al-sidebar:not(.expanded) .al-sidebar-link.active i { color: #000168; }

        /* ─── Section Headings ─── */
        .al-sidebar-heading {
          font-size: 9px; font-weight: 700; color: #9ca3af;
          text-transform: uppercase; letter-spacing: 2px;
          padding: 6px 6px 10px; white-space: nowrap;
          opacity: 0; transition: opacity .12s;
        }
        .al-sidebar.expanded .al-sidebar-heading { opacity: 1; transition-delay: .06s; }
        .al-sidebar:not(.expanded) .al-sidebar-heading { display: none; }

        /* ─── Main Nav Links ─── */
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
          max-height: 300px; transition: max-height .22s ease;
          padding-top: 4px;
        }

        /* ─── Sublinks ─── */
        .al-sidebar-sublink {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 14px; border-radius: 20px; text-decoration: none;
          font-size: 12px; font-weight: 500; color: #6b7280;
          transition: background .13s, color .13s;
          white-space: nowrap; border: none; background: none; cursor: pointer;
          font-family: inherit; width: 100%; text-align: left;
        }
        .al-sidebar-sublink::before {
          content: ''; width: 5px; height: 5px; border-radius: 50%;
          background: #d1d5db; flex-shrink: 0; transition: background .13s;
        }
        .al-sidebar-sublink:hover { background: #f3f4f6; color: #111827; }
        .al-sidebar-sublink:hover::before { background: #000168; }
        .al-sidebar-sublink.active {
          background: #eef2ff; color: #000168; font-weight: 600;
          box-shadow: 0 1px 4px rgba(0,1,104,.12);
        }
        .al-sidebar-sublink.active::before { background: #000168; }

        /* ─── Divider ─── */
        .al-sidebar-divider { height: 1px; background: #f0f0f4; margin: 10px 2px; flex-shrink: 0; }
        .al-sidebar:not(.expanded) .al-sidebar-divider { display: none; }

        .al-sidebar-label { opacity: 0; transition: opacity .1s; overflow: hidden; }
        .al-sidebar.expanded .al-sidebar-label { opacity: 1; transition-delay: .06s; }

        /* ─── Content Shell ─── */
        .al-content-shell {
          flex: 1 1 auto; min-width: 0; margin-left: 68px;
          transition: margin-left .22s cubic-bezier(.4,0,.2,1);
        }
        .al-content-shell.shifted { margin-left: 260px; }

        /* ─── Topbar ─── */
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

        /* ─── Topbar Icons & Elements ─── */
        .al-tb-ico {
          width: 34px; height: 34px; border-radius: 8px;
          border: 1px solid #e4e8f2; background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #64748b; position: relative; transition: color .15s;
        }
        .al-tb-ico.rec-tb-bell {
          width: auto; height: auto; padding: 0;
          overflow: visible; border: 1px solid #e4e8f2;
        }
        .al-tb-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #e24b4a;
          position: absolute; top: 6px; right: 6px; border: 1.5px solid #fff;
        }
        .al-tb-date {
          font-size: 11px; color: #64748b; background: #f4f6fb;
          border: 1px solid #e4e8f2; border-radius: 8px;
          padding: 6px 11px; display: flex; align-items: center; gap: 5px;
        }

        /* ─── User Dropdown ─── */
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

        .al-page { padding: 20px 24px; min-height: calc(100dvh - 52px); }

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
          {/* Logo */}
          <div className="al-sb-logo-wrap">
            <img src="/logo-coficab2.png" alt="COFICAB" />
          </div>

          <div className="al-sidebar-divider" />
          <div className="al-sidebar-heading">{t('employeeNav.mainMenu')}</div>

          {/* Navigation Éléments */}
          {NAV.map(item => {
            if ('solo' in item) {
              const active = isActivePath(item.path);
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`al-sidebar-link${active ? ' active' : ''}`}
                >
                  <i className={`ti ${item.icon}`} />
                  <span className="al-sidebar-label">{t(item.labelKey)}</span>
                </Link>
              );
            }

            const isGroupOpen = openGroups.includes(item.id);
            const hasActiveChild = item.children.some(child => isActivePath(child.path));

            return (
              <div key={item.id} className="al-sidebar-group">
                <button
                  onClick={() => toggleGroup(item.id)}
                  className={`al-sidebar-accordion-btn${isGroupOpen ? ' open' : ''}${hasActiveChild ? ' active' : ''}`}
                >
                  <i className={`ti ${item.icon}`} />
                  <span className="al-sidebar-label">{t(item.labelKey)}</span>
                  {sidebarExpanded && <ChevronDown className="chevron" size={14} />}
                </button>

                <div className={`al-sidebar-submenu${isGroupOpen ? ' open' : ''}`}>
                  {item.children.map(child => {
                    const childActive = isActivePath(child.path);
                    return (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        className={`al-sidebar-sublink${childActive ? ' active' : ''}`}
                      >
                        <span className="al-sidebar-label">{t(child.labelKey)}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── MAIN CONTENT SHELL ─── */}
        <div className={`al-content-shell${sidebarExpanded ? ' shifted' : ''}`}>
          {/* TOPBAR */}
          <header className="al-topbar">
            <div className="al-tb-left">
              <h1 className="al-tb-title">{title}</h1>
              <div className="al-tb-crumb">
                <span>{t('employeeNav.clientSpace')}</span>
                <span>/</span>
                <span style={{ color: '#64748b' }}>{crumb}</span>
              </div>
            </div>

            <div className="al-tb-right">
              <LanguageSwitcher compact />

              <div className="al-tb-date">
                <Calendar size={14} />
                <span>{new Date().toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              </div>

              <div className="al-tb-ico rec-tb-bell">
                <NotificationBell />
              </div>

              {/* User Dropdown */}
              <div className="al-tb-user-wrap" ref={userMenuRef}>
                <button className="al-tb-user-btn" onClick={() => setUserMenuOpen(!userMenuOpen)}>
                  <UserAvatar user={user as any} size={28} className="al-tb-avatar" />
                  <div className="al-tb-user-info">
                    <span className="al-tb-user-name">{userDisplayName}</span>
                    <span className="al-tb-user-role">{getRoleLabel(user?.role || '')}</span>
                  </div>
                  <ChevronDown className={`al-tb-chevron ${userMenuOpen ? 'open' : ''}`} size={14} />
                </button>

                {userMenuOpen && (
                  <div className="al-tb-dropdown">
                    <div className="al-tb-drop-header">
                      <div className="al-tb-drop-name">{userDisplayName}</div>
                      <div className="al-tb-drop-email">{(user as any)?.email || ''}</div>
                    </div>

                    <button className="al-tb-drop-item" onClick={() => { navigate('/profile'); setUserMenuOpen(false); }}>
                      <User size={14} />
                      <span>{t('employeeNav.myProfile')}</span>
                    </button>

                    <button className="al-tb-drop-item" onClick={() => { navigate('/pages/front'); setUserMenuOpen(false); }}>
                      <AppWindow size={14} />
                      <span>{t('employeeNav.frontPortal')}</span>
                    </button>

                    <div className="al-tb-drop-divider" />

                    <button className="al-tb-drop-item danger" onClick={logout}>
                      <LogOut size={14} />
                      <span>{t('employeeNav.logout')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* PAGE CONTENT CONTAINER */}
          <main className="al-main">
            <div className="al-page">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <QualityAssistantWidget scope="employee" />
    </div>
  );
}