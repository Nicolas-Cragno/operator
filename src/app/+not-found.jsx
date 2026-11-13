import React from "react";
import { Link } from "expo-router";
import { Text, View } from "react-native";
export default function NotFound() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Ruta no encontrada</Text>
      <Link href="/">Volver al inicio</Link>
    </View>
  );
}
