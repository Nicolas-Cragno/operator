import { apiGet, extractRows } from "./api.service";
import appConfig from "../config/app.config";

async function readPages(path, params, isActive) {
  const rows = [];
  const cursors = new Set();
  let cursor;
  do {
    const body = await apiGet(path, { ...params, limit: 200, cursor });
    if (!isActive()) return [];
    rows.push(...extractRows(body));
    cursor = body.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error("El servidor repitió el cursor de paginación");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return rows;
}

export async function loadCatalog(entry, variant, isActive = () => true, query = {}) {
  const path = variant.path || entry.path;
  if (entry.params?.documentos === "1") {
    const response = await apiGet(path, { ...entry.params, ...query, limit: 50 }, { "X-Cantapp-Operator": "1", "X-Cantapp-App-Id": appConfig.appId });
    if (response.completeFilters !== true || !Number.isInteger(response.total)) throw new Error("El backend no tiene habilitada la consulta documental completa");
    return { rows: await enrichOperationalRows(extractRows(response)), total: response.total };
  }
  if (entry.serverEntity) {
    const endpoint = `/api/v1/apps/${encodeURIComponent(appConfig.appId)}/records/${encodeURIComponent(entry.serverEntity)}`;
    let response;
    try { response = await apiGet(endpoint, { ...entry.serverParams, ...query, limit: 50 }); }
    catch (error) {
      if (error.status === 404) error.message = `${error.message} · GET ${endpoint}. Esta ruta requiere la versión actual de cantapp-back publicada en el servidor.`;
      throw error;
    }
    if (!Number.isInteger(response.total) && !response.pagination) throw new Error("El servidor no tiene habilitada la consulta cronológica paginada");
    return { rows: extractRows(response), total: response.total, pagination: response.pagination };
  }
  let rows = entry.paginated
    ? await readPages(path, entry.params, isActive)
    : extractRows(await apiGet(path, { limit: 100, ...entry.params }));
  if (entry.selectRows) rows = entry.selectRows(rows);
  if ((["/asignaciones", "/eventos/tractores", "/eventos/furgones"].includes(path) || entry.id === "llaves") && isActive()) return enrichOperationalRows(rows);
  return rows;
}

// Labels are presentation data. The original IDs/lines remain intact for editing.
export async function enrichOperationalRows(rows) {
  const sources = { persona: "personas", operador: "personas", mecanico: "personas", chofer: "personas", tractor: "tractores", furgon: "furgones", deposito: "depositos", proveedor: "proveedores", sucursal: "ubicaciones", ingresos: "stock", repuestos: "stock" };
  const needed = [...new Set(Object.entries(sources).filter(([field]) => rows.some(row => row[field] != null)).map(([, source]) => source))];
  const maps = Object.fromEntries(await Promise.all(needed.map(async source => {
    try {
      const records = ["personas", "tractores", "furgones", "stock"].includes(source)
        ? await readPages(`/${source}/consulta`, {}, () => true) : extractRows(await apiGet(`/${source}`));
      const map = new Map(records.map(row => [String(row.id), row]));
      if (source === "personas") for (const row of records) if (row.dni != null) map.set(String(row.dni), row);
      return [source, map];
    } catch { return [source, new Map()]; } // Missing labels never invalidate a confirmed save.
  })));
  const label = (source, id) => {
    const row = maps[source]?.get(String(id));
    if (!row) return String(id);
    const name = source === "personas" ? [row.apellido, row.nombres || row.nombre].filter(Boolean).join(", ") : row.nombre || row.descripcion || row.dominio;
    return name ? `${name} (${id})` : String(id);
  };
  const names = { persona: "nombrePersona", operador: "nombreOperador", mecanico: "nombreMecanico", chofer: "nombreChofer", tractor: "tractorFull", furgon: "furgonFull", deposito: "depositoFull", proveedor: "nombreProveedor", sucursal: "nombreSucursal" };
  return rows.map(record => {
    const result = { ...record };
    const document = ["REMITO", "FACTURA"].includes(record.tipo);
    if (document) {
      result.numeroDocumento = record[record.tipo === "REMITO" ? "remito" : "factura"] || "";
      result.movimientoEtiqueta = record.movimientoStock || "Movimiento no declarado";
      const currency = String(record.moneda || "").toLowerCase();
      result.monedaEtiqueta = ["dolares", "usd"].includes(currency) ? "USD" : ["pesos", "ars"].includes(currency) ? "ARS" : record.moneda || "Moneda no declarada";
    }
    for (const [field, source] of Object.entries(sources)) {
      if (record[field] == null) continue;
      const values = (Array.isArray(record[field]) ? record[field] : [record[field]]).filter(value => value !== "");
      if (["ingresos", "repuestos"].includes(field)) {
        result[`${field}Full`] = values.map(item => {
          const line = item && typeof item === "object" && !Array.isArray(item) ? item : null;
          const id = line ? line.id ?? line.repuesto ?? line.codigo : ["string", "number"].includes(typeof item) ? item : null;
          if (id == null) return "Artículo sin referencia";
          const stock = maps.stock?.get(String(id));
          const quantity = document && record.documentoVersion === 1 && Number.isFinite(line?.cantidad) ? Math.abs(line.cantidad) : line?.cantidad;
          return `${label(source, id)}${quantity != null ? `: ${quantity} ${line?.unidad || stock?.unidad || ""}` : ""}${document && line?.valor != null ? ` · Precio: ${line.valor} ${result.monedaEtiqueta}` : ""}`;
        }).join(" | ");
      } else result[names[field]] = values.map(id => label(source, id)).join(", ");
    }
    return result;
  });
}
