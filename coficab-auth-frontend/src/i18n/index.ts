import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr.json';
import en from './locales/en.json';
import it from './locales/it.json';

const STORAGE_KEY = 'coficab_lang';

export type AppLanguage = 'fr' | 'en' | 'it';

export function getStoredLanguage(): AppLanguage {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'en' || raw === 'it' || raw === 'fr') return raw;
  const nav = (navigator.language || 'fr').slice(0, 2).toLowerCase();
  if (nav === 'en' || nav === 'it') return nav;
  return 'fr';
}

export function setStoredLanguage(lang: AppLanguage) {
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
}

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    it: { translation: it },
  },
  lng: typeof window !== 'undefined' ? getStoredLanguage() : 'fr',
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

if (typeof window !== 'undefined') {
  document.documentElement.lang = i18n.language;
  i18n.on('languageChanged', (lng) => setStoredLanguage(lng as AppLanguage));
}

/** BCP 47 locale for dates and numbers in the current UI language. */
export function dateLocale(): string {
  const lang = (i18n.language || 'fr').slice(0, 2);
  return lang === 'en' ? 'en-GB' : lang === 'it' ? 'it-IT' : 'fr-FR';
}

export default i18n;
