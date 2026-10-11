import axios from 'axios';
import { ACTION_PLAN_API_URL as API_BASE_URL } from '../config/apiEnv';

export interface MiningWeightedRow {
  category: string;
  count: number;
  impact: number;
  ppm: number | null;
  sharePct: number;
  cumulativePct: number;
}

export interface MiningRule {
  antecedent: { key: 'line' | 'shift' | 'client' | 'severity'; value: string }[];
  defect: string;
  support: number;
  antecedentCount: number;
  confidence: number;
  lift: number;
  pValue: number;
  matchesCurrent: boolean;
}

export interface MiningCause {
  category: string;
  text: string;
  dossiers: number;
  rootDossiers?: number;
  sharePct?: number;
}

export interface MiningSimilarCase {
  id?: string;
  title?: string;
  lot?: string;
  client?: string;
  line?: string;
  defect?: string;
  detectionDate?: string;
  similarity: number;
  rootCauses: { category: string; text: string }[];
}

export interface MiningTrendResult {
  recent: number;
  baseline: number;
  expected: number;
  ratio: number;
  pValue: number;
  direction: 'up' | 'down' | 'stable';
}

export interface MiningInsights {
  available: boolean;
  reason?: string;
  meta?: {
    dossiers: number;
    withCauses: number;
    minSupport: number;
    minDossiersRules: number;
    rulesSufficient: boolean;
    restricted: boolean;
  };
  weightedPareto?: { defectType: MiningWeightedRow[]; productionLine: MiningWeightedRow[] };
  rules?: MiningRule[];
  rootCauses?: {
    sufficient: boolean;
    dossiers: number;
    defect?: string | null;
    categories: { category: string; dossiers: number; sharePct: number }[];
    causes: MiningCause[];
  };
  similar?: { available: boolean; count: number; cases: MiningSimilarCase[]; causes: MiningCause[] };
  trend?: {
    sufficient: boolean;
    dossiers: number;
    defect?: string | null;
    monthly: { month: string; count: number }[];
    current: MiningTrendResult | null;
    rising: (MiningTrendResult & { defect: string })[];
    reference?: string;
  };
  causeEvidence?: {
    sufficient: boolean;
    pool: number;
    /** Fewest closed dossiers with recorded causes needed before causes are ranked. */
    min?: number;
    items: {
      id: string;
      category: string;
      text: string;
      dossiers: number | null;
      rootDossiers: number | null;
      shareRootPct: number | null;
    }[];
  };
  repeatedLots?: {
    count: number;
    lots: { lot: string; dossiers: number; defects: string[]; client: string }[];
    currentLotDossiers: number;
  };
}

export interface MiningContext {
  claimId?: string;
  defectType?: string;
  productionLine?: string;
  shift?: string;
  clientId?: string;
}

export const miningService = {
  async insights(context: MiningContext, token: string): Promise<MiningInsights> {
    const response = await axios.post<MiningInsights>(`${API_BASE_URL}/mining/insights`, context, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },
};
