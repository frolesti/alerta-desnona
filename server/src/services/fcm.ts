/**
 * Servei de notificacions push natives (Firebase Cloud Messaging)
 *
 * Envia push notifications a dispositius Android/iOS via FCM.
 * Complementa el servei web-push (VAPID) que funciona per navegadors.
 *
 * Requereix les variables d'entorn:
 *   FIREBASE_PROJECT_ID     — ID del projecte Firebase
 *   FIREBASE_PRIVATE_KEY    — Clau privada del service account (JSON escaped)
 *   FIREBASE_CLIENT_EMAIL   — Email del service account
 */

import admin from 'firebase-admin';
import { getDB } from '../db/database';
import { v4 as uuid } from 'uuid';

// ─── Configuració ────────────────────────────────────────────

let fcmConfigured = false;

export function initFCM(): boolean {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId || !privateKey || !clientEmail) {
    console.warn('⚠️  FCM desactivat: falten FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY o FIREBASE_CLIENT_EMAIL');
    return false;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        // La private key ve amb \n escapats com a string, cal parsejar-los
        privateKey: privateKey.replace(/\\n/g, '\n'),
        clientEmail,
      }),
    });

    fcmConfigured = true;
    console.log('📱 FCM activat (Firebase Cloud Messaging)');
    return true;
  } catch (error: any) {
    console.error('❌ Error inicialitzant FCM:', error.message);
    return false;
  }
}

export function isFCMConfigured(): boolean {
  return fcmConfigured;
}

// ─── Tipus ───────────────────────────────────────────────────

export interface FCMPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  url?: string;
  data?: Record<string, string>;
}

interface UsuariAmbFCM {
  id: string;
  email: string;
  fcm_token: string | null;
  notificacions_push: number;
}

// ─── Enviar FCM a un usuari ──────────────────────────────────

export async function enviarFCMAUsuari(
  usuariId: string,
  payload: FCMPayload
): Promise<boolean> {
  if (!fcmConfigured) return false;

  const db = getDB();
  const usuari = db
    .prepare('SELECT id, email, fcm_token, notificacions_push FROM usuaris WHERE id = ?')
    .get(usuariId) as UsuariAmbFCM | undefined;

  if (!usuari?.fcm_token || !usuari.notificacions_push) {
    return false;
  }

  try {
    await admin.messaging().send({
      token: usuari.fcm_token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        ...(payload.data || {}),
        url: payload.url || '/',
        tag: payload.tag || '',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'desnonaments',
          icon: payload.icon || 'ic_launcher',
          color: '#dc2626',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    });
    return true;
  } catch (error: any) {
    // Token invàlid o caducat
    if (
      error.code === 'messaging/registration-token-not-registered' ||
      error.code === 'messaging/invalid-registration-token'
    ) {
      console.warn(`🔕 FCM token invàlid per ${usuari.email}, eliminant...`);
      db.prepare('UPDATE usuaris SET fcm_token = NULL WHERE id = ?').run(usuariId);
    } else {
      console.error(`❌ Error enviant FCM a ${usuari.email}:`, error.message || error);
    }
    return false;
  }
}

// ─── Notificar desnonaments imminents via FCM ────────────────

export async function notificarImminentsFCM(): Promise<{
  enviats: number;
  errors: number;
}> {
  if (!fcmConfigured) return { enviats: 0, errors: 0 };

  const db = getDB();
  let enviats = 0;
  let errors = 0;

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
    // Usuaris amb FCM token actiu i subscripció matching
    const usuaris = db
      .prepare(
        `SELECT DISTINCT u.id, u.email, u.fcm_token, u.notificacions_push
         FROM usuaris u
         JOIN subscripcions s ON u.id = s.usuari_id
         WHERE u.notificacions_push = 1
           AND u.fcm_token IS NOT NULL
           AND s.activa = 1
           AND (
             (s.tipus = 'provincia' AND s.valor = ?)
             OR (s.tipus = 'comunitat' AND (s.valor = ? OR s.valor = 'totes'))
           )`
      )
      .all(d.provincia, d.comunitat_autonoma) as UsuariAmbFCM[];

    for (const u of usuaris) {
      // Evitar duplicats
      const jaEnviat = db
        .prepare(
          `SELECT id FROM notificacions
           WHERE usuari_id = ? AND desnonament_id = ? AND tipus = 'fcm'`
        )
        .get(u.id, d.id);

      if (jaEnviat) continue;

      const payload: FCMPayload = {
        title: '⚠️ Desnonament imminent',
        body: `${d.localitat || 'Ubicació desconeguda'}, ${d.provincia || ''} — ${d.data_desnonament}`,
        tag: `desnonament-${d.id}`,
        url: `/cas/${d.id}`,
      };

      const ok = await enviarFCMAUsuari(u.id, payload);

      // Registrar notificació
      db.prepare(
        `INSERT INTO notificacions (id, usuari_id, desnonament_id, tipus) VALUES (?, ?, ?, 'fcm')`
      ).run(uuid(), u.id, d.id);

      if (ok) enviats++;
      else errors++;
    }
  }

  if (enviats > 0 || errors > 0) {
    console.log(`📱 FCM: ${enviats} enviats, ${errors} errors`);
  }

  return { enviats, errors };
}
