import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {employeePayrollProfile,employeePayrollText} from './payroll-telegram.js';

const employee={id:'cad-1',name:'Иван',specialty:'CAD/CAM оператор',rank:4};
const accrual=(id,at,amount=251)=>({id,employeeId:employee.id,orderId:id,at,amount,rank:2,lines:[{service:'Коронка',units:2,rate:125.5,amount}]});
test('Telegram uses the shared ledger, keeps historical rank and Moscow month boundaries',()=>{
  const text=employeePayrollText(employee,{salaryAccruals:[accrual('OCT','2026-09-30T21:30:00Z'),accrual('SEP','2026-09-30T20:30:00Z',100),{...accrual('OTHER','2026-10-01T00:00:00Z',99999),employeeId:'other'}]},{now:'2026-10-01T00:00:00Z'});
  assert.match(text,/Ранг: 4 из 5/);
  assert.match(text,/Ранг при начислении: 2/);
  assert.match(text,/за текущий месяц: 251 ₽/);
  assert.match(text,/Всего начислено: 351 ₽/);
  assert.match(text,/2 ед\. × 125,5 ₽ = 251 ₽/);
  assert.doesNotMatch(text,/OTHER|99999|900 ₽/);
});
test('Telegram shows empty payroll and fallback rank without inventing earnings',()=>{
  assert.match(employeePayrollProfile({name:'Техник',specialty:'Препрод техник'}),/Гипсовщик\nРанг: 1 из 5/);
  assert.match(employeePayrollText(employee,{salaryAccruals:[]}),/Всего начислено: 0 ₽/);
  assert.match(employeePayrollText(employee,{}),/Начислений пока нет/);
});
test('Telegram payroll stays within one message for large histories and service names',()=>{
  const items=Array.from({length:100},(_,index)=>({...accrual('CD-'+index,'2026-10-01T12:00:00Z'),lines:Array.from({length:10},()=>({service:'Услуга '.repeat(1000),units:32,rate:125.5,amount:4016}))}));
  const text=employeePayrollText(employee,{salaryAccruals:items});
  assert.ok(text.length<4096);
  assert.match(text,/Полная детализация/);
});

test('Real employee bot routes salary commands and profile buttons to the shared payroll without sending real messages',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'payroll-telegram-'));
  try{
    fs.mkdirSync(path.join(dir,'.data'));
    fs.writeFileSync(path.join(dir,'.data/portal.json'),JSON.stringify({employees:[{...employee,status:'active'}, {id:'other',name:'Другой',specialty:'CAM оператор',rank:5,status:'active'}],payrollVersion:1,salaryAccruals:[accrual('MY-ORDER',new Date().toISOString()),{...accrual('PRIVATE-OTHER',new Date().toISOString(),99999),employeeId:'other'}]}));
    fs.writeFileSync(path.join(dir,'bindings.json'),JSON.stringify({bindings:{[employee.id]:{chatId:101},other:{chatId:202}}}));
    const script=`
      const messages=[];
      let updates=[{update_id:1,message:{chat:{id:101,type:'private'},text:'/salary'}},{update_id:2,callback_query:{id:'p',data:'emp:profile',message:{chat:{id:101},message_id:1}}},{update_id:3,callback_query:{id:'s',data:'emp:salary',message:{chat:{id:202},message_id:2}}}];
      globalThis.fetch=async(url,options)=>{
        if(!String(url).startsWith('https://api.telegram.org/'))throw Error('Unexpected network request');
        const method=String(url).split('/').pop(),body=JSON.parse(options.body);let result=true;
        if(method==='getMe')result={id:1,username:'test'};
        if(method==='getUpdates'){result=updates;updates=[]}
        if(method==='sendMessage'){messages.push(body);result={message_id:messages.length}}
        return new Response(JSON.stringify({ok:true,result}));
      };
      const {createEmployeeTelegramBridge}=await import(${JSON.stringify(pathToFileURL(path.resolve('employee-telegram-bot.js')).href)});
      const bridge=createEmployeeTelegramBridge({stateFile:'bindings.json'});await bridge.start();
      for(let i=0;i<100&&messages.length<3;i++)await new Promise(resolve=>setTimeout(resolve,10));
      await bridge.stop();console.log('RESULT:'+JSON.stringify(messages));
    `;
    const output=execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:dir,encoding:'utf8',timeout:6000,env:{...process.env,EMPLOYEE_TELEGRAM_BOT_TOKEN:'test-only',TELEGRAM_HTTP_PROXY_URL:'',PORTAL_DATABASE_URL:'',DATABASE_URL:'',PORTAL_DATA_FILE:path.join(dir,'.data/portal.json')}});
    const messages=JSON.parse(output.split('RESULT:')[1].trim());
    assert.equal(messages.length,3);
    for(const message of messages.filter(item=>item.chat_id===101)){
      assert.match(message.text,/Ранг: 4 из 5/);
      assert.doesNotMatch(message.text,/PRIVATE-OTHER|99\s*999/);
    }
    assert.match(messages[0].text,/MY-ORDER/);
    assert.match(messages[2].text,/PRIVATE-OTHER/);
    assert.doesNotMatch(messages[2].text,/MY-ORDER/);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
