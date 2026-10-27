/**
 * Phone / small tablet navigation shared by the admin and the employee layouts (they use the same `al-` classes):
 * below 768 px the icon rail becomes a drawer opened by a burger button in the top bar (hovering does not exist on a touch
 * screen), and the top bar keeps only what fits: burger, title, language, bell and avatar.
 */
export const MOBILE_NAV_CSS = `
  .al-burger { display: none; }
  .al-scrim { display: none; }

  @media (max-width: 768px) {
    .al-tb-user-info, .al-tb-date { display: none; }

    .al-sidebar { width: min(280px, 84vw); transform: translateX(-100%); transition: transform .22s cubic-bezier(.4,0,.2,1); overflow-y: auto; }
    .al-sidebar.mobile-open { transform: none; box-shadow: 4px 0 24px rgba(0,0,0,.18); }
    .al-scrim.open { display: block; position: fixed; inset: 0; background: rgba(15, 23, 42, .4); z-index: 190; }
    .al-content-shell, .al-content-shell.shifted { margin-left: 0; }

    .al-topbar { padding: 0 10px; gap: 8px; }
    .al-burger { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 40px; height: 40px;
      border: 1px solid #e4e8f2; border-radius: 10px; background: #fff; color: #000168; font-size: 20px; cursor: pointer; }
    .al-tb-left { flex-direction: row; align-items: center; gap: 8px; min-width: 0; flex: 1 1 auto; }
    .al-tb-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; margin: 0; }
    .al-tb-crumb, .al-tb-search { display: none; }
    .al-tb-right { gap: 6px; flex-shrink: 0; }
    .al-tb-ico { width: 40px; height: 40px; }

    /* the page itself: less side padding, tables and wide blocks scroll inside their card instead of the page */
    .al-page { padding: 14px 12px 28px; }
    .al-page table { display: block; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .al-page img, .al-page canvas, .al-page svg { max-width: 100%; }
    .al-page input:not([type="checkbox"]):not([type="radio"]), .al-page select, .al-page textarea { font-size: 16px; }
  }
  @media (max-width: 480px) {
    .al-tb-right > :first-child { max-width: 128px; }
    .al-page { padding: 12px 10px 28px; }
  }
`;
