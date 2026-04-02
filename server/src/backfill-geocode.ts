/**
 * Backfill: parsing IA en BATCH + geocodificació en paral·lel.
 *
 * FASE 1: Parseja adreces amb IA en grups de 20 (1 crida Gemini per grup = 20x menys crides)
 * FASE 2: Geocodifica amb Cadastre en paral·lel (10 concurrent, sense rate limit)
 * FASE 3: Geocodifica amb Nominatim en sèrie (1 req/s) per les que fallen Cadastre
 *
 * Usage:
 *   npx tsx src/backfill-geocode.ts               # Processa tot el pendent
 *   npx tsx src/backfill-geocode.ts --limit 500   # Processa com a màxim 500
 *   npx tsx src/backfill-geocode.ts --dry-run      # Mostra què es processaria
 *   npx tsx src/backfill-geocode.ts --skip-ai       # Només geocodifica (ja parsejat)
 *   npx tsx src/backfill-geocode.ts --skip-geo      # Només parseja IA (sense geocodificar)
 */

import 'dotenv/config';
import { initDB, getDB } from './db/database';
import {
  parsejarAdrecesBatch,
  geocodeCadastre,
  geocodeNominatim,
  type AdrecaParsejada,
} from './services/adreca';

const NOMINATIM_DELAY_MS = 1100;
const CADASTRE_CONCURRENCY = 10;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Parallel map with concurrency limit ────────────────────────

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
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipAI = args.includes('--skip-ai');
  const skipGeo = args.includes('--skip-geo');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1]) : Infinity;

  console.log(`\n🚀 Backfill RÀPID — IA batch + geocodificació paral·lela${dryRun ? ' (DRY RUN)' : ''}\n`);

  initDB();
  const db = getDB();

  // ═══════════════════════════════════════════════════════════════
  // FASE 1: Parsing IA en batch (20 adreces per crida Gemini)
  // ═══════════════════════════════════════════════════════════════

  if (!skipAI) {
    console.log('═'.repeat(60));
    console.log('🤖 FASE 1: Parsing IA en batch');
    console.log('═'.repeat(60));

    const unparsed = db.prepare(`
      SELECT id, adreca_original
      FROM adreces
      WHERE nom_via IS NULL AND adreca_original IS NOT NULL AND length(adreca_original) >= 3
      ORDER BY creat_el DESC
    `).all() as Array<{ id: string; adreca_original: string }>;

    const toParseAll = unparsed.slice(0, limit);
    console.log(`📊 Adreces sense parsejar: ${unparsed.length}`);
    console.log(`📊 A processar: ${toParseAll.length}`);

    if (toParseAll.length > 0 && !dryRun) {
      const updateParsed = db.prepare(`
        UPDATE adreces SET
          tipus_via = ?, nom_via = ?, numero = ?, bloc = ?, escala = ?, pis = ?, porta = ?,
          actualitzat_el = datetime('now')
        WHERE id = ?
      `);

      // Process in batches of 20 (1 Gemini API call per batch)
      const AI_BATCH = 20;
      let parsedOk = 0;
      let parsedFail = 0;
      const startAI = Date.now();

      for (let i = 0; i < toParseAll.length; i += AI_BATCH) {
        const batch = toParseAll.slice(i, i + AI_BATCH);
        const rawAddresses = batch.map(a => a.adreca_original);

        let retries = 3;
        let success = false;
        while (retries > 0 && !success) {
          try {
            const results = await parsejarAdrecesBatch(rawAddresses);

            // Update DB with parsed results
            const updateMany = db.transaction(() => {
              for (let j = 0; j < batch.length; j++) {
                const parsed = results[j];
                if (parsed && (parsed.tipusVia || parsed.nomVia)) {
                  updateParsed.run(
                    parsed.tipusVia, parsed.nomVia, parsed.numero,
                    parsed.bloc, parsed.escala, parsed.pis, parsed.porta,
                    batch[j].id,
                  );
                  parsedOk++;
                } else {
                  parsedFail++;
                }
              }
            });
            updateMany();
            success = true;
          } catch (err: any) {
            retries--;
            const msg = err?.message || String(err);
            if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate')) {
              const wait = retries > 1 ? 30000 : 60000;
              console.warn(`  ⏳ Rate limit — esperant ${wait / 1000}s (reintents: ${retries})...`);
              await new Promise(r => setTimeout(r, wait));
            } else if (retries > 0) {
              console.warn(`  ⚠️  Error batch ${i}-${i + AI_BATCH}: ${msg} — reintentant (${retries} left)...`);
              await new Promise(r => setTimeout(r, 5000));
            } else {
              console.error(`  ❌ Error batch ${i}-${i + AI_BATCH}:`, msg);
              parsedFail += batch.length;
            }
          }
        }

        const done = Math.min(i + AI_BATCH, toParseAll.length);
        const pct = ((done / toParseAll.length) * 100).toFixed(1);
        const elapsed = ((Date.now() - startAI) / 1000).toFixed(0);
        const rate = (done / ((Date.now() - startAI) / 1000)).toFixed(1);
        console.log(`  [${pct}%] ${done}/${toParseAll.length} | ✅ ${parsedOk} | ❌ ${parsedFail} | ⏱️ ${elapsed}s | ${rate} addr/s`);
      }

      const totalAI = ((Date.now() - startAI) / 1000).toFixed(1);
      console.log(`\n🤖 IA completat: ${parsedOk} parsejades, ${parsedFail} fallades en ${totalAI}s`);
      console.log(`   Crides API: ${Math.ceil(toParseAll.length / AI_BATCH)} (vs ${toParseAll.length} amb mode individual)\n`);
    } else if (toParseAll.length === 0) {
      console.log('✅ Totes les adreces ja estan parsejades!\n');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FASE 2: Geocodificació Cadastre en paral·lel
  // ═══════════════════════════════════════════════════════════════

  if (!skipGeo) {
    console.log('═'.repeat(60));
    console.log('🗺️  FASE 2: Geocodificació Cadastre (paral·lel)');
    console.log('═'.repeat(60));

    // Get addresses that have a cadastral reference but aren't geocoded
    const withCadastre = db.prepare(`
      SELECT id, ref_catastral, provincia, localitat
      FROM adreces
      WHERE geocodat = 0 AND ref_catastral IS NOT NULL AND length(ref_catastral) >= 14
      ORDER BY creat_el DESC
    `).all() as Array<{ id: string; ref_catastral: string; provincia: string; localitat: string }>;

    const toCadastre = withCadastre.slice(0, limit);
    console.log(`📊 Amb ref. cadastral sense geocodificar: ${withCadastre.length}`);
    console.log(`📊 A processar: ${toCadastre.length}`);

    if (toCadastre.length > 0 && !dryRun) {
      const updateGeo = db.prepare(`
        UPDATE adreces SET latitud = ?, longitud = ?, geocodat = ?, actualitzat_el = datetime('now')
        WHERE id = ?
      `);

      let geoOk = 0;
      let geoFail = 0;
      const startGeo = Date.now();

      // Process in chunks for progress reporting
      const CHUNK = 50;
      for (let i = 0; i < toCadastre.length; i += CHUNK) {
        const chunk = toCadastre.slice(i, i + CHUNK);

        const results = await parallelMap(
          chunk,
          async (a) => {
            const result = await geocodeCadastre(a.ref_catastral, a.provincia, a.localitat);
            return { id: a.id, result };
          },
          CADASTRE_CONCURRENCY,
        );

        // Update DB
        const updateChunk = db.transaction(() => {
          for (const { id, result } of results) {
            if (result) {
              updateGeo.run(result.lat, result.lng, 1, id);
              geoOk++;
            } else {
              geoFail++;
            }
          }
        });
        updateChunk();

        const done = Math.min(i + CHUNK, toCadastre.length);
        const pct = ((done / toCadastre.length) * 100).toFixed(1);
        console.log(`  [${pct}%] ${done}/${toCadastre.length} | ✅ ${geoOk} | ❌ ${geoFail}`);
      }

      const totalGeo = ((Date.now() - startGeo) / 1000).toFixed(1);
      console.log(`\n🗺️  Cadastre completat: ${geoOk} geocodificades, ${geoFail} fallades en ${totalGeo}s\n`);
    } else if (toCadastre.length === 0) {
      console.log('✅ Totes les adreces amb ref. cadastral ja estan geocodificades!\n');
    }

    // ═══════════════════════════════════════════════════════════════
    // FASE 3: Geocodificació Nominatim (fallback, sèrie — 1 req/s)
    // ═══════════════════════════════════════════════════════════════

    console.log('═'.repeat(60));
    console.log('🗺️  FASE 3: Geocodificació Nominatim (fallback)');
    console.log('═'.repeat(60));

    const withoutGeo = db.prepare(`
      SELECT id, adreca_original, tipus_via, nom_via, numero, bloc, escala, pis, porta,
             codi_postal, localitat, provincia
      FROM adreces
      WHERE geocodat = 0 AND nom_via IS NOT NULL
      ORDER BY creat_el DESC
    `).all() as Array<{
      id: string;
      adreca_original: string;
      tipus_via: string | null;
      nom_via: string | null;
      numero: string | null;
      bloc: string | null;
      escala: string | null;
      pis: string | null;
      porta: string | null;
      codi_postal: string;
      localitat: string;
      provincia: string;
    }>;

    const toNominatim = withoutGeo.slice(0, limit);
    console.log(`📊 Sense coordenades (amb nom_via): ${withoutGeo.length}`);
    console.log(`📊 A processar: ${toNominatim.length}`);

    if (toNominatim.length > 0 && !dryRun) {
      const updateGeo = db.prepare(`
        UPDATE adreces SET latitud = ?, longitud = ?, geocodat = ?, actualitzat_el = datetime('now')
        WHERE id = ?
      `);

      let nomOk = 0;
      let nomFail = 0;
      const startNom = Date.now();

      for (let i = 0; i < toNominatim.length; i++) {
        const a = toNominatim[i];
        const parsed: AdrecaParsejada = {
          original: a.adreca_original,
          tipusVia: a.tipus_via,
          nomVia: a.nom_via,
          numero: a.numero,
          bloc: a.bloc,
          escala: a.escala,
          pis: a.pis,
          porta: a.porta,
        };

        const result = await geocodeNominatim(parsed, a.codi_postal, a.localitat, a.provincia);
        if (result) {
          updateGeo.run(result.lat, result.lng, 2, a.id);
          nomOk++;
        } else {
          nomFail++;
        }

        if ((i + 1) % 50 === 0 || i === toNominatim.length - 1) {
          const pct = (((i + 1) / toNominatim.length) * 100).toFixed(1);
          const elapsed = ((Date.now() - startNom) / 1000).toFixed(0);
          console.log(`  [${pct}%] ${i + 1}/${toNominatim.length} | ✅ ${nomOk} | ❌ ${nomFail} | ⏱️ ${elapsed}s`);
        }

        await sleep(NOMINATIM_DELAY_MS);
      }

      const totalNom = ((Date.now() - startNom) / 1000).toFixed(1);
      console.log(`\n🗺️  Nominatim completat: ${nomOk} geocodificades, ${nomFail} fallades en ${totalNom}s\n`);
    } else if (toNominatim.length === 0) {
      console.log('✅ Totes les adreces amb nom_via ja estan geocodificades!\n');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RESUM FINAL
  // ═══════════════════════════════════════════════════════════════

  const totalAdreces = (db.prepare('SELECT COUNT(*) as c FROM adreces').get() as any).c;
  const totalParsed = (db.prepare('SELECT COUNT(*) as c FROM adreces WHERE nom_via IS NOT NULL').get() as any).c;
  const totalGeoCadastre = (db.prepare('SELECT COUNT(*) as c FROM adreces WHERE geocodat = 1').get() as any).c;
  const totalGeoNominatim = (db.prepare('SELECT COUNT(*) as c FROM adreces WHERE geocodat = 2').get() as any).c;
  const totalNoGeo = (db.prepare('SELECT COUNT(*) as c FROM adreces WHERE geocodat = 0').get() as any).c;

  console.log('═'.repeat(60));
  console.log('📊 RESUM FINAL');
  console.log('═'.repeat(60));
  console.log(`  Total adreces:        ${totalAdreces}`);
  console.log(`  Parsejades (IA):      ${totalParsed} (${((totalParsed / totalAdreces) * 100).toFixed(1)}%)`);
  console.log(`  Geocod. Cadastre:     ${totalGeoCadastre}`);
  console.log(`  Geocod. Nominatim:    ${totalGeoNominatim}`);
  console.log(`  Sense coordenades:    ${totalNoGeo}`);
  console.log(`  TOTAL al mapa:        ${totalGeoCadastre + totalGeoNominatim} (${(((totalGeoCadastre + totalGeoNominatim) / totalAdreces) * 100).toFixed(1)}%)`);
  console.log('═'.repeat(60));
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
