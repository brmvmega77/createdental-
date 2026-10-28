import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {workCatalog,normalizeWorkCatalog,reorderCatalogService,reorderCatalogCategory} from './work-catalog.js';
import {orderVariantConstructionLabel,orderWorkLabel} from './order-list-utils.js';

test('surgical socket quantity stays visible in service labels',()=>{
 const socket={work:'Хирургические шаблоны',workOption:'Дополнительное гнездо под имплантант в хирургическом шаблоне',selectedTeeth:[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],units:9};
 assert.equal(orderVariantConstructionLabel(socket), 'Дополнительное гнездо под имплантант в хирургическом шаблоне (9)');
 assert.equal(orderWorkLabel({work:'Хирургические шаблоны',variants:[socket]}), 'Хирургические шаблоны · Дополнительное гнездо под имплантант в хирургическом шаблоне (9)');
});

test('catalog reorder preserves service identity, prices, units and route metadata within a section',()=>{
 const catalog=structuredClone(workCatalog),original=structuredClone(catalog);
 catalog[0].options[0].camMethod='manufacturing';catalog[0].options[0].productionFlows={digital:['intake','cad','doctor','cam','quality','delivery','done']};
 const service=catalog[0].options[0],moved=reorderCatalogService(catalog,0,0,2);
 assert.equal(moved[0].options[2],service);assert.deepEqual(catalog[0].options.map(o=>o.id),original[0].options.map(o=>o.id));
 assert.equal(moved[1],catalog[1]);assert.equal(moved[0].options[2].price,service.price);assert.deepEqual(moved[0].options[2].productionFlows,service.productionFlows);
 const normalized=normalizeWorkCatalog(moved,catalog);assert.deepEqual(normalized[0].options.map(o=>o.id),moved[0].options.map(o=>o.id));
 assert.equal(normalized[0].pricingUnit,catalog[0].pricingUnit);
 assert.deepEqual(reorderCatalogService(moved,0,2,0),catalog);
 for(const args of [[0,-1,0],[0,0,20],[500,0,1],[0,0,0],[0,.5,1]])assert.equal(reorderCatalogService(catalog,...args),catalog);
});

test('catalog section reorder preserves each section and its services',()=>{
 const catalog=structuredClone(workCatalog),original=structuredClone(catalog),moved=reorderCatalogCategory(catalog,0,2);
 assert.equal(moved[2],catalog[0]);assert.equal(moved[0],catalog[1]);assert.equal(moved[0].options[0].id,original[1].options[0].id);
 assert.deepEqual(reorderCatalogCategory(moved,2,0),catalog);
 for(const args of [[-1,0],[0,500],[0,0],[0,.5]])assert.equal(reorderCatalogCategory(catalog,...args),catalog);
});

test('saved service order reaches the clinic, survives restart and preserves commercial data and privileges',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cd-catalog-order-')),data=path.join(temp,'.data');fs.mkdirSync(data);
 const order={id:'OLD',work:'Планирование и диагностика',material:'Wax up цифровой',patient:'Пациент Тестовый',clinic:'Тестовая клиника',clinicId:'clinic',teeth:[11],status:'Новый',productionType:'digital',sum:'2 000 ₽',servicesTotal:2000,deliveryFee:0,createdAt:'2026-10-26T10:00:00Z',date:'30.11.2026',variants:[{work:'Планирование и диагностика',workOption:'Wax up цифровой',selectedTeeth:[11],unitPrice:2000}]};
 const catalog=structuredClone(workCatalog);catalog[0].options[0].camMethod='manufacturing';catalog[0].options[0].productionFlows={digital:['intake','cad','doctor','cam','quality','delivery','done']};
 fs.writeFileSync(path.join(data,'portal.json'),JSON.stringify({orders:[order],clients:[{id:'clinic',name:'Тестовая клиника',approved:true,promoCode:'SAME'}],employees:[{id:'worker',name:'Тестовый техник',status:'active',specialty:'CAD оператор'}],workCatalog:catalog,promoCodes:[{code:'SAME',active:true,name:'',prices:{'Планирование и диагностика|||Wax up цифровой':1500}}],orderOverrides:{},collectionVersions:{}}));
 fs.writeFileSync(path.join(data,'accounts.json'),'[]');fs.writeFileSync(path.join(data,'sessions.json'),JSON.stringify(['chief','clinic','worker'].map(id=>['sha256:'+createHash('sha256').update(id).digest('hex'),{role:id==='chief'?'technician':id==='clinic'?'clinic':'worker',subjectId:id,expires:Date.now()+3600000}])));
 let child,errors='';const port=49000+Math.floor(Math.random()*1000);
 const start=async()=>{child=spawn(process.execPath,[path.resolve('server.js')],{cwd:temp,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PORTAL_DATABASE_URL:process.env.CATALOG_TEST_DATABASE_URL||'',DATABASE_URL:'',TELEGRAM_BOT_TOKEN:'',EMPLOYEE_TELEGRAM_BOT_TOKEN:''},stdio:['ignore','pipe','pipe']});child.stderr.on('data',c=>errors+=c);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(errors)),7000);child.once('exit',()=>{clearTimeout(timer);reject(Error(errors))});child.stdout.on('data',c=>{if(String(c).includes('Create Dental:')){clearTimeout(timer);resolve()}})});};
 const stop=async()=>{if(child?.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}};
 t.after(async()=>{await stop();fs.rmSync(temp,{recursive:true,force:true});});await start();
 const api=async(user,body,version)=>{const r=await fetch(`http://127.0.0.1:${port}/api/portal${body?'/workCatalog':''}`,{method:body?'PUT':'GET',headers:{'X-Portal-Token':user,'Content-Type':'application/json',...(version===undefined?{}:{'X-Portal-Version':String(version)})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const ok=r=>{assert.ok(r.status>=200&&r.status<300,JSON.stringify(r));return r.body;};
 const before=ok(await api('chief')),clinicBefore=ok(await api('clinic')),next=reorderCatalogService(before.workCatalog,0,0,2),expected=next[0].options.map(o=>o.id);
 assert.equal((await api('clinic',next)).status,403);assert.equal((await api('worker',next)).status,403);
 ok(await api('chief',next,before.collectionVersions.workCatalog||0));
 const after=ok(await api('chief')),clinic=ok(await api('clinic'));
 assert.deepEqual(after.workCatalog[0].options.map(o=>o.id),expected);assert.deepEqual(clinic.workCatalog[0].options.map(o=>o.id),expected);
 assert.deepEqual(clinic.orders,clinicBefore.orders);assert.deepEqual(clinic.orderOverrides,clinicBefore.orderOverrides);assert.deepEqual(clinic.promoPrices,clinicBefore.promoPrices);
 assert.deepEqual(after.workCatalog[0].options.find(o=>o.id===before.workCatalog[0].options[0].id),before.workCatalog[0].options[0]);
 const businessData=items=>items.map(({_revision,...category})=>category);assert.deepEqual(businessData(after.workCatalog.slice(1)),businessData(before.workCatalog.slice(1)));
 assert.equal((await api('chief',before.workCatalog,before.collectionVersions.workCatalog||0)).status,409);
 await stop();await start();assert.deepEqual(ok(await api('clinic')).workCatalog[0].options.map(o=>o.id),expected);
});
