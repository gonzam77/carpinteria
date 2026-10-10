import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloseIcon from "@mui/icons-material/Close";
import RemoveIcon from "@mui/icons-material/Remove";
import ViewListIcon from "@mui/icons-material/ViewList";
import { Box, Button, Chip, CircularProgress, Divider, Drawer, IconButton, MenuItem, Paper, Stack, TextField, Typography, useMediaQuery, useTheme } from "@mui/material";
import { useId, useMemo, useRef, useState } from "react";
import type { ModuleCategory, ModuleListItem } from "../../types";
import { ModuleCard } from "../ModuleCard";

export type Seleccion = { moduloId: string; cantidad: number };

/** Una solicitud lleva hasta 100 modulos (spec §13.2). */
export const MAX_MODULOS = 100;

/** La lista de los modulos elegidos, con su cantidad (− n +) y quitar. La usan el panel y el cajon del celular. */
function SelectedList({
  selecciones,
  byId,
  total,
  setCantidad
}: {
  selecciones: Seleccion[];
  byId: Map<string, ModuleListItem>;
  total: number;
  setCantidad: (moduloId: string, cantidad: number) => void;
}) {
  if (!selecciones.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        Todavía no elegiste módulos. Tocá una tarjeta para sumarla.
      </Typography>
    );
  }
  return (
    <Stack component="ul" divider={<Divider component="li" aria-hidden />} sx={{ listStyle: "none", m: 0, p: 0 }}>
      {selecciones.map((item) => {
        const module = byId.get(item.moduloId);
        const nombre = module?.nombre ?? "Módulo";
        return (
          <Stack component="li" key={item.moduloId} direction="row" alignItems="center" spacing={1} sx={{ py: 0.75 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" fontWeight={700} noWrap title={nombre}>
                {nombre}
              </Typography>
              {module && (
                <Typography variant="caption" color="text.secondary" noWrap component="p">
                  {module.categoria.nombre}
                </Typography>
              )}
            </Box>
            <Stack direction="row" alignItems="center">
              <IconButton size="small" aria-label={`Restar uno: ${nombre}`} onClick={() => setCantidad(item.moduloId, item.cantidad - 1)}>
                <RemoveIcon fontSize="small" />
              </IconButton>
              <Typography fontWeight={800} sx={{ minWidth: 22, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                {item.cantidad}
              </Typography>
              <IconButton size="small" aria-label={`Sumar uno: ${nombre}`} disabled={total >= MAX_MODULOS} onClick={() => setCantidad(item.moduloId, item.cantidad + 1)}>
                <AddIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" aria-label={`Quitar ${nombre}`} onClick={() => setCantidad(item.moduloId, 0)}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
        );
      })}
    </Stack>
  );
}

const countText = (total: number) => `${total} ${total === 1 ? "módulo elegido" : "módulos elegidos"}`;

/**
 * Paso 2 (spec §9.2): grilla del catalogo activo. Click (o Enter) en la tarjeta la marca o la desmarca; marcada,
 * aparece la cantidad (− n +). Las selecciones quedan en el orden en que se eligieron. Lo elegido se ve siempre: en un
 * panel fijo a la derecha con "Siguiente" (pantallas anchas) o en una barra fija abajo que abre la lista (celular).
 */
export function ModulePickerStep({
  modules,
  categories,
  selecciones,
  onChange,
  onNext,
  busy
}: {
  modules: ModuleListItem[];
  categories: ModuleCategory[];
  selecciones: Seleccion[];
  onChange: (selecciones: Seleccion[]) => void;
  onNext: () => void;
  busy: boolean;
}) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up("lg"));
  const [listOpen, setListOpen] = useState(false);
  const titleId = useId();
  const byId = useMemo(() => new Map(modules.map((module) => [module.id, module])), [modules]);
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

  const nextButton = (
    <Button
      type="button"
      variant="contained"
      fullWidth
      endIcon={busy ? <CircularProgress size={16} color="inherit" /> : <ArrowForwardIcon />}
      onClick={onNext}
      disabled={busy}
    >
      Siguiente
    </Button>
  );

  return (
    <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 320px" }, alignItems: "start" }}>
      <Stack spacing={2} sx={{ minWidth: 0 }}>
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

      {wide ? (
        // Panel fijo a la derecha: lo elegido y Siguiente siempre a la vista (debajo de la barra superior, 72 px).
        <Paper
          component="aside"
          aria-labelledby={titleId}
          sx={{ p: 2, borderRadius: "10px", position: "sticky", top: 88, maxHeight: "calc(100vh - 104px)", display: "flex", flexDirection: "column", gap: 1.5 }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
            <Typography id={titleId} component="h2" fontWeight={800} fontSize="1rem">
              Módulos elegidos
            </Typography>
            <Chip size="small" color={total ? "primary" : "default"} label={total} sx={{ fontWeight: 800 }} aria-label={countText(total)} />
          </Stack>
          <Box sx={{ overflowY: "auto", minHeight: 0, mx: -0.5, px: 0.5 }}>
            <SelectedList selecciones={selecciones} byId={byId} total={total} setCantidad={setCantidad} />
          </Box>
          <Divider />
          <Typography variant="body2" color="text.secondary">
            {countText(total)}
            {total >= MAX_MODULOS ? " (el máximo por solicitud)" : ""}
          </Typography>
          {nextButton}
        </Paper>
      ) : (
        <>
          {/* Celular y tablet: barra fija abajo con el total, la lista y Siguiente. */}
          <Paper
            elevation={8}
            sx={{ position: "sticky", bottom: 8, zIndex: 3, p: 1.25, borderRadius: "12px", display: "flex", alignItems: "center", gap: 1 }}
          >
            <Button
              type="button"
              variant="outlined"
              startIcon={<ViewListIcon />}
              onClick={() => setListOpen(true)}
              aria-label={`Ver los elegidos: ${countText(total)}`}
              sx={{ flex: 1, justifyContent: "flex-start", minWidth: 0 }}
            >
              <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Elegidos · {total}
              </Box>
            </Button>
            <Box sx={{ flex: 1 }}>{nextButton}</Box>
          </Paper>
          <Drawer anchor="bottom" open={listOpen} onClose={() => setListOpen(false)} // El tema pinta los Drawer como el menu lateral (oscuro): este va claro, como el resto de la pantalla.
            slotProps={{ paper: { sx: { borderRadius: "16px 16px 0 0", maxHeight: "75vh", bgcolor: "background.paper", backgroundImage: "none", color: "text.primary" } } }}>
            <Stack spacing={1.5} sx={{ p: 2 }} role="region" aria-labelledby={titleId}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography id={titleId} component="h2" fontWeight={800}>
                  Módulos elegidos ({total})
                </Typography>
                <IconButton aria-label="Cerrar la lista" onClick={() => setListOpen(false)}>
                  <CloseIcon />
                </IconButton>
              </Stack>
              <SelectedList selecciones={selecciones} byId={byId} total={total} setCantidad={setCantidad} />
              {nextButton}
            </Stack>
          </Drawer>
        </>
      )}
    </Box>
  );
}
