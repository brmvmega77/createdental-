import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {reconcileLabOrders,projectLabSnapshot,workProgress,serviceGroups,afterProductionStep,commercialOrdersForLab} from './lab-orders.js';
import {requiresDoctorCadApproval,productionFlowForOrder,cadReadyForProduction} from './production-routes.js';
import {workCatalog} from './work-catalog.js';
import {qualityApprovalChange} from './technician.js';
import {collectPayrollAccruals} from './payroll.js';
const variant=(work,workOption,selectedTeeth=[11],unitPrice=1000)=>({work,workOption,selectedTeeth,unitPrice,toothMode:'Одиночка'});
const baseOrder={id:'GROUP',_revision:9,work:'Несколько услуг',material:'PMMA; Ti; Wax up',clinicId:'clinic-a',clinic:'Clinic A',patient:'Пациент Тестовый',doctor:'Doctor',productionType:'digital',status:'Новый',date:'30.11.2026',createdAt:'2026-10-26T10:00:00Z',teeth:[11],sum:'3 500 ₽',servicesTotal:3000,deliveryFee:500,variants:[variant('Реставрации','PMMA коронка CAD/CAM'),variant('Протетика','Титановое основание Аналог'),variant('Планирование и диагностика','Wax up цифровой')]};
const stateFor=()=>({orders:[structuredClone(baseOrder)],orderOverrides:{GROUP:{stage:'Ожидает распределения'}},orderHistory:[],clients:[],employees:[],salaryAccruals:[],payrollVersion:1,payrollSettings:{revision:0,rates:{}},workCatalog:structuredClone(workCatalog),collectionVersions:{}});

test('distinct services become stable independent works while clinic keeps one order and agreed totals',()=>{
 const original=stateFor(),split=reconcileLabOrders(original),parent=split.orders.find(o=>o.id==='GROUP'),works=split.orders.filter(o=>o.parentOrderId);
 assert.equal(works.length,3);assert.equal(parent.sum,baseOrder.sum);assert.equal(parent.deliveryFee,500);assert.equal(works.reduce((n,w)=>n+w.servicesTotal,0),3000);assert.ok(works.every(w=>w.deliveryFee===0));
 assert.deepEqual(reconcileLabOrders(split),split);
 const clinic=projectLabSnapshot(split,'clinic'),chief=projectLabSnapshot(split,'technician');assert.equal(clinic.orders.length,1);assert.equal(chief.orders.length,3);assert.equal(clinic.orderOverrides.GROUP.serviceWorks.length,3);assert.equal(clinic.orderOverrides.GROUP.progress,0);assert.ok(chief.orders.every(w=>w.clinicOrder.id==='GROUP'));const financial=commercialOrdersForLab(chief.orders);assert.equal(financial.length,1);assert.equal(financial[0].sum,baseOrder.sum);
 const modified=structuredClone(split),work=works[0];modified.orderOverrides[work.id]={stage:'Согласование CAD',cadReview:{status:'pending',fileId:'one'}};
 const synced=reconcileLabOrders(modified,split,'orderOverrides');assert.equal(synced.orderOverrides.GROUP.stage,'Согласование CAD');assert.equal(synced.orderOverrides[works[1].id].stage,'Ожидает распределения');
 assert.equal(projectLabSnapshot(synced,'clinic').orderOverrides.GROUP.serviceWorks.filter(w=>w.cadReview?.status==='pending').length,1);
 assert.equal(serviceGroups({...baseOrder,variants:[baseOrder.variants[0],{...baseOrder.variants[0],selectedTeeth:[21]}]}).length,1);
});

test('doctor approval is limited to two categories for digital and analog; hidden QC does not add clinic steps',()=>{
 for(const productionType of ['digital','analog'])for(const category of workCatalog)for(const service of category.options){
  const order={work:category.name,material:service.name,productionType},flow=productionFlowForOrder(order).flow;
  const required=['Реставрации','Планирование и диагностика'].includes(category.name);
  assert.equal(requiresDoctorCadApproval(order),required,category.name);assert.equal(flow.includes('doctor'),required&&flow.includes('cad'),service.name);
  if(category.name==='Реставрации')assert.equal(flow.includes('category1'),false);
  if(productionType==='analog'&&flow.includes('cad'))assert.ok(flow.indexOf('preprod')<flow.indexOf('cad'));
  const work=workProgress(order,{stage:'Контроль качества',qualityRequest:{kind:'cam'}});assert.equal(work.label,'CAM');assert.ok(work.progress>=0&&work.progress<=100);
 }
});

test('work edits synchronize commercial lines without duplicating delivery, salary or siblings',()=>{
 const before=reconcileLabOrders(stateFor()),next=structuredClone(before),child=next.orders.find(o=>o.parentOrderId);
 child.variants[0].selectedTeeth=[11,12];child.variants[0].amount=2000;
 const synced=reconcileLabOrders(next,before,'orders'),parent=synced.orders.find(o=>o.id==='GROUP');assert.equal(parent.servicesTotal,4000);assert.equal(parent.sum.replace(/\s/g,' '),'4 000 ₽');assert.equal(parent.variants.length,3);assert.equal(parent.variants.find(v=>v.labWorkId===child.id).selectedTeeth.length,2);
 const original=stateFor();original.salaryAccruals=[{orderId:'GROUP',role:'cad',amount:900}];original.orderOverrides.GROUP={stage:'Согласование CAD',cadOperator:'CAD',cadReview:{status:'approved',reviewedAt:'2026-10-26T10:00:00Z'}};
 const migrated=reconcileLabOrders(original);migrated.employees=[{id:'cad',name:'CAD',originalName:'CAD',specialty:'CAD оператор'}];assert.deepEqual(collectPayrollAccruals(migrated,{legacy:true}),[]);
 const order={work:'Вкладки',material:'Вкладка культевая'},at=new Date().toISOString(),detail={stage:'Контроль качества',cadOperator:'CAD',qualityRequest:{kind:'cad'}};
 const change=qualityApprovalChange({...order,...detail},'cad',at);assert.equal(change.stage,'Изготовление');assert.equal(change.cadQualityApprovedAt,at);assert.equal(cadReadyForProduction(order,detail),false);assert.equal(cadReadyForProduction(order,{...detail,...change}),true);
 const payroll={orders:[{...order,id:'INSERT',teeth:[11]}],orderOverrides:{INSERT:{...detail,...change}},employees:[{id:'cad',name:'CAD',originalName:'CAD',specialty:'CAD оператор'}],salaryAccruals:[]};assert.equal(collectPayrollAccruals(payroll,{previousOverrides:{INSERT:detail},actorRole:'technician'}).length,1);
});

test('route changes apply to existing service works and preserve independent statuses',()=>{
 const catalog=structuredClone(workCatalog),category=workCatalog.find(c=>c.name==='Протетика'),option=category.options.find(o=>o.name==='Титановое основание Аналог');
 const before=reconcileLabOrders(stateFor()),work=before.orders.find(o=>o.work==='Протетика');
 try{option.productionFlows={digital:['intake','cam','category1','quality','delivery','done']};assert.equal(productionFlowForOrder(work).flow.includes('cad'),false);assert.equal(afterProductionStep(work,'cam','now').stage,'Техник первой категории');assert.equal(before.orderOverrides[work.id].stage,'Ожидает распределения');}
 finally{workCatalog.splice(0,workCatalog.length,...catalog);}
});

test('HTTP grouping protects clinic/staff scopes, independent CAD/QC, aggregate delivery, edits and restart',async t=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'cd-lab-groups-')),data=path.join(temporary,'.data');fs.mkdirSync(data);
 const initial=stateFor();initial.clients=[{id:'clinic-a',name:'Clinic A',originalName:'Clinic A',approved:true,telegramCode:'CD-CL-12345678'},{id:'clinic-b',name:'Clinic B',originalName:'Clinic B',approved:true,telegramCode:'CD-CL-87654321'}];
 initial.employees=[{id:'cad-a',name:'CAD A',originalName:'CAD A',status:'active',specialty:'CAD оператор'},{id:'cad-b',name:'CAD B',originalName:'CAD B',status:'active',specialty:'CAD оператор'}];
 initial.orderOverrides.GROUP={stage:'Контроль качества',cadOperator:'CAD A',cadOperatorStatus:'ОТК',qualityRequest:{kind:'cad',employeeId:'cad-a',requestedAt:new Date().toISOString()},cadReview:{status:'pending',fileId:'a'.repeat(36),fileName:'cad.html',sentBy:'CAD A',sentAt:new Date().toISOString(),revision:1}};
 initial.orderHistory=[{id:'original',orderId:'GROUP',clinicId:'clinic-a',action:'order_created',at:baseOrder.createdAt}];
 fs.writeFileSync(path.join(data,'portal.json'),JSON.stringify(initial));fs.writeFileSync(path.join(data,'accounts.json'),'[]');
 fs.writeFileSync(path.join(data,'sessions.json'),JSON.stringify(['chief','clinic-a','clinic-b','cad-a','cad-b'].map(id=>['sha256:'+createHash('sha256').update(id).digest('hex'),{role:id==='chief'?'technician':id.startsWith('clinic')?'clinic':'worker',subjectId:id,displayName:id,expires:Date.now()+3600000}])));
 fs.mkdirSync(path.join(data,'order-files'));const inputId='b'.repeat(36),cadId='a'.repeat(36);fs.writeFileSync(path.join(data,'order-files',inputId),'shared');fs.writeFileSync(path.join(data,'order-files',cadId),'<!doctype html><html><body>CAD</body></html>');
 fs.writeFileSync(path.join(data,'order-files.json'),JSON.stringify({GROUP:[{id:inputId,name:'input.txt',type:'text/plain',purpose:'order-file'},{id:cadId,name:'cad.html',type:'text/html',purpose:'cad-review'}]}));
 const port=47000+Math.floor(Math.random()*1000);let child,errors='';
 const start=async()=>{child=spawn(process.execPath,[path.resolve('server.js')],{cwd:temporary,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PORTAL_DATABASE_URL:process.env.LAB_TEST_DATABASE_URL||'',DATABASE_URL:'',TELEGRAM_BOT_TOKEN:'',EMPLOYEE_TELEGRAM_BOT_TOKEN:''},stdio:['ignore','pipe','pipe']});child.stderr.on('data',c=>errors+=c);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(errors)),5000);child.once('exit',()=>{clearTimeout(timer);reject(Error(errors))});child.stdout.on('data',c=>{if(String(c).includes('Create Dental:')){clearTimeout(timer);resolve();}});});};
 const stop=async()=>{if(child?.exitCode===null){const exit=new Promise(resolve=>child.once('exit',resolve));child.kill();await exit;}};
 t.after(async()=>{await stop();fs.rmSync(temporary,{recursive:true,force:true});});await start();
 const api=async(url,user='chief',body,method=body===undefined?'GET':'PUT',version)=>{const response=await fetch(`http://127.0.0.1:${port}${url}`,{method,headers:{'X-Portal-Token':user,'Content-Type':'application/json',...(version===undefined?{}:{'X-Portal-Version':String(version)})},...(body===undefined?{}:{body:JSON.stringify(body)})});const content=await response.text();let result;try{result=JSON.parse(content)}catch{result=content;}return {status:response.status,body:result};};
 const ok=result=>{assert.ok(result.status>=200&&result.status<300,JSON.stringify(result));return result.body;},get=async user=>ok(await api('/api/portal',user));
 let chief=await get('chief');assert.equal(chief.orders.length,3);let clinic=await get('clinic-a');assert.equal(clinic.orders.length,1);assert.equal(clinic.orderOverrides.GROUP.serviceWorks.length,3);assert.equal((await get('clinic-b')).orders.length,0);
 const failedCreation=await api('/api/portal/orders','clinic-a',[...clinic.orders,{...baseOrder,id:'NEW-GROUP',_revision:undefined}], 'PUT');assert.equal(failedCreation.status,502);assert.equal((await get('chief')).orders.length,3);assert.equal((await get('clinic-a')).orders.length,1);
 const restoration=chief.orders.find(o=>o.work==='Реставрации'),prosthetic=chief.orders.find(o=>o.work==='Протетика');
 assert.equal((await api(`/api/orders/${restoration.id}/cad-review`,'clinic-b',{action:'approve'},'POST')).status,403);
 assert.equal((await api(`/api/orders/GROUP/delivery`,'chief',{},'POST')).status,409);
 const approve=async id=>{chief=await get('chief');const work=chief.orders.find(o=>o.id===id),old=chief.orderOverrides[id],at=new Date().toISOString();chief.orderOverrides[id]={...old,...qualityApprovalChange({...work,...old},old.qualityRequest.kind,at)};return api('/api/portal/orderOverrides','chief',chief.orderOverrides);};
 ok(await approve(prosthetic.id));chief=await get('chief');assert.equal(chief.orderOverrides[prosthetic.id].stage,'Изготовление');assert.equal(chief.orderOverrides[restoration.id].stage,'Контроль качества');
 ok(await approve(restoration.id));clinic=await get('clinic-a');assert.equal(clinic.orderOverrides.GROUP.serviceWorks.find(w=>w.id===restoration.id).cadReview.status,'pending');assert.equal(clinic.orderOverrides.GROUP.serviceWorks.find(w=>w.id===prosthetic.id).cadReview,undefined);
 ok(await api(`/api/orders/${restoration.id}/cad-review`,'clinic-a',{action:'approve'},'POST'));chief=await get('chief');assert.equal(chief.orderOverrides[restoration.id].stage,'Изготовление');
 let pay=ok(await api('/api/payroll')).accruals;assert.equal(pay.filter(a=>[restoration.id,prosthetic.id].includes(a.orderId)&&a.role==='cad').length,2);
 // Change only one work in a projected list; hidden parent survives, and stale saves conflict.
 const stale=structuredClone(chief),target=chief.orders.find(o=>o.id===prosthetic.id);target.comment='One service metadata';ok(await api('/api/portal/orders','chief',chief.orders));assert.equal((await get('clinic-a')).orders.length,1);assert.equal((await api('/api/portal/orders','chief',stale.orders,'PUT',stale.collectionVersions.orders)).status,409);
 assert.equal((await api(`/api/order-files/${inputId}`,'cad-a')).status,200);assert.equal((await api(`/api/order-files/${inputId}`,'cad-b')).status,404);
 // Finish each final QC independently; a ready work does not prematurely send the common order.
 chief=await get('chief');for(const work of chief.orders)chief.orderOverrides[work.id]={...chief.orderOverrides[work.id],stage:'Контроль качества',qualityRequest:{kind:'final',requestedAt:new Date().toISOString()}};ok(await api('/api/portal/orderOverrides','chief',chief.orderOverrides));
 for(const work of chief.orders)ok(await approve(work.id));clinic=await get('clinic-a');assert.equal(clinic.orderOverrides.GROUP.stage,'Работа принята');
 assert.equal((await api('/api/orders/GROUP/delivery','cad-a',{},'POST')).status,403);ok(await api('/api/orders/GROUP/delivery','chief',{},'POST'));ok(await api('/api/orders/GROUP/delivery','chief',{},'POST'));
 clinic=await get('clinic-a');assert.equal(clinic.orderOverrides.GROUP.stage,'В доставке');clinic.orderOverrides.GROUP.stage='Принято доктором';clinic.orderOverrides.GROUP.doctorAcceptedAt=new Date().toISOString();ok(await api('/api/portal/orderOverrides','clinic-a',clinic.orderOverrides));
 chief=await get('chief');assert.ok(Object.values(chief.orderOverrides).every(d=>d.stage==='Принято доктором'));assert.equal((await get('clinic-a')).orderOverrides.GROUP.progress,100);
 const salaries=ok(await api('/api/payroll')).accruals;await stop();await start();chief=await get('chief');assert.equal(chief.orders.length,3);assert.equal((await get('clinic-a')).orders.length,1);assert.deepEqual(ok(await api('/api/payroll')).accruals,salaries);
});


test('common delivery is reopened on rework and removed work numbers cannot be reused',()=>{
 const first=reconcileLabOrders(stateFor()),parent=first.orders.find(o=>o.id==='GROUP');
 for(const id of parent.labWorkIds)first.orderOverrides[id]={stage:'В доставке',finalQualityApprovedAt:'2026-10-26T10:00:00Z'};
 first.orderOverrides.GROUP={stage:'В доставке',groupDeliveryAt:'2026-10-26T11:00:00Z'};
 const returned=structuredClone(first);returned.orderOverrides.GROUP={...returned.orderOverrides.GROUP,stage:'На доработке',reworkReason:'Исправить цвет',reworkAt:'2026-10-26T12:00:00Z'};
 const reopened=reconcileLabOrders(returned,first,'orderOverrides');assert.equal(reopened.orderOverrides.GROUP.stage,'На доработке');assert.equal(reopened.orderOverrides.GROUP.groupDeliveryAt,undefined);assert.ok(parent.labWorkIds.every(id=>reopened.orderOverrides[id].reworkNeedsAssignment));
 const edited=structuredClone(first);edited.orders.find(o=>o.id==='GROUP').variants.pop();const removedId=parent.labWorkIds.at(-1),second=reconcileLabOrders(edited,first,'orders');assert.equal(second.orders.some(o=>o.id===removedId),false);
 const third=structuredClone(second);third.orders.find(o=>o.id==='GROUP').variants.push(variant('Вкладки','Вкладка культевая'));const added=reconcileLabOrders(third,second,'orders');assert.equal(added.orders.some(o=>o.id===removedId),false);
});
