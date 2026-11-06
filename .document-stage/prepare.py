from pathlib import Path
import json, hashlib, sys
from datetime import datetime, timezone
ROOT = Path(r'C:\Users\NIcolas Cragno\Desktop\aplicaciones')
STAGE = Path(__file__).parent
BACK = ROOT / 'cantapp-back/functions'
COMP = ROOT / 'Cantapp/cantapp-components/src'
CHANGES = {}
SOURCE_BYTES = {}
TARGETS = [BACK/'services/operator-operations.contract.js', BACK/'services/operator-write.service.js', BACK/'services/eventos.service.js',
           BACK/'controllers/eventos.controller.js', BACK/'services/services.js', BACK/'controllers/consultas.controller.js',
           BACK/'services/relaciones.service.js', BACK/'services/stock.service.js', COMP/'data/administrationFields.js',
           COMP/'index.js', COMP/'components/Form/articleLines.jsx', COMP/'components/Form/formStandard.jsx']
def read(path):
    if path not in SOURCE_BYTES: SOURCE_BYTES[path] = path.read_bytes()
    return SOURCE_BYTES[path].decode('utf-8-sig').replace('\r\n','\n')
def put(path, content):
    if path not in SOURCE_BYTES: SOURCE_BYTES[path] = path.read_bytes() if path.exists() else b''
    CHANGES[str(path)] = {'hash': hashlib.sha256(SOURCE_BYTES[path]).hexdigest() if path.exists() else None, 'base': SOURCE_BYTES[path].decode('utf-8'), 'content':content}
def sub(text, old, new):
    if old not in text: raise ValueError('Missing replacement: '+old[:100])
    return text.replace(old,new)
if '--apply' in sys.argv:
    manifest=(STAGE/'changes.json').read_bytes()
    changes=json.loads(manifest.decode('utf-8'))
    if {Path(name).resolve() for name in changes} != {path.resolve() for path in TARGETS}: raise ValueError('Unexpected integration manifest')
    manifest_hash=hashlib.sha256(manifest).hexdigest()
    state=json.loads((STAGE/'integration.json').read_text(encoding='utf-8')) if (STAGE/'integration.json').exists() else {'manifestHash':manifest_hash,'files':{}}
    if state['manifestHash'] != manifest_hash: raise ValueError('Manifest changed after integration started')
    for name,change in changes.items():
        path=Path(name).resolve()
        if not any(path.is_relative_to(root.resolve()) for root in [BACK,COMP]): raise ValueError('Invalid target '+name)
        current=hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
        expected=hashlib.sha256(change['content'].encode('utf-8')).hexdigest()
        if current not in [change['hash'],expected]: raise ValueError('Source changed '+name)
    for name,change in changes.items():
        path=Path(name)
        current=hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
        expected=hashlib.sha256(change['content'].encode('utf-8')).hexdigest()
        if current == change['hash']: path.write_bytes(change['content'].encode('utf-8'))
        elif current != expected: raise ValueError('Source changed during integration '+name)
        state['files'][name]={'before':change['hash'],'applied':expected}
        state['updatedAt']=datetime.now(timezone.utc).isoformat()
        (STAGE/'integration.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf-8')
        print(name)
    sys.exit(0)

if (STAGE/'integration.json').exists():
    raise ValueError('Integration already recorded; review the retained manifest instead of regenerating transformations')

contract=read(BACK/'services/operator-operations.contract.js')
contract=sub(contract,'  if (!creating) return null;',"  if (collection === 'eventos' && isDocument(input)) return documentSchema();\n  if (!creating) return null;")
contract += '\n'+read(STAGE/'money.js')+'\n'+read(STAGE/'document-contract.js')
put(BACK/'services/operator-operations.contract.js',contract)

writer=read(BACK/'services/operator-write.service.js')
id_guard=next(line for line in writer.splitlines() if line.startswith('  if (id != null &&'))
writer=sub(writer,id_guard+'\n','')
writer=sub(writer,'export function validateOperatorBody(collection, input, creating, id) {\n','export function validateOperatorBody(collection, input, creating, id) {\n'+id_guard+'\n')
writer=sub(writer,"import { operationSchema, validateLines, validateOperation, validateQuantity, OPERATION_RULES, PORTERIA_BLOCKED_REASON }", "import { operationSchema, validateLines, validateOperation, validateQuantity, OPERATION_RULES, PORTERIA_BLOCKED_REASON, isDocument, normalizeCommercial, validateDocumentBody, validateDocumentPatch, documentInput, documentSchema }")
writer=sub(writer,'operations: { version: 2, rules:',"operations: { version: 2, documents: { version: 1, enabled: modules.includes('documentos') }, rules:")
writer=sub(writer,'  if (resources.includes(collection) && modules.some',"  if (collection === 'eventos' && isDocument(document)) {\n    if (modules.includes('documentos')) return;\n    fail('Sin permiso para Documentos', 403);\n  }\n  if (resources.includes(collection) && modules.some")
writer=sub(writer,'  const schema = operationSchema(collection, input, creating) || definitions[collection];',"  if (collection === 'eventos' && creating && isDocument(input)) {\n    if (id) fail('El identificador lo genera el servidor');\n    return validateDocumentBody(input);\n  }\n  if (collection === 'eventos' && !creating && Object.keys(input || {}).some(key => key !== 'detalle')) return validateDocumentPatch(input);\n  const schema = operationSchema(collection, input, creating) || definitions[collection];")
writer=sub(writer,'      const after = { ...before, ...operation.args[0] };', '''      let after = { ...before, ...operation.args[0] };
      const document = context.collection === 'eventos' && isDocument(after);
      let validationBody = context.body;
      if (document) {
        if (!context.creating) {
          if (before.documentoVersion !== 1) fail('Documento histórico disponible únicamente para consulta', 422);
          const allowed = before.movimientoStock === 'SIN MOVIMIENTO'
            ? DOCUMENT_EDIT_FIELDS : ['detalle', 'fechaEmision', 'sucursal'];
          if (Object.keys(context.body).some(key => !allowed.includes(key))) fail('Esta edición alteraría datos documentales protegidos', 422);
          if (before.movimientoStock === 'SIN MOVIMIENTO') {
            validationBody = validateDocumentBody({ ...documentInput(before), ...context.body });
            const { confirmacionVinculo: _ack, ...persisted } = validationBody;
            operation.args[0] = { ...persisted, movimientos: [] };
          } else {
            if ('detalle' in context.body && (typeof context.body.detalle !== 'string' || context.body.detalle.length > 4000)) fail('Detalle inválido');
            if ('fechaEmision' in context.body) operation.args[0].fechaEmision = documentDay(context.body.fechaEmision);
          }
        }
        if (typeof operation.args[0].fechaEmision === 'string') operation.args[0].fechaEmision = Timestamp.fromDate(new Date(`${operation.args[0].fechaEmision}T12:00:00Z`));
        after = { ...before, ...operation.args[0] };
      } else if (context.collection === 'eventos' && Object.keys(context.body).some(key => key !== 'detalle') && !context.creating) fail('Solo se permite editar el detalle', 422);''')
writer=sub(writer,"import { createHash } from 'node:crypto';", "import { createHash } from 'node:crypto';\nimport { Timestamp } from 'firebase-admin/firestore';")
writer=sub(writer,'documentSchema }','documentSchema, documentDay }')
writer=sub(writer,'      const schema = operationSchema(context.collection, context.body, context.creating) || definitions[context.collection];',"      const schema = document ? documentSchema() : operationSchema(context.collection, context.body, context.creating) || definitions[context.collection];")
writer=sub(writer,'        if (!(field in context.body)) continue;', '        if (!(field in validationBody)) continue;')
writer=sub(writer,'Array.isArray(context.body[field]) ? context.body[field] : [context.body[field]]','Array.isArray(validationBody[field]) ? validationBody[field] : [validationBody[field]]')
writer=sub(writer,'for (const item of context.body[field])','for (const item of validationBody[field] || [])')
writer=sub(writer,"if (field === 'repuestos' && item.unidad !== article.data().unidad)","if ((field === 'repuestos' || document) && item.unidad !== article.data().unidad)")
writer=sub(writer,'      const now = context.now();', '''      if (document) {
        const sectors = await transaction.get(db.collection('sectores'));
        const area = after.area;
        if (!sectors.docs.some(doc => String(doc.data().nombre || '').trim().toLowerCase() === area)) fail('Área documental inexistente', 422);
        if (context.creating || before.movimientoStock === 'SIN MOVIMIENTO') {
          const warning = await guardDocument(transaction, proxy, db, context, before, operation, validationBody);
          if (warning) return warning;
        }
      }
      const now = context.now();''')
writer += "\nconst DOCUMENT_EDIT_FIELDS = ['proveedor', 'sucursal', 'deposito', 'fechaEmision', 'remito', 'factura', 'moneda', 'descuento', 'ingresos', 'detalle', 'confirmacionVinculo'];\n"+read(STAGE/'document-guard.js')
put(BACK/'services/operator-write.service.js',writer)

events=read(BACK/'services/eventos.service.js')
events="import { isDocument } from './operator-operations.contract.js';\n"+events
events=sub(events,"  const consumoOperator = operatorContext.getStore()?.creating", "  const documentOperator = operatorContext.getStore()?.creating && isDocument(data);\n  const consumoOperator = !documentOperator && operatorContext.getStore()?.creating")
events=sub(events,"    const movimientos = consumoOperator ? data.repuestos.map(item => ({ ...item, cantidad: -item.cantidad })) : [];", "    const movimientos = documentOperator\n      ? data.movimientoStock === 'SIN MOVIMIENTO' ? [] : data.ingresos.map(({ id, cantidad, unidad }) => ({ id, unidad, cantidad: data.movimientoStock === 'BAJA' ? -cantidad : cantidad }))\n      : consumoOperator ? data.repuestos.map(item => ({ ...item, cantidad: -item.cantidad })) : [];")
events=sub(events,'    const escribirStock = consumoOperator', '    const escribirStock = consumoOperator || (documentOperator && movimientos.length > 0)')
events=sub(events,'      ...(consumoOperator ? { movimientos } : {}),', "      ...(consumoOperator ? { movimientos } : {}),\n      ...(documentOperator ? { movimientos, modificaciones: [], ingresos: data.ingresos.map(line => ({ ...line, cantidad: data.movimientoStock === 'BAJA' ? -line.cantidad : line.cantidad })) } : {}),")
# Confirmation is carried by the request audit, never accepted as persisted authority.
events=sub(events,'  const datosEvento = area ===', '  const { confirmacionVinculo: _ack, ...documentData } = data;\n  const datosEvento = documentOperator ? documentData : area ===')
put(BACK/'services/eventos.service.js',events)

controller=read(BACK/'controllers/eventos.controller.js')
controller=sub(controller,'    return res.status(201).json(nuevoEvento);', '    if (nuevoEvento?.documentWarning) return res.status(409).json(nuevoEvento);\n    return res.status(201).json(nuevoEvento);')
controller=sub(controller,'    return res.json(eventoActualizado);','    if (eventoActualizado?.documentWarning) return res.status(409).json(eventoActualizado);\n    return res.json(eventoActualizado);')
put(BACK/'controllers/eventos.controller.js',controller)

services=read(BACK/'services/services.js')
# Guard only the new documents; legacy data and permissions keep their prior contracts.
services=sub(services,'      if (!snap.exists) return false;\n      let datos = data;', "      if (!snap.exists) return false;\n      if (coleccion === 'eventos' && snap.data().documentoVersion === 1 && !finalRelations) throw Object.assign(new Error('Este documento requiere el contrato Operator'), { status: 422 });\n      let datos = data;")
services=sub(services,'    if (!actualizado) return null;\n    return { id, ...data };','    if (!actualizado) return null;\n    return finalRelations ? actualizado : { id, ...data };')
services=sub(services,'      if (!snap.exists) return false;\n      if (RELACIONES[coleccion])',"      if (!snap.exists) return false;\n      if (coleccion === 'eventos' && snap.data().documentoVersion === 1) throw Object.assign(new Error('La eliminación y anulación documental no están habilitadas'), { status: 422 });\n      if (RELACIONES[coleccion])")
put(BACK/'services/services.js',services)

queries=read(BACK/'controllers/consultas.controller.js')
queries="import { obtenerBootstrap } from '../services/apps.service.js';\nimport { extraerRelaciones } from '../services/relaciones.service.js';\nimport { isDocument, documentDay } from '../services/operator-operations.contract.js';\n"+queries
queries=sub(queries,'      if (req.query.id !== undefined) {',"      if (collection === 'eventos' && req.query.documentos === '1') return await consultarDocumentos(req, res, limit, cursor);\n      if (req.query.id !== undefined) {")
queries += '\n'+read(STAGE/'document-query.js')
put(BACK/'controllers/consultas.controller.js',queries)

relations=read(BACK/'services/relaciones.service.js')
relations=sub(relations,'  const esquema = RELACIONES[coleccion];', "  const esquema = coleccion === 'eventos' && documento?.documentoVersion === 1 && ['REMITO', 'FACTURA'].includes(documento.tipo)\n    ? { ...RELACIONES.eventos, depositos: ['deposito'], ubicaciones: ['sucursal'] } : RELACIONES[coleccion];")
put(BACK/'services/relaciones.service.js',relations)

stock=read(BACK/'services/stock.service.js')
stock=sub(stock,'.select("movimientos",', '.select("documentoVersion", "movimientoStock", "remito", "factura", "movimientos",')
stock=sub(stock,'    const movimientos = [];\n    const trabajos = [];','    const movimientos = [];\n    const documentos = [];\n    const trabajos = [];')
stock=sub(stock,"        const stockEvent = tipo === 'STOCK' || transferencia || taller || /AJUSTE/.test(tipo);", "        const documento = ['REMITO', 'FACTURA'].includes(tipo);\n        if (documento && stockEntries(data.ingresos, articuloId).length) documentos.push({ id: doc.id, tipo, numero: data.remito || data.factura, fecha, movimiento: data.movimientoStock || 'Movimiento no declarado', impactoConfirmado: data.documentoVersion === 1 });\n        const stockEvent = tipo === 'STOCK' || transferencia || taller || /AJUSTE/.test(tipo) || (documento && data.documentoVersion === 1 && ['ALTA', 'BAJA'].includes(data.movimientoStock));")
stock=sub(stock,"transferencia ? 'transferencia' : taller ? 'consumoTaller' :", "transferencia ? 'transferencia' : documento ? 'movimientoDocumento' : taller ? 'consumoTaller' :")
stock=sub(stock,'return { id: articuloId, existencias, movimientos, trabajos: trabajos.slice(0, 5) };', 'return { id: articuloId, existencias, movimientos, documentos, trabajos: trabajos.slice(0, 5) };')
put(BACK/'services/stock.service.js',stock)

# Read capability is also exposed to the existing read-only user role.
writer=CHANGES[str(BACK/'services/operator-write.service.js')]['content']
writer=sub(writer,"resources: [], eventAreas: [], assignments: false };", "resources: [], eventAreas: [], assignments: false, operations: { version: 2, documents: { version: 1, enabled: false, read: modules.includes('documentos') }, rules: OPERATION_RULES } };")
writer=sub(writer,"enabled: modules.includes('documentos') },", "enabled: modules.includes('documentos'), read: modules.includes('documentos') },")
put(BACK/'services/operator-write.service.js',writer)

# The old controller contract cannot be used to forge a new-format document.
controller=CHANGES[str(BACK/'controllers/eventos.controller.js')]['content']
controller="import { operatorContext } from '../services/operator-write.service.js';\n"+controller
controller=sub(controller,'    const { id, ...data } = req.body;', "    if (req.body.documentoVersion != null && !operatorContext.getStore()) return res.status(422).json({ error: 'El contrato documental nuevo requiere Operator' });\n    const { id, ...data } = req.body;")
put(BACK/'controllers/eventos.controller.js',controller)

fields=read(COMP/'data/administrationFields.js')
fields=sub(fields,"modality = 'interna', rules = {}", "modality = 'interna', rules = {}, documentType = 'REMITO', movement = '', administrativeOnly = false")
fields=sub(fields,"  if (type === 'detalle')",read(STAGE/'document-fields.js')+"  if (type === 'detalle')")
fields += '\n'+read(STAGE/'money.js')
put(COMP/'data/administrationFields.js',fields)
index=read(COMP/'index.js')
index=sub(index,"export { administrationFields }", "export { administrationFields, calculateDocumentAmounts }")
put(COMP/'index.js',index)

article=read(COMP/'components/Form/articleLines.jsx')
article=sub(article,'includeUnit = false, quantityRules = {}','includeUnit = false, includeMoney = false, quantityRules = {}')
article=sub(article,"    if (includeUnit && !item.unidad)","    if (includeMoney && (!Number.isFinite(Number(item.valor ?? 0)) || Number(item.valor ?? 0) < 0)) return 'Precio inválido';\n    if (includeUnit && !item.unidad)")
article=sub(article,'options = [], includeUnit = false })','options = [], includeUnit = false, includeMoney = false, currency = \'pesos\' })')
article=sub(article,'      {includeUnit && <Text', '      {includeMoney && <NumberInput label={`Precio unitario ${index + 1} (${currency === \'dolares\' ? \'USD\' : \'ARS\'})`} disabled={disabled} value={row.valor ?? 0} onChange={valor => update(index, { valor })} />}\n      {includeUnit && <Text')
article=sub(article,"{ id: '', cantidad: '', ...(includeUnit", "{ id: '', cantidad: '', ...(includeMoney ? { valor: 0 } : {}), ...(includeUnit")
put(COMP/'components/Form/articleLines.jsx',article)
form=read(COMP/'components/Form/formStandard.jsx')
form="import { calculateDocumentAmounts } from '../../data/administrationFields';\n"+form
form=sub(form,'includeUnit={field.includeUnit} options=', 'includeUnit={field.includeUnit} includeMoney={field.includeMoney} currency={values.moneda} options=')
form=sub(form,"  if(field.type==='checks')return", "  if(field.type==='documentTotals'){let text;try{const totals=calculateDocumentAmounts(values.ingresos||[],values.descuento||0);text=`Subtotal: ${totals.importesDecimales.subtotal} · Descuento: ${totals.descuento}% · Total: ${totals.importesDecimales.total} ${values.moneda==='dolares'?'USD':'ARS'}`;}catch{text='Completá cantidades y precios válidos para calcular los importes';}return <Text accessibilityRole=\"text\" style={{color:t.text}}>{text}</Text>;}\n  if(field.type==='checks')return")
form=sub(form,"'articleLines','checks'].includes", "'articleLines','checks','documentTotals'].includes")
put(COMP/'components/Form/formStandard.jsx',form)

# Final corrections after recovery. These remain scoped to new-format documents.
writer=CHANGES[str(BACK/'services/operator-write.service.js')]['content']
writer=sub(writer,"validationBody = validateDocumentBody({ ...documentInput(before), ...context.body });", "const merged = { ...documentInput(before), ...context.body };\n            if (context.body.moneda && !('ingresos' in context.body)) merged.ingresos = merged.ingresos.map(line => ({ ...line, moneda: context.body.moneda }));\n            validationBody = validateDocumentBody(merged);")
writer=sub(writer,"          if (before.documentoVersion !== 1) fail('Documento histórico disponible únicamente para consulta', 422);", "          if (before.documentoVersion !== 1 || !['ALTA', 'BAJA', 'SIN MOVIMIENTO'].includes(before.movimientoStock) || !Array.isArray(before.movimientos)) fail('Documento histórico o inconsistente disponible únicamente para consulta', 422);\n          if (before.movimientoStock === 'SIN MOVIMIENTO' && before.movimientos.length) fail('El ledger del documento requiere revisión', 422);")
writer=sub(writer,"if (context.creating && ['eventos', 'asignaciones'].includes(context.collection) && reference.data().estado === false)", "if ((context.creating || (document && String(before?.[field] ?? '') !== String(value))) && ['eventos', 'asignaciones'].includes(context.collection) && reference.data().estado === false)")
writer=sub(writer,'      const changes = Object.fromEntries(Object.entries(context.body)', "      const auditBody = document ? Object.fromEntries(Object.entries({ ...operation.args[0], ...(context.body.confirmacionVinculo ? { confirmacionVinculo: context.body.confirmacionVinculo } : {}) }).filter(([key]) => !['fecha', 'orden', 'usuario', 'fechaCreacion', 'ultimaModificacion', 'fechaRelacion', 'relacionEstablecida', 'historialModificaciones', 'modificaciones'].includes(key))) : context.body;\n      const changes = Object.fromEntries(Object.entries(auditBody)")
put(BACK/'services/operator-write.service.js',writer)

services=CHANGES[str(BACK/'services/services.js')]['content']
services=sub(services,"if (coleccion === 'eventos' && snap.data().documentoVersion === 1 && !finalRelations)", "if (coleccion === 'eventos' && ['REMITO', 'FACTURA'].includes(snap.data().tipo) && !finalRelations && (snap.data().documentoVersion === 1 || ['documentoVersion', 'movimientoStock', 'documentoClave', 'vinculoConfirmado', 'importesDecimales'].some(key => key in data)))")
services=sub(services,"if (coleccion === 'eventos' && snap.data().documentoVersion === 1) throw", "if (coleccion === 'eventos' && ['REMITO', 'FACTURA'].includes(snap.data().tipo) && snap.data().documentoVersion === 1) throw")
put(BACK/'services/services.js',services)
stock=CHANGES[str(BACK/'services/stock.service.js')]['content']
stock=sub(stock,'numero: data.remito || data.factura,','numero: data[tipo === \'REMITO\' ? \'remito\' : \'factura\'],')
put(BACK/'services/stock.service.js',stock)

# Commercial identity checks are shared with legacy API writes so the same
# uniqueness reservation cannot be bypassed without Operator headers.
events=CHANGES[str(BACK/'services/eventos.service.js')]['content']
events=sub(events,"import { operatorContext }", "import { operatorContext, prepareDocumentIdentity }")
events=sub(events,'    const timestamp = admin.firestore.FieldValue.serverTimestamp();', "    const legacyIdentity = !operatorContext.getStore() && isDocument(data)\n      ? await prepareDocumentIdentity(transaction, db, data, id) : null;\n    const timestamp = admin.firestore.FieldValue.serverTimestamp();")
events=sub(events,'    escribirStock?.();',"    escribirStock?.();\n    legacyIdentity?.write(transaction, admin.firestore.Timestamp.now(), 'legacy');")
put(BACK/'services/eventos.service.js',events)
services=CHANGES[str(BACK/'services/services.js')]['content']
services=sub(services,'import { operatorContext, controlledTransaction }','import { operatorContext, controlledTransaction, prepareDocumentIdentity }')
# The two callbacks use different transaction names; keep all reads before writes.
start=services.index('export async function agregar(')
end=services.index('export async function modificar(',start)
add=services[start:end]
add=sub(add,'      let datos = data;',"      const documentReservation = coleccion === 'eventos' && !finalRelations ? await prepareDocumentIdentity(transaction, db, data, id) : null;\n      let datos = data;")
add=sub(add,'      transaction.create(ref, datos);',"      documentReservation?.write(transaction, new Date(), 'legacy');\n      transaction.create(ref, datos);")
services=services[:start]+add+services[end:]
start=services.index('export async function modificar(')
end=services.index('export async function eliminar(',start)
edit=services[start:end]
edit=sub(edit,'      let datos = data;',"      const documentReservation = coleccion === 'eventos' && !finalRelations ? await prepareDocumentIdentity(tx, db, { ...snap.data(), ...data }, id, snap.data()) : null;\n      let datos = data;")
edit=sub(edit,'      tx.update(aux, datos);',"      documentReservation?.write(tx, new Date(), 'legacy');\n      tx.update(aux, datos);")
services=services[:start]+edit+services[end:]
put(BACK/'services/services.js',services)

(STAGE/'changes.json').write_text(json.dumps(CHANGES,ensure_ascii=False,indent=2),encoding='utf-8')
for name in CHANGES: print(name)
