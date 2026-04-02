import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getCasDetall } from '../api'
import type { Desnonament } from '../api'
import { useTranslation } from '../i18n/LanguageContext'

const caseIconBig = L.divIcon({
  className: 'case-marker-detail',
  html: '<div class="case-marker-dot-big"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

/* ── Helpers ─────────────────────────────────────────────────── */

/** Build a readable address from normalized fields */
function buildAdreca(cas: Desnonament): string {
  const parts: string[] = []
  const abrev: Record<string, string> = {
    'Calle': 'C/', 'Avenida': 'Av.', 'Paseo': 'P.º', 'Plaza': 'Pl.',
    'Carrer': 'C/', 'Avinguda': 'Av.', 'Passeig': 'Pg.', 'Plaça': 'Pl.',
    'Rúa': 'Rúa', 'Travesía': 'Trav.', 'Camino': 'Cam.', 'Carretera': 'Ctra.',
    'Ronda': 'Rda.', 'Urbanización': 'Urb.', 'Partida': 'Ptda.', 'Terreno': 'Terreno',
  }
  if (cas.tipus_via && cas.nom_via) {
    parts.push(`${abrev[cas.tipus_via] || cas.tipus_via} ${cas.nom_via}`)
  } else if (cas.nom_via) {
    parts.push(cas.nom_via)
  }
  if (cas.numero) parts.push(cas.numero)
  if ((cas as any).bloc) parts.push(`Bl. ${(cas as any).bloc}`)
  if ((cas as any).escala) parts.push(`Esc. ${(cas as any).escala}`)
  if (cas.pis && cas.porta) parts.push(`${cas.pis} ${cas.porta}`)
  else if (cas.pis) parts.push(cas.pis)
  else if (cas.porta) parts.push(cas.porta)
  return parts.join(', ') || cas.adreca_original || ''
}

/** Extract city from jutjat_adreca like "PZ MOSSEN JOAN CASSENY 4 10 ; 25530 VIELHA" → "Vielha" */
function extractJutjatCity(adreca: string | null): string | null {
  if (!adreca) return null
  const afterSemicolon = adreca.split(';').pop()?.trim()
  if (!afterSemicolon) return null
  // Format: "25530 VIELHA" — skip the CP (digits)
  const city = afterSemicolon.replace(/^\d{4,5}\s*/, '').trim()
  if (!city) return null
  return city.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

/** Capitalize city name properly */
function capitalize(s: string | null): string {
  if (!s) return ''
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

/** Format date as "30 de març de 2026" style */
function formatDateLong(dateStr: string, lang: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    const locale = lang === 'ca' ? 'ca-ES' : lang === 'eu' ? 'eu-ES' : lang === 'gl' ? 'gl-ES' : 'es-ES'
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return dateStr
  }
}

/** Days until/since a date */
function daysFrom(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

/** Human-readable tipus subhasta */
function tipusSubhastaHuman(tipus: string, t: (k: any) => string): string {
  const lower = tipus.toLowerCase()
  if (lower.includes('judicial') && lower.includes('apremio'))
    return t('detail_motiu_judicial_apremio')
  if (lower.includes('notarial') || lower.includes('extrajudicial'))
    return t('detail_motiu_notarial')
  if (lower.includes('voluntari'))
    return t('detail_motiu_voluntaria')
  if (lower.includes('concursal'))
    return t('detail_motiu_concursal')
  return tipus
}

/* ── Component ───────────────────────────────────────────────── */

export default function CasDetallPage() {
  const { id } = useParams<{ id: string }>()
  const [cas, setCas] = useState<Desnonament | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { t, lang } = useTranslation()

  useEffect(() => {
    if (!id) return
    getCasDetall(id)
      .then(res => {
        if (res.ok && res.data) {
          setCas(res.data)
        } else {
          setError('Cas no trobat')
        }
      })
      .catch(() => setError('Error carregant el cas'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span>{t('loading')}</span>
      </div>
    )
  }

  if (error || !cas) {
    return (
      <div className="stats-page">
        <Link to="/estadistiques" className="back-link">{t('back_to_cases')}</Link>
        <div className="empty-state"><p>{error || 'Cas no trobat'}</p></div>
      </div>
    )
  }

  const estatLabels: Record<string, string> = {
    'imminent': t('estat_imminent'),
    'programat': t('estat_programat'),
    'executat': t('estat_executat'),
    'suspès': t('estat_suspes'),
    'cancelat': t('estat_cancelat'),
  }
  const estatDescriptions: Record<string, string> = {
    'programat': t('detail_estat_programat_desc'),
    'imminent': t('detail_estat_imminent_desc'),
    'executat': t('detail_estat_executat_desc'),
    'suspès': t('detail_estat_suspes_desc'),
    'cancelat': t('detail_estat_cancelat_desc'),
  }

  const days = daysFrom(cas.data_desnonament)
  const adrecaText = buildAdreca(cas)
  const jutjatCity = extractJutjatCity(cas.jutjat_adreca)
  const ciutatDisplay = capitalize(cas.localitat)

  // Build full address line like Google Maps: "C/ San Martin, 3, 25598 Uña, Lleida"
  const cityParts: string[] = []
  if (cas.codi_postal) cityParts.push(cas.codi_postal)
  if (ciutatDisplay) cityParts.push(ciutatDisplay)
  if (cas.provincia && cas.provincia !== ciutatDisplay) cityParts.push(cas.provincia)
  const cityLine = cityParts.join(', ')
  const fullAddress = [adrecaText, cityLine].filter(Boolean).join(', ')

  const boeAnunciUrl = cas.num_procediment?.startsWith('BOE-')
    ? `https://www.boe.es/diario_boe/txt.php?id=${cas.num_procediment}`
    : null

  const geocodatLabel = cas.geocodat === 1 ? 'Cadastre' : cas.geocodat === 2 ? 'Nominatim' : null

  return (
    <div className="stats-page">
      <Link to="/estadistiques" className="back-link">{t('back_to_cases')}</Link>

      {/* Hero card */}
      <div className="cas-detail-hero">
        <div className="cas-detail-estat">
          <div className="estat-badge-wrapper">
            <span className={`cas-estat big ${cas.estat}`}>{estatLabels[cas.estat] || cas.estat}</span>
            <span className="estat-tooltip">
              {estatDescriptions[cas.estat] || ''}
              {cas.estat === 'programat' && cas.data_desnonament && (
                <> — {formatDateLong(cas.data_desnonament, lang)}</>
              )}
            </span>
          </div>
          {days >= 0 && cas.estat !== 'executat' && cas.estat !== 'cancelat' && (
            <span className={`days-badge ${days <= 7 ? 'urgent' : days <= 30 ? 'soon' : ''}`}>
              {days === 0 ? t('detail_today') : days === 1 ? t('detail_tomorrow') : t('detail_in_days').replace('{n}', String(days))}
            </span>
          )}
          {days < 0 && cas.estat === 'programat' && (
            <span className="days-badge past">
              {t('detail_days_ago').replace('{n}', String(Math.abs(days)))}
            </span>
          )}
        </div>
        <h2>{fullAddress}</h2>
        <div className="cas-detail-location">
          <span>{cas.comunitat_autonoma}</span>
        </div>
      </div>

      {/* Data card */}
      <div className="cas-detail-section cas-detail-date-section">
        <div className="date-header">
          <h3>📅 {t('detail_date_subhasta')}</h3>
          <span className="date-big">{formatDateLong(cas.data_desnonament, lang)}</span>
          {cas.hora_desnonament && <span className="date-hora">🕐 {cas.hora_desnonament}</span>}
        </div>
        <p className="date-explanation">{t('detail_date_explanation')}</p>
      </div>

      {/* Key info grid */}
      <div className="cas-detail-grid">
        {/* Jutjat */}
        <div className="cas-detail-item">
          <label>⚖️ {t('casos_jutjat')}</label>
          {cas.jutjat ? (
            <div className="jutjat-info">
              <span className="jutjat-nom">{cas.jutjat}</span>
              {jutjatCity && <span className="jutjat-ciutat-dest">📍 {jutjatCity}</span>}
              {cas.jutjat_adreca && <span className="jutjat-adreca">{cas.jutjat_adreca}</span>}
              {cas.jutjat_telefon && <span className="jutjat-contacte">📞 {cas.jutjat_telefon}</span>}
              {cas.jutjat_email && <span className="jutjat-contacte">✉️ {cas.jutjat_email}</span>}
            </div>
          ) : (
            <span className="no-data">{t('detail_no_data')}</span>
          )}
        </div>

        {/* Procediment */}
        <div className="cas-detail-item">
          <label>📋 {t('casos_procediment')}</label>
          {cas.num_procediment ? (
            <div className="proc-info">
              <span className="proc-label">{t('detail_boe_ref')}</span>
              {boeAnunciUrl ? (
                <a href={boeAnunciUrl} target="_blank" rel="noopener noreferrer" className="proc-link">
                  {cas.num_procediment} ↗
                </a>
              ) : (
                <span>{cas.num_procediment}</span>
              )}
              {cas.expedient && (
                <>
                  <span className="proc-label">{t('detail_expedient')}</span>
                  <span className="proc-exp">{cas.expedient}</span>
                </>
              )}
            </div>
          ) : (
            <span className="no-data">{t('detail_no_data')}</span>
          )}
        </div>

        {/* Tipus de bé */}
        <div className="cas-detail-item">
          <label>🏠 {t('detail_tipus_subhasta')}</label>
          <span>{cas.tipus_be ? t(`tipus_be_${cas.tipus_be.toLowerCase().replace(/\s+/g, '_')}` as any) || cas.tipus_be : t('detail_no_data')}</span>
          {cas.vivenda_habitual === 1 && <span className="tag-habitual">{t('detail_habitatge_habitual')}</span>}
        </div>

        {/* Referència cadastral */}
        <div className="cas-detail-item">
          <label>🗺️ {t('detail_ref_cadastral')}</label>
          {cas.ref_catastral ? (
            <a
              href={`https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCBusqueda.aspx?RC1=${cas.ref_catastral.substring(0,7)}&RC2=${cas.ref_catastral.substring(7,14)}`}
              target="_blank" rel="noopener noreferrer" className="proc-link"
            >
              {cas.ref_catastral} ↗
            </a>
          ) : (
            <span className="no-data">{t('detail_no_data')}</span>
          )}
        </div>
      </div>

      {/* Tipus subhasta */}
      <div className="cas-detail-section cas-detail-motiu">
        <h3>⚠️ {t('detail_motiu_title')}</h3>
        {cas.tipus_subhasta ? (
          <div className="motiu-content">
            <span className="motiu-type">{tipusSubhastaHuman(cas.tipus_subhasta, t)}</span>
            <p className="motiu-explanation">{t('detail_motiu_explanation')}</p>
            {cas.boe_id && (
              <span className="motiu-ref">
                {t('detail_ref')}: <a href={`https://subastas.boe.es/detalleSubasta.php?idSub=${cas.boe_id}`} target="_blank" rel="noopener noreferrer">{cas.boe_id} ↗</a>
              </span>
            )}
          </div>
        ) : (
          <span className="no-data">{t('detail_no_data')}</span>
        )}
      </div>

      {/* Informació financera */}
      <div className="cas-detail-section">
        <h3>💰 {t('detail_info_financera')}</h3>
        {cas.quantitat_reclamada || cas.valor_subhasta ? (
          <div className="financial-grid">
            {cas.quantitat_reclamada && (
              <div className="financial-item">
                <label>{t('detail_quantitat_reclamada')}</label>
                <span className="financial-value">{cas.quantitat_reclamada}</span>
                <p className="financial-help">{t('detail_quantitat_help')}</p>
              </div>
            )}
            {cas.valor_subhasta && (
              <div className="financial-item">
                <label>{t('detail_valor_subhasta')}</label>
                <span className="financial-value">{cas.valor_subhasta}</span>
                <p className="financial-help">{t('detail_valor_help')}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="no-data">{t('detail_no_financial')}</p>
        )}
        {cas.descripcio && <p className="desc-extra">{cas.descripcio}</p>}
      </div>

      {/* Map */}
      {cas.latitud && cas.longitud ? (
        <div className="cas-detail-map">
          <MapContainer
            center={[cas.latitud, cas.longitud]}
            zoom={17}
            style={{ height: '350px', width: '100%', borderRadius: '12px' }}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[cas.latitud, cas.longitud]} icon={caseIconBig}>
              <Popup>
                <div className="map-popup">
                  <h3>{cas.localitat}</h3>
                  <p>{adrecaText}</p>
                </div>
              </Popup>
            </Marker>
          </MapContainer>
          {geocodatLabel && <p className="map-approx-note">📍 {geocodatLabel === 'Cadastre' ? t('detail_map_exact') || 'Ubicació exacta (Cadastre)' : t('detail_map_approx')}</p>}
        </div>
      ) : (
        <div className="cas-detail-map">
          <p className="no-data">📍 {t('detail_no_geocode')}</p>
        </div>
      )}

      {/* Source */}
      <div className="cas-detail-source">
        <h3>🔗 {t('case_source')}</h3>
        <p>{cas.font_oficial}</p>
        <div className="cas-detail-links">
          {cas.url_font && (
            <a href={cas.url_font} target="_blank" rel="noopener noreferrer" className="source-link">
              📄 Portal de Subastas BOE
            </a>
          )}
          {cas.document_url && cas.document_url.includes('boe.es') && (
            <a href={cas.document_url} target="_blank" rel="noopener noreferrer" className="source-link source-link-secondary">
              📜 {t('detail_boe_anunci')}
            </a>
          )}
        </div>
        <p className="cas-detail-disclaimer">
          {t('casos_source_note')}
        </p>
      </div>
    </div>
  )
}
