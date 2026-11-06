import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { paginationDb } from './firestore-pagination.fixture.mjs';
import { dateBounds, dateMillis, operationalDate, withinDates } from '../../../cantapp-back/functions/services/chronological-dates.js';
import { pageRecords, chronologicalRecords } from '../../../cantapp-back/functions/services/record-details.service.js';

test('Argentina boundaries include all Hasta, including the final Firestore nanosecond', () => {
  const bounds = dateBounds({ desde: '2026-11-04', hasta: '2026-11-04' });
  assert.equal(new Date(bounds.from).toISOString(), '2026-11-04T03:00:00.000Z');
  assert.equal(new Date(bounds.until).toISOString(), '2026-11-05T03:00:00.000Z');
  for (const value of ['2026-11-04', '04/11/2026', '04/11/2026 23:59:59', '2026-11-04T23:59:59', '2026-11-05T02:59:59.999Z', { seconds: bounds.until / 1000 - 1, nanoseconds: 999999999 }, { _seconds: bounds.from / 1000, _nanoseconds: 0 }]) assert.equal(withinDates(value, bounds), true, JSON.stringify(value));
  assert.equal(withinDates('2026-11-04T02:59:59.999Z', bounds), false);
  assert.equal(withinDates('2026-11-05T03:00:00Z', bounds), false);
  assert.equal(withinDates(null, bounds), false);
});

test('single bounds, empty defaults and invalid/reversed ranges', () => {
  assert.equal(withinDates('2024-01-01', dateBounds({ hasta: '2026-11-04' })), true);
  assert.equal(withinDates('2027-01-01', dateBounds({ desde: '2026-11-04' })), true);
  assert.equal(withinDates(null, dateBounds()), true);
  for (const value of ['2026-02-30', '2026-13-01', '04/11/2026', 'invalid']) assert.throws(() => dateBounds({ desde: value }), { status: 400 });
  assert.throws(() => dateBounds({ desde: '2026-11-05', hasta: '2026-11-04' }), { status: 400 });
  assert.equal(dateMillis(new Date('2026-11-04T03:00:00Z')), dateBounds({ desde: '2026-11-04' }).from);
});

test('operative dates use trip start and commercial document date with historical fallback', () => {
  assert.equal(operationalDate('viajes', { fechaInicio: '2026-01-02', fechaFin: '2026-02-01', fecha: '2026-01-01' }), '2026-01-02');
  assert.equal(operationalDate('eventos', { tipo: 'FACTURA', fechaEmision: '2026-01-02', fecha: '2026-02-01' }), '2026-01-02');
  assert.equal(operationalDate('eventos', { tipo: 'REMITO', fecha: '2026-02-01' }), '2026-02-01');
  for (const entity of ['asignaciones', 'movimientos', 'cargas']) assert.equal(operationalDate(entity, { fecha: '2026-01-01', fechaInicio: '2026-02-01' }), '2026-01-01');
});

test('server range and search run before counting/pagination and retain newest-first ordering', () => {
  const rows = Array.from({ length: 80 }, (_, index) => ({ id: String(index), fecha: index < 40 ? '2026-11-03' : '2026-11-04', tipo: index % 2 ? 'SERVICE' : 'REVISION' }));
  const result = pageRecords(rows, { desde: '2026-11-04', hasta: '2026-11-04', q: 'service', limit: 5, page: 2 }, 'eventos');
  assert.equal(result.total, 20);
  assert.equal(result.data.length, 5);
  assert.deepEqual(result.data.map(row => row.id), ['69', '67', '65', '63', '61']);
  const trips = pageRecords([{ id: 'early', fechaInicio: '2026-11-01', fecha: '2026-11-04' }, { id: 'late', fechaInicio: '2026-11-04', fecha: '2026-11-01' }], { desde: '2026-11-04' }, 'viajes');
  assert.deepEqual(trips.data.map(row => row.id), ['late']);
});

test('server Llaves scope, quick filters and permissions are applied before the page', async () => {
  const reads = [];
  const rows = [
    { id: 'a', area: 'porteria', fecha: '2026-11-03', tipo: 'ENTREGA', formulario: 'movLlaves' },
    { id: 'b', area: 'porteria', fecha: '2026-11-04', tipo: 'ENTREGA', formulario: 'movLlaves' },
    { id: 'c', area: 'porteria', fecha: '2026-11-04', tipo: 'ENTRADA' },
    { id: 'secret', area: 'porteria', fecha: '2026-11-04', tipo: 'FACTURA' },
  ];
  const db = paginationDb(rows, reads);
  const result = await chronologicalRecords(db, 'eventos', ['porteria'], { area: 'porteria', seccion: 'llaves', tipos: 'ENTREGA', desde: '2026-11-04', limit: 1 });
  assert.deepEqual(result.data.map(row => row.id), ['b']);
  assert.equal(result.total, null);
  assert.deepEqual(reads[0].filters[0], ['area', '==', 'porteria']);
  await assert.rejects(chronologicalRecords(db, 'eventos', ['talleres'], { area: 'porteria' }), { status: 403 });
});

test('catalogs stay without dates and chronological services request one server page', async () => {
  const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const { catalog } = await load(await fs.readFile(new URL('../src/config/catalog.js', import.meta.url), 'utf8'));
  assert.ok(catalog.recursos.every(entry => !entry.dateFilter && !entry.serverEntity));
  assert.ok(['porteria', 'talleres', 'asignaciones', 'documentos'].every(group => catalog[group].every(entry => entry.dateFilter && entry.serverEntity)));
  const calls = [];
  globalThis.dateFilterGet = async (path, params) => { calls.push({ path, params }); return { data: [], total: 0 }; };
  let source = await fs.readFile(new URL('../src/services/catalog.service.js', import.meta.url), 'utf8');
  source = source.replace('import { apiGet, extractRows } from "./api.service";', 'const apiGet = globalThis.dateFilterGet; const extractRows = response => response.data;').replace('import appConfig from "../config/app.config";', 'const appConfig = {appId:"test-app"};');
  const { loadCatalog } = await load(source);
  const entry = catalog.porteria.find(entry => entry.id === 'llaves');
  await loadCatalog(entry, entry.variants[0], () => true, { desde: '2026-11-04', pagina: 3, q: 'persona' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/v1/apps/test-app/records/eventos');
  assert.equal(calls[0].params.pagina, 3);
  assert.equal(calls[0].params.desde, '2026-11-04');
  assert.equal(calls[0].params.seccion, 'llaves');
  delete globalThis.dateFilterGet;
});

test('server search and ordering keep the same enriched labels as existing tables', () => {
  const rows = [{ id: '1', fecha: '2026-11-04', tractor: 'Z1', tractorFull: 'AAA123 (Z1)' }, { id: '2', fecha: '2026-11-04', tractor: 'A1', tractorFull: 'ZZZ123 (A1)' }];
  assert.deepEqual(pageRecords(rows, { campos: 'tractor', q: 'aaa123', desde: '2026-11-04' }, 'eventos').data.map(row => row.id), ['1']);
  assert.deepEqual(pageRecords(rows, { orden: 'tractor', direccion: 'asc' }, 'eventos').data.map(row => row.id), ['1', '2']);
});

test('Operator accepts cursor pages without totals and forwards the continuation unchanged', async () => {
  const calls = [];
  globalThis.cursorCatalogGet = async (path, params) => {
    calls.push({ path, params });
    return { data: [{ id: params.cursor ? 'second' : 'first' }], total: null, pagination: { hasNext: !params.cursor, nextCursor: params.cursor ? null : 'opaque-cursor' } };
  };
  let source = await fs.readFile(new URL('../src/services/catalog.service.js', import.meta.url), 'utf8');
  source = source.replace('import { apiGet, extractRows } from "./api.service";', 'const apiGet = globalThis.cursorCatalogGet; const extractRows = response => response.data;').replace('import appConfig from "../config/app.config";', 'const appConfig = {appId:"test-app"};');
  const { loadCatalog } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const entry = { serverEntity: 'eventos', serverParams: { area: 'porteria' } };
  try {
    const first = await loadCatalog(entry, {}, () => true, { pagina: 1 });
    const second = await loadCatalog(entry, {}, () => true, { pagina: 2, cursor: first.pagination.nextCursor });
    const back = await loadCatalog(entry, {}, () => true, { pagina: 1 });
    assert.equal(calls.length, 3);
    assert.equal(calls[1].params.cursor, 'opaque-cursor');
    assert.equal(second.pagination.hasNext, false);
    assert.equal(second.total, null);
    assert.deepEqual(back.rows, first.rows);
  } finally { delete globalThis.cursorCatalogGet; }
});
