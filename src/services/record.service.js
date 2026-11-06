import appConfig from "../config/app.config";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "../firebase/client";
import { enrichOperationalRows } from "./catalog.service";
import { apiGet, apiMutate, extractRows } from "./api.service";
import { parseRecordDate, recordDay } from "../utils/formatRecord";

export function parseResourceQR(raw) {
  const text = String(raw || "").trim();
  let entity, id;
  try {
    const value = JSON.parse(text);
    entity = value?.coleccion || value?.collection || value?.entity || value?.tipo || value?.type;
    id = value?.id ?? value?.interno;
  } catch { /* Printed QR codes may contain a resource path or identifier. */ }
  if (!entity) {
    const match = text.match(/^(?:CANTAPP:)?(?:RECURSO:)?(TRACTOR(?:ES)?|FURGON(?:ES)?|T|F)[:/-]([^/?#]+)$/i)
      || text.match(/^(?:https?:\/\/[^/]+)?\/(?:recursos\/)?(tractores|furgones)\/([^/?#]+)\/?$/i);
    if (match) { entity = match[1]; id = match[2]; }
  }
  const entities = { tractor: "tractores", tractores: "tractores", t: "tractores", furgon: "furgones", furgones: "furgones", f: "furgones" };
  const key = String(entity || "").toLowerCase();
  entity = Object.hasOwn(entities, key) ? entities[key] : null;
  if (!entity || !["string", "number"].includes(typeof id)) throw new Error("El QR no identifica un tractor o furgón de CANTAPP");
  try { id = decodeURIComponent(String(id)).trim(); } catch { throw new Error("El QR contiene un identificador inválido"); }
  if (!id || id.length > 120 || /[/\\?#]/.test(id) || [".", ".."].includes(id)) throw new Error("El QR contiene un identificador inválido");
  return { entity, id };
}

export async function programmedTripsForResource(resource) {
  const matches = [];
  for (let page = 1; ; page++) {
    const response = await apiGet("/viajes/v2/programados", { pagina: page, limit: 100 });
    const result = response?.data;
    if (response?.ok !== true || !Array.isArray(result?.registros) || !Number.isSafeInteger(result.paginas) || result.paginas < 0) throw new Error("No se pudo verificar la lista completa de viajes programados");
    const field = resource.entity === "tractores" ? "tractor" : "furgon";
    for (const trip of result.registros) {
      if (trip.versionEsquema === 2 && trip.estadoViaje === "PROGRAMADO" && trip.estado === false
        && [].concat(trip[field] ?? []).map(String).includes(resource.id)
        && !matches.some(existing => existing.id === trip.id)) matches.push(trip);
    }
    if (matches.length > 1 || page >= result.paginas) return matches;
    if (!result.registros.length) throw new Error("La consulta de programados quedó incompleta; volvé a escanear");
  }
}

// Payload and catalogs for the shared Portería forms; saves still use /eventos.
export function porteriaFields(formulario = "movPorteria") {
  const relation = (key, source, required = false) => ({ key, relation: source, type: "searchSelect", required });
  return [
    { key: "tipo", type: "select", required: true },
    relation("operador", "personas", true), relation("persona", "personas", true),
    { key: "detalle", type: "textarea" },
    ...(formulario === "movPorteria" ? [{ ...relation("tractor", "tractores", true), type: "multiSelect" },
    { ...relation("furgon", "furgones"), type: "multiSelect" }, relation("cliente", "empresas/clientes"),
    { key: "cargado", type: "switch", defaultValue: false }, { key: "chequeos", type: "multiSelect" }] : [relation("vehiculo", "vehiculos")]),
    ...(formulario === "movPorteriaProveedor" ? [relation("destino", "sectores", true), relation("empresa", "proveedores"), { key: "remito", type: "text" }] : []),
  ];
}

export async function readEditableRecord(policy, id) {
  const record = await apiGet(policy.detailPath(id), policy.detailParams?.(id), { "X-Cantapp-Operator": "1", "X-Cantapp-App-Id": appConfig.appId });
  if (!record || String(record.id) !== String(id) || !/^[a-f0-9]{64}$/.test(record._operatorRevision || "")) throw new Error("El backend no tiene habilitada esta versión de edición. Actualizá la aplicación y su servidor.");
  return ["/eventos", "/asignaciones"].includes(policy.path) ? (await enrichOperationalRows([record]))[0] : record;
}

export async function formOptions(fields, { creating = false, llaves = false } = {}) {
  const sources = [...new Set(fields.map(field => field.relation).filter(Boolean))];
  const lists = await Promise.all(sources.map(async source => [source, extractRows(await apiGet(`/${source}`))]));
  const lookup = new Map(lists);
  return Object.fromEntries(fields.filter(field => field.relation).map(field => {
    const options = lookup.get(field.relation).filter(row => (!creating || row.estado !== false)
      && (!llaves || field.key !== "operador" || String(row.especializacion || "").toUpperCase() === "SERENO")).map(row => ({
      value: field.lowercaseValue ? String(row[field.valueField] || "").trim().toLowerCase() : String(row[field.valueField || "id"]),
      unidad: row.unidad,
      label: field.relation === "personas" ? `${row.apellido || ""}, ${row.nombres || row.nombre || ""} (${row.id})` : `${row.nombre || row.descripcion || row.dominio || row.id}${row.nombre || row.descripcion || row.dominio ? ` (${row.id})` : ""}`,
    }));
    if (!field.required && !["multiSelect", "articleLines"].includes(field.type)) options.unshift({ value: "", label: "Sin asignar" });
    return [field.key, options];
  }));
}

export function initialFormData(fields, record) {
  return Object.fromEntries(fields.map(field => {
    let value = record?.[field.key] ?? field.defaultValue;
    if (field.type === "checks") value = value && !Array.isArray(value) ? value : {};
    else if (field.type === "articleLines") value = Array.isArray(value) ? value.map(line => record?.documentoVersion === 1 ? { ...line, cantidad: Math.abs(line.cantidad) } : line) : [];
    else if (field.type === "date" && value) {
      const date = parseRecordDate(value);
      const day = date ? recordDay(date) : "";
      value = day ? `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : "";
    }
    else if (field.type === "multiSelect") value = (Array.isArray(value) ? value : value == null ? [] : [value]).map(String);
    else if (field.relation && value != null) value = String(value);
    else if (field.type === "text" || field.type === "textarea") value = value == null ? "" : String(value);
    else if (field.type === "select" && value != null) value = field.options?.find(option => String(option.value).toLowerCase() === String(value).toLowerCase())?.value ?? value;
    return [field.key, value ?? (field.type === "number" ? "" : "")];
  }));
}

export function recordPayload(fields, values, initial, creating, policy) {
  const result = {};
  for (const field of fields) {
    if (field.disabled || field.transient) continue;
    let value = values[field.key] ?? field.defaultValue;
    if (!creating && JSON.stringify(value) === JSON.stringify(initial[field.key]) && !(field.includeMoney && values.moneda !== initial.moneda)) continue;
    if (field.type === "articleLines") value = (value || []).map(item => ({ id: String(item.id || "").trim(), cantidad: Number(item.cantidad), ...(field.includeUnit ? { unidad: item.unidad } : {}), ...(field.includeMoney ? { valor: Number(item.valor ?? 0), moneda: values.moneda } : {}) }));
    else if (field.type === "date" && policy.type === "documento") value = value ? `${value.slice(6, 10)}-${value.slice(3, 5)}-${value.slice(0, 2)}` : null;
    else if (field.type === "number") value = value === "" || value == null ? null : Number(value);
    else if (typeof value === "string") value = value.trim();
    if (value === undefined) continue;
    result[field.key] = value;
  }
  if (creating && policy.type === "porteria") {
    if (!["movPorteria", "movPorteriaParticular", "movPorteriaProveedor"].includes(values.formulario)) throw new Error("Formulario de Portería inválido");
    if (!result.persona) throw new Error("Seleccioná la persona para registrar el movimiento de Portería");
    result.area = "porteria";
    result.formulario = values.formulario;
  }
  if (creating && policy.type === "llaves") {
    if (!["ENTREGA", "RETIRA", "INVENTARIO"].includes(result.tipo)) throw new Error("Seleccioná ENTREGA, RETIRA o INVENTARIO");
    const reference = value => {
      if (value == null || value === "") return null;
      if (!["string", "number"].includes(typeof value)) throw new Error("Referencia de Llaves inválida");
      const id = String(value).trim();
      if (!id) return null;
      if (id.includes("/") || [".", ".."].includes(id)) throw new Error("Referencia de Llaves inválida");
      return id;
    };
    result.operador = reference(result.operador);
    result.persona = reference(result.persona);
    if (!result.operador) throw new Error("Seleccioná el operador");
    if (result.tipo !== "INVENTARIO" && !result.persona) throw new Error("Seleccioná la persona que entrega o retira las llaves");
    result.tractor = (Array.isArray(result.tractor) ? result.tractor : [result.tractor]).map(reference).filter(Boolean);
    if (!result.tractor.length || result.tractor.length > 100 || new Set(result.tractor).size !== result.tractor.length) throw new Error("Seleccioná tractores sin repetir (máximo 100)");
    if (result.detalle != null && (typeof result.detalle !== "string" || result.detalle.length > 4000)) throw new Error("El detalle debe tener hasta 4000 caracteres");
    result.detalle = result.detalle || null;
    result.area = "porteria";
    result.formulario = result.tipo === "INVENTARIO" ? "inventario" : "movLlaves";
  }
  if (creating && ["tallerTractor", "tallerFurgon"].includes(policy.type)) {
    result.area = policy.type === "tallerTractor" ? "tractores" : "furgones";
    const suffix = { interna: "", externa: "Externa", ruta: "EnRuta" }[values.modalidad || "interna"];
    if (suffix === undefined) throw new Error("Modalidad de taller inválida");
    result.formulario = `${policy.type === "tallerTractor" ? "repTractor" : "repFurgon"}${suffix}`;
    if (result.repuestos.length && !result.deposito) throw new Error("Seleccioná el depósito de origen de los repuestos");
  }
  return result;
}

export function newRequestId() { return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`; }

export function saveRecord(policy, original, payload, requestId, uid) {
  return apiMutate(original ? `${policy.path}/${encodeURIComponent(original.id)}` : policy.path, original ? "PUT" : "POST", payload, {
    "X-Cantapp-Operator": "1", "X-Cantapp-App-Id": appConfig.appId, "Idempotency-Key": requestId,
    ...(original ? { "If-Match": original._operatorRevision } : {}),
  }, uid);
}

// One durable pending operation per user/application/server. Never resend on mount.
const pendingMemory = new Map();
const storageKey = uid => `cantapp:pending:${appConfig.appId}:${encodeURIComponent(process.env.EXPO_PUBLIC_API_URL || "")}:${uid}`;
function assertOwner(uid) {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error("La sesión cambió; volvé a abrir el formulario");
}
export function pendingMatches(pending, policy) {
  return pending?.operation?.path === policy.path && pending.operation.type === policy.type && pending.operation.area === (policy.area || null);
}
export async function readPendingRecord(uid) {
  assertOwner(uid);
  const key = storageKey(uid);
  const raw = await AsyncStorage.getItem(key);
  assertOwner(uid);
  const pending = pendingMemory.get(key) || (raw ? JSON.parse(raw) : null);
  if (pending && (pending.uid !== uid || pending.version !== 1 || !pending.key || !pending.operation || !pending.payload || !['pending', 'confirmation', 'confirmed', 'rejected'].includes(pending.status))) {
    throw new Error("Hay una solicitud local que requiere verificación; no se habilitó un nuevo envío");
  }
  if (pending?.status === 'rejected') return null;
  return pending;
}
export async function rememberPendingRecord(uid, pending) {
  assertOwner(uid);
  const key = storageKey(uid);
  pendingMemory.set(key, pending);
  await AsyncStorage.setItem(key, JSON.stringify(pending));
  assertOwner(uid);
}
export async function clearPendingRecord(uid) {
  assertOwner(uid);
  const key = storageKey(uid);
  await AsyncStorage.removeItem(key);
  pendingMemory.delete(key);
}
export function makePendingRecord(uid, policy, original, payload, values) {
  return {
    version: 1, uid, key: newRequestId(), status: 'pending',
    operation: { path: policy.path, type: policy.type, area: policy.area || null },
    original: original ? { id: original.id, _operatorRevision: original._operatorRevision } : null,
    payload, values, createdAt: new Date().toISOString()
  };
}
