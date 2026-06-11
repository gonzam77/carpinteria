import { Chip, ChipProps } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { EstadoSolicitud } from "../types";

const statusStyle: Record<EstadoSolicitud, { label: string; fg: string; bg: string; border: string; gradient: string }> = {
  PENDIENTE: { label: "Pendiente", fg: "#9a6400", bg: "#fff6dc", border: "#ffd66b", gradient: "linear-gradient(135deg, #fff6dc 0%, #ffe39b 100%)" },
  EN_PROCESO: { label: "En proceso", fg: "#12677a", bg: "#e3fbff", border: "#7de6f2", gradient: "linear-gradient(135deg, #e3fbff 0%, #a7eff7 100%)" },
  TERMINADA: { label: "Terminada", fg: "#256b58", bg: "#e2fff5", border: "#78e4bd", gradient: "linear-gradient(135deg, #e2fff5 0%, #9df0cf 100%)" },
  ENTREGADA: { label: "Entregada", fg: "#3651bc", bg: "#ecefff", border: "#aab8ff", gradient: "linear-gradient(135deg, #ecefff 0%, #c8d2ff 100%)" },
  RECHAZADA: { label: "Rechazada", fg: "#a62046", bg: "#ffe7ee", border: "#ff9bb3", gradient: "linear-gradient(135deg, #ffe7ee 0%, #ffc0ce 100%)" }
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
        boxShadow: `inset 0 1px 0 ${alpha("#ffffff", 0.82)}, 0 10px 22px ${alpha(visual.fg, 0.14)}`,
        color: visual.fg,
        fontWeight: 800,
        letterSpacing: 0,
        "& .MuiChip-label": { px: 1.1 },
        ...sx
      }}
    />
  );
}
