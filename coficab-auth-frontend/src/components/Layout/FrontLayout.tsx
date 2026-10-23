import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import {
  LogOut, LayoutDashboard, ShieldCheck, CheckCircle2, PlusCircle,
  Users, ClipboardList, History, FileText, AlertTriangle, BookOpen,
  CalendarDays, CalendarClock, AppWindow,
} from 'lucide-react';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { NotificationBell } from '../NotificationBell';
import UserAvatar from '../UserAvatar';
import LanguageSwitcher from '../LanguageSwitcher';
import QualityAssistantWidget from '../QualityAssistant/QualityAssistantWidget';

// Target route for Quality Analyses
const QUALITY_ANALYSIS_PATH = '/pages/front/quality-analyses';

const FrontLayout = () => {
  const { t } = useTranslation();
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isAdmin = user && (
    Array.isArray(user.role)
      ? user.role.includes('admin') || user.role.includes('superadmin') || user.role.includes('ADMIN_QUALITY')
      : user.role === 'admin' || user.role === 'superadmin' || user.role === 'ADMIN_QUALITY'
  );

  const handleLogout = () => { logout(); navigate('/'); };

  const userDisplayName = (user as any)?.email || (user as any)?.name || t('employeeNav.roles.user');
  const userRole = isAdmin ? t('employeeNav.qualityAdmin') : t('employeeNav.operator');

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  /** Agenda owns /action-plans/calendar — must not light up "Plans d'action". */
  const isAgendaPath =
    location.pathname === '/pages/front/action-plans/calendar' ||
    location.pathname.startsWith('/pages/front/agenda');

  const isPlansNavActive =
    !isAgendaPath &&
    (location.pathname === '/pages/front/action-plans' ||
      location.pathname.startsWith('/pages/front/action-plans/'));

  const isQualityPath =
    isActive(QUALITY_ANALYSIS_PATH) || isActive('/pages/front/my-claims') || location.pathname === '/alerts' ||
    isActive('/pages/front/alerts') || isActive('/claims');

  /** The first level of the menu: the sections. Also shown as a row under the bar on narrow screens. */
  const mainLinks: Array<{ to: string; label: string; active: boolean }> = [
    { to: '/pages/front', label: t('employeeWorkspace.frontHome'), active: location.pathname === '/pages/front' },
    ...(isAdmin ? [
      { to: '/pages/front/pilotage', label: t('pilotage.nav'), active: isActive('/pages/front/pilotage') },
      { to: '/pages/front/validations', label: t('employeeWorkspace.frontValidationsLabel'), active: isActive('/pages/front/validations') },
    ] : []),
    ...(isAuthenticated ? [
      {
        to: isAdmin ? '/pages/front/action-plans' : '/pages/front/my-action-plans',
        label: t(isAdmin ? 'employeeWorkspace.frontPlans' : 'employeeWorkspace.frontMyPlans'),
        active: isPlansNavActive || isActive('/pages/front/my-action-plans'),
      },
      { to: '/pages/front/agenda/deadlines', label: t('employeeWorkspace.frontAgenda'), active: isAgendaPath },
      { to: QUALITY_ANALYSIS_PATH, label: t('employeeWorkspace.frontQuality'), active: isQualityPath },
    ] : []),
  ];

  /** The second level of the menu: the pages of the section being viewed (no more hover menus). */
  type SubLink = { to: string; label: string; icon: ReactNode; active: boolean };
  const here = location.pathname;
  const QP = QUALITY_ANALYSIS_PATH;
  const PLANS = '/pages/front/action-plans';
  let subLinks: SubLink[] = [];
  let subAction: { to: string; label: string } | null = null;
  if (isAuthenticated && isAgendaPath) {
    subLinks = [
      { to: '/pages/front/agenda/deadlines', label: t('employeeWorkspace.frontDeadlines'), icon: <CalendarClock size={14} />, active: here === '/pages/front/agenda/deadlines' },
      { to: `${PLANS}/calendar`, label: t('employeeWorkspace.frontCalendar'), icon: <CalendarDays size={14} />, active: here === `${PLANS}/calendar` },
    ];
  } else if (isAuthenticated && isAdmin && isPlansNavActive) {
    subLinks = [
      { to: PLANS, label: t('employeeWorkspace.frontAllPlans'), icon: <ClipboardList size={14} />, active: here === PLANS || (here.startsWith(`${PLANS}/`) && here !== `${PLANS}/history` && !isActive(`${PLANS}/assignments`)) },
      { to: `${PLANS}/history`, label: t('employeeWorkspace.frontHistory'), icon: <History size={14} />, active: here === `${PLANS}/history` },
      { to: `${PLANS}/assignments`, label: t('employeeWorkspace.frontAssignments'), icon: <Users size={14} />, active: isActive(`${PLANS}/assignments`) },
    ];
  } else if (isAuthenticated && isQualityPath) {
    subLinks = [
      { to: '/alerts', label: t('employeeWorkspace.frontAlerts'), icon: <AlertTriangle size={14} />, active: here === '/alerts' || here === '/pages/front/alerts' },
      {
        to: QP,
        label: isAdmin ? t('frontNav.claimsDirectory') : t('frontNav.myClaims'),
        icon: <ShieldCheck size={14} />,
        active: here === QP || here === '/pages/front/my-claims' || here === `${QP}/assigned`,
      },
      ...(isAdmin
        ? [{ to: `${QP}/managed`, label: t('frontNav.myCreatedClaims'), icon: <Users size={14} />, active: here === `${QP}/managed` }]
        : [{ to: `${QP}/closed`, label: t('closedArchive.title'), icon: <CheckCircle2 size={14} />, active: here === `${QP}/closed` }]),
      { to: `${QP}/drafts`, label: t('drafts.title'), icon: <FileText size={14} />, active: here === `${QP}/drafts` },
      { to: `${QP}/history`, label: t('frontNav.history'), icon: <History size={14} />, active: here === `${QP}/history` },
      { to: `${QP}/parcours`, label: t('frontNav.guide'), icon: <BookOpen size={14} />, active: here.startsWith(`${QP}/parcours`) },
    ];
    subAction = { to: `${QP}/new`, label: t('claimsList.newClaim') };
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 15);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
    <div className="fl-root">
      <style>{`

        *, *::before, *::after { box-sizing: border-box; }
        html, body, #root { overflow-y: auto; overflow-x: hidden; height: auto; min-height: 100dvh; margin: 0; }

        .fl-root { 
          min-height: 100dvh; 
          background: #f8fafc; 
          font-family: 'Inter', system-ui, -apple-system, sans-serif; 
          -webkit-font-smoothing: antialiased; 
        }

        /* ─── BARRE DE NAVIGATION ─── */
        .fl-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 300;
          background: #000168;
          height: 56px; 
          overflow: visible;
          transition: height 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .fl-nav.scrolled { 
          background: #000168;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1); 
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
          height: 52px;
        }
        
        .fl-nav-inner {
          max-width: 1400px; margin: 0 auto; padding: 0 40px;
          height: 100%; display: flex; align-items: center; justify-content: space-between;
        }

        .fl-brand { display: flex; align-items: center; text-decoration: none; transition: opacity 0.2s; }
        .fl-brand:hover { opacity: 0.85; }
        .fl-brand img { height: 32px; width: auto; display: block; filter: brightness(1.15); }

        /* ─── MENU CENTRAL ─── */
        .fl-nav-links {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 18px;
          flex: 1 1 auto;
          min-width: 0;
          flex-wrap: nowrap;
          overflow: visible;
          height: 100%;
          margin: 0 16px;
        }
        .fl-nav-link {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          height: 100%;
          padding: 0;
          color: rgba(255, 255, 255, 0.65);
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          letter-spacing: 0.01em;
          white-space: nowrap;
          flex-shrink: 0;
          line-height: 1;
          transition: color 0.25s ease;
        }
        .fl-nav-link:hover { 
          color: #fff; 
        }
        .fl-nav-link.active { 
          color: #fff; 
          font-weight: 600; 
        }
        .fl-nav-link.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: #3b82f6;
          border-radius: 2px 2px 0 0;
        }
        
        /* ─── DROPDOWNS ─── */
        .fl-nav-dropdown-wrap {
          position: relative;
          display: flex;
          align-items: center;
          height: 100%;
          flex-shrink: 0;
        }
        .fl-nav-dropdown-menu {
          position: absolute; top: calc(100% + 0px); left: 50%;
          transform: translateX(-50%) translateY(8px) scale(0.97);
          background: rgba(0, 1, 104, 0.98); 
          border: 1px solid rgba(255, 255, 255, 0.08); 
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.4); 
          min-width: 220px;
          padding: 6px; opacity: 0; visibility: hidden;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); 
          backdrop-filter: blur(16px);
          z-index: 400;
          pointer-events: none;
        }
        .fl-nav-dropdown-wrap:hover .fl-nav-dropdown-menu,
        .fl-nav-dropdown-wrap:focus-within .fl-nav-dropdown-menu {
          opacity: 1; visibility: visible; 
          transform: translateX(-50%) translateY(0) scale(1);
          pointer-events: auto;
        }
        .fl-nav-dropdown-item {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; border-radius: 8px;
          color: rgba(255, 255, 255, 0.7); text-decoration: none; font-size: 13px; font-weight: 500;
          transition: all 0.15s ease;
        }
        .fl-nav-dropdown-item:hover { 
          background: rgba(255, 255, 255, 0.08); 
          color: #fff; 
        }
        .fl-nav-dropdown-item.active { 
          background: rgba(255, 255, 255, 0.12); 
          color: #fff; 
          font-weight: 600;
        }

        .fl-right { display: flex; align-items: center; gap: 16px; }
        .fl-bell {
          display: flex; align-items: center; justify-content: center;
          width: 40px; height: 40px; border-radius: 10px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.1);
          transition: background .15s ease;
        }
        .fl-bell:hover { background: rgba(255,255,255,.12); }

        /* ─── PROFIL DE L'UTILISATEUR ─── */
        .fl-user-wrap { position: relative; }
        .fl-user-btn {
          display: flex; align-items: center; gap: 12px;
          background: transparent; border: none; padding: 0; cursor: pointer;
          outline: none; transition: opacity 0.2s;
        }
        .fl-user-btn:hover { 
          opacity: 0.9;
        }
        
        .fl-avatar {
          flex-shrink: 0;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.25);
        }
        
        .fl-user-info { display: flex; flex-direction: column; line-height: 1.25; text-align: left; }
        .fl-user-name { font-size: 13px; font-weight: 500; color: #fff; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fl-user-role { font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.6px; margin-top: 1px; }

        .fl-dropdown {
          position: absolute; top: calc(100% + 16px); right: 0;
          background: rgba(0, 1, 80, 0.98); 
          border: 1px solid rgba(255, 255, 255, 0.08); 
          border-radius: 12px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5); 
          min-width: 230px;
          padding: 6px; overflow: hidden;
          transform-origin: top right;
          backdrop-filter: blur(16px);
          animation: fl-drop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes fl-drop { 
          from { opacity: 0; transform: scale(0.97) translateY(-6px); } 
          to { opacity: 1; transform: scale(1) translateY(0); } 
        }
        
        .fl-drop-header { padding: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); margin-bottom: 4px; }
        .fl-drop-name { font-size: 9px; font-weight: 700; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.8px; }
        .fl-drop-email { font-size: 13px; font-weight: 500; color: #fff; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        
        .fl-drop-item {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 6px; cursor: pointer;
          font-size: 13px; font-weight: 500; color: rgba(255, 255, 255, 0.7); text-decoration: none;
          transition: all 0.15s ease;
        }
        .fl-drop-item:hover { background: rgba(255, 255, 255, 0.06); color: #fff; }
        .fl-drop-item.danger { color: #f87171; }
        .fl-drop-item.danger:hover { background: rgba(239, 68, 68, 0.12); color: #f87171; }
        .fl-drop-divider { height: 1px; background: rgba(255, 255, 255, 0.06); margin: 4px 0; }

        .fl-login-btn {
          padding: 8px 20px; background: #fff; color: #000168;
          border: none; border-radius: 9999px; font-size: 13px; font-weight: 600;
          text-decoration: none; transition: all 0.25s ease;
        }
        .fl-login-btn:hover { 
          background: rgba(255, 255, 255, 0.9);
          transform: translateY(-1px);
        }

        .fl-main { display: block; min-height: calc(100dvh - 56px); padding-top: 56px; }
        .fl-subnav {
          position: sticky; top: 56px; z-index: 40; display: flex; align-items: center; gap: 2px;
          background: #fff; border-bottom: 1px solid #e5e9f2; padding: 0 24px; overflow-x: auto; scrollbar-width: none;
        }
        .fl-subnav-link {
          display: inline-flex; align-items: center; gap: 6px; padding: 12px 14px; white-space: nowrap;
          font-size: 13px; font-weight: 600; color: #475569; text-decoration: none; border-bottom: 2px solid transparent;
        }
        .fl-narrownav { display: none; background: #f1f4fb; }
        @media (max-width: 1024px) { .fl-narrownav { display: flex; } .fl-narrownav + .fl-subnav { top: 100px; } }
        .fl-subnav-link:hover { color: #000168; }
        .fl-subnav-link.active { color: #000168; border-bottom-color: #000168; }
        .fl-subnav-action {
          margin-left: auto; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
          height: 32px; padding: 0 14px; border-radius: 8px; background: #000168; color: #fff;
          font-size: 12.5px; font-weight: 700; text-decoration: none;
        }
        .fl-subnav-action:hover { background: #00009e; }


        /* ─── FOOTER ─── */
        .fl-footer { 
          background: #00021a; 
          color: rgba(255,255,255,.5); 
          padding: 80px 40px 40px; 
          border-top: 1px solid rgba(255, 255, 255, 0.04);
        }
        .fl-footer-inner { max-width: 1400px; margin: 0 auto; display: grid; grid-template-columns: 2.5fr 1fr 1fr 1fr; gap: 64px; }
        .fl-footer-logo { height: 36px; width: auto; opacity: 0.95; display: block; margin-bottom: 24px; filter: brightness(1.15); }
        .fl-footer-desc { font-size: 13.5px; line-height: 1.7; color: rgba(255,255,255,.35); max-width: 320px; }
        .fl-footer-col-title { 
          font-size: 11px; font-weight: 700; color: #3b82f6; 
          text-transform: uppercase; letter-spacing: 1.8px; margin-bottom: 24px; 
        }
        .fl-footer-links { display: flex; flex-direction: column; gap: 12px; }
        .fl-footer-link { color: rgba(255,255,255,.4); text-decoration: none; font-size: 13.5px; transition: all 0.2s ease; }
        .fl-footer-link:hover { color: #fff; transform: translateX(2px); }
        .fl-footer-bottom { 
          max-width: 1400px; margin: 64px auto 0; padding-top: 32px; 
          border-top: 1px solid rgba(255,255,255,.04); 
          display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; 
        }
        .fl-footer-copy { font-size: 13px; color: rgba(255,255,255,.3); }
        .fl-footer-badge { 
          font-size: 11px; font-weight: 600;
          background: rgba(59, 130, 246, 0.1); color: #3b82f6; 
          padding: 6px 14px; border-radius: 9999px; 
          border: 1px solid rgba(59, 130, 246, 0.2); 
        }

        @media (max-width: 1180px) {
          .fl-nav-links { gap: 12px; margin: 0 8px; }
          .fl-nav-link { font-size: 12.5px; }
        }
        @media (max-width: 1024px) {
          .fl-nav-links { display: none; }
        }
        @media (max-width: 768px) {
          .fl-user-info { display: none; }
          .fl-nav-inner { padding: 0 24px; }
          .fl-footer-inner { grid-template-columns: 1fr 1fr; gap: 40px; }
        }
        @media (max-width: 480px) {
          .fl-footer-inner { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ─── STICKY NAVBAR ─── */}
      <nav className={`fl-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="fl-nav-inner">
          <Link to="/pages/front" className="fl-brand">
            <img src="/logo-coficab.png" alt="COFICAB" />
          </Link>

          <div className="fl-nav-links">
            {mainLinks.map((l) => (
              <Link key={l.to} to={l.to} className={`fl-nav-link ${l.active ? 'active' : ''}`}>
                {l.label}
              </Link>
            ))}
          </div>

          <div className="fl-right">
            <LanguageSwitcher compact variant="light" />
            {isAuthenticated && user ? (
              <>
                <div className="fl-bell">
                  <NotificationBell color="#ffffff" />
                </div>
                <div className="fl-user-wrap" ref={userMenuRef}>
                  <button className="fl-user-btn" onClick={() => setUserMenuOpen(v => !v)}>
                    <UserAvatar user={user as any} size={32} className="fl-avatar" />
                    <div className="fl-user-info">
                      <span className="fl-user-name">{userDisplayName}</span>
                      <span className="fl-user-role">{userRole}</span>
                    </div>
                  </button>

                  {userMenuOpen && (
                    <div className="fl-dropdown">
                      <div className="fl-drop-header">
                        <div className="fl-drop-name">{userRole}</div>
                        <div className="fl-drop-email">{userDisplayName}</div>
                      </div>
                      <Link
                        to={isAdmin ? '/admin/dashboard' : '/dashboard'}
                        className="fl-drop-item"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <LayoutDashboard size={14} /> {t('employeeWorkspace.frontDashboard')}
                      </Link>
                      <Link to="/" className="fl-drop-item" onClick={() => setUserMenuOpen(false)}>
                        <AppWindow size={14} /> {t('frontNav.appPortal')}
                      </Link>

                      <div className="fl-drop-divider" />
                      <button className="fl-drop-item danger" style={{ width: '100%', border: 'none', background: 'none', fontFamily: 'inherit' }} onClick={() => { setUserMenuOpen(false); handleLogout(); }}>
                        <LogOut size={14} /> {t('employeeWorkspace.frontLogout')}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link to="/login" className="fl-login-btn">{t('employeeWorkspace.frontLogin')}</Link>
            )}
          </div>
        </div>
      </nav>

      {/* ─── MAIN CONTENT ─── */}
      <main className="fl-main">
        <nav className="fl-subnav fl-narrownav" aria-label={t('frontNav.sectionMenu')}>
          {mainLinks.map((l) => (
            <Link key={l.to} to={l.to} className={`fl-subnav-link${l.active ? ' active' : ''}`}>{l.label}</Link>
          ))}
        </nav>
        {subLinks.length > 0 && (
          <nav className="fl-subnav" aria-label={t('frontNav.sectionMenu')}>
            {subLinks.map((l) => (
              <Link key={l.to} to={l.to} className={`fl-subnav-link${l.active ? ' active' : ''}`}>
                {l.icon} {l.label}
              </Link>
            ))}
            {subAction && (
              <Link to={subAction.to} className="fl-subnav-action">
                <PlusCircle size={14} /> {subAction.label}
              </Link>
            )}
          </nav>
        )}
        <Outlet />
      </main>

      {/* ─── FOOTER ─── */}
      <footer className="fl-footer">
        <div className="fl-footer-inner">
          <div>
            <img src="/logo-coficab.png" alt="COFICAB" className="fl-footer-logo" />
            <p className="fl-footer-desc">
              {t('frontNav.footerTagline')}
            </p>
          </div>
          <div>
            <div className="fl-footer-col-title">{t('frontNav.footerNavigation')}</div>
            <div className="fl-footer-links">
              <Link to="/pages/front" className="fl-footer-link">{t('employeeWorkspace.frontHome')}</Link>
              <Link to="/pages/front/action-plans" className="fl-footer-link">{t('employeeWorkspace.frontPlans')}</Link>
              <Link to={QUALITY_ANALYSIS_PATH} className="fl-footer-link">{t('employeeWorkspace.frontQuality')}</Link>
            </div>
          </div>
          <div>
            <div className="fl-footer-col-title">{t('frontNav.footerAdministration')}</div>
            <div className="fl-footer-links">
              {isAdmin ? (
                <>
                  <Link to="/admin/employees" className="fl-footer-link">{t('frontNav.footerEmployees')}</Link>
                  <Link to="/admin/organizations" className="fl-footer-link">{t('frontNav.footerOrganizations')}</Link>
                  <Link to="/admin/audit-logs" className="fl-footer-link">{t('frontNav.footerAudit')}</Link>
                  <Link to="/admin/dashboard" className="fl-footer-link">{t('frontNav.footerIam')}</Link>
                </>
              ) : (
                <span className="fl-footer-link" style={{ cursor: 'default', opacity: 0.5 }}>
                  {t('frontNav.footerAdminOnly')}
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="fl-footer-col-title">{t('frontNav.footerSupport')}</div>
            <div className="fl-footer-links">
              <Link to={`${QUALITY_ANALYSIS_PATH}/parcours`} className="fl-footer-link">{t('frontNav.guide')}</Link>
              <span className="fl-footer-link" style={{ cursor: 'default' }}>{t('frontNav.footerContactIt')}</span>
              <span className="fl-footer-link" style={{ cursor: 'default' }}>FAQ</span>
            </div>
          </div>
        </div>
        <div className="fl-footer-bottom">
          <span className="fl-footer-copy">{t('frontNav.footerCopyright')}</span>
          <span className="fl-footer-badge">Action Plan v1.0</span>
        </div>
      </footer>
      <QualityAssistantWidget scope={isAdmin ? 'admin' : 'employee'} />
    </div>
  );
};

export default FrontLayout;