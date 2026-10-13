import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import BorderStyleIcon from "@mui/icons-material/BorderStyle";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import { Box, Button, Chip, FormControlLabel, Paper, Radio, Stack, TextField } from "@mui/material";
import type { ModuleDraft } from "../../lib/moduleEditor";
import type { ModuleProfile } from "../../types";
import { fieldIcon } from "../fieldIcon";
import { SectionHeading } from "../SectionHeading";

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
      <SectionHeading
        icon={<BorderStyleIcon />}
        title="Perfiles de canto"
        subtitle='Un módulo puede tener uno o dos juegos de cantos (por ejemplo, "Estandar" con canto en todos los lados vistos y "Economico" solo en los frentes). Al cargar la solicitud se elige cuál usar; el predeterminado viene marcado. Los cantos de cada pieza se eligen en la pestaña Despiece y cantos.'
      />
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        {perfiles.map((perfil) => (
          <Paper key={perfil.orden} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "10px" }}>
            <Stack spacing={1.5}>
              <SectionHeading
                icon={<BorderStyleIcon />}
                title={perfil.orden === 1 ? "Perfil A" : "Perfil B"}
                variant="subtitle1"
                component="h3"
                action={<Chip size="small" variant="outlined" color="primary" label={`${cantosPorPerfil(perfil.orden)} lados con canto`} sx={{ fontWeight: 700 }} />}
              />
              <TextField
                size="small"
                label="Nombre"
                value={perfil.nombre}
                onChange={(event) => patch(perfil.orden, { nombre: event.target.value })}
                error={!perfil.nombre.trim()}
                helperText={perfil.nombre.trim() ? " " : "Completá el nombre"}
                slotProps={{ input: fieldIcon(<LabelOutlinedIcon />) }}
              />
              <TextField
                size="small"
                label="Descripción"
                value={perfil.descripcion ?? ""}
                onChange={(event) => patch(perfil.orden, { descripcion: event.target.value })}
                multiline
                minRows={2}
                slotProps={{ input: fieldIcon(<DescriptionOutlinedIcon />) }}
                sx={{ "& .MuiInputBase-root": { alignItems: "flex-start" }, "& .MuiInputAdornment-root": { mt: 1 } }}
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
            <Button variant="outlined" startIcon={<AddIcon />} onClick={onAddB}>
              Agregar Perfil B
            </Button>
          </Paper>
        )}
      </Box>
    </Stack>
  );
}
