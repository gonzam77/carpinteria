import { Chip, type ChipProps } from "@mui/material";
import type { DeliveryKind, DeliveryStatus } from "../lib/moduleOrdersList";

/**
 * Colores del semaforo de plazo (spec §9.1), los del prototipo. Van fijos: en el tema, success es naranja y no se veria
 * verde.
 */
const COLORS: Record<DeliveryKind, { fg: string; bg: string; border: string }> = {
  // Texto sobre el fondo con contraste de 4,5:1 o mas (WCAG AA): verde 6,1:1 y amarillo 5,6:1 (F7.2).
  "en-plazo": { fg: "#24663f", bg: "#e7f4ec", border: "#b7dcc5" },
  proxima: { fg: "#8a5806", bg: "#fff5df", border: "#f2d08a" },
  atrasada: { fg: "#96382b", bg: "#fde9e5", border: "#efb1a6" },
  entregada: { fg: "#6f6760", bg: "#f1ece6", border: "#ddd2c5" },
  "sin-plazo": { fg: "#6f6760", bg: "#f1ece6", border: "#ddd2c5" }
};

/** Semaforo de plazo de una solicitud de modulos: el texto dice el plazo y el title lo explica completo. */
export function DeliveryChip({ status, sx, ...props }: { status: DeliveryStatus } & Omit<ChipProps, "label" | "color">) {
  const color = COLORS[status.kind];
  return (
    <Chip
      {...props}
      label={status.label}
      title={status.description}
      aria-label={status.description}
      sx={{
        color: color.fg,
        bgcolor: color.bg,
        border: "1px solid",
        borderColor: color.border,
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
        "& .MuiChip-label": { px: 1.1 },
        ...sx
      }}
    />
  );
}
