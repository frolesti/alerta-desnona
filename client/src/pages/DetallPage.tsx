import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { getINEProvincia } from '../api'
import type { ProvinciaDetall, TendenciaINE } from '../api'
import { useTranslation } from '../i18n/LanguageContext'

function formatNum(n: number): string {
  return n.toLocaleString('ca-ES')
}

export default function DetallPage() {
  const { codi } = useParams<{ codi: string }>()
  const { t } = useTranslation()
  const [data, setData] = useState<ProvinciaDetall | null>(null)
  const [tendencia, setTendencia] = useState<TendenciaINE[]>([])
  const [fontCom, setFontCom] = useState<{ nom: string; url: string } | null>(null)
  const [urlTeju, setUrlTeju] = useState('')
  const [urlFont, setUrlFont] = useState('')
  const [any, setAny] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!codi) return
    getINEProvincia(codi)
      .then(res => {
        if (res.ok && res.data) {
          setData(res.data)
          setTendencia(res.tendencia || [])
          setFontCom(res.font_comunitaria || null)
          setUrlTeju(res.url_teju || '')
          setUrlFont(res.url_font || '')
          setAny(res.any || null)
        } else {
          setError(res.error || t('detail_not_found'))
        }
      })
      .catch(() => setError(t('detail_error')))
      .finally(() => setLoading(false))
  }, [codi])

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span>{t('detail_loading')}</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="detall-page">
        <Link to="/estadistiques" className="back-link">{t('back_to_stats')}</Link>
        <div className="empty-state">
          <p>{error || t('detail_not_found')}</p>
        </div>
      </div>
    )
  }

  const d = data
  const maxTend = Math.max(...tendencia.map(t => t.total_vivendes), 1)
  const sparkW = 400
  const sparkH = 100
  const sparkPoints = tendencia.map((t, i) => {
    const x = (i / Math.max(tendencia.length - 1, 1)) * sparkW
    const y = sparkH - (t.total_vivendes / maxTend) * (sparkH - 10) - 5
    return x + ',' + y
  }).join(' ')

  return (
    <div className="detall-page">
      <Link to="/estadistiques" className="back-link">{t('back_to_stats')}</Link>

      <div className="detall-card">
        <div className="detall-header">
          <h1 className="detall-title">{d.provincia}</h1>
          <span className="estat-badge programat">{d.comunitat_autonoma}</span>
        </div>

        <p className="card-desc" style={{ fontSize: '1.1rem', lineHeight: '1.8' }}>
          {t('stats_housing_foreclosures')} ({any}) — {t('prov_real_data_note')}
        </p>

        {/* Big numbers */}
        <div className="stats-hero" style={{ marginBottom: '2rem' }}>
          <div className="stats-hero-item">
            <div className="stats-hero-value">{formatNum(d.finques_vivendes)}</div>
            <div className="stats-hero-label">{t('stats_housing_short')}</div>
            <div className="stats-hero-year">{any}</div>
          </div>
          <div className="stats-hero-item">
            <div className="stats-hero-value">{formatNum(d.total_finques)}</div>
            <div className="stats-hero-label">{t('stats_total_short')}</div>
            <div className="stats-hero-year">{any}</div>
          </div>
          <div className="stats-hero-item">
            <div className={'stats-hero-value ' + (d.variacio_percentual > 0 ? 'up' : d.variacio_percentual < 0 ? 'down' : '')}>
              {d.variacio_percentual > 0 ? '\u25b2' : d.variacio_percentual < 0 ? '\u25bc' : '\u2013'} {Math.abs(d.variacio_percentual)}%
            </div>
            <div className="stats-hero-label">{t('stats_variation')}</div>
            <div className="stats-hero-year">{t('prov_vs_previous')}</div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="detall-section">
          <h3>{t('prov_breakdown_title')}</h3>
          <div className="detall-grid">
            <div className="detall-field">
              <label>{t('stats_housing')}</label>
              <p><strong>{formatNum(d.finques_vivendes)}</strong></p>
            </div>
            <div className="detall-field">
              <label>{t('prov_solars')}</label>
              <p>{formatNum(d.finques_solars)}</p>
            </div>
            <div className="detall-field">
              <label>{t('prov_rustiques')}</label>
              <p>{formatNum(d.finques_rustiques)}</p>
            </div>
            <div className="detall-field">
              <label>{t('prov_altres')}</label>
              <p>{formatNum(d.finques_altres)}</p>
            </div>
            <div className="detall-field">
              <label>{t('prov_tipus_dada')}</label>
              <p>{d.tipus_dada}</p>
            </div>
            <div className="detall-field">
              <label>{t('stats_total_properties')}</label>
              <p><strong>{formatNum(d.total_finques)}</strong></p>
            </div>
          </div>
        </div>

        {/* Official sources - REAL links */}
        <div className="detall-section detall-document">
          <h3>{t('detail_doc_title')}</h3>
          <p className="document-note">
            {t('prov_sources_note')}
          </p>
          <div className="document-links">
            <a href={urlFont} target="_blank" rel="noopener noreferrer" className="document-link primary">
              <span className="doc-icon">{"\ud83d\udcca"}</span>
              <span>
                <strong>INE \u2014 Tabla 10743</strong>
                <small>{t('prov_ine_note')}</small>
              </span>
            </a>
            {urlTeju && (
              <a href={urlTeju} target="_blank" rel="noopener noreferrer" className="document-link secondary">
                <span className="doc-icon">\u2696\ufe0f</span>
                <span>
                  <strong>{t('detail_teju_label')}</strong>
                  <small>{t('detail_teju_note')}</small>
                </span>
              </a>
            )}
            {fontCom && (
              <a href={fontCom.url} target="_blank" rel="noopener noreferrer" className="document-link secondary">
                <span className="doc-icon">{"\ud83d\udcf0"}</span>
                <span>
                  <strong>{fontCom.nom}</strong>
                  <small>{t('detail_bulletin_label')}</small>
                </span>
              </a>
            )}
          </div>
        </div>

        {/* Historical trend */}
        {tendencia.length > 1 && (
          <div className="detall-section">
            <h3>{t('stats_historical')}</h3>
            <div style={{ padding: '1rem 0' }}>
              <svg width="100%" height={sparkH + 30} viewBox={'0 0 ' + sparkW + ' ' + (sparkH + 30)} className="sparkline provincia-spark">
                <polyline
                  points={sparkPoints}
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth="2.5"
                />
                {tendencia.map((t, i) => {
                  const x = (i / Math.max(tendencia.length - 1, 1)) * sparkW
                  const y = sparkH - (t.total_vivendes / maxTend) * (sparkH - 10) - 5
                  return (
                    <g key={t.any}>
                      <circle cx={x} cy={y} r="4" fill="var(--color-primary)" />
                      <text x={x} y={sparkH + 20} textAnchor="middle" fontSize="10" fill="var(--color-text-secondary)">
                        {t.any}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
            <div className="stats-table-container">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>{t('stats_year')}</th>
                    <th className="num">{t('stats_housing')}</th>
                    <th className="num">{t('stats_total_properties')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...tendencia].reverse().map(t => (
                    <tr key={t.any}>
                      <td><strong>{t.any}</strong></td>
                      <td className="num">{formatNum(t.total_vivendes)}</td>
                      <td className="num">{formatNum(t.total_finques)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Map */}
        {d.latitud && d.longitud && (
          <div className="detall-section">
            <h3>{t('detail_location_title')}</h3>
            <div className="detall-mini-map">
              <MapContainer
                center={[d.latitud, d.longitud]}
                zoom={8}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <CircleMarker
                  center={[d.latitud, d.longitud]}
                  radius={25}
                  pathOptions={{
                    color: '#ef4444',
                    fillColor: '#ef4444',
                    fillOpacity: 0.3,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <strong>{d.provincia}</strong><br />
                    {formatNum(d.finques_vivendes)} {t('stats_housing_short')}
                  </Popup>
                </CircleMarker>
              </MapContainer>
            </div>
          </div>
        )}

        {/* Source */}
        <div className="stats-source">
          <p>
            {t('stats_source_label')}: <a href={urlFont} target="_blank" rel="noopener noreferrer">INE \u2014 Instituto Nacional de Estadistica</a>
            {' \u00b7 '}
            {t('stats_license')}: CC BY-SA 4.0
          </p>
        </div>
      </div>
    </div>
  )
}
