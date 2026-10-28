import {requiresDoctorCadApproval} from './production-routes.js';
import {employeeFlowRole} from './flow-rules.js';
import {createPayrollUI} from './payroll-ui.js?v=flow-integrity-1';
import {employeeRank} from './payroll.js';
import {camWorkflowStages,camWorkflowStatus,camWorkflowProgress,camCanAccept,camCanSubmitQuality,camWorkflowStagesForOrder} from './cam-workflow.js?v=cam-settings-1';
import {loadEmployees,seedDetails,stages,productionStages,productionStageIndex,productionStageLabel,manufacturingStatuses} from './technician.js?v=technician-sidebar-route-2';
import {portalToken,savePortal,authRequest,loadOrderFiles,loadCadPreviewSource,uploadOrderFile,submitCadReview,downloadOrderFile} from './portal-client.js?v=cad-popup-same-origin-1';
import {routeFromPath,pathFor,navigate} from './routes.js?v=order-routing-1';
import {notificationCenterMarkup,toggleNotificationCenter,closeNotificationCenter,markNotificationCenterRead} from './notification-center.js?v=flow-integrity-1';
import {workCatalog,rubles,estimateWork,priceUnitsForSelection,camMethodForOrder} from './work-catalog.js';
import {themeToggleMarkup,languageSwitcherMarkup} from './theme.js?v=light-only-1';
import {orderWorkLabel,orderEventSummary,orderExecutionLabel,orderConstructionLabel,orderVariantExecutionLabel,orderVariantConstructionLabel,displayOrderId,resolveOrderId} from './order-list-utils.js?v=order-fields-5';
import {taskStatuses,taskPriorityLabel,taskDateLabel,taskIsOverdue} from './tasks.js?v=task-flow-4';

const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const tone=stage=>['Согласование CAD','Контроль качества'].includes(stage)?'review':['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(stage)?'ready':'work';
const readOrders=()=>{try{return JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}}catch{return {}}};
const initials=value=>String(value||'Т').trim().split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase()||'Т';
const shortDate=value=>value?new Date(value).toLocaleDateString('ru-RU'):'—';
const dateKey=value=>String(value||'').includes('.')?String(value).split('.').reverse().join('-'):String(value||'');
const displayActor=event=>event?.actor||(event?.actorRole==='clinic'?'Клиент':'Create Dental Team');
const isCadOperatorEmployee=employee=>/cad\s*\/?\s*cam|cadcam|cad\s*оператор|моделировщик/i.test(String(employee?.specialty||''));
const workerSpecialtyLabel=employee=>{if(isCadOperatorEmployee(employee))return 'CAD/CAM оператор';const value=String(employee?.specialty||'').trim();if(/техник\s+первой\s+категории/i.test(value))return 'Техник первой категории';if(/гипсов|препрод|pre\s*prod|предпрод/i.test(value))return 'Препрод техник';if(/зубной\s+техник|каркасист|cam\s*оператор/i.test(value)||!value)return 'Каркасист';if(/красильщик|керамист|эстетист/i.test(value))return 'Красильщик';return value};
const workerSpecialtyDisplayLabel=employee=>({'Каркасист':'CAM оператор','Красильщик':'Эстетист','CAD/CAM оператор':'CAD оператор','Препрод техник':'Гипсовщик','Техник первой категории':'Техник первой категории'}[workerSpecialtyLabel(employee)]||workerSpecialtyLabel(employee));
const workerDisplayStatus=status=>status==='Принял работу'?'В работе':status==='Работа сдана'?'Передал дальше':status;
const workerQualityStageTitle=kind=>({cad:'ОТК — CAD оператор',preprod:'ОТК — препрод техник',cam:'ОТК — CAM оператор',category1:'ОТК — техник первой категории',esthetic:'ОТК — эстетист',final:'Финальная ОТК'}[kind]||'ОТК');
const workerDisplayStage=(stage,order)=>stage==='Контроль качества'&&order?.qualityRequest?.kind?workerQualityStageTitle(order.qualityRequest.kind):({'Согласование CAD':'CAD на согласовании у врача','На согласовании':'CAD на согласовании у врача','Техник первой категории':'Техник первой категории','Работа принята':'Принято врачом','В доставке':'Доставка в клинику','В пути к вам':'Доставка в клинику','Принято доктором':'Принято врачом','Принято':'Принято врачом','Готово к выдаче':'Принято врачом','На доработке':'Доработка и эстетика'}[stage]||stage);
const specialistProgress=status=>({'Ожидает принятия':0,'Принял работу':50,'Принял в работу':50,'В работе':50,'ОТК':75,'Согласование с врачом':90,'Работа сдана':100,'Передал дальше':100}[status]||0);
const isPreprodEmployee=employee=>workerSpecialtyLabel(employee)==='Препрод техник';
const isFrameEmployee=employee=>workerSpecialtyLabel(employee)==='Каркасист';
const isPainterEmployee=employee=>workerSpecialtyLabel(employee)==='Красильщик';
const isCategory1Employee=employee=>workerSpecialtyLabel(employee)==='Техник первой категории';
const workerCabinetLabel=employee=>isCadOperatorEmployee(employee)?'КАБИНЕТ CAD ОПЕРАТОРА':isPreprodEmployee(employee)?'КАБИНЕТ ГИПСОВЩИКА':isPainterEmployee(employee)?'КАБИНЕТ ЭСТЕТИСТА':isCategory1Employee(employee)?'КАБИНЕТ ТЕХНИКА ПЕРВОЙ КАТЕГОРИИ':'КАБИНЕТ CAM ОПЕРАТОРА';
const cadOperatorStages=[
  {label:'Ожидает принятия',matches:['Черновик из Telegram','Ожидает распределения','Подготовка']},
  {label:'В работе',matches:['Моделирование']},
  {label:'ОТК',matches:['Контроль качества']},
  {label:'Согласование с врачом',matches:['Согласование CAD']},
  {label:'Передал дальше',matches:['Изготовление','Работа принята','В доставке','Принято доктором']}
];
const preprodStages=[
  {label:'Принял работу'},
  {label:'В работе'},
  {label:'ОТК'},
  {label:'Работа сдана'}
];
const technicianStages=[
  {label:'Принял работу'},
  {label:'В работе'},
  {label:'ОТК'},
  {label:'Работа сдана'}
];

export function createWorkerCabinet({root,orders,assets,logo,icon,toothChart,isActive,currentUser,orderHistory=()=>[],tasks=()=>[],onUserUpdate=()=>{}}){
  const initialRoute=routeFromPath(location.pathname);
  const state={page:initialRoute.role==='worker'?initialRoute.page:'overview',employeeId:'',orderId:initialRoute.orderId||'',sortKey:'createdAt',sortDirection:'desc',orderStatusFilter:'Все',orderClinicFilter:'',orderMonthFilter:'',orderFilterOpen:false,orderSearch:'',profile:null,toast:'',telegramPairing:null,filesFor:'',orderFiles:[],orderFolderUrl:'',orderUpload:{orderId:'',status:'',message:''},cadUpload:{orderId:'',status:'',message:''},cadPreview:null};
  const sidebarCollapsed = () => { try { return localStorage.getItem('create-dental-sidebar-collapsed') === '1'; } catch { return false; } };
  const sidebarCollapseMarkup = () => `<button class="sidebar-collapse-toggle" data-worker-sidebar-toggle aria-label="${sidebarCollapsed()?'Развернуть':'Свернуть'} боковое меню" title="${sidebarCollapsed()?'Развернуть':'Свернуть'} боковое меню">${icon('chevron',16)}</button>`;
  const payrollUI=createPayrollUI({root,isActive,worker:true,onSummary:()=>{if(isActive()&&state.page!=='salary')render()}});
  let cadPreviewRequest=0;
  function employees(){return loadEmployees()}
  function current(){
    state.employeeId=currentUser()?.subjectId||'';
    return employees().find(employee=>employee.id===state.employeeId&&employee.status==='active');
  }
  const isCadOperator=()=>isCadOperatorEmployee(current());
  const isPreprod=()=>isPreprodEmployee(current());
  const visibleProductionStages=order=>isCadOperator()?cadOperatorStages.filter(stage=>stage.label!=='Согласование с врачом'||requiresDoctorCadApproval(order)):isPreprodEmployee(current())?preprodStages:isFrameEmployee(current())?camWorkflowStagesForOrder(order).map(label=>({label})):technicianStages;
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
  function workerOrderData(order,overrides){return {...order,stage:'Ожидает распределения',assignee:'',cadOperator:'',preprodTechnician:'',technician:'',frameTechnician:'',category1Technician:'',painter:'',ceramicist:'',manufacturingStatus:'',productionType:order.productionType||'digital',priority:'Обычный',teeth:order.teeth||[],clinic:order.clinic||'Dental Clinic',...seedDetails[order.id],...overrides[order.id],painter:overrides[order.id]?.painter||overrides[order.id]?.ceramicist||seedDetails[order.id]?.painter||seedDetails[order.id]?.ceramicist||''}}
  function productionAssignmentVisible(order,employee){if(isFrameEmployee(employee)&&camMethodForOrder(order)==='milling'&&!order.milling?.completedAt)return false;if(order.stage==='Контроль качества'&&order.qualityRequest)return order.qualityRequest.employeeId===employee.id||order.qualityRequest.requestedBy===employee.originalName;if(order.stage==='На доработке'&&order.reworkNeedsAssignment)return false;if(order.stage==='На доработке'&&order.reworkKind)return order.reworkKind===employeeFlowRole(employee);if(isCadOperatorEmployee(employee))return true;
    if(isPreprodEmployee(employee))return order.productionType==='analog'&&['Подготовка','Препрод','Контроль качества','На доработке'].includes(order.stage);if(isCategory1Employee(employee))return ['Техник первой категории','Контроль качества','На доработке','Работа принята','В доставке','Принято доктором'].includes(order.stage);if(order.stage!=='Изготовление')return true;if(isPainterEmployee(employee))return order.manufacturingStatus===manufacturingStatuses[1];return order.manufacturingStatus===manufacturingStatuses[0]||order.frameTechnicianStatus==='Работа сдана'}
  function assignedToEmployee(order,employee){return [order.assignee,order.cadOperator,order.preprodTechnician,order.technician,order.frameTechnician,order.category1Technician,order.painter,order.ceramicist].filter(Boolean).includes(employee.originalName)&&productionAssignmentVisible(order,employee)}
  function myOrders(){const employee=current();if(!employee)return [];const overrides=readOrders();return orders.map(order=>workerOrderData(order,overrides)).filter(order=>assignedToEmployee(order,employee)).filter(order=>isCadOperatorEmployee(employee)?['Ожидает распределения','Подготовка','Моделирование','Контроль качества','Согласование CAD','Изготовление'].includes(order.stage):isPreprodEmployee(employee)?['Подготовка','Препрод','Контроль качества','На доработке'].includes(order.stage):isCategory1Employee(employee)?['Техник первой категории','Контроль качества','На доработке','Работа принята','В доставке','Принято доктором'].includes(order.stage):!['Моделирование','Согласование CAD','Препрод'].includes(order.stage))}
  function assignedOrders(){const employee=current();if(!employee)return [];const overrides=readOrders();return orders.map(order=>workerOrderData(order,overrides)).filter(order=>assignedToEmployee(order,employee))}
  function technicianStatus(order){if(isFrameEmployee(current()))return camWorkflowStatus(order);if(isCadOperator())return workerStageLabel(order);if(isPreprodEmployee(current())){if(order.stage==='Контроль качества')return 'ОТК';if(['Изготовление','Техник первой категории','Работа принята','В доставке','Принято доктором'].includes(order.stage))return 'Работа сдана';if(order.preprodTechnicianStatus)return order.preprodTechnicianStatus;return 'Ожидает принятия';}if(isCategory1Employee(current())){if(order.stage==='Контроль качества')return order.qualityRequest?.kind==='category1'?'ОТК':'Работа сдана';if(['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage))return 'Работа сдана';return order.category1TechnicianStatus||'Ожидает принятия';} if(order.stage==='Контроль качества')return 'ОТК';if(['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage))return 'Работа сдана';const status=isPainterEmployee(current())?(order.painterStatus||order.ceramicistStatus):order.frameTechnicianStatus;if(status)return status;return 'Ожидает принятия'}
  function salaryItems(){return (payrollUI.summary()?.accruals||[]).map(item=>({...item,date:new Date(item.at),units:item.lines.reduce((sum,line)=>sum+line.units,0)}))}
  function salaryMonthKey(date){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).format(date).slice(0,7)}
  function salaryMonthLabel(key){const [year,month]=key.split('-').map(Number),name=new Intl.DateTimeFormat('ru-RU',{month:'long'}).format(new Date(year,month-1,1));return `${name.charAt(0).toUpperCase()+name.slice(1)} ${year}`}
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
  function orderCreatedDate(order){const created=Date.parse(order.createdAt);if(created)return new Date(created);const key=dateKey(order.date);if(/^\d{4}-\d{2}-\d{2}$/.test(key))return new Date(`${key}T00:00:00`);return new Date(0)}
  function orderMonthKey(order){const date=orderCreatedDate(order);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`}
  function orderMonthLabel(key){const [year,month]=key.split('-').map(Number),name=new Intl.DateTimeFormat('ru-RU',{month:'long'}).format(new Date(year,month-1,1));return `${name.charAt(0).toUpperCase()+name.slice(1)} ${year}`}
  function filteredWorkerOrders(list=myOrders()){
    return list.filter(order=>{
      const status=state.orderStatusFilter;
      if(isCadOperator()){
        if(status!=='Все'&&workerStageLabel(order)!==status)return false;
      }else{
        if(status==='Новые'&&!['Ожидает распределения','Черновик из Telegram'].includes(order.stage))return false;
        if(status!=='Все'&&technicianStatus(order)!==status)return false;
      }
      if(state.orderClinicFilter&&order.clinic!==state.orderClinicFilter)return false;
      if(state.orderMonthFilter&&orderMonthKey(order)!==state.orderMonthFilter)return false;
      if(state.orderSearch&&!['id','clinic','work','patient','date','stage','assignee'].some(key=>String(order[key]||'').toLowerCase().includes(state.orderSearch.toLowerCase())))return false;
      return true;
    });
  }
  function workerOrderFilterPanel(all){
    const clinics=[...new Set(all.map(order=>order.clinic).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    const months=[...new Set(all.map(orderMonthKey))].filter(Boolean).sort().reverse();
    const activeCount=(state.orderClinicFilter?1:0)+(state.orderMonthFilter?1:0);
    const button=`<button type="button" class="btn outline tech-filter-button ${activeCount?'active':''}" data-worker-filter-panel="toggle">Фильтр${activeCount?` · ${activeCount}`:''}</button>`;
    if(!state.orderFilterOpen)return button;
    return `${button}<div class="tech-order-filter-panel"><div><strong>Клиника</strong><select data-worker-order-clinic-filter><option value="">Все клиники</option>${clinics.map(clinic=>`<option value="${safe(clinic)}" ${state.orderClinicFilter===clinic?'selected':''}>${safe(clinic)}</option>`).join('')}</select></div><div><strong>Месяц заказа</strong><select data-worker-order-month-filter><option value="">Все месяцы</option>${months.map(month=>`<option value="${month}" ${state.orderMonthFilter===month?'selected':''}>${orderMonthLabel(month)}</option>`).join('')}</select></div><div class="tech-order-filter-actions"><button type="button" class="btn outline" data-worker-filter-panel="reset">Сбросить</button><button type="button" class="btn primary" data-worker-filter-panel="close">Готово</button></div></div>`;
  }
  function workerOrderStatusLabels(){return [['Все','Все'],['Ожидает принятия','Ожидает принятия'],['В работе','В работе'],['ОТК','ОТК'],...(isCadOperator()?[['Согласование с врачом','Согласование с врачом']]:[]),['Передал дальше',isCadOperator()||isFrameEmployee(current())?'Передал дальше':'Работа сдана']]}
  function setPage(page){
    state.page=page;
    navigate(pathFor('worker',page,state.orderId));
    render();
  }
  function sortHeading(key,label){
    const active=state.sortKey===key,arrow=active?(state.sortDirection==='asc'?'↑':'↓'):'↕';
    return `<th aria-sort="${active?(state.sortDirection==='asc'?'ascending':'descending'):'none'}"><button class="order-sort" data-worker-sort="${key}">${label}<span aria-hidden="true">${arrow}</span></button></th>`;
  }
  function workerStageLabel(order){
    if(!isCadOperatorEmployee(current()))return technicianStatus(order);
    if(order.stage==='Моделирование'&&order.cadReview?.status==='returned')return 'Возвращено на доработку';
    if(order.stage==='Контроль качества')return order.qualityRequest?.kind==='cad'?'ОТК':'Передал дальше';
    const label=cadOperatorStages.find(item=>item.matches.includes(order.stage))?.label||order.stage;
    if(label==='Ожидает принятия')return 'Ожидает принятия';
    return label;
  }
  function orderList(list){
    const rows=sortedOrders(list);
    return `<div class="tech-table-wrap"><table class="tech-table worker-table"><thead><tr><th>Заказ / клиника</th>${sortHeading('createdAt','Создан')}${sortHeading('work','Работа / пациент')}${sortHeading('date','Срок')}${sortHeading('stage','Этап')}<th></th></tr></thead><tbody>${rows.map(order=>`<tr data-worker-order="${safe(order.id)}" tabindex="0" class="tech-order-row"><td><strong>${safe(displayOrderId(order))}</strong><small>${safe(order.clinic)}</small></td><td>${shortDate(order.createdAt)}</td><td>${safe(orderWorkLabel(order))}<small>${safe(order.patient)}</small></td><td>${safe(order.date)}</td><td><span class="tech-stage ${tone(order.stage)}">${safe(workerDisplayStatus(workerStageLabel(order)))}</span></td><td><button class="tech-link" data-worker-order="${safe(order.id)}">Открыть →</button></td></tr>`).join('')||'<tr><td colspan="6" class="tech-empty">Назначенных заказов пока нет</td></tr>'}</tbody></table></div>`;
  }
  function overview(){
    const employee=current();
    const list=myOrders();
    const working=list.filter(order=>['Принял работу','В работе'].includes(isCadOperator()?workerStageLabel(order):technicianStatus(order)));
    const checking=list.filter(order=>(isCadOperator()?workerStageLabel(order):technicianStatus(order))==='ОТК');
    const done=list.filter(order=>['Работа сдана','Передал дальше'].includes(isCadOperator()?workerStageLabel(order):technicianStatus(order)));
    const earnings=salaryItems(),monthKey=salaryMonthKey(new Date()),currentEarnings=earnings.filter(item=>salaryMonthKey(item.date)===monthKey).reduce((sum,item)=>sum+item.amount,0);
    const salaryCard=`<article class="worker-earnings-card"><span>Доход за месяц</span><strong>${payrollUI.summary()?rubles(currentEarnings):'Загрузка…'}</strong><small>${earnings.length?`${earnings.filter(item=>salaryMonthKey(item.date)===monthKey).length} начислений`:'Начислений пока нет'} · <a href="${pathFor('worker','salary')}" data-worker-page="salary">Подробнее →</a></small></article>`;
    return `<div class="tech-heading"><div><span class="tech-eyebrow">МОЙ РАБОЧИЙ КАБИНЕТ</span><h1>Здравствуйте, ${safe(employee.name.split(' ')[0])}</h1><p>Ваши задания и текущие этапы производства.</p></div><span class="tech-demo-note">Личный кабинет</span></div><div class="worker-stats"><article><span>В работе</span><strong>${working.length}</strong><small>Нужно выполнить</small></article><article><span>На проверке</span><strong>${checking.length}</strong><small>У врача или главного техника</small></article><article><span>Готово</span><strong>${done.length}</strong><small>Передал дальше</small></article>${salaryCard}</div><section class="tech-panel"><div class="tech-panel-heading"><div><h2>Мои текущие заказы</h2><p>Откройте работу, чтобы посмотреть детали и сменить этап</p></div><a href="${pathFor('worker','orders')}" class="tech-link" data-worker-page="orders">Все мои заказы →</a></div>${orderList(list.filter(order=>!['Работа сдана','Передал дальше'].includes(isCadOperator()?workerStageLabel(order):technicianStatus(order))))}</section>`;
  }
  function salaryPage(){return payrollUI.markup()}
  function tasksPage(){
    const mine=tasks().filter(task=>task.assigneeId===current()?.id),card=task=>`<article class="task-card ${taskIsOverdue(task)?'is-overdue':''}"><header><span class="task-priority ${safe(task.priority)}">${safe(taskPriorityLabel(task.priority))}</span><time>${safe(taskDateLabel(task.dueDate))}</time></header><h3>${safe(task.title)}</h3>${task.orderId?`<div class="task-order-ref">${safe(displayOrderId(task.orderId))}${task.work?` · ${safe(task.work)}`:''}</div>`:''}${task.clinic||task.patient?`<div class="task-order-meta">${safe([task.clinic,task.patient].filter(Boolean).join(' · '))}</div>`:''}${task.description?`<p>${safe(task.description)}</p>`:''}<footer><span>Главный техник</span><select data-worker-task-status="${safe(task.id)}" aria-label="Статус задачи ${safe(task.title)}">${taskStatuses.map(status=>`<option value="${status.key}" ${task.status===status.key?'selected':''}>${status.label}</option>`).join('')}</select></footer></article>`;
    return `<div class="tech-heading"><div><span class="tech-eyebrow">РАБОЧИЙ КОНТУР</span><h1>Мои задачи</h1><p>Выполняйте поручения главного техника и переводите их по этапам.</p></div></div><section class="task-board worker-task-board">${taskStatuses.map(status=>{const items=mine.filter(task=>task.status===status.key);return `<section class="task-column" data-task-column="${status.key}"><header><h2>${status.label}</h2><b>${items.length}</b></header><div>${items.map(card).join('')||'<p class="task-column-empty">Задач нет</p>'}</div></section>`}).join('')}</section>`;
  }
  function ordersPage(){const all=myOrders(),list=filteredWorkerOrders(all),statusLabels=workerOrderStatusLabels();return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОИЗВОДСТВО</span><h1>Мои заказы</h1><p>Работы, назначенные вам главным техником.</p></div></div><section class="tech-panel"><div class="tech-order-tools worker-order-tools"><div class="tech-segment">${statusLabels.map(([label,key])=>`<button data-worker-order-filter="${safe(key)}" class="${state.orderStatusFilter===key?'active':''}">${safe(label)}</button>`).join('')}</div><div class="tech-order-searchbar">${workerOrderFilterPanel(all)}<input id="tech-search" placeholder="Поиск по заказу, клинике или технику..." value="${safe(state.orderSearch)}"></div></div>${orderList(list)}</section>`}
  function orderServiceCards(order){
    const variants=Array.isArray(order.variants)&&order.variants.length?order.variants:[{toothMode:order.toothMode||'Одиночка',bridgeRanges:order.bridgeRanges||[],selectedTeeth:order.teeth||[],work:order.work,workOption:order.material}];
    return `<section class="tech-order-services tech-panel"><div class="tech-panel-heading"><div><h2>Услуги заказа</h2><p>${variants.length} ${variants.length===1?'услуга':'услуги'} в одном заказе</p></div></div><div class="tech-order-service-list">${variants.map((variant,index)=>{const teeth=Array.isArray(variant.selectedTeeth)?variant.selectedTeeth:[],ranges=Array.isArray(variant.bridgeRanges)?variant.bridgeRanges:[],units=priceUnitsForSelection(variant.work,teeth,variant.units),amount=estimateWork({work:variant.work,option:variant.workOption,teeth,units}).amount;return `<article class="tech-order-service"><header><span>Услуга ${index+1}</span><strong>${safe(orderVariantConstructionLabel(variant,order))}</strong></header><div class="tech-order-service-body"><div class="tech-order-service-chart">${toothChart(false,teeth,ranges)}</div><dl><div><dt>Зубы</dt><dd>${safe(teeth.join(', ')||'Не указаны')}</dd></div><div><dt>Режим</dt><dd>${safe(variant.toothMode||'Одиночка')}</dd></div>${ranges.length?`<div><dt>Мосты</dt><dd>${safe(ranges.map(range=>`${range[0]}–${range.at(-1)}`).join(', '))}</dd></div>`:''}<div><dt>Раздел</dt><dd>${safe(orderVariantExecutionLabel(variant,order))}</dd></div><div><dt>Конструкция</dt><dd>${safe(orderVariantConstructionLabel(variant,order))}</dd></div><div><dt>Количество</dt><dd>${units}</dd></div><div><dt>Сумма</dt><dd>${amount===null?'Стоимость уточняется':rubles(amount)}</dd></div></dl></div></article>`}).join('')}</div></section>`;
  }
  function detailPage(){
    const order=myOrders().find(item=>item.id===state.orderId);
    if(!order)return ordersPage();
    if(state.filesFor!==order.id){state.filesFor=order.id;state.orderFiles=[];state.orderFolderUrl='';loadOrderFiles(order.id).then(result=>{if(state.orderId===order.id&&isActive()){state.orderFiles=result.files||[];state.orderFolderUrl=result.folderUrl||'';render()}}).catch(()=>{})}
    const baseStages=isCadOperator()?stages.filter(stage=>stage!=='Препрод'):order.productionType==='analog'?stages.filter(stage=>!['Моделирование','Согласование CAD'].includes(stage)):stages.filter(stage=>stage!=='Препрод');
    const workerQualityKind=order.qualityRequest?.kind,workerQualityTimeline=order.stage==='Контроль качества'&&workerQualityKind;
    const workerQualityAfter={cad:'Моделирование',preprod:'Препрод',cam:'Изготовление',esthetic:'Изготовление',final:'Изготовление'}[workerQualityKind];
    const overallStages=workerQualityTimeline?baseStages.flatMap(stage=>stage===workerQualityAfter?[stage,workerQualityStageTitle(workerQualityKind)]:[stage]):baseStages;
    const index=workerQualityTimeline?overallStages.indexOf(workerQualityStageTitle(workerQualityKind)):order.stage==='Работа принята'?overallStages.indexOf('Контроль качества'):overallStages.indexOf(order.stage);
    const events=orderHistory().filter(event=>event.orderId===order.id).slice().reverse();
    const employee=current(),cadWorker=isCadOperator(),preprodWorker=!cadWorker&&isPreprod(),frameWorker=!cadWorker&&!preprodWorker&&isFrameEmployee(employee),painterWorker=!cadWorker&&!preprodWorker&&isPainterEmployee(employee),techStatus=cadWorker?workerStageLabel(order):technicianStatus(order);
    const nextByStage=cadWorker?{'Ожидает распределения':'Подготовка','Подготовка':'Моделирование'}:preprodWorker?{'Подготовка':'Препрод'}:{};
    // После передачи на ОТК CAD-оператор больше не может менять этап: решение принимает главный техник.
    const previousByStage=cadWorker?{'Моделирование':'Подготовка'}:preprodWorker?{'Препрод':'Подготовка'}:{};
    const next=nextByStage[order.stage]||'',canAdvance=false,canRollback=Boolean(previousByStage[order.stage]);
    const preprodActionAllowed=preprodWorker&&order.stage==='Препрод';
    const productionActionAllowed=!cadWorker&&!preprodWorker&&order.stage==='Изготовление'&&((frameWorker&&order.manufacturingStatus===manufacturingStatuses[0])||(painterWorker&&order.manufacturingStatus===manufacturingStatuses[1]));
    const canAccept=techStatus==='Ожидает принятия'&&(!frameWorker||camCanAccept(order))&&(cadWorker?order.stage==='Подготовка':preprodWorker?order.stage==='Подготовка'||order.stage==='На доработке':productionActionAllowed||order.stage==='На доработке');
    const technicianActions=canAccept
      ?`<button class="btn primary" data-worker-action="accept" data-order-id="${safe(order.id)}">Принять в работу</button>`
      :preprodActionAllowed&&techStatus==='В работе'
      ?`<button class="btn primary" data-worker-action="advance" data-order-id="${safe(order.id)}">Передать в ОТК</button>`
      :productionActionAllowed&&techStatus==='В работе'&&(!frameWorker||camCanSubmitQuality(order))
      ?`<button class="btn primary" data-worker-action="advance" data-order-id="${safe(order.id)}">Отправить на ОТК</button>`
      :'';
    const cad=order.cadReview||{},cadReturned=cad.status==='returned';
    const reviewAttachments=(cad.attachments||[]).map(file=>`<button type="button" class="tech-review-attachment" data-worker-file="${safe(file.id)}"><span>📎</span><strong>${safe(file.name)}</strong><small>${safe(file.type||'Файл')}</small></button>`).join('');
    const cadUpload=order.stage==='Моделирование'?`<section class="tech-panel cad-worker-panel ${cadReturned?'returned':''}"><h3>${cadReturned?'Врач вернул CAD':'Согласование CAD с врачом'}</h3>${cadReturned?`<p><strong>Комментарий врача:</strong> ${safe(cad.comment||'Нужно внести изменения')}</p>${reviewAttachments?`<div class="tech-review-attachments"><span>Прикреплённые файлы</span>${reviewAttachments}</div>`:''}`:'<p>Загрузите готовый HTML-файл. Сначала его проверит главный техник, затем файл уйдёт врачу.</p>'}<label class="btn primary">${cadReturned?'Загрузить исправленный CAD':'Загрузить HTML и отправить на ОТК'}<input type="file" id="worker-cad-file" accept=".html,text/html" hidden></label></section>`:'';
    const folderAction=state.orderFolderUrl?`<a class="btn outline" href="${safe(state.orderFolderUrl)}" target="_blank" rel="noopener noreferrer">Открыть папку</a>`:'<span class="tech-empty">Папка создаётся…</span>';
    const uploadBusy=state.orderUpload.orderId===order.id&&state.orderUpload.status==='uploading';
    const uploadAction=`<label class="btn outline ${uploadBusy?'disabled':''}">${uploadBusy?'Загрузка…':'Загрузить файлы'}<input type="file" id="worker-order-upload" data-order-id="${safe(order.id)}" multiple hidden ${uploadBusy?'disabled':''}></label>`;
    const orderUploadNote=state.orderUpload.orderId===order.id&&state.orderUpload.message?`<small class="tech-order-upload-note">${safe(state.orderUpload.message)}</small>`:'';
    const orderFolderMarkup=`<div class="tech-order-files"><h3>Файлы заказа</h3><div class="order-folder-link"><div><strong>Папка заказа на Яндекс Диске</strong><small>Все файлы заказа собраны в одном месте</small></div><div class="order-folder-actions">${folderAction}${uploadAction}</div></div>${orderUploadNote}</div>`;
    const cadFiles=state.orderFiles.filter(file=>file.purpose==='cad-review'&&/\.html$/i.test(file.name));
    const cadModelMarkup=isCadOperator()&&cadFiles.length?`<section class="tech-panel tech-cad-model"><div class="tech-panel-heading"><div><h3>CAD-модель</h3><p>Загруженный HTML-файл для повторного просмотра.</p></div><span class="tech-stage ${order.cadReview?.status==='approved'?'ready':order.cadReview?.status==='returned'?'review':'work'}">${order.cadReview?.status==='approved'?'Подтверждено':order.cadReview?.status==='returned'?'Доработка и эстетика':'CAD на согласовании у врача'}</span></div>${cadFiles.slice(-1).map(file=>`<div class="tech-cad-file"><strong>${safe(file.name)}</strong><small>${file.uploadedAt?new Date(file.uploadedAt).toLocaleString('ru-RU'):'CAD-файл'}</small><button class="btn outline" data-worker-action="open-cad" data-order-id="${safe(order.id)}" data-file-id="${safe(file.id)}">Открыть CAD</button></div>`).join('')}</section>`:'';
    const cadPreview=state.cadPreview?.orderId===order.id?`<div class="cad-preview-backdrop" data-worker-modal="cad-preview"><section class="cad-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="worker-cad-preview-title"><header><div><h2 id="worker-cad-preview-title">${safe(state.cadPreview.name||'CAD')}</h2><p>Интерактивный предпросмотр из HTML-файла</p></div><button data-worker-action="close-cad" aria-label="Закрыть">×</button></header><iframe id="worker-cad-preview-frame" src="${safe(state.cadPreview.url||'')}" sandbox="allow-scripts allow-same-origin allow-pointer-lock" referrerpolicy="no-referrer" title="Предпросмотр CAD"></iframe></section></div>`:'';
        return `<a href="${pathFor('worker','orders')}" class="tech-back" data-worker-page="orders">← Мои заказы</a><div class="tech-heading"><div><span class="tech-eyebrow">${safe(order.clinic)} · срок ${safe(order.date)}</span><h1>Заказ ${safe(displayOrderId(order))}</h1><p>${safe(orderWorkLabel(order))} · ${safe(order.patient)}</p></div><span class="tech-stage ${tone(order.stage)}">${safe(workerDisplayStatus(workerStageLabel(order)))}</span></div><div class="tech-detail-grid"><section class="tech-panel"><h2>Данные работы</h2><div class="tech-facts"><div><span>Клиника</span><strong>${safe(order.clinic)}</strong></div><div><span>Пациент</span><strong>${safe(order.patient)}</strong></div><div><span>Тип работы</span><strong>${order.productionType==='analog'?'Аналоговый':'Цифровой'}</strong></div><div><span>Раздел</span><strong>${safe(orderExecutionLabel(order))}</strong></div><div><span>Конструкция</span><strong>${safe(orderConstructionLabel(order))}</strong></div><div><span>Создан</span><strong>${shortDate(order.createdAt)}</strong></div><div><span>Срок сдачи</span><strong>${safe(order.date)}</strong></div><div><span>Приоритет</span><strong>${safe(order.priority)}</strong></div><div><span>Номера зубов</span><strong>${order.teeth.join(', ')||'Не указаны'}</strong></div></div>${orderServiceCards(order)}</section><div class="worker-detail-side"><section class="tech-panel"><h2>Ход выполнения</h2><div class="tech-stage-progress" data-worker-stage-progress><div class="tech-progress-head"><span>Прогресс этапа</span><b data-worker-stage-progress-value>0%</b></div><div class="tech-progress-track"><i data-worker-stage-progress-bar style="width:0%"></i></div></div><ol class="tech-timeline">${overallStages.map((stage,position)=>`<li class="${position<index?'done':position===index?'current':''}"><i></i><span>${workerDisplayStage(stage,order)}</span></li>`).join('')}</ol><div class="tech-detail-actions">${canRollback?`<button class="btn outline" data-worker-action="rollback" data-order-id="${safe(order.id)}">Вернуть на предыдущий статус</button>`:''}${technicianActions}${order.stage==='На доработке'?`<p>${safe(order.reworkReason||'Клиника запросила доработку')}</p>`:order.stage==='Согласование CAD'?'<p>CAD отправлен врачу. Дождитесь подтверждения или комментария.</p>':canAdvance?`<button class="btn primary" data-worker-action="advance" data-order-id="${safe(order.id)}">${next==='Контроль качества'?'Передать на проверку':'Перейти к этапу «'+next+'»'}</button>`:order.stage==='Моделирование'?'<p>Загрузите HTML-файл и отправьте его главному технику на ОТК. После одобрения CAD уйдёт врачу.</p>':order.stage==='Контроль качества'?'<p>Работа передана главному технику на проверку.</p>':['Работа принята','Готово к выдаче'].includes(order.stage)?'<p>Работа принята главным техником.</p>':order.stage==='В доставке'?'<p>Заказ в доставке.</p>':order.stage==='Принято доктором'?'<p class="tech-status-note">Работа принята доктором.</p>':technicianActions?'':'<p>Дождитесь назначения работы.</p>'}</div></section>${orderFolderMarkup}${cadUpload}${cadModelMarkup}</div></div>${cadPreview}`;
  }
  function profile(){
    const profile=workerProfile();
    const field=(label,name,value='',type='text',required=false,placeholder='',locked=false)=>`<label>${label}<input name="${name}" type="${type}" value="${safe(value)}" ${placeholder?`placeholder="${safe(placeholder)}"`:''} ${required?'required':''} ${locked?'disabled aria-disabled="true"':''}></label>`;
    const pairing=state.telegramPairing?`<div class="worker-telegram-pairing"><strong>Код: ${safe(state.telegramPairing.code)}</strong><small>Откройте бота сотрудников и отправьте ему команду <b>${safe(state.telegramPairing.command)}</b>. Код действует 10 минут.</small>${state.telegramPairing.deepLink?`<a class="btn outline" href="${safe(state.telegramPairing.deepLink)}" target="_blank" rel="noopener">Открыть бота</a>`:''}</div>`:'';
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОФИЛЬ</span><h1>Мои данные</h1></div></div><section class="tech-panel tech-profile-editor"><div class="tech-profile-avatar">${avatarMarkup(profile,'large')}<label class="btn outline">Загрузить аватар<input id="worker-profile-avatar" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>${profile.avatar?'<button class="tech-link" data-worker-avatar="remove">Убрать аватар</button>':''}</div><form id="worker-profile-form" class="tech-client-form"><p class="tech-profile-note">Имя, специализация, телефон и почта изменяются главным техником.</p><div class="worker-rate-note"><strong>Ранг ${employeeRank(current())} из 5</strong><div class="worker-rate-copy"><p>Вознаграждение за каждую услугу задаёт главный техник.</p><a href="${pathFor('worker','salary')}" class="tech-link" data-worker-page="salary">Мои ставки и начисления →</a></div></div>${field('Имя и фамилия','name',profile.name||profile.displayName||'','text',true,'',true)}${field('Специализация','specialty',workerSpecialtyDisplayLabel(profile),'text',false,'',true)}${field('Телефон','phone',profile.phone||'','tel',false,'',true)}${field('Электронная почта','email',profile.email||'','email',true,'',true)}${field('Новый пароль','password','','password',false,'Оставьте пустым, если менять не нужно')}${field('Повторите пароль','passwordConfirm','','password',false,'')}<div class="tech-client-form-actions"><button type="submit" class="btn primary">Сохранить пароль</button></div></form></section><section class="tech-panel worker-telegram-panel"><div class="tech-panel-heading"><div><h2>Telegram для работы</h2><p>Получайте назначенные заказы и принимайте их в работу прямо в новом боте сотрудников.</p></div><button class="btn primary" data-worker-telegram="connect">Подключить Telegram</button></div>${pairing}</section>`;
  }
  function portalFooter(){return `<footer class="portal-footer"><span class="portal-footer-copy">© 2019–2026 Create Dental</span><span class="portal-footer-tagline">Для клиник, которым важен результат</span><a class="portal-footer-email" href="mailto:orders@createdental.io">orders@createdental.io</a><nav class="portal-footer-legal" aria-label="Правовые документы"><a href="/assets/legal/privacy.html">Политика конфиденциальности</a><a href="/assets/legal/consent-data.html">Согласие на обработку персональных данных</a></nav></footer>`}
  function shell(content){
    const employee=current();
    const profile=workerProfile();
    const cabinetLabel=workerCabinetLabel(employee);
    const avatar=profile.avatar?`<span class="avatar"><img src="${safe(profile.avatar)}" alt=""></span>`:`<span class="avatar">${safe(initials(employee?.name||'Техник'))}</span>`;
    const nav=[['overview','Главная','home'],['orders','Мои заказы','orders'],['tasks','Задачи','check',tasks().filter(task=>task.assigneeId===employee.id&&task.status!=='done').length],['salary','Зарплата','wallet'],['profile','Мой профиль','user']];
    const mobileItems=nav.slice(0,4),moreActive=!mobileItems.some(([page])=>state.page===page||state.page==='detail'&&page==='orders');
    const mobileNav=`<nav class="mobile-bottom-nav" aria-label="Основная навигация">${mobileItems.map(([page,label,ico,count])=>`<a class="mobile-bottom-item ${state.page===page||state.page==='detail'&&page==='orders'?'active':''}" href="${pathFor('worker',page)}" data-worker-page="${page}" aria-label="${label}" ${state.page===page||state.page==='detail'&&page==='orders'?'aria-current="page"':''}>${icon(ico,20)}<span>${label==='Мои заказы'?'Заказы':label}</span>${count?`<i class="mobile-nav-count">${count>99?'99+':count}</i>`:''}</a>`).join('')}<button type="button" class="mobile-bottom-item ${moreActive?'active':''}" data-worker-action="menu" aria-label="Ещё разделы" ${moreActive?'aria-current="page"':''}>${icon('more',20)}<span>Ещё</span></button></nav>`;
    root().innerHTML=`<aside class="sidebar tech-sidebar ${sidebarCollapsed()?'sidebar-collapsed':''}" id="worker-sidebar"><a href="${pathFor('worker','overview')}" class="brand brand-home" data-worker-page="overview" aria-label="На главную"><img class="portal-logo" src="${logo}" alt="Create Dental"></a>${sidebarCollapseMarkup()}<div class="tech-side-label">${cabinetLabel}</div><nav class="sidebar-nav">${nav.map(([page,label,ico])=>`<a class="nav-link ${state.page===page||state.page==='detail'&&page==='orders'?'active':''}" href="${pathFor('worker',page)}" data-worker-page="${page}" data-sidebar-label="${label}" title="${label}">${icon(ico,20)}<span>${label}</span></a>`).join('')}</nav><button type="button" class="mobile-sidebar-logout" data-auth-logout>↪ <span>Выйти из кабинета</span></button></aside><button type="button" class="mobile-drawer-backdrop" data-worker-action="menu-close" aria-label="Закрыть меню"></button><div class="shell tech-shell ${sidebarCollapsed()?'sidebar-shell-collapsed':''}"><header class="topbar"><button class="mobile-menu" data-worker-action="menu" aria-label="Открыть меню">☰</button><div class="topbar-spacer"></div>${languageSwitcherMarkup()}${themeToggleMarkup()}${notificationCenterMarkup()}<button class="role-toggle" data-auth-logout>Выйти</button><a href="${pathFor('worker','profile')}" class="profile" data-worker-page="profile">${avatar}<span><strong>${safe(employee?.name||profile.displayName||'Техник')}</strong><small>${safe(workerSpecialtyLabel(employee))}</small></span>${icon('chevron',13)}</a></header><main class="content tech-content">${content}</main>${portalFooter()}</div>${mobileNav}<div class="toast ${state.toast?'visible':''}</div>`;
  }
  function arrangeWorkerHistory(){
    if(state.page!=='detail')return;
    const order=myOrders().find(item=>item.id===state.orderId)||{};
    const grid=root().querySelector('.tech-detail-grid');
    if(!grid)return;
    const dataPanel=Array.from(grid.children).find(node=>node.matches('section.tech-panel'));
    const side=Array.from(grid.children).find(node=>node.classList.contains('worker-detail-side'));
    if(!dataPanel||!side)return;
    const main=document.createElement('div');main.className='tech-order-main';dataPanel.replaceWith(main);main.append(dataPanel);
    const events=orderHistory().filter(event=>event.orderId===state.orderId).slice().reverse();
    const history=document.createElement('section');history.className='tech-panel';history.innerHTML=`<h2>История заказа</h2><ol class="order-history">${events.map(event=>`<li><time>${new Date(event.at).toLocaleString('ru-RU')}</time><strong>${safe(displayActor(event))}</strong><span>${event.action==='stage_changed'?`${safe(event.from)} → ${safe(event.to)}`:event.action==='rework_requested'?`Доработка: ${safe(event.reason)}`:safe(orderEventSummary(order,event)||event.action)}</span></li>`).join('')||'<li>Действий пока нет</li>'}</ol>`;main.append(history);
  }
  function arrangeWorkerSpecialtyUi(){
    const label=root().querySelector('.tech-side-label');
    if(label)label.textContent=workerCabinetLabel(current()).replace('КАБИНЕТ','Кабинет');
    const specialty=root().querySelector('.topbar .profile small');
    if(specialty)specialty.textContent=workerSpecialtyDisplayLabel(current());
  }
  function arrangeProductionTimeline(){
    if(state.page!=='detail')return;
    const order=myOrders().find(item=>item.id===state.orderId);
    const timeline=root().querySelector('.worker-detail-side .tech-timeline');
    if(!order||!timeline)return;
    const stagesForWorker=visibleProductionStages(order),currentIndex=isCadOperator()?stagesForWorker.findIndex(item=>item.matches.includes(order.stage)):stagesForWorker.findIndex(item=>item.label===technicianStatus(order));
    const progress=isFrameEmployee(current())?camWorkflowProgress(order):specialistProgress(isCadOperator()?workerStageLabel(order):technicianStatus(order));
    const progressValue=root().querySelector('[data-worker-stage-progress-value]'),progressBar=root().querySelector('[data-worker-stage-progress-bar]');
    if(progressValue)progressValue.textContent=`${progress}%`;
    if(progressBar)progressBar.style.width=`${progress}%`;
    timeline.innerHTML=stagesForWorker.map((item,index)=>`<li class="${index<currentIndex?'done':index===currentIndex?'current':''} ${index===stagesForWorker.length-1&&index===currentIndex?'final':''}"><i></i><span>${safe(isCadOperator()&&index===currentIndex&&order.cadReview?.status==='returned'?'Возвращено на доработку':item.label)}</span></li>`).join('');
    if(!isCadOperator())root().querySelector('.cad-worker-panel')?.remove();
    const badge=root().querySelector('.tech-heading .tech-stage');
    if(badge)badge.textContent=workerDisplayStatus(workerDisplayStage(workerStageLabel(order)));
    const note=root().querySelector('.tech-detail-actions p');
    if(note&&order.stage==='Согласование CAD')note.textContent='Моделировщик должен загрузить HTML и отправить CAD врачу.';
    if(note&&order.stage==='Моделирование')note.textContent='Моделирование работы выполняется.';
    if(note&&isCadOperator()&&order.stage==='Изготовление')note.textContent='CAD одобрен врачом и передан зубному технику.';
  }
  function render(){
    const route=routeFromPath(location.pathname);
    if(route.role==='worker'){
      state.page=route.page;
      if(route.orderId){
        state.orderId=resolveOrderId(route.orderId,myOrders());
        const canonical=pathFor('worker','detail',state.orderId);
        if(location.pathname!==canonical)navigate(canonical,{replace:true});
      }
    }
    const employee=current();
    if(!employee){shell(`<div class="tech-heading"><div><span class="tech-eyebrow">КАБИНЕТ ТЕХНИКА</span><h1>Доступ недоступен</h1><p>Выбранный сотрудник отключён, уволен или отсутствует.</p></div></div>`);return}
    shell(({overview,orders:ordersPage,tasks:tasksPage,detail:detailPage,salary:salaryPage,profile}[state.page]||overview)());
    if(['overview','salary'].includes(state.page))queueMicrotask(()=>payrollUI.load());
    const cadFrame=root().querySelector('#worker-cad-preview-frame');if(cadFrame&&state.cadPreview?.url)cadFrame.src=state.cadPreview.url;
    arrangeWorkerSpecialtyUi();
    arrangeWorkerHistory();
    arrangeProductionTimeline();
  }
  document.addEventListener('click',async event=>{
    if(!isActive())return;
    const sidebarToggle=event.target.closest('[data-worker-sidebar-toggle]');
    if(sidebarToggle){try{localStorage.setItem('create-dental-sidebar-collapsed',sidebarCollapsed()?'0':'1')}catch{};render();return}
    if(root().querySelector('.notification-panel')&&!event.target.closest('.notification-center')){closeNotificationCenter();root().querySelector('.notification-panel')?.remove()}
    if(event.target.closest('[data-notification-toggle]')){await toggleNotificationCenter();render();return}
    if(event.target.closest('[data-notification-close]')){closeNotificationCenter();render();return}
    const notification=event.target.closest('[data-notification-id]');
    if(notification){const orderId=notification.dataset.notificationOrder;await markNotificationCenterRead().catch(()=>{});closeNotificationCenter();if(orderId&&myOrders().some(order=>order.id===orderId)){state.orderId=orderId;setPage('detail')}else setPage('overview');return}
    if(state.orderFilterOpen&&!event.target.closest('.tech-order-filter-panel')&&!event.target.closest('[data-worker-filter-panel]')){state.orderFilterOpen=false;render();return}
    const filterAction=event.target.closest('[data-worker-filter-panel]');
    if(filterAction){const action=filterAction.dataset.workerFilterPanel;if(action==='toggle')state.orderFilterOpen=!state.orderFilterOpen;else if(action==='reset'){state.orderClinicFilter='';state.orderMonthFilter='';state.orderFilterOpen=false}else if(action==='close')state.orderFilterOpen=false;render();return}
    const modal=event.target.closest('[data-worker-modal]');
    if(modal&&event.target===modal){if(modal.dataset.workerModal==='cad-preview'){cadPreviewRequest++;if(state.cadPreview?.url)URL.revokeObjectURL(state.cadPreview.url)}state.cadPreview=null;render();return}
    const cadAction=event.target.closest('[data-worker-action]');
    if(cadAction?.dataset.workerAction==='open-cad'){
      const orderId=cadAction.dataset.orderId,fileId=cadAction.dataset.fileId,order=myOrders().find(item=>item.id===orderId);
      if(!orderId||!fileId||!order)return;
      const requestId=++cadPreviewRequest;
      state.cadPreview={orderId,fileId,name:'Загрузка CAD…',html:'',url:''};render();
      try{
        const file=state.orderFiles.find(item=>item.id===fileId),url=await loadCadPreviewSource(orderId,fileId);
        if(requestId!==cadPreviewRequest||!state.cadPreview||state.cadPreview.fileId!==fileId)return;
        state.cadPreview={orderId,fileId,name:file?.name||'CAD',html:'',url};render();
      }catch(error){if(requestId!==cadPreviewRequest)return;state.cadPreview=null;toast(error.message||'Не удалось открыть CAD');render()}
      return;
    }
    if(cadAction?.dataset.workerAction==='close-cad'){cadPreviewRequest++;if(state.cadPreview?.url)URL.revokeObjectURL(state.cadPreview.url);state.cadPreview=null;render();return}
    const orderStatus=event.target.closest('[data-worker-order-filter]');
    if(orderStatus){state.orderStatusFilter=orderStatus.dataset.workerOrderFilter;render();return}
    const reviewFile=event.target.closest('[data-worker-file]');
    if(reviewFile){try{await downloadOrderFile(reviewFile.dataset.workerFile)}catch(error){toast(error.message)}return}
    const sort=event.target.closest('[data-worker-sort]');
    if(sort){const key=sort.dataset.workerSort;state.sortDirection=state.sortKey===key&&state.sortDirection==='asc'?'desc':'asc';state.sortKey=key;render();return}
    const avatar=event.target.closest('[data-worker-avatar]');
    if(avatar?.dataset.workerAvatar==='remove'){saveWorkerProfile({avatar:''},'Аватар удалён').catch(error=>toast(error.message));return}
    const telegram=event.target.closest('[data-worker-telegram]');
    if(telegram?.dataset.workerTelegram==='connect'){telegram.disabled=true;try{const response=await fetch('/api/employee-telegram/pair',{method:'POST',headers:{'X-Portal-Token':portalToken()},cache:'no-store'}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Не удалось создать код подключения');state.telegramPairing=data.pairing;render()}catch(error){toast(error.message)}finally{if(telegram.isConnected)telegram.disabled=false}return}
    const action=event.target.closest('[data-worker-action]');
    if(action){
      if(action.dataset.workerAction==='menu'){root().querySelector('#worker-sidebar')?.classList.toggle('open');return}
      if(action.dataset.workerAction==='menu-close'){root().querySelector('#worker-sidebar')?.classList.remove('open');return}
      if(['accept','advance','rollback','resume-rework','start-work'].includes(action.dataset.workerAction)){
        const employee=current();
        const order=myOrders().find(item=>item.id===action.dataset.orderId);
        const index=order&&stages.indexOf(order.stage);
        if(!employee||!order)return;
        const cadWorker=isCadOperator(),preprodWorker=!cadWorker&&isPreprod(employee),frameWorker=!cadWorker&&!preprodWorker&&isFrameEmployee(employee),category1Worker=!cadWorker&&!preprodWorker&&!frameWorker&&isCategory1Employee(employee),painterWorker=!cadWorker&&!preprodWorker&&!frameWorker&&!category1Worker&&isPainterEmployee(employee),statusField=cadWorker?'cadOperatorStatus':preprodWorker?'preprodTechnicianStatus':frameWorker?'frameTechnicianStatus':category1Worker?'category1TechnicianStatus':'painterStatus';
        const preprodActionAllowed=preprodWorker&&order.stage==='Препрод';
        const productionActionAllowed=!cadWorker&&!preprodWorker&&!category1Worker&&order.stage==='Изготовление'&&((frameWorker&&order.manufacturingStatus===manufacturingStatuses[0])||(painterWorker&&order.manufacturingStatus===manufacturingStatuses[1]));
        const category1ActionAllowed=category1Worker&&order.stage==='Техник первой категории';
        if(action.dataset.workerAction==='accept'){
          const waiting=(cadWorker?workerStageLabel(order):technicianStatus(order))==='Ожидает принятия';
          const allowed=waiting&&(!frameWorker||camCanAccept(order))&&(cadWorker?order.stage==='Подготовка':preprodWorker?order.stage==='Подготовка'||order.stage==='На доработке':category1Worker?category1ActionAllowed||order.stage==='На доработке':productionActionAllowed||order.stage==='На доработке');
          if(!allowed)return;
          const overrides=readOrders(),current=overrides[order.id]||{},rework=order.stage==='На доработке',stage=cadWorker?'Моделирование':preprodWorker?'Препрод':category1Worker?'Техник первой категории':'Изготовление';
          const change={stage,[statusField]:'В работе',technicianStatus:'В работе',workerAcceptances:{...(order.workerAcceptances||{}),[employee.id]:{at:new Date().toISOString(),name:employee.name,role:cadWorker?'cad':preprodWorker?'preprod':category1Worker?'category1':painterWorker?'painter':'frame'}}};
          if(cadWorker)change.cadOperatorStatus='В работе';
          if(preprodWorker)change.preprodTechnicianStatus='В работе';
          if(painterWorker){change.painterStatus='В работе';change.ceramicistStatus='В работе'}
          if(!cadWorker&&!preprodWorker&&!category1Worker&&!rework)change.manufacturingStatus=order.manufacturingStatus||manufacturingStatuses[0];
          if(rework)change.manufacturingStatus=order.reworkKind==='esthetic'?manufacturingStatuses[1]:order.reworkKind==='preprod'?'':manufacturingStatuses[0];
          overrides[order.id]={...current,...change};
          localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
          savePortal('orderOverrides',overrides).catch(error=>{render();toast('Не удалось сохранить статус на сервере: '+error.message)});
          render();
          return;
        }
        if(action.dataset.workerAction==='start-work'){
          if(!(preprodActionAllowed||productionActionAllowed||category1ActionAllowed)||technicianStatus(order)!=='Принял работу')return;
          const overrides=readOrders();
          overrides[order.id]={...(overrides[order.id]||{}),[statusField]:'В работе',technicianStatus:'В работе'};
          localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
          savePortal('orderOverrides',overrides).catch(error=>{render();toast('Не удалось сохранить статус на сервере: '+error.message)});
          render();
          return;
        }
        if(action.dataset.workerAction==='advance'&&preprodActionAllowed&&technicianStatus(order)==='В работе'){
          const overrides=readOrders();
          const qualityRequest={kind:'preprod',employeeId:employee.id,requestedBy:employee.originalName,requestedByName:employee.name,requestedAt:new Date().toISOString(),next:'Моделирование (CAD)'};
          const change={stage:'Контроль качества',preprodTechnicianStatus:'ОТК',technicianStatus:'ОТК',qualityRequest};
          overrides[order.id]={...(overrides[order.id]||{}),...change};
          localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
          savePortal('orderOverrides',overrides).catch(error=>{render();toast('Не удалось сохранить статус на сервере: '+error.message)});
          render();
          return;
        }
        if(action.dataset.workerAction==='advance'&&category1ActionAllowed&&technicianStatus(order)==='В работе'){
          const overrides=readOrders(),qualityRequest={kind:'category1',employeeId:employee.id,requestedBy:employee.originalName,requestedByName:employee.name,requestedAt:new Date().toISOString(),next:'Финальная приёмка'},change={stage:'Контроль качества',category1TechnicianStatus:'ОТК',technicianStatus:'ОТК',qualityRequest};
          overrides[order.id]={...(overrides[order.id]||{}),...change};localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));savePortal('orderOverrides',overrides).catch(error=>{render();toast('Не удалось сохранить этап на сервере: '+error.message)});render();return;
        }
        if(action.dataset.workerAction==='advance'&&productionActionAllowed&&technicianStatus(order)==='В работе'&&(!frameWorker||camCanSubmitQuality(order))){
          const overrides=readOrders();
          const qualityRequest={kind:frameWorker?'cam':'esthetic',employeeId:employee.id,requestedBy:employee.originalName,requestedByName:employee.name,requestedAt:new Date().toISOString(),next:frameWorker?'Передача Эстетисту':'Финальная приёмка'};
          const change=frameWorker?{stage:'Контроль качества',frameTechnicianStatus:'ОТК',technicianStatus:'ОТК',qualityRequest}:{stage:'Контроль качества',painterStatus:'ОТК',ceramicistStatus:'ОТК',technicianStatus:'ОТК',qualityRequest};
          overrides[order.id]={...(overrides[order.id]||{}),...change};
          localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
          savePortal('orderOverrides',overrides).catch(error=>{render();toast('Не удалось сохранить этап на сервере: '+error.message)});
          render();
          return;
        }
        const nextByStage=cadWorker?{'Ожидает распределения':'Подготовка','Подготовка':'Моделирование'}:preprodWorker?{'Подготовка':'Препрод'}:{};
        // Контроль качества закрыт для ручного отката сотрудником — только главный техник
        // может одобрить работу или вернуть её на доработку.
        const previousByStage=cadWorker?{'Моделирование':'Подготовка'}:preprodWorker?{'Препрод':'Подготовка'}:{};
        if(action.dataset.workerAction==='advance'&&!nextByStage[order.stage])return;
        if(action.dataset.workerAction==='rollback'&&!previousByStage[order.stage])return;
        const overrides=readOrders();
        if(action.dataset.workerAction==='resume-rework'&&order.stage!=='На доработке')return;
        const stage=action.dataset.workerAction==='resume-rework'?(order.reworkKind==='preprod'?'Препрод':'Изготовление'):action.dataset.workerAction==='advance'?nextByStage[order.stage]:previousByStage[order.stage];
        const change={stage,...(action.dataset.workerAction==='rollback'?{[statusField]:'',technicianStatus:''}:{})};
        if(!cadWorker&&stage==='Контроль качества'){change[statusField]='ОТК';change.technicianStatus='ОТК'}
        if(preprodWorker&&action.dataset.workerAction==='resume-rework'){change.preprodTechnicianStatus='В работе';change.technicianStatus='В работе'}
        if(!cadWorker&&action.dataset.workerAction==='resume-rework'){change[statusField]='В работе';change.technicianStatus='В работе';if(order.reworkKind!=='preprod')change.manufacturingStatus=order.reworkKind==='esthetic'?manufacturingStatuses[1]:manufacturingStatuses[0]}
        overrides[order.id]={...(overrides[order.id]||{}),...change};
        localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
        savePortal('orderOverrides',overrides).catch(error=>{render();toast('Не удалось сохранить этап на сервере: '+error.message)});
        render();
      }
      return;
    }
    const page=event.target.closest('[data-worker-page]');
    if(page){if(page.matches('a[href]')){const modified=event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0;if(modified)return;event.preventDefault();}root().querySelector('#worker-sidebar')?.classList.remove('open');setPage(page.dataset.workerPage);return}
    const order=event.target.closest('[data-worker-order]');
    if(order){state.orderId=order.dataset.workerOrder;setPage('detail')}
  });
  document.addEventListener('input',event=>{
    if(!isActive()||event.target.id!=='tech-search'||state.page!=='orders')return;
    state.orderSearch=event.target.value;
    const table=root().querySelector('.worker-table')?.closest('.tech-table-wrap');
    if(table)table.outerHTML=orderList(filteredWorkerOrders());
  });
  document.addEventListener('change',event=>{
    if(!isActive())return;
    if(event.target.matches('[data-worker-task-status]')){
      const id=event.target.dataset.workerTaskStatus,task=tasks().find(item=>item.id===id),employee=current();
      if(!employee||!task||task.assigneeId!==employee.id)return;
      const next=tasks().map(task=>task.id===id?{...task,status:event.target.value,updatedAt:new Date().toISOString(),completedAt:event.target.value==='done'?new Date().toISOString():''}:task);
      savePortal('tasks',next).then(()=>{tasks().splice(0,tasks().length,...next);toast('Статус задачи обновлён');render()}).catch(error=>{toast('Не удалось обновить задачу: '+error.message);render()});
      return;
    }
    if(event.target.id==='worker-order-clinic-filter'){state.orderClinicFilter=event.target.value;state.orderFilterOpen=true;render();return}
    if(event.target.id==='worker-order-month-filter'){state.orderMonthFilter=event.target.value;state.orderFilterOpen=true;render();return}
    if(event.target.id==='worker-cad-file'){
      const order=myOrders().find(item=>item.id===state.orderId),file=event.target.files?.[0];event.target.value='';
      if(!order||!file)return;
      if(!/\.html$/i.test(file.name)||file.size>200*1024*1024){state.cadUpload={orderId:order.id,status:'error',message:'Выберите HTML-файл размером до 200 МБ.'};render();return}
      state.cadUpload={orderId:order.id,status:'uploading',message:`Загружаем «${file.name}». Не закрывайте страницу…`};render();
      (async()=>{try{const uploaded=await uploadOrderFile(order.id,file,{purpose:'cad-review'});state.cadUpload={orderId:order.id,status:'uploading',message:'Файл загружен. Отправляем главному технику на ОТК…'};render();const result=await submitCadReview(order.id,uploaded.id),overrides=readOrders();if(result.orderOverride){overrides[order.id]=result.orderOverride;localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides))}state.filesFor='';state.cadUpload={orderId:order.id,status:'success',message:'CAD отправлен главному технику на проверку.'};toast('CAD отправлен на ОТК');render()}catch(error){state.cadUpload={orderId:order.id,status:'error',message:error.message||'Не удалось загрузить CAD-файл. Попробуйте ещё раз.'};render()}})();return;
    }
    if(event.target.id==='worker-order-upload'){
      const order=myOrders().find(item=>item.id===state.orderId),files=Array.from(event.target.files||[]);event.target.value='';
      if(!order||!files.length)return;
      const allowed=files.filter(file=>file.size<=200*1024*1024).slice(0,10);
      if(!allowed.length){toast('Файлы должны быть размером до 200 МБ');return}
      if(allowed.length<files.length)toast('Можно загрузить до 10 файлов, каждый до 200 МБ');
      state.orderUpload={orderId:order.id,status:'uploading',message:`Загружаем ${allowed.length} ${allowed.length===1?'файл':'файла'} на Яндекс Диск…`};render();
      (async()=>{let uploaded=0;try{for(const file of allowed){await uploadOrderFile(order.id,file,{purpose:'order-file'});uploaded++}state.filesFor='';state.orderUpload={orderId:order.id,status:'success',message:`Загружено файлов: ${uploaded}`};toast('Файлы загружены на Яндекс Диск');render()}catch(error){state.orderUpload={orderId:order.id,status:'error',message:`Загружено ${uploaded} из ${allowed.length}. ${error.message||'Ошибка загрузки'}`};render()}})();
      return;
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
    const name=profile.name||profile.displayName||'Техник';
    const specialty=profile.specialty||'';
    const phone=profile.phone||'';
    const email=profile.email||'';
    const password=form.elements.namedItem('password').value;
    const passwordConfirm=form.elements.namedItem('passwordConfirm').value;
    if(password&&password.length<8)return toast('Пароль должен быть от 8 символов');
    if(password!==passwordConfirm)return toast('Пароли не совпадают');
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{await saveWorkerProfile({name,specialty,phone,email,password,avatar:profile.avatar||''},'Пароль сохранён')}catch(error){toast(error.message)}finally{button.disabled=false}
  });
  document.addEventListener('keydown',event=>{
    if(!isActive())return;
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('tr[data-worker-order]')){event.preventDefault();event.target.click()}
  });
  return {render};
}
