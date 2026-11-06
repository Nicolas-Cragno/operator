export const isDocument = value => ['REMITO', 'FACTURA'].includes(value?.tipo);
export const normalizeCommercial = value => String(value ?? '').normalize('NFKC').trim().toUpperCase().replace(/[\s./-]+/g, '');
export const normalizeCurrency = value => {
  const currency = String(value ?? 'pesos').trim().toLowerCase();
  if (['ars', 'pesos'].includes(currency)) return 'pesos';
  if (['usd', 'dolares'].includes(currency)) return 'dolares';
  fail('Moneda inválida: ARS o USD');
};
export const DOCUMENT_FIELDS = ['tipo', 'movimientoStock', 'area', 'proveedor', 'sucursal', 'deposito', 'fechaEmision', 'remito', 'factura', 'moneda', 'descuento', 'ingresos', 'detalle', 'confirmacionVinculo'];
export function documentInput(record) {
  return Object.fromEntries(DOCUMENT_FIELDS.filter(key => key in record).map(key => [key, record[key]]));
}
export function documentDay(value) {
  if (value == null || value === '') return null;
  if (value?.toDate) return value.toDate().toISOString().slice(0, 10);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('Fecha de emisión inválida');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('Fecha de emisión inválida');
  return value;
}
export function validateDocumentPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length || Object.keys(input).some(key => !DOCUMENT_FIELDS.includes(key))) fail('Campos documentales no editables');
  for (const key of ['tipo', 'movimientoStock', 'area', 'proveedor', 'sucursal', 'deposito', 'remito', 'factura', 'moneda', 'detalle']) if (key in input && input[key] != null && typeof input[key] !== 'string') fail(`${key} debe ser texto`);
  for (const key of ['proveedor', 'sucursal', 'deposito']) if (input[key] && (input[key].includes('/') || ['.', '..'].includes(input[key]) || input[key].length > 120)) fail(`Referencia ${key} inválida`);
  if ('confirmacionVinculo' in input) {
    const ack = input.confirmacionVinculo;
    if (!ack || typeof ack !== 'object' || Array.isArray(ack) || Object.keys(ack).some(key => !['desafio', 'justificacion'].includes(key))
      || typeof ack.desafio !== 'string' || !/^operatorDocumentoConfirmacion_[a-f0-9]{64}$/.test(ack.desafio)
      || typeof ack.justificacion !== 'string' || ack.justificacion.trim().length < 10 || ack.justificacion.length > 1000) fail('Confirmación documental inválida');
  }
  return { ...input };
}
export function validateDocumentBody(input) {
  validateDocumentPatch(input);
  const body = { ...input };
  if (!isDocument(body)) fail('Tipo de documento inválido');
  if (!['ALTA', 'BAJA', 'SIN MOVIMIENTO'].includes(body.movimientoStock)) fail('Seleccioná el movimiento del documento');
  for (const key of ['area', 'proveedor', 'sucursal', 'deposito', 'remito', 'factura', 'detalle']) {
    if (body[key] != null && typeof body[key] !== 'string') fail(`${key} debe ser texto`);
    body[key] = (body[key] || '').trim();
    if (body[key].length > (key === 'detalle' ? 4000 : 120)) fail(`${key} es demasiado largo`);
  }
  body.area = body.area.toLowerCase();
  body.remito = body.remito.normalize('NFKC').toUpperCase();
  body.factura = body.factura.normalize('NFKC').toUpperCase();
  const numberField = body.tipo === 'REMITO' ? 'remito' : 'factura';
  if (!body.area || !body.proveedor || !normalizeCommercial(body[numberField])) fail('Área, proveedor y número comercial son obligatorios');
  for (const key of ['proveedor', 'sucursal', 'deposito']) if (body[key] && (body[key].includes('/') || ['.', '..'].includes(body[key]))) fail(`Referencia ${key} inválida`);
  if (body.movimientoStock !== 'SIN MOVIMIENTO' && !body.deposito) fail('El depósito es obligatorio con movimiento');
  body.fechaEmision = documentDay(body.fechaEmision);
  body.moneda = normalizeCurrency(body.moneda);
  if (!Array.isArray(body.ingresos) || body.ingresos.length > 50 || (body.movimientoStock !== 'SIN MOVIMIENTO' && !body.ingresos.length)) fail('Indicá artículos para el movimiento (máximo 50)');
  const seen = new Set();
  body.ingresos = body.ingresos.map(line => {
    if (!line || typeof line !== 'object' || Array.isArray(line) || Object.keys(line).some(key => !['id', 'cantidad', 'unidad', 'valor', 'moneda'].includes(key))) fail('Artículo documental inválido');
    if (typeof line.id !== 'string' || !line.id.trim() || line.id !== line.id.trim() || line.id.includes('/') || ['.', '..'].includes(line.id) || line.id.length > 120 || seen.has(line.id)) fail('Artículo inválido o repetido');
    seen.add(line.id);
    validateQuantity(line.cantidad, line.unidad);
    if (typeof line.unidad !== 'string' || !line.unidad.trim() || line.unidad.length > 20) fail('Unidad obligatoria');
    if (typeof line.valor !== 'number' || !Number.isFinite(line.valor) || line.valor < 0) fail('Precio inválido');
    if (line.moneda && normalizeCurrency(line.moneda) !== body.moneda) fail('No se permiten monedas mezcladas');
    return { id: line.id, cantidad: line.cantidad, unidad: line.unidad, valor: line.valor, moneda: body.moneda };
  });
  if (typeof body.descuento !== 'number' || !Number.isFinite(body.descuento) || body.descuento < 0 || body.descuento > 100) fail('Descuento inválido');
  let amounts;
  try { amounts = calculateDocumentAmounts(body.ingresos, body.descuento); } catch (error) { fail(error.message); }
  body.ingresos = body.ingresos.map((line, index) => ({ ...line, valor: amounts.prices[index] }));
  const { prices: _prices, ...totals } = amounts;
  return { ...body, ...totals, documentoVersion: 1 };
}
export function documentSchema() {
  return { required: [], reference: { proveedor: 'proveedores', sucursal: 'ubicaciones', deposito: 'depositos' }, lines: ['ingresos'], document: true };
}
