import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {portalSnapshot,portalClient,replacePortalCollection,recordPortalEvent} from './portal-data.js';

const telegramCodePattern=/\bCD-CL-\d{4,}\b/i;
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
function orderId(){return `CD-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`}
function actorName(message){const user=message?.from||{};return cleanText([user.first_name,user.last_name].filter(Boolean).join(' ')||user.username||'Клиент Telegram',120)}
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
  const matches=orders.filter(order=>patientSurname(order.patient)===surname);
  return {order:matches.length===1?matches[0]:null,matches};
}

function parseJson(text){
  const raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
  if(start<0||end<start)throw new Error('Модель не вернула структуру команды');
  return JSON.parse(raw.slice(start,end+1));
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

function buildPrompt(text,clinic,orders,snapshot){
  const orderList=orders.slice(0,60).map(order=>({id:order.id,patient:order.patient,work:order.work,material:order.material||'',teeth:order.teeth||[],due:order.date,status:orderStage(snapshot,order)}));
  return `Сегодня ${moscowDate()}, часовой пояс Europe/Moscow.\nКлиника: ${clinic.name}; постоянный код: ${clinic.telegramCode}.\nДействующие заказы клиники: ${JSON.stringify(orderList)}\n\nСообщение клиента: ${JSON.stringify(text)}\n\nОпредели намерение и извлеки только прямо сообщенные данные. Верни только JSON без Markdown:\n{"intent":"create_order|update_order|cancel_order|status_request|accept_order|rework_order|general_message|clarify","confidence":0.0,"orderId":"","patientSurname":"","fields":{"patient":"","work":"","material":"","teeth":[],"toothMode":"Одиночка|Мост|Челюсть|","jaw":"upper|lower|","dueDate":"YYYY-MM-DD или пусто","shade":"","comment":"","reason":""},"summary":"краткое содержание","question":"вопрос при нехватке данных"}\n\nПравила:\n- Никогда не придумывай пациента, зубы, работу, материал, причину или номер заказа.\n- Если доктор называет только фамилию, запиши ее в patientSurname и fields.patient.\n- Для изменения, отмены, статуса, приемки и доработки используй orderId, если он назван. Иначе используй фамилию.\n- Если речь о новом заказе, intent=create_order. Для создания обязательны пациент, работа и номера зубов либо явно указанная верхняя или нижняя челюсть.\n- Для всей верхней челюсти укажи toothMode=Челюсть и jaw=upper; для нижней jaw=lower.\n- Вопрос «что с заказом», «когда будет готов» означает status_request.\n- «Работу принимаю», «всё подходит» означает accept_order.\n- Просьба переделать или исправить означает rework_order, причину помести в fields.reason.\n- Обычное сообщение лаборатории без команды означает general_message.\n- Неопределенное намерение означает clarify.\n- Относительные даты преобразуй относительно сегодняшней даты.`;
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
  if(fields.comment)changes.comment=[order.comment,fields.comment].filter(Boolean).join('\n');
  return changes;
}

async function readSecret(name){
  if(process.env[name])return process.env[name].trim();
  const file=process.env[`${name}_FILE`];
  if(!file)return '';
  try{return (await fs.promises.readFile(file,'utf8')).trim()}catch(error){if(error.code==='ENOENT')return '';throw error}
}

export function createTelegramBridge({onClinicMessage=async()=>{},loadClinicAttachment=async()=>null}={}){
  let token='',speechKey='',gptKey='',folderId='';
  let stopped=false,polling=false,state={offset:0,bindings:{},pending:{}};
  const stateFile=process.env.TELEGRAM_STATE_FILE||path.join(process.cwd(),'.data','telegram-bot.json');

  async function saveState(){
    await fs.promises.mkdir(path.dirname(stateFile),{recursive:true,mode:0o700});
    await fs.promises.writeFile(stateFile+'.tmp',JSON.stringify(state),{mode:0o600});
    await fs.promises.rename(stateFile+'.tmp',stateFile);
  }
  async function api(method,body={}){
    const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(method==='getUpdates'?35000:15000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(`Telegram ${method}: ${data.description||response.status}`);
    return data.result;
  }
  async function send(chatId,text,extra={}){return api('sendMessage',{chat_id:chatId,text,disable_web_page_preview:true,...extra})}
  async function answerCallback(id,text){return api('answerCallbackQuery',{callback_query_id:id,text,show_alert:false})}

  async function transcribeVoice(message){
    const voice=message.voice||message.audio;
    if(!voice)throw new Error('В сообщении нет аудио');
    if(Number(voice.duration)>30||Number(voice.file_size)>1024*1024)throw new Error('Для первого запуска голосовое сообщение должно быть не длиннее 30 секунд и не больше 1 МБ');
    const file=await api('getFile',{file_id:voice.file_id});
    const download=await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`,{signal:AbortSignal.timeout(20000)});
    if(!download.ok)throw new Error('Не удалось скачать голосовое сообщение');
    const audio=Buffer.from(await download.arrayBuffer());
    const response=await fetch('https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&format=oggopus',{method:'POST',headers:{Authorization:`Api-Key ${speechKey}`,'Content-Type':'application/ogg'},body:audio,signal:AbortSignal.timeout(35000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.result)throw new Error(data.error_message||data.error_code||'SpeechKit не смог распознать сообщение');
    return cleanText(data.result,6000);
  }

  async function analyze(text,clinic){
    const snapshot=portalSnapshot(),orders=activeOrdersForClinic(snapshot,clinic.id);
    const response=await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion',{method:'POST',headers:{Authorization:`Api-Key ${gptKey}`,'Content-Type':'application/json'},body:JSON.stringify({modelUri:`gpt://${folderId}/yandexgpt-lite/latest`,completionOptions:{stream:false,temperature:0.1,maxTokens:1800},messages:[{role:'system',text:'Ты аккуратно преобразуешь сообщения стоматологов в команды для CRM зуботехнической лаборатории. Строго соблюдай схему и не выдумывай данные.'},{role:'user',text:buildPrompt(text,clinic,orders,snapshot)}]}),signal:AbortSignal.timeout(45000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||'YandexGPT не смог разобрать сообщение');
    const result=data.result?.alternatives?.[0]?.message?.text;
    return normalizeAnalysis(parseJson(result));
  }

  function clinicForMessage(message){
    const code=codeFromText(message.chat?.title)||codeFromText(message.text);
    if(!code)return null;
    return portalSnapshot().clients.find(client=>!client.deleted&&String(client.telegramCode).toUpperCase()===code)||null;
  }

  async function bindChat(message,clinic){
    const key=String(message.chat.id),changed=state.bindings[clinic.id]!==key;
    state.bindings[clinic.id]=key;
    if(changed){await saveState();await send(key,`Чат подключён к клинике ${clinic.name} (${clinic.telegramCode}).`)}
  }

  function missingCreateFields(analysis){
    const missing=[];
    if(!(analysis.fields.patient||analysis.patientSurname))missing.push('фамилия пациента');
    if(!analysis.fields.work)missing.push('вид работы');
    if(!analysis.fields.teeth.length&&!(analysis.fields.toothMode==='Челюсть'&&analysis.fields.jaw))missing.push('номер зуба или верхнюю/нижнюю челюсть');
    return missing;
  }

  async function propose(message,clinic,analysis){
    const snapshot=portalSnapshot();
    if(analysis.intent==='general_message')return send(message.chat.id,'Сообщение передано в CRM лаборатории.');
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
        const choices=found.matches.slice(0,8).map(item=>`• ${item.id} — ${item.patient}, ${item.work}, срок ${item.date}`).join('\n');
        return send(message.chat.id,`Нашлось несколько заказов с этой фамилией. Укажите ID заказа или дополнительные данные:\n${choices}`);
      }
      order=found.order;
      if(!order)return send(message.chat.id,'Не удалось однозначно найти заказ этой клиники. Укажите фамилию пациента и, если возможно, ID заказа или вид работы.');
    }
    if(analysis.intent==='status_request')return send(message.chat.id,`Заказ ${order.id}\nПациент: ${order.patient}\nРабота: ${order.work}\nСрок: ${order.date}\nСтатус: ${orderStage(snapshot,order)}`);
    if(analysis.intent==='update_order'&&!Object.keys(changedFields(order,analysis.fields)).length)return send(message.chat.id,analysis.question||'Укажите, какие данные заказа нужно изменить.');
    if(analysis.intent==='rework_order'&&!analysis.fields.reason)return send(message.chat.id,'Опишите, пожалуйста, что именно нужно исправить.');
    if(analysis.intent==='accept_order'&&orderStage(snapshot,order)!=='В доставке')return send(message.chat.id,`Сейчас заказ ${order.id} находится на этапе «${orderStage(snapshot,order)}». Принять работу можно после перевода в доставку.`);
    if(analysis.intent==='rework_order'&&orderStage(snapshot,order)!=='В доставке')return send(message.chat.id,`Сейчас заказ ${order.id} находится на этапе «${orderStage(snapshot,order)}». Запрос доработки доступен после доставки.`);
    const id=randomBytes(10).toString('hex');
    state.pending[id]={id,chatId:String(message.chat.id),clinicId:clinic.id,userId:String(message.from?.id||''),actor:actorName(message),analysis,orderId:order?.id||'',createdAt:new Date().toISOString(),expiresAt:Date.now()+24*60*60*1000};
    for(const [key,item] of Object.entries(state.pending))if(item.expiresAt<Date.now())delete state.pending[key];
    await saveState();
    const lines=summaryLines(analysis,order,clinic);
    lines.push('','Выполнить это действие в CRM?');
    return send(message.chat.id,lines.join('\n'),{reply_markup:{inline_keyboard:[[{text:'✅ Подтвердить',callback_data:`tgconfirm:${id}`},{text:'❌ Отменить',callback_data:`tgreject:${id}`}]]}});
  }

  async function executePending(item,callback){
    const snapshot=portalSnapshot(),clinic=portalClient(item.clinicId),analysis=item.analysis;
    if(!clinic)throw new Error('Клиника больше не найдена');
    const callbackUser=cleanText([callback.from?.first_name,callback.from?.last_name].filter(Boolean).join(' ')||callback.from?.username||'',120);
    const actor={role:'telegram',name:`Telegram · ${callbackUser||item.actor}`};
    if(analysis.intent==='create_order'){
      const fields=analysis.fields,teeth=safeTeeth(fields.teeth),id=orderId();
      const selectedTeeth=fields.toothMode==='Челюсть'&&!teeth.length?(fields.jaw==='lower'?lowerTeeth:upperTeeth):teeth;
      const order={id,patient:fields.patient||analysis.patientSurname,work:fields.work,material:fields.material||'',toothMode:fields.toothMode||'Одиночка',bridgeRanges:[],quantity:fields.toothMode==='Челюсть'?1:Math.max(1,selectedTeeth.length),date:displayDate(fields.dueDate||addDays(moscowDate(),14)),status:'Новый',sum:'По согласованию',image:'tooth.png',clinicId:clinic.id,clinic:clinic.name,teeth:selectedTeeth,shade:fields.shade||'',comment:fields.comment||'',createdAt:new Date().toISOString(),source:'telegram'};
      await replacePortalCollection('orders',[order,...snapshot.orders],actor);
      return `Заказ ${id} создан и появился в CRM.`;
    }
    const order=snapshot.orders.find(candidate=>candidate.id===item.orderId&&candidate.clinicId===clinic.id);
    if(!order)throw new Error('Заказ больше не найден');
    if(analysis.intent==='update_order'){
      const next={...order,...changedFields(order,analysis.fields),updatedAt:new Date().toISOString()};
      await replacePortalCollection('orders',snapshot.orders.map(candidate=>candidate.id===order.id?next:candidate),actor);
      return `Заказ ${order.id} изменён.`;
    }
    if(analysis.intent==='cancel_order'){
      const reason=analysis.fields.reason||analysis.summary||'Отмена по сообщению клиники';
      await replacePortalCollection('orders',snapshot.orders.map(candidate=>candidate.id===order.id?{...candidate,status:'Отменён',cancelledAt:new Date().toISOString(),cancelReason:reason}:candidate),actor);
      const fresh=portalSnapshot();
      await replacePortalCollection('orderOverrides',{...fresh.orderOverrides,[order.id]:{...(fresh.orderOverrides[order.id]||{}),stage:'Отменён',cancelledAt:new Date().toISOString(),cancelReason:reason}},actor);
      return `Заказ ${order.id} отменён.`;
    }
    if(analysis.intent==='accept_order'){
      await replacePortalCollection('orderOverrides',{...snapshot.orderOverrides,[order.id]:{...(snapshot.orderOverrides[order.id]||{}),stage:'Принято доктором',doctorAcceptedAt:new Date().toISOString()}},actor);
      return `Работа по заказу ${order.id} принята.`;
    }
    if(analysis.intent==='rework_order'){
      await replacePortalCollection('orderOverrides',{...snapshot.orderOverrides,[order.id]:{...(snapshot.orderOverrides[order.id]||{}),stage:'На доработке',reworkReason:analysis.fields.reason,reworkAt:new Date().toISOString()}},actor);
      return `Заказ ${order.id} отправлен на доработку.`;
    }
    throw new Error('Неподдерживаемое действие');
  }

  async function handleCallback(callback){
    const [action,id]=String(callback.data||'').split(':');
    if(!['tgconfirm','tgreject'].includes(action)||!id)return;
    const item=state.pending[id];
    if(!item||item.expiresAt<Date.now()){if(item){delete state.pending[id];await saveState()}return answerCallback(callback.id,'Подтверждение устарело');}
    if(String(callback.message?.chat?.id)!==item.chatId)return answerCallback(callback.id,'Это подтверждение относится к другому чату');
    if(action==='tgreject'){
      delete state.pending[id];await saveState();await answerCallback(callback.id,'Отменено');return send(item.chatId,'Действие отменено. Данные CRM не изменены.');
    }
    await answerCallback(callback.id,'Выполняю');
    try{
      const result=await executePending(item,callback);delete state.pending[id];await saveState();await send(item.chatId,result);
    }catch(error){await send(item.chatId,`Не удалось выполнить действие: ${cleanText(error.message,500)}. Данные CRM не изменены.`)}
  }

  async function handleMessage(message){
    if(!message||message.from?.is_bot)return;
    const text=cleanText(message.text||message.caption,6000);
    const command=text.split(/\s+/)[0]?.toLowerCase();
    const clinic=clinicForMessage(message);
    if(!clinic){
      if(command==='/start'||command==='/connect')await send(message.chat.id,'Добавьте постоянный ID клиники вида CD-CL-0001 в название группового чата. ID находится в CRM: «Заказчики».');
      return;
    }
    await bindChat(message,clinic);
    if(['/start','/connect','/help'].includes(command))return send(message.chat.id,'Подключение работает. Отправьте текст или голосовое сообщение. Перед созданием, изменением, отменой, приемкой или доработкой заказа бот обязательно попросит подтверждение.');
    let sourceText=text;
    if(message.voice||message.audio){
      await send(message.chat.id,'Расшифровываю голосовое сообщение…');
      try{sourceText=await transcribeVoice(message);await send(message.chat.id,`Расшифровка:\n${sourceText}`)}catch(error){return send(message.chat.id,`Не удалось расшифровать аудио: ${cleanText(error.message,500)}`)}
    }
    if(!sourceText)return;
    await onClinicMessage(clinic.id,{text:message.voice||message.audio?`Голосовое сообщение. Расшифровка: ${sourceText}`:sourceText,sender:actorName(message),telegramMessageId:message.message_id,telegramChatId:String(message.chat.id)}).catch(()=>{});
    try{const analysis=await analyze(sourceText,clinic);await propose(message,clinic,analysis)}
    catch(error){console.error('Telegram analysis failed:',error.message);await send(message.chat.id,'Сообщение передано в CRM, но автоматический разбор сейчас не сработал. Главный техник увидит его в сообщениях.');}
  }

  async function handleUpdate(update){if(update.callback_query)return handleCallback(update.callback_query);if(update.message)return handleMessage(update.message)}
  async function poll(){
    if(polling||stopped||!token)return;polling=true;
    while(!stopped){
      try{
        const updates=await api('getUpdates',{offset:state.offset,timeout:25,allowed_updates:['message','callback_query']});
        for(const update of updates){state.offset=Math.max(state.offset,Number(update.update_id)+1);try{await handleUpdate(update)}catch(error){console.error('Telegram update failed:',error.message)}await saveState()}
      }catch(error){if(!stopped){console.error('Telegram polling failed:',error.message);await new Promise(resolve=>setTimeout(resolve,5000))}}
    }
    polling=false;
  }

  async function start(){
    [token,speechKey,gptKey,folderId]=await Promise.all([readSecret('TELEGRAM_BOT_TOKEN'),readSecret('YANDEX_SPEECHKIT_API_KEY'),readSecret('YANDEX_GPT_API_KEY'),readSecret('YANDEX_FOLDER_ID')]);
    if(!token||!speechKey||!gptKey||!folderId){console.log('Telegram bridge disabled: secret files are not configured');return false}
    try{state={offset:0,bindings:{},pending:{},...JSON.parse(await fs.promises.readFile(stateFile,'utf8'))}}catch(error){if(error.code!=='ENOENT')throw error}
    stopped=false;void poll();console.log('Telegram bridge enabled');return true;
  }
  function stop(){stopped=true}
  async function sendClinicMessage(clinicId,text,attachment){
    const chatId=state.bindings[clinicId];if(!chatId||!token)return false;
    if(attachment){
      const loaded=await loadClinicAttachment(attachment.id);
      if(loaded?.data){
        const form=new FormData();form.set('chat_id',chatId);if(text)form.set('caption',cleanText(text,900));form.set('document',new Blob([loaded.data],{type:attachment.type||'application/octet-stream'}),attachment.name||'file');
        const response=await fetch(`https://api.telegram.org/bot${token}/sendDocument`,{method:'POST',body:form,signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw new Error('Telegram не принял файл');return true;
      }
    }
    if(text)await send(chatId,text);return true;
  }
  return {start,stop,sendClinicMessage};
}

export const telegramInternals={codeFromText,normalizeAnalysis,findOrder,missingCreateFields:(analysis)=>{const missing=[];if(!(analysis.fields.patient||analysis.patientSurname))missing.push('фамилия пациента');if(!analysis.fields.work)missing.push('вид работы');if(!analysis.fields.teeth.length&&!(analysis.fields.toothMode==='Челюсть'&&analysis.fields.jaw))missing.push('номер зуба или верхнюю/нижнюю челюсть');return missing},displayDate,isoDateFromDisplay};
