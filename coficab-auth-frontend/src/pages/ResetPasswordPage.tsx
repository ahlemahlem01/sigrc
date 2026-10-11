import { useState } from 'react';
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
    const token = decodeURIComponent(params.get('token') ?? '');
    try {
      await resetPassword(email, token, newPassword);
      navigate('/login');
    } catch {
      setError(t('resetPassword.invalidLink'));
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