import axios from 'axios';

import { AUTH_API_URL as AUTH_API } from '../config/apiEnv';

/** Public OpenIddict client: the browser cannot keep a secret, so none is sent. */
const CLIENT_ID = 'coficab-frontend';

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserInfo {
  sub?: string;
  email?: string;
  name?: string;
  fullName?: string;
  department?: string;
  role?: string | string[];
  permission?: string | string[];
  
  
  phone?: string;
  profilePictureUrl?: string;
  hireDate?: string;
  managerName?: string;
  status?: string;

  // 🔑 Permet d'accepter toute autre propriété dynamique renvoyée par le serveur
  [key: string]: any;
}

// ✅ Remplace parseToken — appel serveur car token chiffré
export const getUserInfo = async (accessToken: string): Promise<UserInfo> => {
  const response = await axios.get<UserInfo>(
    `${AUTH_API}/api/me`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  return response.data;
};

// Login
export const login = async (
  email: string,
  password: string,
  captchaToken?: string | null
): Promise<TokenResponse> => {
  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('username', email);
  params.append('password', password);
  if (captchaToken) params.append('cf-turnstile-response', captchaToken);      // Cloudflare Turnstile (when the server asks for it)
  params.append('client_id', CLIENT_ID);
  params.append('scope', 'openid offline_access action-plan-api');
  //params.append('scope', 'openid offline_access action-plan-api roles');

  const response = await axios.post<TokenResponse>(
    `${AUTH_API}/connect/token`,
    params,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return response.data;
};

// Refresh token
export const refreshToken = async (
  refresh_token: string
): Promise<TokenResponse> => {
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', refresh_token);
  params.append('client_id', CLIENT_ID);
  params.append('scope', 'openid offline_access action-plan-api');
  //params.append('scope', 'openid offline_access action-plan-api roles');

  const response = await axios.post<TokenResponse>(
    `${AUTH_API}/connect/token`,
    params,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return response.data;
};

export const forgotPassword = async (email: string, turnstileToken?: string | null): Promise<void> => {
  await axios.post(`${AUTH_API}/api/password/forgot`, { email, turnstileToken: turnstileToken || undefined });
};

export const resetPassword = async (
  email: string,
  token: string,
  newPassword: string
): Promise<void> => {
  await axios.post(`${AUTH_API}/api/password/reset`, {
    email,
    token,
    newPassword
  });
};