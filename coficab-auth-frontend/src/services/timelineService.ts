import axios from 'axios';

import { ACTION_PLAN_API_URL } from '../config/apiEnv';

const API_URL = `${ACTION_PLAN_API_URL}/admin/employees`;

const h = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

const unwrap = (raw: any): any[] => {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.['$values'])) return raw['$values'];
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.items))       return raw.items;
  return [];
};

export const normaliseTimelineEvent = (e: any) => ({
  ...e,
  timestamp: e.timestamp ?? e.createdAt ?? e.date ?? new Date().toISOString(),
});

export const timelineService = {
  // Récupère les événements d'un seul employé (vue détail)
  getByUser: (token: string, userId: string) =>
    axios.get(`${API_URL}/timeline/${userId}`, h(token))
      .then(r => unwrap(r.data).map(normaliseTimelineEvent)),

  // Récupère tous les événements de tous les employés (vue admin globale)
  getAll: (token: string) =>
    axios.get(`${API_URL}/timeline`, h(token))
      .then(r =>
        unwrap(r.data)
          .map(normaliseTimelineEvent)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      ),

  // Crée un événement manuel (appelé depuis le modal dans EmployeeOverview)
  create: (token: string, userId: string, event: {
    title: string;
    description: string;
    type: string;
    actorName?: string;
  }) =>
    axios.post(`${API_URL}/timeline`, {
      userId,
      type:        event.type,
      title:       event.title,
      description: event.description,
      planTitle:   null,
      planId:      null,
      badgeId:     null,
      actorName:   event.actorName ?? 'Admin',
    }, h(token)).then(r => normaliseTimelineEvent(r.data)),

  // Supprime un événement
  delete: (token: string, id: string) =>
    axios.delete(`${API_URL}/timeline/${id}`, h(token)),
};