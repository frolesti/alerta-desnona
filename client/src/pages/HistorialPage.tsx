import { useEffect, useState } from 'react'
import { useTranslation } from '../i18n/LanguageContext'
import { getINETendencia, getINEComunitats } from '../api'
import type { TendenciaINE, ResumComunitat } from '../api'

function formatNum(n: number): string {
  return n.toLocaleString('ca-ES')
}

export default function HistorialPage() {
  const { t } = useTranslation()
  const [tendencia, setTendencia] = useState<TendenciaINE[]>([])
  const [comunitats, setComunitats] = useState<ResumComunitat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getINETendencia(), getINEComunitats()])
      .then(([tendRes, comRes]) => {
        if (tendRes.ok && tendRes.data) setTendencia(tendRes.data)
        if (comRes.ok && comRes.data) setComunitats(comRes.data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span>{t('loading')}</span>
      </div>
    )
  }

  const maxVivendes = Math.max(...tendencia.map(t => t.total_vivendes), 1)
  const sparkW = 600
  const sparkH = 200
  const sparkPoints = tendencia.map((t, i) => {
    const x = 40 + (i / Math.max(tendencia.length - 1, 1)) * (sparkW - 80)
    const y = sparkH - 30 - (t.total_vivendes / maxVivendes) * (sparkH - 60)
    return x + ',' + y
  }).join(' ')

  return (
    <div className="historial-page">
      <h1 className="page-title">{t('historial_title')}</h1>
      <p className="page-subtitle">{t('historial_subtitle')}</p>

      {tendencia.length === 0 ? (
        <div className="empty-state">
          <p>{t('stats_no_data')}</p>
        </div>
      ) : (
        <>
          {/* Big chart */}
          <div className="stats-section" style={{ marginBottom: '2rem' }}>
            <h2>{t('stats_trend')}</h2>
            <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', overflowX: 'auto' }}>
              <svg width="100%" height={sparkH + 10} viewBox={'0 0 ' + sparkW + ' ' + (sparkH + 10)} className="sparkline historial-chart">
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map(frac => {
                  const y = sparkH - 30 - frac * (sparkH - 60)
                  const val = Math.round(frac * maxVivendes)
                  return (
                    <g key={frac}>
                      <line x1="35" y1={y} x2={sparkW - 35} y2={y} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="4,4" />
                      <text x="30" y={y + 4} textAnchor="end" fontSize="9" fill="var(--text-secondary)">{formatNum(val)}</text>
                    </g>
                  )
                })}
                <polyline
                  points={sparkPoints}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
                {/* Area fill */}
                <polygon
                  points={sparkPoints + ' ' + (40 + (sparkW - 80)) + ',' + (sparkH - 30) + ' 40,' + (sparkH - 30)}
                  fill="var(--accent)"
                  fillOpacity="0.1"
                />
                {tendencia.map((t, i) => {
                  const x = 40 + (i / Math.max(tendencia.length - 1, 1)) * (sparkW - 80)
                  const y = sparkH - 30 - (t.total_vivendes / maxVivendes) * (sparkH - 60)
                  return (
                    <g key={t.any}>
                      <circle cx={x} cy={y} r="5" fill="var(--accent)" />
                      <text x={x} y={sparkH} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">
                        {t.any}
                      </text>
                      <text x={x} y={y - 10} textAnchor="middle" fontSize="9" fill="var(--text-primary)" fontWeight="600">
                        {formatNum(t.total_vivendes)}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>

          {/* Jahr table */}
          <div className="stats-section">
            <h2>{t('stats_historical')}</h2>
            <div className="stats-table-container">
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
                      <tr key={td.any}>
                        <td><strong>{td.any}</strong></td>
                        <td className="num">{formatNum(td.total_vivendes)}</td>
                        <td className="num">{formatNum(td.total_finques)}</td>
                        <td className={'num ' + (variacio > 0 ? 'up' : variacio < 0 ? 'down' : '')}>
                          {prev ? (variacio > 0 ? '\u25b2' : variacio < 0 ? '\u25bc' : '\u2013') + ' ' + Math.abs(Math.round(variacio * 10) / 10) + '%' : '\u2013'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Community summary */}
          {comunitats.length > 0 && (
            <div className="stats-section">
              <h2>{t('stats_by_community')}</h2>
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
                    {comunitats.map((c, i) => (
                      <tr key={c.comunitat_autonoma}>
                        <td className="rank">{i + 1}</td>
                        <td>{c.comunitat_autonoma}</td>
                        <td className="num">{formatNum(c.total_vivendes)}</td>
                        <td className={'num ' + ((c.variacio_percentual ?? 0) > 0 ? 'up' : (c.variacio_percentual ?? 0) < 0 ? 'down' : '')}>
                          {(c.variacio_percentual ?? 0) > 0 ? '\u25b2' : (c.variacio_percentual ?? 0) < 0 ? '\u25bc' : '\u2013'} {Math.abs(c.variacio_percentual ?? 0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="stats-source">
            <p>
              {t('stats_source_label')}: <a href="https://www.ine.es/jaxiT3/Tabla.htm?t=10743" target="_blank" rel="noopener noreferrer">INE \u2014 Instituto Nacional de Estadistica</a>
              {' \u00b7 '}
              {t('stats_license')}: CC BY-SA 4.0
            </p>
          </div>
        </>
      )}
    </div>
  )
}
