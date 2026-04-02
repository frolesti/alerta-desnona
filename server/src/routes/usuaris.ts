import { Router, Request, Response } from 'express';
import { getDB } from '../db/database';
import { v4 as uuid } from 'uuid';

export const usuariRoutes = Router();

// POST /api/usuaris/registre - Registrar nou usuari
usuariRoutes.post('/registre', (req: Request, res: Response) => {
  try {
    const db = getDB();
    const { email, nom, comarques, comunitats, provincies, notificacions_email, radi_km, latitud, longitud } = req.body;

    if (!email) {
      return res.status(400).json({ ok: false, error: "L'email és obligatori" });
    }

    // Check existing
    const existing = db.prepare('SELECT id FROM usuaris WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Ja existeix un usuari amb aquest email' });
    }

    const id = uuid();
    db.prepare(`
      INSERT INTO usuaris (id, email, nom, notificacions_email, radi_km, latitud, longitud)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, nom || null, notificacions_email !== false ? 1 : 0, radi_km || 10, latitud || null, longitud || null);

    // Create subscriptions
    const insertSub = db.prepare('INSERT INTO subscripcions (id, usuari_id, tipus, valor) VALUES (?, ?, ?, ?)');
    
    if (comarques && Array.isArray(comarques)) {
      for (const comarca of comarques) {
        insertSub.run(uuid(), id, 'comarca', comarca);
      }
    }
    if (comunitats && Array.isArray(comunitats)) {
      for (const comunitat of comunitats) {
        insertSub.run(uuid(), id, 'comunitat', comunitat);
      }
    }
    if (provincies && Array.isArray(provincies)) {
      for (const provincia of provincies) {
        insertSub.run(uuid(), id, 'provincia', provincia);
      }
    }

    // If no specific subscriptions, subscribe to all Spain
    if ((!comarques || comarques.length === 0) && (!comunitats || comunitats.length === 0) && (!provincies || provincies.length === 0)) {
      insertSub.run(uuid(), id, 'comunitat', 'totes');
    }

    const usuari = db.prepare('SELECT * FROM usuaris WHERE id = ?').get(id) as Record<string, unknown>;
    const subscripcions = db.prepare('SELECT * FROM subscripcions WHERE usuari_id = ?').all(id);

    res.status(201).json({ ok: true, data: { ...usuari, subscripcions } });
  } catch (error) {
    console.error('Error registrant usuari:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// GET /api/usuaris/:id - Obtenir perfil usuari
usuariRoutes.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDB();
    const usuari = db.prepare('SELECT * FROM usuaris WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
    
    if (!usuari) {
      return res.status(404).json({ ok: false, error: 'Usuari no trobat' });
    }

    const subscripcions = db.prepare('SELECT * FROM subscripcions WHERE usuari_id = ?').all(req.params.id);
    res.json({ ok: true, data: { ...usuari, subscripcions } });
  } catch (error) {
    console.error('Error obtenint usuari:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});

// PUT /api/usuaris/:id/push-subscription - Guardar subscripció push
usuariRoutes.put('/:id/push-subscription', (req: Request, res: Response) => {
  try {
    const db = getDB();
    const { subscription } = req.body;

    db.prepare(`
      UPDATE usuaris SET push_subscription = ?, notificacions_push = 1 WHERE id = ?
    `).run(JSON.stringify(subscription), req.params.id);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error guardant push subscription:', error);
    res.status(500).json({ ok: false, error: 'Error intern del servidor' });
  }
});
