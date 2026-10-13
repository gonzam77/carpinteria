// La ayuda de las formulas (boton (i) de cada campo de formula, pedido de Gonzalo del 2026-10-13): que se puede escribir
// en ESE campo. Sin React, para probarla con node --test. Los nombres de las funciones salen del motor (moduleFormula),
// asi la ayuda nunca ofrece una que no existe.
import { FORMULA_FUNCTIONS } from "./moduleFormula.ts";
import type { FormulaSuggestion } from "./moduleEditor.ts";

/** Que calcula el campo: cambia la explicacion y los ejemplos. */
export type FormulaKind = "pieza-largo" | "pieza-ancho" | "pieza-cantidad" | "medida-calculada" | "herraje-cantidad" | "herraje-medida";

export type FormulaFunctionHelp = { nombre: string; sintaxis: string; insert: string; descripcion: string; ejemplo: string; explicacion: string };
export type FormulaExample = { formula: string; explicacion: string };
export type FormulaReference = { insert: string; label: string; detail: string };
export type FormulaPieceReference = { codigo: string; nombre: string; accesos: FormulaReference[] };
export type FormulaHelpContent = {
  titulo: string;
  queCalcula: string;
  ejemplos: FormulaExample[];
  medidas: FormulaReference[];
  piezas: FormulaPieceReference[];
  constantes: FormulaReference[];
  funciones: FormulaFunctionHelp[];
  operadores: Array<{ simbolo: string; descripcion: string }>;
  reglas: string[];
};

const FUNCIONES: Record<string, Omit<FormulaFunctionHelp, "nombre" | "insert">> = {
  SI: {
    sintaxis: "SI(condición; si se cumple; si no)",
    descripcion: "Elige entre dos valores según una condición.",
    ejemplo: "SI(ANCHO > 600; 2; 1)",
    explicacion: "2 si el ancho pasa los 600 mm; si no, 1."
  },
  MIN: { sintaxis: "MIN(a; b; ...)", descripcion: "El más chico de los valores.", ejemplo: "MIN(ALTO - 100; 700)", explicacion: "El alto menos 100, pero nunca más de 700." },
  MAX: { sintaxis: "MAX(a; b; ...)", descripcion: "El más grande de los valores.", ejemplo: "MAX(ANCHO / 2; 300)", explicacion: "La mitad del ancho, pero nunca menos de 300." },
  ENTERO: { sintaxis: "ENTERO(valor)", descripcion: "Saca los decimales (redondea hacia abajo).", ejemplo: "ENTERO(ANCHO / 400)", explicacion: "Cuántas veces entran 400 mm en el ancho: 1000 da 2." },
  REDONDEAR: {
    sintaxis: "REDONDEAR(valor; decimales)",
    descripcion: "Redondea al entero más cercano, o a los decimales que digas.",
    ejemplo: "REDONDEAR(ANCHO / 3; 0)",
    explicacion: "Un tercio del ancho, sin decimales."
  },
  ABS: { sintaxis: "ABS(valor)", descripcion: "El valor sin signo (siempre positivo).", ejemplo: "ABS(ANCHO - ALTO)", explicacion: "La diferencia entre ancho y alto, sin importar cuál es mayor." },
  Y: {
    sintaxis: "Y(condición; condición; ...)",
    descripcion: "Se cumple si se cumplen todas. Se usa adentro de SI.",
    ejemplo: "SI(Y(ANCHO > 600; ALTO > 700); 2; 1)",
    explicacion: "2 si es ancho y alto a la vez; si no, 1."
  },
  O: {
    sintaxis: "O(condición; condición; ...)",
    descripcion: "Se cumple si se cumple alguna. Se usa adentro de SI.",
    ejemplo: "SI(O(ANCHO > 900; ALTO > 900); 3; 2)",
    explicacion: "3 si alguna de las dos medidas pasa los 900 mm; si no, 2."
  }
};

const OPERADORES = [
  { simbolo: "+  -", descripcion: "Sumar y restar" },
  { simbolo: "*  /", descripcion: "Multiplicar y dividir" },
  { simbolo: "( )", descripcion: "Agrupar: lo de adentro se calcula primero" },
  { simbolo: "=  <>", descripcion: "Igual y distinto (en SI)" },
  { simbolo: "<  <=  >  >=", descripcion: "Menor, menor o igual, mayor y mayor o igual (en SI)" },
  { simbolo: ";", descripcion: "Separa los valores de una función (también sirve la coma)" }
];

const POR_CAMPO: Record<FormulaKind, { titulo: string; queCalcula: string; ejemplos: FormulaExample[] }> = {
  "pieza-largo": {
    titulo: "Largo de la pieza",
    queCalcula: "El largo de la pieza en milímetros. Se redondea al milímetro con el modo de la configuración del catálogo.",
    ejemplos: [
      { formula: "ALTO", explicacion: "El mismo alto del módulo." },
      { formula: "ALTO - ESP * 2", explicacion: "El alto menos dos espesores de placa (por ejemplo, entre piso y techo)." },
      { formula: "LATERAL.largo - 20", explicacion: "20 mm menos que el largo de la pieza LATERAL." }
    ]
  },
  "pieza-ancho": {
    titulo: "Ancho de la pieza",
    queCalcula: "El ancho de la pieza en milímetros. Se redondea al milímetro con el modo de la configuración del catálogo.",
    ejemplos: [
      { formula: "PROFUNDIDAD", explicacion: "La misma profundidad del módulo." },
      { formula: "ANCHO - ESP * 2", explicacion: "El ancho menos los dos laterales." },
      { formula: "(ANCHO - 3) / 2", explicacion: "Dos puertas con 3 mm de luz entre ellas." }
    ]
  },
  "pieza-cantidad": {
    titulo: "Cantidad de la pieza",
    queCalcula: "Cuántas piezas iguales lleva el módulo. Con 0, la pieza no se genera.",
    ejemplos: [
      { formula: "2", explicacion: "Siempre dos (por ejemplo, los laterales)." },
      { formula: "SI(ANCHO > 600; 2; 1)", explicacion: "Dos puertas si el módulo pasa los 600 mm de ancho; si no, una." },
      { formula: "ENTERO(ALTO / 350)", explicacion: "Un estante cada 350 mm de alto." }
    ]
  },
  "medida-calculada": {
    titulo: "Medida calculada",
    queCalcula: "Una medida que no se pide: se calcula con las otras y se puede usar en las piezas como cualquier medida.",
    ejemplos: [
      { formula: "ANCHO - ESP * 2", explicacion: "El ancho interior, sin los laterales." },
      { formula: "SI(ANCHO > 600; 2; 1)", explicacion: "Cuántas puertas lleva según el ancho." },
      { formula: "MAX(ALTO - 720; 0)", explicacion: "Lo que sobra arriba de 720 mm, o 0." }
    ]
  },
  "herraje-cantidad": {
    titulo: "Cantidad del herraje",
    queCalcula: "Cuántas unidades del herraje lleva el módulo. Si da decimales, se redondea hacia arriba. Con 0, no va.",
    ejemplos: [
      { formula: "PUERTAS.cant * 2", explicacion: "Dos bisagras por puerta." },
      { formula: "SI(ALTO > 900; PUERTAS.cant * 3; PUERTAS.cant * 2)", explicacion: "Tres bisagras por puerta en las altas; si no, dos." },
      { formula: "FRENTE_CAJON.cant", explicacion: "Un par de correderas por cajón." }
    ]
  },
  "herraje-medida": {
    titulo: "Medida que necesita el herraje",
    queCalcula: "La medida en mm que necesita el herraje (por ejemplo, el largo de la corredera). De su línea se elige el modelo más largo que entra.",
    ejemplos: [
      { formula: "PROFUNDIDAD - 50", explicacion: "La profundidad del módulo menos 50 mm." },
      { formula: "INT_CAJON.largo - 10", explicacion: "10 mm menos que el largo del interior del cajón." },
      { formula: "MIN(PROFUNDIDAD - 50; 500)", explicacion: "Como máximo 500 mm." }
    ]
  }
};

const REGLAS = [
  "Los nombres de las medidas y de las piezas van en mayúsculas, tal como aparecen en esta lista.",
  "Para una pieza, se escribe el código, un punto y lo que querés de ella: .largo, .ancho o .cant.",
  "Los decimales van con punto: 0.5, no 0,5.",
  "Todas las medidas están en milímetros.",
  "Una pieza no puede usarse a sí misma, ni dos piezas pueden depender una de la otra."
];

/** Arma la ayuda de un campo con las sugerencias del autocompletado (las medidas y piezas del modulo, ESP y las funciones). */
export function formulaHelp(kind: FormulaKind, suggestions: FormulaSuggestion[]): FormulaHelpContent {
  const medidas: FormulaReference[] = [];
  const constantes: FormulaReference[] = [];
  const piezas = new Map<string, FormulaPieceReference>();
  for (const item of suggestions) {
    if (item.insert.endsWith("(")) continue; // las funciones van con su explicacion
    const dot = item.insert.indexOf(".");
    if (dot > 0) {
      const codigo = item.insert.slice(0, dot);
      const pieza = piezas.get(codigo) ?? { codigo, nombre: item.detail, accesos: [] };
      pieza.accesos.push({ insert: item.insert, label: item.insert.slice(dot), detail: ACCESOS[item.insert.slice(dot + 1)] ?? "" });
      piezas.set(codigo, pieza);
    } else if (item.insert === "ESP") constantes.push({ ...item, detail: "Espesor de diseño de la placa (18 mm en los módulos del catálogo)" });
    else medidas.push(item);
  }
  const base = POR_CAMPO[kind];
  return {
    ...base,
    medidas,
    piezas: [...piezas.values()],
    constantes,
    funciones: FORMULA_FUNCTIONS.map((nombre) => ({ nombre, insert: `${nombre}(`, ...(FUNCIONES[nombre] ?? { sintaxis: `${nombre}(...)`, descripcion: "", ejemplo: "", explicacion: "" }) })),
    operadores: OPERADORES,
    reglas: REGLAS
  };
}

const ACCESOS: Record<string, string> = { largo: "Largo", ancho: "Ancho", cant: "Cantidad" };

/** Las sugerencias para un campo sin modulo (las formulas por defecto de un herraje): los nombres que existen en el catalogo. */
export function catalogSuggestions(referencias: { medidas: Array<{ nombre: string; detalle: string; modulos: number }>; piezas: Array<{ nombre: string; detalle: string; modulos: number }> }): FormulaSuggestion[] {
  const modulos = (count: number) => (count === 1 ? "1 módulo" : `${count} módulos`);
  return [
    ...referencias.medidas.map((item) => ({ insert: item.nombre, label: item.nombre, detail: `${item.detalle || "Medida"} · en ${modulos(item.modulos)}` })),
    ...referencias.piezas.flatMap((item) =>
      (["largo", "ancho", "cant"] as const).map((acc) => ({ insert: `${item.nombre}.${acc}`, label: `${item.nombre}.${acc}`, detail: `${item.detalle || "Pieza"} · en ${modulos(item.modulos)}` }))
    ),
    { insert: "ESP", label: "ESP", detail: "Espesor de diseño" },
    ...FORMULA_FUNCTIONS.map((fn) => ({ insert: `${fn}(`, label: `${fn}(...)`, detail: "Función" }))
  ];
}

/** Inserta un texto en la posicion del cursor (o reemplaza la seleccion). Devuelve el texto nuevo y donde queda el cursor. */
export function insertAt(value: string, text: string, start: number | null, end: number | null) {
  const from = start ?? value.length;
  const to = end ?? from;
  // Un espacio antes si quedaria pegado a un nombre o a un numero (ALTO y ESP -> "ALTO ESP" no; "ALTO - " + ESP si).
  const before = value.slice(0, from);
  const glue = before && /[A-Za-z0-9_)]$/.test(before) && /^[A-Za-z0-9_(]/.test(text) ? " " : "";
  const next = before + glue + text + value.slice(to);
  return { value: next, caret: from + glue.length + text.length };
}
