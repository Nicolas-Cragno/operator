import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const load = source => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const dates = await load(await fs.readFile(new URL("../src/utils/formatRecord.js", import.meta.url), "utf8"));
const { catalog } = await load(await fs.readFile(new URL("../src/config/catalog.js", import.meta.url), "utf8"));

test("fechas de Firestore e ISO coinciden en Buenos Aires", () => {
  const iso = "2026-11-02T01:00:00Z";
  const seconds = Date.parse(iso) / 1000;
  for (const value of [iso, { seconds, nanoseconds: 0 }, { _seconds: seconds, _nanoseconds: 0 }]) {
    assert.equal(dates.recordDay(dates.parseRecordDate(value)), "2026-11-01");
    assert.match(dates.formatRecordDate(value), /01\/11\/2026/);
  }
  assert.equal(dates.dateToIso("31/02/2026"), "");
  assert.equal(dates.recordDay(dates.parseRecordDate("02/11/2026")), "2026-11-02");
});

test("Llaves pagina antes de filtrar y resuelve personas y tractores", async () => {
  const calls = [];
  const responses = {
    "/eventos/consulta": [
      { data: [{ id: "otro", formulario: "movPorteria" }], nextCursor: "otro" },
      { data: [{ id: "llave", formulario: "movLlaves", tipo: "RETIRA", persona: 123, operador: "456", tractor: ["7", "ausente"] }], nextCursor: null },
    ],
    "/personas/consulta": [{ data: [{ id: "p", dni: 123, apellido: "Persona", nombres: "Uno" }, { id: "456", apellido: "Operador", nombres: "Dos" }] }],
    "/tractores/consulta": [{ data: [{ id: "7", dominio: "ABC123" }] }],
  };
  globalThis.catalogTestGet = async (path, params) => { calls.push({ path, params }); return responses[path].shift(); };
  let source = await fs.readFile(new URL("../src/services/catalog.service.js", import.meta.url), "utf8");
  source = source.replace('import { apiGet, extractRows } from "./api.service";', 'const apiGet = globalThis.catalogTestGet; const extractRows = body => body.data;');
  const { loadCatalog } = await load(source);
  const entry = catalog.porteria.find(row => row.id === "llaves");
  const rows = await loadCatalog(entry, entry.variants[0]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].nombrePersona, "Persona, Uno");
  assert.equal(rows[0].nombreOperador, "Operador, Dos");
  assert.equal(rows[0].tractorFull, "7 (ABC123), ausente");
  assert.equal(calls[1].params.cursor, "otro");
  assert.deepEqual(entry.filters.map(row => row.value), ["ENTREGA", "RETIRA", "INVENTARIO"]);
  assert.equal(entry.selectRows([{ tipo: "RETIRA" }, { tipo: "INVENTARIO", formulario: "inventario" }, { formulario: "movPorteria", tipo: "ENTRADA" }]).length, 2);
  delete globalThis.catalogTestGet;
});
