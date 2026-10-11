import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminUser, resolvePostLoginTarget } from '../utils/roles';
import { useTranslation } from 'react-i18next';

const LoginPage = () => {
  const { t } = useTranslation();
  const { login, logout, isAuthenticated, user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    typeof (location.state as { redirectTo?: unknown } | null)?.redirectTo === 'string'
      ? String((location.state as { redirectTo: string }).redirectTo)
      : '';
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [sessionCleared, setSessionCleared] = useState(false);

  useEffect(() => {
    setTimeout(() => setMounted(true), 80);
  }, []);

  // Toujours afficher le formulaire : pas de connexion silencieuse sur /login
  useEffect(() => {
    if (authLoading || sessionCleared) return;
    logout();
    setSessionCleared(true);
  }, [authLoading, sessionCleared, logout]);

  // Redirection uniquement après une connexion réussie via le formulaire
  useEffect(() => {
    if (redirecting && isAuthenticated && user) {
      const isAdmin = isAdminUser(user);
      const target = resolvePostLoginTarget(redirectTo, isAdmin);
      navigate(target, { replace: true });
      setRedirecting(false);
      setLoading(false);
    }
  }, [redirecting, isAuthenticated, user, navigate, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      setRedirecting(true);
    } catch (err: any) {
      setError(t('login.error'));
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --navy:      #000168;
          --navy-deep: #00004d;
          --navy-mid:  #00009e;
          --accent:    #0066cc;
          --silver:    #e8ecf4;
          --white:     #ffffff;
          --text-muted: rgba(255,255,255,0.55);
          --border:    rgba(255,255,255,0.1);
        }

        .lr-root {
          min-height: 100dvh;
          width: 100%;
          display: flex;
          font-family: Inter, sans-serif;
          background: var(--navy-deep);
          overflow: hidden;
          position: relative;
        }

        .lr-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          overflow: hidden;
        }

        .lr-bg::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          z-index: 1;
        }

        .lr-bg::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 70% 60% at 30% 50%, rgba(0,1,104,0.7) 0%, transparent 70%),
            radial-gradient(ellipse 40% 50% at 80% 20%, rgba(0,102,204,0.12) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 70% 80%, rgba(0,0,77,0.8) 0%, transparent 60%);
          z-index: 2;
        }

        .lr-stripe {
          position: absolute;
          top: 0; bottom: 0;
          left: 40%;
          width: 3px;
          background: linear-gradient(to bottom, transparent 0%, rgba(0,102,204,0.4) 30%, rgba(0,102,204,0.6) 60%, transparent 100%);
          z-index: 3;
          transform: skewX(-8deg);
        }

        .lr-stripe-2 {
          position: absolute;
          top: 0; bottom: 0;
          left: calc(40% + 12px);
          width: 1px;
          background: linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.1) 40%, rgba(255,255,255,0.15) 60%, transparent 100%);
          z-index: 3;
          transform: skewX(-8deg);
        }

        .lr-scan {
          position: absolute;
          left: 0; right: 0;
          height: 2px;
          background: linear-gradient(to right, transparent, rgba(0,102,204,0.5), transparent);
          z-index: 4;
          animation: scanDown 6s linear infinite;
        }
        @keyframes scanDown {
          0%   { top: -2px; opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 0.4; }
          100% { top: 100vh; opacity: 0; }
        }

        .lr-left {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 80px 80px 80px 100px;
          position: relative;
          z-index: 10;
          opacity: ${mounted ? 1 : 0};
          transform: ${mounted ? 'translateX(0)' : 'translateX(-30px)'};
          transition: opacity 0.8s ease, transform 0.8s ease;
        }

        .lr-logo {
          display: flex;
          align-items: center;
          gap: 0;
          margin-bottom: 72px;
          opacity: ${mounted ? 1 : 0};
          transform: ${mounted ? 'translateY(0)' : 'translateY(-16px)'};
          transition: opacity 0.9s ease 0.1s, transform 0.9s ease 0.1s;
        }

        .lr-logo-text {
          font-family: Inter, sans-serif;
          font-size: 34px;
          font-weight: 800;
          letter-spacing: 6px;
          color: var(--white);
          text-transform: uppercase;
        }

        .lr-logo-group {
          font-family: Inter, sans-serif;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 5px;
          color: rgba(255,255,255,0.45);
          text-transform: uppercase;
          margin-left: 3px;
          display: block;
          margin-top: -4px;
        }

        .lr-logo-bar {
          width: 4px;
          height: 44px;
          background: var(--accent);
          margin-right: 16px;
          flex-shrink: 0;
        }

        .lr-headline {
          font-family: Inter, sans-serif;
          font-size: clamp(40px, 4.5vw, 68px);
          font-weight: 800;
          line-height: 1.0;
          color: var(--white);
          text-transform: uppercase;
          letter-spacing: 0px;
          margin-bottom: 28px;
          opacity: ${mounted ? 1 : 0};
          transform: ${mounted ? 'translateY(0)' : 'translateY(24px)'};
          transition: opacity 0.9s ease 0.3s, transform 0.9s ease 0.3s;
        }

        .lr-headline-accent {
          color: var(--accent);
          display: block;
          font-weight: 300;
          font-size: 0.65em;
          letter-spacing: 6px;
          margin-bottom: 4px;
        }

        .lr-tagline {
          font-size: 14px;
          font-weight: 400;
          color: var(--text-muted);
          line-height: 1.8;
          max-width: 400px;
          margin-bottom: 64px;
          opacity: ${mounted ? 1 : 0};
          transform: ${mounted ? 'translateY(0)' : 'translateY(20px)'};
          transition: opacity 0.9s ease 0.45s, transform 0.9s ease 0.45s;
        }

        .lr-stats {
          display: flex;
          gap: 0;
          opacity: ${mounted ? 1 : 0};
          transform: ${mounted ? 'translateY(0)' : 'translateY(20px)'};
          transition: opacity 0.9s ease 0.6s, transform 0.9s ease 0.6s;
        }

        .lr-stat {
          padding: 0 36px 0 0;
          border-right: 1px solid rgba(255,255,255,0.1);
          margin-right: 36px;
        }
        .lr-stat:last-child { border-right: none; margin-right: 0; }

        .lr-stat-num {
          font-family: Inter, sans-serif;
          font-size: 32px;
          font-weight: 700;
          color: var(--white);
          line-height: 1;
        }
        .lr-stat-num sup {
          font-size: 0.5em;
          color: var(--accent);
          vertical-align: super;
          font-weight: 600;
        }
        .lr-stat-label {
          font-size: 10px;
          font-weight: 600;
          color: rgba(255,255,255,0.3);
          letter-spacing: 2.5px;
          text-transform: uppercase;
          margin-top: 6px;
        }

        .lr-elloumi {
          position: absolute;
          bottom: 44px;
          left: 100px;
          font-size: 10px;
          font-weight: 400;
          color: rgba(255,255,255,0.2);
          letter-spacing: 2px;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 10px;
          opacity: ${mounted ? 1 : 0};
          transition: opacity 1s ease 0.9s;
        }
        .lr-elloumi::before {
          content: '';
          width: 24px;
          height: 1px;
          background: rgba(255,255,255,0.15);
          display: block;
        }

        .lr-right {
          width: 460px;
          min-height: 100dvh;
          flex-shrink: 0;
          background: var(--white);
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 64px 52px;
          position: relative;
          z-index: 10;
          opacity: ${mounted ? 1 : 0};
          transform: ${mounted ? 'translateX(0)' : 'translateX(30px)'};
          transition: opacity 0.8s ease 0.2s, transform 0.8s ease 0.2s;
        }

        .lr-right::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 4px;
          background: linear-gradient(to right, var(--navy), var(--accent));
        }

        .lr-right::after {
          content: '';
          position: absolute;
          bottom: 0; right: 0;
          width: 80px; height: 80px;
          background: linear-gradient(135deg, transparent 50%, rgba(0,1,104,0.05) 50%);
        }

        .lr-form-logo {
          margin-bottom: 44px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .lr-form-logo-name {
          font-family: Inter, sans-serif;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 5px;
          color: var(--navy);
          text-transform: uppercase;
        }
        .lr-form-logo-sub {
          font-family: Inter, sans-serif;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 4px;
          color: rgba(0,1,104,0.35);
          text-transform: uppercase;
        }

        .lr-form-title {
          font-family: Inter, sans-serif;
          font-size: 24px;
          font-weight: 700;
          color: var(--navy-deep);
          margin-bottom: 6px;
          letter-spacing: 0.5px;
        }
        .lr-form-sub {
          font-size: 13px;
          color: #8892a4;
          font-weight: 400;
          margin-bottom: 40px;
          line-height: 1.5;
        }

        .lr-field {
          margin-bottom: 22px;
        }
        .lr-label {
          display: block;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #8892a4;
          margin-bottom: 8px;
          transition: color 0.25s;
        }
        .lr-field.focused .lr-label { color: var(--navy); }

        .lr-input-wrap {
          position: relative;
        }

        .lr-input {
          width: 100%;
          background: #f4f6fb;
          border: 1.5px solid #e0e5f0;
          border-radius: 3px;
          padding: 13px 16px;
          font-family: Inter, sans-serif;
          font-size: 14px;
          color: var(--navy-deep);
          outline: none;
          transition: border-color 0.25s, background 0.25s, box-shadow 0.25s;
          -webkit-appearance: none;
        }
        .lr-input::placeholder { color: #b0b8cc; }
        .lr-input:focus {
          border-color: var(--navy);
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(0,1,104,0.08);
        }

        .lr-underline {
          height: 2px;
          background: var(--navy);
          width: 0;
          transition: width 0.35s ease;
          margin-top: -1.5px;
          border-radius: 0 0 2px 2px;
        }
        .lr-field.focused .lr-underline { width: 100%; }

        .lr-error {
          display: flex;
          align-items: center;
          gap: 9px;
          background: #fff2f4;
          border: 1px solid #ffd0d7;
          border-left: 3px solid #e00028;
          padding: 10px 14px;
          margin-bottom: 20px;
          border-radius: 2px;
          font-size: 12.5px;
          color: #b0001e;
          font-weight: 500;
          animation: errIn 0.3s ease;
        }
        @keyframes errIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .lr-btn {
          width: 100%;
          padding: 14px 20px;
          background: var(--navy);
          color: var(--white);
          border: none;
          border-radius: 3px;
          font-family: Inter, sans-serif;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 3px;
          text-transform: uppercase;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: background 0.25s, transform 0.15s, box-shadow 0.25s;
          margin-top: 6px;
        }
        .lr-btn:not(:disabled):hover {
          background: var(--navy-mid);
          box-shadow: 0 6px 24px rgba(0,1,104,0.25);
          transform: translateY(-1px);
        }
        .lr-btn:not(:disabled):active { transform: translateY(0); }
        .lr-btn:disabled { background: #8890c4; cursor: not-allowed; }

        .lr-btn-shimmer {
          position: absolute;
          top: 0; left: -100%;
          width: 50%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          animation: shimmer 2.5s ease-in-out infinite;
        }
        @keyframes shimmer {
          0%   { left: -60%; }
          100% { left: 160%; }
        }

        .lr-dots {
          display: inline-flex;
          gap: 4px;
          align-items: center;
          margin-left: 8px;
          vertical-align: middle;
        }
        .lr-dot {
          width: 4px; height: 4px;
          background: white;
          border-radius: 50%;
          animation: dotUp 1s ease-in-out infinite;
        }
        .lr-dot:nth-child(2) { animation-delay: 0.15s; }
        .lr-dot:nth-child(3) { animation-delay: 0.3s; }
        @keyframes dotUp {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-3px); opacity: 1; }
        }

        .lr-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 28px 0 6px;
          color: #c0c8d8;
          font-size: 11px;
          letter-spacing: 1px;
        }
        .lr-divider::before, .lr-divider::after {
          content: ''; flex: 1;
          height: 1px;
          background: #e8ecf4;
        }

        .lr-footer {
          position: absolute;
          bottom: 32px;
          left: 52px; right: 52px;
          text-align: center;
        }
        .lr-footer-text {
          font-size: 10.5px;
          color: #b0b8cc;
          line-height: 1.9;
          letter-spacing: 0.3px;
        }
        .lr-footer-text strong { color: #8892a4; font-weight: 600; }
        .lr-footer-divider {
          width: 32px;
          height: 2px;
          background: linear-gradient(to right, var(--navy), var(--accent));
          margin: 0 auto 12px;
          border-radius: 2px;
        }
        .lr-forgot-link {
          font-size: 12px;
          color: #000168;
          text-decoration: none;
          font-weight: 600;
          letter-spacing: 0.3px;
          opacity: 0.7;
          transition: opacity 0.2s;
        }
        .lr-forgot-link:hover {
          opacity: 1;
        }
        @media (max-width: 860px) {
          .lr-left { display: none; }
          .lr-right { width: 100%; min-height: 100dvh; padding: 60px 36px 100px; }
        }
      `}</style>

      <div className="lr-root">
        <div className="lr-bg">
          <div className="lr-stripe" />
          <div className="lr-stripe-2" />
          <div className="lr-scan" />
        </div>

        <div className="lr-left">
          <div className="lr-logo">
            <div className="lr-logo-bar" />
            <div>
              <span className="lr-logo-text">COFICAB</span>
              <span className="lr-logo-group">Group</span>
            </div>
          </div>

          <h1 className="lr-headline">
            <span className="lr-headline-accent">Internal Portal</span>
            EMPLOYEE<br />WORKSPACE
          </h1>

          <p className="lr-tagline">
            {t('login.tagline')}
          </p>

          <div className="lr-stats">
            <div className="lr-stat">
              <div className="lr-stat-num">24<sup>+</sup></div>
              <div className="lr-stat-label">{t('login.statCountries')}</div>
            </div>
            <div className="lr-stat">
              <div className="lr-stat-num">12K</div>
              <div className="lr-stat-label">{t('hrReports.employees')}</div>
            </div>
            <div className="lr-stat">
              <div className="lr-stat-num">50<sup>+</sup></div>
              <div className="lr-stat-label">{t('login.statYears')}</div>
            </div>
          </div>

          <div className="lr-elloumi">
            A member of Elloumi Group — Founded 1992
          </div>
        </div>

        <div className="lr-right">
          <div className="lr-form-logo">
            <span className="lr-form-logo-name">COFICAB</span>
            <span className="lr-form-logo-sub">Group Portal</span>
          </div>

          <h2 className="lr-form-title">{t('login.title')}</h2>
          <p className="lr-form-sub">
            {t('login.subtitle')}
          </p>

          <form onSubmit={handleSubmit}>
            <div className={`lr-field ${focused === 'email' ? 'focused' : ''}`}>
              <label className="lr-label">{t('login.email')}</label>
              <div className="lr-input-wrap">
                <input
                  className="lr-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={() => setFocused('email')}
                  onBlur={() => setFocused(null)}
                  placeholder={t('login.emailPh')}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="lr-underline" />
            </div>

            <div className={`lr-field ${focused === 'password' ? 'focused' : ''}`}>
              <label className="lr-label">{t('login.password')}</label>
              <div className="lr-input-wrap">
                <input
                  className="lr-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="lr-underline" />
            </div>

            {error && (
              <div className="lr-error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <button className="lr-btn" type="submit" disabled={loading}>
              <span className="lr-btn-shimmer" />
              {loading ? (
                <>
                  {t('login.authenticating')}
                  <span className="lr-dots">
                    <span className="lr-dot" />
                    <span className="lr-dot" />
                    <span className="lr-dot" />
                  </span>
                </>
              ) : t('login.submit')}
            </button>
          </form>
          <div style={{ textAlign: 'right', marginTop: '12px', marginBottom: '8px' }}>
            <a href="/forgot-password" className="lr-forgot-link">
              {t('login.forgot')}
            </a>
          </div>
          <div className="lr-footer">
            <div className="lr-footer-divider" />
            <p className="lr-footer-text">
              <strong>Coficab Group</strong> — {t('login.footerSystem')}<br />
              © 2026 · {t('login.footerAccess')}
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;