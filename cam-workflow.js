import {camMethodForOrder} from './work-catalog.js';

export const camWorkflowStages=['Отправлено на фрезеровку','Ожидает принятия','В работе','ОТК','Передал дальше'];

const workStatuses=['Принял работу','Принял в работу','В работе'];
export function camWorkflowStatus(order={}){
  const status=order.frameTechnicianStatus||'';
  if(['Работа сдана','Передал дальше'].includes(status))return 'Передал дальше';
  if(status==='ОТК')return 'ОТК';
  if(camMethodForOrder(order)==='manufacturing')return workStatuses.includes(status)?'В работе':'Ожидает принятия';
  if(!order.milling?.completedAt)return order.milling?.sentAt?'Отправлено на фрезеровку':'Ожидает фрезеровки';
  return workStatuses.includes(status)?'В работе':'Ожидает принятия';
}
export function camCanAccept(order={}){
  const camStage=order.stage==='Изготовление'&&order.manufacturingStatus==='В работе у Каркасиста'||order.stage==='На доработке'&&(!order.reworkKind||order.reworkKind==='cam');
  return Boolean(camStage&&(camMethodForOrder(order)==='manufacturing'||order.milling?.completedAt)&&camWorkflowStatus(order)==='Ожидает принятия');
}
export function camCanSubmitQuality(order={}){
  return order.stage==='Изготовление'&&order.manufacturingStatus==='В работе у Каркасиста'&&(camMethodForOrder(order)==='manufacturing'||Boolean(order.milling?.completedAt))&&camWorkflowStatus(order)==='В работе';
}
export function camAfterMilling(order={},completedAt){
  return {...order,milling:{...order.milling,completedAt},frameTechnicianStatus:'',technicianStatus:'',workerAcceptances:Object.fromEntries(Object.entries(order.workerAcceptances||{}).filter(([,item])=>item?.role!=='frame'))};
}
export function camWorkflowProgress(order={}){
  const index=camWorkflowStages.indexOf(camWorkflowStatus(order));
  return index<0?0:(index+1)*20;
}
