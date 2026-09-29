import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual,randomBytes } from 'node:crypto';
import {portalSnapshot,replacePortalCollection,portalClient,portalEmployee} from './portal-data.js';
import {validEmail,validPassword,hasAccount,createAccount,upsertWorkerAccount,login,issueSession,sessionFor,revokeSession,revokeSubjectSessions} from './auth-data.js';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const supportToken = process.env.SUPPORT_TOKEN || (process.env.SUPPORT_TOKEN_FILE ? fs.readFileSync(process.env.SUPPORT_TOKEN_FILE, 'utf8').trim() : '');
const portalToken = process.env.PORTAL_TOKEN || supportToken;
const chatFile = process.env.CHAT_DATA_FILE || path.join(root, '.data', 'chat.json');
const publicFiles = new Set(['/','/index.html','/app.js','/technician.js','/worker.js','/seed-orders.js','/portal-client.js','/routes.js','/styles.css','/support.html','/support.js']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};
const conversationIdPattern = /^[a-f0-9]{32}$/;
let chats = {};
let saveQueue = Promise.resolve();

try {
  chats = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

function json(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(data));
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
      snapshot.orderOverrides=Object.fromEntries(Object.entries(snapshot.orderOverrides).filter(([id])=>snapshot.orders.some(order=>order.id===id)));
    }else if(user.role==='worker'){
      const employee=portalEmployee(user.subjectId);
      snapshot.orders=snapshot.orders.filter(item=>snapshot.orderOverrides[item.id]?.assignee===employee.originalName);
      snapshot.clients=[];
      snapshot.employees=[employee];
      snapshot.orderOverrides=Object.fromEntries(Object.entries(snapshot.orderOverrides).filter(([id])=>snapshot.orders.some(order=>order.id===id)));
    }
    return json(res,200,{...snapshot,user});
  }
  const key=url.pathname.slice('/api/portal/'.length);
  if(req.method==='PUT'&&['orders','orderOverrides','clients','employees'].includes(key)){
    let value;
    try {value=await readBody(req,500000)} catch {return json(res,400,{error:'Неверные данные'})}
    if(user.role==='clinic'){
      if(key==='clients'){
        if(!Array.isArray(value)||value.length!==1||value[0].id!==user.subjectId)return json(res,403,{error:'Доступ запрещён'});
        value=snapshot.clients.map(item=>item.id===user.subjectId?{...item,...value[0],id:item.id,originalName:item.originalName}:item);
      }else if(key==='orders'){
        if(!Array.isArray(value))return json(res,400,{error:'Неверные данные'});
        const existing=new Set(snapshot.orders.map(item=>item.id));
        const additions=value.filter(item=>!existing.has(item.id));
        if(additions.length!==1||value.length!==snapshot.orders.filter(item=>item.clinicId===user.subjectId).length+1||additions[0].clinicId!==user.subjectId||snapshot.orders.some(item=>item.id===additions[0].id))return json(res,403,{error:'Можно добавить только свой заказ'});
        value=[...additions,...snapshot.orders];
      }else return json(res,403,{error:'Доступ запрещён'});
    }else if(user.role==='worker'){
      if(key!=='orderOverrides'||!value||typeof value!=='object')return json(res,403,{error:'Доступ запрещён'});
      const employee=portalEmployee(user.subjectId);
      const stages=['Подготовка','Моделирование','Изготовление','Контроль качества'];
      const changes=Object.entries(value).filter(([id,detail])=>JSON.stringify(detail)!==JSON.stringify(snapshot.orderOverrides[id]));
      if(changes.length!==1)return json(res,403,{error:'Можно изменить только один свой заказ'});
      const [id,next]=changes[0],old=snapshot.orderOverrides[id];
      if(!old||old.assignee!==employee.originalName||!next||next.assignee!==old.assignee||stages.indexOf(next.stage)!==stages.indexOf(old.stage)+1||Object.keys(next).some(field=>field!=='stage'&&JSON.stringify(next[field])!==JSON.stringify(old[field])))return json(res,403,{error:'Неверный переход этапа'});
      value={...snapshot.orderOverrides,[id]:next};
    }
    try {await replacePortalCollection(key,value);if(key==='employees')for(const employee of value)if(employee.status!=='active')revokeSubjectSessions('worker',employee.id);return json(res,200,{ok:true})}
    catch(error){return json(res,error.message==='invalid_collection'?400:500,{error:error.message==='invalid_collection'?'Неверные данные':'Не удалось сохранить'})}
  }
  return json(res,404,{error:'Не найдено'});
}

async function handleAuth(req,res,url){
  if(req.method==='POST'&&url.pathname==='/api/auth/logout'){revokeSession(req.headers['x-portal-token']);return json(res,200,{ok:true})}
  let body;try{body=await readBody(req,12000)}catch{return json(res,400,{error:'Неверные данные'})}
  if(req.method==='POST'&&url.pathname==='/api/auth/chief'){
    const incoming=String(body.key||'');
    if(!portalToken||Buffer.byteLength(incoming)!==Buffer.byteLength(portalToken)||!timingSafeEqual(Buffer.from(incoming),Buffer.from(portalToken)))return json(res,401,{error:'Неверный ключ'});
    return json(res,200,{token:issueSession('technician','chief'),user:{role:'technician',subjectId:'chief'}});
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/register'){
    const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase();
    if(name.length<2||name.length>120||/[<>]/.test(name)||!validEmail(email)||!validPassword(body.password)||hasAccount(email))return json(res,400,{error:'Проверьте название, email и пароль (от 10 символов)'});
    const existing=portalSnapshot().clients.find(item=>item.email?.toLowerCase()===email&&!item.deleted);
    const id=existing?.id||'client-'+randomBytes(12).toString('hex');
    const client={id,originalName:id,name,email,contact:'',phone:'',address:''};
    try{if(!existing)await replacePortalCollection('clients',[...portalSnapshot().clients,client]);await createAccount({email,password:body.password,role:'clinic',subjectId:id})}
    catch{return json(res,500,{error:'Не удалось создать кабинет'})}
    return json(res,201,{token:issueSession('clinic',id),user:{role:'clinic',subjectId:id}});
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/login'){
    if(String(body.email||'').trim().toLowerCase()==='chief'){
      const incoming=String(body.password||'');
      if(!portalToken||Buffer.byteLength(incoming)!==Buffer.byteLength(portalToken)||!timingSafeEqual(Buffer.from(incoming),Buffer.from(portalToken)))return json(res,401,{error:'Неверный логин или пароль'});
      return json(res,200,{token:issueSession('technician','chief'),user:{role:'technician',subjectId:'chief'}});
    }
    const account=login(body.email,body.password);
    if(!account||account.role==='worker'&&portalEmployee(account.subjectId)?.status!=='active'||account.role==='clinic'&&!portalClient(account.subjectId))return json(res,401,{error:'Неверный email или пароль'});
    return json(res,200,{token:issueSession(account.role,account.subjectId),user:{role:account.role,subjectId:account.subjectId}});
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/staff'){
    if(session(req)?.role!=='technician')return json(res,403,{error:'Доступ запрещён'});
    const employee=portalEmployee(body.employeeId);
    if(!employee||employee.status==='fired'||employee.email?.toLowerCase()!==String(body.email||'').toLowerCase())return json(res,400,{error:'Сначала сохраните техника с email'});
    try{await upsertWorkerAccount({employeeId:employee.id,email:body.email,password:body.password||''});revokeSubjectSessions('worker',employee.id)}
    catch(error){return json(res,400,{error:error.message==='password_required'?'Укажите пароль для нового техника':'Проверьте email и пароль (от 10 символов)'})}
    return json(res,200,{ok:true});
  }
  return json(res,404,{error:'Не найдено'});
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
  if (publicFiles.has(pathname)||appRoute) {
    file = path.join(root, appRoute||pathname==='/' ? 'index.html' : pathname);
  } else if (pathname.startsWith('/assets/')) {
    file = path.resolve(root, 'public', '.' + pathname);
    if (!file.startsWith(path.join(root, 'public', 'assets') + path.sep)) return json(res, 403, {error:'Доступ запрещён'});
  } else {
    return json(res, 404, {error:'Не найдено'});
  }
  fs.readFile(file, (error, data) => {
    if (error) return json(res, 404, {error:'Не найдено'});
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

http.createServer(async (req,res) => {
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); } catch { return json(res, 400, {error:'Неверный адрес'}); }
  if(url.pathname.startsWith('/api/auth/'))return handleAuth(req,res,url);
  if(url.pathname==='/api/portal'||url.pathname.startsWith('/api/portal/'))return handlePortal(req,res,url);
  if (url.pathname.startsWith('/api/')) {
    try { return await handleChat(req,res,url); } catch { return json(res, 500, {error:'Ошибка сервера'}); }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, {error:'Метод не поддерживается'});
  return serveFile(req,res,url.pathname);
}).listen(port, host, () => console.log(`Create Dental: http://${host}:${port}`));
