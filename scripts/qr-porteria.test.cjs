const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function service(apiGet = async () => {}, detail = async () => {}) {
  const source = fs.readFileSync('src/services/qrPorteria.service.js', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  const imports = {
    '../config/app.config': { default: { appId: 'operator' } },
    './api.service': { apiGet }, './recordDetails.service': { loadRecordDetail: detail },
  };
  new Function('require', 'module', 'exports', code)(name => imports[name], module, module.exports);
  return module.exports;
}
const resource = { entity: 'tractores', id: 'T1' };
const movement = { id: 'E1', orden: 12, area: 'porteria', tipo: 'ENTRADA', ubicacion: '01', tractor: ['T1'], furgon: ['F1'], persona: 'P1', cliente: 'C1', cargado: true };

test('ubicación física: entrada local, entrada en otra sucursal y salida', () => {
  const { porteriaInitialValues: initial } = service();
  assert.equal(initial(resource, movement, '01').tipo, 'SALIDA');
  assert.equal(initial(resource, movement, '02').tipo, 'ENTRADA');
  assert.equal(initial(resource, { ...movement, tipo: 'SALIDA' }, '01').tipo, 'ENTRADA');
  assert.equal(initial(resource, { ...movement, ubicacion: undefined, sucursal: '01' }, '01').tipo, 'SALIDA');
  assert.equal(initial(resource, { ...movement, sucursal: '02' }, '01').tipo, 'SALIDA');
});
test('sin sucursal, movimiento, orden inequívoco o tipo válido no se sugiere operación', () => {
  const { porteriaInitialValues: initial } = service();
  assert.equal(initial(resource, movement, null).tipo, undefined);
  assert.equal(initial(resource, { ...movement, ubicacion: null }, '01').tipo, undefined);
  assert.equal(initial(resource, { ...movement, tipo: 'RETIRA' }, '01').tipo, undefined);
  assert.equal(initial(resource, movement, '01', null, true).tipo, undefined);
  assert.equal(initial(resource, null, '01', { estadoViaje: 'PROGRAMADO', tipo: 'SALIDA' }).tipo, undefined);
});
test('precarga referencias del evento, mantiene el escaneado y no copia metadatos ni chequeos', () => {
  const { porteriaInitialValues: initial } = service();
  const result = initial({ entity: 'furgones', id: 'F1' }, movement, '01', { persona: 'otra' });
  assert.deepEqual(result.tractor, ['T1']);
  assert.deepEqual(result.furgon, ['F1']);
  assert.equal(result.persona, 'P1');
  assert.equal(result.cliente, 'C1');
  assert.equal(result.cargado, true);
  assert.equal(result.id, undefined);
  assert.equal(result.chequeos, undefined);
});
test('consulta cronológica exacta y continuación de páginas vacías', async () => {
  const calls = [];
  const { loadQRPorteria } = service(async (path, query) => {
    calls.push({ path, query });
    return calls.length === 1 ? { data: [], pagination: { hasNext: true, nextCursor: 'next' } }
      : { data: [movement], pagination: { hasNext: false } };
  }, async () => movement);
  const result = await loadQRPorteria(resource, '01');
  assert.equal(result.initial.tipo, 'SALIDA');
  assert.equal(calls[0].query.tractor, 'T1');
  assert.equal(calls[0].query.tipos, 'ENTRADA,SALIDA');
  assert.equal(calls[1].query.cursor, 'next');
});
test('historial vacío o ambiguo no hereda SALIDA de un viaje programado', async () => {
  const empty = service(async () => ({ data: [], pagination: { hasNext: false } }));
  assert.equal((await empty.loadQRPorteria(resource, '01', { tipo: 'SALIDA' })).initial.tipo, undefined);
  const tied = service(async () => ({ data: [movement, { ...movement, id: 'E2' }], pagination: { hasNext: false } }), async () => movement);
  assert.equal((await tied.loadQRPorteria(resource, '01')).initial.tipo, undefined);
});
test('respuesta incompleta o detalle inconsistente se rechazan; cierre cancela la precarga', async () => {
  await assert.rejects(service(async () => ({ data: [] })).loadQRPorteria(resource, '01'));
  const s = service(async () => ({ data: [movement], pagination: { hasNext: false } }), async () => ({ ...movement, tractor: ['otro'] }));
  await assert.rejects(s.loadQRPorteria(resource, '01'));
  assert.equal(await s.loadQRPorteria(resource, '01', null, () => false), null);
});
