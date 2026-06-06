import "server-only";

import nodemailer from "nodemailer";
import { serverEnv, clientEnv } from "@/lib/env";

// ===========================================================================
// Email sender via Gmail SMTP + App Password.
//
// La cuenta Gmail tiene que tener 2FA activado y una App Password generada
// en https://myaccount.google.com/apppasswords. Limite informal de Gmail:
// ~500 mails/dia para cuentas free. Suficiente para notificaciones de
// leads de una agencia chica.
//
// Si faltan env vars (GMAIL_USER, GMAIL_APP_PASSWORD, EMAIL_NOTIFY_LEADS_TO)
// el envio se loggea como skipped y la app sigue. No bloquea el flow del
// agente.
// ===========================================================================

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  const env = serverEnv();
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) return null;
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
  });
  return cachedTransporter;
}

export interface LeadAlertPayload {
  leadId: string;
  name: string | null;
  phone: string | null;
  interestCategory: string;
  summary: string | null;
  conversationId: string;
  conversationSource: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  interes_compra: "Interés de compra",
  pide_asesor: "Solicita hablar con un asesor",
  arquitecto_desarrollador: "Arquitecto / desarrollador",
  cantidad_equipos: "Cantidad de equipos",
  cliente_existente: "Cliente existente",
  fuera_de_conocimiento: "Fuera de conocimiento",
  consulta_financiacion: "Consulta financiación",
  visita_obra: "Visita a obra",
};

// Encabezado del email + asunto adaptado a la categoría. La idea: el
// operador que lee el mail tiene que entender de UN vistazo qué pasó sin
// jerga técnica ni rótulos engañosos ("NUEVO LEAD" cuando en realidad es
// una consulta que la IA no supo responder).
//
// - eyebrow: la línea chiquita encima del nombre, en mayúsculas y mono.
// - subjectPrefix: lo que va antes del nombre en el subject del email.
// - summaryHeading: el label de la sección "qué pasó" en el cuerpo.
const CATEGORY_PRESENTATION: Record<
  string,
  { eyebrow: string; subjectPrefix: string; summaryHeading: string }
> = {
  interes_compra: {
    eyebrow: "Nuevo lead",
    subjectPrefix: "Nuevo lead",
    summaryHeading: "Resumen del agente",
  },
  pide_asesor: {
    eyebrow: "Pide hablar con asesor",
    subjectPrefix: "Pide hablar con asesor",
    summaryHeading: "Resumen del agente",
  },
  visita_obra: {
    eyebrow: "Pedido de visita",
    subjectPrefix: "Pedido de visita",
    summaryHeading: "Resumen del agente",
  },
  consulta_financiacion: {
    eyebrow: "Consulta de financiación",
    subjectPrefix: "Consulta de financiación",
    summaryHeading: "Resumen del agente",
  },
  cliente_existente: {
    eyebrow: "Cliente existente",
    subjectPrefix: "Cliente existente",
    summaryHeading: "Resumen del agente",
  },
  fuera_de_conocimiento: {
    eyebrow: "Consulta para responder",
    subjectPrefix: "Consulta para responder",
    summaryHeading: "Resumen de la conversación",
  },
  escalado_manual: {
    eyebrow: "Conversación a revisar",
    subjectPrefix: "Conversación a revisar",
    summaryHeading: "Resumen de la conversación",
  },
  arquitecto_desarrollador: {
    eyebrow: "Nuevo lead",
    subjectPrefix: "Nuevo lead",
    summaryHeading: "Resumen del agente",
  },
  cantidad_equipos: {
    eyebrow: "Nuevo lead",
    subjectPrefix: "Nuevo lead",
    summaryHeading: "Resumen del agente",
  },
};

function humanizeCategory(c: string): string {
  if (CATEGORY_LABEL[c]) return CATEGORY_LABEL[c];
  return c
    .split("_")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function presentation(c: string): {
  eyebrow: string;
  subjectPrefix: string;
  summaryHeading: string;
} {
  return (
    CATEGORY_PRESENTATION[c] ?? {
      eyebrow: "Conversación a revisar",
      subjectPrefix: "Conversación a revisar",
      summaryHeading: "Resumen de la conversación",
    }
  );
}

function buildConversationUrl(p: LeadAlertPayload): string {
  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  // Heuristica: si el source es 'whatsapp' (o existe wa_jid via phone numerico)
  // linkeamos a /wa. Default /conversations (test source).
  const path = p.conversationSource === "whatsapp" ? "/wa" : "/conversations";
  return `${base}${path}?id=${p.conversationId}`;
}

function buildHtml(p: LeadAlertPayload): string {
  const url = buildConversationUrl(p);
  const category = humanizeCategory(p.interestCategory);
  const pres = presentation(p.interestCategory);
  const name = p.name ?? "Sin nombre";
  const phone = p.phone ?? "—";
  const summary = p.summary?.trim() ?? "Sin resumen.";
  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const logoUrl = `${base}/brand-logo.png`;

  // Layout: solo el modulo del medio tiene fondo oscuro (la "tarjeta" del
  // lead). El body queda transparente para respetar el tema del cliente de
  // email (claro/oscuro). El logo del cliente va arriba del modulo, centrado:
  // si la branch tiene /brand-logo.png publicado lo muestra; si no, el alt
  // queda vacio y se ve solo el contenido textual.
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#171717;border:1px solid #262626;border-radius:8px;color:#fafafa;">
          <tr>
            <td align="center" style="padding:32px 24px 0 24px;">
              <img src="${logoUrl}" alt="" style="max-height:72px;width:auto;display:inline-block;" />
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 24px 12px 24px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#737373;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">
                ${pres.eyebrow}
              </p>
              <h1 style="margin:8px 0 0 0;font-size:18px;font-weight:500;letter-spacing:-0.015em;color:#fafafa;">
                ${name}
              </h1>
              <p style="margin:4px 0 0 0;font-size:13px;color:#a3a3a3;">
                ${category}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px;">
              <div style="height:1px;background:#262626;"></div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 24px;font-size:13px;color:#d4d4d4;line-height:1.6;">
              <p style="margin:0 0 6px 0;">
                <span style="color:#737373;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">Teléfono</span><br/>
                <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${phone}</span>
              </p>
              <p style="margin:14px 0 6px 0;">
                <span style="color:#737373;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${pres.summaryHeading}</span><br/>
                <span style="color:#e5e5e5;">${summary.replace(/\n/g, "<br/>")}</span>
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:12px 24px 28px 24px;">
              <a href="${url}" style="display:inline-block;background:#fafafa;color:#0a0a0a;text-decoration:none;font-size:13px;font-weight:500;padding:10px 18px;border-radius:6px;">
                Ver conversación
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0 0;font-size:11px;color:#737373;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-align:center;">
          Agentic Panel · ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText(p: LeadAlertPayload): string {
  const url = buildConversationUrl(p);
  const category = humanizeCategory(p.interestCategory);
  const pres = presentation(p.interestCategory);
  return [
    `${pres.eyebrow} — ${category}`,
    "",
    `Nombre: ${p.name ?? "Sin nombre"}`,
    `Teléfono: ${p.phone ?? "—"}`,
    "",
    `${pres.summaryHeading}:`,
    p.summary?.trim() ?? "Sin resumen.",
    "",
    `Ver conversación: ${url}`,
  ].join("\n");
}

/**
 * Manda un email de aviso con los datos del lead. Si las env vars no estan
 * configuradas, loggea skip y retorna sin error (no bloquea el flow).
 */
export async function sendLeadAlert(payload: LeadAlertPayload): Promise<void> {
  const env = serverEnv();
  const to = env.EMAIL_NOTIFY_LEADS_TO;
  const transporter = getTransporter();

  if (!transporter || !to) {
    console.log("[email] sendLeadAlert skipped (env vars faltantes)");
    return;
  }

  try {
    const pres = presentation(payload.interestCategory);
    await transporter.sendMail({
      from: env.GMAIL_USER,
      to,
      subject: `${pres.subjectPrefix}: ${payload.name ?? "Sin nombre"} (${humanizeCategory(payload.interestCategory)})`,
      text: buildText(payload),
      html: buildHtml(payload),
    });
  } catch (err) {
    console.error("[email] no se pudo enviar el email del lead:", err);
  }
}
