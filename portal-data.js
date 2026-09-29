import fs from 'node:fs';
import path from 'node:path';
import {seedOrders} from './seed-orders.js';
import {seedClients,seedEmployees} from './technician.js';

const file=process.env.PORTAL_DATA_FILE||path.join(process.cwd(),'.data','portal.json');
const defaults=()=>({
  orders:seedOrders.map(order=>({...order})),
  orderOverrides:{},
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
  }
} catch(error){
  if(error.code!=='ENOENT')throw error;
}

export function portalSnapshot(){return structuredClone(state)}

function validCollection(key,value){
  const text=(input,max=200)=>typeof input==='string'&&input.length<=max&&!/[<>]/.test(input);
  const unique=items=>new Set(items.map(item=>item.id)).size===items.length;
  if(key==='orders')return Array.isArray(value)&&value.length<=5000&&unique(value)&&value.every(item=>item&&text(item.id,40)&&text(item.patient)&&text(item.work)&&text(item.date,20)&&text(item.sum,40)&&text(item.status,40));
  if(key==='clients')return Array.isArray(value)&&value.length<=2000&&unique(value)&&value.every(item=>item&&text(item.id,80)&&text(item.name)&&text(item.originalName||'',200));
  if(key==='employees')return Array.isArray(value)&&value.length<=500&&unique(value)&&value.every(item=>item&&text(item.id,80)&&text(item.name)&&text(item.originalName||'',200)&&['active','disabled','fired'].includes(item.status));
  if(key==='orderOverrides')return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length<=5000&&Object.entries(value).every(([id,detail])=>text(id,40)&&detail&&typeof detail==='object'&&!Array.isArray(detail)&&(!detail.stage||text(detail.stage,80))&&(!detail.assignee||text(detail.assignee,200)));
  return false;
}

export async function replacePortalCollection(key,value){
  if(!validCollection(key,value))throw new Error('invalid_collection');
  const next=structuredClone(value);
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    const previous=state[key];
    state[key]=next;
    await fs.promises.mkdir(path.dirname(file),{recursive:true,mode:0o700});
    const temporary=file+'.tmp';
    try {
      await fs.promises.writeFile(temporary,JSON.stringify(state),{mode:0o600});
      await fs.promises.rename(temporary,file);
    } catch(error){state[key]=previous;throw error}
  });
  await saveQueue;
  return portalSnapshot();
}
