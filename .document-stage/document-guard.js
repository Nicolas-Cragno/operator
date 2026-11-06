const documentPrincipal = value => normalizeCommercial(value[value.tipo === 'REMITO' ? 'remito' : 'factura']);
const documentSupplier = value => String(value.proveedor ?? '').trim();
const documentIdentity = value => [value.tipo, documentSupplier(value), documentPrincipal(value)];

// Shared by document mutations, including legacy API callers. Responses and roles
// remain unchanged; identity checks must not be bypassed by omitting Operator headers.
export async function prepareDocumentIdentity(transaction, db, validation, targetId, before = null) {
  if (!isDocument(validation) || !documentSupplier(validation) || !documentPrincipal(validation)) return null;
  // Every document touches its own commercial identity and any explicit reference.
  // A counterpart with only a reverse reference still shares at least one guard.
  // These are transaction versions, not persistent lock flags or expiring leases.
  const opposite = validation.tipo === 'REMITO' ? 'FACTURA' : 'REMITO';
  const relatedNumber = normalizeCommercial(validation[validation.tipo === 'REMITO' ? 'factura' : 'remito']);
  const identities = [documentIdentity(validation)];
  if (relatedNumber) identities.push([opposite, documentSupplier(validation), relatedNumber]);
  if (isDocument(before) && documentSupplier(before) && documentPrincipal(before)) {
    identities.push(documentIdentity(before));
    const previousNumber = normalizeCommercial(before[before.tipo === 'REMITO' ? 'factura' : 'remito']);
    if (previousNumber) identities.push([before.tipo === 'REMITO' ? 'FACTURA' : 'REMITO', documentSupplier(before), previousNumber]);
  }
  const guards = [...new Set(identities.map(value => fingerprint(value)))].sort()
    .map(key => db.collection('contadores').doc(`operatorDocumentoVinculo_${key}`));
  for (const ref of guards) await transaction.get(ref);
  const rows = await transaction.get(db.collection('eventos').where('tipo', 'in', ['REMITO', 'FACTURA']));
  const key = fingerprint(documentIdentity(validation));
  const uniqueRef = db.collection('contadores').doc(`operatorDocumentoUnico_${key}`);
  await transaction.get(uniqueRef);
  const others = rows.docs.filter(doc => doc.id !== targetId).map(doc => ({ ...doc.data(), id: doc.id }));
  if (others.some(doc => fingerprint(documentIdentity(doc)) === key)) fail('Ya existe un comprobante con ese tipo, proveedor y número', 409);
  let oldReservation = null;
  if (isDocument(before) && fingerprint(documentIdentity(before)) !== key) {
    const ref = db.collection('contadores').doc(`operatorDocumentoUnico_${fingerprint(documentIdentity(before))}`);
    oldReservation = { ref, snapshot: await transaction.get(ref) };
  }
  return { key, others, write(tx, now, requestId) {
    // A stale reservation after a legacy deletion/renumbering is reusable only
    // after the transactional query above proves no document owns this identity.
    tx.set(uniqueRef, { eventoId: targetId, tipo: validation.tipo, proveedor: validation.proveedor, numero: documentPrincipal(validation), fecha: now });
    for (const ref of guards) tx.set(ref, { solicitud: requestId, fecha: now });
    if (oldReservation?.snapshot.exists && oldReservation.snapshot.data().eventoId === targetId) tx.delete(oldReservation.ref);
  } };
}

async function guardDocument(transaction, proxy, db, context, before, operation, validation) {
  const reservation = await prepareDocumentIdentity(transaction, db, validation, operation.ref.id, before);
  if (!reservation) fail('Identidad documental incompleta');
  const { key, others } = reservation;
  const linked = validation.movimientoStock === 'SIN MOVIMIENTO' ? [] : others.filter(doc => {
    if (doc.tipo === validation.tipo || documentSupplier(doc) !== documentSupplier(validation) || doc.movimientoStock === 'SIN MOVIMIENTO') return false;
    const relatedField = validation.tipo === 'REMITO' ? 'factura' : 'remito';
    const reverseField = validation.tipo === 'REMITO' ? 'remito' : 'factura';
    return (normalizeCommercial(validation[relatedField]) && normalizeCommercial(validation[relatedField]) === documentPrincipal(doc))
      || (normalizeCommercial(doc[reverseField]) && normalizeCommercial(doc[reverseField]) === documentPrincipal(validation));
  });
  if (linked.length) {
    const { confirmacionVinculo: _confirmation, ...concreteBody } = validation;
    const operationHash = fingerprint([context.uid, context.requestId, context.id || null, context.revision || null, concreteBody]);
    const linkedHash = fingerprint(linked.map(doc => [doc.id, recordRevision(doc)]).sort((a, b) => a[0].localeCompare(b[0])));
    const challengeId = `operatorDocumentoConfirmacion_${fingerprint([operationHash, linkedHash])}`;
    const challengeRef = db.collection('contadores').doc(challengeId);
    const challenge = await transaction.get(challengeRef);
    const ack = context.body.confirmacionVinculo;
    const valid = challenge.exists && challenge.data().uid === context.uid && challenge.data().solicitud === context.requestId
      && challenge.data().operacion === operationHash && challenge.data().vinculos === linkedHash
      && challenge.data().vence > Date.now() && ack?.desafio === challengeId
      && typeof ack.justificacion === 'string' && ack.justificacion.trim().length >= 10 && ack.justificacion.trim().length <= 1000;
    if (!valid) {
      // Only the challenge commits. Buffered document, counter and stock writes are discarded.
      if (!challenge.exists || challenge.data().vence <= Date.now()) transaction.set(challengeRef, {
        uid: context.uid, solicitud: context.requestId, operacion: operationHash, vinculos: linkedHash,
        vence: Date.now() + 30 * 60000, fecha: context.now(),
      });
      return { documentWarning: true, desafio: challengeId, documentos: linked.map(doc => ({ id: doc.id, tipo: doc.tipo, numero: doc[doc.tipo === 'REMITO' ? 'remito' : 'factura'], movimiento: doc.movimientoStock || 'Movimiento no declarado' })),
        error: 'Los comprobantes vinculados pueden registrar dos movimientos. Confirmá esta operación con una justificación de 10 a 1000 caracteres.' };
    }
    operation.args[0].vinculoConfirmado = { uid: context.uid, justificacion: ack.justificacion.trim(), documentos: linked.map(doc => doc.id), revisionVinculos: linkedHash, solicitud: context.requestId, fecha: context.now() };
  }
  reservation.write(proxy, context.now(), context.requestId);
  operation.args[0].documentoClave = key;
  return null;
}
