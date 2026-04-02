import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getINEData } from '../api'
import type { EstadisticaINE } from '../api'
import { useTranslation } from '../i18n/LanguageContext'

function formatNum(n: number): string {
  return n.toLocaleString('ca-ES')
}

const COMUNITATS = [
  'Andalucia', 'Aragon', 'Cantabria', 'Castilla y Leon',
  'Castilla-La Mancha', 'Catalunya', 'Ceuta', 'Comunidad de Madrid',
  'Comunidad Foral de Navarra', 'Comunitat Valenciana', 'Euskadi',
  'Extremadura', 'Galicia', 'Illes Balears', 'Canarias',
  'La Rioja', 'Melilla', 'Principado de Asturias', 'Region de Murcia',
]

export default function LlistatPage() {
  const { t } = useTranslation()
  const [provincies, setProvincies] = useState<EstadisticaINE[]>([])
  const [loading, setLoading] = useState(true)
  const [totalVivendes, setTotalVivendes] = useState(0)
  const [any, setAny] = useState<number | null>(null)
  const [filterCom, setFilterCom] = useState('')
  const [cerca, setCerca] = useState('')
  const [sortBy, setSortBy] = useState('vivendes_desc')

  useEffect(() => {
    getINEData()
      .then(ineRes => {
        if (ineRes.ok && ineRes.data) {
          setProvincies(ineRes.data)
          setTotalVivendes(ineRes.total_vivendes ?? 0)
          setAny(ineRes.any ?? null)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Filter
  let filtered = provincies
  if (filterCom) {
    filtered = filtered.filter(p => p.comunitat_autonoma === filterCom)
  }
  if (cerca) {
    const q = cerca.toLowerCase()
    filtered = filtered.filter(p =>
      p.provincia.toLowerCase().includes(q) ||
      p.comunitat_autonoma.toLowerCase().includes(q)
    )
  }

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'vivendes_desc': return b.finques_vivendes - a.finques_vivendes
      case 'vivendes_asc': return a.finques_vivendes - b.finques_vivendes
      case 'provincia': return a.provincia.localeCompare(b.provincia)
      case 'comunitat': return a.comunitat_autonoma.localeCompare(b.comunitat_autonoma)
      case 'total_desc': return b.total_finques - a.total_finques
      default: return b.finques_vivendes - a.finques_vivendes
    }
  })

  const maxVivendes = Math.max(...provincies.map(p => p.finques_vivendes), 1)

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span>{t('loading')}</span>
      </div>
    )
  }

  return (
    <div className="llistat-page">
      <h1 className="page-title">{t('list_title')}</h1>
      <p className="page-subtitle">
        {formatNum(totalVivendes)} {t('stats_housing_short')} {t('list_subtitle_post')} ({any})
      </p>

      <div className="filtres-bar">
        <select
          value={filterCom}
          onChange={e => setFilterCom(e.target.value)}
        >
          <option value="">{t('filter_all_communities')}</option>
          {COMUNITATS.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder={t('filter_search')}
          value={cerca}
          onChange={e => setCerca(e.target.value)}
        />

        <select
          className="sort-select"
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
        >
          <option value="vivendes_desc">{t('stats_housing')} ^</option>
          <option value="vivendes_asc">{t('stats_housing')} v</option>
          <option value="provincia">{t('stats_province')} A-Z</option>
          <option value="comunitat">{t('stats_community')} A-Z</option>
          <option value="total_desc">{t('stats_total_properties')} ^</option>
        </select>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <p>{t('list_empty')}</p>
        </div>
      ) : (
        <div className="provincies-grid">
          {sorted.map((p, i) => (
            <Link
              key={p.codi_provincia}
              to={'/provincia/' + p.codi_provincia}
              className="provincia-card"
            >
              <div className="card-header">
                <span className="card-rank">#{i + 1}</span>
                <span className="card-title">{p.provincia}</span>
              </div>
              <div className="card-stats">
                <div className="card-stat-main">
                  <span className="stat-number">{formatNum(p.finques_vivendes)}</span>
                  <span className="stat-label">{t('stats_housing_short')}</span>
                </div>
                <div className="card-stat-secondary">
                  <span>{formatNum(p.total_finques)} {t('stats_total_short')}</span>
                </div>
              </div>
              <div className="card-bar">
                <div className="bar-bg">
                  <div
                    className="bar-fill"
                    style={{ width: (p.finques_vivendes / maxVivendes * 100) + '%' }}
                  />
                </div>
              </div>
              <div className="card-meta">
                <span>{p.comunitat_autonoma}</span>
                <span>{t('view_details')}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="stats-source" style={{ marginTop: '2rem' }}>
        <p>
          {t('stats_source_label')}: <a href="https://www.ine.es/jaxiT3/Tabla.htm?t=10743" target="_blank" rel="noopener noreferrer">INE — Instituto Nacional de Estadistica</a>
          {' \u00b7 '}
          {t('stats_license')}: CC BY-SA 4.0
        </p>
      </div>
    </div>
  )
}
