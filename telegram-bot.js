import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {portalSnapshot,portalClient,replacePortalCollection,recordPortalEvent} from './portal-data.js';

const require=createRequire(import.meta.url);
const execFileAsync=promisify(execFile);

const telegramCodePattern=/\bCD-CL-\d{8}\b/i;
const upperTeeth=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const lowerTeeth=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
const validTeeth=new Set([...upperTeeth,...lowerTeeth]);
const allowedIntents=new Set(['create_order','update_order','cancel_order','status_request','accept_order','rework_order','general_message','clarify']);

function cleanText(value,max=4000){return String(value||'').replace(/[<>]/g,'').trim().slice(0,max)}
function codeFromText(value){return String(value||'').toUpperCase().match(telegramCodePattern)?.[0]||''}
function safeTeeth(value){return [...new Set((Array.isArray(value)?value:[]).map(Number).filter(number=>validTeeth.has(number)))].sort((a,b)=>a-b)}
function moscowDate(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
function addDays(dateValue,days){const date=new Date(`${dateValue}T12:00:00+03:00`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function displayDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return '';const [year,month,day]=value.split('-');return `${day}.${month}.${year}`}
function isoDateFromDisplay(value){const match=String(value||'').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return match?`${match[3]}-${match[2]}-${match[1]}`:''}
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
  const configured=String(process.env.TELEGRAM_SUPPORT_USERNAMES||'createdental,createdental_admin').split(',').map(normalizedUsername).filter(Boolean);
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

function findOrder(snapshot,clinicId,analysis){
  const orders=activeOrdersForClinic(snapshot,clinicId);
  const requestedId=cleanText(analysis.orderId,80).toUpperCase();
  if(requestedId){
    const exact=orders.find(order=>String(order.id).toUpperCase()===requestedId);
    return exact?{order:exact,matches:[exact]}:{order:null,matches:[]};
  }
  const surname=patientSurname(analysis.patientSurname||analysis.fields?.patient||'');
  if(!surname)return {order:null,matches:[]};
  const exactMatches=orders.filter(order=>normalize(order.patient).split(' ').includes(surname));
  const matches=exactMatches.length?exactMatches:orders.filter(order=>patientMatchesReference(order.patient,surname));
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
    patientSurname:cleanText(value?.patientSurname||fields.patient,160),
    fields:{
      patient:cleanText(fields.patient,160),work:cleanText(fields.work,160),material:cleanText(fields.material,180),
      teeth:safeTeeth(fields.teeth),toothMode:['Одиночка','Мост','Челюсть'].includes(fields.toothMode)?fields.toothMode:'',
      jaw:['upper','lower'].includes(fields.jaw)?fields.jaw:'',
      dueDate:/^\d{4}-\d{2}-\d{2}$/.test(fields.dueDate||'')?fields.dueDate:'',shade:cleanText(fields.shade,40),
      comment:cleanText(fields.comment,1800),reason:cleanText(fields.reason,1800)
    },
    summary:cleanText(value?.summary,1500),question:cleanText(value?.question,700)
  };
}

function buildPrompt(text,clinic,orders,snapshot,attachment=null){
  const orderList=orders.slice(0,60).map(order=>({id:order.id,patient:order.patient,work:order.work,material:order.material||'',teeth:order.teeth||[],due:order.date,status:orderStage(snapshot,order)}));
  const attachmentNote=attachment?.orderEligible?`\nК сообщению приложен файл: ${JSON.stringify(attachment.name)} (${attachment.kind==='photo'?'фото':'документ'}).`:'';
  return `Сегодня ${moscowDate()}, часовой пояс Europe/Moscow.\nКлиника: ${clinic.name}; код подключения: ${clinic.telegramCode}.\nДействующие заказы клиники: ${JSON.stringify(orderList)}\n\nСообщение клиента: ${JSON.stringify(text)}${attachmentNote}\n\nОпредели намерение и извлеки только прямо сообщенные данные. Верни только JSON без Markdown:\n{"intent":"create_order|update_order|cancel_order|status_request|accept_order|rework_order|general_message|clarify","confidence":0.0,"orderId":"","patientSurname":"","fields":{"patient":"","work":"","material":"","teeth":[],"toothMode":"Одиночка|Мост|Челюсть|","jaw":"upper|lower|","dueDate":"YYYY-MM-DD или пусто","shade":"","comment":"","reason":""},"summary":"краткое содержание","question":"вопрос при нехватке данных"}\n\nПравила:\n- Никогда не придумывай пациента, зубы, работу, материал, причину или номер заказа.\n- Если доктор называет только фамилию, запиши ее в patientSurname и fields.patient. Приводи фамилию к именительному падежу, например «Мамедову» — «Мамедов».\n- Для изменения, отмены, статуса, приемки и доработки используй orderId, если он назван. Иначе используй фамилию.\n- Команда «загрузи», «добавь», «прикрепи» или «закинь» приложенный файл к пациенту/заказу означает update_order. Другие поля при этом оставь пустыми.\n- Если речь о новом заказе, intent=create_order. Для создания обязательны пациент, работа и номера зубов либо явно указанная верхняя или нижняя челюсть.\n- Для всей верхней челюсти укажи toothMode=Челюсть и jaw=upper; для нижней jaw=lower.\n- Вопрос «что с заказом», «когда будет готов» означает status_request.\n- «Работу принимаю», «всё подходит» означает accept_order.\n- Просьба переделать или исправить означает rework_order, причину помести в fields.reason.\n- Обычное сообщение лаборатории без команды означает general_message.\n- Неопределенное намерение означает clarify.\n- Относительные даты преобразуй относительно сегодняшней даты.`;
}

function actionLabel(intent){return ({create_order:'Создать заказ',update_order:'Изменить заказ',cancel_order:'Отменить заказ',accept_order:'Принять работу',rework_order:'Отправить на доработку'})[intent]||'Выполнить действие'}
function summaryLines(analysis,order,clinic){
  const fields=analysis.fields;
  const lines=[actionLabel(analysis.intent),`Клиника: ${clinic.name}`];
  if(order)lines.push(`Заказ: ${order.id}`,`Пациент: ${order.patient}`);
  else if(fields.patient||analysis.patientSurname)lines.push(`Пациент: ${fields.patient||analysis.patientSurname}`);
  if(fields.work)lines.push(`Работа: ${fields.work}`);
  if(fields.material)lines.push(`Исполнение: ${fields.material}`);
  if(fields.teeth.length)lines.push(`Зубы: ${fields.teeth.join(', ')}`);
  if(fields.toothMode)lines.push(`Режим: ${fields.toothMode}`);
  if(fields.jaw)lines.push(`Челюсть: ${fields.jaw==='upper'?'верхняя':'нижняя'}`);
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
  if(fields.work)changes.work=fields.work;
  if(fields.material)changes.material=fields.material;
  if(fields.teeth.length){changes.teeth=fields.teeth;changes.quantity=fields.toothMode==='Челюсть'?1:fields.teeth.length}
  if(fields.toothMode)changes.toothMode=fields.toothMode;
  if(fields.dueDate)changes.date=displayDate(fields.dueDate);
  if(fields.shade)changes.shade=fields.shade;
  if(fields.comment&&!String(order.comment||'').split('\n').includes(fields.comment))changes.comment=[order.comment,fields.comment].filter(Boolean).join('\n');
  return changes;
}

function changeLines(order,fields){
  if(!order)return [];
  const changes=changedFields(order,fields),labels={patient:'Пациент',work:'Работа',material:'Исполнение',teeth:'Зубы',toothMode:'Режим',date:'Срок',shade:'Цвет',comment:'Комментарий'};
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

export function createTelegramBridge({onClinicMessage=async()=>{},onBotMessage=async()=>{},saveTelegramAttachment=async()=>null,attachOrderFile=async()=>null,loadClinicAttachment=async()=>null}={}){
  let token='',speechKey='',gptKey='',folderId='';
  let stopped=false,polling=false,state={offset:0,bindings:{},bindingRequests:{},pending:{},completed:{},contexts:{},messageActions:{},inbox:{}};
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
      if(clinicId)await onBotMessage(clinicId,{text,sender:'Ответ бота',telegramMessageId:result?.message_id,telegramChatId:String(chatId),messageRole:'bot'}).catch(()=>{});
    }
    return result;
  }
  async function answerCallback(id,text){return api('answerCallbackQuery',{callback_query_id:id,text,show_alert:false})}
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
    const response=await telegramFetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`,{signal:AbortSignal.timeout(40000)});
    if(!response.ok)throw new Error('Не удалось скачать вложение из Telegram');
    const declared=Number(response.headers.get('content-length'))||0;
    if(declared>maxBytes)throw new Error('Файл больше 20 МБ');
    const data=Buffer.from(await response.arrayBuffer());
    if(data.length>maxBytes)throw new Error('Файл больше 20 МБ');
    return data;
  }

  async function storeMessageAttachment(message,clinic){
    const media=telegramMedia(message);
    if(!media)return null;
    if(media.fileSize>20*1024*1024)throw new Error('Файл больше 20 МБ');
    const data=await downloadTelegramFile(media.fileId);
    let previewData=null;
    if(media.previewFileId){
      try{previewData=media.previewFileId===media.fileId?data:await downloadTelegramFile(media.previewFileId,350*1024)}catch{previewData=null}
    }else if(media.kind==='photo'&&data.length<=350*1024)previewData=data;
    return saveTelegramAttachment(clinic.id,{...media,data,previewData,sender:actorName(message)});
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
    const analysis=attachmentCommandAnalysis(text,attachment,clinic.id,snapshot,normalizeAnalysis(parseJson(result)),contextOrderId);
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
    if(existing)return send(chatId,'Запрос на подключение уже отправлен главному технику. После подтверждения бот сообщит об этом.',{},false);
    const id=randomBytes(10).toString('hex');
    state.bindingRequests[id]={id,clinicId:clinic.id,chatId,chatTitle:cleanText(message.chat?.title||'Чат Telegram',180),requestedBy:actorName(message),requestedByUserId:String(message.from?.id||''),requestedAt:new Date().toISOString(),expiresAt:Date.now()+30*60*1000};
    for(const [key,item] of Object.entries(state.bindingRequests))if(item.expiresAt<Date.now())delete state.bindingRequests[key];
    await saveState();
    await recordPortalEvent('',{role:'telegram',name:actorName(message)},'telegram_binding_requested',{clinicId:clinic.id,summary:`${clinic.name} · ${message.chat?.title||'чат Telegram'}`}).catch(()=>{});
    await send(chatId,`Запрос на подключение к клинике «${clinic.name}» отправлен главному технику. Код в названии чата можно убрать после подтверждения.`,{},false);
  }
  async function approveBinding(requestId,approvedBy='Главный техник'){
    const request=state.bindingRequests[requestId];
    if(!request||request.expiresAt<Date.now())throw new Error('Запрос устарел');
    const clinic=portalClient(request.clinicId);if(!clinic)throw new Error('Клиника не найдена');
    const previous=state.bindings[clinic.id],previousChatId=typeof previous==='object'?previous?.chatId:previous;
    state.bindings[clinic.id]={chatId:request.chatId,chatTitle:request.chatTitle,approvedBy,approvedAt:new Date().toISOString()};
    delete state.bindingRequests[requestId];await saveState();
    const snapshot=portalSnapshot();await replacePortalCollection('clients',snapshot.clients.map(client=>client.id===clinic.id?{...client,telegramCode:''}:client),{role:'technician',name:approvedBy});
    await send(request.chatId,`Чат безопасно подключён к клинике «${clinic.name}». Теперь код можно удалить из названия чата.`,{},false).catch(()=>{});
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

  function missingCreateFields(analysis){
    const missing=[];
    if(!(analysis.fields.patient||analysis.patientSurname))missing.push('фамилия пациента');
    if(!analysis.fields.work)missing.push('вид работы');
    if(!analysis.fields.teeth.length&&!(analysis.fields.toothMode==='Челюсть'&&analysis.fields.jaw))missing.push('номер зуба или верхнюю/нижнюю челюсть');
    return missing;
  }

  function attachmentList(item){return Array.isArray(item.attachments)?item.attachments:item.attachment?[item.attachment]:[]}
  async function sendConfirmation(item,order,clinic){
    const lines=summaryLines(item.analysis,order,clinic);
    const changes=changeLines(order,item.analysis.fields);
    if(changes.length)lines.push('','Изменения:',...changes.map(line=>`• ${line}`));
    const files=attachmentList(item);
    if(files.length)lines.push('',`Файлы (${files.length}):`,...files.map(file=>`• ${file.name}`));
    lines.push('',`Запросил: ${item.actor}`,'Выполнить это действие в CRM?');
    const first=[{text:'✅ Подтвердить',callback_data:`tgconfirm:${item.id}`}];if(item.analysis.intent!=='create_order')first.push({text:'✏️ Другой заказ',callback_data:`tgreselect:${item.id}`});
    return send(item.chatId,lines.join('\n'),{reply_markup:{inline_keyboard:[first,[{text:'❌ Отменить',callback_data:`tgreject:${item.id}`}]]}});
  }

  async function propose(message,clinic,analysis,attachment=null){
    const snapshot=portalSnapshot();
    const sourceKey=`${message.chat.id}:${message.message_id}`;
    if(state.messageActions[sourceKey])return;
    if(analysis.intent==='general_message')return;
    if(analysis.intent==='clarify')return send(message.chat.id,analysis.question||'Уточните, пожалуйста, что нужно сделать с заказом.');
    if(analysis.intent==='create_order'){
      const missing=missingCreateFields(analysis);
      if(missing.length)return send(message.chat.id,`Чтобы создать заказ, уточните: ${missing.join(', ')}.`);
      if(!analysis.fields.dueDate)analysis.fields.dueDate=addDays(moscowDate(),14);
    }
    let order=null;
    if(analysis.intent!=='create_order'){
      const found=findOrder(snapshot,clinic.id,analysis);
      if(found.matches.length>1){
        const id=randomBytes(10).toString('hex');
        state.pending[id]={id,chatId:String(message.chat.id),clinicId:clinic.id,userId:String(message.from?.id||''),actor:actorName(message),analysis,orderId:'',allowedOrderIds:found.matches.slice(0,8).map(item=>item.id),attachments:attachment?.orderEligible?[attachment]:[],createdAt:new Date().toISOString(),expiresAt:Date.now()+24*60*60*1000};
        state.messageActions[sourceKey]={id,at:new Date().toISOString()};
        await saveState();
        const buttons=found.matches.slice(0,8).map(item=>[{text:`${item.patient} · ${item.work} · ${item.date}`,callback_data:`tgpick:${id}:${item.id}`}]);
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
    if(analysis.intent==='create_order'){
      const fields=analysis.fields,teeth=safeTeeth(fields.teeth),id=item.targetOrderId||orderId();
      if(snapshot.orders.some(order=>order.id===id))return `Заказ ${id} уже был создан ранее.${await attach(id)}`;
      const selectedTeeth=fields.toothMode==='Челюсть'&&!teeth.length?(fields.jaw==='lower'?lowerTeeth:upperTeeth):teeth;
      const order={id,patient:fields.patient||analysis.patientSurname,work:fields.work,material:fields.material||'',toothMode:fields.toothMode||'Одиночка',bridgeRanges:[],quantity:fields.toothMode==='Челюсть'?1:Math.max(1,selectedTeeth.length),date:displayDate(fields.dueDate||addDays(moscowDate(),14)),status:'Новый',sum:'По согласованию',image:'tooth.png',clinicId:clinic.id,clinic:clinic.name,teeth:selectedTeeth,shade:fields.shade||'',comment:fields.comment||'',createdAt:new Date().toISOString(),source:'telegram',telegramDraft:true,telegramRequestedBy:item.actor,telegramConfirmedBy:callbackUser||item.actor,telegramActionId:item.id};
      await replacePortalCollection('orders',[order,...snapshot.orders],actor);
      const fresh=portalSnapshot();
      await replacePortalCollection('orderOverrides',{...fresh.orderOverrides,[id]:{stage:'Черновик из Telegram'}},actor);
      await recordPortalEvent(id,actor,'telegram_confirmed',{summary:`Запросил: ${item.actor}; подтвердил: ${callbackUser||item.actor}`,clinicId:clinic.id,telegramActionId:item.id}).catch(()=>{});
      return `Черновик заказа ${id} создан и отправлен главному технику на проверку.${await attach(id)}`;
    }
    const order=snapshot.orders.find(candidate=>candidate.id===item.orderId&&candidate.clinicId===clinic.id);
    if(!order)throw new Error('Заказ больше не найден');
    if(analysis.intent==='update_order'){
      const next={...order,...changedFields(order,analysis.fields),updatedAt:new Date().toISOString()};
      await replacePortalCollection('orders',snapshot.orders.map(candidate=>candidate.id===order.id?next:candidate),actor);
      await recordPortalEvent(order.id,actor,'telegram_confirmed',{summary:`Изменение запросил: ${item.actor}; подтвердил: ${callbackUser||item.actor}`,clinicId:clinic.id,telegramActionId:item.id}).catch(()=>{});
      return `Заказ ${order.id} изменён.${await attach(order.id)}`;
    }
    if(analysis.intent==='cancel_order'){
      const reason=analysis.fields.reason||analysis.summary||'Отмена по сообщению клиники';
      await replacePortalCollection('orders',snapshot.orders.map(candidate=>candidate.id===order.id?{...candidate,status:'Отменён',cancelledAt:new Date().toISOString(),cancelReason:reason}:candidate),actor);
      const fresh=portalSnapshot();
      await replacePortalCollection('orderOverrides',{...fresh.orderOverrides,[order.id]:{...(fresh.orderOverrides[order.id]||{}),stage:'Отменён',cancelledAt:new Date().toISOString(),cancelReason:reason}},actor);
      await recordPortalEvent(order.id,actor,'telegram_confirmed',{summary:`Отмену запросил: ${item.actor}; подтвердил: ${callbackUser||item.actor}`,clinicId:clinic.id,telegramActionId:item.id}).catch(()=>{});
      return `Заказ ${order.id} отменён.${await attach(order.id)}`;
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

  async function handleCallback(callback){
    const [action,id,value]=String(callback.data||'').split(':');
    if(action==='tgquick'){
      const clinic=boundClinicForMessage(callback.message||{});if(!clinic)return answerCallback(callback.id,'Чат не подключён');
      const prompts={new:'Опишите заказ: пациент, работа, зубы, материал и желаемый срок.',status:'Напишите фамилию пациента или выберите ранее найденный заказ.',file:'Пришлите файл или фото с подписью «прикрепи к [фамилия]».',due:'Напишите: «перенеси срок [фамилия] на [дата]».',cancel:'Напишите: «отмени заказ [фамилия]» и укажите причину.',human:'Главный техник получил запрос и увидит его в CRM.'};
      await answerCallback(callback.id,'Готово');
      if(id==='human')await onClinicMessage(clinic.id,{text:'Клиент просит подключить главного техника',sender:actorName({from:callback.from}),senderUsername:callback.from?.username||'',telegramMessageId:`callback-${callback.id}`,telegramChatId:String(callback.message?.chat?.id||''),messageRole:'client'}).catch(()=>{});
      return send(callback.message.chat.id,prompts[id]||'Опишите, что нужно сделать с заказом.');
    }
    if(!['tgconfirm','tgreject','tgpick','tgreselect'].includes(action)||!id)return;
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
      return sendConfirmation(item,order,portalClient(item.clinicId));
    }
    if(action==='tgreselect'){
      const orders=activeOrdersForClinic(portalSnapshot(),item.clinicId).slice(0,12);
      const buttons=orders.map(order=>[{text:`${order.patient} · ${order.work} · ${order.date}`,callback_data:`tgpick:${id}:${order.id}`}]);buttons.push([{text:'❌ Отменить',callback_data:`tgreject:${id}`}]);
      await answerCallback(callback.id,'Выберите заказ');return send(item.chatId,'Выберите заказ:',{reply_markup:{inline_keyboard:buttons}});
    }
    if(action==='tgreject'){
      delete state.pending[id];await saveState();await answerCallback(callback.id,'Отменено');return send(item.chatId,'Действие отменено. Данные CRM не изменены.');
    }
    await answerCallback(callback.id,'Выполняю');
    try{
      const result=await executePending(item,callback);rememberContext(item.chatId,item.userId,item.clinicId,item.orderId||item.targetOrderId);state.completed[id]={at:new Date().toISOString(),result};delete state.pending[id];for(const [key,done] of Object.entries(state.completed))if(Date.parse(done.at)<Date.now()-30*24*60*60*1000)delete state.completed[key];await saveState();await send(item.chatId,`${result}\nПодтвердил: ${actorName({from:callback.from})}`);
    }catch(error){await send(item.chatId,`Не удалось выполнить действие: ${cleanText(error.message,500)}. Данные CRM не изменены.`)}
  }

  async function sendMenu(chatId){
    return send(chatId,'Что нужно сделать?',{reply_markup:{inline_keyboard:[[{text:'➕ Новый заказ',callback_data:'tgquick:new'},{text:'🔎 Статус заказа',callback_data:'tgquick:status'}],[{text:'📎 Добавить файл',callback_data:'tgquick:file'},{text:'📅 Изменить срок',callback_data:'tgquick:due'}],[{text:'❌ Отменить заказ',callback_data:'tgquick:cancel'},{text:'👤 Главный техник',callback_data:'tgquick:human'}]]}});
  }

  async function handleMessage(message){
    if(!message||message.from?.is_bot)return;
    const text=cleanText(message.text||message.caption,6000);
    const command=text.split(/\s+/)[0]?.toLowerCase();
    let clinic=boundClinicForMessage(message);
    if(!clinic){
      const requested=requestedClinicForMessage(message);
      if(requested)await requestBinding(message,requested);
      else if(['/start','/connect','/help'].includes(command))await send(message.chat.id,'Добавьте временный код клиники вида CD-CL-12345678 в название группового чата и отправьте /connect. Главный техник подтвердит подключение в CRM.',{},false);
      return;
    }
    let attachment=null;
    try{attachment=await storeMessageAttachment(message,clinic)}catch(error){return send(message.chat.id,`Не удалось сохранить вложение: ${cleanText(error.message,300)}.`)}
    if(isSupportUsername(message.from?.username)){
      if(text||attachment)await onClinicMessage(clinic.id,{text:text||(attachment?.kind==='photo'?'Фото':`Документ: ${attachment?.name||''}`),attachment,sender:actorName(message),senderUsername:message.from.username,senderLabel:supportLabel(message.from.username),telegramMessageId:message.message_id,telegramChatId:String(message.chat.id),messageRole:'support'}).catch(()=>{});
      return;
    }
    if(['/start','/connect','/help','/menu'].includes(command))return sendMenu(message.chat.id);
    let sourceText=text;
    if(message.voice||message.audio){
      await api('sendChatAction',{chat_id:message.chat.id,action:'typing'}).catch(()=>{});
      try{sourceText=await transcribeVoice(message)}catch(error){return send(message.chat.id,`Не удалось расшифровать аудио: ${cleanText(error.message,500)}`)}
    }
    if(!sourceText&&!attachment)return;
    const chatText=sourceText||(attachment?.kind==='photo'?'Фото':`Документ: ${attachment?.name||''}`);
    await onClinicMessage(clinic.id,{text:message.voice||message.audio?`Голосовое сообщение: ${sourceText}`:chatText,attachment,sender:actorName(message),senderUsername:message.from?.username||'',telegramMessageId:message.message_id,telegramChatId:String(message.chat.id),messageRole:'client'}).catch(()=>{});
    if(message._edited)return;
    if(!sourceText&&attachment?.orderEligible){
      const pending=Object.values(state.pending).filter(item=>item.chatId===String(message.chat.id)&&item.userId===String(message.from?.id||'')&&item.expiresAt>Date.now()&&['create_order','update_order','cancel_order'].includes(item.analysis?.intent)).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))).at(-1);
      if(pending){pending.attachments=[...attachmentList(pending),attachment].slice(-20);delete pending.attachment;await saveState();await send(message.chat.id,`Файл «${attachment.name}» добавлен. Всего файлов в действии: ${pending.attachments.length}.`);return}
      const context=currentContext(message.chat.id,message.from?.id,clinic.id);
      if(context){const analysis=normalizeAnalysis({intent:'update_order',orderId:context.orderId,summary:`Прикрепить файл «${attachment.name}»`,fields:{}});return propose(message,clinic,analysis,attachment)}
      return;
    }
    if(!sourceText)return;
    const context=currentContext(message.chat.id,message.from?.id,clinic.id);
    try{const analysis=await analyze(sourceText,clinic,attachment,context?.orderId||'');await propose(message,clinic,analysis,attachment)}
    catch(error){health.lastErrorAt=new Date().toISOString();health.lastError=cleanText(error.message,300);console.error('Telegram analysis failed:',error.message);await send(message.chat.id,'Не удалось автоматически разобрать запрос. Укажите фамилию пациента и действие ещё раз или нажмите «Главный техник» в меню.');}
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
    if(ready&&!polling&&!stopped)void poll();
    return {...configured,ready,enabled:ready&&!stopped};
  }
  async function start(){
    try{state={offset:0,bindings:{},bindingRequests:{},pending:{},completed:{},contexts:{},messageActions:{},inbox:{},...JSON.parse(await fs.promises.readFile(stateFile,'utf8'))}}catch(error){if(error.code!=='ENOENT')throw error}
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

export const telegramInternals={codeFromText,parseJson,normalizeAnalysis,findOrder,surnameStem,surnameMatches,patientMatchesReference,attachmentCommandAnalysis,isSupportUsername,supportLabel,telegramMedia,missingCreateFields:(analysis)=>{const missing=[];if(!(analysis.fields.patient||analysis.patientSurname))missing.push('фамилия пациента');if(!analysis.fields.work)missing.push('вид работы');if(!analysis.fields.teeth.length&&!(analysis.fields.toothMode==='Челюсть'&&analysis.fields.jaw))missing.push('номер зуба или верхнюю/нижнюю челюсть');return missing},displayDate,isoDateFromDisplay};
