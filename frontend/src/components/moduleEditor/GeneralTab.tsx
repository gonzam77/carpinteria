import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import UploadIcon from "@mui/icons-material/Upload";
import { Alert, AlertTitle, Box, Button, FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, Typography } from "@mui/material";
import { useRef, useState } from "react";
import { deleteModuleImage, uploadModuleImage, type ModuleImageInfo } from "../../api/moduleImages";
import { formatMm, type ModuleDraft } from "../../lib/moduleEditor";
import type { Material, ModuleCategory, ModulesConfig } from "../../types";
import { ModuleImage } from "../ModuleCard";

export const plateLabel = (material: Pick<Material, "nombre" | "espesorMm" | "activo">) =>
  `${material.nombre.trim()} · ${formatMm(material.espesorMm)} mm${material.activo ? "" : " (inactiva)"}`;

/** Placas para un selector: las activas, mas la elegida aunque este inactiva (para no perderla de vista). */
export function plateOptions(placas: Material[], selectedId: string | null) {
  return placas.filter((material) => material.activo || material.id === selectedId);
}

function ImageSection({ moduleId, imagen, onChanged }: { moduleId: string | null; imagen: ModuleImageInfo | null; onChanged: (imagen: ModuleImageInfo | null) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!moduleId) {
    return (
      <Alert severity="info" variant="outlined">
        Guarda el modulo para poder subirle una imagen.
      </Alert>
    );
  }

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      onChanged(await uploadModuleImage(moduleId!, file));
    } catch (uploadError) {
      const data = (uploadError as { response?: { data?: { message?: string } } })?.response?.data;
      setError(data?.message ?? (uploadError instanceof Error ? uploadError.message : "No se pudo subir la imagen."));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await deleteModuleImage(moduleId!);
      onChanged(null);
    } catch {
      setError("No se pudo quitar la imagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack spacing={1}>
      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden", maxWidth: 360 }}>
        <ModuleImage moduloId={moduleId} version={imagen?.fechaActualizacion ?? null} height={220} />
      </Box>
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" size="small" startIcon={<UploadIcon />} disabled={busy} onClick={() => fileRef.current?.click()}>
          {imagen ? "Reemplazar imagen" : "Subir imagen"}
        </Button>
        {imagen && (
          <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} disabled={busy} onClick={remove}>
            Quitar
          </Button>
        )}
      </Stack>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Typography variant="caption" color="text.secondary">
        JPEG, PNG o WebP. Se achica y comprime antes de subirla (maximo 1 MB). La imagen se guarda en el momento, aparte del resto del modulo.
        {imagen ? ` Actual: ${Math.round(imagen.tamanoBytes / 1024)} KB.` : ""}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

export function GeneralTab({
  draft,
  update,
  categories,
  placas,
  config,
  codeLocked,
  importNotes,
  onCodeEdited,
  moduleId,
  imagen,
  onImageChanged
}: {
  draft: ModuleDraft;
  update: (patch: Partial<ModuleDraft>) => void;
  categories: ModuleCategory[];
  placas: Material[];
  config: ModulesConfig;
  codeLocked: boolean;
  /** Observaciones guardadas del modulo (las de la importacion del Excel, si vino de ahi). */
  importNotes: string | null;
  onCodeEdited: () => void;
  moduleId: string | null;
  imagen: ModuleImageInfo | null;
  onImageChanged: (imagen: ModuleImageInfo | null) => void;
}) {
  const configFondo = placas.find((material) => material.id === config.materialFondoId);
  const notes = (importNotes ?? "").split("\n").filter((line) => line.trim());
  const espesores = [...new Set(placas.filter((material) => material.activo).map((material) => material.espesorMm))].sort((a, b) => a - b);

  return (
    <Stack spacing={2}>
      {notes.length > 0 && (
        <Alert severity="warning">
          <AlertTitle>Revisar al importar</AlertTitle>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {notes.map((note, index) => (
              <li key={index}>{note.replace(/^[-•]\s*/, "")}</li>
            ))}
          </Box>
          <Typography variant="caption" component="p" sx={{ mt: 1 }}>
            Cuando esten revisadas, borralas de "Observaciones" y guarda.
          </Typography>
        </Alert>
      )}
      <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "10px" }}>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
          <TextField label="Nombre" value={draft.nombre} onChange={(event) => update({ nombre: event.target.value })} required />
          <TextField
            label="Codigo"
            value={draft.codigo}
            disabled={codeLocked}
            onChange={(event) => {
              onCodeEdited();
              update({ codigo: event.target.value.toUpperCase().replace(/\s+/g, "_") });
            }}
            helperText={codeLocked ? "Ya se uso en solicitudes: el codigo no se puede cambiar." : "En mayusculas, con _ (ej. BAJO_MESADA_2_PUERTAS)."}
            slotProps={{ htmlInput: { style: { fontFamily: "ui-monospace, Consolas, monospace" } } }}
          />
          <TextField select label="Categoria" value={draft.categoriaId} onChange={(event) => update({ categoriaId: event.target.value })} required>
            {categories
              .filter((category) => category.activo || category.id === draft.categoriaId)
              .map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.nombre}
                  {category.activo ? "" : " (inactiva)"}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            label="Espesor de diseno (mm)"
            type="number"
            value={draft.espesorDisenoMm}
            onChange={(event) => update({ espesorDisenoMm: Number(event.target.value) })}
            helperText={`El espesor con el que estan escritas las formulas (ESP). Al pedir el modulo solo se ofrecen placas de ese espesor${
              espesores.length ? `; hay placas activas de ${espesores.map((espesor) => `${formatMm(espesor)} mm`).join(" / ")}` : ""
            }.`}
            slotProps={{ htmlInput: { min: 1, step: 0.5 } }}
          />
          <TextField
            select
            label="Material de fondo"
            value={draft.materialFondoId ?? ""}
            onChange={(event) => update({ materialFondoId: event.target.value || null })}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            helperText="Para las piezas que van en fondo. Si no elegis uno, se usa el de la configuracion del catalogo."
          >
            <MenuItem value="">Usar el de la configuracion{configFondo ? ` (${configFondo.nombre})` : " (sin configurar)"}</MenuItem>
            {plateOptions(placas, draft.materialFondoId).map((material) => (
              <MenuItem key={material.id} value={material.id}>
                {plateLabel(material)}
              </MenuItem>
            ))}
          </TextField>
          <Stack justifyContent="center">
            <FormControlLabel
              control={<Switch checked={draft.activo} onChange={(event) => update({ activo: event.target.checked })} />}
              label={draft.activo ? "Activo: aparece al cargar solicitudes" : "Inactivo: borrador, no aparece al cargar solicitudes"}
            />
          </Stack>
          <TextField
            label="Descripcion"
            value={draft.descripcion ?? ""}
            onChange={(event) => update({ descripcion: event.target.value })}
            multiline
            minRows={2}
            sx={{ gridColumn: { md: "1 / -1" } }}
          />
          <TextField
            label="Observaciones (internas)"
            value={draft.observaciones ?? ""}
            onChange={(event) => update({ observaciones: event.target.value })}
            multiline
            minRows={3}
            helperText="Notas para el administrador. Una por linea: cada linea cuenta como una observacion pendiente en el catalogo."
            sx={{ gridColumn: { md: "1 / -1" } }}
          />
        </Box>
      </Paper>
      <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "10px" }}>
        <Typography fontWeight={800} gutterBottom>
          Imagen
        </Typography>
        <ImageSection moduleId={moduleId} imagen={imagen} onChanged={onImageChanged} />
      </Paper>
    </Stack>
  );
}
