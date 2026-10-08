// Configuracion › Herrajes sin React (DECISIONES 57): validar el formulario como el servidor y agrupar por tipo.
import type { ResolvedHardware } from "./moduleFormula.ts";
import type { Hardware, HardwareInput, HardwareUnit } from "../types/index.ts";

export const HARDWARE_UNITS: Array<{ value: HardwareUnit; label: string }> = [
  { value: "unidad", label: "Unidad" },
  { value: "par", label: "Par" },
  { value: "juego", label: "Juego" },
  { value: "metro", label: "Metro" }
];

export type HardwareForm = { nombre: string; tipoId: string; unidad: HardwareUnit; valor: string; linea: string; medidaMm: string };

export const emptyHardwareForm = (tipoId = ""): HardwareForm => ({ nombre: "", tipoId, unidad: "unidad", valor: "", linea: "", medidaMm: "" });

export const hardwareToForm = (herraje: Hardware): HardwareForm => ({
  nombre: herraje.nombre,
  tipoId: herraje.tipoId ?? "",
  unidad: herraje.unidad,
  valor: String(herraje.valor),
  linea: herraje.linea ?? "",
  medidaMm: herraje.medidaMm === null ? "" : String(herraje.medidaMm)
});

const number = (text: string) => Number(text.trim().replace(",", "."));

/** Lo que tiene de malo el formulario (las mismas reglas que el servidor), o null y lo que se manda. */
export function readHardwareForm(form: HardwareForm): { problems: string[]; input: HardwareInput | null } {
  const problems: string[] = [];
  const nombre = form.nombre.trim();
  if (nombre.length < 2) problems.push("Escribí el nombre del herraje (al menos 2 caracteres).");
  if (!form.tipoId) problems.push("Elegí el tipo de herraje.");
  const valor = number(form.valor);
  if (form.valor.trim() === "" || !Number.isFinite(valor) || valor < 0) problems.push("Cargá el precio (un número, 0 o más).");
  const medidaMm = form.medidaMm.trim() === "" ? null : number(form.medidaMm);
  if (medidaMm !== null && (!Number.isFinite(medidaMm) || medidaMm <= 0)) problems.push("La medida tiene que ser un número mayor a 0.");
  const linea = form.linea.trim() || null;
  if (medidaMm !== null && !linea) problems.push("Un herraje con medida tiene que tener su línea (por ejemplo, Telescópica).");
  return problems.length ? { problems, input: null } : { problems, input: { nombre, tipoId: form.tipoId, unidad: form.unidad, valor, linea, medidaMm } };
}

/** Los herrajes agrupados por tipo (en el orden que vienen) y, al final, los que no tienen tipo. */
export function groupByType(herrajes: Hardware[]) {
  const groups = new Map<string, { tipo: string; herrajes: Hardware[] }>();
  for (const herraje of herrajes) {
    const key = herraje.tipo?.id ?? "";
    const group = groups.get(key) ?? { tipo: herraje.tipo?.nombre ?? "Sin tipo", herrajes: [] };
    group.herrajes.push(herraje);
    groups.set(key, group);
  }
  const sinTipo = groups.get("");
  groups.delete("");
  return [...groups.values(), ...(sinTipo ? [sinTipo] : [])];
}

export const formatHardwarePrice = (value: number) => value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });

const mmText = (value: number) => `${Number(value.toFixed(2)).toLocaleString("es-AR")} mm`;

/** El nombre de un modelo con su medida, para los selectores: "Telescópica 400 · 400 mm". */
export const hardwareLabel = (herraje: Pick<Hardware, "nombre" | "medidaMm" | "activo">) =>
  `${herraje.nombre}${herraje.medidaMm !== null && !herraje.nombre.includes(String(herraje.medidaMm)) ? ` · ${mmText(herraje.medidaMm)}` : ""}${herraje.activo ? "" : " (inactivo)"}`;

/**
 * Como queda una linea de herraje del modulo con las medidas de prueba (editor del catalogo, DECISIONES 57):
 * "4 × Cazoleta común", "3 × Telescópica 450 · necesita 530 mm: la más larga que entra" o el aviso que corresponda.
 */
export function hardwareLineSummary(resolved: ResolvedHardware, byId: Map<string, Pick<Hardware, "nombre">>) {
  if (resolved.error) return resolved.error;
  const elegido = resolved.elegidoId ? byId.get(resolved.elegidoId) : undefined;
  if (!elegido) return "Elegí el modelo por defecto.";
  const base = `${resolved.cantidad ?? "?"} × ${elegido.nombre}`;
  if (resolved.eleccion === "POR_MEDIDA") return `${base} · necesita ${mmText(resolved.medidaNecesaria!)}: la más larga que entra`;
  if (resolved.eleccion === "MAS_CHICO") {
    return resolved.medidaNecesaria === null
      ? `${base} · no se pudo calcular la medida: va la más chica (se cambia en la solicitud)`
      : `${base} · necesita ${mmText(resolved.medidaNecesaria)}: ninguna entra, va la más chica (se cambia en la solicitud)`;
  }
  return base;
}
