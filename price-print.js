import {isHighVolumeLithiumRestoration} from './work-catalog.js?v=deadline-batch-1';

let printInProgress=false;

const escapeValue=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const rublesValue=value=>Number.isFinite(Number(value))?new Intl.NumberFormat('ru-RU').format(Number(value))+' ₽':'По запросу';
const dayLabel=days=>{
  if(days===null||days===undefined||days==='')return 'Срок уточняется';
  const number=Number(days),last=number%10,teens=number%100>=11&&number%100<=14;
  return `${number} ${!teens&&last===1?'рабочий день':!teens&&last>=2&&last<=4?'рабочих дня':'рабочих дней'}`;
};
const deadlineMarkup=(category,option)=>{
  const days=typeof option==='string'?null:option?.productionDays;
  if(!isHighVolumeLithiumRestoration(category?.name,typeof option==='string'?option:option?.name))return `<span>${dayLabel(days)}</span>`;
  return `<div class="price-print-deadline"><span><small>≤ 10 ед.</small><b>${dayLabel(days)}</b></span><span class="is-batch"><small>11+ ед.</small><b>14 рабочих дней</b></span></div>`;
};

function markup(catalog,logo){
  const categories=(catalog||[]).filter(category=>String(category?.name||'').trim());
  const serviceCount=categories.reduce((sum,category)=>sum+(category.options||[]).length,0);
  const sections=categories.map((category,index)=>`<section class="price-print-section"><header><span class="price-print-index">${String(index+1).padStart(2,'0')}</span><div><h2>${escapeValue(category.name)}</h2><p>${(category.options||[]).length} ${(category.options||[]).length===1?'услуга':'услуг'}</p></div></header><div class="price-print-table"><div class="price-print-table-head"><span>Услуга</span><span>Цена</span><span>Срок</span></div>${(category.options||[]).map(option=>`<div class="price-print-row"><strong>${escapeValue(typeof option==='string'?option:option.name||'Без названия')}</strong><b>${rublesValue(typeof option==='string'?null:option.price)}</b>${deadlineMarkup(category,option)}</div>`).join('')}</div></section>`).join('');
  return `<article class="price-print-paper"><header class="price-print-hero"><div class="price-print-brand"><img src="${escapeValue(logo)}" alt="Create Dental"></div><div class="price-print-meta"><span>ПРАЙС И СРОКИ</span><strong>Актуальная версия</strong><small>Цены и производственные сроки</small></div></header><div class="price-print-intro"><div><p class="price-print-eyebrow">ЛАБОРАТОРИЯ CREATE DENTAL</p><h1>Прайс на услуги</h1><p>Выберите подходящую услугу — мы рассчитаем срок и подготовим заказ по согласованному маршруту.</p></div><div class="price-print-summary"><strong>${serviceCount}</strong><span>услуг&nbsp;в&nbsp;каталоге</span></div></div><main>${sections||'<p>Услуги пока не добавлены.</p>'}</main><footer><span>orders@createdental.io</span><span>createdental.io</span><span>Создано ${new Date().toLocaleDateString('ru-RU')}</span></footer></article>`;
}

export function openPricePrint({catalog,logo='/assets/create-dental-logo.png'}={}){
  if(printInProgress)return false;
  printInProgress=true;
  document.querySelector('.price-print-root')?.remove();
  const root=document.createElement('div');
  root.className='price-print-root';
  root.innerHTML=markup(catalog,logo);
  document.body.append(root);
  const previousTitle=document.title;
  document.title='Create Dental — Прайс и сроки';
  const finish=()=>{root.remove();document.title=previousTitle;printInProgress=false;window.removeEventListener('afterprint',finish)};
  window.addEventListener('afterprint',finish,{once:true});
  requestAnimationFrame(()=>window.print());
  return true;
}
