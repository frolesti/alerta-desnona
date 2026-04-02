import { NavLink } from 'react-router-dom'
import { useTranslation } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import { LANG_LABELS, type Lang } from '../i18n/translations'

const THEME_ICONS: Record<string, string> = { light: '☀️', dark: '🌙', auto: '🔄' }

export default function Header() {
  const { lang, setLang, t } = useTranslation()
  const { mode, toggle } = useTheme()

  return (
    <header className="header">
      <NavLink to="/" className="header-brand">
        <span className="icon">🏠</span>
        <span>Alerta</span>
        <span className="accent">Desnona</span>
      </NavLink>
      <nav className="header-nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
          <span>🗺️</span>
          <span className="nav-text">{t('nav_mapa')}</span>
        </NavLink>
        <NavLink to="/estadistiques" className={({ isActive }) => isActive ? 'active' : ''}>
          <span>📊</span>
          <span className="nav-text">{t('nav_stats')}</span>
        </NavLink>
        <NavLink to="/alertes" className={({ isActive }) => isActive ? 'active' : ''}>
          <span>🔔</span>
          <span className="nav-text">{t('nav_alertes')}</span>
        </NavLink>
        <NavLink to="/info" className={({ isActive }) => isActive ? 'active' : ''}>
          <span>ℹ️</span>
          <span className="nav-text">{t('nav_info')}</span>
        </NavLink>

        <div className="header-separator" />

        <button
          className="header-btn theme-toggle"
          onClick={toggle}
          title={`${t('theme_light')} / ${t('theme_dark')} / ${t('theme_auto')}`}
        >
          {THEME_ICONS[mode]}
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
