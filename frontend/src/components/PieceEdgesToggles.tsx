import { Box, Button, ListItemText, Menu, MenuItem, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { ESPESORES_CANTO, LADO_CORTO, LADO_NOMBRE, LADOS, edgeOf } from "../lib/moduleEditor";
import type { EspesorCanto, LadoCanto, ModulePiece } from "../types";

export const formatEspesor = (espesor: number) => espesor.toLocaleString("es-AR");

/** Azul de "cambiado a mano" (spec §9.2 paso 4). Va fijo: en el tema, info no es azul. */
export const EDITED_BLUE = "#2f6fdb";

/**
 * Los cuatro lados de canto de una pieza (spec §6.2, §9.2 paso 4 y §14.5): L1, L2, A1 y A2, cada uno con su espesor.
 * Al tocar un lado se elige "Sin canto" o un espesor; elegir el que ya tiene no cambia nada. aria-pressed y title dicen
 * el lado y el espesor.
 */
export function EdgeToggleButtons({
  edges,
  label,
  context,
  onChange,
  editedSides = [],
  available,
  disabled = false
}: {
  edges: Record<LadoCanto, number | null>;
  /** Texto corto a la izquierda (por ejemplo "Perfil A"); sin texto, solo los botones. */
  label?: string;
  /** Para el title y el aria-label de cada lado (por ejemplo el nombre del perfil o de la pieza). */
  context: string;
  onChange: (lado: LadoCanto, espesor: EspesorCanto | null) => void;
  /** Lados cambiados a mano: van en otro color (spec §9.2 paso 4). */
  editedSides?: readonly LadoCanto[];
  /** Espesores que tiene el color de cantos; los demas se avisan en el menu (PLAN P10). Sin dato, no se avisa. */
  available?: readonly number[];
  disabled?: boolean;
}) {
  const [menu, setMenu] = useState<{ anchor: HTMLElement; lado: LadoCanto } | null>(null);
  const current = menu ? edges[menu.lado] : null;
  const missing = (espesor: number) => Boolean(available) && !available!.some((value) => Math.abs(value - espesor) < 1e-6);

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      {label && (
        <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ minWidth: 54 }} title={context}>
          {label}
        </Typography>
      )}
      <Box sx={{ display: "flex", gap: 0.5 }}>
        {LADOS.map((lado) => {
          const espesor = edges[lado];
          const edited = editedSides.includes(lado);
          const descripcion = `${LADO_NOMBRE[lado]}, ${context}: ${espesor === null ? "sin canto" : `canto de ${formatEspesor(espesor)} mm`}${edited ? ", cambiado a mano" : ""}`;
          return (
            <Button
              key={lado}
              size="small"
              variant={espesor === null ? "outlined" : "contained"}
              color={espesor === null ? "inherit" : "primary"}
              aria-pressed={espesor !== null}
              aria-label={descripcion}
              title={descripcion}
              disabled={disabled}
              onClick={(event) => setMenu({ anchor: event.currentTarget, lado })}
              sx={{
                minWidth: 0,
                width: 46,
                px: 0,
                py: 0.25,
                flexDirection: "column",
                lineHeight: 1.1,
                fontSize: 12,
                borderColor: espesor === null ? (edited ? EDITED_BLUE : "divider") : undefined,
                color: espesor === null ? (edited ? EDITED_BLUE : "text.secondary") : undefined,
                ...(edited && espesor !== null ? { background: "linear-gradient(135deg, #2f6fdb 0%, #1d4fa8 100%)", color: "#fff" } : {})
              }}
            >
              <span>{LADO_CORTO[lado]}</span>
              <span style={{ fontSize: 11, fontWeight: 500 }}>{espesor === null ? "—" : formatEspesor(espesor)}</span>
            </Button>
          );
        })}
      </Box>
      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        {[null, ...ESPESORES_CANTO].map((espesor) => (
          <MenuItem
            key={String(espesor)}
            selected={espesor === current}
            onClick={() => {
              if (menu && espesor !== current) onChange(menu.lado, espesor);
              setMenu(null);
            }}
          >
            <ListItemText secondary={espesor !== null && missing(espesor) ? "No hay canto de este espesor para el color elegido" : undefined}>
              {espesor === null ? "Sin canto" : `${formatEspesor(espesor)} mm`}
            </ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  );
}

/** Los cantos de una pieza del catalogo en un perfil (editor de modulos, spec §6.2). */
export function PieceEdgesToggles({
  pieza,
  perfilOrden,
  perfilNombre,
  onChange
}: {
  pieza: ModulePiece;
  perfilOrden: 1 | 2;
  perfilNombre: string;
  onChange: (lado: LadoCanto, espesor: EspesorCanto | null) => void;
}) {
  const edges = Object.fromEntries(LADOS.map((lado) => [lado, edgeOf(pieza, perfilOrden, lado)])) as Record<LadoCanto, number | null>;
  return <EdgeToggleButtons edges={edges} label={perfilOrden === 1 ? "Perfil A" : "Perfil B"} context={perfilNombre} onChange={onChange} />;
}
