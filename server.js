import {samePortalValue} from './collection-concurrency.js';
import {reviseOrderServices} from './order-revision.js';
import {cadDecisionChange,workerTransitionAllowed} from './flow-rules.js';
import {handlePayroll} from './payroll-api.js';
import {handleOwner} from './owner-api.js';
import {camCanAccept,camCanSubmitQuality,camAfterMilling} from './cam-workflow.js';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {gzip} from 'node:zlib';
import { timingSafeEqual,randomBytes,createHash } from 'node:crypto';
import {createDataBackup} from './backup-data.js';
import {removePortalOrder,portalSnapshot,portalSnapshotFor,portalSnapshotForDatabase,replacePortalCollection,recordPortalEvent,portalClient,portalEmployee} from './portal-data.js';
import {validEmail,validPassword,hasAccount,createAccount,upsertWorkerAccount,updateChiefAccount,chiefAccountProfile,workerAccountProfile,updateWorkerAccount,isOwnerOnlyEmail,login,issueSession,sessionFor,revokeSession,revokeSubjectSessions} from './auth-data.js';
import {createTelegramBridge} from './telegram-bot.js';
import {createEmployeeTelegramBridge} from './employee-telegram-bot.js';
import {createDiskUpload,diskMetadata,diskDownloadUrl,deleteDiskResource,ensureDiskFolder,moveDiskResource,copyDiskResource,publishDiskResource} from './yandex-disk-storage.js';
import {workCatalog,rubles,earliestDueDateForOrder,isWorkingDay,isoDateLocal,estimateWork} from './work-catalog.js';
import {orderWorkLabel} from './order-list-utils.js';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const supportToken = process.env.SUPPORT_TOKEN || (process.env.SUPPORT_TOKEN_FILE ? fs.readFileSync(process.env.SUPPORT_TOKEN_FILE, 'utf8').trim() : '');
// Lightweight in-process latency telemetry. It keeps a bounded rolling window
// so p95 can be inspected without adding a metrics dependency to the request path.
const apiMetricSamples=new Map();
const apiMetricWindow=2000;
const apiMetricsFile=process.env.API_METRICS_FILE||path.join(process.env.DATA_DIR||path.join(root,'.data'),'api-metrics.json');
let apiMetricsPersistTimer=null;
let apiMetricsPersistQueue=Promise.resolve();
try{
  const stored=JSON.parse(fs.readFileSync(apiMetricsFile,'utf8'));
  for(const [key,samples] of Object.entries(stored||{})){
    if(!Array.isArray(samples))continue;
    const valid=samples.filter(item=>item&&Number.isFinite(item.duration)&&Number.isFinite(item.status)).slice(-apiMetricWindow);
    if(valid.length)apiMetricSamples.set(key,valid);
  }
}catch(error){if(error.code!=='ENOENT')console.error('API metrics load failed:',error.message)}
function persistApiMetrics(){
  const snapshot=Object.fromEntries(apiMetricSamples);
  apiMetricsPersistQueue=apiMetricsPersistQueue.catch(()=>{}).then(async()=>{
    await fs.promises.mkdir(path.dirname(apiMetricsFile),{recursive:true,mode:0o700});
    const temporary=apiMetricsFile+'.tmp';
    await fs.promises.writeFile(temporary,JSON.stringify(snapshot),{mode:0o600});
    await fs.promises.rename(temporary,apiMetricsFile);
  });
  return apiMetricsPersistQueue;
}
function scheduleApiMetricsPersist(){
  if(apiMetricsPersistTimer)return;
  apiMetricsPersistTimer=setTimeout(()=>{apiMetricsPersistTimer=null;void persistApiMetrics().catch(error=>console.error('API metrics save failed:',error.message))},5000);
  apiMetricsPersistTimer.unref?.();
}
function recordApiMetric(key,duration,status){
  const list=apiMetricSamples.get(key)||[];
  list.push({duration,status,at:Date.now()});
  if(list.length>apiMetricWindow)list.splice(0,list.length-apiMetricWindow);
  apiMetricSamples.set(key,list);
  scheduleApiMetricsPersist();
}
async function flushApiMetricsOnShutdown(){
  try{await persistApiMetrics()}catch(error){console.error('API metrics shutdown save failed:',error.message)}
  process.exit(0);
}
process.once('SIGTERM',flushApiMetricsOnShutdown);
process.once('SIGINT',flushApiMetricsOnShutdown);
function percentile(values,ratio){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b),index=Math.min(sorted.length-1,Math.ceil(sorted.length*ratio)-1);
  return Math.round(sorted[index]*100)/100;
}
function apiMetricsSnapshot(){
  const endpoints={};
  for(const [key,samples] of apiMetricSamples){
    const durations=samples.map(item=>item.duration),errors=samples.filter(item=>item.status>=500).length;
    endpoints[key]={count:samples.length,p50:percentile(durations,.5),p95:percentile(durations,.95),max:Math.round(Math.max(...durations)*100)/100,errors};
  }
  return {window:apiMetricWindow,uptime:Math.round(process.uptime()),endpoints};
}
const chatFile = process.env.CHAT_DATA_FILE || path.join(root, '.data', 'chat.json');
const clinicMessagesFile=process.env.CLINIC_MESSAGES_FILE||path.join(root,'.data','clinic-messages.json');
const clinicMessageUploadDir=process.env.CLINIC_MESSAGE_UPLOAD_DIR||path.join(root,'.data','clinic-message-files');
const clinicMessageUploadMetaFile=process.env.CLINIC_MESSAGE_UPLOAD_META_FILE||path.join(root,'.data','clinic-message-files.json');
const uploadDir=process.env.ORDER_UPLOAD_DIR||path.join(root,'.data','order-files');
const uploadMetaFile=process.env.ORDER_UPLOAD_META_FILE||path.join(root,'.data','order-files.json');
const notificationReadFile=process.env.NOTIFICATION_READ_FILE||path.join(root,'.data','notification-read.json');
const integrationSecretFiles={
  telegramBotToken:process.env.TELEGRAM_BOT_TOKEN_FILE||path.join(root,'.data','telegram-bot-token'),
  employeeTelegramBotToken:process.env.EMPLOYEE_TELEGRAM_BOT_TOKEN_FILE||path.join(root,'.data','employee-telegram-bot-token'),
  speechKitKey:process.env.YANDEX_SPEECHKIT_API_KEY_FILE||path.join(root,'.data','yandex-speechkit-api-key'),
  yandexGptKey:process.env.YANDEX_GPT_API_KEY_FILE||path.join(root,'.data','yandex-gpt-api-key'),
  folderId:process.env.YANDEX_FOLDER_ID_FILE||path.join(root,'.data','yandex-folder-id'),
  yandexDiskToken:process.env.YANDEX_DISK_TOKEN_FILE||path.join(root,'.data','yandex-disk-token')
};
const tlsKeyFile=process.env.TLS_KEY_FILE||'';
const tlsCertFile=process.env.TLS_CERT_FILE||'';
const httpsRedirect=process.env.HTTPS_REDIRECT==='1';
const publicFiles = new Set(['/flow-rules.js','/collection-concurrency.js','/clinic-doctors.js','/order-revision.js','/payroll.js','/payroll-ui.js','/owner.js','/owner.css','/','/index.html','/app.js','/work-catalog.js','/technician.js','/production-stages.js','/tasks.js','/cam-workflow.js','/company-pulse.js','/order-list-utils.js','/worker.js','/seed-orders.js','/portal-client.js','/routes.js','/location-assist.js','/notification-center.js','/theme.js','/order-print.js','/styles.css','/orders-overrides.css','/public/assets/surgical-template-utils.js','/support.html','/support.js','/large-upload.html','/large-upload.js','/cad-preview.html','/yandex_a7db0249ed96373e.html','/landing.html','/landing.css','/landing.js']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon'};
const sharedAttachmentTypes={
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.pdf':'application/pdf','.stl':'model/stl','.ply':'application/octet-stream',
  '.constructioninfo':'application/octet-stream',
  '.zip':'application/zip','.rar':'application/vnd.rar','.7z':'application/x-7z-compressed','.doc':'application/msword','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls':'application/vnd.ms-excel','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.txt':'text/plain','.rtf':'application/rtf','.html':'text/html'
};
const maximumAttachmentSize=200*1024*1024;
const maximumLargeUploadFiles=10;
const uploadSessionLifetime=2*60*60*1000;
const diskUploadSessions=new Map();
const largeUploadLinks=new Map();
const largeUploadLinksFile=process.env.LARGE_UPLOAD_LINKS_FILE||path.join(process.env.DATA_DIR||path.join(root,'.data'),'large-upload-links.json');
try{const saved=JSON.parse(fs.readFileSync(largeUploadLinksFile,'utf8'));for(const [key,item] of Object.entries(saved||{}))if(item&&item.expiresAt>Date.now())largeUploadLinks.set(key,item)}catch(error){if(error.code!=='ENOENT')console.error('Large upload link state load failed:',error.message)}
let largeUploadLinksQueue=Promise.resolve();
async function persistLargeUploadLinks(){
  largeUploadLinksQueue=largeUploadLinksQueue.catch(()=>{}).then(async()=>{await fs.promises.mkdir(path.dirname(largeUploadLinksFile),{recursive:true,mode:0o700});await fs.promises.writeFile(largeUploadLinksFile+'.tmp',JSON.stringify(Object.fromEntries(largeUploadLinks)),{mode:0o600});await fs.promises.rename(largeUploadLinksFile+'.tmp',largeUploadLinksFile)});
  await largeUploadLinksQueue;
}
const publicOrderFolderLinks=new Map();
const cadPreviewLinks=new Map();
const cadPreviewLinkLifetime=7*24*60*60*1000;
const orderFileMigrationJobs=new Map();
const cadHtmlCache=new Map();
const cadHtmlInflight=new Map();
let cadHtmlCacheBytes=0;
const cadHtmlCacheLimit=24*1024*1024;
function orderDateAsLocal(value){
  const match=String(value||'').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if(!match)return null;
  const date=new Date(Number(match[3]),Number(match[2])-1,Number(match[1]));
  return date.getFullYear()===Number(match[3])&&date.getMonth()===Number(match[2])-1&&date.getDate()===Number(match[1])?date:null;
}
function orderDeadlineValidation(order){
  const due=orderDateAsLocal(order?.date);
  if(!due||!isWorkingDay(due))return 'Срок заказа должен приходиться на рабочий день';
  const acceptedAt=order?.acceptedAt||order?.createdAt||new Date();
  const minimum=earliestDueDateForOrder(order,acceptedAt);
  if(minimum&&isoDateLocal(due)<isoDateLocal(minimum))return `Минимальный срок для выбранных услуг — ${isoDateLocal(minimum).split('-').reverse().join('.')}`;
  return '';
}
function rememberCadHtml(id,html){
  const size=Buffer.byteLength(html,'utf8');
  if(size>cadHtmlCacheLimit)return;
  if(cadHtmlCache.has(id))cadHtmlCacheBytes-=cadHtmlCache.get(id).size;
  cadHtmlCache.set(id,{html,size,usedAt:Date.now()});cadHtmlCacheBytes+=size;
  while(cadHtmlCacheBytes>cadHtmlCacheLimit){
    const oldest=[...cadHtmlCache.entries()].sort((a,b)=>a[1].usedAt-b[1].usedAt)[0];
    if(!oldest)break;
    cadHtmlCacheBytes-=oldest[1].size;cadHtmlCache.delete(oldest[0]);
  }
}
async function readCadHtml(record){
  const key=String(record.file.id),cached=cadHtmlCache.get(key);
  if(cached){cached.usedAt=Date.now();return cached.html}
  if(cadHtmlInflight.has(key))return cadHtmlInflight.get(key);
  const promise=(async()=>{
    let html='';
    if(record.file.storage==='yandex-disk'){
      const href=await signedDiskRecordUrl(record.file),remote=await fetch(href,{signal:AbortSignal.timeout(120000)});
      if(!remote.ok)throw new Error('download_failed');
      html=await remote.text();
    }else html=await fs.promises.readFile(path.join(uploadDir,record.file.id),'utf8');
    rememberCadHtml(key,html);return html;
  })();
  cadHtmlInflight.set(key,promise);
  try{return await promise}finally{cadHtmlInflight.delete(key)}
}
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
  if(ext==='.html'){
    if(data.subarray(0,8192).includes(0))return false;
    return /<(?:!doctype\s+html|html|head|body|script|canvas|div)\b/i.test(data.subarray(0,65536).toString('utf8'));
  }
  if(ext==='.ply')return ascii.toLowerCase().startsWith('ply');
  if(ext==='.txt')return !data.subarray(0,4096).includes(0);
  if(ext==='.constructioninfo')return true;
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
let employeeTelegramBridge=null;
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
  const employee=portalEmployee(user.subjectId),details=portalSnapshot().orderOverrides[order.id]||{};
  return user.role==='worker'&&employee&&[details.assignee,details.cadOperator,details.preprodTechnician,details.technician,details.frameTechnician,details.painter,details.ceramicist].includes(employee.originalName);
}
function actorName(user){
  if(user?.role==='clinic')return portalClient(user.subjectId)?.name||user.displayName||'Клиника';
  if(user?.role==='worker')return portalEmployee(user.subjectId)?.name||user.displayName||'Техник';
  return user?.displayName||user?.email||'Главный техник';
}
function isCadOperatorEmployee(employee){
  return /cad\s*\/?\s*cam|cadcam|cad\s*оператор|моделировщик/i.test(String(employee?.specialty||''));
}
function isPreprodEmployee(employee){return /гипсов|препрод|pre\s*prod|предпрод/i.test(String(employee?.specialty||''));}
function isPainterEmployee(employee){
  const value=String(employee?.specialty||'').trim();
  return /красильщик|керамист|эстетист/i.test(value);
}
const isCeramicistEmployee=isPainterEmployee;
function isFrameEmployee(employee){
  const value=String(employee?.specialty||'').trim();
  return !isCadOperatorEmployee(employee)&&!isPreprodEmployee(employee)&&(!value||/зубной\s+техник|каркасист|cam\s*оператор/i.test(value));
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
  const {assignee,cadOperator,preprodTechnician,technician,frameTechnician,painter,ceramicist,frameTechnicianStatus,painterStatus,ceramicistStatus,manufacturingStatus,milling,...visible}=detail||{};
  return {...visible,assigned:Boolean(assignee&&assignee!=='Не назначен')};
}
function publicClinicHistoryEvent(event){
  if(event?.action!=='assignee_changed')return event;
  const {from,to,...visible}=event;
  return {...visible,assigned:Boolean(to&&to!=='Не назначен')};
}

function publicBaseUrl(){return String(process.env.PUBLIC_BASE_URL||'https://createdental.io').replace(/\/$/,'')}
function cadPreviewKey(token){return createHash('sha256').update(String(token)).digest('hex')}
function createCadPreviewLink(order){
  const orderId=String(order?.id||''),clinicId=String(order?.clinicId||''),fileId=String(order?.cadReview?.fileId||'');
  if(!orderId||!clinicId||!fileId)return '';
  const file=(orderFiles[orderId]||[]).find(item=>item.id===fileId&&item.purpose==='cad-review'&&path.extname(item.name).toLowerCase()==='.html');
  if(!file)return '';
  const now=Date.now();
  for(const [key,item] of cadPreviewLinks)if(item.expiresAt<=now)cadPreviewLinks.delete(key);
  const token=randomBytes(32).toString('base64url');
  cadPreviewLinks.set(cadPreviewKey(token),{orderId,clinicId,fileId,createdAt:now,expiresAt:now+cadPreviewLinkLifetime});
  return `${publicBaseUrl()}/cad-preview.html?token=${encodeURIComponent(token)}`;
}
async function handleCadPreview(req,res,url){
  const match=url.pathname.match(/^\/api\/cad-preview\/([A-Za-z0-9_-]{30,80})$/);
  if(!match)return json(res,404,{error:'Ссылка на CAD не найдена'});
  const token=match[1],link=cadPreviewLinks.get(cadPreviewKey(token));
  if(!link||link.expiresAt<=Date.now()){if(link)cadPreviewLinks.delete(cadPreviewKey(token));return json(res,410,{error:'Ссылка на CAD истекла'});}
  const snapshot=portalSnapshot(),order=snapshot.orders.find(item=>item.id===link.orderId&&item.clinicId===link.clinicId);
  const details=snapshot.orderOverrides[link.orderId]||{},file=(orderFiles[link.orderId]||[]).find(item=>item.id===link.fileId&&item.purpose==='cad-review'&&path.extname(item.name).toLowerCase()==='.html');
  if(!order||!file||String(details.cadReview?.fileId||'')!==link.fileId)return json(res,404,{error:'CAD-файл недоступен'});
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Метод не поддерживается'});
  try{
    const html=await readCadHtml({file}),headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"frame-ancestors 'self'"};
    if(req.method==='HEAD')return res.writeHead(200,headers).end();
    res.writeHead(200,{...headers,'Content-Length':Buffer.byteLength(html,'utf8')});res.end(html);
  }catch(error){console.error('Public CAD preview load failed:',error.message);return json(res,504,{error:'Не удалось загрузить CAD. Откройте ссылку ещё раз.'})}
}

async function readBody(req,limit=8192) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error('too_large');
  }
  return JSON.parse(body || '{}');
}

async function handleTaskUpdate(req,res,user,snapshot){
  if(!['technician','worker'].includes(user.role))return json(res,403,{error:'Доступ запрещён'});
  let value;
  try{value=await readBody(req,500000)}catch{return json(res,400,{error:'Неверные данные задач'})}
  if(!Array.isArray(value)||value.some(task=>!task||typeof task!=='object'||Array.isArray(task)))return json(res,400,{error:'Неверные данные задач'});
  const previous=new Map(snapshot.tasks.map(task=>[task.id,task]));
  const changed=value.filter(task=>!samePortalValue(task,previous.get(task.id)));
  const stamp=new Date().toISOString();
  if(user.role==='worker'){
    if(changed.length!==1)return json(res,403,{error:'Можно изменить только одну свою задачу'});
    const task=changed[0],old=previous.get(task.id);
    if(!old||old.assigneeId!==user.subjectId||Object.keys({...old,...task}).some(key=>!['status','updatedAt','completedAt'].includes(key)&&!samePortalValue(old[key],task[key])))return json(res,403,{error:'Сотрудник может менять только статус своей задачи'});
    if(!['backlog','in_progress','review','done'].includes(task.status))return json(res,400,{error:'Неверный статус задачи'});
    value=snapshot.tasks.map(item=>item.id===old.id?{...old,status:task.status,updatedAt:stamp,completedAt:task.status==='done'?(old.completedAt||stamp):''}:item);
  }else{
    const activeEmployees=new Map(snapshot.employees.filter(employee=>employee.status==='active').map(employee=>[employee.id,employee]));
    if(changed.some(task=>{const employee=activeEmployees.get(task.assigneeId);return !employee||task.assigneeName!==employee.name}))return json(res,403,{error:'Задачу можно назначить только активному сотруднику'});
    const changedIds=new Set(changed.map(task=>task.id));
    value=value.map(task=>{
      if(!changedIds.has(task.id))return previous.get(task.id);
      const old=previous.get(task.id);
      return {...task,createdBy:old?.createdBy||actorName(user),createdAt:old?.createdAt||stamp,updatedAt:stamp,completedAt:task.status==='done'?(old?.completedAt||stamp):''};
    });
  }
  try{
    await replacePortalCollection('tasks',value,{role:user.role,name:actorName(user)},{expectedVersion:req.headers['x-portal-version']===undefined?(snapshot.collectionVersions?.tasks||0):Number(req.headers['x-portal-version'])});
    for(const task of value){
      const before=previous.get(task.id),employee=portalEmployee(task.assigneeId);
      if(employee&&(task.assigneeId!==before?.assigneeId||task.status!==before?.status))void employeeTelegramBridge?.notifyTask?.(task,employee,before||{}).catch(error=>console.error('Employee Telegram task notification failed:',error.message));
    }
    return json(res,200,{ok:true,saved:portalSnapshotFor(user.role,user.subjectId).tasks,collectionVersions:portalSnapshot().collectionVersions});
  }catch(error){if(error.message==='collection_conflict')return json(res,409,{error:'Задачи уже изменились. Обновите страницу.'});return json(res,error.message==='invalid_collection'?400:500,{error:error.message==='invalid_collection'?'Неверные данные задач':'Не удалось сохранить задачу'})}
}

const portalSectionAliases={
  orders:'orders',
  'order-overrides':'orderOverrides',orderOverrides:'orderOverrides',
  history:'orderHistory','order-history':'orderHistory',orderHistory:'orderHistory',
  requests:'clientRequests','client-requests':'clientRequests',clientRequests:'clientRequests',
  tasks:'tasks',clients:'clients',employees:'employees',
  catalog:'workCatalog','work-catalog':'workCatalog',workCatalog:'workCatalog',
  deliverySettings:'deliverySettings','delivery-settings':'deliverySettings',
  promoCodes:'promoCodes','promo-codes':'promoCodes'
};

async function portalViewForUser(user,view=''){
  const snapshot=await portalSnapshotForDatabase(user.role,user.subjectId,view);
  if(user.role==='clinic'){
    snapshot.clients=snapshot.clients.filter(item=>item.id===user.subjectId);
    snapshot.orders=snapshot.orders.filter(item=>item.clinicId===user.subjectId);
    snapshot.employees=[];
    snapshot.orderOverrides=Object.fromEntries(Object.entries(snapshot.orderOverrides).filter(([id])=>snapshot.orders.some(order=>order.id===id)).map(([id,detail])=>[id,publicClinicOverride(detail)]));
    snapshot.orderHistory=snapshot.orderHistory.filter(event=>event.clinicId===user.subjectId||snapshot.orders.some(order=>order.id===event.orderId)).map(publicClinicHistoryEvent);
    snapshot.clientRequests=snapshot.clientRequests.filter(item=>item.clinicId===user.subjectId);
    snapshot.tasks=[];
  }else if(user.role==='worker'){
    const employee=portalEmployee(user.subjectId);
    snapshot.orders=snapshot.orders.filter(item=>{
      const details=snapshot.orderOverrides[item.id]||{};
      return employee&&[details.assignee,details.cadOperator,details.preprodTechnician,details.technician,details.frameTechnician,details.painter,details.ceramicist].includes(employee.originalName);
    });
    snapshot.clients=[];
    snapshot.employees=employee?[employee]:[];
    snapshot.orderOverrides=Object.fromEntries(Object.entries(snapshot.orderOverrides).filter(([id])=>snapshot.orders.some(order=>order.id===id)));
    snapshot.orderHistory=snapshot.orderHistory.filter(event=>snapshot.orders.some(order=>order.id===event.orderId));
    snapshot.clientRequests=[];
    snapshot.tasks=snapshot.tasks.filter(task=>task.assigneeId===user.subjectId);
  }
  snapshot.collectionVersions=portalSnapshot().collectionVersions||{};
  return snapshot;
}

async function handlePortal(req,res,url){
  const user=session(req);
  if(!user)return json(res,401,{error:'Войдите в кабинет'});
  const snapshot=req.method==='GET'?await portalViewForUser(user,url.searchParams.get('view')||''):portalSnapshot();
  if(req.method==='PUT'&&url.pathname==='/api/portal/tasks')return handleTaskUpdate(req,res,user,snapshot);
  if(req.method==='GET'&&url.pathname==='/api/portal'){
    return json(res,200,{...snapshot,user:publicUser(user)});
  }
  const key=url.pathname.slice('/api/portal/'.length);
  if(req.method==='GET'){
    const section=portalSectionAliases[key];
    if(section==='promoCodes'&&user.role!=='technician')return json(res,403,{error:'Доступ запрещён'});
    if(section)return json(res,200,{[section]:snapshot[section]??(section==='orderOverrides'?{}:[]),user:publicUser(user)});
  }
  if(req.method==='PUT'&&['orders','orderOverrides','clients','employees','workCatalog','deliverySettings','promoCodes'].includes(key)){
    if(user.role==='worker'&&key!=='orderOverrides')return json(res,403,{error:'Доступ запрещён'});
    let value;
    try {value=await readBody(req,500000)} catch {return json(res,400,{error:'Неверные данные'})}
    if(user.role==='clinic'){
      if(key==='clients'){
        if(!Array.isArray(value)||value.length!==1||value[0].id!==user.subjectId)return json(res,403,{error:'Доступ запрещён'});
        const allowed=new Set(['name','country','inn','city','address','phone','email','contact','contactPosition','contactPhone','workHours','labNotes','logo','doctors','doctorsRevision','clinicHiddenDoctorIds','_revision']);
        const changes=Object.fromEntries(Object.entries(value[0]).filter(([key])=>allowed.has(key)));
        value=snapshot.clients.map(item=>item.id===user.subjectId?{...item,...changes,id:item.id,originalName:item.originalName,telegramCode:item.telegramCode}:item);
      }else if(key==='orders'){
        if(!Array.isArray(value))return json(res,400,{error:'Неверные данные'});
        const existing=new Set(snapshot.orders.map(item=>item.id));
        const additions=value.filter(item=>!existing.has(item.id));
        if(!additions.length||additions.length>20||value.length!==snapshot.orders.filter(item=>item.clinicId===user.subjectId).length+additions.length||additions.some(item=>item.clinicId!==user.subjectId||snapshot.orders.some(existingOrder=>existingOrder.id===item.id)))return json(res,403,{error:'Можно добавить до 20 своих заказов за один раз'});
        const invalidDeadline=additions.map(order=>orderDeadlineValidation(order)).find(Boolean);
        if(invalidDeadline)return json(res,400,{error:invalidDeadline});
        // Keep the delivery rule authoritative on the server as well. The
        // clinic UI sends the service subtotal, but the API recomputes the
        // delivery amount before persisting a new order so stale clients
        // cannot save a mismatched total.
        const normalizedAdditions=additions.map(order=>{
          const promo=String(order.promoCode||'').trim().toUpperCase(),promoRule=snapshot.promoCodes?.find(item=>item.active!==false&&String(item.code||'').toUpperCase()===promo),variants=Array.isArray(order.variants)&&order.variants.length?order.variants:[{work:order.work,workOption:order.material,selectedTeeth:order.teeth||[],toothMode:order.toothMode}];
          const calculated=variants.map(variant=>{const estimate=estimateWork({work:variant.work,option:variant.workOption,teeth:variant.selectedTeeth||[],units:variant.units}).amount,special=promoRule?.prices?.[`${variant.work}|||${variant.workOption}`];return Number.isFinite(Number(special))?Number(special)*estimateWork({work:variant.work,option:variant.workOption,teeth:variant.selectedTeeth||[],units:variant.units}).units:estimate});
          const servicesTotal=calculated.length&&calculated.every(Number.isFinite)?calculated.reduce((sum,value)=>sum+value,0):Number(order.servicesTotal);
          if(!Number.isFinite(servicesTotal))return order;
          const deliveryRules=snapshot.deliverySettings&&typeof snapshot.deliverySettings==='object'?snapshot.deliverySettings:{freeThreshold:4000,fee:500};
          const freeThreshold=Number.isFinite(Number(deliveryRules.freeThreshold))?Number(deliveryRules.freeThreshold):4000;
          const deliveryAmount=Number.isFinite(Number(deliveryRules.fee))?Number(deliveryRules.fee):500;
          const deliveryFee=servicesTotal<freeThreshold?deliveryAmount:0;
          const total=servicesTotal+deliveryFee;
          return {...order,servicesTotal,deliveryFee,promoCode:promo,sum:rubles(total)};
        });
        value=[...normalizedAdditions,...snapshot.orders];
      }else if(key==='orderOverrides'){
        if(!value||typeof value!=='object'||Array.isArray(value))return json(res,400,{error:'Неверные данные'});
        const changes=Object.entries(value).filter(([id,detail])=>!samePortalValue(detail,publicClinicOverride(snapshot.orderOverrides[id]||{})));
        if(changes.length!==1)return json(res,403,{error:'Можно изменить только один свой заказ'});
        const [id,next]=changes[0],order=snapshot.orders.find(item=>item.id===id&&item.clinicId===user.subjectId),old=snapshot.orderOverrides[id]||{};
        const visibleOld=publicClinicOverride(old);
        const currentStage=old.stage||(['В пути к вам','В доставке'].includes(order?.status)?'В доставке':order?.status==='Принято'?'Принято доктором':order?.status);
        if(!order||currentStage!=='В доставке'||next.stage!=='Принято доктором'||Object.keys({...visibleOld,...next}).some(field=>!['stage','doctorAcceptedAt'].includes(field)&&!samePortalValue(next[field],visibleOld[field])))return json(res,403,{error:'Неверный переход этапа'});
        value={...snapshot.orderOverrides,[id]:{...old,stage:'Принято доктором',doctorAcceptedAt:new Date().toISOString()}};
      }else return json(res,403,{error:'Доступ запрещён'});
    }else if(user.role==='worker'&&key==='orderOverrides'){
      if(key!=='orderOverrides'||!value||typeof value!=='object')return json(res,403,{error:'Доступ запрещён'});
      const employee=portalEmployee(user.subjectId);
      const changes=Object.entries(value).filter(([id,detail])=>!samePortalValue(detail,snapshot.orderOverrides[id]));
      if(changes.length!==1)return json(res,403,{error:'Можно изменить только один свой заказ'});
      const [id,next]=changes[0],old=snapshot.orderOverrides[id];
      if(!workerTransitionAllowed(old,next,employee))return json(res,409,{error:'Этот переход недоступен. Примите свою работу перед отправкой на ОТК; решение ОТК принимает главный техник.'});
      value={...snapshot.orderOverrides,[id]:next};
    }else if(user.role==='technician'&&key==='workCatalog'){
      if(!Array.isArray(value))return json(res,400,{error:'Неверный каталог'});
    }else if(user.role==='technician'&&key==='deliverySettings'){
      if(!value||typeof value!=='object'||Array.isArray(value))return json(res,400,{error:'Неверные условия доставки'});
      const freeThreshold=Number(value.freeThreshold),fee=Number(value.fee);
      if(!Number.isFinite(freeThreshold)||freeThreshold<0||freeThreshold>100000000||!Number.isFinite(fee)||fee<0||fee>100000000)return json(res,400,{error:'Порог и стоимость доставки должны быть корректными суммами'});
      value={freeThreshold,fee};
    }else if(user.role==='technician'&&key==='promoCodes'){
      if(!Array.isArray(value))return json(res,400,{error:'Неверные промокоды'});
      value=value.map(item=>({...item,code:String(item.code||'').trim().toUpperCase()}));
    }else if(user.role==='technician'&&key==='orderOverrides'){
      if(!value||typeof value!=='object'||Array.isArray(value))return json(res,400,{error:'Неверные данные'});
      const ids=new Set([...Object.keys(snapshot.orderOverrides),...Object.keys(value)]);
      const cadConfirmed=detail=>detail?.cadReview?.status==='approved'||['Изготовление','Контроль качества','Работа принята','В доставке','Принято доктором'].includes(detail?.stage);
      const assignmentViolation=[...ids].find(id=>{
        const old=snapshot.orderOverrides[id]||{},next=value[id]||{};
        const oldStage=old.stage==='Черновик из Telegram'?'Ожидает распределения':old.stage;
        const technicianChanged=next.technician!==old.technician||next.preprodTechnician!==old.preprodTechnician||next.frameTechnician!==old.frameTechnician||next.painter!==old.painter||next.ceramicist!==old.ceramicist;
        const cadChanged=next.cadOperator!==old.cadOperator;
        const order=snapshot.orders.find(item=>item.id===id),analog=order?.productionType==='analog';
        const firstAnalogAssigned=analog&&next.preprodTechnician&&['Подготовка','Препрод'].includes(oldStage);
        const analogProductionAssigned=analog&&(next.frameTechnician||next.painter||next.ceramicist)&&['Изготовление','Контроль качества','Работа принята','В доставке','Принято доктором'].includes(oldStage);
        if(technicianChanged&&(next.technician||next.frameTechnician||next.painter||next.ceramicist||next.preprodTechnician)&&!cadConfirmed(next)&&!cadConfirmed(old)&&!firstAnalogAssigned&&!analogProductionAssigned)return true;
        if(cadChanged&&next.cadOperator&&oldStage==='Ожидает распределения')return true;
        return false;
      });
      if(assignmentViolation)return json(res,409,{error:'Сначала подтвердите CAD врачом и переведите заказ на этап «Приём / Доставка». Каркасиста и красильщика можно назначить только после этого'});
      const finalQualityBypass=[...ids].find(id=>{
        const old=snapshot.orderOverrides[id]||{},next=value[id];
        if(!next||next.stage!=='В доставке'||old.stage==='В доставке')return false;
        return old.stage!=='Контроль качества'||old.qualityRequest?.kind!=='final'||!next.finalQualityApprovedAt||next.finalQualityApprovedAt===old.finalQualityApprovedAt;
      });
      if(finalQualityBypass)return json(res,409,{error:'Сначала отдельно подтвердите финальную ОТК. Приёмка работы эстетиста не переводит заказ на доставку.'});
      const acceptanceDeadlineViolation=[...ids].map(id=>{
        const old=snapshot.orderOverrides[id]||{},next=value[id]||{},order=snapshot.orders.find(item=>item.id===id),oldStage=old.stage||'Ожидает распределения';
        if(!order||!['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(oldStage)||next.stage!=='Подготовка')return '';
        return orderDeadlineValidation({...order,acceptedAt:new Date()});
      }).find(Boolean);
      if(acceptanceDeadlineViolation)return json(res,409,{error:acceptanceDeadlineViolation});
      const cadQualityBypass=[...ids].find(id=>{
        const old=snapshot.orderOverrides[id]||{},next=value[id];
        if(old.stage!=='Контроль качества'||old.qualityRequest?.kind!=='cad'||!next||next.stage===old.stage)return false;
        const approved=next.stage==='Согласование CAD'&&!next.qualityRequest&&next.cadOperatorStatus==='Согласование с врачом';
        const returned=next.stage==='Моделирование'&&!next.qualityRequest&&next.cadReview?.status==='returned';
        return !approved&&!returned;
      });
      if(cadQualityBypass)return json(res,409,{error:'Сначала проверьте CAD на ОТК, затем дождитесь решения врача.'});
      const forbidden=[...ids].find(id=>{
        const old=snapshot.orderOverrides[id]||{},next=value[id];
        const downstream=['Согласование CAD','Изготовление','Контроль качества','Работа принята','В доставке','Принято доктором'];
        return old.stage==='Моделирование'&&downstream.includes(next?.stage)||old.stage==='Согласование CAD'&&next?.stage!==old.stage;
      });
      if(forbidden)return json(res,409,{error:'CAD должен подтвердить или вернуть врач'});
      for(const id of ids){
        const old=snapshot.orderOverrides[id]||{},next=value[id];
        if(next?.milling?.completedAt&&!old.milling?.completedAt){
          if(!old.milling?.sentAt||old.stage!=='Изготовление'||old.manufacturingStatus!=='В работе у Каркасиста')return json(res,409,{error:'Сначала отправьте заказ на фрезеровку'});
          value={...value,[id]:camAfterMilling(next,next.milling.completedAt)};
        }
      }
      const normalizedOverrides={...value};
      for(const id of ids){
        const old=snapshot.orderOverrides[id]||{},next=value[id];
        if(!next||next.frameTechnician===old.frameTechnician)continue;
        normalizedOverrides[id]={...next,frameTechnicianStatus:'',technicianStatus:'',qualityRequest:next.qualityRequest?.kind==='cam'?null:next.qualityRequest,workerAcceptances:Object.fromEntries(Object.entries(next.workerAcceptances||{}).filter(([,item])=>item?.role!=='frame'))};
      }
      value=normalizedOverrides;
    }
    if(user.role==='technician'&&key==='clients'&&Array.isArray(value)){
      // Compact technician loads omit heavy logo data. Preserve an existing
      // logo when a quick edit is saved before the background refresh arrives.
      value=value.map(client=>{
        const previous=snapshot.clients.find(item=>item.id===client?.id);
        return client&&previous?.logo&& !Object.prototype.hasOwnProperty.call(client,'logo')?{...client,logo:previous.logo}:client;
      });
    }
    const newOrders=key==='orders'&&Array.isArray(value)?value.filter(order=>!snapshot.orders.some(existing=>existing.id===order.id)):[];
    try {
      await replacePortalCollection(key,value,{role:user.role,name:actorName(user)},{expectedVersion:req.headers['x-portal-version']===undefined?(snapshot.collectionVersions?.[key]||0):Number(req.headers['x-portal-version'])});
      if(key==='clients'&&Array.isArray(value)){
        for(const clinic of value){
          const previous=snapshot.clients.find(item=>item.id===clinic.id);
          if(previous&&previous.logo!==clinic.logo){
            void telegramBridge?.syncClinicChatPhoto(clinic.id,clinic.logo||'').catch(error=>console.error('Telegram clinic chat photo sync failed:',error.message));
          }
        }
      }
      if(newOrders.length){
        const created=await Promise.allSettled(newOrders.map(order=>ensurePublicOrderFolder(order.id)));
        const failed=created.find(result=>result.status==='rejected');
        if(failed){
          await replacePortalCollection('orders',snapshot.orders,{role:user.role,name:actorName(user)}).catch(rollbackError=>console.error('Order create rollback failed:',rollbackError.message));
          const token=readIntegrationSecret('yandexDiskToken');
          await Promise.allSettled(newOrders.map(order=>deleteDiskResource(token,orderDiskFolder(order.id))));
          for(const order of newOrders)publicOrderFolderLinks.delete(order.id);
          throw new Error('order_folder_failed');
        }
      }
      if(key==='employees')for(const employee of value)if(employee.status!=='active'){revokeSubjectSessions('worker',employee.id);void employeeTelegramBridge?.revokeEmployee(employee.id).catch(error=>console.error('Employee Telegram revoke failed:',error.message))}
      if(key==='orderOverrides')for(const [id,detail] of Object.entries(value)){
        const before=snapshot.orderOverrides[id]||{};
        if(detail&&(detail.assignee!==before.assignee||detail.technician!==before.technician||detail.preprodTechnician!==before.preprodTechnician||detail.frameTechnician!==before.frameTechnician||detail.painter!==before.painter||detail.ceramicist!==before.ceramicist||detail.cadOperator!==before.cadOperator||detail.milling?.completedAt&&!before.milling?.completedAt)){const order=snapshot.orders.find(item=>item.id===id);if(order)void employeeTelegramBridge?.notifyAssignment(order,detail,before).catch(error=>console.error('Employee Telegram assignment notification failed:',error.message))}
        if(detail?.stage==='Согласование CAD'&&before.stage!=='Согласование CAD'){
          const order=snapshot.orders.find(item=>item.id===id),previewUrl=createCadPreviewLink(order&&{...order,cadReview:detail.cadReview});
          if(order&&previewUrl)void telegramBridge?.sendAutomatedMessage(order.clinicId,`CAD по заказу ${order.id} готов к согласованию врача.`,{reply_markup:{inline_keyboard:[[{text:'Открыть CAD',url:previewUrl}],[{text:'✅ Принять заказ',callback_data:`tgcad:approve:${order.id}`}],[{text:'↩️ Вернуть заказ',callback_data:`tgcad:return:${order.id}`}]]}}).catch(error=>console.error('Telegram CAD notification failed:',error.message));
        }
      }
      if(key==='tasks')for(const task of value){
        const before=snapshot.tasks.find(item=>item.id===task.id);
        const assignedChanged=task.assigneeId&&task.assigneeId!==before?.assigneeId;
        const statusChanged=task.status!==before?.status;
        const employee=portalEmployee(task.assigneeId);
        if(employee&&(assignedChanged||statusChanged))void employeeTelegramBridge?.notifyTask(task,employee,before||{}).catch(error=>console.error('Employee Telegram task notification failed:',error.message));
      }
      const saved=(await portalViewForUser(user))[key];
      return json(res,200,{ok:true,saved,...(key==='employees'?{orderOverrides:portalSnapshot().orderOverrides}:{}),collectionVersions:portalSnapshot().collectionVersions})
    }
    catch(error){
      if(error.message==='collection_conflict')return json(res,409,{error:'Данные уже изменились в другой вкладке или у другого сотрудника. Обновите страницу и повторите изменение.'});
      if(error.message==='doctors_conflict')return json(res,409,{error:'Список врачей уже изменился. Обновите страницу и повторите изменение.'});
      if(error.message==='invalid_doctor')return json(res,400,{error:'Выберите действующего врача вашей клиники'});
      if(error.message==='order_folder_failed')return json(res,502,{error:'Не удалось создать папку заказа на Яндекс Диске. Заказ не создан'});
      return json(res,error.message==='invalid_collection'?400:500,{error:error.message==='invalid_collection'?'Неверные данные':'Не удалось сохранить'});
    }
  }
  return json(res,404,{error:'Не найдено'});
}

function clientRequestLabel(type){return type==='cancel'?'отмену заказа':type==='deadline'?'изменение срока':'изменение заказа'}

const permanentTeeth=[11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48];
const permanentTeethSet=new Set(permanentTeeth);
const upperJaw=permanentTeeth.filter(tooth=>tooth<30);
const lowerJaw=permanentTeeth.filter(tooth=>tooth>30);
function cleanRequestText(value,maximum=2000){return String(value??'').replace(/[<>]/g,'').trim().slice(0,maximum)}
function requestPrice(work,material,teeth){const estimate=estimateWork({work,option:material,teeth});return estimate.amount===null?null:rubles(estimate.amount)}

async function handleClientRequestCreate(req,res,url){
  const user=session(req);
  if(!user)return json(res,401,{error:'Войдите в кабинет'});
  if(user.role!=='clinic')return json(res,403,{error:'Запрос может отправить только клиника'});
  if(req.method!=='POST')return json(res,405,{error:'Метод не поддерживается'});
  const match=url.pathname.match(/^\/api\/orders\/([A-Za-z0-9_-]{1,80})\/client-request$/);
  if(!match)return json(res,404,{error:'Заказ не найден'});
  let body;try{body=await readBody(req,12000)}catch{return json(res,400,{error:'Неверные данные запроса'})}
  const snapshot=portalSnapshot(),order=snapshot.orders.find(item=>item.id===match[1]&&item.clinicId===user.subjectId);
  if(!order)return json(res,404,{error:'Заказ не найден'});
  if(order.status==='Отменён')return json(res,409,{error:'Заказ уже отменён'});
  const type=body.type==='cancel'?'cancel':body.type==='edit'?'edit':'';
  if(!type)return json(res,400,{error:'Выберите тип запроса'});
  const requestedBy=actorName(user),createdAt=new Date().toISOString();
  let reason='',summary='',changes={},requestType=type;
  if(type==='cancel'){
    reason=cleanRequestText(body.reason);
    if(reason.length<3)return json(res,400,{error:'Коротко укажите причину отмены'});
    summary=`Отмена заказа: ${reason}`;
  }else{
    const field=cleanRequestText(body.field,40),value=body.value;
    if(field==='patient'){
      const patient=cleanRequestText(value,160);
      if(patient.split(/\s+/).filter(Boolean).length<2)return json(res,400,{error:'Укажите имя и фамилию пациента'});
      changes={patient};summary=`Пациент: ${patient}`;
    }else if(field==='birth'){
      const birth=cleanRequestText(value,20);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(birth))return json(res,400,{error:'Укажите дату рождения'});
      changes={birth};summary=`Дата рождения: ${birth.split('-').reverse().join('.')}`;
    }else if(field==='teeth'){
      const teeth=[...new Set(String(value||'').split(/[^0-9]+/).filter(Boolean).map(Number))].filter(tooth=>permanentTeethSet.has(tooth));
      if(!teeth.length)return json(res,400,{error:'Укажите номера зубов через запятую'});
      changes={teeth,quantity:teeth.length};const priced=requestPrice(order.work,order.material,teeth);if(priced)changes.sum=priced;summary=`Зубы: ${teeth.join(', ')}`;
    }else if(field==='mode'){
      const mode=cleanRequestText(value,30);
      if(!['single','bridge','upper','lower'].includes(mode))return json(res,400,{error:'Выберите режим'});
      if(mode==='upper'||mode==='lower'){
        const teeth=mode==='upper'?upperJaw:lowerJaw;
        changes={toothMode:'Челюсть',teeth,quantity:teeth.length,bridgeRanges:[]};const priced=requestPrice(order.work,order.material,teeth);if(priced)changes.sum=priced;summary=`Режим: ${mode==='upper'?'верхняя челюсть':'нижняя челюсть'}`;
      }else{changes={toothMode:mode==='bridge'?'Мост':'Одиночка',bridgeRanges:mode==='bridge'?[order.teeth||[]]:[]};summary=`Режим: ${changes.toothMode}`}
    }else if(field==='service'){
      const [work,material]=String(value||'').split('|||').map(item=>cleanRequestText(item,200));
      const category=workCatalog.find(item=>item.name===work),option=category?.options.find(item=>item.name===material);
      if(!category||!option)return json(res,400,{error:'Выберите услугу из прайса'});
      changes={work:category.name,material:option.name};summary=`Услуга: ${category.name} · ${option.name}`;
    }else if(field==='date'){
      const date=cleanRequestText(value,20);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00`)))return json(res,400,{error:'Укажите новый срок'});
      changes={date:date.split('-').reverse().join('.')};requestType='deadline';summary=`Новый срок: ${changes.date}`;
    }else if(field==='shade'){
      const shade=cleanRequestText(value,80);if(!shade)return json(res,400,{error:'Укажите цвет'});changes={shade};summary=`Цвет: ${shade}`;
    }else if(field==='comment'){
      const comment=cleanRequestText(value);if(comment.length<3)return json(res,400,{error:'Введите новый комментарий'});changes={comment};summary='Изменение комментария к заказу';
    }else return json(res,400,{error:'Выберите, что нужно изменить'});
  }
  if(type==='edit'&&['teeth','mode','service'].includes(body.field)){
    const promoRule=snapshot.promoCodes?.find(item=>item.active!==false&&item.code===order.promoCode);
    try{changes=reviseOrderServices(order,changes,{variantIndex:body.variantIndex,deliverySettings:snapshot.deliverySettings,promoPrices:promoRule?.prices||{}})}catch(error){return json(res,400,{error:error.message})}
  }
  if(snapshot.clientRequests.some(item=>item.orderId===order.id&&item.type===requestType&&item.status==='pending'))return json(res,409,{error:requestType==='cancel'?'Запрос на отмену уже ожидает решения':requestType==='deadline'?'Запрос на изменение срока уже ожидает решения':'По заказу уже есть правка, ожидающая решения'});
  const before=Object.fromEntries(Object.keys(changes).map(key=>[key,order[key]??'']));
  const request={id:`cr-${randomBytes(10).toString('hex')}`,baseOrderRevision:order._revision||0,orderId:order.id,clinicId:order.clinicId,type:requestType,status:'pending',requestedBy,confirmedBy:requestedBy,summary,reason,changes,before,createdAt,source:'portal'};
  try{
    await replacePortalCollection('clientRequests',[request,...snapshot.clientRequests],{role:'clinic',name:requestedBy});
    await recordPortalEvent(order.id,{role:'clinic',name:requestedBy},'client_change_requested',{clinicId:order.clinicId,summary:`Запрошено ${clientRequestLabel(requestType)}`,clientRequestId:request.id}).catch(()=>{});
    return json(res,201,{ok:true,request});
  }catch(error){console.error('Client request creation failed:',error.message);return json(res,500,{error:'Не удалось отправить запрос'})}
}

async function handleClientRequestDecision(req,res,url){
  const user=session(req);
  if(!user)return json(res,401,{error:'Войдите в кабинет'});
  if(user.role!=='technician')return json(res,403,{error:'Решение может принять только главный техник'});
  if(req.method!=='POST')return json(res,405,{error:'Метод не поддерживается'});
  const match=url.pathname.match(/^\/api\/client-requests\/([A-Za-z0-9_-]{1,80})\/(approve|reject)$/);
  if(!match)return json(res,404,{error:'Запрос не найден'});
  const [,requestId,decision]=match,snapshot=portalSnapshot();
  const request=snapshot.clientRequests.find(item=>item.id===requestId);
  if(!request)return json(res,404,{error:'Запрос не найден'});
  if(request.status!=='pending')return json(res,409,{error:'По этому запросу уже принято решение'});
  const order=snapshot.orders.find(item=>item.id===request.orderId&&item.clinicId===request.clinicId);
  if(!order)return json(res,404,{error:'Заказ не найден'});
  if(decision==='approve'&&request.baseOrderRevision!==undefined&&request.baseOrderRevision!==(order._revision||0))return json(res,409,{error:'Заказ изменился после создания запроса. Проверьте актуальные данные и создайте новый запрос.'});
  const reviewedAt=new Date().toISOString(),reviewedBy=actorName(user),status='archived',decisionResult=decision==='approve'?'approved':'rejected';
  try{
    if(decision==='approve'){
      if(request.type==='cancel'){
        const reason=request.reason||request.summary||'Отмена по запросу клиента';
        await replacePortalCollection('orders',snapshot.orders.map(item=>item.id===order.id?{...item,status:'Отменён',cancelledAt:reviewedAt,cancelReason:reason}:item),{role:'technician',name:reviewedBy});
        const current=portalSnapshot();
        await replacePortalCollection('orderOverrides',{...current.orderOverrides,[order.id]:{...(current.orderOverrides[order.id]||{}),stage:'Отменён',cancelledAt:reviewedAt,cancelReason:reason}},{role:'technician',name:reviewedBy});
      }else{
        const allowed=new Set(['patient','birth','work','material','teeth','quantity','toothMode','date','shade','comment','sum','bridgeRanges','variants','servicesTotal','deliveryFee']);
        const changes=Object.fromEntries(Object.entries(request.changes||{}).filter(([key])=>allowed.has(key)));
        if(!changes.variants&&['work','material','teeth','toothMode'].some(key=>Object.hasOwn(changes,key))){const revised=reviseOrderServices(order,changes,{variantIndex:request.variantIndex,deliverySettings:snapshot.deliverySettings});Object.assign(changes,revised);}
        const updated={...order,...changes,id:order.id,clinicId:order.clinicId,createdAt:order.createdAt,updatedAt:reviewedAt};
        await replacePortalCollection('orders',snapshot.orders.map(item=>item.id===order.id?updated:item),{role:'technician',name:reviewedBy});
      }
    }
    const current=portalSnapshot();
    const reviewed=current.clientRequests.map(item=>item.id===request.id?{...item,status,decision:decisionResult,reviewedAt,reviewedBy}:item);
    await replacePortalCollection('clientRequests',reviewed,{role:'technician',name:reviewedBy});
    await recordPortalEvent(order.id,{role:'technician',name:reviewedBy},decision==='approve'?'client_request_approved':'client_request_rejected',{clinicId:order.clinicId,summary:`Запрос на ${clientRequestLabel(request.type)} ${decision==='approve'?'одобрен':'отклонён'}`,clientRequestId:request.id}).catch(()=>{});
    const resultText=decision==='approve'?`Запрос на ${clientRequestLabel(request.type)} по заказу ${order.id} одобрен главным техником.`:`Запрос на ${clientRequestLabel(request.type)} по заказу ${order.id} отклонён главным техником.`;
    void telegramBridge?.sendAutomatedMessage(order.clinicId,resultText).catch(error=>console.error('Telegram client request notification failed:',error.message));
    return json(res,200,{ok:true,request:reviewed.find(item=>item.id===request.id),portal:portalSnapshot()});
  }catch(error){console.error('Client request decision failed:',error.message);return json(res,500,{error:'Не удалось обработать запрос'})}
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
  if(!['order-file','result-photo','source-photo','message-file','cad-review','cad-review-attachment'].includes(purpose))throw new Error('Неизвестный тип файла');
  if(ext==='.html'&&!['cad-review','cad-review-attachment'].includes(purpose))throw new Error('HTML можно загрузить только для согласования CAD');
  if(purpose==='cad-review'&&ext!=='.html')throw new Error('Для согласования CAD нужен HTML-файл');
  if(purpose==='source-photo'&&!['.jpg','.jpeg','.png','.webp'].includes(ext))throw new Error('Исходные фото должны быть JPG, PNG или WebP');
  return {name:safeName,size:bytes,type:storedType,ext,purpose};
}
function uploadOwner(user){return `${user.role}:${user.subjectId}`}
function messageDiskFolder(clinicId){return `/Клиенты/Сообщения/${safeDiskSegment(clinicId)}`}
function telegramDraftDiskFolder(clinicId,key){return `${messageDiskFolder(clinicId)}/Новые заказы/${safeDiskSegment(key)}`}
function newDiskPath({target,orderId,clinicId,name,purpose,largeLinkKey}){
  const folder=target==='message'?messageDiskFolder(clinicId):target==='telegram-draft'?telegramDraftDiskFolder(clinicId,largeLinkKey||'upload'):purpose==='source-photo'?`${orderDiskFolder(orderId)}/Исходные фото`:orderDiskFolder(orderId);
  if(!folder)throw new Error('Не удалось определить папку на Яндекс Диске');
  const day=new Date().toISOString().slice(0,10),unique=randomBytes(8).toString('hex');
  return `${folder}/${day}-${unique}-${name}`;
}
function orderDiskFolder(orderId){return `/Клиенты/${safeDiskSegment(orderId)}`}
function orderMillingFolder(orderId){return `${orderDiskFolder(orderId)}/фрезеровка`}
function isMillingFile(name){return /(?:\.constructionInfo|_cad\.stl)$/i.test(String(name||''))}

function sendTextEmail({to,subject,text,from='orders@createdental.io'}){
  return new Promise((resolve,reject)=>{
    const child=spawn('/usr/sbin/sendmail',['-t','-oi','-f',from],{stdio:['pipe','ignore','pipe']});
    let stderr='';
    child.stderr.on('data',chunk=>{stderr+=chunk.toString()});
    child.once('error',reject);
    child.once('close',code=>code===0?resolve():reject(new Error(stderr.trim()||`sendmail завершился с кодом ${code}`)));
    const encodeHeader=value=>`=?UTF-8?B?${Buffer.from(String(value),'utf8').toString('base64')}?=`;
    child.stdin.end([
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${encodeHeader(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      text
    ].join('\n'));
  });
}

async function ensurePublicOrderFolder(orderId){
  const key=String(orderId||'');
  if(!key)throw new Error('Не указан ID заказа');
  if(publicOrderFolderLinks.has(key))return publicOrderFolderLinks.get(key);
  const token=readIntegrationSecret('yandexDiskToken');
  if(!token)throw new Error('Яндекс Диск не подключён');
  const folder=orderDiskFolder(key);
  await ensureDiskFolder(token,folder);
  const publicUrl=await publishDiskResource(token,folder);
  publicOrderFolderLinks.set(key,publicUrl);
  return publicUrl;
}
async function deleteOrderWithFolder(user,orderId){
  if(user.role!=='technician')throw new Error('forbidden');
  const snapshot=portalSnapshot(),order=snapshot.orders.find(item=>item.id===orderId);
  if(!order)throw new Error('not_found');
  const token=readIntegrationSecret('yandexDiskToken');
  if(!token)throw new Error('disk_not_connected');
  // Delete cloud files before committing the single queued database mutation.
  // Concurrent changes to other orders are never restored from an old snapshot.
  await deleteDiskResource(token,orderDiskFolder(orderId));
  await removePortalOrder(orderId,{role:user.role,name:actorName(user)});
  publicOrderFolderLinks.delete(orderId);orderFileMigrationJobs.delete(orderId);
  const files=orderFiles[orderId]||[];
  for(const file of files)if(file.storage!=='yandex-disk')await fs.promises.unlink(path.join(uploadDir,file.id)).catch(()=>{});
  delete orderFiles[orderId];
  await persistOrderFiles().catch(error=>console.error('Deleted order file metadata cleanup failed:',error.message));
  return order;
}
async function ensureOrderFilesOnDisk(orderId){
  const key=String(orderId||'');
  const legacy=(orderFiles[key]||[]).filter(file=>file.storage!=='yandex-disk');
  if(!legacy.length)return;
  if(orderFileMigrationJobs.has(key))return orderFileMigrationJobs.get(key);
  const job=(async()=>{
    const token=readIntegrationSecret('yandexDiskToken');
    if(!token)throw new Error('Яндекс Диск не подключён');
    await ensurePublicOrderFolder(key);
    let changed=false;
    for(const file of legacy){
      const source=path.join(uploadDir,file.id),diskPath=`${orderDiskFolder(key)}/import-${safeDiskSegment(file.id)}-${cleanUploadName(file.name)}`;
      const data=await fs.promises.readFile(source);
      let metadata=null;
      try{metadata=await diskMetadata(token,diskPath)}catch{/* Upload when this legacy file is not on Disk yet. */}
      if(!metadata){
        const upload=await createDiskUpload(token,diskPath);
        const response=await fetch(upload.href,{method:upload.method||'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:data,signal:AbortSignal.timeout(120000)});
        if(!response.ok)throw new Error(`Яндекс Диск не принял ${file.name}`);
        metadata=await diskMetadata(token,diskPath);
      }
      if(Number(metadata.size)!==data.length)throw new Error(`Размер ${file.name} на Яндекс Диске не совпадает`);
      file.storage='yandex-disk';file.diskPath=diskPath;changed=true;
    }
    if(changed)await persistOrderFiles();
  })();
  orderFileMigrationJobs.set(key,job);
  try{return await job}finally{orderFileMigrationJobs.delete(key)}
}
function publicUploadRecord(record){
  const {diskPath,storage,clinicId,largeLinkKey,...visible}=record;
  return visible;
}
function normalizedUploadName(value){return String(value||'').trim().toLocaleLowerCase('ru-RU')}
function duplicateOrderFile(orderId,description,metadata={}){
  const name=normalizedUploadName(description?.name),size=Number(description?.size)||0,hash=String(metadata?.md5||'');
  return (orderFiles[String(orderId)]||[]).find(file=>{
    if(normalizedUploadName(file.name)===name&&Number(file.size)===size)return true;
    return Boolean(hash&&file.md5&&String(file.md5)===hash);
  })||null;
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
  if(item.target==='message'||item.target==='telegram-draft'){
    const record={id,clinicId:item.clinicId,name:item.name,size:item.size,type:item.type,uploadedAt,uploadedBy,kind:'document',orderEligible:true,source:'large-upload',largeLinkKey:item.largeLinkKey||'',storage:'yandex-disk',diskPath:item.diskPath};
    clinicMessageFiles[id]=record;await saveClinicMessageFiles();
    return {target:'message',attachment:publicUploadRecord(record)};
  }
  const order=portalSnapshot().orders.find(order=>order.id===item.orderId&&order.clinicId===item.clinicId);
  if(!order)throw new Error('Заказ не найден');
  if(item.actorRole==='technician'&&isMillingFile(item.name)){
    const details=portalSnapshot().orderOverrides[order.id]||{};
    if(!details.frameTechnician&&!details.technician){const error=new Error('Сначала назначьте CAM-оператора');error.status=409;throw error}
  }
  const duplicate=duplicateOrderFile(item.orderId,item,metadata);
  if(duplicate){
    await deleteDiskResource(token,item.diskPath).catch(()=>{});
    const error=new Error(`Файл «${item.name}» уже загружен в этот заказ`);error.status=409;throw error;
  }
  if(item.purpose==='cad-review'&&item.actorRole==='worker'){
    const workerId=String(item.owner||'').startsWith('worker:')?String(item.owner).slice(7):'',employee=portalEmployee(workerId),details=portalSnapshot().orderOverrides[order.id]||{};
    if(!employee||!isCadOperatorEmployee(employee)||(details.cadOperator||details.assignee)!==employee.originalName||details.stage!=='Моделирование')throw new Error('CAD-файл можно отправить только CAD оператору на этапе «Моделирование»');
  }
  await ensurePublicOrderFolder(item.orderId);
  const record={id,name:item.name,size:item.size,type:item.type,md5:metadata.md5||'',uploadedAt,uploadedBy,purpose:item.purpose,storage:'yandex-disk',diskPath:item.diskPath};
  orderFiles[item.orderId]=[...(orderFiles[item.orderId]||[]),record];await persistOrderFiles();
  await recordPortalEvent(item.orderId,{role:item.actorRole,name:uploadedBy},'file_uploaded',{summary:item.purpose==='result-photo'?'Добавлено фото готовой работы':item.purpose==='source-photo'?'Добавлены исходные фото от клиники':'Добавлен файл к заказу',fileName:item.name,purpose:item.purpose,clinicId:item.clinicId}).catch(()=>{});
  return {target:'order',file:publicUploadRecord(record)};
}
async function beginDiskUpload(item){
  const token=readIntegrationSecret('yandexDiskToken');
  if(!token)throw new Error('Яндекс Диск не подключён');
  if(item.target==='message')await ensureDiskFolder(token,messageDiskFolder(item.clinicId));
  else if(item.target==='telegram-draft')await ensureDiskFolder(token,telegramDraftDiskFolder(item.clinicId,item.largeLinkKey));
  else {await ensurePublicOrderFolder(item.orderId);if(item.purpose==='source-photo')await ensureDiskFolder(token,`${orderDiskFolder(item.orderId)}/Исходные фото`)}
  const diskPath=newDiskPath(item),upload=await createDiskUpload(token,diskPath),id=randomBytes(18).toString('hex');
  diskUploadSessions.set(id,{...item,id,diskPath,createdAt:Date.now(),expiresAt:Date.now()+uploadSessionLifetime});
  return {mode:'direct',uploadId:id,href:upload.href,method:upload.method,expiresAt:new Date(Date.now()+uploadSessionLifetime).toISOString()};
}
async function uploadEmployeeCadFile({employee,order,name,type,data}){
  if(!employee||employee.status!=='active'||!order||!Buffer.isBuffer(data))throw new Error('Неверные данные CAD-файла');
  const description=validateUploadDescription({name,size:data.length,type,purpose:'cad-review'}),snapshot=portalSnapshot(),details=snapshot.orderOverrides[order.id]||{};
  if(!isCadOperatorEmployee(employee)||(details.cadOperator||details.assignee)!==employee.originalName||details.stage!=='Моделирование')throw new Error('CAD-файл можно загрузить только назначенному CAD оператору на этапе «Моделирование»');
  const token=readIntegrationSecret('yandexDiskToken');if(!token)throw new Error('Яндекс Диск не подключён');
  await ensurePublicOrderFolder(order.id);
  const diskPath=newDiskPath({target:'order',orderId:order.id,clinicId:order.clinicId,name:description.name,purpose:'cad-review'}),upload=await createDiskUpload(token,diskPath);
  const response=await fetch(upload.href,{method:upload.method||'PUT',headers:{'Content-Type':description.type},body:data,signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error('Яндекс Диск не принял CAD-файл');
  return completeDiskUpload({...description,target:'order',orderId:order.id,clinicId:order.clinicId,owner:`worker:${employee.id}`,actorRole:'worker',diskPath},employee.name);
}
uploadEmployeeCadFile.findFile=async(orderId,fileId)=>{
  const file=(orderFiles[String(orderId)]||[]).find(item=>item.id===String(fileId)&&item.purpose==='cad-review'&&path.extname(item.name).toLowerCase()==='.html');
  return file?publicUploadRecord(file):null;
};
uploadEmployeeCadFile.findLatest=async(orderId)=>{
  const file=[...(orderFiles[String(orderId)]||[])].reverse().find(item=>item.purpose==='cad-review'&&path.extname(item.name).toLowerCase()==='.html');
  return file?publicUploadRecord(file):null;
};
async function handleUploads(req,res,url){
  const user=session(req);if(!user)return json(res,401,{error:'Войдите в кабинет'});
  if(req.method==='POST'&&url.pathname==='/api/uploads/init'){
    let body;try{body=await readBody(req,12000)}catch{return json(res,400,{error:'Неверные данные файла'})}
    let description;try{description=validateUploadDescription({name:body.name,size:body.size,type:body.type,purpose:body.purpose||(body.target==='message'?'message-file':'order-file')})}catch(error){return json(res,error.message.includes('200 МБ')?413:400,{error:error.message})}
    const target=body.target==='message'?'message':'order';
    if(target==='order'){
      const order=portalSnapshot().orders.find(item=>item.id===String(body.orderId||''));
      if(!canAccessOrder(user,order))return json(res,404,{error:'Заказ не найден'});
      if(user.role==='technician'&&isMillingFile(description.name)){
        const details=portalSnapshot().orderOverrides[order.id]||{};
        if(!details.frameTechnician&&!details.technician)return json(res,409,{error:'Сначала назначьте CAM-оператора'});
      }
      if(description.purpose==='result-photo'&&(user.role==='clinic'||!['.jpg','.jpeg','.png'].includes(description.ext)))return json(res,403,{error:'Фото результата может добавить только лаборатория в формате JPG или PNG'});
      if(description.purpose==='source-photo'&&(order.productionType!=='analog'||user.role!=='technician'||!['.jpg','.jpeg','.png','.webp'].includes(description.ext)))return json(res,403,{error:'Исходные фото доступны только для аналогового заказа и только главному технику в формате JPG, PNG или WebP'});
      if(description.purpose==='result-photo'&&user.role==='worker'&&portalSnapshot().orderOverrides[order.id]?.stage!=='Контроль качества')return json(res,409,{error:'Фото результата можно добавить на этапе контроля качества'});
      if(description.purpose==='cad-review'&&user.role!=='technician'&&(user.role!=='worker'||!isCadOperatorEmployee(portalEmployee(user.subjectId))||(portalSnapshot().orderOverrides[order.id]?.cadOperator||portalSnapshot().orderOverrides[order.id]?.assignee)!==portalEmployee(user.subjectId)?.originalName||portalSnapshot().orderOverrides[order.id]?.stage!=='Моделирование'))return json(res,409,{error:'CAD-файл можно отправить только CAD оператору на этапе «Моделирование»'});
      if(duplicateOrderFile(order.id,description))return json(res,409,{error:`Файл «${description.name}» уже загружен в этот заказ`});
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
    catch(error){item.completing=false;console.error('Yandex Disk upload completion failed:',error.message);return json(res,error.status===409?409:400,{error:error.message||'Не удалось подтвердить загрузку'})}
  }
  return json(res,404,{error:'Не найдено'});
}
function largeLinkKey(token){return createHash('sha256').update(String(token)).digest('hex')}
function createLargeUploadLink(clinicId,orderId,requestedBy='Клиент Telegram'){
  if(!readIntegrationSecret('yandexDiskToken'))throw new Error('Яндекс Диск ещё не подключён в профиле главного техника');
  const snapshot=portalSnapshot(),order=snapshot.orders.find(item=>item.id===orderId&&item.clinicId===clinicId);
  if(!order)throw new Error('Заказ не найден');
  if(order.telegramDraft||snapshot.orderOverrides[order.id]?.stage==='Черновик из Telegram')throw new Error('Файлы можно загрузить после того, как главный техник примет заказ');
  const token=randomBytes(32).toString('base64url'),key=largeLinkKey(token);
  largeUploadLinks.set(key,{key,clinicId,orderId,requestedBy:String(requestedBy).slice(0,120),createdAt:Date.now(),expiresAt:Date.now()+uploadSessionLifetime,usedAt:0,startedCount:0,completedCount:0});
  void persistLargeUploadLinks().catch(error=>console.error('Large upload link state save failed:',error.message));
  const base=String(process.env.PUBLIC_BASE_URL||'https://createdental.io').replace(/\/$/,'');
  return `${base}/large-upload.html?token=${encodeURIComponent(token)}`;
}
function createLargeUploadDraftLink(clinicId,draftInfo={},requestedBy='Клиент Telegram'){
  if(!readIntegrationSecret('yandexDiskToken'))throw new Error('Яндекс Диск ещё не подключён в профиле главного техника');
  const clinic=portalClient(clinicId);if(!clinic)throw new Error('Клиника не найдена');
  const token=randomBytes(32).toString('base64url'),key=largeLinkKey(token);
  largeUploadLinks.set(key,{key,clinicId,orderId:'',draft:true,draftInfo:{patient:String(draftInfo.patient||'').slice(0,160),work:String(draftInfo.work||'').slice(0,220),date:String(draftInfo.date||'').slice(0,40)},draftAttachmentIds:[],requestedBy:String(requestedBy).slice(0,120),createdAt:Date.now(),expiresAt:Date.now()+uploadSessionLifetime,usedAt:0,startedCount:0,completedCount:0});
  void persistLargeUploadLinks().catch(error=>console.error('Large upload draft link state save failed:',error.message));
  const base=String(process.env.PUBLIC_BASE_URL||'https://createdental.io').replace(/\/$/,'');
  return {href:`${base}/large-upload.html?token=${encodeURIComponent(token)}`,key};
}
function getLargeUploadDraftStatus(key){
  const link=largeUploadLinks.get(String(key||''));
  return {files:link?.draft?Number(link.completedCount)||0:0};
}
async function handleLargeUpload(req,res,url){
  const match=url.pathname.match(/^\/api\/large-upload\/([A-Za-z0-9_-]{30,80})(?:\/(init|complete|cancel|finish)(?:\/([a-f0-9]{36}))?)?$/);
  if(!match)return json(res,404,{error:'Ссылка не найдена'});
  const token=match[1],action=match[2]||'',uploadId=match[3]||'',link=largeUploadLinks.get(largeLinkKey(token));
  if(!link||link.expiresAt<Date.now()||link.usedAt)return json(res,410,{error:'Ссылка истекла или уже использована'});
  const snapshot=portalSnapshot(),order=link.draft?null:snapshot.orders.find(item=>item.id===link.orderId&&item.clinicId===link.clinicId),clinic=portalClient(link.clinicId);
  if(!clinic||(!link.draft&&!order))return json(res,404,{error:'Заказ не найден'});
  if(order&&(order.status==='Отменён'||order.telegramDraft||snapshot.orderOverrides[order.id]?.stage==='Черновик из Telegram'))return json(res,409,{error:'Загрузка файлов доступна после приёма заказа главным техником'});
  if(req.method==='GET'&&!action)return json(res,200,{clinic:clinic.name,orderId:link.draft?'Новый заказ':order.id,patient:link.draft?link.draftInfo.patient:order.patient,work:link.draft?link.draftInfo.work:orderWorkLabel(order),date:link.draft?link.draftInfo.date:order.date,draft:Boolean(link.draft),maxSize:maximumAttachmentSize,maxFiles:maximumLargeUploadFiles,uploadedFiles:link.completedCount||0,existingFiles:link.draft?[]:(orderFiles[order.id]||[]).map(file=>({name:file.name,size:Number(file.size)||0})),expiresAt:new Date(link.expiresAt).toISOString()});
  if(req.method==='POST'&&action==='init'){
    if((link.startedCount||0)>=maximumLargeUploadFiles)return json(res,409,{error:`По одной ссылке можно загрузить не больше ${maximumLargeUploadFiles} файлов`});
    let body;try{body=await readBody(req,12000)}catch{return json(res,400,{error:'Неверные данные файла'})}
    let description;try{description=validateUploadDescription({name:body.name,size:body.size,type:body.type,purpose:'order-file'})}catch(error){return json(res,error.message.includes('200 МБ')?413:400,{error:error.message})}
    if(!link.draft&&duplicateOrderFile(order.id,description))return json(res,409,{error:`Файл «${description.name}» уже загружен в этот заказ`});
    link.startedCount=(link.startedCount||0)+1;
    try{return json(res,200,await beginDiskUpload({...description,target:link.draft?'telegram-draft':'order',orderId:order?.id||'',clinicId:clinic.id,owner:`large:${link.key}`,actorRole:'clinic',largeLinkKey:link.key}))}
    catch(error){link.startedCount=Math.max(0,(link.startedCount||1)-1);console.error('Large upload init failed:',error.message);return json(res,502,{error:'Не удалось подготовить загрузку на Яндекс Диск'})}
  }
  if(req.method==='POST'&&action==='complete'&&uploadId){
    const item=diskUploadSessions.get(uploadId);
    if(!item||item.expiresAt<Date.now()||item.owner!==`large:${link.key}`||item.largeLinkKey!==link.key)return json(res,404,{error:'Загрузка не найдена или истекла'});
    if(item.completing)return json(res,409,{error:'Загрузка уже обрабатывается'});item.completing=true;
    try{
      const result=await completeDiskUpload(item,`Telegram · ${link.requestedBy}`),file=result.file||result.attachment;
      if(link.draft)link.draftAttachmentIds=[...(link.draftAttachmentIds||[]),file.id];
      diskUploadSessions.delete(item.id);link.completedCount=(link.completedCount||0)+1;void persistLargeUploadLinks().catch(()=>{});
      return json(res,201,{ok:true,file,orderId:link.draft?'':order.id});
    }catch(error){item.completing=false;console.error('Large upload completion failed:',error.message);return json(res,error.status===409?409:400,{error:error.message||'Не удалось подтвердить загрузку'})}
  }
  if(req.method==='POST'&&action==='cancel'&&uploadId){
    const item=diskUploadSessions.get(uploadId);
    if(!item||item.expiresAt<Date.now()||item.owner!==`large:${link.key}`||item.largeLinkKey!==link.key)return json(res,404,{error:'Загрузка не найдена или истекла'});
    if(item.completing)return json(res,409,{error:'Файл уже отправляется'});
    try{await deleteDiskResource(readIntegrationSecret('yandexDiskToken'),item.diskPath)}catch(error){console.error('Large upload cancel cleanup failed:',error.message)}
    diskUploadSessions.delete(item.id);link.startedCount=Math.max(0,(link.startedCount||1)-1);
    return json(res,200,{ok:true});
  }
  if(req.method==='POST'&&action==='finish'){
    const completed=Math.min(maximumLargeUploadFiles,Number(link.completedCount)||0);
    if(!completed)return json(res,409,{error:'Сначала загрузите хотя бы один файл'});
    link.usedAt=Date.now();
    void persistLargeUploadLinks().catch(()=>{});
    const notification=link.draft
      ?`Файлы пациента загружены (${completed}). Вернитесь к созданию заказа и продолжите оформление.`
      :`✅ ${completed} ${completed===1?'файл':completed<5?'файла':'файлов'} загружено к заказу ${order.id}. Файлы уже прикреплены к заказу и доступны главному технику.`;
    const extra=link.draft?{reply_markup:{inline_keyboard:[[{text:'✅ Файлы загружены, продолжить',callback_data:'tgnew:files:done'}]]}}:{};
    const notified=await telegramBridge?.sendAutomatedMessage(link.clinicId,notification,extra).catch(error=>{console.error('Telegram upload completion notification failed:',error.message);return false})||false;
    return json(res,201,{ok:true,files:completed,orderId:link.draft?'':order.id,telegramNotified:notified});
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
    if(req.method==='GET'){
      let folderUrl='';
      try{await ensureOrderFilesOnDisk(orderId)}catch(error){console.error('Legacy order file migration failed:',error.message)}
      try{folderUrl=await ensurePublicOrderFolder(orderId)}catch(error){console.error('Yandex Disk folder publication failed:',error.message)}
      const rawFiles=orderFiles[orderId]||[];
      for(const file of rawFiles.filter(item=>item.purpose==='cad-review'&&path.extname(item.name).toLowerCase()==='.html'))void readCadHtml({file}).catch(error=>console.error('CAD prefetch failed:',error.message));
      const visibleFiles=rawFiles.map(({id,name,size,type,uploadedAt,uploadedBy,purpose})=>({id,name,size,type,uploadedAt,uploadedBy,purpose:purpose||'order-file'}));
      return json(res,200,{folderUrl,files:visibleFiles});
    }
    if(req.method!=='POST')return json(res,405,{error:'Метод не поддерживается'});
    return json(res,410,{error:'Загружайте файлы через Яндекс Диск'});
    /* Legacy local upload code is intentionally unreachable. */
    const name=decodeURIComponent(String(req.headers['x-upload-name']||'')).replace(/[\\/\\0-\\x1f]/g,'_').trim().slice(0,180);
    const ext=path.extname(name).toLowerCase();
    const purpose=String(req.headers['x-file-purpose']||'order-file');
    if(!['order-file','result-photo','source-photo','cad-review'].includes(purpose))return json(res,400,{error:'Неизвестный тип файла'});
    if(purpose==='result-photo'&&(user.role==='clinic'||!['.jpg','.jpeg','.png'].includes(ext)))return json(res,403,{error:'Фото результата может добавить только лаборатория в формате JPG или PNG'});
    if(purpose==='source-photo'&&(order.productionType!=='analog'||user.role!=='technician'||!['.jpg','.jpeg','.png','.webp'].includes(ext)))return json(res,403,{error:'Исходные фото доступны только для аналогового заказа и только главному технику в формате JPG, PNG или WebP'});
    if(purpose==='result-photo'&&user.role==='worker'&&portalSnapshot().orderOverrides[orderId]?.stage!=='Контроль качества')return json(res,409,{error:'Фото результата можно добавить на этапе контроля качества'});
    if(ext==='.html'&&purpose!=='cad-review'||purpose==='cad-review'&&ext!=='.html')return json(res,400,{error:'Для согласования CAD нужен HTML-файл'});
    if(purpose==='cad-review'&&user.role!=='technician'&&(user.role!=='worker'||!isCadOperatorEmployee(portalEmployee(user.subjectId))||(portalSnapshot().orderOverrides[orderId]?.cadOperator||portalSnapshot().orderOverrides[orderId]?.assignee)!==portalEmployee(user.subjectId)?.originalName||portalSnapshot().orderOverrides[orderId]?.stage!=='Моделирование'))return json(res,409,{error:'CAD-файл можно отправить только CAD оператору на этапе «Моделирование»'});
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
      return json(res,201,{file:record});
    }catch{return json(res,500,{error:'Не удалось сохранить файл'})}
  }
  const match=url.pathname.match(/^\/api\/order-files\/([a-f0-9]{36})$/);
  if(match&&req.method==='GET'){
    const record=Object.entries(orderFiles).flatMap(([id,files])=>files.filter(file=>file.id===match[1]).map(file=>({orderId:id,file})))[0];
    if(!record||!canAccessOrder(user,portalSnapshot().orders.find(item=>item.id===record.orderId)))return json(res,404,{error:'Файл не найден'});
    if(url.searchParams.get('content')==='1'){
      if(record.file.purpose!=='cad-review'||path.extname(record.file.name).toLowerCase()!=='.html')return json(res,403,{error:'Предпросмотр доступен только для CAD HTML'});
      try{
        const html=await readCadHtml(record),headers={'Content-Type':'text/html; charset=utf-8','Content-Length':Buffer.byteLength(html,'utf8'),'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(record.file.name)}`,'Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'};
        res.writeHead(200,headers);res.end(html);return;
      }catch(error){console.error('CAD preview load failed:',error.message);return json(res,504,{error:'Не удалось быстро загрузить CAD. Повторите открытие ещё раз.'})}
    }
    if(record.file.storage==='yandex-disk'){
      try{const href=await signedDiskRecordUrl(record.file);if(url.searchParams.get('link')==='1')return json(res,200,{url:href,name:record.file.name,type:record.file.type});res.writeHead(302,{Location:href,'Cache-Control':'private, no-store'});return res.end()}
      catch{return json(res,404,{error:'Файл не найден на Яндекс Диске'})}
    }
    try{const data=await fs.promises.readFile(path.join(uploadDir,record.file.id));res.writeHead(200,{'Content-Type':record.file.type,'Content-Length':data.length,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(record.file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});return res.end(data)}catch{return json(res,404,{error:'Файл не найден'})}
  }
  return json(res,404,{error:'Не найдено'});
}

function orderMillingIdFromRoute(pathname){
  return pathname.match(/^\/api\/orders\/([A-Za-z0-9_-]{1,80})\/milling$/)?.[1]||'';
}

async function handleOrderMilling(req,res,url){
  const user=session(req);
  if(!user)return json(res,401,{error:'Войдите в кабинет'});
  if(user.role!=='technician')return json(res,403,{error:'Отправлять файлы на фрезеровку может только главный техник'});
  if(req.method!=='POST')return json(res,405,{error:'Метод не поддерживается'});
  const orderId=orderMillingIdFromRoute(url.pathname),snapshot=portalSnapshot(),order=snapshot.orders.find(item=>item.id===orderId);
  if(!order)return json(res,404,{error:'Заказ не найден'});
  try{
    const details=snapshot.orderOverrides[orderId]||{};
    if(details.cadReview?.status!=='approved')return json(res,409,{error:'Отправка на фрезеровку доступна только после согласования CAD врачом'});
    if(!details.frameTechnician&&!details.technician)return json(res,409,{error:'Сначала назначьте CAM-оператора'});
    await ensureOrderFilesOnDisk(orderId);
    const sourceFiles=(orderFiles[orderId]||[]).filter(file=>file.storage==='yandex-disk'&&file.diskPath&&isMillingFile(file.name));
    if(!sourceFiles.length)return json(res,409,{error:'В папке заказа нет файлов .constructionInfo или _cad.stl'});
    const token=readIntegrationSecret('yandexDiskToken');
    if(!token)return json(res,503,{error:'Яндекс Диск не подключён'});
    const folder=orderMillingFolder(orderId);
    await ensureDiskFolder(token,folder);
    const fileNames=[];
    const usedNames=new Set();
    for(const source of sourceFiles){
      const base=cleanUploadName(path.basename(source.name))||'файл';
      let targetName=base,index=2;
      while(usedNames.has(targetName)){targetName=`${path.parse(base).name}-${index++}${path.extname(base)}`}
      usedNames.add(targetName);fileNames.push(targetName);
      const targetPath=`${folder}/${targetName}`;
      let exists=false;
      try{await diskMetadata(token,targetPath);exists=true}catch{/* The copy below creates a missing duplicate. */}
      if(!exists)await copyDiskResource(token,source.diskPath,targetPath);
      else await copyDiskResource(token,source.diskPath,targetPath,{overwrite:true});
    }
    const folderUrl=await publishDiskResource(token,folder);
    const previous=snapshot.orderOverrides[orderId]||{},previousMilling=previous.milling||{},sendCount=Number(previousMilling.sendCount)||0;
    const sentAt=new Date().toISOString();
    const repeated=Boolean(previousMilling.sentAt);
    await sendTextEmail({to:'e.brmv97@gmail.com',subject:`${order.id} фрезеровка${repeated?' (повторно)':''}`,text:`Заказ ${order.id}${repeated?'\nПовторная отправка':''}\n\nПапка фрезеровки на Яндекс Диске:\n${folderUrl}\n`});
    const milling={...previousMilling,folderUrl,fileNames,sentAt,lastSentAt:sentAt,completedAt:'',sendCount:sendCount+1,recipient:'e.brmv97@gmail.com'};
    await replacePortalCollection('orderOverrides',{...snapshot.orderOverrides,[orderId]:{...previous,milling}},{role:'technician',name:actorName(user)});
    await recordPortalEvent(orderId,{role:'technician',name:actorName(user)},'milling_sent',{clinicId:order.clinicId,summary:repeated?'Файлы повторно отправлены на фрезеровку':'Файлы отправлены на фрезеровку',fileNames}).catch(()=>{});
    return json(res,200,{ok:true,resent:repeated,folderUrl,files:fileNames,sentAt,milling});
  }catch(error){
    console.error('Order milling request failed:',error.message);
    return json(res,502,{error:error.message||'Не удалось отправить файлы на фрезеровку'});
  }
}

async function handleCadReview(req,res,url){
  const user=session(req);if(!user)return json(res,401,{error:'Войдите в кабинет'});
  if(req.method!=='POST')return json(res,405,{error:'Метод не поддерживается'});
  const orderId=url.pathname.match(/^\/api\/orders\/([A-Za-z0-9_-]{1,80})\/cad-review$/)?.[1]||'',snapshot=portalSnapshot();
  const order=snapshot.orders.find(item=>item.id===orderId);if(!order)return json(res,404,{error:'Заказ не найден'});
  let body;try{body=await readBody(req,12000)}catch{return json(res,400,{error:'Неверные данные'})}
  const details=snapshot.orderOverrides[orderId]||{},now=new Date().toISOString();
  if(body.action==='submit'){
    const employee=user.role==='worker'?portalEmployee(user.subjectId):null;
    if(!employee||!isCadOperatorEmployee(employee)||(details.cadOperator||details.assignee)!==employee.originalName)return json(res,403,{error:'CAD может отправить только назначенный CAD оператор'});
    if(details.stage!=='Моделирование')return json(res,409,{error:'CAD можно отправить только на этапе «Моделирование»'});
    const file=(orderFiles[orderId]||[]).find(item=>item.id===String(body.fileId||'')&&item.purpose==='cad-review'&&path.extname(item.name).toLowerCase()==='.html');
    if(!file)return json(res,404,{error:'CAD HTML не найден'});
    const review={status:'pending',fileId:file.id,fileName:file.name,sentAt:now,sentBy:employee.name,revision:Number(details.cadReview?.revision||0)+1,comment:''};
    const next={...snapshot.orderOverrides,[orderId]:{...details,stage:'Контроль качества',cadOperatorStatus:'ОТК',qualityRequest:{kind:'cad',employeeId:user.subjectId,requestedBy:employee.originalName,requestedByName:employee.name,requestedAt:now,next:'CAD на согласование у врача'},cadReview:review}};
    try{
      await replacePortalCollection('orderOverrides',next,{role:'worker',name:employee.name});
      await recordPortalEvent(orderId,{role:'worker',name:employee.name},'cad_review_requested',{clinicId:order.clinicId,summary:`CAD передан главному технику на ОТК · версия ${review.revision}`,fileId:file.id,fileName:file.name}).catch(()=>{});
      return json(res,201,{ok:true,orderOverride:portalSnapshot().orderOverrides[orderId]});
    }catch(error){console.error('CAD review submit failed:',error.message);return json(res,500,{error:'Не удалось отправить CAD на проверку главному технику'})}
  }
  if(!['approve','return'].includes(body.action))return json(res,400,{error:'Неизвестное действие'});
  if(user.role!=='clinic'||order.clinicId!==user.subjectId)return json(res,403,{error:'Решение может принять только врач этой клиники'});
  if(details.stage!=='Согласование CAD'||details.cadReview?.status!=='pending')return json(res,409,{error:'CAD уже рассмотрен или не отправлен на согласование'});
  const reviewer=user.displayName||portalClient(user.subjectId)?.contact||portalClient(user.subjectId)?.name||'Врач',comment=String(body.comment||'').replace(/[<>]/g,'').trim().slice(0,2000);
  if(body.action==='return'&&comment.length<5)return json(res,400,{error:'Опишите, что нужно исправить'});
  const attachmentIds=[...new Set(Array.isArray(body.attachments)?body.attachments.map(id=>String(id||'')).filter(Boolean).slice(0,10):[])];
  const orderAttachments=(orderFiles[orderId]||[]).filter(file=>attachmentIds.includes(file.id)&&file.purpose==='cad-review-attachment');
  if(orderAttachments.length!==attachmentIds.length)return json(res,400,{error:'Не удалось проверить прикреплённые файлы'});
  const approved=body.action==='approve',review={...details.cadReview,status:approved?'approved':'returned',reviewedAt:now,reviewedBy:reviewer,comment:approved?'':comment,...(orderAttachments.length?{attachments:orderAttachments.map(publicUploadRecord)}:{})};
  const next={...snapshot.orderOverrides,[orderId]:{...details,...cadDecisionChange(details,approved,review)}};
  try{
    await replacePortalCollection('orderOverrides',next,{role:'clinic',name:reviewer});
    await recordPortalEvent(orderId,{role:'clinic',name:reviewer},approved?'cad_review_approved':'cad_review_returned',{clinicId:order.clinicId,summary:approved?'CAD подтверждён врачом':`CAD возвращён моделировщику: ${comment}`,comment}).catch(()=>{});
    void telegramBridge?.sendAutomatedMessage(order.clinicId,approved?`CAD по заказу ${order.id} подтверждён. Заказ передан в изготовление.`:`CAD по заказу ${order.id} возвращён моделировщику. Комментарий: ${comment}`).catch(error=>console.error('Telegram CAD decision notification failed:',error.message));
    return json(res,200,{ok:true,orderOverride:publicClinicOverride(portalSnapshot().orderOverrides[orderId])});
  }catch(error){console.error('CAD review decision failed:',error.message);return json(res,500,{error:'Не удалось сохранить решение по CAD'})}
}

async function handleOrderResource(req,res,url){
  const user=session(req);if(!user)return json(res,401,{error:'Войдите в кабинет'});
  if(user.role!=='technician')return json(res,403,{error:'Удалять заказы может только главный техник'});
  if(req.method!=='DELETE')return json(res,405,{error:'Метод не поддерживается'});
  const orderId=url.pathname.match(/^\/api\/orders\/([A-Za-z0-9_-]{1,80})$/)?.[1]||'';
  if(!orderId)return json(res,404,{error:'Заказ не найден'});
  try{await deleteOrderWithFolder(user,orderId);return json(res,200,{ok:true})}
  catch(error){
    if(error.message==='not_found')return json(res,404,{error:'Заказ не найден'});
    if(error.message==='forbidden')return json(res,403,{error:'Доступ запрещён'});
    if(error.message==='disk_not_connected')return json(res,503,{error:'Яндекс Диск не подключён. Заказ не удалён'});
    console.error('Order and Yandex Disk folder deletion failed:',error.message);
    return json(res,502,{error:'Не удалось удалить папку на Яндекс Диске. Заказ сохранён'});
  }
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
      if(user.role==='technician')return event.action==='message_received'||event.action==='clinic_registered'||event.action==='telegram_binding_requested'||event.action==='order_created'||event.action.startsWith('cad_review_')||(event.action==='stage_changed'&&['Контроль качества','Работа принята','Принято доктором'].includes(event.to));
      return event.actorRole!=='clinic'&&(event.clinicId===user.subjectId||accessible.has(event.orderId))&&!(event.action==='stage_changed'&&event.to==='На доработке');
    });
    const readAt=notificationReads[key]||'';
    const describe=event=>{
      const order=snapshot.orders.find(item=>item.id===event.orderId),clinic=portalClient(event.clinicId||order?.clinicId);
      if(event.action==='clinic_registered')return `Новая регистрация: ${event.summary||event.actor||'клиника'}`;
      if(event.action==='message_received')return `Новое сообщение от ${event.actor||clinic?.name||'клиники'}`;
      if(event.action==='telegram_binding_requested')return `Запрос на подключение Telegram: ${event.summary||clinic?.name||'клиника'}`;
      if(event.action==='order_created')return `Новый заказ ${event.orderId}${order?.clinic||clinic?.name?` от ${order?.clinic||clinic?.name}`:''}`;
      if(event.action==='stage_changed'&&event.to==='Контроль качества')return `Заказ ${event.orderId} требует проверки качества`;
      if(event.action==='stage_changed'&&event.to==='Работа принята')return `Работа принята: заказ ${event.orderId}`;
      if(event.action==='stage_changed'&&event.to==='Принято доктором')return `Клиент принял работу по заказу ${event.orderId}`;
      if(event.action==='stage_changed')return `Заказ ${event.orderId}: ${event.to}`;
      if(event.action==='assignee_changed')return user.role==='clinic'?`Заказ ${event.orderId}: исполнитель назначен`:`Заказ ${event.orderId}: исполнитель ${event.to}`;
      if(event.action==='rework_requested')return `Заказ ${event.orderId}: запрошена доработка`;
      if(event.action==='cad_review_requested')return event.summary?.includes('ОТК')?`Заказ ${event.orderId}: CAD передан главному технику на проверку`:`Заказ ${event.orderId}: CAD ожидает согласования врача`;
      if(event.action==='cad_review_approved')return `Заказ ${event.orderId}: врач подтвердил CAD`;
      if(event.action==='cad_review_returned')return `Заказ ${event.orderId}: врач вернул CAD с комментарием`;
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
      if(event.action==='stage_changed'&&['Работа принята','Принято доктором'].includes(event.to))return {type:'quality',target:'detail',clinicId:event.clinicId||''};
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
  if(name==='telegramBotToken'||name==='employeeTelegramBotToken')return /^\d{6,15}:[A-Za-z0-9_-]{20,}$/.test(value);
  if(name==='folderId')return /^[a-z0-9]{10,50}$/.test(value);
  if(name==='yandexDiskToken')return value.length>=20;
  return value.length>=20;
}

function combinedIntegrationStatus(){
  const status=telegramBridge?.status()||{telegramBot:false,speechKit:false,yandexGpt:false,folderId:false,ready:false,enabled:false};
  return {...status,...(employeeTelegramBridge?.status()||{}),yandexDisk:Boolean(readIntegrationSecret('yandexDiskToken'))};
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
  for(const [name] of supplied)if(!validIntegrationSecret(name,body[name].trim()))return json(res,400,{error:name==='telegramBotToken'?'Проверьте токен Telegram-бота':name==='employeeTelegramBotToken'?'Проверьте токен Telegram-бота сотрудников':name==='folderId'?'Проверьте ID каталога Yandex Cloud':name==='yandexDiskToken'?'Проверьте OAuth-токен Яндекс Диска':'Проверьте API-ключ Yandex Cloud'});
  try{
    const diskEntry=supplied.find(([name])=>name==='yandexDiskToken');
    if(diskEntry)await ensureDiskFolder(body.yandexDiskToken.trim(),'/Клиенты');
    for(const [name,file] of supplied)await writeIntegrationSecret(file,body[name].trim());
    await telegramBridge.reloadSecrets();
    await employeeTelegramBridge?.reloadSecrets();
    return json(res,200,{ok:true,status:combinedIntegrationStatus()});
  }catch(error){console.error('Integration settings failed:',error.message);return json(res,500,{error:String(error.message||'').toLowerCase().includes('диск')||supplied.some(([name])=>name==='yandexDiskToken')?'Не удалось подключить Яндекс Диск. Проверьте OAuth-токен и права чтения/записи':'Не удалось сохранить настройки интеграции'})}
}

async function handleEmployeeTelegramPair(req,res){
  const user=session(req);
  if(!user)return json(res,401,{error:'Войдите в кабинет'});
  if(user.role!=='worker')return json(res,403,{error:'Подключить Telegram можно из кабинета сотрудника'});
  if(req.method!=='POST')return json(res,405,{error:'Метод не поддерживается'});
  try{return json(res,200,{ok:true,pairing:await employeeTelegramBridge.createPairing(user.subjectId)})}
  catch(error){return json(res,400,{error:error.message||'Не удалось создать код подключения'})}
}

async function handleOrderRework(req,res,url){
  const user=session(req);if(!user)return json(res,401,{error:'Войдите в кабинет'});
  if(req.method!=='POST')return json(res,405,{error:'Метод не поддерживается'});
  const id=url.pathname.match(/^\/api\/orders\/([A-Za-z0-9_-]{1,80})\/rework$/)?.[1];
  if(!id)return json(res,404,{error:'Не найдено'});
  const snapshot=portalSnapshot(),order=snapshot.orders.find(item=>item.id===id);
  if(user.role!=='clinic'||!order||order.clinicId!==user.subjectId)return json(res,404,{error:'Заказ не найден'});
  const old=snapshot.orderOverrides[id]||{};
  const currentStage=old.stage||(['В пути к вам','В доставке'].includes(order.status)?'В доставке':order.status==='Принято'?'Принято доктором':order.status);
  if(currentStage!=='В доставке')return json(res,409,{error:'Отправить заказ на доработку можно после доставки'});
  let body;try{body=await readBody(req,6000)}catch{return json(res,400,{error:'Укажите причину доработки'})}
  const reason=String(body.reason||'').trim();
  if(reason.length<5||reason.length>2000)return json(res,400,{error:'Опишите причину доработки (от 5 до 2000 символов)'});
  const next={...snapshot.orderOverrides,[id]:{...old,stage:'На доработке',reworkKind:'pending',reworkNeedsAssignment:true,reworkReason:reason,reworkAt:new Date().toISOString()}};
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
    // Employee identity and contact details are managed by the chief technician.
    // Only the worker's password and avatar may be changed from this cabinet.
    const name=String(employee.name||'').trim(),specialty=String(employee.specialty||'').trim(),phone=String(employee.phone||'').trim(),email=String(employee.email||'').trim().toLowerCase();
    if(name.length<2||name.length>120||/[<>]/.test(name+specialty+phone)||specialty.length>120||phone.length>40||!validEmail(email))return json(res,400,{error:'Профиль сотрудника заполнен неверно'});
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
    const phone=String(body.phone||'').trim(),country=String(body.country||'').trim(),city=String(body.city||'').trim(),address=String(body.address||'').trim();
    const promoCode=String(body.promoCode||'').trim().toUpperCase();
    const allowedCountries=new Set(['RU','BY','AM','KZ','UZ','AE']);
    if(body.personalDataConsentVersion!=='1.0')return json(res,400,{error:'Для регистрации необходимо дать отдельное согласие на обработку персональных данных'});
    if(name.length<2||name.length>120||/[<>]/.test(name)||!validEmail(email)||!validPassword(body.password)||hasAccount(email))return json(res,400,{error:'Проверьте название, email и пароль (от 8 символов)'});
    if(!allowedCountries.has(country))return json(res,400,{error:'Выберите страну'});
    if(phone&&!/^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(phone)||city.length>120||address.length>250||/[<>]/.test(city+address))return json(res,400,{error:'Проверьте телефон, город и адрес'});
    if(promoCode&&!portalSnapshot().promoCodes?.some(item=>item.active!==false&&String(item.code||'').toUpperCase()===promoCode))return json(res,400,{error:'Промокод не найден или больше не действует'});
    const existing=portalSnapshot().clients.find(item=>item.email?.toLowerCase()===email&&!item.deleted);
    const id=existing?.id||'client-'+randomBytes(12).toString('hex');
    const client={...(existing||{}),id,originalName:existing?.originalName||id,name,email,contact:existing?.contact||'',phone,city,address,country,promoCode,approved:existing?.approved??false,personalDataConsent:{version:'1.0',acceptedAt:new Date().toISOString()}};
    try{const clients=portalSnapshot().clients;await replacePortalCollection('clients',existing?clients.map(item=>item.id===id?client:item):[...clients,client]);await createAccount({email,password:body.password,role:'clinic',subjectId:id});await recordPortalEvent('',{role:'clinic',name},'clinic_registered',{clinicId:id,summary:name}).catch(()=>{});return json(res,201,{pendingApproval:true,email});}
    catch{return json(res,500,{error:'Не удалось создать кабинет'})}
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/login'){
    if(isOwnerOnlyEmail(body.email))return json(res,403,{error:'Для владельца откройте отдельный вход: /owner/login'});
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
  await ensurePublicOrderFolder(orderId);
  const existing=(orderFiles[orderId]||[]).find(file=>telegramActionId&&file.telegramActionId===telegramActionId&&file.sourceAttachmentId===source.id);
  if(existing)return existing;
  const duplicate=duplicateOrderFile(orderId,source);
  if(duplicate)throw new Error(`Файл «${source.name}» уже загружен в этот заказ`);
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

async function claimLargeUploadDraft(key,orderId,telegramActionId=''){
  const link=largeUploadLinks.get(String(key||''));
  if(!link?.draft||!orderId)return {attached:0,total:0};
  const ids=[...(link.draftAttachmentIds||[])];
  let attached=0;
  for(const id of ids){
    const source=clinicMessageFiles[String(id)];
    if(!source||!source.orderEligible)continue;
    try{await attachTelegramFileToOrder(orderId,link.clinicId,{id:source.id,name:source.name,size:source.size,type:source.type,orderEligible:true},telegramActionId);attached+=1}
    catch(error){console.error('Large draft attachment claim failed:',error.message)}
  }
  link.claimedOrderId=orderId;link.claimedAt=Date.now();link.claimedCount=attached;
  return {attached,total:ids.length};
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
    return json(res,410,{error:'Загружайте файлы через Яндекс Диск'});
    /* Legacy local upload code is intentionally unreachable. */
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
  const landingRoute=pathname==='/landing'||pathname==='/landing/';
  const publicLandingRoute=pathname==='/'||landingRoute;
  if (/^\/owner(?:\/(?:login|overview|finance|economics|production|team|clients|settings))?\/?$/.test(pathname)) {
    file = path.join(root, 'owner.html');
  } else if (pathname==='/favicon.ico') {
    file = path.join(root, 'public', 'assets', 'favicon.ico');
  } else if (publicFiles.has(pathname)||appRoute||publicLandingRoute) {
    file = path.join(root, appRoute ? 'index.html' : publicLandingRoute ? 'landing.html' : pathname);
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
    const headers={'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':cacheControl,'X-Content-Type-Options':'nosniff'};
    const canCompress=/\.(?:html|css|js)$/.test(file)&&/\bgzip\b/i.test(String(req.headers['accept-encoding']||''));
    if(req.method==='HEAD')return res.writeHead(200,headers).end();
    if(canCompress){
      gzip(data,(gzipError,compressed)=>{
        if(gzipError)return res.writeHead(200,headers).end(data);
        res.writeHead(200,{...headers,'Content-Encoding':'gzip','Vary':'Accept-Encoding','Content-Length':compressed.length});
        res.end(compressed);
      });
      return;
    }
    res.writeHead(200,{...headers,'Content-Length':data.length});
    res.end(data);
  });
}

const requestHandler=async (req,res) => {
  secureHeaders(req,res);
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); } catch { return json(res, 400, {error:'Неверный адрес'}); }
  const metricKey=url.pathname.startsWith('/api/')?`${req.method} ${url.pathname}`:'';
  const metricStartedAt=metricKey?process.hrtime.bigint():null;
  if(metricKey)res.once('finish',()=>recordApiMetric(metricKey,Number(process.hrtime.bigint()-metricStartedAt)/1e6,res.statusCode||0));
  const isSecure=Boolean(req.socket.encrypted)||req.headers['x-forwarded-proto']==='https';
  if(httpsRedirect&&!isSecure){const requestHost=String(req.headers.host||'').replace(/[^A-Za-z0-9.:[\]-]/g,'');if(!requestHost)return json(res,400,{error:'Неверный адрес'});res.writeHead(308,{Location:`https://${requestHost}${req.url||'/'}`,'Cache-Control':'no-store'});return res.end()}
  if(url.pathname==='/api/health'){
    if(req.method!=='GET')return json(res,405,{error:'Метод не поддерживается'});
    if(!isOperator(req))return json(res,supportToken?401:503,{error:supportToken?'Требуется ключ оператора':'Метрики не настроены'});
    return json(res,200,{ok:true,service:'create-dental',metrics:apiMetricsSnapshot()});
  }
  if(url.pathname.startsWith('/api/large-upload/')){try{return await handleLargeUpload(req,res,url)}catch(error){console.error('Large upload request failed:',error.message);return json(res,500,{error:'Ошибка загрузки файла'})}}
  if(url.pathname.startsWith('/api/cad-preview/')){try{return await handleCadPreview(req,res,url)}catch(error){console.error('CAD preview request failed:',error.message);return json(res,500,{error:'Ошибка предпросмотра CAD'})}}
  if(url.pathname.startsWith('/api/owner/'))return handleOwner(req,res,url);
  if(url.pathname.startsWith('/api/')&&session(req)?.role==='owner'&&url.pathname!=='/api/auth/logout')return json(res,403,{error:'Используйте кабинет владельца'});
  if(url.pathname==='/api/payroll'||url.pathname==='/api/payroll/settings')return handlePayroll(req,res,url,{user:session(req),json,readBody});
  if(url.pathname.startsWith('/api/auth/'))return handleAuth(req,res,url);
  if(url.pathname==='/api/uploads/init'||url.pathname.startsWith('/api/uploads/')){try{return await handleUploads(req,res,url)}catch(error){console.error('Upload request failed:',error.message);return json(res,500,{error:'Ошибка загрузки файла'})}}
  if(url.pathname==='/api/clinic-message-files'||url.pathname.startsWith('/api/clinic-message-files/')){
    try{return await handleClinicMessageFiles(req,res,url)}catch{return json(res,500,{error:'Ошибка файла сообщения'})}
  }
  if(url.pathname.startsWith('/api/orders/')&&(url.pathname.endsWith('/files')||url.pathname.endsWith('/rework')||url.pathname.endsWith('/cad-review')||url.pathname.endsWith('/client-request')||url.pathname.endsWith('/milling'))){
    try{return url.pathname.endsWith('/client-request')?await handleClientRequestCreate(req,res,url):url.pathname.endsWith('/cad-review')?await handleCadReview(req,res,url):url.pathname.endsWith('/rework')?await handleOrderRework(req,res,url):url.pathname.endsWith('/milling')?await handleOrderMilling(req,res,url):await handleOrderFiles(req,res,url)}catch(error){console.error('Order request failed:',error.message);return json(res,500,{error:'Ошибка обработки заказа'})}
  }
  if(/^\/api\/orders\/[A-Za-z0-9_-]{1,80}$/.test(url.pathname))return handleOrderResource(req,res,url);
  if(url.pathname==='/api/notifications')return handleNotifications(req,res);
  if(url.pathname==='/api/integrations/telegram')return handleTelegramIntegration(req,res);
  if(url.pathname==='/api/employee-telegram/pair')return handleEmployeeTelegramPair(req,res);
  if(url.pathname.startsWith('/api/order-files/')){try{return await handleOrderFiles(req,res,url)}catch{return json(res,500,{error:'Ошибка чтения файла'})}}
  if(url.pathname==='/api/locations')return handleLocations(req,res,url);
  if(url.pathname==='/api/clinic-messages'||url.pathname.startsWith('/api/chief/conversations')){
    try{return await handleClinicMessages(req,res,url)}catch{return json(res,500,{error:'Ошибка сообщений'})}
  }
  if(url.pathname.startsWith('/api/client-requests/'))return handleClientRequestDecision(req,res,url);
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
telegramBridge=createTelegramBridge({onClinicMessage:appendTelegramClinicMessage,onBotMessage:appendTelegramClinicMessage,saveTelegramAttachment,attachOrderFile:attachTelegramFileToOrder,loadClinicAttachment:loadTelegramAttachment,createLargeUploadLink,createLargeUploadDraftLink,getLargeUploadDraftStatus,claimLargeUploadDraft,createCadPreviewLink,onOrderCreated:ensurePublicOrderFolder});
employeeTelegramBridge=createEmployeeTelegramBridge({
  tokenFile:integrationSecretFiles.employeeTelegramBotToken,
  uploadCadFile:uploadEmployeeCadFile,
  notifyCadReview:async({order})=>{const previewUrl=createCadPreviewLink(order);const extra=previewUrl?{reply_markup:{inline_keyboard:[[{text:'Открыть CAD',url:previewUrl}],[{text:'✅ Принять заказ',callback_data:`tgcad:approve:${order.id}`}],[{text:'↩️ Вернуть заказ',callback_data:`tgcad:return:${order.id}`}]]}}:{};await telegramBridge?.sendAutomatedMessage(order.clinicId,`CAD по заказу ${order.id} готов к согласованию врача.`,extra).catch(error=>console.error('Telegram CAD notification failed:',error.message))}
});
server.listen(port,host,()=>{
  console.log(`Create Dental: ${tlsKeyFile?'https':'http'}://${host}:${port}`);
  // Integrations may need a network round-trip to Telegram. They must not
  // delay the HTTP listener and turn a deploy/restart into a visible 502.
  void telegramBridge.start().catch(error=>console.error('Telegram bridge startup failed:',error.message));
  void employeeTelegramBridge.start().catch(error=>console.error('Employee Telegram bridge startup failed:',error.message));
  const backup=async()=>{try{const saved=await createDataBackup();console.log(`Data backup created: ${path.basename(saved)}`)}catch(error){console.error('Data backup failed:',error.message)}};
  void backup();
  const backupTimer=setInterval(backup,24*60*60*1000);backupTimer.unref();
  const deliveryTimer=setInterval(()=>{for(const [clinicId,chat] of Object.entries(clinicChats))for(const message of chat.messages||[])if(message.from==='support'&&message.deliveryStatus==='error'&&(Number(message.deliveryAttempts)||0)<5)void deliverSupportMessage(clinicId,message)},60*1000);deliveryTimer.unref();
  void cleanupOrphanMessageFiles();const cleanupTimer=setInterval(()=>void cleanupOrphanMessageFiles(),6*60*60*1000);cleanupTimer.unref();
  const uploadCleanupTimer=setInterval(()=>{const now=Date.now(),token=readIntegrationSecret('yandexDiskToken');for(const [id,item] of diskUploadSessions)if(item.expiresAt<now){diskUploadSessions.delete(id);void deleteDiskResource(token,item.diskPath).catch(()=>{})}let linksChanged=false;for(const [id,item] of largeUploadLinks)if(item.expiresAt<now||item.usedAt&&item.usedAt<now-24*60*60*1000){if(item.draft&&!item.claimedOrderId)for(const attachmentId of item.draftAttachmentIds||[]){const source=clinicMessageFiles[String(attachmentId)];if(source?.diskPath)void deleteDiskResource(token,source.diskPath).catch(()=>{});delete clinicMessageFiles[String(attachmentId)]}if(item.draft&&!item.claimedOrderId)void saveClinicMessageFiles().catch(()=>{});largeUploadLinks.delete(id);linksChanged=true}if(linksChanged)void persistLargeUploadLinks().catch(()=>{});for(const [id,item] of cadPreviewLinks)if(item.expiresAt<now)cadPreviewLinks.delete(id)},10*60*1000);uploadCleanupTimer.unref();
  void (async()=>{
    for(const order of portalSnapshot().orders){
      await ensureOrderFilesOnDisk(order.id).catch(error=>console.error('Legacy order file migration failed:',error.message));
      await ensurePublicOrderFolder(order.id).catch(error=>console.error('Yandex Disk folder publication failed:',error.message));
    }
  })();
});
