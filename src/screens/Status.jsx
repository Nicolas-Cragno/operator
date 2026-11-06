import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Button, useCantappTheme } from "cantapp-components";
import { useAuth } from "../contexts/AuthContext";
export default function Status({ title, message, retry = false, logout = true }) {
  const t = useCantappTheme(); const { refresh, signOut } = useAuth();
  return <View style={{ flex: 1, backgroundColor: t.background, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}><Text style={{ color: t.text, fontSize: 24, fontWeight: "700", textAlign: "center" }}>{title}</Text><Text style={{ color: t.muted, textAlign: "center" }}>{message}</Text>{retry && <Button label="Reintentar" onPress={refresh}/>} {logout && <Button label="Cerrar sesión" variant="outline" onPress={signOut}/>}</View>;
}
