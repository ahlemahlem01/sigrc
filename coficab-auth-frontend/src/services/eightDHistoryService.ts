import axios from 'axios';
import { ACTION_PLAN_API_URL as API_BASE_URL } from '../config/apiEnv';

const authHeaders = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export interface EightDVersionSummary {
  version: number;
  eventType: string;
  savedAt: string;
  savedById?: string | null;
  savedByName?: string | null;
  statusCode: string;
  currentStep: number;
  changedFields: string[];
  comment?: string | null;
  isCurrent: boolean;
}

export interface EightDFieldChange {
  field: string;
  /** 8D step the field belongs to (1, 3, 6, 7, 8), or 0 for status and validation. */
  step: number;
  before?: string | null;
  after?: string | null;
}

export interface EightDVersionDetail extends EightDVersionSummary {
  changes: EightDFieldChange[];
}

/** Version history of an 8D dossier: append-only snapshots with what changed (never edited or deleted). */
export const eightDHistoryService = {
  versions: async (claimId: string, token: string): Promise<EightDVersionSummary[]> =>
    (await axios.get<EightDVersionSummary[]>(`${API_BASE_URL}/EightD/${claimId}/versions`, authHeaders(token))).data,

  version: async (claimId: string, version: number, token: string): Promise<EightDVersionDetail> =>
    (await axios.get<EightDVersionDetail>(`${API_BASE_URL}/EightD/${claimId}/versions/${version}`, authHeaders(token))).data,
};
