import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/client";
import { configurePersistence, login, logout } from "../services/auth.service";
import { bootstrap } from "../services/bootstrap.service";
import appConfig from "../config/app.config";
const Context = createContext(null);
const ACTIVITY_KEY = `cantapp:lastActivity:${appConfig.appId}`;
export function AuthProvider({ children }) {
  const [state, setState] = useState({ phase: "loading", data: null, error: null });
  const lastActivity = useRef(Date.now());
  const refresh = useCallback(async () => {
    if (!auth.currentUser) { setState({ phase: "login", data: null, error: null }); return; }
    setState((s) => ({ ...s, phase: "loading", error: null }));
    try {
      const data = await bootstrap();
      setState({ phase: "ready", data, error: null });
    } catch (error) {
      const phase = error.code === "APP_INACTIVE" ? "maintenance" : ["APP_BLOCKED", "USER_INACTIVE", "APP_NOT_FOUND"].includes(error.code) ? "denied" : error.code === "AUTH_REQUIRED" ? "login" : "error";
      setState({ phase, data: null, error });
    }
  }, []);
  const signOut = useCallback(async () => { await logout(); await AsyncStorage.removeItem(ACTIVITY_KEY); setState({ phase: "login", data: null, error: null }); }, []);
  const markActivity = useCallback(() => { lastActivity.current = Date.now(); AsyncStorage.setItem(ACTIVITY_KEY, String(lastActivity.current)).catch(() => {}); }, []);
  useEffect(() => {
    let active = true;
    let observedUid = null;
    configurePersistence().catch((e) => { if (active) setState({ phase: "error", data: null, error: e }); });
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;
      if (!user) { observedUid = null; setState({ phase: "login", data: null, error: null }); return; }
      if (observedUid === user.uid) return;
      observedUid = user.uid;
      if (!appConfig.MANTENER_SESION) {
        const previous = Number(await AsyncStorage.getItem(ACTIVITY_KEY).catch(() => 0));
        const maxMs = Math.max(1, appConfig.TIEMPO_INACTIVIDAD) * 60000;
        if (previous && Date.now() - previous >= maxMs) { await signOut(); return; }
      }
      markActivity();
      await refresh();
    });
    return () => { active = false; unsubscribe(); };
  }, [refresh, signOut, markActivity]);
  useEffect(() => {
    if (appConfig.MANTENER_SESION) return;
    const maxMs = Math.max(1, appConfig.TIEMPO_INACTIVIDAD) * 60000;
    const timer = setInterval(() => { if (auth.currentUser && Date.now() - lastActivity.current >= maxMs) signOut().catch(() => {}); }, 15000);
    return () => clearInterval(timer);
  }, [signOut]);
  const signIn = useCallback(async (identifier, password) => { await login(identifier, password); }, []);
  return <Context.Provider value={{ ...state, signIn, signOut, refresh, markActivity }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error("AuthProvider requerido"); return value; }
