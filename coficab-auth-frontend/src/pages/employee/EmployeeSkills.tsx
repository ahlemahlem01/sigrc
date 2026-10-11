interface Props {
  skills: any[];
}

export default function EmployeeSkills({ skills }: Props) {
  return (
    <div className="dashboard-grid-2">
      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2><span className="icon">🧠</span> Compétences</h2>
        </div>
        <div className="dashboard-card-body">
          <div className="skills-list">
            {skills.length === 0 ? (
              <div className="dashboard-empty">Aucune compétence</div>
            ) : (
              skills.map((s: any) => (
                <div key={s.name} className="skill-item">
                  <div className="skill-info">
                    <div className="skill-header">
                      <span className="skill-name">{s.name}</span>
                      <span className="skill-level">{s.level}%</span>
                    </div>
                    <div className="skill-bar">
                      <div className="skill-fill" style={{ width: `${s.level}%` }} />
                    </div>
                    <div className="skill-plans">Basé sur {s.plansCompleted || s.plans} plans complétés</div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="skill-rec">
            <h4>💡 Recommandation</h4>
            <p>Renforcez vos compétences en Sécurité Informatique — 2 formations recommandées disponibles.</p>
          </div>
        </div>
      </div>
      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <h2><span className="icon">📈</span> Répartition</h2>
        </div>
        <div className="dashboard-card-body">
          <div className="skills-list">
            {[...skills].sort((a: any, b: any) => b.level - a.level).map((s: any, i: number) => (
              <div key={s.name} className="skill-item" style={{ padding: '10px 0', borderBottom: '1px solid #f3f4f8' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: i === 0 ? '#fef3c7' : i === 1 ? '#f3f4f8' : '#f8f9fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: i === 0 ? '#f59e0b' : '#6b7280', flexShrink: 0 }}>{i + 1}</div>
                <div className="skill-info">
                  <div className="skill-header">
                    <span className="skill-name">{s.name}</span>
                    <span className="skill-level">{s.level}%</span>
                  </div>
                  <div className="skill-bar"><div className="skill-fill" style={{ width: `${s.level}%` }} /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}