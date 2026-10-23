import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

test('Clinic doctor changes are versioned; orders bind only their clinic doctor and retain printed names',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cd-doctors-')),data=path.join(dir,'.data');fs.mkdirSync(data);
 fs.writeFileSync(path.join(data,'portal.json'),JSON.stringify({orders:[],clients:[{id:'a',name:'Клиника А',approved:true},{id:'b',name:'Клиника Б',approved:true}],employees:[],orderOverrides:{},orderHistory:[]}));
 const source=`
 import assert from 'node:assert/strict';
 const {portalSnapshot:snapshot,replacePortalCollection:save,removePortalOrder:remove}=await import(${JSON.stringify(pathToFileURL(path.resolve('portal-data.js')).href)});
 const actor={role:'clinic',name:'Администратор'};
 let clients=snapshot().clients;
 clients=clients.map(item=>({...item,doctors:[{id:'doctor-'+item.id,name:'Врач '+item.id,specialty:'Ортопед',active:true}],doctorsRevision:0}));
 await save('clients',clients,actor);
 assert.equal(snapshot().clients[0].doctorsRevision,1);
 assert.equal(snapshot().clients[0].doctors[0].specialty,'Ортопед');
 const order={id:'DOC-ORDER',clinicId:'a',clinic:'Клиника А',patient:'Пациент',work:'Каппы',sum:'5000 ₽',status:'Новый',doctorId:'doctor-b',doctor:'Подмена имени',variants:[{selectedTeeth:[11],work:'Каппы',workOption:'Каппа'}, {selectedTeeth:[21],work:'Каппы',workOption:'Каппа'}, {selectedTeeth:[31],work:'Каппы',workOption:'Каппа'}]};
 await assert.rejects(save('orders',[order],actor),/invalid_doctor/);
 await assert.rejects(save('orders',[{...order,doctorId:''}],actor),/invalid_doctor/);
 await save('orders',[{...order,doctorId:'doctor-a'}],actor);
 assert.equal(snapshot().orders[0].doctor,'Врач a');
 const stale=snapshot().clients;
 await save('clients',stale.map(item=>item.id==='a'?{...item,doctors:[{id:'doctor-a',name:'Новое имя',active:false}]}:item),actor);
 assert.equal(snapshot().orders[0].doctor,'Врач a');
 assert.equal(snapshot().clients[0].doctorsRevision,2);
 await assert.rejects(save('orders',[{...order,id:'DOC-NEW',doctorId:'doctor-a'},...snapshot().orders],actor),/invalid_doctor/);
 await assert.rejects(save('clients',stale,actor),/doctors_conflict/);
 const before=snapshot().clients;
 const results=await Promise.allSettled(['Имя 1','Имя 2'].map(name=>save('clients',before.map(item=>item.id==='a'?{...item,doctors:[{id:'doctor-a',name,active:true}]}:item),actor)));
 assert.equal(results.filter(item=>item.status==='fulfilled').length,1);
 assert.equal(results.filter(item=>item.status==='rejected'&&item.reason.message==='doctors_conflict').length,1);
 const latest=snapshot().clients;
 await assert.rejects(save('clients',latest.map(item=>item.id==='a'?{...item,doctors:item.doctors.map(doctor=>({...doctor,specialty:'<script>'}))}:item),actor),/invalid_collection/);
 await assert.rejects(save('clients',latest.map(item=>item.id==='a'?{...item,doctors:item.doctors.map(doctor=>({...doctor,specialty:123}))}:item),actor),/invalid_collection/);
 await assert.rejects(save('clients',latest.map(item=>item.id==='a'?{...item,doctors:[{id:'one',name:'Дубликат',active:true},{id:'two',name:'Дубликат',active:true}]}:item),actor),/invalid_collection/);
 await assert.rejects(save('clients',latest.map(item=>item.id==='a'?{...item,doctors:[{id:'one',name:'<script>',active:true}]}:item),actor),/invalid_collection/);
 // Old clinic edits which omit the new field preserve the doctor list.
 await save('clients',latest.map(({doctors,doctorsRevision,...item})=>item),actor);
 assert.equal(snapshot().clients[0].doctors.length,1);
 let hidden=snapshot().clients.map(item=>item.id==='a'?{...item,doctors:item.doctors.map(d=>({...d,active:true})),clinicHiddenDoctorIds:['doctor-a']}:item);
 await save('clients',hidden,actor);
 await save('orders',[...snapshot().orders,{...order,id:'NO-DOCTOR',doctorId:''}],actor);
 assert.equal(snapshot().orders.find(item=>item.id==='NO-DOCTOR').doctor,'');
 await save('clients',snapshot().clients.map(item=>item.id==='a'?{...item,doctors:[...item.doctors,{id:'replacement',name:item.doctors[0].name,active:true}]}:item),actor);
 assert.equal(snapshot().clients[0].doctors.length,2);
 let printed='';
 globalThis.document={querySelector:()=>({remove(){},querySelectorAll:()=>[]}),body:{insertAdjacentHTML:(_position,html)=>{printed=html}}};
 globalThis.window={addEventListener(){},print(){throw Error('No physical printing in tests')}};
 globalThis.requestAnimationFrame=()=>{};
 const {openOrderPrint}=await import(${JSON.stringify(pathToFileURL(path.resolve('order-print.js')).href)});
 openOrderPrint({order:snapshot().orders[0],toothChart:()=>'<svg></svg>'});
 assert.equal((printed.match(/Врач a/g)||[]).length,3);
 await remove('NO-DOCTOR',actor);assert.equal(snapshot().orders.length,1);assert.equal(snapshot().orders[0].doctor,'Врач a');
 console.log('doctor checks passed');
 `;
 try{
  const env={...process.env,PORTAL_DATA_FILE:path.join(data,'portal.json'),PORTAL_DATABASE_URL:'',DATABASE_URL:''};
  const result=execFileSync(process.execPath,['--input-type=module','-e',source],{cwd:dir,env,encoding:'utf8',timeout:10000});assert.match(result,/doctor checks passed/);
  const reread=`const {portalSnapshot}=await import(${JSON.stringify(pathToFileURL(path.resolve('portal-data.js')).href)});console.log(JSON.stringify({doctor:portalSnapshot().orders[0].doctor,count:portalSnapshot().clients[0].doctors.length}));`;
  const restored=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',reread],{cwd:dir,env,encoding:'utf8',timeout:10000}).trim());assert.deepEqual(restored,{doctor:'Врач a',count:2});
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Doctor editing API keeps clinic lists private and rejects stale simultaneous edits',async t=>{
 const {spawn}=await import('node:child_process'),{createHash}=await import('node:crypto');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cd-doctor-api-')),data=path.join(dir,'.data');fs.mkdirSync(data);
 fs.writeFileSync(path.join(data,'portal.json'),JSON.stringify({orders:[],clients:[{id:'a',name:'Клиника А',approved:true},{id:'b',name:'Клиника Б',approved:true}],employees:[{id:'w',name:'Сотрудник',originalName:'Сотрудник',status:'active'}],orderOverrides:{},orderHistory:[]}));
 fs.writeFileSync(path.join(data,'accounts.json'),'[]');
 fs.writeFileSync(path.join(data,'sessions.json'),JSON.stringify(['a','b','w'].map(id=>['sha256:'+createHash('sha256').update('doctor-'+id).digest('hex'),{role:id==='w'?'worker':'clinic',subjectId:id,expires:Date.now()+60000}])));
 const port=49000+Math.floor(Math.random()*1000),child=spawn(process.execPath,[path.resolve('server.js')],{cwd:dir,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PORTAL_DATABASE_URL:'',DATABASE_URL:'',TELEGRAM_BOT_TOKEN:'',EMPLOYEE_TELEGRAM_BOT_TOKEN:''},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited}fs.rmSync(dir,{recursive:true,force:true})});
 await new Promise((resolve,reject)=>{let err='';const timer=setTimeout(()=>reject(new Error('Startup timeout '+err)),5000);child.stderr.on('data',v=>err+=v);child.once('exit',code=>{clearTimeout(timer);reject(new Error('Exit '+code+': '+err))});child.stdout.on('data',v=>{if(String(v).includes('Create Dental:')){clearTimeout(timer);resolve()}})});
 const request=async(id,body)=>{const response=await fetch('http://127.0.0.1:'+port+'/api/portal/clients',{method:body?'PUT':'GET',headers:{'X-Portal-Token':id?'doctor-'+id:'','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()}};
 assert.equal((await request('')).status,401);
 const a=(await request('a')).data.clients,b=(await request('b')).data.clients;
 assert.equal(a.length,1);assert.equal(a[0].id,'a');assert.equal(b[0].id,'b');
 assert.equal((await request('a',b)).status,403);
 const edit=a.map(item=>({...item,doctorsRevision:0,doctors:[{id:'doc-a',name:'Иванов Иван Иванович',active:true}]}));
 assert.equal((await request('w',edit)).status,403);
 const results=await Promise.all([request('a',edit),request('a',edit.map(item=>({...item,doctors:[{id:'doc-a',name:'Петров Пётр Петрович',active:true}]})))]);
 assert.deepEqual(results.map(item=>item.status).sort(),[200,409]);
 assert.equal((await request('a')).data.clients[0].doctors.length,1);
 assert.equal((await request('b')).data.clients[0].doctors,undefined);
});
