import {isHighVolumeLithiumRestoration} from './work-catalog.js?v=deadline-batch-1';

let printInProgress=false;

const escapeValue=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const rublesValue=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?new Intl.NumberFormat('ru-RU').format(Number(value))+' ₽':'По запросу';
const dayLabel=days=>{
  if(days===null||days===undefined||days==='')return 'Срок уточняется';
  const number=Number(days),last=number%10,teens=number%100>=11&&number%100<=14;
  return `${number} ${!teens&&last===1?'рабочий день':!teens&&last>=2&&last<=4?'рабочих дня':'рабочих дней'}`;
};
const deadlineMarkup=(category,option)=>{
  const days=typeof option==='string'?null:option?.productionDays;
  if(!isHighVolumeLithiumRestoration(category?.name,typeof option==='string'?option:option?.name))return `<div class="price-print-terms"><span class="price-print-term"><span></span><span>${dayLabel(days)}</span></span></div>`;
  return `<div class="price-print-terms"><span class="price-print-term"><span>≤ 10 ед.</span><span>${dayLabel(days)}</span></span><span class="price-print-term"><span>11+ ед.</span><span>14 рабочих дней</span></span></div>`;
};

function markup(catalog,logo){
  const categories=(catalog||[]).filter(category=>String(category?.name||'').trim()&&(category.options||[]).length);
  const sections=categories.map(category=>`<section class="price-print-section"><header><h2>${escapeValue(category.name)}</h2></header><table class="price-print-table"><thead><tr><th scope="col">Услуга</th><th scope="col">Цена</th><th scope="col">Срок</th></tr></thead><tbody>${(category.options||[]).map(option=>`<tr class="price-print-row"><td>${escapeValue(typeof option==='string'?option:option.name||'Без названия')}</td><td>${rublesValue(typeof option==='string'?null:option.price)}</td><td>${deadlineMarkup(category,option)}</td></tr>`).join('')}</tbody></table></section>`).join('');
  return `<article class="price-print-paper"><header class="price-print-hero"><div class="price-print-brand"><img src="${escapeValue(logo)}" alt="Create Dental"></div><div class="price-print-meta"><span>ПРАЙС И СРОКИ</span><strong>Актуальная версия</strong><small>Цены и производственные сроки</small></div></header><div class="price-print-intro"><div><p class="price-print-eyebrow">ЛАБОРАТОРИЯ CREATE DENTAL</p><h1>Прайс на услуги</h1><p>Выберите подходящую услугу — мы рассчитаем срок и подготовим заказ по согласованному маршруту.</p></div></div><main>${sections||'<p>Услуги пока не добавлены.</p>'}</main><footer><span>orders@createdental.io</span><span>createdental.io</span><span>Создано ${new Date().toLocaleDateString('ru-RU')}</span></footer></article>`;
}

// Keep the price sheet in its own document: cabinet work-order print rules
// intentionally hide every body child except .order-print-root.
const printStyles=`
@page{size:A4 portrait;margin:14mm}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:#333;font-family:Arial,Helvetica,sans-serif;font-size:9pt;line-height:1.45}
.price-print-paper{width:100%;margin:0}
.price-print-hero{display:flex;align-items:center;justify-content:space-between;gap:12mm;padding-bottom:7mm;border-bottom:1px solid #ddd}
.price-print-brand img{display:block;width:45mm;height:18mm;object-fit:contain;object-position:left center}
.price-print-meta{display:grid;gap:1mm;text-align:right;color:#666;font-size:8pt}
.price-print-meta>span{font-size:7pt;letter-spacing:.08em}
.price-print-meta strong{color:#333;font-weight:500}
.price-print-intro{padding:7mm 0 6mm}
.price-print-eyebrow{display:none}
h1{font-size:25pt;line-height:1.15;font-weight:600;letter-spacing:-.02em;margin:0 0 3mm}
.price-print-intro p{max-width:140mm;margin:0;color:#666;font-size:9pt}
.price-print-section{margin:0 0 7mm}
.price-print-section>header{break-after:avoid;page-break-after:avoid;margin-bottom:2mm}
h2{font-size:13pt;font-weight:600;line-height:1.3;margin:0}
.price-print-table{width:100%;border-collapse:collapse;table-layout:fixed}
thead{display:table-header-group}
th{text-align:left;color:#666;font-size:7.5pt;font-weight:500;border-bottom:1px solid #ccc;padding:2mm 0}
th:first-child{width:59%}th:nth-child(2){width:16%}th:last-child{width:25%}
td{vertical-align:top;border-bottom:1px solid #eee;padding:2.5mm 0;font-size:8.5pt;overflow-wrap:anywhere}
td:first-child{padding-right:5mm}td:nth-child(2){padding-right:3mm;white-space:nowrap}
tr{break-inside:avoid;page-break-inside:avoid}
.price-print-terms{display:grid;gap:1mm;color:#555;font-size:8pt}
.price-print-term{display:flex;gap:2mm;justify-content:space-between}
.price-print-term>span:first-child:empty{display:none}
footer{display:flex;justify-content:space-between;flex-wrap:wrap;gap:3mm;margin-top:8mm;padding-top:3mm;border-top:1px solid #ddd;color:#666;font-size:7pt;break-inside:avoid}
`;

export function openPricePrint({catalog,logo='/assets/create-dental-logo.png',onError=()=>{}}={}){
  if(printInProgress)return false;
  printInProgress=true;
  const frame=document.createElement('iframe');
  frame.className='price-print-frame';frame.title='Прайс на услуги Create Dental';
  // Offscreen, rather than display:none, so browsers can lay out and print it.
  frame.style.cssText='position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;pointer-events:none';
  frame.setAttribute('aria-hidden','true');
  document.body.append(frame);
  const printWindow=frame.contentWindow;
  const finish=()=>{printWindow?.removeEventListener('afterprint',finish);frame.remove();printInProgress=false};
  const fail=error=>{finish();onError(error)};
  try{
    const doc=frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><base href="${escapeValue(document.baseURI)}"><title>Create Dental — Прайс и сроки</title><style>${printStyles}</style></head><body>${markup(catalog,logo)}</body></html>`);
    doc.close();
    printWindow.addEventListener('afterprint',finish,{once:true});
    const images=[...doc.images].map(image=>image.complete?Promise.resolve():new Promise(resolve=>{
      const done=()=>{clearTimeout(timer);image.removeEventListener('load',done);image.removeEventListener('error',done);resolve()};
      const timer=setTimeout(done,3000);image.addEventListener('load',done,{once:true});image.addEventListener('error',done,{once:true});
    }));
    Promise.all([...images,doc.fonts?.ready||Promise.resolve()]).then(()=>{
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        try{doc.querySelector('.price-print-paper').getBoundingClientRect();printWindow.focus();printWindow.print()}catch(error){fail(error)}
      }));
    }).catch(fail);
    return true;
  }catch(error){fail(error);return false}
}
