import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { translations, LANG_LOCALES, type Lang, type TranslationKey } from './translations'

interface LanguageContextType {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
  locale: string
}

const LanguageContext = createContext<LanguageContextType | null>(null)

function detectBrowserLang(): Lang {
  const nav = navigator.language?.toLowerCase() || ''
  if (nav.startsWith('eu')) return 'eu'
  if (nav.startsWith('gl')) return 'gl'
  if (nav.startsWith('ca')) return 'ca'
  if (nav.startsWith('es')) return 'es'
  return 'ca' // default
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('alerta-desnona-lang') as Lang | null
    if (saved && saved in translations) return saved
    return detectBrowserLang()
  })

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('alerta-desnona-lang', l)
    document.documentElement.lang = l
  }

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  function t(key: TranslationKey, vars?: Record<string, string | number>): string {
    let text = translations[lang][key] || translations.ca[key] || key
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v))
      })
    }
    return text
  }

  const locale = LANG_LOCALES[lang]

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, locale }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useTranslation must be inside LanguageProvider')
  return ctx
}
