import { useState } from 'react';

interface Props {
  badges: any[];
  quickStats: any;
  isAdmin?: boolean;
  onAssignBadge?: (badgeId: string) => void;
  onRemoveBadge?: (badgeId: string) => void;
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export default function EmployeeAchievements({ badges, quickStats, isAdmin = false, onAssignBadge, onRemoveBadge }: Props) {
  const [showModal, setShowModal] = useState(false);
const [badgeForm, setBadgeForm] = useState({ name: '', color: '#3b82f6', description: '' });

  return (
    <>
      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2>Mur des Réalisations</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Streak:</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#ea580c' }}>🔥 {quickStats?.weeklyStreak || 0} semaines</span>
          </div>
        </div>
        <div className="dashboard-card-body">
          <div className="badges-grid">
            {badges.length === 0 ? (
              <div className="dashboard-empty">Aucun badge</div>
            ) : (
              badges.map((b: any) => (
                <div key={b.id} className="badge-card" style={{ '--badge-color': b.color || '#3b82f6' } as React.CSSProperties}>
                  <div className="badge-glow" style={{ background: b.color || '#3b82f6' }} />
                  <div className="badge-name">{b.name}</div>
                  <div className="badge-date">{fmtDate(b.earnedAt)}</div>
                  {isAdmin && onRemoveBadge && (
                    <button
                      onClick={() => onRemoveBadge(b.id)}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        background: '#fee2e2',
                        border: 'none',
                        borderRadius: '50%',
                        width: 22,
                        height: 22,
                        cursor: 'pointer',
                        fontSize: 12,
                        color: '#dc2626',
                      }}
                      title="Retirer"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
        {isAdmin && onAssignBadge && (
          <div className="dashboard-card-footer">
            <button className="view-all-btn" onClick={() => setShowModal(true)}>+ Attribuer un badge</button>
          </div>
        )}
      </div>

      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2>Performance</h2>
        </div>
        <div className="dashboard-card-body">
          <div className="quick-stats">
            {[
              { value: quickStats?.completed || 0, label: 'Total Complétés', accent: '#16a34a' },
              { value: `${quickStats?.onTimeRate || 0}%`, label: 'Précision', accent: '#3b82f6' },
              { value: quickStats?.fastCompletions || 0, label: 'Rapide (avant échéance)', accent: '#f59e0b' },
              { value: badges.length, label: 'Badges Total', accent: '#8b5cf6' },
            ].map((s, i) => (
              <div key={i} className="quick-stat" style={{ '--accent': s.accent } as React.CSSProperties}>
                <div className="quick-stat-value">{s.value}</div>
                <div className="quick-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal assign badge (simple) */}
{showModal && (
  <div className="ad-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
    <div className="ad-modal" style={{ width: 480 }}>
      <div className="ad-mhead">
        <span className="ad-mtitle">Attribuer un badge</span>
        <button className="ad-mclose" onClick={() => setShowModal(false)}><i className="ti ti-x" /></button>
      </div>
      <div className="ad-mbody">
        <div className="ad-fg">
          <label className="ad-lbl">Nom du badge</label>
          <input 
            className="ad-inp" 
            value={badgeForm.name} 
            onChange={e => setBadgeForm(f => ({ ...f, name: e.target.value }))}
            placeholder="ex: Expert Excel"
          />
        </div>
        <div className="ad-fg">
          <label className="ad-lbl">Description</label>
          <textarea 
            className="ad-inp" 
            rows={2}
            value={badgeForm.description} 
            onChange={e => setBadgeForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Description du badge..."
          />
        </div>
        <div className="ad-fg">
          <label className="ad-lbl">Couleur</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['#3b82f6', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6', '#ec4899'].map(c => (
              <button
                key={c}
                onClick={() => setBadgeForm(f => ({ ...f, color: c }))}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: c,
                  border: badgeForm.color === c ? '3px solid #1b1f6b' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="ad-mfoot">
        <button className="ad-btn btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
        <button 
          className="ad-btn btn-primary" 
          onClick={() => {
            const badgeId = `badge-${Date.now()}`;
            onAssignBadge?.(badgeId);
            setBadgeForm({ name: '', color: '#3b82f6', description: '' });
            setShowModal(false);
          }}
        >
          Attribuer
        </button>
      </div>
    </div>
  </div>
)}
    </>
  );
}