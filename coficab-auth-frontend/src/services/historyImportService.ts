import axios from 'axios';
import { ACTION_PLAN_API_URL as API_BASE_URL } from '../config/apiEnv';

const authHeaders = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export interface HistoryIssue {
  sheet: string;
  line: number;
  message: string;
}

export interface HistoryPreview {
  claims: number;
  causes: number;
  importable: number;
  duplicates: { line: number; title: string }[];
  errors: HistoryIssue[];
  sample: {
    line: number;
    reference: string;
    title: string;
    defectType: string;
    detectionDate: string;
    closedDate?: string | null;
    productionLine?: string | null;
    causes: number;
  }[];
}

export interface HistoryCommitResult {
  batchId: string;
  imported: number;
  causes: number;
  skippedDuplicates: number;
  errors: HistoryIssue[];
}

export interface HistoryBatch {
  id: string;
  fileName: string;
  createdAt: string;
  createdBy: string;
  claimCount: number;
  causeCount: number;
  isArchived: boolean;
  archivedAt?: string | null;
}

const upload = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return form;
};

export const historyImportService = {
  async downloadTemplate(token: string): Promise<void> {
    const response = await axios.get(`${API_BASE_URL}/history-import/template`, {
      ...authHeaders(token),
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(response.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele-historique-dossiers.xlsx';
    a.click();
    window.URL.revokeObjectURL(url);
  },

  async preview(file: File, token: string): Promise<HistoryPreview> {
    const response = await axios.post<HistoryPreview>(`${API_BASE_URL}/history-import/preview`, upload(file), authHeaders(token));
    return response.data;
  },

  async commit(file: File, token: string): Promise<HistoryCommitResult> {
    const response = await axios.post<HistoryCommitResult>(`${API_BASE_URL}/history-import/commit`, upload(file), authHeaders(token));
    return response.data;
  },

  async batches(token: string): Promise<HistoryBatch[]> {
    const response = await axios.get<HistoryBatch[]>(`${API_BASE_URL}/history-import/batches`, authHeaders(token));
    return response.data;
  },

  async setArchived(id: string, archived: boolean, token: string): Promise<void> {
    await axios.post(`${API_BASE_URL}/history-import/batches/${id}/${archived ? 'archive' : 'restore'}`, null, authHeaders(token));
  },
};
