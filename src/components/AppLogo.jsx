import React, { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { resolveLogo } from "../services/logo.service";
export default function AppLogo({ uri, name, color = "#fff", size = 44 }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { let active = true; resolveLogo(uri).then((value) => { if (active) setSrc(value); }); return () => { active = false; }; }, [uri]);
  return src ? <Image source={{ uri: src }} resizeMode="contain" style={{ width: size, height: size }} /> : <View style={{ width: size, height: size, borderRadius: 4, borderWidth: 1, borderColor: color, justifyContent: "center", alignItems: "center" }}><Text style={{ color, fontWeight: "700" }}>{(name || "C").slice(0, 1).toUpperCase()}</Text></View>;
}
