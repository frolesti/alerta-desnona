/**
 * GEOCODE PER CIUTAT: Assigna coordenades a totes les adreces no geocodificades.
 * 
 * Estratègia en cascada (de més precís a menys):
 *   1. Cadastre API → coordenades EXACTES de l'edifici (geocodat=1)
 *   2. Nominatim structured search → carrer (geocodat=2)
 *   3. Photon city-level → centre de ciutat (geocodat=3)
 */

import 'dotenv/config';
import { initDB, getDB } from './db/database';
import { geocodeCadastre, geocodeNominatim, type AdrecaParsejada } from './services/adreca';

const CONCURRENCY = 3;
const DELAY_MS = 200;
const NOMINATIM_DELAY = 1100;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function geocodeCity(localitat: string, provincia: string): Promise<{ lat: number; lng: number } | null> {
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

  try {
    await sleep(NOMINATIM_DELAY);
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

  console.log('🗺️  GEOCODE — CASCADA (Cadastre → Nominatim → Ciutat)\n');

  // ── Phase A: Cadastre for addresses with ref_catastral ──
  const cadastreAddrs = db.prepare(`
    SELECT id, ref_catastral, provincia, localitat
    FROM adreces
    WHERE geocodat = 0 AND ref_catastral IS NOT NULL AND length(ref_catastral) >= 14
  `).all() as any[];

  if (cadastreAddrs.length > 0) {
    console.log(`📐 Phase A: ${cadastreAddrs.length} adreces amb ref. cadastral`);
    const updateExact = db.prepare(`
      UPDATE adreces SET latitud = ?, longitud = ?, geocodat = 1, actualitzat_el = datetime('now')
      WHERE id = ?
    `);
    let okA = 0;
    for (const a of cadastreAddrs) {
      try {
        const r = await geocodeCadastre(a.ref_catastral, a.provincia, a.localitat);
        if (r) { updateExact.run(r.lat, r.lng, a.id); okA++; }
      } catch { /* skip */ }
      await sleep(100);
    }
    console.log(`  ✅ Cadastre: ${okA}/${cadastreAddrs.length}\n`);
  }

  // ── Phase B: Nominatim street-level for remaining ──
  const streetAddrs = db.prepare(`
    SELECT id, tipus_via, nom_via, numero, codi_postal, localitat, provincia
    FROM adreces
    WHERE geocodat = 0 AND nom_via IS NOT NULL AND localitat IS NOT NULL
  `).all() as any[];

  if (streetAddrs.length > 0) {
    console.log(`🛤️  Phase B: ${streetAddrs.length} adreces amb nom_via (Nominatim carrer)`);
    const updateStreet = db.prepare(`
      UPDATE adreces SET latitud = ?, longitud = ?, geocodat = 2, actualitzat_el = datetime('now')
      WHERE id = ?
    `);
    let okB = 0;
    for (const a of streetAddrs) {
      try {
        const parsed: AdrecaParsejada = {
          original: '', tipusVia: a.tipus_via, nomVia: a.nom_via,
          numero: a.numero, bloc: null, escala: null, pis: null, porta: null,
        };
        await sleep(NOMINATIM_DELAY);
        const r = await geocodeNominatim(parsed, a.codi_postal, a.localitat, a.provincia);
        if (r) { updateStreet.run(r.lat, r.lng, a.id); okB++; }
      } catch { /* skip */ }
    }
    console.log(`  ✅ Nominatim carrer: ${okB}/${streetAddrs.length}\n`);
  }

  // ── Phase C: City-level fallback for remaining ──
  const cities = db.prepare(`
    SELECT DISTINCT localitat, provincia, COUNT(*) as n
    FROM adreces
    WHERE geocodat = 0 AND localitat IS NOT NULL
    GROUP BY localitat, provincia
    ORDER BY n DESC
  `).all() as Array<{ localitat: string; provincia: string; n: number }>;

  if (cities.length > 0) {
    const totalAddresses = cities.reduce((s, c) => s + c.n, 0);
    console.log(`🏙️  Phase C: ${cities.length} ciutats → ${totalAddresses} adreces (city-level)`);

    const updateCity = db.prepare(`
      UPDATE adreces SET latitud = ?, longitud = ?, geocodat = 3, actualitzat_el = datetime('now')
      WHERE localitat = ? AND provincia = ? AND geocodat = 0
    `);

    let geoOk = 0, addrOk = 0;
    let idx = 0;

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
        }
        await sleep(DELAY_MS);
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cities.length) }, () => worker()));
    console.log(`  ✅ Ciutat: ${geoOk}/${cities.length} ciutats (${addrOk} adreces)\n`);
  }

  // ── Summary ──
  const stats = db.prepare(`
    SELECT geocodat, COUNT(*) as n FROM adreces GROUP BY geocodat ORDER BY geocodat
  `).all() as any[];
  const total = (db.prepare('SELECT COUNT(*) as n FROM adreces').get() as any).n;
  const onMap = (db.prepare('SELECT COUNT(*) as n FROM adreces WHERE latitud IS NOT NULL').get() as any).n;

  console.log('═'.repeat(50));
  console.log('📊 RESUM GEOCODIFICACIÓ');
  for (const s of stats) {
    const label = s.geocodat === 1 ? 'cadastre' : s.geocodat === 2 ? 'carrer' : s.geocodat === 3 ? 'ciutat' : s.geocodat === 0 ? 'sense' : `other(${s.geocodat})`;
    console.log(`  geocodat=${s.geocodat} (${label}): ${s.n}`);
  }
  console.log(`  🗺️  TOTAL al mapa: ${onMap}/${total} (${((onMap / total) * 100).toFixed(1)}%)`);
  console.log('═'.repeat(50));
}

main().catch(err => { console.error('❌', err); process.exit(1); });
