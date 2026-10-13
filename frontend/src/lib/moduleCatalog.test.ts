import assert from "node:assert/strict";
import test from "node:test";
import { countByCategory, filterModules, modulesToReview, observationLines, observationsLabel } from "./moduleCatalog.ts";
import type { ModuleCategory, ModuleListItem } from "../types/index.ts";

const category = (id: string, orden: number, activo = true): ModuleCategory => ({ id, nombre: id, orden, activo }) as ModuleCategory;
const module = (id: string, categoria: string, observaciones: string | null = null, codigo = id.toUpperCase()) =>
  ({ id, nombre: id, codigo, categoria: { id: categoria, nombre: categoria }, observaciones }) as ModuleListItem;

test("observaciones: una por renglon, sin renglones vacios (la cuenta del servidor)", () => {
  assert.deepEqual(observationLines(null), []);
  assert.deepEqual(observationLines("  \n"), []);
  assert.deepEqual(observationLines(" Revisar cantos \r\n\nFalta la imagen\n"), ["Revisar cantos", "Falta la imagen"]);
  assert.equal(observationsLabel(1), "1 observación");
  assert.equal(observationsLabel(3), "3 observaciones");
});

test("modulos para revisar: solo los que tienen observaciones, de mas a menos y por nombre", () => {
  const list = modulesToReview([module("b", "x", "uno"), module("a", "x", null), module("c", "x", "uno\ndos"), module("aa", "x", "uno")]);
  assert.deepEqual(
    list.map((item) => [item.module.id, item.lines.length]),
    [
      ["c", 2],
      ["aa", 1],
      ["b", 1]
    ]
  );
});

test("modulos por categoria: en el orden de las categorias, con las activas vacias y sin las inactivas vacias", () => {
  const categories = [category("placares", 3), category("bajo", 1), category("vieja", 4, false), category("alacenas", 2), category("otra", 5, false)];
  const modules = [module("m1", "bajo"), module("m2", "placares"), module("m3", "bajo"), module("m4", "otra"), module("m5", "suelta")];
  assert.deepEqual(
    countByCategory(modules, categories).map((item) => [item.id, item.cantidad]),
    [
      ["bajo", 2],
      ["alacenas", 0],
      ["placares", 1],
      ["otra", 1],
      ["suelta", 1]
    ]
  );
});

test("filtro: categoria y texto en el nombre o el codigo, sin importar mayusculas", () => {
  const modules = [module("Bajo mesada 2 puertas", "bajo", null, "BM2"), module("Alacena 2 puertas", "alacenas", null, "AL2"), module("Especiero", "bajo", null, "ESP")];
  assert.deepEqual(filterModules(modules, {}).length, 3);
  assert.deepEqual(filterModules(modules, { search: " 2 PUERTAS " }).map((item) => item.codigo), ["BM2", "AL2"]);
  assert.deepEqual(filterModules(modules, { search: "esp" }).map((item) => item.codigo), ["ESP"]);
  assert.deepEqual(filterModules(modules, { categoriaId: "bajo", search: "puertas" }).map((item) => item.codigo), ["BM2"]);
});
