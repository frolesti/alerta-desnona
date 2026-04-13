import { Router, Request, Response } from 'express';
import { getDB } from '../db/database';

export const desnonamentRoutes = Router();

// ─── Helpers ─────────────────────────────────────────────────────

/** Construeix una adreça llegible a partir dels camps normalitzats */
function buildAdreca(row: any): string {
  const parts: string[] = [];
  if (row.tipus_via) parts.push(row.tipus_via);
  if (row.nom_via) parts.push(row.nom_via);
  if (row.numero) parts.push(row.numero);
  if (row.pis) parts.push(`${row.pis}`);
  if (row.porta) parts.push(`${row.porta}`);
  return parts.join(' ') || row.adreca_original || '';
}

// ─── GET /api/desnonaments — Llistar amb filtres ─────────────────

desnonamentRoutes.get('/', (req: Request, res: Response) => {
  try {
    const db = getDB();
    const {
      comunitat_autonoma, provincia, estat,
      tipus_procediment,
      data_inici, data_fi, cerca,
      pagina = '1', limit = '50',
      sort_by, sort_dir,
    } = req.query;

    let baseWhere = 'd.duplicat_de IS NULL';
    const params: any[] = [];

    if (comunitat_autonoma) {
      baseWhere += ' AND a.comunitat_autonoma = ?';
      params.push(comunitat_autonoma);
    }
    if (provincia) {
      baseWhere += ' AND a.provincia = ?';
      params.push(provincia);
    }
    if (estat) {
      baseWhere += ' AND d.estat = ?';
      params.push(estat);
    }
    if (tipus_procediment) {
      baseWhere += ' AND d.tipus_procediment = ?';
      params.push(tipus_procediment);
    }
    if (data_inici) {
      baseWhere += ' AND d.data_desnonament >= ?';
      params.push(data_inici);
    }
    if (data_fi) {
      baseWhere += ' AND d.data_desnonament <= ?';
      params.push(data_fi);
    }
    if (cerca) {
      baseWhere += ' AND (a.nom_via LIKE ? OR a.localitat LIKE ? OR a.adreca_original LIKE ?)';
      const s = `%${cerca}%`;
      params.push(s, s, s);
    }

    const countSql = `SELECT COUNT(*) as total FROM desnonaments d JOIN adreces a ON d.adreca_id = a.id WHERE ${baseWhere}`;
    const totalResult = db.prepare(countSql).get(...params) as any;

    const pageNum = Math.max(1, parseInt(pagina as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    const allowedSortCols: Record<string, string> = {
      data_desnonament: 'd.data_desnonament',
      estat: 'd.estat',
      comunitat_autonoma: 'a.comunitat_autonoma',
      provincia: 'a.provincia',
      localitat: 'a.localitat',
    };
    const sortCol = allowedSortCols[sort_by as string] || 'd.data_desnonament';
    const sortDirection = sort_dir === 'desc' ? 'DESC' : 'ASC';

    const sql = `
      SELECT d.*,
        a.adreca_original, a.tipus_via, a.nom_via, a.numero, a.pis, a.porta,
        a.codi_postal, a.localitat, a.provincia, a.comunitat_autonoma,
        a.latitud, a.longitud, a.geocodat, a.ref_catastral
      FROM desnonaments d
      JOIN adreces a ON d.adreca_id = a.id
      WHERE ${baseWhere}
      ORDER BY ${sortCol} ${sortDirection}
      LIMIT ? OFFSET ?
    `;
    params.push(limitNum, offset);

    const desnonaments = db.prepare(sql).all(...params);

    res.json({
      ok: true,
      data: desnonaments,
      total: totalResult?.total || 0,
      pagina: pageNum,
      limit: limitNum,
    });
  } catch (error) {
    console.error('Error llistant desnonaments:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// ─── GET /api/desnonaments/mapa — Punts pel mapa ────────────────

desnonamentRoutes.get('/mapa', (req: Request, res: Response) => {
  try {
    const db = getDB();
    const { estat, limit, south, north, west, east, historic } = req.query;

    const conditions: string[] = ['d.duplicat_de IS NULL', 'a.latitud IS NOT NULL'];
    const params: any[] = [];

    if (estat) {
      conditions.push('d.estat = ?');
      params.push(estat);
    } else {
      conditions.push("d.estat IN ('programat', 'imminent')");
    }

    // Per defecte el mapa només mostra desnonaments futurs (a partir d'avui).
    // Passa ?historic=1 per veure-ho tot (estadístiques, etc.)
    if (historic !== '1') {
      conditions.push("d.data_desnonament >= date('now', 'localtime')");
    }

    if (south && north && west && east) {
      conditions.push('a.latitud BETWEEN ? AND ?');
      conditions.push('a.longitud BETWEEN ? AND ?');
      params.push(parseFloat(south as string), parseFloat(north as string));
      params.push(parseFloat(west as string), parseFloat(east as string));
    }

    const where = conditions.join(' AND ');

    const sql = `
      SELECT d.id, a.latitud, a.longitud, d.estat, d.data_desnonament,
             d.hora_desnonament, a.localitat AS ciutat, a.provincia,
             a.comunitat_autonoma, a.adreca_original,
             a.tipus_via, a.nom_via, a.numero, a.bloc, a.escala,
             a.pis, a.porta, a.codi_postal,
             d.tipus_subhasta, d.tipus_be,
             d.vivenda_habitual, d.quantitat_reclamada,
             d.valor_subhasta, a.geocodat,
             d.tipus_procediment, d.jutjat
      FROM desnonaments d
      JOIN adreces a ON d.adreca_id = a.id
      WHERE ${where}
      ORDER BY d.data_desnonament ASC
      LIMIT ?
    `;
    const maxLimit = Math.min(parseInt(limit as string) || 50000, 50000);
    params.push(maxLimit);

    const punts = db.prepare(sql).all(...params) as any[];

    // Jitter: city-level geocoded points (geocodat=2 or 3) share exact same coords.
    // Use a capped golden-angle spiral so markers spread but never exceed ~200m.
    const seen = new Map<string, number>();
    const MAX_JITTER = 0.002; // ~220m max offset (safe, never bleeds into other cities)
    for (const p of punts) {
      if (p.geocodat >= 2) {
        const key = `${p.latitud},${p.longitud}`;
        const count = seen.get(key) || 0;
        seen.set(key, count + 1);
        // Spiral pattern: angle based on index, radius grows slowly but is capped
        const angle = count * 2.399963; // golden angle in radians
        const rawRadius = 0.0005 * Math.sqrt(count + 1); // tighter base radius
        const radius = Math.min(rawRadius, MAX_JITTER); // hard cap at ~200m
        p.latitud = p.latitud + radius * Math.cos(angle);
        p.longitud = p.longitud + radius * Math.sin(angle);
      }
    }

    // Total count for stats (same date filter)
    const countConditions: string[] = ['d.duplicat_de IS NULL'];
    const countParams: any[] = [];
    if (estat) {
      countConditions.push('d.estat = ?');
      countParams.push(estat);
    } else {
      countConditions.push("d.estat IN ('programat', 'imminent')");
    }
    if (historic !== '1') {
      countConditions.push("d.data_desnonament >= date('now', 'localtime')");
    }
    const countSql = `SELECT COUNT(*) as c FROM desnonaments d WHERE ${countConditions.join(' AND ')}`;
    const totalCount = (db.prepare(countSql).get(...countParams) as any).c;

    res.json({ ok: true, data: punts, total: punts.length, totalCount });
  } catch (error) {
    console.error('Error obtenint punts del mapa:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// ─── GET /api/desnonaments/estadistiques ─────────────────────────

desnonamentRoutes.get('/estadistiques', (_req: Request, res: Response) => {
  try {
    const db = getDB();

    const stats = {
      total: (db.prepare('SELECT COUNT(*) as c FROM desnonaments WHERE duplicat_de IS NULL').get() as any).c,
      programats: (db.prepare("SELECT COUNT(*) as c FROM desnonaments WHERE duplicat_de IS NULL AND estat = 'programat'").get() as any).c,
      imminents: (db.prepare("SELECT COUNT(*) as c FROM desnonaments WHERE duplicat_de IS NULL AND estat = 'imminent'").get() as any).c,
      cancelats: (db.prepare("SELECT COUNT(*) as c FROM desnonaments WHERE duplicat_de IS NULL AND estat = 'cancelat'").get() as any).c,
      executats: (db.prepare("SELECT COUNT(*) as c FROM desnonaments WHERE duplicat_de IS NULL AND estat = 'executat'").get() as any).c,
      suspesos: (db.prepare("SELECT COUNT(*) as c FROM desnonaments WHERE duplicat_de IS NULL AND estat = 'suspès'").get() as any).c,
      perProvincia: db.prepare(`
        SELECT a.provincia, COUNT(*) as total
        FROM desnonaments d
        JOIN adreces a ON d.adreca_id = a.id
        WHERE d.duplicat_de IS NULL AND d.estat IN ('programat', 'imminent')
        GROUP BY a.provincia
        ORDER BY total DESC
      `).all(),
    };

    res.json({ ok: true, data: stats });
  } catch (error) {
    console.error('Error obtenint estadístiques:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// ─── GET /api/desnonaments/historial-global ──────────────────────

desnonamentRoutes.get('/historial-global', (_req: Request, res: Response) => {
  try {
    const db = getDB();
    const historial = db.prepare(`
      SELECT h.*, a.localitat AS ciutat, a.comunitat_autonoma
      FROM historial h
      JOIN desnonaments d ON h.desnonament_id = d.id
      JOIN adreces a ON d.adreca_id = a.id
      ORDER BY h.data DESC
    `).all();

    res.json({ ok: true, data: historial });
  } catch (error) {
    console.error('Error obtenint historial global:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// ─── GET /api/desnonaments/:id — Detall ─────────────────────────

desnonamentRoutes.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDB();
    const desnonament = db.prepare(`
      SELECT d.*,
        a.adreca_original, a.tipus_via, a.nom_via, a.numero, a.bloc, a.escala, a.pis, a.porta,
        a.codi_postal, a.localitat, a.provincia, a.comunitat_autonoma,
        a.codi_provincia, a.latitud, a.longitud, a.geocodat, a.ref_catastral
      FROM desnonaments d
      JOIN adreces a ON d.adreca_id = a.id
      WHERE d.id = ?
    `).get(req.params.id);

    if (!desnonament) {
      return res.status(404).json({ ok: false, error: 'Desnonament no trobat' });
    }

    res.json({ ok: true, data: desnonament });
  } catch (error) {
    console.error('Error obtenint desnonament:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// ─── GET /api/desnonaments/:id/historial ─────────────────────────

desnonamentRoutes.get('/:id/historial', (req: Request, res: Response) => {
  try {
    const db = getDB();

    const desnonament = db.prepare('SELECT id FROM desnonaments WHERE id = ?').get(req.params.id);
    if (!desnonament) {
      return res.status(404).json({ ok: false, error: 'Desnonament no trobat' });
    }

    const historial = db.prepare(
      'SELECT * FROM historial WHERE desnonament_id = ? ORDER BY data DESC'
    ).all(req.params.id);

    res.json({ ok: true, data: historial });
  } catch (error) {
    console.error('Error obtenint historial:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});
