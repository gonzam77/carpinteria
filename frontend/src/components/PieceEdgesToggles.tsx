import { Box, Button, ListItemText, Menu, MenuItem, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { ESPESORES_CANTO, LADO_CORTO, LADO_NOMBRE, LADOS, edgeOf } from "../lib/moduleEditor";
import type { EspesorCanto, LadoCanto, ModulePiece } from "../types";

export const formatEspesor = (espesor: number) => espesor.toLocaleString("es-AR");

/** Los cuatro lados de canto de una pieza en un perfil (spec §6.2 y §14.5): L1, L2, A1 y A2, con su espesor. */
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
  const [menu, setMenu] = useState<{ anchor: HTMLElement; lado: LadoCanto } | null>(null);
  const current = menu ? edgeOf(pieza, perfilOrden, menu.lado) : null;

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ minWidth: 54 }} title={perfilNombre}>
        {perfilOrden === 1 ? "Perfil A" : "Perfil B"}
      </Typography>
      <Box sx={{ display: "flex", gap: 0.5 }}>
        {LADOS.map((lado) => {
          const espesor = edgeOf(pieza, perfilOrden, lado);
          const descripcion = `${LADO_NOMBRE[lado]}, ${perfilNombre}: ${espesor === null ? "sin canto" : `canto de ${formatEspesor(espesor)} mm`}`;
          return (
            <Button
              key={lado}
              size="small"
              variant={espesor === null ? "outlined" : "contained"}
              color={espesor === null ? "inherit" : "primary"}
              aria-pressed={espesor !== null}
              aria-label={descripcion}
              title={descripcion}
              onClick={(event) => setMenu({ anchor: event.currentTarget, lado })}
              sx={{
                minWidth: 0,
                width: 46,
                px: 0,
                py: 0.25,
                flexDirection: "column",
                lineHeight: 1.1,
                fontSize: 12,
                borderColor: espesor === null ? "divider" : undefined,
                color: espesor === null ? "text.secondary" : undefined
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
              if (menu) onChange(menu.lado, espesor);
              setMenu(null);
            }}
          >
            <ListItemText>{espesor === null ? "Sin canto" : `${formatEspesor(espesor)} mm`}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  );
}
