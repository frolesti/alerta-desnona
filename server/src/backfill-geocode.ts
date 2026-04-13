/**
 * BACKFILL GEOCODING: Re-geocodifica adreces amb millor qualitat.
 *
 * Fases:
 *   1. Cadastre API → coordenades EXACTES de l'edifici (geocodat=1)
 *      Per a les 4,661+ adreces amb ref_catastral que avui són geocodat=2 (city-level)
 *
 *   2. Photon street-level → coordenades del carrer (geocodat=2)
 *      Per a les 10,083+ adreces amb nom_via que segueixen sent city-level
 *
 *   3. Reclassificar: les que queden city-level passen a geocodat=3
 *      Per diferenciar "Nominatim carrer" (2) de "centre de ciutat" (3)
 *
 * Run: npx tsx src/backfill-geocode.ts [--phase 1|2|3] [--dry-run] [--limit N]
 */

import 'dotenv/config';
import { initDB, getDB } from './db/database';
import { geocodeCadastre, geocodeNominatim, type AdrecaParsejada } from './services/adreca';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const phaseArg = args.find(a => a.startsWith('--phase'));
const PHASE = phaseArg ? parseInt(args[args.indexOf(phaseArg) + 1] || '0') : 0; // 0 = all
const limitArg = args.find(a => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(args[args.indexOf(limitArg) + 1] || '0') : 0; // 0 = no limit

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Photon geocoder - fast, no strict rate limit
async function geocodePhotonStreet(
  tipusVia: string | null,
  nomVia: string | null,
  numero: string | null,
  codiPostal: string | null,
  localitat: string,
  provincia: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!nomVia) return null;

  const street = [tipusVia, nomVia, numero].filter(Boolean).join(' ');
  if (street.length < 4) return null;

  // Strategy 1: street + city + postal code
  const queries = [
    `${street}, ${codiPostal || ''} ${localitat}, ${provincia}, Spain`.replace(/\s+/g, ' ').trim(),
    `${street}, ${localitat}, ${provincia}, Spain`,
    `${street}, ${localitat}, Spain`,
  ];

  for (const q of queries) {
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=3`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;

      const data = await res.json() as any;
      if (!data.features?.length) continue;

      // Find the best match: prioritize results in the correct city
      const localNorm = normalizeCity(localitat);
      for (const f of data.features) {
        const props = f.properties || {};
        const fCity = normalizeCity(props.city || props.name || '');
        const fState = normalizeCity(props.state || '');

        // Check the result is in Spain and in the right area
        const [lng, lat] = f.geometry.coordinates;
        if (isNaN(lat) || isNaN(lng) || lat < 27 || lat > 44 || lng < -19 || lng > 5) continue;

        // Accept if city matches or if it's in the right region
        if (fCity === localNorm || fState.includes(normalizeCity(provincia))) {
          // Extra validation: check distance from city center isn't insane (>50km)
          return {
            lat: Math.round(lat * 1e6) / 1e6,
            lng: Math.round(lng * 1e6) / 1e6,
          };
        }
      }
    } catch { /* timeout / network error */ }
    await sleep(200);
  }

  return null;
}

function normalizeCity(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

// Validate that geocoded point is within a reasonable distance from city center
async function getCityCenter(localitat: string, provincia: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = `${localitat}, ${provincia}, Spain`;
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (data.features?.length > 0) {
      const [lng, lat] = data.features[0].geometry.coordinates;
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
  } catch { }
  return null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function main() {
  initDB();
  const db = getDB();

  console.log('🔄 BACKFILL GEOCODING');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Phase: ${PHASE || 'ALL'}`);
  if (LIMIT) console.log(`   Limit: ${LIMIT}`);
  console.log();

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: Cadastre API for addresses with ref_catastral
  // ═══════════════════════════════════════════════════════════════
  if (PHASE === 0 || PHASE === 1) {
    console.log('═══ PHASE 1: CADASTRE RE-GEOCODING ═══');

    const cadastreRows = db.prepare(`
      SELECT id, ref_catastral, provincia, localitat, adreca_original
      FROM adreces
      WHERE geocodat IN (2, 3)
        AND ref_catastral IS NOT NULL
        AND length(ref_catastral) >= 14
      ORDER BY localitat
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}
    `).all() as any[];

    console.log(`Found ${cadastreRows.length} addresses with ref_catastral to re-geocode\n`);

    const updateStmt = db.prepare(`
      UPDATE adreces SET latitud = ?, longitud = ?, geocodat = 1, actualitzat_el = datetime('now')
      WHERE id = ?
    `);

    let ok = 0, fail = 0;
    const start = Date.now();

    for (let i = 0; i < cadastreRows.length; i++) {
      const row = cadastreRows[i];
      try {
        const result = await geocodeCadastre(row.ref_catastral, row.provincia, row.localitat);
        if (result) {
          if (!DRY_RUN) {
            updateStmt.run(result.lat, result.lng, row.id);
          }
          ok++;
        } else {
          fail++;
        }
      } catch {
        fail++;
      }

      // Brief delay to be polite to Cadastre API
      await sleep(100);

      // Progress
      const done = ok + fail;
      if (done % 100 === 0 || i === cadastreRows.length - 1) {
        const pct = ((done / cadastreRows.length) * 100).toFixed(1);
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        console.log(`  [${pct}%] ${done}/${cadastreRows.length} | ✅ ${ok} | ❌ ${fail} | ⏱️ ${elapsed}s`);
      }
    }

    console.log(`\n📊 Phase 1 results: ${ok} cadastre-geocoded, ${fail} failed`);
    console.log();
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: Photon street-level for addresses with nom_via
  // ═══════════════════════════════════════════════════════════════
  if (PHASE === 0 || PHASE === 2) {
    console.log('═══ PHASE 2: STREET-LEVEL GEOCODING (Photon) ═══');

    const streetRows = db.prepare(`
      SELECT id, tipus_via, nom_via, numero, codi_postal, localitat, provincia,
             adreca_original, latitud AS old_lat, longitud AS old_lng
      FROM adreces
      WHERE geocodat IN (2, 3)
        AND nom_via IS NOT NULL
        AND localitat IS NOT NULL
      ORDER BY localitat
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}
    `).all() as any[];

    console.log(`Found ${streetRows.length} addresses with nom_via to street-geocode\n`);

    const updateStmt = db.prepare(`
      UPDATE adreces SET latitud = ?, longitud = ?, geocodat = 2, actualitzat_el = datetime('now')
      WHERE id = ?
    `);

    // Cache city centers for validation
    const cityCenters = new Map<string, { lat: number; lng: number } | null>();

    let ok = 0, fail = 0, skip = 0;
    const start = Date.now();

    // Process in batches of 5 concurrent (Photon is lenient)
    const CONCURRENCY = 3;
    let idx = 0;

    async function worker() {
      while (true) {
        const myIdx = idx++;
        if (myIdx >= streetRows.length) break;
        const row = streetRows[myIdx];

        try {
          const result = await geocodePhotonStreet(
            row.tipus_via, row.nom_via, row.numero,
            row.codi_postal, row.localitat, row.provincia,
          );

          if (result) {
            // Validate: check distance from city center is reasonable (<30km)
            const cityKey = `${row.localitat}|${row.provincia}`;
            if (!cityCenters.has(cityKey)) {
              cityCenters.set(cityKey, await getCityCenter(row.localitat, row.provincia));
              await sleep(200);
            }
            const center = cityCenters.get(cityKey);
            if (center) {
              const dist = haversineKm(result.lat, result.lng, center.lat, center.lng);
              if (dist > 30) {
                // Too far from city center — likely wrong result
                skip++;
                await sleep(150);
                continue;
              }
            }

            if (!DRY_RUN) {
              updateStmt.run(result.lat, result.lng, row.id);
            }
            ok++;
          } else {
            fail++;
          }
        } catch {
          fail++;
        }

        await sleep(150);

        // Progress
        const done = ok + fail + skip;
        if (done % 200 === 0 || myIdx === streetRows.length - 1) {
          const pct = ((done / streetRows.length) * 100).toFixed(1);
          const elapsed = ((Date.now() - start) / 1000).toFixed(0);
          const rate = (done / ((Date.now() - start) / 1000)).toFixed(1);
          console.log(`  [${pct}%] ${done}/${streetRows.length} | ✅ ${ok} | ❌ ${fail} | ⏩ ${skip} skipped | ⏱️ ${elapsed}s | ${rate}/s`);
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, streetRows.length) }, () => worker()));

    console.log(`\n📊 Phase 2 results: ${ok} street-geocoded, ${fail} not found, ${skip} rejected (too far)`);
    console.log();
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: Reclassify remaining city-level → geocodat=3
  // ═══════════════════════════════════════════════════════════════
  if (PHASE === 0 || PHASE === 3) {
    console.log('═══ PHASE 3: RECLASSIFY CITY-LEVEL ═══');

    // Addresses that are still at city-center level (same coords as other addresses
    // in the same city) should be marked geocodat=3
    // We detect this by checking if many addresses share the exact same coords
    const clusters = db.prepare(`
      SELECT latitud, longitud, COUNT(*) as n
      FROM adreces
      WHERE geocodat = 2 AND latitud IS NOT NULL
      GROUP BY latitud, longitud
      HAVING n > 2
    `).all() as any[];

    console.log(`Found ${clusters.length} coordinate clusters with >2 addresses`);

    let reclassified = 0;
    const reclassStmt = db.prepare(`
      UPDATE adreces SET geocodat = 3, actualitzat_el = datetime('now')
      WHERE geocodat = 2 AND latitud = ? AND longitud = ?
    `);

    for (const c of clusters) {
      if (!DRY_RUN) {
        const result = reclassStmt.run(c.latitud, c.longitud);
        reclassified += result.changes;
      } else {
        reclassified += c.n;
      }
    }

    console.log(`Reclassified ${reclassified} addresses from geocodat=2 → geocodat=3 (city-level)`);
    console.log();
  }

  // ═══════════════════════════════════════════════════════════════
  // FINAL STATS
  // ═══════════════════════════════════════════════════════════════
  console.log('═══ FINAL STATS ═══');
  const stats = db.prepare(`
    SELECT geocodat, COUNT(*) as n
    FROM adreces
    GROUP BY geocodat
    ORDER BY geocodat
  `).all() as any[];
  for (const s of stats) {
    const label = s.geocodat === -1 ? 'error' :
                  s.geocodat === 0 ? 'not geocoded' :
                  s.geocodat === 1 ? 'cadastre (exact)' :
                  s.geocodat === 2 ? 'street-level' :
                  s.geocodat === 3 ? 'city-level' : `unknown(${s.geocodat})`;
    console.log(`  geocodat=${s.geocodat} (${label}): ${s.n}`);
  }

  const total = (db.prepare('SELECT COUNT(*) as n FROM adreces').get() as any).n;
  const onMap = (db.prepare('SELECT COUNT(*) as n FROM adreces WHERE latitud IS NOT NULL').get() as any).n;
  console.log(`\n  Total: ${total} | On map: ${onMap} (${((onMap / total) * 100).toFixed(1)}%)`);
}

main().catch(err => { console.error('❌', err); process.exit(1); });
