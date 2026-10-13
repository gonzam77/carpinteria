import { InputAdornment } from "@mui/material";
import type { ReactNode } from "react";

/**
 * El icono de un campo (2026-10-13), a la izquierda y acorde a lo que se carga. Uso:
 * `<TextField slotProps={{ input: fieldIcon(<PersonOutlineIcon />) }} />`. El color lo pone el tema (gris, naranja con foco).
 */
export function fieldIcon(icon: ReactNode) {
  return {
    startAdornment: (
      <InputAdornment position="start" aria-hidden>
        {icon}
      </InputAdornment>
    )
  };
}
