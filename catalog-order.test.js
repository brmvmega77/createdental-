import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {workCatalog,normalizeWorkCatalog,reorderCatalogService,reorderCatalogCategory} from './work-catalog.js';
import {orderVariantConstructionLabel,orderWorkLabel,displayOrderId} from './order-list-utils.js';

test('human-facing order ids use compact format while preserving readable suffix',()=>{
 assert.equal(displayOrderId('CD-MVON8QHG-5793_W2'), 'MVON8QHG-5793_2');
 assert.equal(displayOrderId('CD-MVON8QHG-5793'), 'MVON8QHG-5793');
 assert.equal(displayOrderId({id:'CD-TEST_W12'}), 'TEST_12');
});

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


test('clinic cart removes the first saved or current service without deleting siblings',()=>{
 const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const removal=source.slice(source.indexOf('function removeOrderVariant(index){'),source.indexOf('function addCurrentOrderToCart()'));
 const service=name=>({work:'Реставрации',workOption:name,selectedTeeth:[21],bridgeRanges:[],toothMode:'Одиночка'});
 const first=service('Первая'),second=service('Вторая'),third=service('Третья');
 const harness=(saved,current)=>{
  const context={state:{orderVariants:structuredClone(saved)},current:structuredClone(current),resetCount:0};
  context.currentVariant=()=>context.current;
  context.variantSignature=v=>JSON.stringify(v);
  context.variantIsComplete=v=>Boolean(v?.work&&v?.workOption&&v?.selectedTeeth?.length);
  context.currentVariantSaved=()=>context.state.orderVariants.some(v=>JSON.stringify(v)===JSON.stringify(context.current));
  context.currentSurgicalGuideIncluded=()=>false;
  context.isSurgicalTemplate=()=>false;
  context.resetCurrentVariant=()=>{context.current={};context.resetCount++};
  vm.createContext(context);vm.runInContext(removal,context);
  return context;
 };
 const unsaved=harness([],first);unsaved.removeOrderVariant(0);
 assert.deepEqual(unsaved.state.orderVariants,[]);assert.equal(unsaved.resetCount,1);assert.deepEqual(unsaved.current,{});
 const selectedFirst=harness([first,second],first);selectedFirst.removeOrderVariant(0);
 assert.deepEqual(selectedFirst.state.orderVariants,[second]);assert.equal(selectedFirst.resetCount,1);
 const otherCurrent=harness([first,second],third);otherCurrent.removeOrderVariant(0);
 assert.deepEqual(otherCurrent.state.orderVariants,[second]);assert.deepEqual(otherCurrent.current,third);assert.equal(otherCurrent.resetCount,0);
 const unsavedLast=harness([second],third);unsavedLast.removeOrderVariant(1);
 assert.deepEqual(unsavedLast.state.orderVariants,[second]);assert.equal(unsavedLast.resetCount,1);
 const invalid=harness([first],third);invalid.removeOrderVariant(9);
 assert.deepEqual(invalid.state.orderVariants,[first]);assert.deepEqual(invalid.current,third);
});

test('different restorations keep independent teeth in either selection order',()=>{
 const source=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');
 const constants=['currentVariant','variantSignature','currentVariantSaved','cloneVariant'].map(name=>source.split('\n').find(line=>line.startsWith(`const ${name} =`))).join('\n');
 const projection=source.slice(source.indexOf('const currentVariantBaseIndex ='),source.indexOf('const serviceSubtotalEstimate ='));
 const actions=source.slice(source.indexOf('function persistCurrentVariant(){'),source.indexOf('function addProstheticAddon('));
 const teethActions=source.slice(source.indexOf('function syncBridgeSelection(){'),source.indexOf('function advanceOrderStep(){'));
 const reset=source.slice(source.indexOf('function resetCurrentVariant(){'),source.indexOf('function resetOrderDraft(){'));
 const removal=source.slice(source.indexOf('function removeOrderVariant(index){'),source.indexOf('function addCurrentOrderToCart()'));
 const create=()=>{
  const context={state:{work:'Реставрации',workOption:'',selectedTeeth:[],bridgeRanges:[],bridgeStart:null,toothMode:'Одиночка',currentVariantBase:null,orderVariants:[],form:{}},upperTeeth:[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],lowerTeeth:[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38],variantIsComplete:v=>Boolean(v?.work&&v?.workOption&&v?.selectedTeeth?.length),currentSurgicalGuideIncluded:()=>false,isNoTeethSelection:()=>false,currentUsesJawSplit:()=>false,isSurgicalTemplate:()=>false,orderServiceCount:vs=>vs.length,notify:()=>{},currentProductionDays:()=>7};
  vm.createContext(context);vm.runInContext(constants+'\n'+projection+'\n'+reset+'\n'+actions+'\n'+teethActions+'\n'+removal,context);
  context.cart=()=>JSON.parse(vm.runInContext('JSON.stringify(allVariants().filter(variantIsComplete))',context));
  context.clickTooth=n=>{context.selectOrderTooth(n);vm.runInContext('if(!state.currentVariantBase&&variantIsComplete(currentVariant()))persistCurrentVariant()',context)};
  return context;
 };
 const slav='Реставрация по Славичеку',zirconia='Цирконий';
 const assertSeparate=c=>assert.deepEqual(c.cart().map(v=>[v.workOption,v.selectedTeeth]),[[slav,[26]],[zirconia,[25]]]);
 // Teeth first: the second tooth is selected before changing the service.
 const teethFirst=create();teethFirst.clickTooth(26);teethFirst.selectWorkOption(slav);teethFirst.clickTooth(25);teethFirst.selectWorkOption(zirconia);assertSeparate(teethFirst);
 teethFirst.persistCurrentVariant();assertSeparate(teethFirst);
 // Service first: changing service starts a clean tooth selection.
 const serviceFirst=create();serviceFirst.selectWorkOption(slav);serviceFirst.clickTooth(26);serviceFirst.selectWorkOption(zirconia);assert.deepEqual(Array.from(serviceFirst.state.selectedTeeth),[]);serviceFirst.clickTooth(25);assertSeparate(serviceFirst);
 // Multiple teeth for one service update that single line instead of duplicating it.
 const multi=create();multi.clickTooth(26);multi.selectWorkOption(slav);multi.clickTooth(25);
 assert.deepEqual(multi.cart().map(v=>[v.workOption,v.selectedTeeth]),[[slav,[25,26]]]);
 multi.persistCurrentVariant();assert.equal(multi.state.orderVariants.length,1);
 multi.clickTooth(24);multi.removeOrderVariant(0);assert.deepEqual(multi.cart(),[]);
 // Explicitly starting another service also isolates the selection.
 const next=create();next.clickTooth(26);next.selectWorkOption(slav);next.addOrderVariant();next.state.work='Реставрации';next.clickTooth(25);next.selectWorkOption(zirconia);assertSeparate(next);
 const bridges=create();bridges.state.toothMode='Мост';bridges.selectWorkOption(slav);bridges.clickTooth(26);assert.equal(bridges.state.orderVariants.length,0);bridges.clickTooth(24);bridges.selectWorkOption(zirconia);bridges.clickTooth(14);bridges.clickTooth(12);
 assert.deepEqual(bridges.cart().map(v=>[v.workOption,v.selectedTeeth]),[[slav,[24,25,26]],[zirconia,[12,13,14]]]);
});
