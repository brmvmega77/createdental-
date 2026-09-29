import { createTechnicianCabinet } from './technician.js';
import { createWorkerCabinet } from './worker.js';
import { seedOrders } from './seed-orders.js';
import { seedDetails } from './technician.js';
import {portalToken,setPortalToken,clearPortalToken,loadPortal,savePortal,authRequest} from './portal-client.js';

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
  heart:'<path d="M20.8 8.5c0 5-8.8 11.3-8.8 11.3S3.2 13.5 3.2 8.5a4.8 4.8 0 0 1 8.8-2.6 4.8 4.8 0 0 1 8.8 2.6z"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3-7 8-7s8 2.5 8 7"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  paperclip:'<path d="m20 11-8 8a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>',
  check:'<path d="m5 12 5 5L20 7"/>',
  back:'<path d="m15 18-6-6 6-6"/>',
  more:'<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'
};
const icon = (name,size=18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const assets = '/assets/';
const orders = seedOrders.map(order=>({...order}));
const nav = [['home','Главная','home'],['new','Новый заказ','plus'],['orders','Мои заказы','orders'],['files','Файлы','file'],['messages','Сообщения','message'],['reference','Справочник','book'],['clinic','Моя клиника','clinic']];
const steps = ['Пациент','Конструкция','Зубы','Дополнительно','Подтверждение'];
const requestedRole=new URLSearchParams(location.search).get('role');
const state = {role:['technician','worker'].includes(requestedRole)?requestedRole:'clinic',page:'home',step:0,filter:'Все',query:'',orderId:'CD-1042',detailTab:'Обзор',fileTab:'Все файлы',clinicTab:'Основная информация',selectedTeeth:[],dentition:'Постоянные зубы',work:'Коронка',messages:[],chatText:'',chatStatus:'Подключение к чату...',calendarMonth:new Date(new Date().getFullYear(),new Date().getMonth(),1),calendarDay:new Date().getDate(),uploaded:[],form:{surname:'',initials:'',phone:'',birth:'',construction:'Коронка E.max',material:'Керамика E.max',quantity:'1',due:new Date(Date.now()+14*86400000).toISOString().slice(0,10),shade:'A2',comment:''},toast:''};
const chatId = localStorage.getItem('create-dental-chat-id') || Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join('');
localStorage.setItem('create-dental-chat-id', chatId);
const demoUnitPrices = {'Коронка E.max':12500,'Винир':14000,'Мост':9000,'Абатмент':7600,'Вкладка':8500};
const orderEstimate = () => (demoUnitPrices[state.form.construction] || 12500) * Math.max(1, Number(state.form.quantity) || 1);
const rubles = amount => new Intl.NumberFormat('ru-RU').format(amount) + ' ₽';
const statusClass = s => s==='В работе'?'green':s==='Завершен'?'green':s==='Новый'?'blue':'orange';
const badge = s => `<span class="badge ${statusClass(s)}">${s}</span>`;
const button = (label,action,kind='primary',extra='') => `<button class="btn ${kind}" data-action="${action}" ${extra}>${label}</button>`;
function sidebar(){return `<aside class="sidebar" id="sidebar"><div class="brand" aria-label="Create Dental"><img src="${assets}create-dental-logo.png" alt="Create Dental"></div><nav class="sidebar-nav">${nav.map(([id,label,ico])=>`<button class="nav-link ${state.page===id||(state.page==='detail'&&id==='orders')?'active':''}" data-page="${id}">${icon(ico,20)}<span>${label}</span></button>`).join('')}</nav><button class="help-box" data-page="messages">${icon('message',20)}<span><strong>Нужна помощь?</strong><small>Напишите нам</small></span></button></aside>`}
function header(){return `<header class="topbar"><button class="mobile-menu" data-action="menu" aria-label="Открыть меню">☰</button><div class="topbar-spacer"></div><button class="role-toggle" data-auth-logout>Выйти</button><span class="topbar-label">Клиника</span><select class="clinic-select" aria-label="Клиника"><option>${escapeHtml(clinicRecord()?.name||'Клиника')}</option></select><button class="bell" aria-label="Уведомления" data-action="notifications">${icon('bell',19)}<i></i></button><button class="profile" data-page="clinic"><span class="avatar">К</span><span><strong>${escapeHtml(clinicRecord()?.contact||clinicRecord()?.name||'Клиника')}</strong><small>Стоматологическая клиника</small></span>${icon('chevron',13)}</button></header>`}
function shell(content){$('#app').innerHTML=`${sidebar()}<div class="shell">${header()}<main class="content">${content}</main></div><div class="toast ${state.toast?'visible':''}">${escapeHtml(state.toast)}</div>`;}
function title(text,sub='',right=''){return `<div class="page-title"><div><h1>${text}</h1>${sub?`<p>${sub}</p>`:''}</div>${right}</div>`}
function tabs(items,selected,action='filter'){return `<div class="tabs">${items.map(([label,count])=>`<button class="tab ${selected===label?'active':''}" data-action="${action}" data-value="${label}">${label}${count!==undefined?` <span class="count">${count}</span>`:''}</button>`).join('')}</div>`}
function orderTable(list){return `<div class="table-wrap"><table class="orders-table"><thead><tr><th>№</th><th>Пациент</th><th>Тип работы</th><th>Срок</th><th>Статус</th><th>Сумма</th><th></th></tr></thead><tbody>${list.map(o=>`<tr data-order="${o.id}" tabindex="0"><td><div class="order-id"><img src="${assets+o.image}" alt="">${o.id}</div></td><td>${escapeHtml(o.patient)}</td><td>${escapeHtml(o.work)}</td><td>${escapeHtml(o.date)}</td><td>${badge(escapeHtml(o.status))}</td><td><strong>${escapeHtml(o.sum)}</strong></td><td class="arrow">→</td></tr>`).join('')||'<tr><td colspan="7" class="empty">Заказы не найдены</td></tr>'}</tbody></table></div>`}
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
    cells.push(`<button class="calendar-day ${state.calendarDay===day?'selected':''}" data-action="calendar-day" data-value="${day}" aria-label="${day} ${monthName}, заказов: ${statuses.length}"><span>${day}</span><i class="calendar-markers">${[...new Set(statuses)].slice(0,3).map(status=>`<b class="${status}"></b>`).join('')}</i></button>`);
  }
  const today=new Date();today.setHours(0,0,0,0);
  const upcoming=currentOrders().filter(order=>orderDate(order)>=today&&order.status!=='Завершен').sort((a,b)=>orderDate(a)-orderDate(b)).slice(0,3);
  return `<section class="dashboard-card deadline-card"><h2>Календарь сроков</h2><div class="calendar-head"><strong>${label}</strong><div><button data-action="calendar-prev" aria-label="Предыдущий месяц">‹</button><button data-action="calendar-next" aria-label="Следующий месяц">›</button></div></div><div class="calendar-grid">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(day=>`<span class="calendar-weekday">${day}</span>`).join('')}${cells.join('')}</div><div class="dashboard-card-heading"><h3>Ближайшие сдачи</h3><button data-page="orders">Все →</button></div><div class="upcoming-list">${upcoming.length?upcoming.map(order=>`<button class="upcoming-order" data-order="${order.id}"><img src="${assets+order.image}" alt=""><i class="deadline-status ${statusClass(order.status)}"></i><span><strong>${order.id}</strong><small>${order.patient}</small></span><time>${order.date.slice(0,5)}</time></button>`).join(''):'<p class="dashboard-empty">В этом месяце сдач нет</p>'}</div></section>`;
}
function recentMessagesMarkup(){
  const recent=state.messages.slice(-3).reverse();
  return recent.length?recent.map(message=>`<button class="recent-message" data-page="messages"><span class="recent-avatar ${message.from==='support'?'support':''}">${message.from==='support'?'CD':'Я'}</span><span><strong>${message.from==='support'?'Поддержка Create Dental':'Вы'}</strong><small>${escapeHtml(message.text)}</small></span><time>${new Date(message.time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></button>`).join(''):'<div class="dashboard-empty">Сообщений пока нет. <button data-page="messages">Написать в поддержку →</button></div>';
}
function recentMessagesCard(){return `<section class="dashboard-card recent-card"><div class="dashboard-card-heading"><h2>Последние сообщения</h2><button data-page="messages">Все →</button></div><div id="recent-messages">${recentMessagesMarkup()}</div></section>`}
function currentOrders(){
  let overrides={};
  try {overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}} catch {overrides={}}
  const status={"Ожидает распределения":"Новый","Подготовка":"В работе","Моделирование":"В работе","Изготовление":"В работе","Контроль качества":"На согласовании","Готово к выдаче":"Завершен"};
  return orders.map(order=>({...order,status:status[overrides[order.id]?.stage]||order.status}));
}
function orderTabs(){
  const list=currentOrders();
  return [['Все',list.length],['Новые',list.filter(o=>o.status==='Новый').length],['В работе',list.filter(o=>o.status==='В работе').length],['На согласовании',list.filter(o=>['На согласовании','Согласование'].includes(o.status)).length],['Завершенные',list.filter(o=>o.status==='Завершен').length]];
}
function dashboard(){
  const list=currentOrders();
  const stats=[['orders',list.filter(o=>o.status!=='Завершен').length,'Активных заказов','blue'],['clock',list.filter(o=>['На согласовании','Согласование'].includes(o.status)).length,'На согласовании','orange'],['user',list.filter(o=>o.status==='В работе').length,'В работе','navy'],['heart',list.filter(o=>o.status==='Завершен').length,'Завершено','green']];
  shell(`${title('Добро пожаловать, '+escapeHtml(clinicRecord()?.name||'клиника')+'!','Создавайте заказы, отслеживайте статус и получайте готовые работы в срок.',button(`${icon('plus',16)} Создать новый заказ`,'new'))}<div class="stats">${stats.map(([ico,n,label,color])=>`<div class="stat card"><span class="stat-icon ${color}">${icon(ico,25)}</span><div><strong>${n}</strong><span>${label}</span></div></div>`).join('')}</div><div class="dashboard-grid"><div class="dashboard-main"><section class="hero"><div><h2>Качество в каждой детали</h2><p>Современные технологии. Надежные сроки.<br>Индивидуальный подход.</p></div><img src="${assets}banner-teeth.png" alt="Керамические зубные конструкции"></section><div class="section-heading"><h2>Мои заказы</h2><button class="text-link" data-page="orders">Все заказы →</button></div>${tabs(orderTabs(),state.filter)}${orderTable(filteredOrders().slice(0,4))}</div><aside class="dashboard-aside">${deadlineCalendar()}${recentMessagesCard()}</aside></div>`);
}
function filteredOrders(){let list=currentOrders();if(state.filter==='Новые')list=list.filter(o=>o.status==='Новый');else if(state.filter==='В работе')list=list.filter(o=>o.status==='В работе');else if(state.filter==='На согласовании')list=list.filter(o=>['На согласовании','Согласование'].includes(o.status));else if(state.filter==='Завершенные')list=list.filter(o=>o.status==='Завершен');if(state.query)list=list.filter(o=>Object.values(o).some(v=>String(v).toLowerCase().includes(state.query.toLowerCase())));return list}
function ordersPage(){shell(`${title('Мои заказы')}${tabs(orderTabs(),state.filter)}<div class="toolbar"><label class="search">${icon('search',17)}<input id="order-search" value="${escapeHtml(state.query)}" placeholder="Поиск по номеру заказа, пациенту или типу работы..."></label>${button(`${icon('filter',15)} Фильтры`,'filters','outline')}</div>${orderTable(filteredOrders())}`)}
function toothChart(interactive=true, selectedTeeth=state.selectedTeeth){
  const teeth=[
    [18,105,383,-87],[17,105,325,-83],[16,107,267,-75],[15,120,213,-65],
    [14,143,163,-48],[13,175,120,-33],[12,216,87,-18],[11,265,70,-5],
    [21,335,70,5],[22,384,87,18],[23,425,120,33],[24,457,163,48],
    [25,480,213,65],[26,493,267,75],[27,495,325,83],[28,495,383,87],
    [48,105,468,87],[47,105,527,83],[46,116,582,75],[45,140,635,61],
    [44,176,682,45],[43,217,716,29],[42,253,740,15],[41,282,752,4],
    [31,318,752,-4],[32,347,740,-15],[33,383,716,-29],[34,424,682,-45],
    [35,460,635,-61],[36,484,582,-75],[37,495,527,-83],[38,495,468,-87]
  ];
  const outlines={
    incisor:'M-29-29 Q-18-34 0-31 Q18-34 29-29 L25 20 Q13 30 0 29 Q-13 30-25 20 Z',
    canine:'M-24-19 Q-12-27-4-28 L0-36 L5-28 Q17-27 24-19 L21 19 Q0 31-21 19 Z',
    premolar:'M-26-22 Q-16-32-4-27 Q10-33 26-22 Q31-8 26 7 Q27 22 12 27 Q0 30-12 27 Q-27 22-26 7 Q-31-8-26-22 Z',
    molar:'M-28-28 Q-17-36-4-29 Q9-37 26-29 Q36-19 29-4 Q36 10 27 27 Q13 33 0 27 Q-14 34-28 25 Q-37 11-29-4 Q-36-19-28-28 Z'
  };
  const grooves={
    incisor:'M-19-17 Q-10-8-6 7 M18-17 Q9-9 6 7 M-12 20 Q0 12 12 20',
    canine:'M-12-9 Q0-20 12-9 M0-20 Q-5 0 0 17 M-8 15 Q0 7 8 15',
    premolar:'M-16-13 Q-5-2 0 0 Q5-2 16-13 M-16 14 Q-4 5 0 0 Q4 5 16 14 M0-9 L0 11',
    molar:'M-19-17 Q-7-8 0 0 Q8-9 19-17 M-19 17 Q-8 8 0 0 Q8 9 19 17 M0-20 Q-5-8 0 0 Q5 9 0 20'
  };
  return `<div class="tooth-chart"><svg viewBox="0 0 600 800" role="img" aria-label="Схема зубов верхней и нижней челюсти">
    ${teeth.map(([n,x,y,angle])=>{
      const last=n%10;
      const kind=last<=2?'incisor':last===3?'canine':last<=5?'premolar':'molar';
      const scale=last<=2?(n>=40||n>=30&&n<40?0.68:0.9):last===3?0.78:last<=5?0.87:last===8?0.93:1.02;
      const rotation=(n>=30?180:0)+angle;
      const selected=selectedTeeth.includes(n);
      return `<g class="tooth tooth-${kind} ${selected?'selected':''}" ${interactive?`data-tooth="${n}" role="button" tabindex="0" aria-label="Зуб ${n}" aria-pressed="${selected}"`:''} transform="translate(${x} ${y})">
        <g class="crown" transform="rotate(${rotation}) scale(${scale})">
          <path class="tooth-outline" d="${outlines[kind]}"/>
          <path class="tooth-detail" d="${grooves[kind]}"/>
        </g>
        <text text-anchor="middle" dominant-baseline="middle">${n}</text>
      </g>`;
    }).join('')}</svg></div>`;
}
function stepper(){return `<div class="stepper">${steps.map((s,i)=>`<button class="step ${state.step===i?'active':''} ${state.step>i?'done':''}" data-step="${i}"><b>${state.step>i?icon('check',13):i+1}</b>${s}</button>${i<4?'<span class="step-line">→</span>':''}`).join('')}</div>`}
function field(label,control){return `<label class="field"><span>${label}</span>${control}</label>`}
function textInput(value='',placeholder='',key=''){return `<input ${key?`data-field="${key}"`:''} value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`}
function selectInput(options,key=''){return `<select ${key?`data-field="${key}"`:''}>${options.map(o=>`<option ${state.form[key]===o?'selected':''}>${o}</option>`).join('')}</select>`}
function patientStep(){return `<h2>Данные пациента</h2><div class="form-grid">${field('Фамилия пациента',textInput(state.form.surname,'','surname'))}${field('Имя и отчество',textInput(state.form.initials,'','initials'))}${field('Номер телефона',textInput(state.form.phone,'+7 (___) ___-__-__','phone'))}${field('Дата рождения',`<input type="date" data-field="birth" value="${state.form.birth}">`)}</div><div class="info-note">Укажите данные пациента для идентификации заказа. Они будут видны только вашей клинике.</div>`}
function constructionStep(){return `<h2>Выберите конструкцию</h2><div class="form-grid">${field('Тип конструкции',selectInput(['Коронка E.max','Винир','Мост','Абатмент','Вкладка'],'construction'))}${field('Материал',selectInput(['Керамика E.max','Диоксид циркония','Металлокерамика'],'material'))}${field('Количество единиц', `<input type="number" min="1" data-field="quantity" value="${escapeHtml(state.form.quantity)}">`)}${field('Срок изготовления',`<input type="date" data-field="due" value="${state.form.due}">`)}</div><div class="info-note">После выбора конструкции отметьте нужные зубы на схеме.</div>`}
function teethStep(){return `<div class="teeth-layout"><div>${toothChart()}<div class="chart-legend"><span><i class="dot blue"></i> Выбрано</span><span><i class="dot gray"></i> Не выбрано</span></div></div><div class="teeth-options"><h2>Выберите зубы на схеме</h2><div class="segmented">${['Постоянные зубы','Молочные зубы'].map(t=>`<button class="${state.dentition===t?'selected':''}" data-action="dentition" data-value="${t}">${t}</button>`).join('')}</div><h3>Выбранные зубы: ${state.selectedTeeth.join(', ')||'—'}</h3><div class="selected-teeth">${state.selectedTeeth.map(n=>`<button data-tooth="${n}">${n} ×</button>`).join('')}<button class="clear" data-action="clear-teeth">Очистить</button></div><h3>Тип работы</h3><div class="work-options">${['Коронка','Винир','Вкладка','Мост','Имплант. коронка','Абатмент','Съемный протез','Временная конструкция','Другое'].map(w=>`<button class="${state.work===w?'selected':''}" data-action="work" data-value="${w}">${w}</button>`).join('')}</div><div class="estimate-card"><span>Предварительная сумма заказа</span><strong>${rubles(orderEstimate())}</strong><small>${state.form.quantity} ед. · демонстрационный расчёт; итоговая цена уточняется при согласовании</small></div></div></div>`}
function attachmentTiles(){return `<div class="attachment-grid">${[['xray.png','Рентгеновский снимок'],['tooth.png','Фото зуба'],['scan.png','3D модель'],...state.uploaded.map(n=>['file.png',n])].map(([src,name])=>`<div class="attachment"><img src="${assets+src}" alt="${escapeHtml(name)}"><button aria-label="Удалить файл" data-action="remove-file" data-value="${escapeHtml(name)}">×</button></div>`).join('')}<label class="attachment-add" title="Добавить файлы">${icon('plus',26)}<input type="file" id="upload-input" multiple hidden></label></div>`}
function extraStep(){return `<h2>Дополнительная информация</h2><div class="form-grid">${field('Желаемый срок готовности',`<input type="date" data-field="due" value="${state.form.due}">`)}${field('Цвет/оттенок (например, Vita)',selectInput(['A2','A1','A3','B1','B2'],'shade'))}</div><div class="form-grid extra-fields"><div>${field('Прикрепить файлы','<label class="upload-zone">'+icon('upload',26)+'<span>Перетащите файлы сюда<br>или нажмите для выбора</span><input type="file" id="upload-input" multiple hidden></label>')}<small class="hint">Поддерживаются файлы: JPG, PNG, PDF, STL, PLY (до 50 МБ)</small></div>${field('Комментарий к заказу',`<textarea rows="5" data-field="comment" placeholder="Напишите пожелания, особенности, дополнительные инструкции...">${escapeHtml(state.form.comment)}</textarea>`)}</div><h3>Примеры прикрепленных файлов</h3>${attachmentTiles()}`}
function confirmStep(){return `<h2>Проверьте данные заказа</h2><div class="confirmation"><div>${toothChart(false)}</div><div class="summary-list">${[['Пациент',`${state.form.surname} ${state.form.initials}`],['Выбранные зубы',state.selectedTeeth.join(', ')],['Тип работы',state.form.construction],['Желаемый срок',state.form.due.split('-').reverse().join('.')],['Предварительная сумма',rubles(orderEstimate())],['Цвет',state.form.shade],['Комментарий',state.form.comment||'—'],['Файлы',`${3+state.uploaded.length} файла`]].map(([k,v])=>`<div><span>${k}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}${attachmentTiles()}</div></div>`}
function newOrder(){const body=[patientStep,constructionStep,teethStep,extraStep,confirmStep][state.step]();shell(`${title(state.step===3?'Новый заказ — дополнительные параметры':state.step===4?'Новый заказ — подтверждение':'Новый заказ')}${stepper()}<section class="wizard">${body}<div class="wizard-actions">${state.step>0?button('Назад','previous','outline'):''}${button(state.step===4?'Создать заказ':'Далее →','next')}</div></section>`)}
function detail(){
  const o=currentOrders().find(item=>item.id===state.orderId);
  if(!o){state.page='orders';ordersPage();return}
  let overrides={};try{overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}}catch{}
  const details={...seedDetails[o.id],...overrides[o.id]};
  const teeth=Array.isArray(o.teeth)?o.teeth:details.teeth||[];
  const facts=[['Пациент',o.patient],['Выбранные зубы',teeth.join(', ')||'—'],['Тип работы',o.work],['Желаемый срок',o.date],['Сумма заказа',o.sum],['Цвет',o.shade||'—'],['Комментарий',o.comment||'—'],['Исполнитель',details.assignee||'Не назначен']];
  const created=o.createdAt?new Date(o.createdAt).toLocaleDateString('ru-RU'):'—';
  shell(`<button class="back-link" data-page="orders">← &nbsp; Назад к заказам</button><div class="detail-heading">${title(`Заказ ${escapeHtml(o.id)}`,badge(escapeHtml(o.status))+` <span class="muted">Создан ${created}</span>`,button(`${icon('message',16)} Сообщение`,'open-messages','outline'))}</div>${tabs([['Обзор'],['Файлы'],['Комментарии'],['История']],state.detailTab,'detail-tab')}${state.detailTab==='Обзор'?`<div class="detail-grid"><section><h3>Общая информация</h3><div class="facts">${facts.map(([k,v])=>`<div><span>${k}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div></section><section><h3>Выбранные зубы</h3>${toothChart(false,teeth)}</section><section><h3>Статус заказа</h3><div class="timeline"><div class="complete"><i></i><strong>${escapeHtml(o.status)}</strong><small>${details.stage?escapeHtml(details.stage):''}</small></div></div></section></div>`:state.detailTab==='Файлы'?'<div class="info-note">Файлы заказа пока не загружены на сервер.</div>':state.detailTab==='Комментарии'?'<div class="info-note">Комментарии к заказу пока отсутствуют.</div>':`<div class="info-note">Текущий этап: ${escapeHtml(details.stage||o.status)}.</div>`}`)
}
function filesPage(){const files=[['xray.png','КТ_верхняя.jpg','12.03.2024','КТ/Рентген'],['tooth.png','Фото_16.jpg','12.03.2024','Фото'],['scan.png','Скан_верхняя.stl','10.03.2024','3D модели'],['smile.png','Прикус.jpg','10.03.2024','Фото'],['tooth.png','Фото_26.jpg','06.03.2024','Фото'],['file.png','План_лечения.pdf','08.03.2024','Документы'],['scan.png','Скан_нижняя.stl','05.03.2024','3D модели'],['xray.png','КТ_панорама.jpg','05.03.2024','КТ/Рентген'],['smile.png','Фото_улыбка.jpg','04.03.2024','Фото'],['tooth.png','Другое.jpg','04.03.2024','Фото']];shell(`${title('Файлы','',button(`${icon('plus',16)} Загрузить файл`,'upload'))}${tabs([['Все файлы'],['КТ/Рентген'],['Фото'],['3D модели'],['Документы']],state.fileTab,'file-tab')}<div class="file-grid">${files.filter(f=>state.fileTab==='Все файлы'||f[3]===state.fileTab).map(([src,name,date])=>`<button class="file-card" data-action="file-preview" data-value="${name}"><img src="${assets+src}" alt=""><strong>${name}</strong><small>${date}</small></button>`).join('')}</div><input type="file" id="page-upload" multiple hidden>`)}
function chatMessageMarkup(message){return `<div class="bubble ${message.from==='client'?'me':'them'}"><p>${escapeHtml(message.text)}</p><time>${new Date(message.time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></div>`}
function messagesPage(){shell(`${title('Сообщения')}<div class="messages-layout"><div class="contacts"><button class="contact active"><span class="contact-avatar">CD</span><span><strong>Поддержка Create Dental</strong><small>Ваш диалог со службой поддержки</small></span></button></div><div class="conversation"><div class="conversation-head"><span class="contact-avatar">CD</span><span><strong>Поддержка Create Dental</strong><small id="chat-status">${escapeHtml(state.chatStatus)}</small></span></div><div class="chat-bubbles" id="chat-bubbles">${state.messages.length?state.messages.map(chatMessageMarkup).join(''):'<p class="chat-empty">Напишите сообщение, и оператор увидит его в своей панели.</p>'}</div><form id="chat-form" class="chat-compose"><input id="chat-input" maxlength="2000" placeholder="Напишите сообщение..." value="${escapeHtml(state.chatText)}" autocomplete="off"><button class="send-btn" aria-label="Отправить сообщение">➤</button></form></div></div>`)}
async function loadMessages(){
  if(state.role!=='clinic') return;
  if(state.page!=='messages'&&state.page!=='home') return;
  try{
    const response=await fetch('/api/chat?conversation='+chatId,{cache:'no-store'});
    if(!response.ok) throw new Error('Чат временно недоступен');
    const data=await response.json();
    state.chatStatus='Сообщения доставляются онлайн';
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
function clinicPage(){
  const clinic=clinicRecord()||{name:'Клиника',inn:'',address:'Москва',phone:'',email:''};
  const input=(name,value)=>`<input name="${name}" value="${escapeHtml(value||'')}">`;
  shell(`${title('Моя клиника')}${tabs([['Основная информация'],['Контактные лица'],['Настройки'],['Безопасность']],state.clinicTab,'clinic-tab')}<div class="clinic-content"><div class="clinic-photo"><img src="${assets}clinic.png" alt="Здание клиники"><button data-action="change-logo">Изменить логотип</button></div><form id="clinic-form" class="clinic-form"><div class="form-grid">${field('Название клиники',input('name',clinic.name))}${field('ИНН',input('inn',clinic.inn))}${field('Адрес',input('address',clinic.address))}${field('Телефон',input('phone',clinic.phone))}${field('Email',input('email',clinic.email))}<div class="save-field"><button class="btn primary" type="submit">Сохранить изменения</button></div></div></form></div>`);
}
function referencePage(){shell(`${title('Справочник','Информация о конструкциях, материалах и оформлении заказов.')}<div class="reference-grid">${[['Коронки E.max','Эстетичные цельнокерамические реставрации.'],['Виниры','Тонкие накладки для восстановления улыбки.'],['Мостовидные протезы','Конструкции для замещения отсутствующих зубов.'],['3D сканирование','Цифровые слепки для точной работы.']].map(([h,p])=>`<article class="reference-card">${icon('book',25)}<h3>${h}</h3><p>${p}</p></article>`).join('')}</div>`)}
const technicianCabinet=createTechnicianCabinet({root:()=>$('#app'),orders,assets,icon,toothChart,isActive:()=>state.role==='technician'});
const workerCabinet=createWorkerCabinet({root:()=>$('#app'),orders,assets,icon,toothChart,isActive:()=>state.role==='worker',currentUser:()=>portalUser});
let portalReady=false;
let portalUser=null;
let authMode='login';
let portalError='';
function loginView(){
  const modes=[['login','Клиентам'],['register','Регистрация клиники'],['staff','Техникам'],['chief','Главному технику']];
  const field=(label,name,type='text')=>`<label>${label}<input name="${name}" type="${type}" ${name==='password'?'minlength="10"':''} required></label>`;
  const contents={
    login:`${field('Email','email','email')}${field('Пароль','password','password')}<button class="btn primary">Войти в кабинет клиники</button>`,
    register:`${field('Название клиники','name')}${field('Email','email','email')}${field('Пароль от 10 символов','password','password')}<button class="btn primary">Зарегистрировать клинику</button>`,
    staff:`${field('Рабочий email','email','email')}${field('Пароль','password','password')}<button class="btn primary">Войти как техник</button>`,
    chief:`${field('Ключ главного техника','key','password')}<button class="btn primary">Войти в панель</button>`
  };
  $('#app').innerHTML=`<main class="portal-login"><section><img src="${assets}create-dental-logo.png" alt="Create Dental"><h1>Личный кабинет Create Dental</h1><p>Заказы, производство и связь с лабораторией.</p><div class="auth-tabs">${modes.map(([mode,label])=>`<button type="button" data-auth-mode="${mode}" class="${authMode===mode?'active':''}">${label}</button>`).join('')}</div><form id="portal-login-form" data-mode="${authMode}">${contents[authMode]}</form>${portalError?`<p class="portal-login-error">${escapeHtml(portalError)}</p>`:''}</section></main>`;
}
function render(){if(!portalReady){loginView();return}state.role=portalUser.role;if(state.role==='technician'){technicianCabinet.render();return}if(state.role==='worker'){workerCabinet.render();return}const page=state.page;({home:dashboard,new:newOrder,orders:ordersPage,detail,files:filesPage,messages:messagesPage,clinic:clinicPage,reference:referencePage}[page]||dashboard)();if(page==='messages'||page==='home')queueMicrotask(loadMessages)}
async function hydratePortal(){
  const data=await loadPortal();
  portalUser=data.user;
  orders.splice(0,orders.length,...data.orders);
  localStorage.setItem('create-dental-tech-orders',JSON.stringify(data.orderOverrides));
  localStorage.setItem('create-dental-tech-clients',JSON.stringify(data.clients));
  localStorage.setItem('create-dental-employees',JSON.stringify(data.employees));
  portalReady=true;
  portalError='';
  render();
}
async function createOrder(){
  const id=`CD-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;
  const order={id,patient:`${state.form.surname} ${state.form.initials}`.trim(),work:state.form.construction,date:state.form.due.split('-').reverse().join('.'),status:'Новый',sum:rubles(orderEstimate()),image:'tooth.png',clinicId:portalUser.subjectId,clinic:clinicRecord()?.name||'Клиника',teeth:[...state.selectedTeeth],shade:state.form.shade,comment:state.form.comment,createdAt:new Date().toISOString()};
  try {
    await savePortal('orders',[order,...orders]);
    orders.unshift(order);
    state.page='detail';state.orderId=id;
    notify('Заказ создан и доступен лаборатории');
  } catch(error){notify('Не удалось создать заказ: '+error.message)}
}
function notify(message){state.toast=message;render();clearTimeout(notify.timer);notify.timer=setTimeout(()=>{state.toast='';$('.toast')?.classList.remove('visible')},3000)}
document.addEventListener('click',event=>{const button=event.target.closest('[data-auth-mode]');if(!button)return;authMode=button.dataset.authMode;portalError='';loginView()});
 document.addEventListener('click',async event=>{if(!event.target.closest('[data-auth-logout]'))return;try{await authRequest('logout',{})}catch{}clearPortalToken();portalReady=false;portalUser=null;state.role='clinic';history.replaceState(null,'',location.pathname);render()});
document.addEventListener('click',event=>{const el=event.target.closest('[data-page],[data-order],[data-tooth],[data-step],[data-action]');if(!el)return;if(el.dataset.page){state.page=el.dataset.page;if(state.page==='new')state.step=0;render();return}if(el.dataset.order){state.orderId=el.dataset.order;state.page='detail';render();return}if(el.dataset.tooth){const n=Number(el.dataset.tooth);state.selectedTeeth=state.selectedTeeth.includes(n)?state.selectedTeeth.filter(x=>x!==n):[...state.selectedTeeth,n].sort((a,b)=>a-b);render();return}if(el.dataset.step!==undefined){state.step=Number(el.dataset.step);render();return}const a=el.dataset.action,v=el.dataset.value;if(a==='new'){state.page='new';state.step=0}else if(a==='next'){if(state.step<4)state.step++;else{createOrder();return}}else if(a==='previous')state.step--;else if(a==='filter')state.filter=v;else if(a==='file-tab')state.fileTab=v;else if(a==='detail-tab')state.detailTab=v;else if(a==='clinic-tab')state.clinicTab=v;else if(a==='dentition')state.dentition=v;else if(a==='work')state.work=v;else if(a==='clear-teeth')state.selectedTeeth=[];else if(a==='open-messages')state.page='messages';else if(a==='upload'){$('#page-upload')?.click();return}else if(a==='remove-file'){state.uploaded=state.uploaded.filter(n=>n!==v)}else if(a==='menu'){$('#sidebar').classList.toggle('open');return}else if(a==='save-clinic'){notify('Изменения сохранены локально');return}else if(a==='file-preview'){notify(v);return}else if(a==='notifications'){notify('Новых уведомлений нет');return}else if(a==='filters'){notify('Используйте вкладки для фильтрации заказов');return}else if(a==='more'){notify('Дополнительные действия появятся после подключения сервера');return}else if(a==='change-logo'){notify('Загрузка логотипа появится после подключения сервера');return}else if(a==='attach'){notify('Прикрепление файлов доступно в разделе «Файлы»');return}else if(a==='contact'){notify('Демонстрационный диалог');return}else return;render()});
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
document.addEventListener('input',event=>{if(event.target.dataset.field)state.form[event.target.dataset.field]=event.target.value;if(event.target.id==='order-search'){state.query=event.target.value;const table=$('.table-wrap');if(table)table.outerHTML=orderTable(filteredOrders());}if(event.target.id==='chat-input')state.chatText=event.target.value});
document.addEventListener('change',event=>{if(event.target.dataset.field)state.form[event.target.dataset.field]=event.target.value;if(event.target.type==='file'){state.uploaded.push(...Array.from(event.target.files).map(f=>f.name));notify(`${event.target.files.length} файл(ов) добавлено локально`)}});
document.addEventListener('submit',event=>{if(event.target.id!=='clinic-form')return;event.preventDefault();let clients=[];try{clients=JSON.parse(localStorage.getItem('create-dental-tech-clients')||'[]')}catch{}const clinic=clients.find(client=>client.id===portalUser?.subjectId);if(!clinic)return notify('Клиника не найдена');for(const key of ['name','inn','address','phone','email'])clinic[key]=event.target.elements.namedItem(key).value.trim();if(!clinic.name)return notify('Укажите название клиники');localStorage.setItem('create-dental-tech-clients',JSON.stringify(clients));savePortal('clients',clients).then(()=>notify('Данные клиники сохранены')).catch(error=>notify('Не удалось сохранить клинику на сервере: '+error.message))});
document.addEventListener('submit',async event=>{if(event.target.id==='chat-form'){event.preventDefault();const msg=state.chatText.trim();if(!msg)return;const send=event.target.querySelector('.send-btn');send.disabled=true;try{const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversation:chatId,text:msg})});if(!response.ok)throw new Error('Не удалось отправить сообщение');state.chatText='';$('#chat-input').value='';await loadMessages()}catch(error){state.chatStatus=error.message;$('#chat-status').textContent=state.chatStatus}finally{send.disabled=false}}});
document.addEventListener('submit',async event=>{
  if(event.target.id!=='portal-login-form')return;
  event.preventDefault();
  const form=event.target;
  const body=Object.fromEntries(new FormData(form));
  const action=form.dataset.mode==='register'?'register':form.dataset.mode==='chief'?'chief':'login';
  try{const response=await authRequest(action,body);if(form.dataset.mode==='staff'&&response.user.role!=='worker'||form.dataset.mode==='login'&&response.user.role!=='clinic')throw new Error('Для этой учётной записи выберите другой вход');await hydratePortal()}
  catch(error){clearPortalToken();portalError=error.message;render()}
});
setInterval(loadMessages,3000);
render();
if(portalToken())hydratePortal().catch(error=>{clearPortalToken();portalError=error.message;render()});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&portalReady&&!document.querySelector('input:focus,textarea:focus,select:focus')){
    hydratePortal().catch(error=>{portalError=error.message;notify('Не удалось обновить данные: '+error.message)});
  }
});
