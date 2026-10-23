import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
test('Telegram button and natural-language edits select a position and store revision and agreed prices',()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'cd-telegram-revisions-')),data=path.join(temporary,'.data');fs.mkdirSync(data);
 const orders=['MULTI','NATURAL'].map(id=>({id,clinicId:'a',clinic:'Test Clinic',patient:'Тестовый Пациент',work:'Несколько услуг (2)',material:'Вкладка культевая · Вкладка культевая',status:'Новый',sum:'7 000 ₽',date:'30.11.2026',createdAt:'2026-10-22T12:00:00Z',variants:[{work:'Вкладки',workOption:'Вкладка культевая',selectedTeeth:[11],toothMode:'Одиночка',unitPrice:3500},{work:'Вкладки',workOption:'Вкладка культевая',selectedTeeth:[21],toothMode:'Одиночка',unitPrice:3500}]}));
 fs.writeFileSync(path.join(data,'portal.json'),JSON.stringify({orders,orderOverrides:{},clients:[{id:'a',name:'Test Clinic',originalName:'Test Clinic',approved:true,telegramCode:'CD-CL-12345678'}],employees:[],clientRequests:[],tasks:[],orderHistory:[],payrollVersion:1,salaryAccruals:[]}));
 const source=`
 import assert from 'node:assert/strict';import fs from 'node:fs';
 const {createTelegramBridge,telegramInternals}=await import(${JSON.stringify(pathToFileURL(path.resolve('telegram-bot.js')).href)});
 const {portalSnapshot}=await import(${JSON.stringify(pathToFileURL(path.resolve('portal-data.js')).href)});
 const message={message_id:1,chat:{id:123,type:'group'}},from={id:42,first_name:'Tester'};
 const item={id:'natural',chatId:'123',clinicId:'a',userId:'42',actor:'Tester',analysis:telegramInternals.normalizeAnalysis({intent:'update_order',orderId:'NATURAL',fields:{teeth:[12]}}),orderId:'NATURAL',attachments:[],createdAt:new Date().toISOString(),expiresAt:Date.now()+3600000};
 fs.writeFileSync('.data/telegram-bot.json',JSON.stringify({bindings:{a:{chatId:'123'}},pending:{natural:item}}));
 const callbacks=['tgoldedit:teeth:MULTI','tgoldvariant:teeth:MULTI|1','tgoldchoice:MULTI:teeth|reset','tgoldchoice:MULTI:teeth|22','tgoldchoice:MULTI:teeth|done','tgconfirm:natural','tgvariant:natural:0'];
 const updates=callbacks.map((data,index)=>({update_id:index+1,callback_query:{id:String(index+1),from,message,data}}));
 const sent=[];let polled=false,bridge,done;const completed=new Promise(resolve=>done=resolve);
 globalThis.fetch=async(url,options)=>{assert.ok(String(url).startsWith('https://api.telegram.org/'),'No real external calls in tests');const method=String(url).split('/').at(-1),body=JSON.parse(options.body||'{}');let result=true;
 if(method==='getMe')result={id:1,username:'fake_bot'};
 if(method==='getUpdates'){if(!polled){polled=true;result=updates;}else{bridge.stop();done();result=[];}}
 if(method==='sendMessage'||method==='editMessageText'){sent.push(body);result={message_id:sent.length,chat:{id:123}};}
 return new Response(JSON.stringify({ok:true,result}),{headers:{'Content-Type':'application/json'}});};
 bridge=createTelegramBridge();assert.equal(await bridge.start(),true);await completed;
 const snapshot=portalSnapshot(),button=snapshot.clientRequests.find(r=>r.orderId==='MULTI'),natural=snapshot.clientRequests.find(r=>r.orderId==='NATURAL');
 assert.ok(button,'Button edit must enqueue a client request');assert.ok(natural,'Natural language position selection must enqueue a client request');
 assert.equal(button.variantIndex,1);assert.equal(button.baseOrderRevision,0);assert.deepEqual(button.changes.variants[0].selectedTeeth,[11]);assert.deepEqual(button.changes.variants[1].selectedTeeth,[22]);assert.equal(button.changes.variants[1].unitPrice,3500);
 assert.equal(natural.variantIndex,0);assert.equal(natural.baseOrderRevision,0);assert.deepEqual(natural.changes.variants[0].selectedTeeth,[12]);assert.deepEqual(natural.changes.variants[1].selectedTeeth,[21]);
 assert.ok(sent.some(m=>m.reply_markup?.inline_keyboard.flat().some(b=>b.callback_data==='tgoldvariant:teeth:MULTI|1')));
 assert.ok(sent.some(m=>m.reply_markup?.inline_keyboard.flat().some(b=>b.callback_data==='tgvariant:natural:0')));
 assert.equal(bridge.status().lastError,'');console.log('Telegram position flow passed');
 `;
 try{const output=execFileSync(process.execPath,['--input-type=module','-e',source],{cwd:temporary,env:{...process.env,PORTAL_DATABASE_URL:'',DATABASE_URL:'',TELEGRAM_BOT_TOKEN:'fake',YANDEX_SPEECHKIT_API_KEY:'fake',YANDEX_GPT_API_KEY:'fake',YANDEX_FOLDER_ID:'fake',TELEGRAM_HTTP_PROXY_URL:''},encoding:'utf8',timeout:10000});assert.match(output,/Telegram position flow passed/);}finally{fs.rmSync(temporary,{recursive:true,force:true});}
});
