import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import {
  DataTable,
  DateRangeFilter,
  SearchInput,
  Button,
  ReloadButton,
  Tabs,
  Alert,
  useCantappTheme,
} from "cantapp-components";

import { loadCatalog } from "../services/catalog.service";
import { useAuth } from "../contexts/AuthContext";
import {
  canEditRecord,
  operationPolicy,
  operationUnavailableReason,
} from "../config/operations";
import RecordEditor from "./RecordEditor";
import RecordBrowser from "./RecordBrowser";
import { auth } from "../firebase/client";
import { pendingMatches, readPendingRecord } from "../services/record.service";
import {
  DATE_FIELDS,
  dateToIso,
  formatRecordDate,
} from "../utils/formatRecord";

const PAGE_SIZE = 50;

const dateKeys = new Set(DATE_FIELDS);
const displayKeys = {
  persona: "nombrePersona",
  operador: "nombreOperador",
  mecanico: "nombreMecanico",
  chofer: "nombreChofer",
  tractor: "tractorFull",
  furgon: "furgonFull",
  proveedor: "nombreProveedor",
  deposito: "depositoFull",
  sucursal: "nombreSucursal",
  ingresos: "ingresosFull",
  repuestos: "repuestosFull",
};
const displayLabels = {
  ingresos: "Artículos",
  repuestos: "Repuestos",
  persona: "Persona",
  nombreMecanico: "Mecánicos",
  tractor: "Tractores",
  furgon: "Furgones",
  area: "Área",
  detalle: "Detalle",
  fecha: "Fecha",
  tipo: "Operación",
  numeroDocumento: "Número",
  proveedor: "Proveedor",
  deposito: "Depósito",
  movimientoEtiqueta: "Movimiento",
  monedaEtiqueta: "Moneda",
  moneda: "Moneda",
  fechaEmision: "Emisión",
  subtotal: "Subtotal",
  descuento: "Descuento (%)",
  total: "Total",
  relaciones: "Relaciones",
  historialModificaciones: "Auditoría",
};

function getField(row, field) {
  return field.split(".").reduce((value, key) => value?.[key], row);
}

function getText(value) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function matchesFilter(row, filter) {
  const actual = getField(row, filter.field);

  if (typeof actual === "boolean") {
    return actual === filter.value;
  }

  return (
    String(actual ?? "").toLowerCase() === String(filter.value).toLowerCase()
  );
}

export default function CatalogTable({ entry, group }) {
  const compact = useWindowDimensions().width < 768;
  const [filtersOpen, setFiltersOpen] = useState(!compact);
  const documents = group === "documentos";
  const serverSide = !!entry.dateFilter;
  const cursorMode = entry.serverEntity === 'eventos' && entry.serverParams?.area === 'porteria';
  const theme = useCantappTheme();
  const { data, markActivity, refresh: refreshAccess } = useAuth();
  const policy = useMemo(
    () => operationPolicy(group, entry, data?.user, data?.access?.crud),
    [group, entry, data?.user, data?.access?.crud],
  );
  const unavailableReason = operationUnavailableReason(
    data?.user,
    data?.access?.crud,
  );
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [pending, setPending] = useState(null);
  const [pendingError, setPendingError] = useState("");
  const ownerUid = auth.currentUser?.uid;

  const [variant, setVariant] = useState(entry.variants[0]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reloadLock = React.useRef(false);

  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [fields, setFields] = useState(entry.searchFields || ["id"]);

  const [activeFilters, setActiveFilters] = useState([]);
  const [draftRange, setDraftRange] = useState({
    from: "",
    to: "",
  });
  const [range, setRange] = useState({
    from: "",
    to: "",
  });

  const [selected, setSelected] = useState(null);
  function openRecord(record) {
    markActivity();
    setSelected(record);
    setDetailError("");
  }
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(null);
  const cursorPages = React.useRef({ key: '', pages: { 1: undefined } });
  const documentQuery = useMemo(
    () =>
      serverSide
        ? {
            pagina: page,
            q: search,
            campos: fields.join(","),
            desde: dateToIso(range.from),
            hasta: dateToIso(range.to),
            orden: sort?.key,
            direccion: sort?.direction,
            tipos: activeFilters
              .filter((id) =>
                documents
                  ? ["REMITO", "FACTURA"].includes(id)
                  : entry.filters?.some(
                      (filter) => filter.id === id && filter.field === "tipo",
                    ),
              )
              .join(","),
            movimientos: activeFilters
              .filter((id) => id.startsWith("mov_"))
              .map((id) => id.slice(4))
              .join(","),
          }
        : null,
    [
      serverSide,
      documents,
      entry,
      page,
      search,
      fields,
      range,
      activeFilters,
      sort,
    ],
  );

  useEffect(() => {
    let active = true;
    if (policy && ownerUid)
      readPendingRecord(ownerUid)
        .then((value) => {
          if (active) {
            setPending(value);
            setPendingError("");
          }
        })
        .catch((err) => {
          if (active) setPendingError(err.message);
        });
    return () => {
      active = false;
    };
  }, [policy, ownerUid, editor, refresh]);

  function updateRecords() {
    if (reloadLock.current || loading) return;
    reloadLock.current = true;
    markActivity();
    setRefresh((value) => value + 1);
  }

  useEffect(() => {
    let active = true;

    setLoading(true);
    reloadLock.current = true;
    setError("");

    const { pagina: requestedPage, ...filters } = documentQuery || {};
    const cursorKey = JSON.stringify([entry.id, variant, filters, refresh]);
    if (cursorMode && cursorPages.current.key !== cursorKey) {
      cursorPages.current = { key: cursorKey, pages: { 1: undefined } };
      if (page !== 1) { setPage(1); return; }
    }
    const query = cursorMode ? { ...documentQuery, cursor: cursorPages.current.pages[requestedPage] } : documentQuery;
    const request =
      documents && !policy
        ? Promise.reject(
            new Error(
              unavailableReason ||
                "Documentos requiere el backend actualizado y permiso de módulo",
            ),
          )
        : loadCatalog(entry, variant, () => active, query || {});
    request
      .then((response) => {
        if (!active) return;
        setRows(serverSide ? response.rows : response);
        if (serverSide) {
          if (response.pagination) {
            cursorPages.current.pages[page + 1] = response.pagination.nextCursor;
            setHasMore(response.pagination.hasNext);
            return;
          }
          setTotal(response.total);
          setPage((current) =>
            Math.min(
              current,
              Math.max(1, Math.ceil(response.total / PAGE_SIZE)),
            ),
          );
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) {
          reloadLock.current = false;
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    entry,
    variant,
    refresh,
    documents,
    serverSide,
    documentQuery,
    policy,
    unavailableReason,
    cursorMode,
    page,
  ]);

  const filtered = useMemo(() => {
    if (serverSide) return rows;
    const term = search.trim().toLowerCase();

    const result = rows.filter((row) => {
      if (term) {
        if (!fields.length) return false;

        const found = fields.some((field) =>
          `${getText(getField(row, field))} ${getText(row[displayKeys[field]])}`
            .toLowerCase()
            .includes(term),
        );

        if (!found) return false;
      }

      if (activeFilters.length) {
        const groups = new Map();
        for (const id of activeFilters) {
          const filter = entry.filters?.find((item) => item.id === id);
          if (filter)
            groups.set(filter.field, [
              ...(groups.get(filter.field) || []),
              filter,
            ]);
        }
        const valid = [...groups.values()].every((filters) =>
          filters.some((filter) => matchesFilter(row, filter)),
        );

        if (!valid) return false;
      }

      return true;
    });

    return result;
  }, [rows, search, fields, activeFilters, entry, serverSide]);

  useEffect(() => {
    if (!serverSide && !loading)
      setPage((current) =>
        Math.min(current, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))),
      );
  }, [serverSide, loading, filtered.length]);

  const tableRows = useMemo(
    () =>
      filtered.map((row) => {
        const formatted = { ...row };
        for (const key of dateKeys) {
          if (row[key] != null) formatted[key] = formatRecordDate(row[key]);
        }
        for (const [key, labelKey] of Object.entries(displayKeys))
          if (row[labelKey]) formatted[key] = row[labelKey];
        return formatted;
      }),
    [filtered],
  );

  const columns = useMemo(() => {
    const configured = entry.listFields || entry.columns || [];

    const fallback = rows.length ? Object.keys(rows[0]).slice(0, 7) : [];
    const keys = configured.length ? configured : fallback;

    return keys.map((key) => ({
      key,
      label: displayLabels[key] || key,
      sortable: !documents && !cursorMode,
      type: undefined,
    }));
  }, [rows, entry, documents, cursorMode]);

  function toggleField(field) {
    setFields((previous) =>
      previous.includes(field)
        ? previous.filter((item) => item !== field)
        : [...previous, field],
    );
    setPage(1);
  }

  function toggleFilter(id) {
    setActiveFilters((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id],
    );
    setPage(1);
  }

  return (
    <View style={{ flex: 1, minHeight: 0, gap: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            flexShrink: 1,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{
              color: theme.text,
              fontSize: 24,
              fontWeight: "700",
              flexShrink: 1,
            }}
          >
            {entry.label}
          </Text>
          <ReloadButton loading={loading} onPress={updateRecords} />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {policy?.create &&
            entry.createActions.map((action) => (
              <Button
                key={action.label}
                label={
                  entry.createActions.length === 1 ? "Agregar" : action.label
                }
                icon="plus"
                disabled={!!pending || !!pendingError}
                onPress={() => {
                  markActivity();
                  setEditor({
                    record: null,
                    initialValues: action.initialValues,
                  });
                }}
              />
            ))}
          {pending && policy && pendingMatches(pending, policy) && (
            <Button
              label="Revisar guardado pendiente"
              onPress={() => setEditor({ record: null })}
            />
          )}
        </View>
      </View>
      {filtersOpen && (
        <View
          style={{
            gap: 8,
            padding: 12,
            borderWidth: 1,
            borderColor: theme.colorE,
            borderRadius: 8,
          }}
        >
          {!!unavailableReason && (
            <View style={{ gap: 8 }}>
              <Alert
                tone="warning"
                title="Formularios no habilitados por el servidor"
                description={unavailableReason}
              />
              <Button
                label="Actualizar permisos de la sesión"
                variant="outline"
                onPress={refreshAccess}
              />
            </View>
          )}
          {entry.variants.length > 1 && (
            <Tabs
              items={entry.variants.map((item) => ({
                key: item.id,
                label: item.label,
              }))}
              value={variant.id}
              onChange={(id) => {
                const next = entry.variants.find((item) => item.id === id);

                if (next) {
                  setVariant(next);
                  setPage(1);
                }
              }}
            />
          )}

          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.text, fontWeight: "700" }}>
              Buscar por
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {entry.searchFields.map((field) => {
                const checked = fields.includes(field);

                return (
                  <Pressable
                    key={field}
                    onPress={() => toggleField(field)}
                    style={{
                      padding: 9,
                      borderWidth: 1,
                      borderColor: checked ? theme.colorA : theme.colorE,
                      borderRadius: 4,
                      backgroundColor: checked ? theme.colorD : "transparent",
                    }}
                  >
                    <Text style={{ color: theme.text }}>
                      {checked ? "☑" : "☐"} {field}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "flex-end",
              gap: 8,
            }}
          >
            <View style={{ flex: 1, minWidth: 220 }}>
              <SearchInput
                label="Buscar registros"
                value={searchDraft}
                onChange={setSearchDraft}
                onSearch={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
              />
            </View>
          </View>

          {policy?.createBlockedReason && (
            <Alert
              tone="warning"
              title="Alta de ENTRADA/SALIDA deshabilitada"
              description={policy.createBlockedReason}
            />
          )}
          {pending && (
            <Alert
              tone="warning"
              title="Solicitud pendiente de revisión"
              description={`Hay una solicitud de ${pending.operation.type}. Revisala en su módulo para continuar guardando.`}
            />
          )}
          {pendingError && (
            <Alert
              tone="warning"
              title="No se pudo verificar el estado local"
              description={pendingError}
            />
          )}
          {detailError && (
            <Alert
              tone="warning"
              title="No se pudo actualizar la ficha"
              description={detailError}
            />
          )}
          {notice && (
            <Alert
              title="Registro guardado"
              description={
                notice.warning ||
                `Se guardó ${notice.id}. El listado se actualiza automáticamente; los filtros actuales pueden ocultarlo.`
              }
              tone={notice.warning ? "warning" : "success"}
            />
          )}

          {!!entry.filters?.length && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: theme.text, fontWeight: "700" }}>
                Filtros rápidos
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {entry.filters.map((filter) => {
                  const checked = activeFilters.includes(filter.id);

                  return (
                    <Pressable
                      key={filter.id}
                      onPress={() => toggleFilter(filter.id)}
                      style={{
                        padding: 9,
                        borderWidth: 1,
                        borderColor: checked ? theme.colorA : theme.colorE,
                        borderRadius: 4,
                      }}
                    >
                      <Text style={{ color: theme.text }}>
                        {checked ? "☑" : "☐"} {filter.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {entry.dateFilter && (
            <View style={{ gap: 8 }}>
              <DateRangeFilter
                compact
                autoApply
                value={draftRange}
                onChange={setDraftRange}
                onApply={(next) => {
                  setRange(next);
                  setPage(1);
                }}
                onClear={() => {
                  const empty = { from: "", to: "" };
                  setDraftRange(empty);
                  setRange(empty);
                  setPage(1);
                }}
              />
            </View>
          )}

          {!loading && !error && (
            <Text style={{ color: theme.muted }}>
              {serverSide
                ? cursorMode ? `${rows.length} registros en esta página · Página ${page}` : `${total} ${documents ? "documentos" : "registros"} encontrados · Página ${page}`
                : `${filtered.length} registros encontrados entre los ${rows.length} recibidos del servidor.`}
            </Text>
          )}
        </View>
      )}
      <Button
        label={filtersOpen ? "Ocultar filtros" : "Filtros y búsqueda"}
        variant="ghost"
        style={{ alignSelf: "flex-start", marginTop: "-10px" }}
        onPress={() => setFiltersOpen((value) => !value)}
      />

      <DataTable
        fill
        serverSide={serverSide}
        total={serverSide && !cursorMode ? total : undefined}
        hasMore={cursorMode ? hasMore : undefined}
        sort={serverSide ? sort : undefined}
        onSortChange={
          serverSide
            ? (next) => {
                setSort(next);
                setPage(1);
              }
            : undefined
        }
        data={tableRows}
        columns={columns}
        onRowPress={(row) =>
          openRecord(filtered.find((item) => item.id === row.id) ?? row)
        }
        loading={loading}
        error={error}
        onRetry={updateRecords}
        page={page}
        pageSize={PAGE_SIZE}
        onChangePage={setPage}
        emptyMessage={cursorMode && hasMore ? "No hay coincidencias en esta página. Podés continuar con Siguiente." : "No hay registros para mostrar"}
      />

      {selected && !editor && (
        <RecordBrowser
          entity={
            group === "recursos"
              ? entry.id
              : group === "asignaciones"
                ? "asignaciones"
                : "eventos"
          }
          record={selected}
          policy={pending || pendingError ? null : policy}
          onClose={() => setSelected(null)}
          onEdit={(record) => {
            if (!pending && !pendingError && canEditRecord(policy, record)) {
              markActivity();
              setEditor({ record });
            }
          }}
          refreshError={detailError}
          warning={notice?.id === selected.id ? notice.warning : ""}
        />
      )}
      {editor && (
        <RecordEditor
          entry={entry}
          policy={policy}
          record={editor.record}
          initialValues={editor.initialValues}
          title={entry.label}
          onClose={() => setEditor(null)}
          onSaved={(saved, warning) => {
            markActivity();
            setSelected(saved);
            setDetailError("");
            setEditor(null);
            setNotice({ id: saved.id, warning });
            setRefresh((value) => value + 1);
          }}
        />
      )}
    </View>
  );
}
