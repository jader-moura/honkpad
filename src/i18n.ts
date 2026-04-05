import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ptBR from './locales/pt-BR.json'
import enUS from './locales/en-US.json'
import esES from './locales/es-ES.json'

export type LanguageCode = 'pt-BR' | 'en-US' | 'es-ES'

const resources = {
  'pt-BR': { translation: ptBR },
  'en-US': { translation: enUS },
  'es-ES': { translation: esES },
}

// Detect language preference from localStorage or OS
const getInitialLanguage = (): LanguageCode => {
  // Check localStorage first
  const saved = localStorage.getItem('sdb_language')
  if (saved && saved in resources) {
    return saved as LanguageCode
  }

  // Fall back to OS language if supported
  const osLang = navigator.language
  if (osLang.startsWith('pt')) return 'pt-BR'
  if (osLang.startsWith('es')) return 'es-ES'
  if (osLang.startsWith('en')) return 'en-US'

  // Default to Portuguese
  return 'pt-BR'
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'pt-BR',
    interpolation: {
      escapeValue: false,
    },
  })

// Persist language changes
export const setLanguage = (lang: LanguageCode) => {
  i18n.changeLanguage(lang)
  localStorage.setItem('sdb_language', lang)
}

export default i18n
