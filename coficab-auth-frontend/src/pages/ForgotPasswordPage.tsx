import TurnstileWidget from '../components/TurnstileWidget';
import { useTurnstile } from '../hooks/useTurnstile';
import { useEffect, useState } from 'react';
import { forgotPassword } from '../services/authService';
import { useTranslation } from 'react-i18next';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTimeout(() => setMounted(true), 80);
  }, []);

  const turnstile = useTurnstile();

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      await forgotPassword(email, turnstile.token);
      setSent(true);
    } catch (e) {
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
      setError(code === 'captcha_failed' ? t('login.errorCaptcha') : t('deptForm.genericError'));
      turnstile.renew();                       // a Turnstile token works once
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --navy: #000168;
          --navy-deep: #00004d;
          --navy-mid: #00009e;
          --accent: #0066cc;
          --white: #ffffff;
          --text-muted: rgba(255,255,255,0.55);
        }
        .fp-root {
          min-height: 100dvh;
          width: 100%;
          display: flex;
          font-family: Inter, sans-serif;
          background: var(--navy-deep);
          overflow: hidden;
          position: relative;
        }
        .fp-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
          overflow: hidden;
        }
        .fp-bg::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          z-index: 1;
        }
        .fp-bg::after {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 70% 60% at 30% 50%, rgba(0,1,104,0.7) 0%, transparent 70%),
            radial-gradient(ellipse 50% 40% at 70% 80%, rgba(0,0,77,0.8) 0%, transparent 60%);
          z-index: 2;
        }
        .fp-stripe {
          position: absolute;
          top: 0; bottom: 0;
          left: 40%;
          width: 3px;
          background: linear-gradient(to bottom, transparent 0%, rgba(0,102,204,0.4) 30%, rgba(0,102,204,0.6) 60%, transparent 100%);
          z-index: 3;
          transform: skewX(-8deg);
        }
        .fp-scan {
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
        .fp-left {
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
        .fp-logo {
          display: flex;
          align-items: center;
          margin-bottom: 72px;
        }
        .fp-logo-bar {
          width: 4px;
          height: 44px;
          background: var(--accent);
          margin-right: 16px;
          flex-shrink: 0;
        }
        .fp-logo-text {
          font-family: Inter, sans-serif;
          font-size: 34px;
          font-weight: 800;
          letter-spacing: 6px;
          color: var(--white);
          text-transform: uppercase;
        }
        .fp-logo-group {
          font-family: Inter, sans-serif;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 5px;
          color: rgba(255,255,255,0.45);
          text-transform: uppercase;
          display: block;
          margin-top: -4px;
        }
        .fp-headline {
          font-family: Inter, sans-serif;
          font-size: clamp(40px, 4.5vw, 68px);
          font-weight: 800;
          line-height: 1.0;
          color: var(--white);
          text-transform: uppercase;
          margin-bottom: 28px;
        }
        .fp-headline-accent {
          color: var(--accent);
          display: block;
          font-weight: 300;
          font-size: 0.65em;
          letter-spacing: 6px;
          margin-bottom: 4px;
        }
        .fp-tagline {
          font-size: 14px;
          color: var(--text-muted);
          line-height: 1.8;
          max-width: 400px;
        }
        .fp-right {
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
        .fp-right::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 4px;
          background: linear-gradient(to right, var(--navy), var(--accent));
        }
        .fp-form-logo {
          margin-bottom: 44px;
        }
        .fp-form-logo-name {
          font-family: Inter, sans-serif;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 5px;
          color: var(--navy);
          text-transform: uppercase;
        }
        .fp-form-logo-sub {
          font-family: Inter, sans-serif;
          font-size: 9px;
          font-weight: 500;
          letter-spacing: 4px;
          color: rgba(0,1,104,0.35);
          text-transform: uppercase;
          display: block;
          margin-top: 2px;
        }
        .fp-back {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: rgba(0,1,104,0.4);
          text-decoration: none;
          margin-bottom: 32px;
          transition: color 0.2s;
        }
        .fp-back:hover { color: var(--navy); }
        .fp-title {
          font-family: Inter, sans-serif;
          font-size: 24px;
          font-weight: 700;
          color: var(--navy-deep);
          margin-bottom: 6px;
        }
        .fp-sub {
          font-size: 13px;
          color: #8892a4;
          margin-bottom: 36px;
          line-height: 1.6;
        }
        .fp-label {
          display: block;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #8892a4;
          margin-bottom: 8px;
        }
        .fp-input {
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
          margin-bottom: 22px;
        }
        .fp-input:focus {
          border-color: var(--navy);
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(0,1,104,0.08);
        }
        .fp-error {
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
        }
        .fp-success {
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: #f0fff4;
          border: 1px solid #b7ebc8;
          border-left: 3px solid #22c55e;
          padding: 16px;
          border-radius: 2px;
          font-size: 13px;
          color: #166534;
          font-weight: 500;
          margin-bottom: 20px;
        }
        .fp-btn {
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
          transition: background 0.25s, transform 0.15s, box-shadow 0.25s;
        }
        .fp-btn:hover:not(:disabled) {
          background: var(--navy-mid);
          box-shadow: 0 6px 24px rgba(0,1,104,0.25);
          transform: translateY(-1px);
        }
        .fp-btn:disabled { background: #8890c4; cursor: not-allowed; }
        .fp-footer {
          position: absolute;
          bottom: 32px;
          left: 52px; right: 52px;
          text-align: center;
        }
        .fp-footer-divider {
          width: 32px;
          height: 2px;
          background: linear-gradient(to right, var(--navy), var(--accent));
          margin: 0 auto 12px;
          border-radius: 2px;
        }
        .fp-footer-text {
          font-size: 10.5px;
          color: #b0b8cc;
          line-height: 1.9;
        }
        .fp-footer-text strong { color: #8892a4; font-weight: 600; }
        @media (max-width: 860px) {
          .fp-left { display: none; }
          .fp-right { width: 100%; padding: 60px 36px 100px; }
        }
      `}</style>

      <div className="fp-root">
        <div className="fp-bg">
          <div className="fp-stripe" />
          <div className="fp-scan" />
        </div>

        {/* Left panel */}
        <div className="fp-left">
          <div className="fp-logo">
            <div className="fp-logo-bar" />
            <div>
              <span className="fp-logo-text">COFICAB</span>
              <span className="fp-logo-group">Group</span>
            </div>
          </div>
          <h1 className="fp-headline">
            <span className="fp-headline-accent">{t('forgotPassword.security')}</span>
            {t('forgotPassword.headline1')}<br />{t('forgotPassword.headline2')}
          </h1>
          <p className="fp-tagline">
            {t('forgotPassword.tagline')}
          </p>
        </div>

        {/* Right panel */}
        <div className="fp-right">
          <div className="fp-form-logo">
            <span className="fp-form-logo-name">COFICAB</span>
            <span className="fp-form-logo-sub">Group Portal</span>
          </div>

          <a href="/login" className="fp-back">
            ← {t('forgotPassword.backToLogin')}
          </a>

          <h2 className="fp-title">{t('forgotPassword.title')}</h2>
          <p className="fp-sub">
            {t('forgotPassword.sub')}
          </p>

          {sent ? (
            <div className="fp-success">
              <strong>{t('forgotPassword.sent')}</strong>
              <span>{t('forgotPassword.sentTo')} <strong>{email}</strong>. {t('forgotPassword.checkInbox')}</span>
            </div>
          ) : (
            <>
              <label className="fp-label">{t('login.email')}</label>
              <input
                className="fp-input"
                type="email"
                placeholder={t('login.emailPh')}
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              {turnstile.enabled && turnstile.siteKey && !turnstile.unavailable && (
                <TurnstileWidget siteKey={turnstile.siteKey} onToken={turnstile.setToken} resetKey={turnstile.resetKey} onUnavailable={() => turnstile.setUnavailable(true)} onError={turnstile.setErrorCode} />
              )}
              {turnstile.unavailable && <div className="fp-error">{t('login.captchaUnavailable')}</div>}
            {turnstile.hintKey && (
              <div className="fp-error" role="alert">{t(`login.turnstileHint.${turnstile.hintKey}`)} <small>({t('login.turnstileCode', { code: turnstile.errorCode })})</small></div>
            )}
              {error && <div className="fp-error">{error}</div>}
              <button
                className="fp-btn"
                onClick={handleSubmit}
                disabled={loading || !email || !turnstile.ready}
              >
                {loading ? t('fiveWhy.sending') : t('forgotPassword.sendLink')}
              </button>
            </>
          )}

          <div className="fp-footer">
            <div className="fp-footer-divider" />
            <p className="fp-footer-text">
              <strong>Coficab Group</strong> — {t('login.footerSystem')}<br />
              © 2026 · {t('login.footerAccess')}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}