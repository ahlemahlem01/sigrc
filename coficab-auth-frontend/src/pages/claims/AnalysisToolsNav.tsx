import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  FileText,
  GitFork,
  LayoutList,
  Lock,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import './AnalysisToolsNav.styles.css';
import { useTranslation } from 'react-i18next';
import { useD4Order } from './D4Order';

export type AnalysisToolKey =
  | 'claim'
  | 'eightD'
  | 'containment'
  | 'pareto'
  | 'ishikawa'
  | 'fiveWhy'
  | 'guide';

const TOOLS: Array<{
  key: AnalysisToolKey;
  /** i18n keys */
  label: string;
  short: string;
  icon: React.ReactNode;
  path: (id: string) => string;
}> = [
  {
    key: 'claim',
    label: 'analysisTools.claim',
    short: 'analysisTools.claimShort',
    icon: <LayoutList size={13} />,
    path: (id) => `/pages/front/quality-analyses?claimId=${encodeURIComponent(id)}`,
  },
  {
    key: 'eightD',
    label: 'analysisTools.eightD',
    short: 'analysisTools.eightDShort',
    icon: <ShieldCheck size={13} />,
    path: (id) => `/pages/front/quality-analyses/8d/${id}`,
  },
  {
    key: 'containment',
    label: 'analysisTools.containment',
    short: 'analysisTools.containmentShort',
    icon: <Shield size={13} />,
    path: (id) => `/pages/front/quality-analyses/confinement/${id}`,
  },
  {
    key: 'ishikawa',
    label: 'analysisTools.ishikawa',
    short: 'analysisTools.ishikawa',
    icon: <GitFork size={13} />,
    path: (id) => `/pages/front/quality-analyses/ishikawa/${id}`,
  },
  {
    key: 'pareto',
    label: 'analysisTools.pareto',
    short: 'analysisTools.pareto',
    icon: <BarChart3 size={13} />,
    path: (id) => `/pages/front/quality-analyses/pareto/${id}`,
  },
  {
    key: 'fiveWhy',
    label: 'analysisTools.fiveWhy',
    short: 'analysisTools.fiveWhy',
    icon: <FileText size={13} />,
    path: (id) => `/pages/front/quality-analyses/5why/${id}`,
  },
  {
    key: 'guide',
    label: 'analysisTools.guide',
    short: 'analysisTools.guide',
    icon: <BookOpen size={13} />,
    path: (id) => `/pages/front/quality-analyses/parcours/${id}`,
  },
];

/** Order for prev/next (skip claim + guide as endpoints of the analysis chain). */
const FLOW: AnalysisToolKey[] = ['eightD', 'containment', 'ishikawa', 'pareto', 'fiveWhy'];

function detectTool(pathname: string): AnalysisToolKey | null {
  if (pathname.includes('/confinement/')) return 'containment';
  if (pathname.includes('/pareto/')) return 'pareto';
  if (pathname.includes('/ishikawa/')) return 'ishikawa';
  if (pathname.includes('/5why/')) return 'fiveWhy';
  if (pathname.includes('/8d/')) return 'eightD';
  if (pathname.includes('/parcours')) return 'guide';
  return null;
}

interface AnalysisToolsNavProps {
  claimId: string;
  /** Force active tool; otherwise inferred from the URL. */
  active?: AnalysisToolKey;
  claimTitle?: string | null;
}

export const AnalysisToolsNav: React.FC<AnalysisToolsNavProps> = ({
  claimId,
  active: activeProp,
  claimTitle,
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const active = activeProp || detectTool(location.pathname) || 'claim';
  const order = useD4Order(claimId);
  // The D4 tools open in order (Ishikawa, Pareto, 5 Why): a locked tab is shown but cannot be opened.
  const lockOf = (key: AnalysisToolKey): string | null =>
    key === 'ishikawa' || key === 'pareto' ? order.lockReason(key) : key === 'fiveWhy' ? order.lockReason('fiveWhy') : null;

  const flowIndex = FLOW.indexOf(active);
  const prevKey = flowIndex > 0 ? FLOW[flowIndex - 1] : null;
  const nextKey = flowIndex >= 0 && flowIndex < FLOW.length - 1 ? FLOW[flowIndex + 1] : null;
  const prev = prevKey ? TOOLS.find((tool) => tool.key === prevKey) : null;
  const next = nextKey ? TOOLS.find((tool) => tool.key === nextKey) : null;

  if (!claimId) return null;

  return (
    <nav className="atn" aria-label={t('analysisTools.navLabel')}>
      <div className="atn-row">
        <Link
          to={`/pages/front/quality-analyses?claimId=${encodeURIComponent(claimId)}`}
          className="atn-back"
          title={t('analysisTools.backToClaim')}
        >
          <ArrowLeft size={14} />
          <span className="atn-back-text">
            {claimTitle ? (
              <>
                <em>{t('analysisTools.claim')}</em> {claimTitle}
              </>
            ) : (
              t('analysisTools.claim')
            )}
          </span>
        </Link>

        <div className="atn-tabs" role="tablist">
          {TOOLS.filter((tool) => tool.key !== 'claim').map((tool) => {
            const isActive = tool.key === active;
            const locked = lockOf(tool.key);
            if (locked) {
              return (
                <span key={tool.key} role="tab" aria-selected={false} aria-disabled="true" className="atn-tab atn-tab-locked" title={t(`d4Order.reason.${locked}`)}>
                  <Lock size={12} aria-hidden />
                  <span className="atn-tab-full">{t(tool.label)}</span>
                  <span className="atn-tab-short">{t(tool.short)}</span>
                </span>
              );
            }
            return (
              <Link
                key={tool.key}
                to={tool.path(claimId)}
                role="tab"
                aria-selected={isActive}
                className={`atn-tab${isActive ? ' active' : ''}`}
                title={t(tool.label)}
              >
                {tool.icon}
                <span className="atn-tab-full">{t(tool.label)}</span>
                <span className="atn-tab-short">{t(tool.short)}</span>
              </Link>
            );
          })}
        </div>

        <div className="atn-flow">
          {prev ? (
            <Link to={prev.path(claimId)} className="atn-flow-btn" title={t('analysisTools.previous', { tool: t(prev.label) })}>
              <ArrowLeft size={13} /> {t(prev.short)}
            </Link>
          ) : (
            <span className="atn-flow-btn disabled" aria-hidden />
          )}
          {next && !lockOf(next.key) ? (
            <Link to={next.path(claimId)} className="atn-flow-btn next" title={t('analysisTools.next', { tool: t(next.label) })}>
              {t(next.short)} <ArrowRight size={13} />
            </Link>
          ) : (
            <span className="atn-flow-btn disabled" aria-hidden />
          )}
        </div>
      </div>
    </nav>
  );
};

export default AnalysisToolsNav;
