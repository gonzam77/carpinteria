import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FormatPaintIcon from "@mui/icons-material/FormatPaint";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useId, useMemo } from "react";
import type { RoundingMode } from "../../lib/moduleFormula";
import {
  activePlates,
  designPlates,
  hasBackPieces,
  validateUnit,
  type DefaultColors,
  type UnitCheckContext,
  type UnitValidation,
  type WizardUnit
} from "../../lib/moduleOrderWizard";
import type { Material, ModuleDefinition } from "../../types";
import { ModuleImage } from "../ModuleCard";
import { EDITED_BLUE } from "../PieceEdgesToggles";

const mmText = (value: number) => value.toLocaleString("es-AR", { useGrouping: false, maximumFractionDigits: 2 });
const plateLabel = (material: Material) => `${material.nombre.trim()} · ${mmText(material.espesorMm)} mm`;

/**
 * Valida todas las tarjetas con el motor compartido (lo usa tambien la pagina para no dejar avanzar). Con el contexto
 * revisa tambien los materiales como el servidor: cantos del color, fondo y materiales fijos (UnitCheckContext).
 */
export function useUnitValidations(units: WizardUnit[], definitions: Map<string, ModuleDefinition>, redondeo: RoundingMode, context: UnitCheckContext) {
  return useMemo(() => {
    const result = new Map<string, UnitValidation>();
    for (const unit of units) {
      const definition = definitions.get(unit.moduloId);
      if (definition) result.set(unit.uid, validateUnit(unit, definition, redondeo, context));
    }
    return result;
  }, [units, definitions, redondeo, context]);
}

function DefaultColorsBar({
  defaults,
  onChange,
  onApply,
  materials,
  espesores
}: {
  defaults: DefaultColors;
  onChange: (patch: Partial<DefaultColors>) => void;
  onApply: () => void;
  materials: Material[];
  espesores: number[];
}) {
  // Esqueleto y frentes: las placas de los espesores de diseno de los modulos elegidos (spec §8.6).
  const design = espesores.flatMap((espesor) => designPlates(materials, espesor));
  return (
    <Paper sx={{ p: 2, borderRadius: "10px" }}>
      <Typography component="h2" fontWeight={800} fontSize="1rem" gutterBottom>
        Colores por defecto
      </Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
        <TextField select size="small" label="Esqueleto" value={defaults.colorEsqueletoId} onChange={(event) => onChange({ colorEsqueletoId: event.target.value })} sx={{ flex: 1 }}>
          {design.map((material) => (
            <MenuItem key={material.id} value={material.id}>
              {plateLabel(material)}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Frentes" value={defaults.colorFrentesId} onChange={(event) => onChange({ colorFrentesId: event.target.value })} sx={{ flex: 1 }}>
          {design.map((material) => (
            <MenuItem key={material.id} value={material.id}>
              {plateLabel(material)}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="outlined" startIcon={<FormatPaintIcon />} onClick={onApply} sx={{ flexShrink: 0, width: { xs: "100%", md: "auto" } }}>
          Aplicar a todos
        </Button>
      </Stack>
    </Paper>
  );
}

/** La tarjeta de un modulo: la usan el paso 3 del asistente y el dialogo de recalcular (spec §10.6). */
export function UnitCard({
  index,
  unit,
  definition,
  validation,
  materials,
  catalogFondoName,
  sameModelCount,
  showCopy,
  onChange,
  onCopyMeasures
}: {
  index: number;
  unit: WizardUnit;
  definition: ModuleDefinition;
  validation: UnitValidation | undefined;
  materials: Material[];
  catalogFondoName: string;
  sameModelCount: number;
  showCopy: boolean;
  onChange: (patch: Partial<WizardUnit>) => void;
  onCopyMeasures: () => void;
}) {
  const design = designPlates(materials, definition.espesorDisenoMm);
  const plates = activePlates(materials);
  const editados = Object.keys(unit.cantosOverride).length;
  const pedibles = definition.parametros.filter((param) => param.tipo !== "CALCULADO");
  const hasErrors = Boolean(validation && !validation.ok);
  const titleId = useId();

  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby={titleId}
      data-modulo={index + 1}
      sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: "10px", borderLeftWidth: 4, borderLeftColor: hasErrors ? "error.main" : "primary.main" }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ width: 72, flexShrink: 0, border: "1px solid", borderColor: "divider", borderRadius: "8px", overflow: "hidden" }}>
            <ModuleImage moduloId={definition.id} version={definition.imagen?.fechaActualizacion ?? null} height={64} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography id={titleId} component="h3" fontWeight={800} fontSize="1rem" sx={{ lineHeight: 1.2 }}>
              Módulo {index + 1} · {definition.nombre}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {definition.categoria.nombre}
            </Typography>
          </Box>
          <Chip size="small" color={hasErrors ? "error" : "primary"} variant={hasErrors ? "filled" : "outlined"} label={hasErrors ? "Revisar" : "Listo"} />
        </Stack>

        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
          {pedibles.map((param) => {
            const clave = param.clave.toUpperCase();
            const errors = validation?.porMedida[clave] ?? [];
            const rango = [param.minimo !== null ? `mín ${mmText(param.minimo)}` : "", param.maximo !== null ? `máx ${mmText(param.maximo)}` : ""].filter(Boolean).join(" · ");
            const helper = errors.length ? errors.join(". ") : [rango, param.ayuda ?? ""].filter(Boolean).join(" · ") || " ";
            return param.tipo === "OPCION" ? (
              <TextField
                key={param.clave}
                select
                size="small"
                label={param.etiqueta}
                value={unit.valores[clave] ?? ""}
                onChange={(event) => onChange({ valores: { ...unit.valores, [clave]: event.target.value } })}
                error={errors.length > 0}
                helperText={helper}
              >
                {(param.opciones ?? []).map((option) => (
                  <MenuItem key={option.valor} value={String(option.valor)}>
                    {option.etiqueta}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                key={param.clave}
                size="small"
                label={`${param.etiqueta}${param.tipo === "MEDIDA" ? " (mm)" : ""}`}
                value={unit.valores[clave] ?? ""}
                onChange={(event) => onChange({ valores: { ...unit.valores, [clave]: event.target.value } })}
                error={errors.length > 0}
                helperText={helper}
                slotProps={{ htmlInput: { inputMode: "decimal", style: { textAlign: "right", fontVariantNumeric: "tabular-nums" } } }}
              />
            );
          })}
        </Box>

        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
          <TextField
            select
            size="small"
            label="Esqueleto"
            value={unit.colorEsqueletoId}
            onChange={(event) => onChange({ colorEsqueletoId: event.target.value })}
            error={!unit.colorEsqueletoId}
            helperText={!design.length ? `No hay placas de ${mmText(definition.espesorDisenoMm)} mm activas: cargalas en Materiales` : unit.colorEsqueletoId ? " " : "Elegí un color"}
          >
            {design.map((material) => (
              <MenuItem key={material.id} value={material.id}>
                {plateLabel(material)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Frentes"
            value={unit.colorFrentesId}
            onChange={(event) => onChange({ colorFrentesId: event.target.value })}
            error={!unit.colorFrentesId}
            helperText={!design.length ? `No hay placas de ${mmText(definition.espesorDisenoMm)} mm activas: cargalas en Materiales` : unit.colorFrentesId ? " " : "Elegí un color"}
          >
            {design.map((material) => (
              <MenuItem key={material.id} value={material.id}>
                {plateLabel(material)}
              </MenuItem>
            ))}
          </TextField>
          {hasBackPieces(definition) && (
            <TextField
              select
              size="small"
              label="Material de fondo"
              value={unit.materialFondoId ?? ""}
              onChange={(event) => onChange({ materialFondoId: event.target.value || null })}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              error={Boolean(validation?.fondo)}
              helperText={validation?.fondo ? `Elegí un fondo: ${validation.fondo}` : unit.materialFondoId ? "Elegido para este módulo" : " "}
            >
              <MenuItem value="">El del catálogo ({catalogFondoName})</MenuItem>
              {plates.map((material) => (
                <MenuItem key={material.id} value={material.id}>
                  {plateLabel(material)}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 112 }}>
            Perfil de cantos
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={unit.perfilCantoOrden}
            onChange={(_, value: 1 | 2 | null) => value && onChange({ perfilCantoOrden: value })}
            aria-label="Perfil de cantos"
          >
            {definition.perfiles.map((perfil) => (
              <ToggleButton key={perfil.orden} value={perfil.orden} sx={{ textTransform: "none", px: 2 }} title={perfil.descripcion ?? perfil.nombre}>
                {perfil.nombre}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {editados > 0 && (
            <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap flexWrap="wrap">
              <Chip size="small" variant="outlined" label={`${editados} ${editados === 1 ? "pieza" : "piezas"} con cantos cambiados`} sx={{ borderColor: EDITED_BLUE, color: EDITED_BLUE }} />
              <Button size="small" startIcon={<RestartAltIcon />} onClick={() => onChange({ cantosOverride: {} })} sx={{ color: EDITED_BLUE }}>
                Volver todas a los cantos por defecto
              </Button>
            </Stack>
          )}
        </Stack>

        <TextField
          size="small"
          label="Observaciones del módulo"
          placeholder="Salen en la hoja de taller"
          value={unit.observaciones}
          onChange={(event) => onChange({ observaciones: event.target.value })}
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />

        {validation && validation.generales.length > 0 && (
          <Alert severity="error" sx={{ py: 0 }}>
            {validation.generales.join(" · ")}
          </Alert>
        )}
        {showCopy && (
          <Button size="small" startIcon={<ContentCopyIcon />} onClick={onCopyMeasures} sx={{ alignSelf: "flex-start" }}>
            {sameModelCount === 1 ? "Copiar medidas al otro igual" : `Copiar medidas a los ${sameModelCount} iguales`}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

/** Paso 3 (spec §9.2): una tarjeta por unidad, con medidas, colores, perfil, fondo y observaciones. */
export function UnitsStep({
  units,
  definitions,
  validations,
  materials,
  configFondoId,
  defaults,
  onDefaultsChange,
  onApplyDefaults,
  onUnitChange,
  onCopyMeasures
}: {
  units: WizardUnit[];
  definitions: Map<string, ModuleDefinition>;
  validations: Map<string, UnitValidation>;
  materials: Material[];
  /** Espesores de canto activos por color (edgeThicknessesByColor). */
  configFondoId: string | null;
  defaults: DefaultColors;
  onDefaultsChange: (patch: Partial<DefaultColors>) => void;
  onApplyDefaults: () => void;
  onUnitChange: (uid: string, patch: Partial<WizardUnit>) => void;
  onCopyMeasures: (uid: string) => void;
}) {
  const espesores = [...new Set(units.map((unit) => definitions.get(unit.moduloId)?.espesorDisenoMm).filter((value): value is number => value !== undefined))].sort((a, b) => a - b);
  // La lista solo trae placas activas: un fondo configurado que no esta en ella esta inactivo o se borro.
  const fondoLabel = (id: string | null) => {
    if (!id) return "sin configurar";
    return materials.find((material) => material.id === id)?.nombre.trim() ?? "inactivo: elegí otro";
  };
  const conErrores = units.filter((unit) => validations.get(unit.uid) && !validations.get(unit.uid)!.ok).length;

  return (
    <Stack spacing={2}>
      <DefaultColorsBar defaults={defaults} onChange={onDefaultsChange} onApply={onApplyDefaults} materials={materials} espesores={espesores} />
      {conErrores > 0 && (
        <Alert severity="warning">
          {conErrores === 1 ? "Hay 1 módulo para revisar." : `Hay ${conErrores} módulos para revisar.`} Los datos que faltan o no sirven están marcados en rojo.
        </Alert>
      )}
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" } }}>
        {units.map((unit, index) => {
          const definition = definitions.get(unit.moduloId);
          if (!definition) return null;
          const sameModel = units.filter((item) => item.moduloId === unit.moduloId);
          return (
            <UnitCard
              key={unit.uid}
              index={index}
              unit={unit}
              definition={definition}
              validation={validations.get(unit.uid)}
              materials={materials}
              catalogFondoName={fondoLabel(definition.materialFondoId ?? configFondoId)}
              sameModelCount={sameModel.length - 1}
              showCopy={sameModel.length > 1 && sameModel[0].uid === unit.uid}
              onChange={(patch) => onUnitChange(unit.uid, patch)}
              onCopyMeasures={() => onCopyMeasures(unit.uid)}
            />
          );
        })}
      </Box>
    </Stack>
  );
}
