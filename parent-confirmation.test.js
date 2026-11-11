import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {workCatalog} from './work-catalog.js';
import {reconcileLabOrders} from './lab-orders.js';

const variant=(work,workOption)=>({work,workOption,selectedTeeth:[11],unitPrice:1000,toothMode:'Одиночка'});
const baseOrder={id:'GROUP',work:'Несколько услуг',material:'PMMA; Ti',clinicId:'clinic-a',clinic:'Тестовая клиника',patient:'Тестовый пациент',productionType:'digital',status:'Новый',telegramDraft:true,date:'29.11.2030',createdAt:'2026-11-12T00:00:00Z',teeth:[11],sum:'2 500 ₽',servicesTotal:2000,deliveryFee:500,variants:[variant('Реставрации','PMMA коронка CAD/CAM'),variant('Протетика','Титановое основание Аналог')]};
const fixture=()=>({orders:[structuredClone(baseOrder),{...structuredClone(baseOrder),id:'SINGLE',work:'Реставрации',variants:[structuredClone(baseOrder.variants[0])]}],orderOverrides:{GROUP:{stage:'Черновик из Telegram'},SINGLE:{stage:'Черновик из Telegram'}},orderHistory:[],clients:[{id:'clinic-a',name:'Тестовая клиника',originalName:'Тестовая клиника',approved:true,telegramCode:'CD-CL-12345678'}],employees:[{id:'worker',name:'Тестовый техник',originalName:'Тестовый техник',status:'active',specialty:'CAD оператор'}],salaryAccruals:[],payrollVersion:1,payrollSettings:{revision:0,rates:{}},workCatalog:structuredClone(workCatalog),collectionVersions:{}});

test('confirmed parent admits new service works without resetting progressed siblings',()=>{
 const before=reconcileLabOrders(fixture()),parent=before.orders.find(o=>o.id==='GROUP'),first=parent.labWorkIds[0];
 before.orderOverrides.GROUP.confirmedAt='2026-11-12T00:00:00Z';
 before.orderOverrides[first]={stage:'Моделирование',cadOperator:'CAD',cadOperatorStatus:'В работе'};
 const progressed=structuredClone(before.orderOverrides[first]);
 parent.variants.push(variant('Планирование и диагностика','Wax up цифровой'));
 const after=reconcileLabOrders(before),works=after.orders.filter(o=>o.parentOrderId==='GROUP');
 assert.equal(works.length,3);
 assert.deepEqual(after.orderOverrides[first],progressed);
 for(const work of works.filter(o=>o.id!==first)){assert.equal(after.orderOverrides[work.id].stage,'Подготовка');assert.equal(work.telegramDraft,false);}
 assert.deepEqual(reconcileLabOrders(after),after);
});

test('HTTP confirmation is one atomic parent action, protects roles, preserves progress and survives restart',async t=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'cd-confirmation-')),data=path.join(temporary,'.data');fs.mkdirSync(data);
 const initial=fixture();fs.writeFileSync(path.join(data,'portal.json'),JSON.stringify(initial));fs.writeFileSync(path.join(data,'accounts.json'),'[]');
 const sessions=['chief','clinic-a','worker'].map(id=>['sha256:'+createHash('sha256').update(id).digest('hex'),{role:id==='chief'?'technician':id==='worker'?'worker':'clinic',subjectId:id,displayName:id,expires:Date.now()+3600000}]);
 fs.writeFileSync(path.join(data,'sessions.json'),JSON.stringify(sessions));
 let child,errors='';const port=49000+Math.floor(Math.random()*500);
 const start=async()=>{child=spawn(process.execPath,[path.resolve('server.js')],{cwd:temporary,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PORTAL_DATABASE_URL:'',DATABASE_URL:'',TELEGRAM_BOT_TOKEN:'',EMPLOYEE_TELEGRAM_BOT_TOKEN:''},stdio:['ignore','pipe','pipe']});child.stderr.on('data',c=>errors+=c);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(errors)),8000);child.once('exit',()=>{clearTimeout(timer);reject(Error(errors))});child.stdout.on('data',c=>{if(String(c).includes('Create Dental:')){clearTimeout(timer);resolve()}})});};
 const stop=async()=>{if(child?.exitCode===null){const exit=new Promise(resolve=>child.once('exit',resolve));child.kill();await exit;}};
 t.after(async()=>{await stop();fs.rmSync(temporary,{recursive:true,force:true})});await start();
 const api=async(url,user='chief',body,method=body===undefined?'GET':'PUT')=>{const response=await fetch(`http://127.0.0.1:${port}${url}`,{method,headers:{'X-Portal-Token':user,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()}};
 const get=async()=>{const response=await api('/api/portal');assert.equal(response.status,200,JSON.stringify(response));return response.body};
 const confirm=(id,user='chief')=>api(`/api/orders/${id}/confirm`,user,undefined,'POST');
 let chief=await get(),works=chief.orders.filter(o=>o.parentOrderId==='GROUP');assert.equal(works.length,2);
 assert.equal((await confirm('GROUP','')).status,401);
 assert.equal((await confirm('GROUP','clinic-a')).status,403);
 assert.equal((await confirm('GROUP','worker')).status,403);
 assert.equal((await api('/api/orders/GROUP/confirm')).status,405);
 assert.equal((await confirm('MISSING')).status,404);
 assert.equal((await confirm(works[0].id)).status,409);
 let attempt=structuredClone(chief.orderOverrides);attempt[works[0].id].stage='Подготовка';assert.equal((await api('/api/portal/orderOverrides','chief',attempt)).status,409);
 // Simulate an existing group where one service has already started.
 attempt=structuredClone(chief.orderOverrides);attempt[works[0].id].stage='Моделирование';assert.equal((await api('/api/portal/orderOverrides','chief',attempt)).status,200);
 chief=await get();const progressed=structuredClone(chief.orderOverrides[works[0].id]);
 assert.equal((await confirm('GROUP')).status,200);
 chief=await get();assert.deepEqual(chief.orderOverrides[works[0].id],progressed);
 assert.equal(chief.orderOverrides[works[1].id].stage,'Подготовка');assert.ok(JSON.parse(fs.readFileSync(path.join(data,'portal.json'),'utf8')).orderOverrides.GROUP.confirmedAt);
 const stored=JSON.parse(fs.readFileSync(path.join(data,'portal.json'),'utf8'));
 assert.ok(stored.orders.filter(o=>o.id==='GROUP'||o.parentOrderId==='GROUP').every(o=>o.telegramDraft===false));
 const confirmed=structuredClone(chief);
 const repeat=await confirm('GROUP');assert.equal(repeat.status,200);assert.equal(repeat.body.alreadyConfirmed,true);assert.deepEqual(await get(),confirmed);
 assert.equal((await confirm('SINGLE')).status,200);chief=await get();assert.equal(chief.orderOverrides.SINGLE.stage,'Подготовка');assert.equal(chief.orders.find(o=>o.id==='SINGLE').telegramDraft,false);
 await stop();await start();chief=await get();assert.equal(chief.orderOverrides[works[1].id].stage,'Подготовка');assert.deepEqual(chief.orderOverrides[works[0].id],progressed);assert.ok(JSON.parse(fs.readFileSync(path.join(data,'portal.json'),'utf8')).orderOverrides.GROUP.confirmedAt);
});
