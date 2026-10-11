import { useState, useCallback } from 'react';
import { timelineService } from '../services/timelineService';

interface UseTimelineOptions {
  userId: string;
  token: string;
  initialEvents?: any[];
}

export function useTimeline({ userId, token, initialEvents = [] }: UseTimelineOptions) {
  const [timeline, setTimeline]   = useState<any[]>(initialEvents);
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState<string | null>(null);

  // Charge les événements DB pour cet employé
  const fetch = useCallback(async () => {
    if (!token || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const events = await timelineService.getByUser(token, userId);
      setTimeline(events);
    } catch (e) {
      console.error('useTimeline.fetch error:', e);
      setError('Impossible de charger la timeline');
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  // Ajoute un événement manuel et le prepend localement (optimistic update)
  const addEvent = useCallback(async (event: {
    title: string;
    description: string;
    type: string;
    actorName?: string;
  }) => {
    if (!token || !userId) return;
    try {
      const saved = await timelineService.create(token, userId, event);
      setTimeline(prev => [saved, ...prev]);
      return saved;
    } catch (e) {
      console.error('useTimeline.addEvent error:', e);
      throw e;
    }
  }, [token, userId]);

  // Supprime un événement et le retire localement
  const removeEvent = useCallback(async (id: string) => {
    if (!token) return;
    try {
      await timelineService.delete(token, id);
      setTimeline(prev => prev.filter(e => e.id !== id));
    } catch (e) {
      console.error('useTimeline.removeEvent error:', e);
      throw e;
    }
  }, [token]);

  // Merge des événements dérivés des plans avec les événements DB
  // (même logique que deriveTimelineFromPlans dans EmployeeAdminView)
  const mergeWithPlanEvents = useCallback((planEvents: any[]) => {
    setTimeline(prev => {
      const merged = [...planEvents, ...prev]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 20);
      return merged;
    });
  }, []);

  return {
    timeline,
    loading,
    error,
    fetch,
    addEvent,
    removeEvent,
    mergeWithPlanEvents,
    setTimeline,
  };
}