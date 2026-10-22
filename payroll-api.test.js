import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {payrollServiceKey} from './payroll.js';

test('payroll API isolates staff, validates ranks, locks rates, and keeps accrued money across edits and restart',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cd-payroll-api-')),root=process.cwd(),data=path.join(directory,'.data');await fs.mkdir(data);
 const at='2026-10-22T10:00:00Z',employees=[{id:'pay-cam',name:'CAM сотрудник',originalName:'CAM сотрудник',specialty:'Каркасист',rank:3,status:'active'},{id:'pay-cad',name:'CAD сотрудник',originalName:'CAD сотрудник',specialty:'CAD оператор',rank:2,status:'active'}];
 const order={id:'CD-SALARY',patient:'Тест',work:'Реставрации',material:'Тестовая коронка',sum:'10000 ₽',status:'В работе',clinicId:'pay-clinic',clinic:'Тестовая клиника',quantity:2,createdAt:at,variants:[{work:'Реставрации',workOption:'Тестовая коронка',selectedTeeth:[16,17]}]};
 const detail={stage:'Контроль качества',frameTechnician:'CAM сотрудник',frameTechnicianStatus:'ОТК',manufacturingStatus:'В работе у Каркасиста',qualityRequest:{kind:'cam',employeeId:'pay-cam'},cadOperator:'CAD сотрудник',cadReview:{status:'approved',fileId:'file-1',fileName:'test.stl',revision:1,sentAt:at,reviewedAt:at}};
 await fs.writeFile(path.join(data,'portal.json'),JSON.stringify({orders:[order],orderOverrides:{[order.id]:detail},employees,clients:[{id:'pay-clinic',name:'Тестовая клиника',originalName:'Тестовая клиника',approved:true}],tasks:[],orderHistory:[]}));
 await fs.writeFile(path.join(data,'sessions.json'),JSON.stringify(['chief','cam','cad','clinic'].map(role=>['sha256:'+createHash('sha256').update(role+'-pay-token').digest('hex'),{role:role==='chief'?'technician':role==='clinic'?'clinic':'worker',subjectId:role==='chief'?'chief':role==='clinic'?'pay-clinic':'pay-'+role,expires:Date.now()+3600000}])));
 for(const name of await fs.readdir(root))if(/\.(js|html|css)$/.test(name))await fs.symlink(path.join(root,name),path.join(directory,name));
 await fs.symlink(path.join(root,'public'),path.join(directory,'public'));
 const port=48000+Math.floor(Math.random()*1000);let child;
 async function start(){child=spawn(process.execPath,[path.join(root,'server.js')],{cwd:directory,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PORTAL_DATABASE_URL:'',DATABASE_URL:'',HTTPS_REDIRECT:'0'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{let errors='';const timer=setTimeout(()=>reject(new Error(errors||'startup timeout')),10000);child.stderr.on('data',c=>errors+=c);child.on('exit',code=>{clearTimeout(timer);reject(new Error('Exit '+code+': '+errors))});child.stdout.on('data',c=>{if(String(c).includes('Create Dental:')){clearTimeout(timer);resolve()}})})}
 async function stop(){if(child?.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve))}}
 async function request(route,role='chief',body,method){const response=await fetch('http://127.0.0.1:'+port+route,{method:method||(body?'PUT':'GET'),headers:{'X-Portal-Token':role?role+'-pay-token':'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()}}
 try{
  await start();
  assert.equal((await request('/api/payroll','')).status,401);assert.equal((await request('/api/payroll','clinic')).status,403);
  const first=await request('/api/payroll');assert.equal(first.status,200);assert.equal(first.data.accruals.length,1);assert.equal(first.data.accruals[0].amount,1800);
  assert.equal((await request('/api/payroll','cam')).data.accruals.length,0);
  assert.equal((await request('/api/portal/employees','cam',employees)).status,403);
  const invalid=structuredClone(employees);invalid[0].rank=6;assert.equal((await request('/api/portal/employees','chief',invalid)).status,400);
  const settings={revision:0,rates:{cam:{[payrollServiceKey('Реставрации','Тестовая коронка')]:[100,200,300,400,500]}}};
  assert.equal((await request('/api/payroll/settings','cam',settings)).status,403);
  const results=await Promise.all([request('/api/payroll/settings','chief',settings),request('/api/payroll/settings','chief',settings)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const next={...detail,stage:'Изготовление',frameTechnicianStatus:'Работа сдана',qualityApprovedAt:at,qualityRequest:null,manufacturingStatus:'В работе у Красильщика'};
  assert.equal((await request('/api/portal/orderOverrides','chief',{[order.id]:next})).status,200);
  let view=(await request('/api/payroll','cam')).data;assert.equal(view.accruals.length,1);assert.equal(view.accruals[0].amount,600);assert.equal(view.accruals[0].rank,3);assert.equal('settings' in view,false);assert.equal('employees' in view,false);
  const changed=structuredClone(employees);changed[0].rank=5;assert.equal((await request('/api/portal/employees','chief',changed)).status,200);
  assert.equal((await request('/api/portal/orderOverrides','chief',{[order.id]:next})).status,200);
  view=(await request('/api/payroll','cam')).data;assert.equal(view.employee.rank,5);assert.equal(view.accruals[0].rank,3);assert.equal(view.accruals[0].amount,600);assert.equal(view.accruals.length,1);
  const workerSnapshot=(await request('/api/portal','cam')).data;assert.equal('salaryAccruals' in workerSnapshot,false);assert.equal('payrollSettings' in workerSnapshot,false);
  await stop();await start();view=(await request('/api/payroll','cam')).data;assert.equal(view.accruals[0].amount,600);assert.equal(view.accruals.length,1);
  assert.equal((await fetch('http://127.0.0.1:'+port+'/payroll-api.js')).status,404);
 }finally{await stop();await fs.rm(directory,{recursive:true,force:true})}
});
