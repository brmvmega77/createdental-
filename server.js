import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual,randomBytes } from 'node:crypto';
import {createDataBackup} from './backup-data.js';
import {portalSnapshot,replacePortalCollection,recordPortalEvent,portalClient,portalEmployee} from './portal-data.js';
import {validEmail,validPassword,hasAccount,createAccount,upsertWorkerAccount,updateChiefAccount,chiefAccountProfile,workerAccountProfile,updateWorkerAccount,login,issueSession,sessionFor,revokeSession,revokeSubjectSessions} from './auth-data.js';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const supportToken = process.env.SUPPORT_TOKEN || (process.env.SUPPORT_TOKEN_FILE ? fs.readFileSync(process.env.SUPPORT_TOKEN_FILE, 'utf8').trim() : '');
const chatFile = process.env.CHAT_DATA_FILE || path.join(root, '.data', 'chat.json');
const clinicMessagesFile=process.env.CLINIC_MESSAGES_FILE||path.join(root,'.data','clinic-messages.json');
const clinicMessageUploadDir=process.env.CLINIC_MESSAGE_UPLOAD_DIR||path.join(root,'.data','clinic-message-files');
const clinicMessageUploadMetaFile=process.env.CLINIC_MESSAGE_UPLOAD_META_FILE||path.join(root,'.data','clinic-message-files.json');
const uploadDir=process.env.ORDER_UPLOAD_DIR||path.join(root,'.data','order-files');
const uploadMetaFile=process.env.ORDER_UPLOAD_META_FILE||path.join(root,'.data','order-files.json');
const notificationReadFile=process.env.NOTIFICATION_READ_FILE||path.join(root,'.data','notification-read.json');
const tlsKeyFile=process.env.TLS_KEY_FILE||'';
const tlsCertFile=process.env.TLS_CERT_FILE||'';
const httpsRedirect=process.env.HTTPS_REDIRECT==='1';
const publicFiles = new Set(['/','/index.html','/app.js','/technician.js','/worker.js','/seed-orders.js','/portal-client.js','/routes.js','/location-assist.js','/notification-center.js','/styles.css','/support.html','/support.js']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon'};
const conversationIdPattern = /^[a-f0-9]{32}$/;
let chats = {};
let saveQueue = Promise.resolve();
let clinicChats={};
let clinicSaveQueue=Promise.resolve();
let clinicMessageFiles={};
let clinicMessageFilesQueue=Promise.resolve();
let orderFiles={};
let orderFilesQueue=Promise.resolve();
let notificationReads={};
let notificationReadQueue=Promise.resolve();
try{orderFiles=JSON.parse(fs.readFileSync(uploadMetaFile,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
try{notificationReads=JSON.parse(fs.readFileSync(notificationReadFile,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
const locationCache=new Map();
try{clinicChats=JSON.parse(fs.readFileSync(clinicMessagesFile,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
try{clinicMessageFiles=JSON.parse(fs.readFileSync(clinicMessageUploadMetaFile,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}

try {
  chats = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

function json(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
}

function secureHeaders(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(req.socket.encrypted||req.headers['x-forwarded-proto']==='https')res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
}

function isOperator(req) {
  const incoming = req.headers['x-support-token'];
  if (!supportToken || typeof incoming !== 'string') return false;
  const left = Buffer.from(incoming);
  const right = Buffer.from(supportToken);
  return left.length === right.length && timingSafeEqual(left, right);
}

function session(req){
  const current=sessionFor(req.headers['x-portal-token']);
  if(!current)return null;
  if(current.role==='clinic'&&!portalClient(current.subjectId))return null;
  if(current.role==='worker'&&portalEmployee(current.subjectId)?.status!=='active')return null;
  return current;
}
function canAccessOrder(user,order){
  if(!user||!order)return false;
  if(user.role==='technician')return true;
  if(user.role==='clinic')return order.clinicId===user.subjectId;
  return user.role==='worker'&&portalEmployee(user.subjectId)?.originalName===portalSnapshot().orderOverrides[order.id]?.assignee;
}
function actorName(user){
  if(user?.role==='clinic')return portalClient(user.subjectId)?.name||user.displayName||'Клиника';
  if(user?.role==='worker')return portalEmployee(user.subjectId)?.name||user.displayName||'Техник';
  return user?.displayName||user?.email||'Главный техник';
}
function publicUser(user){
  if(user?.role==='technician'&&user.subjectId==='chief')return {...user,...chiefAccountProfile()};
  if(user?.role==='worker'){
    const employee=portalEmployee(user.subjectId);
    return {...user,...workerAccountProfile(user.subjectId),displayName:employee?.name||workerAccountProfile(user.subjectId).displayName||'Техник',email:workerAccountProfile(user.subjectId).email||employee?.email||''};
  }
  return user;
}
function publicClinicOverride(detail={}){
  const {assignee,...visible}=detail||{};
  return {...visible,assigned:Boolean(assignee&&assignee!=='Не назначен')};
}
function publicClinicHistoryEvent(event){
  if(event?.action!=='assignee_changed')return event;
  const {from,to,...visible}=event;
  return {...visible,assigned:Boolean(to&&to!=='Не назначен')};
}

async function readBody(req,limit=8192) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error('too_large');
  }
  return JSON.parse(body || '{}');
}

async function handlePortal(req,res,url){
  const user=session(req);
  if(!user)return json(res,401,{error:'Войдите в кабинет'});
  const snapshot=portalSnapshot();
  if(req.method==='GET'&&url.pathname==='/api/portal'){
    if(user.role==='clinic'){
      snapshot.clients=snapshot.clients.filter(item=>item.id===user.subjectId);
      snapshot.orders=snapshot.orders.filter(item=>item.clinicId===user.subjectId);
      snapshot.employees=[];
      snapshot.orderOverrides=Object.fromEntries(Object.entries(snapshot.orderOverrides).filter(([id])=>snapshot.orders.some(order=>order.id===id)).map(([id,detail])=>[id,publicClinicOverride(detail)]));
      snapshot.orderHistory=snapshot.orderHistory.filter(event=>event.clinicId===user.subjectId||snapshot.orders.some(order=>order.id===event.orderId)).map(publicClinicHistoryEvent);
    }else if(user.role==='worker'){
      const employee=portalEmployee(user.subjectId);
      snapshot.orders=snapshot.orders.filter(item=>snapshot.orderOverrides[item.id]?.assignee===employee.originalName);
      snapshot.clients=[];
      snapshot.employees=[employee];
      snapshot.orderOverrides=Object.fromEntries(Object.entries(snapshot.orderOverrides).filter(([id])=>snapshot.orders.some(order=>order.id===id)));
      snapshot.orderHistory=snapshot.orderHistory.filter(event=>snapshot.orders.some(order=>order.id===event.orderId));
    }
    return json(res,200,{...snapshot,user:publicUser(user)});
  }
  const key=url.pathname.slice('/api/portal/'.length);
  if(req.method==='PUT'&&['orders','orderOverrides','clients','employees'].includes(key)){
    let value;
    try {value=await readBody(req,500000)} catch {return json(res,400,{error:'Неверные данные'})}
    if(user.role==='clinic'){
      if(key==='clients'){
        if(!Array.isArray(value)||value.length!==1||value[0].id!==user.subjectId)return json(res,403,{error:'Доступ запрещён'});
        value=snapshot.clients.map(item=>item.id===user.subjectId?{...item,...value[0],id:item.id,originalName:item.originalName,telegramCode:item.telegramCode}:item);
      }else if(key==='orders'){
        if(!Array.isArray(value))return json(res,400,{error:'Неверные данные'});
        const existing=new Set(snapshot.orders.map(item=>item.id));
        const additions=value.filter(item=>!existing.has(item.id));
        if(additions.length!==1||value.length!==snapshot.orders.filter(item=>item.clinicId===user.subjectId).length+1||additions[0].clinicId!==user.subjectId||snapshot.orders.some(item=>item.id===additions[0].id))return json(res,403,{error:'Можно добавить только свой заказ'});
        value=[...additions,...snapshot.orders];
      }else if(key==='orderOverrides'){
        if(!value||typeof value!=='object'||Array.isArray(value))return json(res,400,{error:'Неверные данные'});
        const changes=Object.entries(value).filter(([id,detail])=>JSON.stringify(detail)!==JSON.stringify(publicClinicOverride(snapshot.orderOverrides[id]||{})));
        if(changes.length!==1)return json(res,403,{error:'Можно изменить только один свой заказ'});
        const [id,next]=changes[0],order=snapshot.orders.find(item=>item.id===id&&item.clinicId===user.subjectId),old=snapshot.orderOverrides[id]||{};
        const visibleOld=publicClinicOverride(old);
        if(!order||old.stage!=='В доставке'||next.stage!=='Принято доктором'||Object.keys({...visibleOld,...next}).some(field=>!['stage','doctorAcceptedAt'].includes(field)&&JSON.stringify(next[field])!==JSON.stringify(visibleOld[field])))return json(res,403,{error:'Неверный переход этапа'});
        value={...snapshot.orderOverrides,[id]:{...old,stage:'Принято доктором',doctorAcceptedAt:new Date().toISOString()}};
      }else return json(res,403,{error:'Доступ запрещён'});
    }else if(user.role==='worker'){
      if(key!=='orderOverrides'||!value||typeof value!=='object')return json(res,403,{error:'Доступ запрещён'});
      const employee=portalEmployee(user.subjectId);
      const stages=['Подготовка','Моделирование','Изготовление','Контроль качества'];
      const changes=Object.entries(value).filter(([id,detail])=>JSON.stringify(detail)!==JSON.stringify(snapshot.orderOverrides[id]));
      if(changes.length!==1)return json(res,403,{error:'Можно изменить только один свой заказ'});
      const [id,next]=changes[0],old=snapshot.orderOverrides[id];
      const oldIndex=stages.indexOf(old?.stage),nextIndex=stages.indexOf(next?.stage);
      const reworkResume=old?.stage==='На доработке'&&next?.stage==='Изготовление';
      if(!old||old.assignee!==employee.originalName||!next||next.assignee!==old.assignee||(!reworkResume&&(oldIndex<0||nextIndex<0||Math.abs(nextIndex-oldIndex)!==1))||Object.keys(next).some(field=>!['stage','reworkReason','reworkAt'].includes(field)&&JSON.stringify(next[field])!==JSON.stringify(old[field])))return json(res,403,{error:'Неверный переход этапа'});
      value={...snapshot.orderOverrides,[id]:next};
    }
    try {await replacePortalCollection(key,value,{role:user.role,name:actorName(user)});if(key==='employees')for(const employee of value)if(employee.status!=='active')revokeSubjectSessions('worker',employee.id);return json(res,200,{ok:true})}
    catch(error){return json(res,error.message==='invalid_collection'?400:500,{error:error.message==='invalid_collection'?'Неверные данные':'Не удалось сохранить'})}
  }
  return json(res,404,{error:'Не найдено'});
}

async function persistOrderFiles(){
  orderFilesQueue=orderFilesQueue.catch(()=>{}).then(async()=>{
    await fs.promises.mkdir(path.dirname(uploadMetaFile),{recursive:true,mode:0o700});
    await fs.promises.writeFile(uploadMetaFile+'.tmp',JSON.stringify(orderFiles),{mode:0o600});
    await fs.promises.rename(uploadMetaFile+'.tmp',uploadMetaFile);
  });
  await orderFilesQueue;
}
async function readRaw(req,limit){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('too_large');chunks.push(chunk)}
  return Buffer.concat(chunks,size);
}
function orderIdFromFileRoute(pathname){return pathname.match(/^\/api\/orders\/([A-Za-z0-9_-]{1,80})\/files$/)?.[1]||''}
async function handleOrderFiles(req,res,url){
  const user=session(req);if(!user)return json(res,401,{error:'Войдите в кабинет'});
  const orderId=orderIdFromFileRoute(url.pathname);
  if(orderId){
    const order=portalSnapshot().orders.find(item=>item.id===orderId);
    if(!canAccessOrder(user,order))return json(res,404,{error:'Заказ не найден'});
    if(req.method==='GET')return json(res,200,{files:(orderFiles[orderId]||[]).map(({id,name,size,type,uploadedAt,uploadedBy,purpose})=>({id,name,size,type,uploadedAt,uploadedBy,purpose:purpose||'order-file'}))});
    if(req.method!=='POST')return json(res,405,{error:'Метод не поддерживается'});
    const name=decodeURIComponent(String(req.headers['x-upload-name']||'')).replace(/[\\/\\0-\\x1f]/g,'_').trim().slice(0,180);
    const ext=path.extname(name).toLowerCase();
    const purpose=String(req.headers['x-file-purpose']||'order-file');
    if(!['order-file','result-photo'].includes(purpose))return json(res,400,{error:'Неизвестный тип файла'});
    if(purpose==='result-photo'&&(user.role==='clinic'||!['.jpg','.jpeg','.png'].includes(ext)))return json(res,403,{error:'Фото результата может добавить только лаборатория в формате JPG или PNG'});
    if(purpose==='result-photo'&&user.role==='worker'&&portalSnapshot().orderOverrides[orderId]?.stage!=='Контроль качества')return json(res,409,{error:'Фото результата можно добавить на этапе контроля качества'});
    const allowed={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.pdf':'application/pdf','.stl':'model/stl','.ply':'application/octet-stream'};
    if(!name||!allowed[ext])return json(res,400,{error:'Поддерживаются JPG, PNG, PDF, STL и PLY'});
    const type=String(req.headers['content-type']||'').split(';')[0].toLowerCase();
    if(type&&type!=='application/octet-stream'&&type!==allowed[ext])return json(res,400,{error:'Тип файла не совпадает с расширением'});
    let data;try{data=await readRaw(req,50*1024*1024)}catch(error){return json(res,error.message==='too_large'?413:400,{error:error.message==='too_large'?'Файл больше 50 МБ':'Не удалось прочитать файл'})}
    if(!data.length)return json(res,400,{error:'Файл пустой'});
    const id=randomBytes(18).toString('hex');
    try{
      await fs.promises.mkdir(uploadDir,{recursive:true,mode:0o700});
      await fs.promises.writeFile(path.join(uploadDir,id),data,{flag:'wx',mode:0o600});
      const record={id,name,size:data.length,type:allowed[ext],uploadedAt:new Date().toISOString(),uploadedBy:actorName(user),purpose};
      orderFiles[orderId]=[...(orderFiles[orderId]||[]),record];await persistOrderFiles();
      await recordPortalEvent(orderId,{role:user.role,name:actorName(user)},'file_uploaded',{summary:purpose==='result-photo'?'Добавлено фото готовой работы':'Добавлен файл к заказу',fileName:name,purpose,clinicId:order.clinicId}).catch(()=>{});
      return json(res,201,{file:record});
    }catch{return json(res,500,{error:'Не удалось сохранить файл'})}
  }
  const match=url.pathname.match(/^\/api\/order-files\/([a-f0-9]{36})$/);
  if(match&&req.method==='GET'){
    const record=Object.entries(orderFiles).flatMap(([id,files])=>files.filter(file=>file.id===match[1]).map(file=>({orderId:id,file})))[0];
    if(!record||!canAccessOrder(user,portalSnapshot().orders.find(item=>item.id===record.orderId)))return json(res,404,{error:'Файл не найден'});
    try{const data=await fs.promises.readFile(path.join(uploadDir,record.file.id));res.writeHead(200,{'Content-Type':record.file.type,'Content-Length':data.length,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(record.file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(data)}catch{return json(res,404,{error:'Файл не найден'})}
  }
  return json(res,404,{error:'Не найдено'});
}

async function persistNotificationReads(){
  notificationReadQueue=notificationReadQueue.catch(()=>{}).then(async()=>{
    await fs.promises.mkdir(path.dirname(notificationReadFile),{recursive:true,mode:0o700});
    await fs.promises.writeFile(notificationReadFile+'.tmp',JSON.stringify(notificationReads),{mode:0o600});
    await fs.promises.rename(notificationReadFile+'.tmp',notificationReadFile);
  });
  await notificationReadQueue;
}
async function handleNotifications(req,res){
  const user=session(req);if(!user)return json(res,401,{error:'Войдите в кабинет'});
  const key=`${user.role}:${user.subjectId}`,snapshot=portalSnapshot();
  if(req.method==='GET'){
    const accessible=new Set(snapshot.orders.filter(order=>canAccessOrder(user,order)).map(order=>order.id));
    const events=snapshot.orderHistory.filter(event=>{
      if(user.role==='technician')return event.action==='message_received'||event.action==='clinic_registered'||event.action==='order_created'||event.action==='stage_changed'&&event.to==='Контроль качества';
      return (event.clinicId===user.subjectId||accessible.has(event.orderId))&&!(event.action==='stage_changed'&&event.to==='На доработке');
    });
    const readAt=notificationReads[key]||'';
    const describe=event=>{
      const order=snapshot.orders.find(item=>item.id===event.orderId),clinic=portalClient(event.clinicId||order?.clinicId);
      if(event.action==='clinic_registered')return `Новая регистрация: ${event.summary||event.actor||'клиника'}`;
      if(event.action==='message_received')return `Новое сообщение от ${event.actor||clinic?.name||'клиники'}`;
      if(event.action==='order_created')return `Новый заказ ${event.orderId}${order?.clinic||clinic?.name?` от ${order?.clinic||clinic?.name}`:''}`;
      if(event.action==='stage_changed'&&event.to==='Контроль качества')return `Заказ ${event.orderId} требует проверки качества`;
      if(event.action==='stage_changed')return `Заказ ${event.orderId}: ${event.to}`;
      if(event.action==='assignee_changed')return user.role==='clinic'?`Заказ ${event.orderId}: исполнитель назначен`:`Заказ ${event.orderId}: исполнитель ${event.to}`;
      if(event.action==='rework_requested')return `Заказ ${event.orderId}: запрошена доработка`;
      if(event.action==='file_uploaded')return `Заказ ${event.orderId}: ${event.purpose==='result-photo'?'добавлено фото готовой работы':'добавлен файл'}`;
      if(event.action==='message_replied')return `Лаборатория ответила на сообщение`;
      return `Заказ ${event.orderId}: ${event.summary||'есть обновление'}`;
    };
    const notificationMeta=event=>{
      if(event.action==='clinic_registered')return {type:'registration',target:'clients',clinicId:event.clinicId||''};
      if(event.action==='message_received')return {type:'message',target:'messages',clinicId:event.clinicId||''};
      if(event.action==='order_created')return {type:'order',target:'detail',clinicId:event.clinicId||''};
      if(event.action==='stage_changed'&&event.to==='Контроль качества')return {type:'quality',target:'detail',clinicId:event.clinicId||''};
      return {type:'update',target:event.orderId?'detail':'messages',clinicId:event.clinicId||''};
    };
    const items=events.slice(-100).reverse().map(event=>({id:event.id,orderId:event.orderId||'',at:event.at,text:describe(event),read:Boolean(readAt&&event.at<=readAt),actorRole:event.actorRole,...notificationMeta(event)}));
    return json(res,200,{items:items.slice(0,40),unreadCount:items.filter(item=>!item.read&&item.actorRole!==user.role).length});
  }
  if(req.method==='POST'){
    notificationReads[key]=new Date().toISOString();
    try{await persistNotificationReads();return json(res,200,{ok:true})}catch{return json(res,500,{error:'Не удалось отметить уведомления прочитанными'})}
  }
  return json(res,405,{error:'Метод не поддерживается'});
}

async function handleOrderRework(req,res,url){
  const user=session(req);if(!user)return json(res,401,{error:'Войдите в кабинет'});
  if(req.method!=='POST')return json(res,405,{error:'Метод не поддерживается'});
  const id=url.pathname.match(/^\/api\/orders\/([A-Za-z0-9_-]{1,80})\/rework$/)?.[1];
  if(!id)return json(res,404,{error:'Не найдено'});
  const snapshot=portalSnapshot(),order=snapshot.orders.find(item=>item.id===id);
  if(user.role!=='clinic'||!order||order.clinicId!==user.subjectId)return json(res,404,{error:'Заказ не найден'});
  const old=snapshot.orderOverrides[id]||{};
  if(old.stage!=='В доставке')return json(res,409,{error:'Отправить заказ на доработку можно после доставки'});
  let body;try{body=await readBody(req,6000)}catch{return json(res,400,{error:'Укажите причину доработки'})}
  const reason=String(body.reason||'').trim();
  if(reason.length<5||reason.length>2000)return json(res,400,{error:'Опишите причину доработки (от 5 до 2000 символов)'});
  const next={...snapshot.orderOverrides,[id]:{...old,stage:'На доработке',reworkReason:reason,reworkAt:new Date().toISOString()}};
  try{await replacePortalCollection('orderOverrides',next,{role:'clinic',name:actorName(user)});return json(res,200,{ok:true})}
  catch{return json(res,500,{error:'Не удалось сохранить запрос на доработку'})}
}

async function handleAuth(req,res,url){
  if(req.method==='POST'&&url.pathname==='/api/auth/logout'){try{revokeSession(req.headers['x-portal-token']);return json(res,200,{ok:true})}catch{return json(res,500,{error:'Не удалось завершить сеанс. Закройте браузер и повторите попытку'})}}
  if(req.method==='POST'&&url.pathname==='/api/auth/chief-profile'){
    const user=session(req);
    if(user?.role!=='technician')return json(res,403,{error:'Доступ запрещён'});
    let body;try{body=await readBody(req,2000000)}catch(error){return json(res,400,{error:error.message==='too_large'?'Фото слишком большое. Загрузите изображение поменьше.':'Неверные данные'})}
    try{return json(res,200,{ok:true,profile:await updateChiefAccount(body),user:publicUser(user)})}
    catch(error){
      const messages={missing_account:'Аккаунт главного техника не найден',invalid_profile:'Проверьте имя и email',duplicate_email:'Такой email уже используется',invalid_password:'Пароль должен быть от 8 символов',invalid_avatar:'Аватар должен быть изображением до 1.8 МБ'};
      return json(res,400,{error:messages[error.message]||'Не удалось сохранить профиль'});
    }
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/worker-profile'){
    const user=session(req);
    if(user?.role!=='worker')return json(res,403,{error:'Доступ запрещён'});
    let body;try{body=await readBody(req,2000000)}catch(error){return json(res,400,{error:error.message==='too_large'?'Фото слишком большое. Загрузите изображение поменьше.':'Неверные данные'})}
    const employee=portalEmployee(user.subjectId);
    if(!employee||employee.status!=='active')return json(res,403,{error:'Доступ недоступен'});
    const name=String(body.name||'').trim(),specialty=String(body.specialty||'').trim(),phone=String(body.phone||'').trim(),email=String(body.email||'').trim().toLowerCase();
    if(name.length<2||name.length>120||/[<>]/.test(name+specialty+phone)||specialty.length>120||phone.length>40||!validEmail(email))return json(res,400,{error:'Проверьте имя, почту и телефон'});
    try{
      const profile=await updateWorkerAccount({employeeId:employee.id,displayName:name,email,password:body.password||'',avatar:body.avatar||''});
      const updated={...employee,name,specialty,phone,email};
      await replacePortalCollection('employees',portalSnapshot().employees.map(item=>item.id===employee.id?updated:item));
      return json(res,200,{ok:true,employee:updated,profile,user:publicUser(user)});
    }catch(error){
      const messages={missing_account:'Аккаунт техника не найден',invalid_profile:'Проверьте имя и email',duplicate_email:'Такой email уже используется',invalid_password:'Пароль должен быть от 8 символов',invalid_avatar:'Аватар должен быть изображением до 1.8 МБ'};
      return json(res,400,{error:messages[error.message]||'Не удалось сохранить профиль'});
    }
  }
  let body;try{body=await readBody(req,12000)}catch{return json(res,400,{error:'Неверные данные'})}
  if(req.method==='POST'&&url.pathname==='/api/auth/register'){
    const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase();
    const phone=String(body.phone||'').trim(),city=String(body.city||'').trim(),address=String(body.address||'').trim();
    if(name.length<2||name.length>120||/[<>]/.test(name)||!validEmail(email)||!validPassword(body.password)||hasAccount(email))return json(res,400,{error:'Проверьте название, email и пароль (от 8 символов)'});
    if(phone&&!/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(phone)||city.length>120||address.length>250||/[<>]/.test(city+address))return json(res,400,{error:'Проверьте телефон, город и адрес'});
    const existing=portalSnapshot().clients.find(item=>item.email?.toLowerCase()===email&&!item.deleted);
    const id=existing?.id||'client-'+randomBytes(12).toString('hex');
    const client={id,originalName:id,name,email,contact:'',phone,city,address,approved:false};
    try{if(!existing)await replacePortalCollection('clients',[...portalSnapshot().clients,client]);await createAccount({email,password:body.password,role:'clinic',subjectId:id});await recordPortalEvent('',{role:'clinic',name},'clinic_registered',{clinicId:id,summary:name}).catch(()=>{});return json(res,201,{pendingApproval:true,email});}
    catch{return json(res,500,{error:'Не удалось создать кабинет'})}
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/login'){
    const account=login(body.email,body.password);
    if(!account||account.role==='worker'&&portalEmployee(account.subjectId)?.status!=='active'||account.role==='clinic'&&!portalClient(account.subjectId))return json(res,401,{error:'Неверный email или пароль'});
    if(account.role==='clinic'&&portalClient(account.subjectId).approved===false)return json(res,403,{error:'Кабинет ожидает подтверждения главным техником'});
    try{return json(res,200,{token:issueSession(account.role,account.subjectId,account.displayName||account.email),user:publicUser({role:account.role,subjectId:account.subjectId})})}
    catch{return json(res,500,{error:'Не удалось безопасно сохранить сеанс'})}
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/staff'){
    if(session(req)?.role!=='technician')return json(res,403,{error:'Доступ запрещён'});
    const employee=portalEmployee(body.employeeId);
    if(!employee||employee.status==='fired'||employee.email?.toLowerCase()!==String(body.email||'').toLowerCase())return json(res,400,{error:'Сначала сохраните техника с email'});
    try{await upsertWorkerAccount({employeeId:employee.id,email:body.email,password:body.password||''});revokeSubjectSessions('worker',employee.id)}
    catch(error){return json(res,400,{error:error.message==='password_required'?'Укажите пароль для нового техника':'Проверьте email и пароль (от 8 символов)'})}
    return json(res,200,{ok:true});
  }
  return json(res,404,{error:'Не найдено'});
}

async function saveClinicChats(){
  clinicSaveQueue=clinicSaveQueue.catch(()=>{}).then(async()=>{
    await fs.promises.mkdir(path.dirname(clinicMessagesFile),{recursive:true,mode:0o700});
    await fs.promises.writeFile(clinicMessagesFile+'.tmp',JSON.stringify(clinicChats),{mode:0o600});
    await fs.promises.rename(clinicMessagesFile+'.tmp',clinicMessagesFile);
  });
  await clinicSaveQueue;
}

async function saveClinicMessageFiles(){
  clinicMessageFilesQueue=clinicMessageFilesQueue.catch(()=>{}).then(async()=>{
    await fs.promises.mkdir(path.dirname(clinicMessageUploadMetaFile),{recursive:true,mode:0o700});
    await fs.promises.writeFile(clinicMessageUploadMetaFile+'.tmp',JSON.stringify(clinicMessageFiles),{mode:0o600});
    await fs.promises.rename(clinicMessageUploadMetaFile+'.tmp',clinicMessageUploadMetaFile);
  });
  await clinicMessageFilesQueue;
}

async function handleClinicMessageFiles(req,res,url){
  const user=session(req);if(!user)return json(res,401,{error:'Войдите в кабинет'});
  if(url.pathname==='/api/clinic-message-files'&&req.method==='POST'){
    const clinicId=user.role==='clinic'?user.subjectId:String(req.headers['x-clinic-id']||'');
    if(user.role!=='clinic'&&user.role!=='technician')return json(res,403,{error:'Доступ запрещён'});
    if(!portalClient(clinicId))return json(res,404,{error:'Клиника не найдена'});
    let name='';try{name=decodeURIComponent(String(req.headers['x-upload-name']||''))}catch{return json(res,400,{error:'Неверное имя файла'})}
    name=name.replace(/[\\/\0-\x1f]/g,'_').trim().slice(0,180);
    const ext=path.extname(name).toLowerCase();
    const allowed={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.pdf':'application/pdf','.stl':'model/stl','.ply':'application/octet-stream','.zip':'application/zip','.doc':'application/msword','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xls':'application/vnd.ms-excel','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
    if(!name||!allowed[ext])return json(res,400,{error:'Поддерживаются изображения, PDF, STL, PLY, ZIP, Word и Excel'});
    let data;try{data=await readRaw(req,20*1024*1024)}catch(error){return json(res,error.message==='too_large'?413:400,{error:error.message==='too_large'?'Файл больше 20 МБ':'Не удалось прочитать файл'})}
    if(!data.length)return json(res,400,{error:'Файл пустой'});
    const id=randomBytes(18).toString('hex'),record={id,clinicId,name,size:data.length,type:allowed[ext],uploadedAt:new Date().toISOString(),uploadedBy:actorName(user)};
    try{
      await fs.promises.mkdir(clinicMessageUploadDir,{recursive:true,mode:0o700});
      await fs.promises.writeFile(path.join(clinicMessageUploadDir,id),data,{flag:'wx',mode:0o600});
      clinicMessageFiles[id]=record;await saveClinicMessageFiles();
      return json(res,201,{attachment:{id,name,size:record.size,type:record.type}});
    }catch{return json(res,500,{error:'Не удалось сохранить файл'})}
  }
  const match=url.pathname.match(/^\/api\/clinic-message-files\/([a-f0-9]{36})$/);
  if(match&&req.method==='GET'){
    const record=clinicMessageFiles[match[1]];
    if(!record||user.role==='clinic'&&record.clinicId!==user.subjectId||!['clinic','technician'].includes(user.role))return json(res,404,{error:'Файл не найден'});
    try{const data=await fs.promises.readFile(path.join(clinicMessageUploadDir,record.id));res.writeHead(200,{'Content-Type':record.type,'Content-Length':data.length,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(record.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(data)}catch{return json(res,404,{error:'Файл не найден'})}
  }
  return json(res,404,{error:'Не найдено'});
}

async function handleClinicMessages(req,res,url){
  const user=session(req);
  if(!user)return json(res,401,{error:'Войдите в кабинет'});
  if(url.pathname==='/api/clinic-messages'&&user.role==='clinic'){
    if(req.method==='GET')return json(res,200,{messages:clinicChats[user.subjectId]?.messages||[]});
    if(req.method==='POST')return addClinicMessage(req,res,user.subjectId,'client');
  }
  if(user.role!=='technician')return json(res,403,{error:'Доступ запрещён'});
  if(req.method==='GET'&&url.pathname==='/api/chief/conversations'){
    const conversations=Object.entries(clinicChats).filter(([id])=>portalClient(id)).map(([id,chat])=>{const clinic=portalClient(id),last=chat.messages.at(-1);return {id,name:clinic.name,logo:clinic.logo||'',lastMessage:last?.text||(last?.attachment?`📎 ${last.attachment.name}`:''),updatedAt:chat.updatedAt}}).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    return json(res,200,{conversations});
  }
  const match=url.pathname.match(/^\/api\/chief\/conversations\/([A-Za-z0-9_-]+)(?:\/reply)?$/);
  if(!match||!portalClient(match[1]))return json(res,404,{error:'Диалог не найден'});
  if(req.method==='GET'&&!url.pathname.endsWith('/reply'))return json(res,200,{messages:clinicChats[match[1]]?.messages||[]});
  if(req.method==='POST'&&url.pathname.endsWith('/reply')&&clinicChats[match[1]])return addClinicMessage(req,res,match[1],'support');
  return json(res,404,{error:'Не найдено'});
}

async function addClinicMessage(req,res,id,from){
  let body;try{body=await readBody(req,220000)}catch{return json(res,400,{error:'Неверное сообщение'})}
  const message=String(body.text||'').trim();
  const requested=body.attachment&&typeof body.attachment==='object'?body.attachment:null;
  const stored=requested&&clinicMessageFiles[String(requested.id||'')];
  if(requested&&(!stored||stored.clinicId!==id))return json(res,400,{error:'Не удалось найти прикреплённый файл'});
  if(!message&&!stored||message.length>2000)return json(res,400,{error:'Добавьте текст или файл'});
  const preview=stored&&typeof requested.preview==='string'&&requested.preview.length<=180000&&/^data:image\/(?:jpeg|png|webp);base64,/i.test(requested.preview)?requested.preview:'';
  const attachment=stored?{id:stored.id,name:stored.name,size:stored.size,type:stored.type,preview}:null;
  const entry={id:randomBytes(12).toString('hex'),from,text:message,time:new Date().toISOString(),...(attachment?{attachment}:{})};
  const chat=clinicChats[id]||={messages:[],updatedAt:''};
  chat.messages.push(entry);chat.updatedAt=entry.time;
  try{await saveClinicChats()}catch{return json(res,500,{error:'Не удалось сохранить сообщение'})}
  await recordPortalEvent('',{role:from==='client'?'clinic':'technician',name:from==='client'?(portalClient(id)?.name||'Клиника'):'Главный техник'},from==='client'?'message_received':'message_replied',{clinicId:id,summary:from==='client'?'Новое сообщение от клиники':'Лаборатория ответила на сообщение'}).catch(()=>{});
  return json(res,201,{message:entry});
}

async function handleLocations(req,res,url){
  if(req.method!=='GET')return json(res,405,{error:'Метод не поддерживается'});
  const kind=url.searchParams.get('kind'),q=String(url.searchParams.get('q')||'').trim(),city=String(url.searchParams.get('city')||'').trim();
  if(!['city','address'].includes(kind)||q.length<2||q.length>100||city.length>100)return json(res,400,{error:'Проверьте запрос'});
  const key=JSON.stringify([kind,q,city]);
  const cached=locationCache.get(key);
  if(cached&&Date.now()-cached.time<600000)return json(res,200,{items:cached.items});
  const params=new URLSearchParams({q:kind==='address'&&city?q+' '+city:q,countrycode:'RU',limit:'7'});
  if(kind==='city')params.set('layer','city');
  try{
    const response=await fetch('https://photon.komoot.io/api/?'+params,{signal:AbortSignal.timeout(4500)});
    if(!response.ok)throw new Error('service_unavailable');
    const result=await response.json();
    const items=[...new Set((result.features||[]).map(feature=>{
      const p=feature.properties||{};
      if(kind==='city')return p.name||p.city||'';
      const street=p.street||p.name||'',number=p.housenumber||'',place=p.city||p.town||p.village||city;
      return [street,number,place].filter(Boolean).join(', ');
    }).filter(Boolean))].slice(0,7);
    if(locationCache.size>300)locationCache.clear();
    locationCache.set(key,{time:Date.now(),items});
    return json(res,200,{items});
  }catch{return json(res,503,{error:'Подсказки временно недоступны'})}
}

function saveChats() {
  saveQueue = saveQueue.then(async () => {
    await fs.promises.mkdir(path.dirname(chatFile), {recursive:true, mode:0o700});
    const temporary = chatFile + '.tmp';
    await fs.promises.writeFile(temporary, JSON.stringify(chats), {mode:0o600});
    await fs.promises.rename(temporary, chatFile);
  });
  return saveQueue;
}

async function handleChat(req, res, url) {
  const operatorRoute = url.pathname.startsWith('/api/support/');
  if (operatorRoute && !isOperator(req)) return json(res, supportToken ? 401 : 503, {error:supportToken ? 'Требуется ключ оператора' : 'Панель оператора не настроена'});

  if (req.method === 'GET' && url.pathname === '/api/chat') {
    const id = url.searchParams.get('conversation') || '';
    if (!conversationIdPattern.test(id)) return json(res, 400, {error:'Неверный идентификатор чата'});
    return json(res, 200, {messages:chats[id]?.messages || []});
  }
  if (req.method === 'GET' && url.pathname === '/api/support/conversations') {
    const list = Object.entries(chats).map(([id, chat]) => ({
      id, updatedAt:chat.updatedAt, lastMessage:chat.messages.at(-1)?.text || '',
      unread:chat.messages.filter(message => message.from === 'client').length
    })).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
    return json(res, 200, {conversations:list});
  }
  if (req.method === 'GET' && url.pathname === '/api/support/messages') {
    const id = url.searchParams.get('conversation') || '';
    if (!conversationIdPattern.test(id)) return json(res, 400, {error:'Неверный идентификатор чата'});
    return json(res, 200, {messages:chats[id]?.messages || []});
  }
  if (req.method === 'POST' && (url.pathname === '/api/chat' || url.pathname === '/api/support/reply')) {
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, {error:'Неверное сообщение'}); }
    const id = String(body.conversation || '');
    const message = String(body.text || '').trim();
    if (!conversationIdPattern.test(id) || !message || message.length > 2000) return json(res, 400, {error:'Сообщение должно содержать от 1 до 2000 символов'});
    const operator = url.pathname === '/api/support/reply';
    if (operator && !chats[id]) return json(res, 404, {error:'Диалог не найден'});
    const chat = chats[id] ||= {messages:[],updatedAt:''};
    const entry = {id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,from:operator?'support':'client',text:message,time:new Date().toISOString()};
    chat.messages.push(entry);
    chat.updatedAt = entry.time;
    try { await saveChats(); } catch { return json(res, 500, {error:'Не удалось сохранить сообщение'}); }
    return json(res, 201, {message:entry});
  }
  return json(res, 404, {error:'Не найдено'});
}

function serveFile(req, res, pathname) {
  let file;
  const appRoute=/^\/(?:login|register|forgot-password|(?:clinic|technician|worker)(?:\/[A-Za-z0-9_-]+){0,2})\/?$/.test(pathname);
  if (pathname==='/favicon.ico') {
    file = path.join(root, 'public', 'assets', 'favicon.ico');
  } else if (publicFiles.has(pathname)||appRoute) {
    file = path.join(root, appRoute||pathname==='/' ? 'index.html' : pathname);
  } else if (pathname.startsWith('/assets/')) {
    file = path.resolve(root, 'public', '.' + pathname);
    if (!file.startsWith(path.join(root, 'public', 'assets') + path.sep)) return json(res, 403, {error:'Доступ запрещён'});
  } else {
    return json(res, 404, {error:'Не найдено'});
  }
  fs.readFile(file, (error, data) => {
    if (error) return json(res, 404, {error:'Не найдено'});
    const isAsset=pathname.startsWith('/assets/');
    const isVersionedCode=/\.(?:js|css)$/.test(pathname)&&/[?&]v=[A-Za-z0-9._-]+/.test(req.url||'');
    const cacheControl=isAsset?'public, max-age=2592000':isVersionedCode?'public, max-age=31536000, immutable':'no-store';
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':cacheControl,'X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

const requestHandler=async (req,res) => {
  secureHeaders(req,res);
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); } catch { return json(res, 400, {error:'Неверный адрес'}); }
  const isSecure=Boolean(req.socket.encrypted)||req.headers['x-forwarded-proto']==='https';
  if(httpsRedirect&&!isSecure){const requestHost=String(req.headers.host||'').replace(/[^A-Za-z0-9.:[\]-]/g,'');if(!requestHost)return json(res,400,{error:'Неверный адрес'});res.writeHead(308,{Location:`https://${requestHost}${req.url||'/'}`,'Cache-Control':'no-store'});return res.end()}
  if(url.pathname.startsWith('/api/auth/'))return handleAuth(req,res,url);
  if(url.pathname==='/api/clinic-message-files'||url.pathname.startsWith('/api/clinic-message-files/')){
    try{return await handleClinicMessageFiles(req,res,url)}catch{return json(res,500,{error:'Ошибка файла сообщения'})}
  }
  if(url.pathname.startsWith('/api/orders/')&&(url.pathname.endsWith('/files')||url.pathname.endsWith('/rework'))){
    try{return url.pathname.endsWith('/rework')?await handleOrderRework(req,res,url):await handleOrderFiles(req,res,url)}catch{return json(res,500,{error:'Ошибка обработки заказа'})}
  }
  if(url.pathname==='/api/notifications')return handleNotifications(req,res);
  if(url.pathname.startsWith('/api/order-files/')){try{return await handleOrderFiles(req,res,url)}catch{return json(res,500,{error:'Ошибка чтения файла'})}}
  if(url.pathname==='/api/locations')return handleLocations(req,res,url);
  if(url.pathname==='/api/clinic-messages'||url.pathname.startsWith('/api/chief/conversations')){
    try{return await handleClinicMessages(req,res,url)}catch{return json(res,500,{error:'Ошибка сообщений'})}
  }
  if(url.pathname==='/api/portal'||url.pathname.startsWith('/api/portal/'))return handlePortal(req,res,url);
  if (url.pathname.startsWith('/api/')) {
    try { return await handleChat(req,res,url); } catch { return json(res, 500, {error:'Ошибка сервера'}); }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, {error:'Метод не поддерживается'});
  return serveFile(req,res,url.pathname);
};
if(Boolean(tlsKeyFile)!==Boolean(tlsCertFile))throw new Error('Set both TLS_KEY_FILE and TLS_CERT_FILE to enable HTTPS');
const server=tlsKeyFile&&tlsCertFile?https.createServer({key:fs.readFileSync(tlsKeyFile),cert:fs.readFileSync(tlsCertFile)},requestHandler):http.createServer(requestHandler);
await fs.promises.mkdir(path.join(root,'.data'),{recursive:true,mode:0o700});
await fs.promises.chmod(path.join(root,'.data'),0o700);
await fs.promises.mkdir(uploadDir,{recursive:true,mode:0o700});
await fs.promises.chmod(uploadDir,0o700);
await fs.promises.mkdir(clinicMessageUploadDir,{recursive:true,mode:0o700});
await fs.promises.chmod(clinicMessageUploadDir,0o700);
server.listen(port,host,()=>{
  console.log(`Create Dental: ${tlsKeyFile?'https':'http'}://${host}:${port}`);
  const backup=async()=>{try{const saved=await createDataBackup();console.log(`Data backup created: ${path.basename(saved)}`)}catch(error){console.error('Data backup failed:',error.message)}};
  void backup();
  const backupTimer=setInterval(backup,24*60*60*1000);backupTimer.unref();
});
