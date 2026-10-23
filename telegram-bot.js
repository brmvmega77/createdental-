import {hasServiceChanges,reviseOrderServices} from './order-revision.js';
import {cadDecisionChange} from './flow-rules.js';
import {availableClinicDoctors} from './clinic-doctors.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {portalSnapshot,portalClient,replacePortalCollection,recordPortalEvent} from './portal-data.js';
import {catalogForPrompt,resolveWorkSelection,estimateWork,orderDeadlineError,rubles,earliestDueDateForOrder,productionDaysForOrder,isWorkingDay,isoDateLocal} from './work-catalog.js';
import {orderWorkLabel} from './order-list-utils.js';

const require=createRequire(import.meta.url);
const execFileAsync=promisify(execFile);

const telegramCodePattern=/\bCD-CL-\d{8}\b/i;
const upperTeeth=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const lowerTeeth=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
const vitaShadeOptions=['A1','A2','A3','A3.5','A4','B1','B2','B3','B4','C1','C2','C3','C4','D2','D3','D4'];
const validTeeth=new Set([...upperTeeth,...lowerTeeth]);
// These rules mirror the clinic order builder: jaw-specific templates default to
// the upper jaw, while the two prosthetic base options do not require tooth input.
const jawSplitCategories=new Set(['Каппы','Ложки прикуса','Сплинты','Хирургические шаблоны']);
const prostheticNoTeethOptions=new Set(['Титановое основание Geo Medi','Титановое основание Аналог']);
function isJawSplitSelection(work,option){const selection=resolveWorkSelection(work,option);return selection.category?.pricingUnit==='jaw'&&Boolean(selection.option)}
function isNoTeethSelection(work,option){return String(work||'')==='Протетика'&&prostheticNoTeethOptions.has(String(option||''))}
const allowedIntents=new Set(['create_order','update_order','cancel_order','status_request','accept_order','rework_order','general_message','clarify']);
const botCommands=[
  {command:'menu',description:'Открыть меню действий'}
];
const welcomeText=`👋 Добро пожаловать в чат Create Dental!

Здесь можно общаться с лабораторией и управлять заказами. Для действий с заказами отправьте /menu и выберите нужную функцию.

➕ Новый заказ
Укажите пациента, одну или несколько услуг, зубы (если они нужны), цвет и срок. Клиника определяется автоматически, а тип работы и недостающие параметры бот предложит выбрать кнопками.
Пример: «Новый заказ. Иванов Сергей. Коронки из циркония на 11 и 21, цвет A2. Срок — 20 октября».

🔎 Статус заказа
Пример: «Какой статус заказа Иванова?»

📅 Изменить заказ
Пример: «Перенеси срок заказа Иванова на 25 октября».

📎 Добавить файл
После подтверждения заказа нажмите «📎 Загрузить файлы» в сообщении бота. За один раз можно загрузить до 10 файлов, каждый — до 200 МБ.

❌ Отменить заказ
Пример: «Отмени заказ Иванова. Пациент перенёс лечение».

✅ Принять работу
Пример: «Работу по Иванову принимаю».

🔄 Отправить на доработку
Пример: «Заказ Иванова на доработку. Исправить контакт на 11 зубе».

👤 Позвать человека
Нажмите кнопку, и бот позовёт сотрудника Create Dental в чат.

🎤 Голосовые сообщения
Сначала выберите функцию через /menu, затем отправьте голосовое сообщение. Назовите имя и фамилию пациента, действие, зубы, материал, цвет и срок. Если называете отчество, бот тоже сохранит его. Длительность — до 5 минут.

Без выбранной функции текст, фото, документы и аудио передаются в переписку с лабораторией, но не запускают бота.

Команда /menu в любой момент покажет кнопки функций.`;

function cleanText(value,max=4000){return String(value||'').replace(/[<>]/g,'').trim().slice(0,max)}
function messageAddsBot(message,botIdentity={}){
  const expectedId=String(botIdentity.id||'');
  const expectedUsername=normalizedUsername(botIdentity.username);
  return (Array.isArray(message?.new_chat_members)?message.new_chat_members:[]).some(member=>member?.is_bot&&(
    (expectedId&&String(member.id)===expectedId)||(expectedUsername&&normalizedUsername(member.username)===expectedUsername)
  ));
}
function codeFromText(value){return String(value||'').toUpperCase().match(telegramCodePattern)?.[0]||''}
function safeTeeth(value){return [...new Set((Array.isArray(value)?value:[]).map(Number).filter(number=>validTeeth.has(number)))].sort((a,b)=>a-b)}
const activeClinicDoctors=availableClinicDoctors;
function doctorLabel(doctor){return doctor?`${doctor.name}${doctor.specialty?` · ${doctor.specialty}`:''}`:''}
function selectedClinicDoctor(clinic,doctorId){return activeClinicDoctors(clinic).find(item=>item.id===String(doctorId||''))||null}
function orderDoctorText(order){return order?.doctor?`\nВрач: ${order.doctor}${order.doctorSpecialty?` · ${order.doctorSpecialty}`:''}`:''}
// Users may type tooth numbers instead of pressing the inline keyboard buttons.
// Parse that guided input locally so a partial selection is preserved reliably.
function parseGuidedTeethInput(value){return safeTeeth((String(value||'').match(/\d{1,2}/g)||[]))}
// The first step of a new order is deliberately handled without the LLM. This
// keeps a partial name from being interpreted as a complete order (and, for
// example, from causing the bot to offer a deadline too early).
function parseGuidedPatientInput(value){
  const words=(String(value||'').replace(/^\s*(?:пациент|фио)\s*[:\-]?\s*/iu,'').match(/[A-Za-zА-Яа-яЁё-]+/g)||[])
    .filter(word=>!['фамилия','имя','отчество'].includes(normalize(word)));
  return {
    words,
    value:words.length?titleCasePatientName(words.slice(0,3).join(' ')):'',
    hasFullName:words.length>=2
  };
}
function moscowDate(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
function addDays(dateValue,days){const date=new Date(`${dateValue}T12:00:00+03:00`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function displayDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return '';const [year,month,day]=value.split('-');return `${day}.${month}.${year}`}
function telegramDueDateForAnalysis(analysis,acceptedAt=new Date()){
  const fields=analysis?.fields||{};
  const variants=analysisVariants(analysis).map(item=>({...item,workOption:item.workOption||item.material}));
  const minimum=earliestDueDateForOrder({work:fields.work,workOption:fields.material,material:fields.material,variants},acceptedAt);
  return minimum?isoDateLocal(minimum):'';
}
function currentServiceOrder(analysis){
  const fields=analysis?.fields||{};
  return {work:fields.work,workOption:fields.material,material:fields.material};
}
function currentServiceDueDate(analysis,acceptedAt=new Date()){
  const minimum=earliestDueDateForOrder(currentServiceOrder(analysis),acceptedAt);
  return minimum?isoDateLocal(minimum):'';
}
function latestServiceDueDate(analysis){
  const fields=analysis?.fields||{};
  const dates=[...(fields.variants||[]).map(variant=>variant.dueDate),fields.dueDate].filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value||''));
  return dates.length?dates.sort().at(-1):'';
}
function russianWorkingDaysLabel(days){
  const value=Math.abs(Number(days));
  if(value%10===1&&value%100!==11)return 'рабочий день';
  if([2,3,4].includes(value%10)&&![12,13,14].includes(value%100))return 'рабочих дня';
  return 'рабочих дней';
}
function telegramDeadlineError(order,dueIso,acceptedAt=new Date()){
  const match=String(dueIso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const days=productionDaysForOrder(order);
  if(!match)return Number.isFinite(days)?'Укажите срок в формате даты':'';
  const due=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
  if(Number.isNaN(due.getTime())||due.getFullYear()!==Number(match[1])||due.getMonth()!==Number(match[2])-1||due.getDate()!==Number(match[3]))return 'Укажите корректную дату';
  const minimum=earliestDueDateForOrder(order,acceptedAt);
  if(!isWorkingDay(due)){
    const minimumText=minimum?` Минимально допустимая дата по сроку — ${displayDate(isoDateLocal(minimum))}.`:'';
    return `Эту дату выбрать нельзя: ${displayDate(dueIso)} — выходной день. Производство работает с понедельника по пятницу, поэтому суббота и воскресенье не учитываются.${minimumText}`;
  }
  if(minimum&&isoDateLocal(due)<isoDateLocal(minimum)){
    const reason=Number.isFinite(days)?`Для выбранной услуги требуется ${days} ${russianWorkingDaysLabel(days)} изготовления + 1 рабочий день на приём заказа.`:'Для выбранной услуги действует установленный минимальный срок изготовления.';
    return `Эту дату выбрать нельзя: ${displayDate(dueIso)} раньше минимального срока. ${reason} Суббота и воскресенье не учитываются. Минимально допустимая дата — ${displayDate(isoDateLocal(minimum))}.`;
  }
  return '';
}
function isoDateFromDisplay(value){const match=String(value||'').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return match?`${match[3]}-${match[2]}-${match[1]}`:''}
function hasExplicitDueMonth(value){
  const text=String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
  if(!text)return false;
  if(/(сегодня|завтра|послезавтра)/.test(text)||/через\s+\d+\s+(день|дня|дней|неделю|недели|недель)/.test(text))return true;
  if(/(январ[ьяе]|феврал[ьяе]|март(?:а|е)?|апрел[ьяе]|ма[йяе]|июн[ьяе]|июл[ьяе]|август(?:а|е)?|сентябр[ьяе]|октябр[ьяе]|ноябр[ьяе]|декабр[ьяе])/.test(text))return true;
  return /\b\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\b/.test(text)||/\b\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}\b/.test(text);
}
const russianMonthNumbers=new Map([
  ['январь',1],['января',1],['янв',1],
  ['февраль',2],['февраля',2],['фев',2],
  ['март',3],['марта',3],['мар',3],
  ['апрель',4],['апреля',4],['апр',4],
  ['май',5],['мая',5],['май',5],
  ['июнь',6],['июня',6],['июн',6],
  ['июль',7],['июля',7],['июл',7],
  ['август',8],['августа',8],['авг',8],
  ['сентябрь',9],['сентября',9],['сен',9],['сент',9],
  ['октябрь',10],['октября',10],['окт',10],
  ['ноябрь',11],['ноября',11],['ноя',11],
  ['декабрь',12],['декабря',12],['дек',12]
]);
function parseTelegramDate(value,acceptedAt=new Date()){
  const text=String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
  if(!text)return '';
  const acceptedParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric'}).formatToParts(new Date(acceptedAt));
  const acceptedYear=Number(Object.fromEntries(acceptedParts.map(part=>[part.type,part.value])).year)||new Date().getFullYear();
  let day,month,year;
  let match=text.match(/\b(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?\b/);
  if(match){day=Number(match[1]);month=Number(match[2]);year=match[3]?Number(match[3]):acceptedYear;}
  else if((match=text.match(/(?:^|\s)(\d{1,2})\s+([а-я]+)(?:\s+(\d{4}))?(?:\s|$)/))){
    day=Number(match[1]);month=russianMonthNumbers.get(match[2]);year=match[3]?Number(match[3]):acceptedYear;
  }
  if(!day||!month||!year)return '';
  if(year<100)year+=2000;
  const date=new Date(year,month-1,day);
  if(Number.isNaN(date.getTime())||date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return '';
  return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function normalize(value){return String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/gi,' ').trim()}
function editRequestFieldHints(value){
  const text=normalize(value),fields=new Set();
  if(/пациент|фио|имя|фамил/.test(text))fields.add('patient');
  if(/дата рождения|родился|родилась/.test(text))fields.add('birthDate');
  if(/срок|дата готов|готовност|дедлайн/.test(text))fields.add('dueDate');
  if(/цвет|оттен/.test(text))fields.add('shade');
  if(/зуб|номер/.test(text))fields.add('teeth');
  if(/режим|одиноч|мост|челюст/.test(text)){fields.add('toothMode');fields.add('jaw');}
  if(/услуг|материал|корон|вклад|капп|сплинт|протез|шаблон/.test(text)){fields.add('work');fields.add('material');}
  if(/коммент|примечан/.test(text))fields.add('comment');
  return fields;
}
function patientSurname(value){return normalize(value).split(' ')[0]||''}
function surnameStem(value){
  const surname=patientSurname(value);
  if(surname.length<4)return surname;
  const declined=[
    [/(скому|ского|ским|ском|ская|ской|скую|ские|ских|скими|ский)$/,''],
    [/(цкому|цкого|цким|цком|цкая|цкой|цкую|цкие|цких|цкими|цкий)$/,''],
    [/(овой|овую|овым|овому|ова|ову|ове|овы|ов)$/,''],
    [/(евой|евую|евым|евому|ева|еву|еве|евы|ев)$/,''],
    [/(иной|иную|иным|иному|ина|ину|ине|ины|ин)$/,''],
    [/(ыной|ыную|ыным|ыному|ына|ыну|ыне|ыны|ын)$/,'']
  ];
  for(const [pattern,replacement] of declined){
    if(pattern.test(surname)){
      const stem=surname.replace(pattern,replacement);
      return stem.length>=3?stem:surname;
    }
  }
  return surname;
}
function surnameMatches(left,right){
  const a=patientSurname(left),b=patientSurname(right);
  return Boolean(a&&b&&(a===b||(surnameStem(a).length>=3&&surnameStem(a)===surnameStem(b))));
}
function patientMatchesReference(patient,reference){
  const target=patientSurname(reference);
  if(!target)return false;
  const tokens=normalize(patient).split(' ').filter(token=>token.length>=3);
  return tokens.some(token=>surnameMatches(token,target));
}
function orderId(){return `CD-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`}
function actorName(message){const user=message?.from||{};return cleanText([user.first_name,user.last_name].filter(Boolean).join(' ')||user.username||'Клиент Telegram',120)}
function normalizedUsername(value){return String(value||'').trim().replace(/^@/,'').toLowerCase()}
function isSupportUsername(value){
  const configured=['createdental','createdental_admin','createdental_io',...String(process.env.TELEGRAM_SUPPORT_USERNAMES||'').split(',')].map(normalizedUsername).filter(Boolean);
  return configured.includes(normalizedUsername(value));
}
function supportLabel(value){return normalizedUsername(value)==='createdental_admin'?'Техническая команда Create Dental':'Главный техник'}
function telegramMedia(message){
  const photos=Array.isArray(message?.photo)?message.photo:[];
  if(photos.length){
    const file=photos.at(-1),preview=photos[0];
    return {fileId:file.file_id,previewFileId:preview?.file_id||'',fileSize:Number(file.file_size)||0,name:`telegram-photo-${message.message_id}.jpg`,type:'image/jpeg',kind:'photo',orderEligible:true};
  }
  const document=message?.document;
  if(!document)return null;
  const fallbackExtension=({
    'application/pdf':'.pdf','application/zip':'.zip','application/x-rar-compressed':'.rar','application/vnd.rar':'.rar','application/x-7z-compressed':'.7z',
    'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','model/stl':'.stl'
  })[document.mime_type]||'.bin';
  return {fileId:document.file_id,previewFileId:document.thumbnail?.file_id||document.thumb?.file_id||'',fileSize:Number(document.file_size)||0,name:cleanText(document.file_name||`telegram-document-${message.message_id}${fallbackExtension}`,180),type:cleanText(document.mime_type||'application/octet-stream',120),kind:'document',orderEligible:true};
}
function orderStage(snapshot,order){return snapshot.orderOverrides[order.id]?.stage||order.status||'Новый'}
function activeOrdersForClinic(snapshot,clinicId){return snapshot.orders.filter(order=>order.clinicId===clinicId&&order.status!=='Отменён')}
function orderCanReceiveFiles(snapshot,order){
  if(!order||orderStage(snapshot,order)==='Отменён')return false;
  return true;
}
function orderPickerLabel(order){return `${order.patient} · ${order.date?'до '+order.date:'без фиксированного срока'}`}

function findOrder(snapshot,clinicId,analysis){
  const orders=activeOrdersForClinic(snapshot,clinicId);
  const requestedId=cleanText(analysis.orderId,80).toUpperCase();
  if(requestedId){
    const exact=orders.find(order=>String(order.id).toUpperCase()===requestedId);
    return exact?{order:exact,matches:[exact]}:{order:null,matches:[]};
  }
  const explicitSurname=patientSurname(analysis.patientSurname||'');
  const references=explicitSurname?[explicitSurname]:normalize(analysis.fields?.patient||'').split(' ').filter(Boolean);
  if(!references.length)return {order:null,matches:[]};
  const exactMatches=orders.filter(order=>references.some(reference=>normalize(order.patient).split(' ').includes(reference)));
  const matches=exactMatches.length?exactMatches:orders.filter(order=>references.some(reference=>patientMatchesReference(order.patient,reference)));
  return {order:matches.length===1?matches[0]:null,matches};
}

function attachmentCommandAnalysis(text,attachment,clinicId,snapshot,analysis,contextOrderId=''){
  if(!attachment?.orderEligible||!['general_message','clarify'].includes(analysis.intent))return analysis;
  const normalized=normalize(text);
  const isAttachCommand=/(^| )(загрузи|загрузите|добавь|добавьте|прикрепи|прикрепите|закинь|закиньте|приложи|приложите|файл|документ|архив|снимок|фото)( |$)/.test(normalized);
  if(!isAttachCommand)return analysis;
  const words=normalized.split(' ').filter(word=>word.length>=3);
  const orders=activeOrdersForClinic(snapshot,clinicId);
  const matches=orders.filter(order=>words.some(word=>patientMatchesReference(order.patient,word)));
  const order=matches.length===1?matches[0]:matches.length===0&&contextOrderId?orders.find(item=>item.id===contextOrderId):null;
  if(!order)return analysis;
  return {
    ...analysis,
    intent:'update_order',
    confidence:Math.max(analysis.confidence,.95),
    orderId:order.id,
    patientSurname:patientSurname(order.patient),
    summary:`Прикрепить файл «${attachment.name}» к заказу ${order.id}`,
    question:''
  };
}

function parseJson(text){
  const raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
  if(start<0||end<start)throw new Error('Модель не вернула структуру команды');
  const json=raw.slice(start,end+1);
  try{return JSON.parse(json)}catch{return JSON.parse(json.replace(/,\s*([}\]])/g,'$1'))}
}

function normalizeVariant(value={}){
  const teeth=safeTeeth(value.teeth||value.selectedTeeth);
  const mode=['Одиночка','Мост','Челюсть','Без зубов'].includes(value.toothMode)?value.toothMode:'';
  const jaw=['upper','lower','both'].includes(value.jaw)?value.jaw:'';
  return {
    work:cleanText(value.work,160),
    material:cleanText(value.material||value.workOption,180),
    teeth,
    toothMode:mode,
    jaw,
    dueDate:/^\d{4}-\d{2}-\d{2}$/.test(value.dueDate||'')?value.dueDate:'',
    productionType:['digital','analog'].includes(value.productionType)?value.productionType:''
  };
}

function normalizedVariants(fields={}){
  const raw=Array.isArray(fields.variants)?fields.variants:[];
  return raw.map(normalizeVariant).filter(item=>item.work||item.material||item.teeth.length||item.toothMode);
}

function normalizeAnalysis(value){
  const fields=value?.fields&&typeof value.fields==='object'&&!Array.isArray(value.fields)?value.fields:{};
  const intent=allowedIntents.has(value?.intent)?value.intent:'clarify';
  return {
    intent,
    confidence:Math.max(0,Math.min(1,Number(value?.confidence)||0)),
    orderId:cleanText(value?.orderId,80),
    patientSurname:cleanText(value?.patientSurname,160),
    fields:{
      patient:cleanText(fields.patient,160),work:cleanText(fields.work,160),material:cleanText(fields.material,180),
      doctorId:cleanText(fields.doctorId,80),
      productionType:['digital','analog'].includes(fields.productionType)?fields.productionType:'',
      teeth:safeTeeth(fields.teeth),toothMode:['Одиночка','Мост','Челюсть','Без зубов'].includes(fields.toothMode)?fields.toothMode:'',
      jaw:['upper','lower','both'].includes(fields.jaw)?fields.jaw:'',
      birthDate:/^\d{4}-\d{2}-\d{2}$/.test(fields.birthDate||'')?fields.birthDate:'',
      dueDate:/^\d{4}-\d{2}-\d{2}$/.test(fields.dueDate||'')?fields.dueDate:'',shade:cleanText(fields.shade,40),
      comment:cleanText(fields.comment,1800),reason:cleanText(fields.reason,1800),requestText:cleanText(fields.requestText,2000),variants:normalizedVariants(fields),addingService:Boolean(fields.addingService)
    },
    summary:cleanText(value?.summary,1500),question:cleanText(value?.question,700)
  };
}

function canonicalizeCatalogSelection(analysis){
  const selection=resolveWorkSelection(analysis.fields.work,analysis.fields.material);
  if(selection.category)analysis.fields.work=selection.category.name;
  if(selection.option)analysis.fields.material=selection.option.name;
  if(selection.option&&isNoTeethSelection(selection.category?.name,selection.option.name)){
    analysis.fields.toothMode='Без зубов';analysis.fields.jaw='';analysis.fields.teeth=[];
  }
  analysis.fields.variants=(analysis.fields.variants||[]).map(variant=>{
    const selected=resolveWorkSelection(variant.work,variant.material);
    const normalized={...variant,work:selected.category?.name||variant.work,material:selected.option?.name||variant.material};
    if(selected.option&&isNoTeethSelection(selected.category?.name,selected.option.name))return {...normalized,toothMode:'Без зубов',jaw:'',teeth:[]};
    return normalized;
  });
  return analysis;
}

function analysisVariants(analysis){
  const fields=analysis?.fields||{};
  const saved=Array.isArray(fields.variants)?fields.variants:[];
  const current=normalizeVariant({work:fields.work,material:fields.material,teeth:fields.teeth,toothMode:fields.toothMode,jaw:fields.jaw,dueDate:fields.dueDate,productionType:fields.productionType});
  const values=[...saved];
  if(current.work||current.material||current.teeth.length||current.toothMode){
    const duplicate=values.some(item=>item.work===current.work&&item.material===current.material&&item.toothMode===current.toothMode&&item.jaw===current.jaw&&item.dueDate===current.dueDate&&JSON.stringify(item.teeth||[])===JSON.stringify(current.teeth||[]));
    if(!duplicate)values.push(current);
  }
  return values.map(normalizeVariant);
}

function variantNeedsToothInput(variant={}){
  return Boolean(variant.work||variant.material)&&!isNoTeethSelection(variant.work,variant.material);
}

function variantEffectiveTeeth(variant={},fallback=[]){
  if(isNoTeethSelection(variant.work,variant.material))return [];
  if(variant.jaw==='both')return [...upperTeeth,...lowerTeeth];
  if(variant.toothMode==='Челюсть'&&variant.jaw)return variant.jaw==='lower'?[...lowerTeeth]:[...upperTeeth];
  return safeTeeth(variant.teeth?.length?variant.teeth:fallback);
}

function effectiveTeeth(fields,order=null){
  if(isNoTeethSelection(fields.work,fields.material))return [];
  if(fields.jaw==='both')return [...upperTeeth,...lowerTeeth];
  if(fields.toothMode==='Челюсть'&&fields.jaw)return fields.jaw==='lower'?[...lowerTeeth]:[...upperTeeth];
  if(fields.teeth.length)return [...fields.teeth];
  return safeTeeth(order?.teeth||[]);
}

function priceEstimate(analysis,order=null){
  const fields=analysis.fields;
  const variants=analysisVariants(analysis);
  if(variants.length>1){
    const estimates=variants.map(variant=>estimateWork({work:variant.work,option:variant.material,teeth:variantEffectiveTeeth(variant),units:isNoTeethSelection(variant.work,variant.material)?1:isJawSplitSelection(variant.work,variant.material)?(variant.jaw==='both'?2:1):undefined}));
    if(estimates.every(item=>item.amount!==null)){
      const amount=estimates.reduce((sum,item)=>sum+item.amount,0),units=estimates.reduce((sum,item)=>sum+item.units,0);
      return {category:null,option:null,price:amount,units,amount,text:rubles(amount),variants:estimates};
    }
  }
  const work=fields.work||order?.work||'';
  const option=fields.material||(fields.work?'':order?.material||'');
  const teeth=effectiveTeeth(fields,order);
  return estimateWork({work,option,teeth,units:isNoTeethSelection(work,option)?1:isJawSplitSelection(work,option)?(fields.jaw==='both'?2:1):undefined});
}

function priceEstimateDetails(estimate){
  if(!estimate||estimate.amount===null)return '';
  if(Array.isArray(estimate.variants)&&estimate.variants.length>1){
    const lines=estimate.variants.map((item,index)=>{
      const name=item.option?.name||item.category?.name||`Услуга ${index+1}`;
      return `• ${name}: ${rubles(item.price)} × ${item.units} ед. = ${rubles(item.amount)}`;
    });
    return ['Расчёт:',...lines].join('\n');
  }
  return `Расчёт: ${rubles(estimate.price)} × ${estimate.units} ед. = ${rubles(estimate.amount)}`;
}

function hasFullPatientName(value){
  return (String(value||'').match(/[A-Za-zА-Яа-яЁё]+/g)||[]).length>=2;
}

function enforcePatientNameRequirement(analysis,sourceText,previousAnalysis=null){
  const previousPatient=previousAnalysis?.fields?.patient||'';
  const previousWords=(String(previousPatient).match(/[A-Za-zА-Яа-яЁё-]+/g)||[]);
  const words=(String(sourceText||'').match(/[A-Za-zА-Яа-яЁё-]+/g)||[])
    .filter(word=>!['создай','новый','заказ','пациент'].includes(normalize(word)));
  if(words.length!==1)return analysis;
  const next=normalizeAnalysis(analysis);
  if(previousWords.length===1){
    next.fields.patient=titleCasePatientName(`${previousWords[0]} ${words[0]}`);
    next.patientSurname=previousWords[0];
    return next;
  }
  next.fields.patient=titleCasePatientName(words[0]);
  next.patientSurname='';
  return next;
}

function mergePatientNames(beforeValue,afterValue){
  const before=cleanText(beforeValue,160),after=cleanText(afterValue,160);
  if(hasFullPatientName(after)||!before)return after||before;
  if(!after)return before;
  if(normalize(before)===normalize(after))return before;
  return titleCasePatientName(`${before} ${after}`);
}

function titleCasePatientName(value){
  return String(value||'').trim().split(/\s+/).filter(Boolean).map(word=>word.slice(0,1).toLocaleUpperCase('ru-RU')+word.slice(1).toLocaleLowerCase('ru-RU')).join(' ');
}

function extractExplicitPatientName(value){
  const text=String(value||'').replace(/ё/gi,'ё');
  const word='[A-Za-zА-Яа-яЁё-]+';
  const patterns=[
    new RegExp(`нов\\s*ый\\s+заказ\\s+(${word}(?:\\s+${word}){1,2})(?=[\\s,.;:]|$)`,'iu'),
    new RegExp(`пациент(?:а|у|ом)?\\s*[:\\-]?\\s*(${word}(?:\\s+${word}){1,2})(?=[\\s,.;:]|$)`,'iu')
  ];
  for(const pattern of patterns){
    const match=text.match(pattern);
    if(match&&hasFullPatientName(match[1]))return titleCasePatientName(match[1]);
  }
  return '';
}

function repairPatientName(analysis,sourceText){
  const candidate=extractExplicitPatientName(sourceText);
  if(!candidate||!['create_order','update_order'].includes(analysis.intent))return analysis;
  const current=normalize(analysis.fields.patient).split(' ').filter(Boolean);
  const candidateTokens=normalize(candidate).split(' ').filter(Boolean);
  if(candidateTokens.length>=2&&(!current.length||candidateTokens.some(token=>!current.includes(token)))){
    analysis.fields.patient=candidate;
    if(!analysis.patientSurname)analysis.patientSurname=candidateTokens[0];
  }
  return analysis;
}

function missingCreateFields(analysis){
  const missing=[];
  const add=value=>{if(value&&!missing.includes(value))missing.push(value)};
  const fields=analysis.fields||{};
  if(!hasFullPatientName(fields.patient))add('имя и фамилию пациента');

  // Validate every saved service as well as the service currently being edited.
  // Previously the presence of `variants` skipped validation for all of them,
  // which allowed a multi-service order with no teeth or jaw to be created.
  const saved=Array.isArray(fields.variants)?fields.variants:[];
  const current=normalizeVariant({work:fields.work,material:fields.material,teeth:fields.teeth,toothMode:fields.toothMode,jaw:fields.jaw,dueDate:fields.dueDate});
  const candidates=[...saved];
  if(current.work||current.material||current.teeth.length||current.toothMode||fields.addingService)candidates.push(current);
  if(!candidates.length)candidates.push(current);
  for(const variant of candidates){
    const selection=resolveWorkSelection(variant.work,variant.material);
    if(!selection.category){add('вид работы из прайса');continue}
    if(!selection.option){add('точное название услуги из прайса');continue}
    if(Number.isFinite(productionDaysForOrder({work:selection.category.name,workOption:selection.option.name}))&&!variant.dueDate)add('желаемый срок готовности');
    if(isNoTeethSelection(selection.category.name,selection.option.name))continue;
    if(isJawSplitSelection(selection.category.name,selection.option.name)){
      if(!['upper','lower','both'].includes(variant.jaw))add('челюсть для шаблона');
      continue;
    }
    if(!variant.toothMode){add('режим: одиночка, мост или челюсть');continue}
    if(variant.toothMode==='Челюсть'&&!variant.jaw){add('верхнюю или нижнюю челюсть');continue}
    if(variant.toothMode==='Мост'&&variant.teeth.length<2){add('минимум два номера зубов для моста');continue}
    if(variant.toothMode!=='Челюсть'&&!variant.teeth.length)add('номер зуба или номера зубов');
  }
  if(!fields.shade)add('цвет/оттенок или «не требуется»');
  return missing;
}

function mergeCreateAnalysis(previous,current){
  const before=normalizeAnalysis(previous||{intent:'create_order',fields:{}}),after=normalizeAnalysis(current||{intent:'create_order',fields:{}});
  const nextWork=after.fields.work||before.fields.work;
  const workChanged=Boolean(after.fields.work&&normalize(after.fields.work)!==normalize(before.fields.work));
  const merged=normalizeAnalysis({
    intent:'create_order',confidence:Math.max(before.confidence,after.confidence),
    patientSurname:after.patientSurname||before.patientSurname,
    fields:{
      patient:mergePatientNames(before.fields.patient,after.fields.patient),
      birthDate:after.fields.birthDate||before.fields.birthDate,
      work:nextWork,
      material:after.fields.material||(workChanged?'':before.fields.material),
      doctorId:after.fields.doctorId||before.fields.doctorId,
      teeth:after.fields.teeth.length?after.fields.teeth:before.fields.teeth,
      toothMode:after.fields.toothMode||before.fields.toothMode,
      jaw:after.fields.jaw||before.fields.jaw,
      variants:after.fields.variants.length?after.fields.variants:before.fields.variants,
      addingService:after.fields.addingService||before.fields.addingService,
      productionType:after.fields.productionType||before.fields.productionType,
      dueDate:after.fields.dueDate||before.fields.dueDate,
      shade:after.fields.shade||before.fields.shade,
      comment:after.fields.comment||before.fields.comment
    },
    summary:[before.summary,after.summary].filter(Boolean).join('; ')
  });
  return canonicalizeCatalogSelection(merged);
}

function createOrderMissingPrompt(analysis){
  const missing=missingCreateFields(analysis),fields=analysis.fields,selection=resolveWorkSelection(fields.work,fields.material);
  const options=[];
  if(missing.includes('имя и фамилию пациента')){
    const patientWords=(String(fields.patient||'').match(/[A-Za-zА-Яа-яЁё-]+/g)||[]);
    options.push(patientWords.length===1?`• Имя «${patientWords[0]}» сохранено. Укажите фамилию пациента.`:'• Пациент: фамилия и имя обязательны; отчество — по желанию. Пример: «Иванов Сергей» или «Иванов Сергей Петрович».');
  }
  if(missing.includes('режим: одиночка, мост или челюсть'))options.push('• Режим: «Одиночка», «Мост» или «Челюсть».');
  if(missing.includes('верхнюю или нижнюю челюсть'))options.push('• Челюсть: верхняя или нижняя.');
  if(missing.includes('челюсть для шаблона'))options.push('• Выберите верхнюю, нижнюю или обе челюсти для шаблона.');
  if(missing.includes('минимум два номера зубов для моста'))options.push('• Мост: назовите все зубы или его границы, например «11–13».');
  if(missing.includes('номер зуба или номера зубов'))options.push('• Зубы: номера по системе FDI, например «11 и 21».');
  if(missing.includes('вид работы из прайса'))options.push(`• Раздел работы: ${catalogForPrompt().filter(item=>item.services.length).map(item=>item.category).join(' / ')}.`);
  if(missing.includes('точное название услуги из прайса')&&selection.category){
    options.push(`• Услуга из раздела «${selection.category.name}»:`,...selection.category.options.map(option=>`  — ${option.name} — ${rubles(option.price)}`));
  }
  if(missing.includes('желаемый срок готовности'))options.push(`• Срок текущей услуги: конкретная дата или «стандартный срок» — ${displayDate(currentServiceDueDate(analysis))}. Суббота и воскресенье не считаются.`);
  if(missing.includes('цвет/оттенок или «не требуется»'))options.push('• Цвет: A1 / A2 / A3 / B1 / B2 / другой оттенок / «не требуется».');
  if(!fields.productionType)options.push('• Тип работы: «Цифровой» — нужны STL/сканы; «Аналоговый» — нужен гипсовый слепок.');
  const recognized=[];
  if(hasFullPatientName(fields.patient))recognized.push(`пациент — ${fields.patient}`);
  if(fields.toothMode)recognized.push(`режим — ${fields.toothMode}`);
  if(fields.teeth.length)recognized.push(`зубы — ${fields.teeth.join(', ')}`);
  if(fields.jaw)recognized.push(`челюсть — ${fields.jaw==='upper'?'верхняя':'нижняя'}`);
  if(selection.category)recognized.push(`работа — ${selection.category.name}${selection.option?` / ${selection.option.name}`:''}`);
  if(Array.isArray(fields.variants)&&fields.variants.length)recognized.push(`добавлено услуг — ${fields.variants.length}`);
  if(fields.dueDate)recognized.push(`срок — ${displayDate(fields.dueDate)}`);
  if(fields.shade)recognized.push(`цвет — ${fields.shade}`);
  if(fields.productionType)recognized.push(`тип — ${fields.productionType==='analog'?'аналоговый':'цифровой'}`);
  return [`Я сохранил указанную часть заказа.${recognized.length?`\nУже распознано: ${recognized.join('; ')}.`:''}`,'','Чтобы пройти все этапы, добавьте:',...options,'','Можно ответить одним текстовым или голосовым сообщением. Уже названные данные повторять не нужно.','Файлы пациента загрузите после проверки и подтверждения заказа — бот выдаст отдельную кнопку.'].join('\n');
}

function guidedPatientPrompt(patient=''){
  return patient
    ? `Первая часть ФИО «${patient}» сохранена. Укажите вторую часть ФИО пациента.`
    : 'Сначала укажите фамилию и имя пациента одним сообщением. Отчество — по желанию.';
}

function guidedNavigationMarkup(){return {inline_keyboard:[[{text:'◀️ Назад',callback_data:'tgnew:back'},{text:'❌ Отменить заказ',callback_data:'tgnew:cancel'}]]}}
function guidedStartNavigationMarkup(){return {inline_keyboard:[[{text:'❌ Отменить заказ',callback_data:'tgnew:cancel'}]]}}
function patientConfirmationMarkup(){return {inline_keyboard:[[{text:'✅ Верно, продолжить',callback_data:'tgnew:patientconfirm:yes'},{text:'✏️ Исправить',callback_data:'tgnew:patientconfirm:edit'}],[{text:'❌ Отменить заказ',callback_data:'tgnew:cancel'}]]}}
function patientConfirmationPrompt(patient){return `Проверьте распознанное ФИО: «${patient||'—'}». Нажмите «Верно, продолжить» или «Исправить».`}
function productionTypeMarkup(){return {inline_keyboard:[[{text:'Цифровой · STL/сканы',callback_data:'tgnew:type:digital'},{text:'Аналоговый · Слепок',callback_data:'tgnew:type:analog'}],...guidedNavigationMarkup().inline_keyboard]}}
function fileChoiceMarkup(){return {inline_keyboard:[[{text:'📎 Загрузить файлы пациента',callback_data:'tgnew:files:now'}],[{text:'⏭️ Загрузить позже',callback_data:'tgnew:files:later'}],...guidedNavigationMarkup().inline_keyboard]}}
function fileUploadWaitingMarkup(href=''){return {inline_keyboard:[...(href?[[{text:'📎 Открыть страницу загрузки',url:href}]]:[]),[{text:'⏭️ Загрузить позже',callback_data:'tgnew:files:later'}],...guidedNavigationMarkup().inline_keyboard]}}
function fileUploadMarkup(href=''){return {inline_keyboard:[[{text:'✅ Файлы загружены, продолжить',callback_data:'tgnew:files:done'}],...(href?[[{text:'📎 Открыть страницу загрузки',url:href}]]:[]),[{text:'⏭️ Загрузить позже',callback_data:'tgnew:files:later'}],...guidedNavigationMarkup().inline_keyboard]}}
function guidedReadyPrompt(){return 'Все обязательные пункты заполнены. Можно добавить услугу или перейти к проверке заказа. Файлы будут предложены после подтверждения заказа.'}
function guidedReadyMarkup(){return {inline_keyboard:[[{text:'➕ Добавить услугу',callback_data:'tgnew:addservice'},{text:'✅ Перейти к проверке',callback_data:'tgnew:finish'}],...guidedNavigationMarkup().inline_keyboard]}}

function createOrderChoiceMarkup(analysis,wizardStep=''){
  const missing=missingCreateFields(analysis),fields=analysis.fields,catalog=catalogForPrompt();
  if(missing.includes('имя и фамилию пациента'))return null;
  if(missing.includes('вид работы из прайса'))return {inline_keyboard:[...catalog.flatMap((item,index)=>item.services.length?[[{text:item.category,callback_data:`tgnew:work:${index}`}]]:[]),...guidedNavigationMarkup().inline_keyboard]};
  if(missing.includes('точное название услуги из прайса')){
    const categoryIndex=catalog.findIndex(item=>item.category===fields.work),category=catalog[categoryIndex];
    if(category)return {inline_keyboard:[...category.services.map((service,index)=>[{text:`${service.name} · ${rubles(service.price)}`,callback_data:`tgnew:service:${categoryIndex}-${index}`}]),...guidedNavigationMarkup().inline_keyboard]};
  }
  if(missing.includes('челюсть для шаблона'))return {inline_keyboard:[[
    {text:'Верхняя челюсть',callback_data:'tgnew:jaw:upper'},
    {text:'Нижняя челюсть',callback_data:'tgnew:jaw:lower'}
  ],[{text:'Обе челюсти',callback_data:'tgnew:jaw:both'}],...guidedNavigationMarkup().inline_keyboard]};
  if(missing.includes('режим: одиночка, мост или челюсть'))return {inline_keyboard:[[
    {text:'Одиночка',callback_data:'tgnew:mode:single'},
    {text:'Мост',callback_data:'tgnew:mode:bridge'},
    {text:'Челюсть',callback_data:'tgnew:mode:jaw'}
  ],...guidedNavigationMarkup().inline_keyboard]};
  if(missing.includes('верхнюю или нижнюю челюсть'))return {inline_keyboard:[[
    {text:'Верхняя челюсть',callback_data:'tgnew:jaw:upper'},
    {text:'Нижняя челюсть',callback_data:'tgnew:jaw:lower'}
  ],[{text:'Обе челюсти',callback_data:'tgnew:jaw:both'}],...guidedNavigationMarkup().inline_keyboard]};
  if(wizardStep==='teeth'||missing.includes('номер зуба или номера зубов')||missing.includes('минимум два номера зубов для моста')){
    const selected=new Set(fields.teeth),rows=[];
    for(const arch of [upperTeeth.slice(0,8),upperTeeth.slice(8),lowerTeeth.slice(0,8),lowerTeeth.slice(8)]){
      const row=arch.filter(number=>!selected.has(number)).map(number=>({text:String(number),callback_data:`tgnew:tooth:${number}`}));
      if(row.length)rows.push(row);
    }
    if(selected.size)rows.push([{text:`✅ Готово · выбрано ${selected.size}`,callback_data:'tgnew:teeth:done'},{text:'Сбросить',callback_data:'tgnew:teeth:reset'}]);
    rows.push(...guidedNavigationMarkup().inline_keyboard);
    return {inline_keyboard:rows};
  }
  if(missing.includes('желаемый срок готовности'))return {inline_keyboard:[[
    {text:`Стандартный · ${displayDate(currentServiceDueDate(analysis))}`,callback_data:'tgnew:due:standard'},
    {text:'Ввести дату',callback_data:'tgnew:due:custom'}
  ],...guidedNavigationMarkup().inline_keyboard]};
  if(missing.includes('цвет/оттенок или «не требуется»')){const shadeRows=[];for(let index=0;index<vitaShadeOptions.length;index+=4)shadeRows.push(vitaShadeOptions.slice(index,index+4).map(shade=>({text:shade,callback_data:`tgnew:shade:${shade}`})));return {inline_keyboard:[...shadeRows,[{text:'Другой оттенок',callback_data:'tgnew:shade:custom'},{text:'Не требуется',callback_data:'tgnew:shade:none'}],...guidedNavigationMarkup().inline_keyboard]};}
  if(!fields.productionType)return {inline_keyboard:[[
    {text:'Цифровой · нужны STL/сканы',callback_data:'tgnew:type:digital'},
    {text:'Аналоговый · нужен гипсовый слепок',callback_data:'tgnew:type:analog'}
  ],...guidedNavigationMarkup().inline_keyboard]};
  return null;
}

function orderEditMenuMarkup(orderId){return {inline_keyboard:[
  [{text:'👤 Пациент',callback_data:`tgoldedit:patient:${orderId}`},{text:'🎂 Дата рождения',callback_data:`tgoldedit:birth:${orderId}`}],
  [{text:'🦷 Режим / челюсть',callback_data:`tgoldedit:mode:${orderId}`},{text:'🔢 Зубы',callback_data:`tgoldedit:teeth:${orderId}`}],
  [{text:'🧾 Услуга',callback_data:`tgoldedit:service:${orderId}`},{text:'🎨 Цвет',callback_data:`tgoldedit:shade:${orderId}`}],
  [{text:'📅 Срок',callback_data:`tgoldedit:due:${orderId}`},{text:'💬 Комментарий',callback_data:`tgoldedit:comment:${orderId}`}]
]};}
function editChoiceBack(orderId){return [{text:'◀️ Назад',callback_data:`tgorder:edit:${orderId}`}];}
function editModeMarkup(orderId){return {inline_keyboard:[
  [{text:'Одиночка',callback_data:`tgoldchoice:${orderId}:mode|single`},{text:'Мост',callback_data:`tgoldchoice:${orderId}:mode|bridge`}],
  [{text:'Челюсть',callback_data:`tgoldchoice:${orderId}:mode|jaw`}],
  editChoiceBack(orderId)
]};}
function editJawMarkup(orderId){return {inline_keyboard:[
  [{text:'Верхняя челюсть',callback_data:`tgoldchoice:${orderId}:jaw|upper`},{text:'Нижняя челюсть',callback_data:`tgoldchoice:${orderId}:jaw|lower`}],
  [{text:'Обе челюсти',callback_data:`tgoldchoice:${orderId}:jaw|both`}],
  editChoiceBack(orderId)
]};}
function editShadeMarkup(orderId){const rows=[];for(let index=0;index<vitaShadeOptions.length;index+=4)rows.push(vitaShadeOptions.slice(index,index+4).map(shade=>({text:shade,callback_data:`tgoldchoice:${orderId}:shade|${shade}`})));return {inline_keyboard:[...rows,[{text:'Другой оттенок',callback_data:`tgoldchoice:${orderId}:shade|custom`},{text:'Не требуется',callback_data:`tgoldchoice:${orderId}:shade|none`}],editChoiceBack(orderId)]};}
function editTeethMarkup(orderId,selected=[]){
  const chosen=new Set(safeTeeth(selected)),rows=[];
  for(const arch of [upperTeeth.slice(0,8),upperTeeth.slice(8),lowerTeeth.slice(0,8),lowerTeeth.slice(8)]){
    const row=arch.filter(number=>!chosen.has(number)).map(number=>({text:String(number),callback_data:`tgoldchoice:${orderId}:teeth|${number}`}));
    if(row.length)rows.push(row);
  }
  if(chosen.size)rows.push([{text:`✅ Готово · выбрано ${chosen.size}`,callback_data:`tgoldchoice:${orderId}:teeth|done`},{text:'Сбросить',callback_data:`tgoldchoice:${orderId}:teeth|reset`}]);
  rows.push(editChoiceBack(orderId));
  return {inline_keyboard:rows};
}
function editServiceCategoryMarkup(orderId){
  return {inline_keyboard:[...catalogForPrompt().flatMap((item,index)=>item.services.length?[[{text:item.category,callback_data:`tgoldchoice:${orderId}:servicecat|${index}`}]]:[]),editChoiceBack(orderId)]};
}
function editServiceMarkup(orderId,categoryIndex){
  const category=catalogForPrompt()[Number(categoryIndex)];
  if(!category)return editServiceCategoryMarkup(orderId);
  return {inline_keyboard:[...category.services.map((service,index)=>[{text:`${service.name} · ${rubles(service.price)}`,callback_data:`tgoldchoice:${orderId}:servicesel|${categoryIndex}-${index}`}]),editChoiceBack(orderId)]};
}

function createOrderWizardPrompt(analysis,wizardStep=''){
  const missing=missingCreateFields(analysis),fields=analysis.fields,selection=resolveWorkSelection(fields.work,fields.material);
  if(wizardStep==='teeth'){
    const selected=analysis.fields.teeth;
    return [
      `Выберите зубы${analysis.fields.toothMode==='Мост'?' — для моста минимум два':''}.`,
      selected.length?`Выбрано: ${selected.join(', ')}.`:'Пока ни один зуб не выбран.',
      'После выбора нажмите «Готово».'
    ].join('\n');
  }
  if(missing.includes('имя и фамилию пациента')){
    const patientWords=(String(fields.patient||'').match(/[A-Za-zА-Яа-яЁё-]+/g)||[]);
    return patientWords.length===1?`Имя «${patientWords[0]}» сохранено. Укажите фамилию пациента.`:'Укажите фамилию и имя пациента. Отчество — по желанию.';
  }
  if(missing.includes('вид работы из прайса'))return 'Выберите раздел работы:';
  if(missing.includes('точное название услуги из прайса'))return `Выберите услугу из раздела «${selection.category?.name||fields.work}»:`;
  if(missing.includes('челюсть для шаблона'))return 'Выберите челюсть для шаблона:';
  if(missing.includes('режим: одиночка, мост или челюсть'))return 'Выберите режим работы:';
  if(missing.includes('верхнюю или нижнюю челюсть'))return 'Выберите челюсть:';
  if(missing.includes('желаемый срок готовности'))return 'Выберите срок готовности:';
  if(missing.includes('цвет/оттенок или «не требуется»'))return 'Выберите цвет:';
  if(!fields.productionType)return 'Выберите тип работы:';
  return 'Проверьте данные заказа.';
}

function guidedDuePrompt(analysis,acceptedAt=new Date(),includeMinimum=true){
  const minimum=currentServiceDueDate(analysis,acceptedAt),minimumLine=minimum
    &&includeMinimum ? `\n\nМинимальная дата готовности для выбранной услуги — ${displayDate(minimum)}.`
    : '';
  return `Напишите желаемую дату готовности текстом или отправьте голосовое сообщение.${minimumLine}\n\nНапример: «10 ноября».`;
}
function weekendDateAlternatives(order,dueIso,acceptedAt=new Date()){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dueIso||'')))return null;
  const entered=new Date(`${dueIso}T12:00:00+03:00`);
  if(!Number.isFinite(entered.getTime())||isWorkingDay(entered))return null;
  const findWorkingDate=direction=>{
    const date=new Date(entered);
    for(let step=0;step<14;step++){
      date.setDate(date.getDate()+direction);
      if(isWorkingDay(date))return isoDateLocal(date);
    }
    return '';
  };
  const alternatives={before:findWorkingDate(-1),after:findWorkingDate(1)};
  for(const key of Object.keys(alternatives))if(!alternatives[key]||telegramDeadlineError(order,alternatives[key],acceptedAt))delete alternatives[key];
  return Object.keys(alternatives).length?alternatives:null;
}
function weekendDateChoiceMarkup(alternatives={}){
  const rows=[];
  if(alternatives.before)rows.push([{text:`📅 До выходного · ${displayDate(alternatives.before)}`,callback_data:'tgnew:due:before'}]);
  if(alternatives.after)rows.push([{text:`📅 После выходного · ${displayDate(alternatives.after)}`,callback_data:'tgnew:due:after'}]);
  rows.push([{text:'✍️ Ввести свою дату',callback_data:'tgnew:due:custom'}],...guidedNavigationMarkup().inline_keyboard);
  return {inline_keyboard:rows};
}

function backGuidedOrder(analysis,guided={}){
  const next=canonicalizeCatalogSelection(normalizeAnalysis(analysis||{intent:'create_order',fields:{}}));
  const fields=next.fields;
  let wizardStep='',awaitingInput='',readyForConfirmation=false;
  if(guided.awaitingInput==='productionType'){
    fields.productionType='';awaitingInput='patientConfirm';
  }else if(guided.awaitingInput==='doctor'){
    fields.doctorId='';awaitingInput='patientConfirm';
  }else if(guided.awaitingInput==='patientConfirm'){
    fields.patient='';next.patientSurname='';awaitingInput='patient';
  }else if(guided.awaitingInput==='fileChoice'||guided.awaitingInput==='files'){
    awaitingInput='';readyForConfirmation=true;
  }else if(guided.awaitingInput==='patient'){
    const words=(String(fields.patient||'').match(/[A-Za-zА-Яа-яЁё-]+/g)||[]);
    if(words.length<2)return {cancel:true};
    fields.patient='';next.patientSurname='';awaitingInput='patient';
  }else if(guided.awaitingInput==='due'){
    fields.dueDate='';
    const selection=resolveWorkSelection(fields.work,fields.material);
    if(selection.option&&!isNoTeethSelection(selection.category?.name,selection.option.name))wizardStep='teeth';
  }else if(guided.wizardStep==='teeth'){
    fields.toothMode='';fields.jaw='';fields.teeth=[];
  }else if(guided.readyForConfirmation||(!missingCreateFields(next).length&&fields.productionType)){
    // The previous step before the final review is the shade selection. Do
    // not jump all the way back to the production type.
    fields.shade='';
  }else{
    const missing=missingCreateFields(next);
    if(missing.includes('желаемый срок готовности')){
      fields.dueDate='';
      const selection=resolveWorkSelection(fields.work,fields.material);
      if(selection.option&&!isNoTeethSelection(selection.category?.name,selection.option.name))wizardStep='teeth';
    }else if(missing.includes('цвет/оттенок или «не требуется»')){
      const finiteDays=productionDaysForOrder({work:fields.work,workOption:fields.material,material:fields.material,variants:analysisVariants(next)});
      if(Number.isFinite(finiteDays)&&fields.dueDate)fields.dueDate='';
      else if(fields.productionType){fields.productionType='';awaitingInput='productionType';}
      else if(fields.shade)fields.shade='';
    }else if(missing.includes('минимум два номера зубов для моста')||missing.includes('номер зуба или номера зубов')){
      fields.teeth=[];wizardStep='teeth';
    }else if(missing.includes('челюсть для шаблона')||missing.includes('режим: одиночка, мост или челюсть')||missing.includes('верхнюю или нижнюю челюсть')){
      fields.material='';fields.toothMode='';fields.jaw='';fields.teeth=[];
    }else if(missing.includes('точное название услуги из прайса')){
      fields.work='';fields.material='';fields.toothMode='';fields.jaw='';fields.teeth=[];
    }else if(missing.includes('вид работы из прайса')){
      fields.productionType='';awaitingInput='productionType';
    }else if(hasFullPatientName(fields.patient)){
      fields.patient='';next.patientSurname='';awaitingInput='patient';
    }else return {cancel:true};
  }
  return {analysis:next,wizardStep,awaitingInput,readyForConfirmation};
}

function buildPrompt(text,clinic,orders,snapshot,attachment=null){
  const orderList=orders.slice(0,60).map(order=>({id:order.id,patient:order.patient,work:orderWorkLabel(order),material:order.material||'',teeth:order.teeth||[],due:order.date,status:orderStage(snapshot,order)}));
  const attachmentNote=attachment?.orderEligible?`\nК сообщению приложен файл: ${JSON.stringify(attachment.name)} (${attachment.kind==='photo'?'фото':'документ'}).`:'';
  return `Сегодня ${moscowDate()}, часовой пояс Europe/Moscow.\nКлиника: ${clinic.name}; код подключения: ${clinic.telegramCode}.\nДействующие заказы клиники: ${JSON.stringify(orderList)}\n\nАктуальный каталог услуг и цены за единицу в рублях: ${JSON.stringify(catalogForPrompt())}\n\nСообщение клиента: ${JSON.stringify(text)}${attachmentNote}\n\nОпредели намерение и извлеки только прямо сообщенные данные. Верни только JSON без Markdown:\n{"intent":"create_order|update_order|cancel_order|status_request|accept_order|rework_order|general_message|clarify","confidence":0.0,"orderId":"","patientSurname":"","fields":{"patient":"","birthDate":"YYYY-MM-DD или пусто","work":"","material":"","variants":[{"work":"","material":"","teeth":[],"toothMode":"Одиночка|Мост|Челюсть|Без зубов|","jaw":"upper|lower|both|"}],"teeth":[],"toothMode":"Одиночка|Мост|Челюсть|Без зубов|","jaw":"upper|lower|both|","productionType":"digital|analog|","dueDate":"YYYY-MM-DD или пусто","shade":"","comment":"","reason":""},"summary":"краткое содержание","question":"вопрос при нехватке данных"}\n\nПравила:\n- Никогда не придумывай пациента, зубы, режим, работу, материал, цвет, срок, причину или номер заказа.\n- Сохраняй в fields.patient все названные части имени пациента без потерь: имя и фамилию, а также отчество, если оно прозвучало. Не сокращай полное имя до одной фамилии и не переставляй части имени без необходимости.\n- В patientSurname указывай только фамилию пациента в именительном падеже для поиска существующего заказа, например «Мамедову» — «Мамедов».\n- Для нового заказа фамилия и имя обязательны. Если названа только фамилия, обязательно попроси имя. Отчество запрашивать не нужно: если клиент его назвал, сохрани; если не назвал, продолжай без него.\n- Дату рождения пациента помещай в birthDate только если её прямо назвали.\n- Для услуги из каталога укажи в fields.work точное название категории, а в fields.material точное название услуги. Не меняй формулировки каталога.\n- Если в одном сообщении названы несколько услуг, запиши каждую отдельным объектом в fields.variants с её зубами и режимом. Не создавай отдельный тип услуги «Несколько услуг».\n- Если клиент использовал понятное сокращение или разговорное название, выбери соответствующую услугу из каталога только при однозначном соответствии. Иначе запроси уточнение.\n- Для изменения, отмены, статуса, приемки и доработки используй orderId, если он назван. Иначе используй фамилию.\n- Команда «загрузи», «добавь», «прикрепи» или «закинь» приложенный файл к пациенту/заказу означает update_order. Другие поля при этом оставь пустыми.\n- Если речь о новом заказе, intent=create_order. Для создания обязательны фамилия и имя пациента (отчество по желанию), режим выбора, точная услуга из каталога, зубы или челюсть, срок и цвет либо явная фраза «цвет не требуется».\n- Для «Титановое основание Geo Medi» и «Титановое основание Аналог» не запрашивай зубы: это услуги без выбора зубов.\n- Для услуг категорий «Ложки прикуса», «Сплинты» и «Хирургические шаблоны» не выбирай челюсть автоматически: предложи верхнюю, нижнюю или обе челюсти.\n- Если клиент явно сказал «цифра» или «аналог», сохрани это в fields.productionType как digital или analog. Если тип не назван, оставь поле пустым: его выберет клиент кнопкой перед подтверждением.\n- Не угадывай режим. Одиночка — отдельные единицы, Мост — связанная конструкция, Челюсть — вся верхняя или нижняя челюсть.\n- Для всей верхней челюсти укажи toothMode=Челюсть и jaw=upper; для нижней jaw=lower.\n- Фразу «стандартный срок» оставь без даты, если клиент не назвал конкретный срок: бот предложит рассчитанную по услуге рабочую дату.\n- Не преобразуй одно число дня без месяца в дату: «10» или «10 число» недостаточно, в этом случае оставь dueDate пустым и запроси месяц.\n- Вопрос «что с заказом», «когда будет готов» означает status_request.\n- «Работу принимаю», «всё подходит» означает accept_order.\n- Просьба переделать или исправить означает rework_order, причину помести в fields.reason.\n- Обычное сообщение лаборатории без команды означает general_message.\n- Неопределенное намерение означает clarify.\n- Относительные даты преобразуй относительно сегодняшней даты.`;
}

function actionLabel(intent){return ({create_order:'Создать заказ',update_order:'Изменить заказ',cancel_order:'Отменить заказ',accept_order:'Принять работу',rework_order:'Отправить на доработку'})[intent]||'Выполнить действие'}
function summaryLines(analysis,order,clinic){
  const fields=analysis.fields;
  const lines=[actionLabel(analysis.intent),'',`Клиника: ${clinic.name}`];
  if(order)lines.push(`Заказ: ${order.id}`,`Пациент: ${order.patient}`);
  else if(fields.patient||analysis.patientSurname)lines.push(`Пациент: ${fields.patient||analysis.patientSurname}`);
  const doctor=order?.doctor?{name:order.doctor,specialty:order.doctorSpecialty||''}:selectedClinicDoctor(clinic,fields.doctorId);
  if(doctor)lines.push(`Врач: ${doctorLabel(doctor)}`);
  if(fields.birthDate)lines.push(`Дата рождения: ${displayDate(fields.birthDate)}`);
  const variants=analysisVariants(analysis);
  if(variants.length>1){
    lines.push('','Услуги:');
    variants.forEach((variant,index)=>{
      const teeth=variantNeedsToothInput(variant)?variantEffectiveTeeth(variant).join(', ')||'не выбраны':'не требуются';
      if(index)lines.push('');
      lines.push(`${index+1}. ${variant.work}${variant.material?` · ${variant.material}`:''}`);
      if(variant.toothMode)lines.push(`Режим: ${variant.toothMode}`);
      if(variant.jaw)lines.push(`Челюсть: ${variant.jaw==='upper'?'верхняя':variant.jaw==='both'?'верхняя и нижняя':'нижняя'}`);
      lines.push(`Зубы: ${teeth}`);
    });
  }else{
    lines.push('');
    if(fields.work)lines.push(`Работа: ${fields.work}`);
    if(fields.material)lines.push(`Исполнение: ${fields.material}`);
    if(fields.teeth.length)lines.push(`Зубы: ${fields.teeth.join(', ')}`);
    if(fields.toothMode)lines.push(`Режим: ${fields.toothMode}`);
    if(fields.jaw)lines.push(`Челюсть: ${fields.jaw==='upper'?'верхняя':fields.jaw==='both'?'верхняя и нижняя':'нижняя'}`);
  }
  lines.push('');
  if(fields.productionType)lines.push(`Тип работы: ${fields.productionType==='analog'?'Аналоговый':'Цифровой'}`);
  const dueDate=analysis.intent==='create_order'?latestServiceDueDate(analysis):fields.dueDate;
  if(dueDate)lines.push(`${analysis.intent==='create_order'&&variants.length>1?'Срок готовности всего заказа':'Срок'}: ${displayDate(dueDate)}`);
  if(fields.shade)lines.push(`Цвет: ${fields.shade}`);
  if(fields.reason)lines.push(`Причина: ${fields.reason}`);
  if(fields.comment)lines.push(`Комментарий: ${fields.comment}`);
  if(analysis.summary&&!lines.some(line=>line.endsWith(analysis.summary)))lines.push(`Содержание: ${analysis.summary}`);
  return lines;
}

function changedFields(order,fields){
  const changes={};
  if(fields.patient)changes.patient=fields.patient;
  if(fields.birthDate)changes.birth=fields.birthDate;
  if(fields.work)changes.work=fields.work;
  if(fields.material)changes.material=fields.material;
  if(fields.teeth.length||(fields.toothMode==='Челюсть'&&fields.jaw)){
    changes.teeth=effectiveTeeth(fields);
    changes.quantity=Math.max(1,changes.teeth.length);
  }
  if(fields.toothMode)changes.toothMode=fields.toothMode;
  if(fields.dueDate)changes.date=displayDate(fields.dueDate);
  if(fields.shade)changes.shade=fields.shade;
  if(fields.comment&&!String(order.comment||'').split('\n').includes(fields.comment))changes.comment=[order.comment,fields.comment].filter(Boolean).join('\n');
  return changes;
}

function clientRequestType(intent,changes={}){
  if(intent==='cancel_order')return 'cancel';
  const keys=Object.keys(changes).filter(key=>!['quantity','sum'].includes(key));
  return keys.length===1&&keys[0]==='date'?'deadline':'edit';
}

function changeLines(order,fields){
  if(!order)return [];
  const changes=changedFields(order,fields),labels={patient:'Пациент',birth:'Дата рождения',work:'Работа',material:'Исполнение',teeth:'Зубы',toothMode:'Режим',date:'Срок',shade:'Цвет',comment:'Комментарий'};
  return Object.entries(changes).filter(([key,value])=>JSON.stringify(order[key]??'')!==JSON.stringify(value)).map(([key,value])=>{
    const before=Array.isArray(order[key])?order[key].join(', '):String(order[key]||'—');
    const after=Array.isArray(value)?value.join(', '):String(value||'—');
    return `${labels[key]||key}: ${before} → ${after}`;
  });
}

async function readSecret(name){
  if(process.env[name])return process.env[name].trim();
  const file=process.env[`${name}_FILE`];
  if(!file)return '';
  try{return (await fs.promises.readFile(file,'utf8')).trim()}catch(error){if(error.code==='ENOENT')return '';throw error}
}

export function createTelegramBridge({onClinicMessage=async()=>{},onBotMessage=async()=>{},saveTelegramAttachment=async()=>null,attachOrderFile=async()=>null,loadClinicAttachment=async()=>null,createLargeUploadLink=async()=>'',createLargeUploadDraftLink=async()=>null,getLargeUploadDraftStatus=async()=>({files:0}),claimLargeUploadDraft=async()=>({attached:0,total:0}),createCadPreviewLink=()=>'',onOrderCreated=async()=>{}}={}){
  let token='',speechKey='',gptKey='',folderId='';
  let botIdentity={};
  let stopped=false,polling=false,state={offset:0,bindings:{},bindingRequests:{},pending:{},completed:{},contexts:{},guided:{},carts:{},messageActions:{},inbox:{}};
  const health={startedAt:'',lastUpdateAt:'',lastTelegramSuccessAt:'',lastYandexSuccessAt:'',lastErrorAt:'',lastError:'',processedUpdates:0};
  const stateFile=process.env.TELEGRAM_STATE_FILE||path.join(process.cwd(),'.data','telegram-bot.json');
  let stateSaveQueue=Promise.resolve();
  const chatQueues=new Map();
  const telegramProxyUrl=String(process.env.TELEGRAM_HTTP_PROXY_URL||'').trim();
  let telegramDispatcher=null;
  if(telegramProxyUrl){
    const {ProxyAgent}=require('undici');
    telegramDispatcher=new ProxyAgent(telegramProxyUrl);
  }

  function telegramFetch(url,options={}){
    return fetch(url,{...options,...(telegramDispatcher?{dispatcher:telegramDispatcher}:{})});
  }

  async function saveState(){
    stateSaveQueue=stateSaveQueue.catch(()=>{}).then(async()=>{
      await fs.promises.mkdir(path.dirname(stateFile),{recursive:true,mode:0o700});
      await fs.promises.writeFile(stateFile+'.tmp',JSON.stringify(state),{mode:0o600});
      await fs.promises.rename(stateFile+'.tmp',stateFile);
    });
    await stateSaveQueue;
  }
  async function api(method,body={}){
    const response=await telegramFetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(method==='getUpdates'?45000:15000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(`Telegram ${method}: ${data.description||response.status}`);
    health.lastTelegramSuccessAt=new Date().toISOString();
    return data.result;
  }
  async function send(chatId,text,extra={},mirror=true){
    const result=await api('sendMessage',{chat_id:chatId,text,disable_web_page_preview:true,...extra});
    if(mirror){
      const clinicId=Object.entries(state.bindings).find(([,binding])=>String(typeof binding==='object'?binding.chatId:binding)===String(chatId))?.[0];
      if(clinicId)await onBotMessage(clinicId,{text,sender:'Ответ AI',telegramMessageId:result?.message_id,telegramChatId:String(chatId),messageRole:'bot'}).catch(()=>{});
    }
    return result;
  }
  async function editMessage(chatId,messageId,text,replyMarkup=null){
    try{
      return await api('editMessageText',{chat_id:chatId,message_id:messageId,text,disable_web_page_preview:true,reply_markup:replyMarkup||{inline_keyboard:[]}});
    }catch(error){
      if(/message is not modified/i.test(error.message))return null;
      throw error;
    }
  }
  async function answerCallback(id,text){return api('answerCallbackQuery',{callback_query_id:id,text,show_alert:false})}
  function quickMenuMarkup(){
    return {inline_keyboard:[[{text:'➕ Новый заказ',callback_data:'tgquick:new'},{text:'🔎 Статус заказа',callback_data:'tgquick:status'}],[{text:'✏️ Изменить заказ',callback_data:'tgquick:edit'},{text:'👤 Позвать человека',callback_data:'tgquick:human'}],[{text:'📎 Загрузить файл',callback_data:'tgquick:file'},{text:'❌ Отменить заказ',callback_data:'tgquick:cancel'}]]};
  }
  async function sendPinnedWelcome(chatId){
    const message=await send(chatId,welcomeText,{reply_markup:quickMenuMarkup()},false);
    try{await api('pinChatMessage',{chat_id:chatId,message_id:message.message_id,disable_notification:true})}
    catch(error){
      await send(chatId,'Чтобы закрепить инструкцию для всех участников, выдайте боту права администратора на закрепление сообщений.',{},false).catch(()=>{});
      console.error('Telegram welcome pin failed:',error.message);
    }
    return message;
  }
  function contextKey(chatId,userId){return `${chatId}:${userId}`}
  function currentContext(chatId,userId,clinicId){
    const key=contextKey(chatId,userId),item=state.contexts[key];
    if(!item||item.clinicId!==clinicId||item.expiresAt<Date.now()){if(item)delete state.contexts[key];return null}
    return item;
  }
  function rememberContext(chatId,userId,clinicId,orderId){
    if(!orderId)return;
    state.contexts[contextKey(chatId,userId)]={clinicId,orderId,expiresAt:Date.now()+2*60*60*1000};
  }
  function rememberGuidedAction(chatId,userId,clinicId,orderId,mode,extra={}){
    const key=contextKey(chatId,userId),previous=state.guided[key];
    state.guided[key]={clinicId,orderId,mode,...(mode==='edit'&&previous?.mode==='edit'&&previous.orderId===orderId?{variantIndex:previous.variantIndex,baseOrderRevision:previous.baseOrderRevision}:{}),...extra,attachments:extra.attachments??previous?.attachments??[],doctorChoices:extra.doctorChoices??previous?.doctorChoices??[],doctorPage:extra.doctorPage??previous?.doctorPage??0,draftUploadKey:Object.prototype.hasOwnProperty.call(extra,'draftUploadKey')?extra.draftUploadKey:(previous?.draftUploadKey||''),draftUploadHref:Object.prototype.hasOwnProperty.call(extra,'draftUploadHref')?extra.draftUploadHref:(previous?.draftUploadHref||''),expiresAt:Date.now()+30*60*1000};
  }
  function currentGuidedAction(chatId,userId,clinicId){
    const key=contextKey(chatId,userId),item=state.guided[key];
    if(!item||item.clinicId!==clinicId||item.expiresAt<Date.now()){if(item)delete state.guided[key];return null}
    return item;
  }
  function takeGuidedAction(chatId,userId,clinicId){
    const key=contextKey(chatId,userId),item=currentGuidedAction(chatId,userId,clinicId);
    if(!item)return null;
    delete state.guided[key];return item;
  }
  function canConfirm(item,callback){return String(callback.from?.id||'')===String(item.userId||'')||isSupportUsername(callback.from?.username)}
  function doctorChoiceState(clinic,selectedId='',page=0){
    const doctors=activeClinicDoctors(clinic),pageSize=8,totalPages=Math.max(1,Math.ceil(doctors.length/pageSize)),safePage=Math.min(Math.max(0,Number(page)||0),totalPages-1),choices=doctors.map(item=>item.id),rows=doctors.slice(safePage*pageSize,(safePage+1)*pageSize).map((doctor,index)=>[{text:`${doctor.name}${doctor.specialty?` · ${doctor.specialty}`:''}`.slice(0,60),callback_data:`tgnew:doctor:${safePage*pageSize+index}`}]);
    if(totalPages>1){rows.push([{text:'◀️',callback_data:`tgnew:doctorpage:${safePage-1}`},{text:`${safePage+1}/${totalPages}`,callback_data:'tgnew:noop'},{text:'▶️',callback_data:`tgnew:doctorpage:${safePage+1}`}].filter(button=>button.callback_data==='tgnew:noop'||!button.callback_data.endsWith(':-1')&&!button.callback_data.endsWith(`:${totalPages}`)))}
    rows.push(...guidedNavigationMarkup().inline_keyboard);
    return {choices,page:safePage,markup:{inline_keyboard:rows},selected:doctors.find(item=>item.id===selectedId)||null};
  }
  function doctorPrompt(clinic,selectedId='',page=0){
    const stateValue=doctorChoiceState(clinic,selectedId,page);
    return {state:stateValue,text:'Выберите врача, который ведёт этот заказ. Специальность указана рядом с именем.',markup:stateValue.markup};
  }

  async function transcribeVoice(message){
    const voice=message.voice||message.audio;
    if(!voice)throw new Error('В сообщении нет аудио');
    if(Number(voice.duration)>300||Number(voice.file_size)>10*1024*1024)throw new Error('Голосовое сообщение должно быть не длиннее 5 минут и не больше 10 МБ');
    const file=await api('getFile',{file_id:voice.file_id});
    const download=await telegramFetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`,{signal:AbortSignal.timeout(20000)});
    if(!download.ok)throw new Error('Не удалось скачать голосовое сообщение');
    const audio=Buffer.from(await download.arrayBuffer());
    const recognize=async chunk=>{
      const response=await fetch('https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&format=oggopus',{method:'POST',headers:{Authorization:`Api-Key ${speechKey}`,'Content-Type':'application/ogg'},body:chunk,signal:AbortSignal.timeout(35000)});
      const data=await response.json().catch(()=>({}));if(!response.ok||!data.result)throw new Error(data.error_message||data.error_code||'SpeechKit не смог распознать сообщение');return data.result;
    };
    if(Number(voice.duration)<=30&&audio.length<=1024*1024)return cleanText(await recognize(audio),6000);
    const directory=await fs.promises.mkdtemp(path.join(os.tmpdir(),'create-dental-voice-'));
    try{
      const input=path.join(directory,'voice.ogg'),pattern=path.join(directory,'part-%03d.ogg');await fs.promises.writeFile(input,audio,{mode:0o600});
      await execFileAsync('ffmpeg',['-hide_banner','-loglevel','error','-i',input,'-f','segment','-segment_time','25','-c','copy',pattern],{timeout:30000});
      const parts=(await fs.promises.readdir(directory)).filter(name=>/^part-\d+\.ogg$/.test(name)).sort();if(!parts.length)throw new Error('Не удалось разделить аудио');
      const transcript=[];for(const part of parts)transcript.push(await recognize(await fs.promises.readFile(path.join(directory,part))));return cleanText(transcript.join(' '),6000);
    }finally{await fs.promises.rm(directory,{recursive:true,force:true}).catch(()=>{})}
  }

  async function downloadTelegramFile(fileId,maxBytes=20*1024*1024){
    const file=await api('getFile',{file_id:fileId});
    if(Number(file.file_size)>maxBytes)throw new Error('Файл превышает допустимый размер');
    const response=await telegramFetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`,{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error('Не удалось скачать файл из Telegram');
    const data=Buffer.from(await response.arrayBuffer());
    if(data.length>maxBytes)throw new Error('Файл превышает допустимый размер');
    return data;
  }

  async function saveTelegramPhoto(clinicId,media,message){
    const data=await downloadTelegramFile(media.fileId);
    let previewData=data.length<=350*1024?data:null;
    if(media.previewFileId&&media.previewFileId!==media.fileId){
      previewData=await downloadTelegramFile(media.previewFileId,350*1024).catch(()=>previewData);
    }
    return saveTelegramAttachment(clinicId,{name:media.name,type:media.type,data,previewData,kind:'photo',orderEligible:true,sender:actorName(message)});
  }

  async function analyze(text,clinic,attachment=null,contextOrderId=''){
    const snapshot=portalSnapshot(),orders=activeOrdersForClinic(snapshot,clinic.id);
    const directAttachmentAction=attachmentCommandAnalysis(text,attachment,clinic.id,snapshot,normalizeAnalysis({intent:'general_message',fields:{}}),contextOrderId);
    if(directAttachmentAction.intent==='update_order')return directAttachmentAction;
    const response=await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion',{method:'POST',headers:{Authorization:`Api-Key ${gptKey}`,'Content-Type':'application/json'},body:JSON.stringify({modelUri:`gpt://${folderId}/yandexgpt-lite/latest`,completionOptions:{stream:false,temperature:0.1,maxTokens:1800},messages:[{role:'system',text:'Ты аккуратно преобразуешь сообщения стоматологов в команды для CRM зуботехнической лаборатории. Строго соблюдай схему и не выдумывай данные.'},{role:'user',text:buildPrompt(text,clinic,orders,snapshot,attachment)}]}),signal:AbortSignal.timeout(45000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'YandexGPT не смог разобрать сообщение');
    const result=data.result?.alternatives?.[0]?.message?.text;
    health.lastYandexSuccessAt=new Date().toISOString();
    const parsed=repairPatientName(normalizeAnalysis(parseJson(result)),text);
    const analysis=attachmentCommandAnalysis(text,attachment,clinic.id,snapshot,canonicalizeCatalogSelection(parsed),contextOrderId);
    if(contextOrderId&&analysis.intent!=='create_order'&&!analysis.orderId&&!analysis.patientSurname&&['update_order','cancel_order','status_request','accept_order','rework_order'].includes(analysis.intent))analysis.orderId=contextOrderId;
    return analysis;
  }

  function boundClinicForMessage(message){
    const chatId=String(message.chat?.id||'');
    const clinicId=Object.entries(state.bindings).find(([,binding])=>String(typeof binding==='object'?binding.chatId:binding)===chatId)?.[0];
    return clinicId?portalClient(clinicId):null;
  }
  function requestedClinicForMessage(message){
    const code=codeFromText(message.chat?.title)||codeFromText(message.text);
    if(!code)return null;
    return portalSnapshot().clients.find(client=>!client.deleted&&String(client.telegramCode).toUpperCase()===code)||null;
  }
  async function requestBinding(message,clinic){
    const chatId=String(message.chat.id);
    const existing=Object.values(state.bindingRequests).find(item=>item.chatId===chatId&&item.clinicId===clinic.id&&item.expiresAt>Date.now());
    if(existing)return send(chatId,'Код принят. Подключение к CRM ожидает подтверждения главного техника. Бот сообщит, когда чат будет подключён.',{},false);
    const id=randomBytes(10).toString('hex');
    state.bindingRequests[id]={id,clinicId:clinic.id,chatId,chatTitle:cleanText(message.chat?.title||'Чат Telegram',180),requestedBy:actorName(message),requestedByUserId:String(message.from?.id||''),requestedAt:new Date().toISOString(),expiresAt:Date.now()+30*60*1000};
    for(const [key,item] of Object.entries(state.bindingRequests))if(item.expiresAt<Date.now())delete state.bindingRequests[key];
    await saveState();
    await recordPortalEvent('',{role:'telegram',name:actorName(message)},'telegram_binding_requested',{clinicId:clinic.id,summary:`${clinic.name} · ${message.chat?.title||'чат Telegram'}`}).catch(()=>{});
    await send(chatId,`Код принят. Запрос на подключение к клинике «${clinic.name}» отправлен главному технику. Бот сообщит, когда чат будет подключён к CRM.`,{},false);
  }
  async function approveBinding(requestId,approvedBy='Главный техник'){
    const request=state.bindingRequests[requestId];
    if(!request||request.expiresAt<Date.now())throw new Error('Запрос устарел');
    const clinic=portalClient(request.clinicId);if(!clinic)throw new Error('Клиника не найдена');
    const previous=state.bindings[clinic.id],previousChatId=typeof previous==='object'?previous?.chatId:previous;
    state.bindings[clinic.id]={chatId:request.chatId,chatTitle:request.chatTitle,approvedBy,approvedAt:new Date().toISOString()};
    delete state.bindingRequests[requestId];await saveState();
    const snapshot=portalSnapshot();await replacePortalCollection('clients',snapshot.clients.map(client=>client.id===clinic.id?{...client,telegramCode:''}:client),{role:'technician',name:approvedBy});
    await send(request.chatId,`✅ Чат успешно подключён к CRM клиники «${clinic.name}». Код подключения больше не нужен.`,{},false).catch(()=>{});
    if(previousChatId&&String(previousChatId)!==String(request.chatId))await send(previousChatId,'Этот чат отключён от CRM, потому что главный техник подключил новый чат клиники.',{},false).catch(()=>{});
    await sendMenu(request.chatId).catch(()=>{});
    return true;
  }
  async function rejectBinding(requestId){
    const request=state.bindingRequests[requestId];if(!request)throw new Error('Запрос не найден');
    delete state.bindingRequests[requestId];await saveState();
    await send(request.chatId,'Запрос на подключение отклонён главным техником.',{},false).catch(()=>{});
    return true;
  }
  async function unbindClinic(clinicId){
    const binding=state.bindings[clinicId];if(!binding)return false;
    const chatId=typeof binding==='object'?binding.chatId:binding;delete state.bindings[clinicId];await saveState();
    await send(chatId,'Связь этого чата с CRM отключена главным техником.',{},false).catch(()=>{});return true;
  }

  function attachmentList(item){return Array.isArray(item.attachments)?item.attachments:item.attachment?[item.attachment]:[]}
  async function sendConfirmation(item,order,clinic){
    const lines=summaryLines(item.analysis,order,clinic);
    const changes=changeLines(order,item.analysis.fields);
    if(changes.length)lines.push('','Изменения:',...changes.map(line=>`• ${line}`));
    if(['create_order','update_order'].includes(item.analysis.intent)){
      const estimate=priceEstimate(item.analysis,order);
      const details=priceEstimateDetails(estimate);
      lines.push('',`Предварительная стоимость: ${estimate.text}`);
      if(details)lines.push('',details);
      lines.push('','Итоговую стоимость лаборатория подтвердит после проверки заказа.');
    }
    if(item.analysis.intent==='create_order'){
      const optional=[];
      if(!item.analysis.fields.birthDate)optional.push('дату рождения');
      if(!item.analysis.fields.comment)optional.push('комментарий');
      if(optional.length)lines.push('',`Дополнительные данные можно добавить по желанию: ${optional.join(' и ')}.`);
    }
    const files=attachmentList(item);
    if(files.length)lines.push('',`Файлы (${files.length}):`,...files.map(file=>`• ${file.name}`));
    const needsChiefApproval=['update_order','cancel_order'].includes(item.analysis.intent);
    lines.push('',`Запросил: ${item.actor}`,'',needsChiefApproval?'Проверьте запрос перед отправкой главному технику.':'Проверьте заказ перед отправкой главному технику.');
    const buttons=item.analysis.intent==='create_order'
      ?[[{text:'✅ Подтвердить',callback_data:`tgconfirm:${item.id}`},{text:'✏️ Редактировать',callback_data:`tgedit:${item.id}`}],[{text:'👨‍⚕️ Сменить врача',callback_data:`tgdoctorchange:${item.id}`}],[{text:'➕ Добавить услугу',callback_data:`tgaddservice:${item.id}`},{text:'❌ Отменить',callback_data:`tgreject:${item.id}`}]]
      :[[{text:needsChiefApproval?'✅ Отправить запрос':'✅ Подтвердить',callback_data:`tgconfirm:${item.id}`}]];
    if(item.analysis.intent==='create_order'&&(!item.analysis.fields.birthDate||!item.analysis.fields.comment))buttons.push([{text:'➕ Добавить дополнительные данные',callback_data:`tgextra:${item.id}`}]);
    if(item.analysis.intent!=='create_order'){
      buttons.push([{text:'🔄 Другой заказ',callback_data:`tgreselect:${item.id}`},{text:'❌ Отменить',callback_data:`tgreject:${item.id}`}]);
    }
    return send(item.chatId,lines.join('\n'),{reply_markup:{inline_keyboard:buttons}});
  }

  async function propose(message,clinic,analysis,attachment=null,draftUploadKey='',filesHandled=false){
    const snapshot=portalSnapshot();
    // New-order attachments are intentionally not consumed here. Files belong
    // to the post-confirmation upload step, so a document accidentally sent
    // with the initial description cannot be silently attached before review.
    const incomingAttachments=analysis.intent==='create_order'?[]:(Array.isArray(attachment)?attachment:[attachment]).filter(item=>item?.orderEligible);
    const sourceKey=`${message.chat.id}:${message.message_id}`;
    if(state.messageActions[sourceKey])return;
    if(analysis.intent==='general_message')return;
    if(analysis.intent==='clarify')return send(message.chat.id,analysis.question||'Уточните, пожалуйста, что нужно сделать с заказом.');
    if(analysis.intent==='create_order'){
      const doctors=activeClinicDoctors(clinic),doctor=selectedClinicDoctor(clinic,analysis.fields.doctorId);
      if(doctors.length&&(!analysis.fields.doctorId||!doctor)){
        const picker=doctorPrompt(clinic,analysis.fields.doctorId);
        rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:analysis,awaitingInput:'doctor',doctorChoices:picker.state.choices,doctorPage:picker.state.page,attachments:incomingAttachments});
        await saveState();
        return send(message.chat.id,picker.text,{reply_markup:picker.markup});
      }
      const missing=missingCreateFields(analysis);
      if(missing.length){
        const wizardStep=missing.some(field=>field==='номер зуба или номера зубов'||field==='минимум два номера зубов для моста')?'teeth':'';
        rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep,attachments:incomingAttachments});
        await saveState();
        const replyMarkup=createOrderChoiceMarkup(analysis,wizardStep);
        return send(message.chat.id,createOrderWizardPrompt(analysis,wizardStep),replyMarkup?{reply_markup:replyMarkup}:{});
      }
      if(!analysis.fields.productionType){
        rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep:'',attachments:incomingAttachments});
        await saveState();
        return send(message.chat.id,createOrderWizardPrompt(analysis),{reply_markup:createOrderChoiceMarkup(analysis)});
      }
      const id=randomBytes(10).toString('hex');
      state.pending[id]={id,chatId:String(message.chat.id),clinicId:clinic.id,userId:String(message.from?.id||''),actor:actorName(message),analysis,orderId:'',targetOrderId:orderId(),attachments:incomingAttachments,draftUploadKey,createdAt:new Date().toISOString(),expiresAt:Date.now()+24*60*60*1000};
      await saveState();
      return sendConfirmation(state.pending[id],null,clinic);
    }
    if(analysis.intent==='update_order'&&analysis.fields.work){
      const selection=resolveWorkSelection(analysis.fields.work,analysis.fields.material);
      if(selection.category?.options.length&&!selection.option)return send(message.chat.id,`Уточните точное название услуги из раздела «${selection.category.name}», чтобы правильно рассчитать стоимость.`);
    }
    let order=null;
    if(analysis.intent!=='create_order'){
      const found=findOrder(snapshot,clinic.id,analysis);
      if(found.matches.length>1){
        const id=randomBytes(10).toString('hex');
        state.pending[id]={id,chatId:String(message.chat.id),clinicId:clinic.id,userId:String(message.from?.id||''),actor:actorName(message),analysis,orderId:'',allowedOrderIds:found.matches.slice(0,8).map(item=>item.id),attachments:incomingAttachments,draftUploadKey,createdAt:new Date().toISOString(),expiresAt:Date.now()+24*60*60*1000};
        state.messageActions[sourceKey]={id,at:new Date().toISOString()};
        await saveState();
        const buttons=found.matches.slice(0,8).map(item=>[{text:orderPickerLabel(item),callback_data:`tgpick:${id}:${item.id}`}]);
        buttons.push([{text:'❌ Отменить',callback_data:`tgreject:${id}`}]);
        return send(message.chat.id,'Нашлось несколько подходящих заказов. Выберите нужный:',{reply_markup:{inline_keyboard:buttons}});
      }
      order=found.order;
      if(!order)return send(message.chat.id,'Не удалось однозначно найти заказ этой клиники. Укажите фамилию пациента и, если возможно, ID заказа или вид работы.');
    }
    if(analysis.intent==='status_request'){rememberContext(message.chat.id,message.from?.id,clinic.id,order.id);await saveState();return send(message.chat.id,`Заказ ${order.id}\nПациент: ${order.patient}${orderDoctorText(order)}\nРабота: ${orderWorkLabel(order)}\nСрок: ${order.date}\nСтатус: ${orderStage(snapshot,order)}\n\nЭтот заказ выбран на ближайшие 2 часа.`)}
    if(analysis.intent==='update_order'&&!Object.keys(changedFields(order,analysis.fields)).length&&!incomingAttachments.length)return send(message.chat.id,analysis.question||'Укажите, какие данные заказа нужно изменить.');
    if(analysis.intent==='rework_order'&&!analysis.fields.reason)return send(message.chat.id,'Опишите, пожалуйста, что именно нужно исправить.');
    if(analysis.intent==='accept_order'&&orderStage(snapshot,order)!=='В доставке')return send(message.chat.id,`Сейчас заказ ${order.id} находится на этапе «${orderStage(snapshot,order)}». Принять работу можно после перевода в доставку.`);
    if(analysis.intent==='rework_order'&&orderStage(snapshot,order)!=='В доставке')return send(message.chat.id,`Сейчас заказ ${order.id} находится на этапе «${orderStage(snapshot,order)}». Запрос доработки доступен после доставки.`);
    const id=randomBytes(10).toString('hex');
    state.pending[id]={id,chatId:String(message.chat.id),clinicId:clinic.id,userId:String(message.from?.id||''),actor:actorName(message),analysis,orderId:order?.id||'',...(order?{baseOrderRevision:order._revision||0}:{}),targetOrderId:analysis.intent==='create_order'?orderId():'',attachments:incomingAttachments,draftUploadKey,createdAt:new Date().toISOString(),expiresAt:Date.now()+24*60*60*1000};
    state.messageActions[sourceKey]={id,at:new Date().toISOString()};
    for(const [key,item] of Object.entries(state.pending))if(item.expiresAt<Date.now())delete state.pending[key];
    for(const [key,item] of Object.entries(state.messageActions))if(Date.parse(item?.at||0)<Date.now()-30*24*60*60*1000)delete state.messageActions[key];
    await saveState();
    return sendConfirmation(state.pending[id],order,clinic);
  }

  async function promptEditPosition(error,item){
    if(error.code!=='variant_required')return false;
    const order=portalSnapshot().orders.find(order=>order.id===item.orderId&&order.clinicId===item.clinicId);
    if(!order?.variants?.length)return false;
    item.baseOrderRevision=order._revision||0;state.pending[item.id]=item;await saveState();
    await send(item.chatId,'К какой позиции заказа применить эту правку?',{reply_markup:{inline_keyboard:order.variants.map((variant,index)=>[{text:`${index+1}. ${variant.workOption||variant.work}`,callback_data:`tgvariant:${item.id}:${index}`}])}});
    return true;
  }
  async function executePending(item,callback){
    const snapshot=portalSnapshot(),clinic=portalClient(item.clinicId),analysis=item.analysis;
    if(!clinic)throw new Error('Клиника больше не найдена');
    const callbackUser=cleanText([callback.from?.first_name,callback.from?.last_name].filter(Boolean).join(' ')||callback.from?.username||'',120);
    const actor={role:'telegram',name:`Telegram · ${callbackUser||item.actor}`};
    const attach=async(orderId)=>{
      const files=attachmentList(item).filter(file=>file.orderEligible);if(!files.length)return '';
      let attached=0;
      for(const file of files){try{await attachOrderFile(orderId,item.clinicId,file,item.id);attached+=1}catch(error){console.error('Telegram order attachment failed:',error.message)}}
      return attached===files.length?` Прикреплено файлов: ${attached}.`:` Прикреплено файлов: ${attached} из ${files.length}.`;
    };
    const enqueueClientRequest=async(order,changes={},reason='')=>{
      if(item.baseOrderRevision!==undefined&&item.baseOrderRevision!==(order._revision||0))throw new Error('Заказ изменился. Откройте его заново и повторите правку.');
      if(hasServiceChanges(changes)){const promo=snapshot.promoCodes?.find(rule=>rule.active!==false&&rule.code===order.promoCode);changes={...changes,...reviseOrderServices(order,changes,{variantIndex:item.variantIndex,deliverySettings:snapshot.deliverySettings,promoPrices:promo?.prices||{}})};}
      if(changes.date){const issue=orderDeadlineError({...order,...changes},changes.date,{referenceDate:new Date(),notBefore:new Date()});if(issue)throw new Error(issue);}
      const current=portalSnapshot();
      const existing=current.clientRequests.find(request=>request.telegramActionId===item.id);
      if(existing)return existing;
      const type=clientRequestType(analysis.intent,changes);
      const request={
        id:`cr-${randomBytes(10).toString('hex')}`,
        orderId:order.id,
        baseOrderRevision:order._revision||0,
        ...(item.variantIndex!==undefined?{variantIndex:item.variantIndex}:{}),
        clinicId:clinic.id,
        type,
        status:'pending',
        changes,
        before:Object.fromEntries(Object.keys(changes).map(key=>[key,order[key]??''])),
        reason:cleanText(reason,2000),
        summary:cleanText(analysis.summary||reason||(type==='deadline'?'Изменение срока':type==='cancel'?'Отмена заказа':'Изменение заказа'),2000),
        requestedBy:item.actor,
        confirmedBy:callbackUser||item.actor,
        source:'telegram',
        telegramActionId:item.id,
        createdAt:new Date().toISOString()
      };
      await replacePortalCollection('clientRequests',[request,...current.clientRequests],actor);
      await recordPortalEvent(order.id,actor,'client_change_requested',{clinicId:clinic.id,summary:`Запрос на ${type==='cancel'?'отмену заказа':type==='deadline'?'изменение срока':'изменение заказа'} отправлен главному технику`,clientRequestId:request.id}).catch(()=>{});
      return request;
    };
    if(analysis.intent==='create_order'){
      const fields=analysis.fields,variants=analysisVariants(analysis),id=item.targetOrderId||orderId();
      if(snapshot.orders.some(order=>order.id===id)){const draftResult=item.draftUploadKey?await claimLargeUploadDraft(item.draftUploadKey,id,item.id):{attached:0,total:0};return `Заказ ${id} уже был создан ранее.${draftResult.total?` Прикреплено файлов со страницы загрузки: ${draftResult.attached} из ${draftResult.total}.`:''}${await attach(id)}`}
      const doctor=selectedClinicDoctor(clinic,fields.doctorId),activeDoctors=activeClinicDoctors(clinic);
      if(activeDoctors.length&&!doctor)throw new Error('Выберите действующего врача клиники перед подтверждением заказа');
      const missing=missingCreateFields(analysis);
      if(missing.length)throw new Error(`Заказ не заполнен: ${missing.join(', ')}`);
      for(const variant of variants){
        const error=telegramDeadlineError({work:variant.work,workOption:variant.material},variant.dueDate,new Date());
        if(error)throw new Error(`${variant.material||variant.work}: ${error}`);
      }
      const orderVariants=variants.map(variant=>{
        const selectedTeeth=variantEffectiveTeeth(variant);
        return {
          work:variant.work,
          workOption:variant.material,
          toothMode:variant.toothMode|| (isNoTeethSelection(variant.work,variant.material)?'Без зубов':'Одиночка'),
          bridgeRanges:variant.toothMode==='Мост'&&selectedTeeth.length?[selectedTeeth]:[],
          selectedTeeth,
          jaw:variant.jaw||'',
          dueDate:variant.dueDate||''
        };
      });
      const selectedTeeth=[...new Set(orderVariants.flatMap(variant=>variant.selectedTeeth))].sort((a,b)=>a-b);
      const estimate=priceEstimate(analysis);
      const first=orderVariants[0]||{work:fields.work,workOption:fields.material,toothMode:fields.toothMode,selectedTeeth};
      const orderDueDate=latestServiceDueDate(analysis);
      const order={id,patient:fields.patient,birth:fields.birthDate||'',doctorId:doctor?.id||'',doctor:doctor?.name||'',doctorSpecialty:doctor?.specialty||'',work:orderVariants.length>1?`Несколько услуг (${orderVariants.length})`:first.work||fields.work,material:orderVariants.length>1?orderVariants.map(variant=>variant.workOption||variant.work).join(' · '):(first.workOption||fields.material||''),toothMode:orderVariants.length>1?'Несколько услуг':first.toothMode,bridgeRanges:orderVariants.flatMap(variant=>variant.bridgeRanges||[]),quantity:estimate.units,date:displayDate(orderDueDate),status:'Новый',sum:estimate.text,image:'tooth.png',clinicId:clinic.id,clinic:clinic.name,teeth:selectedTeeth,variants:orderVariants,shade:fields.shade,comment:fields.comment||'',createdAt:new Date().toISOString(),source:'telegram',productionType:fields.productionType==='analog'?'analog':'digital',telegramDraft:false,telegramRequestedBy:item.actor,telegramConfirmedBy:callbackUser||item.actor,telegramActionId:item.id};
      const deadlineError=telegramDeadlineError(order,orderDueDate,new Date());
      if(deadlineError)throw new Error(deadlineError);
      await replacePortalCollection('orders',[order,...snapshot.orders],actor);
      const fresh=portalSnapshot();
      await replacePortalCollection('orderOverrides',{...fresh.orderOverrides,[id]:{stage:'Ожидает распределения'}},actor);
      try{await onOrderCreated(id)}catch(error){
        await replacePortalCollection('orders',snapshot.orders,actor).catch(()=>{});
        await replacePortalCollection('orderOverrides',snapshot.orderOverrides,actor).catch(()=>{});
        throw new Error('Не удалось создать папку заказа на Яндекс Диске. Заказ не создан');
      }
      let draftAttachmentResult={attached:0,total:0};
      if(item.draftUploadKey)draftAttachmentResult=await claimLargeUploadDraft(item.draftUploadKey,id,item.id);
      await recordPortalEvent(id,actor,'telegram_confirmed',{summary:`Запросил: ${item.actor}; подтвердил: ${callbackUser||item.actor}`,clinicId:clinic.id,telegramActionId:item.id}).catch(()=>{});
      const uploadedText=draftAttachmentResult.total?` Прикреплено файлов со страницы загрузки: ${draftAttachmentResult.attached} из ${draftAttachmentResult.total}.`:'';
      return `Заказ ${id} создан и отправлен главному технику на распределение.${uploadedText}${await attach(id)}`;
    }
    const order=snapshot.orders.find(candidate=>candidate.id===item.orderId&&candidate.clinicId===clinic.id);
    if(!order)throw new Error('Заказ больше не найден');
    if(analysis.intent==='update_order'){
      if(analysis.fields.requestText){
        const request=await enqueueClientRequest(order,{},analysis.fields.requestText);
        return `Просьба по заказу ${order.id} передана главному технику. В CRM сохранён только текст клиента.`;
      }
      const changes=changedFields(order,analysis.fields);
      if(changes.date){
        const deadlineError=telegramDeadlineError(order,analysis.fields.dueDate,new Date());
        if(deadlineError)throw new Error(deadlineError);
      }
      const request=await enqueueClientRequest(order,changes);
      const attachmentResult=await attach(order.id);
      return request.type==='deadline'
        ?`Запрос на изменение срока заказа ${order.id} отправлен главному технику. До одобрения срок останется прежним.${attachmentResult}`
        :`Запрос на изменение заказа ${order.id} отправлен главному технику. До одобрения заказ останется без изменений.${attachmentResult}`;
    }
    if(analysis.intent==='cancel_order'){
      const reason=analysis.fields.reason||analysis.summary||'Отмена по сообщению клиники';
      await enqueueClientRequest(order,{},reason);
      return `Запрос на отмену заказа ${order.id} отправлен главному технику. Заказ пока не отменён.`;
    }
    if(analysis.intent==='accept_order'){
      await replacePortalCollection('orderOverrides',{...snapshot.orderOverrides,[order.id]:{...(snapshot.orderOverrides[order.id]||{}),stage:'Принято доктором',doctorAcceptedAt:new Date().toISOString()}},actor);
      await recordPortalEvent(order.id,actor,'telegram_confirmed',{summary:`Приёмку запросил: ${item.actor}; подтвердил: ${callbackUser||item.actor}`,clinicId:clinic.id,telegramActionId:item.id}).catch(()=>{});
      return `Работа по заказу ${order.id} принята.`;
    }
    if(analysis.intent==='rework_order'){
      await replacePortalCollection('orderOverrides',{...snapshot.orderOverrides,[order.id]:{...(snapshot.orderOverrides[order.id]||{}),stage:'На доработке',reworkReason:analysis.fields.reason,reworkAt:new Date().toISOString()}},actor);
      await recordPortalEvent(order.id,actor,'telegram_confirmed',{summary:`Доработку запросил: ${item.actor}; подтвердил: ${callbackUser||item.actor}`,clinicId:clinic.id,telegramActionId:item.id}).catch(()=>{});
      return `Заказ ${order.id} отправлен на доработку.`;
    }
    throw new Error('Неподдерживаемое действие');
  }

  async function sendOrderPicker(chatId,clinic,mode,intro=''){
    const snapshot=portalSnapshot();
    const all=activeOrdersForClinic(snapshot,clinic.id);
    const orders=(mode==='file'?all.filter(order=>orderCanReceiveFiles(snapshot,order)):all).slice(0,12);
    if(!orders.length){
      if(mode==='file'&&all.length)return send(chatId,'Файлы можно загрузить после того, как главный техник проверит и примет заказ.');
      return send(chatId,'У клиники пока нет действующих заказов.');
    }
    const callback=order=>mode==='file'?`tglarge:${order.id}`:`tgorder:${mode}:${order.id}`;
    const title=intro||({file:'Выберите принятый заказ для загрузки файлов:',edit:'Выберите заказ для изменения:',due:'Выберите заказ. В списке указан текущий срок:',status:'Выберите заказ, чтобы посмотреть статус и срок:',cancel:'Выберите заказ для отмены. В списке указан текущий срок:'})[mode]||'Выберите заказ:';
    return send(chatId,title,{reply_markup:{inline_keyboard:orders.map(order=>[{text:orderPickerLabel(order),callback_data:callback(order)}])}});
  }

  async function handleCallback(callback){
    const [action,id,value]=String(callback.data||'').split(':');
    if(action==='tgquick'){
      const clinic=boundClinicForMessage(callback.message||{});if(!clinic)return answerCallback(callback.id,'Чат не подключён');
      if(['file','status','edit','due','cancel'].includes(id)){
        await answerCallback(callback.id,'Выберите заказ');
        return sendOrderPicker(callback.message.chat.id,clinic,id);
      }
      if(id==='human'){await answerCallback(callback.id,'Позвал человека');return send(callback.message.chat.id,'@CreateDental_io, вас зовут в этот чат.')}
      const prompts={new:'Опишите заказ одним текстовым или голосовым сообщением:\n\n1. Фамилия и имя пациента (обязательно); отчество — по желанию.\n2. Одна или несколько услуг из прайса.\n3. Номера зубов или челюсть — только если это нужно выбранной услуге.\n4. Желаемый срок и цвет либо «не требуется».\n\nТип работы и недостающие параметры бот предложит выбрать кнопками. Дату рождения и комментарий можно добавить позже на экране проверки заказа. Файлы загрузите после подтверждения заказа. Если чего-то не хватит, я сохраню уже названные данные и предложу кнопки.'};
      if(id==='new'){
        rememberGuidedAction(callback.message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:normalizeAnalysis({intent:'create_order',fields:{}}),awaitingInput:'patient',draftUploadKey:'',draftUploadHref:''});
        await saveState();
        await answerCallback(callback.id,'Начинаем с данных пациента');
        return send(callback.message.chat.id,guidedPatientPrompt(),{reply_markup:guidedStartNavigationMarkup()});
      }
      await answerCallback(callback.id,'Готово');
      return send(callback.message.chat.id,prompts[id]||'Опишите, что нужно сделать с заказом.');
    }
    if(action==='tgnew'){
      const message=callback.message||{},clinic=boundClinicForMessage(message);
      if(!clinic)return answerCallback(callback.id,'Чат не подключён');
      const guided=currentGuidedAction(message.chat?.id,callback.from?.id,clinic.id);
      if(!guided||guided.mode!=='new')return answerCallback(callback.id,'Этот выбор устарел. Начните через /new');
      if(id==='cancel'){
        delete state.guided[contextKey(message.chat.id,callback.from?.id)];
        await saveState();
        await answerCallback(callback.id,'Заказ отменён');
        return editMessage(message.chat.id,message.message_id,'Создание заказа отменено. Чтобы начать заново, выберите «Новый заказ» в меню.');
      }
      const analysis=canonicalizeCatalogSelection(normalizeAnalysis(guided.draftAnalysis||{intent:'create_order',fields:{}}));
      if(id==='noop')return answerCallback(callback.id,'Выберите врача');
      if(id==='doctorpage'){
        const picker=doctorPrompt(clinic,analysis.fields.doctorId,Number(value));
        rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,awaitingInput:'doctor',doctorChoices:picker.state.choices,doctorPage:picker.state.page});await saveState();
        await answerCallback(callback.id,'Страница врачей');
        return editMessage(message.chat.id,message.message_id,picker.text,picker.markup);
      }
      if(guided.awaitingInput==='doctor'&&id==='doctor'){
        const index=Number(value),doctorId=guided.doctorChoices?.[index],doctor=selectedClinicDoctor(clinic,doctorId);
        if(!doctor)return answerCallback(callback.id,'Врач больше не доступен. Обновите список.');
        analysis.fields.doctorId=doctor.id;
        await answerCallback(callback.id,`Выбран врач: ${doctor.name}`);
        if(analysis.fields.productionType&&!missingCreateFields(analysis).length){
          rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,awaitingInput:'',readyForConfirmation:true,doctorChoices:[],doctorPage:0});await saveState();
          return editMessage(message.chat.id,message.message_id,`Врач: ${doctorLabel(doctor)}\n\n${guidedReadyPrompt()}`,guidedReadyMarkup());
        }
        rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,awaitingInput:'productionType',doctorChoices:[],doctorPage:0});await saveState();
        return editMessage(message.chat.id,message.message_id,`Врач: ${doctorLabel(doctor)}\n\nВыберите тип работы для заказа:`,productionTypeMarkup());
      }
      if(id==='files'){
        await answerCallback(callback.id,'Этот шаг больше не используется');
        return editMessage(message.chat.id,message.message_id,'Сначала проверьте и подтвердите заказ. После создания заказа бот пришлёт отдельную кнопку для загрузки файлов.',guidedReadyMarkup());
      }
      if(guided.awaitingInput==='patientConfirm'&&id==='patientconfirm'){
        if(value==='edit'){
          analysis.fields.patient='';analysis.patientSurname='';
          rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,awaitingInput:'patient'});
          await saveState();
          await answerCallback(callback.id,'Введите ФИО ещё раз');
          return editMessage(message.chat.id,message.message_id,guidedPatientPrompt(),guidedNavigationMarkup());
        }
        if(value==='yes'){
          const picker=doctorPrompt(clinic,'',0);
          const next=activeClinicDoctors(clinic).length?{draftAnalysis:analysis,awaitingInput:'doctor',doctorChoices:picker.state.choices,doctorPage:picker.state.page}:{draftAnalysis:analysis,awaitingInput:'productionType'};
          rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{...next});
          await saveState();
          await answerCallback(callback.id,'ФИО подтверждено');
          return activeClinicDoctors(clinic).length
            ? editMessage(message.chat.id,message.message_id,picker.text,picker.markup)
            : editMessage(message.chat.id,message.message_id,'Выберите тип работы для заказа:',productionTypeMarkup());
        }
        return answerCallback(callback.id,'Неизвестный выбор');
      }
      if(id==='back'){
        const previous=backGuidedOrder(analysis,guided);
        if(previous.cancel){
          delete state.guided[contextKey(message.chat.id,callback.from?.id)];
          await saveState();
          await answerCallback(callback.id,'Возврат из создания заказа');
          return editMessage(message.chat.id,message.message_id,'Создание заказа остановлено. Выберите действие в меню.',quickMenuMarkup());
        }
        rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:previous.analysis,wizardStep:previous.wizardStep,awaitingInput:previous.awaitingInput,readyForConfirmation:previous.readyForConfirmation});
        await saveState();
        await answerCallback(callback.id,'Возвращаемся назад');
        const replyMarkup=createOrderChoiceMarkup(previous.analysis,previous.wizardStep);
        let backPrompt=createOrderWizardPrompt(previous.analysis,previous.wizardStep),backMarkup=replyMarkup||guidedNavigationMarkup();
        if(previous.awaitingInput==='patient')backPrompt=guidedPatientPrompt(previous.analysis.fields.patient);
        if(previous.awaitingInput==='patientConfirm'){backPrompt=patientConfirmationPrompt(previous.analysis.fields.patient);backMarkup=patientConfirmationMarkup()}
        if(previous.awaitingInput==='doctor'){const picker=doctorPrompt(clinic,'',guided.doctorPage||0);backPrompt=picker.text;backMarkup=picker.markup}
        if(previous.awaitingInput==='productionType'){backPrompt='Выберите тип работы для заказа:';backMarkup=productionTypeMarkup()}
        if(previous.readyForConfirmation&&!previous.awaitingInput){backPrompt=guidedReadyPrompt();backMarkup=guidedReadyMarkup()}
        if(previous.awaitingInput==='patient')backMarkup=guidedNavigationMarkup();
        return editMessage(message.chat.id,message.message_id,backPrompt,backMarkup);
      }
      const catalog=catalogForPrompt();
      let wizardStep=guided.wizardStep||'',callbackText='Выбрано';
      if(id==='addservice'){
        const current=normalizeVariant({work:analysis.fields.work,material:analysis.fields.material,teeth:analysis.fields.teeth,toothMode:analysis.fields.toothMode,jaw:analysis.fields.jaw,dueDate:analysis.fields.dueDate});
        if(current.work||current.material){
          if(!current.work||!current.material)return answerCallback(callback.id,'Сначала выберите текущую услугу');
          if(Number.isFinite(productionDaysForOrder({work:current.work,workOption:current.material}))&&!current.dueDate)return answerCallback(callback.id,'Сначала выберите срок текущей услуги');
          analysis.fields.variants=[...(analysis.fields.variants||[]),current];
        }else if(!(analysis.fields.variants||[]).length)return answerCallback(callback.id,'Сначала выберите услугу');
        analysis.fields.work='';analysis.fields.material='';analysis.fields.teeth=[];analysis.fields.toothMode='';analysis.fields.jaw='';analysis.fields.dueDate='';analysis.fields.addingService=true;wizardStep='';callbackText='Добавляем ещё одну услугу';
        rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep:''});await saveState();
        await answerCallback(callback.id,callbackText);
        return editMessage(message.chat.id,message.message_id,createOrderWizardPrompt(analysis),createOrderChoiceMarkup(analysis));
      }else if(id==='finish'){
        analysis.fields.addingService=false;
        const missing=missingCreateFields(analysis);
        if(missing.length)return answerCallback(callback.id,`Заполните заказ: ${missing[0]}`);
        delete state.guided[contextKey(message.chat.id,callback.from?.id)];await saveState();
        await answerCallback(callback.id,'Проверяю заказ');
        await editMessage(message.chat.id,message.message_id,'Все услуги добавлены. Проверьте заказ ниже.');
        return propose({...message,from:callback.from},clinic,analysis,null,'',true);
      }else if(id==='mode'){
        const modes={single:'Одиночка',bridge:'Мост',jaw:'Челюсть'};
        if(!modes[value])return answerCallback(callback.id,'Неизвестный режим');
        analysis.fields.toothMode=modes[value];analysis.fields.jaw='';
        if(value==='jaw')analysis.fields.teeth=[];
        wizardStep=value==='jaw'?'':'teeth';
      }else if(id==='jaw'){
        if(!['upper','lower','both'].includes(value))return answerCallback(callback.id,'Неизвестная челюсть');
        analysis.fields.toothMode='Челюсть';analysis.fields.jaw=value;analysis.fields.teeth=value==='lower'?[...lowerTeeth]:value==='both'?[...upperTeeth,...lowerTeeth]:[...upperTeeth];wizardStep='';
      }else if(id==='tooth'){
        const tooth=Number(value);
        if(!validTeeth.has(tooth))return answerCallback(callback.id,'Неизвестный номер зуба');
        analysis.fields.teeth=safeTeeth([...analysis.fields.teeth,tooth]);wizardStep='teeth';callbackText=`Зуб ${tooth} выбран`;
      }else if(id==='teeth'){
        if(value==='reset'){analysis.fields.teeth=[];wizardStep='teeth';callbackText='Выбор очищен'}
        else if(value==='done'){
          const minimum=analysis.fields.toothMode==='Мост'?2:1;
          if(analysis.fields.teeth.length<minimum)return answerCallback(callback.id,minimum===2?'Для моста выберите минимум два зуба':'Выберите минимум один зуб');
          wizardStep='';callbackText=`Выбрано зубов: ${analysis.fields.teeth.length}`;
        }else return answerCallback(callback.id,'Неизвестное действие');
      }else if(id==='work'){
        const category=catalog[Number(value)];
        if(!category)return answerCallback(callback.id,'Раздел не найден');
        analysis.fields.work=category.category;analysis.fields.material='';wizardStep='';callbackText='Раздел выбран';
      }else if(id==='service'){
        const [categoryIndex,serviceIndex]=String(value||'').split('-').map(Number),category=catalog[categoryIndex],service=category?.services?.[serviceIndex];
        if(!category||!service)return answerCallback(callback.id,'Услуга не найдена');
        analysis.fields.work=category.category;analysis.fields.material=service.name;analysis.fields.addingService=false;wizardStep='';callbackText='Услуга выбрана';
      }else if(id==='due'){
        if(value==='standard'){
          analysis.fields.dueDate=currentServiceDueDate(analysis,new Date());wizardStep='';callbackText='Стандартный срок услуги выбран'
        }
        else if(['before','after'].includes(value)){
          const candidate=guided.dateSuggestions?.[value];
          if(!candidate)return answerCallback(callback.id,'Эта дата больше недоступна');
          const deadlineError=telegramDeadlineError(currentServiceOrder(analysis),candidate,new Date());
          if(deadlineError)return answerCallback(callback.id,deadlineError);
          analysis.fields.dueDate=candidate;wizardStep='';callbackText=`Выбрана дата ${displayDate(candidate)}`;
        }
        else if(value==='custom'){
          rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep:'',awaitingInput:'due'});await saveState();
          await answerCallback(callback.id,'Жду дату');
          return editMessage(message.chat.id,message.message_id,guidedDuePrompt(analysis),guidedNavigationMarkup());
        }else return answerCallback(callback.id,'Неизвестный срок');
      }else if(id==='shade'){
        if(value==='custom'){
          rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep:'',awaitingInput:'shade'});await saveState();
          await answerCallback(callback.id,'Жду оттенок');
          return editMessage(message.chat.id,message.message_id,'Напишите нужный оттенок текстом.\n\nНапример: «OM2».',guidedNavigationMarkup());
        }
        analysis.fields.shade=value==='none'?'Не требуется':cleanText(value,40);wizardStep='';callbackText='Цвет выбран';
      }else if(id==='type'){
        if(!['digital','analog'].includes(value))return answerCallback(callback.id,'Неизвестный тип работы');
        analysis.fields.productionType=value;wizardStep='';callbackText=value==='analog'?'Выбран аналоговый тип':'Выбран цифровой тип';
      }else return answerCallback(callback.id,'Неизвестное действие');

      const missing=missingCreateFields(analysis);
      if(!wizardStep&&missing.some(field=>field==='номер зуба или номера зубов'||field==='минимум два номера зубов для моста'))wizardStep='teeth';
      await answerCallback(callback.id,callbackText);
      if(missing.length||wizardStep){
        rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep});await saveState();
        const replyMarkup=createOrderChoiceMarkup(analysis,wizardStep);
        return editMessage(message.chat.id,message.message_id,createOrderWizardPrompt(analysis,wizardStep),replyMarkup);
      }
      const activeDoctors=activeClinicDoctors(clinic),selectedDoctor=selectedClinicDoctor(clinic,analysis.fields.doctorId);
      if(activeDoctors.length&&!selectedDoctor){
        const picker=doctorPrompt(clinic,'',0);
        rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,awaitingInput:'doctor',doctorChoices:picker.state.choices,doctorPage:picker.state.page});await saveState();
        return editMessage(message.chat.id,message.message_id,picker.text,picker.markup);
      }
      if(!analysis.fields.productionType){
        rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep:''});await saveState();
        await answerCallback(callback.id,callbackText);
        return editMessage(message.chat.id,message.message_id,createOrderWizardPrompt(analysis),createOrderChoiceMarkup(analysis));
      }
      rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep:'',awaitingInput:'',readyForConfirmation:true});await saveState();
      await answerCallback(callback.id,callbackText);
      return editMessage(message.chat.id,message.message_id,guidedReadyPrompt(),guidedReadyMarkup());
    }
    if(action==='tgorder'&&id&&value){
      const clinic=boundClinicForMessage(callback.message||{});if(!clinic)return answerCallback(callback.id,'Чат не подключён');
      const snapshot=portalSnapshot(),order=activeOrdersForClinic(snapshot,clinic.id).find(item=>item.id===value);
      if(!order)return answerCallback(callback.id,'Заказ не найден');
      rememberContext(callback.message.chat.id,callback.from?.id,clinic.id,order.id);
      if(id==='status'){
        await saveState();await answerCallback(callback.id,'Статус готов');
        const stage=orderStage(snapshot,order),details=snapshot.orderOverrides[order.id]||{},cadPending=stage==='Согласование CAD'&&details.cadReview?.status==='pending',previewUrl=cadPending?createCadPreviewLink({...order,cadReview:details.cadReview}):'';
        const extra=cadPending?{reply_markup:{inline_keyboard:[...(previewUrl?[[{text:'Открыть CAD',url:previewUrl}]]:[]),[{text:'✅ Принять заказ',callback_data:`tgcad:approve:${order.id}`}],[{text:'↩️ Вернуть заказ',callback_data:`tgcad:return:${order.id}`}]]}}:{};
        return send(callback.message.chat.id,`Заказ ${order.id}\nПациент: ${order.patient}${orderDoctorText(order)}\nРабота: ${orderWorkLabel(order)}\nСрок: ${order.date}\nСтатус: ${stage}${cadPending?'\n\nОжидает решения врача по CAD.':''}`,extra);
      }
      if(id==='edit'){
        rememberGuidedAction(callback.message.chat.id,callback.from?.id,clinic.id,order.id,'editRequest');await saveState();
        await answerCallback(callback.id,'Жду описание изменения');
        return send(callback.message.chat.id,`Что изменить в заказе ${order.id}? Опишите это одним сообщением текстом или голосом.\n\nНапример: «Поменять цвет на A2 и срок на 30 октября».`,{reply_markup:{inline_keyboard:[[{text:'◀️ Назад',callback_data:`tgorder:status:${order.id}`}]]}});
      }
      if(!['due','cancel'].includes(id))return answerCallback(callback.id,'Действие недоступно');
      rememberGuidedAction(callback.message.chat.id,callback.from?.id,clinic.id,order.id,id);await saveState();await answerCallback(callback.id,'Заказ выбран');
      return send(callback.message.chat.id,id==='due'?`Заказ ${order.id}\nТекущий срок: ${order.date}\n\nОтправьте новую дату текстом или голосовым сообщением. Обязательно укажите день и месяц, например: «10 ноября».`:`Заказ ${order.id}\nПациент: ${order.patient}\nСрок: ${order.date}\n\nОтправьте причину отмены текстом или голосовым сообщением.`);
    }
    if(action==='tglarge'&&id){
      const clinic=boundClinicForMessage(callback.message||{});if(!clinic)return answerCallback(callback.id,'Чат не подключён');
      const snapshot=portalSnapshot(),order=activeOrdersForClinic(snapshot,clinic.id).find(item=>item.id===id);
      if(!order)return answerCallback(callback.id,'Заказ не найден');
      if(!orderCanReceiveFiles(snapshot,order))return answerCallback(callback.id,'Заказ ещё не принят');
      try{
        const href=await createLargeUploadLink(clinic.id,order.id,actorName({from:callback.from}));
        await answerCallback(callback.id,'Ссылка готова');
        return send(callback.message.chat.id,`Загрузите до 10 файлов к заказу ${order.id}. Каждый файл — до 200 МБ. Ссылка действует 2 часа и используется один раз.\n\nЕсли страница не открывается внутри Telegram при включённом VPN, скопируйте ссылку и откройте её во внешнем браузере. Если VPN блокирует createdental.io, временно отключите его для загрузки.\n\n${href}`,{reply_markup:{inline_keyboard:[[{text:'📎 Открыть страницу загрузки',url:href}]]}});
      }catch(error){await answerCallback(callback.id,'Загрузка пока недоступна');return send(callback.message.chat.id,cleanText(error.message,400))}
    }
    if(action==='tgcad'&&id&&value){
      if(!['approve','return'].includes(id))return answerCallback(callback.id,'Действие недоступно');
      const message=callback.message||{},clinic=boundClinicForMessage(message);
      if(!clinic)return answerCallback(callback.id,'Чат не подключён');
      const snapshot=portalSnapshot(),order=snapshot.orders.find(item=>item.id===value&&item.clinicId===clinic.id);
      if(!order)return answerCallback(callback.id,'Заказ не найден');
      const details=snapshot.orderOverrides[order.id]||{};
      if(details.stage!=='Согласование CAD'||details.cadReview?.status!=='pending')return answerCallback(callback.id,'CAD уже рассмотрен или не отправлен на согласование');
      const reviewer=actorName({from:callback.from})||clinic.name||'Врач',approved=id==='approve',now=new Date().toISOString();
      const comment=approved?'':'Возврат из Telegram: требуется доработка CAD.';
      const review={...details.cadReview,status:approved?'approved':'returned',reviewedAt:now,reviewedBy:reviewer,comment};
      const next={...snapshot.orderOverrides,[order.id]:{...details,...cadDecisionChange(details,approved,review)}};
      try{
        await replacePortalCollection('orderOverrides',next,{role:'clinic',name:reviewer});
        await recordPortalEvent(order.id,{role:'clinic',name:reviewer},approved?'cad_review_approved':'cad_review_returned',{clinicId:order.clinicId,summary:approved?'CAD подтверждён врачом в Telegram':'CAD возвращён моделировщику из Telegram',comment}).catch(()=>{});
        await answerCallback(callback.id,approved?'Заказ принят':'Заказ возвращён');
        return editMessage(message.chat.id,message.message_id,approved?`✅ CAD по заказу ${order.id} принят. Заказ передан в изготовление.`:`↩️ CAD по заказу ${order.id} возвращён моделировщику.`,{inline_keyboard:[]});
      }catch(error){
        console.error('Telegram CAD decision failed:',error.message);
        return answerCallback(callback.id,'Не удалось сохранить решение');
      }
    }
    if(['tgoldedit','tgoldvariant'].includes(action)&&id&&value){
      const clinic=boundClinicForMessage(callback.message||{});if(!clinic)return answerCallback(callback.id,'Чат не подключён');
      const [requestedOrder,rawPosition]=String(value).split('|');
      const order=activeOrdersForClinic(portalSnapshot(),clinic.id).find(item=>item.id===requestedOrder);if(!order)return answerCallback(callback.id,'Заказ не найден');
      const variantIndex=action==='tgoldvariant'?Number(rawPosition):undefined;
      if(['mode','teeth','service'].includes(id)&&(order.variants?.length||0)>1&&variantIndex===undefined){
        await answerCallback(callback.id,'Выберите услугу');
        return send(callback.message.chat.id,'Какую позицию заказа нужно изменить?',{reply_markup:{inline_keyboard:order.variants.map((variant,index)=>[{text:`${index+1}. ${variant.workOption||variant.work}`,callback_data:`tgoldvariant:${id}:${order.id}|${index}`}])}});
      }
      if(variantIndex!==undefined&&(!Number.isInteger(variantIndex)||!order.variants?.[variantIndex]))return answerCallback(callback.id,'Позиция не найдена');
      const positionState={variantIndex,baseOrderRevision:order._revision||0},target=order.variants?.[variantIndex]||{selectedTeeth:order.teeth};
      const prompts={patient:'Напишите новое ФИО пациента.',birth:'Напишите новую дату рождения пациента.',due:'Напишите новый срок с днём и месяцем.',comment:'Напишите комментарий к заказу.'};
      if(id==='mode'){
        rememberGuidedAction(callback.message.chat.id,callback.from?.id,clinic.id,order.id,'edit',{...positionState,field:'mode',editTeeth:[]});await saveState();await answerCallback(callback.id,'Выберите режим');
        return send(callback.message.chat.id,'Выберите новый режим работы:',{reply_markup:editModeMarkup(order.id)});
      }
      if(id==='teeth'){
        const selected=safeTeeth(target.selectedTeeth||[]);
        rememberGuidedAction(callback.message.chat.id,callback.from?.id,clinic.id,order.id,'edit',{...positionState,field:'teeth',editMode:target.toothMode==='Мост'?'bridge':'',editTeeth:selected});await saveState();await answerCallback(callback.id,'Выберите зубы');
        return send(callback.message.chat.id,`Выберите зубы. Уже выбраны: ${selected.length?selected.join(', '):'нет'}.`,{reply_markup:editTeethMarkup(order.id,selected)});
      }
      if(id==='service'){
        rememberGuidedAction(callback.message.chat.id,callback.from?.id,clinic.id,order.id,'edit',{...positionState,field:'service',editServiceCategory:''});await saveState();await answerCallback(callback.id,'Выберите раздел');
        return send(callback.message.chat.id,'Выберите раздел новой услуги:',{reply_markup:editServiceCategoryMarkup(order.id)});
      }
      if(id==='shade'){
        rememberGuidedAction(callback.message.chat.id,callback.from?.id,clinic.id,order.id,'edit',{...positionState,field:'shade'});await saveState();await answerCallback(callback.id,'Выберите цвет');
        return send(callback.message.chat.id,'Выберите новый цвет:',{reply_markup:editShadeMarkup(order.id)});
      }
      if(!prompts[id])return answerCallback(callback.id,'Пункт не найден');
      rememberGuidedAction(callback.message.chat.id,callback.from?.id,clinic.id,order.id,'edit',{...positionState,field:id});await saveState();await answerCallback(callback.id,'Жду новое значение');
      return send(callback.message.chat.id,prompts[id],{reply_markup:{inline_keyboard:editChoiceBack(order.id)}});
    }
    if(action==='tgoldchoice'&&id&&value){
      const message=callback.message||{},clinic=boundClinicForMessage(message);if(!clinic)return answerCallback(callback.id,'Чат не подключён');
      const snapshot=portalSnapshot(),order=activeOrdersForClinic(snapshot,clinic.id).find(item=>item.id===id);if(!order)return answerCallback(callback.id,'Заказ не найден');
      const guided=currentGuidedAction(message.chat?.id,callback.from?.id,clinic.id);
      if(!guided||guided.mode!=='edit'||guided.orderId!==order.id)return answerCallback(callback.id,'Этот выбор устарел. Откройте редактирование заказа ещё раз.');
      const [field,choice]=String(value).split('|');
      const editState={...guided};
      const applyEdit=async(fields,summary)=>{
        const actionId=randomBytes(10).toString('hex');
        const item={id:actionId,chatId:String(message.chat.id),clinicId:clinic.id,userId:String(callback.from?.id||''),actor:actorName({from:callback.from}),analysis:normalizeAnalysis({intent:'update_order',orderId:order.id,fields,summary}),orderId:order.id,variantIndex:guided.variantIndex,baseOrderRevision:guided.baseOrderRevision,attachments:[],createdAt:new Date().toISOString(),expiresAt:Date.now()+24*60*60*1000};
        delete state.guided[contextKey(message.chat.id,callback.from?.id)];
        try{
          const result=await executePending(item,{from:callback.from});
          state.completed[actionId]={at:new Date().toISOString(),result};await saveState();
          await answerCallback(callback.id,'Изменение отправлено');
          return send(message.chat.id,`${result}\nЗапросил изменение: ${actorName({from:callback.from})}`);
        }catch(error){
          if(await promptEditPosition(error,item))return;
          await saveState().catch(()=>{});await answerCallback(callback.id,'Не удалось сохранить изменение');
          return send(message.chat.id,`Не удалось изменить заказ: ${cleanText(error.message,500)}`);
        }
      };
      if(field==='mode'&&['single','bridge','jaw'].includes(choice)){
        editState.editMode=choice;editState.editTeeth=[];
        if(choice==='jaw'){
          rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,order.id,'edit',{field:'mode',editMode:choice,editTeeth:[]});await saveState();await answerCallback(callback.id,'Выберите челюсть');
          return send(message.chat.id,'Выберите челюсть:',{reply_markup:editJawMarkup(order.id)});
        }
        rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,order.id,'edit',{field:'mode',editMode:choice,editTeeth:[]});await saveState();await answerCallback(callback.id,'Выберите зубы');
        return send(message.chat.id,`Выберите зубы для режима «${choice==='single'?'Одиночка':'Мост'}». После выбора нажмите «Готово».`,{reply_markup:editTeethMarkup(order.id,[])});
      }
      if(field==='jaw'&&['upper','lower','both'].includes(choice)){
        const teeth=choice==='upper'?[...upperTeeth]:choice==='lower'?[...lowerTeeth]:[...upperTeeth,...lowerTeeth];
        return applyEdit({toothMode:'Челюсть',jaw:choice,teeth},`Новый режим и челюсть заказа ${order.id}`);
      }
      if(field==='teeth'){
        const selected=safeTeeth(editState.editTeeth||[]);
        if(choice==='reset'){
          rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,order.id,'edit',{field:editState.field||'teeth',editMode:editState.editMode||'',editTeeth:[]});await saveState();await answerCallback(callback.id,'Выбор очищен');
          return editMessage(message.chat.id,message.message_id,'Выберите зубы. Пока ничего не выбрано.',editTeethMarkup(order.id,[]));
        }
        if(choice==='done'){
          const minimum=editState.editMode==='bridge'?2:1;
          if(selected.length<minimum)return answerCallback(callback.id,minimum===2?'Для моста выберите минимум два зуба.':'Выберите минимум один зуб.');
          const fields=editState.field==='mode'?{toothMode:editState.editMode==='bridge'?'Мост':'Одиночка',jaw:'',teeth:selected}:{teeth:selected};
          return applyEdit(fields,`Изменение зубов заказа ${order.id}`);
        }
        const next=safeTeeth([...selected,Number(choice)]);
        if(!validTeeth.has(Number(choice)))return answerCallback(callback.id,'Неизвестный номер зуба');
        rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,order.id,'edit',{field:editState.field||'teeth',editMode:editState.editMode||'',editTeeth:next});await saveState();await answerCallback(callback.id,`Зуб ${choice} выбран`);
        return editMessage(message.chat.id,message.message_id,`Выберите зубы. Выбраны: ${next.join(', ')}. После выбора нажмите «Готово».`,editTeethMarkup(order.id,next));
      }
      if(field==='shade'&&(vitaShadeOptions.includes(choice)||choice==='none'))return applyEdit({shade:choice==='none'?'Не требуется':choice},`Новый цвет заказа ${order.id}`);
      if(field==='shade'&&choice==='custom'){
        rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,order.id,'edit',{field:'shade'});await saveState();await answerCallback(callback.id,'Жду оттенок');
        return send(message.chat.id,'Напишите нужный оттенок текстом.',{reply_markup:{inline_keyboard:editChoiceBack(order.id)}});
      }
      if(field==='servicecat'){
        const index=Number(choice),category=catalogForPrompt()[index];if(!category)return answerCallback(callback.id,'Раздел не найден');
        rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,order.id,'edit',{field:'service',editServiceCategory:index});await saveState();await answerCallback(callback.id,'Выберите услугу');
        return editMessage(message.chat.id,message.message_id,`Выберите услугу из раздела «${category.category}»:`,editServiceMarkup(order.id,index));
      }
      if(field==='servicesel'){
        const [categoryIndex,serviceIndex]=String(choice).split('-').map(Number),service=catalogForPrompt()[categoryIndex]?.services?.[serviceIndex];
        if(!service)return answerCallback(callback.id,'Услуга не найдена');
        return applyEdit({work:catalogForPrompt()[categoryIndex].category,material:service.name},`Новая услуга заказа ${order.id}`);
      }
      return answerCallback(callback.id,'Неизвестный выбор');
    }
    if(!['tgvariant','tgconfirm','tgreject','tgedit','tgeditfield','tgeditservice','tgeditvariantdue','tgaddservice','tgcartadd','tgcartconfirm','tgpick','tgreselect','tgextra','tgextraback','tgdoctorchange'].includes(action)||!id)return;
    const item=state.pending[id];
    if(!item&&state.completed[id])return answerCallback(callback.id,'Это действие уже выполнено');
    if(!item||item.expiresAt<Date.now()){if(item){delete state.pending[id];await saveState()}return answerCallback(callback.id,'Подтверждение устарело');}
    if(String(callback.message?.chat?.id)!==item.chatId)return answerCallback(callback.id,'Это подтверждение относится к другому чату');
    if(!canConfirm(item,callback))return answerCallback(callback.id,'Подтвердить может автор запроса или команда Create Dental');
    if(action==='tgvariant'){
      const order=portalSnapshot().orders.find(order=>order.id===item.orderId&&order.clinicId===item.clinicId),position=Number(value);
      if(!order||!Number.isInteger(position)||!order.variants?.[position])return answerCallback(callback.id,'Позиция не найдена');
      if(item.baseOrderRevision!==(order._revision||0))return answerCallback(callback.id,'Заказ изменился. Создайте правку заново.');
      item.variantIndex=position;await saveState();
    }
    if(action==='tgdoctorchange'){
      if(item.analysis.intent!=='create_order')return answerCallback(callback.id,'Врач указывается только при создании заказа');
      const analysis=normalizeAnalysis(item.analysis),picker=doctorPrompt(portalClient(item.clinicId),analysis.fields.doctorId,0);
      rememberGuidedAction(item.chatId,item.userId,item.clinicId,'','new',{draftAnalysis:analysis,awaitingInput:'doctor',doctorChoices:picker.state.choices,doctorPage:picker.state.page,attachments:attachmentList(item),draftUploadKey:item.draftUploadKey||'',draftUploadHref:item.draftUploadHref||''});
      delete state.pending[id];await saveState();await answerCallback(callback.id,'Выберите врача');
      return send(item.chatId,picker.text,{reply_markup:picker.markup});
    }
    if(action==='tgpick'){
      if(!item.allowedOrderIds?.includes(value))return answerCallback(callback.id,'Заказ недоступен');
      const snapshot=portalSnapshot(),order=snapshot.orders.find(candidate=>candidate.id===value&&candidate.clinicId===item.clinicId);
      if(!order)return answerCallback(callback.id,'Заказ больше не найден');
      item.orderId=order.id;item.allowedOrderIds=[];rememberContext(item.chatId,item.userId,item.clinicId,order.id);await saveState();await answerCallback(callback.id,'Заказ выбран');
      if(item.analysis.intent==='status_request'){delete state.pending[id];await saveState();return send(item.chatId,`Заказ ${order.id}\nПациент: ${order.patient}${orderDoctorText(order)}\nРабота: ${orderWorkLabel(order)}\nСрок: ${order.date}\nСтатус: ${orderStage(snapshot,order)}`)}
      return sendConfirmation(item,order,portalClient(item.clinicId));
    }
    if(action==='tgreselect'){
      const orders=activeOrdersForClinic(portalSnapshot(),item.clinicId).slice(0,12);
      item.allowedOrderIds=orders.map(order=>order.id);await saveState();
      const buttons=orders.map(order=>[{text:orderPickerLabel(order),callback_data:`tgpick:${id}:${order.id}`}]);buttons.push([{text:'❌ Отменить',callback_data:`tgreject:${id}`}]);
      await answerCallback(callback.id,'Выберите заказ');return send(item.chatId,'Выберите заказ:',{reply_markup:{inline_keyboard:buttons}});
    }
    if(action==='tgaddservice'||action==='tgcartadd'){
      if(item.analysis.intent!=='create_order')return answerCallback(callback.id,'Услугу можно добавить только при создании заказа');
      const analysis=normalizeAnalysis(item.analysis);
      analysis.fields.variants=analysisVariants(analysis);
      analysis.fields.work='';analysis.fields.material='';analysis.fields.teeth=[];analysis.fields.toothMode='';analysis.fields.jaw='';analysis.fields.dueDate='';analysis.fields.addingService=true;
      rememberGuidedAction(item.chatId,item.userId,item.clinicId,'','new',{draftAnalysis:analysis,wizardStep:''});
      delete state.pending[id];await saveState();await answerCallback(callback.id,'Добавляем услугу');
      return send(item.chatId,'Выберите раздел для новой услуги:',{reply_markup:createOrderChoiceMarkup(analysis)||guidedNavigationMarkup()});
    }
    if(action==='tgextra'){
      if(item.analysis.intent!=='create_order')return answerCallback(callback.id,'Дополнительные данные доступны только при создании заказа');
      const fields=item.analysis.fields||{},rows=[];
      rows.push([{text:fields.birthDate?'🎂 Изменить дату рождения':'🎂 Добавить дату рождения',callback_data:`tgeditfield:${id}:birth`}]);
      rows.push([{text:fields.comment?'💬 Изменить комментарий':'💬 Добавить комментарий',callback_data:`tgeditfield:${id}:comment`}]);
      rows.push([{text:'↩️ Вернуться к проверке',callback_data:`tgextraback:${id}`}]);
      await answerCallback(callback.id,'Дополнительные данные');
      return send(item.chatId,'Выберите, что добавить к заказу. Оба пункта необязательны:',{reply_markup:{inline_keyboard:rows}});
    }
    if(action==='tgextraback'){
      await answerCallback(callback.id,'Возвращаемся к проверке');
      return sendConfirmation(item,null,portalClient(item.clinicId));
    }
    if(action==='tgedit'){
      if(item.analysis.intent!=='create_order')return answerCallback(callback.id,'Редактирование доступно только при создании заказа');
      await answerCallback(callback.id,'Выберите пункт');
      const variants=analysisVariants(item.analysis);
      const serviceButtons=variants.length>1
        ?variants.map((variant,index)=>[
          {text:`🧾 Услуга ${index+1}: ${variant.material||variant.work}`.slice(0,48),callback_data:`tgeditservice:${id}:${index}`},
          {text:`📅 Срок ${index+1}`,callback_data:`tgeditvariantdue:${id}:${index}`}
        ])
        :[[{text:'🧾 Услуга',callback_data:`tgeditfield:${id}:service`}]];
      return send(item.chatId,'Что изменить?',{reply_markup:{inline_keyboard:[
        [{text:'👤 Пациент',callback_data:`tgeditfield:${id}:patient`},{text:'🎂 Дата рождения',callback_data:`tgeditfield:${id}:birth`}],
        [{text:'🦷 Режим / челюсть',callback_data:`tgeditfield:${id}:mode`},{text:'🔢 Зубы',callback_data:`tgeditfield:${id}:teeth`}],
        ...serviceButtons.map(row=>row),
        [{text:'🎨 Цвет',callback_data:`tgeditfield:${id}:shade`}],
        ...(variants.length>1?[]:[[ {text:'📅 Срок',callback_data:`tgeditfield:${id}:due` } ]]),
        [{text:'💬 Комментарий',callback_data:`tgeditfield:${id}:comment`}]
      ]}});
    }
    if(action==='tgeditvariantdue'){
      if(item.analysis.intent!=='create_order')return answerCallback(callback.id,'Этот заказ уже создан');
      const index=Number(value),variants=analysisVariants(item.analysis),selected=Number.isInteger(index)?variants[index]:null;
      if(!selected)return answerCallback(callback.id,'Услуга не найдена');
      const analysis=normalizeAnalysis(item.analysis);
      const variantAnalysis=normalizeAnalysis({intent:'create_order',fields:{work:selected.work,material:selected.material}});
      rememberGuidedAction(item.chatId,item.userId,item.clinicId,'','new',{draftAnalysis:analysis,awaitingInput:'variantDue',editingVariantIndex:index});
      delete state.pending[id];await saveState();
      await answerCallback(callback.id,'Жду новый срок');
      return send(item.chatId,`Укажите срок для услуги ${index+1}: «${selected.material||selected.work}».\n\n${guidedDuePrompt(variantAnalysis)}`,{reply_markup:guidedNavigationMarkup()});
    }
    if(action==='tgeditservice'){
      if(item.analysis.intent!=='create_order')return answerCallback(callback.id,'Этот заказ уже создан');
      const index=Number(value),variants=analysisVariants(item.analysis),selected=Number.isInteger(index)?variants[index]:null;
      if(!selected)return answerCallback(callback.id,'Услуга не найдена');
      const analysis=normalizeAnalysis(item.analysis);
      analysis.fields.variants=variants.filter((_,variantIndex)=>variantIndex!==index);
      analysis.fields.work='';analysis.fields.material='';analysis.fields.teeth=[];analysis.fields.toothMode='';analysis.fields.jaw='';analysis.fields.dueDate='';analysis.fields.addingService=true;
      rememberGuidedAction(item.chatId,item.userId,item.clinicId,'','new',{draftAnalysis:analysis,wizardStep:''});delete state.pending[id];await saveState();
      await answerCallback(callback.id,'Выберите замену услуги');
      return send(item.chatId,'Выберите новую услугу для этой позиции:',{reply_markup:createOrderChoiceMarkup(analysis)});
    }
    if(action==='tgeditfield'){
      if(item.analysis.intent!=='create_order')return answerCallback(callback.id,'Этот заказ уже создан');
      const analysis=normalizeAnalysis(item.analysis),field=value;
      let awaitingInput='',wizardStep='',prompt='';
      if(field==='patient'){analysis.fields.patient='';awaitingInput='patient';prompt='Напишите фамилию и имя пациента. Отчество — по желанию.'}
      else if(field==='birth'){analysis.fields.birthDate='';awaitingInput='birth';prompt='Напишите дату рождения пациента, например: «12 марта 1987».'}
      else if(field==='mode'){analysis.fields.toothMode='';analysis.fields.jaw='';analysis.fields.teeth=[];prompt=createOrderWizardPrompt(analysis)}
      else if(field==='teeth'){analysis.fields.teeth=[];wizardStep='teeth';prompt=createOrderWizardPrompt(analysis,wizardStep)}
      else if(field==='service'){analysis.fields.work='';analysis.fields.material='';analysis.fields.dueDate='';prompt=createOrderWizardPrompt(analysis)}
      else if(field==='shade'){analysis.fields.shade='';prompt=createOrderWizardPrompt(analysis)}
      else if(field==='due'){analysis.fields.dueDate='';prompt=createOrderWizardPrompt(analysis)}
      else if(field==='comment'){analysis.fields.comment='';awaitingInput='comment';prompt='Напишите новый комментарий к заказу.'}
      else return answerCallback(callback.id,'Пункт не найден');
      rememberGuidedAction(item.chatId,item.userId,item.clinicId,'','new',{draftAnalysis:analysis,wizardStep,awaitingInput});delete state.pending[id];await saveState();await answerCallback(callback.id,'Редактируем');
      return send(item.chatId,prompt,{reply_markup:createOrderChoiceMarkup(analysis,wizardStep)||undefined});
    }
    if(action==='tgcartconfirm'){
      if(item.analysis.intent!=='create_order')return answerCallback(callback.id,'Корзина недоступна');
      const cartKey=contextKey(item.chatId,item.userId),items=[...(state.carts[cartKey]||[]),item];await answerCallback(callback.id,'Оформляю корзину');
        const results=[];try{
        for(const draft of items)results.push(await executePending(draft,callback));
        delete state.carts[cartKey];delete state.pending[id];await saveState();
        const uploadRows=[];
        for(const [index,draft] of items.entries()){
          if(!draft.targetOrderId||/Прикреплено файлов/.test(results[index]||''))continue;
          try{
            const href=await createLargeUploadLink(draft.clinicId,draft.targetOrderId,actorName({from:callback.from}));
            uploadRows.push([{text:`📎 Загрузить файлы · ${draft.targetOrderId}`,...(href?{url:href}:{callback_data:`tglarge:${draft.targetOrderId}`})}]);
          }catch(error){console.error('Telegram immediate upload link failed:',error.message);uploadRows.push([{text:`📎 Загрузить файлы · ${draft.targetOrderId}`,callback_data:`tglarge:${draft.targetOrderId}`}]);}
        }
        const uploadHint=uploadRows.length?'\n\nПосле проверки каждого заказа можно отдельно загрузить файлы пациента: одна ссылка — один заказ.':'';
        return send(item.chatId,`Корзина оформлена. Заказов создано: ${results.length}.\n\n${results.join('\n')}${uploadHint}`,uploadRows.length?{reply_markup:{inline_keyboard:uploadRows}}:{});
      }catch(error){return send(item.chatId,`Не удалось полностью оформить корзину: ${cleanText(error.message,500)}. Проверьте созданные заказы в CRM.`)}
    }
    if(action==='tgreject'){
      delete state.pending[id];await saveState();await answerCallback(callback.id,'Отменено');return send(item.chatId,'Действие отменено. Данные CRM не изменены.');
    }
    await answerCallback(callback.id,'Выполняю');
    try{
      const result=await executePending(item,callback);rememberContext(item.chatId,item.userId,item.clinicId,item.orderId||item.targetOrderId);state.completed[id]={at:new Date().toISOString(),result};delete state.pending[id];for(const [key,done] of Object.entries(state.completed))if(Date.parse(done.at)<Date.now()-30*24*60*60*1000)delete state.completed[key];await saveState();
      const filesAttached=item.analysis.intent==='create_order'&&/Прикреплено файлов/.test(result);
      let uploadMarkup={},uploadHint='';
      if(item.analysis.intent==='create_order'&&item.targetOrderId&&!filesAttached){
        try{
          const href=await createLargeUploadLink(item.clinicId,item.targetOrderId,actorName({from:callback.from}));
          const button=href?{text:'📎 Загрузить файлы',url:href}:{text:'📎 Загрузить файлы',callback_data:`tglarge:${item.targetOrderId}`};
          uploadMarkup={reply_markup:{inline_keyboard:[[button]]}};
          uploadHint='\n\nФайлы можно загрузить сейчас:';
        }catch(error){
          console.error('Telegram immediate upload link failed:',error.message);
          uploadHint='\n\nФайлы можно загрузить позже через меню.';
        }
      }
      await send(item.chatId,`${result}${uploadHint}\n${['update_order','cancel_order'].includes(item.analysis.intent)?'Запрос отправил':'Подтвердил'}: ${actorName({from:callback.from})}`,uploadMarkup);
    }catch(error){
      if(await promptEditPosition(error,item))return;
      const reason=cleanText(error.message,700);
      if(item.analysis.intent==='create_order'&&/действующего врача|Выберите врача/i.test(reason)){
        const analysis=normalizeAnalysis(item.analysis),picker=doctorPrompt(portalClient(item.clinicId),analysis.fields.doctorId,0);
        rememberGuidedAction(item.chatId,item.userId,item.clinicId,'','new',{draftAnalysis:analysis,awaitingInput:'doctor',doctorChoices:picker.state.choices,doctorPage:picker.state.page,attachments:attachmentList(item),draftUploadKey:item.draftUploadKey||'',draftUploadHref:item.draftUploadHref||''});
        delete state.pending[item.id];await saveState();
        return send(item.chatId,`Перед созданием заказа нужно выбрать врача.\n\n${picker.text}`,{reply_markup:picker.markup});
      }
      if(item.analysis.intent==='create_order'&&/(Эту дату выбрать нельзя|Укажите корректную дату|Укажите срок)/.test(reason)){
        return send(item.chatId,`Заказ не создан: ${reason}\n\nИсправьте срок нужной услуги и подтвердите заказ ещё раз.`,{reply_markup:{inline_keyboard:[[{text:'✏️ Исправить сроки',callback_data:`tgedit:${item.id}`}],[{text:'❌ Отменить',callback_data:`tgreject:${item.id}`}]]}});
      }
      await send(item.chatId,`Не удалось выполнить действие: ${reason}. Данные CRM не изменены.`)
    }
  }

  async function sendMenu(chatId){
    return send(chatId,'Что нужно сделать?',{reply_markup:quickMenuMarkup()});
  }

  async function handleMessage(message){
    if(!message)return;
    if(messageAddsBot(message,botIdentity))await sendPinnedWelcome(message.chat.id);
    if(message.from?.is_bot)return;
    const text=cleanText(message.text||message.caption,6000);
    const command=(text.split(/\s+/)[0]||'').toLowerCase().split('@')[0];
    let clinic=boundClinicForMessage(message);
    if(!clinic){
      const requested=requestedClinicForMessage(message);
      if(requested)await requestBinding(message,requested);
      else if(['/start','/connect','/help'].includes(command))await send(message.chat.id,'Добавьте временный код клиники вида CD-CL-12345678 в название группового чата и отправьте /connect. Главный техник подтвердит подключение в CRM.',{},false);
      return;
    }
    const supportMessage=isSupportUsername(message.from?.username);
    const directMedia=telegramMedia(message);
    if(directMedia){
      const messageRole=supportMessage?'support':'client';
      const senderLabel=messageRole==='support'?supportLabel(message.from.username):'';
      const mediaText=directMedia.kind==='photo'?(text||'Фото'):[text,`Документ: ${directMedia.name}`].filter(Boolean).join('\n');
      let storedAttachment=null;
      if(directMedia.kind==='photo'){
        try{storedAttachment=await saveTelegramPhoto(clinic.id,directMedia,message)}
        catch(error){console.error('Telegram photo storage failed:',error.message)}
      }else if(directMedia.kind==='document'){
        try{
          const data=await downloadTelegramFile(directMedia.fileId,20*1024*1024);
          storedAttachment=await saveTelegramAttachment(clinic.id,{name:directMedia.name,type:directMedia.type,data,kind:'document',orderEligible:true,sender:actorName(message)});
        }catch(error){console.error('Telegram document storage failed:',error.message)}
      }
      await onClinicMessage(clinic.id,{text:mediaText,attachment:storedAttachment,sender:actorName(message),senderUsername:message.from?.username||'',senderLabel,telegramMessageId:message.message_id,telegramChatId:String(message.chat.id),messageRole}).catch(()=>{});
      if(storedAttachment?.orderEligible){
        const pending=Object.values(state.pending).filter(item=>item.chatId===String(message.chat.id)&&item.userId===String(message.from?.id||'')&&item.expiresAt>Date.now()&&['create_order','update_order','cancel_order'].includes(item.analysis?.intent)).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))).at(-1);
        if(pending){
          if(pending.analysis?.intent==='create_order')return send(message.chat.id,'Файлы загрузите после подтверждения заказа. После создания заказа появится кнопка «📎 Загрузить файлы».');
          pending.attachments=[...attachmentList(pending),storedAttachment].slice(-20);await saveState();await send(message.chat.id,`Файл «${storedAttachment.name}» добавлен. Всего файлов в действии: ${pending.attachments.length}.`);return
        }
        const guidedDraft=currentGuidedAction(message.chat.id,message.from?.id,clinic.id);
        if(guidedDraft?.mode==='new'){
          if(guidedDraft.awaitingInput==='files'){
            await saveState();
            return send(message.chat.id,'Сначала проверьте и подтвердите заказ. После его создания появится кнопка «📎 Загрузить файлы».');
          }
          await saveState();
          return send(message.chat.id,'Сначала подтвердите и создайте заказ. После этого появится кнопка «📎 Загрузить файлы», и файл можно будет прикрепить к уже созданному заказу.');
        }
        const context=currentContext(message.chat.id,message.from?.id,clinic.id);
        if(context){const analysis=normalizeAnalysis({intent:'update_order',orderId:context.orderId,summary:`Прикрепить файл «${storedAttachment.name}»`,fields:{}});return propose(message,clinic,analysis,storedAttachment)}
      }
      if(directMedia.kind==='document')return send(message.chat.id,'Файл сохранён в переписке. Чтобы прикрепить его к заказу, сначала выберите заказ через /file.');
      return;
    }
    const attachment=null;
    const mentionedBot=normalizedUsername(text)===normalizedUsername(botIdentity.username);
    const menuInvocation=['/start','/connect','/help','/menu'].includes(command)||mentionedBot||normalize(text)==='бот';
    const quickCommand=({
      '/new':'new','/status':'status','/edit':'edit','/file':'file','/due':'due','/cancel':'cancel','/human':'human'
    })[command];
    const activeGuided=currentGuidedAction(message.chat.id,message.from?.id,clinic.id);
    if(menuInvocation)return sendMenu(message.chat.id);
    if(quickCommand){
      if(quickCommand==='new'){
        rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:normalizeAnalysis({intent:'create_order',fields:{}}),awaitingInput:'patient',draftUploadKey:'',draftUploadHref:''});
        await saveState();
        return send(message.chat.id,guidedPatientPrompt(),{reply_markup:guidedStartNavigationMarkup()});
      }
      if(quickCommand==='human')return send(message.chat.id,'@CreateDental_io, вас зовут в этот чат.');
      return sendOrderPicker(message.chat.id,clinic,quickCommand);
    }
    if(!activeGuided){
      let passiveText=text;
      if(message.voice||message.audio){
        try{passiveText=`Расшифровка аудио: ${await transcribeVoice(message)}`}
        catch(error){passiveText='Расшифровка аудио: не удалось распознать сообщение';console.error('Telegram passive transcription failed:',error.message)}
      }
      if(passiveText)await onClinicMessage(clinic.id,{text:passiveText,attachment:null,sender:actorName(message),senderUsername:message.from?.username||'',senderLabel:supportMessage?supportLabel(message.from?.username):'',telegramMessageId:message.message_id,telegramChatId:String(message.chat.id),messageRole:supportMessage?'support':'client'}).catch(()=>{});
      return;
    }
    let sourceText=text;
    if(message.voice||message.audio){
      await api('sendChatAction',{chat_id:message.chat.id,action:'typing'}).catch(()=>{});
      try{sourceText=await transcribeVoice(message)}catch(error){return send(message.chat.id,`Не удалось расшифровать аудио: ${cleanText(error.message,500)}`)}
    }
    if(!sourceText&&!attachment)return;
    const chatText=sourceText||(attachment?.kind==='photo'?'Фото':`Документ: ${attachment?.name||''}`);
    await onClinicMessage(clinic.id,{text:message.voice||message.audio?`Расшифровка аудио: ${sourceText}`:chatText,attachment,sender:actorName(message),senderUsername:message.from?.username||'',senderLabel:supportMessage?supportLabel(message.from?.username):'',telegramMessageId:message.message_id,telegramChatId:String(message.chat.id),messageRole:supportMessage?'support':'client'}).catch(()=>{});
    if(message._edited)return;
    if(!sourceText&&attachment?.orderEligible){
      const pending=Object.values(state.pending).filter(item=>item.chatId===String(message.chat.id)&&item.userId===String(message.from?.id||'')&&item.expiresAt>Date.now()&&['create_order','update_order','cancel_order'].includes(item.analysis?.intent)).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))).at(-1);
      if(pending){pending.attachments=[...attachmentList(pending),attachment].slice(-20);delete pending.attachment;await saveState();await send(message.chat.id,`Файл «${attachment.name}» добавлен. Всего файлов в действии: ${pending.attachments.length}.`);return}
      const context=currentContext(message.chat.id,message.from?.id,clinic.id);
      if(context){const analysis=normalizeAnalysis({intent:'update_order',orderId:context.orderId,summary:`Прикрепить файл «${attachment.name}»`,fields:{}});return propose(message,clinic,analysis,attachment)}
      return;
    }
    if(!sourceText)return;
    const guided=takeGuidedAction(message.chat.id,message.from?.id,clinic.id);
    let directCreateAnalysis=null;
    if(guided){
      await saveState();
      let guidedAnalysis,doneByLabel;
      if(guided.mode==='editRequest'){
        const requestText=cleanText(sourceText,2000);
        if(requestText.length<2){
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,guided.orderId,'editRequest');await saveState();
          return send(message.chat.id,'Опишите просьбу по изменению заказа текстом или голосом.');
        }
        guidedAnalysis=normalizeAnalysis({intent:'update_order',orderId:guided.orderId,fields:{requestText},summary:'Просьба клиента'});
        doneByLabel='Запросил изменение';
      }else if(guided.mode==='edit'){
        const field=guided.field;
        let parsed=normalizeAnalysis({intent:'update_order',orderId:guided.orderId,fields:{}});
        if(field==='shade')parsed.fields.shade=cleanText(sourceText,40);
        else if(field==='comment')parsed.fields.comment=cleanText(sourceText,1800);
        else if(field==='due'){
          const dueDate=parseTelegramDate(sourceText);
          if(!dueDate){
            rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,guided.orderId,'edit',{field,variantIndex:guided.variantIndex,baseOrderRevision:guided.baseOrderRevision});await saveState();
            return send(message.chat.id,'Не удалось распознать дату. Укажите день и месяц, например: «22 октября» или «22.10.2026».',{reply_markup:guidedNavigationMarkup()});
          }
          const order=activeOrdersForClinic(portalSnapshot(),clinic.id).find(item=>item.id===guided.orderId);
          const deadlineError=order?telegramDeadlineError(order,dueDate,new Date()):'';
          if(deadlineError){
            rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,guided.orderId,'edit',{field,variantIndex:guided.variantIndex,baseOrderRevision:guided.baseOrderRevision});await saveState();
            return send(message.chat.id,`${deadlineError}\n\nУкажите другую дату, начиная с минимально допустимой.`,{reply_markup:guidedNavigationMarkup()});
          }
          parsed.fields.dueDate=dueDate;
        }
        else{
          const labels={patient:'Новое ФИО пациента',birth:'Новая дата рождения пациента',mode:'Новый режим и челюсть',teeth:'Новые номера зубов',service:'Новая услуга из прайса'};
          parsed=await analyze(`Измени заказ ${guided.orderId}. ${labels[field]||'Новое значение'}: ${sourceText}`,clinic,null,guided.orderId);
        }
        const source=parsed.fields||{},fields={};
        if(field==='patient'&&source.patient)fields.patient=source.patient;
        if(field==='birth'&&source.birthDate)fields.birthDate=source.birthDate;
        if(field==='mode'&&source.toothMode){fields.toothMode=source.toothMode;if(source.jaw)fields.jaw=source.jaw;if(source.teeth?.length)fields.teeth=source.teeth}
        if(field==='teeth'&&source.teeth?.length)fields.teeth=source.teeth;
        if(field==='service'&&source.work&&source.material){fields.work=source.work;fields.material=source.material}
        if(field==='shade'&&source.shade)fields.shade=source.shade;
        if(field==='due'&&source.dueDate)fields.dueDate=source.dueDate;
        if(field==='comment'&&source.comment)fields.comment=source.comment;
        if(!Object.keys(fields).length){rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,guided.orderId,'edit',{field,variantIndex:guided.variantIndex,baseOrderRevision:guided.baseOrderRevision});await saveState();return send(message.chat.id,'Не удалось распознать новое значение. Напишите его ещё раз одним сообщением.')}
        guidedAnalysis=normalizeAnalysis({intent:'update_order',orderId:guided.orderId,fields,summary:`Изменение поля заказа ${guided.orderId}`});doneByLabel='Запросил изменение';
      }else if(guided.mode==='cancel'){
        const reason=cleanText(sourceText,1800);
        guidedAnalysis=normalizeAnalysis({intent:'cancel_order',orderId:guided.orderId,fields:{reason},summary:`Отмена заказа ${guided.orderId}: ${reason}`});
        doneByLabel='Отменил';
      }else if(guided.mode==='due'){
        const dueDate=parseTelegramDate(sourceText);
        if(!dueDate){
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,guided.orderId,'due');await saveState();
          return send(message.chat.id,'Не удалось распознать дату. Укажите день и месяц, например: «22 октября» или «22.10.2026».',{reply_markup:guidedNavigationMarkup()});
        }
        const order=activeOrdersForClinic(portalSnapshot(),clinic.id).find(item=>item.id===guided.orderId);
        const deadlineError=order?telegramDeadlineError(order,dueDate,new Date()):'';
        if(deadlineError){
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,guided.orderId,'due');await saveState();
          return send(message.chat.id,`${deadlineError}\n\nУкажите другую дату, начиная с минимально допустимой.`,{reply_markup:guidedNavigationMarkup()});
        }
        guidedAnalysis=normalizeAnalysis({intent:'update_order',orderId:guided.orderId,fields:{dueDate},summary:`Новый срок заказа ${guided.orderId}: ${dueDate}`});
        doneByLabel='Изменил';
      }
      if(!guidedAnalysis){
        if(guided.mode==='new'&&guided.awaitingInput==='doctor'){
          const picker=doctorPrompt(clinic,'',guided.doctorPage||0);
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:guided.draftAnalysis,awaitingInput:'doctor',doctorChoices:picker.state.choices,doctorPage:picker.state.page});
          await saveState();
          return send(message.chat.id,picker.text,{reply_markup:picker.markup});
        }else if(guided.mode==='new'&&guided.awaitingInput==='productionType'){
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:guided.draftAnalysis,awaitingInput:'productionType'});
          await saveState();
          return send(message.chat.id,'Сначала выберите тип работы кнопкой: «Цифровой» или «Аналоговый».',{reply_markup:productionTypeMarkup()});
        }else if(guided.mode==='new'&&['fileChoice','files'].includes(guided.awaitingInput)){
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:guided.draftAnalysis,awaitingInput:'',readyForConfirmation:true});
          await saveState();
          return send(message.chat.id,guidedReadyPrompt(),{reply_markup:guidedReadyMarkup()});
        }else if(guided.mode==='new'&&guided.readyForConfirmation){
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:guided.draftAnalysis,awaitingInput:'',readyForConfirmation:true});
          await saveState();
          return send(message.chat.id,guidedReadyPrompt(),{reply_markup:guidedReadyMarkup()});
        }else if(guided.mode==='new'&&guided.awaitingInput==='patientConfirm'){
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:guided.draftAnalysis,awaitingInput:'patientConfirm'});
          await saveState();
          return send(message.chat.id,patientConfirmationPrompt(guided.draftAnalysis?.fields?.patient),{reply_markup:patientConfirmationMarkup()});
        }else if(guided.mode==='new'&&guided.awaitingInput==='patient'){
          const parsedPatient=parseGuidedPatientInput(sourceText);
          const draft=normalizeAnalysis(guided.draftAnalysis||{intent:'create_order',fields:{}});
          const previousPatient=draft.fields.patient||'';
          const previousWords=(previousPatient.match(/[A-Za-zА-Яа-яЁё-]+/g)||[]);
          const combined=parsedPatient.words.length===1&&previousWords.length===1
            ? titleCasePatientName(`${previousPatient} ${parsedPatient.value}`)
            : parsedPatient.value;
          const combinedWords=(combined.match(/[A-Za-zА-Яа-яЁё-]+/g)||[]);
          if(!combined||combinedWords.length<2){
            draft.fields.patient=combined||previousPatient;
            rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:draft,awaitingInput:'patient'});
            await saveState();
            return send(message.chat.id,guidedPatientPrompt(draft.fields.patient),{reply_markup:guidedNavigationMarkup()});
          }
          draft.fields.patient=combined;
          draft.patientSurname=(combined.match(/[A-Za-zА-Яа-яЁё-]+/g)||[])[0]||'';
          draft.fields.addingService=false;
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:draft,awaitingInput:'patientConfirm'});
          await saveState();
          return send(message.chat.id,patientConfirmationPrompt(draft.fields.patient),{reply_markup:patientConfirmationMarkup()});
        }else if(guided.mode==='new'&&guided.wizardStep==='teeth'){
          const typedTeeth=parseGuidedTeethInput(sourceText),draft=normalizeAnalysis(guided.draftAnalysis||{intent:'create_order',fields:{}});
          if(typedTeeth.length){
            draft.fields.teeth=safeTeeth([...(draft.fields.teeth||[]),...typedTeeth]);
            rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:draft,wizardStep:'teeth'});await saveState();
            return send(message.chat.id,createOrderWizardPrompt(draft,'teeth'),{reply_markup:createOrderChoiceMarkup(draft,'teeth')});
          }
          if(/^(готово|готов|выбрано)$/iu.test(sourceText.trim())){
            const minimum=draft.fields.toothMode==='Мост'?2:1;
            if((draft.fields.teeth||[]).length<minimum)return send(message.chat.id,minimum===2?'Для моста выберите минимум два зуба.':'Выберите минимум один зуб.');
            directCreateAnalysis=draft;
          }else{
            rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:draft,wizardStep:'teeth'});await saveState();
            return send(message.chat.id,'Напишите номера зубов, например «12, 15», или нажмите кнопки выбора зубов.',{reply_markup:createOrderChoiceMarkup(draft,'teeth')});
          }
        }else if(guided.mode==='new'&&guided.awaitingInput==='due'&&!hasExplicitDueMonth(sourceText)){
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:guided.draftAnalysis,wizardStep:'',awaitingInput:'due'});await saveState();
          return send(message.chat.id,`Укажите день и месяц срока. Например: «10 ноября» или «10.11.2026».\n${guidedDuePrompt(guided.draftAnalysis)}`,{reply_markup:guidedNavigationMarkup()});
        }else if(guided.mode==='new'&&guided.awaitingInput==='variantDue'){
          const index=Number(guided.editingVariantIndex),draft=normalizeAnalysis(guided.draftAnalysis||{intent:'create_order',fields:{}}),variants=analysisVariants(draft),selected=Number.isInteger(index)?variants[index]:null;
          const variantAnalysis=selected?normalizeAnalysis({intent:'create_order',fields:{work:selected.work,material:selected.material}}):null;
          if(!selected||!variantAnalysis){return send(message.chat.id,'Не удалось определить услугу. Откройте редактирование заказа ещё раз.');}
          if(!hasExplicitDueMonth(sourceText)){
            rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:draft,awaitingInput:'variantDue',editingVariantIndex:index});await saveState();
            return send(message.chat.id,`Укажите день и месяц срока для услуги ${index+1}. Например: «10 ноября» или «10.11.2026».\n\n${guidedDuePrompt(variantAnalysis)}`,{reply_markup:guidedNavigationMarkup()});
          }
          const due=parseTelegramDate(sourceText);
          const deadlineError=telegramDeadlineError({work:selected.work,workOption:selected.material},due,new Date());
          if(!due||deadlineError){
            rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:draft,awaitingInput:'variantDue',editingVariantIndex:index});await saveState();
            return send(message.chat.id,`${deadlineError||'Не удалось распознать дату. Укажите день и месяц, например: «22 октября».'}\n\n${guidedDuePrompt(variantAnalysis,new Date(),false)}`,{reply_markup:guidedNavigationMarkup()});
          }
          variants[index]={...variants[index],dueDate:due};
          draft.fields.variants=variants;draft.fields.work='';draft.fields.material='';draft.fields.teeth=[];draft.fields.toothMode='';draft.fields.jaw='';draft.fields.dueDate='';draft.fields.addingService=false;
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:draft,awaitingInput:'',readyForConfirmation:true});await saveState();
          return send(message.chat.id,guidedReadyPrompt(),{reply_markup:guidedReadyMarkup()});
        }else if(guided.mode==='new'&&guided.awaitingInput==='due'){
          const dueDate=parseTelegramDate(sourceText);
          if(dueDate){
            const draft=normalizeAnalysis(guided.draftAnalysis||{intent:'create_order',fields:{}});
            draft.fields.dueDate=dueDate;
            const deadlineError=telegramDeadlineError(currentServiceOrder(draft),dueDate,new Date());
            if(deadlineError){
              draft.fields.dueDate='';
              const dateSuggestions=weekendDateAlternatives(currentServiceOrder(draft),dueDate,new Date());
              rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:draft,wizardStep:'',awaitingInput:'due',dateSuggestions});await saveState();
              return send(message.chat.id,`${deadlineError}\n\n${guidedDuePrompt(draft,new Date(),false)}`,{reply_markup:dateSuggestions?weekendDateChoiceMarkup(dateSuggestions):guidedNavigationMarkup()});
            }
            directCreateAnalysis=draft;
          }else sourceText=`Создай новый заказ. Срок готовности: ${sourceText}`;
        }else if(guided.mode==='new'&&guided.awaitingInput==='shade'){
          directCreateAnalysis=mergeCreateAnalysis(guided.draftAnalysis,normalizeAnalysis({intent:'create_order',fields:{shade:cleanText(sourceText,40)}}));
        }else if(guided.mode==='new'&&guided.awaitingInput==='comment'){
          directCreateAnalysis=mergeCreateAnalysis(guided.draftAnalysis,normalizeAnalysis({intent:'create_order',fields:{comment:cleanText(sourceText,1800)}}));
        }else if(guided.mode==='new'&&['patient','birth'].includes(guided.awaitingInput)){
          const editPrompt=guided.awaitingInput==='patient'?`Создай новый заказ. Пациент: ${sourceText}`:`Создай новый заказ. Дата рождения пациента: ${sourceText}`;
          const parsed=await analyze(editPrompt,clinic,null,'');directCreateAnalysis=mergeCreateAnalysis(guided.draftAnalysis,parsed);
        }else if(guided.mode==='new')sourceText=`Создай новый заказ. ${sourceText}`;
      }else{
        const id=randomBytes(10).toString('hex');
        const item={id,chatId:String(message.chat.id),clinicId:clinic.id,userId:String(message.from?.id||''),actor:actorName(message),analysis:guidedAnalysis,orderId:guided.orderId,variantIndex:guided.variantIndex,baseOrderRevision:guided.baseOrderRevision,attachments:[],createdAt:new Date().toISOString(),expiresAt:Date.now()+24*60*60*1000};
        try{
          const result=await executePending(item,{from:message.from});
          state.completed[id]={at:new Date().toISOString(),result};
          await saveState();
          return send(message.chat.id,`${result}\n${doneByLabel}: ${actorName(message)}`);
        }catch(error){
          if(await promptEditPosition(error,item))return;
          if((guided.mode==='edit'&&guided.field==='due')||guided.mode==='due'){
            rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,guided.orderId,guided.mode,{field:guided.field});await saveState().catch(()=>{});
            return send(message.chat.id,`Не удалось изменить срок: ${cleanText(error.message,500)}\n\nУкажите другую дату или нажмите «Назад».`,{reply_markup:guidedNavigationMarkup()});
          }
          return send(message.chat.id,`Не удалось выполнить действие: ${cleanText(error.message,500)}. Попробуйте ещё раз через меню.`);
        }
      }
    }
    const context=currentContext(message.chat.id,message.from?.id,clinic.id);
    try{
      let analysis=directCreateAnalysis||await analyze(sourceText,clinic,attachment,guided?.orderId||context?.orderId||'');
      if(guided?.mode==='new'&&!directCreateAnalysis){
        analysis=mergeCreateAnalysis(guided.draftAnalysis,analysis);
        analysis=enforcePatientNameRequirement(analysis,sourceText,guided.draftAnalysis);
      }
      if(guided?.mode==='new'&&guided.awaitingInput==='due'){
        const dueOrder=currentServiceOrder(analysis);
        const deadlineError=telegramDeadlineError(dueOrder,analysis.fields.dueDate,new Date());
        if(deadlineError){
          const draft=normalizeAnalysis(analysis);draft.fields.dueDate='';
          const dueOrder=currentServiceOrder(draft),dateSuggestions=weekendDateAlternatives(dueOrder,analysis.fields.dueDate,new Date());
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:draft,wizardStep:'',awaitingInput:'due',dateSuggestions});await saveState();
          return send(message.chat.id,`${deadlineError}\n\n${guidedDuePrompt(draft,new Date(),false)}`,{reply_markup:dateSuggestions?weekendDateChoiceMarkup(dateSuggestions):guidedNavigationMarkup()});
        }
      }
      if(analysis.intent==='create_order'&&analysis.fields.dueDate){
        const deadlineError=telegramDeadlineError(guided?.mode==='new'?currentServiceOrder(analysis):{work:analysis.fields.work,workOption:analysis.fields.material,material:analysis.fields.material,variants:analysisVariants(analysis).map(item=>({...item,workOption:item.workOption||item.material}))},analysis.fields.dueDate,new Date());
        if(deadlineError){
          const draft=normalizeAnalysis(analysis);draft.fields.dueDate='';
          return send(message.chat.id,`${deadlineError}\n\n${createOrderMissingPrompt(draft)}`,{reply_markup:createOrderChoiceMarkup(draft)||guidedNavigationMarkup()});
        }
      }
      // Every guided input, including free-text and voice answers, returns to
      // the same next-step state machine as a button click. This prevents a
      // custom shade/date or typed tooth list from jumping straight to review.
      if(guided?.mode==='new'){
        const draft=canonicalizeCatalogSelection(normalizeAnalysis(analysis));
        const missing=missingCreateFields(draft),wizardStep=missing.some(field=>field==='номер зуба или номера зубов'||field==='минимум два номера зубов для моста')?'teeth':'';
        const addedOptionalData=Boolean(directCreateAnalysis&&['birth','comment'].includes(guided.awaitingInput));
        if(addedOptionalData&&!missing.length&&draft.fields.productionType){
          return propose(message,clinic,draft,null,guided.draftUploadKey||'',false);
        }
        if(missing.length||!draft.fields.productionType){
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:draft,wizardStep,awaitingInput:''});await saveState();
          return send(message.chat.id,createOrderWizardPrompt(draft,wizardStep),{reply_markup:createOrderChoiceMarkup(draft,wizardStep)||guidedNavigationMarkup()});
        }
        const activeDoctors=activeClinicDoctors(clinic),selectedDoctor=selectedClinicDoctor(clinic,draft.fields.doctorId);
        if(activeDoctors.length&&!selectedDoctor){
          const picker=doctorPrompt(clinic,'',0);
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:draft,awaitingInput:'doctor',doctorChoices:picker.state.choices,doctorPage:picker.state.page});await saveState();
          return send(message.chat.id,picker.text,{reply_markup:picker.markup});
        }
        rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:draft,wizardStep:'',awaitingInput:'',readyForConfirmation:true});await saveState();
        return send(message.chat.id,guidedReadyPrompt(),{reply_markup:guidedReadyMarkup()});
      }
      await propose(message,clinic,analysis,attachment||guided?.attachments||null);
    }
    catch(error){
      if(guided?.mode==='new'){rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:guided.draftAnalysis,wizardStep:guided.wizardStep||'',awaitingInput:guided.awaitingInput||''});await saveState().catch(()=>{})}
      if(guided?.mode==='editRequest'){rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,guided.orderId,'editRequest');await saveState().catch(()=>{})}
      health.lastErrorAt=new Date().toISOString();health.lastError=cleanText(error.message,300);console.error('Telegram analysis failed:',error.message);await send(message.chat.id,'Не удалось автоматически разобрать запрос. Отправьте недостающие данные ещё раз или нажмите «Позвать человека» в меню.');
    }
  }

  async function handleUpdate(update){if(update.callback_query)return handleCallback(update.callback_query);if(update.edited_message)return handleMessage({...update.edited_message,_edited:true});if(update.message)return handleMessage(update.message)}
  function updateChatId(update){return String(update.message?.chat?.id||update.callback_query?.message?.chat?.id||'global')}
  function queueUpdate(update){
    const key=updateChatId(update),previous=chatQueues.get(key)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
      try{await handleUpdate(update);health.lastUpdateAt=new Date().toISOString();health.processedUpdates+=1}
      catch(error){health.lastErrorAt=new Date().toISOString();health.lastError=cleanText(error.message,300);console.error('Telegram update failed:',error.message)}
      finally{delete state.inbox[String(update.update_id)];await saveState()}
    });
    chatQueues.set(key,next);void next.finally(()=>{if(chatQueues.get(key)===next)chatQueues.delete(key)}).catch(()=>{});return next;
  }
  async function poll(){
    if(polling||stopped||!token)return;polling=true;
    while(!stopped){
      try{
        const updates=await api('getUpdates',{offset:state.offset,timeout:25,allowed_updates:['message','edited_message','callback_query']});
        for(const update of updates){state.inbox[String(update.update_id)]=update;state.offset=Math.max(state.offset,Number(update.update_id)+1)}
        if(updates.length){await saveState();await Promise.all(updates.map(queueUpdate))}
      }catch(error){const normalLongPollTimeout=error?.name==='TimeoutError'||error?.name==='AbortError'||/aborted due to timeout/i.test(String(error?.message||''));if(!normalLongPollTimeout&&!stopped){health.lastErrorAt=new Date().toISOString();health.lastError=cleanText(error.message,300);console.error('Telegram polling failed:',error.message);await new Promise(resolve=>setTimeout(resolve,5000))}}
    }
    polling=false;
  }

  async function reloadSecrets(){
    [token,speechKey,gptKey,folderId]=await Promise.all([readSecret('TELEGRAM_BOT_TOKEN'),readSecret('YANDEX_SPEECHKIT_API_KEY'),readSecret('YANDEX_GPT_API_KEY'),readSecret('YANDEX_FOLDER_ID')]);
    const configured={telegramBot:Boolean(token),speechKit:Boolean(speechKey),yandexGpt:Boolean(gptKey),folderId:Boolean(folderId)};
    const ready=Object.values(configured).every(Boolean);
    if(ready){
      botIdentity=await api('getMe');
      await api('setMyCommands',{commands:botCommands}).catch(error=>console.error('Telegram commands setup failed:',error.message));
      await api('setChatMenuButton',{menu_button:{type:'commands'}}).catch(error=>console.error('Telegram menu button setup failed:',error.message));
      if(!polling&&!stopped)void poll();
    }
    return {...configured,ready,enabled:ready&&!stopped};
  }
  async function start(){
    try{state={offset:0,bindings:{},bindingRequests:{},pending:{},completed:{},contexts:{},guided:{},carts:{},messageActions:{},inbox:{},...JSON.parse(await fs.promises.readFile(stateFile,'utf8'))};state.guided=state.guided||{};state.carts=state.carts||{}}catch(error){if(error.code!=='ENOENT')throw error}
    stopped=false;
    const status=await reloadSecrets();
    if(!status.ready){console.log('Telegram bridge disabled: secret files are not configured');return false}
    health.startedAt=new Date().toISOString();
    const recovered=Object.values(state.inbox||{});if(recovered.length)await Promise.all(recovered.map(queueUpdate));
    console.log('Telegram bridge enabled');return true;
  }
  function stop(){stopped=true}
  function status(){
    const configured={telegramBot:Boolean(token),speechKit:Boolean(speechKey),yandexGpt:Boolean(gptKey),folderId:Boolean(folderId)};
    const ready=Object.values(configured).every(Boolean);
    const clients=portalSnapshot().clients;
    const bindings=Object.entries(state.bindings).map(([clinicId,binding])=>{const value=typeof binding==='object'?binding:{chatId:binding};return {clinicId,clinicName:clients.find(client=>client.id===clinicId)?.name||clinicId,...value}});
    const pairingRequests=Object.values(state.bindingRequests).filter(item=>item.expiresAt>Date.now()).map(item=>({...item,clinicName:clients.find(client=>client.id===item.clinicId)?.name||item.clinicId}));
    return {...configured,ready,enabled:ready&&!stopped,polling,bindings,pairingRequests,pendingActions:Object.keys(state.pending).length,queuedUpdates:Object.keys(state.inbox||{}).length,...health};
  }
  async function sendClinicMessage(clinicId,text,attachment){
    const binding=state.bindings[clinicId],chatId=typeof binding==='object'?binding?.chatId:binding;if(!chatId||!token)return false;
    if(attachment){
      const loaded=await loadClinicAttachment(attachment.id);
      if(loaded?.data){
        const form=new FormData();form.set('chat_id',chatId);if(text)form.set('caption',cleanText(text,900));form.set('document',new Blob([loaded.data],{type:attachment.type||'application/octet-stream'}),attachment.name||'file');
        const response=await telegramFetch(`https://api.telegram.org/bot${token}/sendDocument`,{method:'POST',body:form,signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw new Error('Telegram не принял файл');return true;
      }
      if(loaded?.url){await send(chatId,`${text?`${text}\n\n`:''}📎 ${attachment.name||'Файл'}\nСкачать: ${loaded.url}`,{},false);return true}
    }
    if(text)await send(chatId,text,{},false);return true;
  }
  async function sendAutomatedMessage(clinicId,text,extra={}){
    const binding=state.bindings[clinicId],chatId=typeof binding==='object'?binding?.chatId:binding;
    if(!chatId||!token)return false;
    if(text)await send(chatId,text,extra,true);
    return true;
  }
  async function syncClinicChatPhoto(clinicId,logo){
    const binding=state.bindings[clinicId],chatId=typeof binding==='object'?binding?.chatId:binding;
    if(!chatId||!token)return false;
    if(!String(logo||'').trim()){
      await api('deleteChatPhoto',{chat_id:chatId});
      return true;
    }
    const temporary=await fs.promises.mkdtemp(path.join(os.tmpdir(),'create-dental-chat-photo-'));
    const input=path.join(temporary,'source.img'),output=path.join(temporary,'chat-photo.jpg');
    try{
      const source=String(logo).trim();
      if(source.startsWith('data:')){
        const comma=source.indexOf(',');
        if(comma<0)throw new Error('Некорректный логотип клиники');
        const header=source.slice(5,comma),payload=source.slice(comma+1);
        const data=header.toLowerCase().includes(';base64')?Buffer.from(payload,'base64'):Buffer.from(decodeURIComponent(payload),'utf8');
        await fs.promises.writeFile(input,data,{mode:0o600});
      }else if(/^https?:\/\//i.test(source)){
        const response=await telegramFetch(source,{signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw new Error(`Не удалось загрузить логотип (${response.status})`);
        await fs.promises.writeFile(input,Buffer.from(await response.arrayBuffer()),{mode:0o600});
      }else throw new Error('Неподдерживаемый источник логотипа');
      await execFileAsync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',input,'-frames:v','1','-vf','scale=1000:1000:force_original_aspect_ratio=decrease,pad=1000:1000:(ow-iw)/2:(oh-ih)/2:color=white','-q:v','3',output],{timeout:30000});
      const form=new FormData();
      form.set('chat_id',String(chatId));
      form.set('photo',new Blob([await fs.promises.readFile(output)],{type:'image/jpeg'}),'clinic-chat.jpg');
      const response=await telegramFetch(`https://api.telegram.org/bot${token}/setChatPhoto`,{method:'POST',body:form,signal:AbortSignal.timeout(30000)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw new Error(`Telegram setChatPhoto: ${result.description||response.status}`);
      health.lastTelegramSuccessAt=new Date().toISOString();
      return true;
    }finally{
      await fs.promises.rm(temporary,{recursive:true,force:true}).catch(()=>{});
    }
  }
  async function notifyOrderStage(order,stage){
    if(!order?.clinicId)return false;
    return sendAutomatedMessage(order.clinicId,`Заказ ${order.id}\nПациент: ${order.patient}${orderDoctorText(order)}\nНовый статус: ${stage}`);
  }
  return {start,stop,status,reloadSecrets,sendClinicMessage,sendAutomatedMessage,syncClinicChatPhoto,notifyOrderStage,approveBinding,rejectBinding,unbindClinic};
}

export const telegramInternals={codeFromText,parseJson,normalizeVariant,normalizeAnalysis,canonicalizeCatalogSelection,analysisVariants,isNoTeethSelection,isJawSplitSelection,priceEstimate,findOrder,surnameStem,surnameMatches,patientMatchesReference,attachmentCommandAnalysis,isSupportUsername,supportLabel,telegramMedia,messageAddsBot,welcomeText,hasFullPatientName,enforcePatientNameRequirement,extractExplicitPatientName,repairPatientName,missingCreateFields,mergeCreateAnalysis,createOrderMissingPrompt,createOrderChoiceMarkup,createOrderWizardPrompt,guidedDuePrompt,weekendDateAlternatives,weekendDateChoiceMarkup,backGuidedOrder,parseGuidedTeethInput,parseGuidedPatientInput,guidedPatientPrompt,patientConfirmationMarkup,productionTypeMarkup,fileChoiceMarkup,fileUploadWaitingMarkup,fileUploadMarkup,guidedReadyMarkup,displayDate,isoDateFromDisplay,hasExplicitDueMonth,parseTelegramDate,editRequestFieldHints,orderCanReceiveFiles,orderPickerLabel,clientRequestType,telegramDueDateForAnalysis,currentServiceDueDate,latestServiceDueDate,telegramDeadlineError,summaryLines,activeClinicDoctors,selectedClinicDoctor,doctorLabel,orderDoctorText};
