import React, { useEffect, useState } from 'react';
import { qualityAnalysisService } from '../../services/qualityAnalysisService';
import { ParetoReport } from '../../types/qualityAnalysis';

export const ParetoPage: React.FC = () => {
  const [report, setReport] = useState<ParetoReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchParetoData();
  }, []);

  const fetchParetoData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await qualityAnalysisService.getPareto();
      setReport(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load Pareto analysis data.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <p style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Loading Pareto analysis...</p>;
  }

  const maxFrequency = report?.items && report.items.length > 0
    ? Math.max(...report.items.map((i) => i.frequency))
    : 1;

  return (
    <div style={{ maxWidth: '1000px', margin: '30px auto', padding: '24px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0 }}>Pareto Analysis (80/20 Rule)</h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280' }}>
            Identify top contributing causes across all defect reports. Total causes analyzed: <strong>{report?.totalCauses || 0}</strong>
          </p>
        </div>
        <button
          onClick={() => (window.location.href = '/pages/front/quality-analyses')}
          style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
        >
          Back to Claims
        </button>
      </div>

      {error && <div style={{ padding: '12px', marginBottom: '16px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '6px' }}>{error}</div>}

      {!report || report.items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', border: '2px dashed #e5e7eb', borderRadius: '8px' }}>
          <p style={{ color: '#6b7280' }}>No defect cause data available for Pareto calculation.</p>
        </div>
      ) : (
        <div>
          {/* Visual Frequency & Cumulative Distribution Chart */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
            {report.items.map((item) => {
              const barWidthPercentage = (item.frequency / maxFrequency) * 100;
              const is80PercentCutoff = item.cumulativePercentage <= 80;

              return (
                <div key={item.category} style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '12px 16px', background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '14px', fontWeight: '600' }}>
                    <span style={{ color: '#1f2937' }}>{item.category}</span>
                    <span style={{ color: '#4b5563' }}>
                      {item.frequency} occurrences ({item.percentage.toFixed(1)}%) — Cumul: {item.cumulativePercentage.toFixed(1)}%
                    </span>
                  </div>

                  {/* Bar container */}
                  <div style={{ height: '20px', width: '100%', background: '#e5e7eb', borderRadius: '10px', overflow: 'hidden', position: 'relative' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${barWidthPercentage}%`,
                        background: is80PercentCutoff ? '#2563eb' : '#93c5fd',
                        borderRadius: '10px',
                        transition: 'width 0.4s ease'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabular Details */}
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb', color: '#4b5563', fontSize: '14px' }}>
                <th style={{ padding: '10px 8px' }}>Category</th>
                <th style={{ padding: '10px 8px' }}>Frequency</th>
                <th style={{ padding: '10px 8px' }}>Percentage</th>
                <th style={{ padding: '10px 8px' }}>Cumulative %</th>
                <th style={{ padding: '10px 8px' }}>Action Priority</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => {
                const isPriority = item.cumulativePercentage <= 80;
                return (
                  <tr key={item.category} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 8px', fontWeight: '500' }}>{item.category}</td>
                    <td style={{ padding: '10px 8px' }}>{item.frequency}</td>
                    <td style={{ padding: '10px 8px' }}>{item.percentage.toFixed(1)}%</td>
                    <td style={{ padding: '10px 8px' }}>{item.cumulativePercentage.toFixed(1)}%</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '600',
                          backgroundColor: isPriority ? '#fee2e2' : '#f3f4f6',
                          color: isPriority ? '#991b1b' : '#4b5563'
                        }}
                      >
                        {isPriority ? 'High Priority (80% Zone)' : 'Secondary'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ParetoPage;