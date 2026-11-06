import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const config = url(await fs.readFile(new URL('../src/config/recordDetails.js', import.meta.url), 'utf8'));
const dates = url(await fs.readFile(new URL('../src/utils/formatRecord.js', import.meta.url), 'utf8'));
const source = (await fs.readFile(new URL('../src/utils/recordDetails.js', import.meta.url), 'utf8')).replace("'../config/recordDetails'", JSON.stringify(config)).replace("'./formatRecord'", JSON.stringify(dates));
const { projectDetail, checkTags, statistics } = await import(url(source));
const { relatedRecords, detailRecord, depositStock, pageRecords, canReadDetail } = await import('../../../cantapp-back/functions/services/record-details.service.js');

function memory(data) {
  const reads = [];
  function snap(path) { const value = data[path]; return { id: path.split('/').at(-1), exists: value !== undefined, data: () => value }; }
  const db = {
    collection(collection) { return {
      doc(id) { return { path: `${collection}/${id}`, get: async () => { reads.push(`${collection}/${id}`); return snap(`${collection}/${id}`); }, collection(child) { return db.collection(`${collection}/${id}/${child}`); } }; },
      async get() { reads.push(collection); return { docs: Object.keys(data).filter(path => path.startsWith(`${collection}/`) && path.slice(collection.length + 1).indexOf('/') === -1).map(snap) }; },
    }; },
    getAll: async (...refs) => Promise.all(refs.map(ref => ref.get())),
  };
  return { db, reads };
}

test('declarative fields hide technical/null properties, preserve false satellite and activity state', () => {
  const model = projectDetail('tractores', { id: '7', dominio: 'ABC123', estado: false, estadoSatelital: false, motor: null, secreto: 'internal', _operatorRevision: 'hash' });
  assert.equal(model.active, false);
  assert.equal(model.title, '7 - ABC123');
  const fields = model.sections.flatMap(section => section.fields);
  assert.deepEqual(fields.map(field => field.key), ['estadoSatelital']);
  assert.equal(fields[0].value[0].active, false);
  assert.equal(projectDetail('personas', {}).active, false);
  assert.equal(projectDetail('vehiculos', {}).active, undefined);
});

test('tools and periods use enriched names and calendar dates; actual numeric stats retain zero and units', () => {
  const model = projectDetail('personas', { id: '1', nombreCompleto: 'Persona', herramientas: [{ id: 'ST1', descripcion: 'Llave', cantidad: 2 }], periodos: [{ inicio: '2024-03-02', empresa: 'cuit', empresaAbreviatura: 'ACME' }, { inicio: '2023-01-01', fin: '2023-12-31', empresa: 'not-an-abbreviation' }], estadisticasViajes: { kilometros: 1200, litros: 0, internos: { viajes: 3 }, secreto: 'ignore' } });
  const fields = model.sections.flatMap(section => section.fields);
  assert.equal(fields.find(field => field.key === 'herramientas').value[0].label, 'Llave (2)');
  const periods = fields.find(field => field.key === 'periodos').value;
  assert.equal(periods[0].label, '02/03/2024 (ACME)');
  assert.equal(periods[1].label, '01/01/2023 - 31/12/2023');
  assert.equal(statistics({ litros: 0 })[0].value, '0 L');
  assert.equal(fields.find(field => field.key === 'estadisticasViajes').value.length, 3);
});

test('SALIDA uses all seven expected labels including missing and false checks', () => {
  const tags = checkTags({ ckAntivandalico: true, ckCorte: false });
  assert.equal(tags.length, 7);
  assert.equal(tags.find(item => item.label === 'Antivandálico').active, true);
  assert.equal(tags.find(item => item.label === 'Pánico').active, false);
  assert.equal(checkTags(['ckReporte']).find(item => item.label === 'Reporte').active, true);
});

test('statistics render Firestore timestamps as a single date instead of seconds/nanoseconds metrics', () => {
  for (const timestamp of [{ seconds: 1735732800, nanoseconds: 123000000 }, { _seconds: 1735732800, _nanoseconds: 0 }, { toDate: () => new Date('2025-01-01T12:00:00Z') }]) {
    const result = statistics({ viajes: 3, actualizado: timestamp });
    assert.equal(result.length, 2);
    assert.equal(result[1].label, 'Actualizado');
    assert.match(result[1].value, /01\/01\/2025/);
    assert.ok(!result.some(item => /seconds/i.test(item.label)));
  }
  assert.deepEqual(statistics({ nanoseconds: 10 }), []);
});

test('relationship counts are real, scoped, deduplicated, independent of pagination and permission filtered', async () => {
  const data = { 'tractores/7': { dominio: 'ABC' }, 'eventos/E1': { area: 'tractores', fecha: '2024-01-01' }, 'eventos/E2': { area: 'tractores', fecha: '2025-01-01' }, 'eventos/SECRET': { tipo: ' FACTURA ', area: 'tractores' } };
  for (const id of ['E1', 'E2', 'SECRET', 'missing']) data[`tractores/7/relaciones/${id}`] = { origenColeccion: 'eventos', origenId: id };
  data['tractores/7/relaciones/duplicate'] = { origenColeccion: 'eventos', origenId: 'E1' };
  data['tractores/8/relaciones/other'] = { origenColeccion: 'eventos', origenId: 'unrelated' };
  const { db, reads } = memory(data);
  const summary = await relatedRecords(db, 'tractores', '7', ['talleres']);
  assert.deepEqual(summary.groups, [{ entity: 'eventos', total: 2 }]);
  const page = await relatedRecords(db, 'tractores', '7', ['talleres'], { entity: 'eventos', limit: 1, page: 1 });
  assert.equal(page.total, 2);
  assert.deepEqual(page.data.map(row => row.id), ['E2']);
  const second = await relatedRecords(db, 'tractores', '7', ['talleres'], { entity: 'eventos', limit: 1, page: 2 });
  assert.deepEqual(second.data.map(row => row.id), ['E1']);
  assert.ok(!reads.includes('eventos/unrelated'));
  assert.ok(!reads.includes('eventos'));
  assert.equal((await relatedRecords(db, 'tractores', '7', ['talleres', 'documentos'])).groups[0].total, 3);
  assert.equal(canReadDetail('eventos', { tipo: 'REMITO' }, ['talleres']), false);
  await assert.rejects(relatedRecords(db, 'tractores', '7', ['documentos']), { status: 403 });
});

test('enrichment resolves company abbreviations and stock names without changing persisted records', async () => {
  const data = { 'personas/1': { periodos: [{ inicio: '2024-01-01', empresa: 'company' }], herramientas: [{ id: 'ST1', cantidad: 2 }] }, 'empresas/company': { nombre: 'Empresa', abreviatura: 'EMP' }, 'stock/ST1': { descripcion: 'Llave' } };
  const { db } = memory(data);
  const result = await detailRecord(db, 'personas', '1', ['porteria']);
  assert.equal(result.periodos[0].empresaAbreviatura, 'EMP');
  assert.equal(result.herramientas[0].descripcion, 'Llave');
  assert.equal(data['personas/1'].periodos[0].empresaAbreviatura, undefined);
});

test('depot stock comes from authoritative balances exclusively and supports search/pages', async () => {
  const { db, reads } = memory({ 'depositos/A': { stock: [{ id: 'S1', cantidad: 4 }, { id: 'S2', cantidad: 0 }] }, 'depositos/B': { stock: [{ id: 'S1', cantidad: 99 }] }, 'stock/S1': { descripcion: 'Filtro', cantidad: 103, unidad: 'UN' }, 'stock/S2': { descripcion: 'Aceite', unidad: 'LT' } });
  const result = await depositStock(db, 'A', ['talleres'], { q: 'Filtro', limit: 1 });
  assert.equal(result.total, 1);
  assert.equal(result.data[0].cantidad, 4);
  assert.ok(!reads.includes('depositos/B'));
  assert.ok(!reads.includes('eventos'));
  assert.throws(() => pageRecords([], { page: -1 }), { status: 400 });
});
