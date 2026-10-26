const jawPricedNames=new Set(['Каппы','Ложки прикуса','Сплинты','Хирургические шаблоны']);
const stableId=(prefix,value)=>prefix+'-'+[...String(value)].reduce((hash,c)=>Math.imul(hash^c.charCodeAt(0),16777619)>>>0,2166136261).toString(36);
// Reordering changes only the position within one section; service records stay intact.
export function reorderCatalogService(catalog,categoryIndex,from,to){
  const options=catalog?.[categoryIndex]?.options;
  if(!Array.isArray(options)||![categoryIndex,from,to].every(Number.isInteger)||from<0||to<0||from>=options.length||to>=options.length||from===to)return catalog;
  const reordered=[...options],service=reordered.splice(from,1)[0];reordered.splice(to,0,service);
  return catalog.map((category,index)=>index===categoryIndex?{...category,options:reordered}:category);
}
export function normalizeWorkCatalog(catalog,previous=[]){
 return catalog.map((category,index)=>{
  const before=previous.find(item=>category.id?item.id===category.id:item.name===category.name);
  const aliases=[...new Set([...(before?.aliases||[]),...(category.aliases||[]),...(before&&before.name!==category.name?[before.name]:[])])];
  const id=category.id||before?.id||stableId('cat',category.name);
  return {...category,id,aliases,position:String(index).padStart(5,'0'),pricingUnit:before?.pricingUnit||category.pricingUnit||(jawPricedNames.has(category.name)?'jaw':'tooth'),options:(category.options||[]).map(option=>{
   if(typeof option==='string')option={name:option,price:null};
   const old=before?.options?.find(item=>option.id?item.id===option.id:item.name===option.name);
   return {...option,id:option.id||old?.id||stableId('svc',id+'|'+option.name),aliases:[...new Set([...(old?.aliases||[]),...(option.aliases||[]),...(old&&old.name!==option.name?[old.name]:[])])]};
  })};
 });
}
export const workCatalog=normalizeWorkCatalog([
  {name:'Планирование и диагностика',price:null,options:[
    {name:'Wax up цифровой',price:2000,productionDays:5},
    {name:'Wax up аналоговый',price:3000,productionDays:10},
    {name:'Wax up по Славичеку',price:5000,productionDays:15}
  ]},
  {name:'Вкладки',price:null,options:[
    {name:'Вкладка культевая',price:4000,productionDays:5},
    {name:'Вкладка культевая ZrO2/Дисиликат лития',price:7000,productionDays:5}
  ]},
  {name:'Реставрации',price:null,options:[
    {name:'PMMA коронка CAD/CAM',price:4000,productionDays:5},
    {name:'Композитная коронка CAD/CAM',price:10000,productionDays:5},
    {name:'Коронка дисиликат лития',price:10000,productionDays:10},
    {name:'Дисиликат лития по Славичеку',price:10000,productionDays:10},
    {name:'Коронка, винир на рефракторе',price:18000,productionDays:15},
    {name:'Одиночная реставрация OPTISHADE/MATISSE',price:25000,productionDays:15}
  ]},
  {name:'Протетика',price:null,options:[
    {name:'Индивидуальный Ti абатмент (Ti-включая вине)',price:8000,productionDays:5},
    {name:'Индивидуальный ZrO2 абатмент (Без Ti-Base)',price:9000,productionDays:5},
    {name:'Титановое основание Geo Medi',price:4500,productionDays:null},
    {name:'Титановое основание Аналог',price:2500,productionDays:null}
  ]},
  {name:'Балочные конструкции',price:null,options:[
    {name:'Цельнофрезерованная балка CoCr за единицу',price:3500,productionDays:5},
    {name:'Цельнофрезерованная балка Ti за единицу',price:6000,productionDays:5}
  ]},
  {name:'Каппы',price:null,options:[
    {name:'Бруксчекер',price:6000,productionDays:5},
    {name:'Каппа для отбеливания',price:5000,productionDays:5},
    {name:'Каппа ретенционная',price:5000,productionDays:5},
    {name:'Каппа разобщающая',price:5000,productionDays:5},
    {name:'Релаксационная шина',price:5000,productionDays:5},
    {name:'Депрограмматор Койса',price:5000,productionDays:5}
  ]},
  {name:'Сплинты',price:null,options:[
    {name:'Каппа-сплинт для завышения прикуса (ORTHOTIC)',price:10000,productionDays:5},
    {name:'Сплинт с функциональными буграми',price:12000,productionDays:5}
  ]},
  {name:'Ложки прикуса',price:null,options:[
    {name:'Индивидуальная ложка',price:2000,productionDays:2},
    {name:'Прикусной шаблон',price:2000,productionDays:2},
    {name:'Прикусной шаблон на жёстком базисе',price:3000,productionDays:2},
    {name:'Прикусной шаблон на жёстком базисе с фиксацией к имплантатам на магнитах',price:4500,productionDays:2}
  ]},
  {name:'Хирургические шаблоны',price:null,options:[
    {name:'Хирургический навигационный шаблон на 1 имплантант',price:7000,productionDays:null},
    {name:'Дополнительное гнездо под имплантант в хирургическом шаблоне',price:1500,productionDays:null},
    {name:'Маркировочный шаблон',price:3500,productionDays:5},
    {name:'Шаблон под КТ рентгеноконтрастный',price:7000,productionDays:5}
  ]},
  {name:'Дополнительные работы',price:null,options:[]}
]);

const jawPricedCategories=new Set(['Каппы','Ложки прикуса','Сплинты','Хирургические шаблоны']);
const upperJawTeeth=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const lowerJawTeeth=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

export function priceUnitsForSelection(work,teeth=[],units,pricingUnit){
  if(units!==undefined&&units!==null&&units!==''&&Number.isFinite(Number(units)))return Math.max(1,Number(units));
  const category=workCatalog.find(item=>item.id===work||item.name===work||item.aliases?.includes(work));
  if((pricingUnit||category?.pricingUnit)==='jaw'||!category&&!pricingUnit&&jawPricedCategories.has(String(work||''))){
    const selected=new Set(Array.isArray(teeth)?teeth.map(Number):[]);
    const jaws=[upperJawTeeth,lowerJawTeeth].filter(jaw=>jaw.every(tooth=>selected.has(tooth))).length;
    return Math.max(1,jaws);
  }
  return Math.max(1,Array.isArray(teeth)?teeth.length:1);
}

const normalizeCatalogText=value=>String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/gi,' ').trim();

export function isValidIsoDate(value){
 const raw=String(value||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return false;
 const [year,month,day]=raw.split('-').map(Number),date=new Date(year,month-1,day);
 return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day;
}

export function resolveWorkSelection(workValue,optionValue=''){
 const matches=(item,value)=>[item.id,item.name,...(item.aliases||[])].some(name=>normalizeCatalogText(name)===normalizeCatalogText(value));
 let category=workCatalog.find(item=>matches(item,workValue))||null;
 let option=category?.options.find(item=>matches(item,optionValue))||null;
 if(!option){
  for(const item of workCatalog){
   if(category&&item!==category)continue;
   const found=item.options.find(candidate=>matches(candidate,optionValue||workValue));
   if(found){category=item;option=found;break;}
  }
 }
 return {category,option,price:option?.price??category?.price??null};
}

// Existing services used the milling handoff before CAM methods became configurable.
// Keep that behaviour for legacy catalog entries and let the chief technician opt a
// service into the generic manufacturing route explicitly.
export const camMethodLabel=value=>value==='manufacturing'?'Процесс изготовления':'Фрезеровка';
export function camMethodForSelection(workValue,optionValue=''){
  const method=resolveWorkSelection(workValue,optionValue).option?.camMethod;
  return method==='manufacturing'?'manufacturing':'milling';
}
export function camMethodForOrder(order={}){
  const variants=Array.isArray(order.variants)&&order.variants.length
    ?order.variants
    :[{work:order.work,workOption:order.workOption||order.material,camMethod:order.camMethod}];
  return variants.some(variant=>{
    const method=variant?.camMethod==='manufacturing'||variant?.camMethod==='milling'
      ?variant.camMethod
      :camMethodForSelection(variant?.work,variant?.workOption);
    return method==='milling';
  })?'milling':'manufacturing';
}

export function catalogForPrompt(){
  return workCatalog.map(category=>({category:category.name,services:category.options.map(option=>({name:option.name,price:option.price,productionDays:option.productionDays??null}))}));
}

export function productionDaysForSelection(workValue,optionValue=''){
  return resolveWorkSelection(workValue,optionValue).option?.productionDays??null;
}

export function productionDaysForOrder(order={}){
  const variants=Array.isArray(order.variants)&&order.variants.length?order.variants:[{work:order.work,workOption:order.workOption||order.material}];
  const terms=variants.map(variant=>productionDaysForSelection(variant?.work,variant?.workOption)).filter(Number.isFinite);
  return terms.length?Math.max(...terms):null;
}

export function isWorkingDay(value){
  const date=value instanceof Date?value:new Date(value);
  return !Number.isNaN(date.getTime())&&date.getDay()!==0&&date.getDay()!==6;
}

export function addWorkingDays(value,days){
  const date=value instanceof Date?new Date(value):new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  let remaining=Math.max(0,Number(days)||0);
  while(remaining>0){
    date.setDate(date.getDate()+1);
    if(isWorkingDay(date))remaining--;
  }
  while(!isWorkingDay(date))date.setDate(date.getDate()+1);
  return date;
}

export function earliestDueDateForOrder(order={},acceptedAt=new Date()){
  const days=productionDaysForOrder(order);
  return Number.isFinite(days)?addWorkingDays(acceptedAt,days+1):null;
}

export function isoDateLocal(value){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return '';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function rubles(amount){return new Intl.NumberFormat('ru-RU').format(amount)+' ₽'}

export function estimateWork({work='',option='',teeth=[],units}={}){
  const selection=resolveWorkSelection(work,option);
  const quantity=priceUnitsForSelection(selection.category?.name||work,teeth,units);
  const amount=Number.isFinite(selection.price)?selection.price*quantity:null;
  return {...selection,units:quantity,amount,text:amount===null?'Стоимость уточняется':rubles(amount)};
}

export function orderDeadlineError(order,dateValue=order.date,{referenceDate=order.acceptedAt||order.createdAt||new Date(),notBefore}={}){
 const raw=String(dateValue||''),parts=/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw.split('-').map(Number):/^\d{2}\.\d{2}\.\d{4}$/.test(raw)?raw.split('.').reverse().map(Number):[];
 if(parts.length!==3)return 'Укажите корректную дату срока';
 const due=new Date(parts[0],parts[1]-1,parts[2]);
 if(due.getFullYear()!==parts[0]||due.getMonth()!==parts[1]-1||due.getDate()!==parts[2])return 'Укажите корректную дату срока';
 if(!isWorkingDay(due))return 'Срок заказа должен приходиться на рабочий день';
 if(notBefore&&isoDateLocal(due)<isoDateLocal(notBefore))return 'Срок заказа не может быть в прошлом';
 const minimum=earliestDueDateForOrder(order,referenceDate);
 return minimum&&isoDateLocal(due)<isoDateLocal(minimum)?`Минимальный срок для выбранных услуг — ${isoDateLocal(minimum).split('-').reverse().join('.')}`:'';
}
