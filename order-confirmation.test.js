import test from 'node:test';
import assert from 'node:assert/strict';
import {orderConfirmationChanges} from './technician.js';
import {reconcileLabOrders,projectLabSnapshot,stageEntry} from './lab-orders.js';
import {routeForOrder} from './production-routes.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const at='2026-11-08T12:00:00Z';
const parent={id:'CONFIRM-GROUP',clinicId:'clinic-test',clinic:'Test clinic',patient:'Тестовый пациент',status:'Новый',productionType:'digital',date:'30.12.2026',createdAt:at,variants:[
  {work:'Реставрации',workOption:'Композитная реставрация',selectedTeeth:[26],unitPrice:7000},
  {work:'Протетика',workOption:'Титановое основание Аналог',selectedTeeth:[25],unitPrice:2500}
]};
const fixture=()=>reconcileLabOrders({orders:[structuredClone(parent)],orderOverrides:{[parent.id]:{stage:'Ожидает распределения'}},orderHistory:[],clients:[],employees:[]});

test('one parent confirmation advances every pending work through its own route',()=>{
  for(const productionType of ['digital','analog']){
    const source=fixture();source.orders.forEach(order=>order.productionType=productionType);
    const view=projectLabSnapshot(source,'technician'),order=view.orders[0].clinicOrder;
    const original=structuredClone(view.orderOverrides);
    const next=orderConfirmationChanges(order,view.orders,view.orderOverrides,at);
    assert.deepEqual(view.orderOverrides,original,'building a save must not mutate the displayed state');
    for(const work of view.orders)assert.deepEqual(next[work.id],{...original[work.id],...stageEntry(routeForOrder(work).roles[0]||'quality',at)});
    const saved=reconcileLabOrders({...source,orderOverrides:next},source,'orderOverrides');
    assert.ok(saved.orders.filter(work=>work.parentOrderId).every(work=>saved.orderOverrides[work.id].stage!=='Ожидает распределения'));
    assert.notEqual(saved.orderOverrides[order.id].stage,'Ожидает распределения');
    assert.deepEqual(orderConfirmationChanges(order,view.orders,next,at),next,'confirmation is idempotent');
  }
});

test('confirmation preserves work already in progress and blocks child or incomplete group approval',()=>{
  const source=fixture(),view=projectLabSnapshot(source,'technician'),order=view.orders[0].clinicOrder,active=view.orders[0];
  view.orderOverrides[active.id]={stage:'Моделирование',cadOperator:'Техник',cadOperatorStatus:'В работе',cadReview:{status:'pending'}};
  const next=orderConfirmationChanges(order,view.orders,view.orderOverrides,at);
  assert.deepEqual(next[active.id],view.orderOverrides[active.id]);
  assert.throws(()=>orderConfirmationChanges(active,view.orders,view.orderOverrides,at),/главном заказе/);
  assert.throws(()=>orderConfirmationChanges(order,view.orders.slice(1),view.orderOverrides,at),/Не все подзаказы/);
});

test('an order with one service keeps one confirmation',()=>{
  const order={...parent,id:'SINGLE',variants:parent.variants.slice(0,1)},details={SINGLE:{stage:'Черновик из Telegram'}};
  const next=orderConfirmationChanges(order,[order],details,at);
  assert.equal(next.SINGLE.stage,'Подготовка');
});

test('HTTP saves common confirmation together and lets the chief assign each work independently',async t=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'cd-order-confirmation-')),data=path.join(temporary,'.data');
  fs.mkdirSync(data);
  const initial=fixture();
  initial.clients=[{id:'clinic-test',name:'Test clinic',originalName:'Test clinic',approved:true}];
  initial.employees=[{id:'cad-test',name:'CAD Test',originalName:'CAD Test',status:'active',specialty:'CAD оператор'}];
  fs.writeFileSync(path.join(data,'portal.json'),JSON.stringify(initial));
  fs.writeFileSync(path.join(data,'accounts.json'),'[]');
  fs.writeFileSync(path.join(data,'sessions.json'),JSON.stringify([['sha256:'+createHash('sha256').update('chief-confirmation').digest('hex'),{role:'technician',subjectId:'chief',displayName:'Chief',expires:Date.now()+3600000}]]));
  const port=49000+Math.floor(Math.random()*1000);
  const child=spawn(process.execPath,[path.resolve('server.js')],{cwd:temporary,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PORTAL_DATABASE_URL:'',DATABASE_URL:'',TELEGRAM_BOT_TOKEN:'',EMPLOYEE_TELEGRAM_BOT_TOKEN:''},stdio:['ignore','pipe','pipe']});
  let errors='';child.stderr.on('data',chunk=>errors+=chunk);
  t.after(async()=>{if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}fs.rmSync(temporary,{recursive:true,force:true});});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(errors||'Server startup timed out')),5000);child.once('exit',()=>{clearTimeout(timer);reject(Error(errors));});child.stdout.on('data',chunk=>{if(String(chunk).includes('Create Dental:')){clearTimeout(timer);resolve();}});});
  const api=async(url,body,version)=>{
    const response=await fetch(`http://127.0.0.1:${port}${url}`,{method:body?'PUT':'GET',headers:{'X-Portal-Token':'chief-confirmation','Content-Type':'application/json',...(version===undefined?{}:{'X-Portal-Version':String(version)})},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;
  };
  const before=await api('/api/portal'),order=before.orders[0].clinicOrder;
  const next=orderConfirmationChanges(order,before.orders,before.orderOverrides,at);
  await api('/api/portal/orderOverrides',next,before.collectionVersions.orderOverrides);
  const saved=await api('/api/portal');
  assert.ok(saved.orders.every(work=>!['Ожидает распределения','Черновик из Telegram'].includes(saved.orderOverrides[work.id].stage)));
  assert.notEqual(saved.orders[0].groupSummary.stage,'Ожидает распределения');
  const work=saved.orders.find(item=>item.work==='Реставрации'),sibling=saved.orders.find(item=>item.id!==work.id),siblingBefore=structuredClone(saved.orderOverrides[sibling.id]);
  saved.orderOverrides[work.id]={...saved.orderOverrides[work.id],cadOperator:'CAD Test'};
  await api('/api/portal/orderOverrides',saved.orderOverrides,saved.collectionVersions.orderOverrides);
  const assigned=await api('/api/portal');
  assert.equal(assigned.orderOverrides[work.id].cadOperator,'CAD Test');
  assert.deepEqual(assigned.orderOverrides[sibling.id],siblingBefore);
  assert.equal(assigned.orderOverrides[order.id]?.cadOperator,undefined);
});
