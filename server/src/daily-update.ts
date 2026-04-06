/**
 * ACTUALITZACIÓ DIÀRIA — Pipeline complet per mantenir les dades al dia.
 *
 * Fases:
 *   1. Scrape BOE: Baixa nous casos de subhastes judicials (exec. hipotecàries)
 *   2. Scrape TEU: Baixa edictes de desnonaments (impagaments + ocupació)
 *   3. Parse AI:   Normalitza adreces noves amb Gemini
 *   4. Geocode:    Geocodifica adreces noves (per ciutat)
 *   5. INE:        Actualitza estadístiques (cada dilluns)
 *   6. Estat:      Marca casos imminents (<48h)
 *
 * Cobertura completa:
 *   ✅ Execucions hipotecàries (subhastes BOE)
 *   ✅ Impagament de lloguer (edictes TEU)
 *   ✅ Ocupació il·legal (edictes TEU)
 *   ✅ Mesures cautelars (edictes TEU)
 *
 * Ús:
 *   npx tsx src/daily-update.ts              # Executa tot
 *   npx tsx src/daily-update.ts --skip-ine   # Sense INE
 *   npx tsx src/daily-update.ts --skip-teu   # Sense TEU (només BOE subhastes)
 *   npx tsx src/daily-update.ts --dry-run    # Només mostra què faria
 *
 * Programació:
 *   - GitHub Actions: .github/workflows/daily-update.yml (recomanat)
 *   - Cron del sistema: cada dia a les 06:00
 *   - Windows Task Scheduler: npx tsx src/daily-update.ts
 */

import 'dotenv/config';
import { initDB, getDB } from './db/database';
import { execSync } from 'child_process';
import path from 'path';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_INE = args.includes('--skip-ine');
const SKIP_TEU = args.includes('--skip-teu');

const serverDir = path.resolve(__dirname, '..');

function runStep(label: string, command: string): boolean {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🔄 ${label}`);
  console.log('═'.repeat(60));

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Executaria: ${command}`);
    return true;
  }

  try {
    execSync(command, {
      cwd: serverDir,
      stdio: 'inherit',
      timeout: 30 * 60 * 1000, // 30 min max per step
    });
    console.log(`✅ ${label} — completat`);
    return true;
  } catch (err: any) {
    console.error(`❌ ${label} — error: ${err.message}`);
    return false;
  }
}

function markImminentCases(): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('⏰ Fase 6: Marcar casos imminents (<48h)');
  console.log('═'.repeat(60));

  if (DRY_RUN) {
    console.log('  [DRY RUN] Marcaria casos imminents');
    return;
  }

  try {
    const db = getDB();
    const result = db.prepare(`
      UPDATE desnonaments
      SET estat = 'imminent', actualitzat_el = datetime('now')
      WHERE estat = 'programat'
      AND datetime(data_desnonament) <= datetime('now', '+48 hours')
      AND datetime(data_desnonament) > datetime('now')
    `).run();

    // Also mark past cases as 'executat'
    const pastResult = db.prepare(`
      UPDATE desnonaments
      SET estat = 'executat', actualitzat_el = datetime('now')
      WHERE estat IN ('programat', 'imminent')
      AND datetime(data_desnonament) < datetime('now')
    `).run();

    console.log(`  → ${result.changes} casos marcats com a imminents`);
    console.log(`  → ${pastResult.changes} casos passats marcats com a executats`);
  } catch (err: any) {
    console.error(`❌ Error marcant estats: ${err.message}`);
  }
}

function printSummary(): void {
  try {
    const db = getDB();
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM desnonaments) as total_casos,
        (SELECT COUNT(*) FROM adreces) as total_adreces,
        (SELECT COUNT(*) FROM adreces WHERE geocodat > 0) as geocodificades,
        (SELECT COUNT(*) FROM adreces WHERE nom_via IS NOT NULL) as parsejades,
        (SELECT COUNT(*) FROM desnonaments WHERE estat = 'imminent') as imminents,
        (SELECT COUNT(*) FROM desnonaments WHERE estat = 'programat') as programats,
        (SELECT COUNT(*) FROM desnonaments WHERE data_desnonament >= date('now', 'localtime')) as futurs,
        (SELECT COUNT(*) FROM desnonaments WHERE tipus_procediment = 'ejecucion_hipotecaria') as exec_hipotecaries,
        (SELECT COUNT(*) FROM desnonaments WHERE tipus_procediment = 'impago_alquiler') as impago_lloguer,
        (SELECT COUNT(*) FROM desnonaments WHERE tipus_procediment = 'ocupacion') as ocupacio,
        (SELECT COUNT(*) FROM desnonaments WHERE tipus_procediment = 'cautelar') as cautelars,
        (SELECT COUNT(*) FROM desnonaments WHERE tipus_procediment = 'desconegut') as desconeguts
    `).get() as any;

    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 RESUM ACTUAL');
    console.log('═'.repeat(60));
    console.log(`  Total casos:       ${stats.total_casos}`);
    console.log(`  Total adreces:     ${stats.total_adreces}`);
    console.log(`  Parsejades:        ${stats.parsejades}`);
    console.log(`  Geocodificades:    ${stats.geocodificades}`);
    console.log(`  Casos futurs:      ${stats.futurs}`);
    console.log(`  → Imminents:       ${stats.imminents}`);
    console.log(`  → Programats:      ${stats.programats}`);
    console.log('');
    console.log('  Per tipus de procediment:');
    console.log(`    🏦 Exec. hipotecàries: ${stats.exec_hipotecaries}`);
    console.log(`    🏠 Impagament lloguer: ${stats.impago_lloguer}`);
    console.log(`    🚪 Ocupació il·legal:  ${stats.ocupacio}`);
    console.log(`    ⚖️  Mesures cautelars:  ${stats.cautelars}`);
    console.log(`    ❓ Tipus desconegut:   ${stats.desconeguts}`);
  } catch (err: any) {
    console.error(`Error en resum: ${err.message}`);
  }
}

async function main() {
  const start = Date.now();
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=diumenge, 1=dilluns...

  console.log('🏠 Alerta Desnona — Actualització diària (cobertura completa)');
  console.log(`📅 ${today.toISOString().split('T')[0]} ${today.toTimeString().split(' ')[0]}`);
  if (DRY_RUN) console.log('🏃 Mode DRY RUN — no es fan canvis');
  console.log('');

  // Init DB
  initDB();

  // ── Fase 1: Scrape BOE — subhastes judicials (execucions hipotecàries) ──
  const currentYear = today.getFullYear();
  runStep(
    'Fase 1: Scrape BOE — subhastes judicials (exec. hipotecàries)',
    `npx tsx src/fetch-subastas-by-id.ts --year ${currentYear} --prefix ALL`,
  );

  // ── Fase 2: Scrape TEU — edictes de desnonaments (impagaments + ocupació) ──
  if (!SKIP_TEU) {
    runStep(
      'Fase 2: Scrape TEU — edictes desnonaments (impago + ocupació)',
      'npx tsx src/fetch-teu-desnonaments.ts --days 1',
    );
  } else {
    console.log('\n⏭️  Fase 2: TEU — omesa per --skip-teu');
  }

  // ── Fase 3: Parse adreces amb IA ──
  runStep(
    'Fase 3: Parsejar adreces noves amb Gemini',
    'npx tsx src/bulk-parse-adreces.ts',
  );

  // ── Fase 4: Geocodificar adreces noves ──
  runStep(
    'Fase 4: Geocodificar adreces noves',
    'npx tsx src/geocode-per-ciutat.ts',
  );

  // ── Fase 5: INE (només dilluns) ──
  if (!SKIP_INE && dayOfWeek === 1) {
    runStep(
      'Fase 5: Actualitzar estadístiques INE (setmanal)',
      'npx tsx src/fetch-ine.ts',
    );
  } else if (!SKIP_INE) {
    console.log(`\n⏭️  Fase 5: INE — s'executa només els dilluns (avui és ${['dg', 'dl', 'dm', 'dc', 'dj', 'dv', 'ds'][dayOfWeek]})`);
  }

  // ── Fase 6: Actualitzar estats ──
  markImminentCases();

  // ── Resum final ──
  printSummary();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n🎉 Actualització completada en ${elapsed}s`);
}

main().catch(err => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
