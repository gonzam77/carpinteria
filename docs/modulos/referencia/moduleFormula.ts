// Motor de formulas de modulos - IMPLEMENTACION DE REFERENCIA
// ------------------------------------------------------------------
// - Sin eval / new Function: parser descendente recursivo propio.
// - Debe vivir en frontend/src/lib/moduleFormula.ts y copiarse a backend/src/shared/
//   con el mismo mecanismo que cutOptimizer (scripts/sync-optimizer.mjs), para que
//   la vista previa del navegador y el calculo del servidor sean identicos.
// - Probado contra las 305 piezas de muebles.xlsx (ver moduleFormula.test.ts).

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
    this.position = position;
  }
}

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

export const MAX_FORMULA_LENGTH = 500;
export const MAX_FORMULA_DEPTH = 50;

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
        if (args.length < spec.min || args.length > spec.max) throw new FormulaError(`${name} recibe ${spec.min === spec.max ? spec.min : `${spec.min} a ${spec.max}`} valores`, tok.p);
        return { k: "fn", name, args };
      }
      if (peek().t === ".") {
        next();
        const accTok = expect("id", "largo, ancho o cant");
        const acc = accTok.v.toLowerCase();
        if (acc !== "largo" && acc !== "ancho" && acc !== "cant") throw new FormulaError(`Despues del punto va largo, ancho o cant`, accTok.p);
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

/** Referencias que usa una formula (para grafo de dependencias y autocompletado). */
export function collectRefs(ast: Ast, out: Array<{ id: string; acc?: Accessor }> = []) {
  if (ast.k === "ref") out.push({ id: ast.id, acc: ast.acc });
  else if (ast.k === "neg") collectRefs(ast.e, out);
  else if (ast.k === "bin") { collectRefs(ast.a, out); collectRefs(ast.b, out); }
  else if (ast.k === "fn") ast.args.forEach((a) => collectRefs(a, out));
  return out;
}

// ---------------------------------------------------------------- evaluacion de un modulo

export type ParamDef = { clave: string; tipo: "MEDIDA" | "ENTERO" | "OPCION" | "CALCULADO"; valorDefecto?: number | null; formula?: string | null; minimo?: number | null; maximo?: number | null };
export type PieceDef = { codigo: string; nombre: string; formulaLargo: string; formulaAncho: string; formulaCantidad: string };
export type ModuleDef = { parametros: ParamDef[]; piezas: PieceDef[]; constantes?: Record<string, number> };

export type PieceResult = { codigo: string; nombre: string; largo: number; ancho: number; cantidad: number; largoExacto: number; anchoExacto: number };
export type ModuleError = { ref: string; mensaje: string };

export type RoundingMode = "REDONDEAR" | "TRUNCAR";
const roundMm = (v: number, mode: RoundingMode) => (mode === "TRUNCAR" ? Math.trunc(v) : Math.sign(v) * Math.round(Math.abs(v)));

export function evaluateModule(def: ModuleDef, valores: Record<string, number>, opts: { redondeo?: RoundingMode; constantes?: Record<string, number> } = {}) {
  if (opts.constantes) def = { ...def, constantes: { ...(def.constantes ?? {}), ...opts.constantes } };
  const mode = opts.redondeo ?? "REDONDEAR";
  const params = new Map(def.parametros.map((p) => [p.clave.toUpperCase(), p]));
  const pieces = new Map(def.piezas.map((p) => [p.codigo.toUpperCase(), p]));
  const astCache = new Map<string, Ast>();
  const memo = new Map<string, number>();
  const stack: string[] = [];
  const errores: ModuleError[] = [];
  let current = ""; // pieza o expresion que se esta evaluando en el nivel superior
  const failed = new Set<string>();

  const ast = (key: string, src: string) => {
    if (!astCache.has(key)) astCache.set(key, parseFormula(src));
    return astCache.get(key)!;
  };

  function resolve(key: string): number {
    if (memo.has(key)) return memo.get(key)!;
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
      } else if (def.constantes && id in def.constantes) {
        v = def.constantes[id];
      } else {
        const p = params.get(id);
        if (!p) throw new FormulaError(`No existe la medida ${id}`);
        if (p.tipo === "CALCULADO") v = evalAst(ast(key, p.formula ?? ""));
        else {
          const raw = valores[id] ?? p.valorDefecto;
          if (raw === undefined || raw === null || !Number.isFinite(Number(raw))) throw new FormulaError(`Falta el valor de ${id}`);
          v = Number(raw);
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

  // Validacion de rangos de medidas ingresadas
  for (const p of def.parametros) {
    if (p.tipo === "CALCULADO") continue;
    const raw = valores[p.clave] ?? p.valorDefecto;
    if (raw === undefined || raw === null) { errores.push({ ref: p.clave, mensaje: "Falta el valor" }); continue; }
    if (p.minimo != null && raw < p.minimo) errores.push({ ref: p.clave, mensaje: `Minimo ${p.minimo}` });
    if (p.maximo != null && raw > p.maximo) errores.push({ ref: p.clave, mensaje: `Maximo ${p.maximo}` });
  }

  const piezas: PieceResult[] = [];
  for (const p of def.piezas) {
    current = p.codigo.toUpperCase();
    try {
      const cantidad = resolve(`${p.codigo.toUpperCase()}.cant`);
      if (!Number.isInteger(cantidad) || cantidad < 0) throw new FormulaError(`La cantidad debe ser un entero mayor o igual a 0 (dio ${cantidad})`);
      if (cantidad === 0) continue; // pieza condicional apagada
      const largoExacto = resolve(`${p.codigo.toUpperCase()}.largo`);
      const anchoExacto = resolve(`${p.codigo.toUpperCase()}.ancho`);
      const largo = roundMm(largoExacto, mode), ancho = roundMm(anchoExacto, mode);
      if (largo <= 0 || ancho <= 0) throw new FormulaError(`Medida invalida: ${largo} x ${ancho} mm`);
      piezas.push({ codigo: p.codigo, nombre: p.nombre, largo, ancho, cantidad, largoExacto, anchoExacto });
    } catch (e) {
      failed.add(p.codigo.toUpperCase());
      errores.push({ ref: p.codigo, mensaje: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Evalua una expresion suelta en el contexto del modulo (cantidad de herrajes, por ejemplo). */
  function evaluarExpresion(formula: string): number {
    current = "__EXPR__";
    return evalAst(parseFormula(formula));
  }
  return { piezas, errores, evaluarExpresion };
}
