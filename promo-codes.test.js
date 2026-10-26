import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {applyPromoAssignments,promoRulesWithClients,promoRegistrationLink,priceNewClinicOrder} from './promo-codes.js';
import {workCatalog} from './work-catalog.js';

const clinics=[{id:'clinic-a',name:'Клиника А',email:'a@example.test',approved:true},{id:'clinic-b',name:'Клиника Б',email:'b@example.test',approved:true},{id:'deleted',name:'Удалена',deleted:true}];
const rule=(code,clinicIds=[])=>({code,name:code,active:true,prices:{'Реставрации|||PMMA коронка CAD/CAM':900},clinicIds});

test('promo assignment moves selected clinics, supports renaming and removes deleted codes',()=>{
 let selected=applyPromoAssignments(clinics,[],[rule('WELCOME',['clinic-a'])]);
 assert.equal(selected[0].promoCode,'WELCOME');assert.equal(selected[1].promoCode,undefined);
 assert.deepEqual(promoRulesWithClients([rule('WELCOME')],selected)[0].clinicIds,['clinic-a']);
 selected=applyPromoAssignments(selected,[rule('WELCOME')],[rule('RENAMED',['clinic-a','clinic-b'])]);
 assert.deepEqual(selected.slice(0,2).map(c=>c.promoCode),['RENAMED','RENAMED']);
 selected=applyPromoAssignments(selected,[rule('RENAMED')],[rule('RENAMED',['clinic-b'])]);
 assert.equal(selected[0].promoCode,'');assert.equal(selected[1].promoCode,'RENAMED');
 const legacy={...rule('RENAMED')};delete legacy.clinicIds;
 assert.equal(applyPromoAssignments(selected,[legacy],[legacy]),selected);
 assert.equal(applyPromoAssignments(selected,[legacy],[])[1].promoCode,'');
 for(const ids of [['missing'],['deleted'],['clinic-a','clinic-a'],'clinic-a'])assert.throws(()=>applyPromoAssignments(clinics,[],[rule('BAD',ids)]),/invalid_promo_clinics/);
 assert.throws(()=>applyPromoAssignments(clinics,[],[rule('ONE',['clinic-a']),rule('TWO',['clinic-a'])]),/duplicate_promo_clinic/);
});

test('new order prices follow the saved clinic promo and canonical line prices',()=>{
 const order={promoCode:'FORGED',sum:'1 ₽',variants:[{work:'Реставрации',workOption:'PMMA коронка CAD/CAM',selectedTeeth:[11,12],unitPrice:1,amount:1}]};
 const discounted=priceNewClinicOrder(order,{promoCode:'WELCOME'},[rule('WELCOME')]);
 assert.equal(discounted.servicesTotal,1800);assert.equal(discounted.deliveryFee,500);assert.equal(discounted.variants[0].unitPrice,900);assert.equal(discounted.variants[0].amount,1800);assert.equal(discounted.promoCode,'WELCOME');
 const regular=priceNewClinicOrder(order,{},[rule('FORGED')]);assert.equal(regular.promoCode,'');assert.ok(regular.servicesTotal>1800);
 const inactive=priceNewClinicOrder(order,{promoCode:'WELCOME'},[{...rule('WELCOME'),active:false}]);assert.equal(inactive.servicesTotal,regular.servicesTotal);
 const zero=priceNewClinicOrder(order,{promoCode:'WELCOME'},[{...rule('WELCOME'),prices:{'Реставрации|||PMMA коронка CAD/CAM':0}}],{freeThreshold:0,fee:500});assert.equal(zero.servicesTotal,0);assert.equal(zero.deliveryFee,0);
});

test('registration links open the registration form with a canonical promo query',()=>{
 const url=new URL(promoRegistrationLink(' welcome-25 ','https://createdental.io/technician/pricing'));
 assert.equal(url.pathname,'/register');assert.equal(url.searchParams.get('promo'),'WELCOME-25');
 for(const code of ['', 'a', 'INVALID?x=1', '<script>'])assert.equal(promoRegistrationLink(code,'https://createdental.io'),'');
});

test('HTTP promo saves assign prices atomically, preserve agreed orders, enforce access and persist registration',async t=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'cd-promo-')),data=path.join(temporary,'.data');fs.mkdirSync(data);
 const oldOrder={id:'EXISTING',work:'Реставрации',material:'PMMA коронка CAD/CAM',patient:'Пациент Тестовый',clinic:'Клиника А',clinicId:'clinic-a',teeth:[11],status:'Новый',productionType:'digital',sum:'2 000 ₽',servicesTotal:2000,deliveryFee:0,createdAt:'2026-10-26T10:00:00Z',date:'30.11.2026',variants:[{work:'Реставрации',workOption:'PMMA коронка CAD/CAM',selectedTeeth:[11],unitPrice:2000}]};
 fs.writeFileSync(path.join(data,'portal.json'),JSON.stringify({orders:[oldOrder],clients:clinics,employees:[{id:'worker',name:'Техник',status:'active',specialty:'CAD оператор'}],orderOverrides:{},workCatalog,collectionVersions:{}}));
 fs.writeFileSync(path.join(data,'accounts.json'),'[]');
 fs.writeFileSync(path.join(data,'sessions.json'),JSON.stringify(['chief','clinic-a','clinic-b','worker'].map(id=>['sha256:'+createHash('sha256').update(id).digest('hex'),{role:id==='chief'?'technician':id==='worker'?'worker':'clinic',subjectId:id,displayName:id,expires:Date.now()+3600000}])));
 const port=48000+Math.floor(Math.random()*1000);let child,errors='';
 const start=async()=>{child=spawn(process.execPath,[path.resolve('server.js')],{cwd:temporary,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PORTAL_DATABASE_URL:process.env.PROMO_TEST_DATABASE_URL||'',DATABASE_URL:'',TELEGRAM_BOT_TOKEN:'',EMPLOYEE_TELEGRAM_BOT_TOKEN:''},stdio:['ignore','pipe','pipe']});child.stderr.on('data',c=>errors+=c);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(errors)),7000);child.once('exit',()=>{clearTimeout(timer);reject(Error(errors))});child.stdout.on('data',c=>{if(String(c).includes('Create Dental:')){clearTimeout(timer);resolve();}});});};
 const stop=async()=>{if(child?.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done;}};
 t.after(async()=>{await stop();fs.rmSync(temporary,{recursive:true,force:true});});await start();
 const api=async(url,user='chief',body,headers={},method=body===undefined?'GET':'PUT')=>{const response=await fetch(`http://127.0.0.1:${port}${url}`,{method,headers:{'X-Portal-Token':user,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json()};};
 const ok=result=>{assert.ok(result.status>=200&&result.status<300,JSON.stringify(result));return result.body;},get=async user=>ok(await api('/api/portal',user));
 let chief=await get('chief'),original=(await get('clinic-a')).orders;
 const save=async rules=>{chief=await get('chief');return api('/api/portal/promoCodes','chief',rules,{'X-Portal-Version':String(chief.collectionVersions.promoCodes||0),'X-Portal-Clients-Version':String(chief.collectionVersions.clients||0)});};
 assert.equal((await api('/api/portal/promoCodes','clinic-a',[rule('NO')])).status,403);
 assert.equal((await api('/api/portal/promoCodes','worker',[rule('NO')])).status,403);
 let result=ok(await save([rule('WELCOME',['clinic-a'])]));
 assert.equal(result.clients.find(c=>c.id==='clinic-a').promoCode,'WELCOME');assert.deepEqual(result.saved[0].clinicIds,['clinic-a']);
 let clinic=await get('clinic-a');assert.equal(clinic.promoCode,'WELCOME');assert.equal(clinic.promoPrices['Реставрации|||PMMA коронка CAD/CAM'],900);assert.deepEqual(clinic.orders,original);
 assert.deepEqual((await get('clinic-b')).promoPrices,{});
 chief=await get('chief');assert.equal((await save([{...chief.promoCodes[0],clinicIds:['missing']}])).status,400);
 assert.equal((await save([{...chief.promoCodes[0],clinicIds:['clinic-a']},rule('OTHER',['clinic-a'])])).status,400);
 assert.equal((await get('clinic-a')).promoCode,'WELCOME');
 // A concurrent clinic change rejects the whole operation, including the price change.
 chief=await get('chief');const stale=structuredClone(chief);chief.clients.find(c=>c.id==='clinic-b').city='Ереван';ok(await api('/api/portal/clients','chief',chief.clients));
 assert.equal((await api('/api/portal/promoCodes','chief',[{...stale.promoCodes[0],prices:{},clinicIds:['clinic-b']}],{'X-Portal-Clients-Version':String(stale.collectionVersions.clients||0)})).status,409);
 assert.equal((await get('clinic-a')).promoPrices['Реставрации|||PMMA коронка CAD/CAM'],900);
 chief=await get('chief');result=ok(await save([{...chief.promoCodes[0],code:'RENAMED',clinicIds:['clinic-b']}]));
 assert.equal((await get('clinic-a')).promoCode,'');assert.equal((await get('clinic-b')).promoCode,'RENAMED');assert.deepEqual((await get('clinic-a')).orders,original);
 // Registration receives the same saved promo and keeps preassigned clinics' promo when omitted.
 const registration={name:'Новая клиника',email:'new@example.test',password:'FixturePass987!',country:'AM',phone:'',city:'Ереван',address:'',personalDataConsentVersion:'1.0',promoCode:'renamed'};
 assert.equal((await api('/api/auth/register','',registration,{},'POST')).status,201);
 chief=await get('chief');assert.equal(chief.clients.find(c=>c.email==='new@example.test').promoCode,'RENAMED');assert.ok(chief.promoCodes[0].clinicIds.includes(chief.clients.find(c=>c.email==='new@example.test').id));
 assert.equal((await api('/api/auth/register','',{...registration,email:'b@example.test',promoCode:''},{},'POST')).status,201);
 assert.equal((await get('clinic-b')).promoCode,'RENAMED');
 chief=await get('chief');ok(await save(chief.promoCodes.map(p=>({...p,active:false}))));assert.equal((await api('/api/auth/register','',{...registration,email:'inactive@example.test'},{},'POST')).status,400);assert.deepEqual((await get('clinic-b')).promoPrices,{});
 await stop();await start();chief=await get('chief');assert.equal(chief.promoCodes[0].active,false);assert.equal(chief.clients.find(c=>c.id==='clinic-b').promoCode,'RENAMED');assert.deepEqual((await get('clinic-a')).orders,original);
 ok(await save([]));assert.equal((await get('clinic-b')).promoCode,'');
});
