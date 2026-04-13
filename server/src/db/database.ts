import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database;

export function getDB(): Database.Database {
  if (!db) {
    throw new Error('Base de dades no inicialitzada. Crida initDB() primer.');
  }
  return db;
}

export function initDB(): void {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/alerta-desnona.db');

  // Ensure directory exists
  const dir = path.dirname(dbPath);
  const fs = require('fs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  console.log('✅ Base de dades inicialitzada:', dbPath);
}

function createTables(): void {
  db.exec(`
    -- ─── Adreces normalitzades ────────────────────────────────────
    -- Una fila per adreça física. Múltiples desnonaments poden
    -- compartir la mateixa adreça (dedup natural).
    CREATE TABLE IF NOT EXISTS adreces (
      id TEXT PRIMARY KEY,

      -- Adreça original tal com ve del BOE (sense tocar)
      adreca_original TEXT NOT NULL,

      -- Camps normalitzats (parsejats de l'adreça original)
      tipus_via TEXT,              -- Carrer, Avinguda, Passeig, Plaça, Rambla...
      nom_via TEXT,                -- Ciutat de Mallorca
      numero TEXT,                 -- 25
      bloc TEXT,                   -- A, B...
      escala TEXT,                 -- 1ª, 2ª...
      pis TEXT,                    -- 1, 2, àtic...
      porta TEXT,                  -- 1ª, 2ª, A, B...

      -- Localització administrativa
      codi_postal TEXT,
      localitat TEXT,              -- Nom de la localitat (municipi)
      provincia TEXT,
      codi_provincia TEXT,         -- 2 dígits (08 = Barcelona, 28 = Madrid...)
      comunitat_autonoma TEXT,

      -- Coordenades (geocodificades)
      latitud REAL,
      longitud REAL,
      geocodat INTEGER NOT NULL DEFAULT 0,  -- 0=no, 1=cadastre(exact), 2=street-level, 3=city-level, -1=error

      -- Referència cadastral (clau per geocodificació precisa)
      ref_catastral TEXT,

      creat_el TEXT NOT NULL DEFAULT (datetime('now')),
      actualitzat_el TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ─── Desnonaments (casos) ─────────────────────────────────────
    -- Cada cas de subhasta judicial o edicte de desnonament.
    CREATE TABLE IF NOT EXISTS desnonaments (
      id TEXT PRIMARY KEY,
      adreca_id TEXT NOT NULL,
      boe_id TEXT UNIQUE,

      -- Dades del cas
      data_desnonament TEXT NOT NULL,
      hora_desnonament TEXT,
      estat TEXT NOT NULL DEFAULT 'programat',

      -- Tipus de procediment (cobertura completa)
      -- ejecucion_hipotecaria: subhasta judicial per impagament d'hipoteca
      -- impago_alquiler:       desnonament per impagament de lloguer
      -- ocupacion:             desnonament per ocupació il·legal
      -- cautelar:              mesura cautelar / precari
      -- desconegut:            tipus no determinat
      tipus_procediment TEXT NOT NULL DEFAULT 'desconegut',

      -- Dades de la subhasta (directes del BOE, en castellà — idioma oficial)
      tipus_subhasta TEXT,         -- "JUDICIAL EN VÍA DE APREMIO", "NOTARIAL"...
      tipus_be TEXT,               -- "Vivienda", "Local", "Garaje"...
      vivenda_habitual INTEGER DEFAULT 0,
      quantitat_reclamada TEXT,    -- "253.503,75 €"
      valor_subhasta TEXT,         -- "296.175,00 €"

      -- Dades registrals
      idufir TEXT,
      inscripcio_registral TEXT,

      -- Descripció legal del bé (text lliure del BOE)
      descripcio TEXT,

      -- Jutjat
      jutjat TEXT,                 -- "JUZGADO 1 INSTANCIA 28"
      jutjat_adreca TEXT,          -- "GV DE LES CORTS CATALANES 111; 08014 BARCELONA"
      jutjat_telefon TEXT,
      jutjat_email TEXT,

      -- Procediment
      num_procediment TEXT,        -- "BOE-B-2024-17346" o "TEU-A-2026-12345"
      expedient TEXT,              -- "0946/2024"

      -- Fonts
      font_oficial TEXT NOT NULL,
      url_font TEXT,
      document_url TEXT,

      -- Dedup
      duplicat_de TEXT,

      creat_el TEXT NOT NULL DEFAULT (datetime('now')),
      actualitzat_el TEXT NOT NULL DEFAULT (datetime('now')),

      FOREIGN KEY (adreca_id) REFERENCES adreces(id)
    );

    -- ─── Taules auxiliars (sense canvis) ──────────────────────────

    CREATE TABLE IF NOT EXISTS historial (
      id TEXT PRIMARY KEY,
      desnonament_id TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT (datetime('now')),
      tipus_canvi TEXT NOT NULL,
      estat_anterior TEXT,
      estat_nou TEXT,
      descripcio TEXT,
      font TEXT,
      creat_el TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (desnonament_id) REFERENCES desnonaments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usuaris (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      nom TEXT,
      notificacions_push INTEGER NOT NULL DEFAULT 0,
      notificacions_email INTEGER NOT NULL DEFAULT 1,
      radi_km REAL DEFAULT 10,
      latitud REAL,
      longitud REAL,
      push_subscription TEXT,
      fcm_token TEXT,
      creat_el TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscripcions (
      id TEXT PRIMARY KEY,
      usuari_id TEXT NOT NULL,
      tipus TEXT NOT NULL,
      valor TEXT NOT NULL,
      activa INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (usuari_id) REFERENCES usuaris(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notificacions (
      id TEXT PRIMARY KEY,
      usuari_id TEXT NOT NULL,
      desnonament_id TEXT NOT NULL,
      tipus TEXT NOT NULL,
      enviat_el TEXT NOT NULL DEFAULT (datetime('now')),
      llegit INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (usuari_id) REFERENCES usuaris(id) ON DELETE CASCADE,
      FOREIGN KEY (desnonament_id) REFERENCES desnonaments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS estadistiques_ine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provincia TEXT NOT NULL,
      codi_provincia TEXT NOT NULL,
      comunitat_autonoma TEXT NOT NULL,
      any INTEGER NOT NULL,
      trimestre INTEGER,
      total_finques INTEGER NOT NULL DEFAULT 0,
      finques_vivendes INTEGER NOT NULL DEFAULT 0,
      finques_solars INTEGER NOT NULL DEFAULT 0,
      finques_altres INTEGER NOT NULL DEFAULT 0,
      finques_rustiques INTEGER NOT NULL DEFAULT 0,
      tipus_dada TEXT NOT NULL DEFAULT 'Definitivo',
      font TEXT NOT NULL DEFAULT 'INE — Estadística sobre Ejecuciones Hipotecarias',
      url_font TEXT NOT NULL DEFAULT 'https://www.ine.es/jaxiT3/Tabla.htm?t=10743',
      actualitzat_el TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(codi_provincia, any, trimestre)
    );

    -- ─── Índexs ──────────────────────────────────────────────────

    -- Adreces
    CREATE INDEX IF NOT EXISTS idx_adreces_cp ON adreces(codi_postal);
    CREATE INDEX IF NOT EXISTS idx_adreces_localitat ON adreces(localitat);
    CREATE INDEX IF NOT EXISTS idx_adreces_provincia ON adreces(provincia);
    CREATE INDEX IF NOT EXISTS idx_adreces_coords ON adreces(latitud, longitud);
    CREATE INDEX IF NOT EXISTS idx_adreces_geocodat ON adreces(geocodat);
    CREATE INDEX IF NOT EXISTS idx_adreces_ref_catastral ON adreces(ref_catastral);

    -- Desnonaments
    CREATE INDEX IF NOT EXISTS idx_desnonaments_adreca ON desnonaments(adreca_id);
    CREATE INDEX IF NOT EXISTS idx_desnonaments_data ON desnonaments(data_desnonament);
    CREATE INDEX IF NOT EXISTS idx_desnonaments_estat ON desnonaments(estat);
    CREATE INDEX IF NOT EXISTS idx_desnonaments_boe_id ON desnonaments(boe_id);

    -- Auxiliars
    CREATE INDEX IF NOT EXISTS idx_historial_desnonament ON historial(desnonament_id);
    CREATE INDEX IF NOT EXISTS idx_historial_data ON historial(data);
    CREATE INDEX IF NOT EXISTS idx_subscripcions_usuari ON subscripcions(usuari_id);
    CREATE INDEX IF NOT EXISTS idx_notificacions_usuari ON notificacions(usuari_id);
    CREATE INDEX IF NOT EXISTS idx_estadistiques_provincia ON estadistiques_ine(codi_provincia, any);
    CREATE INDEX IF NOT EXISTS idx_estadistiques_comunitat ON estadistiques_ine(comunitat_autonoma, any);

    -- ─── Estadístiques CGPJ (llançaments judicials) ──────────────
    -- Dades del Consejo General del Poder Judicial — Estadística Judicial
    -- Font: "Datos sobre el efecto de la crisis en los órganos judiciales"
    -- Cobertura: Llançaments practicats (desnonaments executats) per CCAA i província
    CREATE TABLE IF NOT EXISTS estadistiques_cgpj (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ambit TEXT NOT NULL,                  -- 'ccaa' o 'provincia'
      nom TEXT NOT NULL,                    -- Nom CCAA o província
      any INTEGER NOT NULL,
      -- Llançaments practicats (desnonaments executats)
      lanzaments_total INTEGER NOT NULL DEFAULT 0,
      lanzaments_hipotecaria INTEGER NOT NULL DEFAULT 0,
      lanzaments_lau INTEGER NOT NULL DEFAULT 0,
      lanzaments_altres INTEGER NOT NULL DEFAULT 0,
      -- Verbals possessoris per ocupació il·legal
      ocupacio_verbal INTEGER NOT NULL DEFAULT 0,
      -- Evolució i dades per càpita (només CCAA)
      evolucio_percentual REAL,
      poblacio INTEGER,
      taxa_per_100k REAL,
      -- Altres indicadors (només província)
      execucions_hipotecaries INTEGER,
      concursos_total INTEGER,
      monitoris INTEGER,
      -- Metadades
      font TEXT NOT NULL DEFAULT 'CGPJ — Consejo General del Poder Judicial',
      url_font TEXT NOT NULL DEFAULT 'https://www.poderjudicial.es/cgpj/es/Temas/Estadistica-Judicial/Estudios-e-Informes/Efecto-de-la-Crisis-en-los-organos-judiciales/',
      actualitzat_el TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(ambit, nom, any)
    );

    CREATE INDEX IF NOT EXISTS idx_cgpj_ambit_any ON estadistiques_cgpj(ambit, any);
    CREATE INDEX IF NOT EXISTS idx_cgpj_nom ON estadistiques_cgpj(nom, any);
  `);

  // ─── Migració: afegir columna tipus_procediment si no existeix ──
  // (per bases de dades ja existents)
  try {
    const cols = db.prepare(`PRAGMA table_info(desnonaments)`).all() as Array<{ name: string }>;
    if (!cols.some(c => c.name === 'tipus_procediment')) {
      db.exec(`ALTER TABLE desnonaments ADD COLUMN tipus_procediment TEXT NOT NULL DEFAULT 'desconegut'`);
      // Marcar els existents (tots provenen de subhastes BOE) com a ejecucions hipotecàries
      db.exec(`UPDATE desnonaments SET tipus_procediment = 'ejecucion_hipotecaria' WHERE font_oficial LIKE '%Subastas%' OR font_oficial LIKE '%subastas%'`);
      console.log('📦 Migració: columna tipus_procediment afegida');
    }
  } catch { /* ja existeix */ }

  // ─── Migració: afegir columna fcm_token a usuaris si no existeix ──
  try {
    const cols = db.prepare(`PRAGMA table_info(usuaris)`).all() as Array<{ name: string }>;
    if (!cols.some(c => c.name === 'fcm_token')) {
      db.exec(`ALTER TABLE usuaris ADD COLUMN fcm_token TEXT`);
      console.log('📦 Migració: columna fcm_token afegida a usuaris');
    }
  } catch { /* ja existeix */ }

  // Índex que depèn de la migració (s'executa després)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_desnonaments_tipus ON desnonaments(tipus_procediment)`);
}
