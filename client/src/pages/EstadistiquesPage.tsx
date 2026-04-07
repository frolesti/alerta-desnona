import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getINEData, getINEComunitats, getINETendencia, getCasos } from '../api'
import type { EstadisticaINE, ResumComunitat, TendenciaINE, CasIndividual } from '../api'
import { useTranslation } from '../i18n/LanguageContext'

function formatNum(n: number): string {
  return n.toLocaleString('ca-ES')
}

type Tab = 'casos' | 'resum' | 'provincies' | 'evolucio'

export default function EstadistiquesPage() {
  const { t } = useTranslation()
  const [provincies, setProvincies] = useState<EstadisticaINE[]>([])
  const [comunitats, setComunitats] = useState<ResumComunitat[]>([])
  const [tendencia, setTendencia] = useState<TendenciaINE[]>([])
  const [any, setAny] = useState<number | null>(null)
  const [totalVivendes, setTotalVivendes] = useState(0)
  const [totalFinques, setTotalFinques] = useState(0)
  const [loading, setLoading] = useState(true)
  const [font, setFont] = useState('')
  const [urlFont, setUrlFont] = useState('')

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
  const [vista, setVista] = useState<'comunitats' | 'provincies'>('comunitats')
  const [filterCom, setFilterCom] = useState('')
  const [cerca, setCerca] = useState('')

  useEffect(() => {
    Promise.all([getINEData(), getINEComunitats(), getINETendencia()])
      .then(([ineRes, comRes, tendRes]) => {
        if (ineRes.ok && ineRes.data) {
          setProvincies(ineRes.data)
          setAny(ineRes.any ?? null)
          setTotalVivendes(ineRes.total_vivendes ?? 0)
          setTotalFinques(ineRes.total_finques ?? 0)
          setFont(ineRes.font ?? '')
          setUrlFont(ineRes.url_font ?? '')
        }
        if (comRes.ok && comRes.data) setComunitats(comRes.data)
        if (tendRes.ok && tendRes.data) setTendencia(tendRes.data)
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

  if (!any || provincies.length === 0) {
    return (
      <div className="stats-page">
        <h1 className="page-title">{t('stats_title')}</h1>
        <div className="empty-state">
          <p>{t('stats_no_data')}</p>
        </div>
      </div>
    )
  }

  const maxVivendes = Math.max(...provincies.map(p => p.finques_vivendes), 1)
  const maxVivendesCom = Math.max(...comunitats.map(c => c.total_vivendes), 1)
  const maxTendVal = Math.max(...tendencia.map(td => td.total_vivendes), 1)

  // Full chart
  const chartW = 700
  const chartH = 220
  const chartPad = { top: 20, right: 20, bottom: 35, left: 55 }
  const plotW = chartW - chartPad.left - chartPad.right
  const plotH = chartH - chartPad.top - chartPad.bottom
  const chartPoints = tendencia.map((td, i) => {
    const x = chartPad.left + (i / Math.max(tendencia.length - 1, 1)) * plotW
    const y = chartPad.top + plotH - (td.total_vivendes / maxTendVal) * plotH
    return { x, y, ...td }
  })
  const areaPath = chartPoints.length > 0
    ? `M ${chartPoints.map(p => `${p.x},${p.y}`).join(' L ')} L ${chartPoints[chartPoints.length - 1].x},${chartPad.top + plotH} L ${chartPoints[0].x},${chartPad.top + plotH} Z`
    : ''

  // Province filtering
  let filtered = provincies
  if (filterCom) filtered = filtered.filter(p => p.comunitat_autonoma === filterCom)
  if (cerca) {
    const q = cerca.toLowerCase()
    filtered = filtered.filter(p =>
      p.provincia.toLowerCase().includes(q) || p.comunitat_autonoma.toLowerCase().includes(q)
    )
  }
  const sorted = [...filtered].sort((a, b) => b.finques_vivendes - a.finques_vivendes)

  // YoY change
  const prevYear = tendencia.length >= 2 ? tendencia[tendencia.length - 2] : null
  const currYear = tendencia.length >= 1 ? tendencia[tendencia.length - 1] : null
  const yoyChange = prevYear && currYear && prevYear.total_vivendes > 0
    ? ((currYear.total_vivendes - prevYear.total_vivendes) / prevYear.total_vivendes) * 100
    : null
  const dailyAvg = totalVivendes > 0 ? Math.round(totalVivendes / 365) : null

  // Unique communities for filter
  const allComs = [...new Set(provincies.map(p => p.comunitat_autonoma))].sort()

  return (
    <div className="stats-page">
      <h1 className="page-title">{t('stats_title')}</h1>
      <p className="page-subtitle">{t('stats_subtitle')}</p>

      {/* Hero stats — clear, human-readable */}
      <div className="stats-hero">
        <div className="stats-hero-item hero-main">
          <div className="stats-hero-value">{formatNum(totalVivendes)}</div>
          <div className="stats-hero-label">{t('stats_housing_foreclosures')}</div>
          <div className="stats-hero-year">{any}</div>
        </div>
        <div className="stats-hero-item">
          {yoyChange !== null ? (
            <>
              <div className={`stats-hero-value ${yoyChange > 0 ? 'up' : yoyChange < 0 ? 'down' : ''}`}>
                {yoyChange > 0 ? '\u25B2' : yoyChange < 0 ? '\u25BC' : ''} {Math.abs(Math.round(yoyChange * 10) / 10)}%
              </div>
              <div className="stats-hero-label">{t('stats_yoy_label')}</div>
              <div className="stats-hero-year">{prevYear?.any} → {any}</div>
            </>
          ) : (
            <>
              <div className="stats-hero-value">{formatNum(totalFinques)}</div>
              <div className="stats-hero-label">{t('stats_all_properties')}</div>
              <div className="stats-hero-year">{any}</div>
            </>
          )}
        </div>
        <div className="stats-hero-item">
          {dailyAvg !== null ? (
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

      {/* TAB: Resum */}
      {tab === 'resum' && (
        <>
          <div className="stats-toggle">
            <button className={vista === 'comunitats' ? 'active' : ''} onClick={() => setVista('comunitats')}>
              {t('stats_by_community')}
            </button>
            <button className={vista === 'provincies' ? 'active' : ''} onClick={() => setVista('provincies')}>
              {t('stats_by_province')}
            </button>
          </div>

          {vista === 'comunitats' && (
            <div className="stats-table-container">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('stats_community')}</th>
                    <th className="num">{t('stats_housing')}</th>
                    <th className="num">{t('stats_variation')}</th>
                    <th className="bar-col"></th>
                  </tr>
                </thead>
                <tbody>
                  {comunitats.map((c, i) => {
                    const v = c.variacio_percentual ?? 0
                    return (
                      <tr key={c.comunitat_autonoma}>
                        <td className="rank">{i + 1}</td>
                        <td>{c.comunitat_autonoma}</td>
                        <td className="num">{formatNum(c.total_vivendes)}</td>
                        <td className={`num ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`}>
                          {v > 0 ? '\u25B2' : v < 0 ? '\u25BC' : '\u2013'} {Math.abs(v)}%
                        </td>
                        <td className="bar-col">
                          <div className="bar-bg">
                            <div className="bar-fill" style={{ width: `${(c.total_vivendes / maxVivendesCom) * 100}%` }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {vista === 'provincies' && (
            <div className="stats-table-container">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('stats_province')}</th>
                    <th>{t('stats_community')}</th>
                    <th className="num">{t('stats_housing')}</th>
                    <th className="bar-col"></th>
                  </tr>
                </thead>
                <tbody>
                  {provincies.map((p, i) => (
                    <tr key={p.codi_provincia}>
                      <td className="rank">{i + 1}</td>
                      <td>
                        <Link to={'/provincia/' + p.codi_provincia} className="table-link">
                          {p.provincia}
                        </Link>
                      </td>
                      <td className="community-sm">{p.comunitat_autonoma}</td>
                      <td className="num">{formatNum(p.finques_vivendes)}</td>
                      <td className="bar-col">
                        <div className="bar-bg">
                          <div className="bar-fill" style={{ width: `${(p.finques_vivendes / maxVivendes) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* TAB: Provincies (card grid with search) */}
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

          {sorted.length === 0 ? (
            <div className="empty-state"><p>{t('list_empty')}</p></div>
          ) : (
            <div className="provincies-grid">
              {sorted.map((p, i) => (
                <Link key={p.codi_provincia} to={'/provincia/' + p.codi_provincia} className="provincia-card">
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
                      {formatNum(p.total_finques)} {t('stats_total_short')}
                    </div>
                  </div>
                  <div className="card-bar">
                    <div className="bar-bg">
                      <div className="bar-fill" style={{ width: (p.finques_vivendes / maxVivendes * 100) + '%' }} />
                    </div>
                  </div>
                  <div className="card-meta">
                    <span>{p.comunitat_autonoma}</span>
                    <span>{t('view_details')} {'\u2192'}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* TAB: Evolucio historica */}
      {tab === 'evolucio' && tendencia.length > 0 && (
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
                      fill="var(--color-text)" fontWeight="600">{formatNum(p.total_vivendes)}</text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          {/* Historical table */}
          <div className="stats-table-container" style={{ marginTop: '1.5rem' }}>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>{t('stats_year')}</th>
                  <th className="num">{t('stats_housing')}</th>
                  <th className="num">{t('stats_total_properties')}</th>
                  <th className="num">{t('stats_variation')}</th>
                </tr>
              </thead>
              <tbody>
                {[...tendencia].reverse().map((td, i, arr) => {
                  const prev = arr[i + 1]
                  const variacio = prev ? ((td.total_vivendes - prev.total_vivendes) / prev.total_vivendes) * 100 : 0
                  return (
                    <tr key={td.any} className={td.any === any ? 'highlight-row' : ''}>
                      <td><strong>{td.any}</strong></td>
                      <td className="num">{formatNum(td.total_vivendes)}</td>
                      <td className="num">{formatNum(td.total_finques)}</td>
                      <td className={`num ${variacio > 0 ? 'up' : variacio < 0 ? 'down' : ''}`}>
                        {prev ? `${variacio > 0 ? '\u25B2' : variacio < 0 ? '\u25BC' : '\u2013'} ${Math.abs(Math.round(variacio * 10) / 10)}%` : '\u2013'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Community rankings */}
          {comunitats.length > 0 && (
            <div className="stats-section">
              <h2>{t('stats_by_community')} ({any})</h2>
              <div className="stats-table-container">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('stats_community')}</th>
                      <th className="num">{t('stats_housing')}</th>
                      <th className="num">{t('stats_variation')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comunitats.map((c, i) => {
                      const v = c.variacio_percentual ?? 0
                      return (
                        <tr key={c.comunitat_autonoma}>
                          <td className="rank">{i + 1}</td>
                          <td>{c.comunitat_autonoma}</td>
                          <td className="num">{formatNum(c.total_vivendes)}</td>
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
          {t('stats_source_label')}: <a href={urlFont} target="_blank" rel="noopener noreferrer">{font}</a>
          {' \u00B7 '}{t('stats_license')}: CC BY-SA 4.0
        </p>
      </div>
    </div>
  )
}
