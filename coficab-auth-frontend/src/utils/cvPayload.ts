export interface CvProposal {
  defectType: string;
  confidence: number;
  threshold: number;
  /** The proposal comes from the demonstration mode, not from an image analysis. */
  demo?: boolean;
  /** Line families (EXT, WR, CUT, CTL...) where this defect is usually found. */
  lineFamilies?: string[];
}

/**
 * Adds what the image model proposed to the claim payload. The "correction logged" flag is not sent: the server derives it from
 * the proposal, the confidence and the code the operator kept, so a client cannot set it by hand.
 */
export function appendCvProposal(payload: FormData, cv: CvProposal | null): void {
  if (!cv) return;
  payload.append('CvPredictedDefectType', cv.defectType);
  payload.append('CvConfidence', String(cv.confidence));
}
