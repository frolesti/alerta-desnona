const Database = require('better-sqlite3');
const db = new Database('./data/alerta-desnona.db');
const r = db.prepare('SELECT * FROM desnonaments WHERE id = ?').get('56b0cf69-7541-4b4b-8683-15bcbf9f0b9d');
console.log(JSON.stringify(r, null, 2));
