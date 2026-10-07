import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, Chip, IconButton, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { useMemo, useRef, useState } from "react";
import type { ModuleCategory, ModuleListItem } from "../../types";
import { ModuleCard } from "../ModuleCard";

export type Seleccion = { moduloId: string; cantidad: number };

/** Una solicitud lleva hasta 100 modulos (spec §13.2). */
export const MAX_MODULOS = 100;

/**
 * Paso 2 (spec §9.2): grilla del catalogo activo. Click (o Enter) en la tarjeta la marca o la desmarca; marcada,
 * aparece la cantidad (− n +). Las selecciones quedan en el orden en que se eligieron.
 */
export function ModulePickerStep({
  modules,
  categories,
  selecciones,
  onChange
}: {
  modules: ModuleListItem[];
  categories: ModuleCategory[];
  selecciones: Seleccion[];
  onChange: (selecciones: Seleccion[]) => void;
}) {
  const [categoriaId, setCategoriaId] = useState("");
  // Al bajar a 0 desaparece el control de cantidad que tenia el foco: se devuelve a la tarjeta.
  const cards = useRef(new Map<string, HTMLDivElement>());
  const [search, setSearch] = useState("");
  const cantidadDe = useMemo(() => new Map(selecciones.map((item) => [item.moduloId, item.cantidad])), [selecciones]);
  const total = selecciones.reduce((sum, item) => sum + item.cantidad, 0);
  // Solo las categorias que tienen algun modulo para elegir.
  const visibleCategories = categories.filter((category) => modules.some((module) => module.categoria.id === category.id));
  const query = search.trim().toLowerCase();
  const filtered = modules.filter(
    (module) => (!categoriaId || module.categoria.id === categoriaId) && (!query || module.nombre.toLowerCase().includes(query) || module.codigo.toLowerCase().includes(query))
  );

  const setCantidad = (moduloId: string, cantidad: number) => {
    const others = total - (cantidadDe.get(moduloId) ?? 0);
    const allowed = Math.max(0, Math.min(cantidad, MAX_MODULOS - others));
    if (allowed === 0) onChange(selecciones.filter((item) => item.moduloId !== moduloId));
    else if (cantidadDe.has(moduloId)) onChange(selecciones.map((item) => (item.moduloId === moduloId ? { ...item, cantidad: allowed } : item)));
    else onChange([...selecciones, { moduloId, cantidad: allowed }]);
  };

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2, borderRadius: "10px" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
          <TextField select size="small" label="Categoría" value={categoriaId} onChange={(event) => setCategoriaId(event.target.value)} sx={{ minWidth: 220 }}>
            <MenuItem value="">Todas</MenuItem>
            {visibleCategories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                {category.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="Buscar por nombre o código" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ flex: 1 }} />
          <Chip color={total ? "primary" : "default"} label={`${total} ${total === 1 ? "módulo elegido" : "módulos elegidos"}`} sx={{ fontWeight: 800 }} />
        </Stack>
      </Paper>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {filtered.map((module) => {
          const cantidad = cantidadDe.get(module.id) ?? 0;
          return (
            <ModuleCard
              key={module.id}
              module={module}
              hideStatus
              selected={cantidad > 0}
              onClick={() => setCantidad(module.id, cantidad > 0 ? 0 : 1)}
              buttonRef={(element) => {
                if (element) cards.current.set(module.id, element);
                else cards.current.delete(module.id);
              }}
              actions={
                cantidad > 0 ? (
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ width: "100%", justifyContent: "space-between" }}>
                    <Typography variant="body2" color="text.secondary">
                      Cantidad
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <IconButton
                        size="small"
                        aria-label={`Una menos de ${module.nombre}`}
                        onClick={() => {
                          setCantidad(module.id, cantidad - 1);
                          if (cantidad === 1) window.requestAnimationFrame(() => cards.current.get(module.id)?.focus());
                        }}
                      >
                        <RemoveIcon fontSize="small" />
                      </IconButton>
                      <Typography fontWeight={800} sx={{ minWidth: 28, textAlign: "center", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
                        {cantidad}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label={`Una más de ${module.nombre}`}
                        disabled={total >= MAX_MODULOS}
                        onClick={() => setCantidad(module.id, cantidad + 1)}
                      >
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>
                ) : undefined
              }
            />
          );
        })}
      </Box>
      {!filtered.length && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: "10px" }}>
          <Typography color="text.secondary">{modules.length ? "No hay módulos que coincidan con el filtro." : "Todavía no hay módulos activos en el catálogo."}</Typography>
        </Paper>
      )}
    </Stack>
  );
}
