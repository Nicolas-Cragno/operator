import React, { useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, Text, View } from 'react-native';
import { Alert, Button, Card, KeyValueList, LoadingState, PageHeader, PositionMap, SearchInput, useCantappTheme } from 'cantapp-components';
import { searchPositionResources, consultResourcePosition } from '../services/position.service';
import { formatRecordDate } from '../utils/formatRecord';
import { useAuth } from '../contexts/AuthContext';

export default function PositionScreen(){
 const theme=useCantappTheme();const {markActivity}=useAuth();
 const [query,setQuery]=useState('');const [results,setResults]=useState({data:[],total:0});const [searched,setSearched]=useState(false);
 const [loading,setLoading]=useState(false);const [consulting,setConsulting]=useState(false);const [error,setError]=useState('');
 const [selected,setSelected]=useState(null);const [result,setResult]=useState(null);
 const generation=useRef(0);const lock=useRef(false);
 useEffect(()=>()=>{generation.current++;},[]);
 async function search(value){
  if(lock.current)return;markActivity();
  if(!value.trim()){setError('Ingresá un interno, dominio, DNI o nombre.');return;}
  lock.current=true;const request=++generation.current;
  setLoading(true);setError('');setResult(null);setSelected(null);setSearched(false);
  try{const data=await searchPositionResources(value);if(request===generation.current){setResults(data);setSearched(true);}}
  catch(cause){if(request===generation.current){setError(cause.message);setResults({data:[],total:0});}}
  finally{lock.current=false;if(request===generation.current)setLoading(false);}
 }
 async function locate(resource){
  if(lock.current)return;lock.current=true;markActivity();const request=++generation.current;
  setSelected(resource);setResult(null);setError('');setConsulting(true);
  try{const data=await consultResourcePosition(resource);if(request===generation.current)setResult(data);}
  catch(cause){if(request===generation.current)setError(cause.message);}
  finally{lock.current=false;if(request===generation.current)setConsulting(false);}
 }
 const position=result?.posicion;
 const tractor=result?.tractorConsultado;
 const fields=position?{
  coordenadas:`${position.lat}, ${position.lon}`,
  fechaDato:formatRecordDate(position.fechaDato),
  precision:position.fechaDatoEstimada?'Estimada desde la antigüedad informada por FiBOT':'Fecha absoluta informada por FiBOT',
  antiguedad:`${Math.max(0,Math.floor((Date.now()-Date.parse(position.fechaDato))/60000))} minutos`,
  fechaConsulta:formatRecordDate(position.fechaConsulta),
  fuente:position.fuente==='FiBOT'?'FiBOT':`FiBOT · ${position.fuente}`,
  tractor:tractor?`${tractor.interno}${tractor.dominio?` · ${tractor.dominio}`:''}`:position.tractor,
  tipo:position.tipo==='directa'?'Directa (tractor)':'Asociada mediante viaje activo',
 }:null;
 return <ScrollView style={{flex:1,minHeight:0}} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,gap:12}}>
  <PageHeader title="Posición"/>
  <SearchInput label="Buscar tractor, furgón o chofer" placeholder="Interno, dominio, DNI o nombre" value={query} onChange={setQuery}
   onSearch={search} loading={loading} disabled={consulting}/>
  {loading&&<LoadingState label="Buscando recursos…"/>}
  {error&&<Alert tone="danger" title="No se pudo consultar" description={error}/>}
  {searched&&<>
   <Text style={{color:theme.muted}}>{results.total} recursos encontrados{results.total>results.data.length?` · Se muestran ${results.data.length}; acotá la búsqueda`:''}</Text>
   {!!results.data.length&&<FlatList style={{height:Math.min(240,results.data.length*56),flexGrow:0}} nestedScrollEnabled keyboardShouldPersistTaps="handled"
    data={results.data} keyExtractor={row=>`${row.entity}:${row.id}`}
    renderItem={({item})=><Button label={item.label} variant={selected?.entity===item.entity&&selected.id===item.id?'secondary':'outline'}
     disabled={consulting} style={{alignItems:'flex-start',marginBottom:4}} onPress={()=>locate(item)}/>}/>}
  </>}
  {consulting&&<LoadingState label="Consultando posición en FiBOT…"/>}
  {selected&&result&&!position&&<Alert title="Sin posición disponible" description={result.mensaje}/>}
  {selected&&position&&<Card title={selected.label} subtitle="Última posición disponible">
   <PositionMap key={`${selected.entity}:${selected.id}`} lat={position.lat} lon={position.lon}/>
   {position.fechaDatoEstimada&&<Alert tone="warning" title="Fecha del dato estimada" description="FiBOT no entregó una fecha absoluta. Se calculó desde la fecha de consulta y edad_minutos; no representa una lectura en tiempo real."/>}
   <KeyValueList data={fields} fields={[
    {key:'coordenadas',label:'Coordenadas'},{key:'fechaDato',label:'Fecha del dato'},{key:'precision',label:'Origen de la fecha'},
    {key:'antiguedad',label:'Antigüedad actual'},{key:'fechaConsulta',label:'Fecha de consulta'},{key:'fuente',label:'Fuente'},
    {key:'tractor',label:'Tractor consultado'},{key:'tipo',label:'Tipo de posición'},
   ]}/>
   {!!result.persistencia?.conservados?.length&&<Alert title="Dato más reciente conservado" description="La consulta no reemplazó las posiciones previas que eran más recientes o cuya fecha no se pudo comparar con certeza."/>}
   <Button label="Consultar nuevamente" icon="access" disabled={consulting} onPress={()=>locate(selected)}/>
  </Card>}
 </ScrollView>;
}