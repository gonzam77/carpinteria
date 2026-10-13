import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Stack, Tooltip, Typography, useMediaQuery } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { observationsLabel, type ModuleToReview } from "../lib/moduleCatalog";

const AMBER = "#a16807";

/**
 * Las observaciones para revisar del catalogo, en un solo lugar (2026-10-13): cada modulo con su cantidad, sus
 * observaciones (una por renglon) y un boton para abrirlo en el editor. De mas a menos observaciones.
 */
export function ModuleObservationsDialog({ open, onClose, items, onEdit }: { open: boolean; onClose: () => void; items: ModuleToReview[]; onEdit: (moduleId: string) => void }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const total = items.reduce((sum, item) => sum + item.lines.length, 0);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen} aria-labelledby="observaciones-titulo">
      <DialogTitle id="observaciones-titulo" sx={{ pr: 7 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box aria-hidden sx={{ width: 40, height: 40, borderRadius: "11px", display: "grid", placeItems: "center", flexShrink: 0, color: AMBER, bgcolor: alpha(AMBER, 0.12) }}>
            <RateReviewOutlinedIcon />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="span" sx={{ display: "block", fontWeight: 900, fontSize: "1.15rem", lineHeight: 1.25 }}>
              Observaciones para revisar
            </Typography>
            <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block" }}>
              {items.length
                ? `${observationsLabel(total)} en ${items.length} ${items.length === 1 ? "módulo" : "módulos"}. Abrí cada uno, resolvelo y borrá la observación.`
                : "Ningún módulo tiene observaciones."}
            </Typography>
          </Box>
        </Stack>
        <IconButton aria-label="Cerrar" onClick={onClose} sx={{ position: "absolute", right: 12, top: 14 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: "#fbf8f4", p: { xs: 1.5, sm: 2.5 } }}>
        {items.length === 0 ? (
          <Stack alignItems="center" spacing={1} sx={{ py: 5, color: "#24663f" }}>
            <CheckCircleOutlineRoundedIcon sx={{ fontSize: 40 }} />
            <Typography fontWeight={800}>Todo revisado</Typography>
            <Typography variant="body2" color="text.secondary">
              No quedan observaciones pendientes en los módulos que se ven.
            </Typography>
          </Stack>
        ) : (
          <Stack component="ol" spacing={1.5} sx={{ m: 0, p: 0, listStyle: "none" }} aria-label="Módulos con observaciones">
            {items.map(({ module, lines }) => (
              <Box
                component="li"
                key={module.id}
                sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "12px", overflow: "hidden", boxShadow: "0 4px 14px rgba(45, 35, 24, 0.04)" }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: { xs: 1.5, sm: 2 }, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Box
                    aria-hidden
                    sx={{ minWidth: 34, height: 34, px: 0.75, borderRadius: "10px", display: "grid", placeItems: "center", fontWeight: 900, color: AMBER, bgcolor: alpha(AMBER, 0.12), fontVariantNumeric: "tabular-nums" }}
                  >
                    {lines.length}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography fontWeight={800} sx={{ lineHeight: 1.25 }}>
                      {module.nombre}
                      {!module.activo && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1, fontWeight: 700 }}>
                          (inactivo)
                        </Typography>
                      )}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                      {module.categoria.nombre} · {module.codigo} · {observationsLabel(lines.length)}
                    </Typography>
                  </Box>
                  {fullScreen ? (
                    <Tooltip title="Editar el módulo">
                      <IconButton aria-label={`Editar ${module.nombre}`} onClick={() => onEdit(module.id)} sx={{ color: "primary.dark" }}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Button variant="outlined" size="small" startIcon={<EditIcon />} aria-label={`Editar ${module.nombre}`} onClick={() => onEdit(module.id)} sx={{ flexShrink: 0 }}>
                      Editar
                    </Button>
                  )}
                </Stack>
                <Box component="ul" sx={{ m: 0, px: { xs: 1.5, sm: 2 }, py: 1, listStyle: "none" }}>
                  {lines.map((line, index) => (
                    <Box
                      component="li"
                      key={index}
                      sx={{ display: "flex", gap: 1.25, py: 0.6, "& + &": { borderTop: "1px dashed", borderColor: "divider" } }}
                    >
                      <Box aria-hidden sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: alpha(AMBER, 0.7), mt: "0.55em", flexShrink: 0 }} />
                      <Typography variant="body2" sx={{ lineHeight: 1.5, overflowWrap: "anywhere" }}>
                        {line}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
