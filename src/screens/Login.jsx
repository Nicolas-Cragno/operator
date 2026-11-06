import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { Button, TextInput as V2TextInput, useCantappTheme } from "cantapp-components";
import { useAuth } from "../contexts/AuthContext";
export default function Login() {
  const t = useCantappTheme(); const { signIn } = useAuth(); const [identifier, setIdentifier] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async () => { setBusy(true); setError(""); try { await signIn(identifier, password); } catch (e) { setError(e.message || "No se pudo iniciar sesión"); } finally { setBusy(false); } };
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: t.background, justifyContent: "center", padding: 20 }}><View style={{ width: "100%", maxWidth: 420, alignSelf: "center", padding: 24, backgroundColor: t.colorD, borderRadius: 4, gap: 14 }}>
    <Text style={{ color: t.text, fontSize: 28, fontWeight: "800" }}>CANTAPP</Text><Text style={{ color: t.muted }}>Ingresá con tu correo o DNI</Text>
    <V2TextInput label="Correo o DNI" value={identifier} onChange={setIdentifier} placeholder="Correo o DNI" autoCapitalize="none" />
    <V2TextInput label="Contraseña" value={password} onChange={setPassword} placeholder="Contraseña" secureTextEntry onSubmitEditing={submit} />
    {!!error && <Text style={{ color: t.danger }}>{error}</Text>}
    {busy ? <ActivityIndicator color={t.colorA}/> : <Button label="Ingresar" onPress={submit}/>}
  </View></KeyboardAvoidingView>;
}
