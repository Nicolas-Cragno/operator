import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button, ErrorState, LoadingState } from "cantapp-components";

export default function OperatorQRScanner({ onScan }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [opening, setOpening] = useState(true);
  const [error, setError] = useState("");
  const started = useRef(false);
  const mounted = useRef(false);
  const scanned = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const start = useCallback(async () => {
    setError("");
    setOpening(true);
    try {
      const result = await requestPermission();
      if (!mounted.current) return;
      if (!result.granted) throw new Error("Permiso de cámara denegado");
      scanned.current = false;
      setActive(true);
    } catch (cause) { if (mounted.current) setError(cause.message); }
    finally { if (mounted.current) setOpening(false); }
  }, [requestPermission]);
  useEffect(() => {
    if (!permission || started.current) return;
    started.current = true;
    if (permission.granted) { setActive(true); setOpening(false); }
    else void start();
  }, [permission, start]);
  return <View style={{ gap: 12 }}>
    {active ? <>
      <CameraView style={{ width: "100%", height: 300 }} facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onMountError={event => { setActive(false); setError(event.message); }}
        onBarcodeScanned={result => {
          if (scanned.current) return;
          scanned.current = true;
          setActive(false);
          onScan(result.data, result);
        }} />
      <Button label="Detener cámara" variant="outline" onPress={() => setActive(false)} />
    </> : opening ? <LoadingState label="Abriendo cámara…" /> :
      <Button label="Reintentar cámara" onPress={start} />}
    {!!error && <ErrorState description={error} />}
    {permission?.canAskAgain === false && Platform.OS !== "web" &&
      <Button label="Abrir ajustes" variant="outline" onPress={() => Linking.openSettings()} />}
  </View>;
}
