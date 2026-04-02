import { useTranslation } from '../i18n/LanguageContext'

export default function InfoPage() {
  const { t } = useTranslation()

  return (
    <div className="info-page">
      <h1 className="page-title">{t('info_title')}</h1>
      <p className="page-subtitle">
        {t('info_subtitle')}
      </p>

      <div className="info-section">
        <h2>{t('info_what_title')}</h2>
        <p>{t('info_what_p1')}</p>
        <p>{t('info_what_p2')}</p>
      </div>

      {/* ===== EDUCATIONAL: Què és un desnonament? ===== */}
      <div className="info-section info-section--highlight">
        <h2>{t('info_eviction_title')}</h2>
        <p>{t('info_eviction_intro')}</p>
        <p>{t('info_eviction_impact')}</p>
      </div>

      <div className="info-section">
        <h2>{t('info_types_title')}</h2>
        <p>{t('info_types_intro')}</p>

        <div className="info-card">
          <h3>🏦 {t('info_type_hipotecaria_title')}</h3>
          <p>{t('info_type_hipotecaria_desc')}</p>
        </div>
        <div className="info-card">
          <h3>🏠 {t('info_type_lloguer_title')}</h3>
          <p>{t('info_type_lloguer_desc')}</p>
        </div>
        <div className="info-card">
          <h3>🔑 {t('info_type_ocupacio_title')}</h3>
          <p>{t('info_type_ocupacio_desc')}</p>
        </div>
        <div className="info-card">
          <h3>📋 {t('info_type_finalitzacio_title')}</h3>
          <p>{t('info_type_finalitzacio_desc')}</p>
        </div>
      </div>

      <div className="info-section">
        <h2>{t('info_process_title')}</h2>
        <p>{t('info_process_intro')}</p>
        <ol className="info-steps">
          <li><strong>{t('info_step1_title')}</strong> — {t('info_step1_desc')}</li>
          <li><strong>{t('info_step2_title')}</strong> — {t('info_step2_desc')}</li>
          <li><strong>{t('info_step3_title')}</strong> — {t('info_step3_desc')}</li>
          <li><strong>{t('info_step4_title')}</strong> — {t('info_step4_desc')}</li>
          <li><strong>{t('info_step5_title')}</strong> — {t('info_step5_desc')}</li>
          <li><strong>{t('info_step6_title')}</strong> — {t('info_step6_desc')}</li>
        </ol>
      </div>

      <div className="info-section info-section--highlight">
        <h2>{t('info_rights_title')}</h2>
        <p>{t('info_rights_intro')}</p>
        <ul>
          <li>✅ {t('info_right_1')}</li>
          <li>✅ {t('info_right_2')}</li>
          <li>✅ {t('info_right_3')}</li>
          <li>✅ {t('info_right_4')}</li>
          <li>✅ {t('info_right_5')}</li>
          <li>✅ {t('info_right_6')}</li>
          <li>✅ {t('info_right_7')}</li>
        </ul>
      </div>

      <div className="info-section">
        <h2>{t('info_action_title')}</h2>
        <p>{t('info_action_intro')}</p>
        <ol className="info-steps">
          <li><strong>{t('info_action1_title')}</strong> — {t('info_action1_desc')}</li>
          <li><strong>{t('info_action2_title')}</strong> — {t('info_action2_desc')}</li>
          <li><strong>{t('info_action3_title')}</strong> — {t('info_action3_desc')}</li>
          <li><strong>{t('info_action4_title')}</strong> — {t('info_action4_desc')}</li>
          <li><strong>{t('info_action5_title')}</strong> — {t('info_action5_desc')}</li>
        </ol>
      </div>

      <div className="info-section">
        <h2>{t('info_vulnerable_title')}</h2>
        <p>{t('info_vulnerable_intro')}</p>
        <ul>
          <li>{t('info_vulnerable_1')}</li>
          <li>{t('info_vulnerable_2')}</li>
          <li>{t('info_vulnerable_3')}</li>
          <li>{t('info_vulnerable_4')}</li>
          <li>{t('info_vulnerable_5')}</li>
        </ul>
        <p><strong>{t('info_vulnerable_note')}</strong></p>
      </div>

      {/* ===== EXISTING SECTIONS ===== */}
      <div className="info-section">
        <h2>{t('info_data_title')}</h2>
        <p>{t('info_data_intro')}</p>
        <ul>
          <li><strong>Boletín Oficial del Estado (BOE)</strong> — boe.es</li>
          <li><strong>Tablón Edictal Único (TEU)</strong> — Taulell unificat d'edictes judicials</li>
          <li><strong>Consejo General del Poder Judicial (CGPJ)</strong> — poderjudicial.es</li>
        </ul>
        <h3>{t('info_data_regional')}</h3>
        <ul>
          <li><strong>DOGC</strong> — Diari Oficial de la Generalitat de Catalunya</li>
          <li><strong>BOCM</strong> — Boletín Oficial de la Comunidad de Madrid</li>
          <li><strong>DOGV / DOCV</strong> — Diari Oficial de la Generalitat Valenciana</li>
          <li><strong>BOJA</strong> — Boletín Oficial de la Junta de Andalucía</li>
          <li><strong>EHAA / BOPV</strong> — Euskal Herriko Agintaritzaren Aldizkaria</li>
          <li><strong>DOG</strong> — Diario Oficial de Galicia</li>
          <li><strong>BOIB</strong> — Butlletí Oficial de les Illes Balears</li>
          <li><strong>BOC</strong> — Boletín Oficial de Canarias</li>
          <li><strong>BOA</strong> — Boletín Oficial de Aragón</li>
          <li><strong>BOCyL</strong> — Boletín Oficial de Castilla y León</li>
          <li><strong>DOCM</strong> — Diario Oficial de Castilla-La Mancha</li>
          <li><strong>BORM</strong> — Boletín Oficial de la Región de Murcia</li>
          <li><strong>DOE</strong> — Diario Oficial de Extremadura</li>
          <li><strong>BOPA</strong> — Boletín Oficial del Principado de Asturias</li>
          <li><strong>BOC</strong> — Boletín Oficial de Cantabria</li>
          <li><strong>BON</strong> — Boletín Oficial de Navarra</li>
          <li><strong>BOR</strong> — Boletín Oficial de La Rioja</li>
        </ul>
      </div>

      <div className="info-section">
        <h2>{t('info_law_title')}</h2>
        <p>{t('info_law_intro')}</p>
        <ul>
          <li><strong>Ley de Enjuiciamiento Civil (LEC)</strong></li>
          <li><strong>Ley 12/2023 por el Derecho a la Vivienda</strong></li>
          <li><strong>Real Decreto-ley 11/2020</strong></li>
          <li><strong>Llei 24/2015 (Catalunya)</strong></li>
          <li><strong>Llei 1/2022 (C. Valenciana)</strong></li>
          <li><strong>Ley 2/2017 (Euskadi)</strong></li>
          <li><strong>Ley 4/2016 (Andalucía)</strong></li>
        </ul>
      </div>

      <div className="info-section">
        <h2>{t('info_alerts_title')}</h2>
        <p>{t('info_alerts_p1')}</p>
        <ul>
          <li>{t('info_alerts_immediate')}</li>
          <li>{t('info_alerts_48h')}</li>
          <li>{t('info_alerts_weekly')}</li>
          <li>{t('info_alerts_updates')}</li>
        </ul>
      </div>

      <div className="info-section">
        <h2>{t('info_resources_title')}</h2>
        <p>{t('info_resources_intro')}</p>

        <h3>{t('info_emergency_title')}</h3>
        <ul>
          <li><strong>112</strong> — Emergencias generales</li>
          <li><strong>024</strong> — Línea de atención a la conducta suicida</li>
          <li><strong>900 900 120</strong> — Emergències socials (Catalunya)</li>
        </ul>

        <h3>{t('info_orgs_title')}</h3>
        <ul>
          <li><strong>PAH (Plataforma de Afectados por la Hipoteca)</strong> — afectadosporlahipoteca.com</li>
          <li><strong>Sindicat de Llogateres / Sindicato de Inquilinas</strong> — sindicatdellogateres.org</li>
          <li><strong>Cáritas Española</strong> — caritas.es</li>
          <li><strong>Cruz Roja / Creu Roja</strong> — cruzroja.es</li>
          <li><strong>Defensor del Pueblo</strong> — defensordelpueblo.es</li>
        </ul>

        <h3>{t('info_housing_title')}</h3>
        <ul>
          <li><strong>Catalunya</strong> — Agència de l'Habitatge de Catalunya (habitatge.gencat.cat)</li>
          <li><strong>Madrid</strong> — Agencia de Vivienda Social (agenciavivienda.org)</li>
          <li><strong>Com. Valenciana</strong> — Vicepresidència i Conselleria d'Habitatge</li>
          <li><strong>Andalucía</strong> — Consejería de Fomento, Vivienda y OT</li>
          <li><strong>Euskadi</strong> — Etxebide (etxebide.euskadi.eus)</li>
          <li><strong>Galicia</strong> — Instituto Galego de Vivenda e Solo (igvs.xunta.gal)</li>
          <li><strong>Illes Balears</strong> — IBAVI</li>
          <li><strong>Canarias</strong> — Instituto Canario de la Vivienda</li>
          <li><strong>Aragón</strong> — Dirección General de Vivienda (aragon.es)</li>
          <li><strong>Castilla y León</strong> — Consejería de Medio Ambiente, Vivienda y OT</li>
          <li><strong>Castilla-La Mancha</strong> — Consejería de Fomento</li>
          <li><strong>Murcia</strong> — Consejería de Fomento e Infraestructuras</li>
          <li><strong>Extremadura</strong> — Consejería de Movilidad, Transporte y Vivienda</li>
          <li><strong>Asturias</strong> — Consejería de OT, Urbanismo y Vivienda</li>
          <li><strong>Cantabria</strong> — Dirección General de Vivienda</li>
          <li><strong>Navarra</strong> — Nasuvinsa</li>
          <li><strong>La Rioja</strong> — Dirección General de Vivienda</li>
        </ul>

        <h3>{t('info_legal_title')}</h3>
        <ul>
          <li><strong>Servicio de Orientación Jurídica (SOJ)</strong></li>
          <li><strong>Turno de Oficio</strong></li>
          <li><strong>Colegios de Abogados</strong></li>
          <li><strong>OMIC</strong></li>
        </ul>
      </div>

      <div className="info-section">
        <h2>{t('info_stats_title')}</h2>
        <p>{t('info_stats_p1')}</p>
      </div>

      <div className="info-section">
        <h2>{t('info_opensource_title')}</h2>
        <p>{t('info_opensource_p1')}</p>
      </div>

      <div className="info-section">
        <h2>{t('info_legal_disclaimer_title')}</h2>
        <p>{t('info_legal_disclaimer_p1')}</p>
      </div>
    </div>
  )
}
