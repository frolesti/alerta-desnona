import { Router, Request, Response } from 'express';
import { getDB } from '../db/database';

export const estadistiquesRoutes = Router();

// Coordenades capitals de província (per al mapa)
const COORDS_PROVINCIA: Record<string, { lat: number; lng: number }> = {
  '01': { lat: 42.8467, lng: -2.6727 },  // Araba/Álava
  '02': { lat: 38.9943, lng: -1.8564 },  // Albacete
  '03': { lat: 38.3452, lng: -0.4815 },  // Alicante
  '04': { lat: 36.8340, lng: -2.4637 },  // Almería
  '05': { lat: 40.6557, lng: -4.7001 },  // Ávila
  '06': { lat: 38.8794, lng: -6.9707 },  // Badajoz
  '07': { lat: 39.5696, lng: 2.6502 },   // Illes Balears
  '08': { lat: 41.3874, lng: 2.1686 },   // Barcelona
  '09': { lat: 42.3439, lng: -3.6969 },  // Burgos
  '10': { lat: 39.4753, lng: -6.3724 },  // Cáceres
  '11': { lat: 36.5271, lng: -6.2886 },  // Cádiz
  '12': { lat: 39.9864, lng: -0.0513 },  // Castellón
  '13': { lat: 38.9860, lng: -3.9274 },  // Ciudad Real
  '14': { lat: 37.8847, lng: -4.7792 },  // Córdoba
  '15': { lat: 43.3713, lng: -8.3960 },  // A Coruña
  '16': { lat: 40.0704, lng: -2.1374 },  // Cuenca
  '17': { lat: 41.9794, lng: 2.8214 },   // Girona
  '18': { lat: 37.1773, lng: -3.5986 },  // Granada
  '19': { lat: 40.6337, lng: -3.1668 },  // Guadalajara
  '20': { lat: 43.3183, lng: -1.9812 },  // Gipuzkoa
  '21': { lat: 37.2614, lng: -6.9447 },  // Huelva
  '22': { lat: 42.1401, lng: -0.4089 },  // Huesca
  '23': { lat: 37.7796, lng: -3.7849 },  // Jaén
  '24': { lat: 42.5987, lng: -5.5671 },  // León
  '25': { lat: 41.6176, lng: 0.6200 },   // Lleida
  '26': { lat: 42.4650, lng: -2.4500 },  // La Rioja
  '27': { lat: 43.0097, lng: -7.5568 },  // Lugo
  '28': { lat: 40.4168, lng: -3.7038 },  // Madrid
  '29': { lat: 36.7213, lng: -4.4214 },  // Málaga
  '30': { lat: 37.9834, lng: -1.1300 },  // Murcia
  '31': { lat: 42.8125, lng: -1.6458 },  // Navarra
  '32': { lat: 42.3361, lng: -7.8639 },  // Ourense
  '33': { lat: 43.3614, lng: -5.8493 },  // Asturias
  '34': { lat: 42.0126, lng: -4.5329 },  // Palencia
  '35': { lat: 28.1094, lng: -15.4163 }, // Las Palmas
  '36': { lat: 42.4312, lng: -8.6445 },  // Pontevedra
  '37': { lat: 40.9688, lng: -5.6631 },  // Salamanca
  '38': { lat: 28.4682, lng: -16.2546 }, // Santa Cruz de Tenerife
  '39': { lat: 43.4623, lng: -3.8100 },  // Cantabria
  '40': { lat: 40.9429, lng: -4.1088 },  // Segovia
  '41': { lat: 37.3891, lng: -5.9845 },  // Sevilla
  '42': { lat: 41.7636, lng: -2.4649 },  // Soria
  '43': { lat: 41.1189, lng: 1.2445 },   // Tarragona
  '44': { lat: 40.3456, lng: -1.1065 },  // Teruel
  '45': { lat: 39.8628, lng: -4.0273 },  // Toledo
  '46': { lat: 39.4699, lng: -0.3763 },  // Valencia
  '47': { lat: 41.6521, lng: -4.7245 },  // Valladolid
  '48': { lat: 43.2630, lng: -2.9350 },  // Bizkaia
  '49': { lat: 41.5065, lng: -5.7447 },  // Zamora
  '50': { lat: 41.6488, lng: -0.8891 },  // Zaragoza
  '51': { lat: 35.8893, lng: -5.3213 },  // Ceuta
  '52': { lat: 35.2923, lng: -2.9381 },  // Melilla
};

// GET /api/estadistiques/ine - Dades INE per al darrer any disponible
estadistiquesRoutes.get('/ine', (_req: Request, res: Response) => {
  try {
    const db = getDB();
    
    // Obtenir el darrer any disponible
    const darrerAny = db.prepare(
      'SELECT MAX(any) as any FROM estadistiques_ine'
    ).get() as any;

    if (!darrerAny?.any) {
      return res.json({ ok: true, data: [], any: null, font: 'INE', message: 'No hi ha dades. Executa: npx tsx src/fetch-ine.ts' });
    }

    const dades = db.prepare(`
      SELECT provincia, codi_provincia, comunitat_autonoma, any, 
             total_finques, finques_vivendes, finques_solars, finques_altres, 
             finques_rustiques, tipus_dada
      FROM estadistiques_ine
      WHERE any = ?
      ORDER BY finques_vivendes DESC
    `).all(darrerAny.any) as any[];

    // Afegir coordenades per al mapa
    const dadesAmbCoords = dades.map((d: any) => ({
      ...d,
      latitud: COORDS_PROVINCIA[d.codi_provincia]?.lat,
      longitud: COORDS_PROVINCIA[d.codi_provincia]?.lng,
    }));

    // Calcular totals
    const totalVivendes = dades.reduce((s: number, d: any) => s + d.finques_vivendes, 0);
    const totalFinques = dades.reduce((s: number, d: any) => s + d.total_finques, 0);

    res.json({
      ok: true,
      data: dadesAmbCoords,
      any: darrerAny.any,
      total_vivendes: totalVivendes,
      total_finques: totalFinques,
      font: 'INE — Instituto Nacional de Estadística',
      url_font: 'https://www.ine.es/jaxiT3/Tabla.htm?t=10743',
      llicencia: 'CC BY-SA 4.0',
    });
  } catch (error) {
    console.error('Error obtenint estadístiques INE:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// GET /api/estadistiques/ine/tendencia - Evolució anual
estadistiquesRoutes.get('/ine/tendencia', (req: Request, res: Response) => {
  try {
    const db = getDB();
    const { comunitat, provincia } = req.query;

    let query = `
      SELECT any, 
             SUM(finques_vivendes) as total_vivendes,
             SUM(total_finques) as total_finques,
             SUM(finques_rustiques) as total_rustiques
      FROM estadistiques_ine
    `;
    const params: any[] = [];

    if (provincia) {
      query += ' WHERE codi_provincia = ?';
      params.push(provincia);
    } else if (comunitat) {
      query += ' WHERE comunitat_autonoma = ?';
      params.push(comunitat);
    }

    query += ' GROUP BY any ORDER BY any ASC';

    const tendencia = db.prepare(query).all(...params);

    res.json({
      ok: true,
      data: tendencia,
      font: 'INE — Instituto Nacional de Estadística',
    });
  } catch (error) {
    console.error('Error obtenint tendència:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// GET /api/estadistiques/ine/comunitats - Resum per comunitat
estadistiquesRoutes.get('/ine/comunitats', (_req: Request, res: Response) => {
  try {
    const db = getDB();

    const darrerAny = db.prepare(
      'SELECT MAX(any) as any FROM estadistiques_ine'
    ).get() as any;

    if (!darrerAny?.any) {
      return res.json({ ok: true, data: [], any: null });
    }

    const dades = db.prepare(`
      SELECT comunitat_autonoma,
             SUM(finques_vivendes) as total_vivendes,
             SUM(total_finques) as total_finques,
             COUNT(*) as num_provincies
      FROM estadistiques_ine
      WHERE any = ?
      GROUP BY comunitat_autonoma
      ORDER BY total_vivendes DESC
    `).all(darrerAny.any);

    // Obtenir any anterior per calcular variació
    const anyAnterior = darrerAny.any - 1;
    const dadesAnteriors = db.prepare(`
      SELECT comunitat_autonoma,
             SUM(finques_vivendes) as total_vivendes
      FROM estadistiques_ine
      WHERE any = ?
      GROUP BY comunitat_autonoma
    `).all(anyAnterior) as any[];

    const anteriorMap = new Map(dadesAnteriors.map((d: any) => [d.comunitat_autonoma, d.total_vivendes]));

    const dadesAmbVariacio = (dades as any[]).map((d: any) => {
      const anterior = anteriorMap.get(d.comunitat_autonoma) || 0;
      const variacio = anterior > 0 ? ((d.total_vivendes - anterior) / anterior) * 100 : 0;
      return { ...d, vivendes_any_anterior: anterior, variacio_percentual: Math.round(variacio * 10) / 10 };
    });

    res.json({
      ok: true,
      data: dadesAmbVariacio,
      any: darrerAny.any,
      any_anterior: anyAnterior,
      font: 'INE — Instituto Nacional de Estadística',
    });
  } catch (error) {
    console.error('Error obtenint dades per comunitat:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// Fonts oficials per comunitat/butlletí
const FONTS_PER_COMUNITAT: Record<string, { nom: string; url: string }> = {
  'Andalucía': { nom: 'BOJA — Boletín Oficial de la Junta de Andalucía', url: 'https://www.juntadeandalucia.es/boja' },
  'Aragón': { nom: 'BOA — Boletín Oficial de Aragón', url: 'https://www.boa.aragon.es/' },
  'Principado de Asturias': { nom: 'BOPA — Boletín Oficial del Principado de Asturias', url: 'https://sede.asturias.es/bopa' },
  'Illes Balears': { nom: 'BOIB — Butlletí Oficial de les Illes Balears', url: 'https://www.caib.es/eboibfront/' },
  'Canarias': { nom: 'BOC — Boletín Oficial de Canarias', url: 'http://www.gobiernodecanarias.org/boc/' },
  'Cantabria': { nom: 'BOC — Boletín Oficial de Cantabria', url: 'https://boc.cantabria.es/' },
  'Castilla y León': { nom: 'BOCYL — Boletín Oficial de Castilla y León', url: 'https://bocyl.jcyl.es/' },
  'Castilla-La Mancha': { nom: 'DOCM — Diario Oficial de Castilla-La Mancha', url: 'https://docm.jccm.es/' },
  'Catalunya': { nom: 'DOGC — Diari Oficial de la Generalitat de Catalunya', url: 'https://dogc.gencat.cat/' },
  'Comunitat Valenciana': { nom: 'DOGV — Diari Oficial de la Generalitat Valenciana', url: 'https://dogv.gva.es/' },
  'Extremadura': { nom: 'DOE — Diario Oficial de Extremadura', url: 'http://doe.juntaex.es/' },
  'Galicia': { nom: 'DOG — Diario Oficial de Galicia', url: 'https://www.xunta.gal/diario-oficial-galicia' },
  'Comunidad de Madrid': { nom: 'BOCM — Boletín Oficial de la Comunidad de Madrid', url: 'http://www.bocm.es/' },
  'Región de Murcia': { nom: 'BORM — Boletín Oficial de la Región de Murcia', url: 'https://www.borm.es/' },
  'Comunidad Foral de Navarra': { nom: 'BON — Boletín Oficial de Navarra', url: 'https://bon.navarra.es/' },
  'Euskadi': { nom: 'EHAA/BOPV — Euskal Herriko Agintaritzaren Aldizkaria', url: 'https://www.euskadi.eus/y22-bopv/eu' },
  'La Rioja': { nom: 'BOR — Boletín Oficial de La Rioja', url: 'https://ias1.larioja.org/boletin/' },
  'Ceuta': { nom: 'BOCCE — Boletín Oficial de la Ciudad de Ceuta', url: 'https://www.ceuta.es/ceuta/bocce' },
  'Melilla': { nom: 'BOME — Boletín Oficial de la Ciudad de Melilla', url: 'https://www.melilla.es/melillaportal/contenedor_tema.jsp?seccion=s_fnot_d4_v1.jsp&codbusqueda=182' },
};

// GET /api/estadistiques/ine/provincia/:codi - Detall d'una província
estadistiquesRoutes.get('/ine/provincia/:codi', (req: Request, res: Response) => {
  try {
    const db = getDB();
    const { codi } = req.params;

    // Dades del darrer any
    const darrerAny = db.prepare('SELECT MAX(any) as any FROM estadistiques_ine').get() as any;
    if (!darrerAny?.any) {
      return res.status(404).json({ ok: false, error: 'No hi ha dades' });
    }

    const provincia = db.prepare(`
      SELECT * FROM estadistiques_ine WHERE codi_provincia = ? AND any = ?
    `).get(codi, darrerAny.any) as any;

    if (!provincia) {
      return res.status(404).json({ ok: false, error: 'Província no trobada' });
    }

    // Tendència històrica
    const tendencia = db.prepare(`
      SELECT any, total_finques, finques_vivendes, finques_solars, finques_altres, finques_rustiques
      FROM estadistiques_ine
      WHERE codi_provincia = ?
      ORDER BY any ASC
    `).all(codi);

    // Any anterior per variació
    const anterior = db.prepare(`
      SELECT finques_vivendes FROM estadistiques_ine WHERE codi_provincia = ? AND any = ?
    `).get(codi, darrerAny.any - 1) as any;

    const variacio = anterior?.finques_vivendes > 0
      ? ((provincia.finques_vivendes - anterior.finques_vivendes) / anterior.finques_vivendes) * 100
      : 0;

    // Font del butlletí oficical
    const fontComunitaria = FONTS_PER_COMUNITAT[provincia.comunitat_autonoma] || null;

    // Coordenades
    const coords = COORDS_PROVINCIA[codi] || null;

    res.json({
      ok: true,
      data: {
        ...provincia,
        latitud: coords?.lat,
        longitud: coords?.lng,
        variacio_percentual: Math.round(variacio * 10) / 10,
        vivendes_any_anterior: anterior?.finques_vivendes || 0,
      },
      tendencia,
      font_comunitaria: fontComunitaria,
      any: darrerAny.any,
      font: 'INE — Instituto Nacional de Estadística',
      url_font: 'https://www.ine.es/jaxiT3/Tabla.htm?t=10743',
      url_teju: 'https://www.boe.es/diario_boe/txt.php?id=BOE-B-2025-2515',
    });
  } catch (error) {
    console.error('Error obtenint detall província:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// GET /api/estadistiques/ine/mapa - Dades per al mapa (cerles proporcionals)
estadistiquesRoutes.get('/ine/mapa', (_req: Request, res: Response) => {
  try {
    const db = getDB();

    const darrerAny = db.prepare(
      'SELECT MAX(any) as any FROM estadistiques_ine'
    ).get() as any;

    if (!darrerAny?.any) {
      return res.json({ ok: true, data: [], any: null });
    }

    const dades = db.prepare(`
      SELECT provincia, codi_provincia, comunitat_autonoma, finques_vivendes, total_finques
      FROM estadistiques_ine
      WHERE any = ?
      ORDER BY finques_vivendes DESC
    `).all(darrerAny.any) as any[];

    const maxVivendes = Math.max(...dades.map((d: any) => d.finques_vivendes), 1);

    const punts = dades
      .filter((d: any) => COORDS_PROVINCIA[d.codi_provincia])
      .map((d: any) => ({
        provincia: d.provincia,
        codi: d.codi_provincia,
        comunitat: d.comunitat_autonoma,
        vivendes: d.finques_vivendes,
        total: d.total_finques,
        lat: COORDS_PROVINCIA[d.codi_provincia].lat,
        lng: COORDS_PROVINCIA[d.codi_provincia].lng,
        radi: Math.max(8, Math.sqrt(d.finques_vivendes / maxVivendes) * 45),
      }));

    res.json({
      ok: true,
      data: punts,
      any: darrerAny.any,
      font: 'INE',
    });
  } catch (error) {
    console.error('Error obtenint dades mapa INE:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// ═══════════════════════════════════════════════════════════════
// ══ CGPJ — Consejo General del Poder Judicial ═══════════════
// ═══════════════════════════════════════════════════════════════
// Llançaments judicials practicats (desnonaments executats)
// desglossats per tipus: hipotecari, LAU (lloguer), altres

// GET /api/estadistiques/cgpj — Resum general (últim any)
estadistiquesRoutes.get('/cgpj', (_req: Request, res: Response) => {
  try {
    const db = getDB();

    const darrerAny = db.prepare(
      "SELECT MAX(any) as any FROM estadistiques_cgpj WHERE ambit = 'ccaa'"
    ).get() as any;

    if (!darrerAny?.any) {
      return res.json({ ok: true, data: null, any: null, message: 'No hi ha dades CGPJ. Executa: npx tsx src/fetch-cgpj.ts' });
    }

    const maxAny = darrerAny.any;
    const currentYear = new Date().getFullYear();

    // If latest year == current calendar year, it's likely partial data.
    // Show the latest COMPLETE year as the primary stat instead.
    const esParcial = maxAny === currentYear;
    const any_ = esParcial && maxAny > 2022 ? maxAny - 1 : maxAny;

    // Totals nacionals (primary year — complete)
    const totals = db.prepare(`
      SELECT SUM(lanzaments_total) as total,
             SUM(lanzaments_hipotecaria) as hipotecaria,
             SUM(lanzaments_lau) as lau,
             SUM(lanzaments_altres) as altres,
             SUM(ocupacio_verbal) as ocupacio
      FROM estadistiques_cgpj
      WHERE ambit = 'ccaa' AND any = ?
    `).get(any_) as any;

    // Any anterior per variació
    const totalsAnterior = db.prepare(`
      SELECT SUM(lanzaments_total) as total
      FROM estadistiques_cgpj
      WHERE ambit = 'ccaa' AND any = ?
    `).get(any_ - 1) as any;

    const variacio = totalsAnterior?.total > 0
      ? ((totals.total - totalsAnterior.total) / totalsAnterior.total) * 100
      : null;

    // Partial year data (if exists)
    let parcial = null;
    if (esParcial) {
      const totalsParcial = db.prepare(`
        SELECT SUM(lanzaments_total) as total,
               SUM(lanzaments_hipotecaria) as hipotecaria,
               SUM(lanzaments_lau) as lau,
               SUM(lanzaments_altres) as altres,
               SUM(ocupacio_verbal) as ocupacio
        FROM estadistiques_cgpj
        WHERE ambit = 'ccaa' AND any = ?
      `).get(maxAny) as any;

      if (totalsParcial?.total > 0) {
        parcial = {
          any: maxAny,
          total: totalsParcial.total,
          hipotecaria: totalsParcial.hipotecaria || 0,
          lau: totalsParcial.lau || 0,
          altres: totalsParcial.altres || 0,
          ocupacio: totalsParcial.ocupacio || 0,
        };
      }
    }

    res.json({
      ok: true,
      data: {
        total: totals.total || 0,
        hipotecaria: totals.hipotecaria || 0,
        lau: totals.lau || 0,
        altres: totals.altres || 0,
        ocupacio: totals.ocupacio || 0,
        variacio_percentual: variacio !== null ? Math.round(variacio * 10) / 10 : null,
        total_anterior: totalsAnterior?.total || 0,
        daily_avg: totals.total > 0 ? Math.round(totals.total / 365) : 0,
      },
      any: any_,
      any_anterior: any_ - 1,
      parcial,
      font: 'CGPJ — Consejo General del Poder Judicial',
      url_font: 'https://www.poderjudicial.es/cgpj/es/Temas/Estadistica-Judicial/Estudios-e-Informes/Efecto-de-la-Crisis-en-los-organos-judiciales/',
    });
  } catch (error) {
    console.error('Error obtenint dades CGPJ:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// GET /api/estadistiques/cgpj/comunitats — Ranking per CCAA (últim any)
estadistiquesRoutes.get('/cgpj/comunitats', (_req: Request, res: Response) => {
  try {
    const db = getDB();

    const darrerAny = db.prepare(
      "SELECT MAX(any) as any FROM estadistiques_cgpj WHERE ambit = 'ccaa'"
    ).get() as any;

    if (!darrerAny?.any) {
      return res.json({ ok: true, data: [], any: null });
    }

    const maxAny = darrerAny.any;
    const currentYear = new Date().getFullYear();
    const esParcial = maxAny === currentYear;
    const any_ = esParcial && maxAny > 2022 ? maxAny - 1 : maxAny;

    const dades = db.prepare(`
      SELECT nom as comunitat_autonoma,
             lanzaments_total, lanzaments_hipotecaria, lanzaments_lau, lanzaments_altres,
             ocupacio_verbal, evolucio_percentual, poblacio, taxa_per_100k
      FROM estadistiques_cgpj
      WHERE ambit = 'ccaa' AND any = ?
      ORDER BY lanzaments_total DESC
    `).all(any_) as any[];

    // Obtenir any anterior per variació manual si evolucio_percentual és null
    const anteriors = db.prepare(`
      SELECT nom, lanzaments_total
      FROM estadistiques_cgpj
      WHERE ambit = 'ccaa' AND any = ?
    `).all(any_ - 1) as any[];

    const anteriorMap = new Map(anteriors.map((d: any) => [d.nom, d.lanzaments_total]));

    const dadesAmbVariacio = dades.map((d: any) => {
      if (d.evolucio_percentual === null) {
        const anterior = anteriorMap.get(d.comunitat_autonoma) || 0;
        d.evolucio_percentual = anterior > 0
          ? Math.round(((d.lanzaments_total - anterior) / anterior) * 1000) / 10
          : null;
      }
      d.total_anterior = anteriorMap.get(d.comunitat_autonoma) || 0;
      return d;
    });

    res.json({
      ok: true,
      data: dadesAmbVariacio,
      any: any_,
      any_anterior: any_ - 1,
      font: 'CGPJ — Consejo General del Poder Judicial',
    });
  } catch (error) {
    console.error('Error obtenint CGPJ per comunitats:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// GET /api/estadistiques/cgpj/tendencia — Evolució anual
estadistiquesRoutes.get('/cgpj/tendencia', (req: Request, res: Response) => {
  try {
    const db = getDB();
    const { comunitat } = req.query;

    let query: string;
    const params: any[] = [];

    if (comunitat) {
      query = `
        SELECT any,
               SUM(lanzaments_total) as total,
               SUM(lanzaments_hipotecaria) as hipotecaria,
               SUM(lanzaments_lau) as lau,
               SUM(lanzaments_altres) as altres,
               SUM(ocupacio_verbal) as ocupacio
        FROM estadistiques_cgpj
        WHERE ambit = 'ccaa' AND nom = ?
        GROUP BY any ORDER BY any ASC
      `;
      params.push(comunitat);
    } else {
      query = `
        SELECT any,
               SUM(lanzaments_total) as total,
               SUM(lanzaments_hipotecaria) as hipotecaria,
               SUM(lanzaments_lau) as lau,
               SUM(lanzaments_altres) as altres,
               SUM(ocupacio_verbal) as ocupacio
        FROM estadistiques_cgpj
        WHERE ambit = 'ccaa'
        GROUP BY any ORDER BY any ASC
      `;
    }

    const tendencia = db.prepare(query).all(...params);

    res.json({
      ok: true,
      data: tendencia,
      font: 'CGPJ — Consejo General del Poder Judicial',
    });
  } catch (error) {
    console.error('Error obtenint tendència CGPJ:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// GET /api/estadistiques/cgpj/provincies — Dades per província (últim any)
estadistiquesRoutes.get('/cgpj/provincies', (_req: Request, res: Response) => {
  try {
    const db = getDB();

    const darrerAny = db.prepare(
      "SELECT MAX(any) as any FROM estadistiques_cgpj WHERE ambit = 'provincia'"
    ).get() as any;

    if (!darrerAny?.any) {
      return res.json({ ok: true, data: [], any: null });
    }

    const maxAny = darrerAny.any;
    const currentYear = new Date().getFullYear();
    const esParcial = maxAny === currentYear;
    const anyShow = esParcial && maxAny > 2022 ? maxAny - 1 : maxAny;

    const dades = db.prepare(`
      SELECT nom as provincia,
             lanzaments_total, lanzaments_hipotecaria, lanzaments_lau, lanzaments_altres,
             ocupacio_verbal, execucions_hipotecaries, concursos_total, monitoris
      FROM estadistiques_cgpj
      WHERE ambit = 'provincia' AND any = ?
      ORDER BY lanzaments_total DESC
    `).all(anyShow);

    res.json({
      ok: true,
      data: dades,
      any: anyShow,
      font: 'CGPJ — Consejo General del Poder Judicial',
    });
  } catch (error) {
    console.error('Error obtenint CGPJ per províncies:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});
