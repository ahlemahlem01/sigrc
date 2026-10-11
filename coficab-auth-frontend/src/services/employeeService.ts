import { ACTION_PLAN_API_URL as API_URL } from '../config/apiEnv';

const getAuthHeaders = (token: string | null) => ({
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  'Content-Type': 'application/json',
});

const handleResponse = async (res: Response) => {
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
};

// ── SELF (pour l'employé connecté) ──
export const employeeService = {
  getProfile: (token: string | null) =>
    fetch(`${API_URL}/employee/profile`, { headers: getAuthHeaders(token) }).then(handleResponse),

  // ✏️ ✅ AJOUT : Mise à jour des informations de profil
  updateProfile: (token: string | null, data: {
    name?: string;
    phone?: string;
    telephone?: string;
    status?: string;
    poste?: string;
    equipe?: string;
    ligneProduction?: string | null;
    profilePictureUrl?: string | null;
  }) =>
    fetch(`${API_URL}/employee/profile`, {
      method: 'PUT',
      headers: getAuthHeaders(token),
      body: JSON.stringify(data),
    }).then(handleResponse),

  getBadges: (token: string | null) =>
    fetch(`${API_URL}/employee/badges`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getCompletedPlans: (token: string | null) =>
    fetch(`${API_URL}/employee/completed-plans`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getTimeline: (token: string | null) =>
    fetch(`${API_URL}/employee/timeline`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getSkills: (token: string | null) =>
    fetch(`${API_URL}/employee/skills`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getTeam: (token: string | null) =>
    fetch(`${API_URL}/employee/team`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getDocuments: (token: string | null) =>
    fetch(`${API_URL}/employee/documents`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getQuickStats: (token: string | null) =>
    fetch(`${API_URL}/employee/stats`, { headers: getAuthHeaders(token) }).then(handleResponse),

  // 📸 ✅ Envoi de la photo de profil (Avatar)
  uploadAvatar: (token: string | null, file: File) => {
    const formData = new FormData();
    formData.append('file', file); // 'file' doit correspondre au nom du paramètre IFormFile dans l'API .NET

    return fetch(`${API_URL}/employee/profile/avatar`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {}, // Pas de Content-Type ici
      body: formData,
    }).then(handleResponse);
  },
};

// ── ADMIN (pour gérer n'importe quel employé) ──
export const adminEmployeeService = {
  getAllProfiles: (token: string | null) =>
    fetch(`${API_URL}/admin/employees`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getProfile: (token: string | null, employeeId: string) =>
    fetch(`${API_URL}/admin/employees/${employeeId}/profile`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getBadges: (token: string | null, employeeId: string) =>
    fetch(`${API_URL}/admin/employees/${employeeId}/badges`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getCompletedPlans: (token: string | null, employeeId: string) =>
    fetch(`${API_URL}/admin/employees/${employeeId}/completed-plans`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getTimeline: (token: string | null, employeeId: string) =>
    fetch(`${API_URL}/admin/employees/${employeeId}/timeline`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getSkills: (token: string | null, employeeId: string) =>
    fetch(`${API_URL}/admin/employees/${employeeId}/skills`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getTeam: (token: string | null, employeeId: string) =>
    fetch(`${API_URL}/admin/employees/${employeeId}/team`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getDocuments: (token: string | null, employeeId: string) =>
    fetch(`${API_URL}/admin/employees/${employeeId}/documents`, { headers: getAuthHeaders(token) }).then(handleResponse),

  getQuickStats: (token: string | null, employeeId: string) =>
    fetch(`${API_URL}/admin/employees/${employeeId}/stats`, { headers: getAuthHeaders(token) }).then(handleResponse),

  // Actions admin
  assignBadge: (token: string | null, employeeId: string, badgeId: string) =>
    fetch(`${API_URL}/admin/employees/${employeeId}/badges`, {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify({ badgeId }),
    }).then(handleResponse),

  removeBadge: (token: string | null, employeeId: string, badgeId: string) =>
    fetch(`${API_URL}/admin/employees/${employeeId}/badges/${badgeId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(token),
    }).then(handleResponse),

  addDocument: (token: string | null, employeeId: string, docData: {
    name: string;
    type: string;
    url: string;
    viewedAt: string;
  }) => fetch(`${API_URL}/admin/employees/${employeeId}/documents`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(docData),
  }).then(handleResponse),

  deleteDocument: (token: string | null, employeeId: string, docId: string) =>
    fetch(`${API_URL}/admin/employees/${employeeId}/documents/${docId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(token),
    }).then(handleResponse),

  addTimelineEvent: (token: string | null, employeeId: string, eventData: {
    title: string;
    description: string;
    type: string;
    timestamp: string;
  }) => fetch(`${API_URL}/admin/employees/${employeeId}/timeline`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(eventData),
  }).then(handleResponse),
};