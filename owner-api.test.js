import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomBytes,scryptSync} from 'node:crypto';
const sessionKey=t=>'sha256:'+createHash('sha256').update(t).digest('hex');
export async function ownerFixture(){
 const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'create-dental-owner-')),data=path.join(temporary,'.data'),root=process.cwd();await fs.mkdir(data);
 const today=new Date().toISOString().slice(0,10),created=today+'T10:00:00Z';
 const portal={orders:[{id:'CD-OWNER-A',clinicId:'clinic-1',clinic:'Клиника Альфа',patient:'PRIVATE_PATIENT',sum:'15 000 ₽',date:today,createdAt:created,variants:[{work:'Реставрации',workOption:'Керамическая коронка'}]},{id:'CD-OWNER-B',clinicId:'clinic-1',clinic:'Клиника Альфа',patient:'PRIVATE_PATIENT_B',sum:'8 000 ₽',date:today,createdAt:created}],orderOverrides:{'CD-OWNER-A':{stage:'Моделирование',cadOperator:'Техник'},'CD-OWNER-B':{stage:'В доставке',paidAmount:2000,paymentDueDate:today}},clients:[{id:'clinic-1',name:'Клиника Альфа',originalName:'Клиника Альфа',approved:true}],employees:[{id:'worker-1',name:'Техник',originalName:'Техник',specialty:'CAD',status:'active',wipLimit:1}],orderHistory:[],tasks:[]};
 await fs.writeFile(path.join(data,'portal.json'),JSON.stringify(portal));
 const password='Fixture-'+randomBytes(15).toString('hex'),salt=randomBytes(16).toString('hex');await fs.writeFile(path.join(data,'accounts.json'),JSON.stringify([{id:'owner-1',email:'owner@example.test',role:'owner',subjectId:'owner-1',passwordHash:salt+':'+scryptSync(password,salt,64).toString('hex')}]),{mode:0o600});
 await fs.writeFile(path.join(data,'sessions.json'),JSON.stringify(['owner','chief','clinic','worker'].map(role=>[sessionKey(role+'-token'),{role:role==='chief'?'technician':role,subjectId:role==='chief'?'chief':role==='clinic'?'clinic-1':role==='worker'?'worker-1':'owner-1',expires:Date.now()+3600000}])));
 for(const name of await fs.readdir(root)){if(/\.(js|html|css)$/.test(name))await fs.symlink(path.join(root,name),path.join(temporary,name));}await fs.symlink(path.join(root,'public'),path.join(temporary,'public'));
 const port=45000+Math.floor(Math.random()*1000),child=spawn(process.execPath,[path.join(root,'server.js')],{cwd:temporary,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PORTAL_DATABASE_URL:'',DATABASE_URL:'',HTTPS_REDIRECT:'0'},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let errors='';const timer=setTimeout(()=>reject(new Error('Owner test startup timeout: '+errors)),10000);child.stderr.on('data',c=>errors+=c);child.once('exit',code=>{clearTimeout(timer);reject(new Error('Owner test server exited '+code+': '+errors));});child.stdout.on('data',chunk=>{if(String(chunk).includes('Create Dental:')){clearTimeout(timer);resolve();}});});
 return {base:`http://127.0.0.1:${port}`,password,today,temporary,async close(){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));await fs.rm(temporary,{recursive:true,force:true});}};
}
test('owner financial access is isolated; writes conflict safely; password change revokes sessions',async()=>{
 const fixture=await ownerFixture();
 try{
 const request=async(route,token,body)=>{const response=await fetch(fixture.base+route,{method:body?'POST':'GET',headers:{'X-Portal-Token':token||'','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
 for(const [token,status] of [['',401],['chief-token',403],['clinic-token',403],['worker-token',403]])assert.equal((await request('/api/owner/report',token)).status,status);
 assert.equal((await request('/api/portal','owner-token')).status,403);
 const first=await request('/api/owner/report','owner-token');assert.equal(first.status,200);assert.equal(first.data.summary.orders,2);assert.equal(first.data.summary.knownOutstanding,6000);assert.equal(JSON.stringify(first.data).includes('PRIVATE_PATIENT'),false);
 const change={type:'cost',version:0,orderId:'CD-OWNER-A',values:{materials:1000,labor:2000,outsourcing:0,delivery:0,rework:0}};
 assert.equal((await request('/api/owner/finance','chief-token',change)).status,403);
 assert.equal((await request('/api/owner/finance','owner-token',change)).status,200);
 assert.equal((await request('/api/owner/finance','owner-token',change)).status,409);
 const current=await request('/api/owner/report','owner-token');assert.equal(current.data.summary.contribution,12000);
 assert.equal((await request('/api/owner/login','',{email:'owner@example.test',password:'wrong'})).status,401);
 const login=await request('/api/owner/login','',{email:'owner@example.test',password:fixture.password});assert.equal(login.status,200);
 assert.equal((await request('/api/auth/login','',{email:'owner@example.test',password:fixture.password})).status,403);
 const updated=await request('/api/owner/password',login.data.token,{currentPassword:fixture.password,password:fixture.password+'new'});assert.equal(updated.status,200);
 assert.equal((await request('/api/owner/report','owner-token')).status,401);assert.equal((await request('/api/owner/report',updated.data.token)).status,200);
 const page=await fetch(fixture.base+'/owner/economics');assert.equal(page.status,200);assert.match(await page.text(),/owner.js/);
 assert.equal((await fetch(fixture.base+'/owner-api.js')).status,404);
 }finally{await fixture.close();}
});
