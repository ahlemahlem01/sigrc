import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function FrontLandingPge() {
  const { t } = useTranslation();
  const [scrollY, setScrollY] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
    
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Chemins absolus depuis le dossier public
  const publicPath = process.env.PUBLIC_URL || '';
  const backgroundSrc = `${publicPath}/cof1.png`; 
  const cablesSrc = `${publicPath}/cof2.png`;

  // --- CONFIGURATION DU POINT D'ARRÊT DU SCROLL ---
  const cappedScrollY = Math.min(scrollY, 200); 

  const cableTranslateY = cappedScrollY * 0.35;               
  const cableScale = Math.max(0.8, 1 - cappedScrollY / 1000);  

  // --- DONNÉES DU DÉFILEMENT DE LOGOS MINIMALISTES ---
  const tier1PartnersLogos = [
    {
      name: 'APTIV',
      logo: (
        <svg className="h-10 w-auto text-white/40 group-hover:text-white/80 transition-colors duration-300 fill-current" viewBox="0 0 100 30" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="15" r="4.5" className="fill-current" />
          <text x="24" y="20" fontFamily="system-ui, -apple-system, sans-serif" fontSize="14" fontWeight="900" letterSpacing="1.5" className="fill-current">APTIV</text>
        </svg>
      )
    },
    {
      name: 'LEONI',
      logo: (
        <svg className="h-10 w-auto text-white/40 group-hover:text-white/80 transition-colors duration-300 fill-current" viewBox="0 0 110 30" xmlns="http://www.w3.org/2000/svg">
          <g transform="translate(10, 15)">
            <circle r="7" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle r="3" stroke="currentColor" strokeWidth="1" fill="none" />
            <line x1="-7" y1="0" x2="7" y2="0" stroke="currentColor" strokeWidth="1" />
            <line x1="0" y1="-7" x2="0" y2="7" stroke="currentColor" strokeWidth="1" />
          </g>
          <text x="28" y="20" fontFamily="system-ui, -apple-system, sans-serif" fontSize="13" fontWeight="800" letterSpacing="2" className="fill-current">LEONI</text>
        </svg>
      )
    },
    {
      name: 'DRÄXLMAIER',
      logo: (
        <svg className="h-10 w-auto text-white/40 group-hover:text-white/80 transition-colors duration-300 fill-current" viewBox="0 0 160 30" xmlns="http://www.w3.org/2000/svg">
          <text x="10" y="18" fontFamily="system-ui, -apple-system, sans-serif" fontSize="11" fontWeight="300" letterSpacing="4" className="fill-current">DRÄXLMAIER</text>
          <line x1="10" y1="23" x2="145" y2="23" stroke="currentColor" strokeWidth="1" />
        </svg>
      )
    },
    {
      name: 'KROMBERG & SCHUBERT',
      logo: (
        <svg className="h-10 w-auto text-white/40 group-hover:text-white/80 transition-colors duration-300 fill-current" viewBox="0 0 180 30" xmlns="http://www.w3.org/2000/svg">
          <g transform="translate(15, 15)">
            <circle cx="-4" cy="0" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="4" cy="0" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </g>
          <text x="32" y="15" fontFamily="system-ui, -apple-system, sans-serif" fontSize="9" fontWeight="800" letterSpacing="1" className="fill-current">KROMBERG</text>
          <text x="32" y="23" fontFamily="system-ui, -apple-system, sans-serif" fontSize="6" fontWeight="600" letterSpacing="0.5" className="fill-current opacity-70">& SCHUBERT</text>
        </svg>
      )
    },
    {
      name: 'COFAT',
      logo: (
        <svg className="h-10 w-auto text-white/40 group-hover:text-white/80 transition-colors duration-300 fill-current" viewBox="0 0 100 30" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 8 L18 8 L13 15 L18 22 L8 22 L13 15 Z" fill="currentColor" />
          <text x="24" y="20" fontFamily="system-ui, -apple-system, sans-serif" fontSize="14" fontWeight="900" letterSpacing="1.5" className="fill-current">COFAT</text>
        </svg>
      )
    },
    {
      name: 'LEAR',
      logo: (
        <svg className="h-10 w-auto text-white/40 group-hover:text-white/80 transition-colors duration-300 fill-current" viewBox="0 0 120 30" xmlns="http://www.w3.org/2000/svg">
          <text x="10" y="17" fontFamily="system-ui, -apple-system, sans-serif" fontSize="16" fontWeight="900" fontStyle="italic" letterSpacing="0.5" className="fill-current">LEAR</text>
          <text x="11" y="25" fontFamily="system-ui, -apple-system, sans-serif" fontSize="6" fontWeight="700" letterSpacing="1" className="fill-current opacity-80">CORPORATION</text>
        </svg>
      )
    },
    {
      name: 'YAZAKI',
      logo: (
        <svg className="h-10 w-auto text-white/40 group-hover:text-white/80 transition-colors duration-300 fill-current" viewBox="0 0 110 30" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 22 L15 8 L22 8 L12 22 Z" className="fill-current" />
          <path d="M14 8 L21 8 L14 22 L7 22 Z" className="fill-current opacity-60" />
          <text x="26" y="20" fontFamily="system-ui, -apple-system, sans-serif" fontSize="13" fontWeight="900" fontStyle="italic" letterSpacing="1" className="fill-current">YAZAKI</text>
        </svg>
      )
    }
  ];

  return (
    <div className="relative min-h-[300vh] bg-white text-[#010862] overflow-x-hidden selection:bg-[#010862] selection:text-white pb-24 font-inter">
      
      {/* CONFIGURATION DES POLICES ET DES ANIMATIONS */}
      <style>{`
        @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');

        .font-inter {
          font-family: 'Inter', sans-serif;
        }

        /* TRAME TECHNOLOGIQUE CLAIRE POUR L'EFFET GRILLE */
        .tech-grid-overlay-light {
          background-image: radial-gradient(rgba(1, 8, 98, 0.05) 1.2px, transparent 1.2px);
          background-size: 30px 30px;
        }

        .tech-grid-overlay {
          background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
          background-size: 24px 24px;
        }

        @keyframes floatAndTilt {
          0%, 100% { transform: translateY(0px) rotate(-22deg); }
          50% { transform: translateY(-25px) rotate(-22deg); }
        }
        .animate-floating-cable {
          animation: floatAndTilt 5s ease-in-out infinite;
        }

        .reveal-up {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 1.4s cubic-bezier(0.16, 1, 0.3, 1), transform 1.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .reveal-up-active {
          opacity: 1;
          transform: translateY(0);
        }

        .sharp-rendering {
          image-rendering: -webkit-optimize-contrast;
          image-rendering: crisp-edges;
          transform: translateZ(0);
          backface-visibility: hidden;
        }

        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 35s linear infinite;
        }
      `}</style>

      {/* ─── BLOC SUPÉRIEUR SOMBRE (HERO + CAROUSEL PARTENAIRES) ─── */}
      <div className="bg-[#010862] text-white relative overflow-hidden">
        
        {/* ARRIÈRE-PLAN SOMBRE */}
        <div className="absolute top-0 left-0 w-full h-screen z-0 overflow-hidden">
          <div 
            className="absolute inset-0 bg-cover bg-center sharp-rendering"
            style={{ 
              backgroundImage: `url('${backgroundSrc}')`,
              filter: 'contrast(1) brightness(0.6)', 
            }} 
          />
          <div className="absolute inset-0 tech-grid-overlay z-1" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_15%,#010862_98%)] z-2 opacity-85" />
          <div className="absolute bottom-0 left-0 w-full h-[9vh] bg-gradient-to-t from-[#010862] to-transparent z-3" />
        </div>

        {/* HERO CONTENT */}
        <section className="relative z-10 max-w-7xl mx-auto px-8 h-screen flex items-center">
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-20">
            
            {/* TEXTE GAUCHE */}
            <div className="lg:col-span-7 flex flex-col gap-6 select-none">
              <span className={`text-[10px] font-bold tracking-[0.35em] text-white/50 uppercase reveal-up ${isLoaded ? 'reveal-up-active' : ''}`} style={{ transitionDelay: '100ms' }}>
                {t('landing.heroKicker')}
              </span>
              <h1 className={`text-6xl sm:text-7xl md:text-8xl lg:text-[7.5rem] xl:text-[8.5rem] font-black tracking-tighter leading-[0.82] text-white uppercase reveal-up ${isLoaded ? 'reveal-up-active' : ''}`} style={{ transitionDelay: '250ms' }}>
                {t('landing.heroTitle')}<br />
                <span className="text-white/95 lowercase tracking-tight normal-case font-light">
                  {t('landing.heroTitle2')}<span className="text-[#3b82f6] font-bold">.</span>
                </span>
              </h1>
            </div>

            {/* TEXTE DROIT */}
            <div className="lg:col-span-5 flex flex-col gap-8 text-left lg:pl-12">
              <h2 className={`text-2xl md:text-3xl font-light tracking-tight text-white leading-tight reveal-up ${isLoaded ? 'reveal-up-active' : ''}`} style={{ transitionDelay: '450ms' }}>
                {t('landing.heroSubtitle1')}<br />{t('landing.heroSubtitle2')}
              </h2>
              <p className={`text-white/60 text-sm font-light leading-relaxed max-w-sm reveal-up ${isLoaded ? 'reveal-up-active' : ''}`} style={{ transitionDelay: '600ms' }}>
                {t('landing.heroText')}
              </p>
              <div className={`reveal-up ${isLoaded ? 'reveal-up-active' : ''}`} style={{ transitionDelay: '750ms' }}>
                <button className="group border border-white/20 hover:border-white rounded-full px-8 py-3.5 text-[10px] font-bold tracking-[0.2em] text-[#010862] bg-white hover:bg-transparent hover:text-white transition-all duration-500 flex items-center gap-4 w-fit">
                  {t('landing.heroCta')} 
                  <i className="fas fa-arrow-right text-[9px] group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>

          </div>

          {/* LE CÂBLE VIRTUALISÉ */}
          <div 
            className="absolute pointer-events-none z-30 hidden lg:block lg:left-[45%] lg:top-[7%] xl:left-[47%] xl:top-[9%]"
            style={{
              transform: `translateY(${cableTranslateY}px) scale(${cableScale})`,
              transition: 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1)', 
            }}
          >
            <div className="animate-floating-cable flex flex-col items-center">
              <img 
                src={cablesSrc} 
                alt={t('landing.cableAlt')} 
                className="w-[85px] xl:w-[105px] h-auto object-contain select-none sharp-rendering filter drop-shadow-[-25px_25px_30px_rgba(0,0,0,0.7)]"
              />
              <div className="w-12 h-1 bg-black/50 rounded-full blur-md mt-2 opacity-50 -rotate-12" />
            </div>
          </div>
        </section>

        {/* RUBAN PARTENAIRES SOMBRE */}
        <section className="relative z-20 w-full border-t border-white/[0.06] bg-white/[0.005] py-14 overflow-hidden select-none">
          <div className="max-w-7xl mx-auto px-8 mb-10 text-center">
            <p className="text-[10px] md:text-xs font-semibold tracking-[0.25em] text-white/30 uppercase">
              {t('landing.partners')}
            </p>
          </div>
          <div className="relative w-full flex overflow-x-hidden items-center py-2">
            <div className="absolute top-0 left-0 w-40 h-full bg-gradient-to-r from-[#010862] to-transparent z-10 pointer-events-none" />
            <div className="absolute top-0 right-0 w-40 h-full bg-gradient-to-l from-[#010862] to-transparent z-10 pointer-events-none" />
            <div className="flex gap-14 shrink-0 animate-marquee whitespace-nowrap items-center">
              {tier1PartnersLogos.map((partner, index) => (
                <div key={`p1-${index}`} className="group cursor-default flex items-center justify-center">
                  {partner.logo}
                </div>
              ))}
              {tier1PartnersLogos.map((partner, index) => (
                <div key={`p2-${index}`} className="group cursor-default flex items-center justify-center">
                  {partner.logo}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ─── TRANSITION ULTRA-PROPRE GÉOMÉTRIQUE SANS FLOU ─── */}
      <div className="w-full h-[2px] bg-[#3b82f6] relative z-30" />

      {/* ─── SECTION 01: MÉTALLURGIE & INNOVATION (BLANC) ─── */}
      <section className="relative z-20 w-full bg-white text-[#010862] py-28 overflow-hidden">
        {/* Grille technique en arrière-plan */}
        <div className="absolute inset-0 tech-grid-overlay-light pointer-events-none opacity-80" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          
          {/* Côté Gauche */}
          <div className="lg:col-span-5 flex flex-col gap-4 select-none">
            <span className="text-[10px] font-bold tracking-[0.4em] text-[#3b82f6] uppercase">
              {t('landing.s1Kicker')}
            </span>
            <h3 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-[#010862] leading-tight">
              {t('landing.s1Title1')} <br />
              {t('landing.s1Title2')} <br />
              {t('landing.s1Title3')}
            </h3>
          </div>

          {/* Côté Droit */}
          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-8 lg:pl-6">
            <p className="text-xl font-medium text-[#010862]/90 leading-relaxed">
              {t('landing.s1Lead')}
            </p>
            <p className="text-slate-500 text-sm leading-relaxed font-light">
              {t('landing.s1Text')}
            </p>
          </div>

        </div>
      </section>

      {/* ─── SECTION 02: CAPACITÉS HIGH-TECH (BLANC) ─── */}
      <section className="relative z-20 w-full bg-white text-[#010862] pb-24">
        <div className="max-w-7xl mx-auto px-8 grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Carte 1 */}
          <div className="group relative bg-slate-50/50 border border-[#010862]/10 hover:border-[#3b82f6] rounded-2xl p-8 hover:shadow-xl hover:shadow-[#010862]/5 transition-all duration-500 overflow-hidden">
            <div className="w-12 h-12 rounded-xl bg-[#010862]/5 flex items-center justify-center text-[#010862] mb-8 border border-[#010862]/10 group-hover:bg-[#3b82f6] group-hover:text-white group-hover:border-transparent transition-all duration-500">
              <i className="fas fa-bolt text-lg" />
            </div>
            <span className="text-[9px] font-bold text-[#3b82f6] tracking-widest block mb-2 uppercase">{t('landing.card1Kicker')}</span>
            <h4 className="text-xl font-bold text-[#010862] mb-3">{t('landing.card1Title')}</h4>
            <p className="text-slate-500 text-xs font-light leading-relaxed">
              {t('landing.card1Text')}
            </p>
          </div>

          {/* Carte 2 */}
          <div className="group relative bg-slate-50/50 border border-[#010862]/10 hover:border-[#3b82f6] rounded-2xl p-8 hover:shadow-xl hover:shadow-[#010862]/5 transition-all duration-500 overflow-hidden">
            <div className="w-12 h-12 rounded-xl bg-[#010862]/5 flex items-center justify-center text-[#010862] mb-8 border border-[#010862]/10 group-hover:bg-[#3b82f6] group-hover:text-white group-hover:border-transparent transition-all duration-500">
              <i className="fas fa-atom text-lg" />
            </div>
            <span className="text-[9px] font-bold text-[#3b82f6] tracking-widest block mb-2 uppercase">{t('landing.card2Kicker')}</span>
            <h4 className="text-xl font-bold text-[#010862] mb-3">{t('landing.card2Title')}</h4>
            <p className="text-slate-500 text-xs font-light leading-relaxed">
              {t('landing.card2Text')}
            </p>
          </div>

          {/* Carte 3 */}
          <div className="group relative bg-slate-50/50 border border-[#010862]/10 hover:border-[#3b82f6] rounded-2xl p-8 hover:shadow-xl hover:shadow-[#010862]/5 transition-all duration-500 overflow-hidden">
            <div className="w-12 h-12 rounded-xl bg-[#010862]/5 flex items-center justify-center text-[#010862] mb-8 border border-[#010862]/10 group-hover:bg-[#3b82f6] group-hover:text-white group-hover:border-transparent transition-all duration-500">
              <i className="fas fa-shield-alt text-lg" />
            </div>
            <span className="text-[9px] font-bold text-[#3b82f6] tracking-widest block mb-2 uppercase">{t('landing.card3Kicker')}</span>
            <h4 className="text-xl font-bold text-[#010862] mb-3">{t('landing.card3Title')}</h4>
            <p className="text-slate-500 text-xs font-light leading-relaxed">
              {t('landing.card3Text')}
            </p>
          </div>

        </div>
      </section>

      {/* ─── SECTION 03: CHIFFRES CLÉS (BLANC / GRIS TRÈS CLAIR) ─── */}
      <section className="relative z-20 w-full bg-slate-50 border-y border-[#010862]/10 py-16">
        <div className="max-w-7xl mx-auto px-8 grid grid-cols-2 md:grid-cols-4 gap-8 text-center md:text-left select-none">
          <div className="flex flex-col gap-1">
            <span className="text-4xl md:text-5xl font-black text-[#010862] tracking-tight">15+</span>
            <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">{t('landing.statSites')}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-4xl md:text-5xl font-black text-[#010862] tracking-tight">30M+</span>
            <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">{t('landing.statVehicles')}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-4xl md:text-5xl font-black text-[#3b82f6] tracking-tight">-40%</span>
            <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">{t('landing.statWeight')}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-4xl md:text-5xl font-black text-[#010862] tracking-tight">3</span>
            <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">{t('landing.statRnd')}</span>
          </div>
        </div>
      </section>

      {/* ─── SECTION 04: CONSTRUCTEURS AUTOMOBILES (REMISE EN BLEU SOMBRE) ─── */}
      <section className="relative z-20 w-full bg-[#010862] text-white py-28 overflow-hidden">
        {/* Grille d'ingénierie fine sur fond sombre */}
        <div className="absolute inset-0 tech-grid-overlay pointer-events-none opacity-40" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          
          {/* Côté Gauche */}
          <div className="lg:col-span-4 flex flex-col gap-4 select-none">
            <span className="text-[10px] font-bold tracking-[0.4em] text-[#3b82f6] uppercase">
              {t('landing.s2Kicker')}
            </span>
            <h3 className="text-4xl font-extrabold tracking-tight text-white leading-tight">
              {t('landing.s2Title1')} <br />
              {t('landing.s2Title2')}
            </h3>
            <p className="text-white/60 text-sm leading-relaxed font-light mt-2">
              {t('landing.s2Text')}
            </p>
          </div>

          {/* Côté Droite : Les Grilles de Constructeurs avec style Premium Sombre */}
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 lg:pl-6">
            
            {/* Stellantis */}
            <div className="border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#3b82f6] hover:shadow-2xl hover:shadow-black/20 p-6 rounded-2xl transition-all duration-300">
              <span className="text-[9px] font-bold text-[#3b82f6] tracking-widest uppercase block mb-2">{t('landing.labelGroup')}</span>
              <h4 className="text-lg font-black text-white mb-2">STELLANTIS</h4>
              <p className="text-white/60 text-xs font-light leading-relaxed">{t('landing.oemStellantis')}</p>
            </div>

            {/* Volkswagen Group */}
            <div className="border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#3b82f6] hover:shadow-2xl hover:shadow-black/20 p-6 rounded-2xl transition-all duration-300">
              <span className="text-[9px] font-bold text-[#3b82f6] tracking-widest uppercase block mb-2">{t('landing.labelGroup')}</span>
              <h4 className="text-lg font-black text-white mb-2">VOLKSWAGEN</h4>
              <p className="text-white/60 text-xs font-light leading-relaxed">Audi, Volkswagen, Skoda, Seat.</p>
            </div>

            {/* Renault Nissan */}
            <div className="border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#3b82f6] hover:shadow-2xl hover:shadow-black/20 p-6 rounded-2xl transition-all duration-300">
              <span className="text-[9px] font-bold text-[#3b82f6] tracking-widest uppercase block mb-2">ALLIANCE</span>
              <h4 className="text-lg font-black text-white mb-2">RENAULT-NISSAN</h4>
              <p className="text-white/60 text-xs font-light leading-relaxed">{t('landing.oemRenault')}</p>
            </div>

            {/* BMW */}
            <div className="border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#3b82f6] hover:shadow-2xl hover:shadow-black/20 p-6 rounded-2xl transition-all duration-300">
              <span className="text-[9px] font-bold text-[#3b82f6] tracking-widest uppercase block mb-2">PREMIUM</span>
              <h4 className="text-lg font-black text-white mb-2">BMW GROUP</h4>
              <p className="text-white/60 text-xs font-light leading-relaxed">{t('landing.oemBmw')}</p>
            </div>

            {/* Ford */}
            <div className="border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#3b82f6] hover:shadow-2xl hover:shadow-black/20 p-6 rounded-2xl transition-all duration-300">
              <span className="text-[9px] font-bold text-[#3b82f6] tracking-widest uppercase block mb-2">{t('landing.labelMaker')}</span>
              <h4 className="text-lg font-black text-white mb-2">FORD</h4>
              <p className="text-white/60 text-xs font-light leading-relaxed">{t('landing.oemFord')}</p>
            </div>

            {/* Opel */}
            <div className="border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#3b82f6] hover:shadow-2xl hover:shadow-black/20 p-6 rounded-2xl transition-all duration-300">
              <span className="text-[9px] font-bold text-[#3b82f6] tracking-widest uppercase block mb-2">{t('landing.labelMaker')}</span>
              <h4 className="text-lg font-black text-white mb-2">OPEL</h4>
              <p className="text-white/60 text-xs font-light leading-relaxed">{t('landing.oemOpel')}</p>
            </div>

          </div>

        </div>
      </section>

      {/* ─── TRANSITION ULTRA-PROPRE DE RETOUR VERS LE BLANC ─── */}
      <div className="w-full h-[2px] bg-[#3b82f6] relative z-30" />

      {/* ─── SECTION 05: ALLIANCES STRATÉGIQUES (BLANC) ─── */}
      <section className="relative z-20 w-full bg-white text-[#010862] py-24">
        {/* Grille technique en arrière-plan */}
        <div className="absolute inset-0 tech-grid-overlay-light pointer-events-none opacity-80" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Côté Gauche */}
          <div className="lg:col-span-5 flex flex-col gap-4 select-none">
            <span className="text-[10px] font-bold tracking-[0.4em] text-[#3b82f6] uppercase">
              {t('landing.s3Kicker')}
            </span>
            <h3 className="text-4xl font-extrabold tracking-tight text-[#010862] leading-tight">
              {t('landing.s3Title1')} <br />{t('landing.s3Title2')}
            </h3>
            <p className="text-slate-500 text-sm leading-relaxed font-light mt-2 max-w-sm">
              {t('landing.s3Text')}
            </p>
          </div>

          {/* Côté Droit */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-8">
            
            {/* Aurubis */}
            <div className="group relative bg-slate-50/50 border border-amber-500/20 hover:border-amber-500 p-8 rounded-2xl hover:bg-white hover:shadow-xl transition-all duration-500 overflow-hidden">
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl" />
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 mb-6 border border-amber-500/20 group-hover:bg-amber-500 group-hover:text-white transition-all duration-500">
                <i className="fas fa-cubes text-lg" />
              </div>
              <span className="text-[9px] font-bold text-amber-600 tracking-widest block mb-2 uppercase">{t('landing.aurubisKicker')}</span>
              <h4 className="text-xl font-bold text-[#010862] mb-3">AURUBIS</h4>
              <p className="text-slate-500 text-xs font-light leading-relaxed">
                {t('landing.aurubisText')}
              </p>
            </div>

            {/* ATUGE */}
            <div className="group relative bg-slate-50/50 border border-[#010862]/10 hover:border-[#3b82f6] p-8 rounded-2xl hover:bg-white hover:shadow-xl transition-all duration-500 overflow-hidden">
              <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#3b82f6]/5 rounded-full blur-3xl" />
              <div className="w-12 h-12 rounded-xl bg-[#010862]/5 flex items-center justify-center text-[#3b82f6] mb-6 border border-[#010862]/10 group-hover:bg-[#3b82f6] group-hover:text-white transition-all duration-500">
                <i className="fas fa-globe text-lg" />
              </div>
              <span className="text-[9px] font-bold text-[#3b82f6] tracking-widest block mb-2 uppercase">{t('landing.atugeKicker')}</span>
              <h4 className="text-xl font-bold text-[#010862] mb-3">ATUGE</h4>
              <p className="text-slate-500 text-xs font-light leading-relaxed">
                {t('landing.atugeText')}
              </p>
            </div>

          </div>

        </div>
      </section>

    </div>
  );
}