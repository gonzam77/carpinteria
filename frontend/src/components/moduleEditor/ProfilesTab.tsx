import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { Box, Button, FormControlLabel, Paper, Radio, Stack, TextField, Typography } from "@mui/material";
import type { ModuleDraft } from "../../lib/moduleEditor";
import type { ModuleProfile } from "../../types";

export function ProfilesTab({
  draft,
  setPerfiles,
  onAddB,
  onRemoveB,
  onCopyAToB
}: {
  draft: ModuleDraft;
  setPerfiles: (update: (perfiles: ModuleProfile[]) => ModuleProfile[]) => void;
  onAddB: () => void;
  onRemoveB: () => void;
  onCopyAToB: () => void;
}) {
  const perfiles = [...draft.perfiles].sort((a, b) => a.orden - b.orden);
  const cantosPorPerfil = (orden: 1 | 2) => draft.piezas.reduce((total, pieza) => total + pieza.cantos.filter((canto) => canto.perfilOrden === orden).length, 0);
  const patch = (orden: 1 | 2, changes: Partial<ModuleProfile>) =>
    setPerfiles((current) => current.map((perfil) => (perfil.orden === orden ? { ...perfil, ...changes } : perfil)));

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Un módulo puede tener uno o dos juegos de cantos (por ejemplo, "Estandar" con canto en todos los lados vistos y "Economico" solo en los frentes). Al
        cargar la solicitud se elige cuál usar; el predeterminado viene marcado. Los cantos de cada pieza se eligen en la pestaña Despiece y cantos.
      </Typography>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        {perfiles.map((perfil) => (
          <Paper key={perfil.orden} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "10px" }}>
            <Stack spacing={1.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography fontWeight={800}>{perfil.orden === 1 ? "Perfil A" : "Perfil B"}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {cantosPorPerfil(perfil.orden)} lados con canto
                </Typography>
              </Stack>
              <TextField
                size="small"
                label="Nombre"
                value={perfil.nombre}
                onChange={(event) => patch(perfil.orden, { nombre: event.target.value })}
                error={!perfil.nombre.trim()}
                helperText={perfil.nombre.trim() ? " " : "Completá el nombre"}
              />
              <TextField
                size="small"
                label="Descripción"
                value={perfil.descripcion ?? ""}
                onChange={(event) => patch(perfil.orden, { descripcion: event.target.value })}
                multiline
                minRows={2}
              />
              <FormControlLabel
                control={
                  <Radio
                    checked={perfil.predeterminado}
                    onChange={() => setPerfiles((current) => current.map((item) => ({ ...item, predeterminado: item.orden === perfil.orden })))}
                  />
                }
                label="Predeterminado al cargar"
              />
              {perfil.orden === 2 && (
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={onCopyAToB}>
                    Copiar Perfil A a B
                  </Button>
                  <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={onRemoveB}>
                    Quitar Perfil B
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>
        ))}
        {perfiles.length < 2 && (
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", borderStyle: "dashed" }}>
            <Button startIcon={<AddIcon />} onClick={onAddB}>
              Agregar Perfil B
            </Button>
          </Paper>
        )}
      </Box>
    </Stack>
  );
}
