import { Platform } from "react-native";
import { signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";
import { auth } from "../firebase/client";
import appConfig from "../config/app.config";
const base = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "").replace(/\/api$/, "");
export async function configurePersistence() {
  if (Platform.OS !== "web") return;
  await setPersistence(auth, appConfig.CERRAR_AL_CERRAR_VENTANA ? browserSessionPersistence : browserLocalPersistence);
}
export async function login(identifier, password) {
  const value = identifier.trim();
  if (!value || !password) throw new Error("Ingresá usuario y contraseña");
  let email = value;
  if (!value.includes("@")) {
    if (!base) throw new Error("Falta configurar EXPO_PUBLIC_API_URL");
    const response = await fetch(`${base}/api/v1/auth/resolver-usuario`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: value }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || !result.data?.email) throw new Error("No se pudo resolver el DNI");
    email = result.data.email;
  }
  return (await signInWithEmailAndPassword(auth, email, password)).user;
}
export const logout = () => signOut(auth);
