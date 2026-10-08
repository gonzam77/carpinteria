// Clientes de solicitudes de modulos anteriores, para autocompletar el paso 1 del asistente (spec §9.2, mejora
// opcional de F7.2). Sin base: el servicio trae las solicitudes que coinciden y aca se sacan los repetidos.

export type ClientSuggestion = {
  cliente: string;
  numeroContacto: string;
  emailContacto: string | null;
  direccionEntrega: string | null;
};

const key = (client: ClientSuggestion) => `${client.cliente.trim().toLocaleLowerCase("es")}|${client.numeroContacto.replace(/\D/g, "")}`;

/** Un cliente por nombre y telefono, con los datos de su solicitud mas reciente (las filas vienen de la mas nueva). */
export function uniqueClients(rows: ClientSuggestion[], limit = 8) {
  const seen = new Map<string, ClientSuggestion>();
  for (const row of rows) {
    const client = { ...row, cliente: row.cliente.trim(), numeroContacto: row.numeroContacto.trim() };
    const current = seen.get(key(client));
    if (!current) seen.set(key(client), client);
    else {
      // La mas reciente manda; lo que le falte (email, direccion) se toma de una anterior.
      current.emailContacto ??= client.emailContacto;
      current.direccionEntrega ??= client.direccionEntrega;
    }
  }
  return [...seen.values()].slice(0, limit);
}
