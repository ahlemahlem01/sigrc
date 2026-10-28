import axios from 'axios';
import { ACTION_PLAN_API_URL as API } from '../config/apiEnv';

export type CvReviewStatus = 'pending' | 'validated' | 'rejected';

export interface CvReviewItem {
  claimId: string;
  reference?: string | null;
  title?: string | null;
  /** The code the operator kept on the claim. */
  operatorDefectType: string;
  /** The code that trains the model: the engineer's once validated, else the operator's. */
  defectType: string;
  predictedDefectType?: string | null;
  confidence?: number | null;
  correctionLogged: boolean;
  validationStatus?: 'VALIDATED' | 'REJECTED' | null;
  createdAt: string;
}

const headers = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

/** Photos of claims where the image model was corrected or unsure, and the quality engineer's decision on each (only validated ones train the model). */
export const cvReviewService = {
  list: async (status: CvReviewStatus, token: string): Promise<CvReviewItem[]> =>
    (await axios.get<{ items: CvReviewItem[] }>(`${API}/ml-features/cv-corrections`, { ...headers(token), params: { status } })).data.items,

  /** The photo itself needs the token, so it is fetched as bytes and shown from an object URL. */
  photo: async (claimId: string, token: string): Promise<string> => {
    const r = await axios.get<Blob>(`${API}/ml-features/cv-corrections/${claimId}/photo`, { ...headers(token), responseType: 'blob' });
    return URL.createObjectURL(r.data);
  },

  decide: async (claimId: string, status: 'VALIDATED' | 'REJECTED', defectType: string | undefined, token: string) =>
    (await axios.put(`${API}/ml-features/cv-corrections/${claimId}/validation`, { status, defectType }, headers(token))).data,
};
