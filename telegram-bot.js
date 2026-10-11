import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {portalSnapshot,portalClient,replacePortalCollection,recordPortalEvent} from './portal-data.js';
import {catalogForPrompt,resolveWorkSelection,estimateWork,rubles} from './work-catalog.js';

const require=createRequire(import.meta.url);
const execFileAsync=promisify(execFile);

const telegramCodePattern=/\bCD-CL-\d{8}\b/i;
const upperTeeth=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const lowerTeeth=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
const validTeeth=new Set([...upperTeeth,...lowerTeeth]);
const allowedIntents=new Set(['create_order','update_order','cancel_order','status_request','accept_order','rework_order','general_message','clarify']);
const botCommands=[
  {command:'menu',description:'Открыть меню действий'},
  {command:'new',description:'Создать новый заказ'},
  {command:'status',description:'Узнать статус заказа'},
  {command:'edit',description:'Изменить данные заказа'},
  {command:'file',description:'Загрузить файлы'},
  {command:'due',description:'Изменить срок заказа'},
  {command:'cancel',description:'Отменить заказ'},
  {command:'human',description:'Позвать сотрудника Create Dental'}
];
const welcomeText=`👋 Добро пожаловать в чат Create Dental!

Здесь можно общаться с лабораторией и управлять заказами. Обычные сообщения бот не обрабатывает как команды. Чтобы выполнить действие в CRM, отправьте /menu и выберите нужную функцию.

➕ Новый заказ
Укажите пациента, тип работы (цифра или аналог), режим (одиночка, мост или челюсть), номера зубов, точную услугу, цвет и срок. Если типа не хватит, бот предложит выбрать его кнопкой.
Пример: «Новый заказ. Иванов Сергей. Коронки из циркония на 11 и 21, цвет A2. Срок — 20 октября».

🔎 Статус заказа
Пример: «Какой статус заказа Иванова?»

📅 Изменить заказ
Пример: «Перенеси срок заказа Иванова на 25 октября».

📎 Добавить файл
После того, как главный техник примет заказ, нажмите «📎 Загрузить файл», выберите заказ и откройте безопасную ссылку. За один раз можно загрузить до 10 файлов, каждый — до 200 МБ.

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
// Users may type tooth numbers instead of pressing the inline keyboard buttons.
// Parse that guided input locally so a partial selection is preserved reliably.
function parseGuidedTeethInput(value){return safeTeeth((String(value||'').match(/\d{1,2}/g)||[]))}
function moscowDate(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
function addDays(dateValue,days){const date=new Date(`${dateValue}T12:00:00+03:00`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function displayDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return '';const [year,month,day]=value.split('-');return `${day}.${month}.${year}`}
function isoDateFromDisplay(value){const match=String(value||'').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return match?`${match[3]}-${match[2]}-${match[1]}`:''}
function hasExplicitDueMonth(value){
  const text=String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
  if(!text)return false;
  if(/(сегодня|завтра|послезавтра)/.test(text)||/через\s+\d+\s+(день|дня|дней|неделю|недели|недель)/.test(text))return true;
  if(/(январ[ьяе]|феврал[ьяе]|март(?:а|е)?|апрел[ьяе]|ма[йяе]|июн[ьяе]|июл[ьяе]|август(?:а|е)?|сентябр[ьяе]|октябр[ьяе]|ноябр[ьяе]|декабр[ьяе])/.test(text))return true;
  return /\b\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?\b/.test(text)||/\b\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}\b/.test(text);
}
function normalize(value){return String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/gi,' ').trim()}
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
function orderCanReceiveFiles(snapshot,order){return Boolean(order&&orderStage(snapshot,order)!=='Отменён')}
function orderPickerLabel(order){return `${order.patient} · до ${order.date}`}

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
      productionType:['digital','analog'].includes(fields.productionType)?fields.productionType:'',
      teeth:safeTeeth(fields.teeth),toothMode:['Одиночка','Мост','Челюсть'].includes(fields.toothMode)?fields.toothMode:'',
      jaw:['upper','lower'].includes(fields.jaw)?fields.jaw:'',
      birthDate:/^\d{4}-\d{2}-\d{2}$/.test(fields.birthDate||'')?fields.birthDate:'',
      dueDate:/^\d{4}-\d{2}-\d{2}$/.test(fields.dueDate||'')?fields.dueDate:'',shade:cleanText(fields.shade,40),
      comment:cleanText(fields.comment,1800),reason:cleanText(fields.reason,1800)
    },
    summary:cleanText(value?.summary,1500),question:cleanText(value?.question,700)
  };
}

function canonicalizeCatalogSelection(analysis){
  const selection=resolveWorkSelection(analysis.fields.work,analysis.fields.material);
  if(selection.category)analysis.fields.work=selection.category.name;
  if(selection.option)analysis.fields.material=selection.option.name;
  return analysis;
}

function effectiveTeeth(fields,order=null){
  if(fields.toothMode==='Челюсть'&&fields.jaw)return fields.jaw==='lower'?[...lowerTeeth]:[...upperTeeth];
  if(fields.teeth.length)return [...fields.teeth];
  return safeTeeth(order?.teeth||[]);
}

function priceEstimate(analysis,order=null){
  const fields=analysis.fields;
  const work=fields.work||order?.work||'';
  const option=fields.material||(fields.work?'':order?.material||'');
  const teeth=effectiveTeeth(fields,order);
  return estimateWork({work,option,teeth});
}

function hasFullPatientName(value){
  return (String(value||'').match(/[A-Za-zА-Яа-яЁё]+/g)||[]).length>=2;
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
  if(!hasFullPatientName(analysis.fields.patient))missing.push('имя и фамилию пациента');
  if(!analysis.fields.toothMode)missing.push('режим: одиночка, мост или челюсть');
  if(analysis.fields.toothMode==='Челюсть'&&!analysis.fields.jaw)missing.push('верхнюю или нижнюю челюсть');
  else if(analysis.fields.toothMode==='Мост'&&analysis.fields.teeth.length<2)missing.push('минимум два номера зубов для моста');
  else if(analysis.fields.toothMode!=='Челюсть'&&!analysis.fields.teeth.length)missing.push('номер зуба или номера зубов');
  const selection=resolveWorkSelection(analysis.fields.work,analysis.fields.material);
  if(!selection.category)missing.push('вид работы из прайса');
  if(selection.category?.options.length&&!selection.option)missing.push('точное название услуги из прайса');
  if(!analysis.fields.dueDate)missing.push('желаемый срок готовности');
  if(!analysis.fields.shade)missing.push('цвет/оттенок или «не требуется»');
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
      patient:after.fields.patient||before.fields.patient,
      birthDate:after.fields.birthDate||before.fields.birthDate,
      work:nextWork,
      material:after.fields.material||(workChanged?'':before.fields.material),
      teeth:after.fields.teeth.length?after.fields.teeth:before.fields.teeth,
      toothMode:after.fields.toothMode||before.fields.toothMode,
      jaw:after.fields.jaw||before.fields.jaw,
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
  if(missing.includes('имя и фамилию пациента'))options.push('• Пациент: фамилия и имя обязательны; отчество — по желанию. Пример: «Иванов Сергей» или «Иванов Сергей Петрович».');
  if(missing.includes('режим: одиночка, мост или челюсть'))options.push('• Режим: «Одиночка», «Мост» или «Челюсть».');
  if(missing.includes('верхнюю или нижнюю челюсть'))options.push('• Челюсть: верхняя или нижняя.');
  if(missing.includes('минимум два номера зубов для моста'))options.push('• Мост: назовите все зубы или его границы, например «11–13».');
  if(missing.includes('номер зуба или номера зубов'))options.push('• Зубы: номера по системе FDI, например «11 и 21».');
  if(missing.includes('вид работы из прайса'))options.push(`• Раздел работы: ${catalogForPrompt().map(item=>item.category).join(' / ')}.`);
  if(missing.includes('точное название услуги из прайса')&&selection.category){
    options.push(`• Услуга из раздела «${selection.category.name}»:`,...selection.category.options.map(option=>`  — ${option.name} — ${rubles(option.price)}`));
  }
  if(missing.includes('желаемый срок готовности'))options.push(`• Срок: конкретная дата или «стандартный срок» — ${displayDate(addDays(moscowDate(),14))}.`);
  if(missing.includes('цвет/оттенок или «не требуется»'))options.push('• Цвет: A1 / A2 / A3 / B1 / B2 / другой оттенок / «не требуется».');
  if(!fields.productionType)options.push('• Тип работы: «Цифра» — сначала CAD оператор или «Аналог» — сначала препрод техник.');
  const recognized=[];
  if(hasFullPatientName(fields.patient))recognized.push(`пациент — ${fields.patient}`);
  if(fields.toothMode)recognized.push(`режим — ${fields.toothMode}`);
  if(fields.teeth.length)recognized.push(`зубы — ${fields.teeth.join(', ')}`);
  if(fields.jaw)recognized.push(`челюсть — ${fields.jaw==='upper'?'верхняя':'нижняя'}`);
  if(selection.category)recognized.push(`работа — ${selection.category.name}${selection.option?` / ${selection.option.name}`:''}`);
  if(fields.dueDate)recognized.push(`срок — ${displayDate(fields.dueDate)}`);
  if(fields.shade)recognized.push(`цвет — ${fields.shade}`);
  if(fields.productionType)recognized.push(`тип — ${fields.productionType==='analog'?'аналог':'цифра'}`);
  return [`Я сохранил указанную часть заказа.${recognized.length?`\nУже распознано: ${recognized.join('; ')}.`:''}`,'','Чтобы пройти все этапы, добавьте:',...options,'','Можно ответить одним текстовым или голосовым сообщением. Уже названные данные повторять не нужно.','Дата рождения, комментарий и файлы необязательны. Файлы можно добавить после принятия заказа главным техником.'].join('\n');
}

function createOrderChoiceMarkup(analysis,wizardStep=''){
  const missing=missingCreateFields(analysis),fields=analysis.fields,catalog=catalogForPrompt();
  if(missing.includes('имя и фамилию пациента'))return null;
  if(missing.includes('режим: одиночка, мост или челюсть'))return {inline_keyboard:[[
    {text:'Одиночка',callback_data:'tgnew:mode:single'},
    {text:'Мост',callback_data:'tgnew:mode:bridge'},
    {text:'Челюсть',callback_data:'tgnew:mode:jaw'}
  ]]};
  if(missing.includes('верхнюю или нижнюю челюсть'))return {inline_keyboard:[[
    {text:'Верхняя челюсть',callback_data:'tgnew:jaw:upper'},
    {text:'Нижняя челюсть',callback_data:'tgnew:jaw:lower'}
  ]]};
  if(wizardStep==='teeth'||missing.includes('номер зуба или номера зубов')||missing.includes('минимум два номера зубов для моста')){
    const selected=new Set(fields.teeth),rows=[];
    for(const arch of [upperTeeth.slice(0,8),upperTeeth.slice(8),lowerTeeth.slice(0,8),lowerTeeth.slice(8)]){
      const row=arch.filter(number=>!selected.has(number)).map(number=>({text:String(number),callback_data:`tgnew:tooth:${number}`}));
      if(row.length)rows.push(row);
    }
    if(selected.size)rows.push([{text:`✅ Готово · выбрано ${selected.size}`,callback_data:'tgnew:teeth:done'},{text:'Сбросить',callback_data:'tgnew:teeth:reset'}]);
    return {inline_keyboard:rows};
  }
  if(missing.includes('вид работы из прайса'))return {inline_keyboard:catalog.map((item,index)=>[{text:item.category,callback_data:`tgnew:work:${index}`}])};
  if(missing.includes('точное название услуги из прайса')){
    const categoryIndex=catalog.findIndex(item=>item.category===fields.work),category=catalog[categoryIndex];
    if(category)return {inline_keyboard:category.services.map((service,index)=>[{text:`${service.name} · ${rubles(service.price)}`,callback_data:`tgnew:service:${categoryIndex}-${index}`}])};
  }
  if(missing.includes('желаемый срок готовности'))return {inline_keyboard:[[
    {text:`Стандартный · ${displayDate(addDays(moscowDate(),14))}`,callback_data:'tgnew:due:standard'},
    {text:'Ввести дату',callback_data:'tgnew:due:custom'}
  ]]};
  if(missing.includes('цвет/оттенок или «не требуется»'))return {inline_keyboard:[
    ['A1','A2','A3','B1','B2'].map(shade=>({text:shade,callback_data:`tgnew:shade:${shade}`})),
    [{text:'Другой оттенок',callback_data:'tgnew:shade:custom'},{text:'Не требуется',callback_data:'tgnew:shade:none'}]
  ]};
  if(!fields.productionType)return {inline_keyboard:[[
    {text:'Цифра · сначала CAD оператор',callback_data:'tgnew:type:digital'},
    {text:'Аналог · сначала препрод техник',callback_data:'tgnew:type:analog'}
  ]]};
  return null;
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
  if(missing.includes('имя и фамилию пациента'))return 'Укажите фамилию и имя пациента. Отчество — по желанию.';
  if(missing.includes('режим: одиночка, мост или челюсть'))return 'Выберите режим работы:';
  if(missing.includes('верхнюю или нижнюю челюсть'))return 'Выберите челюсть:';
  if(missing.includes('вид работы из прайса'))return 'Выберите раздел работы:';
  if(missing.includes('точное название услуги из прайса'))return `Выберите услугу из раздела «${selection.category?.name||fields.work}»:`;
  if(missing.includes('желаемый срок готовности'))return 'Выберите срок готовности:';
  if(missing.includes('цвет/оттенок или «не требуется»'))return 'Выберите цвет:';
  if(!fields.productionType)return 'Выберите тип работы:';
  return 'Проверьте данные заказа.';
}

function buildPrompt(text,clinic,orders,snapshot,attachment=null){
  const orderList=orders.slice(0,60).map(order=>({id:order.id,patient:order.patient,work:order.work,material:order.material||'',teeth:order.teeth||[],due:order.date,status:orderStage(snapshot,order)}));
  const attachmentNote=attachment?.orderEligible?`\nК сообщению приложен файл: ${JSON.stringify(attachment.name)} (${attachment.kind==='photo'?'фото':'документ'}).`:'';
  return `Сегодня ${moscowDate()}, часовой пояс Europe/Moscow.\nКлиника: ${clinic.name}; код подключения: ${clinic.telegramCode}.\nДействующие заказы клиники: ${JSON.stringify(orderList)}\n\nАктуальный каталог услуг и цены за единицу в рублях: ${JSON.stringify(catalogForPrompt())}\n\nСообщение клиента: ${JSON.stringify(text)}${attachmentNote}\n\nОпредели намерение и извлеки только прямо сообщенные данные. Верни только JSON без Markdown:\n{"intent":"create_order|update_order|cancel_order|status_request|accept_order|rework_order|general_message|clarify","confidence":0.0,"orderId":"","patientSurname":"","fields":{"patient":"","birthDate":"YYYY-MM-DD или пусто","work":"","material":"","teeth":[],"toothMode":"Одиночка|Мост|Челюсть|","jaw":"upper|lower|","productionType":"digital|analog|","dueDate":"YYYY-MM-DD или пусто","shade":"","comment":"","reason":""},"summary":"краткое содержание","question":"вопрос при нехватке данных"}\n\nПравила:\n- Никогда не придумывай пациента, зубы, режим, работу, материал, цвет, срок, причину или номер заказа.\n- Сохраняй в fields.patient все названные части имени пациента без потерь: имя и фамилию, а также отчество, если оно прозвучало. Не сокращай полное имя до одной фамилии и не переставляй части имени без необходимости.\n- В patientSurname указывай только фамилию пациента в именительном падеже для поиска существующего заказа, например «Мамедову» — «Мамедов».\n- Для нового заказа фамилия и имя обязательны. Если названа только фамилия, обязательно попроси имя. Отчество запрашивать не нужно: если клиент его назвал, сохрани; если не назвал, продолжай без него.\n- Дату рождения пациента помещай в birthDate только если её прямо назвали.\n- Для услуги из каталога укажи в fields.work точное название категории, а в fields.material точное название услуги. Не меняй формулировки каталога.\n- Если клиент использовал понятное сокращение или разговорное название, выбери соответствующую услугу из каталога только при однозначном соответствии. Иначе запроси уточнение.\n- Для изменения, отмены, статуса, приемки и доработки используй orderId, если он назван. Иначе используй фамилию.\n- Команда «загрузи», «добавь», «прикрепи» или «закинь» приложенный файл к пациенту/заказу означает update_order. Другие поля при этом оставь пустыми.\n- Если речь о новом заказе, intent=create_order. Для создания обязательны фамилия и имя пациента (отчество по желанию), режим выбора, точная услуга из каталога, зубы или челюсть, срок и цвет либо явная фраза «цвет не требуется».\n- Если клиент явно сказал «цифра» или «аналог», сохрани это в fields.productionType как digital или analog. Если тип не назван, оставь поле пустым: его выберет клиент кнопкой перед подтверждением.\n- Не угадывай режим. Одиночка — отдельные единицы, Мост — связанная конструкция, Челюсть — вся верхняя или нижняя челюсть.\n- Для всей верхней челюсти укажи toothMode=Челюсть и jaw=upper; для нижней jaw=lower.\n- Фразу «стандартный срок» преобразуй в дату ${addDays(moscowDate(),14)}.\n- Не преобразуй одно число дня без месяца в дату: «10» или «10 число» недостаточно, в этом случае оставь dueDate пустым и запроси месяц.\n- Вопрос «что с заказом», «когда будет готов» означает status_request.\n- «Работу принимаю», «всё подходит» означает accept_order.\n- Просьба переделать или исправить означает rework_order, причину помести в fields.reason.\n- Обычное сообщение лаборатории без команды означает general_message.\n- Неопределенное намерение означает clarify.\n- Относительные даты преобразуй относительно сегодняшней даты.`;
}

function actionLabel(intent){return ({create_order:'Создать заказ',update_order:'Изменить заказ',cancel_order:'Отменить заказ',accept_order:'Принять работу',rework_order:'Отправить на доработку'})[intent]||'Выполнить действие'}
function summaryLines(analysis,order,clinic){
  const fields=analysis.fields;
  const lines=[actionLabel(analysis.intent),`Клиника: ${clinic.name}`];
  if(order)lines.push(`Заказ: ${order.id}`,`Пациент: ${order.patient}`);
  else if(fields.patient||analysis.patientSurname)lines.push(`Пациент: ${fields.patient||analysis.patientSurname}`);
  if(fields.birthDate)lines.push(`Дата рождения: ${displayDate(fields.birthDate)}`);
  if(fields.work)lines.push(`Работа: ${fields.work}`);
  if(fields.material)lines.push(`Исполнение: ${fields.material}`);
  if(fields.teeth.length)lines.push(`Зубы: ${fields.teeth.join(', ')}`);
  if(fields.toothMode)lines.push(`Режим: ${fields.toothMode}`);
  if(fields.jaw)lines.push(`Челюсть: ${fields.jaw==='upper'?'верхняя':'нижняя'}`);
  if(fields.productionType)lines.push(`Тип работы: ${fields.productionType==='analog'?'Аналог':'Цифра'}`);
  if(fields.dueDate)lines.push(`Срок: ${displayDate(fields.dueDate)}`);
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

export function createTelegramBridge({onClinicMessage=async()=>{},onBotMessage=async()=>{},saveTelegramAttachment=async()=>null,attachOrderFile=async()=>null,loadClinicAttachment=async()=>null,createLargeUploadLink=async()=>'',onOrderCreated=async()=>{}}={}){
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
    const response=await telegramFetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(method==='getUpdates'?35000:15000)});
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
    return {inline_keyboard:[[{text:'➕ Новый заказ',callback_data:'tgquick:new'},{text:'🔎 Статус заказа',callback_data:'tgquick:status'}],[{text:'✏️ Изменить заказ',callback_data:'tgquick:edit'},{text:'📅 Изменить срок',callback_data:'tgquick:due'}],[{text:'📎 Загрузить файл',callback_data:'tgquick:file'},{text:'❌ Отменить заказ',callback_data:'tgquick:cancel'}],[{text:'👤 Позвать человека',callback_data:'tgquick:human'}]]};
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
    state.guided[contextKey(chatId,userId)]={clinicId,orderId,mode,...extra,expiresAt:Date.now()+30*60*1000};
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
      lines.push('',`Предварительная стоимость: ${estimate.text}${estimate.amount!==null?` (${rubles(estimate.price)} × ${estimate.units} ед.)`:''}`,'Итоговую стоимость лаборатория подтвердит после проверки заказа.');
    }
    if(item.analysis.intent==='create_order'){
      const optional=[];
      if(!item.analysis.fields.birthDate)optional.push('дата рождения');
      if(!item.analysis.fields.comment)optional.push('комментарий');
      if(!attachmentList(item).length)optional.push('файлы');
      if(optional.length)lines.push('',`Не указано, но необязательно: ${optional.join(', ')}.`);
    }
    const files=attachmentList(item);
    if(files.length)lines.push('',`Файлы (${files.length}):`,...files.map(file=>`• ${file.name}`));
    const needsChiefApproval=['update_order','cancel_order'].includes(item.analysis.intent);
    lines.push('',`Запросил: ${item.actor}`,needsChiefApproval?'Отправить запрос главному технику?':'Выполнить это действие в CRM?');
    const cartKey=contextKey(item.chatId,item.userId),cartCount=(state.carts?.[cartKey]||[]).length;
    const buttons=item.analysis.intent==='create_order'
      ?[[{text:cartCount?`✅ Оформить все · ${cartCount+1}`:'✅ Подтвердить',callback_data:cartCount?`tgcartconfirm:${item.id}`:`tgconfirm:${item.id}`},{text:'✏️ Редактировать',callback_data:`tgedit:${item.id}`}],[{text:'🛒 Добавить ещё заказ',callback_data:`tgcartadd:${item.id}`}]]
      :[[{text:needsChiefApproval?'✅ Отправить запрос':'✅ Подтвердить',callback_data:`tgconfirm:${item.id}`}]];
    if(item.analysis.intent!=='create_order'){
      buttons.push([{text:'🔄 Другой заказ',callback_data:`tgreselect:${item.id}`},{text:'❌ Отменить',callback_data:`tgreject:${item.id}`}]);
    }else{
      buttons.push([{text:'❌ Отменить',callback_data:`tgreject:${item.id}`}]);
    }
    return send(item.chatId,lines.join('\n'),{reply_markup:{inline_keyboard:buttons}});
  }

  async function propose(message,clinic,analysis,attachment=null){
    const snapshot=portalSnapshot();
    const sourceKey=`${message.chat.id}:${message.message_id}`;
    if(state.messageActions[sourceKey])return;
    if(analysis.intent==='general_message')return;
    if(analysis.intent==='clarify')return send(message.chat.id,analysis.question||'Уточните, пожалуйста, что нужно сделать с заказом.');
    if(analysis.intent==='create_order'){
      const missing=missingCreateFields(analysis);
      if(missing.length){
        const wizardStep=missing.some(field=>field==='номер зуба или номера зубов'||field==='минимум два номера зубов для моста')?'teeth':'';
        rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep});
        await saveState();
        const replyMarkup=createOrderChoiceMarkup(analysis,wizardStep);
        return send(message.chat.id,createOrderWizardPrompt(analysis,wizardStep),replyMarkup?{reply_markup:replyMarkup}:{});
      }
      if(!analysis.fields.productionType){
        rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep:''});
        await saveState();
        return send(message.chat.id,createOrderWizardPrompt(analysis),{reply_markup:createOrderChoiceMarkup(analysis)});
      }
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
        state.pending[id]={id,chatId:String(message.chat.id),clinicId:clinic.id,userId:String(message.from?.id||''),actor:actorName(message),analysis,orderId:'',allowedOrderIds:found.matches.slice(0,8).map(item=>item.id),attachments:attachment?.orderEligible?[attachment]:[],createdAt:new Date().toISOString(),expiresAt:Date.now()+24*60*60*1000};
        state.messageActions[sourceKey]={id,at:new Date().toISOString()};
        await saveState();
        const buttons=found.matches.slice(0,8).map(item=>[{text:orderPickerLabel(item),callback_data:`tgpick:${id}:${item.id}`}]);
        buttons.push([{text:'❌ Отменить',callback_data:`tgreject:${id}`}]);
        return send(message.chat.id,'Нашлось несколько подходящих заказов. Выберите нужный:',{reply_markup:{inline_keyboard:buttons}});
      }
      order=found.order;
      if(!order)return send(message.chat.id,'Не удалось однозначно найти заказ этой клиники. Укажите фамилию пациента и, если возможно, ID заказа или вид работы.');
    }
    if(analysis.intent==='status_request'){rememberContext(message.chat.id,message.from?.id,clinic.id,order.id);await saveState();return send(message.chat.id,`Заказ ${order.id}\nПациент: ${order.patient}\nРабота: ${order.work}\nСрок: ${order.date}\nСтатус: ${orderStage(snapshot,order)}\n\nЭтот заказ выбран на ближайшие 2 часа.`)}
    if(analysis.intent==='update_order'&&!Object.keys(changedFields(order,analysis.fields)).length&&!attachment?.orderEligible)return send(message.chat.id,analysis.question||'Укажите, какие данные заказа нужно изменить.');
    if(analysis.intent==='rework_order'&&!analysis.fields.reason)return send(message.chat.id,'Опишите, пожалуйста, что именно нужно исправить.');
    if(analysis.intent==='accept_order'&&orderStage(snapshot,order)!=='В доставке')return send(message.chat.id,`Сейчас заказ ${order.id} находится на этапе «${orderStage(snapshot,order)}». Принять работу можно после перевода в доставку.`);
    if(analysis.intent==='rework_order'&&orderStage(snapshot,order)!=='В доставке')return send(message.chat.id,`Сейчас заказ ${order.id} находится на этапе «${orderStage(snapshot,order)}». Запрос доработки доступен после доставки.`);
    const id=randomBytes(10).toString('hex');
    state.pending[id]={id,chatId:String(message.chat.id),clinicId:clinic.id,userId:String(message.from?.id||''),actor:actorName(message),analysis,orderId:order?.id||'',targetOrderId:analysis.intent==='create_order'?orderId():'',attachments:attachment?.orderEligible?[attachment]:[],createdAt:new Date().toISOString(),expiresAt:Date.now()+24*60*60*1000};
    state.messageActions[sourceKey]={id,at:new Date().toISOString()};
    for(const [key,item] of Object.entries(state.pending))if(item.expiresAt<Date.now())delete state.pending[key];
    for(const [key,item] of Object.entries(state.messageActions))if(Date.parse(item?.at||0)<Date.now()-30*24*60*60*1000)delete state.messageActions[key];
    await saveState();
    return sendConfirmation(state.pending[id],order,clinic);
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
      const current=portalSnapshot();
      const existing=current.clientRequests.find(request=>request.telegramActionId===item.id);
      if(existing)return existing;
      const type=clientRequestType(analysis.intent,changes);
      const request={
        id:`cr-${randomBytes(10).toString('hex')}`,
        orderId:order.id,
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
      const fields=analysis.fields,teeth=safeTeeth(fields.teeth),id=item.targetOrderId||orderId();
      if(snapshot.orders.some(order=>order.id===id))return `Заказ ${id} уже был создан ранее.${await attach(id)}`;
      const selectedTeeth=fields.toothMode==='Челюсть'?(fields.jaw==='lower'?lowerTeeth:upperTeeth):teeth;
      const estimate=priceEstimate(analysis);
      const order={id,patient:fields.patient,birth:fields.birthDate||'',work:estimate.category?.name||fields.work,material:estimate.option?.name||fields.material||'',toothMode:fields.toothMode,bridgeRanges:fields.toothMode==='Мост'?[selectedTeeth]:[],quantity:estimate.units,date:displayDate(fields.dueDate),status:'Новый',sum:estimate.text,image:'tooth.png',clinicId:clinic.id,clinic:clinic.name,teeth:selectedTeeth,shade:fields.shade,comment:fields.comment||'',createdAt:new Date().toISOString(),source:'telegram',productionType:fields.productionType==='analog'?'analog':'digital',telegramDraft:false,telegramRequestedBy:item.actor,telegramConfirmedBy:callbackUser||item.actor,telegramActionId:item.id};
      await replacePortalCollection('orders',[order,...snapshot.orders],actor);
      const fresh=portalSnapshot();
      await replacePortalCollection('orderOverrides',{...fresh.orderOverrides,[id]:{stage:'Ожидает распределения'}},actor);
      try{await onOrderCreated(id)}catch(error){
        await replacePortalCollection('orders',snapshot.orders,actor).catch(()=>{});
        await replacePortalCollection('orderOverrides',snapshot.orderOverrides,actor).catch(()=>{});
        throw new Error('Не удалось создать папку заказа на Яндекс Диске. Заказ не создан');
      }
      await recordPortalEvent(id,actor,'telegram_confirmed',{summary:`Запросил: ${item.actor}; подтвердил: ${callbackUser||item.actor}`,clinicId:clinic.id,telegramActionId:item.id}).catch(()=>{});
      return `Заказ ${id} создан и отправлен главному технику на распределение.${await attach(id)}`;
    }
    const order=snapshot.orders.find(candidate=>candidate.id===item.orderId&&candidate.clinicId===clinic.id);
    if(!order)throw new Error('Заказ больше не найден');
    if(analysis.intent==='update_order'){
      const changes=changedFields(order,analysis.fields);
      if(['work','material','teeth','toothMode'].some(key=>Object.prototype.hasOwnProperty.call(changes,key))){
        const estimate=priceEstimate(analysis,order);
        if(estimate.amount!==null){changes.quantity=estimate.units;changes.sum=estimate.text}
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
      const prompts={new:'Опишите заказ одним текстовым или голосовым сообщением:\n\n1. Фамилия и имя пациента (обязательно); отчество — по желанию.\n2. Тип: «цифра» или «аналог». Если не укажете, бот предложит выбрать кнопкой.\n3. Режим: одиночка, мост или челюсть.\n4. Номера зубов либо верхняя/нижняя челюсть.\n5. Точная услуга из прайса.\n6. Желаемый срок.\n7. Цвет или «не требуется».\n\nДата рождения, комментарий и файлы необязательны. Если чего-то не хватит, я сохраню названные данные и подскажу варианты.'};
      if(id==='new'){rememberGuidedAction(callback.message.chat.id,callback.from?.id,clinic.id,'','new');await saveState()}
      await answerCallback(callback.id,'Готово');
      return send(callback.message.chat.id,prompts[id]||'Опишите, что нужно сделать с заказом.');
    }
    if(action==='tgnew'){
      const message=callback.message||{},clinic=boundClinicForMessage(message);
      if(!clinic)return answerCallback(callback.id,'Чат не подключён');
      const guided=currentGuidedAction(message.chat?.id,callback.from?.id,clinic.id);
      if(!guided||guided.mode!=='new')return answerCallback(callback.id,'Этот выбор устарел. Начните через /new');
      const analysis=canonicalizeCatalogSelection(normalizeAnalysis(guided.draftAnalysis||{intent:'create_order',fields:{}}));
      const catalog=catalogForPrompt();
      let wizardStep=guided.wizardStep||'',callbackText='Выбрано';
      if(id==='mode'){
        const modes={single:'Одиночка',bridge:'Мост',jaw:'Челюсть'};
        if(!modes[value])return answerCallback(callback.id,'Неизвестный режим');
        analysis.fields.toothMode=modes[value];analysis.fields.jaw='';
        if(value==='jaw')analysis.fields.teeth=[];
        wizardStep=value==='jaw'?'':'teeth';
      }else if(id==='jaw'){
        if(!['upper','lower'].includes(value))return answerCallback(callback.id,'Неизвестная челюсть');
        analysis.fields.toothMode='Челюсть';analysis.fields.jaw=value;analysis.fields.teeth=value==='upper'?[...upperTeeth]:[...lowerTeeth];wizardStep='';
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
        analysis.fields.work=category.category;analysis.fields.material=service.name;wizardStep='';callbackText='Услуга выбрана';
      }else if(id==='due'){
        if(value==='standard'){analysis.fields.dueDate=addDays(moscowDate(),14);wizardStep='';callbackText='Стандартный срок выбран'}
        else if(value==='custom'){
          rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep:'',awaitingInput:'due'});await saveState();
          await answerCallback(callback.id,'Жду дату');
          return editMessage(message.chat.id,message.message_id,'Напишите желаемую дату готовности текстом или отправьте голосовое сообщение.\n\nНапример: «20 октября 2026».');
        }else return answerCallback(callback.id,'Неизвестный срок');
      }else if(id==='shade'){
        if(value==='custom'){
          rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep:'',awaitingInput:'shade'});await saveState();
          await answerCallback(callback.id,'Жду оттенок');
          return editMessage(message.chat.id,message.message_id,'Напишите нужный оттенок текстом.\n\nНапример: «OM2».');
        }
        analysis.fields.shade=value==='none'?'Не требуется':cleanText(value,40);wizardStep='';callbackText='Цвет выбран';
      }else if(id==='type'){
        if(!['digital','analog'].includes(value))return answerCallback(callback.id,'Неизвестный тип работы');
        analysis.fields.productionType=value;wizardStep='';callbackText=value==='analog'?'Выбран аналог':'Выбрана цифра';
      }else return answerCallback(callback.id,'Неизвестное действие');

      const missing=missingCreateFields(analysis);
      if(!wizardStep&&missing.some(field=>field==='номер зуба или номера зубов'||field==='минимум два номера зубов для моста'))wizardStep='teeth';
      await answerCallback(callback.id,callbackText);
      if(missing.length||wizardStep){
        rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep});await saveState();
        const replyMarkup=createOrderChoiceMarkup(analysis,wizardStep);
        return editMessage(message.chat.id,message.message_id,createOrderWizardPrompt(analysis,wizardStep),replyMarkup);
      }
      if(!analysis.fields.productionType){
        rememberGuidedAction(message.chat.id,callback.from?.id,clinic.id,'','new',{draftAnalysis:analysis,wizardStep:''});await saveState();
        await answerCallback(callback.id,callbackText);
        return editMessage(message.chat.id,message.message_id,createOrderWizardPrompt(analysis),createOrderChoiceMarkup(analysis));
      }
      delete state.guided[contextKey(message.chat.id,callback.from?.id)];await saveState();
      await editMessage(message.chat.id,message.message_id,'Все обязательные пункты заполнены. Проверьте заказ ниже.');
      return propose({...message,from:callback.from},clinic,analysis,null);
    }
    if(action==='tgorder'&&id&&value){
      const clinic=boundClinicForMessage(callback.message||{});if(!clinic)return answerCallback(callback.id,'Чат не подключён');
      const snapshot=portalSnapshot(),order=activeOrdersForClinic(snapshot,clinic.id).find(item=>item.id===value);
      if(!order)return answerCallback(callback.id,'Заказ не найден');
      rememberContext(callback.message.chat.id,callback.from?.id,clinic.id,order.id);
      if(id==='status'){await saveState();await answerCallback(callback.id,'Статус готов');return send(callback.message.chat.id,`Заказ ${order.id}\nПациент: ${order.patient}\nРабота: ${order.work}\nСрок: ${order.date}\nСтатус: ${orderStage(snapshot,order)}`)}
      if(id==='edit'){
        await saveState();await answerCallback(callback.id,'Выберите пункт');
        return send(callback.message.chat.id,`Что изменить в заказе ${order.id}?`,{reply_markup:{inline_keyboard:[
          [{text:'👤 Пациент',callback_data:`tgoldedit:patient:${order.id}`},{text:'🎂 Дата рождения',callback_data:`tgoldedit:birth:${order.id}`}],
          [{text:'🦷 Режим / челюсть',callback_data:`tgoldedit:mode:${order.id}`},{text:'🔢 Зубы',callback_data:`tgoldedit:teeth:${order.id}`}],
          [{text:'🧾 Услуга',callback_data:`tgoldedit:service:${order.id}`},{text:'🎨 Цвет',callback_data:`tgoldedit:shade:${order.id}`}],
          [{text:'📅 Срок',callback_data:`tgoldedit:due:${order.id}`},{text:'💬 Комментарий',callback_data:`tgoldedit:comment:${order.id}`}]
        ]}});
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
    if(action==='tgoldedit'&&id&&value){
      const clinic=boundClinicForMessage(callback.message||{});if(!clinic)return answerCallback(callback.id,'Чат не подключён');
      const order=activeOrdersForClinic(portalSnapshot(),clinic.id).find(item=>item.id===value);if(!order)return answerCallback(callback.id,'Заказ не найден');
      const prompts={patient:'Напишите новое ФИО пациента.',birth:'Напишите новую дату рождения пациента.',mode:'Напишите новый режим и челюсть, если выбрана вся челюсть.',teeth:'Напишите новые номера зубов.',service:'Напишите точное название новой услуги.',shade:'Напишите новый цвет или «не требуется».',due:'Напишите новый срок с днём и месяцем.',comment:'Напишите комментарий к заказу.'};
      if(!prompts[id])return answerCallback(callback.id,'Пункт не найден');
      rememberGuidedAction(callback.message.chat.id,callback.from?.id,clinic.id,order.id,'edit',{field:id});await saveState();await answerCallback(callback.id,'Жду новое значение');
      return send(callback.message.chat.id,prompts[id]);
    }
    if(!['tgconfirm','tgreject','tgedit','tgeditfield','tgcartadd','tgcartconfirm','tgpick','tgreselect'].includes(action)||!id)return;
    const item=state.pending[id];
    if(!item&&state.completed[id])return answerCallback(callback.id,'Это действие уже выполнено');
    if(!item||item.expiresAt<Date.now()){if(item){delete state.pending[id];await saveState()}return answerCallback(callback.id,'Подтверждение устарело');}
    if(String(callback.message?.chat?.id)!==item.chatId)return answerCallback(callback.id,'Это подтверждение относится к другому чату');
    if(!canConfirm(item,callback))return answerCallback(callback.id,'Подтвердить может автор запроса или команда Create Dental');
    if(action==='tgpick'){
      if(!item.allowedOrderIds?.includes(value))return answerCallback(callback.id,'Заказ недоступен');
      const snapshot=portalSnapshot(),order=snapshot.orders.find(candidate=>candidate.id===value&&candidate.clinicId===item.clinicId);
      if(!order)return answerCallback(callback.id,'Заказ больше не найден');
      item.orderId=order.id;item.allowedOrderIds=[];rememberContext(item.chatId,item.userId,item.clinicId,order.id);await saveState();await answerCallback(callback.id,'Заказ выбран');
      if(item.analysis.intent==='status_request'){delete state.pending[id];await saveState();return send(item.chatId,`Заказ ${order.id}\nПациент: ${order.patient}\nРабота: ${order.work}\nСрок: ${order.date}\nСтатус: ${orderStage(snapshot,order)}`)}
      return sendConfirmation(item,order,portalClient(item.clinicId));
    }
    if(action==='tgreselect'){
      const orders=activeOrdersForClinic(portalSnapshot(),item.clinicId).slice(0,12);
      item.allowedOrderIds=orders.map(order=>order.id);await saveState();
      const buttons=orders.map(order=>[{text:orderPickerLabel(order),callback_data:`tgpick:${id}:${order.id}`}]);buttons.push([{text:'❌ Отменить',callback_data:`tgreject:${id}`}]);
      await answerCallback(callback.id,'Выберите заказ');return send(item.chatId,'Выберите заказ:',{reply_markup:{inline_keyboard:buttons}});
    }
    if(action==='tgedit'){
      if(item.analysis.intent!=='create_order')return answerCallback(callback.id,'Редактирование доступно только при создании заказа');
      await answerCallback(callback.id,'Выберите пункт');
      return send(item.chatId,'Что изменить?',{reply_markup:{inline_keyboard:[
        [{text:'👤 Пациент',callback_data:`tgeditfield:${id}:patient`},{text:'🎂 Дата рождения',callback_data:`tgeditfield:${id}:birth`}],
        [{text:'🦷 Режим / челюсть',callback_data:`tgeditfield:${id}:mode`},{text:'🔢 Зубы',callback_data:`tgeditfield:${id}:teeth`}],
        [{text:'🧾 Услуга',callback_data:`tgeditfield:${id}:service`},{text:'🎨 Цвет',callback_data:`tgeditfield:${id}:shade`}],
        [{text:'📅 Срок',callback_data:`tgeditfield:${id}:due`},{text:'💬 Комментарий',callback_data:`tgeditfield:${id}:comment`}]
      ]}});
    }
    if(action==='tgeditfield'){
      if(item.analysis.intent!=='create_order')return answerCallback(callback.id,'Этот заказ уже создан');
      const analysis=normalizeAnalysis(item.analysis),field=value;
      let awaitingInput='',wizardStep='',prompt='';
      if(field==='patient'){analysis.fields.patient='';awaitingInput='patient';prompt='Напишите фамилию и имя пациента. Отчество — по желанию.'}
      else if(field==='birth'){analysis.fields.birthDate='';awaitingInput='birth';prompt='Напишите дату рождения пациента, например: «12 марта 1987».'}
      else if(field==='mode'){analysis.fields.toothMode='';analysis.fields.jaw='';analysis.fields.teeth=[];prompt=createOrderWizardPrompt(analysis)}
      else if(field==='teeth'){analysis.fields.teeth=[];wizardStep='teeth';prompt=createOrderWizardPrompt(analysis,wizardStep)}
      else if(field==='service'){analysis.fields.work='';analysis.fields.material='';prompt=createOrderWizardPrompt(analysis)}
      else if(field==='shade'){analysis.fields.shade='';prompt=createOrderWizardPrompt(analysis)}
      else if(field==='due'){analysis.fields.dueDate='';prompt=createOrderWizardPrompt(analysis)}
      else if(field==='comment'){analysis.fields.comment='';awaitingInput='comment';prompt='Напишите новый комментарий к заказу.'}
      else return answerCallback(callback.id,'Пункт не найден');
      rememberGuidedAction(item.chatId,item.userId,item.clinicId,'','new',{draftAnalysis:analysis,wizardStep,awaitingInput});delete state.pending[id];await saveState();await answerCallback(callback.id,'Редактируем');
      return send(item.chatId,prompt,{reply_markup:createOrderChoiceMarkup(analysis,wizardStep)||undefined});
    }
    if(action==='tgcartadd'){
      if(item.analysis.intent!=='create_order')return answerCallback(callback.id,'В корзину можно добавить только новый заказ');
      const cartKey=contextKey(item.chatId,item.userId);state.carts[cartKey]=[...(state.carts[cartKey]||[]),item];delete state.pending[id];rememberGuidedAction(item.chatId,item.userId,item.clinicId,'','new');await saveState();await answerCallback(callback.id,'Добавлено в корзину');
      await editMessage(item.chatId,callback.message.message_id,`Заказ добавлен в корзину. В корзине: ${state.carts[cartKey].length}.`);
      return send(item.chatId,'Опишите следующий заказ текстом или голосовым сообщением. После проверки можно добавить ещё заказ или оформить всю корзину.');
    }
    if(action==='tgcartconfirm'){
      if(item.analysis.intent!=='create_order')return answerCallback(callback.id,'Корзина недоступна');
      const cartKey=contextKey(item.chatId,item.userId),items=[...(state.carts[cartKey]||[]),item];await answerCallback(callback.id,'Оформляю корзину');
      const results=[];try{for(const draft of items)results.push(await executePending(draft,callback));delete state.carts[cartKey];delete state.pending[id];await saveState();return send(item.chatId,`Корзина оформлена. Заказов создано: ${results.length}.\n\n${results.join('\n')}`)}catch(error){return send(item.chatId,`Не удалось полностью оформить корзину: ${cleanText(error.message,500)}. Проверьте созданные заказы в CRM.`)}
    }
    if(action==='tgreject'){
      delete state.pending[id];await saveState();await answerCallback(callback.id,'Отменено');return send(item.chatId,'Действие отменено. Данные CRM не изменены.');
    }
    await answerCallback(callback.id,'Выполняю');
    try{
      const result=await executePending(item,callback);rememberContext(item.chatId,item.userId,item.clinicId,item.orderId||item.targetOrderId);state.completed[id]={at:new Date().toISOString(),result};delete state.pending[id];for(const [key,done] of Object.entries(state.completed))if(Date.parse(done.at)<Date.now()-30*24*60*60*1000)delete state.completed[key];await saveState();await send(item.chatId,`${result}\n${['update_order','cancel_order'].includes(item.analysis.intent)?'Запрос отправил':'Подтвердил'}: ${actorName({from:callback.from})}`);
    }catch(error){await send(item.chatId,`Не удалось выполнить действие: ${cleanText(error.message,500)}. Данные CRM не изменены.`)}
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
        if(pending){pending.attachments=[...attachmentList(pending),storedAttachment].slice(-20);await saveState();await send(message.chat.id,`Файл «${storedAttachment.name}» добавлен. Всего файлов в действии: ${pending.attachments.length}.`);return}
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
      if(quickCommand==='new'){rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new');await saveState();return send(message.chat.id,'Опишите заказ одним текстовым или голосовым сообщением:\n\n1. Фамилия и имя пациента (обязательно); отчество — по желанию.\n2. Тип: «цифра» или «аналог». Если не укажете, бот предложит выбрать кнопкой.\n3. Режим: одиночка, мост или челюсть.\n4. Номера зубов либо верхняя/нижняя челюсть.\n5. Точная услуга из прайса.\n6. Желаемый срок.\n7. Цвет или «не требуется».\n\nДата рождения, комментарий и файлы необязательны. Если чего-то не хватит, я сохраню названные данные и подскажу варианты.')}
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
      if(guided.mode==='edit'){
        const field=guided.field;
        if(field==='due'&&!hasExplicitDueMonth(sourceText)){
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,guided.orderId,'edit',{field});await saveState();
          return send(message.chat.id,'Укажите день и месяц срока. Например: «10 ноября» или «10.11.2026».');
        }
        let parsed=normalizeAnalysis({intent:'update_order',orderId:guided.orderId,fields:{}});
        if(field==='shade')parsed.fields.shade=cleanText(sourceText,40);
        else if(field==='comment')parsed.fields.comment=cleanText(sourceText,1800);
        else{
          const labels={patient:'Новое ФИО пациента',birth:'Новая дата рождения пациента',mode:'Новый режим и челюсть',teeth:'Новые номера зубов',service:'Новая услуга из прайса',due:'Новый срок'};
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
        if(!Object.keys(fields).length){rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,guided.orderId,'edit',{field});await saveState();return send(message.chat.id,'Не удалось распознать новое значение. Напишите его ещё раз одним сообщением.')}
        guidedAnalysis=normalizeAnalysis({intent:'update_order',orderId:guided.orderId,fields,summary:`Изменение поля заказа ${guided.orderId}`});doneByLabel='Запросил изменение';
      }else if(guided.mode==='cancel'){
        const reason=cleanText(sourceText,1800);
        guidedAnalysis=normalizeAnalysis({intent:'cancel_order',orderId:guided.orderId,fields:{reason},summary:`Отмена заказа ${guided.orderId}: ${reason}`});
        doneByLabel='Отменил';
      }else if(guided.mode==='due'){
        if(!hasExplicitDueMonth(sourceText)){
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,guided.orderId,'due');await saveState();
          return send(message.chat.id,'Укажите день и месяц срока. Например: «10 ноября» или «10.11.2026».');
        }
        try{
          const parsed=await analyze(`Измени срок заказа ${guided.orderId}. Новый срок: ${sourceText}`,clinic,null,guided.orderId);
          if(!parsed.fields.dueDate){rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,guided.orderId,'due');await saveState();return send(message.chat.id,'Не удалось распознать дату. Напишите её, например: «20 октября 2026».')}
          guidedAnalysis=normalizeAnalysis({intent:'update_order',orderId:guided.orderId,fields:{dueDate:parsed.fields.dueDate},summary:`Новый срок заказа ${guided.orderId}: ${parsed.fields.dueDate}`});
          doneByLabel='Изменил';
        }catch(error){
          rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,guided.orderId,'due');await saveState();
          return send(message.chat.id,'Не удалось распознать дату. Напишите её, например: «20 октября 2026».');
        }
      }
      if(!guidedAnalysis){
        if(guided.mode==='new'&&guided.wizardStep==='teeth'){
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
          return send(message.chat.id,'Укажите день и месяц срока. Например: «10 ноября» или «10.11.2026».');
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
        const item={id,chatId:String(message.chat.id),clinicId:clinic.id,userId:String(message.from?.id||''),actor:actorName(message),analysis:guidedAnalysis,orderId:guided.orderId,attachments:[],createdAt:new Date().toISOString(),expiresAt:Date.now()+24*60*60*1000};
        try{
          const result=await executePending(item,{from:message.from});
          state.completed[id]={at:new Date().toISOString(),result};
          await saveState();
          return send(message.chat.id,`${result}\n${doneByLabel}: ${actorName(message)}`);
        }catch(error){
          return send(message.chat.id,`Не удалось выполнить действие: ${cleanText(error.message,500)}. Попробуйте ещё раз через меню.`);
        }
      }
    }
    const context=currentContext(message.chat.id,message.from?.id,clinic.id);
    try{
      let analysis=directCreateAnalysis||await analyze(sourceText,clinic,attachment,guided?.orderId||context?.orderId||'');
      if(guided?.mode==='new'&&!directCreateAnalysis)analysis=mergeCreateAnalysis(guided.draftAnalysis,analysis);
      await propose(message,clinic,analysis,attachment);
    }
    catch(error){
      if(guided?.mode==='new'){rememberGuidedAction(message.chat.id,message.from?.id,clinic.id,'','new',{draftAnalysis:guided.draftAnalysis,wizardStep:guided.wizardStep||'',awaitingInput:guided.awaitingInput||''});await saveState().catch(()=>{})}
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
      }catch(error){if(!stopped){health.lastErrorAt=new Date().toISOString();health.lastError=cleanText(error.message,300);console.error('Telegram polling failed:',error.message);await new Promise(resolve=>setTimeout(resolve,5000))}}
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
  async function sendAutomatedMessage(clinicId,text){
    const binding=state.bindings[clinicId],chatId=typeof binding==='object'?binding?.chatId:binding;
    if(!chatId||!token)return false;
    if(text)await send(chatId,text,{},true);
    return true;
  }
  async function notifyOrderStage(order,stage){
    if(!order?.clinicId)return false;
    return sendAutomatedMessage(order.clinicId,`Заказ ${order.id}\nПациент: ${order.patient}\nНовый статус: ${stage}`);
  }
  return {start,stop,status,reloadSecrets,sendClinicMessage,sendAutomatedMessage,notifyOrderStage,approveBinding,rejectBinding,unbindClinic};
}

export const telegramInternals={codeFromText,parseJson,normalizeAnalysis,canonicalizeCatalogSelection,priceEstimate,findOrder,surnameStem,surnameMatches,patientMatchesReference,attachmentCommandAnalysis,isSupportUsername,supportLabel,telegramMedia,messageAddsBot,welcomeText,hasFullPatientName,extractExplicitPatientName,repairPatientName,missingCreateFields,mergeCreateAnalysis,createOrderMissingPrompt,createOrderChoiceMarkup,createOrderWizardPrompt,parseGuidedTeethInput,displayDate,isoDateFromDisplay,hasExplicitDueMonth,orderCanReceiveFiles,orderPickerLabel,clientRequestType};
