import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual,randomBytes,createHash } from 'node:crypto';
import {createDataBackup} from './backup-data.js';
import {portalSnapshot,replacePortalCollection,recordPortalEvent,portalClient,portalEmployee} from './portal-data.js';
import {validEmail,validPassword,hasAccount,createAccount,upsertWorkerAccount,updateChiefAccount,chiefAccountProfile,workerAccountProfile,updateWorkerAccount,login,issueSession,sessionFor,revokeSession,revokeSubjectSessions} from './auth-data.js';
import {createTelegramBridge} from './telegram-bot.js';
import {createDiskUpload,diskMetadata,diskDownloadUrl,deleteDiskResource,ensureDiskFolder,moveDiskResource,copyDiskResource} from './yandex-disk-storage.js';

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
const integrationSecretFiles={
  telegramBotToken:process.env.TELEGRAM_BOT_TOKEN_FILE||path.join(root,'.data','telegram-bot-token'),
  speechKitKey:process.env.YANDEX_SPEECHKIT_API_KEY_FILE||path.join(root,'.data','yandex-speechkit-api-key'),
  yandexGptKey:process.env.YANDEX_GPT_API_KEY_FILE||path.join(root,'.data','yandex-gpt-api-key'),
  folderId:process.env.YANDEX_FOLDER_ID_FILE||path.join(root,'.data','yandex-folder-id'),
  yandexDiskToken:process.env.YANDEX_DISK_TOKEN_FILE||path.join(root,'.data','yandex-disk-token')
};
const tlsKeyFile=process.env.TLS_KEY_FILE||'';
const tlsCertFile=process.env.TLS_CERT_FILE||'';
const httpsRedirect=process.env.HTTPS_REDIRECT==='1';
const publicFiles = new Set(['/','/index.html','/app.js','/work-catalog.js','/technician.js','/worker.js','/seed-orders.js','/portal-client.js','/routes.js','/location-assist.js','/notification-center.js','/styles.css','/support.html','/support.js','/large-upload.html','/large-upload.js','/yandex_a7db0249ed96373e.html']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon'};
const sharedAttachmentTypes={
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.pdf':'application/pdf','.stl':'model/stl','.ply':'application/octet-stream',
  '.zip':'application/zip','.rar':'application/vnd.rar','.7z':'application/x-7z-compressed','.doc':'application/msword','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls':'application/vnd.ms-excel','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.txt':'text/plain','.rtf':'application/rtf'
};
const maximumAttachmentSize=200*1024*1024;
const maximumLargeUploadFiles=10;
const uploadSessionLifetime=2*60*60*1000;
const diskUploadSessions=new Map();
const largeUploadLinks=new Map();
function validAttachmentSignature(ext,data){
  if(!Buffer.isBuffer(data)||!data.length)return false;
  const ascii=data.subarray(0,16).toString('ascii'),hex=data.subarray(0,12).toString('hex');
  if(['.jpg','.jpeg'].includes(ext))return hex.startsWith('ffd8ff');
  if(ext==='.png')return hex.startsWith('89504e470d0a1a0a');
  if(ext==='.webp')return ascii.startsWith('RIFF')&&data.subarray(8,12).toString('ascii')==='WEBP';
  if(ext==='.pdf')return ascii.startsWith('%PDF-');
  if(ext==='.zip')return ascii.startsWith('PK');
  if(ext==='.docx')return ascii.startsWith('PK')&&data.includes(Buffer.from('[Content_Types].xml'))&&data.includes(Buffer.from('word/'));
  if(ext==='.xlsx')return ascii.startsWith('PK')&&data.includes(Buffer.from('[Content_Types].xml'))&&data.includes(Buffer.from('xl/'));
  if(ext==='.rar')return ascii.startsWith('Rar!');
  if(ext==='.7z')return hex.startsWith('377abcaf271c');
  if(['.doc','.xls'].includes(ext))return hex.startsWith('d0cf11e0a1b11ae1');
  if(ext==='.rtf')return ascii.startsWith('{\\rtf');
  if(ext==='.ply')return ascii.toLowerCase().startsWith('ply');
  if(ext==='.txt')return !data.subarray(0,4096).includes(0);
  if(ext==='.stl'){
    if(ascii.trimStart().toLowerCase().startsWith('solid'))return data.subarray(0,4096).toString('ascii').toLowerCase().includes('facet');
    if(data.length<84)return false;
    const triangles=data.readUInt32LE(80);
    return triangles<=10000000&&84+triangles*50===data.length;
  }
  return false;
}
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
let telegramBridge=null;
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
    try {
      await replacePortalCollection(key,value,{role:user.role,name:actorName(user)});
      if(key==='employees')for(const employee of value)if(employee.status!=='active')revokeSubjectSessions('worker',employee.id);
      if(key==='orders'){
        const beforeById=new Map(snapshot.orders.map(order=>[order.id,order]));
        for(const order of value){const before=beforeById.get(order.id);if(before&&before.date!==order.date)void telegramBridge?.sendAutomatedMessage(order.clinicId,`Заказ ${order.id}\nНовый срок сдачи: ${order.date}`).catch(error=>console.error('Telegram deadline notification failed:',error.message))}
      }
      if(key==='orderOverrides')for(const [id,detail] of Object.entries(value)){
        const before=snapshot.orderOverrides[id]||{};
        if(detail?.stage&&detail.stage!==before.stage){const order=snapshot.orders.find(item=>item.id===id);if(order)void telegramBridge?.notifyOrderStage(order,detail.stage).catch(error=>console.error('Telegram status notification failed:',error.message))}
      }
      return json(res,200,{ok:true})
    }
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
function readIntegrationSecret(name){
  const environmentNames={yandexDiskToken:'YANDEX_DISK_TOKEN'};
  const environment=environmentNames[name]&&String(process.env[environmentNames[name]]||'').trim();
  if(environment)return environment;
  try{return fs.readFileSync(integrationSecretFiles[name],'utf8').trim()}catch(error){if(error.code==='ENOENT')return '';throw error}
}
function cleanUploadName(value){
  return String(value||'').replace(/[\\/\0-\x1f]/g,'_').trim().slice(0,180);
}
function safeDiskSegment(value){
  return String(value||'unknown').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'unknown';
}
function validateUploadDescription({name,size,type,purpose='order-file'}){
  const safeName=cleanUploadName(name),ext=path.extname(safeName).toLowerCase(),storedType=sharedAttachmentTypes[ext],bytes=Number(size);
  if(!safeName||!storedType)throw new Error('Формат файла не поддерживается');
  if(!Number.isSafeInteger(bytes)||bytes<1)throw new Error('Файл пустой');
  if(bytes>maximumAttachmentSize)throw new Error('Файл больше 200 МБ');
  if(!['order-file','result-photo','message-file'].includes(purpose))throw new Error('Неизвестный тип файла');
  return {name:safeName,size:bytes,type:storedType,ext,purpose};
}
function uploadOwner(user){return `${user.role}:${user.subjectId}`}
function newDiskPath({orderId,name}){
  if(!orderId)throw new Error('Для загрузки на Яндекс Диск нужен ID заказа');
  const day=new Date().toISOString().slice(0,10),unique=randomBytes(8).toString('hex');
  return `/Клиенты/${safeDiskSegment(orderId)}/${day}-${unique}-${name}`;
}
function publicUploadRecord(record){
  const {diskPath,storage,clinicId,...visible}=record;
  return visible;
}
async function signedDiskRecordUrl(record){
  if(record?.storage!=='yandex-disk'||!record.diskPath)return '';
  return diskDownloadUrl(readIntegrationSecret('yandexDiskToken'),record.diskPath);
}
async function completeDiskUpload(item,uploadedBy){
  const token=readIntegrationSecret('yandexDiskToken');
  if(!token)throw new Error('Яндекс Диск не подключён');
  const metadata=await diskMetadata(token,item.diskPath);
  if(Number(metadata.size)!==item.size)throw new Error('Размер загруженного файла не совпадает');
  const id=randomBytes(18).toString('hex'),uploadedAt=new Date().toISOString();
  if(item.target==='message'){
    const record={id,clinicId:item.clinicId,name:item.name,size:item.size,type:item.type,uploadedAt,uploadedBy,storage:'yandex-disk',diskPath:item.diskPath};
    clinicMessageFiles[id]=record;await saveClinicMessageFiles();
    return {target:'message',attachment:publicUploadRecord(record)};
  }
  const order=portalSnapshot().orders.find(order=>order.id===item.orderId&&order.clinicId===item.clinicId);
  if(!order)throw new Error('Заказ не найден');
  const record={id,name:item.name,size:item.size,type:item.type,uploadedAt,uploadedBy,purpose:item.purpose,storage:'yandex-disk',diskPath:item.diskPath};
  orderFiles[item.orderId]=[...(orderFiles[item.orderId]||[]),record];await persistOrderFiles();
  await recordPortalEvent(item.orderId,{role:item.actorRole,name:uploadedBy},'file_uploaded',{summary:item.purpose==='result-photo'?'Добавлено фото готовой работы':'Добавлен файл к заказу',fileName:item.name,purpose:item.purpose,clinicId:item.clinicId}).catch(()=>{});
  if(item.purpose==='result-photo')void telegramBridge?.sendAutomatedMessage(item.clinicId,`К заказу ${item.orderId} добавлено фото готовой работы.`).catch(error=>console.error('Telegram file notification failed:',error.message));
  return {target:'order',file:publicUploadRecord(record)};
}
async function beginDiskUpload(item){
  const token=readIntegrationSecret('yandexDiskToken');
  if(!token||item.target==='message')return {mode:'local'};
  const diskPath=newDiskPath(item),upload=await createDiskUpload(token,diskPath),id=randomBytes(18).toString('hex');
  diskUploadSessions.set(id,{...item,id,diskPath,createdAt:Date.now(),expiresAt:Date.now()+uploadSessionLifetime});
  return {mode:'direct',uploadId:id,href:upload.href,method:upload.method,expiresAt:new Date(Date.now()+uploadSessionLifetime).toISOString()};
}
async function handleUploads(req,res,url){
  const user=session(req);if(!user)return json(res,401,{error:'Войдите в кабинет'});
  if(req.method==='POST'&&url.pathname==='/api/uploads/init'){
    let body;try{body=await readBody(req,12000)}catch{return json(res,400,{error:'Неверные данные файла'})}
    let description;try{description=validateUploadDescription({name:body.name,size:body.size,type:body.type,purpose:body.purpose||(body.target==='message'?'message-file':'order-file')})}catch(error){return json(res,error.message.includes('200 МБ')?413:400,{error:error.message})}
    const target=body.target==='message'?'message':'order';
    if(target==='order'){
      const order=portalSnapshot().orders.find(item=>item.id===String(body.orderId||''));
      if(!canAccessOrder(user,order))return json(res,404,{error:'Заказ не найден'});
      if(description.purpose==='result-photo'&&(user.role==='clinic'||!['.jpg','.jpeg','.png'].includes(description.ext)))return json(res,403,{error:'Фото результата может добавить только лаборатория в формате JPG или PNG'});
      if(description.purpose==='result-photo'&&user.role==='worker'&&portalSnapshot().orderOverrides[order.id]?.stage!=='Контроль качества')return json(res,409,{error:'Фото результата можно добавить на этапе контроля качества'});
      try{return json(res,200,await beginDiskUpload({...description,target,orderId:order.id,clinicId:order.clinicId,owner:uploadOwner(user),actorRole:user.role}))}catch(error){console.error('Yandex Disk upload init failed:',error.message);return json(res,502,{error:'Не удалось подготовить загрузку на Яндекс Диск'})}
    }
    const clinicId=user.role==='clinic'?user.subjectId:String(body.clinicId||'');
    if(!['clinic','technician'].includes(user.role)||!portalClient(clinicId))return json(res,404,{error:'Клиника не найдена'});
    try{return json(res,200,await beginDiskUpload({...description,target,clinicId,owner:uploadOwner(user),actorRole:user.role}))}catch(error){console.error('Yandex Disk message upload init failed:',error.message);return json(res,502,{error:'Не удалось подготовить загрузку на Яндекс Диск'})}
  }
  const match=url.pathname.match(/^\/api\/uploads\/([a-f0-9]{36})\/complete$/);
  if(match&&req.method==='POST'){
    const item=diskUploadSessions.get(match[1]);
    if(!item||item.expiresAt<Date.now()||item.owner!==uploadOwner(user))return json(res,404,{error:'Ссылка загрузки истекла'});
    if(item.target==='order'&&!canAccessOrder(user,portalSnapshot().orders.find(order=>order.id===item.orderId)))return json(res,404,{error:'Заказ не найден'});
    if(item.completing)return json(res,409,{error:'Загрузка уже обрабатывается'});item.completing=true;
    try{const result=await completeDiskUpload(item,actorName(user));diskUploadSessions.delete(item.id);return json(res,201,result)}
    catch(error){item.completing=false;console.error('Yandex Disk upload completion failed:',error.message);return json(res,400,{error:error.message||'Не удалось подтвердить загрузку'})}
  }
  return json(res,404,{error:'Не найдено'});
}
function largeLinkKey(token){return createHash('sha256').update(String(token)).digest('hex')}
function createLargeUploadLink(clinicId,orderId,requestedBy='Клиент Telegram'){
  if(!readIntegrationSecret('yandexDiskToken'))throw new Error('Яндекс Диск ещё не подключён в профиле главного техника');
  const order=portalSnapshot().orders.find(item=>item.id===orderId&&item.clinicId===clinicId);
  if(!order)throw new Error('Заказ не найден');
  const token=randomBytes(32).toString('base64url'),key=largeLinkKey(token);
  largeUploadLinks.set(key,{key,clinicId,orderId,requestedBy:String(requestedBy).slice(0,120),createdAt:Date.now(),expiresAt:Date.now()+uploadSessionLifetime,usedAt:0,startedCount:0,completedCount:0});
  const base=String(process.env.PUBLIC_BASE_URL||'https://createdental.io').replace(/\/$/,'');
  return `${base}/large-upload.html?token=${encodeURIComponent(token)}`;
}
async function handleLargeUpload(req,res,url){
  const match=url.pathname.match(/^\/api\/large-upload\/([A-Za-z0-9_-]{30,80})(?:\/(init|complete|finish)(?:\/([a-f0-9]{36}))?)?$/);
  if(!match)return json(res,404,{error:'Ссылка не найдена'});
  const token=match[1],action=match[2]||'',uploadId=match[3]||'',link=largeUploadLinks.get(largeLinkKey(token));
  if(!link||link.expiresAt<Date.now()||link.usedAt)return json(res,410,{error:'Ссылка истекла или уже использована'});
  const order=portalSnapshot().orders.find(item=>item.id===link.orderId&&item.clinicId===link.clinicId),clinic=portalClient(link.clinicId);
  if(!order||!clinic)return json(res,404,{error:'Заказ не найден'});
  if(req.method==='GET'&&!action)return json(res,200,{clinic:clinic.name,orderId:order.id,patient:order.patient,work:order.work,date:order.date,maxSize:maximumAttachmentSize,maxFiles:maximumLargeUploadFiles,uploadedFiles:link.completedCount||0,expiresAt:new Date(link.expiresAt).toISOString()});
  if(req.method==='POST'&&action==='init'){
    if((link.startedCount||0)>=maximumLargeUploadFiles)return json(res,409,{error:`По одной ссылке можно загрузить не больше ${maximumLargeUploadFiles} файлов`});
    let body;try{body=await readBody(req,12000)}catch{return json(res,400,{error:'Неверные данные файла'})}
    let description;try{description=validateUploadDescription({name:body.name,size:body.size,type:body.type,purpose:'order-file'})}catch(error){return json(res,error.message.includes('200 МБ')?413:400,{error:error.message})}
    link.startedCount=(link.startedCount||0)+1;
    try{return json(res,200,await beginDiskUpload({...description,target:'order',orderId:order.id,clinicId:clinic.id,owner:`large:${link.key}`,actorRole:'clinic',largeLinkKey:link.key}))}
    catch(error){link.startedCount=Math.max(0,(link.startedCount||1)-1);console.error('Large upload init failed:',error.message);return json(res,502,{error:'Не удалось подготовить загрузку на Яндекс Диск'})}
  }
  if(req.method==='POST'&&action==='complete'&&uploadId){
    const item=diskUploadSessions.get(uploadId);
    if(!item||item.expiresAt<Date.now()||item.owner!==`large:${link.key}`||item.largeLinkKey!==link.key)return json(res,404,{error:'Загрузка не найдена или истекла'});
    if(item.completing)return json(res,409,{error:'Загрузка уже обрабатывается'});item.completing=true;
    try{
      const result=await completeDiskUpload(item,`Telegram · ${link.requestedBy}`);
      diskUploadSessions.delete(item.id);link.completedCount=(link.completedCount||0)+1;
      return json(res,201,{ok:true,file:result.file,orderId:order.id});
    }catch(error){item.completing=false;console.error('Large upload completion failed:',error.message);return json(res,400,{error:error.message||'Не удалось подтвердить загрузку'})}
  }
  if(req.method==='POST'&&action==='finish'){
    const completed=Math.min(maximumLargeUploadFiles,Number(link.completedCount)||0);
    if(!completed)return json(res,409,{error:'Сначала загрузите хотя бы один файл'});
    link.usedAt=Date.now();
    void telegramBridge?.sendAutomatedMessage(clinic.id,`К заказу ${order.id} добавлено файлов: ${completed}.`).catch(error=>console.error('Telegram upload confirmation failed:',error.message));
    return json(res,201,{ok:true,files:completed,orderId:order.id});
  }
  return json(res,405,{error:'Метод не поддерживается'});
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
    const allowed=sharedAttachmentTypes;
    if(!name||!allowed[ext])return json(res,400,{error:'Формат файла не поддерживается'});
    const type=String(req.headers['content-type']||'').split(';')[0].toLowerCase();
    if(type&&type!=='application/octet-stream'&&type!==allowed[ext])return json(res,400,{error:'Тип файла не совпадает с расширением'});
    let data;try{data=await readRaw(req,maximumAttachmentSize)}catch(error){return json(res,error.message==='too_large'?413:400,{error:error.message==='too_large'?'Файл больше 200 МБ':'Не удалось прочитать файл'})}
    if(!data.length)return json(res,400,{error:'Файл пустой'});
    if(!validAttachmentSignature(ext,data))return json(res,400,{error:'Содержимое файла не соответствует его формату'});
    const id=randomBytes(18).toString('hex');
    try{
      await fs.promises.mkdir(uploadDir,{recursive:true,mode:0o700});
      await fs.promises.writeFile(path.join(uploadDir,id),data,{flag:'wx',mode:0o600});
      const record={id,name,size:data.length,type:allowed[ext],uploadedAt:new Date().toISOString(),uploadedBy:actorName(user),purpose};
      orderFiles[orderId]=[...(orderFiles[orderId]||[]),record];await persistOrderFiles();
      await recordPortalEvent(orderId,{role:user.role,name:actorName(user)},'file_uploaded',{summary:purpose==='result-photo'?'Добавлено фото готовой работы':'Добавлен файл к заказу',fileName:name,purpose,clinicId:order.clinicId}).catch(()=>{});
      if(purpose==='result-photo')void telegramBridge?.sendAutomatedMessage(order.clinicId,`К заказу ${order.id} добавлено фото готовой работы.`).catch(error=>console.error('Telegram file notification failed:',error.message));
      return json(res,201,{file:record});
    }catch{return json(res,500,{error:'Не удалось сохранить файл'})}
  }
  const match=url.pathname.match(/^\/api\/order-files\/([a-f0-9]{36})$/);
  if(match&&req.method==='GET'){
    const record=Object.entries(orderFiles).flatMap(([id,files])=>files.filter(file=>file.id===match[1]).map(file=>({orderId:id,file})))[0];
    if(!record||!canAccessOrder(user,portalSnapshot().orders.find(item=>item.id===record.orderId)))return json(res,404,{error:'Файл не найден'});
    if(record.file.storage==='yandex-disk'){
      try{const href=await signedDiskRecordUrl(record.file);if(url.searchParams.get('link')==='1')return json(res,200,{url:href,name:record.file.name,type:record.file.type});res.writeHead(302,{Location:href,'Cache-Control':'private, no-store'});return res.end()}
      catch{return json(res,404,{error:'Файл не найден на Яндекс Диске'})}
    }
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
      if(user.role==='technician')return event.action==='message_received'||event.action==='clinic_registered'||event.action==='telegram_binding_requested'||event.action==='order_created'||event.action==='stage_changed'&&event.to==='Контроль качества';
      return (event.clinicId===user.subjectId||accessible.has(event.orderId))&&!(event.action==='stage_changed'&&event.to==='На доработке');
    });
    const readAt=notificationReads[key]||'';
    const describe=event=>{
      const order=snapshot.orders.find(item=>item.id===event.orderId),clinic=portalClient(event.clinicId||order?.clinicId);
      if(event.action==='clinic_registered')return `Новая регистрация: ${event.summary||event.actor||'клиника'}`;
      if(event.action==='message_received')return `Новое сообщение от ${event.actor||clinic?.name||'клиники'}`;
      if(event.action==='telegram_binding_requested')return `Запрос на подключение Telegram: ${event.summary||clinic?.name||'клиника'}`;
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
      if(event.action==='telegram_binding_requested')return {type:'registration',target:'profile',clinicId:event.clinicId||''};
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

async function writeIntegrationSecret(file,value){
  await fs.promises.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=file+'.tmp-'+randomBytes(5).toString('hex');
  await fs.promises.writeFile(temporary,value,{mode:0o600});
  await fs.promises.rename(temporary,file);
  await fs.promises.chmod(file,0o600);
}

function validIntegrationSecret(name,value){
  if(typeof value!=='string'||!value||value.length>500||/\s/.test(value))return false;
  if(name==='telegramBotToken')return /^\d{6,15}:[A-Za-z0-9_-]{20,}$/.test(value);
  if(name==='folderId')return /^[a-z0-9]{10,50}$/.test(value);
  if(name==='yandexDiskToken')return value.length>=20;
  return value.length>=20;
}

function combinedIntegrationStatus(){
  const status=telegramBridge?.status()||{telegramBot:false,speechKit:false,yandexGpt:false,folderId:false,ready:false,enabled:false};
  return {...status,yandexDisk:Boolean(readIntegrationSecret('yandexDiskToken'))};
}

async function handleTelegramIntegration(req,res){
  const user=session(req);
  if(user?.role!=='technician')return json(res,403,{error:'Доступ запрещён'});
  if(req.method==='GET')return json(res,200,{status:combinedIntegrationStatus()});
  if(req.method!=='POST')return json(res,405,{error:'Метод не поддерживается'});
  const secure=Boolean(req.socket.encrypted)||req.headers['x-forwarded-proto']==='https';
  const local=/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(String(req.headers.host||''));
  if(!secure&&!local)return json(res,400,{error:'Откройте кабинет по HTTPS, чтобы сохранить ключи безопасно'});
  let body;try{body=await readBody(req,12000)}catch{return json(res,400,{error:'Не удалось прочитать настройки'})}
  if(body.action){
    try{
      if(body.action==='approve-binding')await telegramBridge.approveBinding(String(body.requestId||''),actorName(user));
      else if(body.action==='reject-binding')await telegramBridge.rejectBinding(String(body.requestId||''));
      else if(body.action==='unbind')await telegramBridge.unbindClinic(String(body.clinicId||''));
      else return json(res,400,{error:'Неизвестное действие'});
      return json(res,200,{ok:true,status:combinedIntegrationStatus()});
    }catch(error){return json(res,400,{error:String(error.message||'Не удалось выполнить действие')})}
  }
  const supplied=Object.entries(integrationSecretFiles).filter(([name])=>typeof body[name]==='string'&&body[name].trim());
  if(!supplied.length)return json(res,400,{error:'Введите хотя бы одно новое значение'});
  for(const [name] of supplied)if(!validIntegrationSecret(name,body[name].trim()))return json(res,400,{error:name==='telegramBotToken'?'Проверьте токен Telegram-бота':name==='folderId'?'Проверьте ID каталога Yandex Cloud':name==='yandexDiskToken'?'Проверьте OAuth-токен Яндекс Диска':'Проверьте API-ключ Yandex Cloud'});
  try{
    const diskEntry=supplied.find(([name])=>name==='yandexDiskToken');
    if(diskEntry)await ensureDiskFolder(body.yandexDiskToken.trim(),'/Клиенты');
    for(const [name,file] of supplied)await writeIntegrationSecret(file,body[name].trim());
    await telegramBridge.reloadSecrets();
    return json(res,200,{ok:true,status:combinedIntegrationStatus()});
  }catch(error){console.error('Integration settings failed:',error.message);return json(res,500,{error:String(error.message||'').toLowerCase().includes('диск')||supplied.some(([name])=>name==='yandexDiskToken')?'Не удалось подключить Яндекс Диск. Проверьте OAuth-токен и права чтения/записи':'Не удалось сохранить настройки интеграции'})}
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

async function saveTelegramAttachment(clinicId,{name,type,data,previewData,kind='document',orderEligible=false,sender=''}){
  if(!portalClient(clinicId))throw new Error('clinic_not_found');
  if(!Buffer.isBuffer(data)||!data.length)throw new Error('Файл пустой');
  if(data.length>20*1024*1024)throw new Error('Файл больше 20 МБ. Используйте кнопку «Файл до 200 МБ»');
  const safeName=String(name||'telegram-file').replace(/[\\/\0-\x1f]/g,'_').trim().slice(0,180);
  const ext=path.extname(safeName).toLowerCase(),storedType=sharedAttachmentTypes[ext];
  if(!safeName||!storedType)throw new Error('Формат файла не поддерживается');
  if(!validAttachmentSignature(ext,data))throw new Error('Содержимое файла не соответствует его формату');
  const clinicFiles=Object.values(clinicMessageFiles).filter(file=>file.clinicId===clinicId);
  const usedBytes=clinicFiles.reduce((total,file)=>total+(Number(file.size)||0),0);
  if(clinicFiles.length>=1000||usedBytes+data.length>2*1024*1024*1024)throw new Error('Достигнут лимит файлов клиники');
  const id=randomBytes(18).toString('hex');
  await fs.promises.mkdir(clinicMessageUploadDir,{recursive:true,mode:0o700});
  await fs.promises.writeFile(path.join(clinicMessageUploadDir,id),data,{flag:'wx',mode:0o600});
  const record={id,clinicId,name:safeName,size:data.length,type:storedType,uploadedAt:new Date().toISOString(),uploadedBy:`Telegram · ${String(sender||'Клиент').slice(0,120)}`,kind:kind==='photo'?'photo':'document',orderEligible:Boolean(orderEligible)};
  clinicMessageFiles[id]=record;await saveClinicMessageFiles();
  const preview=Buffer.isBuffer(previewData)&&previewData.length&&previewData.length<=350*1024?`data:image/jpeg;base64,${previewData.toString('base64')}`:'';
  return {id,name:record.name,size:record.size,type:record.type,preview,kind:record.kind,orderEligible:record.orderEligible};
}

async function attachTelegramFileToOrder(orderId,clinicId,attachment,telegramActionId=''){
  const order=portalSnapshot().orders.find(item=>item.id===orderId&&item.clinicId===clinicId);
  const source=clinicMessageFiles[String(attachment?.id||'')];
  if(!order||!source||source.clinicId!==clinicId||!source.orderEligible)throw new Error('Файл или заказ не найден');
  const existing=(orderFiles[orderId]||[]).find(file=>telegramActionId&&file.telegramActionId===telegramActionId&&file.sourceAttachmentId===source.id);
  if(existing)return existing;
  const id=randomBytes(18).toString('hex');
  let storageFields={};
  if(source.storage==='yandex-disk'&&source.diskPath){
    const token=readIntegrationSecret('yandexDiskToken'),orderFolder=`/Клиенты/${safeDiskSegment(orderId)}/`;
    let diskPath=source.diskPath;
    if(!diskPath.startsWith(orderFolder)){
      const destination=newDiskPath({clinicId,orderId,target:'order',name:source.name,purpose:'order-file'});
      const usedByAnotherOrder=Object.entries(orderFiles).some(([candidateOrderId,files])=>candidateOrderId!==orderId&&(files||[]).some(file=>file.diskPath===diskPath));
      if(usedByAnotherOrder)await copyDiskResource(token,diskPath,destination);
      else{
        await moveDiskResource(token,diskPath,destination);
        source.diskPath=destination;
        await saveClinicMessageFiles();
      }
      diskPath=destination;
    }
    storageFields={storage:'yandex-disk',diskPath};
  }
  else{
    const data=await fs.promises.readFile(path.join(clinicMessageUploadDir,source.id));
    const token=readIntegrationSecret('yandexDiskToken');
    if(token){
      const diskPath=newDiskPath({orderId,name:source.name}),upload=await createDiskUpload(token,diskPath);
      const response=await fetch(upload.href,{method:upload.method||'PUT',headers:{'Content-Type':source.type},body:data,signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw new Error('Яндекс Диск не принял файл из Telegram');
      const metadata=await diskMetadata(token,diskPath);
      if(Number(metadata.size)!==data.length)throw new Error('Размер файла на Яндекс Диске не совпадает');
      storageFields={storage:'yandex-disk',diskPath};
    }else{
      await fs.promises.mkdir(uploadDir,{recursive:true,mode:0o700});
      await fs.promises.writeFile(path.join(uploadDir,id),data,{flag:'wx',mode:0o600});
    }
  }
  const record={id,name:source.name,size:source.size,type:source.type,uploadedAt:new Date().toISOString(),uploadedBy:source.uploadedBy||'Telegram',purpose:'order-file',source:'telegram',sourceAttachmentId:source.id,telegramActionId,...storageFields};
  orderFiles[orderId]=[...(orderFiles[orderId]||[]),record];await persistOrderFiles();
  await recordPortalEvent(orderId,{role:'clinic',name:portalClient(clinicId)?.name||'Клиника'},'file_uploaded',{summary:'Файл из Telegram добавлен к заказу',fileName:record.name,purpose:'order-file',clinicId}).catch(()=>{});
  return record;
}

async function appendTelegramClinicMessage(clinicId,{text,attachment=null,sender,senderUsername='',senderLabel='',telegramMessageId,telegramChatId,messageRole='client'}){
  if(!portalClient(clinicId))throw new Error('clinic_not_found');
  const chat=clinicChats[clinicId]||={messages:[],updatedAt:''};
  const externalId=`telegram:${telegramChatId}:${telegramMessageId}`;
  const existing=chat.messages.find(message=>message.externalId===externalId);
  if(existing){existing.text=cleanTelegramMessage(text);if(attachment&&clinicMessageFiles[String(attachment.id||'')]?.clinicId===clinicId)existing.attachment=attachment;existing.editedAt=new Date().toISOString();chat.updatedAt=existing.editedAt;await saveClinicChats();return existing}
  const from=['support','bot'].includes(messageRole)?messageRole:'client';
  const storedAttachment=attachment&&clinicMessageFiles[String(attachment.id||'')]?.clinicId===clinicId?attachment:null;
  const entry={id:randomBytes(12).toString('hex'),from,text:cleanTelegramMessage(text),time:new Date().toISOString(),source:'telegram',externalId,sender:String(sender||'Клиент Telegram').slice(0,120),senderUsername:String(senderUsername||'').replace(/^@/,'').slice(0,64),senderLabel:String(senderLabel||'').slice(0,120),...(storedAttachment?{attachment:storedAttachment}:{})};
  chat.messages.push(entry);chat.updatedAt=entry.time;
  await saveClinicChats();
  const eventRole=from==='client'?'clinic':from==='support'?'technician':'telegram';
  const eventName=from==='client'?(portalClient(clinicId)?.name||'Клиника'):from==='support'?(entry.senderLabel||'Главный техник'):'Бот Create Dental';
  await recordPortalEvent('',{role:eventRole,name:eventName},from==='client'?'message_received':'message_replied',{clinicId,summary:from==='client'?'Новое сообщение из Telegram':from==='support'?'Ответ поддержки из Telegram':'Автоматический ответ бота'}).catch(()=>{});
}

function cleanTelegramMessage(text){return String(text||'').replace(/[<>]/g,'').trim().slice(0,6000)}

async function loadTelegramAttachment(id){
  const record=clinicMessageFiles[id];
  if(!record)return null;
  if(record.storage==='yandex-disk'){
    try{
      const url=await signedDiskRecordUrl(record);
      if(record.size>45*1024*1024)return {record,url};
      const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)return {record,url};
      return {record,url,data:Buffer.from(await response.arrayBuffer())};
    }catch{return null}
  }
  try{return {record,data:await fs.promises.readFile(path.join(clinicMessageUploadDir,record.id))}}catch{return null}
}

async function deliverSupportMessage(clinicId,message){
  if(!message||message.from!=='support')return message;
  message.deliveryStatus='sending';message.deliveryError='';message.deliveryAttempts=(Number(message.deliveryAttempts)||0)+1;await saveClinicChats();
  try{
    const delivered=await telegramBridge?.sendClinicMessage(clinicId,message.text,message.attachment);
    if(!delivered)throw new Error('Чат Telegram не подключён');
    message.deliveryStatus='delivered';message.deliveredAt=new Date().toISOString();message.deliveryError='';
  }catch(error){message.deliveryStatus='error';message.deliveryError=String(error.message||'Ошибка Telegram').slice(0,300)}
  await saveClinicChats();return message;
}

async function saveClinicMessageFiles(){
  clinicMessageFilesQueue=clinicMessageFilesQueue.catch(()=>{}).then(async()=>{
    await fs.promises.mkdir(path.dirname(clinicMessageUploadMetaFile),{recursive:true,mode:0o700});
    await fs.promises.writeFile(clinicMessageUploadMetaFile+'.tmp',JSON.stringify(clinicMessageFiles),{mode:0o600});
    await fs.promises.rename(clinicMessageUploadMetaFile+'.tmp',clinicMessageUploadMetaFile);
  });
  await clinicMessageFilesQueue;
}
async function cleanupOrphanMessageFiles(){
  const referenced=new Set();
  for(const chat of Object.values(clinicChats))for(const message of chat.messages||[])if(message.attachment?.id)referenced.add(message.attachment.id);
  for(const files of Object.values(orderFiles))for(const file of files||[])if(file.sourceAttachmentId)referenced.add(file.sourceAttachmentId);
  let changed=false;
  for(const [id,file] of Object.entries(clinicMessageFiles)){
    if(referenced.has(id)||Date.parse(file.uploadedAt||0)>Date.now()-24*60*60*1000)continue;
    if(file.storage==='yandex-disk'&&file.diskPath)await deleteDiskResource(readIntegrationSecret('yandexDiskToken'),file.diskPath).catch(()=>{});
    else await fs.promises.unlink(path.join(clinicMessageUploadDir,id)).catch(()=>{});
    delete clinicMessageFiles[id];changed=true;
  }
  if(changed)await saveClinicMessageFiles();
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
    const allowed=sharedAttachmentTypes;
    if(!name||!allowed[ext])return json(res,400,{error:'Поддерживаются изображения, PDF, STL, PLY, ZIP, Word и Excel'});
    let data;try{data=await readRaw(req,maximumAttachmentSize)}catch(error){return json(res,error.message==='too_large'?413:400,{error:error.message==='too_large'?'Файл больше 200 МБ':'Не удалось прочитать файл'})}
    if(!data.length)return json(res,400,{error:'Файл пустой'});
    if(!validAttachmentSignature(ext,data))return json(res,400,{error:'Содержимое файла не соответствует его формату'});
    const clinicFiles=Object.values(clinicMessageFiles).filter(file=>file.clinicId===clinicId),usedBytes=clinicFiles.reduce((total,file)=>total+(Number(file.size)||0),0);
    if(clinicFiles.length>=1000||usedBytes+data.length>2*1024*1024*1024)return json(res,413,{error:'Достигнут лимит файлов клиники'});
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
    if(record.storage==='yandex-disk'){
      try{const href=await signedDiskRecordUrl(record);if(url.searchParams.get('link')==='1')return json(res,200,{url:href,name:record.name,type:record.type});res.writeHead(302,{Location:href,'Cache-Control':'private, no-store'});return res.end()}
      catch{return json(res,404,{error:'Файл не найден на Яндекс Диске'})}
    }
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
  const match=url.pathname.match(/^\/api\/chief\/conversations\/([A-Za-z0-9_-]+)(?:\/(reply|retry)\/?)?(?:\/([a-f0-9]{24}))?$/);
  if(!match||!portalClient(match[1]))return json(res,404,{error:'Диалог не найден'});
  if(req.method==='GET'&&!match[2])return json(res,200,{messages:clinicChats[match[1]]?.messages||[]});
  if(req.method==='POST'&&match[2]==='reply'&&clinicChats[match[1]])return addClinicMessage(req,res,match[1],'support');
  if(req.method==='POST'&&match[2]==='retry'&&match[3]){
    const message=clinicChats[match[1]]?.messages?.find(item=>item.id===match[3]&&item.from==='support');
    if(!message)return json(res,404,{error:'Сообщение не найдено'});
    await deliverSupportMessage(match[1],message);return json(res,message.deliveryStatus==='delivered'?200:502,{message,error:message.deliveryError||''});
  }
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
  const entry={id:randomBytes(12).toString('hex'),from,text:message,time:new Date().toISOString(),...(attachment?{attachment}:{}),...(from==='support'?{deliveryStatus:'sending',deliveryError:''}:{})};
  const chat=clinicChats[id]||={messages:[],updatedAt:''};
  chat.messages.push(entry);chat.updatedAt=entry.time;
  try{await saveClinicChats()}catch{return json(res,500,{error:'Не удалось сохранить сообщение'})}
  await recordPortalEvent('',{role:from==='client'?'clinic':'technician',name:from==='client'?(portalClient(id)?.name||'Клиника'):'Главный техник'},from==='client'?'message_received':'message_replied',{clinicId:id,summary:from==='client'?'Новое сообщение от клиники':'Лаборатория ответила на сообщение'}).catch(()=>{});
  if(from==='support')await deliverSupportMessage(id,entry);
  return json(res,from==='support'&&entry.deliveryStatus!=='delivered'?202:201,{message:entry});
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
  if(url.pathname.startsWith('/api/large-upload/')){try{return await handleLargeUpload(req,res,url)}catch(error){console.error('Large upload request failed:',error.message);return json(res,500,{error:'Ошибка загрузки файла'})}}
  if(url.pathname.startsWith('/api/auth/'))return handleAuth(req,res,url);
  if(url.pathname==='/api/uploads/init'||url.pathname.startsWith('/api/uploads/')){try{return await handleUploads(req,res,url)}catch(error){console.error('Upload request failed:',error.message);return json(res,500,{error:'Ошибка загрузки файла'})}}
  if(url.pathname==='/api/clinic-message-files'||url.pathname.startsWith('/api/clinic-message-files/')){
    try{return await handleClinicMessageFiles(req,res,url)}catch{return json(res,500,{error:'Ошибка файла сообщения'})}
  }
  if(url.pathname.startsWith('/api/orders/')&&(url.pathname.endsWith('/files')||url.pathname.endsWith('/rework'))){
    try{return url.pathname.endsWith('/rework')?await handleOrderRework(req,res,url):await handleOrderFiles(req,res,url)}catch{return json(res,500,{error:'Ошибка обработки заказа'})}
  }
  if(url.pathname==='/api/notifications')return handleNotifications(req,res);
  if(url.pathname==='/api/integrations/telegram')return handleTelegramIntegration(req,res);
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
telegramBridge=createTelegramBridge({onClinicMessage:appendTelegramClinicMessage,onBotMessage:appendTelegramClinicMessage,saveTelegramAttachment,attachOrderFile:attachTelegramFileToOrder,loadClinicAttachment:loadTelegramAttachment,createLargeUploadLink});
await telegramBridge.start();
server.listen(port,host,()=>{
  console.log(`Create Dental: ${tlsKeyFile?'https':'http'}://${host}:${port}`);
  const backup=async()=>{try{const saved=await createDataBackup();console.log(`Data backup created: ${path.basename(saved)}`)}catch(error){console.error('Data backup failed:',error.message)}};
  void backup();
  const backupTimer=setInterval(backup,24*60*60*1000);backupTimer.unref();
  const deliveryTimer=setInterval(()=>{for(const [clinicId,chat] of Object.entries(clinicChats))for(const message of chat.messages||[])if(message.from==='support'&&message.deliveryStatus==='error'&&(Number(message.deliveryAttempts)||0)<5)void deliverSupportMessage(clinicId,message)},60*1000);deliveryTimer.unref();
  void cleanupOrphanMessageFiles();const cleanupTimer=setInterval(()=>void cleanupOrphanMessageFiles(),6*60*60*1000);cleanupTimer.unref();
  const uploadCleanupTimer=setInterval(()=>{const now=Date.now(),token=readIntegrationSecret('yandexDiskToken');for(const [id,item] of diskUploadSessions)if(item.expiresAt<now){diskUploadSessions.delete(id);void deleteDiskResource(token,item.diskPath).catch(()=>{})}for(const [id,item] of largeUploadLinks)if(item.expiresAt<now||item.usedAt&&item.usedAt<now-24*60*60*1000)largeUploadLinks.delete(id)},10*60*1000);uploadCleanupTimer.unref();
});
