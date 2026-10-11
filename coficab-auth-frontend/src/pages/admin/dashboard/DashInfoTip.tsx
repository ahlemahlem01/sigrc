import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COFICAB } from './dashPalette';

type Props = {
  text: string;
  title?: string;
  side?: 'top' | 'bottom';
};

/** Popup d’explication au survol uniquement — position fixe pour rester lisible. */
export default function DashInfoTip({ text, title, side = 'top' }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const tipId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const updatePos = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12));
    const top = side === 'bottom' ? r.bottom + 10 : r.top - 10;
    setPos({ top, left });
  }, [side]);

  const show = () => {
    clearClose();
    updatePos();
    setOpen(true);
  };

  const hideSoon = () => {
    clearClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => clearClose(), []);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePos();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, updatePos]);

  const tooltip = open ? (
    <div
      id={tipId}
      role="tooltip"
      onMouseEnter={show}
      onMouseLeave={hideSoon}
      style={{
        position: 'fixed',
        zIndex: 9999,
        top: side === 'bottom' ? pos.top : undefined,
        bottom: side === 'top' ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: Math.min(300, window.innerWidth - 24),
        background: '#fff',
        color: COFICAB.ink,
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.55,
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${COFICAB.line}`,
        boxShadow: '0 16px 40px rgba(13,19,64,0.18)',
        textAlign: 'left',
        pointerEvents: 'auto',
      }}
    >
      {title && (
        <div
          style={{
            fontWeight: 700,
            marginBottom: 6,
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: COFICAB.navy,
          }}
        >
          {title}
        </div>
      )}
      <div style={{ color: '#334155' }}>{text}</div>
    </div>
  ) : null;

  return (
    <>
      <span
        className="dash-tip"
        style={{ display: 'inline-flex', verticalAlign: 'middle' }}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
      >
        <button
          ref={btnRef}
          type="button"
          className="dash-tip-btn"
          aria-expanded={open}
          aria-describedby={open ? tipId : undefined}
          aria-label={title || 'Info'}
          tabIndex={-1}
          style={{
            width: 18,
            height: 18,
            padding: 0,
            border: `1px solid ${COFICAB.line}`,
            borderRadius: '50%',
            background: open ? COFICAB.light : '#fff',
            color: COFICAB.navy,
            cursor: 'help',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            lineHeight: 1,
            flexShrink: 0,
            transition: 'background .15s, box-shadow .15s',
            boxShadow: open ? `0 0 0 3px ${COFICAB.light}` : 'none',
          }}
        >
          <i className="ti ti-info-circle" style={{ fontSize: 13 }} />
        </button>
      </span>
      {typeof document !== 'undefined' && tooltip ? createPortal(tooltip, document.body) : null}
    </>
  );
}
