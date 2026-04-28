import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Popup, Marker, useMap, ZoomControl } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
// @ts-ignore - cluster css
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
// @ts-ignore - cluster default css
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'
import { Link } from 'react-router-dom'
import type { MapPointCas } from '../api'
import { getCasosMap } from '../api'
import { useTranslation } from '../i18n/LanguageContext'

// Custom marker icons for individual cases
const caseIconProgramat = L.divIcon({
  className: 'case-marker programat',
  html: '<div class="case-marker-dot programat"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
})

const caseIconImminent = L.divIcon({
  className: 'case-marker imminent',
  html: '<div class="case-marker-dot imminent"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

const caseIconExecutat = L.divIcon({
  className: 'case-marker executat',
  html: '<div class="case-marker-dot executat"></div>',
  iconSize: [8, 8],
  iconAnchor: [4, 4],
})

type EstatFilter = 'tots' | 'imminent' | 'programat'

/** Custom cluster icon — circle with count */
function createClusterIcon(cluster: any) {
  const count = cluster.getChildCount()
  let size = 40
  let className = 'cluster-icon cluster-sm'
  if (count >= 50) {
    size = 56
    className = 'cluster-icon cluster-lg'
  } else if (count >= 10) {
    size = 48
    className = 'cluster-icon cluster-md'
  }
  return L.divIcon({
    html: `<div class="${className}"><span>${count}</span></div>`,
    className: 'custom-cluster-wrapper',
    iconSize: L.point(size, size),
  })
}

/** Fly to bounds when the user clicks a hotspot */
function FlyController({ target }: { target: L.LatLngBounds | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyToBounds(target, { maxZoom: 10, duration: 0.8 })
  }, [target, map])
  return null
}

type PanelState = 'expanded' | 'minimized'

export default function MapaPage() {
  const [cases, setCases] = useState<MapPointCas[]>([])
  const [omesos, setOmesos] = useState(0)
  const [loading, setLoading] = useState(true)
  const [casesLoading, setCasesLoading] = useState(false)
  const [estatFilter, setEstatFilter] = useState<EstatFilter>('tots')
  const [flyTarget, setFlyTarget] = useState<L.LatLngBounds | null>(null)
  const [panelState, setPanelState] = useState<PanelState>('expanded')
  const { t } = useTranslation()
  const lastFetchKey = useRef('')

  // Fetch ALL geocoded cases (historic=1 to include past dates)
  const fetchCases = useCallback(() => {
    const params: Record<string, string> = { limit: '50000', historic: '1' }
    if (estatFilter !== 'tots') params.estat = estatFilter

    const key = JSON.stringify(params)
    if (key === lastFetchKey.current) return
    lastFetchKey.current = key

    setCasesLoading(true)
    getCasosMap(params)
      .then(res => {
        if (res.ok && res.data) {
          setCases(res.data)
          setOmesos(res.omesos ?? 0)
        }
      })
      .catch(console.error)
      .finally(() => { setCasesLoading(false); setLoading(false) })
  }, [estatFilter])

  useEffect(() => {
    lastFetchKey.current = ''
    fetchCases()
  }, [fetchCases])

  // Derived: group real cases by province for ranking
  const provinciaStats = useMemo(() => {
    const map = new Map<string, { count: number; lat: number; lng: number }>()
    for (const c of cases) {
      const key = c.provincia || 'Desconegut'
      const prev = map.get(key)
      if (prev) {
        prev.count++
      } else {
        map.set(key, { count: 1, lat: c.latitud, lng: c.longitud })
      }
    }
    return [...map.entries()]
      .map(([prov, d]) => ({ provincia: prov, count: d.count, lat: d.lat, lng: d.lng }))
      .sort((a, b) => b.count - a.count)
  }, [cases])

  function estatLabel(estat: string): string {
    const m: Record<string, string> = {
      imminent: t('estat_imminent'),
      programat: t('estat_programat'),
      executat: t('estat_executat'),
      'suspès': t('estat_suspes'),
      cancelat: t('estat_cancelat'),
    }
    return m[estat] || estat
  }

  function getMarkerIcon(c: MapPointCas) {
    if (c.estat === 'imminent') return caseIconImminent
    if (c.estat === 'programat') return caseIconProgramat
    return caseIconExecutat
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span>{t('map_loading')}</span>
      </div>
    )
  }

  const panelClass = `mapa-overlay mapa-overlay--${panelState}`

  return (
    <div className="mapa-page">
      <div className="mapa-container">
        <MapContainer
          center={[40.0, -3.5]}
          zoom={6}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FlyController target={flyTarget} />
          <ZoomControl position="bottomright" />

          {/* ---- Real individual cases with clustering ---- */}
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={45}
            zoomToBoundsOnClick={true}
            spiderfyOnMaxZoom={false}
            showCoverageOnHover={false}
            iconCreateFunction={createClusterIcon}
            removeOutsideVisibleBounds={true}
          >
            {cases.map(c => {
              const streetParts: string[] = []
              if (c.tipus_via && c.nom_via) {
                const abrev: Record<string, string> = {
                  'Calle': 'C/', 'Avenida': 'Av.', 'Paseo': 'P.º', 'Plaza': 'Pl.',
                  'Carrer': 'C/', 'Avinguda': 'Av.', 'Passeig': 'Pg.', 'Plaça': 'Pl.',
                  'Rúa': 'Rúa', 'Travesía': 'Trav.', 'Camino': 'Cam.', 'Carretera': 'Ctra.',
                  'Ronda': 'Rda.', 'Urbanización': 'Urb.', 'Partida': 'Ptda.',
                }
                streetParts.push(`${abrev[c.tipus_via] || c.tipus_via} ${c.nom_via}`)
              } else if (c.nom_via) {
                streetParts.push(c.nom_via)
              }
              if (c.numero) streetParts.push(c.numero)
              if (c.bloc) streetParts.push(`Bl. ${c.bloc}`)
              if (c.escala) streetParts.push(`Esc. ${c.escala}`)
              if (c.pis && c.porta) streetParts.push(`${c.pis} ${c.porta}`)
              else if (c.pis) streetParts.push(c.pis)
              else if (c.porta) streetParts.push(c.porta)
              const street = streetParts.join(', ')

              const ciutat = c.ciutat
                ? c.ciutat.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
                : ''
              const cityParts: string[] = []
              if (c.codi_postal) cityParts.push(c.codi_postal)
              if (ciutat) cityParts.push(ciutat)
              if (c.provincia && c.provincia !== ciutat) cityParts.push(c.provincia)
              const cityLine = cityParts.join(', ')

              const addressLine1 = street || c.adreca_original || ''
              const addressLine2 = cityLine

              const dp = c.data_desnonament?.split('-')
              const mesos = ['gen', 'feb', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'des']
              const dateStr = dp && dp.length === 3
                ? `${parseInt(dp[2])} ${mesos[parseInt(dp[1]) - 1]} ${dp[0]}`
                : c.data_desnonament

              return (
              <Marker
                key={c.id}
                position={[c.latitud, c.longitud]}
                icon={getMarkerIcon(c)}
              >
                <Popup maxWidth={280} minWidth={200} className="mobile-popup">
                  <div className="map-popup rich">
                    <div className="popup-top-row">
                      <span className={`popup-estat-badge ${c.estat}`}>{estatLabel(c.estat)}</span>
                      <span className="popup-date">{dateStr}{c.hora_desnonament ? ` · ${c.hora_desnonament}h` : ''}</span>
                    </div>
                    <div className="popup-address-full">
                      <div className="popup-address-street">{addressLine1}</div>
                      {addressLine2 && <div className="popup-address-city">{addressLine2}</div>}
                    </div>
                    {c.tipus_procediment && (
                      <div className="popup-detail-row">
                        <span className="popup-detail-icon">{'\u2696\uFE0F'}</span>
                        <span>{t(`popup_motiu_${c.tipus_procediment}` as any) || c.tipus_procediment}</span>
                      </div>
                    )}
                    {c.vivenda_habitual === 1 && (
                      <div className="popup-detail-row">
                        <span className="popup-detail-icon">{'\uD83C\uDFE0'}</span>
                        <span>{t('popup_residencia_habitual')}</span>
                      </div>
                    )}
                    {c.jutjat && (
                      <div className="popup-detail-row">
                        <span className="popup-detail-icon">{'\uD83C\uDFDB\uFE0F'}</span>
                        <span className="popup-jutjat-text">{c.jutjat}</span>
                      </div>
                    )}
                    <div className="popup-actions">
                      <Link to={'/cas/' + c.id} className="popup-link-btn">
                        {t('view_details')}
                      </Link>
                    </div>
                  </div>
                </Popup>
              </Marker>
              )
            })}
          </MarkerClusterGroup>
        </MapContainer>

        {/* Loading indicator */}
        {casesLoading && (
          <div className="map-loading-indicator">
            <div className="spinner-sm" />
          </div>
        )}
      </div>

      {/* Stats overlay — desktop: side panel, mobile: bottom sheet */}
      <div className={panelClass}>
        {/* Minimized: a pill-style button to reopen the full panel (desktop + mobile) */}
        <button
          type="button"
          className="panel-mini-bar"
          onClick={() => setPanelState('expanded')}
          aria-label={t('popup_toggle_panel')}
        >
          <span className="mini-bar-icon" aria-hidden="true">📊</span>
          <span className="mini-bar-content">
            <span className="mini-bar-title">{t('map_title')}</span>
            <span className="mini-bar-meta">
              <span className="mini-bar-count">{cases.length.toLocaleString()}</span>
              <span className="mini-bar-label">{t('map_visible_cases')}</span>
            </span>
          </span>
          <svg className="mini-bar-expand" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>

        {/* Full panel content */}
        <div className="stats-panel">
          <div className="stats-panel-header">
            <h2>{t('map_title')}</h2>
            <button
              type="button"
              className="panel-minimize-btn"
              onClick={() => setPanelState('minimized')}
              title={t('popup_hide_panel')}
              aria-label={t('popup_hide_panel')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
          </div>

          {/* Estat filter */}
          <div className="map-estat-filter">
            <button
              className={estatFilter === 'tots' ? 'active' : ''}
              onClick={() => setEstatFilter('tots')}
            >
              {t('filter_all')}
            </button>
            <button
              className={estatFilter === 'imminent' ? 'active imminent' : ''}
              onClick={() => setEstatFilter('imminent')}
            >
              {t('estat_imminent')}
            </button>
            <button
              className={estatFilter === 'programat' ? 'active programat' : ''}
              onClick={() => setEstatFilter('programat')}
            >
              {t('estat_programat')}
            </button>
          </div>

          <div className="map-case-count">
            <span className="map-case-number">{cases.length.toLocaleString()}</span>
            <span className="map-case-label">{t('map_visible_cases')}</span>
          </div>

          {omesos > 0 && (
            <div className="map-omesos-note" title={t('map_omesos_tooltip')}>
              <span className="map-omesos-icon" aria-hidden="true">ⓘ</span>
              <span>
                {t('map_omesos_prefix')}{' '}
                <strong>{omesos.toLocaleString()}</strong>{' '}
                {t('map_omesos_suffix')}
              </span>
            </div>
          )}

          {/* Top 5 hotspots by real BOE cases */}
          {provinciaStats.length > 0 && (
            <div className="overlay-ranking">
              <h3>{t('map_hotspots')}</h3>
              {provinciaStats.slice(0, 5).map((p, i) => (
                <button
                  key={p.provincia}
                  className="overlay-rank-item"
                  onClick={() =>
                    setFlyTarget(
                      L.latLngBounds(
                        [p.lat - 0.5, p.lng - 0.8],
                        [p.lat + 0.5, p.lng + 0.8],
                      ),
                    )
                  }
                >
                  <span className="overlay-rank-num">{i + 1}</span>
                  <span className="overlay-rank-name">{p.provincia}</span>
                  <span className="overlay-rank-val">{p.count.toLocaleString()}</span>
                </button>
              ))}
            </div>
          )}

          <Link to="/estadistiques" className="overlay-cta">
            {t('stats_see_all')}
          </Link>
        </div>
      </div>
    </div>
  )
}
