// Link de WhatsApp para avisarle al cliente que su pedido esta listo. Lo usan el detalle de corte y el de modulos.

/** Un telefono argentino como lo pide WhatsApp: 549 + area + numero, sin el 0 ni el 15. */
export function normalizeWhatsappPhone(phone?: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("549")) return digits;
  if (digits.startsWith("54")) {
    const rest = digits.slice(2);
    return rest.startsWith("9") ? digits : `549${rest}`;
  }
  const withoutLeadingZero = digits.replace(/^0+/, "");
  return `549${withoutLeadingZero}`;
}

/** El link con el mensaje de "listo para retirar", o "" si no hay telefono. */
export function buildWhatsappLink(phone: string | null | undefined, cliente: string, orderLabel: string) {
  const normalized = normalizeWhatsappPhone(phone);
  if (!normalized) return "";
  const message = `Hola ${cliente}, te avisamos que tu pedido ${orderLabel} ya está listo para retirar. Cuando quieras podés pasar a buscarlo. Si necesitás coordinar horario o tenés alguna consulta, escribinos por este medio.`;
  return `https://api.whatsapp.com/send/?phone=${normalized}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`;
}
