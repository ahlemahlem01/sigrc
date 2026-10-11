// src/pages/admin/PendingValidation.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { ListSkeleton } from '../../components/TableSkeleton';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getPendingValidation, closeActionPlan } from '../../services/actionPlanService';

interface PendingPlan {
  id: string;
  title: string;
  description?: string;
  progress: number;
  assignedToId?: string;
  deadline?: string;
}

export const PendingValidation: React.FC = () => {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PendingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [validatingId, setValidatingId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      const res = await getPendingValidation(accessToken);
      setPlans(res.data.data ?? []);
    } catch (e) {
      console.error('Failed to load pending validation plans:', e);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const handleValidate = async (id: string) => {
    if (!accessToken || validatingId) return;
    if (!window.confirm('Valider ce plan comme terminé ?')) return;
    setValidatingId(id);
    try {
      await closeActionPlan(accessToken, id);
      setPlans(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      console.error('Failed to validate plan:', e);
      alert('Échec de la validation.');
    } finally {
      setValidatingId(null);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <ListSkeleton rows={8} />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold text-slate-900 mb-1">À valider</h1>
        <p className="text-sm text-slate-500 mb-6">
          {plans.length} plan{plans.length > 1 ? 's' : ''} en attente de validation
        </p>

        {plans.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
            <p className="text-slate-400">Aucun plan en attente de validation</p>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map(plan => (
              <div key={plan.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 text-sm">{plan.title}</h3>
                  {plan.description && (
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{plan.description}</p>
                  )}
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700">
                    Progression : {plan.progress}%
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => navigate(`/pages/front/action-plans/${plan.id}`)}
                    className="px-3 py-2 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                  >
                    Voir le détail
                  </button>
                  <button
                    onClick={() => handleValidate(plan.id)}
                    disabled={validatingId === plan.id}
                    className="px-4 py-2 text-xs font-semibold text-white rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {validatingId === plan.id ? 'Validation…' : '✓ Valider'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PendingValidation;