import { useMemo, useState } from 'react';

interface Props {
  completedPlans: any[];
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export default function EmployeeHistory({ completedPlans }: Props) {
  const [historyFilter, setHistoryFilter] = useState<'all' | 'formation' | 'audit' | 'infrastructure' | 'devops'>('all');
  const [showAllHistory, setShowAllHistory] = useState(false);

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'all') return completedPlans;
    return completedPlans.filter((c: any) => c.planType?.toLowerCase() === historyFilter);
  }, [completedPlans, historyFilter]);

  const displayedHistory = showAllHistory ? filteredHistory : filteredHistory.slice(0, 5);

  return (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <h2><span className="icon">📜</span> Historique</h2>
        <button className="btn-secondary" style={{ fontSize: 12 }}>📥 Exporter PDF</button>
      </div>
      <div className="dashboard-card-body">
        <div className="history-filter">
          {(['all', 'formation', 'audit', 'infrastructure', 'devops'] as const).map(f => (
            <button key={f} className={`history-filter-btn ${historyFilter === f ? 'history-filter-btn--active' : ''}`} onClick={() => setHistoryFilter(f)}>
              {f === 'all' ? 'Tous' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        {displayedHistory.length === 0 ? (
          <div className="dashboard-empty">Aucun historique</div>
        ) : (
          displayedHistory.map((w: any) => (
            <div key={w.id} className="history-item">
              <div className="history-icon">✅</div>
              <div className="history-content">
                <div className="history-title">{w.title}</div>
                <div className="history-meta">{w.planType} • {w.duration} • {fmtDate(w.completedAt)}</div>
              </div>
              {w.managerScore && (
                <div className="history-score">
                  {'★'.repeat(Math.floor(w.managerScore))}{'☆'.repeat(5 - Math.floor(w.managerScore))}
                  <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 4 }}>{w.managerScore}/5</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {filteredHistory.length > 5 && (
        <div className="dashboard-card-footer">
          <button className="view-all-btn" onClick={() => setShowAllHistory(!showAllHistory)}>
            {showAllHistory ? 'Voir moins ↑' : 'Voir tout →'}
          </button>
        </div>
      )}
    </div>
  );
}