import {createWorkerMobileUI} from './assets/worker-mobile-ui.js?v=worker-mobile-1';
import {createPayrollUI} from './payroll-ui.js?v=salary-ranks-2';
import {employeeRank} from './payroll.js?v=salary-ranks-2';
import {camWorkflowStages,camWorkflowStatus,camWorkflowProgress,camCanAccept,camCanSubmitQuality} from './cam-workflow.js?v=cam-flow-2';
import {loadEmployees,seedDetails,stages,productionStages,productionStageIndex,productionStageLabel,manufacturingStatuses} from './technician.js?v=salary-ranks-2';
import {portalToken,savePortal,authRequest,loadOrderFiles,loadCadReviewHtml,uploadOrderFile,submitCadReview,downloadOrderFile} from './portal-client.js?v=reliability-retry-1';
import {routeFromPath,pathFor,navigate} from './routes.js?v=order-route-1';
import {notificationCenterMarkup,toggleNotificationCenter,closeNotificationCenter,markNotificationCenterRead} from './notification-center.js?v=reliability-retry-1';
import {workCatalog,rubles,estimateWork,priceUnitsForSelection} from './work-catalog.js?v=jaw-price-1';
import {themeToggleMarkup,languageSwitcherMarkup} from './theme.js?v=light-only-1';
import {orderWorkLabel,orderEventSummary} from './order-list-utils.js?v=service-label-4';
import {taskStatuses,taskPriorityLabel,taskDateLabel,taskIsOverdue} from './tasks.js?v=task-flow-4';

const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const tone=stage=>['Согласование CAD','Контроль качества'].includes(stage)?'review':['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(stage)?'ready':'work';
const readOrders=()=>{try{return JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}}catch{return {}}};
const initials=value=>String(value||'Т').trim().split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase()||'Т';
const shortDate=value=>value?new Date(value).toLocaleDateString('ru-RU'):'—';
const dateKey=value=>String(value||'').includes('.')?String(value).split('.').reverse().join('-'):String(value||'');
const displayActor=event=>event?.actor||(event?.actorRole==='clinic'?'Клиент':'Create Dental Team');
const isCadOperatorEmployee=employee=>/cad\s*\/?\s*cam|cadcam|cad\s*оператор|моделировщик/i.test(String(employee?.specialty||''));
const workerSpecialtyLabel=employee=>{if(isCadOperatorEmployee(employee))return 'CAD/CAM оператор';const value=String(employee?.specialty||'').trim();if(/гипсов|препрод|pre\s*prod|предпрод/i.test(value))return 'Препрод техник';if(/зубной\s+техник|каркасист|cam\s*оператор/i.test(value)||!value)return 'Каркасист';if(/красильщик|керамист|эстетист/i.test(value))return 'Красильщик';return value};
const workerSpecialtyDisplayLabel=employee=>({'Каркасист':'CAM оператор','Красильщик':'Эстетист','CAD/CAM оператор':'CAD оператор','Препрод техник':'Гипсовщик'}[workerSpecialtyLabel(employee)]||workerSpecialtyLabel(employee));
const workerDisplayStatus=status=>status==='Принял работу'?'В работе':status==='Работа сдана'?'Передал дальше':status;
const workerQualityStageTitle=kind=>({cad:'ОТК — CAD оператор',preprod:'ОТК — препрод техник',cam:'ОТК — CAM оператор',esthetic:'ОТК — эстетист',final:'Финальная ОТК'}[kind]||'ОТК');
const workerDisplayStage=(stage,order)=>stage==='Контроль качества'&&order?.qualityRequest?.kind?workerQualityStageTitle(order.qualityRequest.kind):({'Согласование CAD':'CAD на согласовании у врача','На согласовании':'CAD на согласовании у врача','Работа принята':'Принято врачом','В доставке':'Доставка в клинику','В пути к вам':'Доставка в клинику','Принято доктором':'Принято врачом','Принято':'Принято врачом','Готово к выдаче':'Принято врачом','На доработке':'Доработка и эстетика'}[stage]||stage);
const specialistProgress=status=>({'Ожидает принятия':0,'Принял работу':50,'Принял в работу':50,'В работе':50,'ОТК':75,'Согласование с врачом':90,'Работа сдана':100,'Передал дальше':100}[status]||0);
const isPreprodEmployee=employee=>workerSpecialtyLabel(employee)==='Препрод техник';
const isFrameEmployee=employee=>workerSpecialtyLabel(employee)==='Каркасист';
const isPainterEmployee=employee=>workerSpecialtyLabel(employee)==='Красильщик';
const workerCabinetLabel=employee=>isCadOperatorEmployee(employee)?'КАБИНЕТ CAD ОПЕРАТОРА':isPreprodEmployee(employee)?'КАБИНЕТ ГИПСОВЩИКА':isPainterEmployee(employee)?'КАБИНЕТ ЭСТЕТИСТА':'КАБИНЕТ CAM ОПЕРАТОРА';
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
  const sidebarCollapsed=()=>{try{return localStorage.getItem('create-dental-sidebar-collapsed')==='1'}catch{return false}};
  const sidebarCollapseMarkup=()=>`<button type="button" class="sidebar-collapse-toggle" data-worker-action="sidebar-toggle" aria-label="${sidebarCollapsed()?'Развернуть':'Свернуть'} боковое меню" aria-expanded="${sidebarCollapsed()?'false':'true'}" title="${sidebarCollapsed()?'Развернуть':'Свернуть'} боковое меню">${icon('chevron',16)}</button>`;
  state.orderWorkFilter='';
  const mobileUI=createWorkerMobileUI({
    root,enabled:()=>isActive()&&state.page==='orders',
    getSnapshot:()=>{
      const all=myOrders(),options=key=>[...new Set(all.map(key).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
      return {
        filters:{status:state.orderStatusFilter,work:state.orderWorkFilter,clinic:state.orderClinicFilter,month:state.orderMonthFilter},
        statuses:workerOrderStatusLabels().map(([label,value])=>({label:value==='Все'?'Все заказы':label,value,count:value==='Все'?all.length:all.filter(order=>workerStageLabel(order)===value).length})),
        works:[{label:'Все типы работ',value:''},...options(order=>order.work).map(value=>({label:value,value}))],
        clinics:[{label:'Все клиники',value:''},...options(order=>order.clinic).map(value=>({label:value,value}))],
        months:[{label:'За всё время',value:''},...options(orderMonthKey).reverse().map(value=>({label:orderMonthLabel(value),value}))],
      };
    },
    chooseStatus:status=>{state.orderStatusFilter=status;render()},
    applyFilters:filters=>{state.orderStatusFilter=filters.status;state.orderWorkFilter=filters.work;state.orderClinicFilter=filters.clinic;state.orderMonthFilter=filters.month;state.orderFilterOpen=false;render()},
  });
  const payrollUI=createPayrollUI({root,isActive,worker:true,onSummary:()=>{if(isActive()&&state.page!=='salary')render()}});
  let cadPreviewRequest=0;
  function employees(){return loadEmployees()}
  function current(){
    state.employeeId=currentUser()?.subjectId||'';
    return employees().find(employee=>employee.id===state.employeeId&&employee.status==='active');
  }
  const isCadOperator=()=>isCadOperatorEmployee(current());
  const isPreprod=()=>isPreprodEmployee(current());
  const visibleProductionStages=()=>isCadOperator()?cadOperatorStages:isPreprodEmployee(current())?preprodStages:isFrameEmployee(current())?camWorkflowStages.map(label=>({label})):technicianStages;
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
  function workerOrderData(order,overrides){return {...order,stage:'Ожидает распределения',assignee:'',cadOperator:'',preprodTechnician:'',technician:'',frameTechnician:'',painter:'',ceramicist:'',manufacturingStatus:'',productionType:order.productionType||'digital',priority:'Обычный',teeth:order.teeth||[],clinic:order.clinic||'Dental Clinic',...seedDetails[order.id],...overrides[order.id],painter:overrides[order.id]?.painter||overrides[order.id]?.ceramicist||seedDetails[order.id]?.painter||seedDetails[order.id]?.ceramicist||''}}
  const orderIdKey=value=>String(value??'').trim().replace(/^CD-/i,'').replace(/_W(?=\d+$)/i,'_').toUpperCase();
  const orderMatches=(order,id)=>Boolean(order&&id)&&(order.id===id||orderIdKey(order.id)===orderIdKey(id));
  const findMyOrder=id=>myOrders().find(order=>orderMatches(order,id));
  function productionAssignmentVisible(order,employee){if(isFrameEmployee(employee)&&!order.milling?.completedAt)return false;if(order.stage==='Контроль качества'&&order.qualityRequest)return order.qualityRequest.employeeId===employee.id||order.qualityRequest.requestedBy===employee.originalName;if(order.stage==='На доработке'&&order.reworkKind)return order.reworkKind==='esthetic'?isPainterEmployee(employee):isFrameEmployee(employee);if(isCadOperatorEmployee(employee))return true;
    if(isPreprodEmployee(employee))return order.productionType==='analog'&&['Подготовка','Препрод','Контроль качества','На доработке'].includes(order.stage);if(order.stage!=='Изготовление')return true;if(isPainterEmployee(employee))return order.manufacturingStatus===manufacturingStatuses[1];return order.manufacturingStatus===manufacturingStatuses[0]||order.frameTechnicianStatus==='Работа сдана'}
  function assignedToEmployee(order,employee){return [order.assignee,order.cadOperator,order.preprodTechnician,order.technician,order.frameTechnician,order.painter,order.ceramicist].filter(Boolean).includes(employee.originalName)&&productionAssignmentVisible(order,employee)}
  function myOrders(){const employee=current();if(!employee)return [];const overrides=readOrders();return orders.map(order=>workerOrderData(order,overrides)).filter(order=>assignedToEmployee(order,employee)).filter(order=>isCadOperatorEmployee(employee)?['Ожидает распределения','Подготовка','Моделирование','Контроль качества','Согласование CAD','Изготовление'].includes(order.stage):isPreprodEmployee(employee)?['Подготовка','Препрод','Контроль качества','На доработке'].includes(order.stage):!['Моделирование','Согласование CAD','Препрод'].includes(order.stage))}
  function assignedOrders(){const employee=current();if(!employee)return [];const overrides=readOrders();return orders.map(order=>workerOrderData(order,overrides)).filter(order=>assignedToEmployee(order,employee))}
  function technicianStatus(order){if(isFrameEmployee(current()))return camWorkflowStatus(order);if(isCadOperator())return workerStageLabel(order);if(isPreprodEmployee(current())){if(order.stage==='Контроль качества')return 'ОТК';if(['Изготовление','Работа принята','В доставке','Принято доктором'].includes(order.stage))return 'Работа сдана';if(order.preprodTechnicianStatus)return order.preprodTechnicianStatus;return 'Ожидает принятия';} if(order.stage==='Контроль качества')return 'ОТК';if(['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage))return 'Работа сдана';const status=isPainterEmployee(current())?(order.painterStatus||order.ceramicistStatus):order.frameTechnicianStatus;if(status)return status;if(order.technicianStatus)return order.technicianStatus;return 'Ожидает принятия'}
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
      if(state.orderWorkFilter&&order.work!==state.orderWorkFilter)return false;
      if(state.orderClinicFilter&&order.clinic!==state.orderClinicFilter)return false;
      if(state.orderMonthFilter&&orderMonthKey(order)!==state.orderMonthFilter)return false;
      if(state.orderSearch&&!['id','clinic','work','patient','date','stage','assignee'].some(key=>String(order[key]||'').toLowerCase().includes(state.orderSearch.toLowerCase())))return false;
      return true;
    });
  }
  function workerOrderFilterPanel(all){
    const clinics=[...new Set(all.map(order=>order.clinic).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    const months=[...new Set(all.map(orderMonthKey))].filter(Boolean).sort().reverse();
    const activeCount=(state.orderClinicFilter?1:0)+(state.orderMonthFilter?1:0)+(state.orderWorkFilter?1:0);
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
    if(label==='Ожидает принятия')return order.cadOperatorStatus||order.workerAcceptances?.[current()?.id]?'В работе':'Ожидает принятия';
    return label;
  }
  function orderTeethLabel(order){
    const variants=Array.isArray(order?.variants)?order.variants:[];
    const values=[];
    if(Array.isArray(order?.teeth))values.push(...order.teeth);
    if(Array.isArray(order?.selectedTeeth))values.push(...order.selectedTeeth);
    variants.forEach(variant=>{
      if(Array.isArray(variant?.selectedTeeth))values.push(...variant.selectedTeeth);
      if(Array.isArray(variant?.teeth))values.push(...variant.teeth);
    });
    return [...new Set(values.map(value=>String(value).trim()).filter(Boolean))].join(', ');
  }
  function orderList(list){
    const rows=sortedOrders(list);
    const mobileRows=rows.map(order=>{
      const teeth=orderTeethLabel(order),status=workerDisplayStatus(workerStageLabel(order));
      return `<a class="worker-mobile-order-card" data-worker-order="${safe(order.id)}" href="${safe(pathFor('worker','detail',order.id))}" aria-label="Открыть заказ ${safe(order.id)}"><div class="worker-mobile-order-top"><strong>${safe(order.id)}</strong><span class="tech-stage ${tone(order.stage)}">${safe(status)}</span></div><h3>${safe(order.patient||'Пациент не указан')}</h3><p class="worker-mobile-order-work">${safe(orderWorkLabel(order)||'Работа не указана')}</p><div class="worker-mobile-order-meta"><span>${safe(order.clinic||'Клиника не указана')}</span>${teeth?`<span>Зубы: ${safe(teeth)}</span>`:''}</div><div class="worker-mobile-order-footer"><span>Срок</span><strong>${safe(order.date||'Не указан')}</strong><span class="worker-mobile-order-arrow" aria-hidden="true">→</span></div></a>`;
    }).join('');
    const mobileEmpty='<div class="tech-empty">Назначенных заказов пока нет</div>';
    const desktop=`<div class="worker-desktop-order-table"><table class="tech-table worker-table"><thead><tr><th>Заказ / клиника</th>${sortHeading('createdAt','Создан')}${sortHeading('work','Работа / пациент')}${sortHeading('date','Срок')}${sortHeading('stage','Этап')}<th></th></tr></thead><tbody>${rows.map(order=>`<tr data-worker-order="${safe(order.id)}" tabindex="0" class="tech-order-row"><td><strong>${safe(order.id)}</strong><small>${safe(order.clinic)}</small></td><td>${shortDate(order.createdAt)}</td><td>${safe(orderWorkLabel(order))}<small>${safe(order.patient)}</small></td><td>${safe(order.date)}</td><td><span class="tech-stage ${tone(order.stage)}">${safe(workerDisplayStatus(workerStageLabel(order)))}</span></td><td><button class="tech-link" data-worker-order="${safe(order.id)}">Открыть →</button></td></tr>`).join('')||'<tr><td colspan="6" class="tech-empty">Назначенных заказов пока нет</td></tr>'}</tbody></table></div>`;
    return `<div class="tech-table-wrap worker-orders-wrap"><div class="worker-mobile-order-list">${mobileRows||mobileEmpty}</div>${desktop}</div>`;
  }
  function overview(){
    const employee=current();
    const list=myOrders();
    const working=list.filter(order=>['Принял работу','В работе'].includes(isCadOperator()?workerStageLabel(order):technicianStatus(order)));
    const checking=list.filter(order=>(isCadOperator()?workerStageLabel(order):technicianStatus(order))==='ОТК');
    const done=list.filter(order=>['Работа сдана','Передал дальше'].includes(isCadOperator()?workerStageLabel(order):technicianStatus(order)));
    const earnings=salaryItems(),monthKey=salaryMonthKey(new Date()),currentEarnings=earnings.filter(item=>salaryMonthKey(item.date)===monthKey).reduce((sum,item)=>sum+item.amount,0);
    const salaryCard=`<article class="worker-earnings-card"><span>Доход за месяц</span><strong>${payrollUI.summary()?rubles(currentEarnings):'Загрузка…'}</strong><small>${earnings.length?`${earnings.filter(item=>salaryMonthKey(item.date)===monthKey).length} начислений`:'Начислений пока нет'} · <button data-worker-page="salary">Подробнее →</button></small></article>`;
    return `<div class="tech-heading"><div><span class="tech-eyebrow">МОЙ РАБОЧИЙ КАБИНЕТ</span><h1>Здравствуйте, ${safe(employee.name.split(' ')[0])}</h1><p>Ваши задания и текущие этапы производства.</p></div><span class="tech-demo-note">Личный кабинет</span></div><div class="worker-stats"><article><span>В работе</span><strong>${working.length}</strong><small>Нужно выполнить</small></article><article><span>На проверке</span><strong>${checking.length}</strong><small>У врача или главного техника</small></article><article><span>Готово</span><strong>${done.length}</strong><small>Передал дальше</small></article>${salaryCard}</div><section class="tech-panel"><div class="tech-panel-heading"><div><h2>Мои текущие заказы</h2><p>Откройте работу, чтобы посмотреть детали и сменить этап</p></div><button class="tech-link" data-worker-page="orders">Все мои заказы →</button></div>${orderList(list.filter(order=>!['Работа сдана','Передал дальше'].includes(isCadOperator()?workerStageLabel(order):technicianStatus(order))))}</section>`;
  }
  function salaryPage(){return payrollUI.markup()}
  function tasksPage(){
    const mine=tasks().filter(task=>task.assigneeId===current()?.id),card=task=>`<article class="task-card ${taskIsOverdue(task)?'is-overdue':''}"><header><span class="task-priority ${safe(task.priority)}">${safe(taskPriorityLabel(task.priority))}</span><time>${safe(taskDateLabel(task.dueDate))}</time></header><h3>${safe(task.title)}</h3>${task.orderId?`<div class="task-order-ref">${safe(task.orderId)}${task.work?` · ${safe(task.work)}`:''}</div>`:''}${task.clinic||task.patient?`<div class="task-order-meta">${safe([task.clinic,task.patient].filter(Boolean).join(' · '))}</div>`:''}${task.description?`<p>${safe(task.description)}</p>`:''}<footer><span>Главный техник</span><select data-worker-task-status="${safe(task.id)}" aria-label="Статус задачи ${safe(task.title)}">${taskStatuses.map(status=>`<option value="${status.key}" ${task.status===status.key?'selected':''}>${status.label}</option>`).join('')}</select></footer></article>`;
    return `<div class="tech-heading"><div><span class="tech-eyebrow">РАБОЧИЙ КОНТУР</span><h1>Мои задачи</h1><p>Выполняйте поручения главного техника и переводите их по этапам.</p></div></div><section class="task-board worker-task-board">${taskStatuses.map(status=>{const items=mine.filter(task=>task.status===status.key);return `<section class="task-column" data-task-column="${status.key}"><header><h2>${status.label}</h2><b>${items.length}</b></header><div>${items.map(card).join('')||'<p class="task-column-empty">Задач нет</p>'}</div></section>`}).join('')}</section>`;
  }
  function ordersPage(){const all=myOrders(),list=filteredWorkerOrders(all),statusLabels=workerOrderStatusLabels();return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОИЗВОДСТВО</span><h1>Мои заказы</h1><p>Работы, назначенные вам главным техником.</p></div></div><section class="tech-panel"><div class="tech-order-tools worker-order-tools">${mobileUI.controlsMarkup()}<div class="tech-segment">${statusLabels.map(([label,key])=>`<button data-worker-order-filter="${safe(key)}" class="${state.orderStatusFilter===key?'active':''}">${safe(label)}</button>`).join('')}</div><div class="tech-order-searchbar">${workerOrderFilterPanel(all)}<label class="worker-mobile-search">${icon('search',20)}<input id="tech-search" aria-label="Поиск заказов" placeholder="Заказ, пациент или тип работы" value="${safe(state.orderSearch)}"></label></div></div>${orderList(list)}</section>`}
  function workerOrderUploadDialog(){
    const dialog=state.orderUpload;
    if(!dialog||dialog.orderId!==state.orderId||!Array.isArray(dialog.files))return '';
    const cadMode=dialog.mode==='cad';
    const rows=dialog.files.map((item,index)=>`<article class="upload-progress-file ${safe(item.status||'waiting')}" data-worker-upload-row="${index}"><div><strong>${safe(item.file?.name||'Файл')}</strong><small data-worker-upload-label>${item.status==='success'?'Загружен на Яндекс Диск':item.status==='error'?safe(item.error||'Не удалось загрузить'):item.status==='uploading'?(item.progress>=99?'Сохраняем на Яндекс Диске…':item.progress?`Загрузка · ${item.progress}%`:'Подготавливаем загрузку…'):'Ожидает загрузки'}</small></div><div class="upload-progress-track"><i data-worker-upload-bar style="width:${item.progress||0}%"></i></div></article>`).join('');
    const total=dialog.files.length?Math.round(dialog.files.reduce((sum,item)=>sum+(item.progress||0),0)/dialog.files.length):0;
    const finished=dialog.files.length&&dialog.files.every(item=>['success','error'].includes(item.status));
    return `<div class="tech-dialog-backdrop worker-order-upload-backdrop" data-worker-modal="order-upload"><section class="tech-dialog order-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="worker-order-upload-title"><button class="tech-dialog-close" data-worker-action="close-upload" aria-label="Закрыть" ${dialog.uploading?'disabled':''}>×</button><span class="upload-dialog-eyebrow">ЯНДЕКС ДИСК</span><h2 id="worker-order-upload-title">${cadMode?'Отправка CAD на проверку':'Загрузка файлов заказа'}</h2><p>${cadMode?'Выберите HTML-файл до 200 МБ. После загрузки он будет отправлен главному технику на ОТК.':'Выберите до 10 файлов, каждый до 200 МБ. Они сразу попадут в папку заказа на Яндекс Диске.'}</p><label class="upload-dialog-picker ${dialog.uploading?'disabled':''}">${icon('upload',22)}<span>${dialog.uploading?'Загрузка…':cadMode?'Выбрать HTML-файл':dialog.files.length?'Добавить другие файлы':'Выбрать файлы'}</span><input type="file" id="worker-order-upload-dialog-input" accept="${cadMode?'.html,text/html':'.jpg,.jpeg,.png,.webp,.pdf,.stl,.ply,.constructionInfo,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt,.rtf,.html'}" ${cadMode?'':'multiple'} hidden ${dialog.uploading?'disabled':''}></label>${dialog.files.length?`<div class="upload-overall"><span>Общий прогресс</span><strong data-worker-upload-total>${total}%</strong><div class="upload-progress-track"><i data-worker-upload-total-bar style="width:${total}%"></i></div></div><div class="upload-progress-list">${rows}</div>`:''}${dialog.message?`<p class="worker-upload-feedback ${safe(dialog.status)}" role="status" aria-live="polite">${safe(dialog.message)}</p>`:''}${finished?`<button class="btn primary upload-dialog-done" data-worker-action="close-upload">Готово</button>`:''}</section></div>`;
  }
  function syncWorkerOrderUploadProgress(index){
    const dialog=state.orderUpload,row=root().querySelector(`[data-worker-upload-row="${index}"]`);
    if(!dialog||!row)return;
    const item=dialog.files[index],label=row.querySelector('[data-worker-upload-label]'),bar=row.querySelector('[data-worker-upload-bar]');
    row.className=`upload-progress-file ${safe(item.status||'waiting')}`;
    if(label)label.textContent=item.status==='success'?'Загружен на Яндекс Диск':item.status==='error'?(item.error||'Не удалось загрузить'):item.status==='uploading'?(item.progress>=99?'Сохраняем на Яндекс Диске…':item.progress?`Загрузка · ${item.progress}%`:'Подготавливаем загрузку…'):'Ожидает загрузки';
    if(bar)bar.style.width=`${item.progress||0}%`;
    const total=Math.round(dialog.files.reduce((sum,file)=>sum+(file.progress||0),0)/dialog.files.length),totalLabel=root().querySelector('[data-worker-upload-total]'),totalBar=root().querySelector('[data-worker-upload-total-bar]');
    if(totalLabel)totalLabel.textContent=`${total}%`;
    if(totalBar)totalBar.style.width=`${total}%`;
    const feedback=root().querySelector('.worker-upload-feedback');
    if(feedback&&dialog.uploading)feedback.textContent=item.status==='error'?item.error:item.progress>=99?'Файл передан. Сохраняем на Яндекс Диске…':item.progress?`Загружаем файл ${index+1} из ${dialog.files.length} · ${item.progress}%`:'Подготавливаем загрузку…';
  }
  async function startWorkerOrderUpload(selected){
    const allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|constructionInfo|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf|html)$/i;
    if(state.orderUpload?.uploading)return;
    const cadMode=state.orderUpload?.mode==='cad';
    const chosen=Array.from(selected||[]),files=chosen.filter(file=>(cadMode?/\.html$/i.test(file.name):allowed.test(file.name))&&file.size<=200*1024*1024).slice(0,cadMode?1:10);
    if(chosen.length>files.length)toast('Можно загрузить до 10 поддерживаемых файлов, каждый до 200 МБ');
    if(!files.length)return toast('Выберите поддерживаемые файлы размером до 200 МБ');
    const order=findMyOrder(state.orderId);if(!order)return;
    state.orderUpload={orderId:order.id,mode:cadMode?'cad':'files',uploading:true,status:'uploading',message:'Подготавливаем загрузку…',files:files.map(file=>({file,progress:0,status:'waiting',error:''}))};
    render();
    for(let index=0;index<state.orderUpload.files.length;index++){
      const item=state.orderUpload.files[index];item.status='uploading';syncWorkerOrderUploadProgress(index);
      try{const uploaded=await uploadOrderFile(order.id,item.file,{purpose:/\.html$/i.test(item.file.name)?'cad-review':'order-file',onProgress:progress=>{item.progress=cadMode?Math.min(progress,99):progress;syncWorkerOrderUploadProgress(index)}});if(cadMode){state.orderUpload.message='Файл загружен. Отправляем главному технику на ОТК…';render();const result=await submitCadReview(order.id,uploaded.id),overrides=readOrders();if(result.orderOverride){overrides[order.id]=result.orderOverride;localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides))}}item.progress=100;item.status='success'}catch(error){item.status='error';item.error=error.message||'Не удалось загрузить файл'}
      syncWorkerOrderUploadProgress(index);
    }
    const result=await loadOrderFiles(order.id).catch(()=>null);
    if(result){state.filesFor='';state.orderFiles=result.files||[];state.orderFolderUrl=result.folderUrl||''}
    const failed=state.orderUpload.files.filter(item=>item.status==='error').length;
    state.orderUpload.uploading=false;
    state.orderUpload.status=failed?'error':'success';state.orderUpload.message=failed?`Не удалось загрузить файлов: ${failed}`:cadMode?'CAD загружен и отправлен главному технику на ОТК.':`Загружено: ${files.length} ${files.length===1?'файл':'файлов'}`;
    toast(failed?`Не удалось загрузить файлов: ${failed}`:'Файлы загружены на Яндекс Диск');
    render();
  }
  function orderServiceCards(order){
    const rawVariants=Array.isArray(order.variants)&&order.variants.length?order.variants:[{toothMode:order.toothMode||'Одиночка',bridgeRanges:order.bridgeRanges||[],selectedTeeth:order.teeth||order.selectedTeeth||[],work:order.work,workOption:order.material}];
    const variants=rawVariants.map(variant=>({...variant,selectedTeeth:Array.isArray(variant.selectedTeeth)?variant.selectedTeeth:Array.isArray(variant.teeth)?variant.teeth:[],bridgeRanges:Array.isArray(variant.bridgeRanges)?variant.bridgeRanges:Array.isArray(variant.bridgeRangesTooth)?variant.bridgeRangesTooth:[]}));
    return `<section class="tech-order-services tech-panel"><div class="tech-panel-heading"><div><h2>Услуги заказа</h2><p>${variants.length} ${variants.length===1?'услуга':'услуги'} в одном заказе</p></div></div><div class="tech-order-service-list">${variants.map((variant,index)=>{const teeth=Array.isArray(variant.selectedTeeth)?variant.selectedTeeth:[],ranges=Array.isArray(variant.bridgeRanges)?variant.bridgeRanges:[],units=priceUnitsForSelection(variant.work,teeth,variant.units),amount=estimateWork({work:variant.work,option:variant.workOption,teeth,units}).amount;return `<article class="tech-order-service"><header><span>Услуга ${index+1}</span><strong>${safe(variant.work||'Работа')}</strong></header><div class="tech-order-service-body"><div class="tech-order-service-chart">${toothChart(false,teeth,ranges)}</div><dl><div><dt>Зубы</dt><dd>${safe(teeth.join(', ')||'Не указаны')}</dd></div><div><dt>Режим</dt><dd>${safe(variant.toothMode||'Одиночка')}</dd></div>${ranges.length?`<div><dt>Мосты</dt><dd>${safe(ranges.map(range=>`${range[0]}–${range.at(-1)}`).join(', '))}</dd></div>`:''}${variant.workOption?`<div><dt>Исполнение</dt><dd>${safe(variant.workOption)}</dd></div>`:''}<div><dt>Количество</dt><dd>${units}</dd></div><div><dt>Сумма</dt><dd>${amount===null?'Стоимость уточняется':rubles(amount)}</dd></div></dl></div></article>`}).join('')}</div></section>`;
  }
  function detailPage(){
    const order=findMyOrder(state.orderId);
    if(!order)return ordersPage();
    if(state.filesFor!==order.id){state.filesFor=order.id;state.orderFiles=[];state.orderFolderUrl='';loadOrderFiles(order.id).then(result=>{if(orderMatches({id:state.orderId},order.id)&&isActive()){state.orderFiles=result.files||[];state.orderFolderUrl=result.folderUrl||'';render()}}).catch(()=>{})}
    // Keep the detail timeline compact and role-specific. The previous legacy
    // list exposed every internal hand-off, making the card show duplicate
    // stages that are not actionable for the current employee.
    const stageItems=visibleProductionStages();
    const overallStages=stageItems.map(item=>item.label);
    const currentWorkerStage=isCadOperator()?workerStageLabel(order):technicianStatus(order);
    const index=stageItems.findIndex(item=>Array.isArray(item.matches)?item.matches.includes(order.stage):item.label===currentWorkerStage);
    const events=orderHistory().filter(event=>event.orderId===order.id).slice().reverse();
    const employee=current(),cadWorker=isCadOperator(),preprodWorker=!cadWorker&&isPreprod(),frameWorker=!cadWorker&&!preprodWorker&&isFrameEmployee(employee),painterWorker=!cadWorker&&!preprodWorker&&isPainterEmployee(employee),techStatus=!cadWorker?technicianStatus(order):'',handedOff=(cadWorker?workerStageLabel(order):techStatus)==='Передал дальше'||techStatus==='Работа сдана';
    const nextByStage=cadWorker?{'Ожидает распределения':'Подготовка','Подготовка':'Моделирование'}:preprodWorker?{'Подготовка':'Препрод'}:{};
    // После передачи на ОТК CAD-оператор больше не может менять этап: решение принимает главный техник.
    const previousByStage=cadWorker?{'Моделирование':'Подготовка'}:preprodWorker?{'Препрод':'Подготовка'}:{};
    const next=nextByStage[order.stage]||'',canAdvance=Boolean(next),canRollback=Boolean(previousByStage[order.stage]);
    const preprodActionAllowed=preprodWorker&&order.stage==='Препрод';
    const productionActionAllowed=!cadWorker&&!preprodWorker&&order.stage==='Изготовление'&&((frameWorker&&order.manufacturingStatus===manufacturingStatuses[0])||(painterWorker&&order.manufacturingStatus===manufacturingStatuses[1]));
    const canAccept=techStatus==='Ожидает принятия'&&(!frameWorker||camCanAccept(order))&&(cadWorker?order.stage==='Подготовка':preprodWorker?order.stage==='Подготовка'||order.stage==='На доработке':productionActionAllowed||order.stage==='На доработке');
    const technicianActions=canAccept
      ?`<button class="btn primary" data-worker-action="accept" data-order-id="${safe(order.id)}">Принять в работу</button>`
      :preprodActionAllowed
      ?`<button class="btn primary" data-worker-action="advance" data-order-id="${safe(order.id)}">Передать в ОТК</button>`
      :productionActionAllowed&&(!frameWorker||camCanSubmitQuality(order))
      ?`<button class="btn primary" data-worker-action="advance" data-order-id="${safe(order.id)}">Отправить на ОТК</button>`
      :'';
    const cad=order.cadReview||{},cadReturned=cad.status==='returned';
    const reviewAttachments=(cad.attachments||[]).map(file=>`<button type="button" class="tech-review-attachment" data-worker-file="${safe(file.id)}"><span>📎</span><strong>${safe(file.name)}</strong><small>${safe(file.type||'Файл')}</small></button>`).join('');
    const cadUpload=order.stage==='Моделирование'?`<section class="tech-panel cad-worker-panel ${cadReturned?'returned':''}"><h3>${cadReturned?'Врач вернул CAD':'Согласование CAD с врачом'}</h3>${cadReturned?`<p><strong>Комментарий врача:</strong> ${safe(cad.comment||'Нужно внести изменения')}</p>${reviewAttachments?`<div class="tech-review-attachments"><span>Прикреплённые файлы</span>${reviewAttachments}</div>`:''}`:'<p>Загрузите готовый HTML-файл. Сначала его проверит главный техник, затем файл уйдёт врачу.</p>'}<button type="button" class="btn primary" data-worker-action="upload-cad">${cadReturned?'Загрузить исправленный CAD':'Загрузить HTML и отправить на ОТК'}</button></section>`:'';
    const orderUploadMessage=state.orderUpload?.orderId===order.id&&state.orderUpload.message?`<small class="tech-order-upload-status ${safe(state.orderUpload.status)}">${safe(state.orderUpload.message)}</small>`:'';
    const orderFolderMarkup=`<div class="tech-order-files"><h3>Файлы заказа</h3><div class="order-folder-link"><div><strong>Папка заказа на Яндекс Диске</strong><small>Все файлы заказа собраны в одном месте</small></div><div class="order-folder-actions">${state.orderFolderUrl?`<a class="btn outline" href="${safe(state.orderFolderUrl)}" target="_blank" rel="noopener noreferrer">Открыть папку</a>`:'<span class="tech-empty">Папка создаётся…</span>'}<button type="button" class="btn outline" data-worker-action="upload-files">Загрузить файлы</button></div></div>${orderUploadMessage}</div>`;
    const cadFiles=state.orderFiles.filter(file=>file.purpose==='cad-review'&&/\.html$/i.test(file.name));
    const cadModelMarkup=isCadOperator()&&cadFiles.length?`<section class="tech-panel tech-cad-model"><div class="tech-panel-heading"><div><h3>CAD-модель</h3><p>Загруженный HTML-файл для повторного просмотра.</p></div><span class="tech-stage ${order.cadReview?.status==='approved'?'ready':order.cadReview?.status==='returned'?'review':'work'}">${order.cadReview?.status==='approved'?'Подтверждено':order.cadReview?.status==='returned'?'Доработка и эстетика':'CAD на согласовании у врача'}</span></div>${cadFiles.slice(-1).map(file=>`<div class="tech-cad-file"><strong>${safe(file.name)}</strong><small>${file.uploadedAt?new Date(file.uploadedAt).toLocaleString('ru-RU'):'CAD-файл'}</small><button class="btn outline" data-worker-action="open-cad" data-order-id="${safe(order.id)}" data-file-id="${safe(file.id)}">Открыть CAD</button></div>`).join('')}</section>`:'';
    const cadPreview=state.cadPreview?.orderId===order.id?`<div class="cad-preview-backdrop" data-worker-modal="cad-preview"><section class="cad-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="worker-cad-preview-title"><header><div><h2 id="worker-cad-preview-title">${safe(state.cadPreview.name||'CAD')}</h2><p>Интерактивный предпросмотр из HTML-файла</p></div><button data-worker-action="close-cad" aria-label="Закрыть">×</button></header><iframe id="worker-cad-preview-frame" src="${safe(state.cadPreview.url||'')}" referrerpolicy="no-referrer" title="Предпросмотр CAD"></iframe></section></div>`:'';
        return `<button class="tech-back" data-worker-page="orders">← Мои заказы</button><div class="tech-heading"><div><span class="tech-eyebrow">${safe(order.clinic)} · срок ${safe(order.date)}</span><h1>Заказ ${safe(order.id)}</h1><p>${safe(orderWorkLabel(order))} · ${safe(order.patient)}</p></div><span class="tech-stage ${tone(order.stage)}">${safe(workerDisplayStatus(workerStageLabel(order)))}</span></div><div class="tech-detail-grid worker-detail-grid"><section class="tech-panel"><h2>Данные работы</h2><div class="tech-facts"><div><span>Клиника</span><strong>${safe(order.clinic)}</strong></div><div><span>Пациент</span><strong>${safe(order.patient)}</strong></div><div><span>Тип работы</span><strong>${order.productionType==='analog'?'Аналоговый':'Цифровой'}</strong></div><div><span>Конструкция</span><strong>${safe(orderWorkLabel(order))}</strong></div><div><span>Создан</span><strong>${shortDate(order.createdAt)}</strong></div><div><span>Срок сдачи</span><strong>${safe(order.date)}</strong></div><div><span>Приоритет</span><strong>${safe(order.priority)}</strong></div><div><span>Номера зубов</span><strong>${order.teeth.join(', ')||'Не указаны'}</strong></div></div>${orderServiceCards(order)}</section><div class="worker-detail-side"><section class="tech-panel"><h2>Ход выполнения</h2><div class="tech-stage-progress" data-worker-stage-progress><div class="tech-progress-head"><span>Прогресс этапа</span><b data-worker-stage-progress-value>0%</b></div><div class="tech-progress-track"><i data-worker-stage-progress-bar style="width:0%"></i></div></div><ol class="tech-timeline">${overallStages.map((stage,position)=>`<li class="${position<index?'done':position===index?'current':''}"><i></i><span>${workerDisplayStage(stage,order)}</span></li>`).join('')}</ol><div class="tech-detail-actions">${canRollback?`<button class="btn outline" data-worker-action="rollback" data-order-id="${safe(order.id)}">Вернуть на предыдущий статус</button>`:''}${technicianActions}${order.stage==='На доработке'?`<p>${safe(order.reworkReason||'Клиника запросила доработку')}</p><button class="btn primary" data-worker-action="resume-rework" data-order-id="${safe(order.id)}">Принять в работу</button>`:order.stage==='Согласование CAD'?'<p>CAD отправлен врачу. Дождитесь подтверждения или комментария.</p>':canAdvance?`<button class="btn primary" data-worker-action="advance" data-order-id="${safe(order.id)}">${next==='Контроль качества'?'Передать на проверку':'Перейти к этапу «'+next+'»'}</button>`:order.stage==='Моделирование'?'<p>Загрузите HTML-файл и отправьте его главному технику на ОТК. После одобрения CAD уйдёт врачу.</p>':order.stage==='Контроль качества'?'<p>Работа передана главному технику на проверку.</p>':['Работа принята','Готово к выдаче'].includes(order.stage)?'<p>Работа принята главным техником.</p>':order.stage==='В доставке'?'<p>Заказ в доставке.</p>':order.stage==='Принято доктором'?'<p class="tech-status-note">Работа принята доктором.</p>':handedOff?'<p>Работа передана дальше.</p>':'<p>Дождитесь назначения работы.</p>'}</div></section>${orderFolderMarkup}${cadUpload}${cadModelMarkup}</div></div>${cadPreview}${workerOrderUploadDialog()}`;
  }
  function profile(){
    const profile=workerProfile();
    const field=(label,name,value='',type='text',required=false,placeholder='',locked=false)=>`<label>${label}<input name="${name}" type="${type}" value="${safe(value)}" ${placeholder?`placeholder="${safe(placeholder)}"`:''} ${required?'required':''} ${locked?'disabled aria-disabled="true"':''}></label>`;
    const pairing=state.telegramPairing?`<div class="worker-telegram-pairing"><strong>Код: ${safe(state.telegramPairing.code)}</strong><small>Откройте бота сотрудников и отправьте ему команду <b>${safe(state.telegramPairing.command)}</b>. Код действует 10 минут.</small>${state.telegramPairing.deepLink?`<a class="btn outline" href="${safe(state.telegramPairing.deepLink)}" target="_blank" rel="noopener">Открыть бота</a>`:''}</div>`:'';
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОФИЛЬ</span><h1>Мои данные</h1></div></div><section class="tech-panel tech-profile-editor"><div class="tech-profile-avatar">${avatarMarkup(profile,'large')}<label class="btn outline">Загрузить аватар<input id="worker-profile-avatar" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>${profile.avatar?'<button class="tech-link" data-worker-avatar="remove">Убрать аватар</button>':''}</div><form id="worker-profile-form" class="tech-client-form"><p class="tech-profile-note">Имя, специализация, телефон и почта изменяются главным техником.</p><div class="worker-rate-note"><strong>Ранг ${employeeRank(current())} из 5</strong><span>Вознаграждение за каждую услугу задаёт главный техник. <button type="button" class="tech-link" data-worker-page="salary">Мои ставки и начисления →</button></span></div>${field('Имя и фамилия','name',profile.name||profile.displayName||'','text',true,'',true)}${field('Специализация','specialty',workerSpecialtyDisplayLabel(profile),'text',false,'',true)}${field('Телефон','phone',profile.phone||'','tel',false,'',true)}${field('Электронная почта','email',profile.email||'','email',true,'',true)}${field('Новый пароль','password','','password',false,'Оставьте пустым, если менять не нужно')}${field('Повторите пароль','passwordConfirm','','password',false,'')}<div class="tech-client-form-actions"><button type="submit" class="btn primary">Сохранить пароль</button></div></form></section><section class="tech-panel worker-telegram-panel"><div class="tech-panel-heading"><div><h2>Telegram для работы</h2><p>Получайте назначенные заказы и принимайте их в работу прямо в новом боте сотрудников.</p></div><button class="btn primary" data-worker-telegram="connect">Подключить Telegram</button></div>${pairing}</section>`;
  }
  function portalFooter(){return `<footer class="portal-footer"><span class="portal-footer-copy">© 2019–2026 Create Dental</span><span class="portal-footer-tagline">Для клиник, которым важен результат</span><a class="portal-footer-email" href="mailto:orders@createdental.io">orders@createdental.io</a><nav class="portal-footer-legal" aria-label="Правовые документы"><a href="/assets/legal/privacy.html">Политика конфиденциальности</a><a href="/assets/legal/consent-data.html">Согласие на обработку персональных данных</a></nav></footer>`}
  function shell(content){
    const employee=current();
    const profile=workerProfile();
    const cabinetLabel=workerCabinetLabel(employee);
    const avatar=profile.avatar?`<span class="avatar"><img src="${safe(profile.avatar)}" alt=""></span>`:`<span class="avatar">${safe(initials(employee?.name||'Техник'))}</span>`;
    const nav=[['overview','Главная','home'],['orders','Мои заказы','orders'],['tasks','Задачи','check',tasks().filter(task=>task.assigneeId===employee.id&&task.status!=='done').length],['salary','Зарплата','wallet'],['profile','Мой профиль','user']];
    const mobileItems=nav.slice(0,4),moreActive=!mobileItems.some(([page])=>state.page===page||state.page==='detail'&&page==='orders');
    const mobileNav=`<nav class="mobile-bottom-nav" aria-label="Основная навигация">${mobileItems.map(([page,label,ico,count])=>`<button type="button" class="mobile-bottom-item ${state.page===page||state.page==='detail'&&page==='orders'?'active':''}" data-worker-page="${page}" aria-label="${label}" ${state.page===page||state.page==='detail'&&page==='orders'?'aria-current="page"':''}>${icon(ico,20)}<span>${label==='Мои заказы'?'Заказы':label}</span>${count?`<i class="mobile-nav-count">${count>99?'99+':count}</i>`:''}</button>`).join('')}<button type="button" class="mobile-bottom-item ${moreActive?'active':''}" data-worker-action="menu" aria-label="Ещё разделы" ${moreActive?'aria-current="page"':''}>${icon('more',20)}<span>Ещё</span></button></nav>`;
    const collapsed=sidebarCollapsed();
    root().innerHTML=`<aside class="sidebar tech-sidebar ${collapsed?'sidebar-collapsed':''}" id="worker-sidebar"><button class="brand brand-home" data-worker-page="overview" aria-label="На главную"><img class="portal-logo" src="${logo}" alt="Create Dental"></button>${sidebarCollapseMarkup()}<div class="tech-side-label">${cabinetLabel}</div><nav class="sidebar-nav">${nav.map(([page,label,ico])=>`<button class="nav-link ${state.page===page||state.page==='detail'&&page==='orders'?'active':''}" data-worker-page="${page}" data-sidebar-label="${label}" title="${label}">${icon(ico,20)}<span>${label}</span></button>`).join('')}</nav><button type="button" class="mobile-sidebar-logout" data-auth-logout>↪ <span>Выйти из кабинета</span></button></aside><button type="button" class="mobile-drawer-backdrop" data-worker-action="menu-close" aria-label="Закрыть меню"></button><div class="shell tech-shell ${collapsed?'sidebar-shell-collapsed':''}"><header class="topbar"><button class="mobile-menu" data-worker-action="menu" aria-label="Открыть меню">☰</button><div class="topbar-spacer"></div>${languageSwitcherMarkup()}${themeToggleMarkup()}${notificationCenterMarkup()}<button class="role-toggle" data-auth-logout>Выйти</button><button class="profile" data-worker-page="profile">${avatar}<span><strong>${safe(employee?.name||profile.displayName||'Техник')}</strong><small>${safe(workerSpecialtyLabel(employee))}</small></span>${icon('chevron',13)}</button></header><main class="content tech-content">${content}</main>${portalFooter()}</div>${mobileNav}<div class="toast ${state.toast?'visible':''}">${safe(state.toast)}</div>`;
  }
  function arrangeWorkerHistory(){
    if(state.page!=='detail')return;
    const order=findMyOrder(state.orderId);
    if(!order)return;
    const grid=root().querySelector('.tech-detail-grid');
    if(!grid)return;
    const dataPanel=Array.from(grid.children).find(node=>node.matches('section.tech-panel'));
    const side=Array.from(grid.children).find(node=>node.classList.contains('worker-detail-side'));
    if(!dataPanel||!side)return;
    const main=document.createElement('div');main.className='tech-order-main';dataPanel.replaceWith(main);main.append(dataPanel);
    const events=orderHistory().filter(event=>event.orderId===order.id||orderMatches({id:event.orderId},order.id)).slice().reverse();
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
    const order=findMyOrder(state.orderId);
    const timeline=root().querySelector('.worker-detail-side .tech-timeline');
    if(!order||!timeline)return;
    const stagesForWorker=visibleProductionStages(),currentIndex=isCadOperator()?stagesForWorker.findIndex(item=>item.matches.includes(order.stage)):stagesForWorker.findIndex(item=>item.label===technicianStatus(order));
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
    if(route.role==='worker'){state.page=route.page;if(route.orderId)state.orderId=route.orderId}
    const employee=current();
    if(!employee){shell(`<div class="tech-heading"><div><span class="tech-eyebrow">КАБИНЕТ ТЕХНИКА</span><h1>Доступ недоступен</h1><p>Выбранный сотрудник отключён, уволен или отсутствует.</p></div></div>`);return}
    shell(({overview,orders:ordersPage,tasks:tasksPage,detail:detailPage,salary:salaryPage,profile}[state.page]||overview)());
    if(['overview','salary'].includes(state.page))queueMicrotask(()=>payrollUI.load());
    const cadFrame=root().querySelector('#worker-cad-preview-frame');if(cadFrame&&state.cadPreview?.url)cadFrame.src=state.cadPreview.url;
    arrangeWorkerSpecialtyUi();
    arrangeWorkerHistory();
    arrangeProductionTimeline();
    mobileUI.enhance(state.page);
  }
  document.addEventListener('click',async event=>{
    if(!isActive())return;
    if(root().querySelector('.notification-panel')&&!event.target.closest('.notification-center')){closeNotificationCenter();root().querySelector('.notification-panel')?.remove()}
    if(event.target.closest('[data-notification-toggle]')){await toggleNotificationCenter();render();return}
    if(event.target.closest('[data-notification-close]')){closeNotificationCenter();render();return}
    const notification=event.target.closest('[data-notification-id]');
    if(notification){const orderId=notification.dataset.notificationOrder,order=findMyOrder(orderId);await markNotificationCenterRead().catch(()=>{});closeNotificationCenter();if(order){state.orderId=order.id;setPage('detail')}else setPage('overview');return}
    if(state.orderFilterOpen&&!event.target.closest('.tech-order-filter-panel')&&!event.target.closest('[data-worker-filter-panel]')){state.orderFilterOpen=false;render();return}
    const filterAction=event.target.closest('[data-worker-filter-panel]');
    if(filterAction){const action=filterAction.dataset.workerFilterPanel;if(action==='toggle')state.orderFilterOpen=!state.orderFilterOpen;else if(action==='reset'){state.orderClinicFilter='';state.orderMonthFilter='';state.orderWorkFilter='';state.orderFilterOpen=false}else if(action==='close')state.orderFilterOpen=false;render();return}
    const modal=event.target.closest('[data-worker-modal]');
    if(modal&&event.target===modal){if(modal.dataset.workerModal==='cad-preview'){cadPreviewRequest++;if(state.cadPreview?.url)URL.revokeObjectURL(state.cadPreview.url);state.cadPreview=null}else if(modal.dataset.workerModal==='order-upload'&&!state.orderUpload?.uploading){state.orderUpload=null}render();return}
    const cadAction=event.target.closest('[data-worker-action]');
    if(cadAction?.dataset.workerAction==='open-cad'){
      const orderId=cadAction.dataset.orderId,fileId=cadAction.dataset.fileId,order=findMyOrder(orderId);
      if(!orderId||!fileId||!order)return;
      const requestId=++cadPreviewRequest;state.cadPreview={orderId,fileId,name:'Загрузка CAD…',url:''};render();
      try{const html=await loadCadReviewHtml(fileId);if(requestId!==cadPreviewRequest||!state.cadPreview||state.cadPreview.fileId!==fileId)return;const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));state.cadPreview={orderId,fileId,name:state.orderFiles.find(file=>file.id===fileId)?.name||'CAD',url};render()}catch(error){if(requestId!==cadPreviewRequest)return;state.cadPreview=null;toast(error.message||'Не удалось открыть CAD');render()}
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
      if(action.dataset.workerAction==='sidebar-toggle'){
        try{localStorage.setItem('create-dental-sidebar-collapsed',sidebarCollapsed()?'0':'1')}catch{}
        render();
        return;
      }
      if(['upload-files','upload-cad'].includes(action.dataset.workerAction)){
        state.orderUpload={orderId:state.orderId,mode:action.dataset.workerAction==='upload-cad'?'cad':'files',uploading:false,status:'',message:'',files:[]};
        render();
        return;
      }
      if(action.dataset.workerAction==='close-upload'){
        if(!state.orderUpload?.uploading){state.orderUpload=null;render()}
        return;
      }
      if(['accept','advance','rollback','resume-rework','start-work'].includes(action.dataset.workerAction)){
        const employee=current();
        const order=findMyOrder(action.dataset.orderId);
        const index=order&&stages.indexOf(order.stage);
        if(!employee||!order)return;
        const cadWorker=isCadOperator(),preprodWorker=!cadWorker&&isPreprod(employee),frameWorker=!cadWorker&&!preprodWorker&&isFrameEmployee(employee),painterWorker=!cadWorker&&!preprodWorker&&isPainterEmployee(employee),statusField=preprodWorker?'preprodTechnicianStatus':frameWorker?'frameTechnicianStatus':'painterStatus';
        const preprodActionAllowed=preprodWorker&&order.stage==='Препрод';
        const productionActionAllowed=!cadWorker&&!preprodWorker&&order.stage==='Изготовление'&&((frameWorker&&order.manufacturingStatus===manufacturingStatuses[0])||(painterWorker&&order.manufacturingStatus===manufacturingStatuses[1]));
        if(action.dataset.workerAction==='accept'){
          const waiting=technicianStatus(order)==='Ожидает принятия';
          const allowed=waiting&&(!frameWorker||camCanAccept(order))&&(cadWorker?order.stage==='Подготовка':preprodWorker?order.stage==='Подготовка'||order.stage==='На доработке':productionActionAllowed||order.stage==='На доработке');
          if(!allowed)return;
          const overrides=readOrders(),current=overrides[order.id]||{},rework=order.stage==='На доработке',stage=cadWorker?'Моделирование':preprodWorker?'Препрод':'Изготовление';
          const change={stage,[statusField]:'В работе',technicianStatus:'В работе',workerAcceptances:{...(order.workerAcceptances||{}),[employee.id]:{at:new Date().toISOString(),name:employee.name,role:cadWorker?'cad':preprodWorker?'preprod':painterWorker?'painter':'frame'}}};
          if(cadWorker)change.cadOperatorStatus='В работе';
          if(preprodWorker)change.preprodTechnicianStatus='В работе';
          if(painterWorker){change.painterStatus='В работе';change.ceramicistStatus='В работе'}
          if(!cadWorker&&!preprodWorker&&!rework)change.manufacturingStatus=order.manufacturingStatus||manufacturingStatuses[0];
          if(rework)change.manufacturingStatus=order.reworkKind==='esthetic'?manufacturingStatuses[1]:order.reworkKind==='preprod'?'':manufacturingStatuses[0];
          overrides[order.id]={...current,...change};
          localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
          savePortal('orderOverrides',overrides).catch(error=>toast('Не удалось сохранить статус на сервере: '+error.message));
          render();
          return;
        }
        if(action.dataset.workerAction==='start-work'){
          if(!(preprodActionAllowed||productionActionAllowed)||technicianStatus(order)!=='Принял работу')return;
          const overrides=readOrders();
          overrides[order.id]={...(overrides[order.id]||{}),[statusField]:'В работе',technicianStatus:'В работе'};
          localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
          savePortal('orderOverrides',overrides).catch(error=>toast('Не удалось сохранить статус на сервере: '+error.message));
          render();
          return;
        }
        if(action.dataset.workerAction==='advance'&&preprodActionAllowed){
          const overrides=readOrders();
          const qualityRequest={kind:'preprod',employeeId:employee.id,requestedBy:employee.originalName,requestedByName:employee.name,requestedAt:new Date().toISOString(),next:'Моделирование (CAD)'};
          const change={stage:'Контроль качества',preprodTechnicianStatus:'ОТК',technicianStatus:'ОТК',qualityRequest};
          overrides[order.id]={...(overrides[order.id]||{}),...change};
          localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
          savePortal('orderOverrides',overrides).catch(error=>toast('Не удалось сохранить статус на сервере: '+error.message));
          render();
          return;
        }
        if(action.dataset.workerAction==='advance'&&productionActionAllowed&&(!frameWorker||camCanSubmitQuality(order))){
          const overrides=readOrders();
          const qualityRequest={kind:frameWorker?'cam':'esthetic',employeeId:employee.id,requestedBy:employee.originalName,requestedByName:employee.name,requestedAt:new Date().toISOString(),next:frameWorker?'Передача Эстетисту':'Финальная приёмка'};
          const change=frameWorker?{stage:'Контроль качества',frameTechnicianStatus:'ОТК',technicianStatus:'ОТК',qualityRequest}:{stage:'Контроль качества',painterStatus:'ОТК',ceramicistStatus:'ОТК',technicianStatus:'ОТК',qualityRequest};
          overrides[order.id]={...(overrides[order.id]||{}),...change};
          localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
          savePortal('orderOverrides',overrides).catch(error=>toast('Не удалось сохранить этап на сервере: '+error.message));
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
        const change={stage};
        if(!cadWorker&&stage==='Контроль качества'){change[statusField]='ОТК';change.technicianStatus='ОТК'}
        if(preprodWorker&&action.dataset.workerAction==='resume-rework'){change.preprodTechnicianStatus='В работе';change.technicianStatus='В работе'}
        if(!cadWorker&&action.dataset.workerAction==='resume-rework'){change[statusField]='В работе';change.technicianStatus='В работе';if(order.reworkKind!=='preprod')change.manufacturingStatus=order.reworkKind==='esthetic'?manufacturingStatuses[1]:manufacturingStatuses[0]}
        overrides[order.id]={...(overrides[order.id]||{}),...change};
        localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
        savePortal('orderOverrides',overrides).catch(error=>toast('Не удалось сохранить этап на сервере: '+error.message));
        render();
      }
      return;
    }
    const page=event.target.closest('[data-worker-page]');
    if(page){root().querySelector('#worker-sidebar')?.classList.remove('open');setPage(page.dataset.workerPage);return}
    const order=event.target.closest('[data-worker-order]');
    if(order){
      if(order.tagName==='A'&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey)event.preventDefault();
      state.orderId=order.dataset.workerOrder;
      setPage('detail');
    }
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
    if(event.target.matches('[data-worker-order-clinic-filter]')){state.orderClinicFilter=event.target.value;state.orderFilterOpen=true;render();return}
    if(event.target.matches('[data-worker-order-month-filter]')){state.orderMonthFilter=event.target.value;state.orderFilterOpen=true;render();return}
    if(event.target.id==='worker-order-upload-dialog-input'){
      const selected=Array.from(event.target.files||[]);
      event.target.value='';
      startWorkerOrderUpload(selected);
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
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('.worker-mobile-order-card,tr[data-worker-order]')){event.preventDefault();event.target.click()}
  });
  return {render};
}
