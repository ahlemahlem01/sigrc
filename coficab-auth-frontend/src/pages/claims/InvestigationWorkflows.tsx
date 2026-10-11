import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LucideIcon,
  ArrowUpRight,
  Sparkles,
  BarChart3,
  GitFork,
  FileText,
  ShieldCheck,
  Shield,
  BookOpen,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { eightDService, EightDDossier, EightDStepGate } from '../../services/qualityAnalysisService';
import { useTranslation } from 'react-i18next';

/** label / shortLabel / description are i18n keys. */
interface WorkflowConfig {
  key: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  route: (claimId: string | number) => string;
  theme: string;
  color: string;
  bgColor: string;
  gate: 'd3' | 'd4';
}

const TOOLS: WorkflowConfig[] = [
  {
    key: 'containment',
    label: 'workflows.containment',
    shortLabel: 'analysisTools.containment',
    description: 'workflows.containmentDesc',
    icon: Shield,
    route: (id) => `/pages/front/quality-analyses/confinement/${id}`,
    theme: 'navy-theme',
    color: '#000168',
    bgColor: 'rgba(0, 1, 104, 0.08)',
    gate: 'd3',
  },
  {
    key: 'ishikawa',
    label: 'workflows.ishikawa',
    shortLabel: 'analysisTools.ishikawa',
    description: 'workflows.ishikawaDesc',
    icon: GitFork,
    route: (id) => `/pages/front/quality-analyses/ishikawa/${id}`,
    theme: 'dark-theme',
    color: '#0f2b5c',
    bgColor: 'rgba(15, 43, 92, 0.1)',
    gate: 'd4',
  },
  {
    key: 'pareto',
    label: 'workflows.pareto',
    shortLabel: 'analysisTools.pareto',
    description: 'workflows.paretoDesc',
    icon: BarChart3,
    route: (id) => `/pages/front/quality-analyses/pareto/${id}`,
    theme: 'amber-theme',
    color: '#d97706',
    bgColor: 'rgba(217, 119, 6, 0.1)',
    gate: 'd4',
  },
  {
    key: '5why',
    label: 'workflows.fiveWhy',
    shortLabel: 'analysisTools.fiveWhy',
    description: 'workflows.fiveWhyDesc',
    icon: FileText,
    route: (id) => `/pages/front/quality-analyses/5why/${id}`,
    theme: 'blue-theme',
    color: '#2563eb',
    bgColor: 'rgba(37, 99, 235, 0.1)',
    gate: 'd4',
  },
];

const stepTitleKey = (step: number) => `employeeWorkspace.eightDStep.D${step}`;

interface InvestigationWorkflowsProps {
  claimId: string | number;
  /** True only while the claim has not started analysis (OUVERTE / ASSIGNED). */
  isLocked: boolean;
  /** Claim workflow status — used to keep the 8D rail / tools in sync. */
  claimStatus?: string | null;
}

const normalizeStatus = (value?: string | null) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

/** Claim already past D0 — tools must not stay frozen on stale 8D gates. */
const isClaimPastStart = (status?: string | null) => {
  const s = normalizeStatus(status);
  if (!s || s === 'DRAFT' || s === 'OUVERTE' || s === 'OPEN' || s === 'ASSIGNED') return false;
  return true;
};

/** Terminal / submitted claim — open every tool for review. */
const isClaimFullyOpen = (status?: string | null) => {
  const s = normalizeStatus(status);
  return (
    s === 'VALIDATED' ||
    s === 'PENDING_VALIDATION' ||
    s === 'CLOTUREE' ||
    s === 'CLOSED' ||
    s === 'CLOTURÉE' ||
    s === 'REJECTED'
  );
};

export const InvestigationWorkflows: React.FC<InvestigationWorkflowsProps> = ({
  claimId,
  isLocked,
  claimStatus,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const [dossier, setDossier] = useState<EightDDossier | null>(null);

  const effectiveStatus = normalizeStatus(claimStatus) || normalizeStatus(dossier?.claimStatus);
  const pastStart = !isLocked && isClaimPastStart(effectiveStatus);
  const fullyOpen = isClaimFullyOpen(effectiveStatus);

  const load = useCallback(async () => {
    if (isLocked || !accessToken || !claimId) {
      setDossier(null);
      return;
    }
    try {
      const d = await eightDService.get(String(claimId), accessToken);
      setDossier(d);
    } catch {
      setDossier(null);
    }
  }, [accessToken, claimId, isLocked]);

  useEffect(() => { void load(); }, [load]);

  const d3 = dossier?.steps?.find((s) => s.step === 3);
  const d3Frozen = isLocked || (!fullyOpen && !d3?.unlocked);
  const d4Frozen = isLocked || (!fullyOpen && !d3?.complete);

  const openEightD = () => {
    if (!isLocked) navigate(`/pages/front/quality-analyses/8d/${claimId}`);
  };

  const openStep = (step: EightDStepGate) => {
    if (!fullyOpen && !step.unlocked) return;
    if (step.step === 3) {
      navigate(`/pages/front/quality-analyses/confinement/${claimId}`);
      return;
    }
    if (step.step === 4) {
      navigate(`/pages/front/quality-analyses/ishikawa/${claimId}`);
      return;
    }
    openEightD();
  };

  const toolFrozen = (gate: 'd3' | 'd4') => (gate === 'd3' ? d3Frozen : d4Frozen);
  const toolHint = (gate: 'd3' | 'd4') => {
    if (isLocked) return t('workflows.hintStart');
    if (fullyOpen) return '';
    if (gate === 'd3') return d3?.hint || t('workflows.hintD3');
    return d3?.complete ? '' : t('workflows.hintD4');
  };

  const railSteps: EightDStepGate[] = fullyOpen
    ? [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
        step: n,
        code: `D${n}`,
        label: t(stepTitleKey(n)),
        complete: true,
        unlocked: true,
      }))
    : (dossier?.steps || [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
        step: n,
        code: `D${n}`,
        label: t(stepTitleKey(n)),
        complete: false,
        unlocked: false,
        hint: t('workflows.hintOpenDossier'),
      } as EightDStepGate)));

  return (
    <div>
      <div className="pfe-guide">
        <div className="pfe-guide-body" style={{ padding: '12px' }}>
          <p className="pfe-guide-lead" style={{ marginBottom: 10 }}>
            {fullyOpen
              ? t('workflows.leadOpen')
              : t('workflows.lead')}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="pfe-btn-tool"
              style={{ background: '#fff', color: '#000168', border: '1px solid #cbd5e1', width: 'fit-content' }}
              onClick={() => navigate(`/pages/front/quality-analyses/parcours/${claimId}`)}
            >
              <BookOpen size={13} /> {t('workflows.employeeGuide')}
            </button>
            <button
              type="button"
              className="pfe-btn-tool"
              style={{
                background: isLocked ? '#cbd5e1' : '#000168',
                color: '#fff',
                width: 'fit-content',
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.7 : 1,
              }}
              disabled={isLocked}
              title={isLocked ? t('workflows.unlockHint') : t('workflows.openEightD')}
              onClick={openEightD}
            >
              {t('workflows.openEightD')} <ArrowUpRight size={13} />
            </button>
          </div>
        </div>
      </div>

      <div className="pfe-tools-header">
        <ShieldCheck size={14} style={{ color: '#000168' }} />
        <span>{t('workflows.railTitle')}</span>
      </div>
      <div className="pfe-8d-rail" role="list">
        <button
          type="button"
          className={`pfe-8d-dot${pastStart || fullyOpen ? ' done' : ' frozen'}`}
          disabled={isLocked}
          title={isLocked ? t('workflows.d0Locked') : t('workflows.d0Started')}
        >
          <b>D0 {pastStart || fullyOpen ? <CheckCircle2 size={11} /> : <Lock size={10} />}</b>
          <span>{t('workflows.d0')}</span>
        </button>
        {railSteps.map((s) => {
          const frozen = !fullyOpen && !s.unlocked;
          return (
            <button
              key={s.step}
              type="button"
              className={`pfe-8d-dot${s.complete || fullyOpen ? ' done' : ''}${frozen ? ' frozen' : ''}`}
              disabled={frozen || isLocked}
              title={frozen ? (s.hint || t('workflows.finishPrevious')) : t(stepTitleKey(s.step), { defaultValue: s.label })}
              onClick={() => openStep(s)}
            >
              <b>{s.code} {s.complete || fullyOpen ? <CheckCircle2 size={11} /> : frozen ? <Lock size={10} /> : ''}</b>
              <span>{t(stepTitleKey(s.step), { defaultValue: s.label })}</span>
            </button>
          );
        })}
      </div>

      <div className="pfe-tools-header" style={{ marginTop: 16 }}>
        <Sparkles size={14} style={{ color: '#2563eb' }} />
        <span>{t('workflows.toolsTitle')}</span>
      </div>

      <div className="pfe-tools-grid">
        {TOOLS.map(({ key, label, shortLabel, description, icon: Icon, route, theme, color, bgColor, gate }) => {
          const frozen = toolFrozen(gate);
          const hint = toolHint(gate);
          return (
            <div key={key} className={`pfe-tool-card ${theme} ${frozen ? 'frozen' : ''}`}>
              <div>
                <div className="pfe-tool-icon" style={{ background: bgColor, color }}>
                  <Icon size={16} />
                </div>
                <h4>{t(label)}</h4>
                <p>{t(description)}</p>
              </div>
              <button
                className="pfe-btn-tool"
                style={{
                  background: frozen ? '#cbd5e1' : color,
                  color: '#ffffff',
                  cursor: frozen ? 'not-allowed' : 'pointer',
                  opacity: frozen ? 0.7 : 1,
                }}
                onClick={() => !frozen && navigate(route(claimId))}
                disabled={frozen}
                title={frozen ? hint : t('workflows.openTool', { tool: t(label) })}
              >
                {frozen ? t('workflows.frozen') : t('workflows.openTool', { tool: t(shortLabel) })} <ArrowUpRight size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
