import { useState } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../services/authService';
import { useTranslation } from 'react-i18next';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const email = params.get('email') ?? '';
    const token = params.get('token') ?? '';   // already decoded by the URL parser
    try {
      await resetPassword(email, token, newPassword);
      navigate('/login');
    } catch (e) {
      // the server explains the password rules (to the holder of a valid link); anything else is just "invalid link"
      const data = axios.isAxiosError(e) ? (e.response?.data as { code?: string; message?: string } | undefined) : undefined;
      setError(data?.code === 'weak_password' && data.message ? data.message : t('resetPassword.invalidLink'));
    }
  };

  return (
    <div className="login-container">
      <h2>{t('usersAdmin.newPassword')}</h2>
      <input
        type="password"
        placeholder={t('usersAdmin.newPassword')}
        value={newPassword}
        onChange={e => setNewPassword(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <button onClick={handleSubmit}>{t('common.reset')}</button>
    </div>
  );
}