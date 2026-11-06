const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const operatorRoot = path.resolve(__dirname, '..');
const sharedRoot = path.resolve(operatorRoot, '../cantapp-components');
process.chdir(sharedRoot);
const helpers = require(path.join(sharedRoot, 'tests/helpers.cjs'));
const { React, ThemeProvider, FormStandard, Modal } = helpers;
const Renderer = require(path.join(sharedRoot, 'node_modules/react-test-renderer'));
const babel = require(path.join(sharedRoot, 'node_modules/@babel/core'));
const { act } = Renderer;
const states = require(path.join(sharedRoot, 'src/components/Functional/states'));
const { administrationFields } = require(path.join(sharedRoot, 'src/data/administrationFields'));
const originalLoad = Module._load;
let api;
Module._load = function (id, ...args) {
  if (id === 'react') return React;
  if (id === 'cantapp-components') return { ...states, Modal, FormStandard, administrationFields };
  if (id === './api.service') return api;
  return originalLoad.call(this, id, ...args);
};
const compileOriginal = require.extensions['.js'];
const compile = (module, filename) => {
  if (!filename.startsWith(path.join(operatorRoot, 'src'))) return compileOriginal(module, filename);
  const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] });
  module._compile(result.code, filename);
};
require.extensions['.jsx'] = compile;
require.extensions['.js'] = compile;
global.IS_REACT_ACT_ENVIRONMENT = true;
const action = (root, label) => root.root.findAll(node => node.type === 'div' && node.props.label === label).at(-1);
async function click(root, label) { const button = action(root, label); assert.ok(button, label); assert.ok(!button.props.disabled); await act(async () => { await button.props.onPress(); }); }

test('real editor preloads raw record, confirms, retains failed input, retries same key and reports a refresh failure as saved', async () => {
  const original = { id: 'D1', nombre: 'Original', descripcion: '', _operatorRevision: 'a'.repeat(64) };
  const calls = [];
  let reads = 0;
  api = {
    apiGet: async () => { if (++reads > 1) throw new Error('Refresh failed'); return original; },
    apiMutate: async (...args) => { calls.push(args); if (calls.length === 1) throw Object.assign(new Error('No confirmado'), { uncertain: true }); return { id: 'D1', nombre: 'Actualizado' }; },
    extractRows: body => body,
  };
  const RecordEditor = require(path.join(operatorRoot, 'src/components/RecordEditor.jsx')).default;
  const policy = { type: 'depositos', path: '/depositos', detailPath: id => `/depositos/${id}` };
  let saved;
  let root;
  await act(async () => { root = Renderer.create(React.createElement(ThemeProvider, { mode: 'oscuro' }, React.createElement(RecordEditor, { policy, record: { id: 'D1', nombre: 'Enriched stale' }, title: 'Depósitos', onClose: () => {}, onSaved: (record, warning) => { saved = { record, warning }; } }))); });
  const input = root.root.findAll(node => node.type === 'div' && node.props['data-kind'] === 'TextInput').find(node => node.props.label === 'Nombre');
  assert.equal(input.props.value, 'Original');
  await act(async () => input.props.onChangeText('Actualizado'));
  await click(root, 'Guardar');
  assert.equal(calls.length, 0);
  await click(root, 'Guardar');
  assert.equal(calls.length, 1);
  assert.match(JSON.stringify(root.toJSON()), /No confirmado/);
  assert.equal(saved, undefined);
  await click(root, 'Guardar');
  assert.equal(calls.length, 2);
  assert.equal(calls[0][3]['Idempotency-Key'], calls[1][3]['Idempotency-Key']);
  assert.equal(calls[0][3]['If-Match'], original._operatorRevision);
  assert.deepEqual(calls[0][2], { nombre: 'Actualizado' });
  assert.equal(saved.record.nombre, 'Actualizado');
  assert.match(saved.warning, /Se guardó/);
  await act(async () => root.unmount());
});


test('workshop editor loads catalogs, preserves an uncertain request and prevents concurrent double submission', async () => {
  const calls = [];
  let rejectPending;
  api = {
    apiGet: async path => path === '/eventos/consulta'
      ? { id: 'E1', area: 'tractores', _operatorRevision: 'b'.repeat(64) }
      : [{ id: '1', nombre: 'Catálogo', unidad: 'UN', estado: true }],
    extractRows: value => value,
    apiMutate: (...args) => {
      calls.push(args);
      if (calls.length === 1) return new Promise((_, reject) => { rejectPending = reject; });
      return Promise.resolve({ id: 'E1' });
    },
  };
  const RecordEditor = require(path.join(operatorRoot, 'src/components/RecordEditor.jsx')).default;
  const policy = { type: 'tallerTractor', path: '/eventos', area: 'tractores', detailPath: () => '/eventos/consulta' };
  const values = { tipo: 'SERVICE', tractor: '1', sucursal: '1', mecanico: ['1'], repuestos: [{ id: '1', cantidad: '2', unidad: 'UN' }], deposito: '1', kilometraje: '100' };
  let root; let saved;
  await act(async () => { root = Renderer.create(React.createElement(ThemeProvider, { mode: 'claro' }, React.createElement(RecordEditor, { policy, title: 'Taller', onClose: () => {}, onSaved: value => { saved = value; } }))); });
  const submit = () => root.root.findByType(FormStandard).props.onSubmit(values);
  let first;
  await act(async () => { first = submit().catch(error => error); await submit(); });
  assert.equal(calls.length, 1);
  await act(async () => { rejectPending(Object.assign(new Error('Respuesta perdida'), { uncertain: true })); await first; });
  assert.equal(root.root.findByType(FormStandard).props.fields.every(field => field.disabled), true);
  await act(async () => { await submit(); });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][3]['Idempotency-Key'], calls[1][3]['Idempotency-Key']);
  assert.deepEqual(calls[0][2].repuestos, [{ id: '1', cantidad: 2, unidad: 'UN' }]);
  assert.equal(calls[0][2].formulario, 'repTractor');
  assert.equal(saved.id, 'E1');
  await act(async () => root.unmount());
});
