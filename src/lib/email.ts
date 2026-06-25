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
  fuera_de_conocimiento: "Consulta fuera de la base de conocimiento",
  escalado_manual: "Escalado manual",
  falla_tecnica: "Falla tecnica",
  arquitecto_desarrollador: "Arquitecto / Desarrollador",
  cantidad_equipos: "Proyecto inmobiliario (cantidad)",
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
  const convUrl = `${input.appUrl.replace(/\/$/, "")}/conversations?conv=${input.conversationId}`;
  const kommoLink = input.kommoLeadId
    ? `https://infoibathcomar.kommo.com/leads/detail/${input.kommoLeadId}`
    : null;

  const text = [
    `Nueva derivacion del agente: ${categoryLabel}`,
    "",
    input.leadDisplayName ? `Lead: ${input.leadDisplayName}` : null,
    input.reason ? `Motivo: ${input.reason}` : null,
    input.summary ? `Resumen: ${input.summary}` : null,
    "",
    `Conversacion en el panel: ${convUrl}`,
    kommoLink ? `Lead en Kommo: ${kommoLink}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; color: #111; line-height: 1.5; max-width: 560px;">
      <div style="font-size: 13px; color: #6b7280; margin-bottom: 6px;">iBath - Agente IA</div>
      <h2 style="font-size: 16px; margin: 0 0 12px 0; font-weight: 600;">Nueva derivacion: ${escapeHtml(categoryLabel)}</h2>
      ${input.leadDisplayName ? `<p style="margin: 0 0 6px 0;"><strong>Lead:</strong> ${escapeHtml(input.leadDisplayName)}</p>` : ""}
      ${input.reason ? `<p style="margin: 0 0 6px 0;"><strong>Motivo:</strong> ${escapeHtml(input.reason)}</p>` : ""}
      ${input.summary ? `<p style="margin: 0 0 12px 0;"><strong>Resumen:</strong> ${escapeHtml(input.summary)}</p>` : ""}
      <p style="margin: 16px 0 0 0;">
        <a href="${convUrl}" style="display: inline-block; padding: 8px 14px; background: #111; color: #fff; text-decoration: none; border-radius: 6px; font-size: 13px;">Abrir en el panel</a>
        ${kommoLink ? `&nbsp;&nbsp;<a href="${kommoLink}" style="color: #2563eb; font-size: 13px;">Ver lead en Kommo</a>` : ""}
      </p>
    </div>
  `;

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
