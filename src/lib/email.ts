import "server-only";

import nodemailer from "nodemailer";
import { serverEnv } from "@/lib/env";

// ===========================================================================
// Envio de mail via Gmail SMTP (App Password).
//
// Lo usamos para notificar al equipo del cliente cada vez que el agente
// deriva. El remitente es una cuenta Gmail propia (GMAIL_USER) y los
// destinatarios viven en ESCALATION_EMAIL_TO (coma-separated).
//
// Gmail SMTP requiere 2FA + App Password en la cuenta. El password no es
// el de login normal: se genera en myaccount.google.com/apppasswords.
//
// Limite: 500 destinatarios/dia por cuenta Gmail estandar. Para volumenes
// mayores migrar a Resend/Postmark.
// ===========================================================================

const COMMON_CATEGORY_LABEL: Record<string, string> = {
  interes_compra: "Interes de compra",
  cliente_existente: "Cliente existente",
  fuera_de_conocimiento: "Fuera de conocimiento",
  escalado_manual: "Escalado manual",
  falla_tecnica: "Falla tecnica",
  arquitecto_desarrollador: "Arquitecto / Desarrollador",
  cantidad_equipos: "Proyecto inmobiliario",
};

function humanizeCategory(category: string): string {
  const known = COMMON_CATEGORY_LABEL[category];
  if (known) return known;
  return category
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  const env = serverEnv();
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) return null;
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: env.GMAIL_USER,
      pass: env.GMAIL_APP_PASSWORD,
    },
  });
  return cachedTransporter;
}

export interface EscalationEmailInput {
  category: string;
  reason: string | null;
  summary: string | null;
  conversationId: string;
  leadDisplayName?: string | null;
  leadPhone?: string | null;
  kommoLeadId?: number | null;
  appUrl: string;
}

/**
 * Envia un mail al equipo notificando una derivacion del agente. No
 * lanza: si SMTP falla, log y seguimos (la derivacion ya quedo en la DB
 * y el webhook saliente / panel ATP la muestran igual).
 */
export async function sendEscalationEmail(
  input: EscalationEmailInput,
): Promise<void> {
  const env = serverEnv();
  const transporter = getTransporter();
  const to = env.ESCALATION_EMAIL_TO;
  if (!transporter || !to) {
    console.warn("[email] GMAIL_* o ESCALATION_EMAIL_TO no configurados, skip");
    return;
  }

  const categoryLabel = humanizeCategory(input.category);
  const subject = `iBath: nueva derivacion (${categoryLabel})`;
  const kommoLink = input.kommoLeadId
    ? `https://infoibathcomar.kommo.com/leads/detail/${input.kommoLeadId}`
    : null;
  const logoUrl = `${input.appUrl.replace(/\/$/, "")}/brand-logo.png`;
  const timestamp = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());

  const text = [
    `Nueva derivacion: ${categoryLabel}`,
    "",
    input.leadDisplayName ? `Lead: ${input.leadDisplayName}` : null,
    input.leadPhone ? `Telefono: ${input.leadPhone}` : null,
    "",
    input.summary ? `Resumen:\n${input.summary}` : null,
    "",
    kommoLink ? `Ver lead en Kommo: ${kommoLink}` : null,
    "",
    `Agentic Panel · ${timestamp}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const html = renderEscalationHtml({
    categoryLabel,
    leadDisplayName: input.leadDisplayName ?? null,
    leadPhone: input.leadPhone ?? null,
    summary: input.summary,
    kommoLink,
    logoUrl,
    timestamp,
  });

  try {
    await transporter.sendMail({
      from: `"iBath Agente IA" <${env.GMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error("[email] error enviando mail de derivacion:", err);
  }
}

function renderEscalationHtml(args: {
  categoryLabel: string;
  leadDisplayName: string | null;
  leadPhone: string | null;
  summary: string | null;
  kommoLink: string | null;
  logoUrl: string;
  timestamp: string;
}): string {
  // Template fijo, inline styles para max compat (Gmail/Outlook/Apple Mail).
  // Fondo negro, logo blanco arriba, tipografia centrada — mismo lenguaje
  // visual que los mails del panel ATP de Quintaglia.
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#111111;border-radius:12px;padding:40px 32px;">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <img src="${escapeAttr(args.logoUrl)}" alt="iBath" height="48" style="height:48px;width:auto;display:block;" />
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:8px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;font-weight:500;">
                Consulta para responder
              </td>
            </tr>
            ${
              args.leadDisplayName
                ? `<tr>
              <td align="center" style="padding-bottom:8px;font-size:22px;color:#f5f5f5;font-weight:600;letter-spacing:-0.01em;">
                ${escapeHtml(args.leadDisplayName)}
              </td>
            </tr>`
                : ""
            }
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <span style="display:inline-block;padding:4px 10px;background:#facc15;color:#111111;font-size:12px;font-weight:500;border-radius:4px;">
                  ${escapeHtml(args.categoryLabel)}
                </span>
              </td>
            </tr>
            ${
              args.leadPhone
                ? `<tr>
              <td align="center" style="padding-top:8px;border-top:1px solid #1f1f1f;padding-bottom:6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;font-weight:500;">
                Telefono
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:20px;font-size:15px;color:#f5f5f5;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
                ${escapeHtml(args.leadPhone)}
              </td>
            </tr>`
                : ""
            }
            ${
              args.summary
                ? `<tr>
              <td align="center" style="padding-top:8px;border-top:1px solid #1f1f1f;padding-bottom:8px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;font-weight:500;">
                Resumen de la conversacion
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-bottom:28px;font-size:13.5px;line-height:1.6;color:#d4d4d4;">
                ${escapeHtml(args.summary)}
              </td>
            </tr>`
                : ""
            }
            ${
              args.kommoLink
                ? `<tr>
              <td align="center" style="padding-top:4px;">
                <a href="${escapeAttr(args.kommoLink)}" style="display:inline-block;padding:10px 22px;background:#f5f5f5;color:#0a0a0a;text-decoration:none;border-radius:6px;font-size:13px;font-weight:500;">
                  Ver lead en Kommo
                </a>
              </td>
            </tr>`
                : ""
            }
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;padding-top:20px;">
            <tr>
              <td align="center" style="font-size:11px;color:#525252;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.04em;">
                Agentic Panel · ${escapeHtml(args.timestamp)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
