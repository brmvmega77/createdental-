import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

test('malformed password hashes fail safely and repeated login attempts are throttled',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cd-auth-audit-')),data=path.join(dir,'.data');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data,'portal.json'),JSON.stringify({orders:[],clients:[{id:'clinic-1',name:'Тестовая клиника',originalName:'Тестовая клиника',approved:true}],employees:[],orderOverrides:{},orderHistory:[],tasks:[]}));
  fs.writeFileSync(path.join(data,'accounts.json'),JSON.stringify([{id:'clinic-account',email:'clinic@example.test',passwordHash:'corrupted',role:'clinic',subjectId:'clinic-1'}]));
  const port=57000+Math.floor(Math.random()*1000);
  const child=spawn(process.execPath,[path.resolve('server.js')],{cwd:dir,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PORTAL_DATABASE_URL:'',DATABASE_URL:'',TELEGRAM_BOT_TOKEN:'',EMPLOYEE_TELEGRAM_BOT_TOKEN:'',HTTPS_REDIRECT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited}fs.rmSync(dir,{recursive:true,force:true})});
  await new Promise((resolve,reject)=>{let errors='';const timer=setTimeout(()=>reject(new Error('Startup timeout '+errors)),10000);child.stderr.on('data',chunk=>{errors+=String(chunk)});child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Exit ${code}: ${errors}`))});child.stdout.on('data',chunk=>{if(String(chunk).includes('Create Dental:')){clearTimeout(timer);resolve()}})});
  const request=()=>fetch(`http://127.0.0.1:${port}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'clinic@example.test',password:'wrong-password'})});
  assert.equal((await request()).status,401);
  const statuses=[];for(let index=0;index<10;index++)statuses.push((await request()).status);
  assert.ok(statuses.includes(429),'login attempts should be rate limited');
});
