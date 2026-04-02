/**
 * GEOCODE PER CIUTAT: Assigna coordenades a totes les adreces
 * geocodificant només les combinacions úniques (localitat, provincia).
 * 
 * Usa Photon (komoot.io) per velocitat (sense rate limit estricte)
 * amb fallback a Nominatim.
 */

import 'dotenv/config';
import { initDB, getDB } from './db/database';

const CONCURRENCY = 5;
const DELAY_MS = 200; // petit delay entre requests
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function geocodeCity(localitat: string, provincia: string): Promise<{ lat: number; lng: number } | null> {
  // Photon (ràpid, sense rate limit estricte)
  try {
    const q = `${localitat}, ${provincia}, Spain`;
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json() as any;
      if (data.features?.length > 0) {
        const [lng, lat] = data.features[0].geometry.coordinates;
        if (!isNaN(lat) && !isNaN(lng) && lat >= 27 && lat <= 44 && lng >= -19 && lng <= 5) {
          return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
        }
      }
    }
  } catch { /* timeout */ }

  // Fallback: Nominatim
  try {
    await sleep(1100);
    const params = new URLSearchParams({ city: localitat, state: provincia, country: 'Spain', format: 'json', limit: '1', countrycodes: 'es' });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'AlertaDesnona/2.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json() as Array<{ lat: string; lon: string }>;
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        if (!isNaN(lat) && !isNaN(lng) && lat >= 27 && lat <= 44 && lng >= -19 && lng <= 5) {
          return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
        }
      }
    }
  } catch { /* timeout */ }

  return null;
}

async function main() {
  initDB();
  const db = getDB();

  console.log('🗺️  GEOCODE PER CIUTAT\n');

  // 1. Obtenir combinacions úniques (localitat, provincia)
  const cities = db.prepare(`
    SELECT DISTINCT localitat, provincia, COUNT(*) as n
    FROM adreces
    WHERE geocodat = 0 AND nom_via IS NOT NULL AND localitat IS NOT NULL
    GROUP BY localitat, provincia
    ORDER BY n DESC
  `).all() as Array<{ localitat: string; provincia: string; n: number }>;

  const totalAddresses = cities.reduce((s, c) => s + c.n, 0);
  console.log(`📊 ${cities.length} ciutats → ${totalAddresses} adreces`);
  console.log(`⏱️  ETA: ~${Math.ceil(cities.length * 0.3 / 60)} minuts (Photon + ${CONCURRENCY} concurrent)\n`);

  const updateCity = db.prepare(`
    UPDATE adreces SET latitud = ?, longitud = ?, geocodat = 2, actualitzat_el = datetime('now')
    WHERE localitat = ? AND provincia = ? AND geocodat = 0
  `);

  let geoOk = 0, geoFail = 0, addrOk = 0;
  let idx = 0;
  const start = Date.now();

  async function worker() {
    while (true) {
      const myIdx = idx++;
      if (myIdx >= cities.length) break;
      const c = cities[myIdx];
      const coords = await geocodeCity(c.localitat, c.provincia);

      if (coords) {
        const result = updateCity.run(coords.lat, coords.lng, c.localitat, c.provincia);
        addrOk += result.changes;
        geoOk++;
      } else {
        geoFail++;
      }

      await sleep(DELAY_MS);

      const done = geoOk + geoFail;
      if (done % 50 === 0 || myIdx === cities.length - 1) {
        const pct = ((done / cities.length) * 100).toFixed(1);
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        const rate = (done / ((Date.now() - start) / 1000)).toFixed(1);
        console.log(`  [${pct}%] ${done}/${cities.length} ciutats | ✅ ${geoOk} (${addrOk} adr) | ❌ ${geoFail} | ⏱️ ${elapsed}s | ${rate}/s`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cities.length) }, () => worker()));

  const totalTime = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(60)}`);
  console.log('📊 RESUM');
  console.log('═'.repeat(60));
  console.log(`  ✅ Ciutats trobades: ${geoOk}/${cities.length}`);
  console.log(`  📍 Adreces al mapa: ${addrOk}`);
  console.log(`  ⏱️  Temps: ${totalTime}s`);

  const total = (db.prepare('SELECT COUNT(*) as n FROM adreces WHERE geocodat > 0').get() as any).n;
  const all = (db.prepare('SELECT COUNT(*) as n FROM adreces').get() as any).n;
  console.log(`  🗺️  TOTAL al mapa: ${total}/${all} (${((total/all)*100).toFixed(1)}%)`);
  console.log('═'.repeat(60));
}

main().catch(err => { console.error('❌', err); process.exit(1); });
