// Configuracion › Catalogo de modulos sin React (2026-10-13): filtrar el listado, contar por categoria y juntar las
// observaciones para revisar.
import type { ModuleCategory, ModuleListItem } from "../types/index.ts";

/** Las observaciones de un modulo, una por renglon. La misma cuenta que `cantidadObservaciones` del servidor. */
export function observationLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export const observationsLabel = (count: number) => `${count} ${count === 1 ? "observación" : "observaciones"}`;

export type ModuleToReview = { module: ModuleListItem; lines: string[] };

/** Los modulos con observaciones, de mas a menos (a igual cantidad, por nombre). */
export function modulesToReview(modules: ModuleListItem[]): ModuleToReview[] {
  return modules
    .map((module) => ({ module, lines: observationLines(module.observaciones) }))
    .filter((item) => item.lines.length > 0)
    .sort((a, b) => b.lines.length - a.lines.length || a.module.nombre.localeCompare(b.module.nombre, "es"));
}

/**
 * Cuantos modulos hay en cada categoria, en el orden de las categorias. Aparecen las activas (aunque esten vacias) y
 * las inactivas que todavia tienen modulos; las que no estan en la lista de categorias van al final.
 */
export function countByCategory(modules: ModuleListItem[], categories: ModuleCategory[]) {
  const counts = new Map<string, { id: string; nombre: string; cantidad: number }>();
  for (const module of modules) {
    const current = counts.get(module.categoria.id) ?? { id: module.categoria.id, nombre: module.categoria.nombre, cantidad: 0 };
    current.cantidad += 1;
    counts.set(module.categoria.id, current);
  }
  const ordered = [...categories]
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"))
    .filter((category) => category.activo || counts.has(category.id))
    .map((category) => ({ id: category.id, nombre: category.nombre, cantidad: counts.get(category.id)?.cantidad ?? 0 }));
  const known = new Set(ordered.map((item) => item.id));
  return [...ordered, ...[...counts.values()].filter((item) => !known.has(item.id))];
}

/** El filtro del listado, como el del servidor: la categoria, y el texto en el nombre o el codigo (sin mayusculas). */
export function filterModules(modules: ModuleListItem[], { categoriaId = "", search = "" }: { categoriaId?: string; search?: string }) {
  const text = search.trim().toLocaleLowerCase("es");
  return modules.filter(
    (module) =>
      (!categoriaId || module.categoria.id === categoriaId) &&
      (!text || module.nombre.toLocaleLowerCase("es").includes(text) || module.codigo.toLocaleLowerCase("es").includes(text))
  );
}
