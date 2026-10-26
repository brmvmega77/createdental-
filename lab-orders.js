import {reconcilePayment} from './order-revision.js';
import {samePortalValue} from './collection-concurrency.js';
import {groupSurgicalSockets} from './public/assets/surgical-template-utils.js';
import {productionFlowForOrder,requiresDoctorCadApproval,productionFlowLabel} from './production-routes.js';
import {resolveWorkSelection,priceUnitsForSelection,rubles} from './work-catalog.js';

const clone=value=>structuredClone(value);
const equal=samePortalValue;
export const isLabWork=order=>Boolean(order?.parentOrderId);
export const isLabGroup=order=>Array.isArray(order?.labWorkIds)&&order.labWorkIds.length>0;
const variantsOf=order=>order.variants?.length?order.variants:[{work:order.work,workOption:order.material,selectedTeeth:order.teeth||[]}];
export function serviceKey(variant){
 const selected=resolveWorkSelection(variant.workId||variant.work,variant.serviceId||variant.workOption);
 return selected.option?.id||variant.serviceId||`${variant.work}|||${variant.workOption}`;
}
export function serviceGroups(order){
 const groups=new Map();
 for(const {variant,sockets} of groupSurgicalSockets(variantsOf(order))){const key=serviceKey(variant);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(clone(variant),...sockets.map(item=>clone(item.variant)));}
 return [...groups].map(([key,variants])=>({key,variants}));
}
const roleFields={cad:['cadOperator','assignee','cadOperatorStatus'],preprod:['preprodTechnician','preprodTechnicianStatus'],cam:['frameTechnician','technician','frameTechnicianStatus'],category1:['category1Technician','category1TechnicianStatus'],esthetic:['painter','ceramicist','painterStatus','ceramicistStatus']};
export function productionStep(order,detail={}){
 const stage=detail.stage||order.stage||order.status;
 if(['Новый','Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(stage)||!stage)return 'new';
 if(['Принято доктором','Принято','Готово к выдаче'].includes(stage))return 'done';
 if(['В доставке','В пути к вам'].includes(stage))return 'delivery';
 if(stage==='Работа принята')return 'delivery';
 if(stage==='Подготовка')return 'intake';
 if(stage==='Препрод')return 'preprod';
 if(stage==='Моделирование')return 'cad';
 if(stage==='Согласование CAD')return 'doctor';
 if(stage==='Техник первой категории')return 'category1';
 if(stage==='Контроль качества')return detail.qualityRequest?.kind&&detail.qualityRequest.kind!=='final'?detail.qualityRequest.kind:'quality';
 if(stage==='На доработке')return ({esthetic:'esthetic',cam:'cam',preprod:'preprod',cad:'cad',category1:'category1'})[detail.reworkKind]||'cad';
 if(stage==='Изготовление')return detail.manufacturingStatus==='В работе у Красильщика'?'esthetic':'cam';
 return 'intake';
}
export function workProgress(order,detail={}){
 const steps=['new',...productionFlowForOrder(order).flow],step=productionStep(order,detail);
 let index=steps.indexOf(step);
 if(index<0){index=steps.findIndex(id=>['cam','category1','esthetic','quality','delivery'].includes(id));if(index<0)index=0;}
 const completed=step==='done'?steps.length:Math.max(0,index);
 return {step:steps[index],label:steps[index]==='new'?'Новый':productionFlowLabel(steps[index]),steps,completed,total:steps.length,progress:Math.min(100,Math.max(0,Math.round(completed/steps.length*100)))};
}
export function stageEntry(role,at){
 const common={qualityRequest:null,technicianStatus:''};
 if(role==='preprod')return {...common,stage:'Подготовка',preprodTechnicianStatus:'',manufacturingStatus:''};
 if(role==='cad')return {...common,stage:'Подготовка',cadOperatorStatus:'',manufacturingStatus:''};
 if(role==='cam')return {...common,stage:'Изготовление',manufacturingStatus:'В работе у Каркасиста',frameTechnicianStatus:''};
 if(role==='category1')return {...common,stage:'Техник первой категории',manufacturingStatus:'',category1TechnicianStatus:''};
 if(role==='esthetic')return {...common,stage:'Изготовление',manufacturingStatus:'В работе у Красильщика',painterStatus:'',ceramicistStatus:''};
 return {...common,stage:'Контроль качества',qualityRequest:{kind:'final',requestedBy:'chief',requestedByName:'Главный техник',requestedAt:at,next:'Доставка в клинику'}};
}
export function afterProductionStep(order,role,at){
 const flow=productionFlowForOrder(order).flow,index=flow.indexOf(role);
 const next=flow.slice(index<0?1:index+1).find(id=>['preprod','cad','cam','category1','esthetic','quality'].includes(id));
 return stageEntry(next||'quality',at);
}
function inheritedDetail(parent,work,detail,state){
 const result=clone(detail||{stage:'Ожидает распределения'}),flow=productionFlowForOrder(work).flow;
 for(const [role,fields] of Object.entries(roleFields))if(!flow.includes(role)){if(fields.some(field=>field!=='assignee'&&result[field]&&result[field]===result.assignee))delete result.assignee;for(const field of fields)delete result[field];}
 if(!requiresDoctorCadApproval(work)){
  if(result.cadReview)result.cadReview={...result.cadReview,status:result.cadReview.status==='pending'?'not-required':result.cadReview.status};
  if(result.stage==='Согласование CAD')Object.assign(result,afterProductionStep(work,'cad',new Date().toISOString()),{cadOperatorStatus:'Передал дальше',cadQualityApprovedAt:result.qualityApprovedAt||result.cadReview?.sentAt||new Date().toISOString()});
 }
 result.inheritedPayrollRoles=(state.salaryAccruals||[]).filter(item=>item.orderId===parent.id).map(item=>item.role);
 const step=productionStep(work,result);
 if(step!=='new'&&!flow.includes(step))Object.assign(result,stageEntry(flow.find(id=>['preprod','cad','cam','category1','esthetic'].includes(id))||'quality',new Date().toISOString()));
 delete result._revision;
 return result;
}
export function reconcileLabOrders(state,previousState=null,changedKey=''){
 const previous=previousState||state,oldById=new Map((previous.orders||[]).map(order=>[order.id,order]));
 const incomingById=new Map(state.orders.map(order=>[order.id,order])),allocatedIds=new Set(state.orders.map(order=>order.id)),overrides={...state.orderOverrides},orders=[];
 for(const source of state.orders.filter(order=>!isLabWork(order))){
  let parent=clone(source),oldParent=oldById.get(parent.id);
  if(changedKey==='orders'&&isLabGroup(oldParent)&&equal(parent.variants,oldParent.variants)){
   // A chief edits a production work; copy only its service lines back to the commercial order.
   const changed=oldParent.labWorkIds.filter(id=>incomingById.has(id)&&!equal(incomingById.get(id)?.variants,oldById.get(id)?.variants));
   if(changed.length){parent.variants=variantsOf(parent).filter(v=>!changed.includes(v.labWorkId));for(const id of changed)parent.variants.push(...clone(incomingById.get(id).variants).map(v=>({...v,labWorkId:id})));}
  }
  if(changedKey==='orders'&&oldParent)for(const field of ['patient','doctor','doctorId','birth','date','shade','priority']){const changed=state.orders.find(work=>work.parentOrderId===parent.id&&oldById.has(work.id)&&!equal(work[field],oldById.get(work.id)[field]));if(changed&&equal(parent[field],oldParent[field]))parent[field]=changed[field];}
  const groups=serviceGroups(parent);
  if(groups.length<2&&!isLabGroup(parent)){const detail=overrides[parent.id];
   if(detail?.stage==='Согласование CAD'&&!requiresDoctorCadApproval(parent)){overrides[parent.id]={...detail,...afterProductionStep(parent,'cad',detail.qualityApprovedAt||new Date().toISOString()),cadOperatorStatus:'Передал дальше',cadQualityApprovedAt:detail.qualityApprovedAt||new Date().toISOString(),cadReview:{...detail.cadReview,status:'not-required'}};}
   orders.push(parent);continue;}
  const childIds=[],annotated=[];let subtotal=0,nextWorkNumber=Number(parent.nextLabWorkNumber)||1;
  for(const group of groups){
   const existing=state.orders.find(order=>order.parentOrderId===parent.id&&order.serviceKey===group.key);
   let id=existing?.id;
   if(!id){do{id=`${parent.id.slice(0,65)}_W${nextWorkNumber++}`;}while(allocatedIds.has(id)||childIds.includes(id)||(state.salaryAccruals||[]).some(item=>item.orderId===id)||(state.orderHistory||[]).some(item=>item.orderId===id));}
   allocatedIds.add(id);
   const variants=group.variants.map(v=>({...v,labWorkId:id}));
   let total=0;
   for(const v of variants){const selection=resolveWorkSelection(v.workId||v.work,v.serviceId||v.workOption),units=priceUnitsForSelection(v.workId||v.work,v.selectedTeeth||v.teeth||[],v.units,v.pricingUnit);if(v.unitPrice===undefined&&Number.isFinite(Number(selection.price)))v.unitPrice=Number(selection.price);total+=Number.isFinite(v.amount)?v.amount:(Number(v.unitPrice)||0)*units;}
   total=Math.round(total*100)/100;subtotal+=total;
   const first=variants[0],teeth=[...new Set(variants.flatMap(v=>v.selectedTeeth||v.teeth||[]))].sort((a,b)=>a-b);
   const child={...parent,...(existing||{}),id,_revision:existing?._revision||0,parentOrderId:parent.id,serviceKey:group.key,variants,work:first.work,material:first.workOption,teeth,bridgeRanges:variants.flatMap(v=>v.bridgeRanges||[]),quantity:variants.reduce((n,v)=>n+priceUnitsForSelection(v.workId||v.work,v.selectedTeeth||[],v.units,v.pricingUnit),0),servicesTotal:total,deliveryFee:0,sum:rubles(total)};
   for(const key of ['labWorkIds','nextLabWorkNumber','clinicOrder','groupSummary','serviceWorks','paidAt','paidAmount','paymentStatus'])delete child[key];
   for(const key of ['patient','doctor','doctorId','birth','clinic','clinicId','productionType','date','shade','comment','priority','createdAt','promoCode'])if(parent[key]!==undefined&&(key!=='comment'||!existing||!oldParent||parent.comment!==oldParent.comment))child[key]=parent[key];
   if(!existing){overrides[id]=inheritedDetail(parent,child,overrides[parent.id],state);}
   else if(!overrides[id])overrides[id]={stage:'Ожидает распределения'};
   childIds.push(id);annotated.push(...variants);orders.push(child);
  }
  parent={...parent,variants:annotated,labWorkIds:childIds,nextLabWorkNumber:nextWorkNumber};
  if(changedKey==='orders'&&oldParent&&(!equal(parent.variants,oldParent.variants))){parent.servicesTotal=Math.round(subtotal*100)/100;
   if(parent.servicesTotal!==oldParent.servicesTotal){const settings=state.deliverySettings||{freeThreshold:4000,fee:500};parent.deliveryFee=parent.servicesTotal<Number(settings.freeThreshold)?Number(settings.fee):0;}
   parent.sum=rubles(parent.servicesTotal+(Number(parent.deliveryFee)||0));
   parent.teeth=[...new Set(annotated.flatMap(v=>v.selectedTeeth||v.teeth||[]))].sort((a,b)=>a-b);parent.bridgeRanges=annotated.flatMap(v=>v.bridgeRanges||[]);parent.work=groups.length>1?`Несколько услуг (${groups.length})`:annotated[0].work;parent.material=annotated.map(v=>v.workOption).join(' · ');parent=reconcilePayment(oldParent,parent);}
  const old={...(overrides[parent.id]||{})},previousDetail=previous.orderOverrides?.[parent.id]||{};
  if(changedKey==='orderOverrides'&&old.stage==='Принято доктором'&&previousDetail.stage==='В доставке')for(const id of childIds)overrides[id]={...overrides[id],stage:'Принято доктором',doctorAcceptedAt:old.doctorAcceptedAt};
  if(changedKey==='orderOverrides'&&old.stage==='На доработке'&&previousDetail.stage==='В доставке')for(const id of childIds)overrides[id]={...overrides[id],stage:'На доработке',reworkKind:'pending',reworkNeedsAssignment:true,reworkReason:old.reworkReason,reworkAt:old.reworkAt};
  if(parent.status==='Отменён')for(const id of childIds)overrides[id]={...overrides[id],stage:'Отменён'};
  const details=childIds.map(id=>overrides[id]);
  if(details.some(d=>d.stage==='На доработке'))delete old.groupDeliveryAt;
  const allDone=details.every(d=>d.stage==='Принято доктором'),ready=details.every(d=>['В доставке','Принято доктором'].includes(d.stage));
  const stage=parent.status==='Отменён'?'Отменён':allDone?'Принято доктором':old.groupDeliveryAt&&ready?'В доставке':ready?'Работа принята':details.some(d=>d.stage==='На доработке')?'На доработке':details.some(d=>d.stage==='Согласование CAD')?'Согласование CAD':details.every(d=>['Ожидает распределения','Черновик из Telegram','Ожидает подтверждения',undefined].includes(d.stage))?'Ожидает распределения':'Изготовление';
  overrides[parent.id]={...old,stage};
  for(const fields of Object.values(roleFields))for(const field of fields)delete overrides[parent.id][field];
  for(const field of ['qualityRequest','qualityDecision','manufacturingStatus','workerAcceptances','milling'])delete overrides[parent.id][field];
  orders.push(parent);
 }
 const ids=new Set(orders.map(o=>o.id));
 for(const id of Object.keys(overrides))if(!ids.has(id)&&state.orders.some(o=>o.id===id&&isLabWork(o)))delete overrides[id];
 return {...state,orders,orderOverrides:overrides,labOrdersVersion:1};
}
function workSummary(order,detail){
 const progress=workProgress(order,detail);
 const summary={id:order.id,service:order.material||order.work,work:order.work,productionType:order.productionType,...progress};
 if(requiresDoctorCadApproval(order)&&detail.cadReview&&detail.stage!=='Контроль качества')summary.cadReview=clone(detail.cadReview);
 return summary;
}
export function projectLabSnapshot(snapshot,role){
 const result=clone(snapshot),byId=new Map(result.orders.map(o=>[o.id,o]));
 if(role==='clinic'){
  for(const parent of result.orders.filter(isLabGroup)){
   const serviceWorks=parent.labWorkIds.map(id=>byId.get(id)).filter(Boolean).map(order=>workSummary(order,result.orderOverrides[order.id]||{}));
   const total=serviceWorks.reduce((n,w)=>n+w.total,0),completed=serviceWorks.reduce((n,w)=>n+w.completed,0);
   result.orderOverrides[parent.id]={...(result.orderOverrides[parent.id]||{}),serviceWorks,assigned:parent.labWorkIds.some(id=>Object.keys(roleFields).some(role=>roleFields[role].slice(0,-1).some(field=>result.orderOverrides[id]?.[field]))),progress:total?Math.round(completed/total*100):0};
  }
  const parentId=id=>byId.get(id)?.parentOrderId||id;
  result.orderHistory=result.orderHistory.map(e=>({...e,orderId:parentId(e.orderId),...(byId.get(e.orderId)?.parentOrderId?{service:byId.get(e.orderId).material}:{})}));
  result.orders=result.orders.filter(o=>!isLabWork(o));
 }else if(role==='technician'||role==='worker'){
  for(const order of result.orders.filter(isLabWork)){
   const parent=byId.get(order.parentOrderId);
   if(parent&&role==='technician')order.clinicOrder=clone(parent);
   if(parent)order.groupSummary={id:parent.id,count:parent.labWorkIds.length,ready:parent.labWorkIds.every(id=>['В доставке','Принято доктором'].includes(result.orderOverrides[id]?.stage)),stage:result.orderOverrides[parent.id]?.stage};
  }
  result.orders=result.orders.filter(o=>!isLabGroup(o));
 }
 const visible=new Set(result.orders.map(o=>o.id));
 result.orderOverrides=Object.fromEntries(Object.entries(result.orderOverrides).filter(([id])=>visible.has(id)));
 return result;
}
export function relatedFileOrderIds(order,orders,{all=false}={}){
 if(!order)return [];
 if(isLabGroup(order)&&all)return [order.id,...order.labWorkIds];
 return order.parentOrderId?[order.parentOrderId,order.id]:[order.id];
}
export function stripLabProjection(order){const {clinicOrder,groupSummary,...rest}=order;return rest;}

// Financial views count the clinic order once, including its single delivery charge.
export function commercialOrdersForLab(orders=[]){
 const result=[],seen=new Set();
 for(const work of orders){
  const parent=work.parentOrderId&&work.clinicOrder;
  if(!parent){if(!work.parentOrderId)result.push(work);continue;}
  if(seen.has(parent.id))continue;seen.add(parent.id);
  const siblings=orders.filter(item=>item.parentOrderId===parent.id),accepted=siblings.every(item=>item.stage==='Принято доктором');
  result.push({...parent,stage:accepted?'Принято доктором':work.groupSummary?.stage||parent.status,doctorAcceptedAt:accepted?siblings.map(item=>item.doctorAcceptedAt||'').sort().at(-1):parent.doctorAcceptedAt,assignee:work.assignee,clinic:work.clinic});
 }
 return result;
}
