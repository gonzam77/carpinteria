// Fechas sin hora (columnas @db.Date, como Pedido.fechaEntrega). Prisma las lee como la medianoche UTC: si se
// mandaran asi, el navegador en Argentina (UTC-3) las mostraria un dia antes (DECISIONES 8). La API las recibe
// y las devuelve como texto AAAA-MM-DD.

/** Zona del negocio: los plazos se cuentan en dias calendario de Argentina (spec §9.1). */
export const BUSINESS_TIME_ZONE = "America/Argentina/Buenos_Aires";

const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Hoy (o el instante dado) como AAAA-MM-DD en la zona del negocio. */
export function todayInBusinessZone(now = new Date()) {
  return formatter.format(now);
}

/** Una fecha @db.Date como AAAA-MM-DD, sin correrse de dia. */
export function toDateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** AAAA-MM-DD a la Date que espera una columna @db.Date. */
export function fromDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
