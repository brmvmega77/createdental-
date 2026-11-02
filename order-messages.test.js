import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

test('chief can start any registered clinic conversation and order context is scoped and persistent',async t=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'cd-order-chat-')),data=path.join(temporary,'.data');fs.mkdirSync(data);
 const order={id:'CD-TEST-CHAT',clinicId:'clinic-a',clinic:'Клиника А',patient:'Пациент',work:'Реставрации',material:'PMMA коронка CAD/CAM',teeth:[26],variants:[{work:'Реставрации',workOption:'PMMA коронка CAD/CAM',selectedTeeth:[26]}]};
 fs.writeFileSync(path.join(data,'portal.json'),JSON.stringify({orders:[order],clients:[{id:'clinic-a',name:'Клиника А'},{id:'clinic-b',name:'Клиника Б'},{id:'deleted',name:'Удалённая',deleted:true}],employees:[{id:'worker',name:'Техник',status:'active'}],orderOverrides:{}}));
 fs.writeFileSync(path.join(data,'accounts.json'),'[]');
 fs.writeFileSync(path.join(data,'sessions.json'),JSON.stringify(['chief','clinic-a','clinic-b','worker'].map(id=>['sha256:'+createHash('sha256').update(id).digest('hex'),{role:id==='chief'?'technician':id==='worker'?'worker':'clinic',subjectId:id,expires:Date.now()+3600000}])));
 const port=44000+Math.floor(Math.random()*1000);let child,errors='';
 const start=async()=>{child=spawn(process.execPath,[path.resolve('server.js')],{cwd:temporary,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PORTAL_DATABASE_URL:'',DATABASE_URL:'',TELEGRAM_BOT_TOKEN:'',EMPLOYEE_TELEGRAM_BOT_TOKEN:''},stdio:['ignore','pipe','pipe']});child.stderr.on('data',c=>errors+=c);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(errors)),7000);child.once('exit',()=>{clearTimeout(timer);reject(Error(errors))});child.stdout.on('data',c=>{if(String(c).includes('Create Dental:')){clearTimeout(timer);resolve()}})})};
 const stop=async()=>{if(child?.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done}};
 t.after(async()=>{await stop();fs.rmSync(temporary,{recursive:true,force:true})});await start();
 const api=async(route,user,body)=>{const response=await fetch(`http://127.0.0.1:${port}${route}`,{method:body?'POST':'GET',headers:{'X-Portal-Token':user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}};
 const conversations='/api/chief/conversations';
 const list=await api(conversations,'chief');assert.equal(list.status,200);assert.deepEqual(list.body.conversations.map(c=>c.id),['clinic-a','clinic-b']);
 assert.equal((await api(conversations,'clinic-a')).status,403);assert.equal((await api(conversations,'worker')).status,403);
 assert.equal((await api(conversations+'/clinic-b','chief')).body.messages.length,0);
 const first=await api(conversations+'/clinic-b/reply','chief',{text:'Первое сообщение лаборатории'});
 assert.equal(first.status,201);assert.equal(first.body.message.deliveryStatus,'portal');
 assert.equal((await api('/api/clinic-messages','clinic-b')).body.messages[0].text,'Первое сообщение лаборатории');
 const sent=await api('/api/clinic-messages','clinic-a',{text:'Вопрос о заказе',orderId:order.id,orderLabel:'Поддельный номер'});
 assert.equal(sent.status,201);assert.equal(sent.body.message.orderId,order.id);assert.equal(sent.body.message.orderLabel,'TEST-CHAT');
 const reply=await api(conversations+'/clinic-a/reply','chief',{text:'Ответ лаборатории',orderId:order.id});assert.equal(reply.status,201);assert.equal(reply.body.message.orderId,order.id);
 const chiefList=await api(conversations,'chief');assert.equal(chiefList.body.totalUnreadCount,1);assert.equal(chiefList.body.conversations.find(item=>item.id==='clinic-a').unreadCount,1);
 const chiefThread=await api(conversations+'/clinic-a','chief');assert.equal(chiefThread.body.unreadCount,1);
 const chiefRead=await api(conversations+'/clinic-a/read','chief',{messageId:chiefThread.body.lastMessageId});assert.equal(chiefRead.body.totalUnreadCount,0);
 assert.equal((await api(conversations+'/clinic-a','chief')).body.unreadCount,0);
 assert.equal((await api('/api/clinic-messages','clinic-b',{text:'Чужой заказ',orderId:order.id})).status,400);
 assert.equal((await api(conversations+'/clinic-b/reply','chief',{text:'Неверная клиника',orderId:order.id})).status,400);
 assert.equal((await api(conversations+'/deleted/reply','chief',{text:'Удалённая клиника'})).status,404);
 // Looking at a preview or fetching a thread never acknowledges it implicitly.
 const unread='/api/clinic-messages/unread',read='/api/clinic-messages/read';
 assert.equal((await api(unread,'clinic-a')).body.unreadCount,1);
 assert.equal((await api(unread,'clinic-b')).body.unreadCount,1);
 const seen=(await api('/api/clinic-messages','clinic-a')).body;
 assert.equal(seen.unreadCount,1);
 await api(conversations+'/clinic-a','chief');
 assert.equal((await api(unread,'clinic-a')).body.unreadCount,1);
 assert.equal((await api(unread,'worker')).status,403);
 assert.equal((await api(read,'chief',{messageId:seen.lastMessageId})).status,403);
 assert.equal((await api(read,'clinic-b',{messageId:seen.lastMessageId})).status,400);
 assert.equal((await api(read,'clinic-a',{messageId:'missing'})).status,400);
 assert.equal((await api(read,'clinic-a',{messageId:123})).status,400);
 // A reply arriving between load and acknowledgement must remain unread.
 const newer=await api(conversations+'/clinic-a/reply','chief',{text:'Дополнение к ответу'});
 assert.equal((await api(read,'clinic-a',{messageId:seen.lastMessageId})).body.unreadCount,1);
 assert.equal((await api(read,'clinic-a',{messageId:newer.body.message.id})).body.unreadCount,0);
 // A stale tab cannot roll the shared read marker backwards.
 assert.equal((await api(read,'clinic-a',{messageId:seen.lastMessageId})).body.unreadCount,0);
 assert.equal((await api(unread,'clinic-b')).body.unreadCount,1);
 await api('/api/clinic-messages','clinic-a',{text:'Спасибо за ответ'});
 assert.equal((await api(unread,'clinic-a')).body.unreadCount,0);
 const before=(await api('/api/clinic-messages','clinic-a')).body.messages;
 await stop();
 // Telegram bot replies and messages containing only an attachment are incoming too.
 const messagesFile=path.join(data,'clinic-messages.json'),savedChats=JSON.parse(fs.readFileSync(messagesFile,'utf8'));
 savedChats['clinic-b'].messages.push({id:'c'.repeat(24),from:'bot',text:'Файл получен',time:new Date().toISOString()},{id:'d'.repeat(24),from:'support',text:'',attachment:{id:'photo',kind:'photo',name:'photo.jpg'},time:new Date().toISOString()});
 fs.writeFileSync(messagesFile,JSON.stringify(savedChats));
 await start();assert.deepEqual((await api('/api/clinic-messages','clinic-a')).body.messages,before);
 assert.equal((await api(unread,'clinic-a')).body.unreadCount,0);
 assert.equal((await api(unread,'clinic-b')).body.unreadCount,3);
 assert.equal((await api(conversations,'chief')).body.conversations.find(c=>c.id==='clinic-a').lastMessage,'Спасибо за ответ');
});
