import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, FormStandard, FormEventoPorteria, FormEventoPorteriaParticular, FormEventoPorteriaProveedor, LoadingState, Modal, ErrorState, administrationFields } from "cantapp-components";
import { auth } from "../firebase/client";
import { canEditRecord } from "../config/operations";
import { clearPendingRecord, formOptions, initialFormData, makePendingRecord, pendingMatches, porteriaFields, readEditableRecord, readPendingRecord, recordPayload, rememberPendingRecord, saveRecord } from "../services/record.service";
const LINK_CONFIRM_FIELDS = [{ key: "justificacion", label: "Justificación del movimiento adicional", type: "textarea", required: true, validate: value => String(value || "").trim().length < 10 || String(value).length > 1000 ? "Ingresá entre 10 y 1000 caracteres" : "" }];

export default function RecordEditor({ entry, policy, record, initialValues, title, onClose, onSaved }) {
  const [state, setState] = useState({ loading: true });
  const [saving, setSaving] = useState(false);
  const [inventory, setInventory] = useState(false);
  const [modality, setModality] = useState("interna");
  const [documentType, setDocumentType] = useState("REMITO");
  const [movement, setMovement] = useState("");
  const [pending, setPending] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [recoveryError, setRecoveryError] = useState("");
  const lock = useRef(false);
  const request = useRef(null);
  const owner = useRef(auth.currentUser?.uid);
  const editing = !!(pending ? pending.original : record);
  const type = policy.type === "documento" ? "documento" : editing ? policy.editType || policy.type : policy.type;
  const formulario = initialValues?.formulario || "movPorteria";
  const PorteriaForm = { movPorteria: FormEventoPorteria, movPorteriaParticular: FormEventoPorteriaParticular, movPorteriaProveedor: FormEventoPorteriaProveedor }[formulario];
  const administrativeOnly = editing && state.original?.movimientoStock !== "SIN MOVIMIENTO";
  const fields = useMemo(() => type === "porteria" ? porteriaFields(formulario) : administrationFields(type, { editing, inventory, modality, rules: policy.rules, documentType, movement, administrativeOnly }), [type, formulario, editing, inventory, modality, policy.rules, documentType, movement, administrativeOnly]);

  // Required operational fields remain visible; hidden optional values never enter the patch.
  const visibleFields = useMemo(() => !entry?.formFields ? fields : fields.filter(field => field.required || entry.formFields.includes(field.key)), [fields, entry]);

  useEffect(() => {
    let active = true;
    setState({ loading: true });
    async function load() {
      try {
        const recovered = await readPendingRecord(owner.current);
        if (recovered && !pendingMatches(recovered, policy)) throw new Error(`Hay un guardado pendiente en ${recovered.operation.type}. Abrí ese módulo para verificarlo antes de guardar otra operación.`);
        if (recovered) {
          request.current = recovered;
          if (active) { setPending(recovered); setState({ loading: false }); }
          return;
        }
        const original = record ? await readEditableRecord(policy, record.id) : null;
        if (original ? !canEditRecord(policy, original) : !policy.create) throw new Error("No tenés permiso para esta operación");
        if (policy.type === "documento" && original && original.documentoVersion !== 1) throw new Error("Los documentos históricos están disponibles únicamente para consulta");
        if (policy.area && original && original.area !== policy.area) throw new Error("El registro pertenece a otra sección");
        const initialType = policy.type === "documento" ? "documento" : record ? policy.editType || policy.type : policy.type;
        const documentOptions = { documentType: original?.tipo || initialValues?.tipo || "REMITO", movement: original?.movimientoStock || "", administrativeOnly: !!original && original.movimientoStock !== "SIN MOVIMIENTO" };
        const initialInventory = (original || initialValues)?.tipo === "INVENTARIO";
        const initialFields = initialType === "porteria" ? porteriaFields(formulario) : administrationFields(initialType, { editing: !!record, inventory: initialInventory, rules: policy.rules, ...documentOptions });
        const optionFields = initialType === "porteria" ? initialFields : initialType === "llaves" ? administrationFields("llaves", { inventory: true }) : ["interna", "externa", "ruta"].flatMap(value => administrationFields(initialType, { editing: !!record, modality: value, rules: policy.rules, ...documentOptions }));
        const options = await formOptions([...new Map(optionFields.map(field => [field.key, field])).values()], { creating: !record, llaves: initialType === "llaves" });
        if (active) {
          setInventory(initialInventory);
          setDocumentType(documentOptions.documentType); setMovement(documentOptions.movement);
          setState({ original, options, initial: initialFormData(initialFields, original || initialValues), loading: false });
        }
      } catch (error) { if (active) setState({ loading: false, error: error.message }); }
    }
    load();
    return () => { active = false; };
  }, [policy, record, initialValues, formulario, attempt]);

  async function finishConfirmed(operation) {
    if (auth.currentUser?.uid !== owner.current) throw new Error("La sesión cambió. La confirmación queda conservada para su usuario.");
    let saved = { ...operation.original, ...operation.payload, ...operation.result };
    let warning = "";
    try { saved = await readEditableRecord(policy, operation.result.id); }
    catch { warning = "El guardado está confirmado, pero falta actualizar la ficha. Usá Actualizar para consultar nuevamente."; }
    try { await clearPendingRecord(owner.current); }
    catch { warning = `${warning} No se pudo limpiar la confirmación local; al reabrir se consultará sin volver a guardar.`.trim(); }
    if (auth.currentUser?.uid !== owner.current) throw new Error("La sesión cambió; volvé a ingresar para consultar el registro");
    onSaved(saved, warning);
  }

  async function submit(values, knownUncommitted = false) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    let operation = request.current;
    let sent = false;
    const recovering = !!operation && !knownUncommitted;
    try {
      if (operation?.status === "confirmed") { await finishConfirmed(operation); return; }
      if (!operation) {
        const existing = await readPendingRecord(owner.current);
        if (existing) throw new Error("Hay una solicitud pendiente; cerrá y reabrí el formulario para recuperarla");
        const payload = recordPayload(fields, values, state.initial, !editing, policy);
        if (!Object.keys(payload).length) throw new Error("No hay cambios para guardar");
        operation = makePendingRecord(owner.current, policy, state.original, payload, values);
      }
      // Persist before sending. Storage failure prevents the network mutation.
      await rememberPendingRecord(owner.current, operation);
      request.current = operation;
      setPending(operation);
      sent = true;
      const result = await saveRecord(policy, operation.original, operation.payload, operation.key, owner.current);
      operation = { ...operation, status: "confirmed", result };
      request.current = operation;
      setPending(operation);
      try { await rememberPendingRecord(owner.current, operation); } catch { /* Original key remains durable. */ }
      await finishConfirmed(operation);
    } catch (error) {
      if (error.documentWarning) {
        const confirmation = { ...operation, status: "confirmation", warning: error.documentWarning };
        request.current = confirmation; setPending(confirmation);
        await rememberPendingRecord(owner.current, confirmation);
        setRecoveryError("");
        return;
      }
      // A later rejection cannot prove absence of an earlier uncertain commit.
      if (sent && !recovering && !error.uncertain && error.status && error.status < 500 && request.current?.status !== "confirmed") {
        try {
          if (knownUncommitted && operation.confirmationWarning) {
            const confirmation = { ...operation, status: "confirmation", warning: operation.confirmationWarning };
            await rememberPendingRecord(owner.current, confirmation);
            request.current = confirmation; setPending(confirmation);
          } else {
            await rememberPendingRecord(owner.current, { ...operation, status: "rejected" });
            request.current = null;
            setPending(null);
            setState(current => ({ ...current, initial: values }));
          }
        } catch { /* Keep pending if rejection cannot be recorded. */ }
      }
      setRecoveryError(error.message);
      throw error;
    } finally { lock.current = false; setSaving(false); }
  }

  async function recover() {
    setRecoveryError("");
    try { await submit(); } catch (error) { setRecoveryError(error.message); }
  }

  async function confirmLinked(values) {
    if (lock.current) return;
    const operation = request.current;
    if (operation?.status !== "confirmation" || !operation.warning?.desafio) throw new Error("Volvé a verificar el documento");
    const next = { ...operation, status: "pending", warning: null, confirmationWarning: operation.warning, payload: { ...operation.payload, confirmacionVinculo: { desafio: operation.warning.desafio, justificacion: values.justificacion.trim() } } };
    lock.current = true; setSaving(true);
    try {
      await rememberPendingRecord(owner.current, next);
      request.current = next;
      setPending(next);
    } finally { lock.current = false; setSaving(false); }
    await submit(undefined, true);
  }

  async function discardUncommittedWarning() {
    if (lock.current || request.current?.status !== "confirmation") return;
    lock.current = true; setSaving(true); setRecoveryError("");
    try {
      // The server warning confirms that document, numbering and stock did not commit.
      await rememberPendingRecord(owner.current, { ...request.current, status: "rejected" });
      request.current = null;
      onClose();
    } catch (error) { setRecoveryError(error.message); }
    finally { lock.current = false; setSaving(false); }
  }

  return <Modal visible showBack title={`${editing ? "Editar" : "Nuevo"} · ${title}`} onClose={saving ? undefined : onClose} closeOnBackdrop={false}>
    {state.loading ? <LoadingState label="Preparando formulario…" /> : state.error ? <ErrorState description={state.error} onRetry={() => setAttempt(value => value + 1)} /> : pending ? <>
      <Alert tone="warning" title={pending.status === "confirmed" ? "Guardado confirmado" : pending.status === "confirmation" ? "Documento sin guardar" : "Guardado pendiente de verificar"} description={pending.status === "confirmed" ? "Solo se consultará el registro; no se volverá a escribir." : pending.status === "confirmation" ? "El servidor no guardó el documento ni movió existencias. Podés justificar el movimiento adicional o descartar esta solicitud." : "Se conservan la solicitud original y su clave. La verificación es manual y puede completar la operación si todavía no se había guardado."} />
      <Alert title="Datos de la operación conservada" description={[
        pending.payload.tipo,
        pending.payload.persona ? `Persona: ${pending.payload.persona}` : "",
        pending.payload.tractor ? `Tractores: ${[].concat(pending.payload.tractor).join(", ")}` : "",
        pending.payload.furgon ? `Furgones: ${[].concat(pending.payload.furgon).join(", ")}` : "",
        pending.payload.repuestos ? `Repuestos: ${pending.payload.repuestos.map(item => `${item.id}: ${item.cantidad} ${item.unidad}`).join("; ") || "Sin consumo"}` : "",
        pending.payload.ingresos ? `Artículos: ${pending.payload.ingresos.map(item => `${item.id}: ${item.cantidad}${item.unidad ? ` ${item.unidad}` : ""}`).join("; ") || "Sin artículos"}` : "",
        policy.type === "documento" ? [pending.payload.movimientoStock, pending.payload.remito && `Remito: ${pending.payload.remito}`, pending.payload.factura && `Factura: ${pending.payload.factura}`, pending.payload.deposito && `Depósito: ${pending.payload.deposito}`].filter(Boolean).join(" · ") : "",
        pending.payload.detalle,
      ].filter(Boolean).join(" · ")} />
      {recoveryError && <Alert tone="danger" title="No se pudo verificar" description={recoveryError} />}
      {pending.status === "confirmation" ? <>
        <Alert tone="warning" title="Posible movimiento duplicado" description={`${pending.warning?.error || "Revisá los comprobantes vinculados"} ${(pending.warning?.documentos || []).map(doc => `${doc.tipo} ${doc.numero} (${doc.id}): ${doc.movimiento}`).join(" · ")}`} />
        <FormStandard title="Confirmación justificada" fields={LINK_CONFIRM_FIELDS} loading={saving} onSubmit={confirmLinked} onCancel={onClose} />
        <Button label="Descartar solicitud sin guardar" variant="outline" disabled={saving} onPress={discardUncommittedWarning} />
      </> : <Button label={pending.status === "confirmed" ? "Consultar registro guardado" : "Verificar la misma solicitud"} loading={saving} onPress={recover} />}
    </> : <>
      {recoveryError && <Alert tone="danger" title="No se pudo guardar" description={recoveryError} />}
      {type === "detalle" && <Alert title="Edición del detalle" description="Se conservan los datos operativos, recursos y fechas del registro." />}
      {policy.type === "stock" && <Alert title="Catálogo de artículos" description="Las existencias se administran mediante movimientos. Un artículo nuevo comienza con cantidad cero." />}
      {!editing && ["tallerTractor", "tallerFurgon"].includes(type) && <Alert title="Consumo de repuestos" description="El evento y el consumo se confirman juntos. Cada línea se descuenta una sola vez, aunque selecciones varios vehículos. No existe distribución del consumo por vehículo." />}
      {!editing && type === "asignacion" && <Alert title="Asignación de artículos" description="Registra la entrega a la persona sin descontar existencias." />}
      {type === "porteria" ? <PorteriaForm data={state.initial} optionsByField={state.options} loading={saving} onSubmit={submit} onCancel={onClose} /> : <FormStandard title={editing ? `Registro ${record.id}` : title} fields={visibleFields} data={state.initial} optionsByField={state.options} loading={saving} onSubmit={submit} onCancel={onClose} onValuesChange={values => { setInventory(values.tipo === "INVENTARIO"); setModality(values.modalidad || "interna"); setDocumentType(values.tipo || "REMITO"); setMovement(values.movimientoStock || ""); }} />}
    </>}
  </Modal>;
}
