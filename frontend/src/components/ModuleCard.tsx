import ImageNotSupportedOutlinedIcon from "@mui/icons-material/ImageNotSupportedOutlined";
import { Box, Card, CardActions, CardContent, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import type { ReactNode, Ref } from "react";
import { useModuleImage } from "../hooks/useModuleImage";
import type { ModuleListItem } from "../types";

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

/**
 * Tarjeta de un modulo del catalogo (spec §6.1). Las acciones las pone quien la usa.
 * Para elegir modulos (asistente, spec §9.2 paso 2): `selected` la marca, la tarjeta se maneja con teclado
 * (aria-pressed) y `hideStatus` oculta las marcas del catalogo (activo, errores, observaciones).
 */
export function ModuleCard({
  module,
  actions,
  onClick,
  selected,
  hideStatus = false,
  buttonRef
}: {
  module: ModuleListItem;
  actions?: ReactNode;
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
        borderRadius: "10px",
        opacity: module.activo ? 1 : 0.78,
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
        sx={{ cursor: onClick ? "pointer" : "default", flex: 1, ...(selectable ? { "&:focus-visible": { outline: "3px solid", outlineColor: "primary.dark", outlineOffset: -3 } } : {}) }}
      >
        <ModuleImage moduloId={module.id} version={module.tieneImagen ? module.imagenActualizada : null} />
        <CardContent sx={{ pb: 1 }}>
          <Typography fontWeight={800} sx={{ lineHeight: 1.2 }}>
            {module.nombre}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {module.categoria.nombre} · {module.piezas} piezas · {module.parametros} medidas
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1, ...(hideStatus ? { display: "none" } : {}) }}>
            <Chip size="small" color={module.activo ? "success" : "default"} label={module.activo ? "Activo" : "Inactivo"} />
            {module.estadoFormulas === "CON_ERRORES" && <Chip size="small" color="error" label="Con errores" />}
            {module.cantidadObservaciones > 0 && (
              <Chip size="small" color="warning" variant="outlined" label={`${module.cantidadObservaciones} ${module.cantidadObservaciones === 1 ? "observacion" : "observaciones"}`} />
            )}
          </Stack>
        </CardContent>
      </Box>
      {actions && <CardActions sx={{ pt: 0, px: 1.5, pb: 1.5, flexWrap: "wrap", gap: 0.5 }}>{actions}</CardActions>}
    </Card>
  );
}
