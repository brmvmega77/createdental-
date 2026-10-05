import fs from 'node:fs';
import path from 'node:path';
import {seedOrders} from './seed-orders.js';
import {seedClients,seedEmployees} from './technician.js';

const file=process.env.PORTAL_DATA_FILE||path.join(process.cwd(),'.data','portal.json');
const defaults=()=>({
  orders:seedOrders.map(order=>({...order})),
  orderOverrides:{},
  orderHistory:[],
  clients:seedClients.map(client=>({...client})),
  employees:seedEmployees.map(employee=>({...employee}))
});
let state=defaults();
let saveQueue=Promise.resolve();

try {
  const stored=JSON.parse(fs.readFileSync(file,'utf8'));
  if(stored&&typeof stored==='object'){
    for(const key of ['orders','clients','employees'])if(Array.isArray(stored[key]))state[key]=stored[key];
    if(stored.orderOverrides&&typeof stored.orderOverrides==='object'&&!Array.isArray(stored.orderOverrides))state.orderOverrides=stored.orderOverrides;
    if(Array.isArray(stored.orderHistory))state.orderHistory=stored.orderHistory;
    const demoClients=new Map([['clinic-1','Dental Clinic'],['clinic-2','Smile Studio'],['clinic-3','White Line'],['clinic-4','Nova Dent']]);
    const demoEmployees=new Map([['tech-1','Анна Смирнова'],['tech-2','Дмитрий Орлов'],['tech-3','Мария Ким'],['tech-4','Илья Федоров']]);
    const demoOrders=new Map([['CD-1042','Иванов А.В.'],['CD-1041','Петрова М.С.'],['CD-1040','Смирнов К.О.'],['CD-1039','Кузнецова Е.А.'],['CD-1038','Лебедев Р.И.'],['CD-1037','Соколов Д.В.'],['CD-1036','Орлова Н.С.'],['CD-1035','Морозов К.А.']]);
    const before=JSON.stringify(state);
    state.clients=state.clients.filter(item=>demoClients.get(item.id)!==item.name);
    state.employees=state.employees.filter(item=>demoEmployees.get(item.id)!==item.name);
    state.orders=state.orders.filter(item=>demoOrders.get(item.id)!==item.patient);
    const remaining=new Set(state.orders.map(item=>item.id));
    for(const id of Object.keys(state.orderOverrides))if(!remaining.has(id))delete state.orderOverrides[id];
    if(JSON.stringify(state)!==before){fs.writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});fs.renameSync(file+'.tmp',file)}
  }
} catch(error){
  if(error.code!=='ENOENT')throw error;
}

export function portalSnapshot(){return structuredClone(state)}
export function portalClient(id){return state.clients.find(client=>client.id===id&&!client.deleted)}
export function portalEmployee(id){return state.employees.find(employee=>employee.id===id)}

function validCollection(key,value){
  const text=(input,max=200)=>typeof input==='string'&&input.length<=max&&!/[<>]/.test(input);
  const validId=input=>typeof input==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(input);
  const unique=items=>new Set(items.map(item=>item.id)).size===items.length;
  if(key==='orders')return Array.isArray(value)&&value.length<=5000&&unique(value)&&value.every(item=>item&&validId(item.id)&&text(item.patient)&&text(item.work)&&/^\d{2}\.\d{2}\.\d{4}$/.test(item.date)&&text(item.sum,40)&&text(item.status,40)&&(!item.image||['tooth.png','smile.png','scan.png'].includes(item.image))&&(!item.clinicId||validId(item.clinicId))&&(!item.teeth||Array.isArray(item.teeth)&&item.teeth.every(tooth=>Number.isInteger(tooth)&&tooth>0&&tooth<100)));
  if(key==='clients')return Array.isArray(value)&&value.length<=2000&&unique(value)&&value.every(item=>item&&validId(item.id)&&text(item.name)&&text(item.originalName||'',200)&&(item.approved===undefined||typeof item.approved==='boolean'));
  if(key==='employees')return Array.isArray(value)&&value.length<=500&&unique(value)&&value.every(item=>item&&validId(item.id)&&text(item.name)&&text(item.originalName||'',200)&&['active','disabled','fired'].includes(item.status));
  if(key==='orderOverrides')return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length<=5000&&Object.entries(value).every(([id,detail])=>validId(id)&&detail&&typeof detail==='object'&&!Array.isArray(detail)&&(!detail.stage||text(detail.stage,80))&&(!detail.assignee||text(detail.assignee,200))&&(!detail.reworkReason||text(detail.reworkReason,2000))&&(!detail.completedAt||typeof detail.completedAt==='string'&&detail.completedAt.length<=40));
  return false;
}

function eventFor(orderId,actor,action,details={}){
  return {id:`evt-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,orderId,at:new Date().toISOString(),actor:actor?.name||actor?.role||'Система',actorRole:actor?.role||'system',action,...details};
}
export async function replacePortalCollection(key,value,actor={}){
  if(!validCollection(key,value))throw new Error('invalid_collection');
  const next=structuredClone(value);
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    const previous=state[key];
    const previousHistory=state.orderHistory;
    const generated=[];
    if(key==='orderOverrides'){
      const ids=new Set([...Object.keys(previous||{}),...Object.keys(next||{})]);
      for(const id of ids){
        const before=previous?.[id]||{},after=next?.[id]||{};
        if(before.stage!==after.stage){
          generated.push(eventFor(id,actor,'stage_changed',{from:before.stage||'Новый',to:after.stage||'Новый',reason:after.reworkReason||''}));
        }
        if(before.assignee!==after.assignee)generated.push(eventFor(id,actor,'assignee_changed',{from:before.assignee||'Не назначен',to:after.assignee||'Не назначен'}));
        if(before.reworkReason!==after.reworkReason&&after.reworkReason)generated.push(eventFor(id,actor,'rework_requested',{reason:after.reworkReason}));
      }
    }else if(key==='orders'){
      const oldById=new Map((previous||[]).map(order=>[order.id,order]));
      const newById=new Map(next.map(order=>[order.id,order]));
      for(const order of next){const before=oldById.get(order.id);if(!before)generated.push(eventFor(order.id,actor,'order_created',{summary:`${order.work||'Заказ'} · ${order.patient||''}`}));else if(JSON.stringify(before)!==JSON.stringify(order))generated.push(eventFor(order.id,actor,'order_updated',{summary:'Изменены данные заказа'}))}
      for(const order of previous||[])if(!newById.has(order.id))generated.push(eventFor(order.id,actor,'order_deleted',{summary:'Заказ удалён'}));
    }
    state[key]=next;
    if(generated.length)state.orderHistory=[...(state.orderHistory||[]),...generated].slice(-50000);
    await fs.promises.mkdir(path.dirname(file),{recursive:true,mode:0o700});
    const temporary=file+'.tmp';
    try {
      await fs.promises.writeFile(temporary,JSON.stringify(state),{mode:0o600});
      await fs.promises.rename(temporary,file);
    } catch(error){state[key]=previous;state.orderHistory=previousHistory;throw error}
  });
  await saveQueue;
  return portalSnapshot();
}

export async function recordPortalEvent(orderId,actor,action,details={}){
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    const previous=state.orderHistory;
    state.orderHistory=[...(state.orderHistory||[]),eventFor(orderId||'',actor,action,details)].slice(-50000);
    await fs.promises.mkdir(path.dirname(file),{recursive:true,mode:0o700});
    try{
      await fs.promises.writeFile(file+'.tmp',JSON.stringify(state),{mode:0o600});
      await fs.promises.rename(file+'.tmp',file);
    }catch(error){state.orderHistory=previous;throw error}
  });
  await saveQueue;
  return portalSnapshot().orderHistory.at(-1);
}
