import { env } from "../../config/env.js";

let hasWarnedMissingWhatsappConfig = false;

function canSendWhatsapp() {
  return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_NOTIFY_TO);
}

function warnMissingWhatsappConfig() {
  if (hasWarnedMissingWhatsappConfig || canSendWhatsapp()) return;
  hasWarnedMissingWhatsappConfig = true;
  console.warn("WhatsApp notifications are disabled: missing WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_NOTIFY_TO.");
}

export async function sendNewOrderWhatsappNotification(order: {
  id: string;
  cliente: string;
  numeroContacto?: string | null;
  detalles: Array<{ material: string; largo: number; ancho: number; cantidad: number }>;
}) {
  if (!canSendWhatsapp()) {
    warnMissingWhatsappConfig();
    return;
  }

  const totalUnits = order.detalles.reduce((total, detail) => total + Number(detail.cantidad || 0), 0);
  const lines = [
    "Nueva solicitud recibida",
    `Cliente: ${order.cliente}`,
    `Telefono: ${order.numeroContacto || "-"}`,
    `Piezas: ${totalUnits}`,
    `Pedido ID: ${order.id}`
  ];

  const response = await fetch(`https://graph.facebook.com/v23.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: env.WHATSAPP_NOTIFY_TO,
      type: "text",
      text: {
        body: lines.join("\n")
      }
    })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} ${message}`);
  }
}


