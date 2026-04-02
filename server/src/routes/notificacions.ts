import { Router, Request, Response } from 'express';
import { getDB } from '../db/database';

export const notificacioRoutes = Router();

// GET /api/notificacions/:usuariId - Obtenir notificacions d'un usuari
notificacioRoutes.get('/:usuariId', (req: Request, res: Response) => {
  try {
    const db = getDB();
    const notificacions = db.prepare(`
      SELECT n.*, d.titol as desnonament_titol, d.ciutat, d.data_desnonament, d.estat
      FROM notificacions n
      JOIN desnonaments d ON n.desnonament_id = d.id
      WHERE n.usuari_id = ?
      ORDER BY n.enviat_el DESC
      LIMIT 50
    `).all(req.params.usuariId);

    res.json({ ok: true, data: notificacions });
  } catch (error) {
    console.error('Error obtenint notificacions:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// PUT /api/notificacions/:id/llegit - Marcar com a llegida
notificacioRoutes.put('/:id/llegit', (req: Request, res: Response) => {
  try {
    const db = getDB();
    db.prepare('UPDATE notificacions SET llegit = 1 WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error marcant notificació:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});
