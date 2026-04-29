import { NavLink } from 'react-router-dom'
import { useTranslation } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import { LANG_LABELS, type Lang } from '../i18n/translations'

function ThemeIcon({ mode }: { mode: string }) {
  if (mode === 'light') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    )
  }
  if (mode === 'dark') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    )
  }
  // auto
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
    </svg>
  )
}

export default function Header() {
  const { lang, setLang, t } = useTranslation()
  const { mode, toggle } = useTheme()

  return (
    <header className="header">
      <NavLink to="/" className="header-brand">
        <span>Alerta</span>
        <span className="accent">Desnona</span>
      </NavLink>
      <nav className="header-nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
          <span className="nav-text">{t('nav_mapa')}</span>
        </NavLink>
        <NavLink to="/estadistiques" className={({ isActive }) => isActive ? 'active' : ''}>
          <span className="nav-text">{t('nav_stats')}</span>
        </NavLink>
        <NavLink to="/alertes" className={({ isActive }) => isActive ? 'active' : ''}>
          <span className="nav-text">{t('nav_alertes')}</span>
        </NavLink>
        <NavLink to="/info" className={({ isActive }) => isActive ? 'active' : ''}>
          <span className="nav-text">{t('nav_info')}</span>
        </NavLink>

        <div className="header-separator" />

        <button
          className="header-btn theme-toggle"
          onClick={toggle}
          aria-label={`Tema: ${mode}`}
          title={`${t('theme_light')} / ${t('theme_dark')} / ${t('theme_auto')}`}
        >
          <ThemeIcon mode={mode} />
        </button>

        <select
          className="lang-select"
          value={lang}
          onChange={e => setLang(e.target.value as Lang)}
        >
          {(Object.keys(LANG_LABELS) as Lang[]).map(l => (
            <option key={l} value={l}>{LANG_LABELS[l]}</option>
          ))}
        </select>
      </nav>
    </header>
  )
}
