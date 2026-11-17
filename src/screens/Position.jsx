import React, { useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { Alert, Button, Card, Checkbox, Input, KeyValueList, LoadingState, PageHeader, PositionMap, useCantappTheme } from 'cantapp-components';
import { searchPositionResources, consultResourcePosition } from '../services/position.service';
import { loadRecordDetail } from '../services/recordDetails.service';
import { formatRecordDate } from '../utils/formatRecord';
import { useAuth } from '../contexts/AuthContext';

export default function PositionScreen(){
 const theme=useCantappTheme();const {markActivity}=useAuth();
 const [query,setQuery]=useState('');const [results,setResults]=useState({data:[],total:0});const [searched,setSearched]=useState(false);
 const [loading,setLoading]=useState(false);const [consulting,setConsulting]=useState(false);const [error,setError]=useState('');
 const [selected,setSelected]=useState(null);const [result,setResult]=useState(null);
 const [types,setTypes]=useState({personas:true,tractores:true,furgones:true});
 const [inputHeight,setInputHeight]=useState(undefined);
 const [associations,setAssociations]=useState([]);const [consultedAt,setConsultedAt]=useState(null);
 const generation=useRef(0);const lock=useRef(false);
 useEffect(()=>()=>{generation.current++;},[]);
 async function search(value){
  if(lock.current)return;markActivity();
  if(!value.trim()){setError('Ingresá un interno, dominio, DNI o nombre.');return;}
  lock.current=true;const request=++generation.current;
  setLoading(true);setError('');setResult(null);setSelected(null);setSearched(false);setAssociations([]);setConsultedAt(null);
  try{const data=await searchPositionResources(value);if(request===generation.current){setResults(data);setSearched(true);}}
  catch(cause){if(request===generation.current){setError(cause.message);setResults({data:[],total:0});}}
  finally{lock.current=false;if(request===generation.current)setLoading(false);}
 }
 async function locate(resource){
  if(lock.current)return;lock.current=true;markActivity();const request=++generation.current;
  setSelected(resource);setResult(null);setError('');setConsulting(true);setAssociations([]);setConsultedAt(null);
  try{
   const data=await consultResourcePosition(resource);
   const completedAt=new Date().toISOString();
   // These resources were confirmed by the position transaction, including retained positions.
   const references=[...new Set([...(data.persistencia?.guardados||[]),...(data.persistencia?.conservados||[])])]
    .filter(ref=>/^(personas|furgones)\/[^/]+$/.test(ref));
   const associated=await Promise.all(references.map(async ref=>{
    const [entity,id]=ref.split('/');
    try{
     const row=await loadRecordDetail(entity,id);
     const label=entity==='personas'?(row.nombreCompleto||[row.apellido,row.nombres||row.nombre].filter(Boolean).join(', '))
      :[row.interno||id,row.dominio].filter(Boolean).join(' · ');
     return {ref,entity,label:label||id};
    }catch{return {ref,entity,label:id};}
   }));
   if(request===generation.current){setResult(data);setConsultedAt(completedAt);setAssociations(associated);}
  }
  catch(cause){if(request===generation.current)setError(cause.message);}
  finally{lock.current=false;if(request===generation.current)setConsulting(false);}
 }
 const position=result?.posicion;
 const tractor=result?.tractorConsultado;
 const visibleResults=results.data.filter(row=>types[row.entity]);
 const fields=position?{
  coordenadas:`${position.lat}, ${position.lon}`,
  fechaDato:formatRecordDate(position.fechaDato),
  precision:position.fechaDatoEstimada?'Estimada desde la antigüedad informada por FiBOT':'Fecha absoluta informada por FiBOT',
  fechaConsulta:formatRecordDate(consultedAt||position.fechaConsulta),
  fuente:position.fuente==='FiBOT'?'FiBOT':`FiBOT · ${position.fuente}`,
  tractor:tractor?`${tractor.interno}${tractor.dominio?` · ${tractor.dominio}`:''}`:position.tractor,
  tipo:position.tipo==='directa'?'Directa (tractor)':'Asociada mediante viaje activo',
 }:null;
 return <ScrollView style={{flex:1,minHeight:0}} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:12}}>
  <PageHeader title="Posición"/>
  <View style={{gap:4}}>
   <View style={{flexDirection:'row',gap:8,alignItems:'flex-end'}}>
    <View style={{flex:1,minWidth:0}}>
     <Input label="Buscar tractor, furgón o chofer" placeholder="Interno, dominio, DNI o nombre" value={query} onChange={setQuery}
      onLayout={event=>setInputHeight(event.nativeEvent.layout.height)}
      returnKeyType="search" onSubmitEditing={()=>search(query)} disabled={loading||consulting}/>
    </View>
    <Button iconOnly icon="search" accessibilityLabel="Buscar" loading={loading} disabled={consulting}
     style={{height:inputHeight,width:inputHeight,aspectRatio:1,paddingHorizontal:0}} onPress={()=>search(query)}/>
   </View>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
    {[['personas','CHOFER'],['tractores','TRACTOR'],['furgones','FURGÓN']].map(([entity,label])=>
     <Checkbox key={entity} label={label} value={types[entity]} onChange={value=>setTypes(previous=>({...previous,[entity]:value}))}/>
    )}
   </View>
  </View>
  {loading&&<LoadingState label="Buscando recursos…"/>}
  {error&&<Alert tone="danger" title="No se pudo consultar" description={error}/>}
  {searched&&<>
   <Text style={{color:theme.muted}}>{visibleResults.length} recursos encontrados{results.total>results.data.length?' · La consulta está limitada; acotá la búsqueda para ver más coincidencias':''}</Text>
   {!!visibleResults.length&&<FlatList style={{height:Math.min(240,visibleResults.length*56),flexGrow:0}} nestedScrollEnabled keyboardShouldPersistTaps="handled"
    data={visibleResults} keyExtractor={row=>`${row.entity}:${row.id}`}
    renderItem={({item})=><Button label={item.label} variant={selected?.entity===item.entity&&selected.id===item.id?'secondary':'outline'}
     disabled={consulting} style={{alignItems:'flex-start',marginBottom:4}} onPress={()=>locate(item)}/>}/>}
  </>}
  {consulting&&<LoadingState label="Consultando posición en FiBOT…"/>}
  {selected&&result&&!position&&<Alert title="Sin posición disponible" description={result.mensaje}/>}
  {selected&&position&&<Card title={selected.label} subtitle="Última posición disponible">
   <PositionMap key={`${selected.entity}:${selected.id}`} lat={position.lat} lon={position.lon}/>
   {position.fechaDatoEstimada&&<Alert tone="warning" title="Fecha del dato estimada" description="FiBOT no entregó una fecha absoluta. Se calculó desde la fecha de consulta y edad_minutos; no representa una lectura en tiempo real."/>}
   <KeyValueList data={fields} fields={[
    {key:'coordenadas',label:'Coordenadas'},{key:'fechaDato',label:'Fecha del dato'},{key:'fechaConsulta',label:'Fecha de consulta'},
    {key:'precision',label:'Origen de la información'},{key:'fuente',label:'Fuente'},
    {key:'tractor',label:'Tractor consultado'},{key:'tipo',label:'Tipo de posición'},
   ]}/>
   {associations.length?<KeyValueList data={{
    choferes:associations.filter(row=>row.entity==='personas').map(row=>row.label).join(' · '),
    furgones:associations.filter(row=>row.entity==='furgones').map(row=>row.label).join(' · '),
   }} fields={[{key:'choferes',label:'Choferes asociados'},{key:'furgones',label:'Furgones asociados'}]}/>
    :<Text style={{color:theme.muted}}>Sin choferes o furgones asociados</Text>}
   {!!result.persistencia?.conservados?.length&&<Alert title="Dato más reciente conservado" description="La consulta no reemplazó las posiciones previas que eran más recientes o cuya fecha no se pudo comparar con certeza."/>}
   <Button label="Consultar nuevamente" icon="access" disabled={consulting} onPress={()=>locate(selected)}/>
  </Card>}
 </ScrollView>;
}
