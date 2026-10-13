import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ImageNotSupportedOutlinedIcon from "@mui/icons-material/ImageNotSupportedOutlined";
import PauseCircleOutlineRoundedIcon from "@mui/icons-material/PauseCircleOutlineRounded";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import StraightenOutlinedIcon from "@mui/icons-material/StraightenOutlined";
import ViewQuiltOutlinedIcon from "@mui/icons-material/ViewQuiltOutlined";
import { Box, ButtonBase, Card, CardActions, CircularProgress, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { ReactElement, ReactNode, Ref } from "react";
import { useModuleImage } from "../hooks/useModuleImage";
import { observationsLabel } from "../lib/moduleCatalog";
import type { ModuleListItem } from "../types";

// Los colores de los estados. El "success" del tema es el naranja de la marca: para "activo" va el verde de los plazos.
const TONES = { success: "#24663f", neutral: "#6f6760", error: "#b4432f", warning: "#a16807" } as const;
type Tone = keyof typeof TONES;

/** Imagen de un modulo, o un marcador "Sin imagen". */
export function ModuleImage({ moduloId, version, height = 150 }: { moduloId: string; version: string | null; height?: number }) {
  const { url, loading } = useModuleImage(moduloId, version);
  return (
    <Box
      sx={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#f7f1e8",
        borderBottom: "1px solid",
        borderColor: "divider",
        overflow: "hidden"
      }}
    >
      {loading ? (
        <CircularProgress size={22} />
      ) : url ? (
        <Box component="img" src={url} alt="" sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      ) : (
        <Stack alignItems="center" spacing={0.5} sx={{ color: "text.secondary" }}>
          <ImageNotSupportedOutlinedIcon />
          <Typography variant="caption">Sin imagen</Typography>
        </Stack>
      )}
    </Box>
  );
}

/** Una marca de estado de la tarjeta: icono y texto sobre un fondo suave del mismo color. */
function StatusPill({ tone, icon, label }: { tone: Tone; icon: ReactElement; label: string }) {
  const color = TONES[tone];
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        height: 24,
        px: 1,
        borderRadius: "999px",
        fontSize: "0.74rem",
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: "nowrap",
        color,
        bgcolor: alpha(color, 0.09),
        boxShadow: `inset 0 0 0 1px ${alpha(color, 0.22)}`,
        "& svg": { fontSize: 15 }
      }}
    >
      {icon}
      {label}
    </Box>
  );
}

/**
 * Una accion de la barra de la tarjeta (2026-10-13): icono arriba y texto abajo, todas del mismo ancho. `tone` pinta
 * las que cambian el estado (desactivar en rojo suave, activar en verde).
 */
export function ModuleCardAction({
  icon,
  label,
  onClick,
  disabled,
  tone = "primary",
  ariaLabel
}: {
  icon: ReactElement;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "error" | "success";
  ariaLabel?: string;
}) {
  const color = tone === "error" ? TONES.error : tone === "success" ? TONES.success : "#b45f10";
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      sx={{
        flexDirection: "column",
        gap: 0.35,
        py: 1.1,
        minHeight: 58,
        width: "100%",
        color,
        fontSize: "0.78rem",
        fontWeight: 800,
        fontFamily: "inherit",
        transition: "background-color 160ms ease, color 160ms ease",
        "& svg": { fontSize: 20, transition: "transform 160ms ease" },
        "&:hover": { bgcolor: alpha(color, 0.08) },
        "&:hover svg": { transform: "translateY(-2px)" },
        "&.Mui-focusVisible": { bgcolor: alpha(color, 0.12), outline: `2px solid ${alpha(color, 0.6)}`, outlineOffset: -2 },
        "&.Mui-disabled": { color: "text.disabled" },
        "@media (prefers-reduced-motion: reduce)": { "&:hover svg": { transform: "none" } }
      }}
    >
      {icon}
      <span>{label}</span>
    </ButtonBase>
  );
}

/**
 * Tarjeta de un modulo del catalogo (spec §6.1). Las acciones las pone quien la usa: con `actionsBar` van en una barra
 * inferior de columnas iguales separadas por divisores (usar `ModuleCardAction`); sin ella, en una fila libre.
 * Para elegir modulos (asistente, spec §9.2 paso 2): `selected` la marca, la tarjeta se maneja con teclado
 * (aria-pressed) y `hideStatus` oculta las marcas del catalogo (activo, errores, observaciones).
 */
export function ModuleCard({
  module,
  actions,
  actionsBar = false,
  onClick,
  selected,
  hideStatus = false,
  buttonRef
}: {
  module: ModuleListItem;
  actions?: ReactNode;
  actionsBar?: boolean;
  onClick?: () => void;
  selected?: boolean;
  hideStatus?: boolean;
  /** La parte que se elige (role=button), para devolverle el foco. */
  buttonRef?: Ref<HTMLDivElement>;
}) {
  const selectable = selected !== undefined && Boolean(onClick);
  return (
    <Card
      variant="outlined"
      sx={{
        display: "flex",
        flexDirection: "column",
        borderRadius: "14px",
        overflow: "hidden",
        bgcolor: module.activo ? "background.paper" : "#fbf8f4",
        boxShadow: "0 6px 18px rgba(45, 35, 24, 0.05)",
        transition: "box-shadow 160ms ease, border-color 160ms ease",
        "&:hover": { boxShadow: "0 14px 30px rgba(45, 35, 24, 0.1)", ...(selectable ? {} : { borderColor: alpha("#f28c28", 0.4) }) },
        ...(selectable ? { borderWidth: 2, borderColor: selected ? "primary.main" : "divider" } : {})
      }}
    >
      <Box
        ref={buttonRef}
        onClick={onClick}
        role={selectable ? "button" : undefined}
        tabIndex={selectable ? 0 : undefined}
        // Boton de alternancia: el nombre no cambia y aria-pressed dice si esta elegido (patron de WAI-ARIA).
        aria-pressed={selectable ? selected : undefined}
        aria-label={selectable ? module.nombre : undefined}
        onKeyDown={
          selectable
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
        sx={{
          cursor: onClick ? "pointer" : "default",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          ...(selectable ? { "&:focus-visible": { outline: "3px solid", outlineColor: "primary.dark", outlineOffset: -3 } } : {})
        }}
      >
        <Box sx={{ opacity: module.activo ? 1 : 0.7 }}>
          <ModuleImage moduloId={module.id} version={module.tieneImagen ? module.imagenActualizada : null} />
        </Box>
        <Box sx={{ px: 2, pt: 1.5, pb: 1.75, flex: 1, display: "flex", flexDirection: "column" }}>
          <Typography
            component="p"
            sx={{ color: "primary.dark", fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1.4 }}
            noWrap
            title={module.categoria.nombre}
          >
            {module.categoria.nombre}
          </Typography>
          <Typography fontWeight={800} sx={{ lineHeight: 1.25, mt: 0.25, fontSize: "1rem" }}>
            {module.nombre}
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ mt: 0.75, color: "text.secondary", "& svg": { fontSize: 16 } }}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <ViewQuiltOutlinedIcon aria-hidden />
              <Typography variant="body2">{module.piezas} piezas</Typography>
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <StraightenOutlinedIcon aria-hidden />
              <Typography variant="body2">{module.parametros} medidas</Typography>
            </Stack>
          </Stack>
          {!hideStatus && (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: "auto", pt: 1.5 }}>
              {module.activo ? (
                <StatusPill tone="success" icon={<CheckCircleRoundedIcon />} label="Activo" />
              ) : (
                <StatusPill tone="neutral" icon={<PauseCircleOutlineRoundedIcon />} label="Inactivo" />
              )}
              {module.estadoFormulas === "CON_ERRORES" && <StatusPill tone="error" icon={<ErrorOutlineRoundedIcon />} label="Con errores" />}
              {module.cantidadObservaciones > 0 && <StatusPill tone="warning" icon={<RateReviewOutlinedIcon />} label={observationsLabel(module.cantidadObservaciones)} />}
            </Stack>
          )}
        </Box>
      </Box>
      {actions &&
        (actionsBar ? (
          <Box
            sx={{
              display: "grid",
              gridAutoFlow: "column",
              gridAutoColumns: "1fr",
              borderTop: "1px solid",
              borderColor: "divider",
              bgcolor: alpha("#f7f1e8", 0.55),
              "& > * + *": { borderLeft: "1px solid", borderColor: "divider" }
            }}
          >
            {actions}
          </Box>
        ) : (
          <CardActions sx={{ pt: 0, px: 1.5, pb: 1.5, flexWrap: "wrap", gap: 0.5 }}>{actions}</CardActions>
        ))}
    </Card>
  );
}
