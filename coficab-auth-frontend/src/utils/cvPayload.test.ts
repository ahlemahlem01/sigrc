import { appendCvProposal } from './cvPayload';

describe('appendCvProposal', () => {
  it('sends the proposed code and its confidence, and never a correction flag', () => {
    const payload = new FormData();
    appendCvProposal(payload, { defectType: 'CUT_INSULATION', confidence: 0.64, threshold: 0.7 });
    expect(payload.get('CvPredictedDefectType')).toBe('CUT_INSULATION');
    expect(payload.get('CvConfidence')).toBe('0.64');
    expect(payload.has('CvCorrectionLogged')).toBe(false);
  });

  it('sends nothing when no proposal was made (no image model, or no photo)', () => {
    const payload = new FormData();
    appendCvProposal(payload, null);
    expect(Array.from(payload.keys())).toEqual([]);
  });
});
