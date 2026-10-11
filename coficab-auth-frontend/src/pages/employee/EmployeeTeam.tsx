interface Props {
  team: any[];
  department: string;
}

export default function EmployeeTeam({ team, department }: Props) {
  return (
    <>
      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2><span className="icon">👥</span> Mon Équipe — {department || 'IT'}</h2>
        </div>
        <div className="dashboard-card-body">
          <div className="team-grid">
            {team.length === 0 ? (
              <div className="dashboard-empty">Aucun membre d'équipe</div>
            ) : (
              team.map((m: any) => (
                <div key={m.name} className="team-member">
                  <div className="team-avatar">
                    {m.initials || m.name?.split(' ').map((n: string) => n[0]).join('')}
                    <span className={`team-status-dot team-status-dot--${m.status}`} />
                  </div>
                  <div className="team-name">{m.name}</div>
                  <div className="team-role">{m.role}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2><span className="icon">📊</span> Progression Département</h2>
        </div>
        <div className="dashboard-card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 0' }}>
            <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'conic-gradient(#16a34a 0% 68%, #e1e3ec 68% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <div style={{ width: 90, height: 90, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>68%</span>
                <span style={{ fontSize: 10, color: '#6b7280' }}>complété</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1b1f6b', marginBottom: 8 }}>Performance Équipe</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Plans actifs', value: 12, total: 18, color: '#3b82f6' },
                  { label: 'Complétés ce mois', value: 8, total: 12, color: '#16a34a' },
                  { label: 'En retard', value: 2, total: 18, color: '#dc2626' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: '#6b7280', width: 140 }}>{item.label}</span>
                    <div style={{ flex: 1, height: 8, background: '#e1e3ec', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${(item.value / item.total) * 100}%`, height: '100%', background: item.color, borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1e2433', width: 40, textAlign: 'right' }}>{item.value}/{item.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}