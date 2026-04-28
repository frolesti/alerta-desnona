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
import fs from 'fs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_INE = args.includes('--skip-ine');
const SKIP_TEU = args.includes('--skip-teu');

const serverDir = path.resolve(__dirname, '..');

// Detect if running in production (compiled JS) or development (tsx)
const IS_PRODUCTION = __filename.endsWith('.js');

// Locate the compiled scripts directory. In Docker the layout is
// /app/dist/server/src/*.js (this file lives there), so sibling .js files
// are next to __dirname. Locally during dev with tsx, scripts are sources.
const COMPILED_DIR = __dirname;

/**
 * Build the command to run a sub-script.
 * In production: `node <compiledDir>/<script>.js`
 * In development: `npx tsx src/<script>.ts`
 */
function buildCommand(scriptName: string, extraArgs: string = ''): string {
  if (IS_PRODUCTION) {
    const jsPath = path.join(COMPILED_DIR, `${scriptName}.js`);
    if (!fs.existsSync(jsPath)) {
      // Fallbacks for alternative build layouts
      const candidates = [
        path.join(serverDir, 'dist', 'server', 'src', `${scriptName}.js`),
        path.join(serverDir, 'dist', 'src', `${scriptName}.js`),
        path.join(serverDir, '..', 'dist', 'server', 'src', `${scriptName}.js`),
      ];
      for (const alt of candidates) {
        if (fs.existsSync(alt)) {
          return `node "${alt}"${extraArgs ? ' ' + extraArgs : ''}`;
        }
      }
      console.warn(`⚠️  Script no trobat: ${jsPath}`);
    }
    return `node "${jsPath}"${extraArgs ? ' ' + extraArgs : ''}`;
  }
  return `npx tsx src/${scriptName}.ts${extraArgs ? ' ' + extraArgs : ''}`;
}

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

  // Mode test: limita el primer scrape a un rang petit per validar qualitat
  // abans d'enfrontar la quota Gemini i les hores de geocoding.
  // Activa amb env var BOOTSTRAP_LIMIT=small (rang BOE d'~100 IDs, sense TEU).
  const TEST_MODE = process.env.BOOTSTRAP_LIMIT === 'small';
  if (TEST_MODE) {
    console.log('🧪 BOOTSTRAP_LIMIT=small — primera càrrega reduïda per validar qualitat\n');
  }

  // ── Fase 1: Scrape BOE — subhastes judicials (execucions hipotecàries) ──
  const currentYear = today.getFullYear();
  const fase1Args = TEST_MODE
    ? `--year ${currentYear} --prefix JA --from 259900 --to 260000`
    : `--year ${currentYear} --prefix ALL`;
  runStep(
    'Fase 1: Scrape BOE — subhastes judicials (exec. hipotecàries)',
    buildCommand('fetch-subastas-by-id', fase1Args),
  );

  // ── Fase 2: Scrape TEU — edictes de desnonaments (impagaments + ocupació) ──
  if (TEST_MODE) {
    console.log('\n⏭️  Fase 2: TEU — omesa en mode test petit');
  } else if (!SKIP_TEU) {
    runStep(
      'Fase 2: Scrape TEU — edictes desnonaments (impago + ocupació)',
      buildCommand('fetch-teu-desnonaments', '--days 1'),
    );
  } else {
    console.log('\n⏭️  Fase 2: TEU — omesa per --skip-teu');
  }

  // ── Fase 3: Parse adreces amb IA ──
  runStep(
    'Fase 3: Parsejar adreces noves amb Gemini',
    buildCommand('bulk-parse-adreces'),
  );

  // ── Fase 4: Geocodificar adreces noves ──
  runStep(
    'Fase 4: Geocodificar adreces noves',
    buildCommand('geocode-per-ciutat'),
  );

  // ── Fase 4.5: Dedup intel·ligent (rules + LLM) ──
  runStep(
    'Fase 4.5: Detecció de duplicats (fingerprint + IA)',
    buildCommand('dedup-desnonaments'),
  );

  // ── Fase 4.6: Purga casos sense ubicació precisa ──
  // Mandat: l'app només té sentit si situa cada cas al mapa amb precisió.
  runStep(
    'Fase 4.6: Purga casos sense ubicació precisa al mapa',
    buildCommand('purge-imprecise'),
  );

  // ── Fase 5: INE (només dilluns) ──
  if (!SKIP_INE && dayOfWeek === 1) {
    runStep(
      'Fase 5: Actualitzar estadístiques INE (setmanal)',
      buildCommand('fetch-ine'),
    );
  } else if (!SKIP_INE) {
    console.log(`\n⏭️  Fase 5: INE — s'executa només els dilluns (avui és ${['dg', 'dl', 'dm', 'dc', 'dj', 'dv', 'ds'][dayOfWeek]})`);
  }

  // ── Fase 5b: CGPJ (només dilluns) ──
  if (dayOfWeek === 1) {
    runStep(
      'Fase 5b: Actualitzar estadístiques CGPJ (setmanal)',
      buildCommand('fetch-cgpj', '--all'),
    );
  } else {
    console.log(`\n⏭️  Fase 5b: CGPJ — s'executa només els dilluns (avui és ${['dg', 'dl', 'dm', 'dc', 'dj', 'dv', 'ds'][dayOfWeek]})`);
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
