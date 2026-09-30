import {loadEmployees,seedDetails,stages} from './technician.js';
import {savePortal} from './portal-client.js';
import {routeFromPath,pathFor,navigate} from './routes.js';

const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const tone=stage=>stage==='Контроль качества'?'review':stage==='Готово к выдаче'?'ready':'work';
const readOrders=()=>{try{return JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}}catch{return {}}};

export function createWorkerCabinet({root,orders,assets,logo,icon,toothChart,isActive,currentUser}){
  const initialRoute=routeFromPath(location.pathname);
  const state={page:initialRoute.role==='worker'?initialRoute.page:'overview',employeeId:'',orderId:initialRoute.orderId||'',toast:''};
  function employees(){return loadEmployees()}
  function current(){
    state.employeeId=currentUser()?.subjectId||'';
    return employees().find(employee=>employee.id===state.employeeId&&employee.status==='active');
  }
  function myOrders(){
    const employee=current();
    if(!employee)return [];
    const overrides=readOrders();
    return orders.map(order=>({...order,stage:'Ожидает распределения',assignee:'',priority:'Обычный',teeth:[],clinic:order.clinic||'Dental Clinic',...seedDetails[order.id],...overrides[order.id]})).filter(order=>order.assignee===employee.originalName);
  }
  function setPage(page){
    state.page=page;
    navigate(pathFor('worker',page,state.orderId));
    render();
  }
  function orderList(list){
    return `<div class="tech-table-wrap"><table class="tech-table worker-table"><thead><tr><th>Заказ</th><th>Клиника и пациент</th><th>Работа</th><th>Срок</th><th>Этап</th><th></th></tr></thead><tbody>${list.map(order=>`<tr data-worker-order="${safe(order.id)}" tabindex="0" class="tech-order-row"><td><strong>${safe(order.id)}</strong></td><td>${safe(order.clinic)}<small>${safe(order.patient)}</small></td><td>${safe(order.work)}</td><td>${safe(order.date)}</td><td><span class="tech-stage ${tone(order.stage)}">${safe(order.stage)}</span></td><td><button class="tech-link" data-worker-order="${safe(order.id)}">Открыть →</button></td></tr>`).join('')||'<tr><td colspan="6" class="tech-empty">Назначенных заказов пока нет</td></tr>'}</tbody></table></div>`;
  }
  function overview(){
    const employee=current();
    const list=myOrders();
    const working=list.filter(order=>!['Контроль качества','Готово к выдаче'].includes(order.stage));
    const checking=list.filter(order=>order.stage==='Контроль качества');
    const done=list.filter(order=>order.stage==='Готово к выдаче');
    return `<div class="tech-heading"><div><span class="tech-eyebrow">МОЙ РАБОЧИЙ КАБИНЕТ</span><h1>Здравствуйте, ${safe(employee.name.split(' ')[0])}</h1><p>Ваши задания и текущие этапы производства.</p></div><span class="tech-demo-note">Личный кабинет</span></div><div class="worker-stats"><article><span>В работе</span><strong>${working.length}</strong><small>Нужно выполнить</small></article><article><span>На проверке</span><strong>${checking.length}</strong><small>Передано главному технику</small></article><article><span>Готово</span><strong>${done.length}</strong><small>Проверка пройдена</small></article></div><section class="tech-panel"><div class="tech-panel-heading"><div><h2>Мои текущие заказы</h2><p>Откройте работу, чтобы посмотреть детали и сменить этап</p></div><button class="tech-link" data-worker-page="orders">Все мои заказы →</button></div>${orderList(list.filter(order=>order.stage!=='Готово к выдаче'))}</section>`;
  }
  function ordersPage(){return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОИЗВОДСТВО</span><h1>Мои заказы</h1><p>Работы, назначенные вам главным техником.</p></div></div><section class="tech-panel">${orderList(myOrders())}</section>`}
  function detailPage(){
    const order=myOrders().find(item=>item.id===state.orderId);
    if(!order)return ordersPage();
    const index=stages.indexOf(order.stage);
    const canAdvance=index>=1&&index<4;
    const next=canAdvance?stages[index+1]:'';
    return `<button class="tech-back" data-worker-page="orders">← Мои заказы</button><div class="tech-heading"><div><span class="tech-eyebrow">${safe(order.clinic)} · срок ${safe(order.date)}</span><h1>Заказ ${safe(order.id)}</h1><p>${safe(order.work)} · ${safe(order.patient)}</p></div><span class="tech-stage ${tone(order.stage)}">${safe(order.stage)}</span></div><div class="tech-detail-grid"><section class="tech-panel"><h2>Данные работы</h2><div class="tech-facts"><div><span>Клиника</span><strong>${safe(order.clinic)}</strong></div><div><span>Пациент</span><strong>${safe(order.patient)}</strong></div><div><span>Конструкция</span><strong>${safe(order.work)}</strong></div><div><span>Срок сдачи</span><strong>${safe(order.date)}</strong></div><div><span>Приоритет</span><strong>${safe(order.priority)}</strong></div><div><span>Номера зубов</span><strong>${order.teeth.join(', ')||'Не указаны'}</strong></div></div><div class="tech-detail-teeth">${toothChart(false,order.teeth)}</div></section><section class="tech-panel"><h2>Ход выполнения</h2><ol class="tech-timeline">${stages.map((stage,position)=>`<li class="${position<index?'done':position===index?'current':''}"><i></i><span>${stage}</span></li>`).join('')}</ol><div class="tech-detail-actions">${canAdvance?`<button class="btn primary" data-worker-action="advance" data-order-id="${safe(order.id)}">${next==='Контроль качества'?'Передать на проверку':'Перейти к этапу «'+next+'»'}</button>`:order.stage==='Контроль качества'?'<p>Работа передана главному технику на проверку.</p>':order.stage==='Готово к выдаче'?'<p>Работа принята и готова к выдаче.</p>':'<p>Дождитесь назначения работы.</p>'}</div></section></div>`;
  }
  function profile(){
    const employee=current();
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОФИЛЬ</span><h1>Мои данные</h1><p>Информация о сотруднике лаборатории.</p></div></div><section class="tech-panel tech-profile"><span class="tech-person-avatar">${safe(employee.name.split(' ').map(part=>part[0]).join(''))}</span><div><h2>${safe(employee.name)}</h2><p>${safe(employee.specialty||'Зубной техник')}</p><p>Телефон: ${safe(employee.phone||'Не указан')}</p><p>Почта: ${safe(employee.email||'Не указана')}</p><small>Изменить данные может главный техник в разделе «Команда».</small></div></section>`;
  }
  function shell(content){
    const employee=current();
    const active=employees().filter(item=>item.status==='active');
    const nav=[['overview','Главная','home'],['orders','Мои заказы','orders'],['profile','Мой профиль','user']];
    root().innerHTML=`<aside class="sidebar tech-sidebar" id="worker-sidebar"><div class="brand"><img class="portal-logo" src="${logo}" alt="Create Dental"></div><div class="tech-side-label">Кабинет техника</div><nav class="sidebar-nav">${nav.map(([page,label,ico])=>`<button class="nav-link ${state.page===page||state.page==='detail'&&page==='orders'?'active':''}" data-worker-page="${page}">${icon(ico,20)}<span>${label}</span></button>`).join('')}</nav></aside><div class="shell tech-shell"><header class="topbar"><button class="mobile-menu" data-worker-action="menu" aria-label="Открыть меню">☰</button><div class="topbar-spacer"></div><button class="role-toggle" data-auth-logout>Выйти</button><button class="profile" data-worker-page="profile"><span class="avatar">${safe(employee?.name.split(' ').map(part=>part[0]).join('')||'Т')}</span><span><strong>${safe(employee?.name||'Техник')}</strong><small>Зубной техник</small></span>${icon('chevron',13)}</button></header><main class="content tech-content">${content}</main></div><div class="toast ${state.toast?'visible':''}">${safe(state.toast)}</div>`;
  }
  function render(){
    const route=routeFromPath(location.pathname);
    if(route.role==='worker'){state.page=route.page;if(route.orderId)state.orderId=route.orderId}
    const employee=current();
    if(!employee){shell(`<div class="tech-heading"><div><span class="tech-eyebrow">КАБИНЕТ ТЕХНИКА</span><h1>Доступ недоступен</h1><p>Выбранный сотрудник отключён, уволен или отсутствует. Переключитесь на активного техника в верхней панели либо вернитесь к главному технику.</p></div></div>`);return}
    shell(({overview,orders:ordersPage,detail:detailPage,profile}[state.page]||overview)());
  }
  document.addEventListener('click',event=>{
    if(!isActive())return;
    const action=event.target.closest('[data-worker-action]');
    if(action){
      if(action.dataset.workerAction==='menu'){root().querySelector('#worker-sidebar')?.classList.toggle('open');return}
      if(action.dataset.workerAction==='advance'){
        const employee=current();
        const order=myOrders().find(item=>item.id===action.dataset.orderId);
        const index=order&&stages.indexOf(order.stage);
        if(!employee||!order||index<1||index>=4)return;
        const overrides=readOrders();
        overrides[order.id]={...(overrides[order.id]||{}),stage:stages[index+1]};
        localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
        savePortal('orderOverrides',overrides).catch(error=>{state.toast='Не удалось сохранить этап на сервере: '+error.message;render()});
        render();
      }
      return;
    }
    const page=event.target.closest('[data-worker-page]');
    if(page){setPage(page.dataset.workerPage);return}
    const order=event.target.closest('[data-worker-order]');
    if(order){state.orderId=order.dataset.workerOrder;setPage('detail')}
  });
  document.addEventListener('keydown',event=>{
    if(!isActive())return;
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('tr[data-worker-order]')){event.preventDefault();event.target.click()}
  });
  return {render};
}
