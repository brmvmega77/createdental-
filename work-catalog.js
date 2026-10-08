export const workCatalog=[
  {name:'Планирование и диагностика',price:null,options:[
    {name:'Wax up цифровой',price:2000},
    {name:'Wax up аналоговый',price:3000},
    {name:'Wax up по Славичеку',price:5000}
  ]},
  {name:'Вкладки',price:null,options:[
    {name:'Вкладка культевая',price:4000},
    {name:'Вкладка культевая ZrO2/Дисиликат лития',price:7000}
  ]},
  {name:'Реставрации',price:null,options:[
    {name:'PMMA коронка CAD/CAM',price:4000},
    {name:'Композитная коронка CAD/CAM',price:10000},
    {name:'Коронка E.max, ZrO2',price:12000},
    {name:'Коронка E.max, ZrO2 по Славичеку',price:16000},
    {name:'Коронка, винир на рефракторе',price:18000},
    {name:'Одиночная реставрация OPTISHADE/MATISSE',price:25000}
  ]},
  {name:'Протетика',price:null,options:[
    {name:'Индивидуальный Ti абатмент (Ti-включая вине)',price:8000},
    {name:'Индивидуальный ZrO2 абатмент (Без Ti-Base)',price:9000},
    {name:'Титановое основание Geo Medi',price:4500},
    {name:'Титановое основание Аналог',price:2500}
  ]},
  {name:'Балочные конструкции',price:null,options:[
    {name:'Цельнофрезерованная балка CoCr за единицу',price:3500},
    {name:'Цельнофрезерованная балка Ti за единицу',price:6000}
  ]},
  {name:'Каппы',price:null,options:[
    {name:'Бруксчекер',price:6000},
    {name:'Каппа для отбеливания',price:4500},
    {name:'Каппа ретенционная',price:4500},
    {name:'Каппа разобщающая',price:4500},
    {name:'Релаксационная шина',price:4500},
    {name:'Депрограмматор Койса',price:5000}
  ]},
  {name:'Сплинты',price:null,options:[
    {name:'Каппа-сплинт для завышения прикуса (ORTHOTIC)',price:10000},
    {name:'Сплинт с функциональными буграми',price:12000}
  ]},
  {name:'Ложки прикуса',price:null,options:[
    {name:'Индивидуальная ложка',price:2000},
    {name:'Прикусной шаблон',price:2000},
    {name:'Прикусной шаблон на жёстком базисе',price:3000},
    {name:'Прикусной шаблон на жёстком базисе с фиксацией к имплантатам на магнитах',price:4500}
  ]},
  {name:'Хирургические шаблоны',price:null,options:[
    {name:'Хирургический навигационный шаблон на 1 имплантант',price:7000},
    {name:'Дополнительное гнездо под имплантант в хирургическом шаблоне',price:1500},
    {name:'Маркировочный шаблон',price:3500},
    {name:'Шаблон под КТ рентгеноконтрастный',price:7000}
  ]},
  {name:'Дополнительные работы',price:null,options:[]}
];

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
  return workCatalog.map(category=>({category:category.name,services:category.options.map(option=>({name:option.name,price:option.price}))}));
}

export function rubles(amount){return new Intl.NumberFormat('ru-RU').format(amount)+' ₽'}

export function estimateWork({work='',option='',teeth=[],units}={}){
  const selection=resolveWorkSelection(work,option);
  const quantity=Math.max(1,Number.isFinite(Number(units))?Number(units):Array.isArray(teeth)?teeth.length:1);
  const amount=Number.isFinite(selection.price)?selection.price*quantity:null;
  return {...selection,units:quantity,amount,text:amount===null?'Стоимость уточняется':rubles(amount)};
}
