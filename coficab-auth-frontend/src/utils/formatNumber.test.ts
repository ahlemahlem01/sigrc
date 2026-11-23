import i18n from '../i18n';
import { formatDecimal } from './formatNumber';

describe('formatDecimal', () => {
  afterAll(async () => { await i18n.changeLanguage('fr'); });

  it('writes a decimal with a comma in French and Italian, a point in English', async () => {
    await i18n.changeLanguage('fr');
    expect(formatDecimal(30.8)).toBe('30,8');
    await i18n.changeLanguage('it');
    expect(formatDecimal(14.7)).toBe('14,7');
    await i18n.changeLanguage('en');
    expect(formatDecimal(21.9)).toBe('21.9');
  });

  it('keeps whole numbers whole and refuses to print NaN', async () => {
    await i18n.changeLanguage('fr');
    expect(formatDecimal(4)).toBe('4');
    expect(formatDecimal(NaN)).toBe('—');
  });
});
