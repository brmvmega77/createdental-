// Service-driven production routes. The route definition is persisted with a
// catalogue service, so the chief technician can build a different flow for
// digital, analogue and restoration work without introducing a second source
// of truth.
import {resolveWorkSelection} from './work-catalog.js';

const text = value => String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

const category = value => text(value).replace(/[^а-яa-z0-9]+/gi, ' ').trim();

export const productionStageDefinitions = [
  {id:'intake',label:'Приём',description:'Принять заказ в производство'},
  {id:'preprod',label:'Препрод техник',description:'Подготовка аналогового заказа'},
  {id:'cad',label:'CAD',description:'Цифровое моделирование'},
  {id:'doctor',label:'Согласование врача',description:'Передать CAD врачу на согласование'},
  {id:'cam',label:'CAM',description:'Производственный этап или фрезеровка'},
  {id:'category1',label:'Техник первой категории',description:'Финишная работа техника'},
  {id:'esthetic',label:'Эстетист',description:'Эстетическая доработка реставрации'},
  {id:'quality',label:'ОТК',description:'Контроль качества'},
  {id:'delivery',label:'Доставка',description:'Подготовить и отправить в клинику'},
  {id:'done',label:'Готово',description:'Работа принята клиникой'}
];
export const productionStageById = Object.fromEntries(productionStageDefinitions.map(stage=>[stage.id,stage]));
export const productionFlowContexts = [
  {id:'digital',label:'Цифровые',shortLabel:'Цифра'},
  {id:'analog',label:'Аналоговые',shortLabel:'Аналог'},
  {id:'restorationDigital',label:'Реставрации · цифра',shortLabel:'Реставрации · цифра'},
  {id:'restorationAnalog',label:'Реставрации · аналог',shortLabel:'Реставрации · аналог'}
];
export const requiredProductionStageIds = ['intake','delivery','done'];
export const optionalProductionStageIds = productionStageDefinitions.map(stage=>stage.id).filter(id=>!requiredProductionStageIds.includes(id));

const contextIsRestoration = context => String(context||'').startsWith('restoration');
const contextIsAnalog = context => String(context||'').endsWith('analog');

export function productionContextForOrder(order={}){
  const restoration=hasRestorationService(order);
  const analog=order.productionType==='analog';
  return restoration?(analog?'restorationAnalog':'restorationDigital'):(analog?'analog':'digital');
}

export function productionContextForService(work='',service='',productionType='digital'){
  const restoration=category(work)==='реставрации';
  return restoration?(productionType==='analog'?'restorationAnalog':'restorationDigital'):(productionType==='analog'?'analog':'digital');
}

export function productionFlowLabel(id){return productionStageById[id]?.label||id}

export function normalizeProductionFlow(flow, fallback=[]){
  const source=Array.isArray(flow)?flow:fallback;
  const allowed=new Set(productionStageDefinitions.map(stage=>stage.id));
  const unique=[];
  for(const id of source){const value=String(id||'');if(allowed.has(value)&&!unique.includes(value))unique.push(value)}
  for(const required of requiredProductionStageIds)if(!unique.includes(required))unique.push(required);
  unique.splice(unique.indexOf('intake'),1);unique.unshift('intake');
  unique.splice(unique.indexOf('done'),1);unique.push('done');
  const deliveryIndex=unique.indexOf('delivery'),doneIndex=unique.indexOf('done');
  if(deliveryIndex>doneIndex){unique.splice(deliveryIndex,1);unique.splice(unique.indexOf('done'),0,'delivery')}
  return unique;
}

export function orderServices(order = {}) {
  const variants = Array.isArray(order.variants) && order.variants.length
    ? order.variants
    : [{ work: order.work, workOption: order.material }];
  return variants.map(item => ({
    work: String(item.work || order.work || ''),
    service: String(item.workOption || item.material || order.material || item.work || '')
  }));
}

export function isRestorationRoute(order = {}) {
  const services = orderServices(order);
  return services.length > 0 && services.every(item => category(item.work) === 'реставрации');
}

export function hasRestorationService(order = {}) {
  return orderServices(order).some(item => category(item.work) === 'реставрации');
}

function serviceMatches(item, patterns) {
  const value = `${category(item.work)} ${category(item.service)}`;
  return patterns.some(pattern => value.includes(pattern));
}

// These services are explicitly assigned to a first-category technician after
// CAM. Restorations keep their existing CAM → aesthetic route.
export function requiresCategory1AfterCam(order = {}) {
  if (isRestorationRoute(order)) return false;
  return orderServices(order).some(item => serviceMatches(item, [
    'вкладк', 'балочн', 'капп', 'сплинт', 'ложк', 'прикусн', 'хирургическ',
    'армирован', 'анодирован', 'силиконов ключ', 'чек трансфер', 'депрограмматор',
    'заживляющ', 'генги', 'абатмент'
  ]));
}

export function isDirectCategory1(order = {}) {
  return orderServices(order).some(item => serviceMatches(item, [
    'анодирован', 'силиконов ключ', 'чек трансфер'
  ]));
}

function legacyDefaultFlow(order={}){
  const analog=order.productionType==='analog';
  const restoration=hasRestorationService(order);
  const category1=requiresCategory1AfterCam(order);
  const direct=isDirectCategory1(order);
  const flow=['intake'];
  if(analog)flow.push('preprod');
  if(!direct)flow.push('cad','doctor','cam');
  else if(category1)flow.push('category1');
  if(!direct&&category1)flow.push('category1');
  if(!direct&&restoration)flow.push('esthetic');
  flow.push('quality','delivery','done');
  return normalizeProductionFlow(flow,['intake','delivery','done']);
}

export function defaultProductionFlowForService(work='',service='',productionType='digital',order={}){
  const sample={...order,work,material:service,productionType};
  return legacyDefaultFlow(sample);
}

export function configuredProductionFlowForService(work='',service='',productionType='digital',catalog=[]){
  const selection=resolveWorkSelection(work,service);
  const option=selection.option;
  const context=productionContextForService(selection.category?.name||work,option?.name||service,productionType);
  const fallback=defaultProductionFlowForService(selection.category?.name||work,option?.name||service,productionType);
  return normalizeProductionFlow(option?.productionFlows?.[context],fallback);
}

export function productionFlowForOrder(order={},catalog=[]){
  const context=productionContextForOrder(order);
  const services=orderServices(order);
  const first=services[0]||{};
  const flow=configuredProductionFlowForService(first.work,first.service,order.productionType==='analog'?'analog':'digital',catalog);
  return {context,flow,labels:flow.map(productionFlowLabel)};
}

export function routeForOrder(order = {}) {
  const analog = order.productionType === 'analog';
  const restoration = hasRestorationService(order);
  const category1 = requiresCategory1AfterCam(order);
  const direct = isDirectCategory1(order);
  const configured=productionFlowForOrder(order);
  const roles=configured.flow.filter(id=>!['intake','delivery','done','doctor','quality'].includes(id));
  return { analog, restoration, directCategory1: direct, category1, roles, context:configured.context, flow:configured.flow, labels:configured.labels };
}

export function nextProductionRole(order = {}) {
  const route = routeForOrder(order);
  return route.category1 ? 'category1' : route.restoration ? 'esthetic' : 'esthetic';
}

