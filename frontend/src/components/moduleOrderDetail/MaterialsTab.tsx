import { Alert, Box, Chip, Paper, Skeleton, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { saveAs } from "file-saver";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { downloadMaterialsExcel, moduleOrderError } from "../../api/moduleOrders";
import { exportErrorMessage } from "../../lib/moduleOrdersList";
import type { ModuleOrder, OrderMaterialsSummary } from "../../types";
import { PRINT_TARGET, SectionActions } from "./SectionActions";

const mm = (value: number) => `${Number(value.toFixed(2)).toLocaleString("es-AR", { maximumFractionDigits: 2 })} mm`;
const boardSize = (ancho: number | null, alto: number | null) => (ancho && alto ? `${ancho.toLocaleString("es-AR")} × ${alto.toLocaleString("es-AR")} mm` : "-");
const meters = (value: number) => `${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
const head = { fontWeight: 800, whiteSpace: "nowrap" as const, color: "text.secondary", fontSize: "0.75rem", textTransform: "uppercase" as const, letterSpacing: 0.4 };
const num = { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" as const };

/**
 * Pestaña "Materiales" del detalle (punto 5): las placas y los cantos que necesita la solicitud, con el mismo calculo
 * que la constancia y la reserva de stock (GET /api/orders/:id/materiales). Se descarga en Excel o se imprime.
 */
export function MaterialsTab({ order, onError }: { order: ModuleOrder; onError: (message: string) => void }) {
  const [summary, setSummary] = useState<OrderMaterialsSummary | null>(null);
  const [loadError, setLoadError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let current = true;
    setLoadError("");
    api
      .get<OrderMaterialsSummary>(`/orders/${order.id}/materiales`)
      .then((response) => current && setSummary(response.data))
      .catch((error) => current && setLoadError(moduleOrderError(error, "No se pudo calcular el listado de materiales.").message));
    return () => {
      current = false;
    };
  }, [order.id, order.fechaActualizacion]);

  async function download() {
    setDownloading(true);
    try {
      saveAs(await downloadMaterialsExcel(order.id), `materiales-M${order.numero}.xlsx`);
    } catch (error) {
      onError(await exportErrorMessage(error));
    } finally {
      setDownloading(false);
    }
  }

  const faltantes = summary?.placas.filter((placa) => placa.faltantePlacas > 0) ?? [];
  return (
    <Stack spacing={2}>
      <SectionActions
        title="Materiales"
        description="Las placas y los cantos que necesita la solicitud, con el mismo cálculo que la constancia y la reserva de stock."
        download={{ label: "Descargar Excel", busy: downloading, disabled: !summary, onClick: () => void download() }}
      />
      {loadError && <Alert severity="error">{loadError}</Alert>}
      {!summary && !loadError && <Skeleton variant="rounded" height={260} />}
      {summary && (
        <Paper className={PRINT_TARGET} sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "12px" }}>
          <Box className="solo-impresion" sx={{ mb: 2 }}>
            <Typography fontWeight={900} fontSize="16pt">
              Materiales · M-{order.numero}
            </Typography>
            <Typography>{order.cliente}</Typography>
          </Box>
          <Stack spacing={2.5}>
            {summary.origen === "RECALCULADO" && <Alert severity="info">Las placas se calcularon con los valores de hoy: la solicitud no tiene guardado el detalle de su constancia.</Alert>}
            {faltantes.length > 0 && (
              <Alert severity="warning">
                No alcanza el stock de {faltantes.length === 1 ? "una placa" : `${faltantes.length} placas`}: {faltantes.map((placa) => `${placa.nombre.trim()} (faltan ${placa.faltantePlacas})`).join(", ")}.
              </Alert>
            )}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Typography component="h3" fontWeight={800}>
                  Placas
                </Typography>
                <Chip size="small" color="primary" label={`${summary.totalPlacas} ${summary.totalPlacas === 1 ? "placa" : "placas"}`} sx={{ fontWeight: 800 }} />
              </Stack>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" aria-label="Placas">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={head}>Material</TableCell>
                      <TableCell sx={head}>Medida de la placa</TableCell>
                      <TableCell sx={head} align="right">
                        Espesor
                      </TableCell>
                      <TableCell sx={head} align="right">
                        Piezas
                      </TableCell>
                      <TableCell sx={head} align="right">
                        Placas
                      </TableCell>
                      <TableCell sx={head} align="right">
                        Stock
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.placas.map((placa) => (
                      <TableRow key={placa.materialId}>
                        <TableCell sx={{ fontWeight: 600 }}>{placa.nombre.trim()}</TableCell>
                        <TableCell sx={num}>{boardSize(placa.anchoPlaca, placa.altoPlaca)}</TableCell>
                        <TableCell align="right" sx={num}>
                          {mm(placa.espesorMm)}
                        </TableCell>
                        <TableCell align="right" sx={num}>
                          {placa.piezas}
                        </TableCell>
                        <TableCell align="right" sx={{ ...num, fontWeight: 800 }}>
                          {placa.placas}
                        </TableCell>
                        <TableCell align="right" sx={num}>
                          {placa.faltantePlacas > 0 ? <Chip size="small" color="error" label={`Faltan ${placa.faltantePlacas}`} /> : (placa.stockPlacas ?? "-")}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!summary.placas.length && (
                      <TableRow>
                        <TableCell colSpan={6}>La solicitud no tiene placas.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </Box>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Typography component="h3" fontWeight={800}>
                  Cantos
                </Typography>
                <Chip size="small" color="primary" label={meters(summary.totalMetrosCanto)} sx={{ fontWeight: 800 }} />
              </Stack>
              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" aria-label="Cantos">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={head}>Canto</TableCell>
                      <TableCell sx={head} align="right">
                        Espesor
                      </TableCell>
                      <TableCell sx={head} align="right">
                        Metros
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.cantos.map((canto) => (
                      <TableRow key={canto.cantoId}>
                        <TableCell sx={{ fontWeight: 600 }}>{canto.nombre.trim()}</TableCell>
                        <TableCell align="right" sx={num}>
                          {mm(canto.espesorMm)}
                        </TableCell>
                        <TableCell align="right" sx={{ ...num, fontWeight: 800 }}>
                          {meters(canto.metros)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!summary.cantos.length && (
                      <TableRow>
                        <TableCell colSpan={3}>La solicitud no lleva cantos.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </Box>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
