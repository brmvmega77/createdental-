import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {workCatalog} from './work-catalog.js';

test('new clinic orders reject partial-jaw silicone keys and duplicate keys across types',async t=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'cd-jaw-keys-')),data=path.join(temporary,'.data');fs.mkdirSync(data);
 const catalog=structuredClone(workCatalog),extra=catalog.find(item=>item.name==='Дополнительные работы');
 extra.options.push({id:'test-key',name:'Силиконовый ключ',price:1500,productionDays:1},{id:'test-clear-key',name:'Прозрачный силиконовый ключ',price:2700,productionDays:1});
 fs.writeFileSync(path.join(data,'portal.json'),JSON.stringify({orders:[],clients:[{id:'clinic',name:'Клиника'}],employees:[],workCatalog:catalog,orderOverrides:{}}));
 fs.writeFileSync(path.join(data,'accounts.json'),'[]');
 fs.writeFileSync(path.join(data,'sessions.json'),JSON.stringify([['sha256:'+createHash('sha256').update('clinic').digest('hex'),{role:'clinic',subjectId:'clinic',expires:Date.now()+3600000}]]));
 const port=45500+Math.floor(Math.random()*500);let child,errors='';
 child=spawn(process.execPath,[path.resolve('server.js')],{cwd:temporary,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PORTAL_DATABASE_URL:'',DATABASE_URL:'',TELEGRAM_BOT_TOKEN:'',EMPLOYEE_TELEGRAM_BOT_TOKEN:''},stdio:['ignore','pipe','pipe']});
 child.stderr.on('data',chunk=>errors+=chunk);
 t.after(async()=>{if(child?.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done}fs.rmSync(temporary,{recursive:true,force:true})});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(errors)),7000);child.once('exit',()=>{clearTimeout(timer);reject(Error(errors))});child.stdout.on('data',chunk=>{if(String(chunk).includes('Create Dental:')){clearTimeout(timer);resolve()}})});
 const key=(name,selectedTeeth)=>({work:extra.name,workOption:name,selectedTeeth,units:99});
 const upper=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],lower=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
 const cases=[
  {variants:[key('Силиконовый ключ',[21,22,23,24])],error:/челюсть целиком/},
  {variants:[key('Прозрачный силиконовый ключ',[])],error:/челюсть целиком/},
  {variants:[key('Силиконовый ключ',upper),key('Прозрачный силиконовый ключ',upper)],error:/верхнюю челюсть уже/},
  {variants:[key('Прозрачный силиконовый ключ',lower),key('Силиконовый ключ',lower)],error:/нижнюю челюсть уже/},
 ];
 for(const entry of cases){
  const order={id:'CD-INVALID-KEY',clinicId:'clinic',clinic:'Клиника',patient:'Пациент',createdAt:new Date().toISOString(),date:'30.12.2026',productionType:'digital',work:extra.name,material:entry.variants[0].workOption,teeth:entry.variants.flatMap(v=>v.selectedTeeth),variants:entry.variants};
  const response=await fetch(`http://127.0.0.1:${port}/api/portal/orders`,{method:'PUT',headers:{'X-Portal-Token':'clinic','Content-Type':'application/json'},body:JSON.stringify([order])});
  assert.equal(response.status,400);assert.match((await response.json()).error,entry.error);
 }
 const response=await fetch(`http://127.0.0.1:${port}/api/portal`,{headers:{'X-Portal-Token':'clinic'}});
 assert.deepEqual((await response.json()).orders,[]);
});

test('editing a child key cannot overlap its sibling while unchanged legacy keys stay editable',async t=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'cd-key-siblings-')),data=path.join(temporary,'.data');fs.mkdirSync(data);
 const catalog=structuredClone(workCatalog),extra=catalog.find(item=>item.name==='Дополнительные работы');
 extra.options.push({id:'test-key',name:'Силиконовый ключ',price:1500,productionDays:1},{id:'test-clear-key',name:'Прозрачный силиконовый ключ',price:2700,productionDays:1});
 const upper=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],lower=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
 const key=(name,selectedTeeth,unitPrice)=>({work:extra.name,workOption:name,selectedTeeth,unitPrice,amount:unitPrice,units:1,toothMode:'Челюсть',bridgeRanges:[]});
 const due=new Date(Date.now()+60*86400000);while([0,6].includes(due.getUTCDay()))due.setUTCDate(due.getUTCDate()+1);
 const base={clinicId:'clinic',clinic:'Клиника',patient:'Пациент',status:'Новый',createdAt:new Date().toISOString(),date:due.toISOString().slice(0,10).split('-').reverse().join('.'),productionType:'digital',deliveryFee:0};
 const group={...base,id:'GROUP',work:'Несколько услуг (2)',sum:'4 200 ₽',servicesTotal:4200,quantity:2,variants:[key('Силиконовый ключ',upper,1500),key('Прозрачный силиконовый ключ',lower,2700)]};
 const legacy={...base,id:'LEGACY',work:extra.name,material:'Силиконовый ключ',sum:'1 500 ₽',servicesTotal:1500,quantity:1,variants:[key('Силиконовый ключ',[21,22],1500)]};
 fs.writeFileSync(path.join(data,'portal.json'),JSON.stringify({orders:[group,legacy],clients:[{id:'clinic',name:'Клиника'}],employees:[],workCatalog:catalog,orderOverrides:{}}));
 fs.writeFileSync(path.join(data,'accounts.json'),'[]');
 fs.writeFileSync(path.join(data,'sessions.json'),JSON.stringify([['sha256:'+createHash('sha256').update('chief').digest('hex'),{role:'technician',subjectId:'chief',expires:Date.now()+3600000}]]));
 const port=46000+Math.floor(Math.random()*500);let errors='';
 const child=spawn(process.execPath,[path.resolve('server.js')],{cwd:temporary,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PORTAL_DATABASE_URL:'',DATABASE_URL:'',TELEGRAM_BOT_TOKEN:'',EMPLOYEE_TELEGRAM_BOT_TOKEN:''},stdio:['ignore','pipe','pipe']});
 child.stderr.on('data',chunk=>errors+=chunk);
 t.after(async()=>{if(child.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done}fs.rmSync(temporary,{recursive:true,force:true})});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(errors)),7000);child.once('exit',()=>{clearTimeout(timer);reject(Error(errors))});child.stdout.on('data',chunk=>{if(String(chunk).includes('Create Dental:')){clearTimeout(timer);resolve()}})});
 const api=async(body)=>{const response=await fetch(`http://127.0.0.1:${port}/api/portal${body?'/orders':''}`,{method:body?'PUT':'GET',headers:{'X-Portal-Token':'chief','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()}};
 const before=(await api()).data.orders,changes=structuredClone(before),childKey=changes.find(order=>order.parentOrderId==='GROUP'&&order.material==='Прозрачный силиконовый ключ');
 assert.ok(childKey);childKey.variants[0].selectedTeeth=upper;
 const rejected=await api(changes);assert.equal(rejected.status,400);assert.match(rejected.data.error,/верхнюю челюсть уже/);
 assert.deepEqual((await api()).data.orders,before);
 const metadata=structuredClone(before);metadata.find(order=>order.id==='LEGACY').patient='Новое имя';
 const updated=await api(metadata);assert.equal(updated.status,200,JSON.stringify(updated.data));
 const saved=(await api()).data.orders.find(order=>order.id==='LEGACY');assert.deepEqual(saved.variants,before.find(order=>order.id==='LEGACY').variants);assert.equal(saved.sum,'1 500 ₽');
});
