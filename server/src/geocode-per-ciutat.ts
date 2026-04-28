/**
 * GEOCODE — Assigna coordenades EXACTES a les adreces.
 *
 * NOMÉS dues estratègies, totes dues amb precisió de portal/carrer:
 *   1. Cadastre API → coordenades EXACTES de l'edifici (geocodat=1)
 *   2. Nominatim structured search → carrer (geocodat=2)
 *
 * NO fa fallback a centroide de ciutat. Si una adreça no es pot situar
 * amb precisió, es queda amb geocodat=0 i serà purgada més tard
 * (purge-imprecise.ts) perquè no aporta res a l'objectiu de l'app.
 */

import 'dotenv/config';
import { initDB, getDB } from './db/database';
import { geocodeCadastre, geocodeNominatim, type AdrecaParsejada } from './services/adreca';

const NOMINATIM_DELAY = 1100;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  initDB();
  const db = getDB();

  console.log('🗺️  GEOCODE — CASCADA PRECISA (Cadastre → Nominatim)\n');
  console.log('   Fase C (city-level) eliminada: ja no es geolocalitzen casos amb precisió de ciutat.\n');

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

  // ── Phase C eliminada ──
  // Anteriorment es geocodificaven les adreces restants amb el centroide de la ciutat
  // (geocodat=3). Això generava clústers ficticis al mapa (tots els casos d'una ciutat
  // apareixien al mateix punt). Ara no es fa: les adreces sense precisió de carrer
  // queden amb geocodat=0 i seran eliminades per `purge-imprecise.ts`.

  // ── Summary ──
  const stats = db.prepare(`
    SELECT geocodat, COUNT(*) as n FROM adreces GROUP BY geocodat ORDER BY geocodat
  `).all() as any[];
  const total = (db.prepare('SELECT COUNT(*) as n FROM adreces').get() as any).n;
  const onMap = (db.prepare('SELECT COUNT(*) as n FROM adreces WHERE latitud IS NOT NULL AND geocodat IN (1,2)').get() as any).n;

  console.log('═'.repeat(50));
  console.log('📊 RESUM GEOCODIFICACIÓ');
  for (const s of stats) {
    const label = s.geocodat === 1 ? 'cadastre' : s.geocodat === 2 ? 'carrer' : s.geocodat === 0 ? 'sense' : `other(${s.geocodat})`;
    console.log(`  geocodat=${s.geocodat} (${label}): ${s.n}`);
  }
  console.log(`  🗺️  TOTAL al mapa (precís): ${onMap}/${total} (${total > 0 ? ((onMap / total) * 100).toFixed(1) : '0.0'}%)`);
  console.log('═'.repeat(50));
}

main().catch(err => { console.error('❌', err); process.exit(1); });
