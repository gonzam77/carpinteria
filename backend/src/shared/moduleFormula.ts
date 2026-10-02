// Motor de formulas de los modulos a medida.
// Vive en frontend/src/lib/moduleFormula.ts y se copia a backend/src/shared/ con scripts/sync-optimizer.mjs,
// para que la vista previa del navegador y el calculo del servidor den exactamente lo mismo.
//   - Sin eval ni new Function: las formulas las escriben usuarios, se parsean con un descendente recursivo.
//   - Las referencias entre piezas usan valores exactos (paridad con muebles.xlsx); solo se redondea
//     el largo y el ancho final de cada pieza.

export type Accessor = "largo" | "ancho" | "cant";

export type Ast =
  | { k: "num"; v: number }
  | { k: "ref"; id: string; acc?: Accessor }
  | { k: "neg"; e: Ast }
  | { k: "bin"; op: string; a: Ast; b: Ast }
  | { k: "fn"; name: string; args: Ast[] };

export class FormulaError extends Error {
  position?: number;
  constructor(message: string, position?: number) {
    super(message);
    this.name = "FormulaError";
    this.position = position;
  }
}

export const MAX_FORMULA_LENGTH = 500;
export const MAX_FORMULA_DEPTH = 50;

const FUNCTIONS: Record<string, { min: number; max: number }> = {
  SI: { min: 3, max: 3 },
  MIN: { min: 1, max: 20 },
  MAX: { min: 1, max: 20 },
  ENTERO: { min: 1, max: 1 },
  REDONDEAR: { min: 1, max: 2 },
  ABS: { min: 1, max: 1 },
  Y: { min: 2, max: 10 },
  O: { min: 2, max: 10 }
};

export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS);
export const FORMULA_CONSTANTS = ["ESP"];
/** Claves de medidas y codigos de piezas: UPPER_SNAKE. */
export const IDENTIFIER_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** Devuelve el motivo por el que un nombre no sirve como clave de medida o codigo de pieza, o null si es valido. */
export function validateIdentifier(name: string): string | null {
  if (!IDENTIFIER_PATTERN.test(name)) return `"${name}" tiene que estar en mayusculas, empezar con una letra y usar solo letras, numeros y _`;
  if (FUNCTIONS[name]) return `"${name}" es el nombre de una funcion`;
  if (FORMULA_CONSTANTS.includes(name)) return `"${name}" es una constante reservada`;
  return null;
}

// ---------------------------------------------------------------- parser

type Tok = { t: "num" | "id" | "op" | "(" | ")" | "sep" | "." | "end"; v: string; p: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i))!;
      out.push({ t: "num", v: m[0], p: i }); i += m[0].length; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0], p: i }); i += m[0].length; continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") { out.push({ t: "op", v: two, p: i }); i += 2; continue; }
    if ("+-*/<>=".includes(c)) { out.push({ t: "op", v: c, p: i }); i++; continue; }
    if (c === "(" || c === ")") { out.push({ t: c, v: c, p: i }); i++; continue; }
    if (c === ";" || c === ",") { out.push({ t: "sep", v: c, p: i }); i++; continue; }
    if (c === ".") { out.push({ t: ".", v: c, p: i }); i++; continue; }
    throw new FormulaError(`Caracter no valido "${c}"`, i);
  }
  out.push({ t: "end", v: "", p: src.length });
  return out;
}

export function parseFormula(src: string): Ast {
  if (!src || !src.trim()) throw new FormulaError("La formula esta vacia");
  if (src.length > MAX_FORMULA_LENGTH) throw new FormulaError(`La formula supera los ${MAX_FORMULA_LENGTH} caracteres`);
  let depth = 0;
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  const expect = (t: Tok["t"], what: string) => {
    const tok = next();
    if (tok.t !== t) throw new FormulaError(`Se esperaba ${what}`, tok.p);
    return tok;
  };

  function comparison(): Ast {
    if (++depth > MAX_FORMULA_DEPTH) throw new FormulaError("La formula tiene demasiados niveles de parentesis o funciones");
    let a = additive();
    const tok = peek();
    if (tok.t === "op" && ["=", "<>", "<", "<=", ">", ">="].includes(tok.v)) {
      next();
      a = { k: "bin", op: tok.v, a, b: additive() };
    }
    depth--;
    return a;
  }
  function additive(): Ast {
    let a = term();
    while (peek().t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = next().v;
      a = { k: "bin", op, a, b: term() };
    }
    return a;
  }
  function term(): Ast {
    let a = unary();
    while (peek().t === "op" && (peek().v === "*" || peek().v === "/")) {
      const op = next().v;
      a = { k: "bin", op, a, b: unary() };
    }
    return a;
  }
  function unary(): Ast {
    if (peek().t === "op" && peek().v === "-") { next(); return { k: "neg", e: unary() }; }
    if (peek().t === "op" && peek().v === "+") { next(); return unary(); }
    return primary();
  }
  function primary(): Ast {
    const tok = next();
    if (tok.t === "num") return { k: "num", v: Number(tok.v) };
    if (tok.t === "(") { const e = comparison(); expect(")", '")"'); return e; }
    if (tok.t === "id") {
      const name = tok.v.toUpperCase();
      if (peek().t === "(") {
        const spec = FUNCTIONS[name];
        if (!spec) throw new FormulaError(`Funcion desconocida ${name}`, tok.p);
        next();
        const args: Ast[] = [];
        if (peek().t !== ")") {
          args.push(comparison());
          while (peek().t === "sep") { next(); args.push(comparison()); }
        }
        expect(")", '")"');
        if (args.length < spec.min || args.length > spec.max) {
          throw new FormulaError(`${name} recibe ${spec.min === spec.max ? spec.min : `${spec.min} a ${spec.max}`} valores`, tok.p);
        }
        return { k: "fn", name, args };
      }
      if (peek().t === ".") {
        next();
        const accTok = expect("id", "largo, ancho o cant");
        const acc = accTok.v.toLowerCase();
        if (acc !== "largo" && acc !== "ancho" && acc !== "cant") throw new FormulaError("Despues del punto va largo, ancho o cant", accTok.p);
        return { k: "ref", id: name, acc };
      }
      return { k: "ref", id: name };
    }
    if (tok.t === "end") throw new FormulaError("La formula esta incompleta", tok.p);
    throw new FormulaError(`No se esperaba "${tok.v}"`, tok.p);
  }

  const ast = comparison();
  if (peek().t !== "end") throw new FormulaError(`Sobra "${peek().v}"`, peek().p);
  return ast;
}

/** Referencias que usa una formula (para el grafo de dependencias y el autocompletado). */
export function collectRefs(ast: Ast, out: Array<{ id: string; acc?: Accessor }> = []) {
  if (ast.k === "ref") out.push({ id: ast.id, acc: ast.acc });
  else if (ast.k === "neg") collectRefs(ast.e, out);
  else if (ast.k === "bin") { collectRefs(ast.a, out); collectRefs(ast.b, out); }
  else if (ast.k === "fn") ast.args.forEach((a) => collectRefs(a, out));
  return out;
}

// ---------------------------------------------------------------- evaluacion de un modulo

export type ParamType = "MEDIDA" | "ENTERO" | "OPCION" | "CALCULADO";
export type ParamOption = { valor: number; etiqueta: string };
export type ParamDef = {
  clave: string;
  tipo: ParamType;
  valorDefecto?: number | null;
  formula?: string | null;
  minimo?: number | null;
  maximo?: number | null;
  opciones?: ParamOption[] | null;
};
export type PieceDef = { codigo: string; nombre: string; formulaLargo: string; formulaAncho: string; formulaCantidad: string };
export type ModuleDef = { parametros: ParamDef[]; piezas: PieceDef[]; constantes?: Record<string, number> };

export type PieceResult = { codigo: string; nombre: string; largo: number; ancho: number; cantidad: number; largoExacto: number; anchoExacto: number };
export type ModuleError = { ref: string; mensaje: string };
export type ModuleEvaluation = {
  piezas: PieceResult[];
  errores: ModuleError[];
  /** Evalua una expresion suelta con las medidas y piezas del modulo (cantidad de herrajes, por ejemplo). Lanza FormulaError. */
  evaluarExpresion: (formula: string) => number;
};

export type RoundingMode = "REDONDEAR" | "TRUNCAR";

// Tolerancia para que errores de punto flotante (412.49999999 en vez de 412.5) no cambien el mm.
const ROUNDING_EPSILON = 1e-9;

export function roundMm(value: number, mode: RoundingMode = "REDONDEAR") {
  const abs = Math.abs(value);
  const rounded = mode === "TRUNCAR" ? Math.floor(abs + ROUNDING_EPSILON) : Math.round(abs + ROUNDING_EPSILON);
  return rounded === 0 ? 0 : Math.sign(value) * rounded;
}

export function evaluateModule(
  def: ModuleDef,
  valores: Record<string, number>,
  opts: { redondeo?: RoundingMode; constantes?: Record<string, number> } = {}
): ModuleEvaluation {
  const constantes = { ...(def.constantes ?? {}), ...(opts.constantes ?? {}) };
  const mode = opts.redondeo ?? "REDONDEAR";
  const params = new Map(def.parametros.map((p) => [p.clave.toUpperCase(), p]));
  const pieces = new Map(def.piezas.map((p) => [p.codigo.toUpperCase(), p]));
  const inputs = new Map(Object.entries(valores ?? {}).map(([key, value]) => [key.toUpperCase(), value]));
  const astCache = new Map<string, Ast>();
  const memo = new Map<string, number>();
  const stack: string[] = [];
  const errores: ModuleError[] = [];
  const failed = new Set<string>();
  let current = ""; // pieza o expresion que se esta evaluando en el nivel superior

  const ast = (key: string, src: string) => {
    let parsed = astCache.get(key);
    if (!parsed) {
      parsed = parseFormula(src);
      astCache.set(key, parsed);
    }
    return parsed;
  };

  const inputValue = (p: ParamDef) => {
    const raw = inputs.get(p.clave.toUpperCase()) ?? p.valorDefecto;
    return raw === undefined || raw === null || !Number.isFinite(Number(raw)) ? null : Number(raw);
  };

  function resolve(key: string): number {
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const owner = key.split(".")[0];
    if (stack.length && owner !== current && owner !== stack[stack.length - 1].split(".")[0] && failed.has(owner)) {
      throw new FormulaError(`Depende de ${owner}, que tiene un error`);
    }
    if (stack.includes(key)) throw new FormulaError(`Referencia circular: ${[...stack.slice(stack.indexOf(key)), key].join(" -> ")}`);
    stack.push(key);
    try {
      let v: number;
      const [id, acc] = key.split(".") as [string, Accessor | undefined];
      if (acc) {
        const p = pieces.get(id);
        if (!p) throw new FormulaError(`No existe la pieza ${id}`);
        const src = acc === "largo" ? p.formulaLargo : acc === "ancho" ? p.formulaAncho : p.formulaCantidad;
        try {
          v = evalAst(ast(key, src));
        } catch (e) {
          if (id !== current && !(e instanceof FormulaError && /^(Depende de|Referencia circular)/.test(e.message))) {
            failed.add(id);
            throw new FormulaError(`Depende de ${id}, que tiene un error`);
          }
          throw e;
        }
      } else if (id in constantes) {
        v = constantes[id];
      } else {
        const p = params.get(id);
        if (!p) throw new FormulaError(`No existe la medida ${id}`);
        if (p.tipo === "CALCULADO") v = evalAst(ast(key, p.formula ?? ""));
        else {
          const raw = inputValue(p);
          if (raw === null) throw new FormulaError(`Falta el valor de ${id}`);
          v = raw;
        }
      }
      memo.set(key, v);
      return v;
    } finally {
      stack.pop();
    }
  }

  function evalAst(n: Ast): number {
    switch (n.k) {
      case "num": return n.v;
      case "ref": return resolve(n.acc ? `${n.id}.${n.acc}` : n.id);
      case "neg": return -evalAst(n.e);
      case "bin": {
        const a = evalAst(n.a), b = evalAst(n.b);
        switch (n.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": if (b === 0) throw new FormulaError("Division por cero"); return a / b;
          case "=": return a === b ? 1 : 0;
          case "<>": return a !== b ? 1 : 0;
          case "<": return a < b ? 1 : 0;
          case "<=": return a <= b ? 1 : 0;
          case ">": return a > b ? 1 : 0;
          case ">=": return a >= b ? 1 : 0;
        }
        throw new FormulaError(`Operador ${n.op}`);
      }
      case "fn": {
        const v = (i: number) => evalAst(n.args[i]);
        switch (n.name) {
          case "SI": return v(0) ? v(1) : v(2); // evaluacion perezosa: solo la rama elegida
          case "MIN": return Math.min(...n.args.map(evalAst));
          case "MAX": return Math.max(...n.args.map(evalAst));
          case "ENTERO": return Math.floor(v(0));
          case "REDONDEAR": { const d = n.args.length > 1 ? v(1) : 0; const f = 10 ** d; return Math.round(v(0) * f) / f; }
          case "ABS": return Math.abs(v(0));
          case "Y": return n.args.every((a) => evalAst(a)) ? 1 : 0;
          case "O": return n.args.some((a) => evalAst(a)) ? 1 : 0;
        }
      }
    }
    throw new FormulaError("Expresion no valida");
  }

  // Validacion de las medidas ingresadas
  for (const p of def.parametros) {
    if (p.tipo === "CALCULADO") continue;
    const raw = inputValue(p);
    if (raw === null) { errores.push({ ref: p.clave, mensaje: "Falta el valor" }); continue; }
    if (p.tipo === "ENTERO" && !Number.isInteger(raw)) errores.push({ ref: p.clave, mensaje: "Tiene que ser un numero entero" });
    if (p.tipo === "OPCION" && p.opciones?.length && !p.opciones.some((option) => option.valor === raw)) {
      errores.push({ ref: p.clave, mensaje: "Elegi una de las opciones" });
    }
    if (p.minimo != null && raw < p.minimo) errores.push({ ref: p.clave, mensaje: `Minimo ${p.minimo}` });
    if (p.maximo != null && raw > p.maximo) errores.push({ ref: p.clave, mensaje: `Maximo ${p.maximo}` });
  }

  const piezas: PieceResult[] = [];
  for (const p of def.piezas) {
    const codigo = p.codigo.toUpperCase();
    current = codigo;
    try {
      const cantidad = resolve(`${codigo}.cant`);
      if (!Number.isInteger(cantidad) || cantidad < 0) throw new FormulaError(`La cantidad debe ser un entero mayor o igual a 0 (dio ${cantidad})`);
      if (cantidad === 0) continue; // pieza condicional apagada
      const largoExacto = resolve(`${codigo}.largo`);
      const anchoExacto = resolve(`${codigo}.ancho`);
      const largo = roundMm(largoExacto, mode), ancho = roundMm(anchoExacto, mode);
      if (largo <= 0 || ancho <= 0) throw new FormulaError(`Medida invalida: ${largo} x ${ancho} mm`);
      piezas.push({ codigo: p.codigo, nombre: p.nombre, largo, ancho, cantidad, largoExacto, anchoExacto });
    } catch (e) {
      failed.add(codigo);
      errores.push({ ref: p.codigo, mensaje: e instanceof Error ? e.message : String(e) });
    }
  }

  function evaluarExpresion(formula: string): number {
    const previous = current;
    current = "__EXPR__";
    try {
      return evalAst(ast(`__EXPR__:${formula}`, formula));
    } finally {
      current = previous;
    }
  }

  return { piezas, errores, evaluarExpresion };
}

// ---------------------------------------------------------------- definicion de un modulo del catalogo

export type ModuleDefinitionInput = { parametros: ParamDef[]; piezas: PieceDef[]; espesorDisenoMm: number };

/**
 * Evalua un modulo del catalogo como lo hace todo el sistema: la constante ESP es el espesor de diseno y el
 * redondeo es el de ConfiguracionModulos, que hay que pasar siempre (DECISIONES R6). La usan el editor del
 * catalogo, la API y el armado de solicitudes, asi las mismas medidas dan las mismas piezas en todos lados.
 */
export function evaluateModuleDefinition(definition: ModuleDefinitionInput, valores: Record<string, number>, redondeo: RoundingMode): ModuleEvaluation {
  return evaluateModule({ parametros: definition.parametros, piezas: definition.piezas }, valores, {
    redondeo,
    constantes: { ESP: definition.espesorDisenoMm }
  });
}

// ---------------------------------------------------------------- piezas de un modulo pedido (DECISIONES R6)

export type EdgeSide = "LARGO_1" | "LARGO_2" | "ANCHO_1" | "ANCHO_2";
export const EDGE_SIDES: readonly EdgeSide[] = ["LARGO_1", "LARGO_2", "ANCHO_1", "ANCHO_2"];
/** Espesor del canto de cada lado de una pieza, en mm, o null si ese lado va sin canto. */
export type PieceEdges = Record<EdgeSide, number | null>;
export type PieceRole = "ESQUELETO" | "FRENTE" | "FONDO" | "FIJO";

export type CatalogPieceDef = PieceDef & {
  rol: PieceRole;
  materialFijoId?: string | null;
  permiteRotar: boolean;
  orden: number;
  cantos: Array<{ perfilOrden: number; lado: EdgeSide; espesorMm: number }>;
};
export type CatalogModuleDef = {
  parametros: ParamDef[];
  piezas: CatalogPieceDef[];
  perfiles: Array<{ orden: number }>;
  espesorDisenoMm: number;
};

/** Una pieza de un modulo pedido, con medidas en mm enteros: lo que va a DetallePedido, al optimizador y a los m². */
export type OrderedModulePiece = {
  codigo: string;
  nombre: string;
  rol: PieceRole;
  materialFijoId: string | null;
  largo: number;
  ancho: number;
  cantidad: number;
  permiteRotar: boolean;
  /** 1..n entre las piezas que se generan, en el orden del modulo. Va en el codigo de barra y en la hoja de taller. */
  orden: number;
  cantos: PieceEdges;
  /** true si los cantos se cambiaron a mano y ya no son los del perfil (origen EDITADO). */
  editado: boolean;
};

export type ModulePiecesResult = {
  piezas: OrderedModulePiece[];
  errores: ModuleError[];
  /** Las medidas con las que se calculo: lo cargado o, si falta, el valor por defecto. Es lo que se guarda en la solicitud. */
  valores: Record<string, number>;
};

/**
 * Unico armador de las piezas de un modulo pedido (DECISIONES R6). Lo usan la vista previa, el alta, la edicion
 * y el recalculo de las solicitudes de modulos, y el asistente del navegador, asi las mismas medidas dan
 * exactamente las mismas piezas en todos lados.
 * - Las medidas salen de evaluateModuleDefinition, con el redondeo de ConfiguracionModulos (obligatorio).
 * - Las piezas van en el orden del modulo; las de cantidad 0 no se generan y no ocupan numero de orden.
 * - Los cantos son los del perfil elegido, salvo los que se cambiaron a mano (cantosOverride, por codigo).
 * - Es estricto con los valores: una medida que el modulo no tiene, o una calculada, es un error, porque un
 *   nombre mal escrito haria que se corte con el valor por defecto sin que nadie lo note.
 */
export function buildModulePieces(
  definition: CatalogModuleDef,
  valores: Record<string, number>,
  opts: { redondeo: RoundingMode; perfilOrden: number; cantosOverride?: Record<string, PieceEdges> }
): ModulePiecesResult {
  const errores: ModuleError[] = [];
  const params = new Map(definition.parametros.map((param) => [param.clave.toUpperCase(), param]));

  const inputs: Record<string, number> = {};
  for (const [key, value] of Object.entries(valores ?? {})) {
    const clave = key.toUpperCase();
    const param = params.get(clave);
    if (!param) errores.push({ ref: clave, mensaje: `No existe la medida ${clave}` });
    else if (param.tipo === "CALCULADO") errores.push({ ref: clave, mensaje: `${clave} se calcula sola: no se carga` });
    else inputs[clave] = value;
  }
  const efectivos: Record<string, number> = {};
  for (const param of definition.parametros) {
    if (param.tipo === "CALCULADO") continue;
    const clave = param.clave.toUpperCase();
    const value = clave in inputs ? inputs[clave] : param.valorDefecto;
    if (value !== null && value !== undefined && Number.isFinite(value)) efectivos[clave] = value;
  }

  if (!definition.perfiles.some((perfil) => perfil.orden === opts.perfilOrden)) {
    errores.push({ ref: "PERFIL", mensaje: `El modulo no tiene el perfil de canto ${opts.perfilOrden}` });
  }

  const ordered = definition.piezas
    .map((pieza, index) => ({ pieza, index }))
    .sort((a, b) => a.pieza.orden - b.pieza.orden || a.index - b.index)
    .map(({ pieza }) => pieza);
  const evaluation = evaluateModuleDefinition({ parametros: definition.parametros, piezas: ordered, espesorDisenoMm: definition.espesorDisenoMm }, inputs, opts.redondeo);
  errores.push(...evaluation.errores);

  const byCode = new Map(ordered.map((pieza) => [pieza.codigo.toUpperCase(), pieza]));
  const overrides = new Map<string, PieceEdges>();
  for (const [code, edges] of Object.entries(opts.cantosOverride ?? {})) {
    const codigo = code.toUpperCase();
    // Un cambio para una pieza que existe pero no se genera con estas medidas (cantidad 0) no molesta: puede
    // venir de un paso anterior del asistente. Uno para una pieza que no existe es un error.
    if (!byCode.has(codigo)) errores.push({ ref: codigo, mensaje: `No existe la pieza ${codigo} para cambiarle los cantos` });
    else overrides.set(codigo, edges);
  }

  const piezas = evaluation.piezas.map((result, index): OrderedModulePiece => {
    const pieza = byCode.get(result.codigo.toUpperCase())!;
    const perfil = Object.fromEntries(
      EDGE_SIDES.map((lado) => [lado, pieza.cantos.find((canto) => canto.perfilOrden === opts.perfilOrden && canto.lado === lado)?.espesorMm ?? null])
    ) as PieceEdges;
    const override = overrides.get(result.codigo.toUpperCase());
    const cantos = override ? (Object.fromEntries(EDGE_SIDES.map((lado) => [lado, override[lado] ?? null])) as PieceEdges) : perfil;
    return {
      codigo: pieza.codigo,
      nombre: pieza.nombre,
      rol: pieza.rol,
      materialFijoId: pieza.rol === "FIJO" ? (pieza.materialFijoId ?? null) : null,
      largo: result.largo,
      ancho: result.ancho,
      cantidad: result.cantidad,
      permiteRotar: pieza.permiteRotar,
      orden: index + 1,
      cantos,
      editado: Boolean(override) && EDGE_SIDES.some((lado) => cantos[lado] !== perfil[lado])
    };
  });

  return { piezas, errores, valores: efectivos };
}
