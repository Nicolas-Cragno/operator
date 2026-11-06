import React from "react";
import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useCantappTheme } from "cantapp-components";
import { AuthProvider, useAuth } from "../src/contexts/AuthContext";
import { AppProvider } from "../src/contexts/AppContext";
import AppShell from "../src/components/AppShell";
import Login from "../src/screens/Login";
import Status from "../src/screens/Status";
function RootContent() {
  const { phase, error } = useAuth(); const t = useCantappTheme();
  if (phase === "loading") return <View style={{ flex: 1, justifyContent: "center", backgroundColor: t.background }}><ActivityIndicator size="large" color={t.colorA}/></View>;
  if (phase === "login") return <Login/>;
  if (phase === "maintenance") return <Status title="Aplicación en mantenimiento" message={error?.message || "Temporalmente no disponible"} retry/>;
  if (phase === "denied") return <Status title="Acceso denegado" message={error?.message || "No tenés acceso a esta aplicación"}/>;
  if (phase === "error") return <Status title="Error de conexión" message={error?.message || "No se pudo iniciar"} retry/>;
  return <AppShell><Stack screenOptions={{ headerShown: false }}/></AppShell>;
}
export default function RootLayout() { return <AuthProvider><AppProvider><RootContent/></AppProvider></AuthProvider>; }
