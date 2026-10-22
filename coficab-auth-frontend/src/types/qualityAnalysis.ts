// ─── ENUMS ───────────────────────────────────────────────────────────────

export enum IshikawaCategory {
  Manpower = 'Manpower',
  Machine = 'Machine',
  Material = 'Material',
  Method = 'Method',
  Milieu = 'Milieu',
  Measurement = 'Measurement',
}

// ─── CLAIMS TYPES ────────────────────────────────────────────────────────

export interface Claim {
  id: string;
  title: string;
  clientId: string;
  defectType: string;
  severity: string;
  lotNumber: string;
  serialNumber?: string;
  detectionDate: string;
  description: string;
  statusCode: string;
  producedQuantity?: number | null;
  defectiveQuantity?: number | null;
  assignedToId?: string | null;
  assignedToName?: string | null;
  assignedAt?: string | null;
  productionLine?: string | null;
  createdById?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
  updatedById?: string;
  deadline?: string | null;
  completedAt?: string | null;
  isOnTime?: boolean | null;
  estimatedDaysP50?: number | null;
  estimatedDaysP80?: number | null;
  estimateMethod?: string | null;
  estimateSampleSize?: number | null;
  estimatedAt?: string | null;
}

export interface ClaimResolutionEstimate {
  available: boolean;
  daysP50?: number;
  daysP80?: number;
  sampleSize?: number;
  method?: 'type_severity' | 'severity' | 'global' | string;
  defectType?: string | null;
  severity?: string | null;
  suggestedDeadlineUtc?: string | null;
  isReliable?: boolean;
  message?: string;
}

export interface CreateClaimCommand {
  title: string;
  clientId: string;
  defectType: string;
  severity: string;
  lotNumber: string;
  serialNumber?: string;
  detectionDate: string;
  description: string;
  createdById: string;
  producedQuantity?: number | null;
  defectiveQuantity?: number | null;
  assignedToId?: string | null;
  assignedToName?: string | null;
}

export interface UpdateClaimCommand {
  id: string;
  title?: string;
  clientId?: string;
  defectType?: string;
  severity?: string;
  lotNumber?: string;
  serialNumber?: string;
  description?: string;
  updatedById: string;
  statusCode?: string;
  producedQuantity?: number | null;
  defectiveQuantity?: number | null;
}

export interface AssignClaimPayload {
  assignedToId?: string | null;
  assignedToName?: string | null;
}

// ─── 5 WHY TYPES ─────────────────────────────────────────────────────────

export type FiveWhyBranch = 'OCCURRENCE' | 'DETECTION';

export interface FiveWhyStep {
  stepNumber: number;
  question: string;
  answer: string;
  branchType?: FiveWhyBranch | string;
}

export interface FiveWhyDetails {
  id: string;
  claimId: string;
  problemStatement: string;
  rootCause?: string;
  rootCauseOccurrence?: string;
  rootCauseDetection?: string;
  statusCode: string;
  isValidated: boolean;
  validatedBy?: string;
  validatedAt?: string;
  createdAt: string;
  createdBy: string;
  steps: FiveWhyStep[];
}

export interface CreateOrUpdateFiveWhyCommand {
  claimId: string;
  userId: string;
  problemStatement: string;
  rootCause?: string;
  rootCauseOccurrence?: string;
  rootCauseDetection?: string;
  steps: FiveWhyStep[];
}

export interface ValidateFiveWhyCommand {
  analysisId: string;
  isApproved: boolean;
  validatedBy: string;
}

// ─── ISHIKAWA TYPES ──────────────────────────────────────────────────────

export type IshikawaCauseSource = 'MANUAL' | 'AI_FIVE_WHY' | 'AI_CONTEXT';
export type IshikawaProbabilityTier = 'Red' | 'Yellow' | 'Green';

export interface IshikawaCauseInput {
  id?: string;
  category: IshikawaCategory | string;
  causeDescription: string;
  isRootCause: boolean;
  source?: IshikawaCauseSource;
  fiveWhyStepId?: string;
  fiveWhyStepIndex?: number;
  aiConfidence?: number;
  probabilityTier?: IshikawaProbabilityTier;
  tierLabel?: string;
  rationale?: string;
}

export interface IshikawaCauseRead {
  id: string;
  category: IshikawaCategory | string;
  causeDescription: string;
  isRootCause: boolean;
  source?: IshikawaCauseSource;
  fiveWhyStepId?: string;
  fiveWhyStepIndex?: number;
  aiConfidence?: number;
  probabilityTier?: IshikawaProbabilityTier;
  tierLabel?: string;
  rationale?: string;
}

export interface IshikawaDiagram {
  claimId: string;
  causes: IshikawaCauseRead[];
}

export interface FiveWhySuggestion {
  category: IshikawaCategory | string;
  causeDescription: string;
  isRootCause?: boolean;
  fiveWhyStepId?: string;
  fiveWhyStepIndex?: number;
  confidence?: number;
}

export interface SuggestedIshikawaCauseDto {
  category: IshikawaCategory | string;
  causeDescription: string;
  probabilityTier: IshikawaProbabilityTier;
  tierLabel: string;
  rationale: string;
  source: string;
  historicalCount: number;
  confidence: number;
  isRootCauseCandidate: boolean;
}

export interface SuggestIshikawaCausesResponseDto {
  claimId: string;
  defectType?: string;
  productionLine?: string;
  paretoVitalFew?: string;
  explanation: string;
  items: SuggestedIshikawaCauseDto[];
}

// ─── ANALYTICS TYPES ─────────────────────────────────────────────────────

export interface ParetoItem {
  category: string;
  frequency: number;
  percentage: number;
  cumulativePercentage: number;
}

export interface ParetoReport {
  totalCauses: number;
  items: ParetoItem[];
}

export interface QualityDashboardSummary {
  totalFiveWhyAnalyses: number;
  validatedAnalyses: number;
  pendingValidationAnalyses: number;
  rejectedAnalyses: number;
  totalIshikawaCausesCount: number;
}

export interface ClaimsHistoryRow {
  id: string;
  title: string;
  clientId: string;
  defectType: string;
  severity: string;
  lotNumber: string;
  serialNumber?: string | null;
  statusCode: string;
  detectionDate: string;
  createdAt: string;
  updatedAt?: string | null;
  deadline?: string | null;
  completedAt?: string | null;
  isOnTime?: boolean | null;
  createdBy?: string | null;
  createdById?: string | null;
  productionLine?: string | null;
  shift?: string | null;
  producedQuantity?: number | null;
  defectiveQuantity?: number | null;
  descriptionPreview?: string | null;
  fiveWhyId?: string | null;
  fiveWhyStatus?: string | null;
  problemStatement?: string | null;
  rootCauseOccurrence?: string | null;
  rootCauseDetection?: string | null;
  fiveWhyValidatedBy?: string | null;
  fiveWhyValidatedAt?: string | null;
  fiveWhyUpdatedAt?: string | null;
  eightDId?: string | null;
  eightDStatus?: string | null;
  eightDStep?: number | null;
  championName?: string | null;
  containmentVerified?: boolean;
  eightDSubmittedAt?: string | null;
  eightDValidatedAt?: string | null;
  eightDClosedAt?: string | null;
  ishikawaId?: string | null;
  ishikawaStatus?: string | null;
  capaId?: string | null;
  capaTitle?: string | null;
  capaStatus?: string | null;
  capaProgress?: number;
  capaCount?: number;
}

export interface ClaimsHistoryFacets {
  clients: string[];
  defectTypes: string[];
  severities: string[];
  productionLines: string[];
  shifts: string[];
  createdBy: string[];
}

export interface ClaimsHistoryStats {
  total: number;
  fiveWhyDraft: number;
  fiveWhyPending: number;
  fiveWhyValidated: number;
  fiveWhyRejected: number;
  withCapa: number;
  eightDPending: number;
  eightDTotal?: number;
  eightDInProgress?: number;
  eightDRejected?: number;
  eightDDone?: number;
  noFiveWhy?: number;
  eightDToHandle?: number;
  inAnalysisNoCapa?: number;
  capaLate?: number;
  claimsLate?: number;
}

export interface ClaimsHistoryPage {
  total: number;
  page: number;
  pageSize: number;
  items: ClaimsHistoryRow[];
  facets: ClaimsHistoryFacets;
  stats: ClaimsHistoryStats;
}

export interface ClaimsHistoryQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  claimStatus?: string;
  fiveWhyStatus?: string;
  eightDStatus?: string;
  eightDStep?: number | string;
  ishikawaStatus?: string;
  clientId?: string;
  defectType?: string;
  severity?: string;
  lotNumber?: string;
  productionLine?: string;
  shift?: string;
  createdBy?: string;
  createdFrom?: string;
  createdTo?: string;
  detectedFrom?: string;
  detectedTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  hasCapa?: string;
  hasFiveWhy?: string;
  hasEightD?: string;
  sort?: string;
  dir?: string;
  includeDrafts?: boolean;
  /** open | closed | empty (all) */
  scope?: string;
  /** noFiveWhy | eightD | noCapa | capaLate */
  focus?: string;
}