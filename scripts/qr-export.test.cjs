const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file, imports = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => imports[name], module, module.exports);
  return module.exports;
}
const utils = load('src/utils/qrExport.js');
const image = { value: 'CANTAPP:TRACTORES:1001', identifier: 'Tractor 1001', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAA==' };

test('el visor reutiliza el QR actual y exporta los mismos bytes en todas las acciones', async () => {
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useRef: value => ({ current: value }), useState: value => [value, () => {}],
  };
  const { QRViewer } = load('node_modules/cantapp-components/src/components/Operational/mediaViews.jsx', {
    react, 'react-native': { View: 'View', Text: 'Text' },
    'react-native-qrcode-svg': 'QRCode', '../Button/button': 'Button',
    '../../theme/tokens': { tokens: { padding: 16, radius: 4 } },
    '../../theme/themeContext': { useCantappTheme: () => ({}) },
    '../../theme/typography': {}, '../Functional/states': {},
  });
  const exported = [];
  const exportImage = async payload => exported.push(payload);
  const tree = QRViewer({ ...image, onShare: exportImage, onDownload: exportImage, onPrint: exportImage });
  const flatten = node => !node || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(flatten)];
  const nodes = flatten(tree);
  const qr = nodes.find(node => node.type === 'QRCode');
  assert.equal(qr.props.value, image.value);
  assert.equal(qr.props.size, 180);
  assert.equal(qr.props.color, '#172033');
  qr.props.getRef({ toDataURL: callback => callback(utils.pngBase64(image.dataUrl)) });
  for (const button of nodes.filter(node => node.type === 'Button')) await button.props.onPress();
  assert.equal(exported.length, 3);
  for (const payload of exported) assert.deepEqual(payload, image);
});

test('PNG obligatorio, nombre seguro y documento de impresión aislado con etiqueta escapada', () => {
  assert.equal(utils.pngBase64(image.dataUrl), 'iVBORw0KGgoAAA==');
  assert.throws(() => utils.pngBase64(image.value));
  assert.throws(() => utils.pngBase64('data:image/svg+xml,<svg/>'));
  assert.equal(utils.qrFilename(image.identifier), 'QR-Tractor-1001.png');
  assert.ok(!utils.qrFilename('../../recurso').includes('/'));
  const html = utils.qrPrintDocument({ ...image, identifier: '<script>alert(1)</script>' });
  assert.ok(html.includes(image.dataUrl));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('align-items: center'));
  assert.ok(!html.includes(image.value));
});

test('Android comparte un archivo PNG con sus bytes originales y no un mensaje de texto', async () => {
  const writes = [], shares = [];
  const service = load('src/services/qrExport.service.js', {
    '../utils/qrExport': utils,
    'expo-file-system/legacy': {
      cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' },
      makeDirectoryAsync: async () => {}, writeAsStringAsync: async (...args) => writes.push(args),
    },
    'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async (...args) => shares.push(args) },
  });
  await service.shareQR(image);
  assert.deepEqual(writes[0], ['file:///cache/qr/QR-Tractor-1001.png', 'iVBORw0KGgoAAA==', { encoding: 'base64' }]);
  assert.equal(shares[0][0], writes[0][0]);
  assert.equal(shares[0][1].mimeType, 'image/png');
  assert.equal(shares[0][1].message, undefined);
});

test('guardar Android respeta cancelación y escribe PNG en la carpeta elegida', async () => {
  let granted = false;
  const writes = [], creates = [];
  const service = load('src/services/qrExport.service.js', {
    '../utils/qrExport': utils, 'expo-sharing': {},
    'expo-file-system/legacy': {
      EncodingType: { Base64: 'base64' }, writeAsStringAsync: async (...args) => writes.push(args),
      StorageAccessFramework: {
        requestDirectoryPermissionsAsync: async () => ({ granted, directoryUri: 'content://chosen' }),
        createFileAsync: async (...args) => { creates.push(args); return 'content://chosen/qr'; },
      },
    },
  });
  await service.saveQR(image);
  assert.equal(creates.length, 0);
  granted = true;
  await service.saveQR(image);
  assert.deepEqual(creates[0], ['content://chosen', 'QR-Tractor-1001.png', 'image/png']);
  assert.equal(writes[0][1], utils.pngBase64(image.dataUrl));
});

test('web descarga un PNG y envía a imprimir únicamente el documento del QR', async () => {
  const previous = globalThis.document;
  const nodes = [];
  globalThis.document = {
    createElement: tag => {
      const node = { tag, style: {}, remove() { this.removed = true; }, click() { this.clicked = true; } };
      if (tag === 'iframe') {
        node.contentDocument = { querySelector: () => ({ decode: async () => {} }) };
        node.contentWindow = { focus() {}, print() { node.printed = true; this.onafterprint(); } };
      }
      return node;
    },
    body: { appendChild(node) { nodes.push(node); if (node.tag === 'iframe') queueMicrotask(() => node.onload()); } },
  };
  try {
    const service = load('src/services/qrExport.service.web.js', { '../utils/qrExport': utils });
    service.saveQR(image);
    assert.equal(nodes[0].href, image.dataUrl);
    assert.equal(nodes[0].download, 'QR-Tractor-1001.png');
    assert.ok(nodes[0].clicked && nodes[0].removed);
    await service.printQR(image);
    assert.ok(nodes[1].srcdoc.includes('<p>Tractor 1001</p>'));
    assert.ok(nodes[1].printed && nodes[1].removed);
  } finally { globalThis.document = previous; }
});
