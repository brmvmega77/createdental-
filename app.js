import { seedOrders } from './seed-orders.js?v=mobile-fast-1';
import {portalToken,setPortalToken,clearPortalToken,loadPortal,savePortal,authRequest,uploadOrderFile,loadOrderFiles,loadOrderFilePreview,requestOrderRework,uploadClinicMessageFile,downloadClinicMessageFile,decideCadReview,loadCadReviewHtml} from './portal-client.js?v=yandex-upload-11';
import {routeFromPath,pathFor,navigate} from './routes.js?v=worker-salary-1';
import {notificationCenterMarkup,refreshNotificationCenter,markNotificationCenterRead,toggleNotificationCenter,closeNotificationCenter,notificationCenterState} from './notification-center.js?v=dashboard-layout-4';
import {workCatalog,rubles} from './work-catalog.js?v=work-prices-5';
import {themeToggleMarkup,languageSwitcherMarkup} from './theme.js?v=portal-language-1';
import {productionStages} from './technician.js?v=portal-language-1';
import './location-assist.js?v=portal-language-2';

const $ = (selector) => document.querySelector(selector);
const icons = {
  home:'<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-7h6v7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  orders:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M8.5 10h7M8.5 14h7M8.5 18h4"/>',
  file:'<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v6h5M9 13h6M9 17h6"/>',
  message:'<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-1-2V6a2 2 0 0 1 2-2z"/><path d="M8 9h8M8 13h5"/>',
  book:'<path d="M12 6c-2.4-1.5-5.4-1.7-9-.8v14c3.6-.9 6.6-.7 9 .8 2.4-1.5 5.4-1.7 9-.8v-14c-3.6-.9-6.6-.7-9 .8zM12 6v14"/>',
  clinic:'<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 10h6M12 7v6"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  chevron:'<path d="m9 18 6-6-6-6"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  disk:'<line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/>',
  heart:'<path d="M20.8 8.5c0 5-8.8 11.3-8.8 11.3S3.2 13.5 3.2 8.5a4.8 4.8 0 0 1 8.8-2.6 4.8 4.8 0 0 1 8.8 2.6z"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3-7 8-7s8 2.5 8 7"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  paperclip:'<path d="m20 11-8 8a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>',
  check:'<path d="m5 12 5 5L20 7"/>',
  back:'<path d="m15 18-6-6 6-6"/>',
  more:'<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'
  ,wallet:'<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5z"/><path d="M4 8h15M16 13h5"/><circle cx="16" cy="13" r=".8" fill="currentColor" stroke="none"/>'
};
const icon = (name,size=18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayActor = (event) => event?.actorRole === 'clinic' ? 'Клиент' : 'Create Dental Team';
const assets = '/assets/';
const logo = `${assets}create-dental-logo.png`;
const orders = seedOrders.map(order=>({...order}));
const nav = [['home','Главная','home'],['new','Новый заказ','plus'],['orders','Мои заказы','orders'],['messages','Сообщения','message'],['clinic','Моя клиника','clinic']];
const steps = ['Пациент','Зубы и работа','Дополнительно','Подтверждение'];
const oldLink=new URLSearchParams(location.search);
if(oldLink.has('role')||oldLink.has('page')){
  const oldRole=['technician','worker'].includes(oldLink.get('role'))?oldLink.get('role'):'clinic';
  navigate(pathFor(oldRole,oldLink.get('page')|| (oldRole==='clinic'?'home':'overview'),oldLink.get('order')),{replace:true});
}
const initialRoute=routeFromPath(location.pathname);
const state = {role:initialRoute.role||'clinic',page:initialRoute.role==='clinic'?initialRoute.page:'home',step:0,filter:'Все',query:'',dueDateFilter:'',orderMonthFilter:'',orderFilterOpen:false,sortKey:'',sortDirection:'asc',orderId:initialRoute.orderId||'',detailTab:'Обзор',fileTab:'Все файлы',clinicTab:'Основная информация',selectedTeeth:[],bridgeRanges:[],bridgeStart:null,dentition:'Постоянные зубы',toothMode:'Одиночка',work:'',workOption:'',orderVariants:[],cart:[],messages:[],chatText:'',chatAttachment:null,chatStatus:'Служба поддержки онлайн · отвечаем 10:00–21:00 МСК',calendarMonth:new Date(new Date().getFullYear(),new Date().getMonth(),1),calendarDay:new Date().getDate(),uploaded:[],orderFiles:[],orderFolderUrl:'',filesFor:'',orderUpload:null,reworkOrderId:'',cadReturnOrderId:'',cadReturnComment:'',cadReturnAttachments:[],cadPreview:null,clientRequest:null,form:{surname:'',initials:'',birth:'',orderType:'',construction:'',material:'',quantity:'1',due:new Date(Date.now()+14*86400000).toISOString().slice(0,10),shade:'A2',comment:''},toast:''};
let cadPreviewRequest=0;
let portalHistory=[];
let portalClientRequests=[];
const selectedWork=()=>workCatalog.find(item=>item.name===state.work);
const workOptionName=option=>typeof option==='string'?option:option.name;
const selectedWorkOption=()=>selectedWork()?.options.find(option=>workOptionName(option)===state.workOption);
const orderUnits=()=>Math.max(1,state.selectedTeeth.length);
const orderEstimate = () => {
  const option=selectedWorkOption(),price=typeof option==='object'&&Number.isFinite(option.price)?option.price:selectedWork()?.price;
  return Number.isFinite(price)?price*orderUnits():null;
};
const orderEstimateText = () => orderEstimate()===null?'Стоимость уточняется':rubles(orderEstimate());
const currentVariant = () => ({toothMode:state.toothMode,bridgeRanges:state.bridgeRanges.map(range=>[...range]),selectedTeeth:[...state.selectedTeeth],work:state.work,workOption:state.workOption});
const variantIsComplete = variant => Boolean(variant?.selectedTeeth?.length&&variant.work&&(!workCatalog.find(item=>item.name===variant.work)?.options.length||variant.workOption));
const variantEstimate = variant => {const work=workCatalog.find(item=>item.name===variant.work),option=work?.options.find(item=>workOptionName(item)===variant.workOption),price=typeof option==='object'&&Number.isFinite(option.price)?option.price:work?.price;return Number.isFinite(price)?price*Math.max(1,variant.selectedTeeth?.length||0):null};
const allVariants = () => [...(state.orderVariants||[]),currentVariant()];
const totalOrderEstimate = () => {const variants=allVariants().filter(variantIsComplete),values=variants.map(variantEstimate);return variants.length&&values.every(Number.isFinite)?values.reduce((sum,value)=>sum+value,0):null};
const totalOrderEstimateText = () => totalOrderEstimate()===null?'Стоимость уточняется':rubles(totalOrderEstimate());
const upperTeeth=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const lowerTeeth=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
const statusClass = s => ['В работе','Работа принята','Принято','Принято доктором','Принято врачом','Завершен'].includes(s)?'green':s==='Новый'?'blue':'orange';
const displayClientStatus = status => ({'На согласовании':'CAD на согласовании у врача','В пути к вам':'Доставка в клинику','Принято':'Принято врачом'}[status]||status);
const badge = s => `<span class="badge ${statusClass(s)}">${s}</span>`;
const button = (label,action,kind='primary',extra='') => `<button class="btn ${kind}" data-action="${action}" ${extra}>${label}</button>`;
function sidebar(){return `<aside class="sidebar" id="sidebar"><button class="brand brand-home" data-page="home" aria-label="На главную"><img class="portal-logo" src="${logo}" alt="Create Dental"></button><div class="tech-side-label">КАБИНЕТ КЛИНИКИ</div><nav class="sidebar-nav">${nav.map(([id,label,ico])=>`<button class="nav-link ${state.page===id||(state.page==='detail'&&id==='orders')?'active':''}" data-page="${id}">${icon(ico,20)}<span>${label}</span></button>`).join('')}</nav><button class="help-box" data-page="messages">${icon('message',20)}<span><strong>Нужна помощь?</strong><small>Напишите нам</small></span></button></aside>`}
function header(){const clinic=clinicRecord();return `<header class="topbar"><button class="mobile-menu" data-action="menu" aria-label="Открыть меню">☰</button><div class="topbar-spacer"></div>${languageSwitcherMarkup()}${themeToggleMarkup()}<button class="role-toggle" data-auth-logout>Выйти</button><span class="topbar-clinic-name">${escapeHtml(clinic?.name||'Клиника')}</span>${notificationCenterMarkup()}<button class="profile" data-page="clinic"><span class="avatar">${clinic?.logo?`<img src="${escapeHtml(clinic.logo)}" alt="Логотип ${escapeHtml(clinic.name||'клиники')}">`:'К'}</span><span><strong>${escapeHtml(clinic?.contact||clinic?.name||'Клиника')}</strong><small>Стоматологическая клиника</small></span>${icon('chevron',13)}</button></header>`}
function shell(content){$('#app').innerHTML=`${sidebar()}<div class="shell">${header()}<main class="content">${content}</main></div><div class="toast ${state.toast?'visible':''}">${escapeHtml(state.toast)}</div>`;}
function title(text,sub='',right=''){return `<div class="page-title"><div><h1>${text}</h1>${sub?`<p>${sub}</p>`:''}</div>${right}</div>`}
function tabs(items,selected,action='filter',className=''){return `<div class="tabs ${className}">${items.map(([label,count,key=label])=>`<button class="tab ${selected===key?'active':''}" data-action="${action}" data-value="${key}">${label}${count!==undefined?` <span class="count">${count}</span>`:''}</button>`).join('')}</div>`}
function orderTable(list){const heading=(key,label)=>`<th aria-sort="${state.sortKey===key?(state.sortDirection==='asc'?'ascending':'descending'):'none'}"><button class="order-sort" data-order-sort="${key}">${label}<span aria-hidden="true">${state.sortKey===key?(state.sortDirection==='asc'?'↑':'↓'):'↕'}</span></button></th>`;return `<div class="table-wrap"><table class="orders-table"><thead><tr><th>ID заказа</th><th>Пациент</th>${heading('work','Тип работы')}${heading('createdAt','Создан')}${heading('date','Срок')}${heading('status','Статус')}${heading('sum','Сумма')}</tr></thead><tbody>${list.map(o=>`<tr data-order="${escapeHtml(o.id)}" tabindex="0"><td><strong>${escapeHtml(o.id)}</strong></td><td>${escapeHtml(o.patient)}</td><td>${escapeHtml(o.work)}</td><td>${o.createdAt?new Date(o.createdAt).toLocaleDateString('ru-RU'):'—'}</td><td>${escapeHtml(o.date)}</td><td>${badge(escapeHtml(displayClientStatus(o.status)))}</td><td><strong>${escapeHtml(o.sum)}</strong></td></tr>`).join('')||'<tr><td colspan="7" class="empty">Заказы не найдены</td></tr>'}</tbody></table></div>`}
function orderDate(order){const [day,month,year]=order.date.split('.').map(Number);return new Date(year,month-1,day)}
function deadlineCalendar(){
  const month=state.calendarMonth;
  const year=month.getFullYear(),monthNumber=month.getMonth();
  const daysInMonth=new Date(year,monthNumber+1,0).getDate();
  const leading=(new Date(year,monthNumber,1).getDay()+6)%7;
  const monthName=new Intl.DateTimeFormat('ru-RU',{month:'long'}).format(month);
  const label=monthName.charAt(0).toUpperCase()+monthName.slice(1)+' '+year;
  const due=currentOrders().filter(order=>{const date=orderDate(order);return date.getFullYear()===year&&date.getMonth()===monthNumber});
  const cells=Array.from({length:leading},()=>'<span class="calendar-blank"></span>');
  for(let day=1;day<=daysInMonth;day++){
    const statuses=due.filter(order=>orderDate(order).getDate()===day).map(order=>statusClass(order.status));
    const dayLabel=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(new Date(year,monthNumber,day));
    cells.push(`<button class="calendar-day ${state.calendarDay===day?'selected':''}" data-action="calendar-day" data-value="${day}" aria-label="${dayLabel}, заказов: ${statuses.length}"><span>${day}</span><i class="calendar-markers">${statuses.length?'<b></b>':''}</i></button>`);
  }
  const selected=Number.isInteger(state.calendarDay)?due.filter(order=>orderDate(order).getDate()===state.calendarDay):[];
  const selectedDate=Number.isInteger(state.calendarDay)?`${String(state.calendarDay).padStart(2,'0')}.${String(monthNumber+1).padStart(2,'0')}.${year}`:'';
  const selectedTitle=Number.isInteger(state.calendarDay)?`Сдачи на ${new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(new Date(year,monthNumber,state.calendarDay))}`:'Выберите дату';
  return `<section class="dashboard-card deadline-card"><h2>Календарь сроков</h2><div class="calendar-head"><strong>${label}</strong><div><button data-action="calendar-prev" aria-label="Предыдущий месяц">‹</button><button data-action="calendar-next" aria-label="Следующий месяц">›</button></div></div><div class="calendar-grid">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(day=>`<span class="calendar-weekday">${day}</span>`).join('')}${cells.join('')}</div><div class="dashboard-card-heading"><h3>${selectedTitle}</h3>${selected.length?`<button data-action="calendar-show-all" data-value="${selectedDate}">Все (${selected.length}) →</button>`:''}</div><div class="upcoming-list">${selected.length?selected.slice(0,3).map(order=>`<button class="upcoming-order" data-order="${escapeHtml(order.id)}"><i class="deadline-status ${statusClass(order.status)}"></i><span><strong>${escapeHtml(order.id)}</strong></span></button>`).join(''):'<p class="dashboard-empty">В этот день нет сдачи</p>'}</div></section>`;
}
function recentMessagesMarkup(){
  const recent=state.messages.slice(-3).reverse();
  return recent.length?recent.map(message=>{const bot=message.from==='bot',support=message.from==='support',clientName=message.source==='telegram'&&message.sender?'Клиент':'Вы',supportName='Create Dental Team';return `<button class="recent-message" data-page="messages"><span class="recent-avatar ${support||bot?'support':''}">${bot?'AI':support?'CD':'Я'}</span><span><strong>${bot?'Ответ AI':support?escapeHtml(supportName):escapeHtml(clientName)}</strong><small>${escapeHtml(message.text)}</small></span><time>${new Date(message.time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></button>`}).join(''):'<div class="dashboard-empty">Сообщений пока нет. <button data-page="messages">Написать в поддержку →</button></div>';
}
function recentMessagesCard(){return `<section class="dashboard-card recent-card"><div class="dashboard-card-heading"><h2>Последние сообщения</h2><button data-page="messages">Все →</button></div><div id="recent-messages">${recentMessagesMarkup()}</div></section>`}
function currentOrders(){
  let overrides={};
  try {overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}} catch {overrides={}}
  const status={"Ожидает распределения":"Новый","Подготовка":"В работе","Моделирование":"Моделирование","Согласование CAD":"На согласовании","Изготовление":"В работе","Контроль качества":"На согласовании","Работа принята":"Работа принята","В доставке":"В пути к вам","На доработке":"На доработке","Принято доктором":"Принято","Готово к выдаче":"Работа принята"};
  return orders.filter(order=>order.clinicId===portalUser?.subjectId).map(order=>({...order,status:status[overrides[order.id]?.stage]||order.status}));
}
function clinicVisibleProductionStages(details){return productionStages.filter(item=>details.productionType==='analog'? !['Моделирование','CAD на согласовании у врача'].includes(item.label):item.label!=='Аналоговая подготовка')}
function clinicOrderProgress(details){const stages=clinicVisibleProductionStages(details),index=stages.findIndex(item=>item.matches.includes(details.stage));if(index<0)return 0;return Math.round(index/Math.max(1,stages.length-1)*100)}
function orderTabs(){
  const list=currentOrders();
  return [['Все',list.length,'Все'],['Новые',list.filter(o=>o.status==='Новый').length,'Новые'],['В работе',list.filter(o=>o.status==='В работе').length,'В работе'],['CAD на согласовании у врача',list.filter(o=>['На согласовании','Согласование'].includes(o.status)).length,'На согласовании'],['Приняты',list.filter(o=>o.status==='Работа принята').length,'Приняты'],['Доставка в клинику',list.filter(o=>o.status==='В пути к вам').length,'В пути к вам'],['На доработке',list.filter(o=>o.status==='На доработке').length,'На доработке'],['Принято врачом',list.filter(o=>o.status==='Принято').length,'Принято']];
}
function dashboard(){
  const list=currentOrders();
  const stats=[['orders',list.filter(o=>!['Принято','Завершен'].includes(o.status)).length,'Активных заказов','blue'],['clock',list.filter(o=>['На согласовании','Согласование'].includes(o.status)).length,'CAD на согласовании у врача','orange'],['user',list.filter(o=>o.status==='В работе').length,'В работе','navy'],['heart',list.filter(o=>['Работа принята','В пути к вам','Принято','Завершен'].includes(o.status)).length,'После приемки','green']];
  shell(`${title('Добро пожаловать, '+escapeHtml(clinicRecord()?.name||'клиника')+'!','Создавайте заказы, отслеживайте статус и получайте готовые работы в срок.',button(`${icon('plus',16)} Создать новый заказ`,'new'))}<div class="stats">${stats.map(([ico,n,label,color])=>`<div class="stat card"><span class="stat-icon ${color}">${icon(ico,25)}</span><div><strong>${n}</strong><span>${label}</span></div></div>`).join('')}</div><div class="dashboard-grid"><div class="dashboard-main"><section class="hero"><div><h2>Качество в каждой детали</h2><p>Современные технологии.<br>Индивидуальный подход.<br>Надежные сроки.</p></div><img src="${assets}banner-restoration.webp" alt="Керамические зубные конструкции"></section><div class="section-heading"><h2>Мои заказы</h2><button class="text-link" data-page="orders">Все заказы →</button></div>${tabs(orderTabs(),state.filter)}${orderTable(filteredOrders().slice(0,4))}</div><aside class="dashboard-aside">${deadlineCalendar()}${recentMessagesCard()}</aside></div>`);
}
function clinicOrderMonthKey(order){const date=new Date(order.createdAt||0);return Number.isNaN(date.getTime())?'':`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`}
function clinicOrderMonthLabel(key){const [year,month]=key.split('-').map(Number),name=new Intl.DateTimeFormat('ru-RU',{month:'long'}).format(new Date(year,month-1,1));return `${name.charAt(0).toUpperCase()+name.slice(1)} ${year}`}
function filteredOrders(){let list=currentOrders();if(state.filter==='Новые')list=list.filter(o=>o.status==='Новый');else if(state.filter==='В работе')list=list.filter(o=>o.status==='В работе');else if(state.filter==='На согласовании')list=list.filter(o=>['На согласовании','Согласование'].includes(o.status));else if(state.filter==='Приняты')list=list.filter(o=>o.status==='Работа принята');else if(state.filter==='В пути к вам')list=list.filter(o=>o.status==='В пути к вам');else if(state.filter==='На доработке')list=list.filter(o=>o.status==='На доработке');else if(state.filter==='Принято')list=list.filter(o=>o.status==='Принято');if(state.dueDateFilter)list=list.filter(o=>o.date===state.dueDateFilter);if(state.orderMonthFilter)list=list.filter(o=>clinicOrderMonthKey(o)===state.orderMonthFilter);if(state.query)list=list.filter(o=>Object.values(o).some(v=>String(v).toLowerCase().includes(state.query.toLowerCase())));if(['work','createdAt','date','status','sum'].includes(state.sortKey)){const key=state.sortKey,sign=state.sortDirection==='asc'?1:-1;list.sort((a,b)=>{let x=a[key]??'',y=b[key]??'';if(key==='sum'){x=Number(String(x).replace(/\D/g,''));y=Number(String(y).replace(/\D/g,''));return (x-y)*sign}if(key==='date'){x=String(x).split('.').reverse().join('-');y=String(y).split('.').reverse().join('-')}return String(x).localeCompare(String(y),'ru',{numeric:true})*sign})}return list}
function clinicOrderFilter(){const months=[...new Set(currentOrders().map(clinicOrderMonthKey).filter(Boolean))].sort().reverse(),active=state.orderMonthFilter?1:0;return `<div class="clinic-filter-wrap"><button class="btn outline ${active?'active':''}" data-action="filters">${icon('filter',15)} Фильтр${active?' · 1':''}</button>${state.orderFilterOpen?`<div class="clinic-order-filter"><label>Месяц заказа<select id="clinic-order-month"><option value="">Все месяцы</option>${months.map(month=>`<option value="${month}" ${state.orderMonthFilter===month?'selected':''}>${clinicOrderMonthLabel(month)}</option>`).join('')}</select></label><div><button class="btn outline" data-action="filter-reset">Сбросить</button><button class="btn primary" data-action="filter-close">Готово</button></div></div>`:''}</div>`}
function ordersPage(){const statusTabs=`<div class="tech-segment clinic-status-segment">${orderTabs().map(([label,,key=label])=>`<button data-action="filter" data-value="${escapeHtml(key)}" class="${state.filter===key?'active':''}">${escapeHtml(label)}</button>`).join('')}</div>`;shell(`<div class="tech-heading clinic-orders-heading"><div><span class="tech-eyebrow">ПРОИЗВОДСТВО</span><h1>Мои заказы</h1></div></div><section class="clinic-orders-panel">${statusTabs}${state.dueDateFilter?`<div class="active-date-filter"><span>Срок сдачи: <strong>${escapeHtml(state.dueDateFilter)}</strong></span><button data-action="clear-date-filter" aria-label="Сбросить фильтр по дате">×</button></div>`:''}<div class="toolbar"><label class="search">${icon('search',17)}<input id="order-search" value="${escapeHtml(state.query)}" placeholder="Поиск по номеру заказа, пациенту или типу работы..."></label>${clinicOrderFilter()}</div>${orderTable(filteredOrders())}</section>`)}
function toothChart(interactive=true, selectedTeeth=state.selectedTeeth, bridgeRanges=[]){
  const teeth=[
    [11,211,29,55,59,206.856,24.813,63.288,67.184],[21,268,29,55,59,263.870,24.813,63.072,67.184],
    [12,170,41,43,53,165.922,36.865,50.970,61.082],[22,321,41,44,53,316.828,36.865,52.155,61.082],
    [13,130,63,54,59,125.875,58.840,62.063,67.131],[23,350,63,54,59,345.875,59.029,62.063,67.131],
    [14,106,105,50,49,101.911,100.885,57.993,57.042],[24,378,105,50,49,373.911,101.073,57.993,56.855],
    [15,89,149,56,45,84.852,144.926,64.296,52.963],[25,389,149,56,45,384.852,144.926,64.108,52.963],
    [16,73,192,70,69,68.815,187.841,78.179,77.129],[26,391,192,70,69,386.815,187.841,78.179,77.129],
    [17,69,260,65,64,64.879,255.859,73.055,72.094],[27,400,260,66,64,395.816,255.859,74.179,72.094],
    [18,70,324,60,59,65.849,319.799,68.113,67.210],[28,405,324,60,59,400.849,319.799,68.113,67.210],
    [48,74,402,60,62,70.025,398.030,67.950,70.128],[38,400,402,60,62,395.823,397.829,68.354,70.153],
    [47,74,464,71,66,69.801,459.863,79.207,74.085],[37,389,464,71,66,384.801,460.063,79.207,73.875],
    [46,84,529,72,74,79.989,524.793,80.021,82.222],[36,378,529,72,74,373.787,524.793,80.234,82.222],
    [45,106,599,57,51,101.834,594.890,65.143,59.033],[35,371,599,56,51,366.907,594.875,64.000,59.063],
    [44,127,645,51,50,122.860,640.849,59.280,58.113],[34,356,645,51,50,351.860,640.849,59.092,58.113],
    [43,156,681,46,51,151.869,676.813,54.073,59.183],[33,332,681,46,51,327.869,676.813,54.073,59.183],
    [42,188,703,40,43,183.907,698.974,48.186,50.868],[32,306,703,40,43,301.926,699.157,47.963,50.868],
    [41,228,707,38,45,223.922,702.858,45.971,53.096],[31,268,708,38,44,263.922,703.950,45.971,51.916]
  ];
  const centers=new Map(teeth.map(([number,x,y,width,height])=>[number,[x+width/2,y+height/2]]));
  const bridgeMarkup=bridgeRanges.map(range=>{const points=range.map(number=>centers.get(number)).filter(Boolean);if(points.length<2)return '';return `<polyline class="tooth-bridge-line" points="${points.map(point=>point.join(',')).join(' ')}"/>${points.map(point=>`<circle class="tooth-bridge-point" cx="${point[0]}" cy="${point[1]}" r="5"/>`).join('')}`}).join('');
  return `<div class="tooth-chart"><svg viewBox="0 0 509 772" role="img" aria-label="Схема зубов верхней и нижней челюсти">
    ${teeth.map(([n,x,y,width,height,imageX,imageY,imageWidth,imageHeight])=>{
      const selected=selectedTeeth.includes(n);
      return `<g class="tooth ${selected?'selected':''}" ${interactive?`data-tooth="${n}" role="button" tabindex="0" aria-label="Зуб ${n}" aria-pressed="${selected}"`:''}>
        <rect class="tooth-hitbox" x="${x}" y="${y}" width="${width}" height="${height}" rx="10"/>
        <image class="tooth-image" href="${assets}teeth/${n}.png?v=3" x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="none"/>
        <text x="${x+width/2}" y="${y+height/2}" text-anchor="middle" dominant-baseline="middle">${n}</text>
      </g>`;
    }).join('')}${bridgeMarkup}</svg></div>`;
}
function stepper(){return `<div class="stepper">${steps.map((s,i)=>`<button class="step ${state.step===i?'active':''} ${state.step>i?'done':''}" data-step="${i}"><b>${state.step>i?icon('check',13):i+1}</b>${s}</button>${i<steps.length-1?'<span class="step-line">→</span>':''}`).join('')}</div>`}
function field(label,control){return `<label class="field"><span>${label}</span>${control}</label>`}
function textInput(value='',placeholder='',key=''){return `<input ${key?`data-field="${key}"`:''} value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`}
function selectInput(options,key=''){const choices=key&&state.form[key]&&!options.includes(state.form[key])?[state.form[key],...options]:options;return `<select ${key?`data-field="${key}"`:''}>${choices.map(o=>`<option ${state.form[key]===o?'selected':''}>${o}</option>`).join('')}</select>`}
function patientStep(){return `<h2>Данные пациента</h2><div class="order-type-choice"><div><h3>Тип работы</h3><p>Выберите, по какому маршруту пойдёт заказ.</p></div><div class="order-type-options"><button type="button" class="${state.form.orderType==='digital'?'selected':''}" data-action="order-type" data-value="digital"><strong>Цифровой</strong><small>Цифровой заказ · нужны STL или сканы</small></button><button type="button" class="${state.form.orderType==='analog'?'selected':''}" data-action="order-type" data-value="analog"><strong>Аналоговый</strong><small>Аналоговый заказ · нужен гипсовый слепок</small></button></div></div><div class="form-grid patient-fields">${field('Фамилия пациента · обязательно',textInput(state.form.surname,'Фамилия','surname'))}${field('Имя пациента · обязательно',textInput(state.form.initials,'Имя · отчество по желанию','initials'))}${field('Дата рождения · необязательно',`<input type="date" data-field="birth" value="${state.form.birth}">`)}</div><div class="info-note">Фамилия и имя обязательны. Отчество можно указать по желанию.</div>`}
function workChooser(){
  const work=selectedWork();
  if(!work)return `<div class="order-work-grid">${workCatalog.map(item=>`<button data-action="work" data-value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</button>`).join('')}</div>`;
  if(!work.options.length)return `<div class="work-detail"><button class="work-back" data-action="work-back">← Все виды работ</button><div class="work-current"><strong>${escapeHtml(work.name)}</strong><small>Категория выбрана</small></div></div>`;
  return `<div class="work-detail"><button class="work-back" data-action="work-back">← Все виды работ</button><div class="work-current"><strong>${escapeHtml(work.name)}</strong><small>Выберите вариант исполнения</small></div><div class="work-option-list">${work.options.map(option=>{const name=workOptionName(option),price=typeof option==='object'&&Number.isFinite(option.price)?rubles(option.price):'→';return `<button class="${state.workOption===name?'selected':''}" data-action="work-option" data-value="${escapeHtml(name)}"><span>${escapeHtml(name)}</span><b>${price}</b></button>`}).join('')}</div></div>`;
}
function variantCard(variant,index,removable=true){
  const estimate=variantEstimate(variant);
  return `<article class="order-variant-card"><div class="order-variant-head"><span>Услуга ${index+1}</span>${removable?`<button class="order-variant-remove" data-action="remove-variant" data-value="${index}" aria-label="Удалить услугу">×</button>`:''}</div><div class="order-variant-mode">${escapeHtml(variant.toothMode||'Одиночка')}</div><strong>Зубы: ${escapeHtml((variant.selectedTeeth||[]).join(', '))}</strong><h3>${escapeHtml(variant.work||'')}</h3>${variant.workOption?`<p>${escapeHtml(variant.workOption)}</p>`:''}<dl><div><dt>Количество</dt><dd>${Math.max(1,variant.selectedTeeth?.length||0)}</dd></div><div><dt>Предварительно</dt><dd>${estimate===null?'Стоимость уточняется':rubles(estimate)}</dd></div></dl></article>`;
}
function orderDraft(){
  const saved=state.orderVariants||[],current=currentVariant(),complete=variantIsComplete(current),cards=[...saved,...(complete?[current]:[])];
  if(!cards.length)return `<aside class="order-draft"><h2>Ваш заказ</h2><div class="order-draft-empty">${icon('orders',24)}<strong>Выберите нужные зубы и работу</strong><span>Здесь появится состав заказа и предварительная стоимость.</span></div></aside>`;
  return `<aside class="order-draft"><div class="order-draft-title"><h2>Ваш заказ</h2><span>${cards.length}/10 услуг</span></div><div class="order-variants">${cards.map((variant,index)=>variantCard(variant,index,index<saved.length)).join('')}</div>${complete&&cards.length<10?`<button class="order-variant-add" data-action="add-variant">＋ Заказать ещё</button>`:''}<div class="order-total"><span>Итого предварительно</span><strong>${totalOrderEstimateText()}</strong></div><small class="order-total-note">Все услуги будут оформлены одним заказом для этого пациента.</small></aside>`;
}
function bridgeSelectionText(){if(state.toothMode!=='Мост')return state.selectedTeeth.length?`Выбрано: ${state.selectedTeeth.join(', ')}`:'Нажмите на нужные зубы';if(state.bridgeStart)return `Начало моста: ${state.bridgeStart}. Выберите последний зуб на этой челюсти`;if(state.bridgeRanges.length)return `Мосты: ${state.bridgeRanges.map(range=>`${range[0]}–${range.at(-1)}`).join(', ')}`;return 'Выберите первый и последний зуб моста'}
function teethStep(){const work=selectedWork();return `<div class="order-builder"><section class="tooth-picker"><h2>Выберите зуб(ы)</h2><div class="tooth-mode">${['Одиночка','Мост','Челюсть'].map(mode=>`<button class="${state.toothMode===mode?'selected':''}" data-action="tooth-mode" data-value="${mode}">${mode}</button>`).join('')}</div>${toothChart(true,state.selectedTeeth,state.bridgeRanges)}<div class="selected-teeth"><strong>${bridgeSelectionText()}</strong>${state.selectedTeeth.length?'<button class="clear" data-action="clear-teeth">Очистить</button>':''}</div></section><section class="work-picker"><div class="work-picker-title"><div><h2>Что нужно сделать?</h2><p>${work?.options.length?'Уточните вариант исполнения':state.work?'Категория выбрана':'Выберите вид работы из списка'}</p></div>${state.work?'<button data-action="work-back" aria-label="Вернуться к списку">⌕</button>':''}</div>${workChooser()}</section>${orderDraft()}</div>`}
const uploadPreviewUrls=new WeakMap();
function uploadPreview(file){
  if(!file?.type?.startsWith('image/')&&!/\.(?:jpg|jpeg|png)$/i.test(file?.name||''))return '';
  if(!uploadPreviewUrls.has(file))uploadPreviewUrls.set(file,URL.createObjectURL(file));
  return uploadPreviewUrls.get(file);
}
function releaseUploadPreview(file){const url=uploadPreviewUrls.get(file);if(url)URL.revokeObjectURL(url);uploadPreviewUrls.delete(file)}
function attachmentTiles(){return `<div class="attachment-grid">${state.uploaded.map(file=>{const preview=uploadPreview(file),extension=(file.name.split('.').pop()||'FILE').toUpperCase().slice(0,5),size=file.size>=1024*1024?`${(file.size/1024/1024).toFixed(1)} МБ`:`${Math.max(1,Math.ceil(file.size/1024))} КБ`;return `<div class="attachment">${preview?`<img src="${preview}" alt="Миниатюра ${escapeHtml(file.name)}">`:`<span class="attachment-file-icon">${escapeHtml(extension)}</span>`}<span class="attachment-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span><small>${size}</small><button aria-label="Удалить файл ${escapeHtml(file.name)}" data-action="remove-file" data-value="${escapeHtml(file.name)}">×</button></div>`}).join('')}<label class="attachment-add" title="Добавить файлы">${icon('plus',26)}<span>Добавить</span><input type="file" id="upload-input" accept=".jpg,.jpeg,.png,.webp,.pdf,.stl,.ply,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt,.rtf" multiple hidden></label></div>`}
function extraStep(){return `<h2>Дополнительная информация</h2><div class="form-grid">${field('Желаемый срок готовности',`<input type="date" data-field="due" value="${state.form.due}">`)}${field('Цвет/оттенок (например, Vita)',selectInput(['A2','A1','A3','B1','B2'],'shade'))}</div><div class="form-grid extra-fields"><div class="field"><span>Файлы заказа — сканы, КТ и фото</span><label class="upload-zone">${icon('upload',26)}<span>Перетащите файлы сюда<br>или нажмите, чтобы выбрать</span><input type="file" id="upload-input" accept=".jpg,.jpeg,.png,.webp,.pdf,.stl,.ply,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt,.rtf" multiple hidden></label><small class="hint">Изображения, PDF, 3D-файлы, архивы и документы — до 200 МБ на файл. Файлы прикрепятся к заказу.</small>${attachmentTiles()}</div>${field('Комментарий к заказу',`<textarea rows="5" data-field="comment" placeholder="Напишите пожелания, особенности, дополнительные инструкции...">${escapeHtml(state.form.comment)}</textarea>`)}</div>`}
function confirmStep(){const variants=allVariants().filter(variantIsComplete),teeth=[...new Set(variants.flatMap(variant=>variant.selectedTeeth||[]))].sort((a,b)=>a-b);return `<h2>Проверьте данные заказа</h2><div class="confirmation"><div>${toothChart(false,teeth,[])}</div><div class="summary-list"><div><span>Пациент</span><strong>${escapeHtml(`${state.form.surname} ${state.form.initials}`)}</strong></div>${state.form.birth?`<div><span>Дата рождения</span><strong>${escapeHtml(state.form.birth.split('-').reverse().join('.'))}</strong></div>`:''}<div><span>Тип работы</span><strong>${state.form.orderType==='analog'?'Аналоговый':'Цифровой'}</strong></div><div><span>Услуги</span><strong>${variants.length}</strong></div><div><span>Зубы</span><strong>${escapeHtml(teeth.join(', '))}</strong></div>${variants.map((variant,index)=>`<div><span>Услуга ${index+1}</span><strong>${escapeHtml(`${variant.work}${variant.workOption?` · ${variant.workOption}`:''} · ${variant.toothMode} · зубы ${variant.selectedTeeth.join(', ')} · сумма ${variantEstimate(variant)===null?'уточняется':rubles(variantEstimate(variant))}`)}</strong></div>`).join('')}<div><span>Желаемый срок</span><strong>${escapeHtml(state.form.due.split('-').reverse().join('.'))}</strong></div><div><span>Предварительная сумма</span><strong>${escapeHtml(totalOrderEstimateText())}</strong></div><div><span>Цвет</span><strong>${escapeHtml(state.form.shade)}</strong></div><div><span>Комментарий</span><strong>${escapeHtml(state.form.comment||'—')}</strong></div><div><span>Файлы</span><strong>${state.uploaded.length} файла</strong></div>${attachmentTiles()}</div></div>`}
function cartSummary(){return state.cart.length?`<section class="order-cart"><div class="order-cart-heading"><strong>Корзина заказов</strong><span>${state.cart.length}</span></div>${state.cart.map((draft,index)=>`<article><span>${escapeHtml(`${draft.form.surname} ${draft.form.initials}`.trim())}</span><small>${escapeHtml(draft.form.material||draft.form.construction)} · ${draft.selectedTeeth.join(', ')}</small><button data-action="remove-cart" data-value="${index}" aria-label="Убрать заказ из корзины">×</button></article>`).join('')}<button class="order-cart-add" data-action="new-cart-order">+ Добавить ещё один заказ в корзину</button></section>`:''}
function newOrder(){const body=[patientStep,teethStep,extraStep,confirmStep][state.step](),final=state.step===3,subtitle=state.orderVariants.length?`Добавлено услуг: ${state.orderVariants.length}. Можно добавить до 10 услуг для одного пациента.`:'';shell(`${title(state.step===1?'Зубы и работа':state.step===2?'Дополнительные параметры':state.step===3?'Подтверждение':'Новый заказ',subtitle)}${stepper()}<section class="wizard ${state.step===1?'order-builder-wizard':''}">${body}<div class="wizard-actions">${state.step>0?button('Назад','previous','outline'):''}${button(final?'Создать заказ':'Далее →','next')}</div></section>`)}
function isoDate(value){const match=String(value||'').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return match?`${match[3]}-${match[2]}-${match[1]}`:''}
function clientRequestControl(order,field){
  if(field==='patient')return `<label>Новое ФИО<input name="value" required value="${escapeHtml(order.patient||'')}" placeholder="Фамилия Имя Отчество"></label>`;
  if(field==='birth')return `<label>Новая дата рождения<input name="value" type="date" required value="${escapeHtml(order.birth||'')}"></label>`;
  if(field==='teeth')return `<label>Номера зубов<input name="value" required value="${escapeHtml((order.teeth||[]).join(', '))}" placeholder="Например: 11, 12, 21"></label>`;
  if(field==='mode')return `<label>Новый режим<select name="value" required><option value="single" ${order.toothMode==='Одиночка'?'selected':''}>Одиночка</option><option value="bridge" ${order.toothMode==='Мост'?'selected':''}>Мост</option><option value="upper" ${order.toothMode==='Челюсть'&&(order.teeth||[]).some(tooth=>tooth<30)?'selected':''}>Верхняя челюсть</option><option value="lower" ${order.toothMode==='Челюсть'&&(order.teeth||[]).some(tooth=>tooth>30)?'selected':''}>Нижняя челюсть</option></select></label>`;
  if(field==='service')return `<label>Новая услуга<select name="value" required>${workCatalog.filter(category=>category.options.length).map(category=>`<optgroup label="${escapeHtml(category.name)}">${category.options.map(option=>`<option value="${escapeHtml(`${category.name}|||${option.name}`)}" ${order.work===category.name&&order.material===option.name?'selected':''}>${escapeHtml(option.name)} · ${rubles(option.price)}</option>`).join('')}</optgroup>`).join('')}</select></label>`;
  if(field==='date')return `<label>Новый срок<input name="value" type="date" required value="${escapeHtml(isoDate(order.date))}"></label>`;
  if(field==='shade')return `<label>Новый цвет<input name="value" required value="${escapeHtml(order.shade||'')}" placeholder="Например: A2"></label>`;
  return `<label>Новый комментарий<textarea name="value" required minlength="3" rows="4" placeholder="Введите новый комментарий">${escapeHtml(order.comment||'')}</textarea></label>`;
}
function clientRequestDialog(order){
  if(state.clientRequest?.orderId!==order.id)return '';
  if(state.clientRequest.type==='cancel')return `<div class="tech-dialog-backdrop"><section class="tech-dialog client-request-dialog" role="dialog" aria-modal="true"><h2>Запросить отмену заказа</h2><p>Заказ отменится после подтверждения главным техником.</p><form id="clinic-client-request-form"><input type="hidden" name="type" value="cancel"><label>Причина отмены<textarea name="reason" required minlength="3" rows="4" placeholder="Коротко укажите причину"></textarea></label><div class="order-rework-actions"><button type="button" class="btn outline" data-action="client-request-close">Назад</button><button type="submit" class="btn primary">Отправить запрос</button></div></form></section></div>`;
  const field=state.clientRequest.field||'patient';
  return `<div class="tech-dialog-backdrop"><section class="tech-dialog client-request-dialog" role="dialog" aria-modal="true"><h2>Запросить правку</h2><p>Выберите один пункт. Изменение применится после подтверждения главным техником.</p><form id="clinic-client-request-form"><input type="hidden" name="type" value="edit"><label>Что изменить<select id="client-request-field" name="field"><option value="patient" ${field==='patient'?'selected':''}>ФИО пациента</option><option value="birth" ${field==='birth'?'selected':''}>Дата рождения</option><option value="teeth" ${field==='teeth'?'selected':''}>Зубы</option><option value="mode" ${field==='mode'?'selected':''}>Режим / челюсть</option><option value="service" ${field==='service'?'selected':''}>Услуга</option><option value="date" ${field==='date'?'selected':''}>Срок</option><option value="shade" ${field==='shade'?'selected':''}>Цвет</option><option value="comment" ${field==='comment'?'selected':''}>Комментарий</option></select></label>${clientRequestControl(order,field)}<div class="order-rework-actions"><button type="button" class="btn outline" data-action="client-request-close">Назад</button><button type="submit" class="btn primary">Отправить запрос</button></div></form></section></div>`;
}
const orderUploadAccept='.jpg,.jpeg,.png,.webp,.pdf,.stl,.ply,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt,.rtf';
function orderUploadDialog(){
  const dialog=state.orderUpload;
  if(!dialog||dialog.orderId!==state.orderId)return '';
  const rows=dialog.files.map((item,index)=>`<article class="upload-progress-file ${item.status}" data-upload-row="${index}"><div><strong>${escapeHtml(item.file.name)}</strong><small data-upload-label>${item.status==='success'?'Загружен на Яндекс Диск':item.status==='error'?escapeHtml(item.error||'Не удалось загрузить'):item.status==='uploading'?`Загрузка · ${item.progress}%`:'Ожидает загрузки'}</small></div><div class="upload-progress-track"><i data-upload-bar style="width:${item.progress}%"></i></div></article>`).join('');
  const total=dialog.files.length?Math.round(dialog.files.reduce((sum,item)=>sum+item.progress,0)/dialog.files.length):0;
  const finished=dialog.files.length&&dialog.files.every(item=>['success','error'].includes(item.status));
  return `<div class="tech-dialog-backdrop order-upload-backdrop"><section class="tech-dialog order-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="order-upload-title"><button class="tech-dialog-close" data-action="order-upload-close" aria-label="Закрыть" ${dialog.uploading?'disabled':''}>×</button><span class="upload-dialog-eyebrow">ЯНДЕКС ДИСК</span><h2 id="order-upload-title">Загрузка файлов заказа</h2><p>Выберите до 10 файлов. Они сразу загружаются в папку этого заказа на Яндекс Диске.</p><label class="upload-dialog-picker ${dialog.uploading?'disabled':''}">${icon('upload',22)}<span>${dialog.files.length?'Добавить другие файлы':'Выбрать файлы'}</span><input type="file" id="order-upload-dialog-input" accept="${orderUploadAccept}" multiple hidden ${dialog.uploading?'disabled':''}></label>${dialog.files.length?`<div class="upload-overall"><span>Общий прогресс</span><strong data-upload-total>${total}%</strong><div class="upload-progress-track"><i data-upload-total-bar style="width:${total}%"></i></div></div><div class="upload-progress-list">${rows}</div>`:''}${finished?`<button class="btn primary upload-dialog-done" data-action="order-upload-close">Готово</button>`:''}</section></div>`;
}
function syncOrderUploadProgress(index){
  const dialog=state.orderUpload,row=document.querySelector(`[data-upload-row="${index}"]`);
  if(!dialog||!row)return;
  const item=dialog.files[index],label=row.querySelector('[data-upload-label]'),bar=row.querySelector('[data-upload-bar]');
  row.className=`upload-progress-file ${item.status}`;
  if(label)label.textContent=item.status==='success'?'Загружен на Яндекс Диск':item.status==='error'?(item.error||'Не удалось загрузить'):item.status==='uploading'?`Загрузка · ${item.progress}%`:'Ожидает загрузки';
  if(bar)bar.style.width=`${item.progress}%`;
  const total=Math.round(dialog.files.reduce((sum,file)=>sum+file.progress,0)/dialog.files.length);
  const totalLabel=document.querySelector('[data-upload-total]'),totalBar=document.querySelector('[data-upload-total-bar]');
  if(totalLabel)totalLabel.textContent=`${total}%`;
  if(totalBar)totalBar.style.width=`${total}%`;
}
async function startOrderUpload(selected){
  const allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf)$/i;
  const files=Array.from(selected||[]).filter(file=>allowed.test(file.name)&&file.size<=200*1024*1024).slice(0,10);
  if(!files.length)return notify('Выберите поддерживаемые файлы размером до 200 МБ');
  if(Array.from(selected||[]).length>files.length)notify('Можно загрузить до 10 файлов поддерживаемых форматов, каждый до 200 МБ');
  state.orderUpload={orderId:state.orderId,uploading:true,files:files.map(file=>({file,progress:0,status:'waiting',error:''}))};
  render();
  for(let index=0;index<state.orderUpload.files.length;index++){
    const item=state.orderUpload.files[index];item.status='uploading';syncOrderUploadProgress(index);
    try{await uploadOrderFile(state.orderId,item.file,{onProgress:progress=>{item.progress=progress;syncOrderUploadProgress(index)}});item.progress=100;item.status='success'}
    catch(error){item.status='error';item.error=error.message}
    syncOrderUploadProgress(index);
  }
  state.orderUpload.uploading=false;
  const result=await loadOrderFiles(state.orderId).catch(()=>null);
  if(result){state.orderFiles=result.files||[];state.orderFolderUrl=result.folderUrl||''}
  const failed=state.orderUpload.files.filter(item=>item.status==='error').length;
  notify(failed?`Не удалось загрузить файлов: ${failed}`:'Все файлы загружены на Яндекс Диск');
  render();
}
function detail(){
  const o=currentOrders().find(item=>item.id===state.orderId);
  if(!o){state.page='orders';ordersPage();return}
  if(state.filesFor!==o.id){state.filesFor=o.id;state.orderFiles=[];state.orderFolderUrl='';loadOrderFiles(o.id).then(async result=>{if(state.orderId!==o.id)return;state.orderFiles=result.files||[];state.orderFolderUrl=result.folderUrl||'';if(state.page==='detail')render()}).catch(()=>{})}
  let overrides={};try{overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}}catch{}
  const details={...(overrides[o.id]||{})};
  const teeth=Array.isArray(o.teeth)?o.teeth:details.teeth||[];
  const bridgeRanges=Array.isArray(o.bridgeRanges)?o.bridgeRanges:[];
  const variants=Array.isArray(o.variants)&&o.variants.length?o.variants:[{toothMode:o.toothMode||'Одиночка',bridgeRanges,selectedTeeth:teeth,work:o.work,workOption:o.material}];
  const facts=[['Тип работы',o.productionType==='analog'?'Аналоговый':'Цифровой'],['Пациент',o.patient],...(o.birth?[['Дата рождения',String(o.birth).split('-').reverse().join('.')]]:[]),['Желаемый срок',o.date],['Сумма заказа',o.sum],['Цвет',o.shade||'—'],['Комментарий',o.comment||'—'],['Исполнитель заказа',details.assigned?'Исполнитель назначен':'Пока не назначен']];
  const serviceMarkup=`<section class="order-services"><h3>Услуги заказа</h3><div class="order-service-list">${variants.map((variant,index)=>{const serviceTeeth=Array.isArray(variant.selectedTeeth)?variant.selectedTeeth:[],serviceRanges=Array.isArray(variant.bridgeRanges)?variant.bridgeRanges:[],serviceAmount=variantEstimate(variant);return `<article class="order-service-card"><header><span>Услуга ${index+1}</span><strong>${escapeHtml(variant.work||'Работа')}</strong></header><div class="order-service-body"><div class="order-service-chart">${toothChart(false,serviceTeeth,serviceRanges)}</div><dl><div><dt>Зубы</dt><dd>${escapeHtml(serviceTeeth.join(', ')||'—')}</dd></div><div><dt>Режим</dt><dd>${escapeHtml(variant.toothMode||'Одиночка')}</dd></div>${serviceRanges.length?`<div><dt>Мосты</dt><dd>${escapeHtml(serviceRanges.map(range=>`${range[0]}–${range.at(-1)}`).join(', '))}</dd></div>`:''}${variant.workOption?`<div><dt>Исполнение</dt><dd>${escapeHtml(variant.workOption)}</dd></div>`:''}<div><dt>Количество</dt><dd>${Math.max(1,serviceTeeth.length)}</dd></div><div><dt>Сумма</dt><dd>${serviceAmount===null?'Стоимость уточняется':escapeHtml(rubles(serviceAmount))}</dd></div></dl></div></article>`}).join('')}</div></section>`;
  const created=o.createdAt?new Date(o.createdAt).toLocaleDateString('ru-RU'):'—';
  const history=portalHistory.filter(event=>event.orderId===o.id).slice().reverse();
  const folderCard=`<div class="order-folder-link"><div><strong>Папка заказа на Яндекс Диске</strong><small>Все файлы хранятся только на Яндекс Диске</small></div><div class="order-folder-actions">${state.orderFolderUrl?`<a class="btn outline" href="${escapeHtml(state.orderFolderUrl)}" target="_blank" rel="noopener noreferrer">Открыть папку</a>`:'<span class="muted">Папка создаётся…</span>'}</div></div>`;
  const fileMarkup=`<section class="order-files-panel"><div class="order-file-toolbar"><h3>Файлы заказа</h3></div><div class="order-files-layout"><div class="order-upload-card"><strong>Загрузить файлы</strong><small>Добавьте до 10 файлов в папку заказа на Яндекс Диске</small><button class="btn primary" data-action="add-order-file">Выбрать файлы</button></div>${folderCard}</div></section>`;

  const cad=details.cadReview||{};
  const cadReviewMarkup=cad.status?`<div class="cad-review-card compact ${escapeHtml(cad.status)}"><div><span class="cad-review-label">Согласование CAD · версия ${Number(cad.revision)||1}</span><h3>${cad.status==='pending'?'CAD ожидает вашего решения':cad.status==='approved'?'CAD подтверждён':'CAD возвращён моделировщику'}</h3><p>${cad.status==='pending'?(cad.sentAt?`Отправлено ${new Date(cad.sentAt).toLocaleString('ru-RU')}`:'Отправлено на согласование'):cad.status==='approved'?`Подтвердил ${escapeHtml(cad.reviewedBy||'врач')}`:`Комментарий: ${escapeHtml(cad.comment||'Нужно внести изменения')}`}</p></div><div class="cad-review-actions"><button class="btn outline" data-action="cad-open" data-value="${escapeHtml(cad.fileId||'')}">Открыть CAD</button>${cad.status==='pending'?`<button class="btn outline" data-action="cad-return" data-value="${escapeHtml(o.id)}">Вернуть</button><button class="btn primary" data-action="cad-approve" data-value="${escapeHtml(o.id)}">Подтвердить</button>`:''}</div></div>`:'';
  const historyMarkup=history.length?`<ol class="order-history">${history.map(event=>`<li><time>${new Date(event.at).toLocaleString('ru-RU')}</time><strong>${escapeHtml(displayActor(event))}</strong><span>${event.action==='stage_changed'?`${escapeHtml(event.from)} → ${escapeHtml(event.to)}${event.reason?`: ${escapeHtml(event.reason)}`:''}`:event.action==='assignee_changed'?(event.assigned?'Исполнитель назначен':'Исполнитель пока не назначен'):event.action==='rework_requested'?`Запрошена доработка: ${escapeHtml(event.reason)}`:escapeHtml(event.summary||'Изменение заказа')}</span></li>`).join('')}</ol>`:'<div class="info-note">История появится после первого действия с заказом.</div>';
  const visibleStage=details.stage==="Препрод"?"Аналоговая подготовка":details.stage==="Моделирование"?"Моделирование":details.stage==="Согласование CAD"||details.stage==="На согласовании"?"CAD на согласовании у врача":details.stage==="В доставке"||details.stage==="В пути к вам"?"Доставка в клинику":details.stage==="Принято доктором"||details.stage==="Принято"?"Принято врачом":details.stage==="На доработке"?"Доработка и эстетика":details.stage||"";
  const clinicStages=clinicVisibleProductionStages(details),clinicCurrentIndex=Math.max(0,clinicStages.findIndex(item=>item.matches.includes(details.stage)));
  const clinicQualityKind=details.qualityRequest?.kind,clinicQualityTimeline=details.stage==='Контроль качества'&&clinicQualityKind,clinicFinalQualityActive=details.stage==='Работа принята';
  const clinicQualityTitle={cad:'ОТК — CAD оператор',preprod:'ОТК — препрод техник',cam:'ОТК — CAM оператор',esthetic:'ОТК — эстетист'}[clinicQualityKind]||'ОТК';
  const clinicQualityAfter={cad:'Моделирование',preprod:'Аналоговая подготовка',cam:'Изготовление',esthetic:'Доработка и эстетика'}[clinicQualityKind];
  const clinicTimelineStages=clinicQualityTimeline?clinicStages.flatMap(item=>item.label===clinicQualityAfter?[item,{label:clinicQualityTitle,qualityMarker:true}]:[item]):clinicStages;
  const clinicTimelineCurrent=clinicQualityTimeline?clinicTimelineStages.findIndex(item=>item.qualityMarker):clinicFinalQualityActive?clinicStages.findIndex(item=>item.label==='Контроль качества'):clinicCurrentIndex;
  const progress=clinicQualityTimeline||clinicFinalQualityActive?Math.round(clinicTimelineCurrent/Math.max(1,clinicTimelineStages.length-1)*100):clinicOrderProgress(details);
  const clinicTimeline=clinicTimelineStages.map((item,index)=>{const done=clinicQualityTimeline?(item.qualityMarker?false:index<clinicTimelineCurrent):clinicFinalQualityActive?(index<clinicTimelineCurrent):index<clinicCurrentIndex,current=clinicQualityTimeline?item.qualityMarker===true:clinicFinalQualityActive?item.label==='Контроль качества':index===clinicCurrentIndex;return `<div class="${done?'complete ':''}${current?'current':''}"><i></i><strong>${escapeHtml(item.label)}</strong></div>`}).join('');
  shell(`<button class="back-link" data-page="orders">← &nbsp; Назад к заказам</button><div class="detail-heading">${title(`Заказ ${escapeHtml(o.id)}`,badge(escapeHtml(displayClientStatus(o.status)))+` <span class="muted">Создан ${created}</span>`,`<div class="detail-actions">${button(`${icon('message',16)} Сообщение`,'open-messages','outline')}${button('Запросить правку','request-edit','outline')}${button('Запросить отмену','request-cancel','outline')}</div>`)}</div>${tabs([['Обзор'],['Файлы'],['Комментарии'],['История']],state.detailTab,'detail-tab','segmented-tabs clinic-detail-tabs')}${state.detailTab==='Обзор'?`<div class="detail-grid"><div class="detail-main-column"><section><h3>Общая информация</h3><div class="facts">${facts.map(([k,v])=>`<div><span>${k}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div></section>${serviceMarkup}</div><aside class="detail-side-column"><section><h3>Статус заказа</h3><div class="timeline clinic-production-timeline">${clinicTimeline}</div><div class="tech-stage-progress clinic-stage-progress" aria-label="Прогресс заказа ${progress}%"><div class="tech-progress-head"><span>Прогресс заказа</span><b>${progress}%</b></div><div class="tech-progress-track"><i style="width:${progress}%"></i></div></div>${details.stage==='В доставке'?`<div class="clinic-accept-actions"><button class="btn primary" data-action="doctor-accept" data-value="${escapeHtml(o.id)}">Принять работу</button><button class="btn outline" data-action="doctor-rework" data-value="${escapeHtml(o.id)}">Отправить на доработку</button></div>`:''}${cadReviewMarkup?`<div class="order-side-stack">${cadReviewMarkup}</div>`:''}</section></aside></div>`:state.detailTab==='Файлы'?fileMarkup:state.detailTab==='Комментарии'?'<div class="info-note">Комментарии к заказу пока отсутствуют.</div>':historyMarkup}${clientRequestDialog(o)}${state.reworkOrderId===o.id?`<div class="tech-dialog-backdrop" data-action="cancel-rework"><section class="tech-dialog" role="dialog" aria-modal="true" aria-labelledby="rework-title"><h2 id="rework-title">Отправить заказ на доработку</h2><p>Опишите, что нужно исправить. Запрос появится в истории заказа и кабинете исполнителя.</p><form id="order-rework-form"><textarea name="reason" minlength="5" maxlength="2000" rows="5" required placeholder="Что нужно поправить в работе?" aria-label="Причина доработки"></textarea><div class="order-rework-actions"><button type="button" class="btn outline" data-action="cancel-rework">Отмена</button><button type="submit" class="btn primary">Отправить в лабораторию</button></div></form></section></div>`:''}${state.cadReturnOrderId===o.id?`<div class="tech-dialog-backdrop cad-return-backdrop"><section class="tech-dialog cad-return-dialog" role="dialog" aria-modal="true" aria-labelledby="cad-return-title"><h2 id="cad-return-title">Вернуть CAD моделировщику</h2><p>Укажите конкретно, что нужно изменить.</p><form id="cad-return-form"><textarea name="comment" minlength="5" maxlength="2000" rows="5" required placeholder="Комментарий для моделировщика">${escapeHtml(state.cadReturnComment||'')}</textarea><div class="cad-return-files">${cadReturnAttachmentMarkup()}</div><label class="chat-attach-button cad-return-file-picker" title="Прикрепить скриншоты или файлы">${icon('paperclip',18)}<span>Добавить скриншоты или файлы</span><input id="cad-return-files" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.stl,.ply,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt,.rtf,.html" multiple hidden></label><small class="cad-return-file-hint">До 10 файлов, каждый до 200 МБ</small><div class="order-rework-actions"><button type="button" class="btn outline" data-action="cad-return-cancel">Отмена</button><button type="submit" class="btn primary">Вернуть на исправление</button></div></form></section></div>`:''}${orderUploadDialog()}${state.cadPreview?.orderId===o.id?`<div class="cad-preview-backdrop"><section class="cad-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="cad-preview-title"><header><div><h2 id="cad-preview-title">${escapeHtml(state.cadPreview.name||'CAD')}</h2><p>Интерактивный предпросмотр из HTML-файла</p></div><button data-action="cad-close" aria-label="Закрыть">×</button></header><iframe id="cad-preview-frame" src="${escapeHtml(state.cadPreview.url||'')}" sandbox="allow-scripts allow-pointer-lock" referrerpolicy="no-referrer" title="Предпросмотр CAD"></iframe></section></div>`:''}`);
  const cadFrame=$('#cad-preview-frame');if(cadFrame&&state.cadPreview?.url)cadFrame.src=state.cadPreview.url;
}
function filesPage(){const files=[['xray.png','КТ_верхняя.jpg','12.03.2024','КТ/Рентген'],['tooth.png','Фото_16.jpg','12.03.2024','Фото'],['scan.png','Скан_верхняя.stl','10.03.2024','3D модели'],['smile.png','Прикус.jpg','10.03.2024','Фото'],['tooth.png','Фото_26.jpg','06.03.2024','Фото'],['file.png','План_лечения.pdf','08.03.2024','Документы'],['scan.png','Скан_нижняя.stl','05.03.2024','3D модели'],['xray.png','КТ_панорама.jpg','05.03.2024','КТ/Рентген'],['smile.png','Фото_улыбка.jpg','04.03.2024','Фото'],['tooth.png','Другое.jpg','04.03.2024','Фото']];shell(`${title('Файлы','Откройте нужный заказ, чтобы загрузить файлы прямо в его папку на Яндекс Диске.')}${tabs([['Все файлы'],['КТ/Рентген'],['Фото'],['3D модели'],['Документы']],state.fileTab,'file-tab','segmented-tabs')}<div class="file-grid">${files.filter(f=>state.fileTab==='Все файлы'||f[3]===state.fileTab).map(([src,name,date])=>`<button class="file-card" data-action="file-preview" data-value="${name}"><img src="${assets+src}" alt=""><strong>${name}</strong><small>${date}</small></button>`).join('')}</div>`)}
const chatFileSize=size=>size>=1024*1024?`${(size/1024/1024).toFixed(1)} МБ`:`${Math.max(1,Math.ceil(size/1024))} КБ`;
function chatAttachmentMarkup(attachment,pending=false){if(!attachment)return '';const preview=attachment.preview?`<img src="${escapeHtml(attachment.preview)}" alt="">`:`<span class="chat-file-icon">📄</span>`;return `<${pending?'div':'button'} class="chat-attachment ${pending?'pending':''}" ${pending?'':`type="button" data-chat-file="${escapeHtml(attachment.id)}"`}>${preview}<span><strong>${escapeHtml(attachment.name)}</strong><small>${chatFileSize(attachment.size)}</small></span>${pending?'<button type="button" data-action="remove-chat-attachment" aria-label="Убрать файл">×</button>':''}</${pending?'div':'button'}>`}
function cadReturnAttachmentMarkup(){return (state.cadReturnAttachments||[]).map((attachment,index)=>`<div class="cad-return-file"><div>${attachment.preview?`<img src="${escapeHtml(attachment.preview)}" alt="">`:'<span class="chat-file-icon">📄</span>'}<span><strong>${escapeHtml(attachment.name)}</strong><small>${chatFileSize(attachment.size)}</small></span></div><button type="button" data-action="remove-cad-return-attachment" data-value="${index}" aria-label="Убрать файл">×</button></div>`).join('')}
function formattedChatText(value){return escapeHtml(value).replace(/\s+(?=(?:Клиника|Заказ|Пациент|Работа|Исполнение|Зубы|Режим|Челюсть|Срок|Цвет|Причина|Содержание|Запросил|Выполнить это действие в CRM)\s*:)/g,'\n')}
function chatMessageMarkup(message){const bot=message.from==='bot',author=bot?'Ответ AI':message.source==='telegram'&&message.from==='support'?'Create Dental Team':message.source==='telegram'&&message.sender?'Клиент':'';return `<div class="bubble ${message.from==='client'?'me':'them'} ${bot?'bot':''}">${author?`<small class="message-author">${escapeHtml(author)}</small>`:''}${message.text?`<p>${formattedChatText(message.text)}</p>`:''}${chatAttachmentMarkup(message.attachment)}<time>${new Date(message.time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></div>`}
function messagesPage(){shell(`${title('Сообщения')}<div class="messages-layout"><div class="contacts"><button class="contact active"><span class="contact-avatar">CD</span><span><strong>Поддержка Create Dental</strong><small>Ваш диалог со службой поддержки</small></span></button></div><div class="conversation"><div class="conversation-head"><span class="contact-avatar">CD</span><span><strong>Поддержка Create Dental</strong><small id="chat-status">${escapeHtml(state.chatStatus)}</small></span></div><div class="chat-bubbles" id="chat-bubbles">${state.messages.length?state.messages.map(chatMessageMarkup).join(''):'<p class="chat-empty">Напишите сообщение, и оператор увидит его в своей панели.</p>'}</div><form id="chat-form" class="chat-compose chat-compose-files">${state.chatAttachment?`<div class="chat-pending-file">${chatAttachmentMarkup(state.chatAttachment,true)}</div>`:''}<label class="chat-attach-button" title="Прикрепить файл">📎<input id="clinic-chat-file" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.stl,.ply,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt,.rtf" hidden></label><input id="chat-input" maxlength="2000" placeholder="Напишите сообщение..." value="${escapeHtml(state.chatText)}" autocomplete="off"><button class="send-btn" aria-label="Отправить сообщение">➤</button></form></div></div>`)}
function imageChatPreview(file){return new Promise((resolve,reject)=>{if(!file.type.startsWith('image/'))return resolve('');const image=new Image(),url=URL.createObjectURL(file);image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Не удалось открыть изображение'))};image.onload=()=>{const scale=Math.min(1,240/image.width,180/image.height),canvas=document.createElement('canvas'),context=canvas.getContext('2d');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));context.drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.72))};image.src=url})}
async function selectChatAttachment(file){if(!file)return;const allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf)$/i;if(!allowed.test(file.name))return notify('Выберите изображение, PDF, 3D-файл, архив, Word, Excel или текстовый документ');if(file.size>200*1024*1024)return notify('Файл должен быть не больше 200 МБ');try{state.chatAttachment={file,name:file.name,size:file.size,type:file.type||'application/octet-stream',preview:await imageChatPreview(file)};messagesPage()}catch(error){notify(error.message)}}
async function loadMessages(){
  if(!portalReady||state.role!=='clinic') return;
  if(state.page!=='messages'&&state.page!=='home') return;
  const subjectId=portalUser?.subjectId;
  try{
    const response=await fetch('/api/clinic-messages',{cache:'no-store',headers:{'X-Portal-Token':portalToken()}});
    if(!response.ok) throw new Error('Чат временно недоступен');
    const data=await response.json();
    if(portalUser?.subjectId!==subjectId)return;
    state.chatStatus='Служба поддержки онлайн · отвечаем 10:00–21:00 МСК';
    if($('#chat-status'))$('#chat-status').textContent=state.chatStatus;
    if(JSON.stringify(data.messages)!==JSON.stringify(state.messages)){
      state.messages=data.messages;
      const bubbles=$('#chat-bubbles');
      if(bubbles){
        bubbles.innerHTML=state.messages.length?state.messages.map(chatMessageMarkup).join(''):'<p class="chat-empty">Напишите сообщение, и оператор увидит его в своей панели.</p>';
        bubbles.scrollTop=bubbles.scrollHeight;
      }
      if($('#recent-messages'))$('#recent-messages').innerHTML=recentMessagesMarkup();
    }
  }catch(error){state.chatStatus=error.message; if($('#chat-status'))$('#chat-status').textContent=state.chatStatus}
}
function clinicRecord(){try{return JSON.parse(localStorage.getItem('create-dental-tech-clients')||'[]').find(client=>client.id===portalUser?.subjectId)}catch{return null}}
function prepareClinicLogo(file){
  return new Promise((resolve,reject)=>{
    const source=URL.createObjectURL(file),image=new Image();
    const finish=(error,value)=>{URL.revokeObjectURL(source);error?reject(error):resolve(value)};
    image.onerror=()=>finish(new Error('Не удалось открыть изображение'));
    image.onload=()=>{
      try{
        const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
        if(!context)throw new Error('Не удалось обработать изображение');
        let scale=Math.min(1,1000/Math.max(image.naturalWidth,image.naturalHeight));
        const format=canvas.toDataURL('image/webp').startsWith('data:image/webp')?'image/webp':'image/jpeg';
        for(let sizePass=0;sizePass<8;sizePass++){
          canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
          canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
          context.clearRect(0,0,canvas.width,canvas.height);
          if(format==='image/jpeg'){context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height)}
          context.drawImage(image,0,0,canvas.width,canvas.height);
          for(let quality=.88;quality>=.48;quality-=.1){
            const result=canvas.toDataURL(format,quality);
            if(result.length<350000)return finish(null,result);
          }
          scale*=.78;
        }
        finish(new Error('Не удалось уменьшить файл логотипа'));
      }catch(error){finish(error)}
    };
    image.src=source;
  });
}
function clinicPage(){
  const clinic=clinicRecord()||{name:'Клиника',inn:'',city:'',address:'',phone:'',email:''};
  const input=(name,value,type='text',placeholder='')=>`<input name="${name}" type="${type}" value="${escapeHtml(value||'')}" ${placeholder?`placeholder="${escapeHtml(placeholder)}"`:''}>`;
  const area=(name,value,placeholder='')=>`<textarea name="${name}" rows="4" ${placeholder?`placeholder="${escapeHtml(placeholder)}"`:''}>${escapeHtml(value||'')}</textarea>`;
  const tabsList=[['Основная информация'],['Контактные лица'],['Настройки'],['Безопасность']];
  const fields={
    'Основная информация':`${field('Название клиники',input('name',clinic.name))}${field('Страна',`<select name="country" required>${[['RU','Россия'],['BY','Беларусь'],['AM','Армения'],['KZ','Казахстан'],['UZ','Узбекистан'],['AE','Дубай, ОАЭ']].map(([code,name])=>`<option value="${code}" ${(clinic.country||'RU')===code?'selected':''}>${name}</option>`).join('')}</select>`)}${field('ИНН',input('inn',clinic.inn))}${field('Город',input('city',clinic.city))}${field('Адрес',input('address',clinic.address))}${field('Телефон',input('phone',clinic.phone,'tel','+7 (___) ___-__-__'))}${field('Email',input('email',clinic.email,'email'))}`,
    'Контактные лица':`${field('Контактное лицо',input('contact',clinic.contact||''))}${field('Должность',input('contactPosition',clinic.contactPosition||''))}${field('Телефон контакта',input('contactPhone',clinic.contactPhone||clinic.phone||'','tel','+7 (___) ___-__-__'))}${field('Email контакта',input('contactEmail',clinic.contactEmail||clinic.email||'','email'))}`,
    'Настройки':`${field('График работы',input('workHours',clinic.workHours||'','text','Пн-Пт 09:00–18:00'))}${field('Предпочтительный способ доставки',input('deliveryPreference',clinic.deliveryPreference||''))}${field('Условия оплаты',input('paymentTerms',clinic.paymentTerms||''))}${field('Комментарий для лаборатории',area('labNotes',clinic.labNotes||''))}`,
    'Безопасность':`${field('Email для входа',input('loginEmail',clinic.loginEmail||clinic.email||'','email'))}${field('Ответственный за доступ',input('accessManager',clinic.accessManager||clinic.contact||''))}${field('Телефон для подтверждений',input('securityPhone',clinic.securityPhone||clinic.phone||'','tel'))}${field('Заметка по доступу',area('securityNotes',clinic.securityNotes||''))}`
  };
  const active=fields[state.clinicTab]?state.clinicTab:'Основная информация';
  const clinicTabs=`<div class="tech-segment clinic-page-segment">${tabsList.map(([label])=>`<button data-action="clinic-tab" data-value="${escapeHtml(label)}" class="${active===label?'active':''}">${escapeHtml(label)}</button>`).join('')}</div>`;
  shell(`<div class="tech-heading clinic-page-heading"><div><span class="tech-eyebrow">КЛИНИКА</span><h1>Моя клиника</h1></div></div>${clinicTabs}<div class="clinic-content"><div class="clinic-photo"><strong>Логотип клиники</strong><img id="clinic-logo-preview" src="${clinic.logo||assets+'clinic.png'}" alt="Логотип клиники"><button type="button" data-action="change-logo">Изменить логотип</button><input id="clinic-logo-input" name="logoFile" type="file" accept="image/png,image/jpeg,image/webp" hidden></div><form id="clinic-form" class="clinic-form"><input type="hidden" name="logo" value="${escapeHtml(clinic.logo||'')}"><div class="form-grid">${fields[active]}<div class="save-field"><button class="btn primary" type="submit">Сохранить изменения</button></div></div></form></div>`);
}
function referencePage(){shell(`${title('Справочник','Информация о конструкциях, материалах и оформлении заказов.')}<div class="reference-grid">${[['Коронки E.max','Эстетичные цельнокерамические реставрации.'],['Виниры','Тонкие накладки для восстановления улыбки.'],['Мостовидные протезы','Конструкции для замещения отсутствующих зубов.'],['3D сканирование','Цифровые слепки для точной работы.']].map(([h,p])=>`<article class="reference-card">${icon('book',25)}<h3>${h}</h3><p>${p}</p></article>`).join('')}</div>`)}
let technicianCabinet=null;
let workerCabinet=null;
let portalReady=false;
let portalUser=null;
let authMode=initialRoute.mode||'login';
let portalError='';
let authNotice='';
let authDraft={name:'',phone:'',email:'',country:'RU',city:'',address:'',password:''};
function loginView(){
  const field=(label,name,type='text',minimum='',value='')=>`<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${minimum?`minlength="${minimum}"`:''} required></label>`;
  const form=authMode==='register'
    ?`${field('Название клиники','name','text','',authDraft.name)}${field('Телефон','phone','tel','',authDraft.phone)}${field('Email','email','email','',authDraft.email)}<label>Страна<select name="country" required>${[['RU','Россия'],['BY','Беларусь'],['AM','Армения'],['KZ','Казахстан'],['UZ','Узбекистан'],['AE','Дубай, ОАЭ']].map(([code,name])=>`<option value="${code}" ${authDraft.country===code?'selected':''}>${name}</option>`).join('')}</select></label>${field('Город','city','text','',authDraft.city)}${field('Адрес','address','text','',authDraft.address)}${field('Пароль от 8 символов','password','password',8,authDraft.password)}<button class="btn primary">Зарегистрироваться</button>`
    :`${field('Email или логин','email')}${field('Пароль','password','password')}<button class="btn primary">Войти</button>`;
  const links=authMode==='login'
    ?'<div class="auth-links"><button type="button" data-auth-mode="register">Регистрация</button><button type="button" data-auth-mode="recover">Забыли пароль?</button></div>'
    :'<div class="auth-links"><button type="button" data-auth-mode="login">← Вернуться ко входу</button></div>';
  let content=authMode==='recover'
    ?'<div class="auth-recovery"><h2>Восстановление пароля</h2><p>Обратитесь по почте <a href="mailto:ceo@createdental.ai">ceo@createdental.ai</a>, чтобы получить новый пароль.</p></div>'
    :`<form id="portal-login-form" data-mode="${authMode}">${form}</form>`;
  $('#app').innerHTML=`<main class="portal-login"><div class="portal-login-tools">${languageSwitcherMarkup()}${themeToggleMarkup()}</div><section><img class="portal-logo" src="${logo}" alt="Create Dental"><h1>${authMode==='register'?'Регистрация клиники':'Личный кабинет Create Dental'}</h1><p>Заказы, производство и связь с лабораторией.</p>${content}${links}${authNotice?`<p class="portal-login-success">${escapeHtml(authNotice)}</p>`:''}${portalError?`<p class="portal-login-error">${escapeHtml(portalError)}</p>`:''}</section></main>`;
}
function render(){if(!portalReady){if(portalToken()){$('#app').innerHTML='<div class="startup-notice">Загрузка кабинета...</div>';return}loginView();return}state.role=portalUser.role;if(state.role==='technician'){technicianCabinet.render();return}if(state.role==='worker'){workerCabinet.render();return}const page=state.page;({home:dashboard,new:newOrder,orders:ordersPage,detail,files:filesPage,messages:messagesPage,clinic:clinicPage,reference:referencePage}[page]||dashboard)();if(page==='messages'||page==='home')queueMicrotask(loadMessages)}
function syncRoute(){
  const route=routeFromPath(location.pathname);
  if(!portalReady){authMode=route.mode||'login';render();return}
  if(route.role!==portalUser.role){navigate(pathFor(portalUser.role,portalUser.role==='clinic'?'home':'overview'),{replace:true});state.page='home'}
  else if(portalUser.role==='clinic'){state.page=route.page;state.orderId=route.orderId||state.orderId}
  render();
}
async function hydratePortal(){
  const data=await loadPortal();
  if(data.user.role==='technician'&&!technicianCabinet){
    const {createTechnicianCabinet}=await import('./technician.js?v=portal-language-1');
    technicianCabinet=createTechnicianCabinet({root:()=>$('#app'),orders,assets,logo,icon,toothChart,isActive:()=>state.role==='technician',currentUser:()=>portalUser,orderHistory:()=>portalHistory,clientRequests:()=>portalClientRequests,onUserUpdate:user=>{portalUser=user}});
  }
  if(data.user.role==='worker'&&!workerCabinet){
    const {createWorkerCabinet}=await import('./worker.js?v=portal-language-1');
    workerCabinet=createWorkerCabinet({root:()=>$('#app'),orders,assets,logo,icon,toothChart,isActive:()=>state.role==='worker',currentUser:()=>portalUser,orderHistory:()=>portalHistory,onUserUpdate:user=>{portalUser=user}});
  }
  if(portalUser?.subjectId!==data.user.subjectId)state.messages=[];
  portalUser=data.user;
  orders.splice(0,orders.length,...data.orders);
  portalHistory=data.orderHistory||[];
  portalClientRequests=data.clientRequests||[];
  localStorage.setItem('create-dental-tech-orders',JSON.stringify(data.orderOverrides));
  localStorage.setItem('create-dental-tech-clients',JSON.stringify(data.clients));
  localStorage.setItem('create-dental-employees',JSON.stringify(data.employees));
  portalReady=true;
  portalError='';
  refreshNotificationCenter().then(()=>{const center=document.querySelector('.notification-center');if(center)center.outerHTML=notificationCenterMarkup()}).catch(()=>{});
  syncRoute();
}
function currentOrderDraft(){return {form:{...state.form},variants:allVariants().filter(variantIsComplete).map(variant=>({...variant,bridgeRanges:variant.bridgeRanges.map(range=>[...range]),selectedTeeth:[...variant.selectedTeeth]})),uploaded:[...state.uploaded],estimate:totalOrderEstimateText()}}
function resetCurrentVariant(){state.toothMode='Одиночка';state.bridgeRanges=[];state.bridgeStart=null;state.selectedTeeth=[];state.work='';state.workOption='';state.form.construction='';state.form.material=''}
function resetOrderDraft(){const due=new Date(Date.now()+14*86400000).toISOString().slice(0,10);state.form={surname:'',initials:'',birth:'',orderType:'',construction:'',material:'',quantity:'1',due,shade:'A2',comment:''};state.orderVariants=[];resetCurrentVariant();state.uploaded=[];state.step=0}
function addOrderVariant(){const variant=currentVariant();if(!variantIsComplete(variant))return notify('Сначала выберите зубы и услугу для текущей позиции');if((state.orderVariants||[]).length>=9)return notify('В одном заказе можно добавить до 10 услуг');state.orderVariants=[...(state.orderVariants||[]),variant];resetCurrentVariant();notify(`Услуга добавлена · ${state.orderVariants.length}/10`);render()}
function addCurrentOrderToCart(){if(state.cart.length>=19)return notify('За один раз можно оформить до 20 заказов');state.cart.push(currentOrderDraft());resetOrderDraft();notify('Заказ добавлен в корзину. Заполните следующий заказ.')}
function startAnotherCartOrder(){
  if(state.step!==0||state.selectedTeeth.length||state.work||state.form.surname||state.form.initials||state.uploaded.length)return notify('Сначала завершите текущий заказ или добавьте его в корзину');
  state.step=0;render();
}
function orderFromDraft(draft,index=0){const id=`CD-${(Date.now()+index).toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,4).toUpperCase()}`,variants=draft.variants?.length?draft.variants:[{toothMode:draft.toothMode,bridgeRanges:draft.bridgeRanges||[],selectedTeeth:draft.selectedTeeth||[],work:draft.form.construction,workOption:draft.form.material}],teeth=[...new Set(variants.flatMap(variant=>variant.selectedTeeth||[]))].sort((a,b)=>a-b),estimate=variants.map(variant=>variantEstimate(variant)).every(Number.isFinite)?variants.reduce((sum,variant)=>sum+(variantEstimate(variant)||0),0):null;return {id,patient:`${draft.form.surname} ${draft.form.initials}`.trim(),birth:draft.form.birth||'',work:variants.length>1?`Несколько услуг (${variants.length})`:variants[0]?.work||draft.form.construction,material:variants.length>1?variants.map(variant=>variant.workOption||variant.work).join(' · '):(variants[0]?.workOption||draft.form.material),toothMode:variants.length>1?'Несколько услуг':variants[0]?.toothMode||'Одиночка',bridgeRanges:variants.flatMap(variant=>variant.bridgeRanges||[]).map(range=>[...range]),quantity:Math.max(1,teeth.length),date:draft.form.due.split('-').reverse().join('.'),status:'Новый',productionType:draft.form.orderType==='analog'?'analog':'digital',sum:estimate===null?'Стоимость уточняется':rubles(estimate),image:'tooth.png',clinicId:portalUser.subjectId,clinic:clinicRecord()?.name||'Клиника',teeth,shade:draft.form.shade,comment:draft.form.comment,variants,createdAt:new Date(Date.now()+index).toISOString(),pendingFiles:draft.uploaded||[]}}
async function createOrder(){
  const drafts=currentOrderDraft(),created=[orderFromDraft(drafts)];
  try {
    await savePortal('orders',[...created.map(({pendingFiles,...order})=>order),...orders]);
    orders.unshift(...created.map(({pendingFiles,...order})=>order));
    const failed=[];
    for(const order of created)for(const file of order.pendingFiles){try{await uploadOrderFile(order.id,file)}catch(error){failed.push(`${file.name}: ${error.message}`)}finally{releaseUploadPreview(file)}}
    state.cart=[];resetOrderDraft();state.page='detail';state.orderId=created[0].id;
    state.filesFor='';state.orderFiles=[];
    navigate(pathFor('clinic','detail',created[0].id));
    notify(failed.length?`Заказ создан, но не загружены файлы: ${failed.join('; ')}`:'Заказ создан и доступен лаборатории');
  } catch(error){notify('Не удалось создать заказ: '+error.message)}
}

function repeatOrder(orderId){
  const order=currentOrders().find(item=>item.id===orderId);
  if(!order)return;
  const due=new Date();due.setDate(due.getDate()+14);
  state.orderVariants=[];state.form={...state.form,surname:'',initials:'',birth:'',orderType:order.productionType==='analog'?'analog':'digital',construction:order.work||'',material:order.material||'',quantity:String(order.quantity||Math.max(1,order.teeth?.length||1)),due:due.toISOString().slice(0,10),shade:order.shade||'A2',comment:order.comment||''};
  state.work=order.work||'';state.workOption=order.material||'';state.toothMode=order.toothMode||'Одиночка';
  state.bridgeRanges=state.toothMode==='Мост'?(Array.isArray(order.bridgeRanges)&&order.bridgeRanges.length?order.bridgeRanges.map(range=>[...range]):Array.isArray(order.teeth)&&order.teeth.length?[[...order.teeth]]:[]):[];
  state.bridgeStart=null;
  state.selectedTeeth=Array.isArray(order.teeth)?[...order.teeth]:[];
  state.uploaded.forEach(releaseUploadPreview);state.uploaded=[];state.step=0;state.page='new';state.detailTab='Обзор';navigate(pathFor('clinic','new'));render();
  notify('Данные заказа перенесены. Укажите нового пациента и прикрепите актуальные файлы.');
}

function syncBridgeSelection(){
  state.selectedTeeth=[...new Set([...state.bridgeRanges.flat(),...(state.bridgeStart?[state.bridgeStart]:[])])].sort((a,b)=>a-b);
}

function bridgeRange(start,end){
  if((start<30)!==(end<30))return null;
  const arch=start<30?upperTeeth:lowerTeeth;
  const first=arch.indexOf(start),last=arch.indexOf(end);
  if(first<0||last<0)return null;
  const range=arch.slice(Math.min(first,last),Math.max(first,last)+1);
  return first<=last?range:range.reverse();
}

function selectOrderTooth(number){
  if(state.toothMode==='Мост'){
    if(!state.bridgeStart){
      const existing=state.bridgeRanges.findIndex(range=>range.includes(number));
      if(existing>=0)state.bridgeRanges.splice(existing,1);
      else state.bridgeStart=number;
      syncBridgeSelection();
      return;
    }
    if(state.bridgeStart===number){state.bridgeStart=null;syncBridgeSelection();return}
    if((state.bridgeStart<30)!==(number<30)){
      state.bridgeStart=number;
      syncBridgeSelection();
      return;
    }
    const range=bridgeRange(state.bridgeStart,number);
    state.bridgeRanges=state.bridgeRanges.filter(saved=>!saved.some(tooth=>range.includes(tooth)));
    state.bridgeRanges.push(range);
    state.bridgeStart=null;
    syncBridgeSelection();
    return;
  }
  if(state.toothMode==='Челюсть'){
    const arch=number<30?upperTeeth:lowerTeeth;
    const alreadySelected=arch.every(tooth=>state.selectedTeeth.includes(tooth));
    state.selectedTeeth=alreadySelected?state.selectedTeeth.filter(tooth=>!arch.includes(tooth)):[...new Set([...state.selectedTeeth,...arch])].sort((a,b)=>a-b);
    return;
  }
  state.selectedTeeth=state.selectedTeeth.includes(number)?state.selectedTeeth.filter(tooth=>tooth!==number):[...state.selectedTeeth,number].sort((a,b)=>a-b);
}

function advanceOrderStep(){
  if(state.step===0&&(!state.form.surname.trim()||!state.form.initials.trim())){notify('Укажите фамилию и имя пациента. Отчество — по желанию');return false}
  if(state.step===0&&!state.form.orderType){notify('Выберите тип работы: цифровой или аналоговый');return false}
  const currentComplete=variantIsComplete(currentVariant()),hasSavedVariants=Boolean(state.orderVariants?.length),currentBlank=!state.selectedTeeth.length&&!state.work&&!state.workOption&&!state.bridgeStart&&!state.bridgeRanges.length;
  if(state.step===1&&!currentComplete&&!hasSavedVariants){notify('Выберите зуб или челюсть');return false}
  if(state.step===1&&!currentComplete&&hasSavedVariants&&currentBlank){state.step=2;return true}
  if(state.step===1&&state.toothMode==='Мост'&&state.bridgeStart){notify('Выберите последний зуб моста');return false}
  if(state.step===1&&state.toothMode==='Мост'&&!state.bridgeRanges.length){notify('Выберите первый и последний зуб моста');return false}
  if(state.step===1&&!state.selectedTeeth.length){notify('Выберите зуб или челюсть');return false}
  if(state.step===1&&!state.work){notify('Выберите вид работы');return false}
  if(state.step===1&&selectedWork()?.options.length&&!state.workOption){notify('Выберите вариант исполнения');return false}
  if(state.step<steps.length-1){state.step++;return true}
  createOrder();return false;
}

async function updateClinicStage(orderId,stage){
  let overrides={};
  try{overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}}catch{}
  overrides[orderId]={...(overrides[orderId]||{}),stage};
  localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
  try{await savePortal('orderOverrides',overrides);notify(stage==='Принято доктором'?'Заказ принят':'Статус обновлён');await hydratePortal()}catch(error){notify('Не удалось сохранить статус: '+error.message)}
}
function notify(message){state.toast=message;render();clearTimeout(notify.timer);notify.timer=setTimeout(()=>{state.toast='';$('.toast')?.classList.remove('visible')},3000)}
document.addEventListener('click',event=>{const button=event.target.closest('[data-auth-mode]');if(!button)return;authMode=button.dataset.authMode;portalError='';authNotice='';navigate(pathFor(null,authMode));loginView();if(authMode==='register')import('./location-assist.js?v=phone-mask-2').catch(()=>{})});
document.addEventListener('click',async event=>{if(!event.target.closest('[data-auth-logout]'))return;try{await authRequest('logout',{})}catch{}clearPortalToken();portalReady=false;portalUser=null;state.messages=[];state.chatText='';state.role='clinic';authMode='login';navigate('/login',{replace:true});render()});
document.addEventListener('click',event=>{const sort=event.target.closest('[data-order-sort]');if(!sort||state.role!=='clinic')return;const key=sort.dataset.orderSort;state.sortDirection=state.sortKey===key&&state.sortDirection==='asc'?'desc':'asc';state.sortKey=key;const table=$('.table-wrap');if(table)table.outerHTML=orderTable(filteredOrders().slice(0,state.page==='home'?4:Infinity))});
document.addEventListener('click',async event=>{
  if(portalUser?.role!=='clinic')return;
  const cadPreviewBackdrop=event.target.closest('.cad-preview-backdrop');
  if(cadPreviewBackdrop&&event.target===cadPreviewBackdrop){cadPreviewRequest++;if(state.cadPreview?.url)URL.revokeObjectURL(state.cadPreview.url);state.cadPreview=null;render();return}
  const cadBackdrop=event.target.closest('.cad-return-backdrop');
  if(cadBackdrop&&event.target===cadBackdrop){state.cadReturnOrderId='';state.cadReturnComment='';state.cadReturnAttachments=[];render();return}
  if(document.querySelector('.notification-panel')&&!event.target.closest('.notification-center')){closeNotificationCenter();document.querySelector('.notification-panel')?.remove()}
  if(state.orderFilterOpen&&!event.target.closest('.clinic-filter-wrap')){state.orderFilterOpen=false;document.querySelector('.clinic-order-filter')?.remove()}
  const notificationToggle=event.target.closest('[data-notification-toggle]');
  if(notificationToggle){await toggleNotificationCenter();render();return}
  const notificationClose=event.target.closest('[data-notification-close]');
  if(notificationClose){closeNotificationCenter();render();return}
  const notification=event.target.closest('[data-notification-id]');
  if(notification){const orderId=notification.dataset.notificationOrder;await markNotificationCenterRead().catch(()=>{});closeNotificationCenter();if(orderId&&currentOrders().some(order=>order.id===orderId)){state.orderId=orderId;state.page='detail';state.filesFor='';navigate(pathFor('clinic','detail',orderId))}else{state.page='messages';navigate(pathFor('clinic','messages'))}render();return}
  const chatFile=event.target.closest('[data-chat-file]');
  if(chatFile){try{await downloadClinicMessageFile(chatFile.dataset.chatFile)}catch(error){notify(error.message)}return}
  if(event.target.closest('[data-action="remove-chat-attachment"]')){state.chatAttachment=null;messagesPage();return}
  const cadAttachment=event.target.closest('[data-action="remove-cad-return-attachment"]');
  if(cadAttachment){state.cadReturnAttachments.splice(Number(cadAttachment.dataset.value),1);render();return}
  const el=event.target.closest('[data-page],[data-order],[data-tooth],[data-step],[data-action]');if(!el)return;if(el.dataset.page){state.page=el.dataset.page;if(state.page==='orders')state.dueDateFilter='';if(state.page==='new')resetOrderDraft();document.querySelector('#sidebar')?.classList.remove('open');navigate(pathFor('clinic',state.page));render();return}if(el.dataset.order){state.orderId=el.dataset.order;state.page='detail';state.filesFor='';navigate(pathFor('clinic','detail',state.orderId));render();return}if(el.dataset.tooth){selectOrderTooth(Number(el.dataset.tooth));render();return}if(el.dataset.step!==undefined){const target=Number(el.dataset.step);if(target<=state.step)state.step=target;render();return}const a=el.dataset.action,v=el.dataset.value;if(a==='new'){state.page='new';resetOrderDraft()}else if(a==='next'){if(!advanceOrderStep())return}else if(a==='add-variant'){addOrderVariant();return}else if(a==='remove-variant'){const index=Number(v);if(Number.isInteger(index)&&index>=0&&index<(state.orderVariants||[]).length)state.orderVariants.splice(index,1)}else if(a==='previous')state.step=Math.max(0,state.step-1);else if(a==='filter')state.filter=v;else if(a==='calendar-show-all'){state.dueDateFilter=v;state.filter='Все';state.query='';state.page='orders';navigate(pathFor('clinic','orders'));render();return}else if(a==='clear-date-filter'){state.dueDateFilter='';ordersPage();return}else if(a==='filter-reset'){state.orderMonthFilter='';state.orderFilterOpen=false}else if(a==='filter-close')state.orderFilterOpen=false;else if(a==='file-tab')state.fileTab=v;else if(a==='detail-tab')state.detailTab=v;else if(a==='clinic-tab')state.clinicTab=v;else if(a==='dentition')state.dentition=v;else if(a==='tooth-mode'){state.toothMode=v;state.selectedTeeth=[];state.bridgeRanges=[];state.bridgeStart=null}else if(a==='order-type'){state.form.orderType=v==='analog'?'analog':'digital'}else if(a==='work'){state.work=v;state.workOption='';state.form.construction=v;state.form.material=''}else if(a==='work-option'){state.workOption=v;state.form.material=v}else if(a==='work-back'){state.work='';state.workOption='';state.form.construction='';state.form.material=''}else if(a==='clear-teeth'){state.selectedTeeth=[];state.bridgeRanges=[];state.bridgeStart=null}else if(a==='open-messages')state.page='messages';else if(a==='repeat-order'){repeatOrder(state.orderId);return}else if(a==='request-edit'){state.clientRequest={orderId:state.orderId,type:'edit',field:'patient'}}else if(a==='request-cancel'){state.clientRequest={orderId:state.orderId,type:'cancel'}}else if(a==='client-request-close'){state.clientRequest=null}else if(a==='cad-open'){const requestId=++cadPreviewRequest;try{state.cadPreview={orderId:state.orderId,fileId:v,name:'Загрузка CAD…',html:'',url:''};render();const file=state.orderFiles.find(item=>item.id===v),html=await loadCadReviewHtml(v);if(requestId!==cadPreviewRequest||!state.cadPreview||state.cadPreview.fileId!==v)return;const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));state.cadPreview={orderId:state.orderId,fileId:v,name:file?.name||'CAD',html:'',url};render()}catch(error){if(requestId!==cadPreviewRequest)return;state.cadPreview=null;notify(error.message)}return}else if(a==='cad-close'){cadPreviewRequest++;if(state.cadPreview?.url)URL.revokeObjectURL(state.cadPreview.url);state.cadPreview=null;render();return}else if(a==='cad-approve'){try{await decideCadReview(v,'approve');if(state.cadPreview?.url)URL.revokeObjectURL(state.cadPreview.url);state.cadPreview=null;await hydratePortal();notify('CAD подтверждён и передан в изготовление')}catch(error){notify(error.message)}return}else if(a==='cad-return'){state.cadReturnOrderId=v;state.cadReturnComment='';state.cadReturnAttachments=[];render();return}else if(a==='cad-return-cancel'){state.cadReturnOrderId='';state.cadReturnComment='';state.cadReturnAttachments=[];render();return}else if(a==='doctor-accept'){updateClinicStage(v,'Принято доктором');return}else if(a==='doctor-rework'){state.reworkOrderId=v;render();return}else if(a==='cancel-rework'){state.reworkOrderId='';render();return}else if(a==='add-order-file'){state.orderUpload={orderId:state.orderId,uploading:false,files:[]};render();return}else if(a==='order-upload-close'){if(!state.orderUpload?.uploading){state.orderUpload=null;render()}return}else if(a==='remove-file'){const removed=state.uploaded.filter(file=>file.name===v);removed.forEach(releaseUploadPreview);state.uploaded=state.uploaded.filter(file=>file.name!==v)}else if(a==='menu'){$('#sidebar').classList.toggle('open');return}else if(a==='save-clinic'){notify('Изменения сохранены локально');return}else if(a==='file-preview'){notify(v);return}else if(a==='filters'){state.orderFilterOpen=!state.orderFilterOpen}else if(a==='more'){notify('Дополнительные действия появятся после подключения сервера');return}else if(a==='change-logo'){$('#clinic-logo-input')?.click();return}else if(a==='attach'){notify('Прикрепление файлов доступно в разделе «Файлы»');return}else if(a==='contact'){notify('Демонстрационный диалог');return}else return;if(['new','open-messages'].includes(a))navigate(pathFor('clinic',state.page));render()});
document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-tooth][role="button"]')){event.preventDefault();event.target.click()}});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action^="calendar-"]');
  if(!button)return;
  const action=button.dataset.action;
  if(action==='calendar-day')state.calendarDay=Number(button.dataset.value);
  else if(action==='calendar-prev'||action==='calendar-next'){
    state.calendarMonth=new Date(state.calendarMonth.getFullYear(),state.calendarMonth.getMonth()+(action==='calendar-next'?1:-1),1);
    state.calendarDay=null;
  }
  render();
});
document.addEventListener('input',event=>{if(event.target.dataset.field)state.form[event.target.dataset.field]=event.target.value;if(event.target.id==='order-search'){state.query=event.target.value;const table=$('.table-wrap');if(table)table.outerHTML=orderTable(filteredOrders());}if(event.target.id==='chat-input')state.chatText=event.target.value;if(event.target.form?.id==='cad-return-form'&&event.target.name==='comment')state.cadReturnComment=event.target.value});
document.addEventListener('change',async event=>{
  if(event.target.dataset.field)state.form[event.target.dataset.field]=event.target.value;
  if(event.target.id==='client-request-field'){
    state.clientRequest={...state.clientRequest,field:event.target.value};
    render();
    return;
  }
  if(event.target.id==='clinic-order-month'){state.orderMonthFilter=event.target.value;ordersPage();return}
  if(event.target.id==='clinic-chat-file'){await selectChatAttachment(event.target.files?.[0]);event.target.value='';return}
  if(event.target.id==='cad-return-files'){
    const selected=Array.from(event.target.files||[]),allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf|html)$/i;
    const files=selected.filter(file=>allowed.test(file.name)&&file.size<=200*1024*1024).slice(0,10-(state.cadReturnAttachments||[]).length);
    if(selected.length>files.length)notify('Можно прикрепить до 10 файлов поддерживаемых форматов, каждый до 200 МБ');
    const prepared=await Promise.all(files.map(async file=>({file,name:file.name,size:file.size,type:file.type||'application/octet-stream',preview:await imageChatPreview(file)})));
    state.cadReturnAttachments=[...(state.cadReturnAttachments||[]),...prepared];render();event.target.value='';return;
  }
  if(event.target.id==='order-upload-dialog-input'){
    const files=Array.from(event.target.files||[]);event.target.value='';startOrderUpload(files);return;
  }
  if(event.target.id==='clinic-logo-input'){
    const file=event.target.files?.[0];
    if(!file)return;
    if(!file.type.startsWith('image/'))return notify('Загрузите изображение');
    let clients=[];try{clients=JSON.parse(localStorage.getItem('create-dental-tech-clients')||'[]')}catch{}
    const clinic=clients.find(item=>item.id===portalUser?.subjectId);
    if(!clinic)return notify('Клиника не найдена');
    const previous=clinic.logo||'';
    try{
      const value=await prepareClinicLogo(file);
      clinic.logo=value;
      localStorage.setItem('create-dental-tech-clients',JSON.stringify(clients));
      const preview=$('#clinic-logo-preview'),hidden=document.querySelector('#clinic-form input[name="logo"]');
      if(preview)preview.src=value;
      if(hidden)hidden.value=value;
      try{await savePortal('clients',[clinic]);notify('Логотип сохранён')}
      catch(error){clinic.logo=previous;localStorage.setItem('create-dental-tech-clients',JSON.stringify(clients));if(preview)preview.src=previous||assets+'clinic.png';if(hidden)hidden.value=previous;notify('Не удалось сохранить логотип: '+error.message)}
    }catch(error){notify(error.message||'Не удалось загрузить логотип')}
    return;
  }
  if(event.target.id==='upload-input'){
    const files=Array.from(event.target.files||[]),allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf)$/i;
    const invalid=files.filter(file=>!allowed.test(file.name)||file.size>200*1024*1024);
    if(invalid.length)notify(`Не добавлено: ${invalid.map(file=>file.name).join(', ')}. Выберите изображение, PDF, 3D-файл, архив или документ до 200 МБ.`);
    state.uploaded.push(...files.filter(file=>allowed.test(file.name)&&file.size<=200*1024*1024));
    render();
  }
});
document.addEventListener('dragover',event=>{if(event.target.closest('.upload-zone')){event.preventDefault();event.target.closest('.upload-zone').classList.add('dragging')}});
document.addEventListener('dragleave',event=>{event.target.closest('.upload-zone')?.classList.remove('dragging')});
document.addEventListener('drop',event=>{
  const zone=event.target.closest('.upload-zone');if(!zone)return;
  event.preventDefault();zone.classList.remove('dragging');
  const files=Array.from(event.dataTransfer?.files||[]),allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf)$/i,valid=files.filter(file=>allowed.test(file.name)&&file.size<=200*1024*1024),invalid=files.filter(file=>!allowed.test(file.name)||file.size>200*1024*1024);
  if(invalid.length)notify(`Не добавлено: ${invalid.map(file=>file.name).join(', ')}. Проверьте формат и размер до 200 МБ.`);
  state.uploaded.push(...valid);render();
});
document.addEventListener('submit',event=>{if(event.target.id!=='clinic-form')return;event.preventDefault();let clients=[];try{clients=JSON.parse(localStorage.getItem('create-dental-tech-clients')||'[]')}catch{}const clinic=clients.find(client=>client.id===portalUser?.subjectId);if(!clinic)return notify('Клиника не найдена');for(const element of Array.from(event.target.elements)){if(!element.name||element.name==='logoFile')continue;clinic[element.name]=element.value.trim()}if(!clinic.name)return notify('Укажите название клиники');localStorage.setItem('create-dental-tech-clients',JSON.stringify(clients));savePortal('clients',clients).then(()=>notify('Данные клиники сохранены')).catch(error=>notify('Не удалось сохранить клинику на сервере: '+error.message))});
document.addEventListener('submit',async event=>{
  if(event.target.id!=='clinic-client-request-form')return;
  event.preventDefault();
  const form=event.target,data=new FormData(form),type=String(data.get('type')||''),body={type};
  if(type==='cancel')body.reason=String(data.get('reason')||'').trim();
  else{body.field=String(data.get('field')||'');body.value=String(data.get('value')||'').trim()}
  const submit=form.querySelector('[type="submit"]');submit.disabled=true;
  try{
    const response=await fetch(`/api/orders/${encodeURIComponent(state.orderId)}/client-request`,{method:'POST',headers:{'Content-Type':'application/json','X-Portal-Token':portalToken()},body:JSON.stringify(body)});
    const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'Не удалось отправить запрос');
    if(result.request)portalClientRequests.unshift(result.request);
    state.clientRequest=null;render();notify('Запрос отправлен главному технику');
  }catch(error){notify(error.message);if(submit.isConnected)submit.disabled=false}
});
document.addEventListener('submit',async event=>{
  if(event.target.id!=='cad-return-form')return;
  event.preventDefault();
  const comment=new FormData(event.target).get('comment')?.toString().trim()||'',orderId=state.cadReturnOrderId;
  if(comment.length<5)return notify('Опишите, что нужно исправить');
  const submit=event.target.querySelector('[type="submit"]');submit.disabled=true;
  try{
    const attachments=[];
    for(const item of state.cadReturnAttachments||[]){
      const uploaded=item.uploaded||await uploadOrderFile(orderId,item.file,{purpose:'cad-review-attachment'});
      item.uploaded=uploaded;attachments.push(uploaded.id);
    }
    await decideCadReview(orderId,'return',comment,attachments);
    state.cadReturnOrderId='';state.cadReturnComment='';state.cadReturnAttachments=[];state.cadPreview=null;await hydratePortal();notify('CAD возвращён моделировщику с комментарием и файлами')
  }
  catch(error){notify(error.message);if(submit.isConnected)submit.disabled=false}
});
document.addEventListener('submit',async event=>{
  if(event.target.id!=='order-rework-form')return;
  event.preventDefault();
  const reason=new FormData(event.target).get('reason')?.toString().trim()||'';
  if(reason.length<5)return notify('Опишите причину доработки (не менее 5 символов)');
  const submit=event.target.querySelector('[type="submit"]');submit.disabled=true;
  try{await requestOrderRework(state.reworkOrderId,reason);state.reworkOrderId='';await hydratePortal();notify('Заказ отправлен на доработку')}
  catch(error){notify(error.message);if(submit.isConnected)submit.disabled=false}
});
document.addEventListener('submit',async event=>{if(event.target.id==='chat-form'){event.preventDefault();const msg=state.chatText.trim(),pending=state.chatAttachment;if(!msg&&!pending)return;const send=event.target.querySelector('.send-btn');send.disabled=true;try{const uploaded=pending?(pending.uploaded||await uploadClinicMessageFile(pending.file)):null;if(pending&&!pending.uploaded)state.chatAttachment={...pending,uploaded};const attachment=uploaded?{...uploaded,preview:pending.preview||''}:null;const response=await fetch('/api/clinic-messages',{method:'POST',headers:{'Content-Type':'application/json','X-Portal-Token':portalToken()},body:JSON.stringify({text:msg,attachment})});if(!response.ok){let data={};try{data=await response.json()}catch{}throw new Error(data.error||'Не удалось отправить сообщение')}state.chatText='';state.chatAttachment=null;await loadMessages()}catch(error){state.chatStatus=error.message;if($('#chat-status'))$('#chat-status').textContent=state.chatStatus}finally{if(send.isConnected)send.disabled=false}}});
document.addEventListener('submit',async event=>{
  if(event.target.id!=='portal-login-form')return;
  event.preventDefault();
  const form=event.target;
  const body=Object.fromEntries(new FormData(form));
  const action=form.dataset.mode==='register'?'register':'login';
  if(action==='register')authDraft={...authDraft,...body};
  try{const data=await authRequest(action,body);if(data.pendingApproval){clearPortalToken();authDraft={name:'',phone:'',email:'',country:'RU',city:'',address:'',password:''};authNotice='Спасибо за регистрация. Мы с вами свяжемся в ближайшее время.';authMode='login';navigate('/login',{replace:true});render();return}await hydratePortal()}
  catch(error){clearPortalToken();portalError=error.message;render()}
});
window.addEventListener('popstate',syncRoute);
setInterval(()=>{if(document.visibilityState!=='visible')return;loadMessages();technicianCabinet?.refreshMessages();technicianCabinet?.refreshClientRequests?.()},3000);
setInterval(()=>{if(document.visibilityState!=='visible'||!portalReady)return;refreshNotificationCenter().then(()=>{const center=document.querySelector('.notification-center');if(center)center.outerHTML=notificationCenterMarkup()}).catch(()=>{})},20000);
render();
if(portalToken())hydratePortal().catch(error=>{
  if(error.status===401){clearPortalToken();portalReady=false;navigate('/login',{replace:true})}
  portalError=error.message;
  render();
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&portalReady&&!document.querySelector('input:focus,textarea:focus,select:focus')){
    hydratePortal().catch(error=>{portalError=error.message;notify('Не удалось обновить данные: '+error.message)});
  }
});
