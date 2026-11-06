import { auth } from "../firebase/client";
import appConfig from "../config/app.config";
import navigationConfig from "../config/navigation.config";
const base = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "").replace(/\/api$/, "");
export async function bootstrap() {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw Object.assign(new Error("Sesión no disponible"), { code: "AUTH_REQUIRED" });
  if (appConfig.mode === "template") {
    return {
      app: { id: "cantapp-base", nombre: "CANTAPP BASE", logo: null, paletaColores: {} },
      user: { uid: auth.currentUser.uid, nombres: auth.currentUser.displayName || auth.currentUser.email?.split("@")[0] || "Usuario", email: auth.currentUser.email },
      access: { modulos: navigationConfig.map((item) => item.id) },
      demo: true,
    };
  }
  if (appConfig.mode !== "app") throw new Error("Modo de aplicación inválido");
  if (!base) throw new Error("Falta configurar EXPO_PUBLIC_API_URL");
  if (!appConfig.appId || appConfig.appId === "cantapp-base") throw new Error("Configurá el appId real de la aplicación");
  let response;
  try { response = await fetch(`${base}/api/api/v1/apps/${encodeURIComponent(appConfig.appId)}/bootstrap`, { headers: { Authorization: `Bearer ${token}` } }); }
  catch { throw Object.assign(new Error("No se pudo conectar con el servidor"), { code: "NETWORK_ERROR" }); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw Object.assign(new Error(body.error || "No se pudo iniciar la aplicación"), { code: body.code || (response.status === 401 ? "AUTH_REQUIRED" : "BOOTSTRAP_ERROR") });
  return body.data;
}
