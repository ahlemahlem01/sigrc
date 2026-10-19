import axios, { AxiosRequestConfig } from 'axios';
import { useAuth } from '../context/AuthContext';
import { scopeParams } from './organizationScopeStore';
import {
  Claim,
  UpdateClaimCommand,
  AssignClaimPayload,
  FiveWhyDetails,
  CreateOrUpdateFiveWhyCommand,
  ValidateFiveWhyCommand,
  IshikawaDiagram,
  FiveWhySuggestion,
  SuggestIshikawaCausesResponseDto,
  ParetoReport,
  QualityDashboardSummary,
  ClaimsHistoryPage,
  ClaimsHistoryQuery,
  ClaimResolutionEstimate,
} from '../types/qualityAnalysis';

import { ACTION_PLAN_API_URL as API_BASE_URL } from '../config/apiEnv';

const api = axios.create({
  baseURL: `${API_BASE_URL}/QualityAnalysis`,
  headers: {
    'Content-Type': 'application/json',
  },
});

const ishikawaApi = axios.create({
  baseURL: `${API_BASE_URL}/Ishikawa`,
  headers: {
    'Content-Type': 'application/json',
  },
});

const getAuthConfig = (token?: string, extraHeaders?: Record<string, string>): AxiosRequestConfig => {
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return { headers };
};

export interface StartAnalysisRequestDto {
  productionLine?: string;
  shift?: string;
  analysisNotes?: string;
}

export interface GenerateSynthesisRequestDto {
  why1: string;
  why2: string;
  why3: string;
  why4: string;
  why5: string;
  claimTitle?: string;
  defectDescription?: string;
}

export interface GenerateSynthesisResponseDto {
  rootCauseSynthesis: string;
}

export interface ValidateFiveWhyStepRequestDto {
  stepNumber: number;
  branch: 'OCCURRENCE' | 'DETECTION';
  problemStatement: string;
  proposedAnswer: string;
  previousSteps: Array<{
    stepNumber: number;
    branchType?: string;
    question: string;
    answer: string;
  }>;
}

export interface ValidateFiveWhyStepResponseDto {
  isAccepted: boolean;
  severity: 'OK' | 'WARN' | 'BLOCK';
  flags: string[];
  coachMessage: string;
  suggestedFollowUpQuestions: string[];
}

export interface SuggestedCapaActionDto {
  kind: 'CORRECTIVE' | 'PREVENTIVE' | string;
  branch: 'OCCURRENCE' | 'DETECTION' | string;
  title: string;
  description: string;
  priority: number;
  suggestedDeadlineDays: number;
}

export interface SuggestCapaRequestDto {
  problemStatement: string;
  rootCauseOccurrence: string;
  rootCauseDetection: string;
  claimTitle?: string;
}

export interface SuggestCapaResponseDto {
  planTitle: string;
  planDescription: string;
  actions: SuggestedCapaActionDto[];
}

export interface CreateCapaFromFiveWhyRequestDto {
  planTitle?: string;
  planDescription?: string;
  organizationId?: string;
  departmentId?: string;
  assignedToId?: string;
  deadline?: string;
  actions: SuggestedCapaActionDto[];
}

export interface CreateIshikawaCauseCommand {
  claimId: string;
  category: string;
  causeDescription: string;
  isRootCause?: boolean;
  createdBy?: string;
  source?: 'MANUAL' | 'AI_FIVE_WHY' | 'AI_CONTEXT';
  fiveWhyStepId?: string;
  fiveWhyStepIndex?: number;
  aiConfidence?: number;
  probabilityTier?: 'Red' | 'Yellow' | 'Green' | string;
}

export interface ArchiveIshikawaCauseRequest {
  archivedBy: string;
  archiveReason?: string;
}

export interface ClaimKpis {
  from: string;
  months: number;
  totalClaims: number;
  averageTreatmentDays: number | null;
  closedWithDates: number;
  claimsPerMonth: Array<{ month: string; opened: number; closed: number }>;
  ppmByClient: Array<{ clientId: string; claims: number; defectiveQuantity: number; producedQuantity: number; ppm: number | null }>;
  topDefects: Array<{ defectType: string; claims: number; defectiveQuantity: number }>;
  byStatus: Array<{ status: string; claims: number }>;
}

export const qualityAnalysisService = {
  getClaims: async (
    status?: string,
    token?: string,
    assignedTo?: string,
    options?: { createdBy?: string; hasAssignee?: boolean; relatedTo?: string }
  ): Promise<Claim[]> => {
    const config = getAuthConfig(token);
    const params: Record<string, string | boolean> = { ...scopeParams() };
    if (status) params.status = status;
    if (assignedTo) params.assignedTo = assignedTo;
    if (options?.createdBy) params.createdBy = options.createdBy;
    if (options?.relatedTo) params.relatedTo = options.relatedTo;
    if (options?.hasAssignee !== undefined) params.hasAssignee = options.hasAssignee;
    // Server-side pagination: pages are fetched until X-Total-Count is reached, so callers still get the whole list.
    const pageSize = 200;
    const all: Claim[] = [];
    for (let page = 1; page <= 50; page++) {
      const response = await api.get<Claim[]>('/claims', { ...config, params: { ...params, page, pageSize } });
      const items = Array.isArray(response.data) ? response.data : [];
      all.push(...items);
      const total = Number(response.headers?.['x-total-count']);
      if (items.length < pageSize || (Number.isFinite(total) && all.length >= total)) break;
    }
    return all;
  },

  /** KPI réclamations (admin) : par mois, délai moyen de traitement, PPM par client, top défauts. */
  getClaimKpis: async (months = 12, token?: string): Promise<ClaimKpis> => {
    const response = await api.get<ClaimKpis>(`${API_BASE_URL}/kpi/claims`, { ...getAuthConfig(token), params: { months } });
    return response.data;
  },

  /** Recherche sémantique (embeddings Gemini + similarité cosinus). */
  semanticSearch: async (
    query: string,
    token?: string,
    top = 40,
  ): Promise<{ query: string; claims: Claim[]; actionPlans: Array<{ entityId: string; title?: string; score: number }> }> => {
    const response = await api.get('/semantic-search', {
      ...getAuthConfig(token),
      params: { q: query, top },
      timeout: 20000,
    });
    const data = response.data || {};
    const claimsRaw = Array.isArray(data.claims) ? data.claims : [];
    return {
      query: String(data.query ?? query),
      claims: claimsRaw as Claim[],
      actionPlans: Array.isArray(data.actionPlans) ? data.actionPlans : [],
    };
  },

  getMyAssignedClaims: async (token?: string): Promise<Claim[]> => {
    return qualityAnalysisService.getClaims(undefined, token, 'me');
  },

  /** Claims créés par l'admin connecté (assignés ou non). */
  getAdminManagedClaims: async (token?: string): Promise<Claim[]> => {
    return qualityAnalysisService.getClaims(undefined, token, undefined, {
      createdBy: 'me',
    });
  },

  getClaimsHistory: async (query: ClaimsHistoryQuery, token?: string): Promise<ClaimsHistoryPage> => {
    const config = getAuthConfig(token);
    const params: Record<string, string | number | boolean> = { ...scopeParams() };
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      params[key] = value as string | number | boolean;
    });
    config.params = params;
    const response = await api.get<ClaimsHistoryPage>('/claims/history', config);
    return response.data;
  },

  getClaimById: async (id: string, token?: string): Promise<Claim> => {
    const response = await api.get<Claim>(`/claims/${id}`, getAuthConfig(token));
    return response.data;
  },

  estimateClaimResolution: async (
    defectType: string,
    severity: string,
    token?: string
  ): Promise<ClaimResolutionEstimate> => {
    const response = await api.get<ClaimResolutionEstimate>(
      '/claims/resolution-estimate',
      {
        ...getAuthConfig(token),
        params: {
          defectType: defectType || undefined,
          severity: severity || undefined,
        },
      }
    );
    return response.data;
  },

  createClaim: async (formDataPayload: FormData, token?: string) => {
    const response = await api.post<{ id: string; message: string }>(
      '/claims',
      formDataPayload,
      getAuthConfig(token, { 'Content-Type': 'multipart/form-data' })
    );
    return response.data;
  },

  importClaimsCsv: async (file: File, token?: string) => {
    const form = new FormData();
    form.append('file', file);
    const response = await api.post<{ created: number; ids: string[]; errors: { line: number; message: string }[] }>(
      '/claims/import',
      form,
      getAuthConfig(token, { 'Content-Type': 'multipart/form-data' })
    );
    return response.data;
  },

  updateClaim: async (id: string, command: UpdateClaimCommand, token?: string) => {
    const response = await api.put<{ success: boolean; message: string }>(`/claims/${id}`, command, getAuthConfig(token));
    return response.data;
  },

  assignClaim: async (id: string, payload: AssignClaimPayload, token?: string) => {
    const response = await api.patch<{ success: boolean; message: string }>(
      `/claims/${id}/assign`,
      {
        assignedToId: payload.assignedToId ?? null,
        assignedToName: payload.assignedToName ?? null,
      },
      getAuthConfig(token)
    );
    return response.data;
  },

  setClaimDeadline: async (id: string, deadlineIso: string, token?: string) => {
    const response = await api.patch<{ success: boolean; message: string; deadline?: string }>(
      `/claims/${id}/deadline`,
      { deadline: deadlineIso },
      getAuthConfig(token)
    );
    return response.data;
  },

  startAnalysis: async (id: string, dto?: StartAnalysisRequestDto, token?: string) => {
    const response = await api.patch<{ message: string }>(
      `/claims/${id}/start-analysis`,
      dto || {},
      getAuthConfig(token)
    );
    return response.data;
  },

  getFiveWhy: async (claimId: string, token?: string): Promise<FiveWhyDetails> => {
    const response = await api.get<FiveWhyDetails>(`/5why/${claimId}`, getAuthConfig(token));
    return response.data;
  },

  getFiveWhyByClaimId: async (claimId: string, token?: string): Promise<FiveWhyDetails> => {
    return qualityAnalysisService.getFiveWhy(claimId, token);
  },

  saveFiveWhy: async (command: CreateOrUpdateFiveWhyCommand | any, token?: string) => {
    const response = await api.post<{ id?: string; success?: boolean; message?: string }>('/5why', command, getAuthConfig(token));
    return response.data;
  },

  validateFiveWhy: async (command: ValidateFiveWhyCommand, token?: string) => {
    const response = await api.post<{ success: boolean; message: string }>('/5why/validate', command, getAuthConfig(token));
    return response.data;
  },

  generateFiveWhySynthesis: async (
    claimId: string,
    dto: GenerateSynthesisRequestDto,
    token?: string
  ): Promise<GenerateSynthesisResponseDto> => {
    const response = await api.post<GenerateSynthesisResponseDto>(
      `/5why/${claimId}/generate-synthesis`,
      dto,
      getAuthConfig(token)
    );
    return response.data;
  },

  suggestCapaFromFiveWhy: async (
    claimId: string,
    dto: SuggestCapaRequestDto,
    token?: string
  ): Promise<SuggestCapaResponseDto> => {
    const response = await api.post<SuggestCapaResponseDto>(
      `/5why/${claimId}/suggest-capa`,
      dto,
      getAuthConfig(token)
    );
    return response.data;
  },

  createCapaFromFiveWhy: async (
    claimId: string,
    dto: CreateCapaFromFiveWhyRequestDto,
    token?: string
  ): Promise<{ id: string; message: string; plan?: any }> => {
    const response = await api.post<{ id: string; message: string; plan?: any }>(
      `/5why/${claimId}/create-capa`,
      dto,
      getAuthConfig(token)
    );
    return response.data;
  },

  getCapaForClaim: async (claimId: string, token?: string): Promise<any[]> => {
    const response = await api.get<any[]>(`/5why/${claimId}/capa`, getAuthConfig(token));
    return response.data;
  },

  validateFiveWhyStep: async (
    claimId: string,
    dto: ValidateFiveWhyStepRequestDto,
    token?: string
  ): Promise<ValidateFiveWhyStepResponseDto> => {
    const response = await api.post<ValidateFiveWhyStepResponseDto>(
      `/5why/${claimId}/validate-step`,
      dto,
      getAuthConfig(token)
    );
    return response.data;
  },

  /** Suggestions IA (6M) depuis le 5 Why — utilisé par IshikawaPage. */
  getIshikawaSuggestionsFromFiveWhy: async (claimId: string, token?: string): Promise<FiveWhySuggestion[]> => {
    const response = await api.get<FiveWhySuggestion[]>(`/5why/${claimId}/suggestions`, getAuthConfig(token));
    return response.data;
  },

  getIshikawa: async (claimId: string, token?: string): Promise<IshikawaDiagram> => {
    const response = await ishikawaApi.get<IshikawaDiagram>(`/claims/${claimId}`, getAuthConfig(token));
    return response.data;
  },

  suggestIshikawaCauses: async (
    claimId: string,
    paretoVitalFew?: string,
    token?: string
  ): Promise<SuggestIshikawaCausesResponseDto> => {
    const response = await ishikawaApi.post<SuggestIshikawaCausesResponseDto>(
      `/claims/${claimId}/suggest-causes`,
      { claimId, paretoVitalFew },
      getAuthConfig(token)
    );
    return response.data;
  },

  addIshikawaCause: async (command: CreateIshikawaCauseCommand, token?: string): Promise<string> => {
    const response = await ishikawaApi.post<string>('/causes', command, getAuthConfig(token));
    return response.data;
  },

  archiveIshikawaCause: async (
    causeId: string,
    request: ArchiveIshikawaCauseRequest,
    token?: string
  ): Promise<void> => {
    await ishikawaApi.put(`/causes/${causeId}/archive`, request, getAuthConfig(token));
  },

  getPareto: async (token?: string): Promise<ParetoReport> => {
    const response = await api.get<ParetoReport>('/analytics/pareto', getAuthConfig(token));
    return response.data;
  },

  getSummary: async (token?: string): Promise<QualityDashboardSummary> => {
    const response = await api.get<QualityDashboardSummary>('/analytics/summary', getAuthConfig(token));
    return response.data;
  },

  downloadPdfReport: async (claimId: string, token?: string): Promise<Blob> => {
    const response = await api.get(`/export-pdf/${claimId}`, {
      ...getAuthConfig(token),
      responseType: 'blob',
    });
    return response.data;
  },
};

const eightDApi = axios.create({
  baseURL: `${API_BASE_URL}/EightD`,
  headers: { 'Content-Type': 'application/json' },
});

export interface EightDStepGate {
  step: number;
  code: string;
  label: string;
  complete: boolean;
  unlocked: boolean;
  hint?: string;
}

export interface EightDCapaActionSummary {
  id: string;
  title: string;
  progress: number;
  assignedToId?: string;
  deadline?: string;
  proofCount: number;
  done: boolean;
}

export interface EightDContainmentAction {
  id: string;
  kind: string;
  title: string;
  owner?: string;
  location?: string;
  qtyChecked?: number | null;
  qtyNok?: number | null;
  status: string;
  notes?: string;
  required: boolean;
  originalOwner?: string;
  originalLocation?: string;
  originalStatus?: string;
  originalNotes?: string;
  originalQtyChecked?: number | null;
  originalQtyNok?: number | null;
}

export interface EightDDossier {
  id: string;
  claimId: string;
  claimTitle: string;
  claimStatus: string;
  clientId: string;
  defectType: string;
  lotNumber: string;
  description: string;
  currentStep: number;
  statusCode: string;
  championId?: string;
  championName?: string;
  teamMembers?: string;
  teamFormedAt?: string;
  containmentDescription?: string;
  containmentOwner?: string;
  containmentImplementedAt?: string;
  containmentVerified: boolean;
  containmentNotes?: string;
  containmentActions?: EightDContainmentAction[];
  effectivenessMethod?: string;
  lotsChecked?: number | null;
  defectsFound?: number | null;
  effectivenessNotes?: string;
  effectivenessValidated: boolean;
  effectivenessValidatedAt?: string;
  preventiveDescription?: string;
  preventiveScope?: string;
  preventiveStandardized: boolean;
  preventiveCompletedAt?: string;
  congratulationsNote?: string;
  customerName?: string;
  closedAt?: string;
  customerPdfGeneratedAt?: string;
  hasCustomerPdf: boolean;
  submittedAt?: string;
  validatedAt?: string;
  validationComment?: string;
  fiveWhyComplete: boolean;
  ishikawaComplete: boolean;
  capaPlanId?: string;
  capaPlanTitle?: string;
  capaActionsDone: boolean;
  capaProofsComplete: boolean;
  canSubmit: boolean;
  canValidate: boolean;
  steps: EightDStepGate[];
  capaActions: EightDCapaActionSummary[];
  fieldOriginals?: Record<string, string>;
}

export type SaveEightDDossier = Partial<{
  championId: string;
  championName: string;
  teamMembers: string;
  containmentDescription: string;
  containmentOwner: string;
  containmentImplementedAt: string;
  containmentVerified: boolean;
  containmentNotes: string;
  containmentActions: EightDContainmentAction[];
  effectivenessMethod: string;
  lotsChecked: number;
  defectsFound: number;
  effectivenessNotes: string;
  effectivenessValidated: boolean;
  preventiveDescription: string;
  preventiveScope: string;
  preventiveStandardized: boolean;
  congratulationsNote: string;
  customerName: string;
}>;

export const eightDService = {
  get: async (claimId: string, token?: string): Promise<EightDDossier> => {
    const res = await eightDApi.get<EightDDossier>(`/${claimId}`, getAuthConfig(token));
    return res.data;
  },
  save: async (claimId: string, dto: SaveEightDDossier, token?: string): Promise<EightDDossier> => {
    const res = await eightDApi.put<EightDDossier>(`/${claimId}`, dto, getAuthConfig(token));
    return res.data;
  },
  submit: async (claimId: string, token?: string): Promise<EightDDossier> => {
    const res = await eightDApi.post<EightDDossier>(`/${claimId}/submit`, {}, getAuthConfig(token));
    return res.data;
  },
  validate: async (
    claimId: string,
    isApproved: boolean,
    comment: string | undefined,
    token?: string
  ): Promise<EightDDossier> => {
    const res = await eightDApi.post<EightDDossier>(
      `/${claimId}/validate`,
      { isApproved, comment },
      getAuthConfig(token)
    );
    return res.data;
  },
  pending: async (token?: string): Promise<EightDDossier[]> => {
    const res = await eightDApi.get<EightDDossier[]>('/pending', { ...getAuthConfig(token), params: scopeParams() });
    return res.data;
  },
  downloadPdf: async (claimId: string, token?: string): Promise<Blob> => {
    const res = await eightDApi.get(`/${claimId}/pdf`, { ...getAuthConfig(token), responseType: 'blob' });
    return res.data;
  },
  generatePdf: async (claimId: string, token?: string): Promise<Blob> => {
    const res = await eightDApi.post(`/${claimId}/pdf`, {}, { ...getAuthConfig(token), responseType: 'blob' });
    return res.data;
  },
};

export const useQualityAnalysisService = () => {
  const { accessToken } = useAuth();

  return {
    getClaims: (status?: string) => qualityAnalysisService.getClaims(status, accessToken || undefined),
    getMyAssignedClaims: () => qualityAnalysisService.getMyAssignedClaims(accessToken || undefined),
    getAdminManagedClaims: () => qualityAnalysisService.getAdminManagedClaims(accessToken || undefined),
    getClaimsHistory: (query: ClaimsHistoryQuery) =>
      qualityAnalysisService.getClaimsHistory(query, accessToken || undefined),
    getClaimById: (id: string) => qualityAnalysisService.getClaimById(id, accessToken || undefined),
    estimateClaimResolution: (defectType: string, severity: string) =>
      qualityAnalysisService.estimateClaimResolution(defectType, severity, accessToken || undefined),
    createClaim: (formDataPayload: FormData) => qualityAnalysisService.createClaim(formDataPayload, accessToken || undefined),
    updateClaim: (id: string, command: UpdateClaimCommand) => qualityAnalysisService.updateClaim(id, command, accessToken || undefined),
    assignClaim: (id: string, payload: AssignClaimPayload) =>
      qualityAnalysisService.assignClaim(id, payload, accessToken || undefined),
    setClaimDeadline: (id: string, deadlineIso: string) =>
      qualityAnalysisService.setClaimDeadline(id, deadlineIso, accessToken || undefined),
    startAnalysis: (id: string, dto?: StartAnalysisRequestDto) => qualityAnalysisService.startAnalysis(id, dto, accessToken || undefined),
    getFiveWhy: (claimId: string) => qualityAnalysisService.getFiveWhy(claimId, accessToken || undefined),
    getFiveWhyByClaimId: (claimId: string) => qualityAnalysisService.getFiveWhyByClaimId(claimId, accessToken || undefined),
    saveFiveWhy: (command: CreateOrUpdateFiveWhyCommand | any) => qualityAnalysisService.saveFiveWhy(command, accessToken || undefined),
    validateFiveWhy: (command: ValidateFiveWhyCommand) => qualityAnalysisService.validateFiveWhy(command, accessToken || undefined),
    generateFiveWhySynthesis: (claimId: string, dto: GenerateSynthesisRequestDto) =>
      qualityAnalysisService.generateFiveWhySynthesis(claimId, dto, accessToken || undefined),
    suggestCapaFromFiveWhy: (claimId: string, dto: SuggestCapaRequestDto) =>
      qualityAnalysisService.suggestCapaFromFiveWhy(claimId, dto, accessToken || undefined),
    createCapaFromFiveWhy: (claimId: string, dto: CreateCapaFromFiveWhyRequestDto) =>
      qualityAnalysisService.createCapaFromFiveWhy(claimId, dto, accessToken || undefined),
    getCapaForClaim: (claimId: string) => qualityAnalysisService.getCapaForClaim(claimId, accessToken || undefined),
    validateFiveWhyStep: (claimId: string, dto: ValidateFiveWhyStepRequestDto) =>
      qualityAnalysisService.validateFiveWhyStep(claimId, dto, accessToken || undefined),
    getIshikawaSuggestionsFromFiveWhy: (claimId: string) =>
      qualityAnalysisService.getIshikawaSuggestionsFromFiveWhy(claimId, accessToken || undefined),
    getIshikawa: (claimId: string) => qualityAnalysisService.getIshikawa(claimId, accessToken || undefined),
    suggestIshikawaCauses: (claimId: string, paretoVitalFew?: string) =>
      qualityAnalysisService.suggestIshikawaCauses(claimId, paretoVitalFew, accessToken || undefined),
    addIshikawaCause: (command: CreateIshikawaCauseCommand) =>
      qualityAnalysisService.addIshikawaCause(command, accessToken || undefined),
    archiveIshikawaCause: (causeId: string, request: ArchiveIshikawaCauseRequest) =>
      qualityAnalysisService.archiveIshikawaCause(causeId, request, accessToken || undefined),
    getPareto: () => qualityAnalysisService.getPareto(accessToken || undefined),
    getSummary: () => qualityAnalysisService.getSummary(accessToken || undefined),
    downloadPdfReport: (claimId: string) => qualityAnalysisService.downloadPdfReport(claimId, accessToken || undefined),
  };
};
