export const workCatalog=[
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
];

const jawPricedCategories=new Set(['Каппы','Ложки прикуса','Сплинты','Хирургические шаблоны']);
const upperJawTeeth=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const lowerJawTeeth=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

export function priceUnitsForSelection(work,teeth=[],units){
  if(units!==undefined&&units!==null&&units!==''&&Number.isFinite(Number(units)))return Math.max(1,Number(units));
  if(jawPricedCategories.has(String(work||''))){
    const selected=new Set(Array.isArray(teeth)?teeth.map(Number):[]);
    const jaws=[upperJawTeeth,lowerJawTeeth].filter(jaw=>jaw.every(tooth=>selected.has(tooth))).length;
    return Math.max(1,jaws);
  }
  return Math.max(1,Array.isArray(teeth)?teeth.length:1);
}

const normalizeCatalogText=value=>String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/gi,' ').trim();

export function resolveWorkSelection(workValue,optionValue=''){
  const values=[optionValue,workValue].map(normalizeCatalogText).filter(Boolean);
  let category=workCatalog.find(item=>normalizeCatalogText(item.name)===normalizeCatalogText(workValue))||null;
  let option=null;
  for(const item of workCatalog){
    const found=item.options.find(candidate=>values.includes(normalizeCatalogText(candidate.name)));
    if(found){category=item;option=found;break}
  }
  if(category&&!option){
    option=category.options.find(candidate=>normalizeCatalogText(candidate.name)===normalizeCatalogText(optionValue))||null;
  }
  return {category,option,price:option?.price??category?.price??null};
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
