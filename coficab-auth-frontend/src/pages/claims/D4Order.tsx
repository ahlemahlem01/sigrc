import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { D4ToolKey, D4ToolState, d4ChainService } from '../../services/d4ChainService';

/**
 * Order of the D4 tools: D3 done → Ishikawa → Pareto (priority cause) → 5 Why.
 * While the answer has not arrived, nothing is locked: a slow request must never block the analyst.
 */
export function useD4Order(claimId: string | undefined) {
  const { accessToken } = useAuth();
  const [tools, setTools] = useState<Record<D4ToolKey, D4ToolState> | null>(null);

  useEffect(() => {
    if (!claimId || !accessToken) return;
    let cancelled = false;
    d4ChainService
      .get(claimId, accessToken)
      .then((s) => { if (!cancelled && s.tools) setTools(s.tools); })
      .catch(() => { if (!cancelled) setTools(null); });
    return () => { cancelled = true; };
  }, [claimId, accessToken]);

  return {
    tools,
    /** Why a tool is locked ("d3" | "ishikawa" | "priorityCause"), or null when it is open or unknown. */
    lockReason: (tool: D4ToolKey): string | null => (tools && !tools[tool].open ? tools[tool].reason ?? 'd3' : null),
  };
}

/** Where to go to unlock a step, by lock reason. */
export function unlockPath(reason: string, claimId: string): string {
  switch (reason) {
    case 'ishikawa': return `/pages/front/quality-analyses/ishikawa/${claimId}`;
    case 'priorityCause': return `/pages/front/quality-analyses/pareto/${claimId}`;
    default: return `/pages/front/quality-analyses/confinement/${claimId}`;
  }
}

/** Shown instead of a D4 tool whose previous step is not done yet. */
export function LockedStep({ claimId, reason }: { claimId: string; reason: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      style={{ maxWidth: 640, margin: '40px auto', padding: '22px 24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, textAlign: 'center', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <Lock size={26} aria-hidden color="#000168" />
      <h2 style={{ margin: '10px 0 6px', fontSize: 18, color: '#000168' }}>{t('d4Order.lockedTitle')}</h2>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: '#475569', lineHeight: 1.5 }}>{t(`d4Order.reason.${reason}`)}</p>
      <Link
        to={unlockPath(reason, claimId)}
        style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 9, background: '#000168', color: '#fff', fontWeight: 650, fontSize: 13, textDecoration: 'none' }}
      >
        {t(`d4Order.go.${reason}`)}
      </Link>
    </div>
  );
}
