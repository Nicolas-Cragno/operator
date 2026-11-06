import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { operationPolicy } = await load(await fs.readFile(new URL('../src/config/operations.js', import.meta.url), 'utf8'));
const { administrationFields } = await load(await fs.readFile(new URL('../../cantapp-components/src/data/administrationFields.js', import.meta.url), 'utf8'));
const requests = [];
globalThis.__operationalCatalog = async path => { requests.push(path); return [{ id: '1', nombre: 'TRACTORES', estado: true, unidad: 'UN' }, { id: '2', estado: false, unidad: 'LT' }]; };
const source = (await fs.readFile(new URL('../src/services/record.service.js', import.meta.url), 'utf8'))
  .replace('import appConfig from "../config/app.config";', 'const appConfig={appId:"app"};')
  .replace('import { apiGet, apiMutate, extractRows } from "./api.service";', 'const apiGet=globalThis.__operationalCatalog, apiMutate=()=>{}, extractRows=value=>value;');
const { initialFormData, recordPayload, formOptions } = await load(source);
const caps = { version: 1, eventAreas: ['tractores', 'furgones', 'porteria'], assignments: true, operations: { version: 1, workshops: true, assignments: true, porteria: false } };
test('new operations require explicit server capability; travel creation stays disabled', () => {
  for (const group of ['talleres', 'asignaciones']) {
    const entry = { id: group === 'talleres' ? 'tractores' : 'listado' };
    assert.equal(operationPolicy(group, entry, { rol: 'admin' }, caps).create, true);
    assert.equal(operationPolicy(group, entry, { rol: 'admin' }, { ...caps, operations: undefined }).create, false);
    assert.equal(operationPolicy(group, entry, { rol: 'user' }, caps), null);
    assert.equal(operationPolicy(group, entry, { rol: 'admin' }, caps).editType, 'detalle');
  }
  const porteria = operationPolicy('porteria', { id: 'eventos' }, { rol: 'admin' }, caps);
  assert.equal(porteria.create, false); assert.match(porteria.createBlockedReason, /idempotente/);
});
test('workshop payload uses the existing area/form and numerical quantities without client dates or numbering', () => {
  for (const type of ['tallerTractor', 'tallerFurgon']) {
    const fields = administrationFields(type);
    const initial = initialFormData(fields);
    const payload = recordPayload(fields, { ...initial, tipo: 'SERVICE', tractor: 't', furgon: 'f', mecanico: ['m'], sucursal: 'u', deposito: 'd', kilometraje: '12', repuestos: [{ id: 'a', cantidad: '2', unidad: 'UN' }], fecha: 'client', orden: 123 }, initial, true, { type });
    assert.equal(payload.formulario, type === 'tallerTractor' ? 'repTractor' : 'repFurgon');
    assert.deepEqual(payload.repuestos, [{ id: 'a', cantidad: 2, unidad: 'UN' }]);
    assert.equal(payload.fecha, undefined); assert.equal(payload.orden, undefined);
    assert.throws(() => recordPayload(fields, { ...initial, repuestos: [{ id: 'a', cantidad: 1, unidad: 'UN' }] }, initial, true, { type }), /depósito/);
  }
});
test('assignment loads live catalogs and preserves persona/ingresos contract without stock delta', async () => {
  const fields = administrationFields('asignacion');
  const options = await formOptions(fields, { creating: true });
  assert.equal(options.ingresos.length, 1);
  assert.equal(options.area[0].value, 'tractores');
  assert.ok(requests.includes('/stock')); assert.ok(requests.includes('/personas')); assert.ok(requests.includes('/sectores'));
  const initial = initialFormData(fields);
  const payload = recordPayload(fields, { ...initial, persona: 'p', area: 'tractores', ingresos: [{ id: 'a', cantidad: '1' }, { id: 'b', cantidad: '0.5' }] }, initial, true, { type: 'asignacion' });
  assert.deepEqual(payload.ingresos, [{ id: 'a', cantidad: 1 }, { id: 'b', cantidad: 0.5 }]);
  assert.equal(payload.cantidad, undefined); assert.equal(payload.articulo, undefined);
});
