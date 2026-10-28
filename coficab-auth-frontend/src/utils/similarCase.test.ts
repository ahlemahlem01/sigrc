import { applySimilarCase, SimilarCase } from './similarCase';

const base = { defectType: 'Isolation endommagée', severity: 'LOW', description: 'Câble abîmé.', lotNumber: 'LOT-1', clientId: 'COFAT-MATEUR' };
const claim: SimilarCase = { id_reclamation: 'abc', photo_url: 'data:image/jpeg;base64,xx', code_defaut: 'CUT_INSULATION', score_similarite: 81.2, source: 'claim', reference: 'REC-2026-1383', severite: 'high' };
const example: SimilarCase = { id_reclamation: 'ref-1', photo_url: 'data:image/jpeg;base64,xx', code_defaut: 'SCRATCH_INSULATION', score_similarite: 55, source: 'reference', severite: 'HIGH' };

describe('applySimilarCase', () => {
  it('takes the defect code, the severity and a mention of a past claim, and nothing that belongs to another incident', () => {
    const next = applySimilarCase(base, claim);
    expect(next.defectType).toBe('CUT_INSULATION');
    expect(next.severity).toBe('HIGH');
    expect(next.description).toBe('Câble abîmé.\nCas similaire : REC-2026-1383');
    expect(next.lotNumber).toBe('LOT-1');
    expect(next.clientId).toBe('COFAT-MATEUR');
  });

  it('takes only the defect code from a reference example', () => {
    const next = applySimilarCase(base, example);
    expect(next).toEqual({ ...base, defectType: 'SCRATCH_INSULATION' });
  });

  it('does not mention the same claim twice, and does not invent a severity', () => {
    const once = applySimilarCase(base, claim);
    expect(applySimilarCase(once, claim).description).toBe(once.description);
    expect(applySimilarCase(base, { ...claim, severite: 'urgent' }).severity).toBe('LOW');
  });
});
