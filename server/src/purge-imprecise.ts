/**
 * PURGE — Elimina desnonaments sense ubicació precisa al mapa.
 *
 * Filosofia (mandat de l'usuari): "L'app té l'objectiu únic de situar cada
 * desnonament al mapa. Si no el podem situar amb precisió, no ens serveix."
 *
 * Es consideren imprecisos i s'eliminen:
 *   - desnonaments amb adreca_id NULL
 *   - desnonaments la adreça dels quals té latitud/longitud NULL
 *   - desnonaments la adreça dels quals té geocodat NOT IN (1, 2)
 *     (1 = cadastre exacte, 2 = Nominatim carrer; 0 = no geocodat,
 *     3 = centroide ciutat — abans existia, ara prohibit)
 *
 * Després elimina:
 *   - adreces orfes (sense cap desnonament que les referenciï)
 *   - historial i notificacions referits a desnonaments eliminats
 *
 * Usage:
 *   npx tsx src/purge-imprecise.ts
 *   npx tsx src/purge-imprecise.ts --dry-run
 */

import 'dotenv/config';
import { initDB, getDB } from './db/database';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  initDB();
  const db = getDB();

  console.log('🧹 PURGE — Eliminació de desnonaments sense ubicació precisa');
  if (DRY_RUN) console.log('🏃 DRY RUN — no s\'eliminarà res');
  console.log('');

  // Comptar abans
  const before = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM desnonaments) AS desn,
      (SELECT COUNT(*) FROM adreces) AS adr,
      (SELECT COUNT(*) FROM historial) AS hist,
      (SELECT COUNT(*) FROM notificacions) AS notif
  `).get() as { desn: number; adr: number; hist: number; notif: number };

  // Identificar desnonaments imprecisos
  const imprecise = db.prepare(`
    SELECT d.id
    FROM desnonaments d
    LEFT JOIN adreces a ON d.adreca_id = a.id
    WHERE d.adreca_id IS NULL
       OR a.id IS NULL
       OR a.latitud IS NULL
       OR a.longitud IS NULL
       OR a.geocodat NOT IN (1, 2)
  `).all() as Array<{ id: string }>;

  console.log(`Identificats ${imprecise.length} desnonaments sense ubicació precisa.`);

  if (imprecise.length === 0) {
    console.log('✅ Res a purgar.');
    return;
  }

  if (DRY_RUN) {
    // Comptem dependents per informar
    const ids = imprecise.map(r => `'${r.id}'`).join(',');
    const histN = (db.prepare(`SELECT COUNT(*) as n FROM historial WHERE desnonament_id IN (${ids})`).get() as any).n;
    const notifN = (db.prepare(`SELECT COUNT(*) as n FROM notificacions WHERE desnonament_id IN (${ids})`).get() as any).n;
    console.log(`  → ${histN} entrades d'historial també s'eliminarien`);
    console.log(`  → ${notifN} notificacions també s'eliminarien`);
    return;
  }

  // Transacció
  const purgeTx = db.transaction((ids: string[]) => {
    // Esborrar en chunks per evitar SQLite limit (~999 vars)
    const CHUNK = 500;
    let delHist = 0, delNotif = 0, delDesn = 0;

    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '?').join(',');
      delHist += db.prepare(`DELETE FROM historial WHERE desnonament_id IN (${placeholders})`).run(...chunk).changes;
      delNotif += db.prepare(`DELETE FROM notificacions WHERE desnonament_id IN (${placeholders})`).run(...chunk).changes;
      delDesn += db.prepare(`DELETE FROM desnonaments WHERE id IN (${placeholders})`).run(...chunk).changes;
    }

    // Esborrar adreces orfes (sense desnonaments)
    const delAdr = db.prepare(`
      DELETE FROM adreces
      WHERE id NOT IN (SELECT DISTINCT adreca_id FROM desnonaments WHERE adreca_id IS NOT NULL)
    `).run().changes;

    return { delHist, delNotif, delDesn, delAdr };
  });

  const result = purgeTx(imprecise.map(r => r.id));

  console.log(`  ✅ Eliminats ${result.delDesn} desnonaments`);
  console.log(`  ✅ Eliminades ${result.delAdr} adreces orfes`);
  console.log(`  ✅ Eliminades ${result.delHist} entrades d'historial`);
  console.log(`  ✅ Eliminades ${result.delNotif} notificacions`);

  // Comptar després
  const after = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM desnonaments) AS desn,
      (SELECT COUNT(*) FROM adreces) AS adr
  `).get() as { desn: number; adr: number };

  console.log('\n' + '═'.repeat(50));
  console.log('📊 RESUM PURGA');
  console.log(`  desnonaments: ${before.desn} → ${after.desn} (-${before.desn - after.desn})`);
  console.log(`  adreces:      ${before.adr} → ${after.adr} (-${before.adr - after.adr})`);
  console.log('═'.repeat(50));
}

main().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
