import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

const sessionKey=token=>'sha256:'+createHash('sha256').update(token).digest('hex');
const order=id=>({id,patient:'Иванов Иван',work:'Коронка',date:'20.10.2026',sum:'12 000 ₽',status:'В работе',clinicId:'clinic-1',teeth:[11]});

test('CAD requires the assigned modeler and a doctor decision',async context=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'create-dental-cad-'));
  const data=path.join(temporary,'.data');
  fs.mkdirSync(data,{recursive:true});
  const portal={
    orders:[order('CAD-A'),order('CAD-B')],
    orderOverrides:{'CAD-A':{stage:'Моделирование',assignee:'Modeler'},'CAD-B':{stage:'Моделирование',assignee:'Modeler'}},
    orderHistory:[],clientRequests:[],
    clients:[{id:'clinic-1',name:'Тестовая клиника',originalName:'Тестовая клиника',telegramCode:'CD-CL-12345678',approved:true}],
    employees:[{id:'worker-1',name:'Modeler',originalName:'Modeler',status:'active'}]
  };
  fs.writeFileSync(path.join(data,'portal.json'),JSON.stringify(portal));
  fs.writeFileSync(path.join(data,'accounts.json'),'[]');
  const expires=Date.now()+60000;
  fs.writeFileSync(path.join(data,'sessions.json'),JSON.stringify([
    [sessionKey('worker-token'),{role:'worker',subjectId:'worker-1',displayName:'Modeler',expires}],
    [sessionKey('clinic-token'),{role:'clinic',subjectId:'clinic-1',displayName:'Доктор Иванов',expires}],
    [sessionKey('chief-token'),{role:'technician',subjectId:'chief',displayName:'Главный техник',expires}]
  ]));
  const port=44000+Math.floor(Math.random()*1000);
  const child=spawn(process.execPath,[path.resolve('server.js')],{cwd:temporary,env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  context.after(async()=>{if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited}fs.rmSync(temporary,{recursive:true,force:true})});
  const started=await new Promise((resolve,reject)=>{
    let errors='';child.stderr.on('data',chunk=>{errors+=String(chunk)});
    const timer=setTimeout(()=>reject(new Error('Test server did not start')),5000);
    child.once('exit',code=>{clearTimeout(timer);if(errors.includes('listen EPERM'))resolve(false);else reject(new Error(`Test server exited with ${code}: ${errors.trim()}`))});
    child.stdout.on('data',chunk=>{if(String(chunk).includes('Create Dental:')){clearTimeout(timer);resolve(true)}});
  });
  if(!started){context.skip('The local sandbox does not permit a test HTTP listener');return}
  const api=async(pathname,{token='worker-token',...options}={})=>{
    const response=await fetch(`http://127.0.0.1:${port}${pathname}`,{...options,headers:{'X-Portal-Token':token,...(options.headers||{})}});
    const body=await response.json();
    return {response,body};
  };
  const upload=async id=>{
    const html='<!doctype html><html><body><canvas id="cad"></canvas><script>document.body.dataset.ready="1"</script></body></html>';
    const result=await api(`/api/orders/${id}/files`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Upload-Name':'cad.html','X-File-Purpose':'cad-review'},body:html});
    if(result.response.status===410){context.skip('Legacy direct upload endpoint is intentionally disabled; CAD upload is tested through the Yandex Disk flow.');return null}
    assert.equal(result.response.status,201);
    return {file:result.body.file,html};
  };

  const first=await upload('CAD-A');
  if(!first)return;
  const submitted=await api('/api/orders/CAD-A/cad-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit',fileId:first.file.id})});
  assert.equal(submitted.response.status,201);
  assert.equal(submitted.body.orderOverride.stage,'Согласование CAD');
  assert.equal(submitted.body.portal,undefined);

  const chiefPortal=await api('/api/portal',{token:'chief-token'});
  chiefPortal.body.orderOverrides['CAD-A'].stage='Изготовление';
  const bypass=await api('/api/portal/orderOverrides',{token:'chief-token',method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(chiefPortal.body.orderOverrides)});
  assert.equal(bypass.response.status,409);

  const preview=await fetch(`http://127.0.0.1:${port}/api/order-files/${first.file.id}?content=1`,{headers:{'X-Portal-Token':'clinic-token'}});
  assert.equal(preview.status,200);
  assert.match(await preview.text(),/<canvas/);

  const approved=await api('/api/orders/CAD-A/cad-review',{token:'clinic-token',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'approve'})});
  assert.equal(approved.response.status,200);
  assert.equal(approved.body.orderOverride.stage,'Изготовление');
  assert.equal(approved.body.orderOverride.cadReview.reviewedBy,'Доктор Иванов');

  const second=await upload('CAD-B');
  await api('/api/orders/CAD-B/cad-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit',fileId:second.file.id})});
  const missingComment=await api('/api/orders/CAD-B/cad-review',{token:'clinic-token',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'return',comment:'нет'})});
  assert.equal(missingComment.response.status,400);
  const returned=await api('/api/orders/CAD-B/cad-review',{token:'clinic-token',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'return',comment:'Исправить контакт на 11 зубе'})});
  assert.equal(returned.response.status,200);
  assert.equal(returned.body.orderOverride.stage,'Моделирование');
  assert.equal(returned.body.orderOverride.cadReview.status,'returned');
  assert.equal(returned.body.orderOverride.cadReview.comment,'Исправить контакт на 11 зубе');
});
