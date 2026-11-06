import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Modal, RecordDetail, RelatedRecordsTable, ReloadButton, Alert, LoadingState, Button, QRViewer } from 'cantapp-components';
import { loadRecordDetail, loadRecordRelations, loadDepositStock } from '../services/recordDetails.service';
import { projectDetail } from '../utils/recordDetails';
import { relationLabels, relationColumns, recordDetails } from '../config/recordDetails';
import { dateToIso, formatRecordDate, parseRecordDate } from '../utils/formatRecord';
import { canEditRecord, operationPolicy } from '../config/operations';
import { findCatalog } from '../config/catalog';
import { useAuth } from '../contexts/AuthContext';
import RecordEditor from './RecordEditor';

const PAGE_SIZE = 25;
const dateColumns = new Set(['fecha', 'fechaInicio', 'fechaFin']);
const labels = { id: 'ID', nombre: 'Nombre', nombreCompleto: 'Nombre completo', nombreEmpresa: 'Empresa', dominio: 'Dominio', marca: 'Marca', litros: 'Litros', fecha: 'Fecha', fechaInicio: 'Inicio', fechaFin: 'Fin', tipo: 'Tipo', area: 'Área', persona: 'Persona', tractor: 'Tractor', furgon: 'Furgón', detalle: 'Detalle', descripcion: 'Descripción', cantidad: 'Cantidad', unidad: 'Unidad' };
export default function RecordBrowser({ entity, record, policy, onClose, onEdit, refreshError, warning }) {
  const { data: session, markActivity } = useAuth();
  const [trail, setTrail] = useState([{ kind: 'record', entity, record }]);
  const [editor, setEditor] = useState(null);
  const [resourceQR, setResourceQR] = useState(null);
  const [savedWarning, setSavedWarning] = useState('');
  const [state, setState] = useState({ loading: true });
  const [retry, setRetry] = useState(0);
  const reloadLock = React.useRef(false);
  const current = trail[trail.length - 1];
  const isRoot = trail.length === 1;
  useEffect(() => { setTrail([{ kind: 'record', entity, record }]); }, [entity, record]);
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    async function load() {
      if (current.kind === 'record') {
        let detail = current.record;
        let detailError = '';
        let denied = false;
        try { detail = await loadRecordDetail(current.entity, current.record.id); }
        catch (error) { detailError = error.message; denied = [401, 403].includes(error.status); }
        // A related document is never rendered from a stale/unverified row after a denied read.
        if (detailError && (!isRoot || denied)) { if (active) setState({ loading: false, error: detailError }); return; }
        let relations = [], relationsError = '';
        try { relations = (await loadRecordRelations(current.entity, detail.id)).groups; }
        catch (error) { relationsError = error.message; }
        if (active) setState({ loading: false, detail, detailError, relations, relationsError });
      } else {
        try {
          const query = { entity: current.target, page: current.page, limit: PAGE_SIZE, q: current.search, ...(current.range ? { desde: dateToIso(current.range.from), hasta: dateToIso(current.range.to) } : {}) };
          const result = current.kind === 'stock' ? await loadDepositStock(current.id, query) : await loadRecordRelations(current.entity, current.id, query);
          if (active) {
            setState({ loading: false, ...result });
            const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
            if (Number.isInteger(result.total) && current.page > lastPage) setTrail(previous => previous[previous.length - 1] === current ? [...previous.slice(0, -1), { ...current, page: lastPage }] : previous);
          }
        } catch (error) { if (active) setState({ loading: false, error: error.message }); }
      }
    }
    reloadLock.current = true;
    load().finally(() => { if (active) reloadLock.current = false; });
    return () => { active = false; };
  }, [current, retry, isRoot]);
  const model = useMemo(() => state.detail ? projectDetail(current.entity, state.detail) : null, [current.entity, state.detail]);
  const push = value => setTrail(previous => [...previous, value]);
  const back = () => setTrail(previous => previous.slice(0, -1));
  const reload = () => {
    if (reloadLock.current || state.loading) return;
    reloadLock.current = true;
    markActivity();
    setRetry(value => value + 1);
  };
  const updateQuery = values => setTrail(previous => [...previous.slice(0, -1), { ...previous[previous.length - 1], ...values }]);
  const target = current.target || 'stock';
  const recordGroup = current.entity === 'eventos' ? ['REMITO', 'FACTURA'].includes(state.detail?.tipo) ? 'documentos' : state.detail?.area === 'porteria' ? 'porteria' : 'talleres' : current.entity === 'asignaciones' ? 'asignaciones' : recordDetails[current.entity] && ['personas', 'tractores', 'furgones', 'vehiculos', 'empresas', 'stock', 'depositos'].includes(current.entity) ? 'recursos' : null;
  const recordEntry = recordGroup ? findCatalog(recordGroup, recordGroup === 'recursos' ? current.entity : ['documentos', 'asignaciones'].includes(recordGroup) ? 'listado' : recordGroup === 'porteria' ? 'eventos' : state.detail?.area) : null;
  const relatedPolicy = useMemo(() => recordEntry ? operationPolicy(recordGroup, recordEntry, session?.user, session?.access?.crud) : null, [recordGroup, recordEntry, session]);
  const editPolicy = isRoot ? policy : relatedPolicy;
  const columns = (relationColumns[target] || ['id', 'fecha', 'tipo', 'detalle']).map(key => ({ key, label: labels[key] || key, sortable: false }));
  const rows = (state.data || []).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, dateColumns.has(key) && parseRecordDate(value) ? formatRecordDate(value) : Array.isArray(value) ? value.map(item => typeof item === 'object' ? item.descripcion || item.id || '' : item).join(', ') : value])));
  return <><Modal visible={!editor} showBack onBack={isRoot ? onClose : back} maxWidth={1120} title={current.kind === 'record' ? 'Ficha' : current.kind === 'stock' ? 'Stock actual del depósito' : `Relaciones · ${relationLabels[target] || target}`} onClose={onClose}>
    {current.kind !== 'record' ? <RelatedRecordsTable showBack={false} dateFilter={['eventos', 'asignaciones', 'viajes', 'movimientos', 'cargas'].includes(target)} dateRange={current.range} onDateChange={range => updateQuery({ range, page: 1 })} title={relationLabels[target] || target} data={rows} columns={columns} total={state.total || 0} page={current.page} pageSize={PAGE_SIZE} search={current.search} onSearch={search => updateQuery({ search, page: 1 })} onChangePage={page => updateQuery({ page })} loading={state.loading} error={state.error} onRetry={reload} onReload={reload} onBack={back} onRowPress={row => push({ kind: 'record', entity: target, record: state.data.find(item => item.id === row.id) })} /> : state.loading ? <LoadingState label="Cargando ficha…" /> : model ? <>
      {!!state.detailError && <Alert tone="warning" title="No se pudo enriquecer la ficha" description={state.detailError} />}
      <RecordDetail {...model} relations={(state.relations || []).map(item => ({ ...item, label: relationLabels[item.entity] || item.entity }))} relationsError={state.relationsError} onRetryRelations={() => setRetry(value => value + 1)}
        onOpenRelation={relation => push({ kind: 'relations', entity: current.entity, id: state.detail.id, target: relation.entity, search: '', page: 1 })}
        onOpenStock={model.stock ? () => push({ kind: 'stock', entity: 'depositos', id: state.detail.id, target: 'stock', search: '', page: 1 }) : undefined}
        onEdit={canEditRecord(editPolicy, state.detail) ? () => { markActivity(); if (isRoot) onEdit(state.detail); else setEditor({ policy: editPolicy, entry: recordEntry, record: state.detail }); } : undefined}
        actions={<View style={{ gap: 8 }}>{['tractores', 'furgones'].includes(current.entity) ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <ReloadButton loading={state.loading} onPress={reload} />
          <Button label="Generar QR" icon="qr" variant="outline" onPress={() => {
            markActivity();
            const id = String(current.record.id);
            setResourceQR({ identifier: `${current.entity === 'tractores' ? 'Tractor' : 'Furgón'} ${id}`, value: `CANTAPP:${current.entity.toUpperCase()}:${encodeURIComponent(id)}` });
          }} />
        </View> : <ReloadButton loading={state.loading} onPress={reload} />}{!!refreshError && <Alert tone="warning" description={refreshError} />}{!!(warning || savedWarning) && <Alert tone="warning" description={warning || savedWarning} />}</View>}
      />
    </> : <Alert tone="danger" title="No se pudo abrir la ficha" description={state.error} />}
    {resourceQR && <Modal visible title={`QR · ${resourceQR.identifier}`} onClose={() => setResourceQR(null)}>
      <QRViewer value={resourceQR.value} identifier={resourceQR.identifier} />
    </Modal>}
  </Modal>{editor && <RecordEditor {...editor} title={relationLabels[current.entity] || current.entity} onClose={() => setEditor(null)} onSaved={(saved, message) => { setSavedWarning(message || ''); setEditor(null); updateQuery({ record: saved }); }} />}</>;
}
