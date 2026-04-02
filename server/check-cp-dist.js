const db = require('better-sqlite3')('./data/alerta-desnona.db');

console.log('=== Barcelona CPs ===');
db.prepare("SELECT codi_postal, COUNT(*) as c FROM desnonaments WHERE codi_postal LIKE '080%' GROUP BY codi_postal ORDER BY c DESC LIMIT 30")
  .all().forEach(r => console.log('  ' + r.codi_postal + ': ' + r.c));

console.log('\n=== Madrid CPs (top 20) ===');
db.prepare("SELECT codi_postal, COUNT(*) as c FROM desnonaments WHERE codi_postal LIKE '280%' GROUP BY codi_postal ORDER BY c DESC LIMIT 20")
  .all().forEach(r => console.log('  ' + r.codi_postal + ': ' + r.c));

const gen = db.prepare("SELECT COUNT(*) as c FROM desnonaments WHERE codi_postal LIKE '%000'").get();
const tot = db.prepare("SELECT COUNT(*) as c FROM desnonaments").get();
console.log('\n=== Resum ===');
console.log('  Total casos: ' + tot.c);
console.log('  CPs generics (XX000): ' + gen.c);
console.log('  CPs reals: ' + (tot.c - gen.c));
