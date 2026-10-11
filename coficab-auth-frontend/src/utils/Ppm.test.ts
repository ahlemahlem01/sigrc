import i18n from '../i18n';
import { computePpm } from './Ppm';

beforeAll(() => i18n.changeLanguage('fr'));

describe('computePpm', () => {
  it('computes parts per million, rounded', () => {
    expect(computePpm({ producedQuantity: 10_000, defectiveQuantity: 25 })).toEqual({ isComputable: true, value: 2500 });
    expect(computePpm({ producedQuantity: 3, defectiveQuantity: 1 })).toEqual({ isComputable: true, value: 333_333 });
    expect(computePpm({ producedQuantity: 500, defectiveQuantity: 0 })).toEqual({ isComputable: true, value: 0 });
  });

  it.each([
    [{ producedQuantity: null, defectiveQuantity: 1 }, 'Quantité produite non renseignée.'],
    [{ producedQuantity: 100, defectiveQuantity: undefined }, 'Quantité défectueuse non renseignée.'],
    [{ producedQuantity: 0, defectiveQuantity: 0 }, 'La quantité produite doit être supérieure à 0.'],
    [{ producedQuantity: 100, defectiveQuantity: -1 }, 'La quantité défectueuse ne peut pas être négative.'],
    [{ producedQuantity: 100, defectiveQuantity: 101 }, 'La quantité défectueuse ne peut pas dépasser la quantité produite.'],
  ])('refuses %p', (input, reason) => {
    expect(computePpm(input)).toEqual({ isComputable: false, value: null, reason });
  });
});
