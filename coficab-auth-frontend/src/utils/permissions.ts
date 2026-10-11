export type UserRole = 'EMPLOYEE' | 'ADMIN_QUALITY' | 'SUPERADMIN';

export interface UserContextData {
  userId: string;
  role: UserRole;
  assignedClaimIds?: string[]; // IDs des réclamations attribuées à l'employé
}

export const canEditAnalysis = (user: UserContextData, claimId: string): boolean => {
  if (user.role === 'SUPERADMIN' || user.role === 'ADMIN_QUALITY') return true;
  if (user.role === 'EMPLOYEE') {
    return user.assignedClaimIds?.includes(claimId) ?? false;
  }
  return false;
};

export const canValidateAnalysis = (user: UserContextData): boolean => {
  return user.role === 'ADMIN_QUALITY' || user.role === 'SUPERADMIN';
};

export const canDeleteAnalysis = (user: UserContextData): boolean => {
  return user.role === 'SUPERADMIN' || user.role === 'ADMIN_QUALITY';
};

export const canViewGlobalAnalytics = (user: UserContextData): boolean => {
  return user.role === 'ADMIN_QUALITY' || user.role === 'SUPERADMIN';
};