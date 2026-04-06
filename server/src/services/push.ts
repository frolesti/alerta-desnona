/**
 * Servei de notificacions push (Web Push / VAPID)
 *
 * Envia notificacions reals als navegadors dels usuaris subscrits
 * mitjançant el protocol Web Push amb claus VAPID.
 *
 * Requereix les variables d'entorn:
 *   VAPID_PUBLIC_KEY   — clau pública (base64url)
 *   VAPID_PRIVATE_KEY  — clau privada (base64url)
 *   VAPID_EMAIL        — email de contacte (mailto:...)
 *
 * Genera claus amb: npx web-push generate-vapid-keys
 */

import webPush from 'web-push';
import { getDB } from '../db/database';
import { v4 as uuid } from 'uuid';

// ─── Configuració VAPID ──────────────────────────────────────

let vapidConfigured = false;

export function initPush(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL;

  if (!publicKey || !privateKey || !email) {
    console.warn(
      '⚠️  Push desactivat: falten VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_EMAIL'
    );
    console.warn('   Genera claus amb: npx web-push generate-vapid-keys');
    return false;
  }

  webPush.setVapidDetails(email, publicKey, privateKey);
  vapidConfigured = true;
  console.log('🔔 Push notifications activades (VAPID)');
  return true;
}

export function isVapidConfigured(): boolean {
  return vapidConfigured;
}

export function getVapidPublicKey(): string | undefined {
  return process.env.VAPID_PUBLIC_KEY;
}

// ─── Tipus ───────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
}

interface UsuariAmbPush {
  id: string;
  email: string;
  push_subscription: string | null;
  notificacions_push: number;
}

// ─── Enviar push a un usuari ─────────────────────────────────

export async function enviarPushAUsuari(
  usuariId: string,
  payload: PushPayload
): Promise<boolean> {
  if (!vapidConfigured) return false;

  const db = getDB();
  const usuari = db
    .prepare('SELECT id, email, push_subscription, notificacions_push FROM usuaris WHERE id = ?')
    .get(usuariId) as UsuariAmbPush | undefined;

  if (!usuari?.push_subscription || !usuari.notificacions_push) {
    return false;
  }

  try {
    const subscription = JSON.parse(usuari.push_subscription);
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (error: any) {
    // 410 Gone o 404 = subscripció invàlida, netejar
    if (error.statusCode === 410 || error.statusCode === 404) {
      console.warn(`🔕 Subscripció push caducada per usuari ${usuari.email}, eliminant...`);
      db.prepare('UPDATE usuaris SET push_subscription = NULL, notificacions_push = 0 WHERE id = ?')
        .run(usuariId);
    } else {
      console.error(`❌ Error enviant push a ${usuari.email}:`, error.message || error);
    }
    return false;
  }
}

// ─── Notificar desnonaments imminents ────────────────────────

export async function notificarDesnonamentsImminents(): Promise<{
  enviats: number;
  errors: number;
}> {
  if (!vapidConfigured) return { enviats: 0, errors: 0 };

  const db = getDB();
  let enviats = 0;
  let errors = 0;

  // Trobar desnonaments imminents sense notificació push enviada
  const imminents = db
    .prepare(
      `SELECT d.id, d.data_desnonament, a.localitat, a.provincia, a.comunitat_autonoma
       FROM desnonaments d
       JOIN adreces a ON d.adreca_id = a.id
       WHERE d.estat = 'imminent'`
    )
    .all() as Array<{
      id: string;
      data_desnonament: string;
      localitat: string;
      provincia: string;
      comunitat_autonoma: string;
    }>;

  for (const d of imminents) {
    // Trobar usuaris subscrits amb push actiu
    const usuaris = db
      .prepare(
        `SELECT DISTINCT u.id, u.email, u.push_subscription, u.notificacions_push
         FROM usuaris u
         JOIN subscripcions s ON u.id = s.usuari_id
         WHERE u.notificacions_push = 1
           AND u.push_subscription IS NOT NULL
           AND s.activa = 1
           AND (
             (s.tipus = 'provincia' AND s.valor = ?)
             OR (s.tipus = 'comunitat' AND (s.valor = ? OR s.valor = 'totes'))
           )`
      )
      .all(d.provincia, d.comunitat_autonoma) as UsuariAmbPush[];

    for (const u of usuaris) {
      // Comprovar si ja s'ha enviat push per aquesta combinació
      const jaEnviat = db
        .prepare(
          `SELECT id FROM notificacions
           WHERE usuari_id = ? AND desnonament_id = ? AND tipus = 'push'`
        )
        .get(u.id, d.id);

      if (jaEnviat) continue;

      const payload: PushPayload = {
        title: '⚠️ Desnonament imminent',
        body: `${d.localitat || 'Ubicació desconeguda'}, ${d.provincia || ''} — ${d.data_desnonament}`,
        tag: `desnonament-${d.id}`,
        url: `/cas/${d.id}`,
      };

      const ok = await enviarPushAUsuari(u.id, payload);

      // Registrar la notificació (enviada o no)
      db.prepare(
        `INSERT INTO notificacions (id, usuari_id, desnonament_id, tipus) VALUES (?, ?, ?, 'push')`
      ).run(uuid(), u.id, d.id);

      if (ok) {
        enviats++;
      } else {
        errors++;
      }
    }
  }

  if (enviats > 0 || errors > 0) {
    console.log(`🔔 Push: ${enviats} enviats, ${errors} errors`);
  }

  return { enviats, errors };
}

// ─── Enviar push personalitzat (admin/testing) ──────────────

export async function enviarPushATots(payload: PushPayload): Promise<{
  enviats: number;
  errors: number;
}> {
  if (!vapidConfigured) return { enviats: 0, errors: 0 };

  const db = getDB();
  const usuaris = db
    .prepare(
      `SELECT id, email, push_subscription, notificacions_push
       FROM usuaris
       WHERE notificacions_push = 1
         AND push_subscription IS NOT NULL`
    )
    .all() as UsuariAmbPush[];

  let enviats = 0;
  let errors = 0;

  for (const u of usuaris) {
    const ok = await enviarPushAUsuari(u.id, payload);
    if (ok) enviats++;
    else errors++;
  }

  return { enviats, errors };
}
