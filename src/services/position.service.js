import appConfig from '../config/app.config';
import { apiGet, apiMutate } from './api.service';
import { auth } from '../firebase/client';
const base=`/api/v1/apps/${encodeURIComponent(appConfig.appId)}/posiciones`;
export const searchPositionResources=q=>apiGet(`${base}/recursos`,{q});
export const consultResourcePosition=resource=>apiMutate(`${base}/consulta`,'POST',{entity:resource.entity,id:resource.id},{},auth.currentUser?.uid);