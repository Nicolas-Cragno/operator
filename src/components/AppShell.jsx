import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter, usePathname } from "expo-router";
import { Alert, FloatButton, LoadingState, Modal, QROptionsModal, QRScanner, useCantappTheme } from "cantapp-components";
import { useApp } from "../contexts/AppContext";
import { useAuth } from "../contexts/AuthContext";
import AppLogo from "./AppLogo";
import ModuleIcon from "./ModuleIcon";
import RecordBrowser from "./RecordBrowser";
import RecordEditor from "./RecordEditor";
import { findCatalog } from "../config/catalog";
import { operationPolicy } from "../config/operations";
import { parseResourceQR, programmedTripsForResource } from "../services/record.service";
import { loadRecordDetail } from "../services/recordDetails.service";
export default function AppShell({ children }) {
  const t = useCantappTheme(); const { width } = useWindowDimensions(); const desktop = width >= 768;
  const router = useRouter(); const pathname = usePathname();
  const { app, user, modules, mode, setMode } = useApp(); const { data: session, signOut, markActivity } = useAuth();
  const [expanded, setExpanded] = useState({});
  const [qr, setQR] = useState(null);
  const qrRequest = useRef(0);
  useEffect(() => () => { qrRequest.current++; }, []);
  const porteriaEntry = findCatalog("porteria", "eventos");
  const porteriaPolicy = useMemo(() => operationPolicy("porteria", porteriaEntry, session?.user, session?.access?.crud), [porteriaEntry, session]);
  const closeQR = () => { qrRequest.current++; setQR(null); };
  async function scanQR(raw) {
    const request = ++qrRequest.current;
    markActivity();
    setQR({ screen: "loading" });
    try {
      const resource = parseResourceQR(raw);
      const record = await loadRecordDetail(resource.entity, resource.id);
      if (request !== qrRequest.current) return;
      let trips = [], blocked = "";
      if (porteriaPolicy?.create) {
        try {
          trips = await programmedTripsForResource(resource);
          if (trips.length > 1) blocked = `Hay más de un viaje PROGRAMADO para ${resource.id}. Resolvé el conflicto antes de registrar ENTRADA/SALIDA.`;
        } catch (error) { blocked = `No se pudieron verificar los viajes programados: ${error.message}`; }
      } else blocked = "No tenés permiso para crear eventos de Portería";
      if (request === qrRequest.current) setQR({ screen: "options", resource, record, trip: trips[0], blocked });
    } catch (error) {
      if (request === qrRequest.current) setQR({ screen: "scanner", error: error.message });
    }
  }
  function selectQRAction(option) {
    markActivity();
    if (option.id === "ficha") { setQR({ ...qr, screen: "record" }); return; }
    if (qr.blocked || !porteriaPolicy?.create) return;
    const trip = qr.trip;
    const ids = value => [].concat(value ?? []).map(String);
    const initial = { formulario: "movPorteria", ...(trip ? {
      tipo: "SALIDA", persona: trip.persona, tractor: ids(trip.tractor), furgon: ids(trip.furgon),
      cliente: trip.cliente, cargado: trip.cargado ?? false, detalle: trip.detalleSalida || trip.detalle || "",
    } : qr.resource.entity === "tractores" ? { tractor: [qr.resource.id] } : { furgon: [qr.resource.id] }) };
    setQR({ ...qr, screen: "editor", initial });
  }
  const navigate = (route) => { markActivity(); router.push(route); };
  const link = (label, icon, route, active = false, inset = false) => <Pressable key={route} onPress={() => navigate(route)} style={{ paddingVertical: 12, paddingHorizontal: inset ? 24 : 12, backgroundColor: active ? t.colorD : "transparent", borderRadius: 4, flexDirection: "row", gap: 12, alignItems: "center" }}><ModuleIcon name={icon} color={active ? t.colorA : t.text} size={19}/><Text style={{ color: t.text, fontWeight: active ? "700" : "400", flexShrink: 1 }}>{label}</Text></Pressable>;
  return <SafeAreaView edges={Platform.OS === "web" ? [] : ["top"]} style={{ flex: 1, backgroundColor: "#0d1f7f" }}>
    {Platform.OS !== "web" && <StatusBar style="light" />}
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: t.background }}>
    {desktop && <View style={{ width: 240, backgroundColor: "#ffffff", borderRightWidth: 1, borderColor: t.colorE, padding: 14 }}>
      <Pressable onPress={() => navigate("/")} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 25 }}><AppLogo uri={app?.logo} name={app?.nombre} color={t.text} size={40}/><Text style={{ color: t.text, fontWeight: "800", fontSize: 18, flex: 1 }}>{app?.nombre?.toUpperCase()}</Text></Pressable>
      <ScrollView>{link("Inicio", "house", "/", pathname === "/")}{modules.filter((m) => m.showIn?.includes("sidebar")).map((m) => <View key={m.id}>{link(m.label, m.icon, m.route, pathname.startsWith(m.route))}{m.children?.length && pathname.startsWith(m.route) ? m.children.map((child) => <Pressable key={child.id} onPress={() => navigate(child.route)} style={{ paddingVertical: 9, paddingLeft: 42 }}><Text style={{ color: pathname === child.route ? t.colorA : t.text }}>{child.label}</Text></Pressable>) : null}</View>)}</ScrollView>
    </View>}
    <View style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
      <View style={{ height: 48, backgroundColor: "#0d1f7f", borderBottomWidth: 1, borderColor: "#0d1f7f", paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center", flex: 1 }}>{!desktop && <AppLogo uri={app?.logo} name={app?.nombre} color={t.text} size={36}/>}<Text numberOfLines={1} style={{ color: "#ffffff", fontWeight: "700", fontSize: 16 }}>{desktop ? "CANTAPP" : app?.nombre?.toUpperCase()}</Text></View>
        <Pressable onPress={() => setMode(mode === "oscuro" ? "claro" : "oscuro")}><Text style={{ color: "#ffffff" }}>{mode === "oscuro" ? "☀" : "☾"}</Text></Pressable>
        <Text numberOfLines={1} style={{ color: "#ffffff", maxWidth: 130 }}>{user?.nombres}</Text>
        <Pressable onPress={signOut}><Text style={{ color: "#ffffff", fontWeight: "700" }}>Salir</Text></Pressable>
      </View>
      <View style={{ flex: 1, minHeight: 0, minWidth: 0 }}>{children}</View>
      {!desktop && <View style={{ minHeight: 64, borderTopWidth: 1, borderColor: t.colorE, flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingBottom: 4 }}>
        {[{ id: "inicio", label: "Inicio", icon: "house", route: "/" }, ...modules.filter((m) => m.showIn?.includes("lowbar"))].slice(0, 4).map((m) => <Pressable key={m.id} onPress={() => navigate(m.route)} style={{ alignItems: "center", minWidth: 60, gap: 4 }}><ModuleIcon name={m.icon} color={pathname === m.route ? t.colorA : t.text} size={23}/><Text style={{ color: t.text, fontSize: 10 }}>{m.label}</Text></Pressable>)}
      </View>}
    </View>
    {!desktop && <FloatButton bottom={80} onPress={() => { markActivity(); qrRequest.current++; setQR({ screen: "scanner" }); }} />}
    {(qr?.screen === "scanner" || qr?.screen === "loading") && <Modal visible title="Escanear recurso" onClose={closeQR} closeOnBackdrop={false}>
      {qr.screen === "loading" ? <LoadingState label="Consultando recurso y viajes programados…" /> : <>
        {!!qr.error && <Alert tone="danger" description={qr.error} />}
        <QRScanner onScan={scanQR} />
      </>}
    </Modal>}
    <QROptionsModal visible={qr?.screen === "options"} onClose={() => setQR(current => current ? { ...current, screen: null } : null)}
      title={qr?.blocked || `Recurso ${qr?.resource?.id || ""}`}
      opciones={[{ id: "ficha", title: "VER FICHA" }, { id: "porteria", title: "ENTRADA/SALIDA", disabled: !!qr?.blocked }]}
      onSelect={selectQRAction} />
    {qr?.screen === "record" && <RecordBrowser entity={qr.resource.entity} record={qr.record} onClose={closeQR} />}
    {qr?.screen === "editor" && <RecordEditor entry={porteriaEntry} policy={porteriaPolicy} initialValues={qr.initial}
      title={`Portería · ${qr.resource.id}`} onClose={closeQR}
      onSaved={(record, warning) => setQR({ screen: "saved", record, warning })} />}
    {qr?.screen === "saved" && <RecordBrowser entity="eventos" record={qr.record} warning={qr.warning} onClose={closeQR} />}
  </View></SafeAreaView>;
}
