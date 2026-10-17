import {savePortal,authRequest,portalToken,loadOrderFiles,loadCadReviewHtml,deleteOrder,uploadOrderFile,uploadClinicMessageFile,downloadClinicMessageFile} from './portal-client.js?v=yandex-upload-11';
import {routeFromPath,pathFor,navigate} from './routes.js?v=worker-salary-1';
import {notificationCenterMarkup,toggleNotificationCenter,closeNotificationCenter,markNotificationCenterRead} from './notification-center.js?v=dashboard-layout-4';
import {workCatalog,rubles} from './work-catalog.js?v=work-prices-5';
import {themeToggleMarkup,languageSwitcherMarkup} from './theme.js?v=portal-language-1';

export const seedEmployees = [];
export function loadEmployees(){
  try {
    const saved=JSON.parse(localStorage.getItem('create-dental-employees')||'null');
    if(Array.isArray(saved))return saved.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string');
  } catch { /* Use demo team when local data is invalid. */ }
  return seedEmployees.map(item=>({...item}));
}
export const seedClients = [];
export const stages = ['Черновик из Telegram','Ожидает распределения', 'Подготовка', 'Моделирование', 'Согласование CAD', 'Препрод', 'Изготовление', 'Контроль качества', 'Работа принята', 'В доставке', 'На доработке', 'Принято доктором'];
export const manufacturingStatuses = ['В работе у Каркасиста','В работе у Красильщика'];
export const chiefStages = stages.flatMap(stage=>stage==='Изготовление'?manufacturingStatuses:[stage]);
// Текущие внутренние этапы сохраняются для переходов и интеграций, а в кабинетах
// показываем понятную клиентскую последовательность из девяти статусов.
export const productionStages = [
  {label:'Ожидает подтверждения',matches:['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения']},
  {label:'Приём / Доставка',matches:['Подготовка']},
  {label:'Моделирование',matches:['Моделирование']},
  {label:'CAD на согласовании у врача',matches:['Согласование CAD']},
  {label:'Аналоговая подготовка',matches:['Препрод']},
  {label:'Изготовление',matches:['Изготовление']},
  {label:'Доработка и эстетика',matches:['На доработке']},
  {label:'Контроль качества',matches:['Контроль качества']},
  {label:'Доставка в клинику',matches:['В доставке']},
  {label:'Принято врачом',matches:['Работа принята','Принято доктором','Готово к выдаче']}
];
export const productionStageIndex = stage => {
  const index=productionStages.findIndex(item=>item.matches.includes(stage));
  return index<0?0:index;
};
export const productionStageLabel = stage => productionStages[productionStageIndex(stage)]?.label || stage;
const monthLabels = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const analyticsYear = new Date().getFullYear();
export const seedDetails = {};

const money = amount => new Intl.NumberFormat('ru-RU').format(amount) + ' ₽';
const safe = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const formatPhone = value => {
  let digits=String(value||'').replace(/\D/g,'');
  if(digits.startsWith('7')||digits.startsWith('8'))digits=digits.slice(1);
  digits=digits.slice(0,10);
  if(!digits)return '';
  let result='+7 ('+digits.slice(0,3);
  if(digits.length>=3)result+=')';
  if(digits.length>3)result+=' '+digits.slice(3,6);
  if(digits.length>6)result+='-'+digits.slice(6,8);
  if(digits.length>8)result+='-'+digits.slice(8,10);
  return result;
};
const phoneDisplay = value => formatPhone(value)||String(value||'—');
const formattedMessageText = value => safe(value).replace(/\s+(?=(?:Клиника|Заказ|Пациент|Работа|Исполнение|Зубы|Режим|Челюсть|Срок|Цвет|Причина|Содержание|Запросил|Выполнить это действие в CRM)\s*:)/g,'\n');
const parseDate = value => {const [day,month,year]=value.split('.').map(Number);return new Date(year,month-1,day)};
const stageTone = stage => ['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(stage)?'new':['Согласование CAD','Контроль качества'].includes(stage)?'review':['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(stage)?'ready':'work';
const isCadOperatorEmployee = employee => /cad\s*\/?\s*cam|cadcam|cad\s*оператор|моделировщик/i.test(String(employee?.specialty||''));
const normalizeEmployeeSpecialty = value => {const text=String(value||'').trim();if(/cad\s*\/?\s*cam|cadcam|cad\s*оператор|моделировщик/i.test(text))return 'CAD/CAM оператор';if(/препрод|pre\s*prod|предпрод/i.test(text))return 'Препрод техник';if(/зубной\s+техник|каркасист|cam\s*оператор/i.test(text))return 'Каркасист';if(/красильщик|керамист|эстетист/i.test(text))return 'Красильщик';return text||'Каркасист'};
const employeeSpecialtyLabel = value => normalizeEmployeeSpecialty(value);
const employeeSpecialtyDisplayLabel = value => ({'Каркасист':'CAM оператор','Красильщик':'Эстетист','CAD/CAM оператор':'CAD оператор','Препрод техник':'Препрод техник'}[normalizeEmployeeSpecialty(value)]||normalizeEmployeeSpecialty(value));
const isPreprodEmployee = employee => employeeSpecialtyLabel(employee?.specialty)==='Препрод техник';
const isFrameEmployee = employee => employeeSpecialtyLabel(employee?.specialty)==='Каркасист';
const isPainterEmployee = employee => employeeSpecialtyLabel(employee?.specialty)==='Красильщик';
const initials = value => String(value||'ГТ').trim().split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase()||'ГТ';
const shortDate = value => value ? new Date(value).toLocaleDateString('ru-RU') : '—';
const displayActor = event => event?.actor || (event?.actorRole === 'clinic' ? 'Клиент' : 'Create Dental Team');

export function createTechnicianCabinet({root,orders,assets,logo,icon,toothChart,isActive,currentUser,orderHistory=()=>[],clientRequests=()=>[],onUserUpdate=()=>{}}) {
  let overrides={};
  try { overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders') || '{}') || {}; } catch { overrides={}; }
  let team=loadEmployees();
  let clients=seedClients.map(client=>({...client}));
  try {
    const saved=JSON.parse(localStorage.getItem('create-dental-tech-clients') || 'null');
    if(Array.isArray(saved))clients=saved.filter(client=>client&&typeof client.id==='string'&&typeof client.name==='string');
  } catch { /* Keep the demo directory if local data is damaged. */ }
  const initialRoute=routeFromPath(location.pathname);
  const state={page:initialRoute.role==='technician'?initialRoute.page:'overview',filter:'Все',search:'',orderDueFilter:'',orderId:initialRoute.orderId||'',month:new Date().getMonth(),technician:'Все техники',metric:'revenue',sort:'revenue',orderSortKey:'createdAt',orderSortDirection:'desc',orderFilterOpen:false,orderClinicFilter:'',orderMonthFilter:'',clientSearch:'',requestFilter:'all',editClientId:null,confirmDeleteId:null,employeeSearch:'',employeeFilter:'all',editEmployeeId:null,confirmFireId:null,conversations:[],activeConversation:null,conversationMessages:[],messageAttachment:null,messagesError:'',deadlineMonth:new Date(new Date().getFullYear(),new Date().getMonth(),1),deadlineDay:new Date().getDate(),profile:null,integration:null,integrationLoading:false,editOrderId:null,editOrderVariants:null,confirmOrderDeleteId:null,orderUpload:null,cadPreview:null,toast:''};
  let cadPreviewRequest=0;
  let messagesRequest=0;
  const chiefAvatarKey='create-dental-chief-avatar';
  function storedChiefAvatar(){try{return localStorage.getItem(chiefAvatarKey)||''}catch{return ''}}
  function storeChiefAvatar(avatar){try{avatar?localStorage.setItem(chiefAvatarKey,avatar):localStorage.removeItem(chiefAvatarKey)}catch{/* Local storage can be full or unavailable. */}}
  function chiefProfile(){const profile={...(currentUser()||{}),...(state.profile||{})};if(!profile.avatar)profile.avatar=storedChiefAvatar();return profile}
  function avatarMarkup(profile,sizeClass=''){
    return profile.avatar?`<span class="tech-person-avatar ${sizeClass}"><img src="${safe(profile.avatar)}" alt=""></span>`:`<span class="tech-person-avatar ${sizeClass}">${safe(initials(profile.displayName||'Главный техник'))}</span>`;
  }
  function avatarFromFile(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('Не удалось прочитать файл'));
      reader.onload=()=>{
        const image=new Image();
        image.onerror=()=>reject(new Error('Загрузите изображение PNG, JPG или WebP'));
        image.onload=()=>{
          const size=Math.min(image.width,image.height),sx=(image.width-size)/2,sy=(image.height-size)/2;
          const makeAvatar=(side,quality)=>{
            const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
            canvas.width=side;canvas.height=side;
            ctx.drawImage(image,sx,sy,size,size,0,0,side,side);
            return canvas.toDataURL('image/jpeg',quality);
          };
          let avatar=makeAvatar(180,0.7);
          for(const [side,quality] of [[150,0.66],[120,0.58],[96,0.52]]){
            if(avatar.length<180000)break;
            avatar=makeAvatar(side,quality);
          }
          if(avatar.length>450000)return reject(new Error('Фото слишком большое. Попробуйте другое изображение.'));
          resolve(avatar);
        };
        image.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function setPage(page){
    state.page=page;
    navigate(pathFor('technician',page,state.orderId));
    render();
    if(page==='requests')queueMicrotask(refreshClientRequests);
  }
  function saveClients(){localStorage.setItem('create-dental-tech-clients',JSON.stringify(clients));savePortal('clients',clients).catch(error=>toast('Не удалось сохранить клиентов на сервере: '+error.message))}
  function nextTelegramCode(){
    const used=new Set(clients.map(client=>client.telegramCode));
    let code='';
    do {const values=new Uint32Array(1);crypto.getRandomValues(values);code=`CD-CL-${String(values[0]%100000000).padStart(8,'0')}`} while(used.has(code));
    return code;
  }
  async function copyText(value){
    try {await navigator.clipboard.writeText(value)}
    catch {
      const input=document.createElement('textarea');input.value=value;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();document.execCommand('copy');input.remove();
    }
  }
  function clientName(original){return clients.find(client=>client.originalName===original)?.name||original}
  function saveTeam(){localStorage.setItem('create-dental-employees',JSON.stringify(team));return savePortal('employees',team).catch(error=>{toast('Не удалось сохранить команду на сервере: '+error.message);throw error})}
  function employeeName(original){return team.find(employee=>employee.originalName===original)?.name||original}
  function activeTeam(){return team.filter(employee=>employee.status==='active')}
  async function saveChiefProfile(change,successMessage){
    const profile={...chiefProfile(),...change};
    if(Object.prototype.hasOwnProperty.call(change,'avatar')){
      storeChiefAvatar(profile.avatar||'');
      state.profile=profile;
      onUserUpdate(profile);
      render();
    }
    try{
      const data=await authRequest('chief-profile',{displayName:profile.displayName||'Главный техник',email:profile.email||'',avatar:profile.avatar||''});
      state.profile=data.user;
      if(data.user.avatar)storeChiefAvatar(data.user.avatar);
      onUserUpdate(data.user);
      render();
      if(successMessage)toast(successMessage);
      return data.user;
    }catch(error){
      if(Object.prototype.hasOwnProperty.call(change,'avatar')){
        toast(profile.avatar?'Аватар сохранён локально. После перезапуска сервера сохранится и там.':'Аватар удалён локально');
        return profile;
      }
      throw error;
    }
  }

  function allOrders(){
    return orders.map(order => {
      const details={stage:'Ожидает распределения',assignee:'',cadOperator:'',preprodTechnician:'',technician:'',frameTechnician:'',painter:'',ceramicist:'',manufacturingStatus:'',productionType:order.productionType||'digital',priority:'Обычный',teeth:order.teeth||[],clinic:order.clinic||'Dental Clinic',...seedDetails[order.id],...overrides[order.id]};
      if(details.stage==='Черновик из Telegram'&&order.telegramDraft===false)details.stage='Ожидает распределения';
      if(details.stage==='Изготовление'&&!manufacturingStatuses.includes(details.manufacturingStatus))details.manufacturingStatus=manufacturingStatuses[0];
      const legacy=team.find(employee=>employee.originalName===details.assignee),preprodTechnicianKey=details.preprodTechnician||details.preprod||'',cadOperatorKey=details.cadOperator||(legacy&&isCadOperatorEmployee(legacy)?details.assignee:''),frameTechnicianKey=details.frameTechnician||details.technician||(legacy&&isFrameEmployee(legacy)?details.assignee:''),painterKey=details.painter||details.ceramicist||(legacy&&isPainterEmployee(legacy)?details.assignee:'');
      const assigneeKey=details.assignee||frameTechnicianKey||painterKey||cadOperatorKey||preprodTechnicianKey;
      const frameTechnicianName=employeeName(frameTechnicianKey),painterName=employeeName(painterKey),assignmentLabel=[frameTechnicianName,painterName].filter(Boolean).join(' · ')||employeeName(assigneeKey);
      return {...order,...details,clinic:clientName(details.clinic),assigneeKey,cadOperatorKey,frameTechnicianKey,painterKey,ceramicistKey:painterKey,technicianKey:frameTechnicianKey,assignee:employeeName(assigneeKey),assignmentLabel,preprodTechnicianKey,preprodTechnicianName:employeeName(preprodTechnicianKey),frameTechnicianName,painterName,ceramicistName:painterName,cadOperatorName:employeeName(cadOperatorKey),technicianName:frameTechnicianName};
    });
  }
  function orderById(id){return allOrders().find(order=>order.id===id)}
  function chiefStageLabel(order){return order?.stage==='Изготовление'&&manufacturingStatuses.includes(order.manufacturingStatus)?order.manufacturingStatus:order?.stage||''}
  const qualityStageTitle=kind=>({cad:'ОТК — CAD оператор',preprod:'ОТК — препрод техник',cam:'ОТК — CAM оператор',esthetic:'ОТК — эстетист',final:'Финальная ОТК'}[kind]||'ОТК');
  const displayChiefStage=(stage,order)=>stage==='Контроль качества'&&order?.qualityRequest?.kind?qualityStageTitle(order.qualityRequest.kind):({'Черновик из Telegram':'Ожидает подтверждения','Ожидает распределения':'Ожидает подтверждения','Препрод':'Аналоговая подготовка','Согласование CAD':'CAD на согласовании у врача','На согласовании':'CAD на согласовании у врача','В доставке':'Доставка в клинику','В пути к вам':'Доставка в клинику','Принято доктором':'Принято врачом','Принято':'Принято врачом','Готово к выдаче':'Принято врачом','На доработке':'Доработка и эстетика'}[stage]||stage);
  function chiefDisplayStageLabel(order){if(order?.stage==='Работа принята')return 'Контроль качества';const label=chiefStageLabel(order);return displayChiefStage(label,order)}
  const displayChiefTimelineStage=(stage,order)=>displayChiefStage(stage,order);
  function chiefTimelineIndex(order){const label=chiefStageLabel(order);return Math.max(0,chiefStages.indexOf(label))}
  const doctorAcceptanceWindow=2*24*60*60*1000;
  function doctorAcceptanceInfo(order,now=Date.now()){
    if(!order||order.stage!=='В доставке'||order.doctorAcceptedAt)return null;
    const deliveryEvent=orderHistory().filter(event=>event.orderId===order.id&&event.action==='stage_changed'&&event.to==='В доставке').sort((a,b)=>(Date.parse(a.at)||0)-(Date.parse(b.at)||0)).at(-1);
    const deliveredAt=Date.parse(deliveryEvent?.at||order.createdAt);
    if(!deliveredAt)return null;
    const dueAt=deliveredAt+doctorAcceptanceWindow;
    return {deliveredAt,dueAt,overdue:now>=dueAt,daysLate:Math.max(1,Math.ceil((now-dueAt)/(24*60*60*1000)))};
  }
  function doctorAcceptanceOverdueOrders(){return allOrders().filter(order=>doctorAcceptanceInfo(order)?.overdue).sort((a,b)=>(doctorAcceptanceInfo(a)?.dueAt||0)-(doctorAcceptanceInfo(b)?.dueAt||0))}
  function saveOrder(id,change){
    const current=orderById(id);
    if(!current)return;
    overrides[id]={...(overrides[id]||{}),...change};
    localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
    savePortal('orderOverrides',overrides).catch(error=>toast('Не удалось сохранить этап на сервере: '+error.message));
    render();
  }

  async function saveOrderRecord(id,change){
    const index=orders.findIndex(order=>order.id===id);
    if(index<0)return toast('Заказ не найден');
    const updated={...orders[index],...change,id:orders[index].id,clinicId:orders[index].clinicId,createdAt:orders[index].createdAt};
    const next=[...orders];next[index]=updated;
    orders.splice(0,orders.length,...next);
    try{await savePortal('orders',next);toast('Заказ сохранён');render();return true}catch(error){toast('Не удалось сохранить заказ: '+error.message);return false}
  }
  async function deleteOrderRecord(id){
    const next=orders.filter(order=>order.id!==id);
    if(next.length===orders.length)return toast('Заказ не найден');
    const nextOverrides={...overrides};delete nextOverrides[id];
    try{
      await deleteOrder(id);
      orders.splice(0,orders.length,...next);
      overrides=nextOverrides;
      localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
      state.page='orders';state.orderId='';toast('Заказ и папка на Яндекс Диске удалены');render();
    }catch(error){toast('Не удалось удалить заказ: '+error.message)}
  }
  function toast(message){
    state.toast=message;
    render();
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>{state.toast='';root().querySelector('.toast')?.classList.remove('visible')},3200);
  }
  function analyticsRecords(){
    return allOrders().filter(order=>order.stage==='Принято доктором'&&order.doctorAcceptedAt).map(order=>{
      const date=new Date(order.doctorAcceptedAt);
      return {year:date.getFullYear(),month:date.getMonth(),clinic:order.clinic,technician:order.assignee,amount:Number(String(order.sum).replace(/[^0-9]/g,'')),order};
    }).filter(record=>!Number.isNaN(record.year));
  }
  function filteredRecords(month=state.month){
    return analyticsRecords().filter(record=>record.year===analyticsYear&&record.month===month&&(state.technician==='Все техники'||record.technician===state.technician));
  }
  function groupRows(records,key){
    const grouped=new Map();
    for(const record of records){
      const row=grouped.get(record[key])||{name:record[key],orders:0,revenue:0};
      row.orders++;
      row.revenue+=record.amount;
      grouped.set(record[key],row);
    }
    return [...grouped.values()].sort((a,b)=>b[state.sort]-a[state.sort]);
  }
  function monthName(month){const name=new Intl.DateTimeFormat('ru-RU',{month:'long'}).format(new Date(analyticsYear,month,1));return name.charAt(0).toUpperCase()+name.slice(1)}
  function filters(){
    return `<div class="tech-filters"><label>Месяц<select data-tech-month-select>${monthLabels.map((label,index)=>`<option value="${index}" ${state.month===index?'selected':''}>${monthName(index)} ${analyticsYear}</option>`).join('')}</select></label><label>Исполнитель<select data-tech-technician><option>Все техники</option>${team.map(employee=>`<option ${state.technician===employee.name?'selected':''}>${safe(employee.name)}</option>`).join('')}</select></label><span class="tech-demo-note">По сохранённым заказам · выручка после статуса «Принято врачом»</span></div>`;
  }
  function kpis(){
    const current=filteredRecords();
    const previous=state.month>0?filteredRecords(state.month-1):[];
    const revenue=current.reduce((sum,row)=>sum+row.amount,0);
    const previousRevenue=previous.reduce((sum,row)=>sum+row.amount,0);
    const change=previousRevenue?Math.round((revenue/previousRevenue-1)*100):null;
    const created=allOrders().filter(order=>{const date=new Date(order.createdAt);return !Number.isNaN(date.getTime())&&date.getFullYear()===analyticsYear&&date.getMonth()===state.month&&(state.technician==='Все техники'||order.assignee===state.technician)}).length;
    const paid=allOrders().filter(order=>order.paidAt&&(()=>{const date=new Date(order.paidAt);return !Number.isNaN(date.getTime())&&date.getFullYear()===analyticsYear&&date.getMonth()===state.month&&(state.technician==='Все техники'||order.assignee===state.technician)})()).reduce((sum,order)=>sum+Number(String(order.sum).replace(/[^0-9]/g,'')),0);
    return `<div class="tech-kpis">
      <article><span>Выручка после приёмки</span><strong>${money(revenue)}</strong><small class="${change!==null&&change>=0?'positive':'negative'}">${change===null?'Первый месяц':(change>=0?'+':'')+change+'% к прошлому месяцу'}</small></article>
      <article><span>Создано заказов</span><strong>${created}</strong><small>По дате создания</small></article>
      <article><span>Принято врачом</span><strong>${current.length}</strong><small>По дате приёмки</small></article>
      <article><span>Оплачено</span><strong>${money(paid)}</strong><small>По принятым заказам с оплатой</small></article>
    </div>`;
  }
  function chart(){
    const currentMonth=new Date().getMonth();
    const months=monthLabels.map((label,index)=>{
      const rows=filteredRecords(index);
      return {label,index,value:state.metric==='revenue'?rows.reduce((sum,row)=>sum+row.amount,0):rows.length};
    });
    const maximum=Math.max(1,...months.map(month=>month.value));
    return `<section class="tech-panel tech-chart"><div class="tech-panel-heading"><div><h2>Динамика по месяцам</h2><p>${state.metric==='revenue'?'Выручка':'Количество заказов'} · ${analyticsYear} год</p></div><div class="tech-segment"><button data-tech-metric="revenue" class="${state.metric==='revenue'?'active':''}">Выручка</button><button data-tech-metric="orders" class="${state.metric==='orders'?'active':''}">Заказы</button></div></div><div class="tech-bars">${months.map(month=>`<button class="tech-bar ${state.month===month.index?'active':''} ${month.index===currentMonth?'current':''}" data-tech-month="${month.index}" title="${month.label}: ${state.metric==='revenue'?money(month.value):month.value+' заказов'}"><span class="tech-bar-track"><i style="height:${Math.max(8,Math.round(month.value/maximum*100))}%"></i></span><small>${month.label}</small></button>`).join('')}</div></section>`;
  }
  function breakdown(type,limit=0){
    const rows=groupRows(filteredRecords(),type);
    const visible=limit?rows.slice(0,limit):rows;
    const title=type==='clinic'?'Клиенты по выручке':'Результат техников';
    return `<section class="tech-panel"><div class="tech-panel-heading"><div><h2>${title}</h2><p>${monthName(state.month)} ${analyticsYear}</p></div>${type==='clinic'?`<div class="tech-segment"><button data-tech-sort="revenue" class="${state.sort==='revenue'?'active':''}">По выручке</button><button data-tech-sort="orders" class="${state.sort==='orders'?'active':''}">По заказам</button></div>`:''}</div><div class="tech-breakdown">${visible.map((row,index)=>`<div class="tech-breakdown-row"><span class="tech-rank">${index+1}</span><span class="tech-breakdown-name">${safe(row.name)}<small>${row.orders} заказов</small></span><strong>${money(row.revenue)}</strong></div>`).join('')||'<div class="tech-empty">За этот период данных нет</div>'}</div></section>`;
  }
  function attentionOrders(){
    const list=allOrders().filter(order=>order.stage==='Черновик из Telegram'||order.stage==='Ожидает распределения'||order.stage==='Контроль качества').slice(0,4);
    return `<section class="tech-panel"><div class="tech-panel-heading"><div><h2>Требует внимания</h2><p>Новые заказы и контроль качества</p></div><button class="tech-link" data-tech-page="orders">Все заказы →</button></div><div class="tech-attention">${list.map(order=>`<button data-tech-order="${order.id}"><span class="tech-order-icon">${icon('orders',20)}</span><span><strong>${order.id} · ${safe(order.work)}</strong><small>${safe(order.clinic)} · срок ${order.date}</small></span><em class="tech-stage ${stageTone(order.stage)}">${order.stage}</em></button>`).join('')||'<p class="tech-empty">Все заказы распределены и проверены</p>'}</div></section>`;
  }
  function doctorAcceptancePanel(){
    const overdue=doctorAcceptanceOverdueOrders();
    if(!overdue.length)return '';
    return `<section class="tech-panel tech-doctor-overdue"><div class="tech-panel-heading"><div><h2>Врачи не приняли работу за 2 дня</h2><p>Свяжитесь с клиникой и уточните приёмку заказа.</p></div><span class="tech-stage overdue">${overdue.length} ${overdue.length===1?'заказ':'заказа'}</span></div><div class="tech-doctor-overdue-list">${overdue.map(order=>{const info=doctorAcceptanceInfo(order);return `<button data-tech-order="${safe(order.id)}"><span class="tech-order-icon">${icon('orders',20)}</span><span><strong>${safe(order.clinic)}</strong><small>${safe(order.id)} · ${safe(order.work)} · передано ${shortDate(info.deliveredAt)}</small></span><em>Просрочено ${info.daysLate} ${info.daysLate===1?'день':'дня'}</em></button>`}).join('')}</div></section>`;
  }
  function teamSnapshot(){
    const open=allOrders().filter(order=>!['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage));
    return `<section class="tech-panel"><div class="tech-panel-heading"><div><h2>Загрузка команды</h2><p>Текущие работы</p></div><button class="tech-link" data-tech-page="team">Команда →</button></div><div class="tech-team-snapshot">${activeTeam().map(employee=>`<div><span class="tech-mini-avatar">${safe(employee.name.split(' ').map(part=>part[0]).join(''))}</span><span>${safe(employee.name)}</span><strong>${open.filter(order=>[order.assigneeKey,order.cadOperatorKey,order.frameTechnicianKey,order.painterKey].includes(employee.originalName)).length}</strong></div>`).join('')||'<p class="tech-empty">Активных техников пока нет</p>'}</div></section>`;
  }
  function chiefOrderDate(order){const [day,month,year]=String(order.date||'').split('.').map(Number);return new Date(year,month-1,day)}
  function chiefDeadlineTone(stage){return ['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(stage)?'green':['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(stage)?'orange':'blue'}
  function chiefDeadlineCalendar(){
    const month=state.deadlineMonth,year=month.getFullYear(),monthNumber=month.getMonth(),daysInMonth=new Date(year,monthNumber+1,0).getDate(),leading=(new Date(year,monthNumber,1).getDay()+6)%7;
    const monthName=new Intl.DateTimeFormat('ru-RU',{month:'long'}).format(month),label=monthName.charAt(0).toUpperCase()+monthName.slice(1)+' '+year;
    const due=allOrders().filter(order=>{const date=chiefOrderDate(order);return date.getFullYear()===year&&date.getMonth()===monthNumber});
    const cells=Array.from({length:leading},()=>'<span class="calendar-blank"></span>');
    for(let day=1;day<=daysInMonth;day++){
      const statuses=due.filter(order=>chiefOrderDate(order).getDate()===day).map(order=>chiefDeadlineTone(order.stage));
      const dayLabel=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(new Date(year,monthNumber,day));
      cells.push(`<button class="calendar-day ${state.deadlineDay===day?'selected':''}" data-tech-calendar-action="day" data-value="${day}" aria-label="${dayLabel}, заказов: ${statuses.length}"><span>${day}</span><i class="calendar-markers">${statuses.length?'<b></b>':''}</i></button>`);
    }
    const selected=Number.isInteger(state.deadlineDay)?due.filter(order=>chiefOrderDate(order).getDate()===state.deadlineDay):[];
    const selectedDate=Number.isInteger(state.deadlineDay)?`${String(state.deadlineDay).padStart(2,'0')}.${String(monthNumber+1).padStart(2,'0')}.${year}`:'';
    const selectedTitle=Number.isInteger(state.deadlineDay)?`Сдачи на ${new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(new Date(year,monthNumber,state.deadlineDay))}`:'Выберите дату';
    return `<section class="tech-panel deadline-card"><h2>Календарь сроков</h2><div class="calendar-head"><strong>${label}</strong><div><button data-tech-calendar-action="prev" aria-label="Предыдущий месяц">‹</button><button data-tech-calendar-action="next" aria-label="Следующий месяц">›</button></div></div><div class="calendar-grid">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(day=>`<span class="calendar-weekday">${day}</span>`).join('')}${cells.join('')}</div><div class="dashboard-card-heading"><h3>${selectedTitle}</h3>${selected.length?`<button data-tech-calendar-action="all" data-value="${selectedDate}">Все (${selected.length}) →</button>`:''}</div><div class="upcoming-list">${selected.length?selected.slice(0,4).map(order=>`<button class="upcoming-order" data-tech-order="${safe(order.id)}"><i class="deadline-status ${chiefDeadlineTone(order.stage)}"></i><span><strong>${safe(order.id)}</strong></span></button>`).join(''):'<p class="dashboard-empty">В этот день нет сдачи</p>'}</div></section>`;
  }
  function overview(){
    const list=allOrders();
    const newCount=list.filter(order=>['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(order.stage)).length;
    const qaCount=list.filter(order=>order.stage==='Контроль качества').length;
    const doctorOverdueCount=doctorAcceptanceOverdueOrders().length;
    const requestCount=clientRequests().filter(request=>request.status==='pending').length;
    const registrationCount=clients.filter(client=>client.approved===false).length;
    const alerts=[
      requestCount?`<button class="tech-event-alert requests" data-tech-page="requests"><strong>${requestCount}</strong><span>Новые правки от клиентов</span><b>Проверить →</b></button>`:'',
      newCount?`<button class="tech-event-alert orders" data-tech-page="orders"><strong>${newCount}</strong><span>Новые заказы</span><b>Открыть →</b></button>`:'',
      qaCount?`<button class="tech-event-alert intake" data-tech-page="intake"><strong>${qaCount}</strong><span>Работы ждут приёмки</span><b>Принять →</b></button>`:'',
      doctorOverdueCount?`<button class="tech-event-alert overdue" data-tech-page="orders" data-tech-overdue="true"><strong>${doctorOverdueCount}</strong><span>Врачи не приняли работу за 2 дня</span><b>Связаться →</b></button>`:'',
      registrationCount?`<button class="tech-event-alert clients" data-tech-page="clients"><strong>${registrationCount}</strong><span>Новые заказчики</span><b>Проверить →</b></button>`:''
    ].filter(Boolean).join('');
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ЛАБОРАТОРИЯ · ГЛАВНЫЙ ТЕХНИК</span><h1>Обзор лаборатории</h1></div><div class="tech-task-count"><strong>${newCount+qaCount+doctorOverdueCount+requestCount+registrationCount}</strong><span>требуют решения</span></div></div>${alerts?`<div class="tech-notification-stack">${alerts}</div>`:''}${filters()}${kpis()}${doctorAcceptancePanel()}<div class="dashboard-grid tech-dashboard-grid"><div class="dashboard-main tech-dashboard-main">${chart()}${attentionOrders()}${teamSnapshot()}</div><aside class="dashboard-aside tech-dashboard-aside">${chiefDeadlineCalendar()}${breakdown('clinic',4)}</aside></div>`;
  }
  function orderSortHeading(key,label){
    const active=state.orderSortKey===key,arrow=active?(state.orderSortDirection==='asc'?'↑':'↓'):'↕';
    return `<th aria-sort="${active?(state.orderSortDirection==='asc'?'ascending':'descending'):'none'}"><button class="order-sort" data-tech-order-sort="${key}">${label}<span aria-hidden="true">${arrow}</span></button></th>`;
  }
  function sortedOrderRows(list){
    const key=state.orderSortKey,sign=state.orderSortDirection==='asc'?1:-1;
    if(!key)return list;
    return [...list].sort((a,b)=>{
      let x=a[key]??'',y=b[key]??'';
      if(key==='date'){x=String(x).split('.').reverse().join('-');y=String(y).split('.').reverse().join('-')}
      if(key==='createdAt'){x=Date.parse(x)||0;y=Date.parse(y)||0;return (x-y)*sign}
      if(key==='productionType'){x=a.productionType==='analog'?0:1;y=b.productionType==='analog'?0:1;return (x-y)*sign}
      if(key==='clinic'){x=`${a.id} ${a.clinic}`;y=`${b.id} ${b.clinic}`}
      if(key==='work'){x=`${a.work} ${a.patient}`;y=`${b.work} ${b.patient}`}
      if(key==='assignee'){x=a.assignee||'Не назначен';y=b.assignee||'Не назначен'}
      return String(x).localeCompare(String(y),'ru',{numeric:true})*sign;
    });
  }
  function orderRows(list){
    return sortedOrderRows(list).map(order=>{const acceptance=doctorAcceptanceInfo(order),typeLabel=order.productionType==='analog'?'Аналоговый':'Цифровой';return `<tr data-tech-order="${order.id}" tabindex="0" class="tech-order-row"><td><strong>${order.id}</strong><small>${safe(order.clinic)}</small></td><td>${shortDate(order.createdAt)}</td><td class="tech-order-type-cell"><span class="tech-order-type-row ${order.productionType==='analog'?'analog':'digital'}">${typeLabel}</span></td><td>${safe(order.work)}<small>${safe(order.patient)}</small></td><td>${order.date}</td><td><span class="tech-stage ${acceptance?.overdue?'overdue':stageTone(order.stage)}">${acceptance?.overdue?'Врач не принял 2 дня':safe(chiefDisplayStageLabel(order))}</span></td><td>${safe(order.assignmentLabel||order.assignee||'Не назначен')}</td><td><div class="tech-order-actions"><button class="tech-link" data-tech-order="${order.id}">Открыть →</button><button type="button" class="tech-icon-btn disk" data-tech-order-action="disk" data-id="${order.id}" aria-label="Открыть папку заказа ${order.id} на Яндекс Диске" title="Папка заказа на Яндекс Диске">${icon('disk',15)}</button><button type="button" class="tech-icon-btn" data-tech-order-action="edit" data-id="${order.id}" aria-label="Редактировать заказ ${order.id}">✎</button><button type="button" class="tech-icon-btn danger" data-tech-order-action="delete" data-id="${order.id}" aria-label="Удалить заказ ${order.id}">×</button></div></td></tr>`}).join('')||'<tr><td colspan="8" class="tech-empty">Заказов не найдено</td></tr>';
  }

  function orderCreatedDate(order){
    const created=Date.parse(order.createdAt);
    if(created)return new Date(created);
    return parseDate(order.date);
  }
  function orderMonthKey(order){
    const date=orderCreatedDate(order);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  }
  function orderMonthLabel(key){
    const [year,month]=key.split('-').map(Number);
    const name=new Intl.DateTimeFormat('ru-RU',{month:'long'}).format(new Date(year,month-1,1));
    return `${name.charAt(0).toUpperCase()+name.slice(1)} ${year}`;
  }
  function orderFilterPanel(all){
    const clinics=[...new Set(all.map(order=>order.clinic).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    const months=[...new Set(all.map(orderMonthKey))].sort().reverse();
    const activeCount=(state.orderClinicFilter?1:0)+(state.orderMonthFilter?1:0);
    const button=`<button type="button" class="btn outline tech-filter-button ${activeCount?'active':''}" data-tech-filter-panel="toggle">Фильтр${activeCount?` · ${activeCount}`:''}</button>`;
    if(!state.orderFilterOpen)return button;
    return `${button}<div class="tech-order-filter-panel"><div><strong>Клиника</strong><select data-tech-order-clinic-filter><option value="">Все клиники</option>${clinics.map(clinic=>`<option value="${safe(clinic)}" ${state.orderClinicFilter===clinic?'selected':''}>${safe(clinic)}</option>`).join('')}</select></div><div><strong>Месяц заказа</strong><select data-tech-order-month-filter><option value="">Все месяцы</option>${months.map(month=>`<option value="${month}" ${state.orderMonthFilter===month?'selected':''}>${orderMonthLabel(month)}</option>`).join('')}</select></div><div class="tech-order-filter-actions"><button type="button" class="btn outline" data-tech-filter-panel="reset">Сбросить</button><button type="button" class="btn primary" data-tech-filter-panel="close">Готово</button></div></div>`;
  }

  function editVariantPrice(variant){
    const category=workCatalog.find(item=>item.name===variant.work),option=category?.options.find(item=>(typeof item==='string'?item:item.name)===variant.workOption),price=typeof option==='object'&&Number.isFinite(option.price)?option.price:category?.price;
    return Number.isFinite(price)?price*Math.max(1,(variant.selectedTeeth||[]).length):null;
  }
  function editVariantFromCard(card){
    const service=String(card.querySelector('[data-edit-service]')?.value||'').split('|'),mode=card.querySelector('[data-edit-mode]')?.value||'Одиночка',jaw=card.querySelector('[data-edit-jaw]')?.value||'';let teeth=[...card.querySelectorAll('[data-edit-tooth]:checked')].map(input=>Number(input.value)).filter(Boolean).sort((a,b)=>a-b);if(mode==='Челюсть')teeth=jaw==='upper'?[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28]:jaw==='lower'?[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]:[];
    return {work:service[0]||'',workOption:service[1]||'',toothMode:mode,selectedTeeth:teeth,bridgeRanges:mode==='Мост'?[teeth]:[]};
  }
  function refreshEditPrices(form){
    form.querySelectorAll('[data-edit-variant]').forEach(card=>{const amount=editVariantPrice(editVariantFromCard(card)),target=card.querySelector('[data-edit-amount]');if(target)target.textContent=amount===null?'Стоимость уточняется':rubles(amount)});
  }
  function orderEditModal(){
    if(!state.editOrderId)return '';
    const order=orderById(state.editOrderId);
    if(!order)return '';
    const fallback={toothMode:order.toothMode||'Одиночка',bridgeRanges:order.bridgeRanges||[],selectedTeeth:order.teeth||[],work:order.work,workOption:order.material};
    const variants=state.editOrderVariants?.length?state.editOrderVariants:[...(Array.isArray(order.variants)&&order.variants.length?order.variants:[fallback])];
    state.editOrderVariants=variants;
    const upper=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],lower=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38],teethOptions=[...upper,...lower];
    const shadeOptions=['A1','A2','A3','B1','B2','Другой','Не требуется'];
    const serviceOptionsFor=variant=>{const known=workCatalog.some(category=>category.name===variant.work&&category.options.some(option=>(typeof option==='string'?option:option.name)===variant.workOption)),current=!known&&variant.work&&variant.workOption?`<option value="${safe(variant.work+'|'+variant.workOption)}" selected>${safe(variant.workOption)}</option>`:'';return current+workCatalog.map(category=>`<optgroup label="${safe(category.name)}">${category.options.map(option=>{const name=typeof option==='string'?option:option.name;return `<option value="${safe(category.name+'|'+name)}" ${variant.work===category.name&&variant.workOption===name?'selected':''}>${safe(name)}</option>`}).join('')}</optgroup>`).join('')};
    const cards=variants.map((variant,index)=>{const selected=new Set(variant.selectedTeeth||[]),jaw=variant.toothMode==='Челюсть'?(selected.has(18)||selected.has(11)||selected.has(21)||selected.has(28)?'upper':'lower'):'';return `<article class="tech-edit-variant" data-edit-variant="${index}"><header><div><span>Услуга ${index+1}</span><strong data-edit-card-price>${safe(variant.work||'Новая услуга')}</strong></div>${variants.length>1?`<button type="button" class="tech-edit-remove" data-tech-order-action="remove-edit-variant" data-index="${index}" aria-label="Удалить услугу">×</button>`:''}</header><div class="tech-edit-grid"><label>Режим<select data-edit-mode name="variant-${index}-mode">${['Одиночка','Мост','Челюсть'].map(mode=>`<option ${variant.toothMode===mode?'selected':''}>${mode}</option>`).join('')}</select></label><label>Услуга<select data-edit-service name="variant-${index}-service" required>${serviceOptionsFor(variant)}</select></label><label>Челюсть<select data-edit-jaw name="variant-${index}-jaw"><option value="">Не выбрана</option><option value="upper" ${jaw==='upper'?'selected':''}>Верхняя</option><option value="lower" ${jaw==='lower'?'selected':''}>Нижняя</option></select></label></div><fieldset class="tech-edit-teeth-field"><legend>Выберите зубы</legend><div class="tech-edit-teeth">${teethOptions.map(tooth=>`<label><input type="checkbox" data-edit-tooth value="${tooth}" ${selected.has(tooth)?'checked':''}><span>${tooth}</span></label>`).join('')}</div></fieldset><div class="tech-edit-price"><span>Сумма услуги</span><strong data-edit-amount>${editVariantPrice(variant)===null?'Стоимость уточняется':rubles(editVariantPrice(variant))}</strong></div></article>`}).join('');
    const shades=shadeOptions.includes(order.shade||'')?shadeOptions:[order.shade||'',...shadeOptions];
    return `<div class="tech-dialog-backdrop" data-tech-modal="order-edit"><section class="tech-dialog tech-order-modal tech-order-edit-modal" role="dialog" aria-modal="true" aria-labelledby="tech-order-edit-title"><button class="tech-dialog-close" data-tech-order-action="close-modal" aria-label="Закрыть">×</button><h2 id="tech-order-edit-title">Редактировать заказ ${safe(order.id)}</h2><form id="tech-order-edit-form" class="tech-client-form"><label>ФИО пациента<input name="patient" value="${safe(order.patient)}" required></label><label>Дата рождения<input name="birth" type="date" value="${safe(order.birth||'')}"></label><label>Цвет<select name="shade">${shades.map(shade=>`<option ${shade===order.shade?'selected':''}>${safe(shade)}</option>`).join('')}</select></label><label>Срок<input name="date" value="${safe(order.date)}" required placeholder="дд.мм.гггг"></label><div class="tech-edit-variants-wrap"><div class="tech-edit-variants-heading"><h3>Услуги и зубы</h3><span>До 10 услуг в одном заказе</span></div>${cards}<button type="button" class="btn outline tech-edit-add" data-tech-order-action="add-edit-variant">＋ Добавить услугу</button></div><label class="tech-edit-comment">Комментарий<textarea name="comment" rows="3">${safe(order.comment||'')}</textarea></label><div class="tech-client-form-actions"><button type="button" class="btn outline" data-tech-order-action="close-modal">Отмена</button><button type="submit" class="btn primary">Сохранить</button></div></form></section></div>`;
  }
  function orderDeleteModal(){
    if(!state.confirmOrderDeleteId)return '';
    const order=orderById(state.confirmOrderDeleteId);
    if(!order)return '';
    return `<div class="tech-dialog-backdrop" data-tech-modal="order-delete"><section class="tech-dialog" role="dialog" aria-modal="true" aria-labelledby="tech-order-delete-title"><button class="tech-dialog-close" data-tech-order-action="close-modal" aria-label="Закрыть">×</button><h2 id="tech-order-delete-title">Удалить заказ?</h2><p>Заказ ${safe(order.id)}, его папка на Яндекс Диске и все файлы в ней будут удалены без возможности восстановления. Данные клиники и остальные заказы не изменятся.</p><div><button class="btn outline" data-tech-order-action="close-modal">Отмена</button><button class="btn danger" data-tech-order-action="confirm-delete" data-id="${safe(order.id)}">Удалить</button></div></section></div>`;
  }
  function ordersPage(){
    const all=allOrders();
    const list=all.filter(order=>{
      if(state.filter==='Новые'&&!['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(order.stage))return false;
      if(state.filter==='В работе'&&['Черновик из Telegram','Ожидает распределения','Контроль качества','Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage))return false;
      if(state.filter==='На проверке'&&order.stage!=='Контроль качества')return false;
      if(state.filter==='Приняты'&&!['Работа принята','Готово к выдаче'].includes(order.stage))return false;
      if(state.filter==='В доставке'&&order.stage!=='В доставке')return false;
      if(state.filter==='Принято доктором'&&order.stage!=='Принято доктором')return false;
      if(state.filter==='Врач не принял 2 дня'&&!doctorAcceptanceInfo(order)?.overdue)return false;
      if(state.orderClinicFilter&&state.orderClinicFilter!==order.clinic)return false;
      if(state.orderMonthFilter&&orderMonthKey(order)!==state.orderMonthFilter)return false;
      if(state.orderDueFilter&&order.date!==state.orderDueFilter)return false;
      return !state.search||[order.id,order.work,order.patient,order.clinic,order.assignee,order.assignmentLabel,order.date].some(value=>String(value).toLowerCase().includes(state.search.toLowerCase()));
    });
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОИЗВОДСТВО</span><h1>Заказы лаборатории</h1></div></div>${state.orderDueFilter?`<div class="active-date-filter"><span>Срок сдачи: <strong>${safe(state.orderDueFilter)}</strong></span><button data-tech-date-filter-clear aria-label="Сбросить фильтр по дате">×</button></div>`:''}<div class="tech-panel"><div class="tech-order-tools"><div class="tech-segment">${[['Все','Все'],['Новые','Новые'],['В работе','В работе'],['Контроль качества','На проверке'],['Приняты','Приняты'],['Доставка в клинику','В доставке'],['Принято врачом','Принято доктором'],['Врач не принял 2 дня','Врач не принял 2 дня']].map(([label,key])=>`<button data-tech-filter="${key}" class="${state.filter===key?'active':''}">${label}</button>`).join('')}</div><div class="tech-order-searchbar">${orderFilterPanel(all)}<input id="tech-search" placeholder="Поиск по заказу, клинике или технику..." value="${safe(state.search)}"></div></div><div class="tech-table-wrap tech-orders-table-wrap"><table class="tech-table tech-orders-table"><thead><tr><th>Заказ / клиника</th>${orderSortHeading('createdAt','Создан')}${orderSortHeading('productionType','Тип заказа')}${orderSortHeading('work','Работа / пациент')}${orderSortHeading('date','Срок')}${orderSortHeading('stage','Этап')}${orderSortHeading('assignee','Исполнитель')}<th></th></tr></thead><tbody>${orderRows(list)}</tbody></table></div></div>${orderEditModal()}${orderDeleteModal()}`;
  }
  function assignmentOptions(order){
    const active=activeTeam();
    const current=team.find(employee=>employee.originalName===order.assigneeKey);
    const unavailable=order.assigneeKey&&!active.some(employee=>employee.originalName===order.assigneeKey)
      ?`<option value="${safe(order.assigneeKey)}" selected disabled>${safe(current?.name||order.assigneeKey)} · недоступен</option>`:'';
    return unavailable+active.map(employee=>`<option value="${safe(employee.originalName)}" ${order.assigneeKey===employee.originalName?'selected':''}>${safe(employee.name)}</option>`).join('');
  }
  const orderFilesState={orderId:'',files:[],folderUrl:''};
  function orderUploadDialog(){
    const dialog=state.orderUpload;
    if(!dialog||dialog.orderId!==state.orderId)return '';
    const total=dialog.files.length?Math.round(dialog.files.reduce((sum,item)=>sum+item.progress,0)/dialog.files.length):0;
    const finished=dialog.files.length&&dialog.files.every(item=>['success','error'].includes(item.status));
    return `<div class="tech-dialog-backdrop order-upload-backdrop" data-tech-modal="order-upload"><section class="tech-dialog order-upload-dialog" role="dialog" aria-modal="true"><button class="tech-dialog-close" data-tech-order-action="close-upload" aria-label="Закрыть" ${dialog.uploading?'disabled':''}>×</button><span class="upload-dialog-eyebrow">ЯНДЕКС ДИСК</span><h2>Загрузка файлов заказа</h2><p>Выберите до 10 файлов. В этом окне будет виден прогресс загрузки в папку заказа.</p><label class="upload-dialog-picker ${dialog.uploading?'disabled':''}">${icon('upload',22)}<span>${dialog.files.length?'Добавить другие файлы':'Выбрать файлы'}</span><input type="file" id="tech-order-upload-dialog-input" accept=".jpg,.jpeg,.png,.webp,.pdf,.stl,.ply,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt,.rtf,.html" multiple hidden ${dialog.uploading?'disabled':''}></label>${dialog.files.length?`<div class="upload-overall"><span>Общий прогресс</span><strong data-tech-upload-total>${total}%</strong><div class="upload-progress-track"><i data-tech-upload-total-bar style="width:${total}%"></i></div></div><div class="upload-progress-list">${dialog.files.map((item,index)=>`<article class="upload-progress-file ${item.status}" data-tech-upload-row="${index}"><div><strong>${safe(item.file.name)}</strong><small data-tech-upload-label>${item.status==='success'?'Загружен на Яндекс Диск':item.status==='error'?safe(item.error||'Не удалось загрузить'):item.status==='uploading'?`Загрузка · ${item.progress}%`:'Ожидает загрузки'}</small></div><div class="upload-progress-track"><i data-tech-upload-bar style="width:${item.progress}%"></i></div></article>`).join('')}</div>`:''}${finished?'<button class="btn primary upload-dialog-done" data-tech-order-action="close-upload">Готово</button>':''}</section></div>`;
  }
  function syncOrderUploadProgress(index){
    const dialog=state.orderUpload,row=root().querySelector(`[data-tech-upload-row="${index}"]`);if(!dialog||!row)return;
    const item=dialog.files[index],label=row.querySelector('[data-tech-upload-label]'),bar=row.querySelector('[data-tech-upload-bar]');row.className=`upload-progress-file ${item.status}`;
    if(label)label.textContent=item.status==='success'?'Загружен на Яндекс Диск':item.status==='error'?(item.error||'Не удалось загрузить'):item.status==='uploading'?`Загрузка · ${item.progress}%`:'Ожидает загрузки';if(bar)bar.style.width=`${item.progress}%`;
    const total=Math.round(dialog.files.reduce((sum,file)=>sum+file.progress,0)/dialog.files.length),totalLabel=root().querySelector('[data-tech-upload-total]'),totalBar=root().querySelector('[data-tech-upload-total-bar]');if(totalLabel)totalLabel.textContent=`${total}%`;if(totalBar)totalBar.style.width=`${total}%`;
  }
  async function startOrderUpload(selected){
    const allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf|html)$/i,all=Array.from(selected||[]),files=all.filter(file=>allowed.test(file.name)&&file.size<=200*1024*1024).slice(0,10);
    if(!files.length)return toast('Выберите поддерживаемые файлы размером до 200 МБ');if(files.length<all.length)toast('Можно загрузить до 10 файлов, каждый до 200 МБ');
    state.orderUpload={orderId:state.orderId,uploading:true,files:files.map(file=>({file,progress:0,status:'waiting',error:''}))};render();
    for(let index=0;index<state.orderUpload.files.length;index++){const item=state.orderUpload.files[index];item.status='uploading';syncOrderUploadProgress(index);try{const purpose=/\.html$/i.test(item.file.name)?'cad-review':'order-file';await uploadOrderFile(state.orderId,item.file,{purpose,onProgress:progress=>{item.progress=progress;syncOrderUploadProgress(index)}});item.progress=100;item.status='success'}catch(error){item.status='error';item.error=error.message}syncOrderUploadProgress(index)}
    state.orderUpload.uploading=false;const result=await loadOrderFiles(state.orderId).catch(()=>null);if(result){orderFilesState.files=result.files||[];orderFilesState.folderUrl=result.folderUrl||''}const failed=state.orderUpload.files.filter(item=>item.status==='error').length;toast(failed?`Не удалось загрузить файлов: ${failed}`:'Все файлы загружены на Яндекс Диск');render();
  }
  function orderServiceCards(order){
    const variants=Array.isArray(order.variants)&&order.variants.length?order.variants:[{toothMode:order.toothMode||'Одиночка',bridgeRanges:order.bridgeRanges||[],selectedTeeth:order.teeth||[],work:order.work,workOption:order.material}];
    return `<section class="tech-order-services tech-panel"><div class="tech-panel-heading"><div><h2>Услуги заказа</h2><p>${variants.length} ${variants.length===1?'услуга':'услуги'} в одном заказе</p></div></div><div class="tech-order-service-list">${variants.map((variant,index)=>{const teeth=Array.isArray(variant.selectedTeeth)?variant.selectedTeeth:[],ranges=Array.isArray(variant.bridgeRanges)?variant.bridgeRanges:[],workItem=workCatalog.find(item=>item.name===variant.work),option=workItem?.options.find(item=>(typeof item==='string'?item:item.name)===variant.workOption),price=typeof option==='object'&&Number.isFinite(option.price)?option.price:workItem?.price,amount=Number.isFinite(price)?rubles(price*Math.max(1,teeth.length)):'';return `<article class="tech-order-service"><header><span>Услуга ${index+1}</span><strong>${safe(variant.work||'Работа')}</strong></header><div class="tech-order-service-body"><div class="tech-order-service-chart">${toothChart(false,teeth,ranges)}</div><dl><div><dt>Зубы</dt><dd>${safe(teeth.join(', ')||'Не указаны')}</dd></div><div><dt>Режим</dt><dd>${safe(variant.toothMode||'Одиночка')}</dd></div>${ranges.length?`<div><dt>Мосты</dt><dd>${safe(ranges.map(range=>`${range[0]}–${range.at(-1)}`).join(', '))}</dd></div>`:''}${variant.workOption?`<div><dt>Исполнение</dt><dd>${safe(variant.workOption)}</dd></div>`:''}<div><dt>Количество</dt><dd>${Math.max(1,teeth.length)}</dd></div><div><dt>Сумма</dt><dd>${amount||'Стоимость уточняется'}</dd></div></dl></div></article>`}).join('')}</div></section>`;
  }
  function orderDetail(){
    const order=orderById(state.orderId);
    if(!order)return ordersPage();
    const productionTypeLabel=order.productionType==='analog'?'Аналоговый':'Цифровой';
    if(orderFilesState.orderId!==order.id){orderFilesState.orderId=order.id;orderFilesState.files=[];orderFilesState.folderUrl='';loadOrderFiles(order.id).then(result=>{if(state.orderId===order.id&&isActive()){orderFilesState.files=result.files||[];orderFilesState.folderUrl=result.folderUrl||'';render()}}).catch(()=>{})}
    const stageIndex=order.stage==='Работа принята'?chiefStages.indexOf('Контроль качества'):chiefTimelineIndex(order);
    const events=orderHistory().filter(event=>event.orderId===order.id).slice().reverse().map(event=>event.actorRole==='clinic'?{...event,clinic:order.clinic}:event);
    const sourcePhotos=orderFilesState.files.filter(file=>file.purpose==='source-photo');
    const orderFolderMarkup=`<div class="tech-order-files"><h3>Файлы заказа</h3><div class="order-folder-link"><div><strong>Папка заказа на Яндекс Диске</strong><small>Все файлы заказа собраны в одном месте</small></div><div class="order-folder-actions">${orderFilesState.folderUrl?`<a class="btn outline" href="${safe(orderFilesState.folderUrl)}" target="_blank" rel="noopener noreferrer">Открыть папку</a>`:'<span class="tech-empty">Папка создаётся…</span>'}<label class="btn outline">Загрузить файлы<input type="file" id="tech-direct-order-upload" data-order-id="${safe(order.id)}" accept=".jpg,.jpeg,.png,.webp,.pdf,.stl,.ply,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt,.rtf,.html" multiple hidden></label></div></div></div>`;
    const sourcePhotoMarkup=order.productionType==='analog'?`<section class="tech-panel source-photo-upload"><div class="tech-panel-heading"><div><h3>Исходные фото</h3><p>Фото, полученные от клиники, сохраняются отдельно в папке «Исходные фото».</p></div><span class="tech-stage work">${sourcePhotos.length} фото</span></div><label class="btn outline">${sourcePhotos.length?'Добавить ещё фото':'Загрузить исходные фото'}<input type="file" id="tech-source-photo" accept="image/jpeg,image/png,image/webp" capture="environment" multiple hidden></label></section>`:'';
    const cadFiles=orderFilesState.files.filter(file=>file.purpose==='cad-review'&&/\.html$/i.test(file.name));
    const cadReview=order.cadReview||{};
    const cadModelMarkup=cadFiles.length?`<section class="tech-panel tech-cad-model"><div class="tech-panel-heading"><div><h3>CAD-модель</h3><p>HTML-файл моделировщика для просмотра и проверки.</p></div><span class="tech-stage ${cadReview.status==='approved'?'ready':cadReview.status==='returned'?'review':'work'}">${cadReview.status==='approved'?'Подтверждено':cadReview.status==='returned'?'На доработке':'Ожидает согласования'}</span></div>${cadFiles.slice(-1).map(file=>`<div class="tech-cad-file"><strong>${safe(file.name)}</strong><small>${file.uploadedAt?new Date(file.uploadedAt).toLocaleString('ru-RU'):'Файл CAD'}</small><button class="btn outline" data-tech-order-action="open-cad" data-id="${order.id}" data-file-id="${safe(file.id)}">Открыть CAD</button></div>`).join('')}</section>`:'';
    const cadPreview=state.cadPreview?.orderId===order.id?`<div class="cad-preview-backdrop" data-tech-modal="cad-preview"><section class="cad-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="tech-cad-preview-title"><header><div><h2 id="tech-cad-preview-title">${safe(state.cadPreview.name||'CAD')}</h2><p>Интерактивный предпросмотр из HTML-файла</p></div><button data-tech-order-action="close-cad" aria-label="Закрыть">×</button></header><iframe id="tech-cad-preview-frame" src="${safe(state.cadPreview.url||'')}" sandbox="allow-scripts allow-pointer-lock" referrerpolicy="no-referrer" title="Предпросмотр CAD"></iframe></section></div>`:'';
        return `<button class="tech-back" data-tech-page="orders">← Все заказы</button><div class="tech-heading"><div><span class="tech-eyebrow">${safe(order.clinic)} · ${order.date}</span><h1>Заказ ${order.id}</h1><p>${safe(order.work)} · ${safe(order.patient)} <span class="tech-order-type-badge ${order.productionType==='analog'?'analog':'digital'}">${productionTypeLabel} заказ</span></p></div><span class="tech-stage ${stageTone(order.stage)}">${safe(chiefDisplayStageLabel(order))}</span>${['Принято доктором','В доставке'].includes(order.stage)?`<button class="btn outline" data-tech-order-action="toggle-paid" data-id="${order.id}">${order.paidAt?'Отметить неоплаченным':'Отметить оплаченным'}</button>`:''}</div><div class="tech-detail-grid"><div class="tech-order-main"><section class="tech-panel"><h2>Данные заказа</h2><div class="tech-facts"><div><span>Клиника</span><strong>${safe(order.clinic)}</strong></div><div><span>Пациент</span><strong>${safe(order.patient)}</strong></div><div><span>Тип заказа</span><strong>${productionTypeLabel}</strong></div><div><span>Конструкция</span><strong>${safe(order.work)}</strong></div><div><span>Создан</span><strong>${shortDate(order.createdAt)}</strong></div>${order.source==='telegram'?`<div><span>Источник</span><strong>Telegram</strong></div><div><span>Запросил</span><strong>Клиент</strong></div><div><span>Подтвердил</span><strong>Клиент</strong></div>`:''}<div><span>Срок</span><strong>${order.date}</strong></div><div><span>Приоритет</span><strong>${order.priority}</strong></div><div><span>Сумма</span><strong>${safe(order.sum)}</strong></div><div><span>Оплата</span><strong>${order.paidAt?'Оплачено':'Не оплачено'}</strong></div></div>${orderServiceCards(order)}<section class="tech-panel"></section><h2>История заказа</h2><ol class="order-history">${events.map(event=>`<li><time>${new Date(event.at).toLocaleString('ru-RU')}</time><strong>${safe(displayActor(event))}</strong><span>${event.action==='stage_changed'?`${safe(event.from)} → ${safe(event.to)}`:event.action==='manufacturing_status_changed'?`${safe(event.from||'—')} → ${safe(event.to)}`:event.action==='rework_requested'?`Доработка: ${safe(event.reason)}`:safe(event.summary||event.action)}</span></li>`).join('')||'<li>Действий пока нет</li>'}</ol></section></div><div class="tech-detail-side"><section class="tech-panel"><h2>Управление работой</h2><label class="tech-assign">CAM оператор и Эстетист<select data-tech-assign="${order.id}"><option value="">Не назначен</option>${assignmentOptions(order)}</select></label><h3>Этапы производства</h3><ol class="tech-timeline">${chiefStages.map((stage,index)=>`<li class="${index<stageIndex?'done':index===stageIndex?'current':''} ${stage==='Принято доктором'&&index===stageIndex?'final':''}"><i></i><span>${displayChiefTimelineStage(stage,order)}</span></li>`).join('')}</ol><div class="tech-detail-actions">${['Подготовка','Моделирование','Изготовление','Контроль качества'].includes(order.stage)?`<button class="btn outline" data-tech-action="rollback" data-id="${order.id}">Вернуть на предыдущий статус</button>`:''}${['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(order.stage)?`<p class="tech-status-note">Подтвердите заказ, затем назначьте специалиста на этапе «Приём / Доставка».</p><button class="btn primary" data-tech-action="approve-draft" data-id="${order.id}">Подтвердить заказ</button>`:order.stage==='Моделирование'?'<p class="tech-status-note">Моделировщик должен загрузить HTML и отправить CAD врачу.</p>':order.stage==='Согласование CAD'?'<p class="tech-status-note">CAD ожидает решения врача в кабинете клиники.</p>':order.stage==='Изготовление'?`<p class="tech-status-note">Текущий этап: ${safe(order.manufacturingStatus)}.</p><button class="btn primary" data-tech-action="advance" data-id="${order.id}">${order.manufacturingStatus===manufacturingStatuses[0]?'Передать Эстетисту':'Передать на ОТК'}</button>`:order.stage==='Контроль качества'?`<button class="btn primary" data-tech-action="approve" data-id="${order.id}">Работа принята</button><button class="btn outline" data-tech-action="rework" data-id="${order.id}">Вернуть на доработку</button>`:order.stage==='На доработке'?`<p>${safe(order.reworkReason||'Клиника запросила доработку')}</p><button class="btn primary" data-tech-action="rework-resume" data-id="${order.id}">Вернуть в производство</button>`:order.stage==='Принято доктором'?'<p class="tech-status-note">Работа принята доктором.</p>':order.stage==='В доставке'?'<p class="tech-status-note">Заказ находится в доставке.</p>':`<button class="btn primary" data-tech-action="advance" data-id="${order.id}">Перевести на следующий статус</button>`}</div></section>${orderFolderMarkup}${sourcePhotoMarkup}${cadModelMarkup}</div></div>${cadPreview}`;
  }
  function analyticsPage(){
    return `<div class="tech-heading"><div><span class="tech-eyebrow">АНАЛИТИКА</span><h1>Финансовые результаты</h1><p>Сравнивайте месяцы, клиники и исполнителей.</p></div></div>${filters()}${kpis()}${chart()}<div class="tech-analytics-grid tech-breakdown-grid">${breakdown('clinic')}${breakdown('technician')}</div>`;
  }
  function clientForm(){
    if(!state.editClientId)return '';
    const client=state.editClientId==='new'?{name:'',contact:'',phone:'',email:'',address:'',telegramCode:nextTelegramCode()}:clients.find(item=>item.id===state.editClientId);
    if(!client)return '';
    const field=(label,name,type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${safe(client[name]||'')}" ${required?'required':''}></label>`;
    return `<section class="tech-panel tech-client-editor"><div class="tech-panel-heading"><div><h2>${state.editClientId==='new'?'Новый заказчик':'Редактировать заказчика'}</h2><p>Данные клиники для справочника</p></div><button class="tech-client-close" data-tech-client-action="cancel" aria-label="Закрыть">×</button></div><form id="tech-client-form" class="tech-client-form">${field('Название клиники','name','text',true)}<label>Код подключения Telegram<input value="${safe(client.telegramCode||'Будет присвоен автоматически')}" readonly aria-label="Код подключения Telegram"><small>Временный код: после подтверждения его можно убрать из названия чата</small></label>${field('Контактное лицо','contact')}${field('Телефон','phone','tel')}${field('Электронная почта','email','email')}${field('Город','city')}${field('Адрес','address')}<div class="tech-client-form-actions"><button type="button" class="btn outline" data-tech-client-action="cancel">Отмена</button><button type="submit" class="btn primary">Сохранить</button></div></form></section>`;
  }
  function clientsPage(){
    const active=clients.filter(client=>!client.deleted);
    const q=state.clientSearch.trim().toLowerCase();
    const visible=active.filter(client=>[client.name,client.telegramCode,client.contact,client.phone,client.email,client.address].some(value=>String(value||'').toLowerCase().includes(q)));
    return `<div class="tech-heading"><div><span class="tech-eyebrow">СПРАВОЧНИК</span><h1>Заказчики</h1></div><button class="btn primary" data-tech-client-action="new">+ Добавить заказчика</button></div><div class="tech-client-layout"><section class="tech-panel"><div class="tech-client-toolbar"><div><h2>Клиники <span>${active.length}</span></h2><p>По сохранённым заказам · ${analyticsYear} год</p></div><input id="tech-client-search" type="search" placeholder="Поиск по заказчику, ID или контакту" value="${safe(state.clientSearch)}" aria-label="Поиск заказчиков"></div><div class="tech-table-wrap"><table class="tech-table tech-client-table"><thead><tr><th>Клиника</th><th>Код Telegram</th><th>Контакт</th><th>Заказов</th><th>Доступ</th><th>Действия</th></tr></thead><tbody>${visible.map(client=>{const records=analyticsRecords().filter(record=>record.clinic===client.name);return `<tr><td><strong>${safe(client.name)}</strong><small>${safe(client.address||'Адрес не указан')}</small></td><td><button class="tech-telegram-code" data-tech-client-action="copy-telegram-code" data-telegram-code="${safe(client.telegramCode||'')}" title="Скопировать Telegram ID"><strong>${safe(client.telegramCode||'—')}</strong><small>Скопировать</small></button></td><td>${safe(client.contact||'Не указано')}<small>${safe(phoneDisplay(client.phone)||client.email||'Контакт не указан')}</small></td><td>${records.length}</td><td><span class="tech-employee-status ${client.approved===false?'disabled':'active'}">${client.approved===false?'Ожидает апрув':'Подтверждён'}</span></td><td><div class="tech-client-actions"><button data-tech-client-action="edit" data-client-id="${safe(client.id)}">Изменить</button>${client.approved===false?`<button data-tech-client-action="approve" data-client-id="${safe(client.id)}">Апрув</button>`:''}<button class="danger" data-tech-client-action="delete" data-client-id="${safe(client.id)}">Удалить</button></div></td></tr>`}).join('')||'<tr><td colspan="6" class="tech-empty">Заказчиков не найдено</td></tr>'}</tbody></table></div></section>${clientForm()}</div>${state.confirmDeleteId?`<div class="tech-dialog-backdrop"><section class="tech-dialog" role="dialog" aria-modal="true" aria-labelledby="tech-delete-title"><h2 id="tech-delete-title">Удалить заказчика из списка?</h2><p>${safe(clients.find(client=>client.id===state.confirmDeleteId)?.name||'Заказчик')} исчезнет из справочника. История заказов и финансовые результаты сохранятся.</p><div><button class="btn outline" data-tech-client-action="cancel-delete">Отмена</button><button class="btn danger" data-tech-client-action="confirm-delete" data-client-id="${safe(state.confirmDeleteId)}">Удалить</button></div></section></div>`:''}`;
  }
  function requestValue(value){
    if(Array.isArray(value))return value.join(', ')||'—';
    if(value===null||value===undefined||value==='')return '—';
    return String(value);
  }
  function requestFieldLabel(field){
    return ({patient:'Пациент',birth:'Дата рождения',work:'Раздел работы',material:'Услуга',teeth:'Зубы',quantity:'Количество',toothMode:'Режим',date:'Срок',shade:'Цвет',comment:'Комментарий',sum:'Стоимость',bridgeRanges:'Диапазоны моста'})[field]||field;
  }
  function currentRequestValue(order,field){
    if(field==='bridgeRanges')return (order?.bridgeRanges||[]).map(range=>range.join('–')).join(', ');
    return requestValue(order?.[field]);
  }
  function clientRequestsPage(){
    const rank={pending:0,archived:1,rejected:1,approved:1};
    const requests=[...clientRequests()].sort((a,b)=>(rank[a.status]??2)-(rank[b.status]??2)||(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0));
    const pending=requests.filter(request=>request.status==='pending').length;
    const typeLabel={edit:'Изменение заказа',deadline:'Перенос срока',cancel:'Отмена заказа'};
    const statusLabel={pending:'Ожидает решения',approved:'Одобрено',rejected:'Отклонено'};
    const requestFilters=[['all','Все'],['cancel','Отмены'],['edit','Редактирование'],['deadline','Перенос срока'],['archive','Архив']];
    const isArchived=request=>request.status==='archived'||['approved','rejected'].includes(request.status);
    const visibleRequests=requests.filter(request=>{
      const archived=isArchived(request);
      if(state.requestFilter==='archive')return archived;
      if(archived)return false;
      return state.requestFilter==='all'||request.type===state.requestFilter;
    });
    const cards=visibleRequests.map(request=>{
      const order=orderById(request.orderId),clinic=clients.find(item=>item.id===request.clinicId),changes=Object.entries(request.changes||{});
      const details=request.type==='cancel'
        ?`<div class="tech-request-reason"><span>Причина отмены</span><strong>${safe(request.reason||request.summary||'Не указана')}</strong></div>`
        :`<div class="tech-request-changes">${changes.map(([field,value])=>`<div><span>${safe(requestFieldLabel(field))}</span><del>${safe(Object.prototype.hasOwnProperty.call(request.before||{},field)?requestValue(request.before[field]):currentRequestValue(order,field))}</del><b>→</b><ins>${safe(requestValue(value))}</ins></div>`).join('')||'<p class="tech-empty">Изменения не распознаны</p>'}</div>`;
      const archived=isArchived(request);
      const actions=request.status==='pending'
        ?`<div class="tech-request-actions"><button class="btn outline" data-tech-client-request="reject" data-request-id="${safe(request.id)}">Отклонить</button><button class="btn primary" data-tech-client-request="approve" data-request-id="${safe(request.id)}">Одобрить</button></div>`
        :`<div class="tech-request-reviewed">Решение: ${request.decision==='rejected'||request.status==='rejected'?'Отклонено':'Одобрено'} · Create Dental Team · ${shortDate(request.reviewedAt)}</div>`;
      const sender=request.confirmedBy&&request.confirmedBy!==request.requestedBy?`<span>Отправил запрос: <strong>${safe('Create Dental Team')}</strong></span>`:'';
      return `<article class="tech-request-card ${safe(archived?'archived':request.status)}"><header><div><span class="tech-request-type">${safe(typeLabel[request.type]||'Правка')}</span><h2>${safe(order?.patient||request.orderId)}</h2><p>${safe(clinic?.name||order?.clinic||'Клиника')} · заказ ${safe(request.orderId)}</p></div><span class="tech-request-status ${safe(archived?'archived':request.status)}">${archived?'Архив':safe(statusLabel[request.status]||request.status)}</span></header><div class="tech-request-meta"><span>Запросил: <strong>${safe(request.requestedBy||'Клиент')}</strong></span>${sender}<span>${shortDate(request.createdAt)}</span></div>${details}${actions}</article>`;
    }).join('');
    const filterMarkup=`<div class="tech-segment tech-request-filter-tabs">${requestFilters.map(([key,label])=>`<button class="${state.requestFilter===key?'active':''}" data-tech-request-filter="${key}">${label}</button>`).join('')}</div>`;
    return `<div class="tech-heading"><div><span class="tech-eyebrow">СОГЛАСОВАНИЕ</span><h1>Правки от клиентов</h1></div><div class="tech-task-count"><strong>${pending}</strong><span>ожидают решения</span></div></div><div class="tech-panel tech-request-filter-panel">${filterMarkup}</div><div class="tech-request-list">${cards||'<section class="tech-panel tech-empty">Запросов в этом разделе пока нет</section>'}</div>`;
  }
  function employeeForm(){
    if(!state.editEmployeeId)return '';
    const employee=state.editEmployeeId==='new'?{name:'',specialty:'',phone:'',email:''}:team.find(item=>item.id===state.editEmployeeId);
    if(!employee)return '';
    const field=(label,name,type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${safe(employee[name]||'')}" ${required?'required':''}></label>`;
    const specialtyOptions=[['CAD/CAM оператор','CAD оператор'],['Препрод техник','Препрод техник'],['Каркасист','CAM оператор'],['Красильщик','Эстетист']],rawSpecialty=String(employee.specialty||''),specialty=normalizeEmployeeSpecialty(rawSpecialty);
    const specialtyField=`<label>Специализация<select name="specialty" required>${specialtyOptions.map(([value,label])=>`<option value="${value}" ${specialty===value?'selected':''}>${label}</option>`).join('')}</select></label>`;
    return `<section class="tech-panel tech-client-editor"><div class="tech-panel-heading"><div><h2>${state.editEmployeeId==='new'?'Новый техник':'Редактировать техника'}</h2><p>Данные сотрудника лаборатории</p></div><button class="tech-client-close" data-tech-employee-action="cancel" aria-label="Закрыть">×</button></div><form id="tech-employee-form" class="tech-client-form">${field('Имя и фамилия','name','text',true)}${specialtyField}${field('Телефон','phone','tel')}${field('Электронная почта','email','email',true)}<label>${state.editEmployeeId==='new'?'Пароль для входа':'Новый пароль (если нужно сменить)'}<input name="password" type="password" minlength="8" ${state.editEmployeeId==='new'?'required':''}></label><div class="tech-client-form-actions"><button type="button" class="btn outline" data-tech-employee-action="cancel">Отмена</button><button type="submit" class="btn primary">Сохранить</button></div></form></section>`;
  }
  function teamPage(){
    const open=allOrders().filter(order=>!['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage));
    const query=state.employeeSearch.trim().toLowerCase();
    const visible=team.filter(employee=>(state.employeeFilter==='all'||employee.status===state.employeeFilter)&&[employee.name,employee.specialty,employee.phone,employee.email].some(value=>String(value||'').toLowerCase().includes(query)));
    const statusText={active:'Активен',disabled:'Отключен',fired:'Уволен'};
    return `<div class="tech-heading"><div><span class="tech-eyebrow">КОМАНДА</span><h1>Сотрудники лаборатории</h1></div><button class="btn primary" data-tech-employee-action="new">+ Добавить техника</button></div><div class="tech-client-layout"><section class="tech-panel"><div class="tech-client-toolbar"><div><h2>Техники <span>${team.length}</span></h2><p>Активных: ${activeTeam().length} · данные сохраняются на сервере</p></div><input id="tech-employee-search" type="search" placeholder="Поиск по имени, специализации или контакту" value="${safe(state.employeeSearch)}" aria-label="Поиск техников"></div><div class="tech-segment tech-employee-filters">${[['all','Все'],['active','Активные'],['disabled','Отключённые'],['fired','Уволенные']].map(([value,label])=>`<button data-tech-employee-filter="${value}" class="${state.employeeFilter===value?'active':''}">${label}</button>`).join('')}</div><div class="tech-table-wrap"><table class="tech-table tech-employee-table"><thead><tr><th>Техник</th><th>Специализация</th><th>Контакты</th><th>В работе</th><th>Статус</th><th>Действия</th></tr></thead><tbody>${visible.map(employee=>`<tr><td><strong>${safe(employee.name)}</strong></td><td>${safe(employeeSpecialtyDisplayLabel(employee.specialty))}</td><td>${safe(phoneDisplay(employee.phone))}<small>${safe(employee.email||'')}</small></td><td>${open.filter(order=>[order.assigneeKey,order.cadOperatorKey,order.preprodTechnicianKey,order.frameTechnicianKey,order.ceramicistKey].includes(employee.originalName)).length}</td><td><span class="tech-employee-status ${employee.status}">${statusText[employee.status]||'Неизвестно'}</span></td><td><div class="tech-client-actions"><button data-tech-employee-action="edit" data-employee-id="${safe(employee.id)}">Изменить</button>${employee.status==='active'?`<button data-tech-employee-action="disable" data-employee-id="${safe(employee.id)}">Отключить</button>`:employee.status==='disabled'?`<button data-tech-employee-action="enable" data-employee-id="${safe(employee.id)}">Включить</button>`:''}${employee.status!=='fired'?`<button class="danger" data-tech-employee-action="fire" data-employee-id="${safe(employee.id)}">Уволить</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="6" class="tech-empty">Техников не найдено</td></tr>'}</tbody></table></div></section>${employeeForm()}</div>${state.confirmFireId?`<div class="tech-dialog-backdrop"><section class="tech-dialog" role="dialog" aria-modal="true" aria-labelledby="tech-fire-title"><h2 id="tech-fire-title">Уволить техника?</h2><p>${safe(team.find(employee=>employee.id===state.confirmFireId)?.name||'Сотрудник')} исчезнет из списка активных исполнителей. Незавершённые заказы перейдут в очередь на распределение; история выручки сохранится.</p><div><button class="btn outline" data-tech-employee-action="cancel-fire">Отмена</button><button class="btn danger" data-tech-employee-action="confirm-fire" data-employee-id="${safe(state.confirmFireId)}">Уволить</button></div></section></div>`:''}`;
  }
  function qualityPage(){
    const list=allOrders().filter(order=>order.stage==='Контроль качества');
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРИЕМ РАБОТ</span><h1>Прием работ</h1></div><div class="tech-task-count"><strong>${list.length}</strong><span>ждут решения</span></div></div><div class="tech-quality-list">${list.map(order=>{const request=order.qualityRequest,kind=request?.kind==='cad'?'CAD оператора':request?.kind==='preprod'?'Препрод техника':request?.kind==='cam'?'CAM оператора':request?.kind==='esthetic'?'Эстетиста':'производства';const checkedStage=request?`Проверяется: ${kind}`:'Финальный контроль качества';return `<article class="tech-panel tech-quality-item"><div><span class="tech-eyebrow">${safe(order.clinic)} · ${order.date}</span><h2>${order.id} · ${safe(order.work)}</h2><p>${safe(order.patient)} · ${safe(checkedStage)} · главный техник: ${safe(request?.requestedByName||request?.requestedBy||order.assignee||'—')}${request?.next?` · далее: ${safe(request.next)}`:''}</p></div><div><button class="btn outline" data-tech-order="${order.id}">Подробнее</button><button class="btn outline" data-tech-action="rework" data-id="${order.id}">На доработку</button><button class="btn primary" data-tech-action="approve" data-id="${order.id}">Одобрить</button></div></article>`}).join('')||'<div class="tech-panel tech-empty">Сейчас нет работ на приемке</div>'}</div>`;
  }
  function profilePage(){
    const profile=chiefProfile();
    const integration=state.integration||{};
    const status=(ready,label)=>`<span class="tech-integration-status ${ready?'ready':''}"><i></i>${label}: ${ready?'сохранено':'не заполнено'}</span>`;
    const placeholder=(ready,label)=>ready?`${label} сохранён · введите только для замены`:label;
    const requests=(integration.pairingRequests||[]).map(item=>`<div class="tech-bot-row"><span><strong>${safe(item.clinicName)}</strong><small>${safe(item.chatTitle)} · запросил ${safe(item.requestedBy)}</small></span><div><button class="btn primary" data-tech-bot-action="approve-binding" data-request-id="${safe(item.id)}">Подключить</button><button class="btn outline" data-tech-bot-action="reject-binding" data-request-id="${safe(item.id)}">Отклонить</button></div></div>`).join('')||'<p class="tech-empty">Новых запросов нет</p>';
    const bindings=(integration.bindings||[]).map(item=>`<div class="tech-bot-row"><span><strong>${safe(item.clinicName)}</strong><small>${safe(item.chatTitle||item.chatId)} · подтверждено ${item.approvedAt?new Date(item.approvedAt).toLocaleString('ru-RU'):'ранее'}</small></span><button class="btn outline" data-tech-bot-action="unbind" data-clinic-id="${safe(item.clinicId)}">Отключить</button></div>`).join('')||'<p class="tech-empty">Подключённых чатов пока нет</p>';
    const lastUpdate=integration.lastUpdateAt?new Date(integration.lastUpdateAt).toLocaleString('ru-RU'):'сообщений ещё не было';
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОФИЛЬ</span><h1>Главный техник</h1></div></div><div class="tech-profile-stack"><section class="tech-panel tech-profile-editor"><div class="tech-profile-avatar">${avatarMarkup(profile,'large')}<label class="btn outline">Загрузить аватар<input id="tech-profile-avatar" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>${profile.avatar?'<button class="tech-link" data-tech-profile-avatar="remove">Убрать аватар</button>':''}</div><form id="tech-profile-form" class="tech-client-form">${profileField('Имя в кабинете','displayName',profile.displayName||'Главный техник','text',true)}${profileField('Электронная почта','email',profile.email||'','email')}${profileField('Новый пароль','password','','password',false,'Оставьте пустым, если менять не нужно')}${profileField('Повторите пароль','passwordConfirm','','password',false,'')}<div class="tech-client-form-actions"><button type="submit" class="btn primary">Сохранить профиль</button></div></form></section><section class="tech-panel tech-integration-panel"><div class="tech-panel-heading"><div><h2>Telegram и Yandex</h2><p>Голосовые сообщения и управление заказами после подтверждения</p></div><div><strong class="tech-integration-overall ${integration.enabled?'ready':''}">${state.integrationLoading?'Проверка…':integration.enabled?'Подключено':'Требуется настройка'}</strong><button class="tech-link" data-tech-bot-action="refresh">Обновить</button></div></div><div class="tech-integration-statuses">${status(integration.telegramBot,'Telegram')}${status(integration.employeeTelegramBot,'Telegram сотрудников')}${status(integration.speechKit,'SpeechKit')}${status(integration.yandexGpt,'YandexGPT')}${status(integration.folderId,'Каталог')}${status(integration.yandexDisk,'Яндекс Диск')}</div><div class="tech-bot-health"><div><span>Последнее сообщение</span><strong>${safe(lastUpdate)}</strong></div><div><span>Ожидают подтверждения</span><strong>${Number(integration.pendingActions)||0}</strong></div><div><span>Очередь событий</span><strong>${Number(integration.queuedUpdates)||0}</strong></div><div><span>Последняя ошибка</span><strong>${safe(integration.lastError||'Нет')}</strong></div></div><div class="tech-bot-bindings"><h3>Запросы на подключение</h3>${requests}<h3>Подключённые чаты</h3>${bindings}</div><form id="tech-integration-form" class="tech-client-form tech-integration-form" autocomplete="off"><label>Токен Telegram-бота<input name="telegramBotToken" type="password" placeholder="${safe(placeholder(integration.telegramBot,'Токен Telegram'))}" autocomplete="new-password"></label><label>Токен Telegram-бота сотрудников<input name="employeeTelegramBotToken" type="password" placeholder="${safe(placeholder(integration.employeeTelegramBot,'Токен нового бота сотрудников'))}" autocomplete="new-password"></label><label>API-ключ SpeechKit<input name="speechKitKey" type="password" placeholder="${safe(placeholder(integration.speechKit,'Ключ SpeechKit'))}" autocomplete="new-password"></label><label>API-ключ YandexGPT<input name="yandexGptKey" type="password" placeholder="${safe(placeholder(integration.yandexGpt,'Ключ YandexGPT'))}" autocomplete="new-password"></label><label>ID каталога Yandex Cloud<input name="folderId" type="password" placeholder="${safe(placeholder(integration.folderId,'ID каталога'))}" autocomplete="new-password"></label><label>OAuth-токен Яндекс Диска<input name="yandexDiskToken" type="password" placeholder="${safe(placeholder(integration.yandexDisk,'OAuth-токен Диска'))}" autocomplete="new-password"></label><p class="tech-integration-note">Сохранённые значения скрыты. Пустые поля не изменяют настройки. Токен сотрудников хранится отдельно и не заменяет токен бота клиник.</p><div class="tech-client-form-actions"><button type="submit" class="btn primary">Сохранить и подключить</button></div></form></section></div>`;
  }
  function profileField(label,name,value='',type='text',required=false,placeholder=''){return `<label>${label}<input name="${name}" type="${type}" value="${safe(value)}" ${placeholder?`placeholder="${safe(placeholder)}"`:''} ${required?'required':''}></label>`}
  async function loadIntegrationStatus(){
    if(state.integrationLoading)return;
    state.integrationLoading=true;
    try{
      const response=await fetch('/api/integrations/telegram',{headers:{'X-Portal-Token':portalToken()},cache:'no-store'});
      if(!response.ok)throw new Error('Не удалось проверить интеграцию');
      state.integration=(await response.json()).status||{};
    }catch(error){toast(error.message)}
    finally{state.integrationLoading=false;if(isActive()&&state.page==='profile')shell(profilePage())}
  }
  function messageDateLabel(value){
    const date=new Date(value),today=new Date(),yesterday=new Date();yesterday.setDate(today.getDate()-1);
    const key=d=>d.toLocaleDateString('ru-RU');
    if(key(date)===key(today))return 'Сегодня';
    if(key(date)===key(yesterday))return 'Вчера';
    return date.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
  }
  const messageFileSize=size=>size>=1024*1024?`${(size/1024/1024).toFixed(1)} МБ`:`${Math.max(1,Math.ceil(size/1024))} КБ`;
  function messageAttachmentMarkup(attachment,pending=false){if(!attachment)return '';const preview=attachment.preview?`<img src="${safe(attachment.preview)}" alt="">`:'<span class="chat-file-icon">📄</span>';return `<${pending?'div':'button'} class="chat-attachment ${pending?'pending':''}" ${pending?'':`type="button" data-chief-chat-file="${safe(attachment.id)}"`}>${preview}<span><strong>${safe(attachment.name)}</strong><small>${messageFileSize(attachment.size)}</small></span>${pending?'<button type="button" data-tech-message-attachment="remove" aria-label="Убрать файл">×</button>':''}</${pending?'div':'button'}>`}
  function messageImagePreview(file){return new Promise((resolve,reject)=>{if(!file.type.startsWith('image/'))return resolve('');const image=new Image(),url=URL.createObjectURL(file);image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Не удалось открыть изображение'))};image.onload=()=>{const scale=Math.min(1,240/image.width,180/image.height),canvas=document.createElement('canvas'),context=canvas.getContext('2d');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));context.drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.72))};image.src=url})}
  async function selectMessageAttachment(file){if(!file)return;const allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf)$/i;if(!allowed.test(file.name))return toast('Выберите изображение, PDF, 3D-файл, архив, Word, Excel или текстовый документ');if(file.size>200*1024*1024)return toast('Файл должен быть не больше 200 МБ');try{state.messageAttachment={file,name:file.name,size:file.size,type:file.type||'application/octet-stream',preview:await messageImagePreview(file)};render()}catch(error){toast(error.message)}}
  function chiefMessagesMarkup(messages){
    let previous='';
    return messages.map(message=>{
      const day=new Date(message.time).toDateString();
      const divider=day!==previous?`<div class="chat-date-divider">${messageDateLabel(message.time)}</div>`:'';
      previous=day;
      const side=['support','bot'].includes(message.from)?'me':'them';
      const author=message.from==='bot'?'Ответ AI':message.source==='telegram'&&message.from==='support'?safe('Create Dental Team'):message.source==='telegram'&&message.sender?safe('Клиент'):'';
      const delivery=message.from==='support'&&message.deliveryStatus?`<span class="message-delivery ${safe(message.deliveryStatus)}">${message.deliveryStatus==='delivered'?'Доставлено в Telegram':message.deliveryStatus==='sending'?'Отправляется…':`Не доставлено${message.deliveryError?`: ${safe(message.deliveryError)}`:''}${message.deliveryStatus==='error'?` <button data-tech-message-retry="${safe(message.id)}">Повторить</button>`:''}`}</span>`:'';
      return `${divider}<div class="bubble ${side} ${message.from==='bot'?'bot':''} message-${['support','bot'].includes(message.from)?message.from:'client'}">${author?`<small class="message-author">${author}</small>`:''}${message.text?`<p>${formattedMessageText(message.text)}</p>`:''}${messageAttachmentMarkup(message.attachment)}<time>${new Date(message.time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time>${delivery}</div>`;
    }).join('');
  }
  function messagesPage(){
    const active=state.conversations.find(item=>item.id===state.activeConversation);
    const avatar=(item)=>`<span class="contact-avatar ${item.logo?'has-image':''}">${item.logo?`<img src="${safe(item.logo)}" alt="">`:safe(item.name.slice(0,2).toUpperCase())}</span>`;
    return `<div class="tech-heading"><div><span class="tech-eyebrow">КЛИНИКИ</span><h1>Сообщения</h1></div></div><div class="messages-layout chief-messages"><div class="contacts">${state.conversations.map(item=>`<button class="contact ${item.id===state.activeConversation?'active':''}" data-tech-conversation="${safe(item.id)}">${avatar(item)}<span><strong>${safe(item.name)}</strong><small>${safe(item.lastMessage)}</small></span></button>`).join('')||'<p class="chat-empty">Сообщений от клиник пока нет.</p>'}</div><div class="conversation">${active?`<div class="conversation-head">${avatar(active)}<span><strong>${safe(active.name)}</strong><small>Диалог с клиникой</small></span></div><div class="chat-bubbles" id="chief-chat-bubbles">${state.conversationMessages.length?chiefMessagesMarkup(state.conversationMessages):'<p class="chat-empty">Сообщений пока нет.</p>'}</div><form class="chat-compose chat-compose-files" id="chief-chat-form">${state.messageAttachment?`<div class="chat-pending-file">${messageAttachmentMarkup(state.messageAttachment,true)}</div>`:''}<label class="chat-attach-button" title="Прикрепить файл">📎<input id="chief-chat-file" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.stl,.ply,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt,.rtf" hidden></label><input name="text" maxlength="2000" placeholder="Напишите ответ..." autocomplete="off"><button class="send-btn" aria-label="Отправить ответ">➤</button></form>`:'<p class="chat-empty">Выберите клинику слева.</p>'}${state.messagesError?`<p class="chat-error">${safe(state.messagesError)}</p>`:''}</div></div>`;
  }
  function scrollChiefChat(){const box=root().querySelector('#chief-chat-bubbles');if(box)box.scrollTop=box.scrollHeight}
  async function refreshMessages(){
    if(!isActive()||state.page!=='messages')return;
    const requestId=++messagesRequest;
    try{
      const headers={'X-Portal-Token':portalToken()};
      const response=await fetch('/api/chief/conversations',{headers,cache:'no-store'});
      if(!response.ok)throw new Error('Не удалось загрузить диалоги');
      const data=await response.json();
      const conversations=data.conversations||[];
      const selected=conversations.some(item=>item.id===state.activeConversation)?state.activeConversation:conversations[0]?.id||null;
      let messages=[];
      if(selected){const thread=await fetch('/api/chief/conversations/'+encodeURIComponent(selected),{headers,cache:'no-store'});if(!thread.ok)throw new Error('Не удалось загрузить сообщения');messages=(await thread.json()).messages||[]}
      if(requestId!==messagesRequest||!isActive()||state.page!=='messages')return;
      const changed=JSON.stringify([conversations,selected,messages])!==JSON.stringify([state.conversations,state.activeConversation,state.conversationMessages]);
      state.conversations=conversations;state.activeConversation=selected;state.conversationMessages=messages;state.messagesError='';
      if(changed&&state.page==='messages'&&!root().querySelector('#chief-chat-form input:focus')){shell(messagesPage());queueMicrotask(scrollChiefChat)}
    }catch(error){if(requestId!==messagesRequest)return;state.messagesError=error.message;if(state.page==='messages'&&!root().querySelector('#chief-chat-form input:focus'))shell(messagesPage())}
  }
  function shell(content){
    const pendingRequests=clientRequests().filter(request=>request.status==='pending').length;
    const newOrders=allOrders().filter(order=>['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(order.stage)).length;
    const intakeOrders=allOrders().filter(order=>order.stage==='Контроль качества').length;
    const newClients=clients.filter(client=>client.approved===false).length;
    const nav=[['overview','Обзор','home'],['orders','Заказы','orders',newOrders],['requests','Правки от клиентов','file',pendingRequests],['intake','Прием работ','check',intakeOrders],['messages','Сообщения','message'],['clients','Заказчики','clinic',newClients],['team','Команда','user'],['profile','Профиль','user']];
    const profile=chiefProfile();
    const avatar=profile.avatar?`<span class="avatar"><img src="${safe(profile.avatar)}" alt=""></span>`:`<span class="avatar">${safe(initials(profile.displayName||'Главный техник'))}</span>`;
    root().innerHTML=`<aside class="sidebar tech-sidebar" id="tech-sidebar"><button class="brand brand-home" data-tech-page="overview" aria-label="На главную"><img class="portal-logo" src="${logo}" alt="Create Dental"></button><div class="tech-side-label">КАБИНЕТ ГЛАВНОГО ТЕХНИКА</div><nav class="sidebar-nav">${nav.map(([page,label,ico,count])=>`<button class="nav-link ${state.page===page||state.page==='quality'&&page==='intake'||state.page==='detail'&&page==='orders'?'active':''}" data-tech-page="${page}">${icon(ico,20)}<span>${label}${count?` <i class="tech-nav-count">${count>99?'99+':count}</i>`:''}</span></button>`).join('')}</nav></aside><div class="shell tech-shell"><header class="topbar"><button class="mobile-menu" data-tech-action="menu" aria-label="Открыть меню">☰</button><div class="topbar-spacer"></div>${languageSwitcherMarkup()}${themeToggleMarkup()}${notificationCenterMarkup()}<button class="role-toggle" data-auth-logout>Выйти</button><button class="profile" data-tech-page="profile">${avatar}<span><strong>${safe(profile.displayName||'Главный техник')}</strong><small>Главный техник</small></span>${icon('chevron',13)}</button></header><main class="content tech-content">${content}</main></div><div class="toast ${state.toast?'visible':''}">${safe(state.toast)}</div>`;
  }
  function arrangeProductionTimeline(){
    if(state.page!=='detail')return;
    const order=orderById(state.orderId);
    const timeline=root().querySelector('.tech-detail-side .tech-timeline');
    if(!order||!timeline)return;
    const current=productionStageIndex(order.stage);
    const labels=['Принял в работу','В работе','ОТК','Передал дальше'];
    const displayStatus=status=>status==='Принял работу'?'Принял в работу':status==='Работа сдана'?'Передал дальше':status;
    const qualityKind=order.qualityRequest?.kind;
    const preManufacturingQuality=order.stage==='Контроль качества'&&['cad','preprod'].includes(qualityKind);
    const roleStatus={
      preprod:displayStatus(order.preprodTechnicianStatus)||(order.stage==='Препрод'?'В работе':order.productionType==='analog'&&['Изготовление','Контроль качества','Работа принята','В доставке','Принято доктором'].includes(order.stage)?'Передал дальше':''),
      cad:order.stage==='Подготовка'?'Принял в работу':order.stage==='Моделирование'?'В работе':['Согласование CAD','Изготовление','Контроль качества','Работа принята','В доставке','Принято доктором'].includes(order.stage)?'Передал дальше':'',
      frame:preManufacturingQuality?'':displayStatus(order.frameTechnicianStatus)||(order.manufacturingStatus===manufacturingStatuses[1]?'Передал дальше':order.manufacturingStatus===manufacturingStatuses[0]?'Принял в работу':''),
      painter:preManufacturingQuality?'':displayStatus(order.painterStatus||order.ceramicistStatus)||(order.stage==='Контроль качества'&&qualityKind==='esthetic'?'ОТК':order.stage==='Работа принята'?'Передал дальше':'')
    };
    const roleState=role=>{
      if(role==='preprod'&&order.stage==='Препрод')return 'Сейчас работает';
      if(role==='cad'&&order.stage==='Согласование CAD')return 'Ожидает решения врача';
      if(role==='frame'&&order.stage==='Изготовление'&&order.manufacturingStatus===manufacturingStatuses[0])return 'Сейчас работает';
      if(role==='painter'&&order.stage==='Изготовление'&&order.manufacturingStatus===manufacturingStatuses[1])return 'Сейчас работает';
      if(role==='painter'&&order.stage==='На доработке'&&['Принял в работу','В работе','ОТК'].includes(roleStatus.painter))return 'Сейчас работает';
      if(role==='frame'&&roleStatus.frame==='Передал дальше')return 'Передал дальше';
      if(role==='painter'&&roleStatus.painter==='Передал дальше')return 'Передал дальше';
      if(role==='painter'&&order.stage==='Изготовление'&&order.manufacturingStatus===manufacturingStatuses[0])return 'Ожидает передачи';
      if(role==='frame'&&order.stage!=='Изготовление')return 'Ожидает этапа изготовления';
      if(role==='painter'&&!roleStatus.painter)return 'Ожидает этапа доработки и эстетики';
      return '';
    };
    const progressPercent=status=>({'Принял работу':25,'Принял в работу':25,'В работе':50,'ОТК':75,'Работа сдана':100,'Передал дальше':100}[status]||0);
    const manufacturingProgress=()=>{
      if(['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage))return 100;
      if(order.stage==='Контроль качества')return ['cam','esthetic'].includes(order.qualityRequest?.kind)?100:0;
      const frameProgress=progressPercent(roleStatus.frame),painterProgress=progressPercent(roleStatus.painter);
      return order.manufacturingStatus===manufacturingStatuses[1]?50+Math.round(painterProgress/2):Math.round(frameProgress/2);
    };
    const stageProgress=(progress)=>`<div class="tech-stage-progress" style="width:220px;max-width:220px;flex:0 0 220px;margin:0;box-sizing:border-box" aria-label="Прогресс этапа ${progress}%"><div class="tech-progress-head"><span>Прогресс этапа</span><b>${progress}%</b></div><div class="tech-progress-track"><i style="width:${progress}%"></i></div></div>`;
    const nestedRole=(title,role)=>{const future=!roleStatus[role];return `<li class="tech-timeline-role${future?' future':''}"><strong>${title}</strong>${roleState(role)?`<small>${roleState(role)}</small>`:''}</li>${labels.map((label,index)=>{const rank=labels.indexOf(roleStatus[role]);return `<li class="tech-timeline-specialist ${index<rank?'done':index===rank?'current':''}"><i></i><span>${label}</span></li>`}).join('')}`};
    const visibleStages=order.productionType==='analog'?['Ожидает подтверждения','Приём / Доставка','Аналоговая подготовка','Моделирование','CAD на согласовании у врача','Изготовление','Контроль качества','Доставка в клинику','Принято врачом'].map(label=>productionStages.find(item=>item.label===label)).filter(Boolean):productionStages.filter(item=>item.label!=='Аналоговая подготовка');
    const visibleCurrent=Math.max(0,visibleStages.findIndex(item=>item.matches.includes(order.stage)));
    const qualityCompleted=qualityKind==='cad'?['Ожидает подтверждения','Приём / Доставка','Моделирование']:qualityKind==='preprod'?['Ожидает подтверждения','Приём / Доставка','Аналоговая подготовка']:qualityKind==='cam'?['Ожидает подтверждения','Приём / Доставка','Моделирование','CAD на согласовании у врача','Изготовление']:qualityKind==='esthetic'?['Ожидает подтверждения','Приём / Доставка','Моделирование','CAD на согласовании у врача','Изготовление']:qualityKind==='final'?['Ожидает подтверждения','Приём / Доставка','Моделирование','CAD на согласовании у врача','Изготовление']:[];
    const qualityTimeline=order.stage==='Контроль качества'&&qualityKind;
    const finalQualityActive=order.stage==='Работа принята';
    const qualityAfter={cad:'Моделирование',preprod:'Аналоговая подготовка',cam:'Изготовление',esthetic:'Изготовление',final:'Изготовление'}[qualityKind];
    const timelineStages=qualityTimeline?visibleStages.flatMap(item=>item.label===qualityAfter?[item,{label:qualityStageTitle(qualityKind),matches:[],qualityMarker:true}]:[item]):visibleStages;
    const finalQualityIndex=visibleStages.findIndex(item=>item.label==='Контроль качества');
    const overall=timelineStages.map((item,index)=>{const done=qualityTimeline?(item.qualityMarker?false:qualityCompleted.includes(item.label)):finalQualityActive?(index<finalQualityIndex):index<visibleCurrent;const active=qualityTimeline?(item.qualityMarker===true):finalQualityActive?(item.label==='Контроль качества'):index===visibleCurrent;const stateClass=`tech-timeline-stage ${done?'done':''} ${active?'current':''} ${!item.qualityMarker&&index===timelineStages.length-1&&index===current?'final':''}`;const progress=item.label==='Моделирование'?progressPercent(roleStatus.cad):item.label==='Аналоговая подготовка'?progressPercent(roleStatus.preprod):item.label==='Изготовление'?manufacturingProgress():item.label==='Доработка и эстетика'?progressPercent(roleStatus.painter):null;const label=item.label;const base=`<li class="${stateClass}"><i></i><span>${safe(label)}</span>${item.label==='CAD на согласовании у врача'&&order.stage==='Согласование CAD'?'<small class="tech-timeline-hint">Ожидается решение врача</small>':''}${progress!==null?stageProgress(progress):''}</li>`;if(item.label==='Моделирование')return `${base}${nestedRole('CAD оператор','cad')}`;if(item.label==='Аналоговая подготовка')return `${base}${nestedRole('Препрод техник','preprod')}`;if(item.label==='Изготовление')return `${base}${nestedRole('CAM оператор','frame')}`;if(item.label==='Доработка и эстетика')return `${base}${nestedRole('Эстетист','painter')}`;return base}).join('');
    timeline.innerHTML=overall;
    const badge=root().querySelector('.tech-heading .tech-stage');
    if(badge)badge.textContent=qualityTimeline?qualityStageTitle(qualityKind):finalQualityActive?'Контроль качества':productionStageLabel(order.stage);
    const note=root().querySelector('.tech-detail-actions p');
    if(note&&order.stage==='Согласование CAD')note.textContent='CAD отправлен врачу. Ожидается решение или комментарий врача.';
    if(note&&order.stage==='Моделирование')note.textContent='Моделирование работы выполняется.';
  }
  function arrangeAssignmentFilters(){
    if(state.page!=='detail')return;
    const legacy=root().querySelector('.tech-assign');
    const order=orderById(state.orderId);
    if(!legacy||!order)return;
    const displayStatus=status=>status==='Принял работу'?'Принял в работу':status==='Работа сдана'?'Передал дальше':status;
    const analog=order.productionType==='analog';
    // Сначала главный техник подтверждает заказ, затем назначает первого
    // специалиста после этапа «Приём / Доставка». CAM/CAD и Эстетист
    // остаются заблокированы до завершения предыдущего этапа.
    const pendingConfirmation=['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(order.stage);
    const preprodUnlocked=analog&&!pendingConfirmation;
    const cadUnlocked=pendingConfirmation?false:(analog?['Моделирование','Контроль качества','Согласование CAD'].includes(order.stage)&&(!order.qualityRequest||order.qualityRequest.kind==='cad'):true);
    const frameUnlocked=analog?order.cadReview?.status==='approved'||['Изготовление','Контроль качества','Работа принята','В доставке','Принято доктором'].includes(order.stage):order.cadReview?.status==='approved'||['Изготовление','Контроль качества','Работа принята','В доставке','Принято доктором'].includes(order.stage);
    const painterUnlocked=['Изготовление','Контроль качества','Работа принята','В доставке','Принято доктором'].includes(order.stage)&&(!analog||order.manufacturingStatus===manufacturingStatuses[1]||order.qualityRequest?.kind==='esthetic');
    const optionMarkup=(role)=>{
      const matches=role==='cad'?employee=>isCadOperatorEmployee(employee):role==='preprod'?isPreprodEmployee:role==='frame'?isFrameEmployee:isPainterEmployee;
      const employees=activeTeam().filter(matches);
      const key=role==='cad'?order.cadOperatorKey:role==='preprod'?order.preprodTechnicianKey:role==='frame'?order.frameTechnicianKey:order.painterKey;
      const current=team.find(employee=>employee.originalName===key),currentInGroup=current&&matches(current);
      return `<option value="">Не назначен</option>${current&&!activeTeam().some(employee=>employee.originalName===current.originalName)&&currentInGroup?`<option value="${safe(current.originalName)}" selected disabled>${safe(current.name||current.originalName)} · недоступен</option>`:''}${employees.map(employee=>`<option value="${safe(employee.originalName)}" ${key===employee.originalName?'selected':''}>${safe(employee.name)}</option>`).join('')}`;
    };
    const specialistStatus=role=>{
      if(role==='preprod')return displayStatus(order.preprodTechnicianStatus)||(order.stage==='Препрод'?'В работе':'');
      if(role==='frame')return displayStatus(order.frameTechnicianStatus)||(order.manufacturingStatus===manufacturingStatuses[1]?'Передал дальше':order.manufacturingStatus===manufacturingStatuses[0]?'Принял в работу':'');
      if(role==='painter')return displayStatus(order.painterStatus||order.ceramicistStatus)||(order.stage==='Контроль качества'?'ОТК':order.stage==='Работа принята'?'Передал дальше':'');
      if(order.stage==='Подготовка')return 'Принял в работу';
      if(order.stage==='Моделирование')return 'В работе';
      if(order.stage==='Согласование CAD')return 'ОТК';
      if(['Изготовление','Контроль качества','Работа принята','В доставке','Принято доктором'].includes(order.stage))return 'Передал дальше';
      return '';
    };
    const assignmentLabel=(role,label)=>`${label}${specialistStatus(role)?` <small class="tech-assign-status">${safe(specialistStatus(role))}</small>`:''}`;
    const wrapper=document.createElement('div');
    wrapper.className='tech-assign-filters';
    const assignmentFields=analog?[['preprod','Препрод техник'],['cad','CAD оператор'],['frame','CAM оператор'],['painter','Эстетист']]:[['cad','CAD оператор'],['frame','CAM оператор'],['painter','Эстетист']];
    wrapper.innerHTML=assignmentFields.map(([role,label])=>`<label>${assignmentLabel(role,label)}<select data-tech-assign="${safe(order.id)}" data-tech-assign-role="${role}">${optionMarkup(role)}</select></label>`).join('');
    const preprodSelect=wrapper.querySelector('[data-tech-assign-role="preprod"]'),frameSelect=wrapper.querySelector('[data-tech-assign-role="frame"]'),painterSelect=wrapper.querySelector('[data-tech-assign-role="painter"]'),cadSelect=wrapper.querySelector('[data-tech-assign-role="cad"]');
    if(preprodSelect&&!preprodUnlocked)preprodSelect.disabled=true;
    if(frameSelect&&!frameUnlocked)frameSelect.disabled=true;
    if(painterSelect&&!painterUnlocked)painterSelect.disabled=true;
    if(cadSelect&&!cadUnlocked)cadSelect.disabled=true;
    legacy.replaceWith(wrapper);
  }

  function render(){
    const route=routeFromPath(location.pathname);
    if(route.role==='technician'){state.page=route.page;if(route.orderId)state.orderId=route.orderId}
    try {overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}} catch {overrides={}}
    team=loadEmployees();
    try {const saved=JSON.parse(localStorage.getItem('create-dental-tech-clients')||'null');if(Array.isArray(saved))clients=saved} catch { /* Keep current directory. */ }
    const pages={overview,orders:ordersPage,requests:clientRequestsPage,detail:orderDetail,clients:clientsPage,messages:messagesPage,analytics:analyticsPage,team:teamPage,intake:qualityPage,quality:qualityPage,profile:profilePage};
    shell((pages[state.page]||overview)());
    const cadFrame=root().querySelector('#tech-cad-preview-frame');if(cadFrame&&state.cadPreview?.url)cadFrame.src=state.cadPreview.url;
    arrangeAssignmentFilters();
    arrangeProductionTimeline();
    if(state.page==='messages')queueMicrotask(()=>{refreshMessages();scrollChiefChat()});
    if(state.page==='profile'&&!state.integration)queueMicrotask(loadIntegrationStatus);
  }
  document.addEventListener('click',async event=>{
    if(currentUser()?.role!=='technician')return;
    if(root().querySelector('.notification-panel')&&!event.target.closest('.notification-center')){closeNotificationCenter();root().querySelector('.notification-panel')?.remove()}
    if(state.orderFilterOpen&&!event.target.closest('.tech-order-filter-panel')&&!event.target.closest('[data-tech-filter-panel]')){state.orderFilterOpen=false;root().querySelector('.tech-order-filter-panel')?.remove()}
    if(event.target.closest('[data-notification-toggle]')){await toggleNotificationCenter();render();return}
    if(event.target.closest('[data-notification-close]')){closeNotificationCenter();render();return}
    const notification=event.target.closest('[data-notification-id]');
    if(notification){
      const orderId=notification.dataset.notificationOrder,target=notification.dataset.notificationTarget,clinicId=notification.dataset.notificationClinic;
      await markNotificationCenterRead().catch(()=>{});closeNotificationCenter();
      if(target==='messages'){
        if(clinicId)state.activeConversation=clinicId;
        state.conversationMessages=[];setPage('messages');
      }else if(target==='clients')setPage('clients');
      else if(target==='profile'){state.integration=null;setPage('profile')}
      else if(orderId&&orderById(orderId)){state.orderId=orderId;setPage('detail')}
      else setPage('overview');
      return;
    }
    const messageFile=event.target.closest('[data-chief-chat-file]');
    if(messageFile){try{await downloadClinicMessageFile(messageFile.dataset.chiefChatFile)}catch(error){toast(error.message)}return}
    const retryMessage=event.target.closest('[data-tech-message-retry]');
    if(retryMessage&&state.activeConversation){
      retryMessage.disabled=true;try{const response=await fetch(`/api/chief/conversations/${encodeURIComponent(state.activeConversation)}/retry/${encodeURIComponent(retryMessage.dataset.techMessageRetry)}`,{method:'POST',headers:{'X-Portal-Token':portalToken()}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Не удалось отправить сообщение');await refreshMessages();toast('Сообщение доставлено')}catch(error){toast(error.message)}finally{retryMessage.disabled=false}return;
    }
    if(event.target.closest('[data-tech-message-attachment="remove"]')){state.messageAttachment=null;render();return}
    const conversation=event.target.closest('[data-tech-conversation]');
    if(conversation){state.activeConversation=conversation.dataset.techConversation;state.conversationMessages=[];render();return}
    const orderSort=event.target.closest('[data-tech-order-sort]');
    if(orderSort){const key=orderSort.dataset.techOrderSort;state.orderSortDirection=state.orderSortKey===key&&state.orderSortDirection==='asc'?'desc':'asc';state.orderSortKey=key;render();return}
    const orderFilterButton=event.target.closest('[data-tech-filter-panel]');
    if(orderFilterButton){
      const action=orderFilterButton.dataset.techFilterPanel;
      if(action==='toggle')state.orderFilterOpen=!state.orderFilterOpen;
      else if(action==='close')state.orderFilterOpen=false;
      else if(action==='reset'){state.orderClinicFilter='';state.orderMonthFilter='';state.orderFilterOpen=false;}
      render();
      return;
    }
    const requestFilter=event.target.closest('[data-tech-request-filter]');
    if(requestFilter){state.requestFilter=requestFilter.dataset.techRequestFilter||'all';render();return}
    const clientRequestAction=event.target.closest('[data-tech-client-request]');
    if(clientRequestAction){
      const action=clientRequestAction.dataset.techClientRequest,id=clientRequestAction.dataset.requestId;
      clientRequestAction.disabled=true;
      try{
        const response=await fetch(`/api/client-requests/${encodeURIComponent(id)}/${action}`,{method:'POST',headers:{'X-Portal-Token':portalToken()}});
        const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Не удалось обработать запрос');
        if(data.portal){
          if(Array.isArray(data.portal.orders))orders.splice(0,orders.length,...data.portal.orders);
          if(data.portal.orderOverrides){overrides=data.portal.orderOverrides;localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides))}
          if(Array.isArray(data.portal.clientRequests)){const list=clientRequests();list.splice(0,list.length,...data.portal.clientRequests)}
          if(Array.isArray(data.portal.orderHistory)){const history=orderHistory();history.splice(0,history.length,...data.portal.orderHistory)}
        }
        toast(action==='approve'?'Запрос одобрен, заказ обновлён':'Запрос отклонён, заказ не изменён');
      }catch(error){toast(error.message)}finally{if(clientRequestAction.isConnected)clientRequestAction.disabled=false}
      return;
    }
    const botAction=event.target.closest('[data-tech-bot-action]');
    if(botAction){
      const action=botAction.dataset.techBotAction;
      if(action==='refresh'){state.integration=null;await loadIntegrationStatus();return}
      botAction.disabled=true;
      try{
        const body={action};if(botAction.dataset.requestId)body.requestId=botAction.dataset.requestId;if(botAction.dataset.clinicId)body.clinicId=botAction.dataset.clinicId;
        const response=await fetch('/api/integrations/telegram',{method:'POST',headers:{'Content-Type':'application/json','X-Portal-Token':portalToken()},body:JSON.stringify(body)});
        const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Не удалось выполнить действие');
        state.integration=data.status||{};
        if(action==='approve-binding'){const portalResponse=await fetch('/api/portal',{headers:{'X-Portal-Token':portalToken()},cache:'no-store'});if(portalResponse.ok){const portal=await portalResponse.json();if(Array.isArray(portal.clients)){clients=portal.clients;localStorage.setItem('create-dental-tech-clients',JSON.stringify(clients))}}}
        render();toast(action==='approve-binding'?'Чат подключён, код безопасности обновлён':action==='reject-binding'?'Запрос отклонён':'Чат отключён');
      }catch(error){toast(error.message)}finally{botAction.disabled=false}
      return;
    }
    const profileAvatar=event.target.closest('[data-tech-profile-avatar]');
    if(profileAvatar?.dataset.techProfileAvatar==='remove'){
      saveChiefProfile({avatar:''},'Аватар удалён').catch(error=>toast(error.message));
      return;
    }
    const employeeAction=event.target.closest('[data-tech-employee-action]');
    if(employeeAction){
      const action=employeeAction.dataset.techEmployeeAction;
      const id=employeeAction.dataset.employeeId;
      const employee=team.find(item=>item.id===id);
      if(action==='new')state.editEmployeeId='new';
      else if(action==='edit'&&employee)state.editEmployeeId=id;
      else if(action==='cancel')state.editEmployeeId=null;
      else if(action==='disable'&&employee&&employee.status==='active'){employee.status='disabled';saveTeam().catch(()=>{})}
      else if(action==='enable'&&employee&&employee.status==='disabled'){employee.status='active';saveTeam().catch(()=>{})}
      else if(action==='fire'&&employee&&employee.status!=='fired')state.confirmFireId=id;
      else if(action==='cancel-fire')state.confirmFireId=null;
      else if(action==='confirm-fire'&&employee&&employee.status!=='fired'){
        for(const order of allOrders().filter(order=>[order.assigneeKey,order.cadOperatorKey,order.frameTechnicianKey,order.painterKey].includes(employee.originalName)&&!['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage))){
          overrides[order.id]={...(overrides[order.id]||{}),assignee:'',stage:'Ожидает распределения'};
        }
        localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
        savePortal('orderOverrides',overrides).catch(error=>toast('Не удалось сохранить заказы на сервере: '+error.message));
        employee.status='fired';
        saveTeam().catch(()=>{});
        state.confirmFireId=null;
        if(state.editEmployeeId===id)state.editEmployeeId=null;
      }
      render();
      return;
    }
    const clientAction=event.target.closest('[data-tech-client-action]');
    if(clientAction){
      const action=clientAction.dataset.techClientAction;
      const id=clientAction.dataset.clientId;
      if(action==='copy-telegram-code'){
        const telegramCode=clientAction.dataset.telegramCode;
        if(telegramCode){await copyText(telegramCode);toast(`Код Telegram ${telegramCode} скопирован`)}
      }
      else if(action==='new')state.editClientId='new';
      else if(action==='edit')state.editClientId=id;
      else if(action==='cancel')state.editClientId=null;
      else if(action==='approve'){const client=clients.find(item=>item.id===id);if(client){client.approved=true;saveClients();toast('Доступ клиники подтверждён')}}
      else if(action==='delete')state.confirmDeleteId=id;
      else if(action==='cancel-delete')state.confirmDeleteId=null;
      else if(action==='confirm-delete'){
        const client=clients.find(item=>item.id===id);
        if(client){client.deleted=true;saveClients()}
        state.confirmDeleteId=null;
        if(state.editClientId===id)state.editClientId=null;
      }
      render();
      return;
    }
    const modal=event.target.closest('[data-tech-modal]');
    if(modal&&event.target===modal){if(state.orderUpload?.uploading)return;if(modal.dataset.techModal==='cad-preview'){cadPreviewRequest++;if(state.cadPreview?.url)URL.revokeObjectURL(state.cadPreview.url)}state.editOrderId=null;state.editOrderVariants=null;state.confirmOrderDeleteId=null;state.orderUpload=null;state.cadPreview=null;render();return}
      const orderAction=event.target.closest('[data-tech-order-action]');
    if(orderAction){
      const action=orderAction.dataset.techOrderAction,id=orderAction.dataset.id;
      if(action==='open-cad'){
        const fileId=orderAction.dataset.fileId,order=orderById(id);
        if(!fileId||!order)return;
        const requestId=++cadPreviewRequest;
        state.cadPreview={orderId:id,fileId,name:'Загрузка CAD…',html:'',url:''};render();
        try{const html=await loadCadReviewHtml(fileId);if(requestId!==cadPreviewRequest||!state.cadPreview||state.cadPreview.fileId!==fileId)return;const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));state.cadPreview={orderId:id,fileId,name:orderFilesState.files.find(file=>file.id===fileId)?.name||'CAD',html:'',url};render()}
        catch(error){if(requestId!==cadPreviewRequest)return;state.cadPreview=null;toast(error.message||'Не удалось открыть CAD');render()}
        return;
      }
      if(action==='close-cad'){cadPreviewRequest++;if(state.cadPreview?.url)URL.revokeObjectURL(state.cadPreview.url);state.cadPreview=null;render();return}
      if(action==='toggle-paid'){
        const order=orders.find(item=>item.id===id);
        if(order)await saveOrderRecord(id,order.paidAt?{paidAt:'',paymentStatus:'Не оплачено'}:{paidAt:new Date().toISOString(),paymentStatus:'Оплачено'});
        return;
      }
      if(action==='disk'){
        const popup=window.open('about:blank','_blank');
        if(popup)popup.opener=null;
        try{
          const result=await loadOrderFiles(id);
          if(!result.folderUrl)throw new Error('Папка заказа недоступна');
          if(popup)popup.location.replace(result.folderUrl);
          else window.open(result.folderUrl,'_blank','noopener');
        }catch(error){if(popup)popup.close();toast('Не удалось открыть папку: '+error.message)}
        return;
      }
      if(action==='edit'){const order=orderById(id),fallback=order?{toothMode:order.toothMode||'Одиночка',bridgeRanges:order.bridgeRanges||[],selectedTeeth:[...(order.teeth||[])],work:order.work,workOption:order.material}:null;state.editOrderId=id;state.editOrderVariants=(order?.variants?.length?order.variants:[fallback]).filter(Boolean).map(variant=>({...variant,selectedTeeth:[...(variant.selectedTeeth||[])],bridgeRanges:(variant.bridgeRanges||[]).map(range=>[...range])}));state.confirmOrderDeleteId=null;render();return}
      if(action==='add-edit-variant'){if((state.editOrderVariants||[]).length>=10)return toast('В одном заказе можно добавить до 10 услуг');state.editOrderVariants=[...(state.editOrderVariants||[]),{toothMode:'Одиночка',bridgeRanges:[],selectedTeeth:[],work:'',workOption:''}];render();return}
      if(action==='remove-edit-variant'){if((state.editOrderVariants||[]).length<=1)return toast('Оставьте хотя бы одну услугу');const index=Number(orderAction.dataset.index);state.editOrderVariants=state.editOrderVariants.filter((_,position)=>position!==index);render();return}
      if(action==='delete'){state.confirmOrderDeleteId=id;state.editOrderId=null;state.editOrderVariants=null;render();return}
      if(action==='open-upload'){state.orderUpload={orderId:id||state.orderId,uploading:false,files:[]};render();return}
      if(action==='close-upload'){if(!state.orderUpload?.uploading){state.orderUpload=null;render()}return}
      if(action==='close-modal'){state.editOrderId=null;state.editOrderVariants=null;state.confirmOrderDeleteId=null;render();return}
      if(action==='confirm-delete'){deleteOrderRecord(id);state.confirmOrderDeleteId=null;return}
    }
    const action=event.target.closest('[data-tech-action]');
    if(action){
      const id=action.dataset.id;
      const order=id&&orderById(id);
      if(action.dataset.techAction==='menu'){root().querySelector('#tech-sidebar')?.classList.toggle('open');return}
      if(!order)return;
      if(action.dataset.techAction==='approve-draft'){
        if(!await saveOrderRecord(id,{telegramDraft:false}))return;overrides[id]={...(overrides[id]||{}),stage:'Подготовка'};localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));await savePortal('orderOverrides',overrides);toast('Заказ подтверждён и переведён на этап «Приём / Доставка»');render();return;
      }
      if(action.dataset.techAction==='advance'){
        if(order.stage==='Ожидает распределения'){saveOrder(id,{stage:'Подготовка'});toast('Заказ подтверждён и переведён на этап «Приём / Доставка»');return;}
        if(order.stage==='Согласование CAD')return toast('CAD остаётся на согласовании у врача до его решения');
        if(order.stage==='Изготовление'){const productionKey=order.manufacturingStatus===manufacturingStatuses[1]?order.painterKey:order.frameTechnicianKey;if(!activeTeam().some(employee=>employee.originalName===productionKey))return toast(order.manufacturingStatus===manufacturingStatuses[1]?'Назначьте Эстетиста':'Назначьте CAM оператора');}else if(!activeTeam().some(employee=>employee.originalName===order.assigneeKey))return toast('Назначьте активного исполнителя');
        if(['Моделирование','Согласование CAD'].includes(order.stage)&&order.productionType!=='analog')return toast('CAD должен согласовать врач');
        if(order.stage==='Изготовление'){
          if(order.manufacturingStatus===manufacturingStatuses[0]){
            saveOrder(id,{stage:'Контроль качества',manufacturingStatus:'',frameTechnicianStatus:'ОТК',technicianStatus:'ОТК',qualityRequest:{kind:'cam',requestedBy:'chief',requestedByName:'Главный техник',requestedAt:new Date().toISOString(),next:'Передача Эстетисту'}});
          }else{
            saveOrder(id,{stage:'Контроль качества',manufacturingStatus:'',painterStatus:'ОТК',ceramicistStatus:'ОТК',technicianStatus:'ОТК',qualityRequest:{kind:'esthetic',requestedBy:'chief',requestedByName:'Главный техник',requestedAt:new Date().toISOString(),next:'Финальная ОТК'}});
          }
          return;
        }
        const next=order.productionType==='analog'&&order.stage==='Подготовка'?'Препрод':stages[stages.indexOf(order.stage)+1];
        if(next)saveOrder(id,{stage:next,...(next==='Изготовление'?{manufacturingStatus:manufacturingStatuses[0]}:next==='Контроль качества'?{technicianStatus:'ОТК'}:{})});
      }
      if(action.dataset.techAction==='approve'&&order.stage==='Контроль качества'){
        const request=order.qualityRequest,qualityApprovedAt=new Date().toISOString();
        if(request?.kind==='cad')saveOrder(id,{stage:'Согласование CAD',qualityRequest:null,cadOperatorStatus:'Работа сдана'});
        else if(request?.kind==='preprod')saveOrder(id,{stage:order.productionType==='analog'?'Моделирование':'Изготовление',manufacturingStatus:order.productionType==='analog'?'':manufacturingStatuses[0],qualityRequest:null,preprodTechnicianStatus:'Работа сдана',technicianStatus:'Принял работу',qualityApprovedAt});
        else if(request?.kind==='cam')saveOrder(id,{stage:'Изготовление',manufacturingStatus:manufacturingStatuses[1],qualityRequest:null,frameTechnicianStatus:'Работа сдана',technicianStatus:'Принял работу',qualityApprovedAt});
        else if(request?.kind==='esthetic')saveOrder(id,{stage:'Контроль качества',qualityRequest:{kind:'final',requestedBy:'chief',requestedByName:'Главный техник',requestedAt:qualityApprovedAt,next:'Доставка в клинику'},painterStatus:'Работа сдана',ceramicistStatus:'Работа сдана',technicianStatus:'Финальная ОТК',qualityApprovedAt});
        else if(request?.kind==='final')saveOrder(id,{stage:'В доставке',qualityRequest:null,technicianStatus:'Работа сдана',completedAt:qualityApprovedAt,qualityApprovedAt});
        else saveOrder(id,{stage:'Работа принята',technicianStatus:'Работа сдана',painterStatus:'Работа сдана',ceramicistStatus:'Работа сдана',completedAt:qualityApprovedAt,qualityApprovedAt});
      }
      if(action.dataset.techAction==='rework'&&order.stage==='Контроль качества'){
        const request=order.qualityRequest;
        if(request?.kind==='cad')saveOrder(id,{stage:'Моделирование',qualityRequest:null,cadReview:{...(order.cadReview||{}),status:'returned',comment:'Главный техник отправил CAD на доработку',reviewedAt:new Date().toISOString()}});
        else saveOrder(id,{stage:request?.kind==='preprod'?'На доработке':'Изготовление',manufacturingStatus:request?.kind==='esthetic'?manufacturingStatuses[1]:request?.kind==='cam'?'':order.manufacturingStatus,qualityRequest:null,reworkKind:request?.kind==='preprod'?'preprod':request?.kind==='esthetic'?'esthetic':request?.kind==='final'?'esthetic':'cam',reworkReason:`Главный техник отправил работу на доработку (${request?.requestedByName||'проверка ОТК'})`,reworkAt:new Date().toISOString()});
      }
      if(action.dataset.techAction==='rework-resume'&&order.stage==='На доработке')saveOrder(id,{stage:order.reworkKind==='preprod'?'Препрод':'Изготовление',manufacturingStatus:order.reworkKind==='preprod'?'':order.reworkKind==='esthetic'?manufacturingStatuses[1]:manufacturingStatuses[0],preprodTechnicianStatus:order.reworkKind==='preprod'?'Принял работу':'',technicianStatus:'В работе'});
      if(action.dataset.techAction==='rollback'){
        if(order.stage==='Изготовление'&&order.manufacturingStatus===manufacturingStatuses[1])saveOrder(id,{manufacturingStatus:manufacturingStatuses[0]});
        else {const previous=order.stage==='Изготовление'?'Моделирование':stages[stages.indexOf(order.stage)-1];if(previous&&previous!=='Согласование CAD')saveOrder(id,{stage:previous,manufacturingStatus:''})}
      }
      return;
    }
    const calendar=event.target.closest('[data-tech-calendar-action]');
    if(calendar){
      const action=calendar.dataset.techCalendarAction;
      if(action==='day')state.deadlineDay=Number(calendar.dataset.value);
      else if(action==='all'){
        state.orderDueFilter=calendar.dataset.value;state.filter='Все';state.search='';setPage('orders');return;
      }
      else{
        state.deadlineMonth=new Date(state.deadlineMonth.getFullYear(),state.deadlineMonth.getMonth()+(action==='next'?1:-1),1);
        state.deadlineDay=null;
      }
      render();
      return;
    }
    const month=event.target.closest('[data-tech-month]');
    if(month){state.month=Number(month.dataset.techMonth);render();return}
    const metric=event.target.closest('[data-tech-metric]');
    if(metric){state.metric=metric.dataset.techMetric;render();return}
    const sort=event.target.closest('[data-tech-sort]');
    if(sort){state.sort=sort.dataset.techSort;render();return}
    const filter=event.target.closest('[data-tech-filter]');
    if(filter){state.filter=filter.dataset.techFilter;render();return}
    const employeeFilter=event.target.closest('[data-tech-employee-filter]');
    if(employeeFilter){state.employeeFilter=employeeFilter.dataset.techEmployeeFilter;render();return}
    if(event.target.closest('[data-tech-date-filter-clear]')){state.orderDueFilter='';render();return}
    const page=event.target.closest('[data-tech-page]');
    if(page){root().querySelector('#tech-sidebar')?.classList.remove('open');if(page.dataset.techPage==='orders'){state.orderDueFilter='';if(page.dataset.techOverdue)state.filter='Врач не принял 2 дня'}setPage(page.dataset.techPage);return}
    const order=event.target.closest('[data-tech-order]');
    if(order){state.orderId=order.dataset.techOrder;setPage('detail')}
  });
  document.addEventListener('keydown',event=>{
    if(!isActive())return;
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('tr[data-tech-order]')){event.preventDefault();event.target.click()}
  });
  document.addEventListener('change',event=>{
    if(!isActive())return;
    if(event.target.closest('#tech-order-edit-form')){const editForm=event.target.form,card=event.target.closest('[data-edit-variant]');if(card&&event.target.matches('[data-edit-jaw]')){const jawTeeth=event.target.value==='upper'?[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28]:event.target.value==='lower'?[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]:[];card.querySelectorAll('[data-edit-tooth]').forEach(input=>{input.checked=jawTeeth.includes(Number(input.value))})}refreshEditPrices(editForm);return}
    if(event.target.id==='chief-chat-file'){const file=event.target.files?.[0];event.target.value='';selectMessageAttachment(file);return}
    if(event.target.id==='tech-direct-order-upload'){const files=Array.from(event.target.files||[]);state.orderId=event.target.dataset.orderId||state.orderId;event.target.value='';startOrderUpload(files);return}
    if(event.target.id==='tech-order-upload-dialog-input'){const files=Array.from(event.target.files||[]);event.target.value='';startOrderUpload(files);return}
    if(event.target.id==='tech-source-photo'){
      const order=orderById(state.orderId),selected=Array.from(event.target.files||[]),files=selected.filter(file=>/\.(jpg|jpeg|png|webp)$/i.test(file.name)&&file.size<=200*1024*1024);
      if(selected.length!==files.length)toast('Выберите фото JPG, PNG или WebP до 200 МБ.');
      if(!order||!files.length){event.target.value='';return}
      (async()=>{try{for(const file of files)await uploadOrderFile(order.id,file,{purpose:'source-photo'});const result=await loadOrderFiles(order.id);orderFilesState.files=result.files||[];orderFilesState.folderUrl=result.folderUrl||'';toast('Исходные фото сохранены в папке «Исходные фото»');render()}catch(error){toast(error.message)}})();event.target.value='';return;
    }
    if(event.target.id==='tech-profile-avatar'){
      const file=event.target.files?.[0];
      if(!file)return;
      avatarFromFile(file).then(avatar=>saveChiefProfile({avatar},'Аватар сохранён')).catch(error=>toast(error.message));
      return;
    }
    if(event.target.matches('[data-tech-order-clinic-filter]')){state.orderClinicFilter=event.target.value;render();return}
    if(event.target.matches('[data-tech-order-month-filter]')){state.orderMonthFilter=event.target.value;render();return}
    if(event.target.matches('[data-tech-month-select]')){state.month=Number(event.target.value);render()}
    if(event.target.matches('[data-tech-technician]')){state.technician=event.target.value;render()}
    if(event.target.matches('[data-tech-assign]')){
      const id=event.target.dataset.techAssign;
      const name=event.target.value;
      if(name&&!activeTeam().some(employee=>employee.originalName===name))return;
      const current=orderById(id);
      if(!current)return;
      const role=event.target.dataset.techAssignRole;
      if(role==='cad'&&(['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(current.stage)||current.productionType==='analog'&&!['Моделирование','Контроль качества','Согласование CAD'].includes(current.stage)))return toast('Сначала завершите препрод и его ОТК');
      if(role==='preprod'&&name&&(!current.productionType||current.productionType==='digital'))return toast('Для цифрового заказа назначается CAD оператор');
      if(role==='frame'&&name&&!(current.cadReview?.status==='approved'||['Изготовление','Контроль качества','Работа принята','В доставке','Принято доктором'].includes(current.stage)))return toast('Сначала завершите CAD и его согласование');
      if(role==='painter'&&name&&!(current.stage==='Изготовление'&&current.manufacturingStatus===manufacturingStatuses[1]||['Контроль качества','Работа принята','В доставке','Принято доктором'].includes(current.stage)))return toast('Сначала завершите работу CAM оператора и его ОТК');
      const change=role==='cad'?{cadOperator:name,assignee:current.frameTechnicianKey||current.painterKey||name||''}:role==='preprod'?{preprodTechnician:name,assignee:name||current.cadOperatorKey||''}:role==='frame'?{frameTechnician:name,technician:name,assignee:name||current.painterKey||current.cadOperatorKey||''}:{painter:name,ceramicist:name,assignee:current.frameTechnicianKey||name||current.cadOperatorKey||''};
      saveOrder(id,change);
    }
  });

  document.addEventListener('submit',async event=>{
    if(!isActive()||event.target.id!=='tech-order-edit-form')return;
    event.preventDefault();
    const form=event.target,date=form.elements.namedItem('date').value.trim(),valid=new Set([11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48]),upper=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],lower=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
    if(!/^\d{2}\.\d{2}\.\d{4}$/.test(date))return toast('Укажите срок в формате дд.мм.гггг');
    const variants=[...form.querySelectorAll('[data-edit-variant]')].map(card=>{const service=String(card.querySelector('[data-edit-service]')?.value||'').split('|'),mode=card.querySelector('[data-edit-mode]')?.value||'Одиночка',jaw=card.querySelector('[data-edit-jaw]')?.value||'';let teeth=[...card.querySelectorAll('[data-edit-tooth]:checked')].map(input=>Number(input.value)).filter(tooth=>valid.has(tooth));if(mode==='Челюсть')teeth=jaw==='upper'?[...upper]:jaw==='lower'?[...lower]:[];teeth=[...new Set(teeth)].sort((a,b)=>a-b);return {work:service[0]||'',workOption:service[1]||'',toothMode:mode,bridgeRanges:mode==='Мост'?[teeth]:[],selectedTeeth:teeth}});
    if(variants.some(variant=>!variant.work||!variant.workOption))return toast('Выберите услугу для каждой позиции');
    if(variants.some(variant=>!variant.selectedTeeth.length))return toast('Выберите зубы для каждой услуги');
    const amounts=variants.map(editVariantPrice),total=amounts.every(Number.isFinite)?amounts.reduce((sum,amount)=>sum+amount,0):null,teeth=[...new Set(variants.flatMap(variant=>variant.selectedTeeth))].sort((a,b)=>a-b),first=variants[0],shade=form.elements.namedItem('shade').value.trim();
    await saveOrderRecord(state.editOrderId,{patient:form.elements.namedItem('patient').value.trim(),birth:form.elements.namedItem('birth').value,toothMode:variants.length>1?'Несколько услуг':first.toothMode,bridgeRanges:variants.flatMap(variant=>variant.bridgeRanges||[]),work:variants.length>1?`Несколько услуг (${variants.length})`:first.work,material:variants.length>1?variants.map(variant=>variant.workOption).join(' · '):first.workOption,date,sum:total===null?form.elements.namedItem('sum')?.value.trim()||'Стоимость уточняется':rubles(total),quantity:teeth.length,teeth,shade,comment:form.elements.namedItem('comment').value.trim(),variants});
    state.editOrderId=null;state.editOrderVariants=null;
  });
  document.addEventListener('submit',async event=>{
    if(!isActive()||event.target.id!=='chief-chat-form')return;
    event.preventDefault();
    const form=event.target,text=form.elements.namedItem('text').value.trim(),pending=state.messageAttachment;
    if(!text&&!pending||!state.activeConversation)return;
    const button=form.querySelector('.send-btn');button.disabled=true;
    try{const uploaded=pending?(pending.uploaded||await uploadClinicMessageFile(pending.file,state.activeConversation)):null;if(pending&&!pending.uploaded)state.messageAttachment={...pending,uploaded};const attachment=uploaded?{...uploaded,preview:pending.preview||''}:null;const response=await fetch('/api/chief/conversations/'+encodeURIComponent(state.activeConversation)+'/reply',{method:'POST',headers:{'Content-Type':'application/json','X-Portal-Token':portalToken()},body:JSON.stringify({text,attachment})});if(!response.ok){let data={};try{data=await response.json()}catch{}throw new Error(data.error||'Не удалось отправить ответ')}const data=await response.json();form.reset();state.messageAttachment=null;state.conversationMessages=[...state.conversationMessages,data.message];state.conversations=state.conversations.map(item=>item.id===state.activeConversation?{...item,lastMessage:data.message.text||`📎 ${data.message.attachment?.name||'Файл'}`,updatedAt:data.message.time}:item).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));shell(messagesPage());queueMicrotask(scrollChiefChat);refreshMessages()}catch(error){state.messagesError=error.message;shell(messagesPage())}finally{if(button.isConnected)button.disabled=false}
  });
  document.addEventListener('submit',async event=>{
    if(!isActive()||event.target.id!=='tech-integration-form')return;
    event.preventDefault();
    const form=event.target,body={};
    for(const name of ['telegramBotToken','employeeTelegramBotToken','speechKitKey','yandexGptKey','folderId','yandexDiskToken']){
      const value=form.elements.namedItem(name).value.trim();
      if(value)body[name]=value;
    }
    if(!Object.keys(body).length)return toast('Введите хотя бы одно новое значение');
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const response=await fetch('/api/integrations/telegram',{method:'POST',headers:{'Content-Type':'application/json','X-Portal-Token':portalToken()},body:JSON.stringify(body)});
      let data={};try{data=await response.json()}catch{}
      if(!response.ok)throw new Error(data.error||'Не удалось сохранить настройки');
      form.reset();state.integration=data.status||{};toast(state.integration.enabled?'Telegram и Yandex подключены':'Настройки сохранены. Заполните оставшиеся поля');
    }catch(error){toast(error.message)}
    finally{if(button.isConnected)button.disabled=false}
  });
  document.addEventListener('submit',async event=>{
    if(!isActive()||event.target.id!=='tech-profile-form')return;
    event.preventDefault();
    const form=event.target,profile=chiefProfile();
    const displayName=form.elements.namedItem('displayName').value.trim();
    const email=form.elements.namedItem('email').value.trim();
    const password=form.elements.namedItem('password').value;
    const passwordConfirm=form.elements.namedItem('passwordConfirm').value;
    if(!displayName)return toast('Укажите имя');
    if(password&&password.length<8)return toast('Пароль должен быть от 8 символов');
    if(password!==passwordConfirm)return toast('Пароли не совпадают');
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const data=await authRequest('chief-profile',{displayName,email,password,avatar:profile.avatar||''});
      state.profile=data.user;
      onUserUpdate(data.user);
      render();
      toast('Профиль главного техника сохранён');
    }catch(error){toast(error.message)}
    finally{button.disabled=false}
  });
  document.addEventListener('submit',async event=>{
    if(!isActive()||event.target.id!=='tech-employee-form')return;
    event.preventDefault();
    const form=event.target;
    const values={};
    for(const name of ['name','specialty','phone','email'])values[name]=form.elements.namedItem(name).value.trim();
    if(!values.name||!values.specialty||!values.email)return toast('Укажите имя, специализацию и email');
    const password=form.elements.namedItem('password').value;
    if(team.some(employee=>employee.name.toLowerCase()===values.name.toLowerCase()&&employee.id!==state.editEmployeeId))return toast('Техник с таким именем уже есть');
    if(state.editEmployeeId==='new')team.push({id:`tech-custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,originalName:values.name,...values,status:'active'});
    else {
      const employee=team.find(item=>item.id===state.editEmployeeId);
      if(!employee)return;
      Object.assign(employee,values);
    }
    const saved=team.find(item=>item.id===state.editEmployeeId)||team.at(-1);
    try{await saveTeam();await authRequest('staff',{employeeId:saved.id,email:saved.email,password});state.editEmployeeId=null;state.technician='Все техники';toast('Данные техника и вход сохранены')}catch(error){toast('Не удалось создать вход техника: '+error.message)}
  });
  document.addEventListener('submit',event=>{
    if(!isActive()||event.target.id!=='tech-client-form')return;
    event.preventDefault();
    const form=event.target;
    const values={};
    for(const name of ['name','contact','phone','email','city','address'])values[name]=form.elements.namedItem(name).value.trim();
    if(!values.name)return toast('Укажите название клиники');
    const duplicate=clients.some(client=>client.name.toLowerCase()===values.name.toLowerCase()&&client.id!==state.editClientId);
    if(duplicate)return toast('Клиент с таким названием уже есть');
    if(state.editClientId==='new')clients.push({id:`client-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,originalName:values.name,telegramCode:nextTelegramCode(),...values});
    else {
      const client=clients.find(item=>item.id===state.editClientId&&!item.deleted);
      if(!client)return;
      Object.assign(client,values);
    }
    saveClients();
    state.editClientId=null;
    toast('Данные клиента сохранены локально');
  });
  document.addEventListener('input',event=>{
    if(!isActive())return;
    if(event.target.id==='tech-employee-search'){
      state.employeeSearch=event.target.value;
      render();
      root().querySelector('#tech-employee-search')?.focus();
      return;
    }
    if(event.target.id==='tech-client-search'){
      state.clientSearch=event.target.value;
      render();
      root().querySelector('#tech-client-search')?.focus();
      return;
    }
    if(event.target.id!=='tech-search')return;
    state.search=event.target.value;
    root().querySelectorAll('.tech-order-row').forEach(row=>{
      row.hidden=!row.textContent.toLowerCase().includes(state.search.toLowerCase());
    });
  });
  async function refreshClientRequests(){
    if(!isActive()||state.page!=='requests')return;
    try{
      const response=await fetch('/api/portal',{headers:{'X-Portal-Token':portalToken()},cache:'no-store'});if(!response.ok)return;
      const portal=await response.json(),current=clientRequests(),next=Array.isArray(portal.clientRequests)?portal.clientRequests:[];
      if(JSON.stringify(current)!==JSON.stringify(next)){
        current.splice(0,current.length,...next);
        if(Array.isArray(portal.orders))orders.splice(0,orders.length,...portal.orders);
        if(portal.orderOverrides){overrides=portal.orderOverrides;localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides))}
        render();
      }
    }catch{/* The next refresh will retry. */}
  }
  return {render,refreshMessages,refreshClientRequests};
}
