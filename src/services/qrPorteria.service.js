import appConfig from "../config/app.config";
import { apiGet } from "./api.service";
import { loadRecordDetail } from "./recordDetails.service";

const id = value => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const ids = value => [].concat(value ?? []).map(id).filter(Boolean);

export function porteriaInitialValues(resource, event, branch, trip, ambiguous = false) {
  const initial = { formulario: "movPorteria" };
  // A trip can supply editable references, but never a physical location or operation.
  const source = event || trip || {};
  for (const field of ["persona", "cliente"]) if (id(source[field])) initial[field] = id(source[field]);
  for (const field of ["tractor", "furgon"]) initial[field] = ids(source[field]);
  if (typeof source.cargado === "boolean") initial.cargado = source.cargado;
  const field = resource.entity === "tractores" ? "tractor" : "furgon";
  if (!initial[field].includes(resource.id)) initial[field].push(resource.id);
  // Current events use ubicacion; sucursal is retained only in legacy records.
  const currentBranch = id(branch), eventBranch = id(event?.ubicacion ?? event?.sucursal);
  const type = String(event?.tipo || "").trim().toUpperCase();
  if (!ambiguous && currentBranch && eventBranch && ["ENTRADA", "SALIDA"].includes(type)) {
    initial.tipo = type === "ENTRADA" && eventBranch === currentBranch ? "SALIDA" : "ENTRADA";
  }
  return initial;
}

export async function loadQRPorteria(resource, branch, trip, isActive = () => true) {
  const path = `/api/v1/apps/${encodeURIComponent(appConfig.appId)}/records/eventos`;
  const field = resource.entity === "tractores" ? "tractor" : "furgon";
  let cursor;
  const seen = new Set();
  // Selective filters can return empty pages with a continuation cursor.
  do {
    const result = await apiGet(path, { area: "porteria", tipos: "ENTRADA,SALIDA", [field]: resource.id, limit: 2, cursor });
    if (!isActive()) return null;
    if (!Array.isArray(result.data) || typeof result.pagination?.hasNext !== "boolean") throw new Error("No se pudo verificar el historial de Portería");
    if (result.data.length) {
      const latest = result.data[0];
      if (latest.area !== "porteria" || !ids(latest[field]).includes(resource.id) || !Number.isFinite(latest.orden)) throw new Error("El historial no identifica el último movimiento del recurso");
      const ambiguous = result.data.length > 1 && latest.orden === result.data[1].orden;
      const event = await loadRecordDetail("eventos", latest.id);
      if (!isActive()) return null;
      if (event.id !== latest.id || event.orden !== latest.orden || event.area !== "porteria" || !ids(event[field]).includes(resource.id)
        || !["ENTRADA", "SALIDA"].includes(String(event.tipo || "").trim().toUpperCase())) throw new Error("No se pudo verificar el último movimiento de Portería");
      const initial = porteriaInitialValues(resource, event, branch, trip, ambiguous);
      return { initial, warning: initial.tipo ? "" : "No hay información suficiente de sucursal o del último movimiento para sugerir ENTRADA/SALIDA. Seleccioná la operación." };
    }
    if (!result.pagination.hasNext) break;
    cursor = result.pagination.nextCursor;
    if (!cursor || seen.has(cursor)) throw new Error("La consulta del historial quedó incompleta");
    seen.add(cursor);
  } while (isActive());
  return { initial: porteriaInitialValues(resource, null, branch, trip), warning: "No hay movimientos de Portería verificables para sugerir ENTRADA/SALIDA. Seleccioná la operación." };
}
