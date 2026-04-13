import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getCGPJResum, getCGPJComunitats, getCGPJTendencia, getCGPJProvincies,
  getINEData, getCasos,
} from '../api'
import type {
  CGPJResum, CGPJComunitat, CGPJTendencia, CGPJProvincia, CGPJParcial,
  EstadisticaINE, CasIndividual,
} from '../api'
import { useTranslation } from '../i18n/LanguageContext'

function formatNum(n: number): string {
  return n.toLocaleString('ca-ES')
}

function pct(part: number, total: number): string {
  if (total === 0) return '0'
  return (part / total * 100).toFixed(1)
}

type Tab = 'casos' | 'resum' | 'provincies' | 'evolucio'

export default function EstadistiquesPage() {
  const { t } = useTranslation()

  // CGPJ primary data
  const [cgpjResum, setCgpjResum] = useState<CGPJResum | null>(null)
  const [cgpjAny, setCgpjAny] = useState<number | null>(null)
  const [cgpjAnyAnterior, setCgpjAnyAnterior] = useState<number | undefined>()
  const [cgpjComunitats, setCgpjComunitats] = useState<CGPJComunitat[]>([])
  const [cgpjTendencia, setCgpjTendencia] = useState<CGPJTendencia[]>([])
  const [cgpjProvincies, setCgpjProvincies] = useState<CGPJProvincia[]>([])
  const [cgpjFont, setCgpjFont] = useState('')
  const [cgpjUrlFont, setCgpjUrlFont] = useState('')
  const [cgpjParcial, setCgpjParcial] = useState<CGPJParcial | null>(null)

  // INE province list (for casos filter dropdown)
  const [provincies, setProvincies] = useState<EstadisticaINE[]>([])

  const [loading, setLoading] = useState(true)

  // Cases
  const [casos, setCasos] = useState<CasIndividual[]>([])
  const [casosTotal, setCasosTotal] = useState(0)
  const [casosPagina, setCasosPagina] = useState(1)
  const [casosLoading, setCasosLoading] = useState(false)
  const [casosEstat, setCasosEstat] = useState('')
  const [casosProv, setCasosProv] = useState('')
  const [casosCerca, setCasosCerca] = useState('')

  // Tab / filters
  const [tab, setTab] = useState<Tab>('casos')
  const [filterCom, setFilterCom] = useState('')
  const [cerca, setCerca] = useState('')

  useEffect(() => {
    Promise.all([
      getCGPJResum(),
      getCGPJComunitats(),
      getCGPJTendencia(),
      getCGPJProvincies(),
      getINEData(),
    ])
      .then(([resumRes, comRes, tendRes, provRes, ineRes]) => {
        if (resumRes.ok && resumRes.data) {
          setCgpjResum(resumRes.data)
          setCgpjAny(resumRes.any ?? null)
          setCgpjAnyAnterior(resumRes.any_anterior)
          setCgpjFont(resumRes.font ?? '')
          setCgpjUrlFont(resumRes.url_font ?? '')
          setCgpjParcial(resumRes.parcial ?? null)
        }
        if (comRes.ok && comRes.data) setCgpjComunitats(comRes.data)
        if (tendRes.ok && tendRes.data) setCgpjTendencia(tendRes.data)
        if (provRes.ok && provRes.data) setCgpjProvincies(provRes.data)
        if (ineRes.ok && ineRes.data) setProvincies(ineRes.data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Load cases when tab switched or filters change
  useEffect(() => {
    if (tab !== 'casos') return
    setCasosLoading(true)
    const params: Record<string, string> = {
      pagina: String(casosPagina),
      limit: '50',
      sort_by: 'data_desnonament',
      sort_dir: 'desc',
    }
    if (casosEstat) params.estat = casosEstat
    if (casosProv) params.provincia = casosProv
    if (casosCerca) params.cerca = casosCerca
    getCasos(params)
      .then(res => {
        if (res.ok && res.data) {
          if (casosPagina === 1) {
            setCasos(res.data)
          } else {
            setCasos(prev => [...prev, ...res.data])
          }
          setCasosTotal(res.total)
        }
      })
      .catch(console.error)
      .finally(() => setCasosLoading(false))
  }, [tab, casosPagina, casosEstat, casosProv, casosCerca])

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span>{t('loading')}</span>
      </div>
    )
  }

  if (!cgpjResum) {
    return (
      <div className="stats-page">
        <h1 className="page-title">{t('stats_title')}</h1>
        <div className="empty-state">
          <p>{t('stats_no_data')}</p>
        </div>
      </div>
    )
  }

  const r = cgpjResum
  const yoyChange = r.variacio_percentual
  const dailyAvg = r.daily_avg
  const maxComTotal = Math.max(...cgpjComunitats.map(c => c.lanzaments_total), 1)
  const maxProvTotal = Math.max(...cgpjProvincies.map(p => p.lanzaments_total), 1)
  const maxTendVal = Math.max(...cgpjTendencia.map(td => td.total), 1)

  // Stacked chart
  const chartW = 700
  const chartH = 260
  const chartPad = { top: 20, right: 20, bottom: 35, left: 55 }
  const plotW = chartW - chartPad.left - chartPad.right
  const plotH = chartH - chartPad.top - chartPad.bottom

  // Total line chart points
  const chartPoints = cgpjTendencia.map((td, i) => {
    const x = chartPad.left + (i / Math.max(cgpjTendencia.length - 1, 1)) * plotW
    const y = chartPad.top + plotH - (td.total / maxTendVal) * plotH
    return { x, y, ...td }
  })
  const areaPath = chartPoints.length > 0
    ? `M ${chartPoints.map(p => `${p.x},${p.y}`).join(' L ')} L ${chartPoints[chartPoints.length - 1].x},${chartPad.top + plotH} L ${chartPoints[0].x},${chartPad.top + plotH} Z`
    : ''

  // Province filtering
  let filteredProv = cgpjProvincies as CGPJProvincia[]
  if (filterCom) {
    // Match by province name prefix in comunitat
    // CGPJ provinces don't have comunitat field, so we use INE data for mapping
    const comProvs = new Set(provincies.filter(p => p.comunitat_autonoma === filterCom).map(p => p.provincia))
    filteredProv = filteredProv.filter(p => comProvs.has(p.provincia))
  }
  if (cerca) {
    const q = cerca.toLowerCase()
    filteredProv = filteredProv.filter(p => p.provincia.toLowerCase().includes(q))
  }
  const sortedProv = [...filteredProv].sort((a, b) => b.lanzaments_total - a.lanzaments_total)

  // Unique communities for filter
  const allComs = [...new Set(provincies.map(p => p.comunitat_autonoma))].sort()

  // Breakdown bar widths (for hero)
  const hipPct = pct(r.hipotecaria, r.total)
  const lauPct = pct(r.lau, r.total)
  const altPct = pct(r.altres, r.total)

  return (
    <div className="stats-page">
      <h1 className="page-title">{t('stats_title')}</h1>
      <p className="page-subtitle">{t('stats_subtitle')}</p>

      {/* Hero stats — CGPJ lanzamientos */}
      <div className="stats-hero">
        <div className="stats-hero-item hero-main">
          <div className="stats-hero-value">{formatNum(r.total)}</div>
          <div className="stats-hero-label">{t('stats_evictions_executed')}</div>
          <div className="stats-hero-year">{cgpjAny}</div>
        </div>
        <div className="stats-hero-item">
          {yoyChange !== null ? (
            <>
              <div className={`stats-hero-value ${yoyChange > 0 ? 'up' : yoyChange < 0 ? 'down' : ''}`}>
                {yoyChange > 0 ? '\u25B2' : yoyChange < 0 ? '\u25BC' : ''} {Math.abs(Math.round(yoyChange * 10) / 10)}%
              </div>
              <div className="stats-hero-label">{t('stats_yoy_label')}</div>
              <div className="stats-hero-year">{cgpjAnyAnterior} → {cgpjAny}</div>
            </>
          ) : (
            <>
              <div className="stats-hero-value">{formatNum(r.ocupacio)}</div>
              <div className="stats-hero-label">{t('cgpj_ocupacio')}</div>
              <div className="stats-hero-year">{cgpjAny}</div>
            </>
          )}
        </div>
        <div className="stats-hero-item">
          {dailyAvg > 0 ? (
            <>
              <div className="stats-hero-value">~{dailyAvg}</div>
              <div className="stats-hero-label">{t('stats_daily_avg')}</div>
              <div className="stats-hero-year">{t('stats_daily_avg_note')}</div>
            </>
          ) : (
            <div className="stats-hero-label">{t('stats_no_data')}</div>
          )}
        </div>
      </div>

      {/* Partial year notice */}
      {cgpjParcial && (
        <div className="stats-parcial-notice">
          <strong>{cgpjParcial.any} ({t('stats_partial')}):</strong>{' '}
          {formatNum(cgpjParcial.total)} {t('stats_evictions_executed').toLowerCase()}
          {' — '}{t('cgpj_lau_short')}: {formatNum(cgpjParcial.lau)},
          {' '}{t('cgpj_hip_short')}: {formatNum(cgpjParcial.hipotecaria)},
          {' '}{t('cgpj_altres')}: {formatNum(cgpjParcial.altres)}
        </div>
      )}

      {/* Breakdown bar */}
      <div className="cgpj-breakdown">
        <div className="breakdown-bar">
          <div className="breakdown-segment seg-lau" style={{ width: `${lauPct}%` }} title={`LAU: ${formatNum(r.lau)} (${lauPct}%)`} />
          <div className="breakdown-segment seg-hip" style={{ width: `${hipPct}%` }} title={`${t('cgpj_hipotecari')}: ${formatNum(r.hipotecaria)} (${hipPct}%)`} />
          <div className="breakdown-segment seg-alt" style={{ width: `${altPct}%` }} title={`${t('cgpj_altres')}: ${formatNum(r.altres)} (${altPct}%)`} />
        </div>
        <div className="breakdown-legend">
          <span className="legend-item"><span className="legend-dot seg-lau" /> {t('cgpj_lau')} — {formatNum(r.lau)} ({lauPct}%)</span>
          <span className="legend-item"><span className="legend-dot seg-hip" /> {t('cgpj_hipotecari')} — {formatNum(r.hipotecaria)} ({hipPct}%)</span>
          <span className="legend-item"><span className="legend-dot seg-alt" /> {t('cgpj_altres')} — {formatNum(r.altres)} ({altPct}%)</span>
        </div>
      </div>

      {/* Data transparency note */}
      <div className="stats-data-note">
        <p>{t('stats_data_note')}</p>
      </div>

      {/* Tab navigation */}
      <div className="stats-tabs">
        <button className={tab === 'casos' ? 'active' : ''} onClick={() => { setTab('casos'); setCasosPagina(1); }}>
          {t('tab_casos')}
        </button>
        <button className={tab === 'resum' ? 'active' : ''} onClick={() => setTab('resum')}>
          {t('tab_resum')}
        </button>
        <button className={tab === 'provincies' ? 'active' : ''} onClick={() => setTab('provincies')}>
          {t('tab_provincies')}
        </button>
        <button className={tab === 'evolucio' ? 'active' : ''} onClick={() => setTab('evolucio')}>
          {t('tab_evolucio')}
        </button>
      </div>

      {/* TAB: Casos individuals */}
      {tab === 'casos' && (
        <>
          <div className="casos-header">
            <p className="casos-subtitle">{t('casos_subtitle')}</p>
            <div className="casos-summary">
              <span className="casos-total-badge">{casosTotal.toLocaleString('ca-ES')} {t('casos_total')}</span>
            </div>
          </div>

          <div className="casos-data-note">
            <p>{t('casos_data_note')}</p>
          </div>

          <div className="filtres-bar">
            <select value={casosEstat} onChange={e => { setCasosEstat(e.target.value); setCasosPagina(1); setCasos([]); }}>
              <option value="">{t('casos_filter_estat')}</option>
              <option value="imminent">{t('estat_imminent')}</option>
              <option value="programat">{t('estat_programat')}</option>
              <option value="executat">{t('estat_executat')}</option>
              <option value="suspès">{t('estat_suspes')}</option>
              <option value="cancelat">{t('estat_cancelat')}</option>
            </select>
            <select value={casosProv} onChange={e => { setCasosProv(e.target.value); setCasosPagina(1); setCasos([]); }}>
              <option value="">{t('casos_filter_totes')}</option>
              {[...new Set(provincies.map(p => p.provincia))].sort().map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder={t('filter_search')}
              value={casosCerca}
              onChange={e => { setCasosCerca(e.target.value); setCasosPagina(1); setCasos([]); }}
            />
          </div>

          {casos.length === 0 && !casosLoading ? (
            <div className="empty-state"><p>{t('list_empty')}</p></div>
          ) : (
            <div className="casos-list">
              {casos.map(cas => (
                <Link key={cas.id} to={'/cas/' + cas.id} className="cas-card">
                  <div className="cas-card-header">
                    <span className={`cas-estat ${cas.estat}`}>
                      {t(('estat_' + cas.estat.replace('è', 'e').replace('·', '')) as any)}
                    </span>
                    <span className="cas-data">{cas.data_desnonament}</span>
                  </div>
                  <div className="cas-card-body">
                    <div className="cas-location">
                      <strong>{cas.localitat}</strong>
                      <span>{cas.provincia} &middot; {cas.comunitat_autonoma}</span>
                    </div>
                    <div className="cas-address">{cas.adreca_original}</div>
                    <div className="cas-meta">
                      {cas.jutjat && <span className="cas-meta-item">{cas.jutjat}</span>}
                      {cas.tipus_be && <span className="cas-meta-item">{cas.tipus_be}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {casosLoading && (
            <div className="loading" style={{ padding: '2rem' }}>
              <div className="spinner" />
            </div>
          )}

          {casos.length < casosTotal && !casosLoading && (
            <div className="casos-load-more">
              <button onClick={() => setCasosPagina(p => p + 1)} className="btn-load-more">
                {t('casos_load_more')} ({t('casos_showing')} {casos.length} {t('casos_of')} {casosTotal.toLocaleString('ca-ES')})
              </button>
            </div>
          )}

          <div className="casos-source-note">
            <p>{t('casos_source_note')}</p>
          </div>
        </>
      )}

      {/* TAB: Resum — CGPJ community ranking */}
      {tab === 'resum' && (
        <div className="stats-table-container">
          <table className="stats-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('stats_community')}</th>
                <th className="num">{t('cgpj_total')}</th>
                <th className="num">{t('cgpj_lau')}</th>
                <th className="num">{t('cgpj_hipotecari')}</th>
                <th className="num">{t('cgpj_altres')}</th>
                <th className="num">{t('stats_variation')}</th>
                <th className="bar-col"></th>
              </tr>
            </thead>
            <tbody>
              {cgpjComunitats.map((c, i) => {
                const v = c.evolucio_percentual ?? 0
                return (
                  <tr key={c.comunitat_autonoma}>
                    <td className="rank">{i + 1}</td>
                    <td>{c.comunitat_autonoma}</td>
                    <td className="num">{formatNum(c.lanzaments_total)}</td>
                    <td className="num">{formatNum(c.lanzaments_lau)}</td>
                    <td className="num">{formatNum(c.lanzaments_hipotecaria)}</td>
                    <td className="num">{formatNum(c.lanzaments_altres)}</td>
                    <td className={`num ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`}>
                      {v > 0 ? '\u25B2' : v < 0 ? '\u25BC' : '\u2013'} {Math.abs(v)}%
                    </td>
                    <td className="bar-col">
                      <div className="bar-bg">
                        <div className="bar-fill" style={{ width: `${(c.lanzaments_total / maxComTotal) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB: Provincies — CGPJ province cards */}
      {tab === 'provincies' && (
        <>
          <div className="filtres-bar">
            <select value={filterCom} onChange={e => setFilterCom(e.target.value)}>
              <option value="">{t('filter_all_communities')}</option>
              {allComs.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text"
              placeholder={t('filter_search')}
              value={cerca}
              onChange={e => setCerca(e.target.value)}
            />
          </div>

          {sortedProv.length === 0 ? (
            <div className="empty-state"><p>{t('list_empty')}</p></div>
          ) : (
            <div className="provincies-grid">
              {sortedProv.map((p, i) => (
                <div key={p.provincia} className="provincia-card">
                  <div className="card-header">
                    <span className="card-rank">#{i + 1}</span>
                    <span className="card-title">{p.provincia}</span>
                  </div>
                  <div className="card-stats">
                    <div className="card-stat-main">
                      <span className="stat-number">{formatNum(p.lanzaments_total)}</span>
                      <span className="stat-label">{t('cgpj_lanzaments')}</span>
                    </div>
                    <div className="card-stat-breakdown">
                      <span className="breakdown-mini seg-lau">{t('cgpj_lau_short')}: {formatNum(p.lanzaments_lau)}</span>
                      <span className="breakdown-mini seg-hip">{t('cgpj_hip_short')}: {formatNum(p.lanzaments_hipotecaria)}</span>
                    </div>
                  </div>
                  <div className="card-bar">
                    <div className="bar-bg">
                      <div className="bar-fill" style={{ width: (p.lanzaments_total / maxProvTotal * 100) + '%' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB: Evolucio historica */}
      {tab === 'evolucio' && cgpjTendencia.length > 0 && (
        <>
          {/* Main chart */}
          <div className="chart-card">
            <h2>{t('stats_trend')}</h2>
            <div className="chart-scroll">
              <svg width="100%" height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="xMidYMid meet" className="trend-chart">
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map(frac => {
                  const y = chartPad.top + plotH - frac * plotH
                  const val = Math.round(frac * maxTendVal)
                  return (
                    <g key={frac}>
                      <line x1={chartPad.left} y1={y} x2={chartPad.left + plotW} y2={y}
                        stroke="var(--color-text-muted)" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.4" />
                      <text x={chartPad.left - 8} y={y + 4} textAnchor="end" fontSize="10"
                        fill="var(--color-text-secondary)">{formatNum(val)}</text>
                    </g>
                  )
                })}
                {/* Area fill */}
                <path d={areaPath} fill="var(--color-primary)" fillOpacity="0.1" />
                {/* Line */}
                <polyline
                  points={chartPoints.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinejoin="round"
                />
                {/* Points + labels */}
                {chartPoints.map(p => (
                  <g key={p.any}>
                    <circle cx={p.x} cy={p.y} r="5" fill="var(--color-primary)" />
                    <circle cx={p.x} cy={p.y} r="3" fill="var(--color-bg-card)" />
                    <text x={p.x} y={chartPad.top + plotH + 22} textAnchor="middle" fontSize="10"
                      fill="var(--color-text-secondary)">{p.any}</text>
                    <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize="9"
                      fill="var(--color-text)" fontWeight="600">{formatNum(p.total)}</text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          {/* Historical table with breakdown */}
          <div className="stats-table-container" style={{ marginTop: '1.5rem' }}>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>{t('stats_year')}</th>
                  <th className="num">{t('cgpj_total')}</th>
                  <th className="num">{t('cgpj_lau')}</th>
                  <th className="num">{t('cgpj_hipotecari')}</th>
                  <th className="num">{t('cgpj_altres')}</th>
                  <th className="num">{t('stats_variation')}</th>
                </tr>
              </thead>
              <tbody>
                {[...cgpjTendencia].reverse().map((td, i, arr) => {
                  const prev = arr[i + 1]
                  const variacio = prev ? ((td.total - prev.total) / prev.total) * 100 : 0
                  return (
                    <tr key={td.any} className={td.any === cgpjAny ? 'highlight-row' : ''}>
                      <td><strong>{td.any}</strong></td>
                      <td className="num">{formatNum(td.total)}</td>
                      <td className="num">{formatNum(td.lau)}</td>
                      <td className="num">{formatNum(td.hipotecaria)}</td>
                      <td className="num">{formatNum(td.altres)}</td>
                      <td className={`num ${variacio > 0 ? 'up' : variacio < 0 ? 'down' : ''}`}>
                        {prev ? `${variacio > 0 ? '\u25B2' : variacio < 0 ? '\u25BC' : '\u2013'} ${Math.abs(Math.round(variacio * 10) / 10)}%` : '\u2013'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Community rankings in evolucio tab */}
          {cgpjComunitats.length > 0 && (
            <div className="stats-section">
              <h2>{t('stats_by_community')} ({cgpjAny})</h2>
              <div className="stats-table-container">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('stats_community')}</th>
                      <th className="num">{t('cgpj_total')}</th>
                      <th className="num">{t('stats_variation')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cgpjComunitats.map((c, i) => {
                      const v = c.evolucio_percentual ?? 0
                      return (
                        <tr key={c.comunitat_autonoma}>
                          <td className="rank">{i + 1}</td>
                          <td>{c.comunitat_autonoma}</td>
                          <td className="num">{formatNum(c.lanzaments_total)}</td>
                          <td className={`num ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`}>
                            {v > 0 ? '\u25B2' : v < 0 ? '\u25BC' : '\u2013'} {Math.abs(v)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Source attribution */}
      <div className="stats-source">
        <p>
          {t('stats_source_label')}: <a href={cgpjUrlFont} target="_blank" rel="noopener noreferrer">{cgpjFont || 'CGPJ'}</a>
          {' \u00B7 '}{t('stats_license')}: CC BY-SA 4.0
        </p>
      </div>
    </div>
  )
}
