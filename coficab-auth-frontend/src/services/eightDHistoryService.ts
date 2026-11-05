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

  /** The customer report (every text and figure of the PDF): the latest edited version, or the one the data give today. */
  report: async (claimId: string, token: string): Promise<EightDReportResponse> =>
    (await axios.get<EightDReportResponse>(`${API_BASE_URL}/EightD/${claimId}/report`, authHeaders(token))).data,

  freshReport: async (claimId: string, token: string): Promise<EightDReportModel> =>
    (await axios.get<EightDReportModel>(`${API_BASE_URL}/EightD/${claimId}/report/fresh`, authHeaders(token))).data,

  saveReport: async (claimId: string, model: EightDReportModel, note: string | null, token: string): Promise<EightDReportResponse> =>
    (await axios.put<EightDReportResponse>(`${API_BASE_URL}/EightD/${claimId}/report`, { model, note }, authHeaders(token))).data,

  reportVersions: async (claimId: string, token: string): Promise<EightDReportVersionRow[]> =>
    (await axios.get<EightDReportVersionRow[]>(`${API_BASE_URL}/EightD/${claimId}/report/versions`, authHeaders(token))).data,

  reportVersion: async (claimId: string, version: number, token: string): Promise<EightDReportResponse> =>
    (await axios.get<EightDReportResponse>(`${API_BASE_URL}/EightD/${claimId}/report/versions/${version}`, authHeaders(token))).data,
};

export interface EightDReportModel {
  company: string;
  title: string;
  reference: string;
  date: string;
  intro: string;
  ishikawaHeading: string;
  ishikawa: Array<{ category: string; description: string; major: string }>;
  priorityHeading: string;
  priority: { text: string; meta: string } | null;
  fiveWhyHeading: string;
  fiveWhy: { problem: string; statusLine: string; rows: Array<{ label: string; question: string; answer: string }>; rootCause: string } | null;
  capaHeading: string;
  capa: { title: string; rows: Array<{ action: string; deadline: string; status: string }> } | null;
  conclusionHeading: string;
  conclusion: string;
}

export interface EightDReportResponse {
  model: EightDReportModel;
  version: number;
  edited: boolean;
  savedAt?: string | null;
  savedByName?: string | null;
  note?: string | null;
}

export interface EightDReportVersionRow {
  versionNumber: number;
  savedAt: string;
  savedByName?: string | null;
  note?: string | null;
}
