const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const root = path.resolve(__dirname, '..');
const shared = path.resolve(root, '../cantapp-components');
process.chdir(shared);
const helpers = require(path.join(shared, 'tests/helpers.cjs'));
const { React, ThemeProvider, FormStandard, Modal, Tabla } = helpers;
const Renderer = require(path.join(shared, 'node_modules/react-test-renderer'));
const babel = require(path.join(shared, 'node_modules/@babel/core'));
const components = {
  BackButton: require(path.join(shared, 'src/components/Button/BackButton')).default,
  ReloadButton: require(path.join(shared, 'src/components/Button/ReloadButton')).default,
  ...require(path.join(shared, 'src/components/Ficha/recordDetail')),
  ...require(path.join(shared, 'src/components/Functional/states')),
  ...require(path.join(shared, 'src/components/Layout/structure')),
  ...require(path.join(shared, 'src/components/Input/controls')),
  ...require(path.join(shared, 'src/theme/themeContext')),
  ...require(path.join(shared, 'src/data/administrationFields')),
  Button: require(path.join(shared, 'src/components/Button/button')).default,
  Tabs: require(path.join(shared, 'src/components/Layout/tabs')).default,
  DataTable: Tabla, FormStandard, Modal, DateRangeFilter: helpers.DateRangeFilter,
};
let session;
let rows;
let fresh;
let detailHandler;
let relationHandler;
let stockHandler;
let catalogHandler;
const recordService = {
  readPendingRecord: async () => null,
  pendingMatches: () => false,
  readEditableRecord: async () => fresh,
  formOptions: async () => ({}),
};
const load = Module._load;
Module._load = function (id, ...args) {
  if (id === 'react') return React;
  if (id === 'cantapp-components') return components;
  if (id === 'expo-router') return { useRouter: () => ({ push() {} }) };
  if (id.endsWith('/contexts/AuthContext')) return { useAuth: () => ({ data: session, markActivity() {}, refresh() {} }) };
  if (id.endsWith('/contexts/AppContext')) return { useApp: () => ({ modules: navigation.filter(item => session.access.modulos.includes(item.id)) }) };
  if (id.endsWith('/firebase/client')) return { auth: { currentUser: { uid: 'local-test' } } };
  if (id.endsWith('/services/catalog.service')) return { loadCatalog: async (entry, variant, active, query) => catalogHandler ? catalogHandler(entry, variant, active, query) : entry.dateFilter ? { rows, total: rows.length } : rows };
  if (id.endsWith('/services/record.service')) return recordService;
  if (id.endsWith('/services/recordDetails.service')) return {
    loadRecordDetail: async (...args) => detailHandler ? detailHandler(...args) : fresh,
    loadRecordRelations: async (_entity, _id, query = {}) => relationHandler ? relationHandler(_entity, _id, query) : query.entity ? { data: [], total: 0 } : { groups: [] },
    loadDepositStock: async (...args) => stockHandler ? stockHandler(...args) : ({ data: [], total: 0 }),
  };
  if (id === './api.service' || id === './catalog.service' || id === '@react-native-async-storage/async-storage') return {};
  return load.call(this, id, ...args);
};
const originalJs = require.extensions['.js'];
function compile(module, filename) {
  if (!filename.startsWith(path.join(root, 'src'))) return originalJs(module, filename);
  const result = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'] });
  module._compile(result.code, filename);
}
require.extensions['.js'] = compile;
require.extensions['.jsx'] = compile;
recordService.initialFormData = load.call(Module, path.join(root, 'src/services/record.service.js')).initialFormData;
const navigation = require(path.join(root, 'src/config/navigation.config')).default;
const { catalog } = require(path.join(root, 'src/config/catalog'));
const ModuleScreen = require(path.join(root, 'src/screens/Module')).default;
const { act } = Renderer;
global.IS_REACT_ACT_ENVIRONMENT = true;
const caps = {
  version: 1, resources: catalog.recursos.map(entry => entry.id), eventAreas: ['porteria', 'tractores', 'furgones'], assignments: true,
  operations: { version: 2, workshops: true, assignments: true, documents: { version: 1, enabled: true, read: true } },
};
function setup(rol = 'dev', crud = caps) {
  session = { user: { rol }, access: { modulos: navigation.map(item => item.id), crud } };
  rows = [];
  fresh = { id: '1', nombre: 'Actualizado', area: 'tractores' };
  detailHandler = relationHandler = stockHandler = catalogHandler = null;
}
async function render(moduleId, childId) {
  let tree;
  await act(async () => { tree = Renderer.create(React.createElement(ThemeProvider, {}, React.createElement(ModuleScreen, { moduleId, childId }))); });
  return tree;
}
const buttons = tree => tree.root.findAllByType(components.Button);
async function click(tree, label) {
  const button = buttons(tree).find(item => (item.props.accessibilityLabel || item.props.label) === label);
  assert.ok(button, `Missing ${label}`);
  assert.ok(!button.props.disabled, `${label} disabled`);
  await act(async () => button.props.onPress());
}
const close = async tree => act(async () => tree.unmount());

test('Module renders authorized create actions and opens the shared form for every enabled section', async () => {
  setup();
  for (const group of ['recursos', 'porteria', 'talleres', 'asignaciones', 'documentos']) {
    for (const entry of catalog[group]) {
      if (group === 'porteria' && entry.id === 'eventos') continue;
      for (const action of entry.createActions) {
        const tree = await render(group, entry.id);
        await click(tree, entry.createActions.length === 1 ? 'Agregar' : action.label);
        const form = tree.root.findByType(FormStandard);
        assert.ok(form.props.fields.length);
        if (action.initialValues) assert.equal(form.props.data.tipo, action.initialValues.tipo);
        await close(tree);
      }
    }
  }
});

test('Assignments and Documents root routes render their lists and create buttons', async () => {
  setup();
  for (const group of ['asignaciones', 'documentos']) {
    const tree = await render(group);
    assert.equal(tree.root.findAllByType(Tabla).length, 1);
    await click(tree, catalog[group][0].createActions.length === 1 ? 'Agregar' : catalog[group][0].createActions[0].label);
    assert.equal(tree.root.findAllByType(FormStandard).length, 1);
    await close(tree);
  }
});

test('document detail resolves summary fields before Edit and preserves administrative restrictions', async () => {
  setup();
  rows = [{ id: '1', tipo: 'REMITO' }];
  fresh = { id: '1', tipo: 'REMITO', documentoVersion: 1, movimientoStock: 'ALTA', movimientos: [{ id: 'stock-move' }], detalle: 'Actual' };
  const tree = await render('documentos');
  await act(async () => tree.root.findByType(Tabla).props.onRowPress(rows[0]));
  await click(tree, 'Editar');
  const form = tree.root.findByType(FormStandard);
  assert.deepEqual(form.props.fields.map(field => field.key), ['fechaEmision', 'sucursal', 'detalle']);
  assert.equal(form.props.data.detalle, 'Actual');
  await close(tree);
});

test('missing crud from deployed bootstrap is explicit and never fabricates write permissions', async () => {
  setup();
  delete session.access.crud;
  const tree = await render('recursos', 'personas');
  assert.equal(buttons(tree).some(button => button.props.label === 'Agregar nuevo'), false);
  assert.match(JSON.stringify(tree.toJSON()), /access.crud/);
  await close(tree);
});

test('every authorized editable section opens its existing form with freshly loaded data', async () => {
  for (const group of ['recursos', 'porteria', 'talleres', 'asignaciones']) {
    for (const entry of catalog[group]) {
      setup();
      const area = group === 'porteria' ? 'porteria' : group === 'talleres' ? entry.id : undefined;
      rows = [{ id: '1', detalle: 'Resumen anterior' }];
      fresh = { id: '1', nombre: 'Actualizado', detalle: 'Detalle actual', area };
      const tree = await render(group, entry.id);
      await act(async () => tree.root.findByType(Tabla).props.onRowPress(rows[0]));
      await click(tree, 'Editar');
      const form = tree.root.findByType(FormStandard);
      assert.equal(form.props.data.detalle || form.props.data.nombre, entry.id === 'depositos' ? 'Actualizado' : 'Detalle actual');
      await close(tree);
    }
  }
});

test('read-only roles, explicit denials and historical documents do not expose write actions', async () => {
  for (const [role, capabilities] of [['user', caps], ['dev', { ...caps, resources: [] }]]) {
    setup(role, capabilities);
    const tree = await render('recursos', 'personas');
    assert.equal(buttons(tree).some(button => button.props.label === 'Agregar nuevo'), false);
    await close(tree);
  }
  setup();
  rows = [{ id: 'old', tipo: 'FACTURA' }];
  fresh = rows[0];
  const tree = await render('documentos');
  await act(async () => tree.root.findByType(Tabla).props.onRowPress(rows[0]));
  assert.equal(buttons(tree).some(button => button.props.label === 'Editar'), false);
  await close(tree);
});

test('related tables query only the selected record, paginate on server and return to the original detail', async () => {
  setup();
  rows = [{ id: '1', dominio: 'ABC123' }];
  const calls = [];
  detailHandler = async (entity, id) => entity === 'tractores' ? { id, dominio: 'ABC123', estado: true } : { id, tipo: 'SERVICE', area: 'tractores', detalle: 'Trabajo relacionado' };
  relationHandler = async (entity, id, query) => {
    calls.push({ entity, id, ...query });
    return query.entity ? { data: [{ id: 'E1', tipo: 'SERVICE', area: 'tractores' }], total: 30 } : { groups: entity === 'tractores' ? [{ entity: 'eventos', total: 30 }] : [] };
  };
  const tree = await render('recursos', 'tractores');
  await act(async () => tree.root.findByType(Tabla).props.onRowPress(rows[0]));
  await click(tree, '30 eventos');
  let table = tree.root.findAllByType(Tabla).at(-1);
  assert.equal(table.props.serverSide, true);
  assert.equal(table.props.total, 30);
  await act(async () => table.props.onChangePage(2));
  assert.deepEqual(calls.at(-1), { entity: 'eventos', id: '1', page: 2, limit: 25, q: '' });
  const reload = buttons(tree).filter(item => item.props.accessibilityLabel === 'Actualizar').at(-1);
  const callsBeforeReload = calls.length;
  await act(async () => { reload.props.onPress(); reload.props.onPress(); });
  assert.equal(calls.length, callsBeforeReload + 1);
  assert.equal(calls.at(-1).page, 2);
  table = tree.root.findAllByType(Tabla).at(-1);
  await act(async () => table.props.onRowPress({ id: 'E1' }));
  assert.match(JSON.stringify(tree.toJSON()), /Trabajo relacionado/);
  fresh = { id: 'E1', area: 'tractores', detalle: 'Detalle para editar' };
  await click(tree, 'Editar');
  const form = tree.root.findByType(FormStandard);
  assert.deepEqual(form.props.fields.map(field => field.key), ['detalle']);
  assert.equal(form.props.data.detalle, 'Detalle para editar');
  await act(async () => form.props.onCancel());
  await click(tree, 'Volver');
  assert.equal(tree.root.findAllByType(Tabla).at(-1).props.page, 2);
  await click(tree, 'Volver');
  assert.match(JSON.stringify(tree.toJSON()), /ABC123/);
  await close(tree);
});

test('depot button opens only that depot balance table', async () => {
  setup();
  rows = [{ id: 'D1', nombre: 'Principal' }];
  fresh = rows[0];
  let request;
  stockHandler = async (id, query) => { request = { id, ...query }; return { data: [{ id: 'S1', descripcion: 'Filtro', cantidad: 4, unidad: 'UN' }], total: 1 }; };
  const tree = await render('recursos', 'depositos');
  await act(async () => tree.root.findByType(Tabla).props.onRowPress(rows[0]));
  await click(tree, 'Ver stock actual');
  assert.equal(request.id, 'D1');
  const table = tree.root.findAllByType(Tabla).at(-1);
  assert.equal(table.props.total, 1);
  assert.equal(table.props.data[0].cantidad, 4);
  await close(tree);
});

test('reload preserves local search/page, clamps invalid pages and coalesces repeated clicks', async () => {
  setup();
  rows = Array.from({ length: 120 }, (_, index) => ({ id: String(index), nombre: 'Depósito' }));
  let calls = 0;
  let resolveReload;
  catalogHandler = async () => { calls++; if (calls === 2) return new Promise(resolve => { resolveReload = resolve; }); return rows; };
  const tree = await render('recursos', 'depositos');
  const search = tree.root.findAllByType(components.SearchInput).find(item => item.props.label === 'Buscar registros');
  await act(async () => search.props.onSearch('1'));
  assert.equal(tree.root.findByType(Tabla).props.data.length, 39);
  await act(async () => search.props.onSearch(''));
  await act(async () => tree.root.findByType(Tabla).props.onChangePage(2));
  const reload = buttons(tree).find(item => item.props.accessibilityLabel === 'Actualizar');
  assert.equal(buttons(tree).filter(item => item.props.label === 'Actualizar').length, 0);
  await act(async () => { reload.props.onPress(); reload.props.onPress(); });
  assert.equal(calls, 2);
  assert.equal(buttons(tree).find(item => item.props.accessibilityLabel === 'Actualizar').props.disabled, true);
  await act(async () => resolveReload(rows));
  assert.equal(tree.root.findByType(Tabla).props.page, 2);
  rows = rows.slice(0, 10);
  await click(tree, 'Actualizar');
  assert.equal(tree.root.findByType(Tabla).props.page, 1);
  await close(tree);
});

test('document reload keeps server search and page until the refreshed total invalidates it', async () => {
  setup();
  const calls = [];
  let total = 120;
  catalogHandler = async (_entry, _variant, _active, query) => { calls.push(query); return { rows: [{ id: 'D1', tipo: 'FACTURA' }], total }; };
  const tree = await render('documentos');
  const search = tree.root.findAllByType(components.SearchInput).find(item => item.props.label === 'Buscar registros');
  await act(async () => search.props.onSearch('factura'));
  await act(async () => tree.root.findByType(Tabla).props.onChangePage(2));
  await click(tree, 'Actualizar');
  assert.equal(calls.at(-1).pagina, 2);
  assert.equal(calls.at(-1).q, 'factura');
  total = 4;
  await click(tree, 'Actualizar');
  assert.equal(calls.at(-1).pagina, 1);
  assert.equal(calls.at(-1).q, 'factura');
  await close(tree);
});

test('BackButton respects dirty-form confirmation on web and Android hardware back', async () => {
  for (const platform of ['web', 'android']) {
    setup();
    helpers.native.Platform.OS = platform;
    const tree = await render('recursos', 'depositos');
    await click(tree, 'Agregar');
    const input = tree.root.findAll(node => node.type === 'div' && node.props['data-kind'] === 'TextInput').find(node => node.props.label === 'Nombre');
    await act(async () => input.props.onChangeText('Cambio sin guardar'));
    if (platform === 'android') {
      const dialog = tree.root.findAll(node => node.type === 'div' && node.props.role === 'dialog').at(-1);
      await act(async () => dialog.props.onRequestClose());
    } else await click(tree, 'Volver');
    assert.match(JSON.stringify(tree.toJSON()), /Cambios sin guardar/);
    assert.equal(tree.root.findAllByType(FormStandard).length, 1);
    await click(tree, 'Seguir editando');
    assert.equal(tree.root.findAllByType(FormStandard).length, 1);
    await click(tree, 'Volver');
    await click(tree, 'Descartar cambios');
    assert.equal(tree.root.findAllByType(FormStandard).length, 0);
    await close(tree);
  }
  helpers.native.Platform.OS = 'web';
});

test('related reload clamps invalid pages and preserves its search', async () => {
  setup();
  rows = [{ id: '1', dominio: 'ABC' }];
  fresh = rows[0];
  let total = 30;
  const queries = [];
  relationHandler = async (_entity, _id, query) => {
    queries.push(query);
    return query.entity ? { data: [{ id: 'E1', tipo: 'SERVICE' }], total } : { groups: [{ entity: 'eventos', total }] };
  };
  const tree = await render('recursos', 'tractores');
  await act(async () => tree.root.findByType(Tabla).props.onRowPress(rows[0]));
  await click(tree, '30 eventos');
  const search = tree.root.findAllByType(components.SearchInput).at(-1);
  await act(async () => search.props.onSearch('service'));
  await act(async () => tree.root.findAllByType(Tabla).at(-1).props.onChangePage(2));
  total = 2;
  const reload = buttons(tree).filter(item => item.props.accessibilityLabel === 'Actualizar').at(-1);
  await act(async () => reload.props.onPress());
  assert.equal(queries.at(-1).page, 1);
  assert.equal(queries.at(-1).q, 'service');
  await close(tree);
});

test('all chronological lists send dates to the server, reset page and retain them on reload', async () => {
  for (const [group, id] of [['porteria', 'eventos'], ['porteria', 'llaves'], ['talleres', 'tractores'], ['talleres', 'furgones'], ['asignaciones', 'listado'], ['documentos', 'listado']]) {
    setup();
    const queries = [];
    catalogHandler = async (_entry, _variant, _active, query) => { queries.push(query); return { rows: [], total: 120 }; };
    const tree = await render(group, id);
    await act(async () => tree.root.findByType(Tabla).props.onChangePage(2));
    let dates = tree.root.findByType(helpers.DateRangeFilter);
    const from = dates.findAllByType(helpers.DateInput).find(input => input.props.label === 'Desde');
    await act(async () => from.props.onChange('04/11/2026'));
    assert.equal(queries.at(-1).desde, '2026-11-04');
    assert.equal(queries.at(-1).pagina, 1);
    const queryCount = queries.length;
    dates = tree.root.findByType(helpers.DateRangeFilter);
    await act(async () => dates.findAllByType(helpers.DateInput).find(input => input.props.label === 'Hasta').props.onChange('03/11/2026'));
    assert.equal(queries.length, queryCount); // Invalid range is visible but never submitted.
    await act(async () => dates.findAllByType(helpers.DateInput).find(input => input.props.label === 'Hasta').props.onChange('05/11/2026'));
    assert.equal(queries.at(-1).hasta, '2026-11-05');
    await click(tree, 'Actualizar');
    assert.equal(queries.at(-1).desde, '2026-11-04');
    assert.equal(queries.at(-1).hasta, '2026-11-05');
    assert.equal(tree.root.findByType(Tabla).props.serverSide, true);
    await click(tree, 'Limpiar fechas');
    assert.equal(queries.at(-1).desde, '');
    assert.equal(queries.at(-1).hasta, '');
    await close(tree);
  }
  setup();
  const catalogTree = await render('recursos', 'personas');
  assert.equal(catalogTree.root.findAllByType(helpers.DateRangeFilter).length, 0);
  await close(catalogTree);
});

test('related trip dates survive server pagination, reload and navigation', async () => {
  setup();
  rows = [{ id: '1', dominio: 'ABC' }];
  fresh = rows[0];
  const queries = [];
  relationHandler = async (_entity, _id, query) => {
    queries.push(query);
    return query.entity ? { data: [], total: 80 } : { groups: [{ entity: 'viajes', total: 80 }] };
  };
  const tree = await render('recursos', 'tractores');
  await act(async () => tree.root.findByType(Tabla).props.onRowPress(rows[0]));
  await click(tree, '80 viajes');
  const dates = tree.root.findByType(helpers.DateRangeFilter);
  await act(async () => dates.findAllByType(helpers.DateInput).find(input => input.props.label === 'Hasta').props.onChange('04/11/2026'));
  assert.equal(queries.at(-1).hasta, '2026-11-04');
  assert.equal(tree.root.findByType(helpers.DateRangeFilter).findAllByType(helpers.DateInput).find(input => input.props.label === 'Hasta').props.value, '04/11/2026');
  await act(async () => tree.root.findAllByType(Tabla).at(-1).props.onChangePage(2));
  const reload = buttons(tree).filter(item => item.props.accessibilityLabel === 'Actualizar').at(-1);
  await act(async () => reload.props.onPress());
  assert.equal(queries.at(-1).page, 2);
  assert.equal(queries.at(-1).hasta, '2026-11-04');
  await close(tree);
});
