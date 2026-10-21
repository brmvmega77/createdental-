import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {COST_KEYS,moneyValue,dateKey} from './owner-metrics.js';
const initial=()=>({version:0,costs:{},expenses:[],targets:{},audit:[]});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function applyOwnerChange(state,body,actor,orderIds,now=new Date()){
  if(!body||!Number.isSafeInteger(body.version)||body.version!==state.version)throw fail('Данные изменились. Обновите кабинет и повторите сохранение.',409);
  const next=structuredClone(state),at=now.toISOString();let recordKey,record;
  if(body.type==='cost'){
    if(typeof body.orderId!=='string'||!orderIds.has(body.orderId))throw fail('Заказ не найден',404);
    const values={};
    for(const key of COST_KEYS){const val=body.values?.[key];if(typeof val!=='number'||!Number.isFinite(val)||val<0||val>1e9||Math.abs(val*100-Math.round(val*100))>1e-5)throw fail('Укажите все прямые затраты, от 0 до 1 млрд рублей, с точностью до копеек');values[key]=moneyValue(val);}
    recordKey='cost:'+body.orderId;record={...values,confirmed:true,updatedAt:at};next.costs[body.orderId]=record;
  }else if(body.type==='expense'){
    if(typeof body.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(body.date)||dateKey(body.date)!==body.date||body.date>dateKey(at))throw fail('Укажите дату расхода не позднее сегодняшней');
    const amount=body.amount;
    if(typeof amount!=='number'||!Number.isFinite(amount)||amount<=0||amount>1e9||Math.abs(amount*100-Math.round(amount*100))>1e-5)throw fail('Укажите сумму расхода от 0,01 до 1 млрд рублей');
    const categories=['Аренда','Административная зарплата','Связь и сервисы','Маркетинг','Обслуживание оборудования','Прочее'];
    if(!categories.includes(body.category)||typeof body.note!=='string'||body.note.length>300)throw fail('Проверьте категорию и комментарий');
    record={id:randomUUID(),date:body.date,amount:moneyValue(amount),category:body.category,note:body.note.trim(),createdAt:at};recordKey='expense:'+record.id;next.expenses.push(record);
  }else if(body.type==='targets'){
    record={};for(const key of ['monthlyOrders','onTime','margin']){const v=body.values?.[key];if(v===null){record[key]=null;continue;}if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>(key==='monthlyOrders'?1e6:100)||(key==='monthlyOrders'&&!Number.isInteger(v)))throw fail('Проверьте значения целей');record[key]=v;}
    recordKey='targets';next.targets=record;
  }else if(body.type==='delete-expense'){
    if(typeof body.id!=='string'||!next.expenses.some(e=>e.id===body.id))throw fail('Расход не найден',404);
    next.expenses=next.expenses.filter(e=>e.id!==body.id);recordKey='expense:'+body.id;record=null;
  }else throw fail('Неизвестная операция');
  next.version++;
  const previous=recordKey.startsWith('cost:')?state.costs[body.orderId]||null:recordKey.startsWith('expense:')?state.expenses.find(e=>'expense:'+e.id===recordKey)||null:state.targets;
  const audit={at,actor,type:body.type,recordKey,previous,value:record};next.audit=[...state.audit,audit].slice(-500);
  return {next,recordKey,record,audit};
}
export function createOwnerStore({pool=null,file}){
  let initPromise,queue=Promise.resolve();
  async function init(){if(!pool)return;if(!initPromise)initPromise=pool.query(`CREATE TABLE IF NOT EXISTS owner_finance_meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0);
    INSERT INTO owner_finance_meta(id,revision) VALUES(1,0) ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS owner_finance_records(record_key TEXT PRIMARY KEY, data JSONB NOT NULL);
    CREATE TABLE IF NOT EXISTS owner_finance_audit(id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL);`).catch(e=>{initPromise=null;throw e});await initPromise;}
  async function dbRead(client){
    const result=initial(),meta=await client.query('SELECT revision FROM owner_finance_meta WHERE id=1');result.version=meta.rows[0].revision;
    const rows=await client.query('SELECT record_key,data FROM owner_finance_records');
    for(const {record_key:k,data} of rows.rows){if(k.startsWith('cost:'))result.costs[k.slice(5)]=data;else if(k.startsWith('expense:'))result.expenses.push(data);else if(k==='targets')result.targets=data;}
    result.audit=(await client.query('SELECT data FROM owner_finance_audit ORDER BY id DESC LIMIT 500')).rows.map(r=>r.data).reverse();return result;
  }
  async function localRead(){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return initial();throw e;}}
  return {
    async read(){await init();if(!pool){await queue;return localRead();}const client=await pool.connect();try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const state=await dbRead(client);await client.query('COMMIT');return state;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}},
    async change(body,actor,orderIds){await init();
      if(pool){const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT revision FROM owner_finance_meta WHERE id=1 FOR UPDATE');const result=applyOwnerChange(await dbRead(client),body,actor,orderIds);if(result.record===null)await client.query('DELETE FROM owner_finance_records WHERE record_key=$1',[result.recordKey]);else await client.query('INSERT INTO owner_finance_records(record_key,data) VALUES($1,$2::jsonb) ON CONFLICT(record_key) DO UPDATE SET data=EXCLUDED.data',[result.recordKey,JSON.stringify(result.record)]);await client.query('UPDATE owner_finance_meta SET revision=$1 WHERE id=1',[result.next.version]);await client.query('INSERT INTO owner_finance_audit(data) VALUES($1::jsonb)',[JSON.stringify(result.audit)]);await client.query('COMMIT');return result.next.version;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
      const work=queue.catch(()=>{}).then(async()=>{const result=applyOwnerChange(await localRead(),body,actor,orderIds);await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(result.next),{mode:0o600});await fs.rename(tmp,file);return result.next.version;});queue=work.catch(()=>{});return work;
    }
  };
}
