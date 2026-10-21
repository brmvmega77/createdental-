// Pure, server-side owner reporting. No patient names or raw file data leave this module.
const DAY = 86400000;
const FINISHED = new Set(['В доставке','Принято доктором','Готово к выдаче','Готово','Завершён']);
const CANCELLED = new Set(['Отменён','Отменен','Удалён']);
export const COST_KEYS = ['materials','labor','outsourcing','delivery','rework'];
export function moneyValue(value) {
  if(value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[\s\u00a0₽]/g,'').replace(/руб\.?/gi,'').replace(',','.'));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}
export function dateKey(value) {
  if(!value)return null;
  const s=String(value), dotted=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  const key=dotted?`${dotted[3]}-${dotted[2]}-${dotted[1]}`:/^\d{4}-\d{2}-\d{2}$/.test(s)?s:null;
  if(key){const time=Date.parse(key+'T00:00:00Z');return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===key?key:null;}
  const time=Date.parse(s);if(!Number.isFinite(time))return null;
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
}
export const shiftDay=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
export function reportingPeriod(from,to,now=new Date()) {
  const today=dateKey(now.toISOString());
  from=from||shiftDay(today,-29);to=to||today;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||dateKey(from)!==from||dateKey(to)!==to||from>to||to>today)throw new Error('Укажите корректный период, не позднее сегодняшнего дня');
  const days=Math.round((Date.parse(to)-Date.parse(from))/DAY)+1;
  if(days>366)throw new Error('Выберите период не более 366 дней');
  return {from,to,days,today,previousFrom:shiftDay(from,-days),previousTo:shiftDay(from,-1)};
}
const sum=(rows,key)=>Math.round(rows.reduce((n,r)=>n+(Number(r[key])||0),0)*100)/100;
const percent=(n,d)=>d?Math.round(n/d*1000)/10:null;
const inPeriod=(day,from,to)=>Boolean(day&&day>=from&&day<=to);
const round=n=>Math.round(n*100)/100;
function assignment(order){
  if(order.stage==='Моделирование')return order.cadOperator||order.assignee||'';
  if(order.stage==='Препрод')return order.preprodTechnician||order.preprod||'';
  if(order.stage==='Изготовление')return /Красильщик|Эстетист/i.test(order.manufacturingStatus||'')?order.painter||order.ceramicist||'':order.frameTechnician||order.technician||order.assignee||'';
  if(order.stage==='На доработке')return order.reworkKind==='preprod'?order.preprodTechnician||'':order.reworkKind==='cad'?order.cadOperator||'':order.reworkKind==='cam'?order.frameTechnician||order.technician||'':order.painter||order.ceramicist||'';
  return order.assignee||'';
}
export function buildOwnerReport(snapshot,ledger,period,now=new Date()) {
  const clients=new Map((snapshot.clients||[]).map(c=>[c.id,c]));
  const byOrder=new Map();
  for(const e of snapshot.orderHistory||[]){if(!byOrder.has(e.orderId))byOrder.set(e.orderId,[]);byOrder.get(e.orderId).push(e);}
  const rows=(snapshot.orders||[]).map(base=>{
    const o={...base,...snapshot.orderOverrides?.[base.id]};
    const stage=o.stage||({'Новый':'Ожидает распределения','В пути к вам':'В доставке','Принято':'Принято доктором'}[o.status])||o.status||'Ожидает распределения';
    const events=(byOrder.get(o.id)||[]).filter(e=>dateKey(e.at)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
    const completion=events.find(e=>e.action==='stage_changed'&&FINISHED.has(e.to));
    const created=dateKey(o.createdAt)||dateKey(events.find(e=>e.action==='order_created')?.at);
    const completed=dateKey(o.completedAt||o.finalQualityApprovedAt||completion?.at);
    const latest=events.filter(e=>e.action==='stage_changed'&&e.to===stage).at(-1);
    const entered=dateKey(latest?.at)||(stage==='Ожидает распределения'?created:null);
    const amount=moneyValue(o.sum);
    const paymentKnown=Boolean(o.paidAt)||moneyValue(o.paidAmount)!==null;
    const paid=amount===null?null:o.paidAt?amount:paymentKnown?Math.min(amount,moneyValue(o.paidAmount)):null;
    const cost=ledger.costs?.[o.id];
    const costKnown=Boolean(cost?.confirmed)&&COST_KEYS.every(k=>moneyValue(cost[k])!==null);
    const directCost=costKnown?round(COST_KEYS.reduce((n,k)=>n+moneyValue(cost[k]),0)):null;
    const services=(o.variants||o.services||[]).map(v=>v.workOption||v.option||v.work||v.name).filter(Boolean);
    return {id:o.id,clinicId:o.clinicId||'',clinic:clients.get(o.clinicId)?.name||o.clinic||'Клиника не указана',created,completed,due:dateKey(o.date||o.due),stage,active:!FINISHED.has(stage)&&!CANCELLED.has(stage),cancelled:CANCELLED.has(stage),amount,paid,paymentKnown,paymentDue:dateKey(o.paymentDueDate),outstanding:paid===null?null:round(amount-paid),directCost,cost:cost||null,contribution:costKnown&&amount!==null?round(amount-directCost):null,assignee:assignment({...o,stage}),waitingDays:entered?Math.max(0,Math.round((Date.parse(period.today)-Date.parse(entered))/DAY)):null,services:services.join(', ')||o.work||o.workType||'Услуга не указана'};
  }).filter(r=>!r.cancelled);
  const selected=rows.filter(r=>inPeriod(r.created,period.from,period.to));
  const previous=rows.filter(r=>inPeriod(r.created,period.previousFrom,period.previousTo));
  const active=rows.filter(r=>r.active),completed=rows.filter(r=>inPeriod(r.completed,period.from,period.to));
  const timed=completed.filter(r=>r.due),onTime=timed.filter(r=>r.completed<=r.due);
  const costed=selected.filter(r=>r.contribution!==null);
  const knownPayments=selected.filter(r=>r.paid!==null);
  const billable=rows.filter(r=>FINISHED.has(r.stage)),receivables=billable.filter(r=>r.outstanding>0);
  const overdue=receivables.filter(r=>r.paymentDue&&r.paymentDue<period.today);
  const stageCounts=[...new Set(active.map(r=>r.stage))].map(stage=>({stage,count:active.filter(r=>r.stage===stage).length,overdue:active.filter(r=>r.stage===stage&&r.due&&r.due<period.today).length})).sort((a,b)=>b.count-a.count);
  const qualityFirst=new Map();
  for(const e of [...(snapshot.orderHistory||[])].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))){if(e.kind&&['quality_check_approved','quality_check_rejected'].includes(e.action)&&dateKey(e.at)){const k=e.orderId+':'+e.kind;if(!qualityFirst.has(k))qualityFirst.set(k,e);}}
  const checks=[...qualityFirst.values()].filter(e=>inPeriod(dateKey(e.at),period.from,period.to));
  const team=(snapshot.employees||[]).filter(e=>e.status==='active').map(e=>{
    const assigned=active.filter(r=>r.assignee&&(r.assignee===e.originalName||r.assignee===e.name||r.assignee===e.id));
    const limit=Number.isInteger(Number(e.wipLimit))&&Number(e.wipLimit)>0?Number(e.wipLimit):null;
    return {id:e.id,name:e.name,specialty:e.specialty||'Специализация не указана',count:assigned.length,limit,overdue:assigned.filter(r=>r.due&&r.due<period.today).length,orders:assigned.map(r=>r.id)};
  }).sort((a,b)=>b.count-a.count);
  const validAssigned=new Set(team.flatMap(t=>t.orders));
  const clientGroups=new Map();
  for(const r of rows){const key=r.clinicId||r.clinic;if(!clientGroups.has(key))clientGroups.set(key,[]);clientGroups.get(key).push(r);}
  const clientRows=[...clientGroups].map(([id,items])=>{
    const chosen=items.filter(r=>inPeriod(r.created,period.from,period.to)),prior=items.filter(r=>inPeriod(r.created,period.previousFrom,period.previousTo));
    return {id,name:items[0].clinic,orders:chosen.length,amount:sum(chosen,'amount'),previousOrders:prior.length,previousAmount:sum(prior,'amount'),lastOrder:items.map(r=>r.created).filter(Boolean).sort().at(-1)||null,knownOutstanding:sum(items.filter(r=>FINISHED.has(r.stage)),'outstanding'),historyOrders:items.length};
  }).filter(c=>c.orders||c.previousOrders||c.knownOutstanding).sort((a,b)=>b.amount-a.amount);
  const periodClients=clientRows.filter(c=>c.orders),booked=sum(selected,'amount');
  const days=Array.from({length:period.days},(_,i)=>shiftDay(period.from,i));
  const bucketDays=period.days<=31?1:period.days<=93?7:30;
  const trend=[];for(let i=0;i<days.length;i+=bucketDays){const start=days[i],end=days[Math.min(i+bucketDays-1,days.length-1)],items=selected.filter(r=>inPeriod(r.created,start,end));trend.push({from:start,to:end,amount:sum(items,'amount'),count:items.length});}
  const expenses=(ledger.expenses||[]).filter(e=>inPeriod(e.date,period.from,period.to)).sort((a,b)=>b.date.localeCompare(a.date));
  const alerts=[];
  for(const r of active){if(r.due&&r.due<period.today)alerts.push({kind:'deadline',level:'urgent',title:'Срок заказа прошёл',detail:`${r.clinic} · срок ${r.due}`,orderId:r.id});else if(!r.due)alerts.push({kind:'no-date',level:'notice',title:'Не указан срок',detail:r.clinic,orderId:r.id});if(r.stage==='Согласование CAD'&&r.waitingDays>=2)alerts.push({kind:'approval',level:'notice',title:'Ожидает согласования CAD',detail:`${r.waitingDays} дн. · ${r.clinic}`,orderId:r.id});}
  for(const r of overdue)alerts.push({kind:'payment',level:'urgent',title:'Просрочен остаток оплаты',detail:r.clinic,amount:r.outstanding,orderId:r.id});
  for(const t of team.filter(t=>t.limit&&t.count>t.limit))alerts.push({kind:'load',level:'notice',title:'Превышен лимит работ',detail:`${t.name} · ${t.count} / ${t.limit}`,section:'team'});
  const rowSort=(a,b)=>(b.created||'').localeCompare(a.created||'')||a.id.localeCompare(b.id);
  return {generatedAt:now.toISOString(),period,version:ledger.version,targets:ledger.targets||{},summary:{orders:selected.length,previousOrders:previous.length,booked,previousBooked:sum(previous,'amount'),average:selected.filter(r=>r.amount!==null).length?round(booked/selected.filter(r=>r.amount!==null).length):null,paidKnown:sum(knownPayments,'paid'),paymentCoverage:knownPayments.length,costCoverage:costed.length,directCosts:sum(costed,'directCost'),contribution:costed.length?sum(costed,'contribution'):null,contributionSales:sum(costed,'amount'),margin:percent(sum(costed,'contribution'),sum(costed,'amount')),active:active.length,late:active.filter(r=>r.due&&r.due<period.today).length,completed:completed.length,onTime:percent(onTime.length,timed.length),timed:timed.length,quality:percent(checks.filter(e=>e.action==='quality_check_approved').length,checks.length),qualityChecks:checks.length,knownOutstanding:sum(receivables,'outstanding'),overdueAmount:sum(overdue,'outstanding'),unrecordedPayments:billable.filter(r=>r.paid===null).length,activeClients:periodClients.length,repeatClients:periodClients.filter(c=>c.orders>=2).length,topClientShare:percent(periodClients[0]?.amount||0,booked),expenses:sum(expenses,'amount'),unassigned:active.filter(r=>!validAssigned.has(r.id)).length},trend,stages:stageCounts,team,clients:clientRows,alerts:alerts.sort((a,b)=>(a.level==='urgent'?0:1)-(b.level==='urgent'?0:1)),orders:selected.sort(rowSort),activeOrders:active.sort(rowSort),receivables:receivables.sort((a,b)=>b.outstanding-a.outstanding),expenses,coverage:{missingCreated:rows.filter(r=>!r.created).length,missingPrice:selected.filter(r=>r.amount===null).length,missingCosts:selected.length-costed.length,missingCompletion:rows.filter(r=>FINISHED.has(r.stage)&&!r.completed).length},audit:(ledger.audit||[]).slice(-10).reverse()};
}
