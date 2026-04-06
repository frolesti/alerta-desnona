import cron from 'node-cron';
import { getDB } from '../db/database';
import { v4 as uuid } from 'uuid';
import { notificarDesnonamentsImminents } from './push';
import { enviarResumDiari, notificarDesnonamentPerEmail, isEmailConfigured } from './email';
import { notificarImminentsFCM, isFCMConfigured } from './fcm';

export function startCronJobs(): void {
  // Cada hora: comprovar si hi ha desnonaments que s'apropen (< 48h) i marcar-los com a imminents
  cron.schedule('0 * * * *', () => {
    console.log('⏰ Executant tasca de revisió de desnonaments imminents...');
    markImminentDesnonaments();
  });

  // Cada dia a les 8:00: enviar resum diari als usuaris subscrits
  cron.schedule('0 8 * * *', () => {
    console.log('📧 Executant tasca de resum diari...');
    sendDailySummary();
  });

  // Cada 6h: simular scraping de fonts oficials (placeholder per futures integracions)
  cron.schedule('0 */6 * * *', () => {
    console.log('🔍 Executant tasca de scraping de fonts oficials...');
    scrapeOfficialSources();
  });

  console.log('⏰ Tasques programades activades');
}

function markImminentDesnonaments(): void {
  try {
    const db = getDB();
    const result = db.prepare(`
      UPDATE desnonaments 
      SET estat = 'imminent', actualitzat_el = datetime('now')
      WHERE estat = 'programat' 
      AND datetime(data_desnonament) <= datetime('now', '+48 hours')
      AND datetime(data_desnonament) > datetime('now')
    `).run();

    if (result.changes > 0) {
      console.log(`  → ${result.changes} desnonaments marcats com a imminents`);
      createNotificationsForImminent();
      // Enviar push notifications reals als usuaris subscrits
      notificarDesnonamentsImminents().catch((err) =>
        console.error('Error enviant push notifications:', err)
      );
      // Enviar FCM push als dispositius natius (Android/iOS)
      if (isFCMConfigured()) {
        notificarImminentsFCM().catch((err) =>
          console.error('Error enviant FCM notifications:', err)
        );
      }
      // Enviar emails individuals als usuaris amb notificacions_email activat
      if (isEmailConfigured()) {
        notificarImminentsPerEmail().catch((err) =>
          console.error('Error enviant emails de desnonaments imminents:', err)
        );
      }
    }
  } catch (error) {
    console.error('Error marcant desnonaments imminents:', error);
  }
}

function createNotificationsForImminent(): void {
  try {
    const db = getDB();

    // Get imminent desnonaments with address info
    const imminents = db.prepare(`
      SELECT d.id, a.provincia, a.comunitat_autonoma
      FROM desnonaments d
      JOIN adreces a ON d.adreca_id = a.id
      WHERE d.estat = 'imminent'
    `).all() as any[];

    for (const d of imminents) {
      // Find subscribed users (by provincia or comunitat)
      const usuaris = db.prepare(`
        SELECT DISTINCT u.* FROM usuaris u
        JOIN subscripcions s ON u.id = s.usuari_id
        WHERE s.activa = 1
        AND (
          (s.tipus = 'provincia' AND s.valor = ?)
          OR (s.tipus = 'comunitat' AND s.valor = ?)
        )
      `).all(d.provincia, d.comunitat_autonoma) as any[];

      for (const u of usuaris) {
        // Check if notification already exists
        const exists = db.prepare(`
          SELECT id FROM notificacions 
          WHERE usuari_id = ? AND desnonament_id = ?
        `).get(u.id, d.id);

        if (!exists) {
          db.prepare(`
            INSERT INTO notificacions (id, usuari_id, desnonament_id, tipus)
            VALUES (?, ?, ?, ?)
          `).run(uuid(), u.id, d.id, u.notificacions_push ? 'push' : 'email');
        }
      }
    }
  } catch (error) {
    console.error('Error creant notificacions:', error);
  }
}

async function sendDailySummary(): Promise<void> {
  try {
    const db = getDB();
    const upcoming = db.prepare(`
      SELECT COUNT(*) as c FROM desnonaments 
      WHERE estat IN ('programat', 'imminent')
      AND datetime(data_desnonament) >= datetime('now')
      AND datetime(data_desnonament) <= datetime('now', '+7 days')
    `).get() as any;

    console.log(`  → ${upcoming.c} desnonaments programats pels propers 7 dies`);

    // Enviar resum diari per email si SMTP està configurat
    if (isEmailConfigured()) {
      const result = await enviarResumDiari();
      if (result.enviats > 0 || result.errors > 0) {
        console.log(`  → Emails: ${result.enviats} enviats, ${result.errors} errors`);
      }
    }
  } catch (error) {
    console.error('Error enviant resum diari:', error);
  }
}

async function notificarImminentsPerEmail(): Promise<void> {
  const db = getDB();
  const imminents = db
    .prepare(
      `SELECT d.id AS desnonament_id, u.id AS usuari_id
       FROM desnonaments d
       JOIN adreces a ON d.adreca_id = a.id
       JOIN subscripcions s ON (
         (s.tipus = 'provincia' AND s.valor = a.provincia)
         OR (s.tipus = 'comunitat' AND (s.valor = a.comunitat_autonoma OR s.valor = 'totes'))
       )
       JOIN usuaris u ON s.usuari_id = u.id
       WHERE d.estat = 'imminent'
         AND u.notificacions_email = 1
         AND s.activa = 1
         AND NOT EXISTS (
           SELECT 1 FROM notificacions n
           WHERE n.usuari_id = u.id AND n.desnonament_id = d.id AND n.tipus = 'email'
         )`
    )
    .all() as Array<{ desnonament_id: string; usuari_id: string }>;

  let enviats = 0;
  let errors = 0;

  for (const row of imminents) {
    const ok = await notificarDesnonamentPerEmail(row.usuari_id, row.desnonament_id);

    // Registrar notificació (enviada o no, per evitar duplicats)
    db.prepare(
      `INSERT INTO notificacions (id, usuari_id, desnonament_id, tipus) VALUES (?, ?, ?, 'email')`
    ).run(uuid(), row.usuari_id, row.desnonament_id);

    if (ok) enviats++;
    else errors++;
  }

  if (enviats > 0 || errors > 0) {
    console.log(`📧 Emails imminents: ${enviats} enviats, ${errors} errors`);
  }
}

function scrapeOfficialSources(): void {
  // Placeholder per futures integracions amb:
  // - Diari Oficial de la Generalitat de Catalunya (DOGC)
  // - Taulell d'edictes judicials (TEJ)
  // - BOE - Boletín Oficial del Estado
  // - Consells comarcals
  console.log('  → Scraping de fonts oficials (placeholder - pendent implementació)');
  console.log('  → Fonts futures: DOGC, TEJ, BOE, Consells Comarcals');
}
