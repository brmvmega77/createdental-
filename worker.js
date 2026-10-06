import {loadEmployees,seedDetails,stages} from './technician.js?v=dashboard-calendar-3';
import {savePortal,authRequest,loadOrderFiles,uploadOrderFile,downloadOrderFile} from './portal-client.js?v=mobile-fast-4';
import {routeFromPath,pathFor,navigate} from './routes.js?v=mobile-fast-1';
import {notificationCenterMarkup,toggleNotificationCenter,closeNotificationCenter,markNotificationCenterRead} from './notification-center.js?v=dashboard-calendar-3';

const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const tone=stage=>stage==='Контроль качества'?'review':['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(stage)?'ready':'work';
const readOrders=()=>{try{return JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}}catch{return {}}};
const initials=value=>String(value||'Т').trim().split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase()||'Т';
const shortDate=value=>value?new Date(value).toLocaleDateString('ru-RU'):'—';
const dateKey=value=>String(value||'').includes('.')?String(value).split('.').reverse().join('-'):String(value||'');

export function createWorkerCabinet({root,orders,assets,logo,icon,toothChart,isActive,currentUser,onUserUpdate=()=>{}}){
  const initialRoute=routeFromPath(location.pathname);
  const state={page:initialRoute.role==='worker'?initialRoute.page:'overview',employeeId:'',orderId:initialRoute.orderId||'',sortKey:'createdAt',sortDirection:'desc',profile:null,toast:'',filesFor:'',orderFiles:[]};
  function employees(){return loadEmployees()}
  function current(){
    state.employeeId=currentUser()?.subjectId||'';
    return employees().find(employee=>employee.id===state.employeeId&&employee.status==='active');
  }
  const avatarKey=()=>`create-dental-worker-avatar-${state.employeeId||currentUser()?.subjectId||'worker'}`;
  function storedAvatar(){try{return localStorage.getItem(avatarKey())||''}catch{return ''}}
  function storeAvatar(avatar){try{avatar?localStorage.setItem(avatarKey(),avatar):localStorage.removeItem(avatarKey())}catch{/* Local storage can be full or unavailable. */}}
  function workerProfile(){const employee=current()||{};const profile={...employee,...(currentUser()||{}),...(state.profile||{})};if(!profile.avatar)profile.avatar=storedAvatar();return profile}
  function avatarMarkup(profile,sizeClass=''){
    return profile.avatar?`<span class="tech-person-avatar ${sizeClass}"><img src="${safe(profile.avatar)}" alt=""></span>`:`<span class="tech-person-avatar ${sizeClass}">${safe(initials(profile.name||profile.displayName||'Техник'))}</span>`;
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
          const makeAvatar=(side,quality)=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=side;canvas.height=side;ctx.drawImage(image,sx,sy,size,size,0,0,side,side);return canvas.toDataURL('image/jpeg',quality)};
          let avatar=makeAvatar(180,0.7);
          for(const [side,quality] of [[150,0.66],[120,0.58],[96,0.52]]){if(avatar.length<180000)break;avatar=makeAvatar(side,quality)}
          if(avatar.length>450000)return reject(new Error('Фото слишком большое. Попробуйте другое изображение.'));
          resolve(avatar);
        };
        image.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function updateLocalEmployee(employee){
    const next=employees().map(item=>item.id===employee.id?{...item,...employee}:item);
    localStorage.setItem('create-dental-employees',JSON.stringify(next));
  }
  async function saveWorkerProfile(change,successMessage){
    const profile={...workerProfile(),...change};
    if(Object.prototype.hasOwnProperty.call(change,'avatar')){storeAvatar(profile.avatar||'');state.profile=profile;onUserUpdate({...currentUser(),avatar:profile.avatar});render()}
    try{
      const data=await authRequest('worker-profile',{name:profile.name||profile.displayName||'Техник',specialty:profile.specialty||'',phone:profile.phone||'',email:profile.email||'',password:change.password||'',avatar:profile.avatar||''});
      if(data.employee)updateLocalEmployee(data.employee);
      state.profile={...(data.employee||{}),...(data.user||{})};
      if(data.user?.avatar)storeAvatar(data.user.avatar);
      onUserUpdate(data.user||currentUser());
      render();
      if(successMessage)toast(successMessage);
      return state.profile;
    }catch(error){
      if(Object.prototype.hasOwnProperty.call(change,'avatar')){toast(profile.avatar?'Аватар сохранён локально. После перезапуска сервера сохранится и там.':'Аватар удалён локально');return profile}
      throw error;
    }
  }
  function toast(message){state.toast=message;render();clearTimeout(toast.timer);toast.timer=setTimeout(()=>{state.toast='';root().querySelector('.toast')?.classList.remove('visible')},3200)}
  function myOrders(){
    const employee=current();
    if(!employee)return [];
    const overrides=readOrders();
    return orders.map(order=>({...order,stage:'Ожидает распределения',assignee:'',priority:'Обычный',teeth:order.teeth||[],clinic:order.clinic||'Dental Clinic',...seedDetails[order.id],...overrides[order.id]})).filter(order=>order.assignee===employee.originalName);
  }
  function sortedOrders(list){
    const key=state.sortKey,sign=state.sortDirection==='asc'?1:-1;
    if(!key)return list;
    return [...list].sort((a,b)=>{
      let x=a[key]??'',y=b[key]??'';
      if(key==='date'){x=dateKey(x);y=dateKey(y)}
      if(key==='createdAt'){x=Date.parse(x)||0;y=Date.parse(y)||0;return (x-y)*sign}
      if(key==='clinic'){x=`${a.clinic} ${a.patient}`;y=`${b.clinic} ${b.patient}`}
      if(key==='work'){x=`${a.work} ${a.patient}`;y=`${b.work} ${b.patient}`}
      return String(x).localeCompare(String(y),'ru',{numeric:true})*sign;
    });
  }
  function setPage(page){
    state.page=page;
    navigate(pathFor('worker',page,state.orderId));
    render();
  }
  function sortHeading(key,label){
    const active=state.sortKey===key,arrow=active?(state.sortDirection==='asc'?'↑':'↓'):'↕';
    return `<th aria-sort="${active?(state.sortDirection==='asc'?'ascending':'descending'):'none'}"><button class="order-sort" data-worker-sort="${key}">${label}<span aria-hidden="true">${arrow}</span></button></th>`;
  }
  function orderList(list){
    const rows=sortedOrders(list);
    return `<div class="tech-table-wrap"><table class="tech-table worker-table"><thead><tr><th>Заказ / клиника</th>${sortHeading('createdAt','Создан')}${sortHeading('work','Работа / пациент')}${sortHeading('date','Срок')}${sortHeading('stage','Этап')}<th></th></tr></thead><tbody>${rows.map(order=>`<tr data-worker-order="${safe(order.id)}" tabindex="0" class="tech-order-row"><td><strong>${safe(order.id)}</strong><small>${safe(order.clinic)}</small></td><td>${shortDate(order.createdAt)}</td><td>${safe(order.work)}<small>${safe(order.patient)}</small></td><td>${safe(order.date)}</td><td><span class="tech-stage ${tone(order.stage)}">${safe(order.stage)}</span></td><td><button class="tech-link" data-worker-order="${safe(order.id)}">Открыть →</button></td></tr>`).join('')||'<tr><td colspan="6" class="tech-empty">Назначенных заказов пока нет</td></tr>'}</tbody></table></div>`;
  }
  function overview(){
    const employee=current();
    const list=myOrders();
    const working=list.filter(order=>!['Контроль качества','Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage));
    const checking=list.filter(order=>order.stage==='Контроль качества');
    const done=list.filter(order=>['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage));
    return `<div class="tech-heading"><div><span class="tech-eyebrow">МОЙ РАБОЧИЙ КАБИНЕТ</span><h1>Здравствуйте, ${safe(employee.name.split(' ')[0])}</h1><p>Ваши задания и текущие этапы производства.</p></div><span class="tech-demo-note">Личный кабинет</span></div><div class="worker-stats"><article><span>В работе</span><strong>${working.length}</strong><small>Нужно выполнить</small></article><article><span>На проверке</span><strong>${checking.length}</strong><small>Передано главному технику</small></article><article><span>Готово</span><strong>${done.length}</strong><small>Проверка пройдена</small></article></div><section class="tech-panel"><div class="tech-panel-heading"><div><h2>Мои текущие заказы</h2><p>Откройте работу, чтобы посмотреть детали и сменить этап</p></div><button class="tech-link" data-worker-page="orders">Все мои заказы →</button></div>${orderList(list.filter(order=>!['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage)))}</section>`;
  }
  function ordersPage(){return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОИЗВОДСТВО</span><h1>Мои заказы</h1><p>Работы, назначенные вам главным техником.</p></div></div><section class="tech-panel">${orderList(myOrders())}</section>`}
  function detailPage(){
    const order=myOrders().find(item=>item.id===state.orderId);
    if(!order)return ordersPage();
    if(state.filesFor!==order.id){state.filesFor=order.id;state.orderFiles=[];loadOrderFiles(order.id).then(result=>{if(state.orderId===order.id&&isActive()){state.orderFiles=result.files||[];render()}}).catch(()=>{})}
    const index=stages.indexOf(order.stage);
    const canAdvance=index>=1&&index<4;
    const canRollback=index>1&&index<=4;
    const next=canAdvance?stages[index+1]:'';
    const resultPhotos=state.orderFiles.filter(file=>file.purpose==='result-photo');
    return `<button class="tech-back" data-worker-page="orders">← Мои заказы</button><div class="tech-heading"><div><span class="tech-eyebrow">${safe(order.clinic)} · срок ${safe(order.date)}</span><h1>Заказ ${safe(order.id)}</h1><p>${safe(order.work)} · ${safe(order.patient)}</p></div><span class="tech-stage ${tone(order.stage)}">${safe(order.stage)}</span></div><div class="tech-detail-grid"><section class="tech-panel"><h2>Данные работы</h2><div class="tech-facts"><div><span>Клиника</span><strong>${safe(order.clinic)}</strong></div><div><span>Пациент</span><strong>${safe(order.patient)}</strong></div><div><span>Конструкция</span><strong>${safe(order.work)}</strong></div><div><span>Создан</span><strong>${shortDate(order.createdAt)}</strong></div><div><span>Срок сдачи</span><strong>${safe(order.date)}</strong></div><div><span>Приоритет</span><strong>${safe(order.priority)}</strong></div><div><span>Номера зубов</span><strong>${order.teeth.join(', ')||'Не указаны'}</strong></div></div><div class="tech-detail-teeth">${toothChart(false,order.teeth,order.bridgeRanges||[])}</div><h3>Файлы заказа</h3><div class="order-file-list">${state.orderFiles.map(file=>`<button class="order-file" data-worker-download-file="${safe(file.id)}"><strong>${safe(file.name)}</strong><small>${file.purpose==='result-photo'?'Фото результата · ':''}${Math.ceil(file.size/1024)} КБ</small></button>`).join('')||'<p class="tech-empty">Файлов пока нет</p>'}</div>${order.stage==='Контроль качества'?`<div class="result-photo-upload"><h3>Фото готовой работы</h3><p>Фото будет видно врачу после отправки заказа.</p><label class="btn outline">${resultPhotos.length?'Добавить ещё фото':'Загрузить фото результата'}<input type="file" id="worker-result-photo" accept="image/jpeg,image/png" multiple hidden></label></div>`:''}</section><section class="tech-panel"><h2>Ход выполнения</h2><ol class="tech-timeline">${stages.map((stage,position)=>`<li class="${position<index?'done':position===index?'current':''}"><i></i><span>${stage}</span></li>`).join('')}</ol><div class="tech-detail-actions">${canRollback?`<button class="btn outline" data-worker-action="rollback" data-order-id="${safe(order.id)}">Вернуть на предыдущий статус</button>`:''}${order.stage==='На доработке'?`<p>${safe(order.reworkReason||'Клиника запросила доработку')}</p><button class="btn primary" data-worker-action="resume-rework" data-order-id="${safe(order.id)}">Принять в работу</button>`:canAdvance?`<button class="btn primary" data-worker-action="advance" data-order-id="${safe(order.id)}">${next==='Контроль качества'?'Передать на проверку':'Перейти к этапу «'+next+'»'}</button>`:order.stage==='Контроль качества'?'<p>Работа передана главному технику на проверку.</p>':['Работа принята','Готово к выдаче'].includes(order.stage)?'<p>Работа принята главным техником.</p>':order.stage==='В доставке'?'<p>Заказ в доставке.</p>':order.stage==='Принято доктором'?'<p class="tech-status-note">Работа принята доктором.</p>':'<p>Дождитесь назначения работы.</p>'}</div></section></div>`;
  }
  function profile(){
    const profile=workerProfile();
    const field=(label,name,value='',type='text',required=false,placeholder='')=>`<label>${label}<input name="${name}" type="${type}" value="${safe(value)}" ${placeholder?`placeholder="${safe(placeholder)}"`:''} ${required?'required':''}></label>`;
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОФИЛЬ</span><h1>Мои данные</h1></div></div><section class="tech-panel tech-profile-editor"><div class="tech-profile-avatar">${avatarMarkup(profile,'large')}<label class="btn outline">Загрузить аватар<input id="worker-profile-avatar" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>${profile.avatar?'<button class="tech-link" data-worker-avatar="remove">Убрать аватар</button>':''}</div><form id="worker-profile-form" class="tech-client-form">${field('Имя и фамилия','name',profile.name||profile.displayName||'','text',true)}${field('Специализация','specialty',profile.specialty||'','text')}${field('Телефон','phone',profile.phone||'','tel')}${field('Электронная почта','email',profile.email||'','email',true)}${field('Новый пароль','password','','password',false,'Оставьте пустым, если менять не нужно')}${field('Повторите пароль','passwordConfirm','','password',false,'')}<div class="tech-client-form-actions"><button type="submit" class="btn primary">Сохранить профиль</button></div></form></section>`;
  }
  function shell(content){
    const employee=current();
    const profile=workerProfile();
    const avatar=profile.avatar?`<span class="avatar"><img src="${safe(profile.avatar)}" alt=""></span>`:`<span class="avatar">${safe(initials(employee?.name||'Техник'))}</span>`;
    const nav=[['overview','Главная','home'],['orders','Мои заказы','orders'],['profile','Мой профиль','user']];
    root().innerHTML=`<aside class="sidebar tech-sidebar" id="worker-sidebar"><div class="brand"><img class="portal-logo" src="${logo}" alt="Create Dental"></div><div class="tech-side-label">Кабинет техника</div><nav class="sidebar-nav">${nav.map(([page,label,ico])=>`<button class="nav-link ${state.page===page||state.page==='detail'&&page==='orders'?'active':''}" data-worker-page="${page}">${icon(ico,20)}<span>${label}</span></button>`).join('')}</nav></aside><div class="shell tech-shell"><header class="topbar"><button class="mobile-menu" data-worker-action="menu" aria-label="Открыть меню">☰</button><div class="topbar-spacer"></div>${notificationCenterMarkup()}<button class="role-toggle" data-auth-logout>Выйти</button><button class="profile" data-worker-page="profile">${avatar}<span><strong>${safe(employee?.name||profile.displayName||'Техник')}</strong><small>${safe(employee?.specialty||'Зубной техник')}</small></span>${icon('chevron',13)}</button></header><main class="content tech-content">${content}</main></div><div class="toast ${state.toast?'visible':''}">${safe(state.toast)}</div>`;
  }
  function render(){
    const route=routeFromPath(location.pathname);
    if(route.role==='worker'){state.page=route.page;if(route.orderId)state.orderId=route.orderId}
    const employee=current();
    if(!employee){shell(`<div class="tech-heading"><div><span class="tech-eyebrow">КАБИНЕТ ТЕХНИКА</span><h1>Доступ недоступен</h1><p>Выбранный сотрудник отключён, уволен или отсутствует.</p></div></div>`);return}
    shell(({overview,orders:ordersPage,detail:detailPage,profile}[state.page]||overview)());
  }
  document.addEventListener('click',async event=>{
    if(!isActive())return;
    if(event.target.closest('[data-notification-toggle]')){await toggleNotificationCenter();render();return}
    if(event.target.closest('[data-notification-close]')){closeNotificationCenter();render();return}
    const notification=event.target.closest('[data-notification-id]');
    if(notification){const orderId=notification.dataset.notificationOrder;await markNotificationCenterRead().catch(()=>{});closeNotificationCenter();if(orderId&&myOrders().some(order=>order.id===orderId)){state.orderId=orderId;setPage('detail')}else setPage('overview');return}
    const fileDownload=event.target.closest('[data-worker-download-file]');
    if(fileDownload){try{await downloadOrderFile(fileDownload.dataset.workerDownloadFile)}catch(error){toast(error.message)}return}
    const sort=event.target.closest('[data-worker-sort]');
    if(sort){const key=sort.dataset.workerSort;state.sortDirection=state.sortKey===key&&state.sortDirection==='asc'?'desc':'asc';state.sortKey=key;render();return}
    const avatar=event.target.closest('[data-worker-avatar]');
    if(avatar?.dataset.workerAvatar==='remove'){saveWorkerProfile({avatar:''},'Аватар удалён').catch(error=>toast(error.message));return}
    const action=event.target.closest('[data-worker-action]');
    if(action){
      if(action.dataset.workerAction==='menu'){root().querySelector('#worker-sidebar')?.classList.toggle('open');return}
      if(['advance','rollback','resume-rework'].includes(action.dataset.workerAction)){
        const employee=current();
        const order=myOrders().find(item=>item.id===action.dataset.orderId);
        const index=order&&stages.indexOf(order.stage);
        if(!employee||!order)return;
        if(action.dataset.workerAction==='advance'&&(index<1||index>=4))return;
        if(action.dataset.workerAction==='rollback'&&(index<=1||index>4))return;
        const overrides=readOrders();
        if(action.dataset.workerAction==='resume-rework'&&order.stage!=='На доработке')return;
        const stage=action.dataset.workerAction==='resume-rework'?'Изготовление':stages[index+(action.dataset.workerAction==='advance'?1:-1)];
        overrides[order.id]={...(overrides[order.id]||{}),stage};
        localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
        savePortal('orderOverrides',overrides).catch(error=>toast('Не удалось сохранить этап на сервере: '+error.message));
        render();
      }
      return;
    }
    const page=event.target.closest('[data-worker-page]');
    if(page){root().querySelector('#worker-sidebar')?.classList.remove('open');setPage(page.dataset.workerPage);return}
    const order=event.target.closest('[data-worker-order]');
    if(order){state.orderId=order.dataset.workerOrder;setPage('detail')}
  });
  document.addEventListener('change',event=>{
    if(!isActive())return;
    if(event.target.id==='worker-result-photo'){
      const order=myOrders().find(item=>item.id===state.orderId),selected=Array.from(event.target.files||[]),files=selected.filter(file=>/\.(jpg|jpeg|png)$/i.test(file.name)&&file.size<=50*1024*1024);
      if(selected.length!==files.length)toast('Выберите фото JPG или PNG до 50 МБ.');
      if(!order||!files.length){event.target.value='';return}
      (async()=>{try{for(const file of files)await uploadOrderFile(order.id,file,{purpose:'result-photo'});const result=await loadOrderFiles(order.id);state.orderFiles=result.files||[];toast('Фото результата прикреплено к заказу');render()}catch(error){toast(error.message)}})();event.target.value='';return;
    }
    if(event.target.id==='worker-profile-avatar'){
      const file=event.target.files?.[0];
      if(!file)return;
      avatarFromFile(file).then(avatar=>saveWorkerProfile({avatar},'Аватар сохранён')).catch(error=>toast(error.message));
    }
  });
  document.addEventListener('submit',async event=>{
    if(!isActive()||event.target.id!=='worker-profile-form')return;
    event.preventDefault();
    const form=event.target,profile=workerProfile();
    const name=form.elements.namedItem('name').value.trim();
    const specialty=form.elements.namedItem('specialty').value.trim();
    const phone=form.elements.namedItem('phone').value.trim();
    const email=form.elements.namedItem('email').value.trim();
    const password=form.elements.namedItem('password').value;
    const passwordConfirm=form.elements.namedItem('passwordConfirm').value;
    if(!name)return toast('Укажите имя');
    if(!email)return toast('Укажите почту');
    if(password&&password.length<8)return toast('Пароль должен быть от 8 символов');
    if(password!==passwordConfirm)return toast('Пароли не совпадают');
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{await saveWorkerProfile({name,specialty,phone,email,password,avatar:profile.avatar||''},'Профиль техника сохранён')}catch(error){toast(error.message)}finally{button.disabled=false}
  });
  document.addEventListener('keydown',event=>{
    if(!isActive())return;
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('tr[data-worker-order]')){event.preventDefault();event.target.click()}
  });
  return {render};
}
