// src/components/NotificationBell.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, NotificationItem } from '../hooks/useNotifications';
import { useTranslation } from 'react-i18next';
import i18n, { dateLocale } from '../i18n';

const IconBell = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return i18n.t('notificationBell.justNow');
  if (diff < 3600) return i18n.t('notificationBell.minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return i18n.t('notificationBell.hoursAgo', { n: Math.floor(diff / 3600) });
  return new Date(dateStr).toLocaleDateString(dateLocale());
}

function typeLabel(type?: string): string | null {
  const kind = String(type || '').toLowerCase();
  if (kind === 'claim_assigned') return i18n.t('notificationBell.kindAssignment');
  if (kind === 'quality_anomaly_alert') return i18n.t('notificationBell.kindAlert');
  if (kind === 'alert_report_to_validate') return i18n.t('notificationBell.kindToValidate');
  if (kind.startsWith('alert_report_')) return i18n.t('notificationBell.kindValidation');
  if (kind === 'plan_comment') return i18n.t('notificationBell.kindComment');
  if (kind.includes('plan') || kind.includes('capa')) return 'CAPA';
  if (kind === 'recognition_podium' || kind === 'badge_awarded') return i18n.t('notificationBell.kindRecognition');
  if (kind === 'document_added') return i18n.t('notificationBell.kindDocument');
  return null;
}

function resolvePath(n: NotificationItem): string | null {
  if (n.linkPath && n.linkPath.startsWith('/') && !n.linkPath.startsWith('//')) {
    return n.linkPath;
  }
  if (n.claimId) {
    return `/pages/front/my-claims?claimId=${encodeURIComponent(n.claimId)}`;
  }
  if (n.type === 'recognition_podium') return '/dashboard';
  if (n.actionPlanId) return `/pages/front/action-plans/${n.actionPlanId}`;
  return null;
}

interface NotificationBellProps {
  color?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ color = '#0d1340' }) => {
  const { t } = useTranslation();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClick = async (n: NotificationItem) => {
    if (!n.isRead) await markAsRead(n.id);
    const path = resolvePath(n);
    if (path) navigate(path);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 8, borderRadius: 8, color, display: 'flex', alignItems: 'center'
        }}
        title={t('common.notifications')}
        aria-label={unreadCount > 0 ? t('notificationBell.ariaUnread', { count: unreadCount }) : t('common.notifications')}
      >
        <IconBell />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, background: '#dc2626', color: '#fff',
            fontSize: 10, fontWeight: 700, borderRadius: 999, minWidth: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px'
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '110%', width: 360, maxHeight: 440, overflowY: 'auto',
          background: '#fff', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
          border: '1px solid #e4e8f2', zIndex: 1000
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #f0f2f8',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8
          }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#0d1340' }}>{t('common.notifications')}</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); void markAllAsRead(); }}
                style={{
                  border: 'none', background: 'transparent', color: '#2563eb',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0
                }}
              >
                {t('notificationBell.markAllRead')}
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
              {t('notificationBell.empty')}
            </div>
          ) : (
            notifications.map(n => {
              const kind = typeLabel(n.type);
              const isClaim = String(n.type || '').toLowerCase() === 'claim_assigned';
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f8f9fc',
                    background: n.isRead ? '#fff' : isClaim ? '#eff6ff' : '#f8fafc',
                    transition: 'background 0.15s',
                    borderLeft: n.isRead ? '3px solid transparent' : isClaim ? '3px solid #2563eb' : '3px solid #94a3b8'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      {kind && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                          color: isClaim ? '#1d4ed8' : '#64748b'
                        }}>
                          {kind}
                        </span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0d1340' }}>{n.title}</span>
                    </div>
                    {!n.isRead && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', flexShrink: 0, marginTop: 4 }} />}
                  </div>
                  <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.4 }}>{n.message}</p>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, display: 'block' }}>{timeAgo(n.createdAt)}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
