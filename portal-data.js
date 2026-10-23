import {samePortalValue,versionCollection} from './collection-concurrency.js';
import {availableClinicDoctors} from './clinic-doctors.js';
import {repairLegacyFlowState,releaseEmployeeAssignments} from './flow-rules.js';
import {collectPayrollAccruals,initializePayrollState,validPayrollSettings} from './payroll.js';
import fs from 'node:fs';
import path from 'node:path';
import {randomInt} from 'node:crypto';
import pg from 'pg';
import {seedOrders} from './seed-orders.js';
import {seedClients,seedEmployees} from './technician.js';
import {orderWorkLabel} from './order-list-utils.js';
import {workCatalog,normalizeWorkCatalog,resolveWorkSelection} from './work-catalog.js';

const file=process.env.PORTAL_DATA_FILE||path.join(process.cwd(),'.data','portal.json');
const {Pool}=pg;
const telegramCodePattern=/^CD-CL-(\d{8})$/;
const cloneCatalog=value=>JSON.parse(JSON.stringify(value));

function randomTelegramCode(used){
  let code='';
  do {code=`CD-CL-${String(randomInt(0,100000000)).padStart(8,'0')}`} while(used.has(code));
  return code;
}

function assignTelegramCodes(clients){
  const used=new Set();
  return clients.map(client=>{
    let telegramCode=String(client?.telegramCode||'').trim().toUpperCase();
    if(!telegramCodePattern.test(telegramCode)||used.has(telegramCode))telegramCode=randomTelegramCode(used);
    used.add(telegramCode);
    return {...client,telegramCode};
  });
}

const defaults=()=>({
  orders:seedOrders.map(order=>({...order})),
  orderOverrides:{},
  orderHistory:[],
  clientRequests:[],
  tasks:[],
  clients:assignTelegramCodes(seedClients.map(client=>({...client}))),
  employees:seedEmployees.map(employee=>({...employee})),
  workCatalog:cloneCatalog(workCatalog),
  deliverySettings:{freeThreshold:4000,fee:500},
  collectionVersions:{},
  promoCodes:[]
});
let state=defaults();
let saveQueue=Promise.resolve();
const databaseUrl=process.env.PORTAL_DATABASE_URL||process.env.DATABASE_URL||'';
const databasePool=databaseUrl?new Pool({connectionString:databaseUrl,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:5000}):null;

try {
  const stored=JSON.parse(fs.readFileSync(file,'utf8'));
    if(stored&&typeof stored==='object'){
    for(const key of ['orders','clients','employees','clientRequests','tasks'])if(Array.isArray(stored[key]))state[key]=stored[key];
    if(Array.isArray(stored.workCatalog)){state.workCatalog=cloneCatalog(stored.workCatalog);workCatalog.splice(0,workCatalog.length,...cloneCatalog(stored.workCatalog))}
    if(stored.deliverySettings&&typeof stored.deliverySettings==='object'&&!Array.isArray(stored.deliverySettings)){const freeThreshold=Number(stored.deliverySettings.freeThreshold),fee=Number(stored.deliverySettings.fee);state.deliverySettings={freeThreshold:Number.isFinite(freeThreshold)&&freeThreshold>=0?freeThreshold:4000,fee:Number.isFinite(fee)&&fee>=0?fee:500};}
    if(Array.isArray(stored.promoCodes))state.promoCodes=stored.promoCodes;
    if(stored.collectionVersions)state.collectionVersions=stored.collectionVersions;
    if(stored.flowIntegrityVersion===1)state.flowIntegrityVersion=1;
    if(stored.payrollSettings)state.payrollSettings=stored.payrollSettings;
    if(Array.isArray(stored.salaryAccruals))state.salaryAccruals=stored.salaryAccruals;
    if(stored.payrollVersion===1)state.payrollVersion=1;
    if(stored.orderOverrides&&typeof stored.orderOverrides==='object'&&!Array.isArray(stored.orderOverrides))state.orderOverrides=stored.orderOverrides;
    if(Array.isArray(stored.orderHistory))state.orderHistory=stored.orderHistory;
    const before=JSON.stringify(state);
    // Ранее Telegram-заказы помечались отдельным черновиком. Теперь это
    // обычный новый заказ, как созданный через сайт.
    state.orders=state.orders.map(order=>order?.telegramDraft?{...order,telegramDraft:false}:order);
    state.orderOverrides=Object.fromEntries(Object.entries(state.orderOverrides).map(([id,detail])=>[id,detail?.stage==='Черновик из Telegram'?{...detail,stage:'Ожидает распределения',assignee:'',cadOperator:'',technician:''}:detail]));
    const demoClients=new Map([['clinic-1','Dental Clinic'],['clinic-2','Smile Studio'],['clinic-3','White Line'],['clinic-4','Nova Dent']]);
    const demoEmployees=new Map([['tech-1','Анна Смирнова'],['tech-2','Дмитрий Орлов'],['tech-3','Мария Ким'],['tech-4','Илья Федоров']]);
    const demoOrders=new Map([['CD-1042','Иванов А.В.'],['CD-1041','Петрова М.С.'],['CD-1040','Смирнов К.О.'],['CD-1039','Кузнецова Е.А.'],['CD-1038','Лебедев Р.И.'],['CD-1037','Соколов Д.В.'],['CD-1036','Орлова Н.С.'],['CD-1035','Морозов К.А.']]);
    state.clients=state.clients.filter(item=>demoClients.get(item.id)!==item.name);
    state.clients=assignTelegramCodes(state.clients);
    state.employees=state.employees.filter(item=>demoEmployees.get(item.id)!==item.name);
    state.orders=state.orders.filter(item=>demoOrders.get(item.id)!==item.patient);
    const remaining=new Set(state.orders.map(item=>item.id));
    for(const id of Object.keys(state.orderOverrides))if(!remaining.has(id))delete state.orderOverrides[id];
    if(JSON.stringify(state)!==before){fs.writeFileSync(file+'.tmp',JSON.stringify(state),{mode:0o600});fs.renameSync(file+'.tmp',file)}
  }
} catch(error){
  if(error.code!=='ENOENT')throw error;
}

async function initializeDatabase(){
  await databasePool.query(`CREATE TABLE IF NOT EXISTS portal_state (
    id smallint PRIMARY KEY,
    state jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await initializeRelationalSchema();
  const result=await databasePool.query('SELECT state FROM portal_state WHERE id=1');
  if(result.rows[0]?.state&&typeof result.rows[0].state==='object'){
    state=result.rows[0].state;
    if(Array.isArray(state.workCatalog))workCatalog.splice(0,workCatalog.length,...cloneCatalog(state.workCatalog));
    await syncNormalizedState(databasePool,null,['all']);
    return;
  }
  await databasePool.query('INSERT INTO portal_state (id,state) VALUES (1,$1::jsonb)',[JSON.stringify(state)]);
  await syncNormalizedState(databasePool,null,['all']);
}

if(databasePool)await initializeDatabase();
state.collectionVersions||={};
const normalizedCatalogState=normalizeWorkCatalog(state.workCatalog);
if(JSON.stringify(normalizedCatalogState)!==JSON.stringify(state.workCatalog)){state.workCatalog=normalizedCatalogState;workCatalog.splice(0,workCatalog.length,...cloneCatalog(normalizedCatalogState));await persistState(['workCatalog']);}
const repairedFlow=repairLegacyFlowState(state);
if(repairedFlow!==state){state=repairedFlow;await persistState(['orderOverrides']);}
const payrollInitialized=initializePayrollState(state);
if(payrollInitialized!==state){state=payrollInitialized;await persistState(['salaryAccruals']);}

async function initializeRelationalSchema(){
  await databasePool.query(`
    CREATE TABLE IF NOT EXISTS portal_orders (
      order_id text PRIMARY KEY,
      clinic_id text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT '',
      patient text NOT NULL DEFAULT '',
      created_at timestamptz,
      due_date text NOT NULL DEFAULT '',
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS portal_clients (
      client_id text PRIMARY KEY,
      name text NOT NULL DEFAULT '',
      approved boolean NOT NULL DEFAULT false,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS portal_employees (
      employee_id text PRIMARY KEY,
      name text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT '',
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS portal_salary_accruals (
      accrual_id text PRIMARY KEY,
      employee_id text NOT NULL,
      order_id text NOT NULL,
      role text NOT NULL,
      happened_at timestamptz NOT NULL,
      data jsonb NOT NULL,
      UNIQUE (order_id,role)
    );
    CREATE INDEX IF NOT EXISTS portal_salary_employee_date_idx ON portal_salary_accruals (employee_id,happened_at DESC);
    CREATE TABLE IF NOT EXISTS portal_order_overrides (
      order_id text PRIMARY KEY,
      stage text NOT NULL DEFAULT '',
      assignee text NOT NULL DEFAULT '',
      manufacturing_status text NOT NULL DEFAULT '',
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS portal_order_history (
      event_id text PRIMARY KEY,
      order_id text NOT NULL DEFAULT '',
      clinic_id text NOT NULL DEFAULT '',
      happened_at timestamptz,
      action text NOT NULL DEFAULT '',
      actor_role text NOT NULL DEFAULT '',
      data jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_client_requests (
      request_id text PRIMARY KEY,
      order_id text NOT NULL DEFAULT '',
      clinic_id text NOT NULL DEFAULT '',
      type text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT '',
      created_at timestamptz,
      data jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_tasks (
      task_id text PRIMARY KEY,
      assignee_id text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT '',
      priority text NOT NULL DEFAULT '',
      due_date date,
      updated_at timestamptz,
      data jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS portal_work_catalog (
      catalog_id text PRIMARY KEY,
      name text NOT NULL DEFAULT '',
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS portal_orders_clinic_idx ON portal_orders (clinic_id);
    CREATE INDEX IF NOT EXISTS portal_orders_status_idx ON portal_orders (status);
    CREATE INDEX IF NOT EXISTS portal_orders_created_idx ON portal_orders (created_at DESC);
    CREATE INDEX IF NOT EXISTS portal_orders_clinic_status_idx ON portal_orders (clinic_id,status);
    CREATE INDEX IF NOT EXISTS portal_orders_due_idx ON portal_orders (due_date);
    CREATE INDEX IF NOT EXISTS portal_clients_name_idx ON portal_clients (name);
    CREATE INDEX IF NOT EXISTS portal_clients_approved_idx ON portal_clients (approved);
    CREATE INDEX IF NOT EXISTS portal_overrides_stage_idx ON portal_order_overrides (stage);
    CREATE INDEX IF NOT EXISTS portal_overrides_assignee_idx ON portal_order_overrides (assignee);
    CREATE INDEX IF NOT EXISTS portal_history_order_idx ON portal_order_history (order_id,happened_at DESC);
    CREATE INDEX IF NOT EXISTS portal_history_clinic_idx ON portal_order_history (clinic_id,happened_at DESC);
    CREATE INDEX IF NOT EXISTS portal_history_action_idx ON portal_order_history (action,happened_at DESC);
    CREATE INDEX IF NOT EXISTS portal_requests_clinic_status_idx ON portal_client_requests (clinic_id,status);
    CREATE INDEX IF NOT EXISTS portal_requests_order_idx ON portal_client_requests (order_id);
    CREATE INDEX IF NOT EXISTS portal_tasks_assignee_status_idx ON portal_tasks (assignee_id,status);
    CREATE INDEX IF NOT EXISTS portal_tasks_due_idx ON portal_tasks (due_date);
  `);
}

function sqlJson(value){return JSON.stringify(value??null)}
function timestampValue(value){const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date:null}
async function syncNormalizedState(client,changedKeys=['all']){
  const keys=new Set(changedKeys||['all']);
  const all=keys.has('all');
  if(all||keys.has('salaryAccruals')){
    if(state.salaryAccruals?.length)await client.query(`INSERT INTO portal_salary_accruals (accrual_id,employee_id,order_id,role,happened_at,data) SELECT item->>'id',item->>'employeeId',item->>'orderId',item->>'role',(item->>'at')::timestamptz,item FROM jsonb_array_elements($1::jsonb) item ON CONFLICT (order_id,role) DO NOTHING`,[sqlJson(state.salaryAccruals)]);
  }
  if(all||keys.has('orders')){
    await client.query('DELETE FROM portal_orders');
    await client.query(`INSERT INTO portal_orders (order_id,clinic_id,status,patient,created_at,due_date,data)
      SELECT item->>'id',coalesce(item->>'clinicId',''),coalesce(item->>'status',''),coalesce(item->>'patient',''),
        CASE WHEN item->>'createdAt' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN (item->>'createdAt')::timestamptz ELSE NULL END,
        coalesce(item->>'date',''),item FROM jsonb_array_elements($1::jsonb) item`,[sqlJson(state.orders||[])]);
  }
  if(all||keys.has('clients')){
    await client.query('DELETE FROM portal_clients');
    await client.query(`INSERT INTO portal_clients (client_id,name,approved,data)
      SELECT item->>'id',coalesce(item->>'name',''),coalesce((item->>'approved')::boolean,false),item
      FROM jsonb_array_elements($1::jsonb) item`,[sqlJson(state.clients||[])]);
  }
  if(all||keys.has('employees')){
    await client.query('DELETE FROM portal_employees');
    await client.query(`INSERT INTO portal_employees (employee_id,name,status,data)
      SELECT item->>'id',coalesce(item->>'name',''),coalesce(item->>'status',''),item
      FROM jsonb_array_elements($1::jsonb) item`,[sqlJson(state.employees||[])]);
  }
  if(all||keys.has('orderOverrides')){
    await client.query('DELETE FROM portal_order_overrides');
    await client.query(`INSERT INTO portal_order_overrides (order_id,stage,assignee,manufacturing_status,data)
      SELECT item.key,coalesce(item.value->>'stage',''),coalesce(item.value->>'assignee',''),coalesce(item.value->>'manufacturingStatus',''),item.value
      FROM jsonb_each($1::jsonb) item`,[sqlJson(state.orderOverrides||{})]);
  }
  if(all||keys.has('orderHistory')){
    await client.query('DELETE FROM portal_order_history');
    await client.query(`INSERT INTO portal_order_history (event_id,order_id,clinic_id,happened_at,action,actor_role,data)
      SELECT item->>'id',coalesce(item->>'orderId',''),coalesce(item->>'clinicId',''),
        CASE WHEN item->>'at' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN (item->>'at')::timestamptz ELSE NULL END,
        coalesce(item->>'action',''),coalesce(item->>'actorRole',''),item
      FROM jsonb_array_elements($1::jsonb) item`,[sqlJson(state.orderHistory||[])]);
  }
  if(all||keys.has('clientRequests')){
    await client.query('DELETE FROM portal_client_requests');
    await client.query(`INSERT INTO portal_client_requests (request_id,order_id,clinic_id,type,status,created_at,data)
      SELECT item->>'id',coalesce(item->>'orderId',''),coalesce(item->>'clinicId',''),coalesce(item->>'type',''),coalesce(item->>'status',''),
        CASE WHEN item->>'createdAt' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN (item->>'createdAt')::timestamptz ELSE NULL END,item
      FROM jsonb_array_elements($1::jsonb) item`,[sqlJson(state.clientRequests||[])]);
  }
  if(all||keys.has('tasks')){
    await client.query('DELETE FROM portal_tasks');
    await client.query(`INSERT INTO portal_tasks (task_id,assignee_id,status,priority,due_date,updated_at,data)
      SELECT item->>'id',coalesce(item->>'assigneeId',''),coalesce(item->>'status',''),coalesce(item->>'priority',''),
        CASE WHEN item->>'dueDate' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (item->>'dueDate')::date ELSE NULL END,
        CASE WHEN item->>'updatedAt' ~ '^\\d{4}-\\d{2}-\\d{2}' THEN (item->>'updatedAt')::timestamptz ELSE NULL END,item
      FROM jsonb_array_elements($1::jsonb) item`,[sqlJson(state.tasks||[])]);
  }
  if(all||keys.has('workCatalog')){
    await client.query('DELETE FROM portal_work_catalog');
    await client.query(`INSERT INTO portal_work_catalog (catalog_id,name,data)
      SELECT coalesce(item->>'id',item->>'key',ordinality::text),coalesce(item->>'name',''),item
      FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS source(item,ordinality)`,[sqlJson(state.workCatalog||[])]);
  }
}

async function persistState(changedKeys=['all']){
  if(databasePool){
    const client=await databasePool.connect();
    try{
      await client.query('BEGIN');
      await client.query(`INSERT INTO portal_state (id,state,updated_at)
        VALUES (1,$1::jsonb,now())
        ON CONFLICT (id) DO UPDATE SET state=EXCLUDED.state,updated_at=EXCLUDED.updated_at`,[JSON.stringify(state)]);
      await syncNormalizedState(client,changedKeys);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
    return;
  }
  await fs.promises.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const temporary=file+'.tmp';
  await fs.promises.writeFile(temporary,JSON.stringify(state),{mode:0o600});
  await fs.promises.rename(temporary,file);
}

export function portalSnapshot(){return structuredClone(state)}

async function normalizedRows(sql,params=[]){const result=await databasePool.query(sql,params);return result.rows.map(row=>row.data)}
async function normalizedMap(sql,params=[]){const result=await databasePool.query(sql,params);return Object.fromEntries(result.rows.map(row=>[row.order_id,row.data]))}
async function normalizedCatalog(){return normalizedRows("SELECT data FROM portal_work_catalog ORDER BY data->>'position',catalog_id")}

// Read model for authenticated GETs. Writes still update portal_state and the
// normalized projection in one transaction, so this can be enabled without a
// cutover or a second source of truth.
export async function portalSnapshotForDatabase(role,subjectId,view=''){
  if(!databasePool)return portalSnapshotFor(role,subjectId,view);
  if(role==='clinic'){
    const orders=await normalizedRows('SELECT data FROM portal_orders WHERE clinic_id=$1 ORDER BY created_at DESC NULLS LAST',[subjectId]);
    const ids=orders.map(item=>item.id);
    const [orderOverrides,orderHistory,clientRequests,clients,workCatalog]=await Promise.all([
      ids.length?normalizedMap('SELECT order_id,data FROM portal_order_overrides WHERE order_id=ANY($1::text[])',[ids]):Promise.resolve({}),
      ids.length?normalizedRows('SELECT data FROM portal_order_history WHERE (clinic_id=$1 OR order_id=ANY($2::text[])) ORDER BY happened_at ASC',[subjectId,ids]):normalizedRows('SELECT data FROM portal_order_history WHERE clinic_id=$1 ORDER BY happened_at ASC',[subjectId]),
      normalizedRows('SELECT data FROM portal_client_requests WHERE clinic_id=$1 ORDER BY created_at ASC',[subjectId]),
      normalizedRows('SELECT data FROM portal_clients WHERE client_id=$1',[subjectId]),
      normalizedCatalog()
    ]);
    const clinic=clients[0],promo=state.promoCodes?.find(item=>item.active!==false&&item.code===clinic?.promoCode);
    return structuredClone({orders,orderOverrides,orderHistory,clientRequests,tasks:[],clients,employees:[],workCatalog,deliverySettings:state.deliverySettings,promoCode:promo?clinic?.promoCode||'':'',promoPrices:promo?.prices||{}});
  }
  if(role==='worker'){
    const employeeRows=await databasePool.query('SELECT data FROM portal_employees WHERE employee_id=$1',[subjectId]);
    const employee=employeeRows.rows[0]?.data;
    if(!employee)return {orders:[],orderOverrides:{},orderHistory:[],clientRequests:[],tasks:[],clients:[],employees:[],workCatalog:await normalizedCatalog(),deliverySettings:state.deliverySettings,promoCodes:state.promoCodes};
    const name=employee.originalName;
    const overrideRows=await databasePool.query(`SELECT order_id,data FROM portal_order_overrides WHERE data->>'assignee'=$1 OR data->>'cadOperator'=$1 OR data->>'preprodTechnician'=$1 OR data->>'technician'=$1 OR data->>'frameTechnician'=$1 OR data->>'painter'=$1 OR data->>'ceramicist'=$1`,[name]);
    const ids=overrideRows.rows.map(row=>row.order_id);
    const [orders,orderHistory,tasks,workCatalog]=await Promise.all([
      ids.length?normalizedRows('SELECT data FROM portal_orders WHERE order_id=ANY($1::text[]) ORDER BY created_at DESC NULLS LAST',[ids]):Promise.resolve([]),
      ids.length?normalizedRows('SELECT data FROM portal_order_history WHERE order_id=ANY($1::text[]) ORDER BY happened_at ASC',[ids]):Promise.resolve([]),
      normalizedRows('SELECT data FROM portal_tasks WHERE assignee_id=$1 ORDER BY updated_at DESC NULLS LAST',[subjectId]),
      normalizedCatalog()
    ]);
    return structuredClone({orders,orderOverrides:Object.fromEntries(overrideRows.rows.map(row=>[row.order_id,row.data])),orderHistory,clientRequests:[],tasks,clients:[],employees:[employee],workCatalog,deliverySettings:state.deliverySettings,promoCodes:state.promoCodes});
  }
  const [orders,orderOverrideRows,orderHistory,clientRequests,tasks,clients,employees,workCatalog]=await Promise.all([
    normalizedRows('SELECT data FROM portal_orders ORDER BY created_at DESC NULLS LAST'),
    databasePool.query('SELECT order_id,data FROM portal_order_overrides'),
    view==='compact'?normalizedRows('SELECT data FROM portal_order_history ORDER BY happened_at DESC LIMIT 120').then(rows=>rows.reverse()):normalizedRows('SELECT data FROM portal_order_history ORDER BY happened_at ASC'),
    normalizedRows('SELECT data FROM portal_client_requests ORDER BY created_at ASC'),
    normalizedRows('SELECT data FROM portal_tasks ORDER BY updated_at DESC NULLS LAST'),
    normalizedRows(view==='compact'?'SELECT data - \'logo\' AS data FROM portal_clients':'SELECT data FROM portal_clients'),
    normalizedRows('SELECT data FROM portal_employees ORDER BY name'),
    normalizedCatalog()
  ]);
  return structuredClone({orders,orderOverrides:Object.fromEntries(orderOverrideRows.rows.map(row=>[row.order_id,row.data])),orderHistory,clientRequests,tasks,clients,employees,workCatalog,deliverySettings:state.deliverySettings,promoCodes:state.promoCodes});
}

// GET /api/portal only needs the part of the portal visible to the current
// cabinet.  Keeping the full state for writes is important for validation, but
// cloning and sending unrelated clinics' history and data makes every cabinet
// wait for a much larger response than necessary.
export function portalSnapshotFor(role,subjectId,view=''){
  if(role==='technician'){
    if(view==='compact'){
      const clients=state.clients.map(({logo,...client})=>client);
      return structuredClone({orders:state.orders,orderOverrides:state.orderOverrides,orderHistory:state.orderHistory.slice(-120),clientRequests:state.clientRequests,tasks:state.tasks,clients,employees:state.employees,workCatalog:state.workCatalog,deliverySettings:state.deliverySettings,promoCodes:state.promoCodes});
    }
    return portalSnapshot();
  }
  if(role==='clinic'){
    const orders=state.orders.filter(order=>order.clinicId===subjectId);
    const orderIds=new Set(orders.map(order=>order.id));
    const orderOverrides=Object.fromEntries(Object.entries(state.orderOverrides).filter(([id])=>orderIds.has(id)));
    return structuredClone({
      orders,
      orderOverrides,
      orderHistory:state.orderHistory.filter(event=>event.clinicId===subjectId||orderIds.has(event.orderId)),
      clientRequests:state.clientRequests.filter(item=>item.clinicId===subjectId),
      tasks:[],
      clients:state.clients.filter(client=>client.id===subjectId),
      employees:[],
      workCatalog:state.workCatalog,
      deliverySettings:state.deliverySettings,
      promoCode:state.promoCodes?.find(item=>item.active!==false&&item.code===state.clients.find(client=>client.id===subjectId)?.promoCode)?.code||'',
      promoPrices:state.promoCodes?.find(item=>item.active!==false&&item.code===state.clients.find(client=>client.id===subjectId)?.promoCode)?.prices||{}
    });
  }
  if(role==='worker'){
    const employee=state.employees.find(item=>item.id===subjectId),name=employee?.originalName;
    const assignedRoles=new Set(['assignee','cadOperator','preprodTechnician','technician','frameTechnician','painter','ceramicist']);
    const orders=state.orders.filter(order=>{
      const details=state.orderOverrides[order.id]||{};
      return name&&[...assignedRoles].some(field=>details[field]===name);
    });
    const orderIds=new Set(orders.map(order=>order.id));
    return structuredClone({
      orders,
      orderOverrides:Object.fromEntries(Object.entries(state.orderOverrides).filter(([id])=>orderIds.has(id))),
      orderHistory:state.orderHistory.filter(event=>orderIds.has(event.orderId)),
      clientRequests:[],
      tasks:state.tasks.filter(task=>task.assigneeId===subjectId),
      clients:[],
      employees:employee?[employee]:[],
      workCatalog:state.workCatalog,
      deliverySettings:state.deliverySettings,
      promoCodes:state.promoCodes
    });
  }
  return portalSnapshot();
}
export function portalClient(id){return state.clients.find(client=>client.id===id&&!client.deleted)}
export function portalEmployee(id){return state.employees.find(employee=>employee.id===id)}

function validClinicDoctors(clinic){
  if(clinic.clinicHiddenDoctorIds!==undefined&&(!Array.isArray(clinic.clinicHiddenDoctorIds)||clinic.clinicHiddenDoctorIds.length>200||!clinic.clinicHiddenDoctorIds.every(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(id))))return false;
  if(clinic.doctorsRevision!==undefined&&(!Number.isSafeInteger(clinic.doctorsRevision)||clinic.doctorsRevision<0))return false;
  if(clinic.doctors===undefined)return true;
  if(!Array.isArray(clinic.doctors)||clinic.doctors.length>200)return false;
  const ids=new Set(),names=new Set();
  return clinic.doctors.every(item=>{
    if(!item||typeof item.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(item.id)||ids.has(item.id)||typeof item.name!=='string'||item.name.trim().length<2||item.name.length>120||/[<>\r\n]/.test(item.name)||typeof item.active!=='boolean')return false;
    if(item.specialty!==undefined&&(typeof item.specialty!=='string'||item.specialty.length>80||/[<>\r\n]/.test(item.specialty)))return false;
    ids.add(item.id);const name=item.name.trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
    const visible=item.active&&!(clinic.clinicHiddenDoctorIds||[]).includes(item.id);
    if(visible&&names.has(name))return false;
    if(visible)names.add(name);return true;
  });
}

function validCollection(key,value){
  const text=(input,max=200)=>typeof input==='string'&&input.length<=max&&!/[<>]/.test(input);
  const validId=input=>typeof input==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(input);
  const unique=items=>new Set(items.map(item=>item.id)).size===items.length;
  if(key==='orders')return Array.isArray(value)&&value.length<=5000&&unique(value)&&value.every(item=>item&&validId(item.id)&&text(item.patient)&&text(item.work)&&(!item.date||/^\d{2}\.\d{2}\.\d{4}$/.test(item.date))&&text(item.sum,40)&&text(item.status,40)&&(item.doctor===undefined||text(item.doctor,120))&&(item.doctorSpecialty===undefined||text(item.doctorSpecialty,80))&&(item.doctorId===undefined||item.doctorId===''||validId(item.doctorId))&&(!item.image||['tooth.png','smile.png','scan.png'].includes(item.image))&&(!item.clinicId||validId(item.clinicId))&&(!item.teeth||Array.isArray(item.teeth)&&item.teeth.every(tooth=>Number.isInteger(tooth)&&tooth>0&&tooth<100)));
  if(key==='clients')return Array.isArray(value)&&value.length<=2000&&unique(value)&&new Set(value.map(item=>item.telegramCode)).size===value.length&&value.every(item=>item&&validId(item.id)&&text(item.name)&&text(item.originalName||'',200)&&telegramCodePattern.test(item.telegramCode)&&validClinicDoctors(item)&&(item.approved===undefined||typeof item.approved==='boolean'));
  if(key==='payrollSettings')return validPayrollSettings(value);
  if(key==='employees')return Array.isArray(value)&&value.length<=500&&unique(value)&&value.every(item=>item&&validId(item.id)&&text(item.name)&&text(item.originalName||'',200)&&(item.rank===undefined||Number.isInteger(item.rank)&&item.rank>=1&&item.rank<=5)&&['active','disabled','fired'].includes(item.status));
  if(key==='clientRequests')return Array.isArray(value)&&value.length<=20000&&unique(value)&&value.every(item=>item&&validId(item.id)&&validId(item.orderId)&&validId(item.clinicId)&&['edit','deadline','cancel'].includes(item.type)&&['pending','approved','rejected','archived'].includes(item.status)&&(!item.decision||['approved','rejected'].includes(item.decision))&&text(item.requestedBy||'',200)&&text(item.summary||'',2000)&&(!item.reason||text(item.reason,2000))&&item.changes&&typeof item.changes==='object'&&!Array.isArray(item.changes));
  if(key==='tasks')return Array.isArray(value)&&value.length<=20000&&unique(value)&&value.every(item=>item&&validId(item.id)&&validId(item.assigneeId)&&text(item.assigneeName,200)&&text(item.title,200)&&text(item.description||'',4000)&&(!item.orderId||text(item.orderId,100))&&text(item.clinic||'',200)&&text(item.patient||'',200)&&text(item.work||'',200)&&['backlog','in_progress','review','done'].includes(item.status)&&['low','normal','high','urgent'].includes(item.priority)&&(!item.dueDate||/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate))&&text(item.createdBy||'',200)&&typeof item.createdAt==='string'&&item.createdAt.length<=40&&typeof item.updatedAt==='string'&&item.updatedAt.length<=40&&(!item.completedAt||typeof item.completedAt==='string'&&item.completedAt.length<=40));
  if(key==='orderOverrides')return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length<=5000&&Object.entries(value).every(([id,detail])=>validId(id)&&detail&&typeof detail==='object'&&!Array.isArray(detail)&&(!detail.stage||text(detail.stage,80))&&(!detail.manufacturingStatus||text(detail.manufacturingStatus,80))&&(!detail.assignee||text(detail.assignee,200))&&(!detail.reworkReason||text(detail.reworkReason,2000))&&(!detail.completedAt||typeof detail.completedAt==='string'&&detail.completedAt.length<=40)&&(!detail.qualityDecision||detail.qualityDecision&&typeof detail.qualityDecision==='object'&&!Array.isArray(detail.qualityDecision)&&['cad','preprod','cam','esthetic','final'].includes(detail.qualityDecision.kind)&&['approved','rejected'].includes(detail.qualityDecision.result)&&text(detail.qualityDecision.reasonCategory||'',120)&&text(detail.qualityDecision.reason||'',1000)&&typeof detail.qualityDecision.at==='string'&&detail.qualityDecision.at.length<=40)&&(!detail.cadReview||detail.cadReview&&typeof detail.cadReview==='object'&&!Array.isArray(detail.cadReview)&&['pending','approved','returned'].includes(detail.cadReview.status)&&validId(detail.cadReview.fileId)&&text(detail.cadReview.fileName,200)&&text(detail.cadReview.sentBy||'',200)&&text(detail.cadReview.reviewedBy||'',200)&&text(detail.cadReview.comment||'',2000)&&Number.isSafeInteger(detail.cadReview.revision)&&detail.cadReview.revision>0&&detail.cadReview.revision<10000&&typeof detail.cadReview.sentAt==='string'&&detail.cadReview.sentAt.length<=40&&(!detail.cadReview.reviewedAt||typeof detail.cadReview.reviewedAt==='string'&&detail.cadReview.reviewedAt.length<=40)));
  if(key==='workCatalog')return Array.isArray(value)&&value.length<=100&&value.every(category=>category&&text(category.name,120)&&category.name.trim()&&Array.isArray(category.options)&&category.options.length<=100&&category.options.every(option=>option&&text(option.name,200)&&option.name.trim()&&Number.isFinite(Number(option.price))&&Number(option.price)>=0&&Number(option.price)<=100000000&&(option.productionDays===null||option.productionDays===undefined||Number.isInteger(option.productionDays)&&option.productionDays>=0&&option.productionDays<=365)));
  if(key==='deliverySettings')return value&&typeof value==='object'&&!Array.isArray(value)&&Number.isFinite(Number(value.freeThreshold))&&Number(value.freeThreshold)>=0&&Number(value.freeThreshold)<=100000000&&Number.isFinite(Number(value.fee))&&Number(value.fee)>=0&&Number(value.fee)<=100000000;
  if(key==='promoCodes')return Array.isArray(value)&&value.length<=500&&new Set(value.map(item=>String(item?.code||'').toUpperCase())).size===value.length&&value.every(item=>item&&/^[A-Z0-9_-]{2,40}$/.test(String(item.code||'').toUpperCase())&&text(item.name||'',120)&&typeof item.active==='boolean'&&item.prices&&typeof item.prices==='object'&&!Array.isArray(item.prices)&&Object.values(item.prices).every(price=>Number.isFinite(Number(price))&&Number(price)>=0&&Number(price)<=100000000));
  return false;
}

function eventFor(orderId,actor,action,details={}){
  return {id:`evt-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,orderId,at:new Date().toISOString(),actor:actor?.name||actor?.role||'Система',actorRole:actor?.role||'system',action,...details};
}
export async function replacePortalCollection(key,value,actor={},options={}){
  const prepared=key==='clients'&&Array.isArray(value)?assignTelegramCodes(value):value;
  if(!validCollection(key,prepared))throw new Error('invalid_collection');
  let next=structuredClone(prepared);
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    const previous=state[key];
    const previousPromoCodes=state.promoCodes;
    const previousVersions={...(state.collectionVersions||{})};
    const previousOverrides=state.orderOverrides;
    if(key==='workCatalog'){
      next=normalizeWorkCatalog(next,previous).map((category,index)=>({...category,position:String(index).padStart(5,'0')}));
      const oldPriceKeys=new Map((previous||[]).flatMap(category=>(category.options||[]).map(option=>[`${category.name}|||${option.name}`,option.id])));
      const renamedKeys=new Map(next.flatMap(category=>(category.options||[]).map(option=>[option.id,`${category.name}|||${option.name}`])));
      state.promoCodes=(state.promoCodes||[]).map(rule=>({...rule,prices:Object.fromEntries(Object.entries(rule.prices||{}).map(([key,price])=>[renamedKeys.get(oldPriceKeys.get(key))||key,price]))}));
    }
    const previousHistory=state.orderHistory;
    const previousAccruals=state.salaryAccruals;
    if(key==='payrollSettings'&&next.revision!==(previous?.revision||0))throw new Error('payroll_conflict');
    if(key==='clients')next=next.map(client=>{
      const before=(previous||[]).find(item=>item.id===client.id);
      if(!before)return client;
      if(!Object.hasOwn(client,'doctors'))return {...client,...(before.doctors?{doctors:before.doctors,doctorsRevision:before.doctorsRevision||0}:{})};
      if(!samePortalValue(client.doctors,before.doctors||[])){
        if((client.doctorsRevision||0)!==(before.doctorsRevision||0))throw new Error('doctors_conflict');
        return {...client,doctorsRevision:(before.doctorsRevision||0)+1};
      }
      return {...client,doctorsRevision:before.doctorsRevision||0};
    });
    if(key==='orders')next=next.map(order=>{
      if((previous||[]).some(item=>item.id===order.id))return order;
      if(order.variants?.length)order={...order,variants:order.variants.map(variant=>{
        const selection=resolveWorkSelection(variant.workId||variant.work,variant.serviceId||variant.workOption);
        if(!selection.option)return variant;
        const promo=state.promoCodes?.find(item=>item.active!==false&&item.code===order.promoCode)?.prices?.[`${selection.category.name}|||${selection.option.name}`];
        return {...variant,workId:selection.category.id,serviceId:selection.option.id,pricingUnit:selection.category.pricingUnit,unitPrice:Number.isFinite(Number(promo))?Number(promo):Number(selection.option.price)};
      })};

      if((previous||[]).some(item=>item.id===order.id)||!Object.hasOwn(order,'doctorId'))return order;
      const clinic=state.clients.find(item=>item.id===order.clinicId),active=availableClinicDoctors(clinic);
      if(!order.doctorId){if(active.length)throw new Error('invalid_doctor');return {...order,doctor:''};}
      const doctor=active.find(item=>item.id===order.doctorId);
      if(!doctor)throw new Error('invalid_doctor');
      return {...order,doctor:doctor.name,doctorSpecialty:doctor.specialty||''};
    });

    next=versionCollection(key,next,previous,options.expectedVersion,previousVersions[key]||0);
    const generated=[];
    if(key==='orderOverrides'){
      const ids=new Set([...Object.keys(previous||{}),...Object.keys(next||{})]);
      for(const id of ids){
        const before=previous?.[id]||{},after=next?.[id]||{};
        if(before.stage!==after.stage){
          generated.push(eventFor(id,actor,'stage_changed',{from:before.stage||'Новый',to:after.stage||'Новый',reason:after.reworkReason||''}));
        }
        if(after.qualityDecision?.at&&after.qualityDecision.at!==before.qualityDecision?.at){
          const decision=after.qualityDecision;
          generated.push(eventFor(id,actor,decision.result==='approved'?'quality_check_approved':'quality_check_rejected',{kind:decision.kind,reasonCategory:decision.reasonCategory||'',reason:decision.reason||'',requestedAt:decision.requestedAt||'',summary:decision.result==='approved'?'ОТК пройдена':`ОТК: ${decision.reasonCategory||'возврат на доработку'}`}));
        }
        if(after.estheticQualityApprovedAt&&after.estheticQualityApprovedAt!==before.estheticQualityApprovedAt&&after.qualityDecision?.kind!=='esthetic'){
          generated.push(eventFor(id,actor,'quality_check_approved',{kind:'esthetic',summary:'ОТК эстетики пройдена'}));
        }
        if(after.qualityRequest?.kind==='final'&&before.qualityRequest?.kind!=='final'){
          generated.push(eventFor(id,actor,'final_quality_requested',{summary:'Заказ передан на отдельную финальную ОТК'}));
        }
        if(after.finalQualityApprovedAt&&after.finalQualityApprovedAt!==before.finalQualityApprovedAt)generated.push(eventFor(id,actor,'final_quality_approved',{summary:'Финальная ОТК отдельно одобрена. Заказ передан на доставку'}));
        if(before.assignee!==after.assignee)generated.push(eventFor(id,actor,'assignee_changed',{from:before.assignee||'Не назначен',to:after.assignee||'Не назначен'}));
        if(before.manufacturingStatus!==after.manufacturingStatus&&after.manufacturingStatus)generated.push(eventFor(id,actor,'manufacturing_status_changed',{from:before.manufacturingStatus||'—',to:after.manufacturingStatus}));
        if(before.reworkReason!==after.reworkReason&&after.reworkReason)generated.push(eventFor(id,actor,'rework_requested',{reason:after.reworkReason}));
      }
    }else if(key==='orders'){
      const oldById=new Map((previous||[]).map(order=>[order.id,order]));
      const newById=new Map(next.map(order=>[order.id,order]));
      for(const order of next){const before=oldById.get(order.id);if(!before)generated.push(eventFor(order.id,actor,'order_created',{summary:`${orderWorkLabel(order)||'Заказ'} · ${order.patient||''}`}));else if(!samePortalValue(before,order))generated.push(eventFor(order.id,actor,'order_updated',{summary:'Изменены данные заказа'}))}
      for(const order of previous||[])if(!newById.has(order.id))generated.push(eventFor(order.id,actor,'order_deleted',{summary:'Заказ удалён'}));
    }
    try {
    state.collectionVersions={...previousVersions,[key]:(previousVersions[key]||0)+1};
    state[key]=key==='payrollSettings'?{...next,revision:(previous?.revision||0)+1,updatedAt:new Date().toISOString()}:next;
    if(key==='orderOverrides'){const accrued=collectPayrollAccruals(state,{previousOverrides:previous,actorRole:actor.role});if(accrued.length)state.salaryAccruals=[...(state.salaryAccruals||[]),...accrued];}
    if(key==='employees'){const released=releaseEmployeeAssignments(state.orderOverrides,next);if(released!==state.orderOverrides){state.orderOverrides=versionCollection('orderOverrides',released,previousOverrides);state.collectionVersions.orderOverrides=(previousVersions.orderOverrides||0)+1;}}
    if(key==='workCatalog')workCatalog.splice(0,workCatalog.length,...cloneCatalog(next));
    if(generated.length)state.orderHistory=[...(state.orderHistory||[]),...generated].slice(-50000);
      const changedKeys=new Set([key]);
      if(key==='workCatalog'&&JSON.stringify(state.promoCodes)!==JSON.stringify(previousPromoCodes))changedKeys.add('promoCodes');
      if(state.orderOverrides!==previousOverrides)changedKeys.add('orderOverrides');
      if(generated.length)changedKeys.add('orderHistory');
      if(state.salaryAccruals!==previousAccruals)changedKeys.add('salaryAccruals');
      await persistState([...changedKeys]);
    } catch(error){state[key]=previous;state.promoCodes=previousPromoCodes;state.orderOverrides=previousOverrides;state.collectionVersions=previousVersions;state.orderHistory=previousHistory;state.salaryAccruals=previousAccruals;if(key==='workCatalog')workCatalog.splice(0,workCatalog.length,...cloneCatalog(previous));throw error}
  });
  await saveQueue;
  return portalSnapshot();
}

export async function recordPortalEvent(orderId,actor,action,details={}){
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    const previous=state.orderHistory;
    state.orderHistory=[...(state.orderHistory||[]),eventFor(orderId||'',actor,action,details)].slice(-50000);
    try{
      await persistState(['orderHistory']);
    }catch(error){state.orderHistory=previous;throw error}
  });
  await saveQueue;
  return portalSnapshot().orderHistory.at(-1);
}

// Reuse the existing PostgreSQL pool for the owner's private financial records.
export function portalDatabasePool(){return databasePool;}

export async function removePortalOrder(orderId,actor={}){
 let removed;
 saveQueue=saveQueue.catch(()=>{}).then(async()=>{
  const before=state;
  removed=state.orders.find(item=>item.id===orderId);
  if(!removed)throw new Error('not_found');
  const overrides={...state.orderOverrides};delete overrides[orderId];
  state={...state,orders:state.orders.filter(item=>item.id!==orderId),orderOverrides:overrides,orderHistory:[...(state.orderHistory||[]),eventFor(orderId,actor,'order_deleted',{summary:'Заказ удалён'})].slice(-50000),collectionVersions:{...state.collectionVersions,orders:(state.collectionVersions?.orders||0)+1,orderOverrides:(state.collectionVersions?.orderOverrides||0)+1}};
  try{await persistState(['orders','orderOverrides','orderHistory']);}catch(error){state=before;throw error;}
 });
 await saveQueue;return removed;
}
