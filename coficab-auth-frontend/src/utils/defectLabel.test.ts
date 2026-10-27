import i18n from '../i18n';
import { defectLabel, defectValueFromInput, setDefectItems } from './defectLabel';

describe('defectLabel', () => {
  beforeEach(() => {
    setDefectItems([]);
    void i18n.changeLanguage('fr');
  });

  it('shows the translated wording of an inspection defect code', () => {
    expect(defectLabel('CUT_INSULATION')).toBe('Coupure / Entaille sur gaine');
    expect(defectLabel('cut insulation')).toBe('Coupure / Entaille sur gaine');
  });

  it('follows the language of the interface', async () => {
    await i18n.changeLanguage('en');
    expect(defectLabel('SPOOL_DAMAGED')).toBe('Spool / packaging damaged');
  });

  it('keeps a name that has no label as it is', () => {
    expect(defectLabel('Soudure défectueuse')).toBe('Soudure défectueuse');
    expect(defectLabel(null)).toBe('');
  });

  it('uses the label configured in the reference list', () => {
    setDefectItems([{ value: 'RESIN_LEAK', label: 'Fuite de résine' }]);
    expect(defectLabel('RESIN_LEAK')).toBe('Fuite de résine');
  });

  it('gives back the code behind a chosen wording, and the text otherwise', () => {
    expect(defectValueFromInput('Coupure / Entaille sur gaine')).toBe('CUT_INSULATION');
    expect(defectValueFromInput('Soudure défectueuse')).toBe('Soudure défectueuse');
  });

  it('an alias shows the wording of the name it was merged into, and never loops on a respelling of itself', () => {
    setDefectItems([
      { value: 'Etiquette manquante', label: null, mergedInto: 'Étiquette manquante' },   // same words once accents are folded
      { value: 'Étiquette manquante', label: null },
      { value: 'COPPER_BLOOMING', label: 'ancien nom', mergedInto: 'COPPER_BROKEN' },
    ]);
    expect(defectLabel('Etiquette manquante')).toBe('Étiquette manquante');
    expect(defectLabel('COPPER_BLOOMING')).toBe('Brins de cuivre cassés / désaffleurants');
  });
});
