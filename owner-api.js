import path from 'node:path';
import {loginOwner,issueSession,sessionFor,revokeSession,updateOwnerPassword} from './auth-data.js';
import {portalSnapshotForDatabase,portalDatabasePool} from './portal-data.js';
import {buildOwnerReport,reportingPeriod} from './owner-metrics.js';
import {createOwnerStore} from './owner-store.js';
const store=createOwnerStore({pool:portalDatabasePool(),file:process.env.OWNER_FINANCE_FILE||path.join(process.env.DATA_DIR||path.join(process.cwd(),'.data'),'owner-finance.json')});
const attempts=new Map();
async function bodyOf(req){let s='';for await(const chunk of req){s+=chunk;if(s.length>16000)throw Object.assign(new Error('Слишком большой запрос'),{status:413});}try{return JSON.parse(s||'{}');}catch{throw Object.assign(new Error('Неверный формат данных'),{status:400});}}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
export async function handleOwner(req,res,url){
 try{
  if(url.pathname==='/api/owner/login'&&req.method==='POST'){
    const now=Date.now(),key=req.socket.remoteAddress||'unknown';
    for(const [k,v] of attempts)if(v.until<now)attempts.delete(k);
    const entry=attempts.get(key)||{count:0,until:now+15*60000};
    if(entry.count>=10)return send(res,429,{error:'Слишком много попыток. Повторите через 15 минут.'});
    const body=await bodyOf(req);entry.count++;attempts.set(key,entry);
    if(typeof body.email!=='string'||typeof body.password!=='string'||body.password.length>200)return send(res,401,{error:'Проверьте email и пароль владельца'});
    const account=loginOwner(body.email,body.password);
    if(!account||account.role!=='owner')return send(res,401,{error:'Проверьте email и пароль владельца'});
    attempts.delete(key);return send(res,200,{token:issueSession('owner',account.subjectId,'Владелец'),user:{role:'owner',email:account.email},mustChangePassword:Boolean(account.mustChangePassword)});
  }
  const user=sessionFor(req.headers['x-portal-token']);
  if(!user)return send(res,401,{error:'Войдите в кабинет владельца'});
  if(user.role!=='owner')return send(res,403,{error:'Доступ только для владельца лаборатории'});
  if(url.pathname==='/api/owner/logout'&&req.method==='POST'){revokeSession(req.headers['x-portal-token']);return send(res,200,{ok:true});}
  if(url.pathname==='/api/owner/password'&&req.method==='POST'){const body=await bodyOf(req);await updateOwnerPassword(user.subjectId,body.currentPassword,body.password);const token=issueSession('owner',user.subjectId,'Владелец');return send(res,200,{ok:true,token});}
  if(url.pathname==='/api/owner/report'&&req.method==='GET'){
    let period;try{period=reportingPeriod(url.searchParams.get('from'),url.searchParams.get('to'));}catch(e){return send(res,400,{error:e.message});}
    const [snapshot,ledger]=await Promise.all([portalSnapshotForDatabase('technician','chief'),store.read()]);
    return send(res,200,buildOwnerReport({...snapshot,orders:snapshot.orders.filter(order=>!order.parentOrderId)},ledger,period));
  }
  if(url.pathname==='/api/owner/finance'&&req.method==='POST'){
    const body=await bodyOf(req),snapshot=await portalSnapshotForDatabase('technician','chief','compact');
    const version=await store.change(body,user.subjectId,new Set(snapshot.orders.filter(order=>!order.parentOrderId).map(o=>o.id)));return send(res,200,{ok:true,version});
  }
  return send(res,404,{error:'Раздел не найден'});
 }catch(error){if(!error.status)console.error('Owner cabinet request failed:',error.message);return send(res,error.status||500,{error:error.status?error.message:'Не удалось загрузить или сохранить данные. Повторите попытку.'});}
}
