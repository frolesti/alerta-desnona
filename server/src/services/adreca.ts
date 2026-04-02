/**
 * Servei de normalització d'adreces amb IA i geocodificació.
 *
 * Responsabilitats:
 *   1. INTERPRETAR l'adreça RAW del BOE amb un LLM (OpenAI) — no regex!
 *      La IA entén context, errors ortogràfics, abreviatures, text legal barrejat,
 *      mescla d'idiomes, etc. i retorna camps nets i estructurats.
 *   2. Geocodificar amb l'API del Cadastre (referència cadastral → coordenades exactes)
 *   3. Fallback a Nominatim si no hi ha ref. cadastral
 *   4. UPSERT a la taula `adreces`
 */

import { getDB } from '../db/database';
import { v4 as uuid } from 'uuid';
import OpenAI from 'openai';

// ─── Client IA (compatible amb OpenAI, Ollama, Groq, etc.) ─────

/**
 * El SDK d'OpenAI pot connectar-se a QUALSEVOL API compatible:
 *
 * 1. OLLAMA (LOCAL, 100% GRATUÏT, sense compte):
 *    - Instal·la: https://ollama.com
 *    - Descarrega model: `ollama pull llama3.2` o `ollama pull qwen2.5`
 *    - .env: AI_BASE_URL=http://localhost:11434/v1
 *            AI_MODEL=llama3.2
 *            OPENAI_API_KEY=ollama  (qualsevol valor, Ollama l'ignora)
 *
 * 2. GROQ (GRATUÏT amb límits generosos):
 *    - Clau gratuïta a: https://console.groq.com
 *    - .env: AI_BASE_URL=https://api.groq.com/openai/v1
 *            AI_MODEL=llama-3.3-70b-versatile
 *            OPENAI_API_KEY=gsk_...
 *
 * 3. GOOGLE GEMINI (GRATUÏT):
 *    - Clau gratuïta a: https://aistudio.google.com/apikey
 *    - .env: AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
 *            AI_MODEL=gemini-2.0-flash
 *            OPENAI_API_KEY=AIza...
 *
 * 4. OPENAI (de pagament, ~$0.15/1M tokens amb gpt-4o-mini):
 *    - .env: OPENAI_API_KEY=sk-...
 *            AI_MODEL=gpt-4o-mini
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'ollama',
  baseURL: process.env.AI_BASE_URL || undefined, // undefined = api.openai.com per defecte
});

const AI_MODEL = process.env.AI_MODEL || 'llama3.2'; // Per defecte Ollama local

// ─── Interfícies ────────────────────────────────────────────────

export interface AdrecaParsejada {
  original: string;
  tipusVia: string | null;
  nomVia: string | null;
  numero: string | null;
  bloc: string | null;
  escala: string | null;
  pis: string | null;
  porta: string | null;
}

// ─── Prompt del sistema ─────────────────────────────────────────

const SYSTEM_PROMPT = `Ets un expert en adreces postals d'Espanya. La teva feina és interpretar adreces RAW que provenen de textos legals del BOE (Boletín Oficial del Estado) i retornar els camps estructurats nets.

Les adreces del BOE solen tenir:
- Text legal barrejat: "FINCA Nº 3, VIVIENDA SITUADA EN C/ TAL 5, 2º 1ª"
- Abreviatures: "C/", "AV.", "PZ.", "CL", "AVDA", "CTRA", "URB", "PG", "GV", "RBLA"
- Errors ortogràfics: "Cituat" per "Ciutat", "JABONERIA" per "Jabonería"
- Mescla d'idiomes: castellà, català, gallec, basc
- Codis postals mesclats dins l'adreça: "..., 28921 Alcorcón"
- Soroll legal: "escalera derecha", "portal 2", "del término municipal de..."

RETORNA SEMPRE un JSON amb exactament aquests camps:
{
  "tipus_via": "Calle|Avenida|Paseo|Plaza|Passeig|Carrer|Plaça|Rambla|Ronda|Camino|Carretera|Travesía|Callejón|Urbanización|Partida|Polígono|Glorieta|Rúa|Kalea|Cañada|Gran Vía|Passatge|Bulevar|null",
  "nom_via": "Nom del carrer net i ben capitalitzat (ex: 'de Nicolás', 'Jabonería', 'Virgen de Fátima')",
  "numero": "Només el número del portal (ex: '47', '8', '12-14', 's/n'). Mai incloure pis/porta aquí.",
  "bloc": "Bloc si n'hi ha (ex: 'A', '2'), o null",
  "escala": "Escala si n'hi ha (ex: 'Derecha', 'Izquierda', 'A', 'B'), o null",
  "pis": "Pis (ex: '1', '2', 'Bajo', 'Ático', 'Entresuelo', 'Sótano'), o null",
  "porta": "Porta/lletra (ex: '3', 'A', 'B', 'Derecha', 'Izquierda'), o null"
}

REGLES:
1. Ignora completament qualsevol text legal (FINCA, VIVIENDA, del término, situado en, etc.)
2. Ignora codis postals i noms de ciutat que apareguin mesclats (28921, Alcorcón, etc.) — només volem l'adreça del carrer
3. El "tipus_via" ha d'estar en la forma completa i correcta (mai "C/", "CL", "AV" — sinó "Calle", "Avenida")
4. El "nom_via" ha d'estar ben capitalitzat i amb els accents correctes si els pots deduir
5. No inventis res. Si un camp no existeix a l'adreça original, retorna null
6. "escalera derecha" o "esc. dcha." → escala: "Derecha", NO és porta ni bloc
7. Separa BÉ el número del portal del pis/porta. "n.47, escalera derecha, 1º 3" → numero:"47", escala:"Derecha", pis:"1", porta:"3"
8. Si l'adreça és indesxifrable o massa curta (< 3 chars), retorna tots els camps null

Respon NOMÉS amb el JSON. Cap text addicional.`;

// ─── Parser d'adreces amb IA ────────────────────────────────────

/**
 * Interpreta una adreça RAW del BOE amb un LLM.
 * Entén context, corregeix errors, separa camps nets.
 *
 * Si l'API d'OpenAI no està configurada (no hi ha OPENAI_API_KEY),
 * o falla, retorna camps buits amb l'original preservat.
 */
export async function parsejarAdreca(raw: string): Promise<AdrecaParsejada> {
  const original = raw.trim();

  if (!original || original.length < 3) {
    return { original, tipusVia: null, nomVia: null, numero: null, bloc: null, escala: null, pis: null, porta: null };
  }

  // Si no hi ha API key, retornar sense parsejar (graceful degradation)
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY no configurada — adreça sense normalitzar IA');
    return { original, tipusVia: null, nomVia: original, numero: null, bloc: null, escala: null, pis: null, porta: null };
  }

  try {
    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: 0, // Deterministic — sempre la mateixa resposta per la mateixa adreça
      max_tokens: 2000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: original },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.warn(`⚠️  IA: resposta buida per "${original.slice(0, 50)}"`);
      return { original, tipusVia: null, nomVia: original, numero: null, bloc: null, escala: null, pis: null, porta: null };
    }

    // Extreure JSON robust: pot venir amb markdown, <think>...</think>, o text extra
    const jsonMatch = content.match(/\{[^{}]*(?:"tipus_via"|"nom_via")[^{}]*\}/s);
    if (!jsonMatch) {
      console.warn(`⚠️  IA: no JSON trobat a la resposta per "${original.slice(0, 50)}"`, content.slice(0, 300));
      return { original, tipusVia: null, nomVia: original, numero: null, bloc: null, escala: null, pis: null, porta: null };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      original,
      tipusVia: parsed.tipus_via || null,
      nomVia: parsed.nom_via || null,
      numero: parsed.numero || null,
      bloc: parsed.bloc || null,
      escala: parsed.escala || null,
      pis: parsed.pis || null,
      porta: parsed.porta || null,
    };
  } catch (err: any) {
    console.error(`❌ IA: error parsejant "${original.slice(0, 50)}":`, err?.message || err);
    return { original, tipusVia: null, nomVia: original, numero: null, bloc: null, escala: null, pis: null, porta: null };
  }
}

/**
 * Versió en batch: parseja múltiples adreces en una sola crida IA.
 * Molt més eficient quan processem centenars d'adreces.
 */
export async function parsejarAdrecesBatch(adreces: string[]): Promise<AdrecaParsejada[]> {
  if (!process.env.OPENAI_API_KEY || adreces.length === 0) {
    return adreces.map(raw => ({
      original: raw.trim(),
      tipusVia: null,
      nomVia: raw.trim(),
      numero: null, bloc: null, escala: null, pis: null, porta: null,
    }));
  }

  const BATCH_SIZE = 20; // Processem en grups de 20 per no excedir el context
  const results: AdrecaParsejada[] = [];

  for (let i = 0; i < adreces.length; i += BATCH_SIZE) {
    const batch = adreces.slice(i, i + BATCH_SIZE);
    const numbered = batch.map((a, idx) => `${idx + 1}. ${a.trim()}`).join('\n');

    try {
      const response = await openai.chat.completions.create({
        model: AI_MODEL,
        temperature: 0,
        max_tokens: 8000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + `\n\nAra et passo MÚLTIPLES adreces numerades. Retorna un JSON amb clau "adreces" que sigui un array amb un objecte per cadascuna, en el MATEIX ORDRE. Cadascun amb els mateixos camps (tipus_via, nom_via, numero, bloc, escala, pis, porta).` },
          { role: 'user', content: numbered },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        // Netejar <think> blocks, markdown fences
        const cleaned = content
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim();

        // Estratègia 1: Extreure l'array directament amb regex robust
        let items: any[] = [];
        try {
          // Intentar trobar {"adreces": [...]} o {"results": [...]}
          const jsonMatch = cleaned.match(/\{[\s\S]*"(?:adreces|results)"\s*:\s*\[[\s\S]*\]\s*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            items = parsed?.adreces || parsed?.results || [];
          }
        } catch {
          // Estratègia 2: Extreure cada objecte individualment
          try {
            const allObjects = [...cleaned.matchAll(/\{[^{}]*(?:"tipus_via"|"nom_via")[^{}]*\}/gs)];
            items = allObjects.map(m => JSON.parse(m[0]));
          } catch {
            // Res — es farà fallback a individual
          }
        }

        if (items.length >= batch.length) {
          for (let j = 0; j < batch.length; j++) {
            const item = items[j];
            results.push({
              original: batch[j].trim(),
              tipusVia: item?.tipus_via || null,
              nomVia: item?.nom_via || null,
              numero: item?.numero || null,
              bloc: item?.bloc || null,
              escala: item?.escala || null,
              pis: item?.pis || null,
              porta: item?.porta || null,
            });
          }
        } else {
          // Si no coincideix el nombre, fallback individual
          console.warn(`⚠️  Batch IA: esperats ${batch.length} resultats, rebuts ${items.length} — fallback individual`);
          for (const raw of batch) {
            results.push(await parsejarAdreca(raw));
          }
        }
      } else {
        // Fallback si falla el batch
        for (const raw of batch) {
          results.push(await parsejarAdreca(raw));
        }
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate')) {
        // Rate limited — throw to let caller handle retry
        throw err;
      }
      console.error(`❌ IA batch error:`, msg);
      // Fallback a individual
      for (const raw of batch) {
        try {
          results.push(await parsejarAdreca(raw));
        } catch {
          results.push({
            original: raw.trim(),
            tipusVia: null, nomVia: raw.trim(),
            numero: null, bloc: null, escala: null, pis: null, porta: null,
          });
        }
      }
    }
  }

  return results;
}

// ─── Geocodificació ─────────────────────────────────────────────

const NOMINATIM_DELAY_MS = 1100; // 1 req/seg
const CADASTRE_URL = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC';

/**
 * Geocodifica amb l'API del Cadastre (coordenades EXACTES de l'edifici).
 * Retorna null si no es pot resoldre.
 */
export async function geocodeCadastre(
  refCatastral: string,
  provincia: string,
  localitat: string,
): Promise<{ lat: number; lng: number; adrecaCadastre: string | null } | null> {
  if (!refCatastral || refCatastral.length < 14) return null;

  try {
    const rc = refCatastral.substring(0, 14);
    const url = `${CADASTRE_URL}?SRS=EPSG:4326&Provincia=${encodeURIComponent(provincia)}&Municipio=${encodeURIComponent(localitat)}&RC=${rc}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const xml = await res.text();

    const xcen = xml.match(/<xcen>([^<]+)/);
    const ycen = xml.match(/<ycen>([^<]+)/);
    const ldt = xml.match(/<ldt>([^<]+)/);

    if (xcen && ycen) {
      const lng = parseFloat(xcen[1]);
      const lat = parseFloat(ycen[1]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= 27 && lat <= 44 && lng >= -19 && lng <= 5) {
        return {
          lat: Math.round(lat * 1000000) / 1000000,
          lng: Math.round(lng * 1000000) / 1000000,
          adrecaCadastre: ldt ? ldt[1].trim() : null,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Geocodifica amb Nominatim (OSM) — structured search.
 * Retorna null si no es pot resoldre.
 */
export async function geocodeNominatim(
  adreca: AdrecaParsejada,
  codiPostal: string,
  localitat: string,
  provincia: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    // Construir l'adreça per a Nominatim
    const street = [
      adreca.tipusVia,
      adreca.nomVia,
      adreca.numero,
    ].filter(Boolean).join(' ');

    const params = new URLSearchParams({
      format: 'json',
      limit: '1',
      countrycodes: 'es',
    });

    // Estratègia 1: structured search amb carrer + CP
    if (street.length > 3) {
      params.set('street', street);
      if (codiPostal) params.set('postalcode', codiPostal);
      params.set('city', localitat || '');
      params.set('state', provincia || '');
      params.set('country', 'Spain');

      const result = await nominatimSearch(params);
      if (result) return result;

      await sleep(NOMINATIM_DELAY_MS);

      // Estratègia 2: sense CP (a vegades el CP confon Nominatim)
      params.delete('postalcode');
      const result2 = await nominatimSearch(params);
      if (result2) return result2;

      await sleep(NOMINATIM_DELAY_MS);
    }

    // Estratègia 3: freeform (últim recurs)
    const freeform = [street, codiPostal, localitat, provincia, 'Spain']
      .filter(Boolean).join(', ');
    const params3 = new URLSearchParams({
      q: freeform,
      format: 'json',
      limit: '1',
      countrycodes: 'es',
    });
    return await nominatimSearch(params3);
  } catch {
    return null;
  }
}

async function nominatimSearch(params: URLSearchParams): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?${params}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'AlertaDesnona/2.0 (https://github.com/alerta-desnona)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;

  const results = await res.json() as Array<{ lat: string; lon: string }>;
  if (results.length > 0) {
    const lat = parseFloat(results[0].lat);
    const lng = parseFloat(results[0].lon);
    if (!isNaN(lat) && !isNaN(lng) && lat >= 27 && lat <= 44 && lng >= -19 && lng <= 5) {
      return {
        lat: Math.round(lat * 1000000) / 1000000,
        lng: Math.round(lng * 1000000) / 1000000,
      };
    }
  }
  return null;
}

// ─── UPSERT d'adreça ───────────────────────────────────────────

export interface DadesAdrecaBOE {
  adrecaRaw: string;
  codiPostal: string;
  localitat: string;
  provincia: string;
  codiProvincia: string;
  comunitatAutonoma: string;
  refCatastral: string;
}

/**
 * Crea una adreça a la BD SENSE processar (ni IA ni geocodificació).
 * Ultra-ràpid — només guarda les dades crues del BOE.
 * El processament (IA + geo) es fa després amb backfill-geocode.ts.
 */
export function upsertAdrecaRaw(dades: DadesAdrecaBOE): string {
  const db = getDB();
  const id = uuid();
  db.prepare(`
    INSERT INTO adreces (
      id, adreca_original, tipus_via, nom_via, numero, bloc, escala, pis, porta,
      codi_postal, localitat, provincia, codi_provincia, comunitat_autonoma,
      latitud, longitud, geocodat, ref_catastral
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    dades.adrecaRaw,
    null, null, null, null, null, null, null, // Sense parsejar — ho farà el backfill
    dades.codiPostal || null,
    dades.localitat || null,
    dades.provincia || null,
    dades.codiProvincia || null,
    dades.comunitatAutonoma || null,
    null, null, 0, // Sense geocodificar
    dades.refCatastral || null,
  );
  return id;
}

/**
 * Crea o actualitza una adreça a la BD.
 * Interpreta l'adreça amb IA, geocodifica (Cadastre → Nominatim), i retorna l'ID.
 */
export async function upsertAdreca(dades: DadesAdrecaBOE): Promise<string> {
  const db = getDB();

  // 1. IA interpreta l'adreça
  const parsed = await parsejarAdreca(dades.adrecaRaw);
  console.log(`  🤖 IA: "${dades.adrecaRaw.slice(0, 50)}" → ${parsed.tipusVia || ''} ${parsed.nomVia || ''} ${parsed.numero || ''} [${parsed.pis || ''}/${parsed.porta || ''}]`);

  // 2. Geocodificació
  let lat: number | null = null;
  let lng: number | null = null;
  let geocodat = 0;

  // 2a. Cadastre (si tenim referència cadastral)
  if (dades.refCatastral && dades.refCatastral.length >= 14) {
    const result = await geocodeCadastre(dades.refCatastral, dades.provincia, dades.localitat);
    if (result) {
      lat = result.lat;
      lng = result.lng;
      geocodat = 1; // 1 = cadastre (coordenades exactes de l'edifici)
    }
  }

  // 2b. Nominatim (fallback)
  if (!lat && parsed.nomVia) {
    await sleep(NOMINATIM_DELAY_MS);
    const result = await geocodeNominatim(parsed, dades.codiPostal, dades.localitat, dades.provincia);
    if (result) {
      lat = result.lat;
      lng = result.lng;
      geocodat = 2; // 2 = nominatim
    }
  }

  // 3. INSERT a la BD
  const id = uuid();
  db.prepare(`
    INSERT INTO adreces (
      id, adreca_original, tipus_via, nom_via, numero, bloc, escala, pis, porta,
      codi_postal, localitat, provincia, codi_provincia, comunitat_autonoma,
      latitud, longitud, geocodat, ref_catastral
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    dades.adrecaRaw,
    parsed.tipusVia,
    parsed.nomVia,
    parsed.numero,
    parsed.bloc,
    parsed.escala,
    parsed.pis,
    parsed.porta,
    dades.codiPostal || null,
    dades.localitat || null,
    dades.provincia || null,
    dades.codiProvincia || null,
    dades.comunitatAutonoma || null,
    lat,
    lng,
    geocodat,
    dades.refCatastral || null,
  );

  return id;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
