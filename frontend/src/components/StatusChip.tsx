import { Chip, ChipProps } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { EstadoSolicitud } from "../types";

// Un color por estado, sin repetir (DECISIONES 46). El texto contrasta 4,5:1 o mas con los dos extremos del degradado.
const statusStyle: Record<EstadoSolicitud, { label: string; fg: string; bg: string; border: string; gradient: string }> = {
  PENDIENTE: { label: "Pendiente", fg: "#7a4a08", bg: "#fff3df", border: "#f2c27d", gradient: "linear-gradient(135deg, #fff6e8 0%, #f7d19a 100%)" },
  EN_PROCESO: { label: "En proceso", fg: "#1d4f8f", bg: "#e9f1fc", border: "#9dbbe6", gradient: "linear-gradient(135deg, #eef4fc 0%, #bcd2f1 100%)" },
  TERMINADA: { label: "Terminada", fg: "#0d5c55", bg: "#e3f5f2", border: "#8fd0c9", gradient: "linear-gradient(135deg, #ebf8f6 0%, #b0e1db 100%)" },
  ENTREGADA: { label: "Entregada", fg: "#45403b", bg: "#efeeec", border: "#bdb8b2", gradient: "linear-gradient(135deg, #f4f3f2 0%, #d4d0cb 100%)" },
  RECHAZADA: { label: "Rechazada", fg: "#8c2a1e", bg: "#fdebe7", border: "#efb1a6", gradient: "linear-gradient(135deg, #fff1ee 0%, #f3b9ad 100%)" }
};

export function getStatusStyle(status: EstadoSolicitud) {
  return statusStyle[status];
}

export function StatusChip({ status, sx, ...props }: { status: EstadoSolicitud } & Omit<ChipProps, "label" | "color">) {
  const visual = getStatusStyle(status);

  return (
    <Chip
      {...props}
      label={visual.label}
      sx={{
        background: visual.gradient,
        border: `1px solid ${visual.border}`,
        boxShadow: `inset 0 1px 0 ${alpha("#ffffff", 0.82)}, 0 10px 22px ${alpha(visual.fg, 0.12)}`,
        color: visual.fg,
        fontWeight: 800,
        letterSpacing: 0,
        "& .MuiChip-label": { px: 1.1 },
        ...sx
      }}
    />
  );
}
