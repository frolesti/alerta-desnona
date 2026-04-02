import { useState } from 'react'
import { registrarUsuari } from '../api'
import { useTranslation } from '../i18n/LanguageContext'

const COMUNITATS_AUTONOMES: Record<string, string[]> = {
  'Andalucía': ['Almería', 'Cádiz', 'Córdoba', 'Granada', 'Huelva', 'Jaén', 'Málaga', 'Sevilla'],
  'Aragón': ['Huesca', 'Teruel', 'Zaragoza'],
  'Cantabria': ['Cantabria'],
  'Castilla y León': ['Ávila', 'Burgos', 'León', 'Palencia', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora'],
  'Castilla-La Mancha': ['Albacete', 'Ciudad Real', 'Cuenca', 'Guadalajara', 'Toledo'],
  'Catalunya': ['Barcelona', 'Girona', 'Lleida', 'Tarragona'],
  'Ceuta': ['Ceuta'],
  'Comunidad de Madrid': ['Madrid'],
  'Comunidad Foral de Navarra': ['Navarra'],
  'Comunitat Valenciana': ['Alacant', 'Castelló', 'València'],
  'Euskadi': ['Araba/Álava', 'Bizkaia', 'Gipuzkoa'],
  'Extremadura': ['Badajoz', 'Cáceres'],
  'Galicia': ['A Coruña', 'Lugo', 'Ourense', 'Pontevedra'],
  'Illes Balears': ['Illes Balears'],
  'Canarias': ['Las Palmas', 'Santa Cruz de Tenerife'],
  'La Rioja': ['La Rioja'],
  'Melilla': ['Melilla'],
  'Principado de Asturias': ['Asturias'],
  'Región de Murcia': ['Murcia'],
}

export default function AlertesPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [nom, setNom] = useState('')
  const [comunitatsSeleccionades, setComunitatsSeleccionades] = useState<string[]>([])
  const [provinciesSeleccionades, setProvinciesSeleccionades] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  function toggleComunitat(comunitat: string) {
    setComunitatsSeleccionades(prev =>
      prev.includes(comunitat)
        ? prev.filter(c => c !== comunitat)
        : [...prev, comunitat]
    )
  }

  function toggleProvincia(provincia: string) {
    setProvinciesSeleccionades(prev =>
      prev.includes(provincia)
        ? prev.filter(p => p !== provincia)
        : [...prev, provincia]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setSubmitting(true)
    setResult(null)

    try {
      const res = await registrarUsuari({
        email,
        nom: nom || undefined,
        comunitats: comunitatsSeleccionades.length > 0 ? comunitatsSeleccionades : undefined,
        provincies: provinciesSeleccionades.length > 0 ? provinciesSeleccionades : undefined,
        notificacions_email: true,
      })

      if (res.ok) {
        setResult({
          type: 'success',
          msg: t('alertes_success'),
        })
        setEmail('')
        setNom('')
        setComunitatsSeleccionades([])
        setProvinciesSeleccionades([])
      } else {
        setResult({ type: 'error', msg: res.error || t('alertes_error') })
      }
    } catch (err) {
      setResult({
        type: 'error',
        msg: err instanceof Error ? err.message : t('error_connection'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="alertes-page">
      <h1 className="page-title">{t('alertes_title')}</h1>
      <p className="page-subtitle">
        {t('alertes_subtitle')}
      </p>

      {result && (
        <div className={`alert alert-${result.type}`}>
          {result.msg}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">{t('alertes_email_label')}</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={t('alertes_email_placeholder')}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="nom">{t('alertes_name_label')}</label>
          <input
            id="nom"
            type="text"
            value={nom}
            onChange={e => setNom(e.target.value)}
            placeholder={t('alertes_name_placeholder')}
          />
        </div>

        <div className="form-group">
          <label>{t('alertes_communities_label')}</label>
          <p className="form-help">
            {t('alertes_communities_help')}
          </p>
          <div className="checkbox-group" style={{ marginTop: '0.5rem' }}>
            {Object.keys(COMUNITATS_AUTONOMES).sort().map(comunitat => (
              <div
                key={comunitat}
                className={`checkbox-item ${comunitatsSeleccionades.includes(comunitat) ? 'checked' : ''}`}
                onClick={() => toggleComunitat(comunitat)}
              >
                <input
                  type="checkbox"
                  checked={comunitatsSeleccionades.includes(comunitat)}
                  onChange={() => toggleComunitat(comunitat)}
                />
                {comunitat}
              </div>
            ))}
          </div>
        </div>

        {comunitatsSeleccionades.length > 0 && (
          <div className="form-group">
            <label>{t('alertes_provinces_label')}</label>
            <p className="form-help">
              {t('alertes_provinces_help')}
            </p>
            <div className="checkbox-group" style={{ marginTop: '0.5rem' }}>
              {comunitatsSeleccionades.sort().map(comunitat => (
                COMUNITATS_AUTONOMES[comunitat]?.map(provincia => (
                  <div
                    key={provincia}
                    className={`checkbox-item ${provinciesSeleccionades.includes(provincia) ? 'checked' : ''}`}
                    onClick={() => toggleProvincia(provincia)}
                  >
                    <input
                      type="checkbox"
                      checked={provinciesSeleccionades.includes(provincia)}
                      onChange={() => toggleProvincia(provincia)}
                    />
                    {provincia} <small style={{ opacity: 0.7 }}>({comunitat})</small>
                  </div>
                ))
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={submitting || !email}
        >
          {submitting ? t('alertes_submitting') : t('alertes_submit')}
        </button>
      </form>
    </div>
  )
}
