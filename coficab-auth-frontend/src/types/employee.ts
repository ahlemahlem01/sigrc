/** Profil employé (Action Plan UserProfile + champs Auth) */
export interface EmployeeProfile {
  id: string;
  name?: string;
  fullName?: string;
  email?: string;
  role?: string;
  department?: string;
  managerName?: string;
  managerEmail?: string;
  hireDate?: string | null;
  status?: string;
  /** Téléphone professionnel */
  telephone?: string | null;
  phone?: string | null;
  profilePictureUrl?: string | null;
  /** Poste / fonction — obligatoire */
  poste: string;
  /** Ligne de production — optionnel */
  ligneProduction?: string | null;
  /** Équipe — obligatoire */
  equipe: string;
  accountCreatedAt?: string | null;
  isLockedOut?: boolean;
}

export interface UpdateEmployeeProfilePayload {
  name?: string;
  telephone?: string | null;
  phone?: string | null;
  status?: string;
  poste?: string;
  ligneProduction?: string | null;
  equipe?: string;
}

export interface CreateEmployeePayload {
  fullName: string;
  email: string;
  department: string;
  role: string;
  permissions: string[];
  poste: string;
  equipe: string;
  ligneProduction?: string;
  telephone?: string;
}
