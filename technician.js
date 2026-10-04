import {savePortal,authRequest,portalToken} from './portal-client.js';
import {routeFromPath,pathFor,navigate} from './routes.js';

export const seedEmployees = [];
export function loadEmployees(){
  try {
    const saved=JSON.parse(localStorage.getItem('create-dental-employees')||'null');
    if(Array.isArray(saved))return saved.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string');
  } catch { /* Use demo team when local data is invalid. */ }
  return seedEmployees.map(item=>({...item}));
}
export const seedClients = [];
export const stages = ['Ожидает распределения', 'Подготовка', 'Моделирование', 'Изготовление', 'Контроль качества', 'Работа принята', 'В доставке', 'Принято доктором'];
const monthLabels = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const analyticsYear = new Date().getFullYear();
export const seedDetails = {};

const money = amount => new Intl.NumberFormat('ru-RU').format(amount) + ' ₽';
const safe = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const parseDate = value => {const [day,month,year]=value.split('.').map(Number);return new Date(year,month-1,day)};
const stageTone = stage => stage==='Ожидает распределения'?'new':stage==='Контроль качества'?'review':['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(stage)?'ready':'work';
const initials = value => String(value||'ГТ').trim().split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase()||'ГТ';
const shortDate = value => value ? new Date(value).toLocaleDateString('ru-RU') : '—';

export function createTechnicianCabinet({root,orders,assets,logo,icon,toothChart,isActive,currentUser,onUserUpdate=()=>{}}) {
  let overrides={};
  try { overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders') || '{}') || {}; } catch { overrides={}; }
  let team=loadEmployees();
  let clients=seedClients.map(client=>({...client}));
  try {
    const saved=JSON.parse(localStorage.getItem('create-dental-tech-clients') || 'null');
    if(Array.isArray(saved))clients=saved.filter(client=>client&&typeof client.id==='string'&&typeof client.name==='string');
  } catch { /* Keep the demo directory if local data is damaged. */ }
  const initialRoute=routeFromPath(location.pathname);
  const state={page:initialRoute.role==='technician'?initialRoute.page:'overview',filter:'Все',search:'',orderId:initialRoute.orderId||'',month:new Date().getMonth(),technician:'Все техники',metric:'revenue',sort:'revenue',orderSortKey:'createdAt',orderSortDirection:'desc',orderFilterOpen:false,orderClinicFilters:[],orderMonthFilter:'',clientSearch:'',editClientId:null,confirmDeleteId:null,employeeSearch:'',employeeFilter:'all',editEmployeeId:null,confirmFireId:null,conversations:[],activeConversation:null,conversationMessages:[],messagesError:'',profile:null,editOrderId:null,confirmOrderDeleteId:null,toast:''};
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
  }
  function saveClients(){localStorage.setItem('create-dental-tech-clients',JSON.stringify(clients));savePortal('clients',clients).catch(error=>toast('Не удалось сохранить клиентов на сервере: '+error.message))}
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
      const details={stage:'Ожидает распределения',assignee:'',priority:'Обычный',teeth:order.teeth||[],clinic:order.clinic||'Dental Clinic',...seedDetails[order.id],...overrides[order.id]};
      return {...order,...details,clinic:clientName(details.clinic),assigneeKey:details.assignee,assignee:employeeName(details.assignee)};
    });
  }
  function orderById(id){return allOrders().find(order=>order.id===id)}
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
    try{await savePortal('orders',next);toast('Заказ сохранён');render()}catch(error){toast('Не удалось сохранить заказ: '+error.message)}
  }
  async function deleteOrderRecord(id){
    const next=orders.filter(order=>order.id!==id);
    if(next.length===orders.length)return toast('Заказ не найден');
    const nextOverrides={...overrides};delete nextOverrides[id];
    orders.splice(0,orders.length,...next);
    overrides=nextOverrides;
    localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
    try{await savePortal('orders',next);await savePortal('orderOverrides',nextOverrides);state.page='orders';state.orderId='';toast('Заказ удалён');render()}catch(error){toast('Не удалось удалить заказ: '+error.message)}
  }
  function toast(message){
    state.toast=message;
    render();
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>{state.toast='';root().querySelector('.toast')?.classList.remove('visible')},3200);
  }
  function analyticsRecords(){
    return allOrders().map(order=>{
      const completed=order.stage==='Принято доктором';
      const date=order.completedAt?new Date(order.completedAt):parseDate(order.date);
      return {year:date.getFullYear(),month:date.getMonth(),clinic:order.clinic,technician:order.assignee,amount:completed?Number(String(order.sum).replace(/[^0-9]/g,'')):0};
    });
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
    return `<div class="tech-filters"><label>Месяц<select data-tech-month-select>${monthLabels.map((label,index)=>`<option value="${index}" ${state.month===index?'selected':''}>${monthName(index)} ${analyticsYear}</option>`).join('')}</select></label><label>Исполнитель<select data-tech-technician><option>Все техники</option>${team.map(employee=>`<option ${state.technician===employee.name?'selected':''}>${safe(employee.name)}</option>`).join('')}</select></label><span class="tech-demo-note">По сохранённым заказам · выручка после статуса «Принято доктором»</span></div>`;
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
    const list=allOrders().filter(order=>order.stage==='Ожидает распределения'||order.stage==='Контроль качества').slice(0,4);
    return `<section class="tech-panel"><div class="tech-panel-heading"><div><h2>Требует внимания</h2><p>Новые заказы и контроль качества</p></div><button class="tech-link" data-tech-page="orders">Все заказы →</button></div><div class="tech-attention">${list.map(order=>`<button data-tech-order="${order.id}"><span class="tech-order-icon">${icon('orders',20)}</span><span><strong>${order.id} · ${safe(order.work)}</strong><small>${safe(order.clinic)} · срок ${order.date}</small></span><em class="tech-stage ${stageTone(order.stage)}">${order.stage}</em></button>`).join('')||'<p class="tech-empty">Все заказы распределены и проверены</p>'}</div></section>`;
  }
  function teamSnapshot(){
    const open=allOrders().filter(order=>!['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage));
    return `<section class="tech-panel"><div class="tech-panel-heading"><div><h2>Загрузка команды</h2><p>Текущие работы</p></div><button class="tech-link" data-tech-page="team">Команда →</button></div><div class="tech-team-snapshot">${activeTeam().map(employee=>`<div><span class="tech-mini-avatar">${safe(employee.name.split(' ').map(part=>part[0]).join(''))}</span><span>${safe(employee.name)}</span><strong>${open.filter(order=>order.assigneeKey===employee.originalName).length}</strong></div>`).join('')||'<p class="tech-empty">Активных техников пока нет</p>'}</div></section>`;
  }
  function overview(){
    const list=allOrders();
    const newCount=list.filter(order=>order.stage==='Ожидает распределения').length;
    const qaCount=list.filter(order=>order.stage==='Контроль качества').length;
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ЛАБОРАТОРИЯ · ГЛАВНЫЙ ТЕХНИК</span><h1>Обзор лаборатории</h1></div><div class="tech-task-count"><strong>${newCount+qaCount}</strong><span>требуют решения</span></div></div>${filters()}${kpis()}<div class="tech-analytics-grid">${chart()}${breakdown('clinic',4)}</div><div class="tech-work-grid">${attentionOrders()}${teamSnapshot()}</div>`;
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
      if(key==='clinic'){x=`${a.id} ${a.clinic}`;y=`${b.id} ${b.clinic}`}
      if(key==='work'){x=`${a.work} ${a.patient}`;y=`${b.work} ${b.patient}`}
      if(key==='assignee'){x=a.assignee||'Не назначен';y=b.assignee||'Не назначен'}
      return String(x).localeCompare(String(y),'ru',{numeric:true})*sign;
    });
  }
  function orderRows(list){
    return sortedOrderRows(list).map(order=>`<tr data-tech-order="${order.id}" tabindex="0" class="tech-order-row"><td><strong>${order.id}</strong><small>${safe(order.clinic)}</small></td><td>${shortDate(order.createdAt)}</td><td>${safe(order.work)}<small>${safe(order.patient)}</small></td><td>${order.date}</td><td><span class="tech-stage ${stageTone(order.stage)}">${order.stage}</span></td><td>${safe(order.assignee||'Не назначен')}</td><td><div class="tech-order-actions"><button class="tech-link" data-tech-order="${order.id}">Открыть →</button><button type="button" class="tech-icon-btn" data-tech-order-action="edit" data-id="${order.id}" aria-label="Редактировать заказ ${order.id}">✎</button><button type="button" class="tech-icon-btn danger" data-tech-order-action="delete" data-id="${order.id}" aria-label="Удалить заказ ${order.id}">×</button></div></td></tr>`).join('')||'<tr><td colspan="7" class="tech-empty">Заказов не найдено</td></tr>';
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
    const activeCount=state.orderClinicFilters.length+(state.orderMonthFilter?1:0);
    const button=`<button type="button" class="btn outline tech-filter-button ${activeCount?'active':''}" data-tech-filter-panel="toggle">Фильтр${activeCount?` · ${activeCount}`:''}</button>`;
    if(!state.orderFilterOpen)return button;
    return `${button}<div class="tech-order-filter-panel"><div><strong>Клиника</strong><div class="tech-filter-checks">${clinics.map(clinic=>`<label><input type="checkbox" data-tech-order-clinic="${safe(clinic)}" ${state.orderClinicFilters.includes(clinic)?'checked':''}>${safe(clinic)}</label>`).join('')||'<p class="tech-empty">Клиник пока нет</p>'}</div></div><div><strong>Месяц заказа</strong><select data-tech-order-month-filter><option value="">Все месяцы</option>${months.map(month=>`<option value="${month}" ${state.orderMonthFilter===month?'selected':''}>${orderMonthLabel(month)}</option>`).join('')}</select></div><div class="tech-order-filter-actions"><button type="button" class="btn outline" data-tech-filter-panel="reset">Сбросить</button><button type="button" class="btn primary" data-tech-filter-panel="close">Готово</button></div></div>`;
  }

  function orderEditModal(){
    if(!state.editOrderId)return '';
    const order=orderById(state.editOrderId);
    if(!order)return '';
    return `<div class="tech-dialog-backdrop" data-tech-modal="order-edit"><section class="tech-dialog tech-order-modal" role="dialog" aria-modal="true" aria-labelledby="tech-order-edit-title"><button class="tech-dialog-close" data-tech-order-action="close-modal" aria-label="Закрыть">×</button><h2 id="tech-order-edit-title">Редактировать заказ ${safe(order.id)}</h2><form id="tech-order-edit-form" class="tech-client-form"><label>Пациент<input name="patient" value="${safe(order.patient)}" required></label><label>Работа<input name="work" value="${safe(order.work)}" required></label><label>Срок<input name="date" value="${safe(order.date)}" required placeholder="дд.мм.гггг"></label><label>Сумма<input name="sum" value="${safe(order.sum)}"></label><label>Зубы через запятую<input name="teeth" value="${safe(order.teeth.join(', '))}"></label><label>Комментарий<textarea name="comment" rows="3">${safe(order.comment||'')}</textarea></label><div class="tech-client-form-actions"><button type="button" class="btn outline" data-tech-order-action="close-modal">Отмена</button><button type="submit" class="btn primary">Сохранить</button></div></form></section></div>`;
  }
  function orderDeleteModal(){
    if(!state.confirmOrderDeleteId)return '';
    const order=orderById(state.confirmOrderDeleteId);
    if(!order)return '';
    return `<div class="tech-dialog-backdrop" data-tech-modal="order-delete"><section class="tech-dialog" role="dialog" aria-modal="true" aria-labelledby="tech-order-delete-title"><button class="tech-dialog-close" data-tech-order-action="close-modal" aria-label="Закрыть">×</button><h2 id="tech-order-delete-title">Удалить заказ?</h2><p>Заказ ${safe(order.id)} будет удалён из списка лаборатории. Данные клиники и остальные заказы не изменятся.</p><div><button class="btn outline" data-tech-order-action="close-modal">Отмена</button><button class="btn danger" data-tech-order-action="confirm-delete" data-id="${safe(order.id)}">Удалить</button></div></section></div>`;
  }
  function ordersPage(){
    const all=allOrders();
    const list=all.filter(order=>{
      if(state.filter==='Новые'&&order.stage!=='Ожидает распределения')return false;
      if(state.filter==='В работе'&&['Ожидает распределения','Контроль качества','Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage))return false;
      if(state.filter==='На проверке'&&order.stage!=='Контроль качества')return false;
      if(state.filter==='Приняты'&&!['Работа принята','Готово к выдаче'].includes(order.stage))return false;
      if(state.filter==='В доставке'&&order.stage!=='В доставке')return false;
      if(state.filter==='Принято доктором'&&order.stage!=='Принято доктором')return false;
      if(state.orderClinicFilters.length&&!state.orderClinicFilters.includes(order.clinic))return false;
      if(state.orderMonthFilter&&orderMonthKey(order)!==state.orderMonthFilter)return false;
      return !state.search||[order.id,order.work,order.patient,order.clinic,order.assignee].some(value=>String(value).toLowerCase().includes(state.search.toLowerCase()));
    });
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОИЗВОДСТВО</span><h1>Заказы лаборатории</h1></div></div><div class="tech-panel"><div class="tech-order-tools"><div class="tech-segment">${['Все','Новые','В работе','На проверке','Приняты','В доставке','Принято доктором'].map(label=>`<button data-tech-filter="${label}" class="${state.filter===label?'active':''}">${label}</button>`).join('')}</div><div class="tech-order-searchbar">${orderFilterPanel(all)}<input id="tech-search" placeholder="Поиск по заказу, клинике или технику..." value="${safe(state.search)}"></div></div><div class="tech-table-wrap"><table class="tech-table"><thead><tr><th>Заказ / клиника</th>${orderSortHeading('createdAt','Создан')}${orderSortHeading('work','Работа / пациент')}${orderSortHeading('date','Срок')}${orderSortHeading('stage','Этап')}${orderSortHeading('assignee','Исполнитель')}<th></th></tr></thead><tbody>${orderRows(list)}</tbody></table></div></div>${orderEditModal()}${orderDeleteModal()}`;
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
    return `<button class="tech-back" data-tech-page="orders">← Все заказы</button><div class="tech-heading"><div><span class="tech-eyebrow">${safe(order.clinic)} · ${order.date}</span><h1>Заказ ${order.id}</h1><p>${safe(order.work)} · ${safe(order.patient)}</p></div><span class="tech-stage ${stageTone(order.stage)}">${order.stage}</span></div><div class="tech-detail-grid"><section class="tech-panel"><h2>Данные заказа</h2><div class="tech-facts"><div><span>Клиника</span><strong>${safe(order.clinic)}</strong></div><div><span>Пациент</span><strong>${safe(order.patient)}</strong></div><div><span>Конструкция</span><strong>${safe(order.work)}</strong></div><div><span>Создан</span><strong>${shortDate(order.createdAt)}</strong></div><div><span>Срок</span><strong>${order.date}</strong></div><div><span>Приоритет</span><strong>${order.priority}</strong></div><div><span>Сумма</span><strong>${safe(order.sum)}</strong></div></div><div class="tech-detail-teeth"><h3>Зубы: ${order.teeth.join(', ')||'не указаны'}</h3>${toothChart(false,order.teeth)}</div></section><section class="tech-panel"><h2>Управление работой</h2><label class="tech-assign">Исполнитель<select data-tech-assign="${order.id}"><option value="">Не назначен</option>${assignmentOptions(order)}</select></label><h3>Этапы производства</h3><ol class="tech-timeline">${stages.map((stage,index)=>`<li class="${index<stageIndex?'done':index===stageIndex?'current':''} ${stage==='Принято доктором'&&index===stageIndex?'final':''}"><i></i><span>${stage}</span></li>`).join('')}</ol><div class="tech-detail-actions">${stageIndex>0?`<button class="btn outline" data-tech-action="rollback" data-id="${order.id}">Вернуть на предыдущий статус</button>`:''}${order.stage==='Ожидает распределения'?'<p class="tech-status-note">Назначьте техника, чтобы принять заказ в работу.</p>':order.stage==='Контроль качества'?`<button class="btn primary" data-tech-action="approve" data-id="${order.id}">Работа принята</button><button class="btn outline" data-tech-action="rework" data-id="${order.id}">Вернуть на доработку</button>`:order.stage==='Принято доктором'?'<p class="tech-status-note">Работа принята доктором.</p>':`<button class="btn primary" data-tech-action="advance" data-id="${order.id}">Перевести на следующий статус</button>`}</div></section></div>`;
  }
  function analyticsPage(){
    return `<div class="tech-heading"><div><span class="tech-eyebrow">АНАЛИТИКА</span><h1>Финансовые результаты</h1><p>Сравнивайте месяцы, клиники и исполнителей.</p></div></div>${filters()}${kpis()}${chart()}<div class="tech-analytics-grid tech-breakdown-grid">${breakdown('clinic')}${breakdown('technician')}</div>`;
  }
  function clientForm(){
    if(!state.editClientId)return '';
    const client=state.editClientId==='new'?{name:'',contact:'',phone:'',email:'',address:''}:clients.find(item=>item.id===state.editClientId);
    if(!client)return '';
    const field=(label,name,type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${safe(client[name]||'')}" ${required?'required':''}></label>`;
    return `<section class="tech-panel tech-client-editor"><div class="tech-panel-heading"><div><h2>${state.editClientId==='new'?'Новый заказчик':'Редактировать заказчика'}</h2><p>Данные клиники для справочника</p></div><button class="tech-client-close" data-tech-client-action="cancel" aria-label="Закрыть">×</button></div><form id="tech-client-form" class="tech-client-form">${field('Название клиники','name','text',true)}${field('Контактное лицо','contact')}${field('Телефон','phone','tel')}${field('Электронная почта','email','email')}${field('Город','city')}${field('Адрес','address')}<div class="tech-client-form-actions"><button type="button" class="btn outline" data-tech-client-action="cancel">Отмена</button><button type="submit" class="btn primary">Сохранить</button></div></form></section>`;
  }
  function clientsPage(){
    const active=clients.filter(client=>!client.deleted);
    const q=state.clientSearch.trim().toLowerCase();
    const visible=active.filter(client=>[client.name,client.contact,client.phone,client.email,client.address].some(value=>String(value||'').toLowerCase().includes(q)));
    return `<div class="tech-heading"><div><span class="tech-eyebrow">СПРАВОЧНИК</span><h1>Заказчики</h1></div><button class="btn primary" data-tech-client-action="new">+ Добавить заказчика</button></div><div class="tech-client-layout"><section class="tech-panel"><div class="tech-client-toolbar"><div><h2>Клиники <span>${active.length}</span></h2><p>По сохранённым заказам · ${analyticsYear} год</p></div><input id="tech-client-search" type="search" placeholder="Поиск по заказчику или контакту" value="${safe(state.clientSearch)}" aria-label="Поиск заказчиков"></div><div class="tech-table-wrap"><table class="tech-table tech-client-table"><thead><tr><th>Клиника</th><th>Контакт</th><th>Заказов</th><th>Доступ</th><th>Действия</th></tr></thead><tbody>${visible.map(client=>{const records=analyticsRecords().filter(record=>record.clinic===client.name);return `<tr><td><strong>${safe(client.name)}</strong><small>${safe(client.address||'Адрес не указан')}</small></td><td>${safe(client.contact||'Не указано')}<small>${safe(client.phone||client.email||'Контакт не указан')}</small></td><td>${records.length}</td><td><span class="tech-employee-status ${client.approved===false?'disabled':'active'}">${client.approved===false?'Ожидает апрув':'Подтверждён'}</span></td><td><div class="tech-client-actions"><button data-tech-client-action="edit" data-client-id="${safe(client.id)}">Изменить</button>${client.approved===false?`<button data-tech-client-action="approve" data-client-id="${safe(client.id)}">Апрув</button>`:''}<button class="danger" data-tech-client-action="delete" data-client-id="${safe(client.id)}">Удалить</button></div></td></tr>`}).join('')||'<tr><td colspan="5" class="tech-empty">Заказчиков не найдено</td></tr>'}</tbody></table></div></section>${clientForm()}</div>${state.confirmDeleteId?`<div class="tech-dialog-backdrop"><section class="tech-dialog" role="dialog" aria-modal="true" aria-labelledby="tech-delete-title"><h2 id="tech-delete-title">Удалить заказчика из списка?</h2><p>${safe(clients.find(client=>client.id===state.confirmDeleteId)?.name||'Заказчик')} исчезнет из справочника. История заказов и финансовые результаты сохранятся.</p><div><button class="btn outline" data-tech-client-action="cancel-delete">Отмена</button><button class="btn danger" data-tech-client-action="confirm-delete" data-client-id="${safe(state.confirmDeleteId)}">Удалить</button></div></section></div>`:''}`;
  }
  function employeeForm(){
    if(!state.editEmployeeId)return '';
    const employee=state.editEmployeeId==='new'?{name:'',specialty:'',phone:'',email:''}:team.find(item=>item.id===state.editEmployeeId);
    if(!employee)return '';
    const field=(label,name,type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${safe(employee[name]||'')}" ${required?'required':''}></label>`;
    return `<section class="tech-panel tech-client-editor"><div class="tech-panel-heading"><div><h2>${state.editEmployeeId==='new'?'Новый техник':'Редактировать техника'}</h2><p>Данные сотрудника лаборатории</p></div><button class="tech-client-close" data-tech-employee-action="cancel" aria-label="Закрыть">×</button></div><form id="tech-employee-form" class="tech-client-form">${field('Имя и фамилия','name','text',true)}${field('Специализация','specialty','text',true)}${field('Телефон','phone','tel')}${field('Электронная почта','email','email',true)}<label>${state.editEmployeeId==='new'?'Пароль для входа':'Новый пароль (если нужно сменить)'}<input name="password" type="password" minlength="10" ${state.editEmployeeId==='new'?'required':''}></label><div class="tech-client-form-actions"><button type="button" class="btn outline" data-tech-employee-action="cancel">Отмена</button><button type="submit" class="btn primary">Сохранить</button></div></form></section>`;
  }
  function teamPage(){
    const open=allOrders().filter(order=>!['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage));
    const query=state.employeeSearch.trim().toLowerCase();
    const visible=team.filter(employee=>(state.employeeFilter==='all'||employee.status===state.employeeFilter)&&[employee.name,employee.specialty,employee.phone,employee.email].some(value=>String(value||'').toLowerCase().includes(query)));
    const statusText={active:'Активен',disabled:'Отключен',fired:'Уволен'};
    return `<div class="tech-heading"><div><span class="tech-eyebrow">КОМАНДА</span><h1>Сотрудники лаборатории</h1></div><button class="btn primary" data-tech-employee-action="new">+ Добавить техника</button></div><div class="tech-client-layout"><section class="tech-panel"><div class="tech-client-toolbar"><div><h2>Техники <span>${team.length}</span></h2><p>Активных: ${activeTeam().length} · данные сохраняются на сервере</p></div><input id="tech-employee-search" type="search" placeholder="Поиск по имени, специализации или контакту" value="${safe(state.employeeSearch)}" aria-label="Поиск техников"></div><div class="tech-segment tech-employee-filters">${[['all','Все'],['active','Активные'],['disabled','Отключённые'],['fired','Уволенные']].map(([value,label])=>`<button data-tech-employee-filter="${value}" class="${state.employeeFilter===value?'active':''}">${label}</button>`).join('')}</div><div class="tech-table-wrap"><table class="tech-table tech-employee-table"><thead><tr><th>Техник</th><th>Специализация</th><th>Контакты</th><th>В работе</th><th>Статус</th><th>Действия</th></tr></thead><tbody>${visible.map(employee=>`<tr><td><strong>${safe(employee.name)}</strong></td><td>${safe(employee.specialty||'Не указана')}</td><td>${safe(employee.phone||'—')}<small>${safe(employee.email||'')}</small></td><td>${open.filter(order=>order.assigneeKey===employee.originalName).length}</td><td><span class="tech-employee-status ${employee.status}">${statusText[employee.status]||'Неизвестно'}</span></td><td><div class="tech-client-actions"><button data-tech-employee-action="edit" data-employee-id="${safe(employee.id)}">Изменить</button>${employee.status==='active'?`<button data-tech-employee-action="disable" data-employee-id="${safe(employee.id)}">Отключить</button>`:employee.status==='disabled'?`<button data-tech-employee-action="enable" data-employee-id="${safe(employee.id)}">Включить</button>`:''}${employee.status!=='fired'?`<button class="danger" data-tech-employee-action="fire" data-employee-id="${safe(employee.id)}">Уволить</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="6" class="tech-empty">Техников не найдено</td></tr>'}</tbody></table></div></section>${employeeForm()}</div>${state.confirmFireId?`<div class="tech-dialog-backdrop"><section class="tech-dialog" role="dialog" aria-modal="true" aria-labelledby="tech-fire-title"><h2 id="tech-fire-title">Уволить техника?</h2><p>${safe(team.find(employee=>employee.id===state.confirmFireId)?.name||'Сотрудник')} исчезнет из списка активных исполнителей. Незавершённые заказы перейдут в очередь на распределение; история выручки сохранится.</p><div><button class="btn outline" data-tech-employee-action="cancel-fire">Отмена</button><button class="btn danger" data-tech-employee-action="confirm-fire" data-employee-id="${safe(state.confirmFireId)}">Уволить</button></div></section></div>`:''}`;
  }
  function qualityPage(){
    const list=allOrders().filter(order=>order.stage==='Контроль качества');
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРИЕМ РАБОТ</span><h1>Прием работ</h1></div><div class="tech-task-count"><strong>${list.length}</strong><span>ждут решения</span></div></div><div class="tech-quality-list">${list.map(order=>`<article class="tech-panel tech-quality-item"><div><span class="tech-eyebrow">${safe(order.clinic)} · ${order.date}</span><h2>${order.id} · ${safe(order.work)}</h2><p>${safe(order.patient)} · исполнитель: ${safe(order.assignee)}</p></div><div><button class="btn outline" data-tech-order="${order.id}">Подробнее</button><button class="btn outline" data-tech-action="rework" data-id="${order.id}">На доработку</button><button class="btn primary" data-tech-action="approve" data-id="${order.id}">Принять</button></div></article>`).join('')||'<div class="tech-panel tech-empty">Сейчас нет работ на приемке</div>'}</div>`;
  }
  function profilePage(){
    const profile=chiefProfile();
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОФИЛЬ</span><h1>Главный техник</h1></div></div><section class="tech-panel tech-profile-editor"><div class="tech-profile-avatar">${avatarMarkup(profile,'large')}<label class="btn outline">Загрузить аватар<input id="tech-profile-avatar" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>${profile.avatar?'<button class="tech-link" data-tech-profile-avatar="remove">Убрать аватар</button>':''}</div><form id="tech-profile-form" class="tech-client-form">${profileField('Имя в кабинете','displayName',profile.displayName||'Главный техник','text',true)}${profileField('Электронная почта','email',profile.email||'','email')}${profileField('Новый пароль','password','','password',false,'Оставьте пустым, если менять не нужно')}${profileField('Повторите пароль','passwordConfirm','','password',false,'')}<div class="tech-client-form-actions"><button type="submit" class="btn primary">Сохранить профиль</button></div></form></section>`;
  }
  function profileField(label,name,value='',type='text',required=false,placeholder=''){return `<label>${label}<input name="${name}" type="${type}" value="${safe(value)}" ${placeholder?`placeholder="${safe(placeholder)}"`:''} ${required?'required':''}></label>`}
  function messageDateLabel(value){
    const date=new Date(value),today=new Date(),yesterday=new Date();yesterday.setDate(today.getDate()-1);
    const key=d=>d.toLocaleDateString('ru-RU');
    if(key(date)===key(today))return 'Сегодня';
    if(key(date)===key(yesterday))return 'Вчера';
    return date.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
  }
  function chiefMessagesMarkup(messages){
    let previous='';
    return messages.map(message=>{
      const day=new Date(message.time).toDateString();
      const divider=day!==previous?`<div class="chat-date-divider">${messageDateLabel(message.time)}</div>`:'';
      previous=day;
      return `${divider}<div class="bubble ${message.from==='support'?'me':'them'}"><p>${safe(message.text)}</p><time>${new Date(message.time).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></div>`;
    }).join('');
  }
  function messagesPage(){
    const active=state.conversations.find(item=>item.id===state.activeConversation);
    return `<div class="tech-heading"><div><span class="tech-eyebrow">КЛИНИКИ</span><h1>Сообщения</h1></div></div><div class="messages-layout chief-messages"><div class="contacts">${state.conversations.map(item=>`<button class="contact ${item.id===state.activeConversation?'active':''}" data-tech-conversation="${safe(item.id)}"><span class="contact-avatar">${safe(item.name.slice(0,2).toUpperCase())}</span><span><strong>${safe(item.name)}</strong><small>${safe(item.lastMessage)}</small></span></button>`).join('')||'<p class="chat-empty">Сообщений от клиник пока нет.</p>'}</div><div class="conversation">${active?`<div class="conversation-head"><span class="contact-avatar">${safe(active.name.slice(0,2).toUpperCase())}</span><span><strong>${safe(active.name)}</strong><small>Клиника</small></span></div><div class="chat-bubbles" id="chief-chat-bubbles">${state.conversationMessages.length?chiefMessagesMarkup(state.conversationMessages):'<p class="chat-empty">Сообщений пока нет.</p>'}</div><form class="chat-compose" id="chief-chat-form"><input name="text" maxlength="2000" placeholder="Напишите ответ..." autocomplete="off" required><button class="send-btn" aria-label="Отправить ответ">➤</button></form>`:'<p class="chat-empty">Выберите клинику слева.</p>'}${state.messagesError?`<p class="chat-error">${safe(state.messagesError)}</p>`:''}</div></div>`;
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
    const nav=[['overview','Обзор','home'],['orders','Заказы','orders'],['intake','Прием работ','check'],['messages','Сообщения','message'],['clients','Заказчики','clinic'],['team','Команда','user'],['profile','Профиль','user']];
    const profile=chiefProfile();
    const avatar=profile.avatar?`<span class="avatar"><img src="${safe(profile.avatar)}" alt=""></span>`:`<span class="avatar">${safe(initials(profile.displayName||'Главный техник'))}</span>`;
    root().innerHTML=`<aside class="sidebar tech-sidebar" id="tech-sidebar"><div class="brand"><img class="portal-logo" src="${logo}" alt="Create Dental"></div><nav class="sidebar-nav">${nav.map(([page,label,ico])=>`<button class="nav-link ${state.page===page||state.page==='quality'&&page==='intake'||state.page==='detail'&&page==='orders'?'active':''}" data-tech-page="${page}">${icon(ico,20)}<span>${label}</span></button>`).join('')}</nav></aside><div class="shell tech-shell"><header class="topbar"><button class="mobile-menu" data-tech-action="menu" aria-label="Открыть меню">☰</button><div class="topbar-spacer"></div><button class="role-toggle" data-auth-logout>Выйти</button><button class="profile" data-tech-page="profile">${avatar}<span><strong>${safe(profile.displayName||'Главный техник')}</strong><small>Главный техник</small></span>${icon('chevron',13)}</button></header><main class="content tech-content">${content}</main></div><div class="toast ${state.toast?'visible':''}">${safe(state.toast)}</div>`;
  }
  function render(){
    const route=routeFromPath(location.pathname);
    if(route.role==='technician'){state.page=route.page;if(route.orderId)state.orderId=route.orderId}
    try {overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}} catch {overrides={}}
    team=loadEmployees();
    try {const saved=JSON.parse(localStorage.getItem('create-dental-tech-clients')||'null');if(Array.isArray(saved))clients=saved} catch { /* Keep current directory. */ }
    const pages={overview,orders:ordersPage,detail:orderDetail,clients:clientsPage,messages:messagesPage,analytics:analyticsPage,team:teamPage,intake:qualityPage,quality:qualityPage,profile:profilePage};
    shell((pages[state.page]||overview)());
    if(state.page==='messages')queueMicrotask(()=>{refreshMessages();scrollChiefChat()});
  }
  document.addEventListener('click',event=>{
    if(!isActive())return;
    const conversation=event.target.closest('[data-tech-conversation]');
    if(conversation){state.activeConversation=conversation.dataset.techConversation;state.conversationMessages=[];render();return}
    const orderSort=event.target.closest('[data-tech-order-sort]');
    if(orderSort){const key=orderSort.dataset.techOrderSort;state.orderSortDirection=state.orderSortKey===key&&state.orderSortDirection==='asc'?'desc':'asc';state.orderSortKey=key;render();return}
    const orderFilterButton=event.target.closest('[data-tech-filter-panel]');
    if(orderFilterButton){
      const action=orderFilterButton.dataset.techFilterPanel;
      if(action==='toggle')state.orderFilterOpen=!state.orderFilterOpen;
      else if(action==='close')state.orderFilterOpen=false;
      else if(action==='reset'){state.orderClinicFilters=[];state.orderMonthFilter='';state.orderFilterOpen=false;}
      render();
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
        for(const order of allOrders().filter(order=>order.assigneeKey===employee.originalName&&!['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage))){
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
      if(action==='new')state.editClientId='new';
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
    if(modal&&event.target===modal){state.editOrderId=null;state.confirmOrderDeleteId=null;render();return}
    const orderAction=event.target.closest('[data-tech-order-action]');
    if(orderAction){
      const action=orderAction.dataset.techOrderAction,id=orderAction.dataset.id;
      if(action==='edit'){state.editOrderId=id;state.confirmOrderDeleteId=null;render();return}
      if(action==='delete'){state.confirmOrderDeleteId=id;state.editOrderId=null;render();return}
      if(action==='close-modal'){state.editOrderId=null;state.confirmOrderDeleteId=null;render();return}
      if(action==='confirm-delete'){deleteOrderRecord(id);state.confirmOrderDeleteId=null;return}
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
      if(action.dataset.techAction==='approve'&&order.stage==='Контроль качества')saveOrder(id,{stage:'Работа принята',completedAt:new Date().toISOString()});
      if(action.dataset.techAction==='rework'&&order.stage==='Контроль качества')saveOrder(id,{stage:'Изготовление'});
      if(action.dataset.techAction==='rollback'){const previous=stages[stages.indexOf(order.stage)-1];if(previous)saveOrder(id,{stage:previous});}
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
    if(page){root().querySelector('#tech-sidebar')?.classList.remove('open');setPage(page.dataset.techPage);return}
    const order=event.target.closest('[data-tech-order]');
    if(order){state.orderId=order.dataset.techOrder;setPage('detail')}
  });
  document.addEventListener('keydown',event=>{
    if(!isActive())return;
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('tr[data-tech-order]')){event.preventDefault();event.target.click()}
  });
  document.addEventListener('change',event=>{
    if(!isActive())return;
    if(event.target.id==='tech-profile-avatar'){
      const file=event.target.files?.[0];
      if(!file)return;
      avatarFromFile(file).then(avatar=>saveChiefProfile({avatar},'Аватар сохранён')).catch(error=>toast(error.message));
      return;
    }
    if(event.target.matches('[data-tech-order-clinic]')){
      const clinic=event.target.dataset.techOrderClinic;
      state.orderClinicFilters=event.target.checked?[...new Set([...state.orderClinicFilters,clinic])]:state.orderClinicFilters.filter(item=>item!==clinic);
      render();
      return;
    }
    if(event.target.matches('[data-tech-order-month-filter]')){state.orderMonthFilter=event.target.value;render();return}
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

  document.addEventListener('submit',async event=>{
    if(!isActive()||event.target.id!=='tech-order-edit-form')return;
    event.preventDefault();
    const form=event.target;
    const teeth=String(form.elements.namedItem('teeth').value||'').split(',').map(value=>Number(value.trim())).filter(Boolean);
    const date=form.elements.namedItem('date').value.trim();
    if(!/^\d{2}\.\d{2}\.\d{4}$/.test(date))return toast('Укажите срок в формате дд.мм.гггг');
    await saveOrderRecord(state.editOrderId,{patient:form.elements.namedItem('patient').value.trim(),work:form.elements.namedItem('work').value.trim(),date,sum:form.elements.namedItem('sum').value.trim(),teeth,comment:form.elements.namedItem('comment').value.trim()});state.editOrderId=null;
  });
  document.addEventListener('submit',async event=>{
    if(!isActive()||event.target.id!=='chief-chat-form')return;
    event.preventDefault();
    const form=event.target,text=form.elements.namedItem('text').value.trim();
    if(!text||!state.activeConversation)return;
    const button=form.querySelector('button');button.disabled=true;
    try{const response=await fetch('/api/chief/conversations/'+encodeURIComponent(state.activeConversation)+'/reply',{method:'POST',headers:{'Content-Type':'application/json','X-Portal-Token':portalToken()},body:JSON.stringify({text})});if(!response.ok)throw new Error('Не удалось отправить ответ');const data=await response.json();form.reset();state.conversationMessages=[...state.conversationMessages,data.message];state.conversations=state.conversations.map(item=>item.id===state.activeConversation?{...item,lastMessage:data.message.text,updatedAt:data.message.time}:item).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));shell(messagesPage());queueMicrotask(scrollChiefChat);refreshMessages()}catch(error){state.messagesError=error.message;shell(messagesPage())}finally{button.disabled=false}
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
  return {render,refreshMessages};
}
