type Props = {
  cols: number;
  rows?: number;
};

const SHIMMER_CSS = `
  .tbl-skel-bar {
    height: 14px;
    border-radius: 8px;
    background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 37%, #f1f5f9 63%);
    background-size: 800px 100%;
    animation: tbl-skel-shimmer 1.2s ease-in-out infinite;
  }
  @keyframes tbl-skel-shimmer {
    0% { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
  .tbl-skel-body .tbl-skel-row td {
    padding: 14px 16px;
    border-bottom: 1px solid #f1f5f9;
  }
  .tbl-skel-list { display: flex; flex-direction: column; gap: 14px; padding: 8px 4px; }
  .tbl-skel-line { display: flex; align-items: center; gap: 12px; }
`;

export default function TableSkeleton({ cols, rows = 8 }: Props) {
  return (
    <tbody className="tbl-skel-body">
      {[...Array(rows)].map((_, i) => (
        <tr key={i} className="tbl-skel-row">
          {[...Array(cols)].map((__, j) => (
            <td key={j}>
              <div
                className="tbl-skel-bar"
                style={{
                  width: j === 0 ? '72%' : j === cols - 1 ? '48%' : '80%',
                  animationDelay: `${(i + j) * 0.06}s`,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
      <style>{SHIMMER_CSS}</style>
    </tbody>
  );
}

function ListSkeleton({ rows = 8 }: { rows?: number }) {
  const widths = ['72%', '58%', '84%', '46%', '68%', '80%', '52%', '76%'];
  return (
    <div className="tbl-skel-list" role="status" aria-label="Chargement">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="tbl-skel-line">
          <div className="tbl-skel-bar" style={{ width: 36, height: 36, borderRadius: 999, flexShrink: 0 }} />
          <div className="tbl-skel-bar" style={{ width: widths[i % widths.length], animationDelay: `${i * 0.08}s` }} />
        </div>
      ))}
      <style>{SHIMMER_CSS}</style>
    </div>
  );
}

export { ListSkeleton };

export function TableLoadingBanner(_props: { label?: string }) {
  return null;
}
