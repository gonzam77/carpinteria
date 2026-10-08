// Totales del dashboard por estado y por tipo (spec §15): los dos tipos cuentan en los totales, porque el stock de placas
// es uno solo, y aparte se dice cuantos son de modulos a medida.

type Group = { estado: string; tipo: string; _count: { _all: number } };

/** Por estado (en el orden en que aparecen) con cuantos de ese estado son de modulos, y el total por tipo. */
export function summarizeOrders(groups: Group[]) {
  const byStatus = new Map<string, { estado: string; total: number; modulos: number }>();
  const byTipo = new Map<string, number>([
    ["CORTE", 0],
    ["MODULOS", 0]
  ]);
  for (const group of groups) {
    const count = group._count._all;
    const status = byStatus.get(group.estado) ?? { estado: group.estado, total: 0, modulos: 0 };
    status.total += count;
    if (group.tipo === "MODULOS") status.modulos += count;
    byStatus.set(group.estado, status);
    byTipo.set(group.tipo, (byTipo.get(group.tipo) ?? 0) + count);
  }
  return { byStatus: [...byStatus.values()], byTipo: [...byTipo].map(([tipo, total]) => ({ tipo, total })) };
}
