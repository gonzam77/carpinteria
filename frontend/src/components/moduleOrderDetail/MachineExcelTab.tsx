import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SaveIcon from "@mui/icons-material/Save";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  GlobalStyles,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { saveAs } from "file-saver";
import { useEffect, useMemo, useState } from "react";
import { downloadMachineExcel, getMachineExcel, moduleOrderError, saveMachineExcel } from "../../api/moduleOrders";
import { exportErrorMessage } from "../../lib/moduleOrdersList";
import type { MachineExcel, MachineExcelExtraColumn, Material, ModuleOrder } from "../../types";
import { CutOptimizer } from "../CutOptimizer";
import { PRINT_TARGET, SectionActions } from "./SectionActions";

type Draft = { columnas: MachineExcelExtraColumn[]; celdas: Record<string, Record<string, string>> };

const text = (value: string | number | undefined) => (value === undefined || value === null ? "" : String(value));
const EDITED = "#1f5fbf";

/** Lo guardado como borrador de la pantalla: las celdas cambiadas y los valores de las columnas agregadas. */
function draftFrom(data: MachineExcel): Draft {
  const celdas: Draft["celdas"] = {};
  for (const fila of data.filas) {
    const own: Record<string, string> = {};
    for (const key of fila.ajustadas) own[key] = text(fila.valores[key]);
    for (const column of data.columnasExtra) if (text(fila.valores[column.id])) own[column.id] = text(fila.valores[column.id]);
    if (Object.keys(own).length) celdas[fila.clave] = own;
  }
  return { columnas: data.columnasExtra, celdas };
}

/** El borrador sin celdas iguales a la pieza ni columnas vacias: para saber si hay algo sin guardar. */
function normalized(draft: Draft, data: MachineExcel) {
  const base = new Map(data.filas.map((fila) => [fila.clave, fila.base]));
  const ids = new Set(draft.columnas.map((column) => column.id));
  const celdas: Draft["celdas"] = {};
  for (const [clave, cells] of Object.entries(draft.celdas)) {
    const kept: Record<string, string> = {};
    for (const [key, value] of Object.entries(cells)) {
      if (ids.has(key) ? value.trim() !== "" : value !== text(base.get(clave)?.[key])) kept[key] = value;
    }
    if (Object.keys(kept).length) celdas[clave] = Object.fromEntries(Object.entries(kept).sort());
  }
  return JSON.stringify({ columnas: draft.columnas, celdas: Object.fromEntries(Object.entries(celdas).sort()) });
}

let nextColumn = 0;
const newColumnId = () => `col-${Date.now().toString(36)}-${(nextColumn++).toString(36)}`;

/**
 * Pestaña "Excel de corte" del detalle (punto 5): lo que va a la maquina, fila por fila, como sale en el archivo (el
 * servidor arma las filas con el mismo codigo que la exportacion). Cualquier celda se puede cambiar (doble clic) y se
 * pueden agregar columnas, cuyo contenido va tal cual al Excel. Los cambios se guardan con la solicitud. Si se toca
 * algo que cambia lo que se corta (medidas, cantidad, material, cantos o rotacion), se avisa. Al final, el
 * optimizador (punto 7): el unico lugar de las pantallas de modulos donde esta.
 */
export function MachineExcelTab({
  order,
  materials,
  onSaved,
  onError
}: {
  order: ModuleOrder;
  materials: Material[];
  /** Despues de guardar: el detalle se vuelve a leer (historial). */
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [data, setData] = useState<MachineExcel | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Draft>({ columnas: [], celdas: {} });
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [columnDialog, setColumnDialog] = useState<{ id: string | null; titulo: string } | null>(null);

  useEffect(() => {
    let current = true;
    setLoadError("");
    getMachineExcel(order.id)
      .then((result) => {
        if (!current) return;
        setData(result);
        setDraft(draftFrom(result));
      })
      .catch((error) => current && setLoadError(moduleOrderError(error, "No se pudo cargar el Excel de corte.").message));
    return () => {
      current = false;
    };
  }, [order.id, order.fechaActualizacion]);

  const dirty = useMemo(() => Boolean(data) && normalized(draft, data!) !== normalized(draftFrom(data!), data!), [data, draft]);
  const baseOf = useMemo(() => new Map((data?.filas ?? []).map((fila) => [fila.clave, fila.base])), [data]);
  const valueOf = (clave: string, key: string) => draft.celdas[clave]?.[key] ?? text(baseOf.get(clave)?.[key]);
  const isEdited = (clave: string, key: string) => {
    const value = draft.celdas[clave]?.[key];
    return value !== undefined && value !== text(baseOf.get(clave)?.[key]);
  };
  const machineColumns = (data?.columnas ?? []).filter((column) => !column.extra);
  const criticalKeys = new Set(machineColumns.filter((column) => column.critica).map((column) => column.key));
  // Celdas que cambian lo que se corta, con lo que hay en pantalla (guardado o no).
  const criticalEdits = Object.entries(draft.celdas).reduce((sum, [clave, cells]) => sum + Object.keys(cells).filter((key) => criticalKeys.has(key) && isEdited(clave, key)).length, 0);
  const editedCount = Object.entries(draft.celdas).reduce(
    (sum, [clave, cells]) => sum + Object.keys(cells).filter((key) => !draft.columnas.some((column) => column.id === key) && isEdited(clave, key)).length,
    0
  );

  const setCell = (clave: string, key: string, value: string) =>
    setDraft((current) => ({ ...current, celdas: { ...current.celdas, [clave]: { ...(current.celdas[clave] ?? {}), [key]: value } } }));

  // Las columnas de la grilla: el modulo (solo para ubicarse, no va al Excel), las de la maquina y las agregadas.
  let blank = 0;
  const allColumns = [
    ...machineColumns.map((column) => ({ key: column.key, titulo: column.titulo || `(vacía ${++blank})`, extra: false, critica: column.critica })),
    ...draft.columnas.map((column) => ({ key: column.id, titulo: column.titulo, extra: true, critica: false }))
  ];
  const gridColumns: GridColDef[] = [
    {
      field: "__modulo",
      headerName: "Mód.",
      width: 70,
      editable: false,
      sortable: false,
      renderCell: (params) => <Typography variant="caption" color="text.secondary">{params.value ? `M${params.value}` : "Adic."}</Typography>
    },
    ...allColumns.map(
      (column): GridColDef => ({
        field: column.key,
        headerName: column.titulo,
        editable: true,
        sortable: false,
        minWidth: column.key === "nombre producto" || column.key === "Material" ? 180 : 110,
        flex: column.key === "nombre producto" ? 1 : undefined,
        headerClassName: column.extra ? "excel-columna-agregada" : column.critica ? "excel-columna-critica" : undefined,
        renderCell: (params) => {
          const clave = String(params.id);
          const edited = !column.extra && isEdited(clave, column.key);
          const content = (
            <Box component="span" sx={edited ? { color: EDITED, fontWeight: 800 } : column.extra ? { fontWeight: 600 } : undefined}>
              {params.value as string}
            </Box>
          );
          return edited ? <Tooltip title={`Antes: ${text(baseOf.get(clave)?.[column.key]) || "(vacía)"}`}>{content}</Tooltip> : content;
        }
      })
    )
  ];
  const gridRows = (data?.filas ?? []).map((fila) => ({
    id: fila.clave,
    __modulo: fila.posicionModulo,
    ...Object.fromEntries(allColumns.map((column) => [column.key, valueOf(fila.clave, column.key)]))
  }));

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const saved = await saveMachineExcel(order.id, draft);
      setData(saved);
      setDraft(draftFrom(saved));
      onSaved("Excel de corte guardado.");
    } catch (error) {
      const failure = moduleOrderError(error, "No se pudo guardar el Excel de corte.", true);
      onError([failure.message, ...failure.items].join(" "));
    } finally {
      setSaving(false);
    }
  }

  async function download() {
    setDownloading(true);
    try {
      saveAs(await downloadMachineExcel(order.id), `pedido-M${order.numero}.xlsx`);
    } catch (error) {
      // El error llega como archivo (blob): exportErrorMessage lo lee.
      onError(await exportErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  }

  function saveColumn() {
    if (!columnDialog) return;
    const titulo = columnDialog.titulo.trim();
    if (!titulo) return;
    setDraft((current) => ({
      ...current,
      columnas: columnDialog.id
        ? current.columnas.map((column) => (column.id === columnDialog.id ? { ...column, titulo } : column))
        : [...current.columnas, { id: newColumnId(), titulo }]
    }));
    setColumnDialog(null);
  }
  const columnProblem = (() => {
    if (!columnDialog) return "";
    const titulo = columnDialog.titulo.trim().toLowerCase();
    if (!titulo) return "Poné el título de la columna.";
    if (machineColumns.some((column) => column.titulo.toLowerCase() === titulo)) return "Ya es una columna del Excel: usá otro título.";
    if (draft.columnas.some((column) => column.id !== columnDialog.id && column.titulo.toLowerCase() === titulo)) return "Ya hay una columna con ese título.";
    return "";
  })();

  return (
    <Stack spacing={2}>
      {/* El Excel es ancho: en papel va apaisado. */}
      <GlobalStyles styles={{ "@media print": { "@page": { size: "A4 landscape", margin: "8mm" } } }} />
      <SectionActions
        title="Excel para la máquina de corte"
        description="Lo que va a la máquina, fila por fila. Doble clic en una celda para cambiarla; los cambios y las columnas agregadas se guardan con la solicitud y salen en el Excel."
        extra={
          <>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setColumnDialog({ id: null, titulo: "" })} disabled={!data || draft.columnas.length >= 20}>
              Agregar columna
            </Button>
          </>
        }
        download={{
          label: "Descargar Excel",
          busy: downloading,
          disabled: !data || dirty,
          disabledReason: dirty ? "Guardá los cambios para descargarlos." : undefined,
          onClick: () => void download()
        }}
      />
      {loadError && <Alert severity="error">{loadError}</Alert>}
      {!data && !loadError && <Skeleton variant="rounded" height={420} />}
      {data && (
        <>
          {criticalEdits > 0 && (
            <Alert severity="warning" className="no-imprimir">
              {criticalEdits === 1 ? "Hay 1 celda cambiada" : `Hay ${criticalEdits} celdas cambiadas`} en medidas, cantidades, material, cantos o rotación: el Excel ya no coincide con el presupuesto, el
              plano ni la reserva de stock. Para que coincidan, cambiá las piezas con Editar.
            </Alert>
          )}
          <Paper className="no-imprimir" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: "12px" }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
                <Chip size="small" label={`${data.filas.length} filas`} />
                <Chip size="small" color={editedCount ? "info" : "default"} variant={editedCount ? "filled" : "outlined"} label={`${editedCount} ${editedCount === 1 ? "celda cambiada" : "celdas cambiadas"}`} />
                {draft.columnas.map((column) => (
                  <Chip
                    key={column.id}
                    size="small"
                    color="secondary"
                    label={column.titulo}
                    onClick={() => setColumnDialog({ id: column.id, titulo: column.titulo })}
                    icon={<EditOutlinedIcon />}
                    onDelete={() =>
                      setDraft((current) => ({
                        columnas: current.columnas.filter((item) => item.id !== column.id),
                        celdas: Object.fromEntries(Object.entries(current.celdas).map(([clave, cells]) => [clave, Object.fromEntries(Object.entries(cells).filter(([key]) => key !== column.id))]))
                      }))
                    }
                    deleteIcon={
                      <Tooltip title={`Quitar la columna ${column.titulo}`}>
                        <CloseIcon aria-label={`Quitar la columna ${column.titulo}`} />
                      </Tooltip>
                    }
                  />
                ))}
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button size="small" startIcon={<RestartAltIcon />} onClick={() => setDraft({ columnas: [], celdas: {} })} disabled={!editedCount && !draft.columnas.length}>
                  Restaurar todo
                </Button>
                {dirty && (
                  <Button size="small" onClick={() => setDraft(draftFrom(data))}>
                    Descartar
                  </Button>
                )}
                <Button size="small" variant="contained" startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />} onClick={() => void save()} disabled={!dirty || saving}>
                  Guardar cambios
                </Button>
              </Stack>
            </Stack>
            <Box component="section" aria-label="Excel de corte" sx={{ height: { xs: 460, md: 560 }, "& .excel-columna-agregada": { bgcolor: "secondary.light" }, "& .excel-columna-critica": { fontStyle: "italic" } }}>
              <DataGrid
                rows={gridRows}
                columns={gridColumns}
                density="compact"
                disableColumnMenu
                // Son unas 20 columnas: se dibujan todas (las filas si se dibujan de a poco).
                columnBufferPx={4000}
                disableRowSelectionOnClick
                hideFooterSelectedRowCount
                processRowUpdate={(next, previous) => {
                  const clave = String(next.id);
                  for (const column of allColumns) {
                    if (text(next[column.key]) !== text(previous[column.key])) setCell(clave, column.key, text(next[column.key]));
                  }
                  return next;
                }}
                onProcessRowUpdateError={() => onError("No se pudo cambiar la celda.")}
                initialState={{ pagination: { paginationModel: { pageSize: 100 } } }}
                pageSizeOptions={[50, 100]}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
              En azul, lo cambiado a mano (pasá el mouse para ver el valor original). Los títulos en cursiva cambian lo que se corta.
            </Typography>
          </Paper>

          {/* En papel: todas las filas (la grilla de la pantalla solo dibuja las que se ven). */}
          <Box className={`${PRINT_TARGET} solo-impresion`} sx={{ fontSize: "7.5pt" }}>
            <Typography fontWeight={900} fontSize="13pt" sx={{ mb: 1 }}>
              Excel de corte · M-{order.numero} · {order.cliente}
            </Typography>
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", "& th, & td": { border: "1px solid #000", p: "1px 3px", textAlign: "left" } }}>
              <thead>
                <tr>
                  {allColumns.map((column) => (
                    <th key={column.key}>{column.extra || !column.titulo.startsWith("(vacía") ? column.titulo : ""}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.filas.map((fila) => (
                  <tr key={fila.clave}>
                    {allColumns.map((column) => (
                      <td key={column.key}>{valueOf(fila.clave, column.key)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>

          {/* Punto 7: el optimizador va solo aca, al final del Excel. */}
          <Paper component="section" aria-label="Optimizar cortes" className="no-imprimir" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: "12px" }}>
            <Typography component="h3" variant="h6" fontWeight={800}>
              Optimizar cortes
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              El plano se arma con las piezas de la solicitud: los cambios hechos a mano en este Excel no lo cambian.
            </Typography>
            <CutOptimizer rows={order.detalles} materials={materials} />
          </Paper>
        </>
      )}

      <Dialog open={Boolean(columnDialog)} onClose={() => setColumnDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>{columnDialog?.id ? "Renombrar la columna" : "Agregar una columna"}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Va al final del Excel. Lo que escribas en sus celdas sale tal cual en el archivo.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Título de la columna"
            value={columnDialog?.titulo ?? ""}
            onChange={(event) => setColumnDialog((current) => (current ? { ...current, titulo: event.target.value } : current))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !columnProblem) saveColumn();
            }}
            error={Boolean(columnDialog?.titulo.trim()) && Boolean(columnProblem)}
            helperText={columnDialog?.titulo.trim() ? columnProblem || " " : "Por ejemplo: Caja, Pallet, Observación"}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setColumnDialog(null)}>Cancelar</Button>
          <Button variant="contained" onClick={saveColumn} disabled={Boolean(columnProblem)}>
            {columnDialog?.id ? "Renombrar" : "Agregar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
