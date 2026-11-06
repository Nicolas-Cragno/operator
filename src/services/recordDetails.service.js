import { apiGet } from './api.service';
import appConfig from '../config/app.config';
const base = `/api/v1/apps/${encodeURIComponent(appConfig.appId)}/records`;
const path = (entity, id) => `${base}/${encodeURIComponent(entity)}/${encodeURIComponent(id)}`;
export const loadRecordDetail = (entity, id) => apiGet(path(entity, id));
export const loadRecordRelations = (entity, id, query = {}) => apiGet(`${path(entity, id)}/relations`, query);
export const loadDepositStock = (id, query = {}) => apiGet(`${path('depositos', id)}/stock`, query);
