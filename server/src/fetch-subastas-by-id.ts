/**
 * Scraper per ENUMERACIÓ DIRECTA d'IDs del BOE
 *
 * Bypassa completament la cerca del BOE (rate-limited/CAPTCHA)
 * i accedeix directament a les pàgines de detall individuals,
 * que NO tenen CAPTCHA ni rate-limit.
 *
 * Estratègia:
 *   1) Recull IDs nous del feed RSS del BOE (Secció IV)
 *   2) Enumera IDs seqüencials en un rang donat
 *   3) Per cada ID, baixa fitxes ver=1 (info general) i ver=3 (béns/localització)
 *   4) UPSERT a la base de dades
 *
 * Execució:
 *   npx tsx src/fetch-subastas-by-id.ts                     # RSS + rang per defecte
 *   npx tsx src/fetch-subastas-by-id.ts --from 255000 --to 259700
 *   npx tsx src/fetch-subastas-by-id.ts --rss-only           # només RSS
 *   npx tsx src/fetch-subastas-by-id.ts --year 2025 --from 240000 --to 250000
 */

import 'dotenv/config';
import { initDB, getDB } from './db/database';
import { v4 as uuid } from 'uuid';

// ─── Configuració ─────────────────────────────────────────────────
const BOE_DETAIL_URL = 'https://subastas.boe.es/detalleSubasta.php';
const BOE_RSS_URL = 'https://www.boe.es/rss/boe.php?s=4'; // Secció IV — Administración de Justicia
const DETAIL_DELAY_MS = 50;    // Retard mínim entre peticions (molt ràpid — pàgines detall no tenen rate limit)
const CONCURRENCY = 10;        // Peticions paral·leles simultànies
const BATCH_SIZE = 100;        // Log cada N IDs processats
const MAX_CONSECUTIVE_404 = 500; // Atura si 500 IDs consecutius no existeixen (rangs amb forats grans)

// ─── Args CLI ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}
const ARG_FROM = parseInt(getArg('from') || '258000', 10);
const ARG_TO = parseInt(getArg('to') || '260000', 10);
const ARG_YEAR = parseInt(getArg('year') || '2026', 10);
const ARG_PREFIX = getArg('prefix') || 'JA';  // JA, JV, JC — o 'ALL' per tots
const RSS_ONLY = args.includes('--rss-only');
const ENUM_ONLY = args.includes('--enum-only');
const SKIP_EXISTING = !args.includes('--force-update');
const ALL_PREFIXES = ['JA', 'JV', 'JC'];

// ─── Dades de referència ─────────────────────────────────────────

const NOMS_PROVINCIA: Record<string, string> = {
  '01': 'Araba/Álava', '02': 'Albacete', '03': 'Alacant/Alicante', '04': 'Almería',
  '05': 'Ávila', '06': 'Badajoz', '07': 'Illes Balears', '08': 'Barcelona',
  '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castelló',
  '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca',
  '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Gipuzkoa',
  '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León',
  '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid',
  '29': 'Málaga', '30': 'Murcia', '31': 'Navarra', '32': 'Ourense',
  '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
  '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia',
  '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel',
  '45': 'Toledo', '46': 'València', '47': 'Valladolid', '48': 'Bizkaia',
  '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla',
};

const COMUNITAT_PER_PROVINCIA: Record<string, string> = {
  '01': 'Euskadi', '02': 'Castilla-La Mancha', '03': 'Comunitat Valenciana',
  '04': 'Andalucía', '05': 'Castilla y León', '06': 'Extremadura',
  '07': 'Illes Balears', '08': 'Catalunya', '09': 'Castilla y León',
  '10': 'Extremadura', '11': 'Andalucía', '12': 'Comunitat Valenciana',
  '13': 'Castilla-La Mancha', '14': 'Andalucía', '15': 'Galicia',
  '16': 'Castilla-La Mancha', '17': 'Catalunya', '18': 'Andalucía',
  '19': 'Castilla-La Mancha', '20': 'Euskadi', '21': 'Andalucía',
  '22': 'Aragón', '23': 'Andalucía', '24': 'Castilla y León',
  '25': 'Catalunya', '26': 'La Rioja', '27': 'Galicia',
  '28': 'Comunidad de Madrid', '29': 'Andalucía', '30': 'Región de Murcia',
  '31': 'Comunidad Foral de Navarra', '32': 'Galicia',
  '33': 'Principado de Asturias', '34': 'Castilla y León',
  '35': 'Canarias', '36': 'Galicia', '37': 'Castilla y León',
  '38': 'Canarias', '39': 'Cantabria', '40': 'Castilla y León',
  '41': 'Andalucía', '42': 'Castilla y León', '43': 'Catalunya',
  '44': 'Aragón', '45': 'Castilla-La Mancha', '46': 'Comunitat Valenciana',
  '47': 'Castilla y León', '48': 'Euskadi', '49': 'Castilla y León',
  '50': 'Aragón', '51': 'Ceuta', '52': 'Melilla',
};

// ─── Funcions auxiliars ──────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function decodeHtml(text: string): string {
  return text
    .replace(/&#xF3;/g, 'ó').replace(/&#xE1;/g, 'á').replace(/&#xE9;/g, 'é')
    .replace(/&#xED;/g, 'í').replace(/&#xFA;/g, 'ú').replace(/&#xFC;/g, 'ü')
    .replace(/&#xF1;/g, 'ñ').replace(/&#xE7;/g, 'ç').replace(/&#xBA;/g, 'º')
    .replace(/&#xAA;/g, 'ª').replace(/&#xD3;/g, 'Ó').replace(/&#xC1;/g, 'Á')
    .replace(/&#xC9;/g, 'É').replace(/&#xCD;/g, 'Í').replace(/&#xDA;/g, 'Ú')
    .replace(/&#xD1;/g, 'Ñ').replace(/&#x20AC;/g, '€')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/g, ' ');
}

function capitalize(s: string): string {
  if (!s) return s;
  if (s === s.toUpperCase() && s.length > 3) {
    return s.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  }
  return s;
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
};

// ─── Tipus ────────────────────────────────────────────────────────
interface SubastaData {
  boeId: string;
  jutjat: string;
  jutjatDireccio: string;
  jutjatTelefon: string;
  jutjatEmail: string;
  ciutatJutjat: string;
  expedient: string;
  compteExpedient: string;
  anunciBOE: string;
  estat: string;
  dataInici: string | null;
  dataFi: string | null;
  horaFi: string | null;
  quantitatReclamada: string | null;
  valorSubasta: string | null;
  adreca: string;
  codiPostal: string;
  localitat: string;
  provinciaBOE: string;
  codiProvincia: string;
  tipusBe: string;
  tipusSubasta: string;
  vivendaHabitual: boolean;
  idufir: string;
  refCatastral: string;
  inscripcioRegistral: string;
  descripcio: string;
}

// ─── 1) RSS feed harvester ───────────────────────────────────────

async function harvestRSS(): Promise<string[]> {
  console.log('\n📡 Recollint IDs del feed RSS del BOE (Secció IV)...');
  const ids: string[] = [];

  try {
    const res = await fetch(BOE_RSS_URL, { headers: HEADERS });
    if (!res.ok) {
      console.warn(`  ⚠️ RSS HTTP ${res.status}`);
      return ids;
    }
    const xml = await res.text();

    // Extract SUB-JA/JV/JC IDs from RSS items
    const subRegex = /SUB-J[AVC]-\d{4}-\d{4,8}/g;
    let match: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((match = subRegex.exec(xml)) !== null) {
      if (!seen.has(match[0])) {
        seen.add(match[0]);
        ids.push(match[0]);
      }
    }

    console.log(`  ✅ ${ids.length} IDs trobats al RSS d'avui`);
    if (ids.length > 0) {
      console.log(`     Rang: ${ids[0]} ... ${ids[ids.length - 1]}`);
    }
  } catch (err) {
    console.warn(`  ⚠️ Error llegint RSS:`, err);
  }

  return ids;
}

// ─── 2) Fetch detail page ────────────────────────────────────────

async function fetchDetailPage(boeId: string): Promise<SubastaData | null> {
  // Fetch ver=1 (info general) + ver=2 (autoridad gestora/jutjat) + ver=3 (bienes) 
  let htmlGeneral = '';
  let htmlGestora = '';
  let htmlBienes = '';

  try {
    // ver=1: General info
    const res1 = await fetch(`${BOE_DETAIL_URL}?idSub=${boeId}&ver=1`, { headers: HEADERS });
    if (!res1.ok) return null;
    htmlGeneral = await res1.text();

    // Check if auction exists
    if (htmlGeneral.includes('no existe') || htmlGeneral.includes('no est') || htmlGeneral.length < 2000) {
      return null; // Doesn't exist or not active
    }

    // Small delay between requests
    await sleep(100);

    // ver=2: Autoridad gestora (court info)
    const res2 = await fetch(`${BOE_DETAIL_URL}?idSub=${boeId}&ver=2`, { headers: HEADERS });
    if (res2.ok) {
      htmlGestora = await res2.text();
    }

    await sleep(100);

    // ver=3: Property info (bienes)
    const res3 = await fetch(`${BOE_DETAIL_URL}?idSub=${boeId}&ver=3`, { headers: HEADERS });
    if (res3.ok) {
      htmlBienes = await res3.text();
    }
  } catch {
    return null;
  }

  // Parse general info (ver=1)
  let jutjat = '';
  let jutjatDireccio = '';
  let jutjatTelefon = '';
  let jutjatEmail = '';
  let ciutatJutjat = '';
  let expedient = '';
  let compteExpedient = '';
  let anunciBOE = '';
  let tipusSubasta = '';
  let estat = '';
  let dataInici: string | null = null;
  let dataFi: string | null = null;
  let horaFi: string | null = null;
  let quantitatReclamada: string | null = null;
  let valorSubasta: string | null = null;

  // Helper to extract <th>LABEL</th><td>VALUE</td>
  // First decodes HTML entities so regex can match accented characters
  const extractField = (html: string, label: string | RegExp): string => {
    const decoded = html
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
      .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é')
      .replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó')
      .replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ');
    const pat = typeof label === 'string'
      ? new RegExp(`<th[^>]*>[^<]*${label}[^<]*<\\/th>\\s*<td[^>]*>(.*?)<\\/td>`, 's')
      : new RegExp(`<th[^>]*>${label.source}<\\/th>\\s*<td[^>]*>(.*?)<\\/td>`, 's');
    const m = decoded.match(pat);
    return m ? decodeHtml(m[1].trim().replace(/<[^>]*>/g, '')).trim() : '';
  };

  // Tipo de subasta
  tipusSubasta = extractField(htmlGeneral, 'Tipo de subasta');

  // Cuenta expediente
  compteExpedient = extractField(htmlGeneral, 'Cuenta expediente');

  // Anuncio BOE
  anunciBOE = extractField(htmlGeneral, 'Anuncio BOE');

  // Estado
  estat = extractField(htmlGeneral, 'Estado');

  // Fecha inicio (ISO format from the page: 2025-08-12T18:00:00)
  const fIniRaw = extractField(htmlGeneral, /[^<]*Fecha de inicio[^<]*/);
  if (fIniRaw) {
    const isoMatch = fIniRaw.match(/(\d{4})-(\d{2})-(\d{2})T/);
    if (isoMatch) {
      dataInici = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    } else {
      const dm = fIniRaw.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (dm) dataInici = `${dm[3]}-${dm[2]}-${dm[1]}`;
    }
  }

  // Fecha conclusión / fin
  const fFinRaw = extractField(htmlGeneral, /[^<]*Fecha de (?:conclusi[oó]n|fin)[^<]*/);
  if (fFinRaw) {
    const isoMatch = fFinRaw.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (isoMatch) {
      dataFi = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      horaFi = `${isoMatch[4]}:${isoMatch[5]}`;
    } else {
      const dm = fFinRaw.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (dm) dataFi = `${dm[3]}-${dm[2]}-${dm[1]}`;
      const hm = fFinRaw.match(/(\d{2}):(\d{2})/);
      if (hm) horaFi = `${hm[1]}:${hm[2]}`;
    }
  }

  // Cantidad reclamada
  quantitatReclamada = extractField(htmlGeneral, 'Cantidad reclamada') || null;

  // Valor subasta
  valorSubasta = extractField(htmlGeneral, 'Valor subasta') || null;

  // Parse autoridad gestora (ver=2) — COURT INFO
  if (htmlGestora) {
    const desc = extractField(htmlGestora, /[^<]*Descripci[oó]n[^<]*/);
    if (desc) jutjat = desc;

    const dir = extractField(htmlGestora, /[^<]*Direcci[oó]n[^<]*/);
    if (dir) {
      jutjatDireccio = dir;
      // Extract city from address (after last ; or from postal code area)
      const parts = dir.split(';');
      const lastPart = parts[parts.length - 1].trim();
      const cpCity = lastPart.match(/\d{5}\s+(.+)/);
      if (cpCity) ciutatJutjat = cpCity[1].trim();
    }

    jutjatTelefon = extractField(htmlGestora, /[^<]*Tel[eé]fono[^<]*/);
    jutjatEmail = extractField(htmlGestora, /[^<]*Correo[^<]*/);
  }

  // Fallback: Órgano judicial from ver=1 (older format)
  if (!jutjat) {
    const courtMatch = htmlGeneral.match(/<th>[^<]*rgano[^<]*<\/th>\s*<td>(.*?)<\/td>/s);
    if (courtMatch) {
      const raw = decodeHtml(courtMatch[1].trim().replace(/<[^>]*>/g, ''));
      const dashIdx = raw.lastIndexOf(' - ');
      if (dashIdx > 0) {
        jutjat = raw.substring(0, dashIdx).trim();
        ciutatJutjat = raw.substring(dashIdx + 3).trim();
      } else {
        jutjat = raw;
      }
    }
  }

  // Expediente from cuenta expediente
  expedient = compteExpedient;

  // Parse property info (ver=3)
  let adreca = '';
  let codiPostal = '';
  let localitat = '';
  let provinciaBOE = '';
  let tipusBe = 'Vivienda';
  let vivendaHabitual = false;
  let idufir = '';
  let refCatastral = '';
  let inscripcioRegistral = '';
  let descripcio = '';

  if (htmlBienes) {
    // Check if it's actually an inmueble (real estate)
    const isInmueble = htmlBienes.includes('Inmueble') || htmlBienes.includes('inmueble') || htmlBienes.includes('Vivienda') || htmlBienes.includes('VIVIENDA');

    // Dirección
    adreca = extractField(htmlBienes, /[^<]*Direcci[oó]n[^<]*/);

    // Código Postal
    codiPostal = extractField(htmlBienes, /[^<]*[CÓó]digo Postal[^<]*/);

    // Localidad
    localitat = extractField(htmlBienes, 'Localidad');

    // Provincia (from ver=3)
    provinciaBOE = extractField(htmlBienes, 'Provincia');

    // Tipo de bien
    const tipMatch = htmlBienes.match(/Bien\s+\d+\s*-\s*(?:Inmueble|inmueble)\s*\(([^)]+)\)/i);
    if (tipMatch) tipusBe = decodeHtml(tipMatch[1].trim());

    // Vivienda habitual
    const vhRaw = extractField(htmlBienes, /[^<]*Vivienda habitual[^<]*/);
    vivendaHabitual = vhRaw.toLowerCase().includes('s');

    // IDUFIR
    idufir = extractField(htmlBienes, 'IDUFIR');

    // Referencia catastral
    refCatastral = extractField(htmlBienes, /[^<]*Referencia catastral[^<]*/);

    // Inscripción registral
    inscripcioRegistral = extractField(htmlBienes, /[^<]*Inscripci[oó]n registral[^<]*/);

    // Descripción
    const descRaw = extractField(htmlBienes, /[^<]*Descripci[oó]n[^<]*/);
    if (descRaw) descripcio = descRaw.substring(0, 800);

    // If not inmueble at all (vehicle, etc.), skip
    if (!isInmueble && !adreca && !codiPostal && !localitat) {
      if (htmlBienes.includes('Vehículo') || htmlBienes.includes('vehículo') ||
          htmlBienes.includes('VEHICULO') || htmlBienes.includes('Mueble')) {
        return null;
      }
    }
  }

  // Determine province code from postal code (most reliable)
  let codiProvincia = '';
  if (codiPostal && codiPostal.length >= 2) {
    codiProvincia = codiPostal.substring(0, 2);
  }

  // Fallback: province name from ver=3
  if ((!codiProvincia || !NOMS_PROVINCIA[codiProvincia]) && provinciaBOE) {
    const norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const provNorm = norm(provinciaBOE);
    for (const [code, name] of Object.entries(NOMS_PROVINCIA)) {
      if (norm(name) === provNorm || norm(name.split('/')[0]) === provNorm) {
        codiProvincia = code;
        break;
      }
    }
  }

  // Fallback: extract province from court text
  if (!codiProvincia || !NOMS_PROVINCIA[codiProvincia]) {
    // Try extracting from fuller court text
    for (const [prov, provName] of Object.entries(NOMS_PROVINCIA)) {
      const norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (ciutatJutjat && norm(ciutatJutjat).includes(norm(provName.split('/')[0]))) {
        codiProvincia = prov;
        break;
      }
    }
  }

  // Final fallback: Madrid
  if (!codiProvincia || !NOMS_PROVINCIA[codiProvincia]) {
    codiProvincia = '28'; // Madrid as fallback
  }

  return {
    boeId,
    jutjat,
    jutjatDireccio,
    jutjatTelefon,
    jutjatEmail,
    ciutatJutjat: capitalize(ciutatJutjat),
    expedient,
    compteExpedient,
    anunciBOE,
    tipusSubasta,
    estat,
    dataInici,
    dataFi,
    horaFi,
    quantitatReclamada,
    valorSubasta,
    adreca,
    codiPostal,
    localitat: capitalize(localitat),
    provinciaBOE,
    codiProvincia,
    tipusBe,
    vivendaHabitual,
    idufir,
    refCatastral,
    inscripcioRegistral,
    descripcio,
  };
}

// ─── 3) UPSERT a la base de dades (nou schema: adreces + desnonaments) ───
// Mode RÀPID: només guarda dades crues, sense IA ni geocodificació.
// El processament (IA + geo) es fa després amb backfill-geocode.ts.

import { upsertAdrecaRaw, type DadesAdrecaBOE } from './services/adreca';

function upsertSubasta(db: any, data: SubastaData): 'inserted' | 'updated' | 'skipped' {
  const provincia = NOMS_PROVINCIA[data.codiProvincia] || 'Desconeguda';
  const comunitat = COMUNITAT_PER_PROVINCIA[data.codiProvincia] || 'Desconeguda';

  // Crear/actualitzar adreça normalitzada + geocodificada
  const dadesAdreca: DadesAdrecaBOE = {
    adrecaRaw: data.adreca || '',
    codiPostal: data.codiPostal || '',
    localitat: data.localitat || data.ciutatJutjat || '',
    provincia,
    codiProvincia: data.codiProvincia,
    comunitatAutonoma: comunitat,
    refCatastral: data.refCatastral || '',
  };

  const adrecaId = upsertAdrecaRaw(dadesAdreca);

  // Map BOE status to app status
  let estatApp: string;
  if (data.estat.includes('Celebr') || data.estat.includes('celebr')) {
    estatApp = 'imminent';
  } else if (data.estat.includes('apertura') || data.estat.includes('Próx')) {
    estatApp = 'programat';
  } else if (data.estat.includes('Conclu') || data.estat.includes('Finaliz')) {
    estatApp = 'executat';
  } else {
    estatApp = 'programat';
  }

  const dataDesn = data.dataFi || data.dataInici || new Date().toISOString().split('T')[0];
  const urlBOE = `${BOE_DETAIL_URL}?idSub=${data.boeId}`;

  const documentUrl = data.anunciBOE
    ? `https://www.boe.es/diario_boe/txt.php?id=${data.anunciBOE}`
    : null;

  const stmt = db.prepare(`
    INSERT INTO desnonaments (
      id, adreca_id, boe_id,
      data_desnonament, hora_desnonament, estat,
      tipus_subhasta, tipus_be, vivenda_habitual,
      quantitat_reclamada, valor_subhasta,
      idufir, inscripcio_registral, descripcio,
      jutjat, jutjat_adreca, jutjat_telefon, jutjat_email,
      num_procediment, expedient,
      font_oficial, url_font, document_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(boe_id) DO UPDATE SET
      data_desnonament=excluded.data_desnonament,
      hora_desnonament=excluded.hora_desnonament,
      estat=excluded.estat,
      tipus_subhasta=excluded.tipus_subhasta,
      tipus_be=excluded.tipus_be,
      vivenda_habitual=excluded.vivenda_habitual,
      quantitat_reclamada=excluded.quantitat_reclamada,
      valor_subhasta=excluded.valor_subhasta,
      idufir=excluded.idufir,
      inscripcio_registral=excluded.inscripcio_registral,
      descripcio=excluded.descripcio,
      jutjat=excluded.jutjat,
      jutjat_adreca=excluded.jutjat_adreca,
      jutjat_telefon=excluded.jutjat_telefon,
      jutjat_email=excluded.jutjat_email,
      num_procediment=excluded.num_procediment,
      expedient=excluded.expedient,
      url_font=excluded.url_font,
      document_url=excluded.document_url,
      actualitzat_el=datetime('now')
  `);

  const id = uuid();
  const result = stmt.run(
    id, adrecaId, data.boeId,
    dataDesn, data.horaFi || null, estatApp,
    data.tipusSubasta || null, data.tipusBe || null, data.vivendaHabitual ? 1 : 0,
    data.quantitatReclamada || null, data.valorSubasta || null,
    data.idufir || null, data.inscripcioRegistral || null,
    data.descripcio || null,
    data.jutjat || null, data.jutjatDireccio || null,
    data.jutjatTelefon || null, data.jutjatEmail || null,
    data.anunciBOE || null, data.compteExpedient || null,
    'Portal de Subastas BOE — subastas.boe.es',
    urlBOE,
    documentUrl,
  );

  return result.changes > 0 ? 'inserted' : 'skipped';
}

// ─── Pipeline principal ──────────────────────────────────────────

/**
 * Executa N promeses en paral·lel amb un límit de concurrència.
 */
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
      await sleep(DETAIL_DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  console.log('🏛️  Alerta Desnona — Scraper RÀPID per ENUMERACIÓ DIRECTA d\'IDs\n');
  console.log('   ⚡ Mode RÀPID: paral·lel + sense IA/geocodificació');
  console.log('   Després executar: npx tsx src/backfill-geocode.ts\n');

  initDB();
  const db = getDB();

  // Load known IDs to skip
  const knownBoeIds = new Set(
    (db.prepare('SELECT boe_id FROM desnonaments WHERE boe_id IS NOT NULL').all() as any[]).map(r => r.boe_id)
  );
  console.log(`📊 IDs existents a la BD: ${knownBoeIds.size}`);

  // Collect all IDs to process
  const idsToProcess: string[] = [];

  // Step 1: RSS harvest
  if (!ENUM_ONLY) {
    const rssIds = await harvestRSS();
    for (const id of rssIds) {
      if (!SKIP_EXISTING || !knownBoeIds.has(id)) {
        idsToProcess.push(id);
      }
    }
  }

  // Step 2: Sequential enumeration
  if (!RSS_ONLY) {
    const prefixes = ARG_PREFIX === 'ALL' ? ALL_PREFIXES : [ARG_PREFIX];
    for (const prefix of prefixes) {
      console.log(`\n🔢 Enumerant IDs: SUB-${prefix}-${ARG_YEAR}-${ARG_FROM} a SUB-${prefix}-${ARG_YEAR}-${ARG_TO}`);
      const rangeSize = ARG_TO - ARG_FROM + 1;
      let skippedExisting = 0;

      for (let n = ARG_FROM; n <= ARG_TO; n++) {
        const boeId = `SUB-${prefix}-${ARG_YEAR}-${String(n).padStart(6, '0')}`;
        if (SKIP_EXISTING && knownBoeIds.has(boeId)) {
          skippedExisting++;
          continue;
        }
        idsToProcess.push(boeId);
      }

      console.log(`   Rang total: ${rangeSize} | Nous a processar: ${rangeSize - skippedExisting} | Ja existents: ${skippedExisting}`);
    }
  }

  // Deduplicate
  const uniqueIds = [...new Set(idsToProcess)];
  console.log(`\n🎯 Total IDs a processar: ${uniqueIds.length}`);
  console.log(`⚡ Concurrència: ${CONCURRENCY} paral·lels | Retard: ${DETAIL_DELAY_MS}ms`);

  if (uniqueIds.length === 0) {
    console.log('ℹ️  No hi ha IDs nous a processar.');
    process.exit(0);
  }

  // Step 3: Fetch detail pages in PARALLEL batches and UPSERT (raw, fast)
  let processed = 0;
  let found = 0;
  let inserted = 0;
  let notFound = 0;
  let errors = 0;
  let consecutive404 = 0;
  let shouldStop = false;

  console.log('\n📥 Descarregant fitxes en paral·lel...\n');

  const startTime = Date.now();

  // Process in chunks for progress reporting + early stop on consecutive 404s
  const CHUNK_SIZE = CONCURRENCY * 5; // 50 IDs per chunk

  for (let chunkStart = 0; chunkStart < uniqueIds.length && !shouldStop; chunkStart += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(chunkStart, chunkStart + CHUNK_SIZE);

    const results = await parallelMap(
      chunk,
      async (boeId) => {
        try {
          return { boeId, data: await fetchDetailPage(boeId) };
        } catch {
          return { boeId, data: null };
        }
      },
      CONCURRENCY,
    );

    // Process results (synchronous DB writes — fast)
    for (const { boeId, data } of results) {
      processed++;

      if (!data) {
        notFound++;
        consecutive404++;
        if (consecutive404 >= MAX_CONSECUTIVE_404 && !RSS_ONLY) {
          console.log(`\n⚠️  ${MAX_CONSECUTIVE_404} IDs consecutius no trobats — probable fi del rang`);
          shouldStop = true;
          break;
        }
      } else {
        consecutive404 = 0;
        found++;
        const result = upsertSubasta(db, data);
        if (result === 'inserted') inserted++;
      }
    }

    // Progress log
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (processed / ((Date.now() - startTime) / 1000)).toFixed(0);
    const pct = ((processed / uniqueIds.length) * 100).toFixed(1);
    console.log(
      `  [${pct}%] Processats: ${processed}/${uniqueIds.length} | ` +
      `Trobats: ${found} | 404s: ${notFound} | ` +
      `⏱️ ${elapsed}s | 🚀 ${rate} IDs/s`
    );
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary
  const totalDB = (db.prepare('SELECT COUNT(*) as c FROM desnonaments').get() as any).c;
  const unparsed = (db.prepare('SELECT COUNT(*) as c FROM adreces WHERE nom_via IS NULL').get() as any).c;
  const ungeocoded = (db.prepare('SELECT COUNT(*) as c FROM adreces WHERE geocodat = 0').get() as any).c;

  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUM');
  console.log('═'.repeat(60));
  console.log(`  Temps total:      ${totalTime}s`);
  console.log(`  Processats:       ${processed}`);
  console.log(`  Trobats (reals):  ${found}`);
  console.log(`  No existeixen:    ${notFound}`);
  console.log(`  Inserits (nous):  ${inserted}`);
  console.log(`  TOTAL A LA BD:    ${totalDB}`);
  console.log('═'.repeat(60));
  console.log(`\n⚡ Pendent de processar:`);
  console.log(`  🤖 Adreces sense IA:       ${unparsed}`);
  console.log(`  🗺️  Adreces sense geocodar: ${ungeocoded}`);
  console.log(`\n👉 Executa: npx tsx src/backfill-geocode.ts`);

  // Province distribution (from adreces JOIN)
  const perProv = db.prepare(`
    SELECT a.provincia, COUNT(*) as total 
    FROM desnonaments d JOIN adreces a ON d.adreca_id = a.id 
    GROUP BY a.provincia ORDER BY total DESC
  `).all() as Array<{ provincia: string; total: number }>;
  console.log('\n📍 Distribució per província:');
  for (const p of perProv) {
    console.log(`  ${(p.provincia || 'Desconeguda').padEnd(28)} ${String(p.total).padStart(5)}`);
  }

  console.log('\n🎉 Scraping completat!');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
