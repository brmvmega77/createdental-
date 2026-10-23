import {payrollRoles,payrollCatalog} from './payroll.js';
import {portalToken} from './portal-client.js';

const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=value=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:0,maximumFractionDigits:2}).format(value);
const monthKey=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).format(new Date(value)).slice(0,7);
const dateLabel=value=>new Date(value).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'});
async function request(path,options={}){
  const response=await fetch(path,{cache:'no-store',...options,headers:{'X-Portal-Token':portalToken(),'Content-Type':'application/json'}});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Не удалось загрузить зарплаты');
  return data;
}
export function createPayrollUI({root,isActive,worker=false,onSummary=()=>{}}){
  const state={data:null,draft:null,loading:false,saving:false,dirty:false,error:'',notice:'',role:'cad',search:'',tab:'rates',month:monthKey(new Date()),employee:'',loadedAt:0};
  let identityKey=portalToken(),generation=0;
  function ensureIdentity(){
    const next=portalToken();if(next===identityKey)return;
    identityKey=next;generation++;Object.assign(state,{data:null,draft:null,loading:false,saving:false,dirty:false,error:'',notice:'',role:'cad',search:'',tab:'rates',month:monthKey(new Date()),employee:'',loadedAt:0});
  }
  const surface=()=>root().querySelector('[data-payroll-surface]');
  const roleInfo=()=>payrollRoles.find(role=>role.key===state.role);
  function entries(){return (state.data?.accruals||[]).filter(item=>(!state.employee||item.employeeId===state.employee)&&(!state.month||monthKey(item.at)===state.month)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))}
  function accrualMarkup(){
    const rows=entries(),employees=state.data.employees||[],months=[...new Set([monthKey(new Date()),...(state.data.accruals||[]).map(item=>monthKey(item.at))])].sort().reverse();
    return '<div class="payroll-ledger-tools">'+(!worker?'<label>Сотрудник<select data-payroll-filter="employee"><option value="">Все сотрудники</option>'+employees.map(item=>'<option value="'+safe(item.id)+'" '+(state.employee===item.id?'selected':'')+'>'+safe(item.name)+'</option>').join('')+'</select></label>':'')+'<label>Период<select data-payroll-filter="month"><option value="">За всё время</option>'+months.map(month=>'<option value="'+month+'" '+(state.month===month?'selected':'')+'>'+new Date(month+'-15').toLocaleDateString('ru-RU',{month:'long',year:'numeric'})+'</option>').join('')+'</select></label><div class="payroll-period-total"><span>Начислено за период</span><strong>'+money(rows.reduce((sum,item)=>sum+item.amount,0))+'</strong></div></div><div class="payroll-accruals">'+(rows.length?rows.map(item=>'<article class="payroll-accrual"><header><div><strong>'+safe(item.orderId)+'</strong><span>'+safe(item.employeeName)+' · '+safe(payrollRoles.find(role=>role.key===item.role)?.label||item.role)+' · '+(item.legacy?'Прежняя ставка':'Ранг '+item.rank)+'</span></div><div><strong>'+money(item.amount)+'</strong><time>'+dateLabel(item.at)+'</time></div></header>'+item.lines.map(line=>'<div class="payroll-accrual-line"><span>'+safe(line.service)+'</span><span>'+line.units+' ед. × '+money(line.rate)+'</span><strong>'+money(line.amount)+'</strong></div>').join('')+'</article>').join(''):'<p class="tech-empty">За выбранный период начислений нет. Они появятся после приёмки выполненных работ.</p>')+'</div>';
  }
  function rateRows(){
    const query=state.search.trim().toLocaleLowerCase('ru'),catalog=payrollCatalog(state.data.catalog),settings=state.draft;
    return catalog.filter(item=>!query||(item.work+' '+item.service).toLocaleLowerCase('ru').includes(query)).map(item=>'<div class="payroll-rate-row"><div class="payroll-service"><strong>'+safe(item.service)+'</strong><small>'+safe(item.work)+'</small></div>'+[1,2,3,4,5].map(rank=>{
      const value=settings.rates?.[state.role]?.[item.key]?.[rank-1];
      return '<label class="payroll-rate-cell"><span>Ранг '+rank+'</span><input type="number" inputmode="decimal" min="0" max="10000000" step="0.01" data-payroll-rate="'+safe(item.key)+'" data-rank="'+rank+'" aria-label="'+safe(item.service)+' — ранг '+rank+'" placeholder="'+roleInfo().fallback+'" value="'+(value===null||value===undefined?'':value)+'" '+(state.saving?'disabled':'')+'><small>₽ / ед.</small></label>';
    }).join('')+'</div>').join('')||'<p class="tech-empty">Услуг по вашему запросу не найдено.</p>';
  }
  function ratesMarkup(){
    return '<form data-payroll-rates-form><div class="payroll-rate-toolbar"><label>Специальность<select data-payroll-role>'+payrollRoles.map(role=>'<option value="'+role.key+'" '+(role.key===state.role?'selected':'')+'>'+role.label+'</option>').join('')+'</select></label><label>Поиск услуги<input type="search" data-payroll-search value="'+safe(state.search)+'" placeholder="Название услуги"></label><button class="btn primary" type="submit" '+(state.saving?'disabled':'')+'>'+(state.saving?'Сохранение…':'Сохранить ставки')+'</button></div><p class="payroll-help">Вознаграждение за одну единицу услуги. Пустое поле — действующая общая ставка '+money(roleInfo().fallback)+'. Укажите 0, если услуга не оплачивается этому специалисту.</p><div class="payroll-rate-head"><span>Услуга</span>'+[1,2,3,4,5].map(rank=>'<span>Ранг '+rank+'</span>').join('')+'</div><div data-payroll-rate-rows>'+rateRows()+'</div><p class="payroll-save-status" role="status">'+(state.dirty?'Есть несохранённые изменения.':'')+'</p>'+(state.dirty?'<button type="button" class="tech-link" data-payroll-discard>Отменить изменения и обновить</button>':'')+'</form>';
  }
  function workerMarkup(){
    const employee=state.data.employee,role=payrollRoles.find(item=>item.key===employee.role);
    return '<div class="payroll-worker-rank"><span>'+safe(role?.label||'Сотрудник')+'</span><strong>Ранг '+employee.rank+' из 5</strong></div><p class="payroll-help">Сумма рассчитывается по каждой услуге и вашему рангу на момент приёмки. CAD начисляется после согласования врачом, остальные работы — после приёмки главным техником.</p>'+accrualMarkup()+'<details class="payroll-own-rates"><summary>Мои текущие ставки по услугам</summary>'+state.data.rates.map(item=>'<div><span>'+safe(item.service)+'</span><strong>'+money(item.rate)+' / ед.</strong></div>').join('')+'</details>';
  }
  function body(){
    if(!state.data)return '<p class="payroll-loading" role="status">'+(state.loading?'Загружаем зарплаты…':'')+'</p>';
    return worker?workerMarkup():'<div class="payroll-section-tabs" role="group" aria-label="Раздел зарплат"><button type="button" data-payroll-tab="rates" aria-pressed="'+(state.tab==='rates')+'" class="'+(state.tab==='rates'?'active':'')+'">Ставки по рангам</button><button type="button" data-payroll-tab="accruals" aria-pressed="'+(state.tab==='accruals')+'" class="'+(state.tab==='accruals'?'active':'')+'">Начисления</button></div>'+(state.tab==='rates'?ratesMarkup():accrualMarkup());
  }
  function content(){return '<header class="payroll-heading"><div><h1>'+(worker?'Зарплата':'Зарплаты')+'</h1><p>'+(worker?'Ваши начисления за выполненные работы.':'Ставки за услуги для CAD, CAM, эстетистов и гипсовщиков.')+'</p></div><button class="btn outline" type="button" data-payroll-refresh '+(state.loading||state.saving||state.dirty?'disabled':'')+'>Обновить</button></header><div class="payroll-feedback" data-payroll-feedback><p class="payroll-error" role="alert" '+(state.error?'':'hidden')+'>'+safe(state.error)+'</p><p class="payroll-notice" role="status" '+(state.notice?'':'hidden')+'>'+safe(state.notice)+'</p></div><section class="tech-panel payroll-panel">'+body()+'</section>'}
  function paint(){const node=surface();if(node)node.innerHTML=content()}
  async function load(force=false){
    ensureIdentity();
    const requestGeneration=generation,requestIdentity=identityKey;
    if(state.loading||state.dirty||state.saving||!isActive()||!force&&state.loadedAt&&Date.now()-state.loadedAt<20000)return;
    state.loading=true;state.error='';paint();
    try{const data=await request('/api/payroll');if(requestGeneration!==generation||requestIdentity!==portalToken())return;state.data=data;state.draft=worker?null:structuredClone(state.data.settings);state.loadedAt=Date.now();onSummary(state.data)}catch(error){if(requestGeneration===generation)state.error=error.message}finally{if(requestGeneration===generation){state.loading=false;if(isActive())paint()}}
  }
  document.addEventListener('input',event=>{
    if(!isActive()||!event.target.closest('[data-payroll-surface]')||state.saving)return;
    const input=event.target;
    if(input.matches('[data-payroll-search]')){state.search=input.value;root().querySelector('[data-payroll-rate-rows]').innerHTML=rateRows();return}
    if(!input.matches('[data-payroll-rate]')||worker)return;
    const key=input.dataset.payrollRate,index=Number(input.dataset.rank)-1;
    state.draft.rates[state.role]??={};state.draft.rates[state.role][key]??=[null,null,null,null,null];
    state.draft.rates[state.role][key][index]=input.value===''?null:Number(input.value);
    state.dirty=true;state.notice='';
    root().querySelector('.payroll-save-status').textContent='Есть несохранённые изменения.';
    root().querySelector('[data-payroll-refresh]').disabled=true;
    if(!root().querySelector('[data-payroll-discard]')){const button=document.createElement('button');button.type='button';button.className='tech-link';button.dataset.payrollDiscard='';button.textContent='Отменить изменения и обновить';root().querySelector('[data-payroll-rates-form]').append(button)}
  });
  document.addEventListener('change',event=>{
    if(!isActive()||!event.target.closest('[data-payroll-surface]')||state.saving)return;
    if(event.target.matches('[data-payroll-role]')){state.role=event.target.value;paint()}
    if(event.target.matches('[data-payroll-filter]')){state[event.target.dataset.payrollFilter]=event.target.value;paint()}
  });
  document.addEventListener('click',event=>{
    if(!isActive()||!event.target.closest('[data-payroll-surface]')||state.saving)return;
    const tab=event.target.closest('[data-payroll-tab]');if(tab){state.tab=tab.dataset.payrollTab;paint()}
    if(event.target.closest('[data-payroll-discard]')){state.dirty=false;state.notice='';void load(true)}
    if(event.target.closest('[data-payroll-refresh]')){state.notice='';void load(true)}
  });
  document.addEventListener('submit',async event=>{
    if(!isActive()||worker||!event.target.matches('[data-payroll-rates-form]'))return;
    event.preventDefault();if(state.saving)return;
    const form=event.target;if(!form.reportValidity())return;
    const requestGeneration=generation,requestIdentity=identityKey;
    state.saving=true;state.error='';state.notice='';paint();
    try{const result=await request('/api/payroll/settings',{method:'PUT',body:JSON.stringify(state.draft)});if(requestGeneration!==generation||requestIdentity!==portalToken())return;state.data.settings=result.settings;state.draft=structuredClone(result.settings);state.dirty=false;state.notice='Ставки сохранены. Применяются к новым приёмкам работ.';state.loadedAt=Date.now()}catch(error){if(requestGeneration===generation)state.error=error.message}finally{if(requestGeneration===generation){state.saving=false;if(isActive())paint()}}
  });
  return {markup:()=>{ensureIdentity();return '<div data-payroll-surface>'+content()+'</div>'},load,summary:()=>{ensureIdentity();return state.data}};
}
