// src/services/badgeService.ts

import { ACTION_PLAN_API_URL as API_BASE } from '../config/apiEnv';

export interface BadgeApiDto {
  id: string;
  userId?: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category?: string;
  earnedAt?: string;
  awardedAt?: string;
  createdAt?: string;
}

export async function getUserBadges(token: string) {
  console.log('🚀 Token:', token.substring(0, 30) + '...');
  
  const res = await fetch(`${API_BASE}/badges/me`, {
    headers: { 
      'Authorization': `Bearer ${token}`,  // ← Espace après Bearer !
    }
  });
  
  console.log('📡 Status:', res.status);
  
  if (!res.ok) {
    const text = await res.text();
    console.error('❌ Body:', text);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  
  return res.json();
}

export async function getUserBadgesById(userId: string, token: string) {
  const res = await fetch(`${API_BASE}/badges/user/${userId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
