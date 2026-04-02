/**
 * BULK GEOCODE: Geocodifica TOTES les adreces pendents amb Nominatim.
 *
 * Estratègia:
 *   - Busca adreces amb nom_via parsejat però geocodat=0
 *   - Primer intenta amb street+city+province (structured)
 *   - Si falla, intenta freeform
 *   - 2 concurrent requests amb delay per respectar rate limits
 *
 * Usage:
 *   npx tsx src/bulk-geocode.ts
 *   npx tsx src/bulk-geocode.ts --limit 500
 *   npx tsx src/bulk-geocode.ts --concurrency 3
 */

import 'dotenv/config';
import { initDB, getDB } from './db/database';

// ─── Config ─────────────────────────────────────────────────────

function getArg(name: string, fallback: string): number {
  const eqArg = process.argv.find(a => a.startsWith(`--${name}=`));
  if (eqArg) return parseInt(eqArg.split('=')[1], 10);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return parseInt(process.argv[idx + 1], 10);
  return parseInt(fallback, 10);
}

const LIMIT = getArg('limit', '999999');
const CONCURRENCY = getArg('concurrency', '2');
const DELAY_MS = 600; // ms between requests per worker

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

interface AdrecaRow {
  id: string;
  adreca_original: string;
  tipus_via: string | null;
  nom_via: string | null;
  numero: string | null;
  codi_postal: string | null;
  localitat: string | null;
  provincia: string | null;
}

// ─── Geocoding function ─────────────────────────────────────────

async function geocodeAddress(a: AdrecaRow): Promise<{ lat: number; lng: number } | null> {
  const street = [a.tipus_via, a.nom_via, a.numero].filter(Boolean).join(' ');

  // Strategy 1: Structured search with street + city + province
  if (street.length > 3) {
    const params = new URLSearchParams({
      street,
      city: a.localitat || '',
      state: a.provincia || '',
      country: 'Spain',
      format: 'json',
      limit: '1',
      countrycodes: 'es',
    });
    if (a.codi_postal) params.set('postalcode', a.codi_postal);

    const result = await nominatimFetch(params);
    if (result) return result;

    await sleep(DELAY_MS);

    // Strategy 2: Without postal code
    params.delete('postalcode');
    const result2 = await nominatimFetch(params);
    if (result2) return result2;

    await sleep(DELAY_MS);
  }

  // Strategy 3: Freeform search
  const freeform = [street, a.codi_postal, a.localitat, a.provincia, 'Spain']
    .filter(Boolean).join(', ');
  const params3 = new URLSearchParams({
    q: freeform,
    format: 'json',
    limit: '1',
    countrycodes: 'es',
  });
  return await nominatimFetch(params3);
}

async function nominatimFetch(params: URLSearchParams): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `${NOMINATIM_URL}?${params}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'AlertaDesnona/2.0 (https://github.com/alerta-desnona)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      if (res.status === 429) {
        // Rate limited — wait longer
        await sleep(5000);
      }
      return null;
    }

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
  } catch {
    return null;
  }
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  initDB();
  const db = getDB();

  console.log('🗺️  BULK GEOCODE — Geocodificació massiva amb Nominatim\n');

  // Get addresses to geocode
  const pending = db.prepare(`
    SELECT id, adreca_original, tipus_via, nom_via, numero,
           codi_postal, localitat, provincia
    FROM adreces
    WHERE geocodat = 0
      AND nom_via IS NOT NULL
      AND nom_via != '???'
    ORDER BY creat_el DESC
  `).all() as AdrecaRow[];

  const toProcess = pending.slice(0, LIMIT);
  console.log(`📊 Pendents: ${pending.length} | A processar: ${toProcess.length}`);
  console.log(`🔧 Concurrency: ${CONCURRENCY} | Delay: ${DELAY_MS}ms\n`);

  if (toProcess.length === 0) {
    console.log('✅ Totes les adreces ja estan geocodificades!');
    return;
  }

  const updateGeo = db.prepare(`
    UPDATE adreces SET latitud = ?, longitud = ?, geocodat = 2, actualitzat_el = datetime('now')
    WHERE id = ?
  `);

  const markFailed = db.prepare(`
    UPDATE adreces SET geocodat = -1, actualitzat_el = datetime('now')
    WHERE id = ?
  `);

  let totalOk = 0;
  let totalFail = 0;
  let idx = 0;
  const startTime = Date.now();

  // Worker function
  async function worker() {
    while (true) {
      const myIdx = idx++;
      if (myIdx >= toProcess.length) break;

      const a = toProcess[myIdx];
      const result = await geocodeAddress(a);

      if (result) {
        updateGeo.run(result.lat, result.lng, a.id);
        totalOk++;
      } else {
        markFailed.run(a.id);
        totalFail++;
      }

      await sleep(DELAY_MS);

      // Progress report every 100
      const done = totalOk + totalFail;
      if (done % 100 === 0 || done === toProcess.length) {
        const pct = ((done / toProcess.length) * 100).toFixed(1);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const rate = (done / ((Date.now() - startTime) / 1000)).toFixed(1);
        const eta = Math.round((toProcess.length - done) / (done / ((Date.now() - startTime) / 1000)));
        console.log(`  [${pct}%] ${done}/${toProcess.length} | ✅ ${totalOk} | ❌ ${totalFail} | ⏱️ ${elapsed}s | ${rate}/s | ETA: ${eta}s`);
      }
    }
  }

  // Launch workers
  const workers = Array.from({ length: Math.min(CONCURRENCY, toProcess.length) }, () => worker());
  await Promise.all(workers);

  // Final stats
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 RESUM FINAL');
  console.log('═'.repeat(60));
  console.log(`  ✅ Geocodificades OK:  ${totalOk}`);
  console.log(`  ❌ No trobades:        ${totalFail}`);
  console.log(`  ⏱️  Temps total:        ${totalTime}s`);
  console.log(`  🚀 Velocitat:          ${(toProcess.length / parseFloat(totalTime)).toFixed(1)} adr/s`);
  console.log('═'.repeat(60));

  // Show remaining
  const remaining = (db.prepare('SELECT COUNT(*) as n FROM adreces WHERE geocodat = 0 AND nom_via IS NOT NULL').get() as any).n;
  if (remaining > 0) {
    console.log(`\n⚠️  Encara queden ${remaining} adreces pendents.`);
  } else {
    console.log('\n✅ Totes les adreces geocodificades!');
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
