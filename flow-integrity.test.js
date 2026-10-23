import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';
import {qualityReworkChange,qualityApprovalChange} from './technician.js';
import {cadDecisionChange,reworkRouteChange,workerTransitionAllowed,releaseEmployeeAssignments,repairLegacyFlowState} from './flow-rules.js';
import {availableClinicDoctors} from './clinic-doctors.js';
import {versionCollection} from './collection-concurrency.js';
import {workCatalog,normalizeWorkCatalog,priceUnitsForSelection} from './work-catalog.js';
import {payrollServiceKey,payrollRate} from './payroll.js';
import {reviseOrderServices} from './order-revision.js';
import {calculateCompanyPulse} from './company-pulse.js';
const upper=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
test('stable catalog IDs preserve jaw units and legacy custom salary rates after renaming',()=>{
 const previous=structuredClone(workCatalog),category=previous.find(c=>c.name==='Каппы'),service=category.options[1];
 const settings={rates:{cad:{[category.name+'|||'+service.name]:[1234,1234,1234,1234,1234]}}};
 const changed=structuredClone(previous),edited=changed.find(c=>c.id===category.id);edited.name='Шины';edited.options[1].name='Отбеливание';
 try{workCatalog.splice(0,workCatalog.length,...normalizeWorkCatalog(changed,previous));
 assert.equal(priceUnitsForSelection('Шины',upper),1);assert.equal(priceUnitsForSelection('Каппы',upper),1);
 const key=payrollServiceKey('Шины','Отбеливание');assert.equal(key,'service:'+service.id);assert.equal(payrollRate(settings,'cad',1,key),1234);
 }finally{workCatalog.splice(0,workCatalog.length,...previous);}
});
test('service revisions update one position and preserve jaw pricing and other positions',()=>{
 const order={variants:[{work:'Вкладки',workOption:'Вкладка культевая',selectedTeeth:upper,toothMode:'Челюсть'},{work:'Вкладки',workOption:'Вкладка культевая',selectedTeeth:[31],toothMode:'Одиночка',unitPrice:3500}]};
 assert.throws(()=>reviseOrderServices(order,{work:'Каппы',material:'Каппа для отбеливания'}),/Выберите позицию/);
 const result=reviseOrderServices(order,{work:'Каппы',material:'Каппа для отбеливания'},{variantIndex:0});
 assert.equal(result.variants[0].amount,5000);assert.equal(result.variants[1].amount,3500);assert.equal(result.servicesTotal,8500);assert.equal(result.quantity,2);
 assert.equal(order.variants[0].work,'Вкладки');
});
test('stale collection snapshots and concurrent deletions cannot overwrite newer records',()=>{
 const initial={a:{stage:'Подготовка'},b:{stage:'Подготовка'}};
 const saved=versionCollection('orderOverrides',{...initial,a:{stage:'Моделирование'}},initial);
 assert.throws(()=>versionCollection('orderOverrides',{...initial,b:{stage:'Моделирование'}},saved),/collection_conflict/);
 assert.throws(()=>versionCollection('orderOverrides',{b:initial.b},saved),/collection_conflict/);
 const promos=versionCollection('promoCodes',[{code:'DEMO',active:true}],[]);assert.equal(versionCollection('promoCodes',promos,promos)[0]._revision,1);
});
test('disabled staff lose only their own active assignments; completed history is preserved',()=>{
 const state={active:{stage:'Препрод',preprodTechnician:'Гипс',cadOperator:'CAD',frameTechnician:'CAM',painter:'Эстетист'},complete:{stage:'Принято доктором',preprodTechnician:'Гипс'}};
 const next=releaseEmployeeAssignments(state,[{id:'g',originalName:'Гипс',status:'fired'},{id:'unknown',status:'disabled'}]);
 assert.equal(next.active.preprodTechnician,'');assert.equal(next.active.cadOperator,'CAD');assert.equal(next.active.frameTechnician,'CAM');assert.equal(next.active.stage,'Препрод');assert.equal(next.complete.preprodTechnician,'Гипс');
});
test('hidden doctors are not offered and cancelled orders do not generate overdue alerts',()=>{
 assert.deepEqual(availableClinicDoctors({doctors:[{id:'one',name:'Врач',active:true}],clinicHiddenDoctorIds:['one']}),[]);
 const pulse=calculateCompanyPulse([{id:'cancel',stage:'Отменён',date:'01.10.2026'}],[],new Date('2026-10-23T12:00:00Z'),[]);assert.equal(pulse.deadlines.overdue,0);
});
test('quality returns reopen the right role and block employee quality bypasses',()=>{
 for(const kind of ['cam','esthetic','final','preprod']){
 const employee={id:kind==='final'?'esthetic':kind,originalName:'Техник',specialty:{cam:'CAM оператор',esthetic:'Эстетист',final:'Эстетист',preprod:'Гипсовщик'}[kind]};
 const detail={stage:'Контроль качества',frameTechnician:'Техник',painter:'Техник',preprodTechnician:'Техник',frameTechnicianStatus:'ОТК',painterStatus:'Работа сдана',preprodTechnicianStatus:'ОТК',milling:{completedAt:'2026-10-22T12:00:00Z'},qualityRequest:{kind,employeeId:employee.id}};
 const change=qualityReworkChange(detail,'Другое','Исправить посадку','2026-10-23T12:00:00Z'),returned={...detail,...change};
 const field=kind==='cam'?'frameTechnicianStatus':kind==='preprod'?'preprodTechnicianStatus':'painterStatus';
 assert.equal(returned.stage,'На доработке');assert.equal(returned[field],'');
 const resumed={...returned,stage:kind==='preprod'?'Препрод':'Изготовление',[field]:'В работе',technicianStatus:'В работе',...(kind==='esthetic'||kind==='final'?{ceramicistStatus:'В работе'}:{})};
 assert.equal(workerTransitionAllowed(returned,resumed,employee),true,kind);
 assert.equal(workerTransitionAllowed(detail,{...detail,stage:'Изготовление'},employee),false);
 const pending={...returned,reworkNeedsAssignment:true};assert.equal(workerTransitionAllowed(pending,{...resumed,reworkNeedsAssignment:true},employee),false);
 }
});
test('legacy stuck returns are repaired once while advanced orders and history stay intact',()=>{
 const before={employees:[],orderOverrides:{cam:{stage:'Изготовление',manufacturingStatus:'',frameTechnicianStatus:'ОТК',qualityDecision:{kind:'cam',result:'rejected'}},clinic:{stage:'На доработке'},done:{stage:'В доставке',qualityDecision:{kind:'cam',result:'rejected'}}},collectionVersions:{}};
 const next=repairLegacyFlowState(before);assert.equal(next.orderOverrides.cam.stage,'На доработке');assert.equal(next.orderOverrides.cam.frameTechnicianStatus,'');assert.equal(next.orderOverrides.clinic.reworkNeedsAssignment,true);assert.deepEqual(next.orderOverrides.done,before.orderOverrides.done);assert.equal(repairLegacyFlowState(next),next);
});
test('clinic rework clears downstream completion and requires a new acceptance at the selected role',()=>{
 const base={stage:'На доработке',reworkNeedsAssignment:true,cadOperator:'Техник',preprodTechnician:'Техник',frameTechnician:'Техник',painter:'Техник',cadOperatorStatus:'Передал дальше',preprodTechnicianStatus:'Работа сдана',frameTechnicianStatus:'Работа сдана',painterStatus:'Работа сдана',milling:{completedAt:'2026-10-22T12:00:00Z'}};
 for(const [kind,specialty] of [['cad','CAD оператор'],['preprod','Гипсовщик'],['cam','CAM оператор'],['esthetic','Эстетист']]){const change=reworkRouteChange(base,kind),next={...base,...change},field={cad:'cadOperatorStatus',preprod:'preprodTechnicianStatus',cam:'frameTechnicianStatus',esthetic:'painterStatus'}[kind];assert.equal(change[field],'');assert.equal(next.reworkNeedsAssignment,false);const accepted={...next,stage:kind==='cad'?'Моделирование':kind==='preprod'?'Препрод':'Изготовление',[field]:'В работе',technicianStatus:'В работе',...(kind==='esthetic'?{ceramicistStatus:'В работе'}:{})};assert.equal(workerTransitionAllowed(next,accepted,{id:kind,originalName:'Техник',specialty}),true,kind);}
 const approved=cadDecisionChange({...base,reworkKind:'cad'},true,{status:'approved'});assert.equal(approved.manufacturingStatus,'В работе у Каркасиста');assert.equal(approved.frameTechnicianStatus,'');assert.equal(approved.painterStatus,'');assert.deepEqual(approved.milling,{});
});
test('HTTP regression: digital and analog routes, scoped visibility, conflicts, edits and rework',async context=>{
const audit=path.dirname(fileURLToPath(import.meta.url));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cd-flow-fixture-'));fs.mkdirSync(path.join(temp,'.data'));
const at='2026-10-22T12:00:00.000Z';
const names={cam:'CAM User',esthetic:'Esthetic User',cad:'CAD User',preprod:'Gypsum User'};
const specialties={cam:'CAM оператор',esthetic:'Эстетист',cad:'CAD оператор',preprod:'Гипсовщик'};
const orders=['QCAM','QESTH','QFINAL','QCAD','DELIVERED','EDIT-A','EDIT-B','CANCELLED','HAPPY','ANALOG'].map(id=>({id,patient:'Пациент Тестовый',clinicId:'a',clinic:'Clinic A',work:'Вкладки',material:'Вкладка культевая',sum:'4 000 ₽',status:'Новый',date:'30.11.2026',teeth:[11],createdAt:at}));
const base={assignee:names.cad,cadOperator:names.cad,frameTechnician:names.cam,painter:names.esthetic,productionType:'digital',milling:{sentAt:at,completedAt:at},manufacturingStatus:'В работе у Каркасиста'};
const overrides={};
for(const [id,kind] of [['QCAM','cam'],['QESTH','esthetic'],['QFINAL','final'],['QCAD','cad']])overrides[id]={...base,stage:'Контроль качества',manufacturingStatus:kind==='cam'?'В работе у Каркасиста':'В работе у Красильщика',frameTechnicianStatus:kind==='cam'?'ОТК':'Работа сдана',painterStatus:kind==='final'?'Работа сдана':'ОТК',qualityRequest:{kind,employeeId:kind==='final'?'esthetic':kind,requestedAt:at}};
overrides.DELIVERED={...base,stage:'В доставке',frameTechnicianStatus:'Работа сдана',painterStatus:'Работа сдана'};
overrides['EDIT-A']={stage:'Подготовка',comment:'before-a'};overrides['EDIT-B']={stage:'Подготовка',comment:'before-b'};overrides.CANCELLED={stage:'Отменён'};
overrides.HAPPY={...base,manufacturingStatus:undefined,stage:'Моделирование',frameTechnicianStatus:'',painterStatus:'',cadOperatorStatus:'В работе'};
orders.find(o=>o.id==='ANALOG').productionType='analog';overrides.ANALOG={...base,stage:'Подготовка',assignee:names.preprod,cadOperator:'',preprodTechnician:names.preprod,productionType:'analog',preprodTechnicianStatus:'',frameTechnicianStatus:'',painterStatus:''};
const clients=[{id:'a',name:'Clinic A',originalName:'Clinic A',approved:true,telegramCode:'CD-CL-12345678',doctors:[{id:'da',name:'Doctor A',active:true}],clinicHiddenDoctorIds:['da'],doctorsRevision:0},{id:'b',name:'Clinic B',originalName:'Clinic B',approved:true,telegramCode:'CD-CL-87654321'}];
const employees=Object.keys(names).map(id=>({id,name:names[id],originalName:names[id],status:'active',specialty:specialties[id],rank:1}));
fs.writeFileSync(path.join(temp,'.data/portal.json'),JSON.stringify({orders,orderOverrides:overrides,clients,employees,orderHistory:[],clientRequests:[],tasks:[],payrollVersion:1,salaryAccruals:[],payrollSettings:{revision:0,rates:{}}}));fs.writeFileSync(path.join(temp,'.data/accounts.json'),'[]');
const sessions=['chief','a','b',...Object.keys(names)].map(id=>['sha256:'+createHash('sha256').update('audit-'+id).digest('hex'),{role:id==='chief'?'technician':['a','b'].includes(id)?'clinic':'worker',subjectId:id,expires:Date.now()+3600000}]);fs.writeFileSync(path.join(temp,'.data/sessions.json'),JSON.stringify(sessions));
fs.writeFileSync(path.join(temp,'.data/order-files.json'),JSON.stringify({ANALOG:[{id:'abcdef1234567890abcdef12',name:'analog.html',purpose:'cad-review',type:'text/html',size:100}],HAPPY:[{id:'1234567890abcdef12345678',name:'cad.html',purpose:'cad-review',type:'text/html',size:100}]}));

const port=51000+Math.floor(Math.random()*1000),child=spawn(process.execPath,[path.join(audit,'server.js')],{cwd:temp,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PORTAL_DATABASE_URL:process.env.FLOW_TEST_DATABASE_URL||'',DATABASE_URL:'',TELEGRAM_BOT_TOKEN:'',EMPLOYEE_TELEGRAM_BOT_TOKEN:'',HTTPS_REDIRECT:'0'},stdio:['ignore','pipe','pipe']});
let errors='';child.stderr.on('data',c=>errors+=c);
context.after(async()=>{if(child.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await done;}fs.rmSync(temp,{recursive:true,force:true});});
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup '+errors)),15000);child.once('exit',c=>{clearTimeout(timer);reject(Error('Exit '+c+' '+errors))});child.stdout.on('data',c=>{if(String(c).includes('Create Dental:')){clearTimeout(timer);resolve()}})});
const api=async(url,user='chief',value,method=value===undefined?'GET':'PUT',headers={})=>{const response=await fetch('http://127.0.0.1:'+port+url,{method,headers:{'X-Portal-Token':'audit-'+user,'Content-Type':'application/json',...headers},...(value!==undefined?{body:JSON.stringify(value)}:{})});return {status:response.status,body:await response.json()}};
const ok=result=>{assert.ok(result.status>=200&&result.status<300,JSON.stringify(result));return result.body;};
const get=async()=>ok(await api('/api/portal'));
const updateOwn=async(user,id,change)=>{const own=ok(await api('/api/portal',user)).orderOverrides;own[id]={...own[id],...change};return api('/api/portal/orderOverrides',user,own);};
const approveQuality=async(kind,id='HAPPY')=>{const p=await get(),old=p.orderOverrides[id],stamp=new Date().toISOString();const next={...old,...qualityApprovalChange(old,kind,stamp),qualityDecision:{kind,result:'approved',at:stamp,requestedAt:old.qualityRequest?.requestedAt||''}};return api('/api/portal/orderOverrides','chief',{...p.orderOverrides,[id]:next});};
let all=await get();assert.ok(all.workCatalog.every(c=>c.id&&c.pricingUnit));
const cadOwn=ok(await api('/api/portal','cad')).orderOverrides;cadOwn.QCAD.stage='Моделирование';assert.equal((await api('/api/portal/orderOverrides','cad',cadOwn)).status,409);
const snapshot=all.orderOverrides,first=structuredClone(snapshot),stale=structuredClone(snapshot);first['EDIT-A'].comment='saved-a';stale['EDIT-B'].comment='saved-b';
ok(await api('/api/portal/orderOverrides','chief',first));assert.equal((await api('/api/portal/orderOverrides','chief',stale)).status,409);assert.equal((await get()).orderOverrides['EDIT-A'].comment,'saved-a');
const headerStale=all.collectionVersions.orderOverrides||0;assert.equal((await api('/api/portal/orderOverrides','chief',(await get()).orderOverrides,'PUT',{'X-Portal-Version':String(headerStale)})).status,409);
all=await get();all.orderOverrides.QCAM={...all.orderOverrides.QCAM,...qualityReworkChange(all.orderOverrides.QCAM,'Другое','Исправить конструкцию',new Date().toISOString())};ok(await api('/api/portal/orderOverrides','chief',all.orderOverrides));
ok(await updateOwn('cam','QCAM',{stage:'Изготовление',frameTechnicianStatus:'В работе',technicianStatus:'В работе'}));
ok(await api('/api/orders/DELIVERED/rework','a',{reason:'Исправить цвет конструкции'},'POST'));all=await get();assert.equal(all.orderOverrides.DELIVERED.reworkNeedsAssignment,true);assert.equal(all.orderOverrides.DELIVERED.reworkKind,'pending');
const painterPending=ok(await api('/api/portal','esthetic'));assert.equal((await updateOwn('esthetic','DELIVERED',{stage:'Изготовление',painterStatus:'В работе'})).status,409);
// Hidden doctors allow an empty doctor selection; file storage remains a separate integration requirement.
const own=ok(await api('/api/portal','a'));const hidden=await api('/api/portal/orders','a',[{...orders[0],id:'NEW-HIDDEN',doctorId:'',doctor:'',date:'30.11.2026'},...own.orders]);assert.notEqual(hidden.body.error,'invalid_doctor');assert.ok(!/врача/i.test(hidden.body.error||''),JSON.stringify(hidden));if(hidden.status>=400)assert.equal((await get()).orders.some(o=>o.id==='NEW-HIDDEN'),false,'failed cloud folder creation must remove only the attempted new order');
all=await get();let priceOrders=all.orders.map(o=>o.id==='EDIT-A'?{...o,teeth:upper,variants:[{work:'Вкладки',workOption:'Вкладка культевая',selectedTeeth:upper,toothMode:'Челюсть'}]}:o);ok(await api('/api/portal/orders','chief',priceOrders));
const request=ok(await api('/api/orders/EDIT-A/client-request','a',{type:'edit',field:'service',value:'Каппы|||Каппа для отбеливания'},'POST'));ok(await api('/api/client-requests/'+request.request.id+'/approve','chief',{},'POST'));
const edited=(await get()).orders.find(o=>o.id==='EDIT-A');assert.equal(edited.servicesTotal,5000);assert.equal(edited.variants[0].work,'Каппы');assert.equal(edited.quantity,1);
// CAD requires chief QC before doctor approval; a second submit is rejected.
ok(await api('/api/orders/HAPPY/cad-review','cad',{action:'submit',fileId:'1234567890abcdef12345678'},'POST'));
assert.equal((await api('/api/orders/HAPPY/cad-review','a',{action:'approve'},'POST')).status,409);
ok(await approveQuality('cad'));ok(await api('/api/orders/HAPPY/cad-review','a',{action:'approve'},'POST'));
ok(await updateOwn('cam','HAPPY',{frameTechnicianStatus:'В работе',technicianStatus:'В работе'}));
ok(await updateOwn('cam','HAPPY',{stage:'Контроль качества',frameTechnicianStatus:'ОТК',qualityRequest:{kind:'cam',employeeId:'cam',requestedAt:new Date().toISOString()}}));ok(await approveQuality('cam'));
assert.equal((await get()).orderOverrides.HAPPY.painterStatus,'');
assert.equal((await updateOwn('esthetic','HAPPY',{stage:'Контроль качества',painterStatus:'ОТК',ceramicistStatus:'ОТК',qualityRequest:{kind:'esthetic',employeeId:'esthetic',requestedAt:new Date().toISOString()}})).status,409);
ok(await updateOwn('esthetic','HAPPY',{painterStatus:'В работе',ceramicistStatus:'В работе',technicianStatus:'В работе'}));
ok(await updateOwn('esthetic','HAPPY',{stage:'Контроль качества',painterStatus:'ОТК',ceramicistStatus:'ОТК',qualityRequest:{kind:'esthetic',employeeId:'esthetic',requestedAt:new Date().toISOString()}}));
ok(await approveQuality('esthetic'));assert.equal((await get()).orderOverrides.HAPPY.qualityRequest.kind,'final');ok(await approveQuality('final'));
const accepted=ok(await api('/api/portal','a')).orderOverrides;accepted.HAPPY={...accepted.HAPPY,stage:'Принято доктором',doctorAcceptedAt:new Date().toISOString()};ok(await api('/api/portal/orderOverrides','a',accepted));
assert.equal((await get()).orderOverrides.HAPPY.stage,'Принято доктором');const ledger=ok(await api('/api/payroll')).accruals.filter(a=>a.orderId==='HAPPY');assert.deepEqual(ledger.map(a=>a.role).sort(),['cad','cam','esthetic']);
ok(await updateOwn('preprod','ANALOG',{stage:'Препрод',preprodTechnicianStatus:'В работе',technicianStatus:'В работе'}));
ok(await updateOwn('preprod','ANALOG',{stage:'Контроль качества',preprodTechnicianStatus:'ОТК',technicianStatus:'ОТК',qualityRequest:{kind:'preprod',employeeId:'preprod',requestedAt:new Date().toISOString()}}));ok(await approveQuality('preprod','ANALOG'));
all=await get();all.orderOverrides.ANALOG.cadOperator=names.cad;ok(await api('/api/portal/orderOverrides','chief',all.orderOverrides));
ok(await updateOwn('cad','ANALOG',{stage:'Моделирование',cadOperatorStatus:'В работе',technicianStatus:'В работе'}));
ok(await api('/api/orders/ANALOG/cad-review','cad',{action:'submit',fileId:'abcdef1234567890abcdef12'},'POST'));ok(await approveQuality('cad','ANALOG'));ok(await api('/api/orders/ANALOG/cad-review','a',{action:'approve'},'POST'));
assert.equal((await get()).orderOverrides.ANALOG.stage,'Изготовление');
all=await get();ok(await api('/api/portal/employees','chief',all.employees.map(e=>e.id==='preprod'?{...e,status:'fired'}:e)));all=await get();assert.equal(all.orderOverrides.ANALOG.preprodTechnician,'');assert.equal(all.orderOverrides.ANALOG.cadOperator,names.cad);assert.equal(all.orderOverrides.ANALOG.stage,'Изготовление');
assert.equal((await api('/api/portal','preprod')).status,401);
if(process.env.FLOW_TEST_DATABASE_URL){const prior=await get();const broken=prior.orders.map((o,i)=>i===0?{...o,createdAt:'2026-99-99T00:00:00Z'}:o);assert.equal((await api('/api/portal/orders','chief',broken)).status,500);const restored=await get();assert.deepEqual(restored.orders,prior.orders);assert.deepEqual(restored.collectionVersions,prior.collectionVersions);}
const aOwn=ok(await api('/api/portal','a')),bOwn=ok(await api('/api/portal','b'));assert.equal(aOwn.orders.some(o=>o.clinicId!=='a'),false);assert.equal(bOwn.orders.length,0);
});
