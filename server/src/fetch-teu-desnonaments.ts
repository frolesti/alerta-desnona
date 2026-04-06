/**
 * SCRAPER TEU — Tablón Edictal Único del BOE
 *
 * Cerca edictes judicials d'Administració de Justícia relacionats amb
 * desnonaments per IMPAGAMENT DE LLOGUER i OCUPACIÓ IL·LEGAL.
 *
 * Fonts:
 *   - API oberta del BOE: https://www.boe.es/datosabiertos/api/teu/
 *   - Filtre: edictes que contenen paraules clau de desnonaments
 *
 * Cobertura afegida:
 *   - Desahucios por impago de alquiler (desnonaments per impagament)
 *   - Desahucios por ocupación ilegal (desnonaments per ocupació)
 *   - Lanzamientos judiciales (execucions de desnonaments)
 *   - Requerimientos de desalojo (requeriments de desallotjament)
 *
 * Execució:
 *   npx tsx src/fetch-teu-desnonaments.ts                  # Avui
 *   npx tsx src/fetch-teu-desnonaments.ts --days 7         # Últims 7 dies
 *   npx tsx src/fetch-teu-desnonaments.ts --date 2026-03-15 # Data concreta
 *   npx tsx src/fetch-teu-desnonaments.ts --dry-run        # Només mostra
 */

import 'dotenv/config';
import { initDB, getDB } from './db/database';
import { upsertAdrecaRaw, type DadesAdrecaBOE } from './services/adreca';
import { v4 as uuid } from 'uuid';
import OpenAI from 'openai';

// ─── Config ──────────────────────────────────────────────────────

const DELAY_MS = 300;           // Retard entre peticions al BOE
const CONCURRENCY = 3;          // Peticions simultànies (respectuosos amb el BOE)
const MAX_PER_DAY = 2000;       // Límit de seguretat per dia

// API urls del BOE
const BOE_TEU_API = 'https://www.boe.es/datosabiertos/api/teu/anuncios';
const BOE_TEU_DETAIL = 'https://www.boe.es/diario_boe/txt.php';

// IA per extreure dades de l'edicte
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'ollama',
  baseURL: process.env.AI_BASE_URL || undefined,
});
const AI_MODEL = process.env.AI_MODEL || 'gemini-2.0-flash';

// ─── Args CLI ────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const ARG_DAYS = parseInt(getArg('days') || '1', 10);
const ARG_DATE = getArg('date');
const DRY_RUN = args.includes('--dry-run');

// ─── Paraules clau per filtrar edictes rellevants ────────────────

const KEYWORDS_DESNONAMENT = [
  // Desahucios
  'desahucio', 'desahuci',
  'desalojo', 'desallotjament',
  'lanzamiento',
  // Impago
  'impago', 'falta de pago', 'impagament',
  'resolución.*arrendamiento', 'arrendamiento.*resolución',
  'juicio.*verbal.*desahucio',
  'juicio de desahucio',
  // Ocupación
  'ocupación ilegal', 'ocupació il·legal', 'ocupación ilegítima',
  'precario', 'precari',
  'usurpación', 'usurpació',
  // Procedimientos
  'procedimiento de desahucio',
  'demanda de desahucio',
  'decreto.*lanzamiento',
  'señalamiento.*lanzamiento',
  'diligencia.*lanzamiento',
];

const KEYWORD_REGEX = new RegExp(KEYWORDS_DESNONAMENT.join('|'), 'i');

// ─── Classificació del tipus de procediment ──────────────────────

function classificarProcediment(text: string): string {
  const t = text.toLowerCase();

  // Impago de lloguer
  if (
    t.includes('impago') ||
    t.includes('falta de pago') ||
    t.includes('impagament') ||
    t.includes('arrendamiento') ||
    (t.includes('juicio verbal') && (t.includes('desahucio') || t.includes('arrendamiento'))) ||
    t.includes('rentas') ||
    t.includes('renta') && t.includes('alquiler')
  ) {
    return 'impago_alquiler';
  }

  // Ocupació il·legal
  if (
    t.includes('ocupación ilegal') ||
    t.includes('ocupación ilegítima') ||
    t.includes('ocupació') ||
    t.includes('precario') ||
    t.includes('precari') ||
    t.includes('usurpación') ||
    t.includes('usurpació')
  ) {
    return 'ocupacion';
  }

  // Si té "desahucio" o "lanzamiento" genèric, intentem discriminar
  if (t.includes('hipoteca') || t.includes('ejecución hipotecaria')) {
    return 'ejecucion_hipotecaria';
  }

  // Mesura cautelar
  if (t.includes('cautelar') || t.includes('medida cautelar')) {
    return 'cautelar';
  }

  // Desconegut (però és un desnonament)
  return 'desconegut';
}

// ─── Mapa de províncies ──────────────────────────────────────────

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

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0].replace(/-/g, '');
}

const HEADERS = {
  'User-Agent': 'AlertaDesnona/2.0 (contacte: alerta-desnona)',
  'Accept': 'application/json,text/html',
};

// ─── Interfícies ─────────────────────────────────────────────────

interface EdicteTEU {
  id: string;           // Ex: "TEU-A-2026-0001234"
  fecha: string;        // "20260401"
  seccion: string;      // "ADMINISTRACIÓN DE JUSTICIA"
  organo: string;       // "JUZGADOS DE PRIMERA INSTANCIA"
  emisor: string;       // "Juzgado de Primera Instancia nº 3 de Barcelona"
  materia: string;
  titulo: string;
  url_html: string;
  url_xml?: string;
}

interface DadesDesnonamentTEU {
  teuId: string;
  jutjat: string;
  localitat: string;
  provincia: string;
  codiProvincia: string;
  adreca: string;
  codiPostal: string;
  dataDesnonament: string;
  horaDesnonament: string | null;
  tipusProcediment: string;
  expedient: string;
  descripcio: string;
  urlFont: string;
}

// ─── 1) Obtenir llista d'edictes d'un dia ────────────────────────

async function fetchEdictesDia(date: Date): Promise<EdicteTEU[]> {
  const dateStr = formatDate(date);
  const url = `${BOE_TEU_API}?fecha_publicacion=${dateStr}`;

  console.log(`\n📡 Buscant edictes TEU per ${date.toISOString().split('T')[0]}...`);

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      console.warn(`  ⚠️ TEU API HTTP ${res.status} per ${dateStr}`);
      return [];
    }

    const contentType = res.headers.get('content-type') || '';
    let edictes: EdicteTEU[] = [];

    if (contentType.includes('json')) {
      const data = await res.json() as any;
      // L'API del BOE pot retornar un objecte amb "data" o un array directament
      const items = data.data || data.items || data || [];
      if (Array.isArray(items)) {
        edictes = items.map((it: any) => ({
          id: it.identificador || it.id || '',
          fecha: it.fecha_publicacion || dateStr,
          seccion: it.seccion || '',
          organo: it.organo || '',
          emisor: it.emisor || '',
          materia: it.materia || '',
          titulo: it.titulo || it.title || '',
          url_html: it.url_html || it.url_pdf || it.url || '',
          url_xml: it.url_xml || '',
        }));
      }
    } else {
      // Fallback: parsejar XML/HTML
      const text = await res.text();
      const idMatches = text.matchAll(/TEU-[A-Z]-\d{4}-\d{5,8}/g);
      for (const m of idMatches) {
        edictes.push({
          id: m[0],
          fecha: dateStr,
          seccion: 'ADMINISTRACIÓN DE JUSTICIA',
          organo: '', emisor: '', materia: '', titulo: '',
          url_html: `${BOE_TEU_DETAIL}?id=${m[0]}`,
        });
      }
    }

    console.log(`  📋 ${edictes.length} edictes totals trobats`);
    return edictes;
  } catch (err: any) {
    console.warn(`  ⚠️ Error TEU: ${err.message}`);
    return [];
  }
}

// ─── 2) Filtrar edictes rellevants per desnonaments ──────────────

function filtrarEdictesDesnonament(edictes: EdicteTEU[]): EdicteTEU[] {
  return edictes.filter(e => {
    // Primer filtre: secció d'Administració de Justícia
    const isJusticia = !e.seccion ||
      e.seccion.includes('JUSTICIA') ||
      e.seccion.includes('JUZGADO');

    if (!isJusticia) return false;

    // Segon filtre: el títol o matèria conté paraules clau
    const text = `${e.titulo} ${e.materia} ${e.emisor}`.toLowerCase();
    return KEYWORD_REGEX.test(text);
  });
}

// ─── 3) Obtenir text complet de l'edicte ─────────────────────────

async function fetchEdicteText(edicte: EdicteTEU): Promise<string | null> {
  const url = edicte.url_html || `${BOE_TEU_DETAIL}?id=${edicte.id}`;

  try {
    const res = await fetch(url, { headers: { ...HEADERS, Accept: 'text/html' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;

    const html = await res.text();

    // Extreure el contingut principal de l'edicte (treure HTML)
    // El cos principal sol estar dins <div class="documento-teu"> o similar
    const bodyMatch = html.match(/<div[^>]*class="[^"]*(?:documento|textoIntegro|texto)[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/<body[^>]*>([\s\S]*)<\/body>/i);

    if (bodyMatch) {
      return bodyMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 5000); // Limitar a 5K chars
    }

    // Fallback: tot el text sense tags
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000);
  } catch {
    return null;
  }
}

// ─── 4) Extreure dades amb IA ────────────────────────────────────

const TEU_SYSTEM_PROMPT = `Ets un expert jurídic en desnonaments a Espanya. Analitzes edictes judicials del BOE (Tablón Edictal) i extreus dades estructurades.

TASCA: Donat el text d'un edicte judicial, extrau:
- adreca: adreça completa de l'immoble afectat (carrer, número, pis, porta, CP, localitat). Null si no hi ha.
- codi_postal: codi postal (5 dígits). Null si no apareix.
- localitat: nom del municipi. Null si no apareix.
- provincia: nom de la província. Null si no apareix.
- data_desnonament: data del llançament/desnonament en format YYYY-MM-DD. Null si no s'esmenta.
- hora_desnonament: hora si s'indica (ex: "10:00"). Null si no.
- tipus: un de: "impago_alquiler", "ocupacion", "cautelar", "ejecucion_hipotecaria", "desconegut"
- expedient: número d'expedient o procediment (ex: "1234/2024"). Null si no apareix.
- resum: resum breu (1-2 frases) del desnonament

REGLES:
- Busca paraules clau: "desahucio", "lanzamiento", "desalojo", "impago", "arrendamiento", "ocupación", "precario"
- Si diu "juicio verbal de desahucio por falta de pago" → tipus "impago_alquiler"
- Si diu "ocupación" o "precario" → tipus "ocupacion"
- Si diu "ejecución hipotecaria" → tipus "ejecucion_hipotecaria"
- Si no pots determinar → tipus "desconegut"
- Si l'edicte NO tracta de desnonament/llançament d'un immoble, retorna {"rellevant": false}

RESPOSTA: JSON amb els camps indicats. Si no és rellevant: {"rellevant": false}`;

async function parsejarEdicteTEU(text: string): Promise<DadesDesnonamentTEU | null> {
  if (!process.env.OPENAI_API_KEY || !text || text.length < 50) {
    return null;
  }

  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: 0,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: TEU_SYSTEM_PROMPT },
        { role: 'user', content: text.substring(0, 4000) },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    // Extreure JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Si la IA diu que no és rellevant
    if (parsed.rellevant === false) return null;

    return {
      teuId: '',
      jutjat: '',
      localitat: parsed.localitat || '',
      provincia: parsed.provincia || '',
      codiProvincia: '',
      adreca: parsed.adreca || '',
      codiPostal: parsed.codi_postal || '',
      dataDesnonament: parsed.data_desnonament || '',
      horaDesnonament: parsed.hora_desnonament || null,
      tipusProcediment: parsed.tipus || 'desconegut',
      expedient: parsed.expedient || '',
      descripcio: parsed.resum || '',
      urlFont: '',
    };
  } catch (err: any) {
    console.warn(`  ⚠️ IA error: ${err.message}`);
    return null;
  }
}

// ─── 5) Batch parsing amb IA (eficient) ──────────────────────────

async function parsejarEdictesEnBatch(
  edictes: Array<{ id: string; text: string; url: string; jutjat: string }>,
): Promise<Array<DadesDesnonamentTEU | null>> {
  if (!process.env.OPENAI_API_KEY || edictes.length === 0) {
    return edictes.map(() => null);
  }

  const BATCH_SIZE = 5; // Edictes per batch IA
  const results: Array<DadesDesnonamentTEU | null> = [];

  for (let i = 0; i < edictes.length; i += BATCH_SIZE) {
    const batch = edictes.slice(i, i + BATCH_SIZE);

    // Intentem fer-ho en un sol prompt per estalviar crides
    const numberedTexts = batch
      .map((e, idx) => `--- EDICTE ${idx + 1} ---\n${e.text.substring(0, 2000)}\n`)
      .join('\n');

    try {
      const response = await openai.chat.completions.create({
        model: AI_MODEL,
        temperature: 0,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: TEU_SYSTEM_PROMPT + `\n\nAra et passo MÚLTIPLES edictes separats per "--- EDICTE N ---". Retorna un JSON amb clau "resultats" que sigui un array amb un objecte per cadascun, en el MATEIX ORDRE. Si un no és rellevant, posa {"rellevant": false} a la seva posició.` },
          { role: 'user', content: numberedTexts },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        results.push(...batch.map(() => null));
        continue;
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        results.push(...batch.map(() => null));
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const items = parsed.resultats || parsed.results || parsed.r || [];

      for (let j = 0; j < batch.length; j++) {
        const item = items[j];
        if (!item || item.rellevant === false) {
          results.push(null);
        } else {
          results.push({
            teuId: batch[j].id,
            jutjat: batch[j].jutjat || item.jutjat || '',
            localitat: item.localitat || '',
            provincia: item.provincia || '',
            codiProvincia: '',
            adreca: item.adreca || '',
            codiPostal: item.codi_postal || '',
            dataDesnonament: item.data_desnonament || '',
            horaDesnonament: item.hora_desnonament || null,
            tipusProcediment: item.tipus || 'desconegut',
            expedient: item.expedient || '',
            descripcio: item.resum || '',
            urlFont: batch[j].url,
          });
        }
      }
    } catch (err: any) {
      console.warn(`  ⚠️ Batch IA error: ${err.message}`);
      // Fallback: intentar un per un
      for (const e of batch) {
        const r = await parsejarEdicteTEU(e.text);
        if (r) {
          r.teuId = e.id;
          r.jutjat = e.jutjat;
          r.urlFont = e.url;
        }
        results.push(r);
        await sleep(1000);
      }
    }

    await sleep(2000); // Rate limit friendly
  }

  return results;
}

// ─── 6) Determinar codi de província ─────────────────────────────

function determinarCodiProvincia(provincia: string, localitat: string, jutjat: string): string {
  if (!provincia && !localitat && !jutjat) return '28'; // Madrid fallback

  const norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const searchText = norm(`${provincia} ${localitat} ${jutjat}`);

  for (const [code, name] of Object.entries(NOMS_PROVINCIA)) {
    const provNorm = norm(name.split('/')[0]);
    if (searchText.includes(provNorm)) {
      return code;
    }
  }

  return '28';
}

// ─── 7) UPSERT a la base de dades ───────────────────────────────

function upsertDesnonamentTEU(db: any, data: DadesDesnonamentTEU): 'inserted' | 'skipped' {
  // Ja existeix?
  const existing = db.prepare('SELECT id FROM desnonaments WHERE boe_id = ?').get(data.teuId) as any;
  if (existing) return 'skipped';

  const codiProvincia = data.codiProvincia || determinarCodiProvincia(data.provincia, data.localitat, data.jutjat);
  const provincia = NOMS_PROVINCIA[codiProvincia] || data.provincia || 'Desconeguda';
  const comunitat = COMUNITAT_PER_PROVINCIA[codiProvincia] || 'Desconeguda';

  // Crear adreça
  const dadesAdreca: DadesAdrecaBOE = {
    adrecaRaw: data.adreca || `${data.localitat || ''}, ${provincia}`,
    codiPostal: data.codiPostal || '',
    localitat: data.localitat || '',
    provincia,
    codiProvincia,
    comunitatAutonoma: comunitat,
    refCatastral: '',
  };

  const adrecaId = upsertAdrecaRaw(dadesAdreca);

  // Data del desnonament (si no en tenim, usem la data actual + 30 dies com a referència)
  const dataDesn = data.dataDesnonament || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const urlFont = data.urlFont || `${BOE_TEU_DETAIL}?id=${data.teuId}`;

  const stmt = db.prepare(`
    INSERT INTO desnonaments (
      id, adreca_id, boe_id,
      data_desnonament, hora_desnonament, estat,
      tipus_procediment,
      tipus_be, vivenda_habitual,
      descripcio,
      jutjat,
      expedient,
      font_oficial, url_font, document_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(
      uuid(), adrecaId, data.teuId,
      dataDesn, data.horaDesnonament, 'programat',
      data.tipusProcediment,
      'Vivienda', 1,
      data.descripcio || null,
      data.jutjat || null,
      data.expedient || null,
      'Tablón Edictal Único — BOE TEU',
      urlFont,
      urlFont,
    );
    return 'inserted';
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) return 'skipped';
    console.warn(`  ⚠️ DB error: ${err.message}`);
    return 'skipped';
  }
}

// ─── Pipeline principal ──────────────────────────────────────────

async function main() {
  const start = Date.now();

  console.log('🏛️  Alerta Desnona — Scraper TEU (desnonaments per impagament i ocupació)\n');
  if (DRY_RUN) console.log('🏃 Mode DRY RUN — no es fan canvis\n');

  initDB();
  const db = getDB();

  // Determinar dates a processar
  const dates: Date[] = [];
  if (ARG_DATE) {
    dates.push(new Date(ARG_DATE + 'T00:00:00'));
  } else {
    for (let i = 0; i < ARG_DAYS; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d);
    }
  }

  // IDs ja existents
  const knownIds = new Set(
    (db.prepare("SELECT boe_id FROM desnonaments WHERE boe_id LIKE 'TEU-%'").all() as any[]).map(r => r.boe_id),
  );
  console.log(`📊 Edictes TEU existents a la BD: ${knownIds.size}`);

  let totalEdictes = 0;
  let totalRellevants = 0;
  let totalInserits = 0;
  let totalSkipped = 0;

  for (const date of dates) {
    // 1. Obtenir edictes del dia
    const edictes = await fetchEdictesDia(date);
    totalEdictes += edictes.length;

    if (edictes.length === 0) continue;

    // 2. Filtrar per paraules clau (primer filtre — ràpid)
    let rellevants = filtrarEdictesDesnonament(edictes);

    // Treure duplicats
    rellevants = rellevants.filter(e => !knownIds.has(e.id));

    console.log(`  🔍 ${rellevants.length} edictes potencialment de desnonaments (de ${edictes.length})`);
    totalRellevants += rellevants.length;

    if (rellevants.length === 0 || DRY_RUN) continue;

    // Limitar per seguretat
    if (rellevants.length > MAX_PER_DAY) {
      console.log(`  ⚠️ Limitat a ${MAX_PER_DAY} edictes`);
      rellevants = rellevants.slice(0, MAX_PER_DAY);
    }

    // 3. Baixar text complet de cada edicte
    console.log(`  📥 Baixant text de ${rellevants.length} edictes...`);
    const edictesAmbText: Array<{ id: string; text: string; url: string; jutjat: string }> = [];

    for (let i = 0; i < rellevants.length; i++) {
      const e = rellevants[i];
      const text = await fetchEdicteText(e);

      if (text && text.length > 50) {
        // Segon filtre: confirmar que el text complet conté paraules de desnonament
        if (KEYWORD_REGEX.test(text)) {
          edictesAmbText.push({
            id: e.id,
            text,
            url: e.url_html || `${BOE_TEU_DETAIL}?id=${e.id}`,
            jutjat: e.emisor || e.organo || '',
          });
        }
      }

      await sleep(DELAY_MS);

      if ((i + 1) % 20 === 0) {
        console.log(`    [${i + 1}/${rellevants.length}] baixats...`);
      }
    }

    console.log(`  ✅ ${edictesAmbText.length} edictes confirmats amb text de desnonament`);

    if (edictesAmbText.length === 0) continue;

    // 4. Parsejar amb IA en batch
    console.log(`  🤖 Parsejant amb IA (${edictesAmbText.length} edictes)...`);
    const resultatsIA = await parsejarEdictesEnBatch(edictesAmbText);

    // 5. UPSERT a la BD
    for (let i = 0; i < resultatsIA.length; i++) {
      const dades = resultatsIA[i];
      if (!dades) continue;

      const result = upsertDesnonamentTEU(db, dades);
      if (result === 'inserted') {
        totalInserits++;
        knownIds.add(dades.teuId);
      } else {
        totalSkipped++;
      }
    }

    console.log(`  → ${totalInserits} inserits, ${totalSkipped} duplicats omesos`);
  }

  // Resum final
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 RESUM TEU');
  console.log('═'.repeat(60));
  console.log(`  Dies processats:     ${dates.length}`);
  console.log(`  Edictes totals:      ${totalEdictes}`);
  console.log(`  Potencials desnon.:  ${totalRellevants}`);
  console.log(`  Inserits (nous):     ${totalInserits}`);
  console.log(`  Duplicats:           ${totalSkipped}`);
  console.log(`  Temps:               ${elapsed}s`);

  // Stats per tipus
  if (totalInserits > 0) {
    const perTipus = db.prepare(`
      SELECT tipus_procediment, COUNT(*) as n
      FROM desnonaments
      WHERE font_oficial LIKE '%TEU%'
      GROUP BY tipus_procediment
    `).all() as Array<{ tipus_procediment: string; n: number }>;

    console.log('\n  Distribució per tipus:');
    for (const t of perTipus) {
      const label = {
        impago_alquiler: '🏠 Impagament lloguer',
        ocupacion: '🚪 Ocupació il·legal',
        ejecucion_hipotecaria: '🏦 Execució hipotecària',
        cautelar: '⚖️  Mesura cautelar',
        desconegut: '❓ Tipus desconegut',
      }[t.tipus_procediment] || t.tipus_procediment;
      console.log(`    ${label}: ${t.n}`);
    }
  }

  // Stats globals
  const total = db.prepare('SELECT COUNT(*) as c FROM desnonaments').get() as any;
  console.log(`\n  TOTAL DESNONAMENTS A LA BD: ${total.c}`);
  console.log(`\n🎉 Scraping TEU completat en ${elapsed}s`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
