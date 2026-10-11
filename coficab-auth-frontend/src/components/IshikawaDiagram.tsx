import React from 'react';
import { IshikawaCategory, IshikawaCauseInput } from '../types/qualityAnalysis';

// 🟢 Interface avec toutes les propriétés supportées pour éviter les erreurs TypeScript
export interface IshikawaDiagramProps {
  claimId?: string;
  userId?: string;
  causes?: IshikawaCauseInput[];
  readOnly?: boolean;
  onAddCause?: (category: string, causeText: string) => void;
  onRemoveCause?: (causeId?: string, index?: number) => void;
  onSave?: (data: any) => void;
}

const CATEGORIES = Object.values(IshikawaCategory);

const COFICAB_NAVY = '#000168';

const CATEGORY_COLORS: Record<string, string> = {
  [IshikawaCategory.Manpower || 'Manpower']: '#2563eb',
  [IshikawaCategory.Machine || 'Machine']: '#0284c7',
  [IshikawaCategory.Material || 'Material']: '#0d9488',
  [IshikawaCategory.Method || 'Method']: '#d97706',
  [IshikawaCategory.Milieu || 'Milieu']: '#7c3aed',
  [IshikawaCategory.Measurement || 'Measurement']: '#db2777',
};

// 🟢 Export nommé
export const IshikawaDiagram: React.FC<IshikawaDiagramProps> = ({
  claimId,
  userId,
  causes = [],
  readOnly = false,
  onAddCause,
  onRemoveCause,
  onSave,
}) => {
  return (
    <div
      style={{
        background: '#fafafa',
        padding: '20px',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        overflowX: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, color: COFICAB_NAVY, fontSize: '16px' }}>
          Diagramme d'Ishikawa (Cause à Effet)
        </h3>
        {claimId && (
          <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
            ID Réclamation: {claimId}
          </span>
        )}
      </div>

      <svg width="1000" height="380" viewBox="0 0 1000 380" style={{ width: '100%', height: 'auto' }}>
        {/* Arête Centrale */}
        <line x1="40" y1="190" x2="820" y2="190" stroke={COFICAB_NAVY} strokeWidth="4" />

        {/* Tête du Poisson (Effet / Défaut) */}
        <polygon points="820,130 960,190 820,250" fill={COFICAB_NAVY} />
        <text x="875" y="195" fill="#FFF" fontSize="13" fontWeight="bold" textAnchor="middle">
          DÉFAUT / EFFET
        </text>

        {/* Représentation des 6M */}
        {CATEGORIES.slice(0, 6).map((cat, idx) => {
          const isTop = idx < 3;
          const xPos = 160 + (idx % 3) * 220;
          const yStart = isTop ? 40 : 340;
          const yEnd = 190;
          const catCauses = causes.filter((c) => c.category === cat);
          const color = CATEGORY_COLORS[cat] || '#2563eb';

          return (
            <g key={cat}>
              {/* Arête de la catégorie */}
              <line x1={xPos} y1={yStart} x2={xPos + 70} y2={yEnd} stroke={color} strokeWidth="3" />
              <rect x={xPos - 50} y={isTop ? yStart - 24 : yStart + 4} width="110" height="24" rx="4" fill={color} />
              <text x={xPos} y={isTop ? yStart - 8 : yStart + 20} fill="#fff" fontSize="11" fontWeight="bold" textAnchor="middle">
                {cat} ({catCauses.length})
              </text>

              {/* Affichage des causes rattachées */}
              {catCauses.map((c, cIdx) => {
                const factor = (cIdx + 1) / (catCauses.length + 1);
                const cx = xPos + 70 * factor;
                const cy = yStart + (yEnd - yStart) * factor;

                return (
                  <g key={c.id || cIdx}>
                    <circle cx={cx} cy={cy} r="4" fill={c.isRootCause ? '#dc2626' : color} />
                    <text
                      x={cx + (isTop ? 8 : -8)}
                      y={cy + (isTop ? -4 : 10)}
                      fill={c.isRootCause ? '#dc2626' : '#334155'}
                      fontSize="10"
                      fontWeight={c.isRootCause ? 'bold' : 'normal'}
                      textAnchor={isTop ? 'start' : 'end'}
                    >
                      {c.causeDescription} {c.isRootCause ? '★' : ''}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// 🟢 Export par défaut pour garantir la compatibilité absolue des imports
export default IshikawaDiagram;