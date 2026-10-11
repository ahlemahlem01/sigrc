import { ACTION_PLAN_API_URL as BASE_URL } from '../config/apiEnv';

async function request<T>(url: string, token: string | null): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface AssignedActionPlanDto {
  id: string;
  title: string;
  description?: string;
  status: number;
  progress: number;
  assignedToId: string;
  createdAt: string;
  permissions: {
    view: boolean;
    edit: boolean;
    delete: boolean;
  };
}

export interface PlanActionDto {
  id: string;
  title: string;
  description?: string;
  progress: string;
  deadline: string;
  priority: number;
  assignedToId: string;
  actionPlanId: string;
  createdAt: string;
}

export const dashboardService = {
  // PascalCase to match controller names
  getMyPlans: (token: string | null) => 
    request<AssignedActionPlanDto[]>(`${BASE_URL}/ActionPlan/user/assigned`, token),

  getMyTasks: (token: string | null, userId: string) => 
    request<PlanActionDto[]>(`${BASE_URL}/PlanAction/by-user/${userId}`, token),

  getOverdueTasks: (token: string | null) => 
    request<PlanActionDto[]>(`${BASE_URL}/PlanAction/overdue`, token),
};

// Types Employee
export interface UserProfileDto {
  id: string; name: string; email: string; role: string;
  department: string; managerName: string; managerEmail: string;
  hireDate: string; status: string; phone?: string;
}

export interface BadgeDto {
  id: string; name: string; description: string; icon: string;
  earnedAt: string; planId?: string; planTitle?: string; color: string;
}

export interface CompletedPlanDto {
  id: string; title: string; completedAt: string;
  managerScore?: number; planType: string; duration: string;
}

export interface TimelineEventDto {
  id: string; type: string; title: string; description: string;
  timestamp: string; planId?: string;
}

export interface SkillDto {
  name: string; level: number; plansCompleted: number;
}

export interface TeamMemberDto {
  name: string; role: string; initials: string; status: string;
}

export interface DocumentDto {
  id: string; name: string; type: string; lastViewed: string; isFavorite: boolean;
}

export interface QuickStatsDto {
  totalPlans: number; completed: number; onTimeRate: number;
  weeklyStreak: number; badgesCount: number; fastCompletions: number;
}

// Service Employee
export const employeeService = {
  getProfile: async (token: string): Promise<UserProfileDto> => {
    const res = await fetch('/api/employee/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load profile');
    return res.json();
  },

  getBadges: async (token: string): Promise<BadgeDto[]> => {
    const res = await fetch('/api/employee/badges', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load badges');
    return res.json();
  },

  getCompletedPlans: async (token: string): Promise<CompletedPlanDto[]> => {
    const res = await fetch('/api/employee/completed-plans', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load history');
    return res.json();
  },

  getTimeline: async (token: string): Promise<TimelineEventDto[]> => {
    const res = await fetch('/api/employee/timeline', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load timeline');
    return res.json();
  },

  getSkills: async (token: string): Promise<SkillDto[]> => {
    const res = await fetch('/api/employee/skills', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load skills');
    return res.json();
  },

  getTeam: async (token: string): Promise<TeamMemberDto[]> => {
    const res = await fetch('/api/employee/team', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load team');
    return res.json();
  },

  getDocuments: async (token: string): Promise<DocumentDto[]> => {
    const res = await fetch('/api/employee/documents', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load documents');
    return res.json();
  },

  getQuickStats: async (token: string): Promise<QuickStatsDto> => {
    const res = await fetch('/api/employee/stats', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load stats');
    return res.json();
  },
};