import { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { ACTION_PLAN_API_URL } from '../config/apiEnv';

type LicenceState = { state: 'none' | 'ok' | 'expiring' | 'expired'; daysLeft: number | null; expiresAt: string | null };

/**
 * The message of the specification: an alert before the licence expires, and a message at the top of the pages and on the
 * login page once it is out. Silent when no licence is recorded or when it is valid for a long time.
 */
export const LICENCE_CHANGED_EVENT = 'licence:changed';

export default function LicenceBanner({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const [licence, setLicence] = useState<LicenceState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => axios.get(`${ACTION_PLAN_API_URL}/system/public`)
      .then((r) => { if (!cancelled) setLicence(r.data?.licence ?? null); })
      .catch(() => { if (!cancelled) setLicence(null); });
    void load();
    window.addEventListener(LICENCE_CHANGED_EVENT, load);
    return () => { cancelled = true; window.removeEventListener(LICENCE_CHANGED_EVENT, load); };
  }, []);

  if (!licence || (licence.state !== 'expiring' && licence.state !== 'expired')) return null;

  const expired = licence.state === 'expired';
  const date = licence.expiresAt ? new Date(licence.expiresAt).toLocaleDateString(i18n.language) : '';
  return (
    <div
      role="alert"
      className={className}
      style={{
        padding: '8px 16px', fontSize: 13, fontWeight: 600, textAlign: 'center',
        background: expired ? '#fef2f2' : '#fffbeb', color: expired ? '#b91c1c' : '#92400e',
        borderBottom: `1px solid ${expired ? '#fecaca' : '#fde68a'}`,
      }}
    >
      {expired ? t('licence.expired', { date }) : t('licence.expiring', { count: Math.max(0, licence.daysLeft ?? 0), date })}
    </div>
  );
}
