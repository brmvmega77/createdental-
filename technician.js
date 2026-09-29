const technicians = ['Анна Смирнова', 'Дмитрий Орлов', 'Мария Ким', 'Илья Федоров'];
export const seedEmployees = technicians.map((name,index)=>({
  id:`tech-${index+1}`,originalName:name,name,
  specialty:['Керамика и эстетика','CAD/CAM моделирование','Ортопедические конструкции','Имплантология'][index],
  phone:['+7 (999) 110-20-30','+7 (999) 210-30-40','+7 (999) 310-40-50','+7 (999) 410-50-60'][index],
  email:['anna@create-dental.example','dmitry@create-dental.example','maria@create-dental.example','ilya@create-dental.example'][index],
  status:'active'
}));
export function loadEmployees(){
  try {
    const saved=JSON.parse(localStorage.getItem('create-dental-employees')||'null');
    if(Array.isArray(saved))return saved.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string');
  } catch { /* Use demo team when local data is invalid. */ }
  return seedEmployees.map(item=>({...item}));
}
const clinics = ['Dental Clinic', 'Smile Studio', 'White Line', 'Nova Dent'];
const seedClients = [
  {id:'clinic-1',originalName:'Dental Clinic',name:'Dental Clinic',contact:'Иван Иванов',phone:'+7 (495) 123-45-67',email:'info@dentalclinic.ru',address:'Москва'},
  {id:'clinic-2',originalName:'Smile Studio',name:'Smile Studio',contact:'Елена Морозова',phone:'+7 (495) 234-56-78',email:'hello@smilestudio.ru',address:'Москва'},
  {id:'clinic-3',originalName:'White Line',name:'White Line',contact:'Андрей Козлов',phone:'+7 (812) 345-67-89',email:'office@whiteline.ru',address:'Санкт-Петербург'},
  {id:'clinic-4',originalName:'Nova Dent',name:'Nova Dent',contact:'Мария Сергеева',phone:'+7 (495) 456-78-90',email:'team@novadent.ru',address:'Москва'}
];
export const stages = ['Ожидает распределения', 'Подготовка', 'Моделирование', 'Изготовление', 'Контроль качества', 'Готово к выдаче'];
const monthLabels = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const analyticsYear = new Date().getFullYear();
export const seedDetails = {
  'CD-1042': {stage:'Изготовление',assignee:'Анна Смирнова',priority:'Высокий',teeth:[16,26],clinic:'Dental Clinic'},
  'CD-1041': {stage:'Контроль качества',assignee:'Дмитрий Орлов',priority:'Средний',teeth:[14,15,16],clinic:'Smile Studio'},
  'CD-1040': {stage:'Ожидает распределения',assignee:'',priority:'Высокий',teeth:[24],clinic:'White Line'},
  'CD-1039': {stage:'Готово к выдаче',assignee:'Мария Ким',priority:'Обычный',teeth:[11,12,21,22,23,24],clinic:'Nova Dent'},
  'CD-1038': {stage:'Моделирование',assignee:'Мария Ким',priority:'Средний',teeth:[36,37],clinic:'Dental Clinic'},
  'CD-1037': {stage:'Контроль качества',assignee:'Анна Смирнова',priority:'Обычный',teeth:[44],clinic:'Smile Studio'},
  'CD-1036': {stage:'Подготовка',assignee:'Илья Федоров',priority:'Средний',teeth:[13],clinic:'White Line'},
  'CD-1035': {stage:'Ожидает распределения',assignee:'',priority:'Высокий',teeth:[34,35,36,37],clinic:'Nova Dent'}
};

const analyticsRecords = [];
for (let month=0; month<12; month++) {
  clinics.forEach((clinic, clientIndex) => {
    const count=2+((month+clientIndex*2)%4);
    for(let number=0; number<count; number++) {
      analyticsRecords.push({
        month, clinic,
        technician:technicians[(month+clientIndex+number)%technicians.length],
        amount:7600+clientIndex*2100+((month*3+number*2+clientIndex)%6)*1800
      });
    }
  });
}

const money = amount => new Intl.NumberFormat('ru-RU').format(amount) + ' ₽';
const safe = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const parseDate = value => {const [day,month,year]=value.split('.').map(Number);return new Date(year,month-1,day)};
const stageTone = stage => stage==='Ожидает распределения'?'new':stage==='Контроль качества'?'review':stage==='Готово к выдаче'?'ready':'work';

export function createTechnicianCabinet({root,orders,assets,icon,toothChart,isActive}) {
  let overrides={};
  try { overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders') || '{}') || {}; } catch { overrides={}; }
  let team=loadEmployees();
  let clients=seedClients.map(client=>({...client}));
  try {
    const saved=JSON.parse(localStorage.getItem('create-dental-tech-clients') || 'null');
    if(Array.isArray(saved))clients=saved.filter(client=>client&&typeof client.id==='string'&&typeof client.name==='string');
  } catch { /* Keep the demo directory if local data is damaged. */ }
  const requestedPage=new URLSearchParams(location.search).get('page');
  const requestedOrder=new URLSearchParams(location.search).get('order');
  const initialPage=new URLSearchParams(location.search).get('role')==='technician'&&['overview','orders','detail','clients','analytics','team','quality','profile'].includes(requestedPage)?requestedPage:'overview';
  const state={page:initialPage,filter:'Все',search:'',orderId:orders.some(order=>order.id===requestedOrder)?requestedOrder:'CD-1042',month:new Date().getMonth(),technician:'Все техники',metric:'revenue',sort:'revenue',clientSearch:'',editClientId:null,confirmDeleteId:null,employeeSearch:'',employeeFilter:'all',editEmployeeId:null,confirmFireId:null,toast:''};
  function setPage(page){
    state.page=page;
    const url=new URL(location.href);
    url.searchParams.set('page',page);
    if(page==='detail')url.searchParams.set('order',state.orderId);
    else url.searchParams.delete('order');
    history.replaceState(null,'',url);
    render();
  }
  function saveClients(){localStorage.setItem('create-dental-tech-clients',JSON.stringify(clients))}
  function clientName(original){return clients.find(client=>client.originalName===original)?.name||original}
  function saveTeam(){localStorage.setItem('create-dental-employees',JSON.stringify(team))}
  function employeeName(original){return team.find(employee=>employee.originalName===original)?.name||original}
  function activeTeam(){return team.filter(employee=>employee.status==='active')}

  function allOrders(){
    return orders.map(order => {
      const details={stage:'Ожидает распределения',assignee:'',priority:'Обычный',teeth:[],clinic:'Dental Clinic',...seedDetails[order.id],...overrides[order.id]};
      return {...order,...details,clinic:clientName(details.clinic),assigneeKey:details.assignee,assignee:employeeName(details.assignee)};
    });
  }
  function orderById(id){return allOrders().find(order=>order.id===id)}
  function saveOrder(id,change){
    const current=orderById(id);
    if(!current)return;
    overrides[id]={...(overrides[id]||{}),...change};
    localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
    render();
  }
  function toast(message){
    state.toast=message;
    render();
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>{state.toast='';root().querySelector('.toast')?.classList.remove('visible')},3200);
  }
  function filteredRecords(month=state.month){
    return analyticsRecords.filter(record=>record.month===month&&(state.technician==='Все техники'||employeeName(record.technician)===state.technician)).map(record=>({...record,clinic:clientName(record.clinic),technician:employeeName(record.technician)}));
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
  function monthName(month){return new Intl.DateTimeFormat('ru-RU',{month:'long'}).format(new Date(analyticsYear,month,1))}
  function filters(){
    return `<div class="tech-filters"><label>Месяц<select data-tech-month-select>${monthLabels.map((label,index)=>`<option value="${index}" ${state.month===index?'selected':''}>${monthName(index)} ${analyticsYear}</option>`).join('')}</select></label><label>Исполнитель<select data-tech-technician><option>Все техники</option>${team.map(employee=>`<option ${state.technician===employee.name?'selected':''}>${safe(employee.name)}</option>`).join('')}</select></label><span class="tech-demo-note">Демонстрационные данные</span></div>`;
  }
  function kpis(){
    const current=filteredRecords();
    const previous=state.month>0?filteredRecords(state.month-1):[];
    const revenue=current.reduce((sum,row)=>sum+row.amount,0);
    const previousRevenue=previous.reduce((sum,row)=>sum+row.amount,0);
    const change=previousRevenue?Math.round((revenue/previousRevenue-1)*100):null;
    const clients=new Set(current.map(row=>row.clinic)).size;
    return `<div class="tech-kpis">
      <article><span>Выручка за месяц</span><strong>${money(revenue)}</strong><small class="${change!==null&&change>=0?'positive':'negative'}">${change===null?'Первый месяц':(change>=0?'+':'')+change+'% к прошлому месяцу'}</small></article>
      <article><span>Заказов</span><strong>${current.length}</strong><small>За ${monthName(state.month)} ${analyticsYear}</small></article>
      <article><span>Средний чек</span><strong>${money(current.length?Math.round(revenue/current.length):0)}</strong><small>Выручка / количество заказов</small></article>
      <article><span>Активных клиник</span><strong>${clients}</strong><small>С заказами в этом месяце</small></article>
    </div>`;
  }
  function chart(){
    const months=monthLabels.map((label,index)=>{
      const rows=filteredRecords(index);
      return {label,index,value:state.metric==='revenue'?rows.reduce((sum,row)=>sum+row.amount,0):rows.length};
    });
    const maximum=Math.max(1,...months.map(month=>month.value));
    return `<section class="tech-panel tech-chart"><div class="tech-panel-heading"><div><h2>Динамика по месяцам</h2><p>${state.metric==='revenue'?'Выручка':'Количество заказов'} · ${analyticsYear} год</p></div><div class="tech-segment"><button data-tech-metric="revenue" class="${state.metric==='revenue'?'active':''}">Выручка</button><button data-tech-metric="orders" class="${state.metric==='orders'?'active':''}">Заказы</button></div></div><div class="tech-bars">${months.map(month=>`<button class="tech-bar ${state.month===month.index?'active':''}" data-tech-month="${month.index}" title="${month.label}: ${state.metric==='revenue'?money(month.value):month.value+' заказов'}"><span class="tech-bar-track"><i style="height:${Math.max(8,Math.round(month.value/maximum*100))}%"></i></span><small>${month.label}</small></button>`).join('')}</div></section>`;
  }
  function breakdown(type,limit=0){
    const rows=groupRows(filteredRecords(),type);
    const visible=limit?rows.slice(0,limit):rows;
    const title=type==='clinic'?'Клиенты по выручке':'Результат техников';
    return `<section class="tech-panel"><div class="tech-panel-heading"><div><h2>${title}</h2><p>${monthName(state.month)} ${analyticsYear}</p></div>${type==='clinic'?`<div class="tech-segment"><button data-tech-sort="revenue" class="${state.sort==='revenue'?'active':''}">По выручке</button><button data-tech-sort="orders" class="${state.sort==='orders'?'active':''}">По заказам</button></div>`:''}</div><div class="tech-breakdown">${visible.map((row,index)=>`<div class="tech-breakdown-row"><span class="tech-rank">${index+1}</span><span class="tech-breakdown-name">${safe(row.name)}<small>${row.orders} заказов</small></span><strong>${money(row.revenue)}</strong></div>`).join('')||'<div class="tech-empty">За этот период данных нет</div>'}</div></section>`;
  }
  function attentionOrders(){
    const list=allOrders().filter(order=>order.stage==='Ожидает распределения'||order.stage==='Контроль качества').slice(0,4);
    return `<section class="tech-panel"><div class="tech-panel-heading"><div><h2>Требует внимания</h2><p>Новые заказы и контроль качества</p></div><button class="tech-link" data-tech-page="orders">Все заказы →</button></div><div class="tech-attention">${list.map(order=>`<button data-tech-order="${order.id}"><span class="tech-order-icon">${icon('orders',20)}</span><span><strong>${order.id} · ${safe(order.work)}</strong><small>${safe(order.clinic)} · срок ${order.date}</small></span><em class="tech-stage ${stageTone(order.stage)}">${order.stage}</em></button>`).join('')||'<p class="tech-empty">Все заказы распределены и проверены</p>'}</div></section>`;
  }
  function teamSnapshot(){
    const open=allOrders().filter(order=>order.stage!=='Готово к выдаче');
    return `<section class="tech-panel"><div class="tech-panel-heading"><div><h2>Загрузка команды</h2><p>Текущие работы</p></div><button class="tech-link" data-tech-page="team">Команда →</button></div><div class="tech-team-snapshot">${activeTeam().map(employee=>`<div><span class="tech-mini-avatar">${safe(employee.name.split(' ').map(part=>part[0]).join(''))}</span><span>${safe(employee.name)}</span><strong>${open.filter(order=>order.assigneeKey===employee.originalName).length}</strong></div>`).join('')||'<p class="tech-empty">Активных техников пока нет</p>'}</div></section>`;
  }
  function overview(){
    const list=allOrders();
    const newCount=list.filter(order=>order.stage==='Ожидает распределения').length;
    const qaCount=list.filter(order=>order.stage==='Контроль качества').length;
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ЛАБОРАТОРИЯ · ГЛАВНЫЙ ТЕХНИК</span><h1>Обзор лаборатории</h1><p>Финансовые результаты и производство в одном месте.</p></div><div class="tech-task-count"><strong>${newCount+qaCount}</strong><span>требуют решения</span></div></div>${filters()}${kpis()}<div class="tech-analytics-grid">${chart()}${breakdown('clinic',4)}</div><div class="tech-work-grid">${attentionOrders()}${teamSnapshot()}</div>`;
  }
  function orderRows(list){
    return list.map(order=>`<tr data-tech-order="${order.id}" tabindex="0" class="tech-order-row"><td><strong>${order.id}</strong><small>${safe(order.clinic)}</small></td><td>${safe(order.work)}<small>${safe(order.patient)}</small></td><td>${order.date}</td><td><span class="tech-stage ${stageTone(order.stage)}">${order.stage}</span></td><td>${safe(order.assignee||'Не назначен')}</td><td><button class="tech-link" data-tech-order="${order.id}">Открыть →</button></td></tr>`).join('')||'<tr><td colspan="6" class="tech-empty">Заказов не найдено</td></tr>';
  }
  function ordersPage(){
    const list=allOrders().filter(order=>{
      if(state.filter==='Новые'&&order.stage!=='Ожидает распределения')return false;
      if(state.filter==='В работе'&&['Ожидает распределения','Контроль качества','Готово к выдаче'].includes(order.stage))return false;
      if(state.filter==='На проверке'&&order.stage!=='Контроль качества')return false;
      if(state.filter==='Готово'&&order.stage!=='Готово к выдаче')return false;
      return !state.search||[order.id,order.work,order.patient,order.clinic,order.assignee].some(value=>String(value).toLowerCase().includes(state.search.toLowerCase()));
    });
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОИЗВОДСТВО</span><h1>Заказы лаборатории</h1><p>Принимайте работы, назначайте исполнителей и отслеживайте этапы.</p></div></div><div class="tech-panel"><div class="tech-order-tools"><div class="tech-segment">${['Все','Новые','В работе','На проверке','Готово'].map(label=>`<button data-tech-filter="${label}" class="${state.filter===label?'active':''}">${label}</button>`).join('')}</div><input id="tech-search" placeholder="Поиск по заказу, клинике или технику..." value="${safe(state.search)}"></div><div class="tech-table-wrap"><table class="tech-table"><thead><tr><th>Заказ / клиника</th><th>Работа / пациент</th><th>Срок</th><th>Этап</th><th>Исполнитель</th><th></th></tr></thead><tbody>${orderRows(list)}</tbody></table></div></div>`;
  }
  function assignmentOptions(order){
    const active=activeTeam();
    const current=team.find(employee=>employee.originalName===order.assigneeKey);
    const unavailable=order.assigneeKey&&!active.some(employee=>employee.originalName===order.assigneeKey)
      ?`<option value="${safe(order.assigneeKey)}" selected disabled>${safe(current?.name||order.assigneeKey)} · недоступен</option>`:'';
    return unavailable+active.map(employee=>`<option value="${safe(employee.originalName)}" ${order.assigneeKey===employee.originalName?'selected':''}>${safe(employee.name)}</option>`).join('');
  }
  function orderDetail(){
    const order=orderById(state.orderId);
    if(!order)return ordersPage();
    const stageIndex=stages.indexOf(order.stage);
    return `<button class="tech-back" data-tech-page="orders">← Все заказы</button><div class="tech-heading"><div><span class="tech-eyebrow">${safe(order.clinic)} · ${order.date}</span><h1>Заказ ${order.id}</h1><p>${safe(order.work)} · ${safe(order.patient)}</p></div><span class="tech-stage ${stageTone(order.stage)}">${order.stage}</span></div><div class="tech-detail-grid"><section class="tech-panel"><h2>Данные заказа</h2><div class="tech-facts"><div><span>Клиника</span><strong>${safe(order.clinic)}</strong></div><div><span>Пациент</span><strong>${safe(order.patient)}</strong></div><div><span>Конструкция</span><strong>${safe(order.work)}</strong></div><div><span>Срок</span><strong>${order.date}</strong></div><div><span>Приоритет</span><strong>${order.priority}</strong></div><div><span>Сумма</span><strong>${safe(order.sum)}</strong></div></div><div class="tech-detail-teeth"><h3>Зубы: ${order.teeth.join(', ')||'не указаны'}</h3>${toothChart(false,order.teeth)}</div></section><section class="tech-panel"><h2>Управление работой</h2><label class="tech-assign">Исполнитель<select data-tech-assign="${order.id}"><option value="">Не назначен</option>${assignmentOptions(order)}</select></label><h3>Этапы производства</h3><ol class="tech-timeline">${stages.map((stage,index)=>`<li class="${index<stageIndex?'done':index===stageIndex?'current':''}"><i></i><span>${stage}</span></li>`).join('')}</ol><div class="tech-detail-actions">${order.stage==='Ожидает распределения'?'<p>Назначьте техника, чтобы принять заказ в работу.</p>':order.stage==='Контроль качества'?`<button class="btn primary" data-tech-action="approve" data-id="${order.id}">Принять качество</button><button class="btn outline" data-tech-action="rework" data-id="${order.id}">Вернуть на доработку</button>`:order.stage==='Готово к выдаче'?'<p>Работа прошла проверку и готова к выдаче.</p>':`<button class="btn primary" data-tech-action="advance" data-id="${order.id}">Перевести на следующий этап</button>`}</div></section></div>`;
  }
  function analyticsPage(){
    return `<div class="tech-heading"><div><span class="tech-eyebrow">АНАЛИТИКА</span><h1>Финансовые результаты</h1><p>Сравнивайте месяцы, клиники и исполнителей.</p></div></div>${filters()}${kpis()}${chart()}<div class="tech-analytics-grid tech-breakdown-grid">${breakdown('clinic')}${breakdown('technician')}</div>`;
  }
  function clientForm(){
    if(!state.editClientId)return '';
    const client=state.editClientId==='new'?{name:'',contact:'',phone:'',email:'',address:''}:clients.find(item=>item.id===state.editClientId);
    if(!client)return '';
    const field=(label,name,type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${safe(client[name]||'')}" ${required?'required':''}></label>`;
    return `<section class="tech-panel tech-client-editor"><div class="tech-panel-heading"><div><h2>${state.editClientId==='new'?'Новый клиент':'Редактировать клиента'}</h2><p>Данные клиники для справочника</p></div><button class="tech-client-close" data-tech-client-action="cancel" aria-label="Закрыть">×</button></div><form id="tech-client-form" class="tech-client-form">${field('Название клиники','name','text',true)}${field('Контактное лицо','contact')}${field('Телефон','phone','tel')}${field('Электронная почта','email','email')}${field('Город или адрес','address')}<div class="tech-client-form-actions"><button type="button" class="btn outline" data-tech-client-action="cancel">Отмена</button><button type="submit" class="btn primary">Сохранить</button></div></form></section>`;
  }
  function clientsPage(){
    const active=clients.filter(client=>!client.deleted);
    const q=state.clientSearch.trim().toLowerCase();
    const visible=active.filter(client=>[client.name,client.contact,client.phone,client.email,client.address].some(value=>String(value||'').toLowerCase().includes(q)));
    return `<div class="tech-heading"><div><span class="tech-eyebrow">СПРАВОЧНИК</span><h1>Клиенты</h1><p>Контакты клиник и результаты сотрудничества.</p></div><button class="btn primary" data-tech-client-action="new">+ Добавить клиента</button></div><div class="tech-client-layout"><section class="tech-panel"><div class="tech-client-toolbar"><div><h2>Клиники <span>${active.length}</span></h2><p>Финансовые показатели демонстрационные · ${analyticsYear} год</p></div><input id="tech-client-search" type="search" placeholder="Поиск по клинике или контакту" value="${safe(state.clientSearch)}" aria-label="Поиск клиентов"></div><div class="tech-table-wrap"><table class="tech-table tech-client-table"><thead><tr><th>Клиника</th><th>Контакт</th><th>Заказов</th><th>Выручка</th><th>Действия</th></tr></thead><tbody>${visible.map(client=>{const records=analyticsRecords.filter(record=>record.clinic===client.originalName);const total=records.reduce((sum,record)=>sum+record.amount,0);return `<tr><td><strong>${safe(client.name)}</strong><small>${safe(client.address||'Адрес не указан')}</small></td><td>${safe(client.contact||'Не указано')}<small>${safe(client.phone||client.email||'Контакт не указан')}</small></td><td>${records.length}</td><td><strong>${money(total)}</strong></td><td><div class="tech-client-actions"><button data-tech-client-action="edit" data-client-id="${safe(client.id)}">Изменить</button><button class="danger" data-tech-client-action="delete" data-client-id="${safe(client.id)}">Удалить</button></div></td></tr>`}).join('')||'<tr><td colspan="5" class="tech-empty">Клиентов не найдено</td></tr>'}</tbody></table></div></section>${clientForm()}</div>${state.confirmDeleteId?`<div class="tech-dialog-backdrop"><section class="tech-dialog" role="dialog" aria-modal="true" aria-labelledby="tech-delete-title"><h2 id="tech-delete-title">Удалить клиента из списка?</h2><p>${safe(clients.find(client=>client.id===state.confirmDeleteId)?.name||'Клиент')} исчезнет из справочника. История заказов и финансовые результаты сохранятся.</p><div><button class="btn outline" data-tech-client-action="cancel-delete">Отмена</button><button class="btn danger" data-tech-client-action="confirm-delete" data-client-id="${safe(state.confirmDeleteId)}">Удалить</button></div></section></div>`:''}`;
  }
  function employeeForm(){
    if(!state.editEmployeeId)return '';
    const employee=state.editEmployeeId==='new'?{name:'',specialty:'',phone:'',email:''}:team.find(item=>item.id===state.editEmployeeId);
    if(!employee)return '';
    const field=(label,name,type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${safe(employee[name]||'')}" ${required?'required':''}></label>`;
    return `<section class="tech-panel tech-client-editor"><div class="tech-panel-heading"><div><h2>${state.editEmployeeId==='new'?'Новый техник':'Редактировать техника'}</h2><p>Данные сотрудника лаборатории</p></div><button class="tech-client-close" data-tech-employee-action="cancel" aria-label="Закрыть">×</button></div><form id="tech-employee-form" class="tech-client-form">${field('Имя и фамилия','name','text',true)}${field('Специализация','specialty','text',true)}${field('Телефон','phone','tel')}${field('Электронная почта','email','email')}<div class="tech-client-form-actions"><button type="button" class="btn outline" data-tech-employee-action="cancel">Отмена</button><button type="submit" class="btn primary">Сохранить</button></div></form></section>`;
  }
  function teamPage(){
    const open=allOrders().filter(order=>order.stage!=='Готово к выдаче');
    const query=state.employeeSearch.trim().toLowerCase();
    const visible=team.filter(employee=>(state.employeeFilter==='all'||employee.status===state.employeeFilter)&&[employee.name,employee.specialty,employee.phone,employee.email].some(value=>String(value||'').toLowerCase().includes(query)));
    const statusText={active:'Активен',disabled:'Отключен',fired:'Уволен'};
    return `<div class="tech-heading"><div><span class="tech-eyebrow">КОМАНДА</span><h1>Сотрудники лаборатории</h1><p>Управление составом команды и доступом техников.</p></div><button class="btn primary" data-tech-employee-action="new">+ Добавить техника</button></div><div class="tech-client-layout"><section class="tech-panel"><div class="tech-client-toolbar"><div><h2>Техники <span>${team.length}</span></h2><p>Активных: ${activeTeam().length} · данные сохраняются в этом браузере</p></div><input id="tech-employee-search" type="search" placeholder="Поиск по имени, специализации или контакту" value="${safe(state.employeeSearch)}" aria-label="Поиск техников"></div><div class="tech-segment tech-employee-filters">${[['all','Все'],['active','Активные'],['disabled','Отключённые'],['fired','Уволенные']].map(([value,label])=>`<button data-tech-employee-filter="${value}" class="${state.employeeFilter===value?'active':''}">${label}</button>`).join('')}</div><div class="tech-table-wrap"><table class="tech-table tech-employee-table"><thead><tr><th>Техник</th><th>Специализация</th><th>Контакты</th><th>В работе</th><th>Статус</th><th>Действия</th></tr></thead><tbody>${visible.map(employee=>`<tr><td><strong>${safe(employee.name)}</strong></td><td>${safe(employee.specialty||'Не указана')}</td><td>${safe(employee.phone||'—')}<small>${safe(employee.email||'')}</small></td><td>${open.filter(order=>order.assigneeKey===employee.originalName).length}</td><td><span class="tech-employee-status ${employee.status}">${statusText[employee.status]||'Неизвестно'}</span></td><td><div class="tech-client-actions"><button data-tech-employee-action="edit" data-employee-id="${safe(employee.id)}">Изменить</button>${employee.status==='active'?`<button data-tech-employee-action="disable" data-employee-id="${safe(employee.id)}">Отключить</button>`:employee.status==='disabled'?`<button data-tech-employee-action="enable" data-employee-id="${safe(employee.id)}">Включить</button>`:''}${employee.status!=='fired'?`<button class="danger" data-tech-employee-action="fire" data-employee-id="${safe(employee.id)}">Уволить</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="6" class="tech-empty">Техников не найдено</td></tr>'}</tbody></table></div></section>${employeeForm()}</div>${state.confirmFireId?`<div class="tech-dialog-backdrop"><section class="tech-dialog" role="dialog" aria-modal="true" aria-labelledby="tech-fire-title"><h2 id="tech-fire-title">Уволить техника?</h2><p>${safe(team.find(employee=>employee.id===state.confirmFireId)?.name||'Сотрудник')} потеряет доступ к демонстрационному кабинету. Незавершённые заказы перейдут в очередь на распределение; история выручки сохранится.</p><div><button class="btn outline" data-tech-employee-action="cancel-fire">Отмена</button><button class="btn danger" data-tech-employee-action="confirm-fire" data-employee-id="${safe(state.confirmFireId)}">Уволить</button></div></section></div>`:''}`;
  }
  function qualityPage(){
    const list=allOrders().filter(order=>order.stage==='Контроль качества');
    return `<div class="tech-heading"><div><span class="tech-eyebrow">КОНТРОЛЬ КАЧЕСТВА</span><h1>Работы на проверке</h1><p>Проверьте результат перед выдачей клинике.</p></div><div class="tech-task-count"><strong>${list.length}</strong><span>ждут решения</span></div></div><div class="tech-quality-list">${list.map(order=>`<article class="tech-panel tech-quality-item"><div><span class="tech-eyebrow">${safe(order.clinic)} · ${order.date}</span><h2>${order.id} · ${safe(order.work)}</h2><p>${safe(order.patient)} · исполнитель: ${safe(order.assignee)}</p></div><div><button class="btn outline" data-tech-order="${order.id}">Подробнее</button><button class="btn outline" data-tech-action="rework" data-id="${order.id}">На доработку</button><button class="btn primary" data-tech-action="approve" data-id="${order.id}">Принять</button></div></article>`).join('')||'<div class="tech-panel tech-empty">Сейчас нет работ на проверке</div>'}</div>`;
  }
  function profilePage(){
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОФИЛЬ</span><h1>Главный техник</h1><p>Доступ к работе лаборатории и её результатам.</p></div></div><div class="tech-panel tech-profile"><span class="tech-person-avatar">АП</span><div><h2>Александр Петров</h2><p>Роль: главный техник</p><p>Доступ: распределение заказов, управление этапами, контроль качества и аналитика.</p><small>Это демонстрационный кабинет. Для реальных сотрудников потребуется авторизация и подключение данных лаборатории.</small></div></div>`;
  }
  function shell(content){
    const nav=[['overview','Обзор','home'],['orders','Заказы','orders'],['clients','Клиенты','clinic'],['analytics','Аналитика','filter'],['team','Команда','user'],['quality','Контроль качества','check'],['profile','Профиль','user']];
    root().innerHTML=`<aside class="sidebar tech-sidebar" id="tech-sidebar"><div class="brand"><img src="${assets}create-dental-logo.png" alt="Create Dental"></div><div class="tech-side-label">Кабинет главного техника</div><nav class="sidebar-nav">${nav.map(([page,label,ico])=>`<button class="nav-link ${state.page===page||state.page==='detail'&&page==='orders'?'active':''}" data-tech-page="${page}">${icon(ico,20)}<span>${label}</span></button>`).join('')}</nav><button class="tech-switch" data-role="clinic">← Кабинет клиники</button></aside><div class="shell tech-shell"><header class="topbar"><button class="mobile-menu" data-tech-action="menu" aria-label="Открыть меню">☰</button><div class="topbar-spacer"></div><button class="role-toggle" data-role="worker">Кабинет техника →</button><button class="role-toggle" data-role="clinic">Кабинет клиники →</button><button class="profile" data-tech-page="profile"><span class="avatar">АП</span><span><strong>Александр Петров</strong><small>Главный техник</small></span>${icon('chevron',13)}</button></header><main class="content tech-content">${content}</main></div><div class="toast ${state.toast?'visible':''}">${safe(state.toast)}</div>`;
  }
  function render(){
    try {overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}} catch {overrides={}}
    team=loadEmployees();
    const pages={overview,orders:ordersPage,detail:orderDetail,clients:clientsPage,analytics:analyticsPage,team:teamPage,quality:qualityPage,profile:profilePage};
    shell((pages[state.page]||overview)());
  }
  document.addEventListener('click',event=>{
    if(!isActive())return;
    const employeeAction=event.target.closest('[data-tech-employee-action]');
    if(employeeAction){
      const action=employeeAction.dataset.techEmployeeAction;
      const id=employeeAction.dataset.employeeId;
      const employee=team.find(item=>item.id===id);
      if(action==='new')state.editEmployeeId='new';
      else if(action==='edit'&&employee)state.editEmployeeId=id;
      else if(action==='cancel')state.editEmployeeId=null;
      else if(action==='disable'&&employee&&employee.status==='active'){employee.status='disabled';saveTeam()}
      else if(action==='enable'&&employee&&employee.status==='disabled'){employee.status='active';saveTeam()}
      else if(action==='fire'&&employee&&employee.status!=='fired')state.confirmFireId=id;
      else if(action==='cancel-fire')state.confirmFireId=null;
      else if(action==='confirm-fire'&&employee&&employee.status!=='fired'){
        for(const order of allOrders().filter(order=>order.assigneeKey===employee.originalName&&order.stage!=='Готово к выдаче')){
          overrides[order.id]={...(overrides[order.id]||{}),assignee:'',stage:'Ожидает распределения'};
        }
        localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
        employee.status='fired';
        saveTeam();
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
      if(action==='new')state.editClientId='new';
      else if(action==='edit')state.editClientId=id;
      else if(action==='cancel')state.editClientId=null;
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
    const action=event.target.closest('[data-tech-action]');
    if(action){
      const id=action.dataset.id;
      const order=id&&orderById(id);
      if(action.dataset.techAction==='menu'){root().querySelector('#tech-sidebar')?.classList.toggle('open');return}
      if(!order)return;
      if(action.dataset.techAction==='advance'){
        if(!activeTeam().some(employee=>employee.originalName===order.assigneeKey))return toast('Назначьте активного исполнителя');
        const next=stages[stages.indexOf(order.stage)+1];
        if(next)saveOrder(id,{stage:next});
      }
      if(action.dataset.techAction==='approve'&&order.stage==='Контроль качества')saveOrder(id,{stage:'Готово к выдаче'});
      if(action.dataset.techAction==='rework'&&order.stage==='Контроль качества')saveOrder(id,{stage:'Изготовление'});
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
    const page=event.target.closest('[data-tech-page]');
    if(page){setPage(page.dataset.techPage);return}
    const order=event.target.closest('[data-tech-order]');
    if(order){state.orderId=order.dataset.techOrder;setPage('detail')}
  });
  document.addEventListener('keydown',event=>{
    if(!isActive())return;
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('tr[data-tech-order]')){event.preventDefault();event.target.click()}
  });
  document.addEventListener('change',event=>{
    if(!isActive())return;
    if(event.target.matches('[data-tech-month-select]')){state.month=Number(event.target.value);render()}
    if(event.target.matches('[data-tech-technician]')){state.technician=event.target.value;render()}
    if(event.target.matches('[data-tech-assign]')){
      const id=event.target.dataset.techAssign;
      const name=event.target.value;
      if(name&&!activeTeam().some(employee=>employee.originalName===name))return;
      const current=orderById(id);
      if(!current)return;
      saveOrder(id,{assignee:name,stage:name&&current.stage==='Ожидает распределения'?'Подготовка':current.stage});
    }
  });
  document.addEventListener('submit',event=>{
    if(!isActive()||event.target.id!=='tech-employee-form')return;
    event.preventDefault();
    const form=event.target;
    const values={};
    for(const name of ['name','specialty','phone','email'])values[name]=form.elements.namedItem(name).value.trim();
    if(!values.name||!values.specialty)return toast('Укажите имя и специализацию');
    if(team.some(employee=>employee.name.toLowerCase()===values.name.toLowerCase()&&employee.id!==state.editEmployeeId))return toast('Техник с таким именем уже есть');
    if(state.editEmployeeId==='new')team.push({id:`tech-custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,originalName:values.name,...values,status:'active'});
    else {
      const employee=team.find(item=>item.id===state.editEmployeeId);
      if(!employee)return;
      Object.assign(employee,values);
    }
    saveTeam();
    state.editEmployeeId=null;
    state.technician='Все техники';
    toast('Данные техника сохранены локально');
  });
  document.addEventListener('submit',event=>{
    if(!isActive()||event.target.id!=='tech-client-form')return;
    event.preventDefault();
    const form=event.target;
    const values={};
    for(const name of ['name','contact','phone','email','address'])values[name]=form.elements.namedItem(name).value.trim();
    if(!values.name)return toast('Укажите название клиники');
    const duplicate=clients.some(client=>client.name.toLowerCase()===values.name.toLowerCase()&&client.id!==state.editClientId);
    if(duplicate)return toast('Клиент с таким названием уже есть');
    if(state.editClientId==='new')clients.push({id:`client-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,originalName:values.name,...values});
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
  return {render};
}
