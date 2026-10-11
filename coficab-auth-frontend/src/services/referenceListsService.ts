import axios from 'axios';
import { ACTION_PLAN_API_URL as API_BASE_URL } from '../config/apiEnv';

const authHeaders = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export interface ReferenceItem {
  value: string;
  label?: string | null;
  sortOrder: number;
  isActive: boolean;
  /** Set when this spelling was merged into another one (alias). */
  mergedInto?: string | null;
}

export interface DuplicateGroup {
  key: string;
  variants: { value: string; claims: number; isActive: boolean }[];
}

export type ReferenceListKey = 'defect-type' | 'severity';

export interface ReferenceLists {
  lists: Record<ReferenceListKey, ReferenceItem[]>;
  /** What the claim forms suggest: the defect types really used by claims (merged spellings counted once). */
  defectTypeSuggestions: string[];
}

/** Multi-industry vocabulary: defect types and the wording of the four severity levels. Nothing is deleted (switch off instead). */
export const referenceListsService = {
  get: async (token: string): Promise<ReferenceLists> =>
    (await axios.get<ReferenceLists>(`${API_BASE_URL}/reference-lists`, authHeaders(token))).data,

  save: async (key: ReferenceListKey, items: ReferenceItem[], token: string): Promise<ReferenceLists> =>
    (await axios.put<ReferenceLists>(`${API_BASE_URL}/reference-lists/${key}`, { items }, authHeaders(token))).data,

  duplicates: async (token: string): Promise<DuplicateGroup[]> =>
    (await axios.get<DuplicateGroup[]>(`${API_BASE_URL}/reference-lists/defect-type/duplicates`, authHeaders(token))).data,

  merge: async (canonical: string, variants: string[], token: string): Promise<ReferenceLists> =>
    (await axios.post<ReferenceLists>(`${API_BASE_URL}/reference-lists/defect-type/merge`, { canonical, variants }, authHeaders(token))).data,

  unmerge: async (value: string, token: string): Promise<ReferenceLists> =>
    (await axios.post<ReferenceLists>(`${API_BASE_URL}/reference-lists/defect-type/unmerge`, { value }, authHeaders(token))).data,

  importExistingDefectTypes: async (token: string): Promise<ReferenceLists> =>
    (await axios.post<ReferenceLists>(`${API_BASE_URL}/reference-lists/defect-type/import-existing`, null, authHeaders(token))).data,
};
