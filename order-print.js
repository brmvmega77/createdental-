const {default:qrcode}=await import(import.meta.url.startsWith('file:')
  ? './public/assets/vendor/qrcode-generator.js'
  : './assets/vendor/qrcode-generator.js?v=2.0.4');
import {orderVariantConstructionLabel} from './order-list-utils.js?v=order-fields-1';

const escapeValue = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function displayDate(value){
  if(!value)return '';
  const raw=String(value);
  if(/^\d{2}\.\d{2}\.\d{4}$/.test(raw))return raw;
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'':date.toLocaleDateString('ru-RU');
}

function variantsFor(order){
  if(Array.isArray(order?.variants)&&order.variants.length)return order.variants;
  return [{selectedTeeth:Array.isArray(order?.teeth)?order.teeth:[],bridgeRanges:Array.isArray(order?.bridgeRanges)?order.bridgeRanges:[]}];
}

const upperTeeth=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const lowerTeeth=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

function formulaMarkup(){return `<div class="order-print-formula"><div>${upperTeeth.map(tooth=>`<span>${tooth}</span>`).join('')}</div><div>${lowerTeeth.map(tooth=>`<span>${tooth}</span>`).join('')}</div></div>`}
function lineField(label,value=''){return `<div class="order-print-line-field"><span>${escapeValue(label)}</span><b>${escapeValue(value)}</b></div>`}
function orderDoctor(order){
  const doctor=order?.doctor;
  return String(
    (typeof doctor==='object' ? (doctor.name||doctor.fullName||doctor.displayName) : doctor)
    || order?.doctorName
    || order?.dentist
    || (typeof order?.doctorRecord==='object' ? (order.doctorRecord.name||order.doctorRecord.fullName) : order?.doctorRecord)
    || ''
  ).trim();
}
function orderCardUrl(order){
  const origin=typeof location!=='undefined'&&location.origin&&location.origin!=='null'?location.origin:'https://createdental.io';
  return `${origin}/clinic/orders/${encodeURIComponent(order?.id||'')}`;
}
function qrMarkup(order){
  const url=orderCardUrl(order);
  const code=qrcode(0,'M');
  code.addData(url,'Byte');
  code.make();
  const svg=code.createSvgTag({cellSize:1,margin:4,scalable:true});
  return `<div class="order-print-qr">${svg}<small>Карточка заказа</small></div>`;
}
function serviceName(order,variant){
  return orderVariantConstructionLabel(variant,order)==='—'?'':orderVariantConstructionLabel(variant,order);
}
function servicesByTooth(order,variants){
  const services=new Map();
  for(const variant of variants){
    const teeth=Array.isArray(variant?.selectedTeeth)?variant.selectedTeeth:[];
    const label=serviceName(order,variant);
    if(!label)continue;
    teeth.forEach(tooth=>{
      const values=services.get(Number(tooth))||[];
      if(!values.includes(label))values.push(label);
      services.set(Number(tooth),values);
    });
  }
  return services;
}
function sideToothLines(teeth,services=new Map(),side='left'){
  return teeth.map((tooth,index)=>{
    const service=services.get(tooth)?.join('; ')||'';
    const content=side==='right'
      ?`<div class="order-print-line-content"><span>${tooth}</span>${service?`<b>${escapeValue(service)}</b>`:''}</div>`
      :`<div class="order-print-line-content">${service?`<b>${escapeValue(service)}</b>`:''}<span>${tooth}</span></div>`;
    return side==='right'?`<div class="order-print-tooth-line"><i></i>${content}</div>`:`<div class="order-print-tooth-line">${content}<i></i></div>`;
  }).join('');
}

function mergedSelection(variants){
  const selected=[...new Set(variants.flatMap(variant=>Array.isArray(variant?.selectedTeeth)?variant.selectedTeeth:[]).map(Number).filter(Number.isFinite))];
  const ranges=[];
  const seen=new Set();
  for(const variant of variants){
    for(const range of Array.isArray(variant?.bridgeRanges)?variant.bridgeRanges:[]){
      const normalized=Array.isArray(range)?range.map(Number).filter(Number.isFinite):[];
      if(!normalized.length)continue;
      const key=normalized.join(',');
      if(seen.has(key))continue;
      seen.add(key);ranges.push(normalized);
    }
  }
  return {selected,ranges};
}

function sheetMarkup(order,variants,toothChart,logo){
  const {selected,ranges}=mergedSelection(variants);
  const chart=typeof toothChart==='function'?toothChart(false,selected,ranges):'';
  const services=servicesByTooth(order,variants);
  const serviceLabels=[...new Set(variants.map(variant=>serviceName(order,variant)).filter(Boolean))];
  const serviceLabel=serviceLabels.join('; ');
  return `<article class="order-print-sheet"><div class="order-print-project">Заказ-наряд № <strong>${escapeValue(order.id||'')}</strong>${serviceLabel?`<small class="order-print-service-title">${escapeValue(serviceLabel)}</small>`:''}</div><div class="order-print-top"><div class="order-print-fields">${lineField('Клиника',order.clinic)}${lineField('Доктор',orderDoctor(order)||'Не указан')}${lineField('Пациент',order.patient)}${lineField('Создан',displayDate(order.createdAt))}${lineField('Ожидаемая дата',displayDate(order.date))}</div><div class="order-print-brand"><img src="${escapeValue(logo)}" alt="Create Dental"><span>e-mail: orders@createdental.io</span></div></div><h1 class="order-print-formula-title">Зубная формула</h1>${formulaMarkup()}<div class="order-print-main"><div class="order-print-side order-print-side-left">${sideToothLines([11,12,13,14,15,16,17,18,48,47,46,45,44,43,42,41],services,'left')}</div><div class="order-print-jaw">${chart||'<span>Схема не указана</span>'}</div><div class="order-print-side order-print-side-right">${sideToothLines([21,22,23,24,25,26,27,28,38,37,36,35,34,33,32,31],services,'right')}</div></div><div class="order-print-bottom"><div class="order-print-color">${lineField('ЦВЕТ',order.shade||'')}</div><div class="order-print-note">${lineField('Примечание',order.comment||'')}</div>${qrMarkup(order)}</div></article>`;
}

export function openOrderPrint({order,toothChart,logo='/assets/create-dental-logo.png'}){
  if(!order)return;
  document.querySelector('.order-print-root')?.remove();
  const variants=variantsFor(order);
  document.body.insertAdjacentHTML('beforeend',`<div class="order-print-root"><section class="order-print-paper">${sheetMarkup(order,variants,toothChart,logo)}</section></div>`);
  const root=document.querySelector('.order-print-root');
  window.addEventListener('afterprint',()=>root?.remove(),{once:true});
  const images=[...root.querySelectorAll('img')];
  let printed=false;
  const startPrint=()=>{if(printed)return;printed=true;requestAnimationFrame(()=>window.print())};
  const fallback=setTimeout(startPrint,1800);
  Promise.all(images.map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true})}))).then(()=>{clearTimeout(fallback);startPrint()});
}
