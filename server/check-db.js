const db = require('better-sqlite3')('./data/alerta-desnona.db');
console.log('Total:', db.prepare("SELECT COUNT(*) as c FROM desnonaments").get());
console.log('CP distribution for BCN:');
console.log(db.prepare("SELECT codi_postal, COUNT(*) as c FROM desnonaments WHERE codi_postal LIKE '08%' GROUP BY codi_postal ORDER BY c DESC LIMIT 20").all());
console.log('\nCP distribution for MAD:');
console.log(db.prepare("SELECT codi_postal, COUNT(*) as c FROM desnonaments WHERE codi_postal LIKE '28%' GROUP BY codi_postal ORDER BY c DESC LIMIT 20").all());
console.log('\nSample BCN case:');
console.log(db.prepare("SELECT adreca, codi_postal, ciutat, boe_id FROM desnonaments WHERE codi_postal LIKE '08%' LIMIT 3").all());
