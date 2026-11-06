const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Exercise the actual service without loading Firebase or native storage.
function load(relative, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(Object.hasOwn(imports, name), `Import sin simular: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
function service() {
  const storage = new Map();
  const calls = [];
  const apiMutate = async (...args) => { calls.push(args); return { id: '001-00000001' }; };
  return { calls, ...load('src/services/record.service.js', {
    '../config/app.config': { default: { appId: 'operator-test' } },
    '@react-native-async-storage/async-storage': { default: {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key),
    } },
    '../firebase/client': { auth: { currentUser: { uid: 'tester' } } },
    './catalog.service': { enrichOperationalRows: async rows => rows },
    './api.service': { apiMutate }, '../utils/formatRecord': {},
  }) };
}
const policy = { type: 'porteria', path: '/eventos', area: 'porteria' };

test('Portería requiere permiso del servidor y Llaves/Talleres conservan sus políticas', () => {
  const { operationPolicy } = load('src/config/operations.js');
  const capabilities = { version: 1, eventAreas: ['porteria', 'tractores'], operations: { version: 2, porteria: true, workshops: true } };
  const user = { rol: 'admin' };
  assert.equal(operationPolicy('porteria', { id: 'eventos' }, user, capabilities).type, 'porteria');
  assert.equal(operationPolicy('porteria', { id: 'eventos' }, user, capabilities).create, true);
  assert.equal(operationPolicy('porteria', { id: 'eventos' }, user, { ...capabilities, operations: {} }).create, false);
  assert.equal(operationPolicy('porteria', { id: 'eventos' }, user, { ...capabilities, eventAreas: [] }), null);
  assert.equal(operationPolicy('porteria', { id: 'llaves' }, user, capabilities).type, 'llaves');
  assert.equal(operationPolicy('talleres', { id: 'tractores' }, user, capabilities).type, 'tallerTractor');
});

for (const formulario of ['movPorteria', 'movPorteriaParticular', 'movPorteriaProveedor']) test(`Payload ${formulario}: datos operativos y misma solicitud durable`, async () => {
  const s = service();
  const fields = s.porteriaFields(formulario);
  const values = { ...s.initialFormData(fields), formulario, tipo: 'ENTRADA', operador: 'o', persona: 'p',
    tractor: 't', furgon: ['f'], cargado: true, chequeos: ['ckCorte'], detalle: '  Observación  ',
    vehiculo: 'v', destino: '002', empresa: 'pr', remito: 'R-10', orden: 999, usuario: 'falso' };
  const payload = s.recordPayload(fields, values, {}, true, policy);
  assert.equal(payload.formulario, formulario);
  assert.equal(payload.detalle, 'Observación');
  assert.equal(payload.orden, undefined);
  assert.equal(payload.usuario, undefined);
  if (formulario === 'movPorteria') assert.deepEqual(payload.chequeos, ['ckCorte']);
  else assert.equal(payload.tractor, undefined);
  if (formulario === 'movPorteriaProveedor') assert.equal(payload.remito, 'R-10');
  const operation = s.makePendingRecord('tester', policy, null, payload, values);
  await s.rememberPendingRecord('tester', operation);
  const recovered = await s.readPendingRecord('tester');
  assert.deepEqual(recovered.payload, payload);
  assert.equal(s.pendingMatches(recovered, policy), true);
  await s.saveRecord(policy, null, recovered.payload, recovered.key, 'tester');
  await s.saveRecord(policy, null, recovered.payload, recovered.key, 'tester');
  assert.deepEqual(s.calls[0], s.calls[1]);
  assert.equal(s.calls[0][0], '/eventos');
  assert.equal(s.calls[0][3]['Idempotency-Key'], operation.key);
});
