import { auth } from "../firebase/client";
const API_BASE = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
async function apiRequest(path, { method = "GET", params = {}, data, headers = {}, expectedUid } = {}) {
 if (!API_BASE) throw new Error("Configurá EXPO_PUBLIC_API_URL en .env");
 const user = auth.currentUser;
 if (!user) throw new Error("Debés iniciar sesión para consultar datos");
 if (expectedUid && user.uid !== expectedUid) throw new Error("La solicitud pertenece a otra sesión");
 const token = await user.getIdToken();
 if (auth.currentUser?.uid !== user.uid) throw new Error("La sesión cambió; volvé a abrir el formulario");
 const qs = Object.entries(params).filter(([,v]) => v !== undefined && v !== null && v !== "").map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
 const url = `${API_BASE}${path}${qs ? `?${qs}` : ""}`;
 let response;
 try {
  response = await fetch(url, { method, headers: {Authorization:`Bearer ${token}`,Accept:"application/json", ...(data ? { "Content-Type": "application/json" } : {}), ...headers}, ...(data ? { body: JSON.stringify(data) } : {}) });
 } catch {
  throw Object.assign(new Error(method === "GET" ? "No se pudo conectar con el servidor" : "No se pudo confirmar el guardado. Reintentá sin cambiar los datos para verificar la misma solicitud."), { uncertain: method !== "GET" });
 }
 const body = await response.json().catch(()=>null);
 if (!response.ok) throw Object.assign(new Error(body?.detalle || body?.error || body?.message || `HTTP ${response.status}`), { status: response.status, documentWarning: body?.documentWarning ? body : undefined, uncertain: method !== "GET" && (response.status >= 500 || [408, 429].includes(response.status)) });
 if (method !== "GET" && !body?.id) throw Object.assign(new Error("El servidor no confirmó el registro guardado. Reintentá la misma solicitud."), { uncertain: true });
 return body;
}
export function apiGet(path, params = {}, headers = {}) { return apiRequest(path, { params, headers }); }
export function apiMutate(path, method, data, headers, expectedUid) { return apiRequest(path, { method, data, headers, expectedUid }); }
export function extractRows(body) {
 if (Array.isArray(body)) return body;
 for (const key of ["data","items","resultados","registros","personas","tractores","furgones","vehiculos","empresas","stock","depositos","estaciones","ubicaciones","eventos","asignaciones","cargas","movimientos","viajes"]) {
  if (Array.isArray(body?.[key])) return body[key];
  if (body?.[key] && typeof body[key] === "object") for(const nested of ["items","data","resultados","registros"]) if(Array.isArray(body[key][nested])) return body[key][nested];
 }
 throw new Error("La API respondió, pero el formato del listado no fue reconocido");
}
