const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, imports = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(Object.hasOwn(imports, name), `Import sin simular: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const { catalog } = load('src/config/catalog.js');
const operations = load('src/config/operations.js');
const navigation = load('src/config/navigation.config.js').default;
const { visibleModules } = load('src/config/modules.js', { './navigation.config': { default: navigation, __esModule: true } });
const { creationActions } = load('src/config/creationActions.js', { './catalog': { catalog }, './operations': operations });
const ids = ['porteria', 'talleres', 'asignaciones', 'documentos', 'posicion'];
const user = { uid: 'user', rol: 'admin' };
const capabilities = {
  version: 1, resources: catalog.recursos.map(entry => entry.id), eventAreas: ['porteria', 'tractores', 'furgones'], assignments: true,
  operations: { version: 2, porteria: true, workshops: true, assignments: true, documents: { version: 1, enabled: true, read: true } },
};

test('acciones derivadas del catálogo original, agrupadas por navegación y con sus valores iniciales', () => {
  const groups = creationActions(visibleModules(ids), user, capabilities);
  assert.deepEqual(groups.map(group => group.id), ['recursos', 'porteria', 'talleres', 'asignaciones', 'documentos']);
  for (const group of groups) {
    assert.equal(group.label, navigation.find(module => module.id === group.id).label);
    assert.equal(group.actions.length, catalog[group.id].reduce((total, entry) => total + entry.createActions.length, 0));
    for (const action of group.actions) {
      assert.ok(catalog[group.id].includes(action.entry));
      assert.ok(action.entry.createActions.some(original => original.initialValues === action.initialValues));
      assert.equal(action.policy.create, true);
    }
  }
});
test('sin rol, módulo o permisos de alta no se exponen acciones', () => {
  assert.deepEqual(creationActions(visibleModules(ids), { ...user, rol: 'consulta' }, capabilities), []);
  assert.deepEqual(creationActions(visibleModules(ids), user, undefined), []);
  assert.deepEqual(creationActions(visibleModules([]), user, capabilities), []);
  const groups = creationActions(visibleModules(['documentos']), user, capabilities);
  assert.deepEqual(groups.map(group => group.id), ['documentos']);
});
test('capacidades deshabilitadas conservan solo altas autorizadas y respetan permisos por recurso', () => {
  const groups = creationActions(visibleModules(ids), user, {
    ...capabilities, resources: ['personas'],
    operations: { version: 2, porteria: false, workshops: false, assignments: false, documents: { version: 1, read: true, enabled: false } },
  });
  assert.deepEqual(groups.map(group => group.id), ['recursos', 'porteria']);
  assert.deepEqual(groups[0].actions.map(action => action.entry.id), ['personas']);
  assert.deepEqual(groups[1].actions.map(action => action.entry.id), ['llaves']);
});

function shell(width = 360) {
  const state = [];
  let cursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: initial => {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useRef: initial => {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    }, useMemo: factory => factory(), useEffect: () => {},
  };
  const theme = {};
  const session = { user, access: { crud: capabilities } };
  const AppShell = load('src/components/AppShell.jsx', {
    react,
    'react-native': { Platform: { OS: 'web' }, View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', useWindowDimensions: () => ({ width }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 24, right: 5 }) },
    'expo-status-bar': { StatusBar: 'StatusBar' }, 'expo-router': { useRouter: () => ({}), usePathname: () => '/' },
    'cantapp-components': { Alert: 'Alert', FloatButton: 'FloatButton', LoadingState: 'LoadingState', Modal: 'Modal', QROptionsModal: 'QROptionsModal', useCantappTheme: () => theme },
    './OperatorQRScanner': 'OperatorQRScanner', '../services/qrPorteria.service': {},
    '../contexts/AppContext': { useApp: () => ({ app: {}, user, modules: visibleModules(ids) }) },
    '../contexts/AuthContext': { useAuth: () => ({ data: session, markActivity: () => {} }) },
    './AppLogo': 'AppLogo', './ModuleIcon': 'ModuleIcon', './RecordBrowser': 'RecordBrowser', './RecordEditor': 'RecordEditor',
    '../config/catalog': { findCatalog: (group, id) => catalog[group].find(entry => entry.id === id) },
    '../config/operations': operations, '../services/record.service': {}, '../services/recordDetails.service': {},
    '../config/creationActions': { creationActions }, './CreationMenu': 'CreationMenu',
  }).default;
  const flatten = node => Array.isArray(node) ? node.flatMap(flatten) : !node || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(flatten)];
  return { session, render() { cursor = 0; return flatten(AppShell({ children: null })); } };
}

test('ambos flotantes se alinean con áreas seguras en móvil y escritorio', () => {
  for (const width of [360, 1280]) {
    const floats = shell(width).render().filter(node => node.type === 'FloatButton');
    assert.equal(floats.length, 2);
    assert.equal(floats[0].props.icon, 'plus');
    assert.equal(floats[0].props.bottom, floats[1].props.bottom);
    assert.equal(floats[0].props.right - floats[1].props.right, 68);
    assert.equal(floats[1].props.bottom, (width < 768 ? 80 : 24) + 24);
  }
});
test('cada acción cierra el menú y abre el editor existente con su política y formulario', () => {
  for (const group of creationActions(visibleModules(ids), user, capabilities)) for (const action of group.actions) {
    const view = shell();
    view.render().find(node => node.type === 'FloatButton' && node.props.icon === 'plus').props.onPress();
    view.render().find(node => node.type === 'CreationMenu').props.onSelect(action.key);
    const nodes = view.render();
    assert.ok(!nodes.some(node => node.type === 'CreationMenu'));
    const editor = nodes.find(node => node.type === 'RecordEditor');
    assert.equal(editor.props.entry, action.entry);
    assert.equal(editor.props.policy.type, action.policy.type);
    assert.equal(editor.props.policy.path, action.policy.path);
    assert.equal(editor.props.policy.create, true);
    assert.equal(editor.props.policy.detailPath('record'), action.policy.detailPath('record'));
    assert.equal(editor.props.initialValues, action.initialValues);
    editor.props.onClose();
    assert.ok(!view.render().some(node => node.type === 'RecordEditor'));
  }
});
test('revocar permisos retira el formulario global abierto', () => {
  const view = shell();
  view.render().find(node => node.type === 'FloatButton' && node.props.icon === 'plus').props.onPress();
  const menu = view.render().find(node => node.type === 'CreationMenu');
  menu.props.onSelect(menu.props.groups[0].actions[0].key);
  view.session.access.crud = null;
  assert.ok(!view.render().some(node => node.type === 'RecordEditor'));
});

test('el menú respeta guardados pendientes, errores locales y cierre por fondo o botón atrás', async () => {
  for (const condition of ['ready', 'pending', 'error']) {
    const hooks = [];
    let cursor = 0, closed = 0, selected;
    const react = {
      createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
      useState: initial => {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = initial;
        return [hooks[index], value => { hooks[index] = value; }];
      },
      useEffect: effect => { const index = cursor++; if (!hooks[index]) { hooks[index] = true; effect(); } },
    };
    const Menu = load('src/components/CreationMenu.jsx', {
      react, 'react-native': { Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View' },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
      'cantapp-components': { Alert: 'Alert', Button: 'Button', LoadingState: 'LoadingState', useCantappTheme: () => ({}) },
      '../services/record.service': { readPendingRecord: async uid => {
        assert.equal(uid, user.uid);
        if (condition === 'error') throw new Error('Error local');
        return condition === 'pending' ? { operation: {} } : null;
      } },
    }).default;
    const flatten = node => Array.isArray(node) ? node.flatMap(flatten) : !node || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(flatten)];
    const render = () => {
      cursor = 0;
      return flatten(Menu({ groups: creationActions(visibleModules(ids), user, capabilities), uid: user.uid,
        onClose: () => closed++, onSelect: key => { selected = key; } }));
    };
    assert.ok(render().some(node => node.type === 'LoadingState'));
    await new Promise(resolve => setImmediate(resolve));
    const nodes = render();
    const buttons = nodes.filter(node => node.type === 'Button' && node.props.icon === 'plus');
    if (condition === 'ready') {
      assert.ok(buttons.length);
      buttons[0].props.onPress();
      assert.ok(selected);
    } else {
      assert.equal(buttons.length, 0);
      assert.ok(nodes.some(node => node.type === 'Alert'));
    }
    nodes.find(node => node.type === 'Pressable').props.onPress();
    nodes.find(node => node.type === 'Modal').props.onRequestClose();
    assert.equal(closed, 2);
  }
});
