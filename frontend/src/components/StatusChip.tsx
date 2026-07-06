import { Chip, ChipProps } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { EstadoSolicitud } from "../types";

const statusStyle: Record<EstadoSolicitud, { label: string; fg: string; bg: string; border: string; gradient: string }> = {
  PENDIENTE: { label: "Pendiente", fg: "#8e5a12", bg: "#fff3df", border: "#f2c27d", gradient: "linear-gradient(135deg, #fff6e8 0%, #f7d19a 100%)" },
  EN_PROCESO: { label: "En proceso", fg: "#4d453e", bg: "#f1ebe4", border: "#c8b8a6", gradient: "linear-gradient(135deg, #f5efe8 0%, #d9cec1 100%)" },
  TERMINADA: { label: "Terminada", fg: "#8b4d0a", bg: "#fff0dd", border: "#f0b56b", gradient: "linear-gradient(135deg, #fff4e6 0%, #f4bb72 100%)" },
  ENTREGADA: { label: "Entregada", fg: "#231f1b", bg: "#ece7e0", border: "#b8ada1", gradient: "linear-gradient(135deg, #f2ede7 0%, #d0c5b8 100%)" },
  RECHAZADA: { label: "Rechazada", fg: "#9a4335", bg: "#fdebe7", border: "#efb1a6", gradient: "linear-gradient(135deg, #fff1ee 0%, #f0b0a3 100%)" }
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
