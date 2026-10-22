import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { isAdminUser, resolvePostLoginTarget } from '../utils/roles';

export default function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout, isAuthenticated, user } = useAuth();

  // Already signed in: go straight in. Otherwise the login page, then the requested area.
  const goToLogin = (redirectTo: string) => {
    if (isAuthenticated && user) {
      navigate(resolvePostLoginTarget(redirectTo, isAdminUser(user)));
      return;
    }
    logout();
    navigate('/login', { state: { redirectTo } });
  };



  return (

    <>

      <style>{`


        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #root {

  margin: 0;

  padding: 0;

  height: 100%;

  overflow: hidden;

}

        .lp-root {

          position: relative;

          min-height: 100dvh;

          width: 100%;

          overflow: hidden;

          /* Shown until the poster / video paints, so the page never flashes white. */
          background: #010862;

          font-family: Inter, sans-serif;

          display: flex;

          align-items: center;

          justify-content: center;

           margin: 0;

  padding: 0;

        }

.lp-logo-image {

  max-width: 220px;

  width: 70%;

  height: auto;

  display: block;

  margin-left: auto;

  margin-right: auto;

}

        /* Video background */

        .lp-video {

  position: absolute;

  top: 0;

  left: 0;

  width: 100%;

  height: 100%;

  object-fit: cover;

  display: block;

  z-index: 0;

  font-size: 0;

  line-height: 0;

  object-position: center 80%;

  transform: scale(1.2);  

}



        /* Overlay */

        .lp-overlay {

          position: absolute;

          inset: 0;

          background:

            radial-gradient(ellipse 80% 60% at 50% 50%, rgba(0,1,104,0.3) 0%, rgba(0,0,40,0.45) 100%);

          z-index: 1;

        }



        /* Grid pattern */

        .lp-grid {

          position: absolute;

          inset: 0;

          background-image:

            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),

            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);

          background-size: 60px 60px;

          z-index: 2;

        }



        /* Scan line */

        .lp-scan {

          position: absolute;

          left: 0; right: 0; height: 1px;

          background: linear-gradient(to right, transparent, rgba(0,102,204,0.5), transparent);

          z-index: 3;

          animation: lpScan 6s linear infinite;

        }

        @keyframes lpScan {

          0% { top: -2px; opacity: 0; }

          5% { opacity: 1; }

          95% { opacity: 0.3; }

          100% { top: 100vh; opacity: 0; }

        }



        /* Content */

        .lp-content {

          position: relative;

          z-index: 10;

          display: flex;

          flex-direction: column;

          align-items: center;

          justify-content: center;

          padding: 40px 24px;

          gap: 40px;

          width: 100%;

          max-width: 680px;

        }



        /* Header */

        .lp-header { text-align: center; }

        .lp-logo-bar {

          display: inline-flex;

          align-items: center;

          gap: 14px;

          margin-bottom: 8px;

        }

        .lp-logo-line {

          width: 4px; height: 44px;

          background: #0066cc;

          border-radius: 2px;

          flex-shrink: 0;

        }

        .lp-logo-name {

          font-family: Inter, sans-serif;

          font-size: 36px; font-weight: 800;

          letter-spacing: 7px; color: white;

          text-transform: uppercase;

          display: block;

        }

        .lp-logo-sub {

          font-family: Inter, sans-serif;

          font-size: 10px; font-weight: 500;

          letter-spacing: 5px; color: rgba(255,255,255,0.35);

          text-transform: uppercase;

          display: block; margin-top: 2px;

        }

        .lp-tagline {

          font-size: 14px; color: rgba(255, 255, 255, 0.84);

          margin-top: 16px; letter-spacing: 0.5px; line-height: 1.7;

        }



        /* Cards */

        .lp-cards {

         

          display: grid;

          grid-template-columns: 1fr 1fr;

          gap: 20px;

          width: 100%;

        }



        .lp-card {

         background: rgba(31, 44, 75, 0.32);

          border: 1px solid rgba(255,255,255,0.1);

          border-radius: 16px;

          padding: 36px 24px 28px;

          display: flex;

          flex-direction: column;

          align-items: center;

          gap: 14px;

          cursor: pointer;

          transition: all 0.3s ease;

          position: relative;

          overflow: hidden;

          backdrop-filter: blur(10px);

         

        }



        .lp-card::before {

          content: '';

          position: absolute;

          top: 0; left: 0; right: 0;

          height: 3px;

          border-radius: 16px 16px 0 0;

        }



        .lp-card-apps::before {

          background: linear-gradient(to right, #0044aa, #0088ff);

        }

        .lp-card-admin::before {

          background: linear-gradient(to right, #0066cc, #0088ff);

        }



        .lp-card:hover {

          background: rgba(255,255,255,0.09);

          border-color: rgba(255,255,255,0.22);

          transform: translateY(-4px);

        }



        .lp-card-apps:hover {

          box-shadow: 0 20px 40px rgba(0,102,204,0.2);

        }

        .lp-card-admin:hover {

          box-shadow: 0 20px 40px rgba(124,58,237,0.2);

        }



        .lp-card-icon {

          width: 64px; height: 64px;

          border-radius: 16px;

          display: flex; align-items: center; justify-content: center;

          font-size: 30px;

        }

        .lp-card-apps .lp-card-icon {

          background: rgba(0,102,204,0.15);

          border: 1px solid rgba(0,102,204,0.3);

          color: #60a5fa;

        }

        .lp-card-admin .lp-card-icon {

          background: rgba(0,102,204,0.15);

          border: 1px solid rgba(0,102,204,0.3);

          color: #60a5fa;

        }



        .lp-card-title {

          font-family: Inter, sans-serif;

          font-size: 17px; font-weight: 700;

          color: white; text-align: center;

          letter-spacing: 0.5px;

        }

        .lp-card-desc {

          font-size: 12px; color: rgba(255,255,255,0.4);

          text-align: center; line-height: 1.7;

        }



        .lp-tags {

          display: flex; gap: 6px;

          flex-wrap: wrap; justify-content: center;

          margin-top: 4px; margin-bottom: 10px;

        }

        .lp-tag {

          padding: 3px 10px;

          border-radius: 20px;

          font-size: 10px;

          letter-spacing: 0.5px;

        }

        .lp-tag-blue {

          background: rgba(0,102,204,0.15);

          border: 1px solid rgba(0,102,204,0.25);

          color: rgba(255,255,255,0.45);

        }

        .lp-tag-purple {

          background: rgba(0,102,204,0.15);

          border: 1px solid rgba(124,58,237,0.25);

          color: rgba(255,255,255,0.45);

        }



        .lp-btn {

          margin-top: auto; /* pins the button to the bottom so both cards line up */

          padding: 10px 28px;

          border-radius: 7px;

          font-family: Inter, sans-serif;

          font-size: 11px; font-weight: 700;

          letter-spacing: 2.5px; text-transform: uppercase;

          border: none; cursor: pointer;

          transition: all 0.2s;

          width: 100%;

        }

        .lp-btn-blue {

          background: #0066cc; color: white;

        }

        .lp-btn-blue:hover { background: #0088ff;   }

        .lp-btn-purple {

           background: rgba(0,102,204,0.35);

          border: 1px solid rgba(0,102,204,0.2);

            color: #ffffff;

        }

        .lp-btn-purple:hover {     background: #0088ff;  }



        /* Divider */

        .lp-divider {

          display: flex; align-items: center; gap: 16px;

          width: 100%; color: rgba(255,255,255,0.15);

          font-size: 10px; letter-spacing: 2px; text-transform: uppercase;

        }

        .lp-divider::before, .lp-divider::after {

          content: ''; flex: 1; height: 1px;

          background: rgba(255,255,255,0.08);

        }



        /* Footer */

        .lp-footer {

          font-size: 10px; color: rgba(255,255,255,0.18);

          letter-spacing: 2px; text-transform: uppercase;

          text-align: center;

        }



        @media (max-width: 560px) {

          .lp-cards { grid-template-columns: 1fr; }

          .lp-logo-name { font-size: 28px; }

        }

      `}</style>



      <div className="lp-root">

        {/* Video background */}

        <video

          className="lp-video"

          src="/background.mp4"

          poster="/background-poster.jpg"

          preload="auto"

          // Start on the poster's frame (2 s) so the switch from poster to video is seamless.
          onLoadedMetadata={(e) => { e.currentTarget.currentTime = 2; }}

          autoPlay

          loop

          muted

          playsInline

        />



        <div className="lp-overlay" />

        <div className="lp-grid" />

        <div className="lp-scan" />



        <div className="lp-content">

          {/* Header */}

          <div className="lp-header">

            <img

              src="/logo-coficab.png"

              alt={t('portal.logoAlt')}

              className="lp-logo-image"

            />

            <div className="lp-logo-bar">

              <div className="lp-logo-line" />

              <div>

                <span className="lp-logo-sub">Group — Internal Portal</span>

              </div>

            </div>

            <p className="lp-tagline">

              {t('portal.tagline')}

            </p>

          </div>



          {/* Cards */}

          <div className="lp-cards">

            {/* Applications */}

            <div className="lp-card lp-card-apps" onClick={() => goToLogin('/pages/front')}>

              <div className="lp-card-icon">

                <i className="ti ti-shield-check" aria-hidden="true" />

              </div>

              <div className="lp-card-title">{t('portal.qualityTitle')}</div>

              <div className="lp-card-desc">

                {t('portal.qualityDesc')}

              </div>

              <div className="lp-tags">

                <span className="lp-tag lp-tag-blue">{t('portal.tagClaims')}</span>

                <span className="lp-tag lp-tag-blue">{t('portal.tagCapa')}</span>

                <span className="lp-tag lp-tag-blue">{t('portal.tagAlerts')}</span>

              </div>

              <button className="lp-btn lp-btn-blue" type="button">{t('portal.open')}</button>

            </div>



            {/* Administration / Backoffice */}

            <div className="lp-card lp-card-admin" onClick={() => goToLogin('/admin/dashboard')}>

              <div className="lp-card-icon">

                <i className="ti ti-layout-dashboard" aria-hidden="true" />

              </div>

              <div className="lp-card-title">{t('portal.backofficeTitle')}</div>

              <div className="lp-card-desc">

                {t('portal.backofficeDesc')}

              </div>

              <div className="lp-tags">

                <span className="lp-tag lp-tag-purple">{t('portal.tagEmployee')}</span>

                <span className="lp-tag lp-tag-purple">{t('portal.tagAdmin')}</span>

              </div>

              <button className="lp-btn lp-btn-purple" type="button">{t('portal.open')}</button>

            </div>

          </div>



          <div className="lp-divider">Coficab Group</div>



          <div className="lp-footer">

            {t('portal.footer')}

          </div>

        </div>

      </div>

    </>

  );

}