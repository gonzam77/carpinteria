import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import { getModule } from "../api/catalog";
import { applyModuleRecalc, moduleOrderError, previewModuleRecalc } from "../api/moduleOrders";
import { UnitCard } from "./moduleOrderWizard/UnitsStep";
import type { RoundingMode } from "../lib/moduleFormula";
import { unitFromOrderModule } from "../lib/moduleOrderDetail";
import { activePlates, linePayload, validateUnit, type WizardUnit } from "../lib/moduleOrderWizard";
import type { Material, ModuleDefinition, ModuleOrder, ModuleRecalcPreview, ModulesConfig } from "../types";

const money = (value: number) => value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

/**
 * "Cambiar medidas o colores" de un modulo de la solicitud (spec §10.6): la tarjeta del asistente con lo guardado,
 * la vista previa de las piezas nuevas con el aviso de lo que se pierde, y Recalcular. Usa la definicion de hoy del
 * catalogo; el servidor recalcula el pedido entero (DECISIONES R4).
 */
export function RecalcModuleDialog({
  order,
  modulo,
  materials,
  config,
  onClose,
  onDone
}: {
  order: ModuleOrder;
  modulo: ModuleOrder["modulos"][number] | null;
  materials: Material[];
  config: ModulesConfig | null;
  onClose: () => void;
  onDone: (order: ModuleOrder) => void;
}) {
  const [definition, setDefinition] = useState<ModuleDefinition | null>(null);
  const [unit, setUnit] = useState<WizardUnit | null>(null);
  const [loadError, setLoadError] = useState("");
  const [preview, setPreview] = useState<ModuleRecalcPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; items: string[] } | null>(null);
  const request = useRef<AbortController | null>(null);
  const open = Boolean(modulo);

  useEffect(() => {
    setDefinition(null);
    setUnit(null);
    setPreview(null);
    setError(null);
    setLoadError("");
    if (!modulo?.moduloId) return;
    let current = true;
    getModule(modulo.moduloId)
      .then((loaded) => {
        if (!current) return;
        setDefinition(loaded);
        setUnit(unitFromOrderModule(modulo, loaded));
      })
      .catch((failure) => current && setLoadError(moduleOrderError(failure, "No se pudo cargar el módulo del catálogo.").message));
    return () => {
      current = false;
      request.current?.abort();
    };
  }, [modulo]);

  const redondeo = (config?.redondeo ?? "REDONDEAR") as RoundingMode;
  const context = useMemo(() => ({ activePlateIds: new Set(activePlates(materials).map((material) => material.id)), configFondoId: config?.materialFondoId ?? null }), [config, materials]);
  const validation = useMemo(() => (unit && definition ? validateUnit(unit, definition, redondeo, context) : undefined), [context, definition, redondeo, unit]);
  const fondoName = (id: string | null | undefined) => (id ? (materials.find((material) => material.id === id)?.nombre.trim() ?? "inactivo: elegí otro") : "sin configurar");

  function change(patch: Partial<WizardUnit>) {
    // Cualquier cambio deja vieja la vista previa: hay que volver a calcular antes de recalcular.
    request.current?.abort();
    setPreview(null);
    setError(null);
    setUnit((currentUnit) => (currentUnit ? { ...currentUnit, ...patch } : currentUnit));
  }

  async function calculate() {
    if (!unit || !definition || !modulo) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPreviewing(true);
    setError(null);
    try {
      setPreview(await previewModuleRecalc(order.id, modulo.id, linePayload(unit, definition), { signal: controller.signal }));
    } catch (failure) {
      if (!controller.signal.aborted) setError(moduleOrderError(failure, "No se pudo calcular cómo queda el módulo."));
    } finally {
      if (request.current === controller) setPreviewing(false);
    }
  }

  async function apply() {
    if (!unit || !definition || !modulo || !preview) return;
    setSaving(true);
    setError(null);
    try {
      onDone(await applyModuleRecalc(order.id, modulo.id, { ...linePayload(unit, definition, preview.version), fechaActualizacion: order.fechaActualizacion }));
    } catch (failure) {
      setError(moduleOrderError(failure, "No se pudo recalcular el módulo.", true));
    } finally {
      setSaving(false);
    }
  }

  const busy = previewing || saving;
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="md" aria-labelledby="recalcular-titulo">
      <DialogTitle id="recalcular-titulo">
        Cambiar medidas o colores · Módulo {modulo?.posicion} · {modulo?.nombreModulo}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Se calcula con la definición de hoy del catálogo. Las piezas de este módulo se reemplazan; los otros módulos y las piezas adicionales no cambian.
          </Typography>
          {loadError && <Alert severity="error">{loadError}</Alert>}
          {!unit && !loadError && (
            <Stack alignItems="center" sx={{ py: 4 }}>
              <CircularProgress aria-label="Cargando el módulo" />
            </Stack>
          )}
          {unit && definition && (
            <UnitCard
              index={(modulo?.posicion ?? 1) - 1}
              unit={unit}
              definition={definition}
              validation={validation}
              materials={materials}
              catalogFondoName={fondoName(definition.materialFondoId ?? config?.materialFondoId)}
              sameModelCount={0}
              showCopy={false}
              onChange={change}
              onCopyMeasures={() => undefined}
            />
          )}
          {error && (
            <Alert severity="error">
              {error.message}
              {error.items.length > 0 && (
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {error.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </Box>
              )}
            </Alert>
          )}
          {preview && (
            <Stack spacing={1.5} aria-label="Cómo queda el módulo">
              <Alert severity="warning">
                Se van a reemplazar las {preview.piezasAntes} piezas de este módulo por {preview.detalles.length}.
                {preview.cambiosManuales > 0
                  ? ` Se pierden los cambios manuales de este módulo (${preview.cambiosManuales} ${preview.cambiosManuales === 1 ? "pieza editada o agregada" : "piezas editadas o agregadas"}).`
                  : " Este módulo no tiene cambios manuales."}
              </Alert>
              {preview.cantosSinElegir.length > 0 && (
                <Alert severity="info">
                  {preview.cantosSinElegir.length === 1 ? "Un lado va sin canto" : `${preview.cantosSinElegir.length} lados van sin canto`} porque la placa no tiene canto de su color. Se puede elegir desde Editar.
                </Alert>
              )}
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" aria-label="Piezas nuevas">
                  <TableHead>
                    <TableRow>
                      <TableCell>Pieza</TableCell>
                      <TableCell>Material</TableCell>
                      <TableCell align="right">Largo</TableCell>
                      <TableCell align="right">Ancho</TableCell>
                      <TableCell align="right">Cant.</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.detalles.map((row, index) => (
                      <TableRow key={`${row.piezaCodigo}-${index}`}>
                        <TableCell>{row.nombreProducto}</TableCell>
                        <TableCell>{row.material.trim()}</TableCell>
                        <TableCell align="right">{row.largo}</TableCell>
                        <TableCell align="right">{row.ancho}</TableCell>
                        <TableCell align="right">{row.cantidad}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              <Typography variant="body2" aria-label="Pedido entero, antes y después">
                Pedido entero: {preview.antes.placasEstimadas} → {preview.despues.placasEstimadas} placas · {money(preview.antes.presupuestoConHerrajes)} → {money(preview.despues.presupuestoConHerrajes)}
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        {preview ? (
          <Button variant="contained" color="warning" onClick={() => void apply()} disabled={busy}>
            {saving ? "Recalculando..." : "Recalcular el módulo"}
          </Button>
        ) : (
          <Button variant="contained" onClick={() => void calculate()} disabled={busy || !unit || !validation?.ok}>
            {previewing ? "Calculando..." : "Ver cómo queda"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
