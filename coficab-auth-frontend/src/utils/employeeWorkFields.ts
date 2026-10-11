/** Valeurs métier cohérentes avec le rôle / département (fallback / seed). */
export function inferWorkFieldsFromDepartment(
  department?: string | null,
  role?: string | null,
): {
  poste: string;
  equipe: string;
  ligneProduction: string;
} {
  const r = String(role ?? '').toLowerCase();
  if (r === 'superadmin' || r.includes('superadmin') || r.includes('super admin')) {
    return {
      poste: 'Super Administrateur',
      equipe: 'Direction système',
      ligneProduction: 'Siège administratif',
    };
  }
  if (r === 'admin' || r === 'administrator' || r.includes('administrateur')) {
    return {
      poste: 'Administrateur',
      equipe: 'Équipe Administration',
      ligneProduction: 'Bureau Admin',
    };
  }
  if (r === 'manager') {
    return {
      poste: 'Manager',
      equipe: 'Équipe Management',
      ligneProduction: 'Bureau Manager',
    };
  }

  const d = String(department ?? '').toLowerCase();
  if (/prod|fabric|ligne/.test(d)) {
    return { poste: 'Opérateur de production', equipe: 'Équipe Production A', ligneProduction: 'Ligne 1' };
  }
  if (/qual/.test(d)) {
    return { poste: 'Technicien qualité', equipe: 'Équipe Qualité', ligneProduction: 'Ligne 2' };
  }
  if (/rh|hr|ressource|hrr/.test(d)) {
    return { poste: 'Gestionnaire RH', equipe: 'Équipe RH', ligneProduction: 'Bureau RH' };
  }
  if (/it|info/.test(d)) {
    return { poste: 'Technicien IT', equipe: 'Équipe Support IT', ligneProduction: 'Support IT' };
  }
  if (/maint/.test(d)) {
    return { poste: 'Technicien maintenance', equipe: 'Équipe Maintenance', ligneProduction: 'Ligne 1' };
  }
  if (/financ|compta/.test(d)) {
    return { poste: 'Analyste financier', equipe: 'Équipe Finance', ligneProduction: 'Bureau Finance' };
  }
  return { poste: 'Collaborateur Coficab', equipe: 'Équipe Générale', ligneProduction: 'Hors ligne' };
}

export function phoneFromId(id?: string | null): string {
  const raw = String(id ?? '0');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  const n = (hash % 900000) + 100000;
  return `+216 70 ${n}`;
}

export function isAdminLikeRole(role?: string | null): boolean {
  const r = String(role ?? '').toLowerCase();
  return r === 'admin' || r === 'superadmin' || r.includes('superadmin') || r.includes('administrateur');
}
