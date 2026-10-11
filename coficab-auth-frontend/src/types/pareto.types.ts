export enum ParetoDimension {
  DefectType = 'DefectType',
  ProductionLine = 'ProductionLine',
  ClientId = 'ClientId',
  Shift = 'Shift',
  Severity = 'Severity',
}

export interface ParetoItemDto {
  category: string;
  count: number;
  impact: number;
  percentage: number;
  cumulativePercentage: number;
  isVitalFew: boolean;
}

export interface ParetoRequestDto {
  dimension: ParetoDimension;
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
  productionLine?: string;
  defectType?: string;
  measure?: ParetoMeasure;
}

export type ParetoMeasure = 'count' | 'impact';

export interface ParetoSuggestRequestDto {
  defectType?: string;
  productionLine?: string;
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ParetoCandidateDto {
  dimension: string;
  mode: string;
  label: string;
  topCategory?: string;
  topPercentage: number;
  sampleSize: number;
  score: number;
  items: ParetoItemDto[];
}

export interface ParetoSuggestionDto {
  hasData: boolean;
  insufficientData?: boolean;
  noPattern?: boolean;
  minSample?: number;
  recommendedDimension: string;
  recommendedMode: string;
  recommendedLabel: string;
  explanation: string;
  topCategory?: string;
  topPercentage: number;
  sampleSize: number;
  confidenceScore: number;
  items: ParetoItemDto[];
  candidates: ParetoCandidateDto[];
}
