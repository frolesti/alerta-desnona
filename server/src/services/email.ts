/**
 * Servei d'email (Nodemailer)
 *
 * Envia notificacions i resums diaris per email als usuaris subscrits.
 *
 * Requereix les variables d'entorn:
 *   SMTP_HOST   — servidor SMTP (smtp.gmail.com, smtp.mailgun.org...)
 *   SMTP_PORT   — port (587 per TLS, 465 per SSL)
 *   SMTP_USER   — usuari d'autenticació
 *   SMTP_PASS   — contrasenya / app password
 *   SMTP_FROM   — adreça remitent ("Alerta Desnona <alertes@alertadesnona.cat>")
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getDB } from '../db/database';

// ─── Configuració ────────────────────────────────────────────

let transporter: Transporter | null = null;
let emailConfigured = false;

export function initEmail(): boolean {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('⚠️  Email desactivat: falten SMTP_HOST, SMTP_USER o SMTP_PASS');
    return false;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  emailConfigured = true;
  console.log(`📧 Email activat (${host}:${port})`);
  return true;
}

export function isEmailConfigured(): boolean {
  return emailConfigured;
}

// ─── Tipus ───────────────────────────────────────────────────

interface DesnonamentResum {
  id: string;
  data_desnonament: string;
  hora_desnonament: string | null;
  estat: string;
  tipus_procediment: string;
  localitat: string | null;
  provincia: string | null;
  comunitat_autonoma: string | null;
  adreca_original: string;
  tipus_be: string | null;
  quantitat_reclamada: string | null;
}

interface UsuariEmail {
  id: string;
  email: string;
  nom: string | null;
  notificacions_email: number;
}

// ─── HTML template ───────────────────────────────────────────

function tipusProcedimentText(tipus: string): string {
  const map: Record<string, string> = {
    ejecucion_hipotecaria: '🏦 Execució hipotecària',
    impago_alquiler: '🏠 Impagament de lloguer',
    ocupacion: '🚪 Ocupació',
    cautelar: '⚖️ Mesura cautelar',
    desconegut: '❓ Tipus desconegut',
  };
  return map[tipus] || tipus;
}

function estatBadge(estat: string): string {
  const colors: Record<string, string> = {
    imminent: '#dc2626',
    programat: '#f59e0b',
    executat: '#6b7280',
    suspès: '#3b82f6',
  };
  const color = colors[estat] || '#6b7280';
  return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;text-transform:uppercase;">${estat}</span>`;
}

function generarHTMLResum(
  desnonaments: DesnonamentResum[],
  nom: string | null,
  baseUrl: string
): string {
  const salutacio = nom ? `Hola ${nom},` : 'Hola,';
  const avui = new Date().toLocaleDateString('ca-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const files = desnonaments
    .map(
      (d) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:12px 8px;">
        ${estatBadge(d.estat)}<br/>
        <small style="color:#6b7280;">${tipusProcedimentText(d.tipus_procediment)}</small>
      </td>
      <td style="padding:12px 8px;">
        <strong>${d.localitat || 'Desconeguda'}</strong>, ${d.provincia || ''}<br/>
        <small style="color:#6b7280;">${d.adreca_original}</small>
      </td>
      <td style="padding:12px 8px;white-space:nowrap;">
        📅 ${d.data_desnonament}${d.hora_desnonament ? `<br/>🕐 ${d.hora_desnonament}` : ''}
      </td>
      <td style="padding:12px 8px;">
        ${d.tipus_be || '—'}<br/>
        ${d.quantitat_reclamada ? `💰 ${d.quantitat_reclamada}` : ''}
      </td>
      <td style="padding:12px 8px;text-align:center;">
        <a href="${baseUrl}/cas/${d.id}" style="color:#dc2626;font-weight:600;text-decoration:none;">Veure →</a>
      </td>
    </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="ca">
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;margin-top:24px;margin-bottom:24px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#dc2626,#991b1b);padding:24px 32px;color:#fff;">
      <h1 style="margin:0;font-size:22px;">🏠 Alerta Desnona</h1>
      <p style="margin:4px 0 0;opacity:0.9;font-size:14px;">Resum diari — ${avui}</p>
    </div>

    <!-- Body -->
    <div style="padding:24px 32px;">
      <p style="font-size:15px;color:#374151;">${salutacio}</p>
      <p style="font-size:15px;color:#374151;">
        ${desnonaments.length === 1
          ? "Hi ha <strong>1 desnonament</strong> programat pels propers 7 dies a les teves zones d'alerta:"
          : `Hi ha <strong>${desnonaments.length} desnonaments</strong> programats pels propers 7 dies a les teves zones d'alerta:`
        }
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
        <thead>
          <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Estat</th>
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Ubicació</th>
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Data</th>
            <th style="padding:10px 8px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Tipus</th>
            <th style="padding:10px 8px;text-align:center;font-size:12px;color:#6b7280;text-transform:uppercase;">Detall</th>
          </tr>
        </thead>
        <tbody>${files}</tbody>
      </table>

      <div style="text-align:center;margin:24px 0;">
        <a href="${baseUrl}/mapa" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
          🗺️ Veure mapa complet
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
        Reps aquest email perquè estàs subscrit/a a Alerta Desnona.<br/>
        <a href="${baseUrl}/alertes" style="color:#dc2626;">Gestionar les meves alertes</a> · 
        <a href="${baseUrl}" style="color:#6b7280;">alertadesnona.cat</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ─── Enviar email a un usuari ────────────────────────────────

export async function enviarEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  if (!transporter || !emailConfigured) return false;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    await transporter.sendMail({ from, to, subject, html });
    return true;
  } catch (error: any) {
    console.error(`❌ Error enviant email a ${to}:`, error.message || error);
    return false;
  }
}

// ─── Resum diari ─────────────────────────────────────────────

export async function enviarResumDiari(): Promise<{
  enviats: number;
  errors: number;
}> {
  if (!emailConfigured) return { enviats: 0, errors: 0 };

  const db = getDB();
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  // 1. Obtenir desnonaments dels propers 7 dies
  const desnonaments = db
    .prepare(
      `SELECT d.id, d.data_desnonament, d.hora_desnonament, d.estat,
              d.tipus_procediment, d.tipus_be, d.quantitat_reclamada,
              a.localitat, a.provincia, a.comunitat_autonoma, a.adreca_original
       FROM desnonaments d
       JOIN adreces a ON d.adreca_id = a.id
       WHERE d.estat IN ('programat', 'imminent')
         AND datetime(d.data_desnonament) >= datetime('now')
         AND datetime(d.data_desnonament) <= datetime('now', '+7 days')
       ORDER BY d.data_desnonament ASC`
    )
    .all() as DesnonamentResum[];

  if (desnonaments.length === 0) {
    console.log('📧 Resum diari: cap desnonament pendent → no s\'envia email');
    return { enviats: 0, errors: 0 };
  }

  // 2. Obtenir usuaris amb email activat
  const usuaris = db
    .prepare(
      `SELECT DISTINCT u.id, u.email, u.nom, u.notificacions_email
       FROM usuaris u
       WHERE u.notificacions_email = 1`
    )
    .all() as UsuariEmail[];

  let enviats = 0;
  let errors = 0;

  for (const u of usuaris) {
    // Filtrar desnonaments per les subscripcions de l'usuari
    const subs = db
      .prepare('SELECT tipus, valor FROM subscripcions WHERE usuari_id = ? AND activa = 1')
      .all(u.id) as Array<{ tipus: string; valor: string }>;

    const desnonamentsUsuari = desnonaments.filter((d) =>
      subs.some(
        (s) =>
          (s.tipus === 'comunitat' && (s.valor === 'totes' || s.valor === d.comunitat_autonoma)) ||
          (s.tipus === 'provincia' && s.valor === d.provincia) ||
          (s.tipus === 'comarca' && s.valor === d.localitat)
      )
    );

    if (desnonamentsUsuari.length === 0) continue;

    const html = generarHTMLResum(desnonamentsUsuari, u.nom, baseUrl);
    const subject = `⚠️ ${desnonamentsUsuari.length} desnonament${desnonamentsUsuari.length > 1 ? 's' : ''} programat${desnonamentsUsuari.length > 1 ? 's' : ''} — Alerta Desnona`;

    const ok = await enviarEmail(u.email, subject, html);
    if (ok) enviats++;
    else errors++;
  }

  if (enviats > 0 || errors > 0) {
    console.log(`📧 Resum diari: ${enviats} emails enviats, ${errors} errors`);
  }

  return { enviats, errors };
}

// ─── Notificació individual (desnonament imminent) ───────────

export async function notificarDesnonamentPerEmail(
  usuariId: string,
  desnonamentId: string
): Promise<boolean> {
  if (!emailConfigured) return false;

  const db = getDB();
  const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  const d = db
    .prepare(
      `SELECT d.id, d.data_desnonament, d.hora_desnonament, d.estat,
              d.tipus_procediment, a.localitat, a.provincia, a.adreca_original
       FROM desnonaments d
       JOIN adreces a ON d.adreca_id = a.id
       WHERE d.id = ?`
    )
    .get(desnonamentId) as any;

  const u = db
    .prepare('SELECT email, nom FROM usuaris WHERE id = ?')
    .get(usuariId) as { email: string; nom: string | null } | undefined;

  if (!d || !u) return false;

  const nom = u.nom ? `Hola ${u.nom},` : 'Hola,';

  const html = `
<!DOCTYPE html>
<html lang="ca">
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#dc2626;padding:20px 28px;color:#fff;">
      <h1 style="margin:0;font-size:18px;">⚠️ Desnonament imminent</h1>
    </div>
    <div style="padding:24px 28px;">
      <p>${nom}</p>
      <p>S'ha detectat un desnonament imminent a una zona d'alerta teva:</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px;"><strong>📍 ${d.localitat || 'Desconeguda'}, ${d.provincia || ''}</strong></p>
        <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">${d.adreca_original}</p>
        <p style="margin:8px 0 0;"><strong>📅 ${d.data_desnonament}</strong>${d.hora_desnonament ? ` a les ${d.hora_desnonament}` : ''}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${tipusProcedimentText(d.tipus_procediment)}</p>
      </div>
      <div style="text-align:center;margin:20px 0;">
        <a href="${baseUrl}/cas/${d.id}" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Veure detalls</a>
      </div>
    </div>
    <div style="background:#f9fafb;padding:12px 28px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
        <a href="${baseUrl}/alertes" style="color:#dc2626;">Gestionar alertes</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  const subject = `⚠️ Desnonament imminent — ${d.localitat || d.provincia || 'Alerta Desnona'}`;
  return enviarEmail(u.email, subject, html);
}
