import { initDB, getDB } from './src/db/database';
initDB();
const db = getDB();

// Min/max ID numbers per year
const years = ['2025', '2026'];
for (const y of years) {
  const range = db.prepare(`
    SELECT MIN(CAST(substr(boe_id, 13) AS INTEGER)) as mn,
           MAX(CAST(substr(boe_id, 13) AS INTEGER)) as mx,
           COUNT(*) as n
    FROM desnonaments WHERE boe_id LIKE ?
  `).get(`SUB-JA-${y}%`) as any;
  console.log(`${y}: ${range.mn} - ${range.mx} (${range.n} entries)`);
}

// Also check for different prefixes
for (const p of ['JA', 'JV', 'JC']) {
  const count = db.prepare(`SELECT COUNT(*) as n FROM desnonaments WHERE boe_id LIKE ?`).get(`SUB-${p}-%`) as any;
  if (count.n > 0) console.log(`Prefix ${p}: ${count.n}`);
}
