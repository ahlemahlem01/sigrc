import { FormEvent, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AUTH_API_URL as AUTH_API } from '../config/apiEnv';
import { useAuth } from '../context/AuthContext';

/**
 * The person signs in with a temporary password (account created, or password reinitialized by an administrator): he chooses
 * his own before going anywhere else (status "reinitialized" of the specification).
 */
export default function ChangePasswordPage() {
  const { t } = useTranslation();
  const { accessToken, user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const forced = Boolean((user as any)?.mustChangePassword);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError(t('changePassword.mismatch')); return; }
    setBusy(true);
    try {
      await axios.post(`${AUTH_API}/api/password/change`, { currentPassword: current, newPassword: next }, { headers: { Authorization: `Bearer ${accessToken}` } });
      updateUser({ mustChangePassword: false });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const data = axios.isAxiosError(err) ? (err.response?.data as any) : null;
      setError(data?.message || t('changePassword.failed'));
    } finally {
      setBusy(false);
    }
  };

  const field: React.CSSProperties = { width: '100%', height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: 16 }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: 28, boxShadow: '0 10px 30px rgba(15,23,42,.08)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#000168', margin: '0 0 6px' }}>{t('changePassword.title')}</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 18px' }}>{forced ? t('changePassword.forced') : t('changePassword.help')}</p>

        <label style={{ fontSize: 12, fontWeight: 600 }}>{t('changePassword.current')}
          <input style={{ ...field, margin: '4px 0 12px' }} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label style={{ fontSize: 12, fontWeight: 600 }}>{t('changePassword.new')}
          <input style={{ ...field, margin: '4px 0 4px' }} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </label>
        <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 12px' }}>{t('changePassword.rules')}</p>
        <label style={{ fontSize: 12, fontWeight: 600 }}>{t('changePassword.confirm')}
          <input style={{ ...field, margin: '4px 0 12px' }} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>

        {error && <p role="alert" style={{ fontSize: 13, color: '#b91c1c', margin: '0 0 12px' }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ width: '100%', height: 42, borderRadius: 10, border: 0, background: '#000168', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          {busy ? t('common.saving') : t('changePassword.submit')}
        </button>
        {forced && (
          <button type="button" onClick={() => { logout(); navigate('/login'); }} style={{ width: '100%', marginTop: 10, background: 'none', border: 0, color: '#64748b', fontSize: 13, cursor: 'pointer' }}>
            {t('changePassword.signOut')}
          </button>
        )}
      </form>
    </div>
  );
}
