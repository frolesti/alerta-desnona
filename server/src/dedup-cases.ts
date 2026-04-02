/**
 * Deduplication script: Find cases that refer to the same physical property
 * and link them via `duplicat_de` column.
 *
 * Strategy (new schema):
 *   1. Group by adreca_id (cases sharing the same normalized address).
 *   2. Within each group, the most recent case (by data_desnonament) is primary.
 *   3. Other cases get `duplicat_de` set to the primary case's id.
 *
 * Usage: npx tsx src/dedup-cases.ts [--dry-run]
 */

import { initDB, getDB } from './db/database';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`🔍 Deduplication script${dryRun ? ' (DRY RUN)' : ''}\n`);

  initDB();
  const db = getDB();

  // First, reset any previous dedup
  if (!dryRun) {
    db.exec("UPDATE desnonaments SET duplicat_de = NULL WHERE duplicat_de IS NOT NULL");
  }

  // Find adreca_ids with multiple cases
  const groups = db.prepare(`
    SELECT adreca_id, COUNT(*) as cnt
    FROM desnonaments
    GROUP BY adreca_id
    HAVING cnt > 1
    ORDER BY cnt DESC
  `).all() as Array<{ adreca_id: string; cnt: number }>;

  console.log(`📊 Address groups with multiple cases: ${groups.length}\n`);

  let dupCases = 0;
  const updates: Array<{ id: string; primaryId: string }> = [];
  const examples: string[] = [];

  for (const group of groups) {
    // Get all cases for this address, ordered by most recent first
    const cases = db.prepare(`
      SELECT d.id, d.boe_id, d.data_desnonament, a.adreca_original, a.localitat
      FROM desnonaments d
      JOIN adreces a ON d.adreca_id = a.id
      WHERE d.adreca_id = ?
      ORDER BY d.data_desnonament DESC
    `).all(group.adreca_id) as Array<{
      id: string;
      boe_id: string;
      data_desnonament: string;
      adreca_original: string;
      localitat: string;
    }>;

    if (cases.length <= 1) continue;

    // Primary = most recent
    const primary = cases[0];

    for (let i = 1; i < cases.length; i++) {
      updates.push({ id: cases[i].id, primaryId: primary.id });
      dupCases++;
    }

    if (examples.length < 10) {
      examples.push(
        `  Adreça: "${cases[0].adreca_original}" (${cases[0].localitat}) — ${cases.length} casos:\n` +
        cases.map((c, i) =>
          `    ${i === 0 ? '⭐' : '  '} ${c.boe_id || c.id.slice(0, 8)} | ${c.data_desnonament}`
        ).join('\n')
      );
    }
  }

  console.log(`📋 Cases to mark as duplicates: ${dupCases}\n`);

  if (examples.length > 0) {
    console.log('📝 Example groups:');
    console.log(examples.join('\n\n'));
    console.log('');
  }

  if (!dryRun && updates.length > 0) {
    const stmt = db.prepare('UPDATE desnonaments SET duplicat_de = ? WHERE id = ?');
    const updateMany = db.transaction((ops: typeof updates) => {
      for (const op of ops) {
        stmt.run(op.primaryId, op.id);
      }
    });
    updateMany(updates);
    console.log(`✅ Updated ${updates.length} cases with duplicat_de references.`);
  } else if (dryRun) {
    console.log('🏃 Dry run — no changes made.');
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
