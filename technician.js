import {cadReadyForProduction,requiresDoctorCadApproval,routeForOrder} from './production-routes.js?v=parent-card-20261112-6';
const chiefEditIcon='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>';
import {createPayrollUI} from './payroll-ui.js?v=salary-ranks-2';
import {employeeRank} from './payroll.js?v=salary-ranks-2';
import {camWorkflowStages,camWorkflowStatus,camWorkflowProgress,camAfterMilling} from './cam-workflow.js?v=cam-flow-2';
import {orderParticipants,orderWorkTypes,matchesParticipantAndWork,orderWorkLabel,orderEventSummary,displayOrderId,resolveOrderId} from './order-list-utils.js?v=chief-restore-20261112-1';
import {loadPortal,savePortal,authRequest,portalToken,loadOrderFiles,loadCadReviewHtml,deleteOrder,uploadOrderFile,uploadClinicMessageFile,downloadClinicMessageFile,sendOrderToMilling} from './portal-client.js?v=reliability-retry-1';
import {routeFromPath,pathFor,navigate} from './routes.js?v=salary-ranks-2';
import {notificationCenterMarkup,toggleNotificationCenter,closeNotificationCenter,markNotificationCenterRead} from './notification-center.js?v=reliability-retry-1';
import {workCatalog,rubles,estimateWork,priceUnitsForSelection,camMethodForOrder,reorderCatalogService,reorderCatalogCategory,isHighVolumeLithiumRestoration} from './work-catalog.js?v=chief-parent-20261112-5';
import {themeToggleMarkup,languageSwitcherMarkup} from './theme.js?v=light-only-1';
import {openPricePrint} from './price-print.js?v=price-isolated-print-20261112-4';
import {openOrderPrint} from './order-print.js?v=order-print-22';
const surgicalTemplateUtilities = await import(import.meta.url.startsWith('file:')
  ? './public/assets/surgical-template-utils.js'
  : '/assets/surgical-template-utils.js?v=surgical-sockets-4');
const {isSurgicalSocket,isSurgicalTemplate,surgicalVariantUnits}=surgicalTemplateUtilities;
import {calculateCompanyPulse} from './company-pulse.js?v=quality-pulse-1';
import {taskStatuses,taskPriorities,taskStatusLabel,taskPriorityLabel,taskDateLabel,taskIsOverdue} from './tasks.js?v=task-flow-4';
import {productionStages,productionStageIndex,compactStageLabel,productionStageLabel} from './production-stages.js?v=perf-split-1';
export {productionStages,productionStageIndex,compactStageLabel,productionStageLabel};

const navigationIcons={
  crm:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M7 3v4M17 3v4M14 11h4M14 15h4"/><circle cx="8" cy="12" r="2"/><path d="M5 17c0-3 6-3 6 0"/>',
  management:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>',
  factory:'<path d="M3 21V10l6 3V9l6 4V4h6v17H3Z"/><path d="M7 17h1M12 17h1M17 17h1"/>',
  users:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2"/>',
  tag:'<path d="M3 4h9l9 9-8 8L3 11V4Z"/><circle cx="8" cy="9" r="1"/>',
  shieldCheck:'<path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6l8-3Z"/><path d="m8 12 3 3 5-6"/>'
};

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
export function qualityApprovalChange(order,expectedKind,qualityApprovedAt){
  const request=order.qualityRequest,final=request?.kind==='final';
  if(order.stage!=='Контроль качества'||(request?.kind||'')!==expectedKind)return null;
  if(request?.kind==='cad')return {stage:'Согласование CAD',qualityRequest:null,cadOperatorStatus:'Согласование с врачом'};
  else if(request?.kind==='preprod')return {stage:order.productionType==='analog'?'Моделирование':'Изготовление',manufacturingStatus:order.productionType==='analog'?'':manufacturingStatuses[0],qualityRequest:null,preprodTechnicianStatus:'Работа сдана',technicianStatus:'Принял работу',qualityApprovedAt};
  else if(request?.kind==='cam')return {stage:'Изготовление',manufacturingStatus:manufacturingStatuses[1],qualityRequest:null,frameTechnicianStatus:'Работа сдана',technicianStatus:'Принял работу',qualityApprovedAt};
  else if(final)return {stage:'В доставке',qualityRequest:null,technicianStatus:'Работа сдана',completedAt:qualityApprovedAt,qualityApprovedAt,finalQualityApprovedAt:qualityApprovedAt};
  else return {stage:'Контроль качества',qualityRequest:{kind:'final',requestedBy:'chief',requestedByName:'Главный техник',requestedAt:qualityApprovedAt,next:'Доставка в клинику'},painterStatus:'Работа сдана',ceramicistStatus:'Работа сдана',technicianStatus:'Финальная ОТК',qualityApprovedAt,finalQualityRequestedAt:qualityApprovedAt,...(request?.kind==='esthetic'?{estheticQualityApprovedAt:qualityApprovedAt}:{})};
}
export function qualityReworkChange(order,category,reason,at){
  const request=order.qualityRequest;
  if(order.stage!=='Контроль качества'||!request?.kind||!category||!reason?.trim())return null;
  const detail=`${category}: ${reason.trim()}`;
  const qualityDecision={kind:request.kind,result:'rejected',reasonCategory:category,reason:reason.trim(),at,requestedAt:request.requestedAt||''};
  if(request.kind==='cad')return {stage:'Моделирование',qualityRequest:null,cadReview:{...(order.cadReview||{}),status:'returned',comment:detail,reviewedAt:at},reworkReason:detail,reworkKind:'cad',reworkAt:at,qualityDecision};
  return {stage:request.kind==='preprod'?'На доработке':'Изготовление',manufacturingStatus:request.kind==='esthetic'?'В работе у Красильщика':request.kind==='cam'?'':order.manufacturingStatus,qualityRequest:null,reworkKind:request.kind==='preprod'?'preprod':request.kind==='esthetic'||request.kind==='final'?'esthetic':'cam',reworkReason:detail,reworkAt:at,qualityDecision};
}
const manufacturingStatusLabel = status => status===manufacturingStatuses[0]?'В работе у CAM-оператора':status===manufacturingStatuses[1]?'В работе у Эстетиста':status||'—';
export const chiefStages = stages.flatMap(stage=>stage==='Изготовление'?manufacturingStatuses:[stage]);
const monthLabels = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const analyticsYear = new Date().getFullYear();
export const seedDetails = {};

const money = amount => new Intl.NumberFormat('ru-RU').format(amount) + ' ₽';
const safe = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const displayTechnicianOrderId = value => String(value ?? '').replace(/^CD-/i,'');
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
const orderListStageTone = (order,overdue=false) => { if(overdue)return 'overdue'; const stage=String(order?.stage||''); if(['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(stage))return 'new'; if(['Контроль качества','Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(stage))return 'ready'; if(['Согласование CAD','На доработке'].includes(stage))return 'review'; return 'work'; };
const isCadOperatorEmployee = employee => /cad\s*\/?\s*cam|cadcam|cad\s*оператор|моделировщик/i.test(String(employee?.specialty||''));
const normalizeEmployeeSpecialty = value => {const text=String(value||'').trim();if(/cad\s*\/?\s*cam|cadcam|cad\s*оператор|моделировщик/i.test(text))return 'CAD/CAM оператор';if(/гипсов|препрод|pre\s*prod|предпрод/i.test(text))return 'Препрод техник';if(/зубной\s+техник|каркасист|cam\s*оператор/i.test(text))return 'Каркасист';if(/красильщик|керамист|эстетист/i.test(text))return 'Красильщик';return text||'Каркасист'};
const employeeSpecialtyLabel = value => normalizeEmployeeSpecialty(value);
const employeeSpecialtyDisplayLabel = value => ({'Каркасист':'CAM оператор','Красильщик':'Эстетист','CAD/CAM оператор':'CAD оператор','Препрод техник':'Гипсовщик'}[normalizeEmployeeSpecialty(value)]||normalizeEmployeeSpecialty(value));
const isPreprodEmployee = employee => employeeSpecialtyLabel(employee?.specialty)==='Препрод техник';
const isFrameEmployee = employee => employeeSpecialtyLabel(employee?.specialty)==='Каркасист';
const isPainterEmployee = employee => employeeSpecialtyLabel(employee?.specialty)==='Красильщик';
const initials = value => String(value||'ГТ').trim().split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase()||'ГТ';
const shortDate = value => value ? new Date(value).toLocaleDateString('ru-RU') : '—';
const displayActor = event => event?.actor || (event?.actorRole === 'clinic' ? 'Клиент' : 'Create Dental Team');

export function createTechnicianCabinet({root,orders,assets,logo,icon,toothChart,isActive,currentUser,orderHistory=()=>[],clientRequests=()=>[],tasks=()=>[],deliverySettings=()=>({freeThreshold:4000,fee:500}),onDeliverySettingsUpdate=()=>{},promoCodes=()=>[],onPromoCodesUpdate=()=>{},onUserUpdate=()=>{}}) {
  const navIcon=(name,size=20)=>navigationIcons[name]?`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${navigationIcons[name]}</svg>`:icon(name,size);
  const pendingConfirmation=order=>['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(order.stage);
  let confirmingOrderId='';
  let overrides={};
  try { overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders') || '{}') || {}; } catch { overrides={}; }
  let team=loadEmployees();
  let clients=seedClients.map(client=>({...client}));
  try {
    const saved=JSON.parse(localStorage.getItem('create-dental-tech-clients') || 'null');
    if(Array.isArray(saved))clients=saved.filter(client=>client&&typeof client.id==='string'&&typeof client.name==='string');
  } catch { /* Keep the demo directory if local data is damaged. */ }
  if(!document.querySelector('link[data-chief-restore]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/assets/chief-restore.css?v=suborder-polish-20261112-3';link.dataset.chiefRestore='1';document.head.append(link)}
  const initialRoute=routeFromPath(location.pathname);
  const state={page:initialRoute.role==='technician'?initialRoute.page:'overview',filter:'Все',search:'',orderDueFilter:'',orderId:initialRoute.orderId||'',month:new Date().getMonth(),technician:'Все техники',metric:'revenue',sort:'revenue',orderSortKey:'createdAt',orderSortDirection:'desc',orderFilterOpen:false,orderClinicFilter:'',orderMonthFilter:'',orderDoctorFilter:'',orderEmployeeFilter:'',orderWorkFilter:'',taskSearch:'',taskFilterOpen:false,taskEmployeeFilter:'',taskStatusFilter:'',taskPriorityFilter:'',taskCreateOpen:false,taskEditId:null,clientSearch:'',requestFilter:'all',requestSearch:'',requestSearchFilters:{orderFilterOpen:false,orderClinicFilter:'',orderMonthFilter:'',orderDoctorFilter:'',orderEmployeeFilter:'',orderWorkFilter:''},qualityFilter:'all',qualitySearch:'',qualitySearchFilters:{orderFilterOpen:false,orderClinicFilter:'',orderMonthFilter:'',orderDoctorFilter:'',orderEmployeeFilter:'',orderWorkFilter:''},editClientId:null,confirmDeleteId:null,employeeSearch:'',employeeFilter:'all',editEmployeeId:null,confirmFireId:null,confirmEmployeeDeleteId:null,qualityReworkOrderId:null,conversations:[],activeConversation:null,conversationMessages:[],messageAttachment:null,messagesError:'',deadlineMonth:new Date(new Date().getFullYear(),new Date().getMonth(),1),deadlineDay:new Date().getDate(),profile:null,integration:null,integrationLoading:false,editOrderId:null,editOrderVariants:null,confirmOrderDeleteId:null,orderUpload:null,cadPreview:null,millingSendingOrderId:'',pricingDraft:null,pricingSaving:false,deliverySettingsDraft:null,deliverySettingsSaving:false,promoCodesDraft:null,promoCodesSaving:false,pricingAddingCategory:null,toast:''};
  state.orderDisplayMode='grouped';
  try { if(localStorage.getItem('create-dental-order-display-mode')==='list')state.orderDisplayMode='list'; } catch {}
  state.expandedOrderGroups={};
  state.sidebarGroup='';
  state.pricingEditingRows={};state.pricingEditingCategories={};state.pricingOrderChanged=false;
  state.productionSearch='';
  state.productionScope='all';
  state.productionFilters={orderFilterOpen:false,orderClinicFilter:'',orderMonthFilter:'',orderDoctorFilter:'',orderEmployeeFilter:'',orderWorkFilter:''};
  state.detailReturnPage='orders';
  const sidebarCollapsed = () => { try { return localStorage.getItem('create-dental-sidebar-collapsed') === '1'; } catch { return false; } };
  const sidebarCollapseMarkup = () => `<button class="sidebar-collapse-toggle" data-tech-sidebar-toggle aria-label="${sidebarCollapsed()?'Развернуть':'Свернуть'} боковое меню" title="${sidebarCollapsed()?'Развернуть':'Свернуть'} боковое меню">${icon('chevron',16)}</button>`;
  const sidebarMark = '<span class="sidebar-mark" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9c3-3.2 7.4-3.5 12-1 4.6-2.5 9-2.2 12 1 2.6 2.8 1.6 8.2.6 12.9-.9 4.5-2 10.6-4.6 15-.9 1.5-3.1 1.4-4-.2l-3.9-8.1c-.8-1.6-3.3-1.6-4.1 0l-3.9 8.1c-.9 1.6-3.1 1.7-4 .2-2.6-4.4-3.7-10.5-4.6-15C10.4 17.2 9.4 11.8 12 9Z"/><path d="M18 10.5c.3 3.1.5 5.6 1.6 7.2M30 10.5c-.3 3.1-.5 5.6-1.6 7.2"/></svg></span>';
  const payrollUI=createPayrollUI({root,isActive:()=>isActive()&&state.page==='salary'});
  function salaryPage(){return payrollUI.markup()}
  let cadPreviewRequest=0;
  let taskSaving=false;
  let taskDragId='';
  let messagesRequest=0;
  let productionRefreshInFlight=false;
  const chiefAvatarKey='create-dental-chief-avatar';
  let pricingDrag=null,pricingPointerDrag=null,pricingCategoryDrag=null,pricingCategoryPointerDrag=null;
  function clearPricingDrag(){
    root().querySelectorAll('.tech-catalog-row.is-dragging,.tech-catalog-row.is-drop-before,.tech-catalog-row.is-drop-after,.tech-pricing-category.is-dragging,.tech-pricing-category.is-drop-before,.tech-pricing-category.is-drop-after').forEach(row=>row.classList.remove('is-dragging','is-drop-before','is-drop-after'));
    pricingPointerDrag?.preview?.remove();pricingCategoryPointerDrag?.preview?.remove();pricingDrag=null;pricingPointerDrag=null;pricingCategoryDrag=null;pricingCategoryPointerDrag=null;
  }
  function movePricingService(category,from,to){
    if(state.pricingSaving)return false;
    const previous=state.pricingDraft,next=reorderCatalogService(previous,category,from,to);if(next===previous)return false;
    const prefix=category+':',editing=new Set(Object.entries(state.pricingEditingRows).filter(([key,value])=>key.startsWith(prefix)&&value).map(([key])=>previous[category].options[Number(key.slice(prefix.length))]));
    for(const key of Object.keys(state.pricingEditingRows))if(key.startsWith(prefix))delete state.pricingEditingRows[key];
    next[category].options.forEach((option,index)=>{if(editing.has(option))state.pricingEditingRows[prefix+index]=true});
    state.pricingDraft=next;state.pricingOrderChanged=true;render();
    queueMicrotask(()=>root().querySelector(`[data-pricing-row][data-category="${category}"][data-option="${to}"] [data-pricing-drag]`)?.focus({preventScroll:true}));
    return true;
  }
  function movePricingCategory(from,to){
    if(state.pricingSaving)return false;
    const previous=state.pricingDraft,next=reorderCatalogCategory(previous,from,to);
    if(next===previous)return false;
    const newIndexByCategory=new Map(next.map((category,index)=>[category,index]));
    const editingCategories={};
    Object.entries(state.pricingEditingCategories).forEach(([oldIndex,value])=>{if(!value)return;const nextIndex=newIndexByCategory.get(previous[Number(oldIndex)]);if(nextIndex!==undefined)editingCategories[nextIndex]=true});
    const editingRows={};
    Object.entries(state.pricingEditingRows).forEach(([key,value])=>{if(!value)return;const [oldCategoryIndex,oldOptionIndex]=key.split(':').map(Number),category=previous[oldCategoryIndex],nextCategoryIndex=newIndexByCategory.get(category),option=category?.options?.[oldOptionIndex],nextOptionIndex=option&&next[nextCategoryIndex]?.options?.indexOf(option);if(nextCategoryIndex!==undefined&&nextOptionIndex>=0)editingRows[`${nextCategoryIndex}:${nextOptionIndex}`]=true});
    state.pricingDraft=next;state.pricingEditingCategories=editingCategories;state.pricingEditingRows=editingRows;state.pricingAddingCategory=state.pricingAddingCategory===null?null:newIndexByCategory.get(previous[state.pricingAddingCategory])??null;state.pricingOrderChanged=true;render();
    queueMicrotask(()=>root().querySelector(`[data-pricing-category-row][data-category="${to}"] [data-pricing-category-drag]`)?.focus({preventScroll:true}));
    return true;
  }
  function pricingDropTarget(x,y){
    const row=document.elementFromPoint(x,y)?.closest?.('[data-pricing-row]');
    return row&&Number(row.dataset.category)===pricingDrag?.category?row:null;
  }
  function pricingCategoryDropTarget(x,y){return document.elementFromPoint(x,y)?.closest?.('[data-pricing-category-row]')||null}
  function markPricingDrop(row,y){
    root().querySelectorAll('.tech-catalog-row.is-drop-before,.tech-catalog-row.is-drop-after').forEach(item=>item.classList.remove('is-drop-before','is-drop-after'));
    if(!row||Number(row.dataset.option)===pricingDrag?.from)return;
    const rect=row.getBoundingClientRect();row.classList.add(y>rect.top+rect.height/2?'is-drop-after':'is-drop-before');
  }
  function finishPricingDrop(row,y){
    const drag=pricingDrag;if(!drag||!row||Number(row.dataset.category)!==drag.category){clearPricingDrag();return}
    const rect=row.getBoundingClientRect(),insert=Number(row.dataset.option)+(y>rect.top+rect.height/2?1:0),to=insert-(drag.from<insert?1:0);
    clearPricingDrag();movePricingService(drag.category,drag.from,to);
  }
  function finishPricingCategoryDrop(row,y){
    const drag=pricingCategoryDrag;if(!drag||!row){clearPricingDrag();return}
    const rect=row.getBoundingClientRect(),insert=Number(row.dataset.category)+(y>rect.top+rect.height/2?1:0),to=insert-(drag.from<insert?1:0);
    clearPricingDrag();movePricingCategory(drag.from,to);
  }
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
    state.sidebarGroup='';
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
  function activeTeam(){return team.filter(employee=>employee.status==='active'&&!employee.deleted)}
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
    const historyByOrder=new Map();
    for(const event of orderHistory()){if(!historyByOrder.has(event.orderId))historyByOrder.set(event.orderId,[]);historyByOrder.get(event.orderId).push(event)}
    return orders.map(order => {
      const details={stage:'Ожидает распределения',assignee:'',cadOperator:'',preprodTechnician:'',technician:'',frameTechnician:'',painter:'',ceramicist:'',manufacturingStatus:'',productionType:order.productionType||'digital',priority:'Обычный',teeth:order.teeth||[],clinic:order.clinic||'Dental Clinic',...seedDetails[order.id],...overrides[order.id]};
      if(details.stage==='Черновик из Telegram'&&order.telegramDraft===false)details.stage='Ожидает распределения';
      if(details.stage==='Изготовление'&&!manufacturingStatuses.includes(details.manufacturingStatus))details.manufacturingStatus=manufacturingStatuses[0];
      const legacy=team.find(employee=>employee.originalName===details.assignee),preprodTechnicianKey=details.preprodTechnician||details.preprod||'',cadOperatorKey=details.cadOperator||(legacy&&isCadOperatorEmployee(legacy)?details.assignee:''),frameTechnicianKey=details.frameTechnician||details.technician||(legacy&&isFrameEmployee(legacy)?details.assignee:''),painterKey=details.painter||details.ceramicist||(legacy&&isPainterEmployee(legacy)?details.assignee:'');
      const assigneeKey=details.assignee||frameTechnicianKey||painterKey||cadOperatorKey||preprodTechnicianKey;
      const frameTechnicianName=employeeName(frameTechnicianKey),painterName=employeeName(painterKey),assignmentLabel=[frameTechnicianName,painterName].filter(Boolean).join(' · ')||employeeName(assigneeKey);
      const participants=orderParticipants({...order,...details},team,historyByOrder.get(order.id)||[]);
      return {...order,...details,participants,participantLabel:participants.map(person=>person.name).join(' · '),workTypes:orderWorkTypes(order),clinic:clientName(details.clinic),assigneeKey,cadOperatorKey,frameTechnicianKey,painterKey,ceramicistKey:painterKey,technicianKey:frameTechnicianKey,assignee:employeeName(assigneeKey),assignmentLabel,preprodTechnicianKey,preprodTechnicianName:employeeName(preprodTechnicianKey),frameTechnicianName,painterName,ceramicistName:painterName,cadOperatorName:employeeName(cadOperatorKey),technicianName:frameTechnicianName};
    });
  }
  function orderById(id){
    const all=allOrders();
    const parentRecord=orders.find(order=>order.clinicOrder&&(order.clinicOrder.id===id||displayOrderId(order.clinicOrder)===id));
    const resolved=parentRecord?parentRecord.clinicOrder.id:resolveOrderId(id,all);
    const direct=all.find(order=>order.id===resolved);
    if(direct&&!parentRecord)return direct;
    const parent=parentRecord?.clinicOrder;
    if(!parent)return direct;
    const children=all.filter(order=>order.parentOrderId===resolved);
    const variants=children.flatMap(child=>Array.isArray(child.variants)&&child.variants.length?child.variants:[{toothMode:child.toothMode||'Одиночка',selectedTeeth:child.teeth||[],work:child.work,workOption:child.material}]);
    return {...parent,clinic:children[0]?.clinic||parent.clinic,labWorkIds:children.map(child=>child.id),serviceWorks:children,variants:variants.length?variants:parent.variants,stage:children[0]?.groupSummary?.stage||parent.stage||children[0]?.stage};
  }
  function chiefStageLabel(order){return order?.stage==='Изготовление'&&manufacturingStatuses.includes(order.manufacturingStatus)?order.manufacturingStatus:order?.stage||''}
  const qualityStageTitle=kind=>({cad:'ОТК CAD',preprod:'ОТК препрода',cam:'ОТК CAM',esthetic:'ОТК эстетики',final:'Финал ОТК'}[kind]||'ОТК');
  const displayChiefStage=(stage,order)=>stage==='Контроль качества'&&order?.qualityRequest?.kind?qualityStageTitle(order.qualityRequest.kind):compactStageLabel(stage);
  function chiefDisplayStageLabel(order){if(order?.stage==='Работа принята')return 'Финал ОТК';const label=chiefStageLabel(order);return displayChiefStage(label,order)}
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

  function productionSignature(){
    return allOrders().map(order=>[
      order.id,order.stage,order.manufacturingStatus,order.qualityRequest?.kind||'',
      order.cadOperatorKey,order.preprodTechnicianKey,order.frameTechnicianKey,order.painterKey,order.cadOperatorStatus,order.preprodTechnicianStatus,order.frameTechnicianStatus,order.painterStatus,order.category1TechnicianStatus,JSON.stringify(order.milling||null),JSON.stringify(order.clinicOrder?.sharedMilling||null)
    ].join('~')).sort().join('|');
  }
  async function refreshProduction(){
    if(!isActive()||!(state.page==='production'||state.page==='detail'&&orderById(state.orderId)?.serviceWorks?.length)||productionRefreshInFlight||state.editOrderId||state.orderUpload||state.cadPreview)return;
    productionRefreshInFlight=true;
    try{
      const before=productionSignature(),data=await loadPortal('compact');
      if(Array.isArray(data.orders))orders.splice(0,orders.length,...data.orders);
      if(data.orderOverrides&&typeof data.orderOverrides==='object'){
        overrides=data.orderOverrides;
        localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
      }
      if(Array.isArray(data.employees)){
        team=data.employees.filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string');
        localStorage.setItem('create-dental-employees',JSON.stringify(team));
      }
      if(Array.isArray(data.orderHistory)){const history=orderHistory();history.splice(0,history.length,...data.orderHistory)}
      if(before!==productionSignature())render();
    }catch{/* Keep the last visible board if a background refresh fails. */}
    finally{productionRefreshInFlight=false}
  }

  async function saveOrderRecord(id,change){
    const index=orders.findIndex(order=>order.id===id),record=index>=0?orders[index]:orders.find(order=>order.clinicOrder?.id===id)?.clinicOrder;
    if(!record)return toast('Заказ не найден');
    const updated={...record,...change,id:record.id,clinicId:record.clinicId,createdAt:record.createdAt};
    const previous=[...orders],next=[...orders];if(index>=0)next[index]=updated;else next.push(updated);
    orders.splice(0,orders.length,...next);
    try{await savePortal('orders',next);toast('Заказ сохранён');render();return true}catch(error){orders.splice(0,orders.length,...previous);render();toast('Не удалось сохранить заказ: '+error.message);return false}
  }
  async function deleteOrderRecord(id){
    const next=orders.filter(order=>order.id!==id&&order.parentOrderId!==id);
    if(next.length===orders.length)return toast('Заказ не найден');
    const nextOverrides={...overrides};for(const order of orders)if(order.id===id||order.parentOrderId===id)delete nextOverrides[order.id];
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
  function filters(includeTechnician=true){
    return `<div class="tech-filters"><label>Месяц<select data-tech-month-select>${monthLabels.map((label,index)=>`<option value="${index}" ${state.month===index?'selected':''}>${monthName(index)} ${analyticsYear}</option>`).join('')}</select></label>${includeTechnician?`<label>Исполнитель<select data-tech-technician><option>Все техники</option>${team.map(employee=>`<option ${state.technician===employee.name?'selected':''}>${safe(employee.name)}</option>`).join('')}</select></label>`:''}<span class="tech-demo-note">По сохранённым заказам · выручка после статуса «Принято врачом»</span></div>`;
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
    return `<section class="tech-panel"><div class="tech-panel-heading"><div><h2>Требует внимания</h2><p>Новые заказы и контроль качества</p></div><button class="tech-link" data-tech-page="orders">Все заказы →</button></div><div class="tech-attention">${list.map(order=>`<button data-tech-order="${order.id}"><span class="tech-order-icon">${icon('orders',20)}</span><span><strong>${order.id} · ${safe(orderWorkLabel(order))}</strong><small>${safe(order.clinic)} · срок ${order.date}</small></span><em class="tech-stage ${stageTone(order.stage)}">${order.stage}</em></button>`).join('')||'<p class="tech-empty">Все заказы распределены и проверены</p>'}</div></section>`;
  }
  function doctorAcceptancePanel(){
    const overdue=doctorAcceptanceOverdueOrders();
    if(!overdue.length)return '';
    return `<section class="tech-panel tech-doctor-overdue"><div class="tech-panel-heading"><div><h2>Врачи не приняли работу за 2 дня</h2><p>Свяжитесь с клиникой и уточните приёмку заказа.</p></div><span class="tech-stage overdue">${overdue.length} ${overdue.length===1?'заказ':'заказа'}</span></div><div class="tech-doctor-overdue-list">${overdue.map(order=>{const info=doctorAcceptanceInfo(order);return `<button data-tech-order="${safe(order.id)}"><span class="tech-order-icon">${icon('orders',20)}</span><span><strong>${safe(order.clinic)}</strong><small>${safe(order.id)} · ${safe(orderWorkLabel(order))} · передано ${shortDate(info.deliveredAt)}</small></span><em>Просрочено ${info.daysLate} ${info.daysLate===1?'день':'дня'}</em></button>`}).join('')}</div></section>`;
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
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ЛАБОРАТОРИЯ · ГЛАВНЫЙ ТЕХНИК</span><h1>Обзор лаборатории</h1></div><div class="tech-task-count"><strong>${newCount+qaCount+doctorOverdueCount+requestCount+registrationCount}</strong><span>требуют решения</span></div></div>${alerts?`<div class="tech-notification-stack">${alerts}</div>`:''}${filters(false)}${kpis()}${doctorAcceptancePanel()}<div class="dashboard-grid tech-dashboard-grid"><div class="dashboard-main tech-dashboard-main">${chart()}${attentionOrders()}${teamSnapshot()}</div><aside class="dashboard-aside tech-dashboard-aside">${chiefDeadlineCalendar()}${breakdown('clinic',4)}</aside></div>`;
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
      if(key==='clinic'){x=a.clinic||'';y=b.clinic||''}
      if(key==='work'){x=`${a.work} ${a.patient}`;y=`${b.work} ${b.patient}`}
      if(key==='assignee'){x=a.participantLabel||'Не назначены';y=b.participantLabel||'Не назначены'}
      return String(x).localeCompare(String(y),'ru',{numeric:true})*sign;
    });
  }
   function orderActionButtons(id,{includeDisk=false,parent=false}={}){
    const target=safe(id),label=safe(displayOrderId(id)),scope=parent?'весь заказ':'заказ';
    return `${includeDisk?`<button type="button" class="tech-icon-btn disk" data-tech-order-action="disk" data-id="${target}" aria-label="Открыть папку пациента для заказа ${label}" title="Папка пациента на Яндекс Диске">${icon('disk',16)}</button>`:''}<button type="button" class="tech-icon-btn" data-tech-order-action="edit" data-id="${target}" aria-label="Редактировать ${scope} ${label}" title="Редактировать ${scope}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg></button><button type="button" class="tech-icon-btn danger" data-tech-order-action="delete" data-id="${target}" aria-label="Удалить ${scope} ${label}" title="Удалить ${scope}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 6 12 12M6 18 18 6"/></svg></button>`;
  }
  function orderRow(order,{child=false}={}){
    const acceptance=doctorAcceptanceInfo(order),typeLabel=order.productionType==='analog'?'Аналоговый':'Цифровой',typeTone=order.productionType==='analog'?'analog':'digital',stageLabel=acceptance?.overdue?'Врач не принял 2 дня':chiefDisplayStageLabel(order),stageToneClass=orderListStageTone(order,acceptance?.overdue);
    return `<tr data-tech-order="${safe(order.id)}" tabindex="0" class="tech-order-row${child?' tech-order-child-row':''}"><td>${child?'<span class="tech-order-child-mark" aria-hidden="true">↳</span>':''}${safe(displayOrderId(order))}</td><td>${safe(order.clinic)}</td><td>${shortDate(order.createdAt)}</td><td class="tech-order-type-cell"><span class="tech-order-type-label ${typeTone}">${typeLabel}</span></td><td class="tech-order-work-cell">${safe(orderWorkLabel(order))}</td><td class="tech-order-patient-cell">${safe(order.patient)}</td><td>${order.date}</td><td><span class="tech-stage ${stageToneClass}">${safe(stageLabel)}</span></td><td>${order.participants.length?`<ul class="tech-order-participants">${order.participants.map(person=>`<li title="${person.participated?'Участвовал в работе над заказом':'Назначен на заказ'}">${safe(person.name)}</li>`).join('')}</ul>`:'Не назначены'}</td><td class="tech-order-actions-cell"><div class="tech-order-actions">${orderActionButtons(order.id,{includeDisk:!child&&!order.parentOrderId})}</div></td></tr>`;
  }
  function groupedOrderRow(order,{child=false,first=false,last=false,single=false}={}){
    const acceptance=doctorAcceptanceInfo(order),typeLabel=order.productionType==='analog'?'Аналоговый':'Цифровой',typeTone=order.productionType==='analog'?'analog':'digital',stageLabel=acceptance?.overdue?'Врач не принял 2 дня':chiefDisplayStageLabel(order),stageToneClass=orderListStageTone(order,acceptance?.overdue);
    const rowClass=`tech-order-row${child?' tech-order-child-row':''}${single?' tech-order-single-row':''}${first?' tech-order-child-first':''}${last?' tech-order-child-last':''}`;
    const identity=`<strong>${safe(order.clinic||'Не указан')}</strong>${child?'':`<small>${safe(order.patient||'Пациент не указан')}</small>`}`;
    const count=child?'<span class="tech-order-child-placeholder">—</span>':'1 подзаказ';
    const type=child?'<span class="tech-order-child-placeholder">—</span>':`<span class="tech-order-type-label ${typeTone}">${typeLabel}</span>`;
    const work=child?`<strong class="tech-order-child-service">${safe(orderWorkLabel(order))}</strong>`:safe(orderWorkLabel(order));
    return `<tr data-tech-order="${safe(order.id)}" tabindex="0" class="${rowClass}"><td>${child?'<span class="tech-order-child-mark" aria-hidden="true">↳</span>':''}</td><td>${safe(displayOrderId(order))}</td><td>${identity}</td><td>${count}</td><td>${type}</td><td class="tech-order-work-cell">${work}</td><td>${safe(order.date||'—')}</td><td><span class="tech-stage ${stageToneClass}">${safe(stageLabel)}</span></td><td>${order.participants.length?`<ul class="tech-order-participants">${order.participants.map(person=>`<li title="${person.participated?'Участвовал в работе над заказом':'Назначен на заказ'}">${safe(person.name)}</li>`).join('')}</ul>`:'Не назначены'}</td><td class="tech-order-actions-cell"><div class="tech-order-actions">${orderActionButtons(order.id,{includeDisk:!child&&!order.parentOrderId})}</div></td></tr>`;
  }
  function orderGroupSummary(group){
    const first=group.items[0],parent=first.clinicOrder||{},groupId=first.parentOrderId||first.id,expanded=Boolean(state.expandedOrderGroups[groupId]);
    const allCount=Number(first.groupSummary?.count)||group.items.length,works=[...new Set(group.items.flatMap(order=>order.workTypes?.length?order.workTypes:[orderWorkLabel(order)]))],workLabel=works.length>2?`${works.slice(0,2).join(' · ')} +${works.length-2}`:works.join(' · '),stages=group.items.map(order=>{const acceptance=doctorAcceptanceInfo(order);return acceptance?.overdue?'Врач не принял 2 дня':chiefDisplayStageLabel(order)}),stageLabel=[...new Set(stages)].length===1?stages[0]:'Несколько этапов',people=[...new Map(group.items.flatMap(order=>order.participants||[]).map(person=>[person.id||person.name,person])).values()],typeLabels=[...new Set(group.items.map(order=>order.productionType==='analog'?'Аналоговый':'Цифровой'))];
    const countWord=allCount%100>=11&&allCount%100<=14?'подзаказов':allCount%10===1?'подзаказ':allCount%10>=2&&allCount%10<=4?'подзаказа':'подзаказов';
    return `<tr class="tech-order-group-row"><td colspan="10"><div class="tech-order-group-summary" data-tech-order-parent="${safe(groupId)}" tabindex="0" role="link" aria-label="Открыть весь заказ ${safe(displayOrderId(groupId))}"><button type="button" class="tech-order-group-chevron" data-tech-order-group-toggle="${safe(groupId)}" aria-expanded="${expanded?'true':'false'}" aria-label="${expanded?'Свернуть':'Раскрыть'} подзаказы ${safe(displayOrderId(groupId))}">${icon('chevron',15)}</button><span class="tech-order-group-primary"><strong>${safe(displayOrderId(groupId))}</strong><small>${safe(first.patient||'Пациент не указан')}</small></span><span class="tech-order-group-stat tech-order-group-count">${allCount} ${countWord}</span><span class="tech-order-group-stat tech-order-group-type">${safe(typeLabels.join(' · '))}</span><span class="tech-order-group-stat tech-order-group-work">${safe(workLabel||'Несколько услуг')}</span><span class="tech-order-group-stat tech-order-group-deadline">${safe(first.date||'—')}</span><span class="tech-stage ${stageLabel==='Несколько этапов'?'work':orderListStageTone(first)}">${safe(stageLabel)}</span><span class="tech-order-group-stat tech-order-group-people">${people.length?`${people.length} ${people.length===1?'сотрудник':'сотрудника'}`:'Не назначены'}</span><div class="tech-order-group-action tech-order-actions">${orderActionButtons(groupId,{includeDisk:true,parent:true})}</div></div></td></tr>${expanded?group.items.map((order,index)=>groupedOrderRow(order,{child:true,first:index===0,last:index===group.items.length-1})).join(''):''}`;
  }
  function orderRows(list){
    const sorted=sortedOrderRows(list);
    if(state.orderDisplayMode==='list')return sorted.map(order=>orderRow(order)).join('')||'<tr><td colspan="10" class="tech-empty">Заказов не найдено</td></tr>';
    const groups=new Map();
    for(const order of sorted){const key=order.parentOrderId||`single:${order.id}`;if(!groups.has(key))groups.set(key,{key,items:[]});groups.get(key).items.push(order)}
    const rows=[...groups.values()].map(group=>orderGroupSummary(group)).join('');
    return rows||'<tr><td colspan="10" class="tech-empty">Заказов не найдено</td></tr>';
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
  const noDoctorFilter='__none__';
  const orderDoctorLabel=order=>String(order?.doctor||order?.doctorName||'').trim()||'Не указан';
  const orderDoctorMatches=(order,filter)=>!filter||(filter===noDoctorFilter?!String(order?.doctor||order?.doctorName||'').trim():orderDoctorLabel(order)===filter);
  const activeOrderFilters=()=>state.page==='requests'?state.requestSearchFilters:state.page==='production'?state.productionFilters:['intake','quality'].includes(state.page)?state.qualitySearchFilters:state;
  function qualitySubmitter(order){
    const request=order?.qualityRequest;
    if(!request)return null;
    const reference=String(request.employeeId||request.requestedBy||'').trim();
    const name=String(request.requestedByName||request.requestedBy||'').trim();
    return order.participants.find(person=>person.id===reference||person.name===name||person.name===reference)||
      (reference||name?{id:reference||`name:${name}`,name:name||reference}:null);
  }
  function orderFilterPanel(all){
    const filterState=activeOrderFilters();
    const requestsPage=state.page==='requests';
    const clinics=[...new Set(all.map(order=>order.clinic).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    const months=[...new Set(all.map(orderMonthKey))].sort().reverse();
    const employeeSource=['intake','quality'].includes(state.page)
      ? all.map(qualitySubmitter).filter(person=>person&&(
        person.name==='Главный техник'||
        team.some(employee=>employee.id===person.id||employee.name===person.name||employee.originalName===person.name)
      ))
      : all.flatMap(order=>order.participants);
    const employees=[...new Map(employeeSource.map(person=>[person.id,person])).values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'));
    const workTypes=[...new Set(all.flatMap(order=>order.workTypes))].sort((a,b)=>a.localeCompare(b,'ru'));
    const activeCount=(requestsPage
      ? [filterState.orderClinicFilter,filterState.orderMonthFilter,filterState.orderDoctorFilter]
      : [filterState.orderClinicFilter,filterState.orderMonthFilter,filterState.orderDoctorFilter,filterState.orderEmployeeFilter,filterState.orderWorkFilter]
    ).filter(Boolean).length;
    const button=`<button type="button" class="btn outline tech-filter-button ${activeCount?'active':''}" data-tech-filter-panel="toggle">Фильтр${activeCount?` · ${activeCount}`:''}</button>`;
    if(!filterState.orderFilterOpen)return button;
    const doctors=[...new Set(all.map(order=>String(order?.doctor||order?.doctorName||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    return `${button}<div class="tech-order-filter-panel"><div><strong>Клиника</strong><select aria-label="Клиника" data-tech-order-clinic-filter><option value="">Все клиники</option>${clinics.map(clinic=>`<option value="${safe(clinic)}" ${filterState.orderClinicFilter===clinic?'selected':''}>${safe(clinic)}</option>`).join('')}</select></div><div><strong>Врач</strong><select aria-label="Врач" data-tech-order-doctor-filter><option value="">Все врачи</option><option value="${noDoctorFilter}" ${filterState.orderDoctorFilter===noDoctorFilter?'selected':''}>Врач не указан</option>${doctors.map(doctor=>`<option value="${safe(doctor)}" ${filterState.orderDoctorFilter===doctor?'selected':''}>${safe(doctor)}</option>`).join('')}</select></div><div><strong>Месяц заказа</strong><select aria-label="Месяц заказа" data-tech-order-month-filter><option value="">Все месяцы</option>${months.map(month=>`<option value="${month}" ${filterState.orderMonthFilter===month?'selected':''}>${orderMonthLabel(month)}</option>`).join('')}</select></div>${requestsPage?'':`<div><strong>Сотрудник</strong><select aria-label="Сотрудник" data-tech-order-employee-filter><option value="">Все сотрудники</option>${employees.map(person=>`<option value="${safe(person.id)}" ${filterState.orderEmployeeFilter===person.id?'selected':''}>${safe(person.name)}</option>`).join('')}</select></div><div><strong>Тип работы</strong><select aria-label="Тип работы" data-tech-order-work-filter><option value="">Все типы работ</option>${workTypes.map(work=>`<option value="${safe(work)}" ${filterState.orderWorkFilter===work?'selected':''}>${safe(work)}</option>`).join('')}</select></div>`}<div class="tech-order-filter-actions"><button type="button" class="btn outline" data-tech-filter-panel="reset">Сбросить</button><button type="button" class="btn primary" data-tech-filter-panel="close">Готово</button></div></div>`;
  }

  function editVariantPrice(variant){
    return estimateWork({work:variant.work,option:variant.workOption,teeth:variant.selectedTeeth,units:surgicalVariantUnits(variant)}).amount;
  }
  function editVariantFromCard(card){
    const service=String(card.querySelector('[data-edit-service]')?.value||'').split('|'),mode=card.querySelector('[data-edit-mode]')?.value||'Одиночка',jaw=card.querySelector('[data-edit-jaw]')?.value||'';let teeth=[...card.querySelectorAll('[data-edit-tooth]:checked')].map(input=>Number(input.value)).filter(Boolean).sort((a,b)=>a-b);if(mode==='Челюсть')teeth=jaw==='upper'?[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28]:jaw==='lower'?[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]:[];
    const variant={work:service[0]||'',workOption:service[1]||'',toothMode:mode,selectedTeeth:teeth,bridgeRanges:mode==='Мост'?[teeth]:[]};
    if(isSurgicalSocket(variant))variant.units=Math.max(1,Number(card.dataset.units)||1);
    return variant;
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
    const cards=variants.map((variant,index)=>{const selected=new Set(variant.selectedTeeth||[]),jaw=variant.toothMode==='Челюсть'?(selected.has(18)||selected.has(11)||selected.has(21)||selected.has(28)?'upper':'lower'):'';return `<article class="tech-edit-variant" data-edit-variant="${index}" data-units="${Number(variant.units)||1}"><header><div><span>Услуга ${index+1}</span><strong data-edit-card-price>${safe(variant.work||'Новая услуга')}</strong></div>${variants.length>1?`<button type="button" class="tech-edit-remove" data-tech-order-action="remove-edit-variant" data-index="${index}" aria-label="Удалить услугу">×</button>`:''}</header><div class="tech-edit-grid"><label>Режим<select data-edit-mode name="variant-${index}-mode">${['Одиночка','Мост','Челюсть'].map(mode=>`<option ${variant.toothMode===mode?'selected':''}>${mode}</option>`).join('')}</select></label><label>Услуга<select data-edit-service name="variant-${index}-service" required>${serviceOptionsFor(variant)}</select></label><label>Челюсть<select data-edit-jaw name="variant-${index}-jaw"><option value="">Не выбрана</option><option value="upper" ${jaw==='upper'?'selected':''}>Верхняя</option><option value="lower" ${jaw==='lower'?'selected':''}>Нижняя</option></select></label></div><fieldset class="tech-edit-teeth-field"><legend>Выберите зубы</legend><div class="tech-edit-teeth">${teethOptions.map(tooth=>`<label><input type="checkbox" data-edit-tooth value="${tooth}" ${selected.has(tooth)?'checked':''}><span>${tooth}</span></label>`).join('')}</div></fieldset><div class="tech-edit-price"><span>Сумма услуги</span><strong data-edit-amount>${editVariantPrice(variant)===null?'Стоимость уточняется':rubles(editVariantPrice(variant))}</strong></div></article>`}).join('');
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
      if(!matchesParticipantAndWork(order,state.orderEmployeeFilter,state.orderWorkFilter))return false;
      if(state.orderClinicFilter&&state.orderClinicFilter!==order.clinic)return false;
      if(state.orderMonthFilter&&orderMonthKey(order)!==state.orderMonthFilter)return false;
      if(state.orderDoctorFilter&&orderDoctorLabel(order)!==state.orderDoctorFilter)return false;
      if(state.orderDueFilter&&order.date!==state.orderDueFilter)return false;
      return !state.search||[order.id,order.work,order.patient,order.clinic,order.doctor,orderDoctorLabel(order),order.assignee,order.participantLabel,...order.workTypes,order.date].some(value=>String(value).toLowerCase().includes(state.search.toLowerCase()));
    });
    const groupedView=state.orderDisplayMode==='grouped',tableHead=groupedView?`<thead><tr><th></th><th>Заказ</th>${orderSortHeading('clinic','Заказчик')}<th>Подзаказы</th>${orderSortHeading('productionType','Тип заказа')}${orderSortHeading('work','Услуги')}${orderSortHeading('date','Срок')}${orderSortHeading('stage','Этап')}${orderSortHeading('assignee','Сотрудники')}<th></th></tr></thead>`:`<thead><tr><th>Заказ</th>${orderSortHeading('clinic','Заказчик')}${orderSortHeading('createdAt','Создан')}${orderSortHeading('productionType','Тип заказа')}${orderSortHeading('work','Тип работы')}${orderSortHeading('patient','Пациент')}${orderSortHeading('date','Срок')}${orderSortHeading('stage','Этап')}${orderSortHeading('assignee','Сотрудники')}<th></th></tr></thead>`,columnCount=10,colgroup=`<colgroup>${'<col>'.repeat(columnCount)}</colgroup>`;
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОИЗВОДСТВО</span><h1>Заказы лаборатории</h1></div></div>${state.orderDueFilter?`<div class="active-date-filter"><span>Срок сдачи: <strong>${safe(state.orderDueFilter)}</strong></span><button data-tech-date-filter-clear aria-label="Сбросить фильтр по дате">×</button></div>`:''}<div class="tech-order-viewbar"><div class="tech-order-view-toggle tech-segment" role="group" aria-label="Вид списка заказов"><button type="button" data-tech-order-view="grouped" class="${state.orderDisplayMode==='grouped'?'active':''}">Группировка</button><button type="button" data-tech-order-view="list" class="${state.orderDisplayMode==='list'?'active':''}">Все заказы</button></div></div><div class="tech-panel"><div class="tech-order-tools"><div class="tech-segment">${[['Все','Все'],['Новые','Новые'],['В работе','В работе'],['Контроль качества','На проверке'],['Приняты','Приняты'],['Доставка в клинику','В доставке'],['Принято врачом','Принято доктором'],['Врач не принял 2 дня','Врач не принял 2 дня']].map(([label,key])=>`<button data-tech-filter="${key}" class="${state.filter===key?'active':''}">${label}</button>`).join('')}</div><div class="tech-order-searchbar">${orderFilterPanel(all)}<input id="tech-search" placeholder="Поиск по заказу, клинике или технику..." value="${safe(state.search)}"></div></div><div class="tech-table-wrap tech-orders-table-wrap"><table class="tech-table tech-orders-table ${groupedView?'tech-orders-table-grouped':'tech-orders-table-list'}">${colgroup}${tableHead}<tbody>${orderRows(list)}</tbody></table></div></div>${orderEditModal()}${orderDeleteModal()}`;
  }
  const productionColumns=[
    ['new','Новые'],['intake','Приём'],['preprod','Препрод'],['cad','CAD'],
    ['doctor','Согласование врача'],['cam','CAM'],['esthetic','Эстетика'],
    ['quality','ОТК'],['final','Финальная ОТК'],['rework','Доработка'],
    ['delivery','Доставка'],['done','Готово']
  ];
  function productionColumn(order){
    if(['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(order.stage))return 'new';
    if(order.stage==='Подготовка')return 'intake';
    if(['Препрод','Аналоговая подготовка'].includes(order.stage))return 'preprod';
    if(order.stage==='Моделирование')return 'cad';
    if(order.stage==='Согласование CAD')return 'doctor';
    if(order.stage==='Изготовление')return order.manufacturingStatus===manufacturingStatuses[1]?'esthetic':'cam';
    if(order.stage==='Контроль качества')return order.qualityRequest?.kind==='final'?'final':'quality';
    if(order.stage==='Работа принята')return 'final';
    if(order.stage==='На доработке')return 'rework';
    if(order.stage==='В доставке')return 'delivery';
    if(['Принято доктором','Готово к выдаче'].includes(order.stage))return 'done';
    return 'new';
  }
  function productionCard(order){
    const status=order.stage==='Изготовление'&&productionColumn(order)==='cam'?camWorkflowStatus(order):
      order.stage==='Изготовление'&&productionColumn(order)==='esthetic'?(order.painterStatus||order.ceramicistStatus||'Ожидает принятия'):
      order.stage==='Контроль качества'?qualityStageTitle(order.qualityRequest?.kind):chiefDisplayStageLabel(order);
    const teamNames=order.participants.slice(0,2).map(person=>person.name).join(', ');
    const extraCount=Math.max(0,order.participants.length-2);
    return `<button type="button" class="production-card" data-tech-order="${safe(order.id)}" aria-label="Открыть заказ ${safe(order.id)}"><span class="production-card-id">${safe(order.id)}</span><strong>${safe(orderWorkLabel(order))}</strong><span class="production-card-clinic">${safe(order.clinic)}</span><span class="production-card-patient">${safe(order.patient)}</span><span class="production-card-status">${safe(status)}</span><span class="production-card-footer"><span>Срок ${safe(order.date||'—')}</span><span>${safe(teamNames||'Не назначен')}${extraCount?` +${extraCount}`:''}</span></span></button>`;
  }
  function productionFilterPanel(all){
    const selected=state.productionFilters;
    const clinics=[...new Set(all.map(order=>order.clinic).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    const months=[...new Set(all.map(orderMonthKey))].sort().reverse();
    const workTypes=[...new Set(all.flatMap(order=>order.workTypes))].sort((a,b)=>a.localeCompare(b,'ru'));
    const doctors=[...new Set(all.map(order=>String(order?.doctor||order?.doctorName||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    const count=[selected.orderClinicFilter,selected.orderMonthFilter,selected.orderDoctorFilter,selected.orderWorkFilter].filter(Boolean).length;
    const button=`<button type="button" class="btn outline tech-filter-button ${count?'active':''}" data-tech-filter-panel="toggle" aria-expanded="${selected.orderFilterOpen}">Фильтр${count?` · ${count}`:''}</button>`;
    if(!selected.orderFilterOpen)return button;
    return `${button}<div class="tech-order-filter-panel"><div><strong>Клиника</strong><select aria-label="Клиника" data-tech-order-clinic-filter><option value="">Все клиники</option>${clinics.map(clinic=>`<option value="${safe(clinic)}" ${selected.orderClinicFilter===clinic?'selected':''}>${safe(clinic)}</option>`).join('')}</select></div><div><strong>Врач</strong><select aria-label="Врач" data-tech-order-doctor-filter><option value="">Все врачи</option><option value="${noDoctorFilter}" ${selected.orderDoctorFilter===noDoctorFilter?'selected':''}>Врач не указан</option>${doctors.map(doctor=>`<option value="${safe(doctor)}" ${selected.orderDoctorFilter===doctor?'selected':''}>${safe(doctor)}</option>`).join('')}</select></div><div><strong>Месяц заказа</strong><select aria-label="Месяц заказа" data-tech-order-month-filter><option value="">Все месяцы</option>${months.map(month=>`<option value="${month}" ${selected.orderMonthFilter===month?'selected':''}>${orderMonthLabel(month)}</option>`).join('')}</select></div><div><strong>Тип работы</strong><select aria-label="Тип работы" data-tech-order-work-filter><option value="">Все типы работ</option>${workTypes.map(work=>`<option value="${safe(work)}" ${selected.orderWorkFilter===work?'selected':''}>${safe(work)}</option>`).join('')}</select></div><div class="tech-order-filter-actions"><button type="button" class="btn outline" data-tech-filter-panel="reset">Сбросить</button><button type="button" class="btn primary" data-tech-filter-panel="close">Готово</button></div></div>`;
  }
  function productionPage(){
    const query=state.productionSearch.trim().toLocaleLowerCase('ru');
    const all=allOrders(),selected=state.productionFilters;
    const list=all.filter(order=>{
      if(state.productionScope==='active'&&productionColumn(order)==='done')return false;
      if(selected.orderClinicFilter&&order.clinic!==selected.orderClinicFilter)return false;
      if(selected.orderMonthFilter&&orderMonthKey(order)!==selected.orderMonthFilter)return false;
      if(!orderDoctorMatches(order,selected.orderDoctorFilter))return false;
      if(selected.orderWorkFilter&&!order.workTypes.includes(selected.orderWorkFilter))return false;
      return !query||[order.id,order.clinic,order.patient,orderWorkLabel(order),order.participantLabel,order.date].some(value=>String(value||'').toLocaleLowerCase('ru').includes(query));
    });
    const byStage=new Map(productionColumns.map(([id])=>[id,[]]));
    for(const order of list)byStage.get(productionColumn(order)).push(order);
    for(const column of byStage.values())column.sort((a,b)=>(parseDate(String(a.date||''))?.getTime()||Infinity)-(parseDate(String(b.date||''))?.getTime()||Infinity));
    const columns=productionColumns.map(([id,label])=>{const items=byStage.get(id);return `<section class="production-column" aria-label="${label}: ${items.length}"><header><span>${label}</span><b>${items.length}</b></header><div class="production-column-cards">${items.map(productionCard).join('')||'<p class="production-column-empty">Нет заказов</p>'}</div></section>`}).join('');
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОИЗВОДСТВО</span><h1>Доска производства</h1></div></div><section class="tech-panel production-panel"><div class="production-toolbar"><div class="tech-segment" aria-label="Какие заказы показать"><button type="button" data-production-scope="all" class="${state.productionScope==='all'?'active':''}" aria-pressed="${state.productionScope==='all'}">Все</button><button type="button" data-production-scope="active" class="${state.productionScope==='active'?'active':''}" aria-pressed="${state.productionScope==='active'}">Незавершённые</button></div><input id="production-search" type="search" aria-label="Поиск заказов на доске" placeholder="Поиск по заказу, клинике, пациенту..." value="${safe(state.productionSearch)}"><div class="production-filter-wrap">${productionFilterPanel(all)}</div><span class="production-total">${list.length} заказов</span></div><div class="production-board" role="region" aria-label="Канбан-доска производства" tabindex="0">${columns}</div></section>`;
  }
  function pulsePage(){
    const orders=allOrders(),pulse=calculateCompanyPulse(orders,activeTeam(),new Date(),orderHistory(),clientRequests());
    const score=pulse.score;
    const status=score===null?'Недостаточно данных':pulse.critical?'Нужны действия':score>=85?'Ритм стабильный':score>=65?'Есть зоны внимания':'Нужны действия';
    const ranked=[['сроки',pulse.deadlines.score],['поток заказов',pulse.flow.score],['качество',pulse.quality.score],['назначения',pulse.staffing.score],['оплаты',pulse.payments.score]].filter(([,value])=>value!==null).sort((a,b)=>a[1]-b[1]);
    const summary=score===null?'Показатели появятся по мере появления подтверждённых данных.':`Главная зона внимания — ${ranked[0]?.[0]||'текущие заказы'}. Ниже — заказы, где требуется действие.`;
    const metric=(title,value,detail,foot)=>`<div class="pulse-metric"><div class="pulse-metric-heading"><strong>${title}</strong><b>${value===null?'—':value+'%'}</b></div><div class="pulse-track" role="meter" aria-label="${title}" aria-valuemin="0" aria-valuemax="100" ${value===null?'aria-valuetext="Нет данных"':`aria-valuenow="${value}"`}><i style="width:${value??0}%"></i></div><p>${detail}</p><small>${foot}</small></div>`;
    const orderLink=(order,note)=>`<button type="button" class="pulse-order" data-tech-order="${safe(order.id)}"><span><strong>${safe(order.id)}</strong><small>${safe(order.clinic)} · ${safe(order.patient||'Пациент не указан')}</small></span><em>${safe(note)}</em>${icon('chevron',16)}</button>`;
    const actionGroup=(title,count,items,empty)=>`<section class="pulse-action-group"><header><strong>${title}</strong><b>${count}</b></header>${items.length?items.join(''):`<p class="pulse-action-empty">${empty}</p>`}</section>`;
    const deadlineItems=pulse.deadlines.risks.slice(0,5).map(({order,days})=>orderLink(order,days<0?`Просрочен на ${-days} дн.`:days===0?'Срок сегодня':`Через ${days} дн.`));
    const stalledItems=pulse.flow.stalled.slice(0,5).map(({order,hours})=>orderLink(order,`${order.stage} · ${hours} ч без перехода`));
    const qualityItems=pulse.quality.pending.slice(0,5).map(({order,since})=>orderLink(order,since?`На ОТК ${Math.max(0,Math.floor((Date.now()-since)/3600000))} ч`:'Ожидает решения ОТК'));
    const assignmentItems=pulse.staffing.unassigned.slice(0,5).map(order=>orderLink(order,'Нет активного специалиста'));
    const overloadedItems=pulse.staffing.overloaded.slice(0,5).flatMap(({name,count,limit,orders})=>orders.slice(0,1).map(order=>orderLink(order,`${name}: ${count} из ${limit} допустимых`)));
    const paymentItems=pulse.payments.unpaid.slice(0,5).map(({order,amount,daysLate})=>orderLink(order,`${daysLate===null?'Срок оплаты не задан':daysLate>0?`Просрочено ${daysLate} дн.`:'Ожидает оплаты'} · ${money(amount)}`));
    const requests=pulse.amendments.pending.slice(0,5).map(request=>{const order=orders.find(item=>item.id===request.orderId);return order?orderLink(order,'Ожидает решения по правке'):''}).filter(Boolean);
    const failures=pulse.quality.recentFailures.slice(0,5).map(event=>{const order=orders.find(item=>item.id===event.orderId);return order?orderLink(order,`${event.reasonCategory||'Возврат ОТК'} · ${event.kind.toUpperCase()}`):''}).filter(Boolean);
    const loads=pulse.staffing.loads.slice(0,8).map(({name,count,limit})=>`<div class="pulse-load"><span>${safe(name)}</span><strong class="${limit&&count>limit?'pulse-overloaded':''}">${count}${limit?` / ${limit}`:''} заказов</strong></div>`).join('');
    const reasons=pulse.quality.reasons.slice(0,5).map(({label,count})=>`<div class="pulse-load"><span>${safe(label)}</span><strong>${count}</strong></div>`).join('');
    return `<div class="tech-heading"><div><span class="tech-eyebrow">АНАЛИТИКА ЛАБОРАТОРИИ</span><h1>Пульс компании</h1><p>Сроки, поток, качество, команда и оплаты</p></div></div><div class="pulse-layout"><section class="tech-panel pulse-score-card"><div class="pulse-score-head"><div class="pulse-ring ${score===null?'is-empty':''}" style="--pulse-value:${score??0}"><div><strong>${score===null?'—':score+'%'}</strong><small>общий ритм</small></div></div><div><h2>${status}</h2><p>${summary}</p><span class="pulse-live">По данным текущих заказов · обновляется при открытии</span></div></div><div class="pulse-metrics">${metric('СРОКИ',pulse.deadlines.score,pulse.deadlines.total?`${pulse.deadlines.overdue} просрочено · ${pulse.deadlines.soon} скоро`:'Нет заказов с датой срока','Незавершённые заказы с указанным сроком.')}${metric('ПОТОК',pulse.flow.score,pulse.flow.total?`${pulse.flow.stalled.length} заказов задержались на этапе`:'Нет известных дат перехода на этап','Порог: 24 ч на ОТК, 48 ч в производстве.')}${metric('КАЧЕСТВО',pulse.quality.score,pulse.quality.sample?`${pulse.quality.passedFirstTime} из ${pulse.quality.sample} с первого раза`:'Нет решений ОТК за 30 дней',pulse.quality.sample<5?'Оценка появится после 5 решений ОТК.':'Первое решение ОТК по заказу и виду проверки.')}${metric('НАЗНАЧЕНИЯ',pulse.staffing.score,pulse.staffing.total?`${pulse.staffing.assigned} из ${pulse.staffing.total} работ назначены`:'Нет работ на этапе специалиста','Перегрузка видна, если задан лимит сотрудника.')}${metric('ОПЛАТЫ',pulse.payments.score,pulse.payments.total?`${money(pulse.payments.paidAmount)} из ${money(pulse.payments.totalAmount)}`:'Нет доставленных заказов с суммой','Доля оплаченной суммы; просрочка только при сроке оплаты.')}</div></section></div><div class="pulse-detail-grid"><section class="tech-panel pulse-attention"><h2>Требуют внимания</h2><p>Откройте карточку и выполните следующий шаг.</p>${actionGroup('Сроки',pulse.deadlines.risks.length,deadlineItems,'Срочных заказов нет.')}${actionGroup('Задержка этапа',pulse.flow.stalled.length,stalledItems,'Этапы идут в пределах выбранного порога.')}${actionGroup('Ожидают ОТК',pulse.quality.pending.length,qualityItems,'Заказов на проверке нет.')}${actionGroup('Без исполнителя',pulse.staffing.unassigned.length,assignmentItems,pulse.staffing.total?'Все текущие работы назначены.':'Нет работ на этапе специалиста.')}${pulse.staffing.overloaded.length?actionGroup('Перегрузка специалистов',pulse.staffing.overloaded.length,overloadedItems,''):''}${pulse.payments.unpaid.length?actionGroup('Неоплаченные заказы',pulse.payments.unpaid.length,paymentItems,''):''}${pulse.amendments.pending.length?actionGroup('Клиентские правки',pulse.amendments.pending.length,requests,'Откройте раздел клиентских правок.'):''}${pulse.quality.recentFailures.length?actionGroup('Возвраты с ОТК за 30 дней',pulse.quality.rejected,failures,''):''}</section><aside class="tech-panel pulse-side"><h2>Загрузка команды</h2><p>Текущие заказы / личный лимит. Лимит задаётся в карточке сотрудника.</p>${loads||'<div class="pulse-side-empty">Нет назначенных текущих работ.</div>'}${pulse.staffing.limitsMissing?`<p class="pulse-data-note">У ${pulse.staffing.limitsMissing} сотрудников лимит ещё не задан.</p>`:''}<button class="pulse-side-link" data-tech-page="team">Настроить команду ${icon('chevron',14)}</button><h2 class="pulse-side-subtitle">Качество и правки</h2><div class="pulse-load"><span>Возвратов с ОТК за 30 дней</span><strong>${pulse.quality.rejected}</strong></div><div class="pulse-load"><span>Клиентских правок за 30 дней</span><strong>${pulse.amendments.recent.length}${pulse.amendments.rate===null?'':` · ${pulse.amendments.rate}%`}</strong></div>${reasons||'<p class="pulse-side-empty">Причины возвратов появятся после решений ОТК.</p>'}<button class="pulse-side-link" data-tech-page="requests">Клиентские правки ${icon('chevron',14)}</button>${pulse.flow.externalWaiting.length?`<h2 class="pulse-side-subtitle">Ожидание врача</h2>${pulse.flow.externalWaiting.slice(0,3).map(({order,hours})=>orderLink(order,`${hours} ч`)).join('')}`:''}<details class="pulse-method"><summary>Как рассчитываются показатели</summary><p>Общий балл: сроки 30%, поток 20%, качество 30%, назначения 10%, оплаты 10%. Показатели без достаточных данных исключаются с перерасчётом весов. Качество — доля первых успешных решений ОТК за 30 дней, минимум 5 проверок. Задержка этапа — более 24 ч на ОТК и в начале заказа, более 48 ч в производстве. Ожидание врача показывается отдельно. Перегрузка требует личного лимита в карточке сотрудника. Просрочка оплаты определяется только при указанном сроке оплаты. Проценты помогают заметить риск, а не заменяют проверку заказа.</p></details></aside></div>`;
  }
  function taskFilterPanel(activeTeam){
    const count=[state.taskEmployeeFilter,state.taskStatusFilter,state.taskPriorityFilter].filter(Boolean).length;
    const button=`<button type="button" class="btn outline tech-filter-button ${count?'active':''}" data-task-filter-panel="toggle">Фильтр${count?` · ${count}`:''}</button>`;
    if(!state.taskFilterOpen)return button;
    return `${button}<div class="tech-order-filter-panel task-filter-panel"><div><strong>Исполнитель</strong><select aria-label="Исполнитель" data-task-employee-filter><option value="">Все сотрудники</option>${activeTeam.map(employee=>`<option value="${safe(employee.id)}" ${state.taskEmployeeFilter===employee.id?'selected':''}>${safe(employee.name)}</option>`).join('')}</select></div><div><strong>Статус</strong><select aria-label="Статус задачи" data-task-status-filter><option value="">Все статусы</option>${taskStatuses.map(status=>`<option value="${status.key}" ${state.taskStatusFilter===status.key?'selected':''}>${status.label}</option>`).join('')}</select></div><div><strong>Приоритет</strong><select aria-label="Приоритет задачи" data-task-priority-filter><option value="">Все приоритеты</option>${taskPriorities.map(priority=>`<option value="${priority.key}" ${state.taskPriorityFilter===priority.key?'selected':''}>${priority.label}</option>`).join('')}</select></div><div class="tech-order-filter-actions"><button type="button" class="btn outline" data-task-filter-panel="reset">Сбросить</button><button type="button" class="btn primary" data-task-filter-panel="close">Готово</button></div></div>`;
  }
  function filteredTasks(list){
    const query=state.taskSearch.trim().toLocaleLowerCase('ru-RU');
    return list.filter(task=>(!query||[task.title,task.description,task.assigneeName].some(value=>String(value||'').toLocaleLowerCase('ru-RU').includes(query)))&&(!state.taskEmployeeFilter||task.assigneeId===state.taskEmployeeFilter)&&(!state.taskStatusFilter||task.status===state.taskStatusFilter)&&(!state.taskPriorityFilter||task.priority===state.taskPriorityFilter));
  }
  function taskBoardMarkup(list){
    const card=task=>{const details=String(task.description||'').trim(),comment=details===String(task.title||'').trim()?'':details.startsWith(String(task.title||'').trim())?details.slice(String(task.title||'').trim().length).trim():details;return `<article class="task-card ${taskIsOverdue(task)?'is-overdue':''}" draggable="true" data-task-drag="${safe(task.id)}" aria-label="Перетащить задачу ${safe(task.title||'Задача')}"><header><span class="task-priority ${safe(task.priority)}">${safe(taskPriorityLabel(task.priority))}</span><time>${safe(taskDateLabel(task.dueDate))}</time></header><h3>${safe(task.title||'Задача')}</h3>${comment?`<p>${safe(comment)}</p>`:''}<footer><span>${safe(task.assigneeName)}</span><span class="task-card-actions"><button type="button" class="task-card-action" data-task-edit="${safe(task.id)}">Изменить</button><button type="button" class="task-card-action danger" data-task-delete="${safe(task.id)}">Удалить</button><span class="task-drag-hint" aria-hidden="true">Перетащить</span></span></footer></article>`};
    return `<section class="task-board" data-task-board>${taskStatuses.map(status=>{const items=list.filter(task=>task.status===status.key);return `<section class="task-column" data-task-column="${status.key}"><header><h2>${status.label}</h2><b>${items.length}</b></header><div>${items.map(card).join('')||'<p class="task-column-empty">Задач нет</p>'}</div></section>`}).join('')}</section>`;
  }
  function taskCreateDialog(activeTeam){
    if(!state.taskCreateOpen)return '';
    const editing=state.taskEditId?tasks().find(task=>task.id===state.taskEditId):null;
    const currentEmployee=editing&&team.find(employee=>employee.id===editing.assigneeId);
    const currentOption=currentEmployee&&!activeTeam.some(employee=>employee.id===currentEmployee.id)?`<option value="${safe(currentEmployee.id)}" selected disabled>${safe(currentEmployee.name)} · недоступен</option>`:'';
    const employeeOptions=activeTeam.map(employee=>`<option value="${safe(employee.id)}" ${editing?.assigneeId===employee.id?'selected':''}>${safe(employee.name)} · ${safe(employeeSpecialtyDisplayLabel(employee.specialty))}</option>`).join('');
    const comment=editing?.description||editing?.title||'',title=editing?'Редактировать задачу':'Добавить карточку',submit=editing?'Сохранить изменения':'Добавить карточку';
    return `<div class="tech-dialog-backdrop task-create-backdrop" data-task-create="backdrop"><section class="tech-dialog task-create-dialog" role="dialog" aria-modal="true" aria-labelledby="task-create-title"><button type="button" class="tech-dialog-close" data-task-create="close" aria-label="Закрыть">×</button><span class="upload-dialog-eyebrow">КАНБАН ЗАДАЧ</span><h2 id="task-create-title">${title}</h2><p>Назначьте исполнителя и опишите, что нужно сделать.</p><form id="tech-task-form" class="task-modal-form"><div class="task-modal-grid"><label>Исполнитель<select name="assigneeId" required><option value="">Выберите сотрудника</option>${currentOption}${employeeOptions}</select></label><label>Приоритет<select name="priority">${taskPriorities.map(item=>`<option value="${item.key}" ${item.key===(editing?.priority||'normal')?'selected':''}>${item.label}</option>`).join('')}</select></label><label>Срок<input name="dueDate" type="date" value="${safe(editing?.dueDate||'')}"></label></div><label>Комментарий<textarea name="comment" rows="4" maxlength="4000" required placeholder="Что нужно сделать и какой результат ожидается">${safe(comment)}</textarea></label><p role="alert" data-task-create-error hidden></p><div class="task-modal-actions"><button type="button" class="btn outline" data-task-create="close">Отмена</button><button class="btn primary" type="submit">${submit}</button></div></form></section></div>`;
  }
  function tasksPage(){
    const list=tasks(),activeTeam=team.filter(employee=>employee.status==='active'),visible=filteredTasks(list);
    return `<div class="tech-heading"><div><span class="tech-eyebrow">РАБОЧИЙ КОНТУР</span><h1>Задачи</h1><p>Распределяйте работу по четырём статусам.</p></div><button class="btn primary" type="button" data-task-create="open">Добавить карточку</button></div><section class="tech-panel task-filter-panel-wrap"><div class="task-searchbar"><input id="task-search" aria-label="Поиск задач" placeholder="Поиск по задаче, сотруднику или описанию..." value="${safe(state.taskSearch)}">${taskFilterPanel(activeTeam)}</div></section>${taskBoardMarkup(visible)}${taskCreateDialog(activeTeam)}`;
  }
  function clearTaskDrag(){
    taskDragId='';
    root().querySelectorAll('.task-card.is-dragging,.task-column.is-drag-over').forEach(element=>element.classList.remove('is-dragging','is-drag-over'));
  }
  async function moveTaskToStatus(id,status){
    const current=tasks().find(task=>task.id===id);
    if(!current||!taskStatuses.some(item=>item.key===status)||current.status===status)return;
    const stamp=new Date().toISOString(),next=tasks().map(task=>task.id===id?{...task,status,updatedAt:stamp,completedAt:status==='done'?(task.completedAt||stamp):''}:task);
    try{await savePortal('tasks',next);tasks().splice(0,tasks().length,...next);toast('Задача перемещена');render()}
    catch(error){toast('Не удалось переместить задачу: '+error.message);render()}
  }
  function assignmentOptions(order){
    const active=activeTeam();
    const current=team.find(employee=>employee.originalName===order.assigneeKey);
    const unavailable=order.assigneeKey&&!active.some(employee=>employee.originalName===order.assigneeKey)
      ?`<option value="${safe(order.assigneeKey)}" selected disabled>${safe(current?.name||order.assigneeKey)} · недоступен</option>`:'';
    return unavailable+active.map(employee=>`<option value="${safe(employee.originalName)}" ${order.assigneeKey===employee.originalName?'selected':''}>${safe(employee.name)}</option>`).join('');
  }
  let parentFilesRequest=0;
  const orderFilesState={orderId:'',files:[],folderUrl:'',loading:false,error:''};
  function orderUploadDialog(){
    const dialog=state.orderUpload;
    if(!dialog||dialog.orderId!==state.orderId)return '';
    const total=dialog.files.length?Math.round(dialog.files.reduce((sum,item)=>sum+item.progress,0)/dialog.files.length):0;
    const finished=dialog.files.length&&dialog.files.every(item=>['success','error'].includes(item.status));
    return `<div class="tech-dialog-backdrop order-upload-backdrop" data-tech-modal="order-upload"><section class="tech-dialog order-upload-dialog" role="dialog" aria-modal="true"><button class="tech-dialog-close" data-tech-order-action="close-upload" aria-label="Закрыть" ${dialog.uploading?'disabled':''}>×</button><span class="upload-dialog-eyebrow">ЯНДЕКС ДИСК</span><h2>Загрузка файлов заказа</h2><p>Выберите до 10 файлов. В этом окне будет виден прогресс загрузки в папку заказа.</p><label class="upload-dialog-picker ${dialog.uploading?'disabled':''}">${icon('upload',22)}<span>${dialog.files.length?'Добавить другие файлы':'Выбрать файлы'}</span><input type="file" id="tech-order-upload-dialog-input" accept="*/*" multiple hidden ${dialog.uploading?'disabled':''}></label>${dialog.files.length?`<div class="upload-overall"><span>Общий прогресс</span><strong data-tech-upload-total>${total}%</strong><div class="upload-progress-track"><i data-tech-upload-total-bar style="width:${total}%"></i></div></div><div class="upload-progress-list">${dialog.files.map((item,index)=>`<article class="upload-progress-file ${item.status}" data-tech-upload-row="${index}"><div><strong>${safe(item.file.name)}</strong><small data-tech-upload-label>${item.status==='success'?'Загружен на Яндекс Диск':item.status==='error'?safe(item.error||'Не удалось загрузить'):item.status==='uploading'?`Загрузка · ${item.progress}%`:'Ожидает загрузки'}</small></div><div class="upload-progress-track"><i data-tech-upload-bar style="width:${item.progress}%"></i></div></article>`).join('')}</div>`:''}${finished?'<button class="btn primary upload-dialog-done" data-tech-order-action="close-upload">Готово</button>':''}</section></div>`;
  }
  function syncOrderUploadProgress(index){
    const dialog=state.orderUpload,row=root().querySelector(`[data-tech-upload-row="${index}"]`);if(!dialog||!row)return;
    const item=dialog.files[index],label=row.querySelector('[data-tech-upload-label]'),bar=row.querySelector('[data-tech-upload-bar]');row.className=`upload-progress-file ${item.status}`;
    if(label)label.textContent=item.status==='success'?'Загружен на Яндекс Диск':item.status==='error'?(item.error||'Не удалось загрузить'):item.status==='uploading'?`Загрузка · ${item.progress}%`:'Ожидает загрузки';if(bar)bar.style.width=`${item.progress}%`;
    const total=Math.round(dialog.files.reduce((sum,file)=>sum+file.progress,0)/dialog.files.length),totalLabel=root().querySelector('[data-tech-upload-total]'),totalBar=root().querySelector('[data-tech-upload-total-bar]');if(totalLabel)totalLabel.textContent=`${total}%`;if(totalBar)totalBar.style.width=`${total}%`;
  }
  async function startOrderUpload(selected){
    const allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|constructionInfo|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf|html)$/i,all=Array.from(selected||[]),files=all.filter(file=>allowed.test(file.name)&&file.size<=200*1024*1024).slice(0,10);
    if(!files.length)return toast('Выберите поддерживаемые файлы размером до 200 МБ');if(files.length<all.length)toast('Можно загрузить до 10 файлов, каждый до 200 МБ');
    state.orderUpload={orderId:state.orderId,uploading:true,files:files.map(file=>({file,progress:0,status:'waiting',error:''}))};render();
    for(let index=0;index<state.orderUpload.files.length;index++){const item=state.orderUpload.files[index];item.status='uploading';syncOrderUploadProgress(index);try{const purpose=/\.html$/i.test(item.file.name)?'cad-review':'order-file';await uploadOrderFile(state.orderId,item.file,{purpose,onProgress:progress=>{item.progress=progress;syncOrderUploadProgress(index)}});item.progress=100;item.status='success'}catch(error){item.status='error';item.error=error.message}syncOrderUploadProgress(index)}
    state.orderUpload.uploading=false;const result=await loadOrderFiles(state.orderId).catch(()=>null);if(result){orderFilesState.files=result.files||[];orderFilesState.folderUrl=result.folderUrl||''}const failed=state.orderUpload.files.filter(item=>item.status==='error').length;toast(failed?`Не удалось загрузить файлов: ${failed}`:'Все файлы загружены на Яндекс Диск');render();
  }
  function orderServiceCards(order){
    const variants=Array.isArray(order.variants)&&order.variants.length?order.variants:[{toothMode:order.toothMode||'Одиночка',bridgeRanges:order.bridgeRanges||[],selectedTeeth:order.teeth||[],work:order.work,workOption:order.material}];
    return `<section class="tech-order-services tech-panel"><div class="tech-panel-heading"><div><h2>Услуги заказа</h2><p>${variants.length} ${variants.length===1?'услуга':'услуги'} в одном заказе</p></div></div><div class="tech-order-service-list">${variants.map((variant,index)=>{const teeth=Array.isArray(variant.selectedTeeth)?variant.selectedTeeth:[],ranges=Array.isArray(variant.bridgeRanges)?variant.bridgeRanges:[],units=surgicalVariantUnits(variant)??priceUnitsForSelection(variant.work,teeth),amount=estimateWork({work:variant.work,option:variant.workOption,teeth,units}).amount;return `<article class="tech-order-service"><header><span>Услуга ${index+1}</span><strong>${safe(variant.work||'Работа')}</strong></header><div class="tech-order-service-body"><div class="tech-order-service-chart">${toothChart(false,teeth,ranges)}</div><dl><div><dt>Зубы</dt><dd>${safe(teeth.join(', ')||'Не указаны')}</dd></div><div><dt>Режим</dt><dd>${safe(variant.toothMode||'Одиночка')}</dd></div>${ranges.length?`<div><dt>Мосты</dt><dd>${safe(ranges.map(range=>`${range[0]}–${range.at(-1)}`).join(', '))}</dd></div>`:''}${variant.workOption?`<div><dt>Исполнение</dt><dd>${safe(variant.workOption)}</dd></div>`:''}<div><dt>${isSurgicalSocket(variant)?'Гнёзда под имплант':isSurgicalTemplate(variant)?'Количество шаблонов':'Количество'}</dt><dd>${units}</dd></div><div><dt>Сумма</dt><dd>${amount===null?'Стоимость уточняется':rubles(amount)}</dd></div></dl></div></article>`}).join('')}</div></section>`;
  }
  function qualityApproveButton(order,label='Одобрить'){
    const final=order.qualityRequest?.kind==='final';
    return `<button class="btn primary" data-tech-action="${final?'approve-final':'approve'}" data-quality-kind="${safe(order.qualityRequest?.kind||'')}" data-id="${safe(order.id)}">${final?'Финальная ОТК пройдена':label}</button>`;
  }
  function parentMillingBlockReason(work){
    if(!work)return 'В заказе нет работ для фрезеровки.';
    const prefix=`Подзаказ ${displayOrderId(work)}: `;
    if(!cadReadyForProduction(work,work))return prefix+(requiresDoctorCadApproval(work)?'ожидается согласование CAD врачом.':'ожидается внутренняя ОТК CAD.');
    if(work.stage!=='Изготовление'||work.manufacturingStatus!==manufacturingStatuses[0])return prefix+'работа ещё не готова к этапу CAM.';
    if(!work.frameTechnicianKey&&!work.technicianKey)return prefix+'CAM-оператор не назначен.';
    return '';
  }
  function parentSharedMilling(order){
    if(order.sharedMilling&&['sent','sending','uncertain'].includes(order.sharedMilling.status))return order.sharedMilling;
    const legacy=(order.serviceWorks||[]).find(work=>work.milling?.sentAt)?.milling;
    return legacy?{...legacy,status:'sent',scopeId:order.id}:null;
  }
  function applySharedMillingResult(result){
    const receipt=result.sharedMilling||result.milling;
    if(!receipt)return;
    for(const id of result.workIds||[])overrides[id]={...(overrides[id]||{}),milling:receipt};
    for(const order of orders)if(order.clinicOrder?.id===result.scopeId)order.clinicOrder={...order.clinicOrder,sharedMilling:receipt};
    if(!orders.some(order=>order.parentOrderId===result.scopeId))overrides[result.scopeId]={...(overrides[result.scopeId]||{}),milling:receipt,sharedMilling:receipt};
    localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
  }
  async function refreshParentFiles(parentId){
    orderFilesState.orderId=parentId;orderFilesState.loading=true;orderFilesState.error='';const request=++parentFilesRequest;
    try{const result=await loadOrderFiles(parentId);if(request!==parentFilesRequest||orderFilesState.orderId!==parentId)return;orderFilesState.files=result.files||[];orderFilesState.folderUrl=result.folderUrl||'';}
    catch(error){if(request===parentFilesRequest&&orderFilesState.orderId===parentId)orderFilesState.error=error.message||'Не удалось проверить файлы';}
    finally{if(request===parentFilesRequest&&orderFilesState.orderId===parentId){orderFilesState.loading=false;if(isActive()&&state.page==='detail'&&state.orderId===parentId)render();}}
  }
  function parentWorkTracking(work){
    const stage=chiefDisplayStageLabel(work);
    const status=work.stage==='Изготовление'&&work.manufacturingStatus===manufacturingStatuses[0]?camWorkflowStatus(work):work.stage==='Моделирование'?work.cadOperatorStatus:work.stage==='Препрод'||work.stage==='Подготовка'?work.preprodTechnicianStatus||work.cadOperatorStatus:work.stage==='Техник первой категории'?work.category1TechnicianStatus:work.stage==='Изготовление'?work.painterStatus||work.ceramicistStatus:work.stage==='Контроль качества'?'На проверке':work.stage==='На доработке'?work.reworkReason:work.stage==='Согласование CAD'?'Ожидает решения врача':work.stage==='В доставке'?'Доставляется':work.stage==='Принято доктором'?'Принято врачом':'Ожидает начала';
    const person=work.stage==='Моделирование'?work.cadOperatorName:work.stage==='Препрод'||work.stage==='Подготовка'?work.preprodTechnicianName:work.stage==='Изготовление'&&work.manufacturingStatus===manufacturingStatuses[0]?work.frameTechnicianName:work.stage==='Изготовление'?work.painterName:work.stage==='Техник первой категории'?employeeName(work.category1Technician):'';
    return {stage,status:status||'Ожидает начала',person:person||work.participantLabel||'Не назначен'};
  }
  function parentOrderDetail(order){
    if(orderFilesState.orderId!==order.id){orderFilesState.files=[];orderFilesState.folderUrl='';void refreshParentFiles(order.id);}
    const works=order.serviceWorks||[],millingWorks=works.filter(work=>camMethodForOrder(work)==='milling'&&routeForOrder(work).flow.includes('cam')),receipt=parentSharedMilling(order);
    const reason=millingWorks.length?millingWorks.map(parentMillingBlockReason).find(Boolean)||'':'В заказе нет работ для фрезеровки.';
    const millingFiles=orderFilesState.files.filter(file=>/\.constructionInfo$/i.test(file.name||'')||/_cad\.stl$/i.test(file.name||''));
    const fileReason=orderFilesState.loading?'Проверяем производственные файлы…':orderFilesState.error||(!millingFiles.length?'Добавьте .constructionInfo или _cad.stl в общую папку заказа.':'');
    const busy=Boolean(state.millingSendingOrderId),disabled=busy||Boolean(receipt)||Boolean(reason)||Boolean(fileReason),notice=state.parentMillingNotice?.parentId===order.id?state.parentMillingNotice:null;
    const folder=orderFilesState.folderUrl?`<a class="parent-resource-action" href="${safe(orderFilesState.folderUrl)}" target="_blank" rel="noopener noreferrer">${icon('disk',18)}<span>Папка на Яндекс Диске</span>${icon('chevron',14)}</a>`:'';
    const cad=orderFilesState.files.filter(file=>file.purpose==='cad-review'&&/\.html$/i.test(file.name)).at(-1);
    const events=orderHistory().filter(event=>event.orderId===order.id||works.some(work=>work.id===event.orderId)).slice().sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0));
    const history=`<section class="tech-panel parent-history"><h2>История заказа</h2>${events.length?`<ol>${events.slice(0,30).map(event=>`<li><time>${safe(event.at?new Date(event.at).toLocaleString('ru-RU'):'')}</time><div>${safe(event.summary||orderEventSummary(event)||event.action||'Изменение заказа')}<small>${safe(event.actorName||event.actor||'')}</small></div></li>`).join('')}</ol>`:'<p class="muted">История пока пуста.</p>'}</section>`;
    const facts=[['Пациент',order.patient],['Дата рождения',order.birth],['Клиника',order.clinic],['Врач',order.doctor||order.doctorName],['Срок',order.date],['Цвет',order.shade],['Тип заказа',order.productionType==='analog'?'Аналоговый':'Цифровой'],['Стоимость заказа',order.sum]];
    const cadPreview=state.cadPreview?.orderId===order.id?`<div class="cad-preview-backdrop" data-tech-modal="cad-preview"><section class="cad-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="tech-cad-preview-title"><header><h2 id="tech-cad-preview-title">${safe(state.cadPreview.name||'CAD')}</h2><button data-tech-order-action="close-cad" aria-label="Закрыть">×</button></header><iframe id="tech-cad-preview-frame" sandbox="allow-scripts allow-pointer-lock" referrerpolicy="no-referrer" title="Предпросмотр CAD"></iframe></section></div>`:'';
    const needsConfirmation=works.some(pendingConfirmation);
    const millingExplanation=needsConfirmation?'Сначала подтвердите заказ. Отправка станет доступна после подготовки подзаказов.':reason||fileReason;
    const millingStatus=receipt?receipt.status==='sent'?'Заказ отправлен на фрезеровку':receipt.status==='sending'?'Заказ отправляется':'Отправка зарегистрирована':disabled?'Ожидает готовности':'Готов к отправке';
    const controlPanel=`<section class="tech-panel parent-milling-panel parent-order-control" aria-labelledby="parent-control-title">
      <h2 id="parent-control-title">Главный заказ</h2>
      ${needsConfirmation?`<div class="parent-confirmation"><p>Подтвердите заказ, чтобы передать все подзаказы в работу.</p><button type="button" class="btn primary parent-confirm-button" data-tech-action="approve-draft" data-id="${safe(order.id)}" ${confirmingOrderId?'disabled aria-busy="true"':''}>${confirmingOrderId===order.id?'Подтверждаем…':'Подтвердить заказ'}</button></div>`:`<div class="parent-confirmed-state">${icon('check',16)}<span>Заказ подтверждён</span></div>`}
      <div class="parent-control-section parent-resource-section"><h3>Файлы заказа</h3><div class="parent-resource-actions">
        <button type="button" class="parent-resource-action" data-tech-order-action="open-upload" data-id="${safe(order.id)}">${icon('upload',18)}<span>Загрузить файлы</span>${icon('chevron',14)}</button>
        ${cad?`<button type="button" class="parent-resource-action" data-tech-order-action="open-cad" data-id="${safe(order.id)}" data-file-id="${safe(cad.id)}">${icon('file',18)}<span>Открыть CAD</span>${icon('chevron',14)}</button>`:''}${folder}
      </div></div>
      <div class="parent-control-section parent-single-milling"><div class="parent-milling-heading"><h3>Фрезеровка</h3><p>Одна отправка для всех подзаказов.</p></div>
        <div class="parent-milling-state" role="status">${icon(receipt?.status==='sent'?'check':'clock',18)}<div><strong>${millingStatus}</strong>${!receipt&&millingExplanation?`<p id="parent-milling-help">${safe(millingExplanation)}</p>`:''}${receipt?.sentAt?`<p>${safe(new Date(receipt.sentAt).toLocaleString('ru-RU'))}</p>`:''}${millingFiles.length&&!receipt?`<p>Производственных файлов: ${millingFiles.length}</p>`:''}</div></div>
        ${!receipt?`<button type="button" class="btn ${disabled?'outline':'primary'} parent-milling-submit" data-tech-order-action="parent-send-milling" data-id="${safe(order.id)}" ${disabled?'disabled':''} ${millingExplanation?'aria-describedby="parent-milling-help"':''}>${busy?'Отправляем…':'Отправить на фрезеровку'}</button>`:''}
        ${notice&&!receipt?`<p class="parent-action-feedback" role="${notice.error?'alert':'status'}">${safe(notice.text)}</p>`:''}
      </div>
    </section>`;
    return `<a href="${pathFor('technician','orders')}" class="tech-back" data-tech-page="orders">← Все заказы</a><div class="tech-heading parent-order-heading"><div><h1>Заказ ${safe(displayOrderId(order))}</h1><p>${safe(order.patient||'Пациент не указан')}</p></div><div class="parent-card-actions"><button class="btn outline" data-tech-order-action="print-order" data-id="${safe(order.id)}">Распечатать наряд</button><button class="btn outline" data-tech-order-action="edit" data-id="${safe(order.id)}">Редактировать заказ</button></div></div><div class="parent-card-grid"><div class="parent-card-main"><section class="tech-panel"><h2>Данные заказа</h2><dl class="parent-order-facts">${facts.filter(([,value])=>value!==undefined&&value!==null&&value!=='').map(([label,value])=>`<div><dt>${label}</dt><dd>${safe(value)}</dd></div>`).join('')}</dl>${order.comment?`<div class="parent-order-comment"><h3>Комментарий</h3><p>${safe(order.comment)}</p></div>`:''}</section><section class="tech-panel tech-restored-parent"><div class="tech-panel-heading"><h2>Подзаказы</h2><span class="parent-tracking-note">Статусы обновляются автоматически</span></div><div class="parent-work-list">${works.map(work=>{const tracking=parentWorkTracking(work);return `<a class="parent-work-link parent-work-tracking" href="${pathFor('technician','detail',work.id)}" data-tech-order="${safe(work.id)}"><div><strong>${safe(displayOrderId(work))} · ${safe(orderWorkLabel(work))}</strong><dl><div><dt>Этап</dt><dd>${safe(tracking.stage)}</dd></div><div><dt>Статус</dt><dd>${safe(tracking.status)}</dd></div><div><dt>Исполнитель</dt><dd>${safe(tracking.person)}</dd></div></dl></div>${icon('chevron',16)}</a>`}).join('')}</div></section>${orderServiceCards(order)}${history}</div><aside class="parent-card-side">${controlPanel}</aside></div>${orderUploadDialog()}${orderEditModal()}${orderDeleteModal()}${cadPreview}`;
  }
  function orderDetail(){
    const order=orderById(state.orderId);
    if(!order)return ordersPage();
    if(order.serviceWorks?.length)return parentOrderDetail(order);
    const productionTypeLabel=order.productionType==='analog'?'Аналоговый':'Цифровой';
    if(orderFilesState.orderId!==order.id){orderFilesState.orderId=order.id;orderFilesState.files=[];orderFilesState.folderUrl='';loadOrderFiles(order.id).then(result=>{if(state.orderId===order.id&&isActive()){orderFilesState.files=result.files||[];orderFilesState.folderUrl=result.folderUrl||'';render()}}).catch(()=>{})}
    const stageIndex=order.stage==='Работа принята'?chiefStages.indexOf('Контроль качества'):chiefTimelineIndex(order);
    const events=orderHistory().filter(event=>event.orderId===order.id).slice().reverse().map(event=>event.actorRole==='clinic'?{...event,clinic:order.clinic}:event);
    const sourcePhotos=orderFilesState.files.filter(file=>file.purpose==='source-photo');
    const millingFiles=orderFilesState.files.filter(file=>/(?:\.constructionInfo|_cad\.stl)$/i.test(file.name||''));
    const millingSent=order.milling?.sentAt;
    const millingCompleteButton=order.stage==='Изготовление'&&order.manufacturingStatus===manufacturingStatuses[0]&&millingSent&&!order.milling?.completedAt?`<button class="btn primary" data-tech-order-action="milling-complete" data-id="${safe(order.id)}">Фрезеровка завершена</button>`:'';
    const cadApproved=order.cadReview?.status==='approved';
    const millingLocked=!cadApproved||!millingFiles.length||state.millingSendingOrderId===order.id;
    const uploadMillingEnabled=cadApproved;
    const millingNote=!cadApproved?'Отправка на фрезеровку и загрузка файлов будут доступны после согласования CAD врачом. Открыть файлы можно уже сейчас.':millingFiles.length?`Файлы для фрезеровки: ${millingFiles.map(file=>safe(file.name)).join(', ')}`:'Загрузите файлы .constructionInfo или _cad.stl';
    const resourceEnd=icon('chevron',14);
    const folderMarkup=orderFilesState.folderUrl
      ?`<a class="parent-resource-action" href="${safe(orderFilesState.folderUrl)}" target="_blank" rel="noopener noreferrer">${icon('disk',18)}<span>Папка на Яндекс Диске</span>${resourceEnd}</a>`
      :`<span class="parent-resource-action" aria-disabled="true">${icon('disk',18)}<span>Папка на Яндекс Диске</span>${resourceEnd}</span>`;
    const uploadMarkup=`<button type="button" class="parent-resource-action" data-tech-order-action="open-upload" data-id="${safe(order.id)}" ${uploadMillingEnabled?'':'disabled aria-describedby="suborder-files-help"'}>${icon('upload',18)}<span>Загрузить файлы</span>${resourceEnd}</button>`;
    const millingAction=order.parentOrderId?`<a class="parent-resource-action" href="${pathFor('technician','detail',order.parentOrderId)}" data-tech-order-parent="${safe(order.parentOrderId)}">${navIcon('factory',18)}<span>Фрезеровка в главном заказе</span>${resourceEnd}</a>`:`<button type="button" class="parent-resource-action" data-tech-order-action="send-milling" data-id="${safe(order.id)}" ${millingLocked||millingSent||order.sharedMilling?'disabled':''}>${navIcon('factory',18)}<span>${millingSent||order.sharedMilling?'Заказ уже отправлен':'Отправить на фрезеровку'}</span>${resourceEnd}</button>`;
    const orderFolderMarkup=`<section class="tech-panel tech-order-files suborder-file-panel" aria-labelledby="suborder-files-title"><h3 id="suborder-files-title">Файлы заказа</h3><div class="parent-resource-actions">${uploadMarkup}${folderMarkup}${millingAction}</div><p class="suborder-files-help" id="suborder-files-help">${order.parentOrderId&&!cadApproved?'Загрузка станет доступна после согласования CAD врачом. Папку можно открыть сейчас.':millingNote}</p></section>`;
    const sourcePhotoMarkup=order.productionType==='analog'?`<section class="tech-panel source-photo-upload"><div class="tech-panel-heading"><div><h3>Исходные фото</h3><p>Фото, полученные от клиники, сохраняются отдельно в папке «Исходные фото».</p></div><span class="tech-stage work">${sourcePhotos.length} фото</span></div><label class="btn outline">${sourcePhotos.length?'Добавить ещё фото':'Загрузить исходные фото'}<input type="file" id="tech-source-photo" accept="image/jpeg,image/png,image/webp" capture="environment" multiple hidden></label></section>`:'';
    const cadFiles=orderFilesState.files.filter(file=>file.purpose==='cad-review'&&/\.html$/i.test(file.name));
    const cadReview=order.cadReview||{};
    const cadModelMarkup=cadFiles.length?`<section class="tech-panel tech-cad-model"><div class="tech-panel-heading"><div><h3>CAD-модель</h3><p>HTML-файл моделировщика для просмотра и проверки.</p></div><span class="tech-stage ${cadReview.status==='approved'?'ready':cadReview.status==='returned'?'review':'work'}">${cadReview.status==='approved'?'Подтверждено':cadReview.status==='returned'?'На доработке':'Ожидает согласования'}</span></div>${cadFiles.slice(-1).map(file=>`<div class="tech-cad-file"><strong>${safe(file.name)}</strong><small>${file.uploadedAt?new Date(file.uploadedAt).toLocaleString('ru-RU'):'Файл CAD'}</small><button class="btn outline" data-tech-order-action="open-cad-page" data-id="${order.id}" data-file-id="${safe(file.id)}">Открыть CAD</button></div>`).join('')}</section>`:'';
    const paymentMarkup=['В доставке','Принято доктором','Готово к выдаче'].includes(order.stage)?`<section class="tech-panel pulse-payment-panel"><h2>Оплата заказа</h2><p>Укажите срок и поступившую сумму, чтобы видеть просрочки в «Пульсе компании».</p><form id="pulse-payment-form" data-order-id="${safe(order.id)}"><label>Срок оплаты<input type="date" name="paymentDueDate" value="${safe(/^\d{4}-\d{2}-\d{2}$/.test(order.paymentDueDate||'')?order.paymentDueDate:'')}"></label><label>Оплачено, ₽<input type="number" name="paidAmount" min="0" step="1" value="${safe(order.paidAt?Number(String(order.sum||'').replace(/[^0-9]/g,''))||0:order.paidAmount||0)}"></label><button type="submit" class="btn outline">Сохранить оплату</button></form></section>`:'';
    const cadPreview=state.cadPreview?.orderId===order.id?`<div class="cad-preview-backdrop" data-tech-modal="cad-preview"><section class="cad-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="tech-cad-preview-title"><header><div><h2 id="tech-cad-preview-title">${safe(state.cadPreview.name||'CAD')}</h2><p>Интерактивный предпросмотр из HTML-файла</p></div><button data-tech-order-action="close-cad" aria-label="Закрыть">×</button></header><iframe id="tech-cad-preview-frame" src="${safe(state.cadPreview.url||'')}" referrerpolicy="no-referrer" title="Предпросмотр CAD"></iframe></section></div>`:'';
    const detailTitle=order.parentOrderId?'Подзаказ':'Заказ';
    const printIcon='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6zM18 12h.01"/></svg>';
    const detailHeader=`<nav class="order-detail-context" aria-label="Навигация по заказу"><a class="tech-back" href="${pathFor('technician',state.detailReturnPage==='production'?'production':state.detailReturnPage==='pulse'?'pulse':'orders')}" data-tech-page="orders">${icon('back',14)}<span>${state.detailReturnPage==='pulse'?'Пульс компании':state.detailReturnPage==='production'?'Производство':'Все заказы'}</span></a>${order.parentOrderId?`<span class="order-context-separator" aria-hidden="true">/</span><a class="order-parent-link" href="${pathFor('technician','detail',order.parentOrderId)}" data-tech-order-parent="${safe(order.parentOrderId)}"><span>Главный заказ ${safe(displayOrderId(order.parentOrderId))}</span>${icon('chevron',14)}</a>`:''}</nav>
      <header class="tech-heading order-detail-header"><div class="order-detail-identity"><h1>${detailTitle} ${safe(displayOrderId(order))}</h1><p class="order-detail-subtitle"><span>${safe(order.patient||'Пациент не указан')}</span><span aria-hidden="true">·</span><span>${safe(orderWorkLabel(order))}</span></p><div class="order-detail-meta"><span>Клиника: ${safe(order.clinic)}</span><span>Срок: ${safe(order.date||'Не указан')}</span>${order.doctor?`<span>Врач: ${safe(order.doctor)}</span>`:''}<span class="order-detail-type">${productionTypeLabel} заказ</span></div></div><div class="order-detail-header-actions"><button type="button" class="order-detail-action" data-tech-order-action="print-order" data-id="${safe(order.id)}">${printIcon}<span>Распечатать наряд</span></button>${['Принято доктором','В доставке'].includes(order.stage)?`<button type="button" class="order-detail-action" data-tech-order-action="toggle-paid" data-id="${safe(order.id)}">${order.paidAt?'Отметить неоплаченным':'Отметить оплаченным'}</button>`:''}</div></header>`;
    return `${detailHeader}<div class="tech-detail-grid"><div class="tech-order-main"><section class="tech-panel"><h2>Данные заказа</h2><div class="tech-facts"><div><span>Клиника</span><strong>${safe(order.clinic)}</strong></div><div><span>Пациент</span><strong>${safe(order.patient)}</strong></div><div><span>Тип заказа</span><strong>${productionTypeLabel}</strong></div><div><span>Конструкция</span><strong>${safe(orderWorkLabel(order))}</strong></div><div><span>Создан</span><strong>${shortDate(order.createdAt)}</strong></div>${order.source==='telegram'?`<div><span>Источник</span><strong>Telegram</strong></div><div><span>Запросил</span><strong>Клиент</strong></div><div><span>Подтвердил</span><strong>Клиент</strong></div>`:''}<div><span>Срок</span><strong>${order.date}</strong></div><div><span>Цвет</span><strong>${safe(order.shade||'—')}</strong></div><div><span>Приоритет</span><strong>${safe(order.priority)}</strong></div><div><span>Сумма</span><strong>${safe(order.sum)}</strong></div><div><span>Оплата</span><strong>${order.paidAt?'Оплачено':'Не оплачено'}</strong></div></div>${paymentMarkup}${orderServiceCards(order)}<section class="tech-panel"></section><h2>История заказа</h2><ol class="order-history">${events.map(event=>`<li><time>${new Date(event.at).toLocaleString('ru-RU')}</time><strong>${safe(displayActor(event))}</strong><span>${event.action==='stage_changed'?`${safe(event.from)} → ${safe(event.to)}`:event.action==='manufacturing_status_changed'?`${safe(manufacturingStatusLabel(event.from))} → ${safe(manufacturingStatusLabel(event.to))}`:event.action==='rework_requested'?`Доработка: ${safe(event.reason)}`:safe(orderEventSummary(order,event)||event.action)}</span></li>`).join('')||'<li>Действий пока нет</li>'}</ol></section></div><div class="tech-detail-side"><section class="tech-panel"><h2>Управление работой</h2><label class="tech-assign">CAM оператор и Эстетист<select data-tech-assign="${order.id}"><option value="">Не назначен</option>${assignmentOptions(order)}</select></label><h3>Этапы производства</h3><ol class="tech-timeline">${chiefStages.map((stage,index)=>`<li class="${index<stageIndex?'done':index===stageIndex?'current':''} ${stage==='Принято доктором'&&index===stageIndex?'final':''}"><i></i><span>${displayChiefTimelineStage(stage,order)}</span></li>`).join('')}</ol><div class="tech-detail-actions">${['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(order.stage)?`${order.parentOrderId?`<p class="tech-status-note">Подтверждение выполняется один раз в главном заказе.</p><button type="button" class="btn outline" data-tech-order-parent="${safe(order.parentOrderId)}">Открыть главный заказ</button>`:`<p class="tech-status-note">Подтвердите заказ, затем назначьте специалиста на этапе «Приём / Доставка».</p><button class="btn primary" data-tech-action="approve-draft" data-id="${order.id}" ${confirmingOrderId?'disabled':''}>${confirmingOrderId===order.id?'Подтверждаем…':'Подтвердить заказ'}</button>`}`:order.stage==='Моделирование'?'<p class="tech-status-note">Моделировщик должен загрузить HTML и отправить CAD врачу.</p>':order.stage==='Согласование CAD'?'<p class="tech-status-note">CAD ожидает решения врача в кабинете клиники.</p>':order.stage==='Изготовление'?`<p class="tech-status-note">Текущий этап: ${safe(order.manufacturingStatus===manufacturingStatuses[0]?camWorkflowStatus(order):manufacturingStatusLabel(order.manufacturingStatus))}.</p>${millingCompleteButton}${order.manufacturingStatus===manufacturingStatuses[0]&&!millingSent?'<p class="tech-status-note">Отправьте файлы на фрезеровку в блоке «Файлы заказа».</p>':order.milling?.completedAt&&camWorkflowStatus(order)==='Ожидает принятия'?'<p class="tech-status-note">Фрезеровка завершена. Ожидается принятие заказа CAM-оператором.</p>':''}`:order.stage==='Контроль качества'?`${qualityApproveButton(order,'Принять работу')}<button class="btn outline" data-tech-action="rework" data-id="${order.id}">Вернуть на доработку</button>`:order.stage==='На доработке'?`<p>${safe(order.reworkReason||'Клиника запросила доработку')}</p><button class="btn primary" data-tech-action="rework-resume" data-id="${order.id}">Вернуть в производство</button>`:order.stage==='Принято доктором'?'<p class="tech-status-note">Работа принята доктором.</p>':order.stage==='В доставке'?'<p class="tech-status-note">Заказ находится в доставке.</p>':''}</div></section>${orderFolderMarkup}${sourcePhotoMarkup}${cadModelMarkup}</div></div>${cadPreview}${orderUploadDialog()}`;
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
    const selected=state.requestSearchFilters,query=state.requestSearch.trim().toLocaleLowerCase('ru');
    const requestOrders=[...new Map(requests.map(request=>{const order=orderById(request.orderId);return [order?.id,order]}).filter(([id])=>id)).values()];
    const pending=requests.filter(request=>request.status==='pending').length;
    const typeLabel={edit:'Изменение заказа',deadline:'Перенос срока',cancel:'Отмена заказа'};
    const statusLabel={pending:'Ожидает решения',approved:'Одобрено',rejected:'Отклонено'};
    const requestFilters=[['all','Все'],['cancel','Отмены'],['edit','Редактирование'],['deadline','Перенос срока'],['archive','Архив']];
    const isArchived=request=>request.status==='archived'||['approved','rejected'].includes(request.status);
    const visibleRequests=requests.filter(request=>{
      const archived=isArchived(request);
      if(state.requestFilter==='archive'){if(!archived)return false}
      else {if(archived)return false;if(state.requestFilter!=='all'&&request.type!==state.requestFilter)return false}
      const order=orderById(request.orderId);
      if(selected.orderClinicFilter&&order?.clinic!==selected.orderClinicFilter)return false;
      if(selected.orderMonthFilter&&(!order||orderMonthKey(order)!==selected.orderMonthFilter))return false;
      if(order&&!orderDoctorMatches(order,selected.orderDoctorFilter))return false;
      if(!order&&selected.orderDoctorFilter)return false;
      if(order&&(!matchesParticipantAndWork(order,selected.orderEmployeeFilter,selected.orderWorkFilter)))return false;
      if(!order&&selected.orderEmployeeFilter)return false;
      const haystack=[request.orderId,request.requestedBy,request.summary,request.reason,order?.patient,order?.clinic,order?.assignee,order?.participantLabel,order?orderWorkLabel(order):'',...(order?.workTypes||[]),order?.date].map(value=>String(value||'').toLocaleLowerCase('ru'));
      return !query||haystack.some(value=>value.includes(query));
    });
    const cards=visibleRequests.map(request=>{
      const order=orderById(request.orderId),clinic=clients.find(item=>item.id===request.clinicId),changes=Object.entries(request.changes||{});
      const details=request.type==='cancel'
        ?`<div class="tech-request-reason"><span>Причина отмены</span><strong>${safe(request.reason||request.summary||'Не указана')}</strong></div>`
        :request.reason&&!changes.length
          ?`<div class="tech-request-reason"><span>Просьба клиента</span><strong>${safe(request.reason)}</strong></div>`
        :`<div class="tech-request-changes">${changes.map(([field,value])=>`<div><span>${safe(requestFieldLabel(field))}</span><del>${safe(Object.prototype.hasOwnProperty.call(request.before||{},field)?requestValue(request.before[field]):currentRequestValue(order,field))}</del><b>→</b><ins>${safe(requestValue(value))}</ins></div>`).join('')||'<p class="tech-empty">Изменения не распознаны</p>'}</div>`;
      const archived=isArchived(request);
      const actions=request.status==='pending'
        ?`<div class="tech-request-actions"><button class="btn outline" data-tech-client-request="reject" data-request-id="${safe(request.id)}">Отклонить</button><button class="btn primary" data-tech-client-request="approve" data-request-id="${safe(request.id)}">Одобрить</button></div>`
        :`<div class="tech-request-reviewed">Решение: ${request.decision==='rejected'||request.status==='rejected'?'Отклонено':'Одобрено'} · Create Dental Team · ${shortDate(request.reviewedAt)}</div>`;
      const sender=request.confirmedBy&&request.confirmedBy!==request.requestedBy?`<span>Отправил запрос: <strong>${safe('Create Dental Team')}</strong></span>`:'';
      return `<article class="tech-request-card ${safe(archived?'archived':request.status)}"><header><div><span class="tech-request-type">${safe(typeLabel[request.type]||'Правка')}</span><h2>${safe(order?.patient||request.orderId)}</h2><p>${safe(clinic?.name||order?.clinic||'Клиника')} · заказ ${safe(request.orderId)}</p></div><span class="tech-request-status ${safe(archived?'archived':request.status)}">${archived?'Архив':safe(statusLabel[request.status]||request.status)}</span></header><div class="tech-request-meta"><span>Запросил: <strong>${safe(request.requestedBy||'Клиент')}</strong></span>${sender}<span>${shortDate(request.createdAt)}</span></div>${details}${actions}</article>`;
    }).join('');
    const filterMarkup=`<section class="tech-panel tech-request-filter-panel"><div class="tech-order-tools"><div class="tech-segment tech-request-filter-tabs">${requestFilters.map(([key,label])=>`<button class="${state.requestFilter===key?'active':''}" data-tech-request-filter="${key}">${label}</button>`).join('')}</div><div class="tech-order-searchbar"><input id="tech-request-search" aria-label="Поиск правок от клиентов" placeholder="Поиск по заказу, клинике или технику..." value="${safe(state.requestSearch)}">${orderFilterPanel(requestOrders)}</div></div></section>`;
    return `<div class="tech-heading"><div><span class="tech-eyebrow">СОГЛАСОВАНИЕ</span><h1>Правки от клиентов</h1></div><div class="tech-task-count"><strong>${pending}</strong><span>ожидают решения</span></div></div>${filterMarkup}<div class="tech-request-list">${cards||'<section class="tech-panel tech-empty">Запросов в этом разделе пока нет</section>'}</div>`;
  }
  function employeeForm(){
    if(!state.editEmployeeId)return '';
    const employee=state.editEmployeeId==='new'?{name:'',specialty:'',phone:'',email:''}:team.find(item=>item.id===state.editEmployeeId);
    if(!employee)return '';
    const field=(label,name,type='text',required=false)=>`<label>${label}<input name="${name}" type="${type}" value="${safe(employee[name]||'')}" ${required?'required':''}></label>`;
    const specialtyOptions=[['CAD/CAM оператор','CAD оператор'],['Препрод техник','Гипсовщик'],['Каркасист','CAM оператор'],['Красильщик','Эстетист']],rawSpecialty=String(employee.specialty||''),specialty=normalizeEmployeeSpecialty(rawSpecialty);
    const specialtyField=`<label>Специализация<select name="specialty" required>${specialtyOptions.map(([value,label])=>`<option value="${value}" ${specialty===value?'selected':''}>${label}</option>`).join('')}</select></label>`;
    return `<section class="tech-panel tech-client-editor"><div class="tech-panel-heading"><div><h2>${state.editEmployeeId==='new'?'Новый техник':'Редактировать техника'}</h2><p>Данные сотрудника лаборатории</p></div><button class="tech-client-close" data-tech-employee-action="cancel" aria-label="Закрыть">×</button></div><form id="tech-employee-form" class="tech-client-form">${field('Имя и фамилия','name','text',true)}${specialtyField}<label>Ранг<select name="rank" required>${[1,2,3,4,5].map(rank=>`<option value="${rank}" ${employeeRank(employee)===rank?'selected':''}>Ранг ${rank}</option>`).join('')}</select></label>${field('Телефон','phone','tel')}${field('Электронная почта','email','email',true)}<label>Лимит одновременных заказов<input name="wipLimit" type="number" min="1" max="100" step="1" value="${safe(employee.wipLimit||'')}" placeholder="Не задан"></label><label>${state.editEmployeeId==='new'?'Пароль для входа':'Новый пароль (если нужно сменить)'}<input name="password" type="password" minlength="8" ${state.editEmployeeId==='new'?'required':''}></label><div class="tech-client-form-actions"><button type="button" class="btn outline" data-tech-employee-action="cancel">Отмена</button><button type="submit" class="btn primary">Сохранить</button></div></form></section>`;
  }
  function teamPage(){
    const open=allOrders().filter(order=>!['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage));
    const query=state.employeeSearch.trim().toLowerCase();
    const visible=team.filter(employee=>!employee.deleted&&(state.employeeFilter==='all'||employee.status===state.employeeFilter)&&[employee.name,employee.specialty,employee.phone,employee.email].some(value=>String(value||'').toLowerCase().includes(query)));
    const statusText={active:'Активен',disabled:'Отключен',fired:'Уволен'};
    return `<div class="tech-heading"><div><span class="tech-eyebrow">КОМАНДА</span><h1>Сотрудники лаборатории</h1></div><button class="btn primary" data-tech-employee-action="new">+ Добавить техника</button></div><div class="tech-client-layout"><section class="tech-panel"><div class="tech-client-toolbar"><div><h2>Техники <span>${team.filter(employee=>!employee.deleted).length}</span></h2><p>Активных: ${activeTeam().length} · данные сохраняются на сервере</p></div><input id="tech-employee-search" type="search" placeholder="Поиск по имени, специализации или контакту" value="${safe(state.employeeSearch)}" aria-label="Поиск техников"></div><div class="tech-segment tech-employee-filters">${[['all','Все'],['active','Активные'],['disabled','Отключённые'],['fired','Уволенные']].map(([value,label])=>`<button data-tech-employee-filter="${value}" class="${state.employeeFilter===value?'active':''}">${label}</button>`).join('')}</div><div class="tech-table-wrap"><table class="tech-table tech-employee-table"><thead><tr><th>Техник</th><th>Специализация</th><th>Контакты</th><th>В работе</th><th>Статус</th><th>Действия</th></tr></thead><tbody>${visible.map(employee=>`<tr><td><strong>${safe(employee.name)}</strong></td><td>${safe(employeeSpecialtyDisplayLabel(employee.specialty))}<small>Ранг ${employeeRank(employee)}</small></td><td>${safe(phoneDisplay(employee.phone))}<small>${safe(employee.email||'')}</small></td><td>${open.filter(order=>[order.assigneeKey,order.cadOperatorKey,order.preprodTechnicianKey,order.frameTechnicianKey,order.ceramicistKey].includes(employee.originalName)).length}</td><td><span class="tech-employee-status ${employee.status}">${statusText[employee.status]||'Неизвестно'}</span></td><td><div class="tech-client-actions"><button data-tech-employee-action="edit" data-employee-id="${safe(employee.id)}">Изменить</button>${employee.status==='active'?`<button data-tech-employee-action="disable" data-employee-id="${safe(employee.id)}">Отключить</button>`:employee.status==='disabled'?`<button data-tech-employee-action="enable" data-employee-id="${safe(employee.id)}">Включить</button>`:''}${employee.status!=='fired'?`<button class="danger" data-tech-employee-action="fire" data-employee-id="${safe(employee.id)}">Уволить</button>`:''}<button class="danger" data-tech-employee-action="delete" data-employee-id="${safe(employee.id)}">Удалить</button></div></td></tr>`).join('')||'<tr><td colspan="6" class="tech-empty">Техников не найдено</td></tr>'}</tbody></table></div></section>${employeeForm()}</div>${state.confirmFireId?`<div class="tech-dialog-backdrop"><section class="tech-dialog" role="dialog" aria-modal="true" aria-labelledby="tech-fire-title"><h2 id="tech-fire-title">Уволить техника?</h2><p>${safe(team.find(employee=>employee.id===state.confirmFireId)?.name||'Сотрудник')} исчезнет из списка активных исполнителей. Незавершённые заказы перейдут в очередь на распределение; история выручки сохранится.</p><div><button class="btn outline" data-tech-employee-action="cancel-fire">Отмена</button><button class="btn danger" data-tech-employee-action="confirm-fire" data-employee-id="${safe(state.confirmFireId)}">Уволить</button></div></section></div>`:''}${state.confirmEmployeeDeleteId?`<div class="tech-dialog-backdrop"><section class="tech-dialog" role="dialog" aria-modal="true" aria-labelledby="tech-employee-delete-title"><h2 id="tech-employee-delete-title">Удалить техника?</h2><p>${safe(team.find(employee=>employee.id===state.confirmEmployeeDeleteId)?.name||'Сотрудник')} будет удалён из списка и потеряет доступ в кабинет. История заказов и начислений сохранится.</p><div><button class="btn outline" data-tech-employee-action="cancel-delete">Отмена</button><button class="btn danger" data-tech-employee-action="confirm-delete" data-employee-id="${safe(state.confirmEmployeeDeleteId)}">Удалить</button></div></section></div>`:''}`;
  }
  function qualityPage(){
    const filters=[['all','Все ОТК'],['preprod','Препрод'],['cad','CAD'],['cam','CAM'],['esthetic','Эстетист'],['final','Финальная ОТК']];
    const all=allOrders().filter(order=>order.stage==='Контроль качества'),selected=state.qualitySearchFilters,query=state.qualitySearch.trim().toLocaleLowerCase('ru');
    const list=all.filter(order=>{
      if(state.qualityFilter!=='all'&&(order.qualityRequest?.kind||'final')!==state.qualityFilter)return false;
      if(selected.orderClinicFilter&&order.clinic!==selected.orderClinicFilter)return false;
      if(selected.orderMonthFilter&&orderMonthKey(order)!==selected.orderMonthFilter)return false;
      if(!orderDoctorMatches(order,selected.orderDoctorFilter))return false;
      const employeeMatches=['intake','quality'].includes(state.page)
        ? (!selected.orderEmployeeFilter||qualitySubmitter(order)?.id===selected.orderEmployeeFilter)
        : matchesParticipantAndWork(order,selected.orderEmployeeFilter,selected.orderWorkFilter);
      if(!employeeMatches||selected.orderWorkFilter&&!order.workTypes.includes(selected.orderWorkFilter))return false;
      return !query||[order.id,order.patient,order.clinic,order.assignee,order.participantLabel,...order.workTypes,order.date].some(value=>String(value||'').toLocaleLowerCase('ru').includes(query));
    });
    const filterMarkup=`<section class="tech-panel tech-request-filter-panel"><div class="tech-order-tools"><div class="tech-segment tech-request-filter-tabs" aria-label="Вид ОТК">${filters.map(([value,label])=>`<button type="button" data-tech-quality-filter="${value}" class="${state.qualityFilter===value?'active':''}" aria-pressed="${state.qualityFilter===value}">${label}</button>`).join('')}</div><div class="tech-order-searchbar"><input id="tech-search" aria-label="Поиск работ на ОТК" placeholder="Поиск по заказу, клинике или технику..." value="${safe(state.qualitySearch)}">${orderFilterPanel(all)}</div></div></section>`;
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРИЕМ РАБОТ</span><h1>Прием работ</h1></div><div class="tech-task-count"><strong>${list.length}</strong><span>ждут решения</span></div></div>${filterMarkup}<div class="tech-quality-list">${list.map(order=>{const request=order.qualityRequest,submitter=qualitySubmitter(order),kind=request?.kind==='cad'?'CAD оператора':request?.kind==='preprod'?'Препрод техника':request?.kind==='cam'?'CAM оператора':request?.kind==='esthetic'?'Эстетиста':request?.kind==='final'?'финальная ОТК':'производства';const checkedStage=request?`Проверяется: ${kind}`:'Финальный контроль качества';return `<article class="tech-panel tech-quality-item"><div><span class="tech-eyebrow">${safe(order.clinic)} · ${order.date}</span><h2>${order.id} · ${safe(orderWorkLabel(order))}</h2><p>${safe(order.patient)} · ${safe(checkedStage)} · подал на ОТК: ${safe(submitter?.name||request?.requestedByName||request?.requestedBy||'—')}${request?.next?` · далее: ${safe(request.next)}`:''}</p></div><div><button class="btn outline" data-tech-order="${order.id}">Подробнее</button><button class="btn outline" data-tech-action="rework" data-id="${order.id}">На доработку</button>${qualityApproveButton(order)}</div></article>`}).join('')||'<div class="tech-panel tech-empty">В этой категории нет работ на ОТК</div>'}</div>`;
  }
  function profilePage(){
    const profile=chiefProfile();
    const integration=state.integration||{};
    const status=(ready,label)=>`<span class="tech-integration-status ${ready?'ready':''}"><i></i>${label}: ${ready?'сохранено':'не заполнено'}</span>`;
    const placeholder=(ready,label)=>ready?`${label} сохранён · введите только для замены`:label;
    const requests=(integration.pairingRequests||[]).map(item=>`<div class="tech-bot-row"><span><strong>${safe(item.clinicName)}</strong><small>${safe(item.chatTitle)} · запросил ${safe(item.requestedBy)}</small></span><div><button class="btn primary" data-tech-bot-action="approve-binding" data-request-id="${safe(item.id)}">Подключить</button><button class="btn outline" data-tech-bot-action="reject-binding" data-request-id="${safe(item.id)}">Отклонить</button></div></div>`).join('')||'<p class="tech-empty">Новых запросов нет</p>';
    const bindings=(integration.bindings||[]).map(item=>`<div class="tech-bot-row"><span><strong>${safe(item.clinicName)}</strong><small>${safe(item.chatTitle||item.chatId)} · подтверждено ${item.approvedAt?new Date(item.approvedAt).toLocaleString('ru-RU'):'ранее'}</small></span><button class="btn outline" data-tech-bot-action="unbind" data-clinic-id="${safe(item.clinicId)}">Отключить</button></div>`).join('')||'<p class="tech-empty">Подключённых чатов пока нет</p>';
    const lastUpdate=integration.lastUpdateAt?new Date(integration.lastUpdateAt).toLocaleString('ru-RU'):'сообщений ещё не было';
    return `<div class="tech-heading"><div><span class="tech-eyebrow">ПРОФИЛЬ</span><h1>Главный техник</h1></div></div><div class="tech-profile-stack"><section class="tech-panel tech-profile-editor"><div class="tech-profile-avatar">${avatarMarkup(profile,'large')}<label class="btn outline">Загрузить аватар<input id="tech-profile-avatar" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>${profile.avatar?'<button class="tech-link" data-tech-profile-avatar="remove">Убрать аватар</button>':''}</div><form id="tech-profile-form" class="tech-client-form">${profileField('Имя в кабинете','displayName',profile.displayName||'Главный техник','text',true)}${profileField('Электронная почта','email',profile.email||'','email')}${profileField('Новый пароль','password','','password',false,'Оставьте пустым, если менять не нужно')}${profileField('Повторите пароль','passwordConfirm','','password',false,'')}<div class="tech-client-form-actions"><button type="submit" class="btn primary">Сохранить профиль</button></div></form></section><section class="tech-panel tech-integration-panel"><div class="tech-panel-heading"><div><h2>Telegram и Yandex</h2><p>Голосовые сообщения и управление заказами после подтверждения</p></div><div><strong class="tech-integration-overall ${integration.enabled?'ready':''}">${state.integrationLoading?'Проверка…':integration.enabled?'Подключено':'Требуется настройка'}</strong><button class="tech-link" data-tech-bot-action="refresh">Обновить</button></div></div><div class="tech-integration-statuses">${status(integration.telegramBot,'Telegram')}${status(integration.employeeTelegramBot,'Telegram сотрудников')}${status(integration.speechKit,'SpeechKit')}${status(integration.yandexGpt,'YandexGPT')}${status(integration.folderId,'Каталог')}${status(integration.yandexDisk,'Яндекс Диск')}</div><div class="tech-bot-health"><div><span>Последнее сообщение</span><strong>${safe(lastUpdate)}</strong></div><div><span>Ожидают подтверждения</span><strong>${Number(integration.pendingActions)||0}</strong></div><div><span>Очередь событий</span><strong>${Number(integration.queuedUpdates)||0}</strong></div><div><span>Последняя ошибка</span><strong>${safe(integration.lastError||'Нет')}</strong></div></div><div class="tech-bot-bindings"><h3>Запросы на подключение</h3>${requests}<details class="tech-connected-chats"><summary>Подключённые чаты</summary>${bindings}</details></div><details class="tech-api-keys"><summary>API-ключи</summary><form id="tech-integration-form" class="tech-client-form tech-integration-form" autocomplete="off"><label>Токен Telegram-бота<input name="telegramBotToken" type="password" placeholder="${safe(placeholder(integration.telegramBot,'Токен Telegram'))}" autocomplete="new-password"></label><label>Токен Telegram-бота сотрудников<input name="employeeTelegramBotToken" type="password" placeholder="${safe(placeholder(integration.employeeTelegramBot,'Токен нового бота сотрудников'))}" autocomplete="new-password"></label><label>API-ключ SpeechKit<input name="speechKitKey" type="password" placeholder="${safe(placeholder(integration.speechKit,'Ключ SpeechKit'))}" autocomplete="new-password"></label><label>API-ключ YandexGPT<input name="yandexGptKey" type="password" placeholder="${safe(placeholder(integration.yandexGpt,'Ключ YandexGPT'))}" autocomplete="new-password"></label><label>ID каталога Yandex Cloud<input name="folderId" type="password" placeholder="${safe(placeholder(integration.folderId,'ID каталога'))}" autocomplete="new-password"></label><label>OAuth-токен Яндекс Диска<input name="yandexDiskToken" type="password" placeholder="${safe(placeholder(integration.yandexDisk,'OAuth-токен Диска'))}" autocomplete="new-password"></label><p class="tech-integration-note">Сохранённые значения скрыты. Пустые поля не изменяют настройки. Токен сотрудников хранится отдельно и не заменяет токен бота клиник.</p><div class="tech-client-form-actions"><button type="submit" class="btn primary">Сохранить и подключить</button></div></form></details></section></div>`;
  }
  function pricingPage(){
    if(!state.pricingDraft)state.pricingDraft=structuredClone(workCatalog);
    if(!state.deliverySettingsDraft)state.deliverySettingsDraft=structuredClone(deliverySettings()||{freeThreshold:4000,fee:500});
    if(!state.promoCodesDraft)state.promoCodesDraft=structuredClone(promoCodes()||[]);
    const delivery=state.deliverySettingsDraft;
    const dayLabel=days=>{if(days===null||days===undefined)return 'Без фиксированного срока';const last=days%10,teens=days%100>=11&&days%100<=14;return `${days} ${!teens&&last===1?'рабочий день':!teens&&last>=2&&last<=4?'рабочих дня':'рабочих дней'}`};
    const dayOptions=days=>`<option value="" ${days===null||days===undefined?'selected':''}>Без фиксированного срока</option>${Array.from({length:31},(_,day)=>`<option value="${day}" ${day===days?'selected':''}>${dayLabel(day)}</option>`).join('')}`;
    const categoryMarkup=state.pricingDraft.map((category,categoryIndex)=>{
      const isNewCategory=!String(category.name||'').trim(),categoryEditing=state.pricingEditingCategories[categoryIndex]===true||isNewCategory;
      const title=categoryEditing?`<input class="tech-pricing-category-name" type="text" placeholder="Название раздела" aria-label="Название раздела" data-pricing-category-name data-category="${categoryIndex}" value="${safe(category.name||'')}">`:`<h2 class="tech-pricing-category-title">${safe(category.name)}</h2>`;
      const rows=category.options.map((option,optionIndex)=>{
        const days=option.productionDays,rowKey=categoryIndex+':'+optionIndex,rowEditing=state.pricingEditingRows[rowKey]===true;
        const handle=`<button type="button" class="tech-pricing-drag" data-pricing-drag draggable="false" ${category.options.length<2||state.pricingSaving?'disabled':''} aria-label="Переместить услугу ${safe(option.name||'Без названия')}" title="Перетащите услугу; клавиши ↑ и ↓ меняют порядок"><svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="1.3"/><circle cx="11" cy="5" r="1.3"/><circle cx="5" cy="10" r="1.3"/><circle cx="11" cy="10" r="1.3"/><circle cx="5" cy="15" r="1.3"/><circle cx="11" cy="15" r="1.3"/></svg></button>`;
        const nameControl=rowEditing?`<label class="tech-pricing-control"><span>Услуга</span><input class="tech-pricing-service-name" type="text" aria-label="Название услуги" placeholder="Название услуги" maxlength="200" data-pricing-field="name" data-category="${categoryIndex}" data-option="${optionIndex}" value="${safe(option.name||'')}"></label>`:`<div class="tech-pricing-control"><span>Услуга</span><div class="tech-pricing-value tech-pricing-service-value">${safe(option.name||'Без названия')}</div></div>`;
        const deadlineValue=isHighVolumeLithiumRestoration(category.name,option.name)?`<div class="tech-pricing-deadline-stack"><span><small>≤ 10 ед.</small><strong>${dayLabel(days)}</strong></span><span class="is-batch"><small>11+ ед.</small><strong>14 рабочих дней</strong></span></div>`:dayLabel(days);
        const controls=rowEditing?`<label class="tech-pricing-control"><span>Цена</span><div class="tech-pricing-input"><input type="number" aria-label="Цена услуги" min="0" step="50" data-pricing-field="price" data-category="${categoryIndex}" data-option="${optionIndex}" value="${Number(option.price)||0}"><i>₽</i></div></label><label class="tech-pricing-control"><span>Срок</span><select aria-label="Срок производства" data-pricing-field="days" data-category="${categoryIndex}" data-option="${optionIndex}">${dayOptions(days)}</select></label>`:`<div class="tech-pricing-control"><span>Цена</span><div class="tech-pricing-value tech-pricing-price-value">${rubles(Number(option.price)||0)}</div></div><div class="tech-pricing-control"><span>Срок</span><div class="tech-pricing-value tech-pricing-deadline-value">${deadlineValue}</div></div>`;
        return `<div class="tech-pricing-row tech-catalog-row ${rowEditing?'is-editing':''} ${!String(option.name||'').trim()?'is-new':''}" data-pricing-row data-category="${categoryIndex}" data-option="${optionIndex}"><div class="tech-pricing-service-cell tech-pricing-name">${handle}${nameControl}</div>${controls}<button type="button" class="tech-pricing-edit" data-tech-pricing-action="edit" data-category="${categoryIndex}" data-option="${optionIndex}" aria-label="${rowEditing?'Завершить редактирование услуги':'Редактировать услугу'}" title="${rowEditing?'Готово':'Редактировать'}">${rowEditing?icon('check',15):chiefEditIcon}</button><button type="button" class="tech-pricing-remove" data-tech-pricing-action="remove" data-category="${categoryIndex}" data-option="${optionIndex}" aria-label="Удалить услугу ${safe(option.name||'')||'без названия'}" title="Удалить услугу">×</button></div>`;
      }).join('');
      const categoryHandle=`<button type="button" class="tech-pricing-category-drag" data-pricing-category-drag aria-label="Переместить раздел ${safe(category.name||'Без названия')}" title="Перетащите раздел; клавиши ↑ и ↓ меняют порядок"><svg width="16" height="20" viewBox="0 0 16 20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="1.3"/><circle cx="11" cy="5" r="1.3"/><circle cx="5" cy="10" r="1.3"/><circle cx="11" cy="10" r="1.3"/><circle cx="5" cy="15" r="1.3"/><circle cx="11" cy="15" r="1.3"/></svg></button>`;
      return `<section class="tech-pricing-category ${isNewCategory?'is-new':''}" data-pricing-category-row data-category="${categoryIndex}"><header class="tech-pricing-category-head ${categoryEditing?'is-editing':''}"><div class="tech-pricing-category-title-cell">${categoryHandle}<div><span class="tech-pricing-kicker">РАЗДЕЛ ПРАЙСА</span>${title}</div></div><div class="tech-pricing-category-actions"><span class="tech-pricing-count">${category.options.length} ${category.options.length===1?'услуга':'услуг'}</span><button type="button" class="tech-link tech-pricing-add" data-tech-pricing-action="add" data-category="${categoryIndex}">+ Добавить услугу</button><button type="button" class="tech-pricing-edit" data-tech-pricing-action="edit-category" data-category="${categoryIndex}" aria-label="${categoryEditing?'Завершить редактирование раздела':'Редактировать раздел'}" title="${categoryEditing?'Готово':'Редактировать'}">${categoryEditing?icon('check',15):chiefEditIcon}</button><button type="button" class="tech-pricing-remove" data-tech-pricing-action="remove-category" data-category="${categoryIndex}" aria-label="Удалить раздел ${safe(category.name||'')||'прайса'}" title="Удалить раздел">×</button></div></header>${category.options.length?`<div class="tech-pricing-labels"><span>Услуга</span><span>Цена</span><span>Срок производства</span><span aria-hidden="true"></span></div><div class="tech-pricing-rows">${rows}</div>`:'<p class="tech-empty">В этом разделе пока нет услуг</p>'}</section>`;
    }).join('');
    const threshold=Number.isFinite(Number(delivery.freeThreshold))?Number(delivery.freeThreshold):4000,fee=Number.isFinite(Number(delivery.fee))?Number(delivery.fee):500;
    const promoServices=state.pricingDraft.flatMap(category=>category.options.map(option=>({category:category.name,name:typeof option==='string'?option:option.name})));
    const promoMarkup=state.promoCodesDraft.map((promo,index)=>`<section class="tech-promo-card"><div class="tech-promo-head"><div class="tech-delivery-settings-grid"><label>Промокод<input type="text" maxlength="40" data-promo-field="code" data-promo-index="${index}" value="${safe(promo.code||'')}"></label><label>Название акции<input type="text" maxlength="120" data-promo-field="name" data-promo-index="${index}" value="${safe(promo.name||'')}"></label></div><label class="tech-promo-active"><input type="checkbox" data-promo-field="active" data-promo-index="${index}" ${promo.active!==false?'checked':''}> Активен</label><button class="tech-pricing-remove" type="button" data-tech-pricing-action="remove-promo" data-promo-index="${index}" aria-label="Удалить промокод">×</button></div><h3>Специальные цены по услугам</h3><p class="tech-promo-hint">Оставьте поле пустым, чтобы использовать обычную цену.</p><div class="tech-promo-price-grid">${promoServices.map(service=>{const key=service.category+'|||'+service.name,value=promo.prices?.[key];return `<label><span>${safe(service.category)} · ${safe(service.name)}</span><input type="number" min="0" step="50" placeholder="Обычная цена" data-promo-price data-promo-index="${index}" data-promo-key="${safe(key)}" value="${value===undefined?'':Number(value)}"><i>₽</i></label>`}).join('')}</div></section>`).join('');
    const promoSection='<section class="tech-panel tech-promo-settings"><div class="tech-panel-heading"><div><span class="tech-pricing-kicker">ПРОДАЖИ</span><h2>Промокоды</h2><p>Код можно дать клинике в ссылке регистрации. Для каждой услуги задайте отдельную цену.</p></div><div><button class="btn outline" data-tech-pricing-action="add-promo">+ Добавить промокод</button><button class="btn primary" data-tech-pricing-action="save-promos" '+(state.promoCodesSaving?'disabled':'')+'>'+(state.promoCodesSaving?'Сохранение…':'Сохранить промокоды')+'</button></div></div>'+(promoMarkup||'<p class="tech-empty">Промокодов пока нет. Добавьте первый код для специального прайса.</p>')+'</section>';
    return `<div class="tech-heading tech-pricing-heading"><div><span class="tech-eyebrow">КАТАЛОГ</span><h1>Прайс и сроки</h1></div><div class="tech-pricing-heading-actions"><button class="btn outline" data-tech-pricing-action="download-pdf">Скачать PDF</button><button class="btn outline" data-tech-pricing-action="add-category">+ Добавить раздел прайса</button><button class="btn primary" data-tech-pricing-action="save" ${state.pricingSaving?'disabled':''}>${state.pricingSaving?'Сохранение…':'Сохранить изменения'}</button></div></div><p class="tech-pricing-order-hint" role="status">${state.pricingOrderChanged?'Порядок изменён. Нажмите «Сохранить изменения», чтобы обновить прайс у клиник.':'Перетаскивайте разделы или услуги за значок слева. После сохранения этот порядок будет одинаковым у техника и клиники.'}</p><div class="tech-pricing-list">${categoryMarkup}</div><section class="tech-panel tech-delivery-settings"><div class="tech-panel-heading"><div><span class="tech-pricing-kicker">УСЛОВИЯ ЗАКАЗОВ</span><h2>Доставка</h2><p>Эти условия применяются к новым заказам клиник и отображаются в корзине до отправки заказа.</p></div><button class="btn primary" data-tech-pricing-action="save-delivery" ${state.deliverySettingsSaving?'disabled':''}>${state.deliverySettingsSaving?'Сохранение…':'Сохранить условия'}</button></div><div class="tech-delivery-settings-grid"><label>Бесплатная доставка от суммы услуг<input type="number" min="0" step="100" data-delivery-setting="freeThreshold" value="${threshold}"><small>Если услуги дешевле этого порога, добавляется платная доставка.</small></label><label>Стоимость доставки ниже порога<input type="number" min="0" step="50" data-delivery-setting="fee" value="${fee}"><small>Можно поставить 0, если доставка всегда бесплатная.</small></label></div><div class="tech-delivery-settings-summary">Сейчас: до ${rubles(threshold)} услуг — доставка ${rubles(fee)}; от ${rubles(threshold)} — бесплатно.</div></section>`+promoSection;
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
  function messageAttachmentMarkup(attachment,pending=false){if(!attachment)return '';const preview=attachment.preview?`<img src="${safe(attachment.preview)}" loading="lazy" decoding="async" alt="">`:'<span class="chat-file-icon">📄</span>';return `<${pending?'div':'button'} class="chat-attachment ${pending?'pending':''}" ${pending?'':`type="button" data-chief-chat-file="${safe(attachment.id)}"`}>${preview}<span><strong>${safe(attachment.name)}</strong><small>${messageFileSize(attachment.size)}</small></span>${pending?'<button type="button" data-tech-message-attachment="remove" aria-label="Убрать файл">×</button>':''}</${pending?'div':'button'}>`}
  function messageImagePreview(file){return new Promise((resolve,reject)=>{if(!file.type.startsWith('image/'))return resolve('');const image=new Image(),url=URL.createObjectURL(file);image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Не удалось открыть изображение'))};image.onload=()=>{const scale=Math.min(1,240/image.width,180/image.height),canvas=document.createElement('canvas'),context=canvas.getContext('2d');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));context.drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.72))};image.src=url})}
  async function selectMessageAttachment(file){if(!file)return;const allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf|html)$/i;if(!allowed.test(file.name))return toast('Выберите изображение, PDF, 3D-файл, архив, Word, Excel или текстовый документ');if(file.size>200*1024*1024)return toast('Файл должен быть не больше 200 МБ');try{state.messageAttachment={file,name:file.name,size:file.size,type:file.type||'application/octet-stream',preview:await messageImagePreview(file)};render()}catch(error){toast(error.message)}}
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
    return `<div class="tech-heading"><div><span class="tech-eyebrow">КЛИНИКИ</span><h1>Сообщения</h1></div></div><div class="messages-layout chief-messages ${state.conversations.length?'':'is-empty'}"><div class="contacts">${state.conversations.map(item=>`<button class="contact ${item.id===state.activeConversation?'active':''}" data-tech-conversation="${safe(item.id)}">${avatar(item)}<span><strong>${safe(item.name)}</strong><small>${safe(item.lastMessage)}</small></span></button>`).join('')}</div><div class="conversation">${active?`<div class="conversation-head">${avatar(active)}<span><strong>${safe(active.name)}</strong><small>Диалог с клиникой</small></span></div><div class="chat-bubbles" id="chief-chat-bubbles">${state.conversationMessages.length?chiefMessagesMarkup(state.conversationMessages):'<p class="chat-empty">Сообщений пока нет.</p>'}</div><form class="chat-compose chat-compose-files" id="chief-chat-form">${state.messageAttachment?`<div class="chat-pending-file">${messageAttachmentMarkup(state.messageAttachment,true)}</div>`:''}<label class="chat-attach-button" title="Прикрепить файл">📎<input id="chief-chat-file" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.stl,.ply,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt,.rtf,.html" hidden></label><input name="text" maxlength="2000" placeholder="Напишите ответ..." autocomplete="off"><button class="send-btn" aria-label="Отправить ответ">➤</button></form>`:state.conversations.length?'<p class="chat-empty">Выберите клинику из списка.</p>':'<p class="chat-empty">Сообщений от клиник пока нет. Здесь появятся новые диалоги.</p>'}${state.messagesError?`<p class="chat-error">${safe(state.messagesError)}</p>`:''}</div></div>`;
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
  function portalFooter(){return `<footer class="portal-footer"><span class="portal-footer-copy">© 2019–2026 Create Dental</span><span class="portal-footer-tagline">Для клиник, которым важен результат</span><a class="portal-footer-email" href="mailto:orders@createdental.io">orders@createdental.io</a><nav class="portal-footer-legal" aria-label="Правовые документы"><a href="/assets/legal/privacy.html">Политика конфиденциальности</a><a href="/assets/legal/consent-data.html">Согласие на обработку персональных данных</a></nav></footer>`}
  function shell(content){
    root().toggleAttribute('data-tech-pricing-restored',state.page==='pricing');
    root().toggleAttribute('data-tech-orders-restored',state.page==='orders'||state.page==='detail'&&Boolean(orderById(state.orderId)?.serviceWorks?.length));
    const pendingRequests=clientRequests().filter(request=>request.status==='pending').length;
    const newOrders=allOrders().filter(order=>['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(order.stage)).length;
    const intakeOrders=allOrders().filter(order=>order.stage==='Контроль качества').length;
    const newClients=clients.filter(client=>client.approved===false).length;
    const navPage=state.page==='quality'?'intake':state.page==='detail'?state.detailReturnPage:state.page;
    const crmItems=[['orders','Заказы','orders',newOrders],['clients','Клиентская база','clinic',newClients],['messages','Сообщения','message']];
    const managementItems=[['pulse','Пульс компании','pulse'],['tasks','Задачи','check',tasks().filter(task=>task.status!=='done').length],['team','Команда','users'],['pricing','Прайс и сроки','tag'],['salary','Зарплаты','wallet']];
    const productionItems=[['production','Производство','grid'],['requests','Клиентские правки','file',pendingRequests],['intake','Отдел качества','shieldCheck',intakeOrders]];
    const navButton=([page,label,ico,count])=>`<a class="nav-link ${navPage===page?'active':''}" href="${pathFor('technician',page)}" data-tech-page="${page}" data-sidebar-label="${label}" title="${label}">${navIcon(ico,20)}<span>${label}</span>${count?`<i class="tech-nav-count">${count>99?'99+':count}</i>`:''}</a>`;
    const navGroup=(label,ico,items)=>{const open=sidebarCollapsed()&&matchMedia('(min-width:761px)').matches?state.sidebarGroup===label:items.some(([page])=>page===navPage)||state.sidebarGroup===label;return `<details class="tech-nav-group" ${open?'open':''}><summary data-sidebar-label="${label}" title="${label}">${navIcon(ico,20)}<span>${label}</span>${icon('chevron',14)}</summary><div class="tech-nav-group-items">${items.map(navButton).join('')}</div></details>`};
    const navMarkup=[navButton(['overview','Обзор','home']),navGroup('CRM','crm',crmItems),navGroup('Менеджмент','management',managementItems),navGroup('Производство','factory',productionItems),navButton(['profile','Профиль','user'])].join('');
    const profile=chiefProfile();
    const avatar=profile.avatar?`<span class="avatar"><img src="${safe(profile.avatar)}" alt=""></span>`:`<span class="avatar">${safe(initials(profile.displayName||'Главный техник'))}</span>`;
    const mobileItems=[['overview','Обзор','home'],['orders','Заказы','orders',newOrders],['production','Цех','grid'],['messages','Сообщения','message']];
    const activePage=state.page==='quality'?'intake':state.page==='detail'?state.detailReturnPage:state.page,moreActive=!mobileItems.some(([page])=>page===activePage);
    const mobileNav=`<nav class="mobile-bottom-nav" aria-label="Основная навигация">${mobileItems.map(([page,label,ico,count])=>`<button type="button" class="mobile-bottom-item ${activePage===page?'active':''}" data-tech-page="${page}" aria-label="${label}" ${activePage===page?'aria-current="page"':''}>${navIcon(ico,20)}<span>${label}</span>${count?`<i class="mobile-nav-count">${count>99?'99+':count}</i>`:''}</button>`).join('')}<button type="button" class="mobile-bottom-item ${moreActive?'active':''}" data-tech-action="menu" aria-label="Ещё разделы" ${moreActive?'aria-current="page"':''}>${icon('more',20)}<span>Ещё</span></button></nav>`;
    root().innerHTML=`<aside class="sidebar tech-sidebar ${sidebarCollapsed()?'sidebar-collapsed':''}" id="tech-sidebar"><button class="brand brand-home" data-tech-page="overview" aria-label="На главную"><img class="portal-logo" src="${logo}" alt="Create Dental">${sidebarMark}</button>${sidebarCollapseMarkup()}<div class="tech-side-label">КАБИНЕТ ГЛАВНОГО ТЕХНИКА</div><nav class="sidebar-nav" aria-label="Разделы кабинета">${navMarkup}</nav><button type="button" class="mobile-sidebar-logout" data-auth-logout>↪ <span>Выйти из кабинета</span></button></aside><button type="button" class="mobile-drawer-backdrop" data-tech-action="menu-close" aria-label="Закрыть меню"></button><div class="shell tech-shell ${sidebarCollapsed()?'sidebar-shell-collapsed':''}"><header class="topbar"><button class="mobile-menu" data-tech-action="menu" aria-label="Открыть меню">☰</button><div class="topbar-spacer"></div>${languageSwitcherMarkup()}${themeToggleMarkup()}${notificationCenterMarkup()}<button class="role-toggle" data-auth-logout>Выйти</button><button class="profile" data-tech-page="profile">${avatar}<span><strong>${safe(profile.displayName||'Главный техник')}</strong><small>Главный техник</small></span>${icon('chevron',13)}</button></header><main class="content tech-content">${content}</main>${portalFooter()}</div>${mobileNav}<div class="toast ${state.toast?'visible':''}">${safe(state.toast)}</div>${qualityReworkDialog()}`;
  }
  function qualityReworkDialog(){
    const order=state.qualityReworkOrderId&&orderById(state.qualityReworkOrderId);
    if(!order||order.stage!=='Контроль качества')return '';
    return `<div class="tech-dialog-backdrop" data-tech-modal="quality-rework"><section class="tech-dialog pulse-rework-dialog" role="dialog" aria-modal="true" aria-labelledby="pulse-rework-title"><button type="button" class="tech-dialog-close" data-tech-action="cancel-quality-rework" aria-label="Закрыть">×</button><h2 id="pulse-rework-title">Вернуть заказ ${safe(order.id)} на доработку</h2><p>Укажите конкретную причину. Она сохранится в истории заказа и статистике качества.</p><form id="quality-rework-form" class="tech-client-form"><label>Категория причины<select name="category" required><option value="">Выберите категорию</option><option>Посадка и геометрия</option><option>Цвет и эстетика</option><option>Не соответствует заданию</option><option>Файлы или исходные данные</option><option>Другое</option></select></label><label>Что нужно исправить<textarea name="reason" rows="3" minlength="8" maxlength="1000" required placeholder="Опишите проблему и ожидаемое исправление"></textarea></label><div class="tech-client-form-actions"><button type="button" class="btn outline" data-tech-action="cancel-quality-rework">Отмена</button><button type="submit" class="btn primary">Вернуть на доработку</button></div></form></section></div>`;
  }
  function arrangeProductionTimeline(){
    if(state.page!=='detail')return;
    const order=orderById(state.orderId);
    const timeline=root().querySelector('.tech-detail-side .tech-timeline');
    if(!order||!timeline)return;
    const current=productionStageIndex(order.stage);
    const labels=['Ожидает принятия','В работе','ОТК','Передал дальше'];
    const displayStatus=status=>status==='Принял работу'?'В работе':status==='Работа сдана'?'Передал дальше':status;
    const qualityKind=order.qualityRequest?.kind;
    const preManufacturingQuality=order.stage==='Контроль качества'&&['cad','preprod'].includes(qualityKind);
    const roleStatus={
      preprod:displayStatus(order.preprodTechnicianStatus)||(order.stage==='Препрод'?'В работе':order.productionType==='analog'&&['Изготовление','Контроль качества','Работа принята','В доставке','Принято доктором'].includes(order.stage)?'Передал дальше':''),
      cad:order.stage==='Подготовка'?(displayStatus(order.cadOperatorStatus)||'Ожидает принятия'):order.stage==='Моделирование'?(displayStatus(order.cadOperatorStatus)||'В работе'):order.stage==='Контроль качества'&&qualityKind==='cad'?'ОТК':order.stage==='Согласование CAD'?'Согласование с врачом':['Изготовление','Работа принята','В доставке','Принято доктором'].includes(order.stage)?'Передал дальше':'',
      frame:preManufacturingQuality?'':order.frameTechnician||order.technician?camWorkflowStatus(order):'',
      painter:preManufacturingQuality?'':displayStatus(order.painterStatus||order.ceramicistStatus)||(order.stage==='Контроль качества'&&qualityKind==='esthetic'?'ОТК':order.stage==='Работа принята'?'Передал дальше':'')
    };
    const roleState=role=>{
      if(role==='preprod'&&order.stage==='Препрод')return 'Сейчас работает';
      if(role==='cad'&&order.stage==='Согласование CAD')return 'Ожидает решения врача';
      if(role==='frame'&&order.stage==='Изготовление'&&order.manufacturingStatus===manufacturingStatuses[0])return roleStatus.frame==='В работе'?'Сейчас работает':roleStatus.frame==='Отправлено на фрезеровку'?'Фрезеровка выполняется':roleStatus.frame==='Ожидает принятия'?'Ожидает принятия CAM-оператором':'Ожидает отправки на фрезеровку';
      if(role==='painter'&&order.stage==='Изготовление'&&order.manufacturingStatus===manufacturingStatuses[1])return 'Сейчас работает';
      if(role==='painter'&&order.stage==='На доработке'&&['Принял работу','Принял в работу','В работе','ОТК'].includes(roleStatus.painter))return 'Сейчас работает';
      if(role==='frame'&&roleStatus.frame==='Передал дальше')return 'Передал дальше';
      if(role==='painter'&&roleStatus.painter==='Передал дальше')return 'Передал дальше';
      if(role==='painter'&&order.stage==='Изготовление'&&order.manufacturingStatus===manufacturingStatuses[0])return 'Ожидает передачи';
      if(role==='frame'&&order.stage!=='Изготовление')return 'Ожидает этапа изготовления';
      if(role==='painter'&&!roleStatus.painter)return 'Ожидает этапа доработки и эстетики';
      return '';
    };
    const progressPercent=status=>({'Принял работу':50,'Заказ принят':50,'Принял в работу':50,'В работе':50,'ОТК':75,'Согласование с врачом':90,'Работа сдана':100,'Передал дальше':100}[status]||0);
    const manufacturingProgress=()=>camWorkflowProgress(order);
    const stageProgress=(progress)=>`<div class="tech-stage-progress" style="width:220px;max-width:220px;flex:0 0 220px;margin:0;box-sizing:border-box" aria-label="Прогресс этапа ${progress}%"><div class="tech-progress-head"><span>Прогресс этапа</span><b>${progress}%</b></div><div class="tech-progress-track"><i style="width:${progress}%"></i></div></div>`;
    const nestedRole=(title,role)=>{const future=!roleStatus[role],roleLabels=role==='cad'?[...labels.slice(0,3),'Согласование с врачом',labels[3]]:role==='frame'?camWorkflowStages:labels,rank=roleLabels.indexOf(roleStatus[role]),handedToActiveCam=role==='cad'&&roleStatus.cad==='Передал дальше'&&camWorkflowStages.includes(roleStatus.frame);return `<li class="tech-timeline-role${future?' future':''}"><strong>${title}</strong>${roleState(role)?`<small>${roleState(role)}</small>`:''}</li>${roleLabels.map((label,index)=>`<li class="tech-timeline-specialist ${index===roleLabels.length-1?'role-handoff':''} ${index<rank||handedToActiveCam&&index===rank?'done':index===rank&&!handedToActiveCam?'current':''}"><i></i><span>${label}</span></li>`).join('')}`};
    const visibleStages=order.productionType==='analog'?['Ожидает подтверждения','Приём / Доставка','Аналоговая подготовка','Моделирование','Изготовление','Контроль качества','Доставка в клинику','Принято врачом'].map(label=>productionStages.find(item=>item.label===label)).filter(Boolean):productionStages.filter(item=>!['Аналоговая подготовка','CAD на согласовании у врача'].includes(item.label));
    const visibleCurrentStage=order.stage==='Согласование CAD'?'Моделирование':order.stage==='Изготовление'&&order.manufacturingStatus===manufacturingStatuses[1]&&visibleStages.some(item=>item.matches.includes('На доработке'))?'На доработке':order.stage;
    const visibleCurrent=Math.max(0,visibleStages.findIndex(item=>item.matches.includes(visibleCurrentStage)));
    const qualityCompleted=qualityKind==='cad'?['Ожидает подтверждения','Приём / Доставка','Моделирование']:qualityKind==='preprod'?['Ожидает подтверждения','Приём / Доставка','Аналоговая подготовка']:qualityKind==='cam'?['Ожидает подтверждения','Приём / Доставка','Моделирование','CAD на согласовании у врача','Изготовление']:qualityKind==='esthetic'?['Ожидает подтверждения','Приём / Доставка','Моделирование','CAD на согласовании у врача','Изготовление','Доработка и эстетика']:qualityKind==='final'?['Ожидает подтверждения','Приём / Доставка','Моделирование','CAD на согласовании у врача','Изготовление']:[];
    const qualityTimeline=order.stage==='Контроль качества'&&qualityKind&&qualityKind!=='final';
    const finalQualityActive=order.stage==='Работа принята'||order.stage==='Контроль качества'&&qualityKind==='final';
    const qualityAfter={cad:'Моделирование',preprod:'Аналоговая подготовка',cam:'Изготовление',esthetic:'Доработка и эстетика',final:'Контроль качества'}[qualityKind];
    const timelineStages=qualityTimeline?visibleStages.flatMap(item=>item.label===qualityAfter?[item,{label:qualityStageTitle(qualityKind),matches:[],qualityMarker:true}]:[item]):visibleStages;
    const finalQualityIndex=visibleStages.findIndex(item=>item.label==='Контроль качества');
    const overall=timelineStages.map((item,index)=>{const done=qualityTimeline?(item.qualityMarker?false:qualityCompleted.includes(item.label)):finalQualityActive?(index<finalQualityIndex):index<visibleCurrent;const active=qualityTimeline?(item.qualityMarker===true):finalQualityActive?(item.label==='Контроль качества'):index===visibleCurrent;const stateClass=`tech-timeline-stage ${done?'done':''} ${active?'current':''} ${!item.qualityMarker&&index===timelineStages.length-1&&index===current?'final':''}`;const progress=item.label==='Моделирование'?progressPercent(roleStatus.cad):item.label==='Аналоговая подготовка'?progressPercent(roleStatus.preprod):item.label==='Изготовление'?manufacturingProgress():item.label==='Доработка и эстетика'?progressPercent(roleStatus.painter):null;const label=compactStageLabel(item.label);const base=`<li class="${stateClass}"><i></i><span>${safe(label)}</span>${item.label==='CAD на согласовании у врача'&&order.stage==='Согласование CAD'?'<small class="tech-timeline-hint">Ожидается решение врача</small>':''}${progress!==null?stageProgress(progress):''}</li>`;if(item.label==='Моделирование')return `${base}${nestedRole('CAD оператор','cad')}`;if(item.label==='Аналоговая подготовка')return `${base}${nestedRole('Препрод техник','preprod')}`;if(item.label==='Изготовление')return `${base}${nestedRole('CAM оператор','frame')}`;if(item.label==='Доработка и эстетика')return `${base}${nestedRole('Эстетист','painter')}`;return base}).join('');
    timeline.innerHTML=overall;
    const badge=root().querySelector('.tech-heading .tech-stage');
    if(badge)badge.textContent=qualityTimeline?qualityStageTitle(qualityKind):finalQualityActive?'Финальная ОТК':productionStageLabel(order.stage);
    const note=root().querySelector('.tech-detail-actions p');
    if(note&&order.stage==='Согласование CAD')note.textContent='CAD отправлен врачу. Ожидается решение или комментарий врача.';
    if(note&&order.stage==='Моделирование')note.textContent='Моделирование работы выполняется.';
  }
  function arrangeAssignmentFilters(){
    if(state.page!=='detail')return;
    const legacy=root().querySelector('.tech-assign');
    const order=orderById(state.orderId);
    if(!legacy||!order)return;
    const displayStatus=status=>status==='Принял работу'?'В работе':status==='Работа сдана'?'Передал дальше':status;
    const analog=order.productionType==='analog';
    // Сначала главный техник подтверждает заказ, затем назначает первого
    // специалиста после этапа «Приём / Доставка». CAM/CAD и Эстетист
    // остаются заблокированы до завершения предыдущего этапа.
    const pendingConfirmation=['Черновик из Telegram','Ожидает распределения','Ожидает подтверждения'].includes(order.stage);
    const preprodUnlocked=analog&&!pendingConfirmation;
    const cadUnlocked=pendingConfirmation?false:(analog?['Моделирование','Контроль качества','Согласование CAD'].includes(order.stage)&&(!order.qualityRequest||order.qualityRequest.kind==='cad'):true);
    const frameUnlocked=Boolean(order.milling?.sentAt)&&['Изготовление','Контроль качества','Работа принята','В доставке','Принято доктором'].includes(order.stage);
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
      if(role==='frame')return order.frameTechnician||order.technician?camWorkflowStatus(order):'';
      if(role==='painter')return displayStatus(order.painterStatus||order.ceramicistStatus)||(order.stage==='Контроль качества'?'ОТК':order.stage==='Работа принята'?'Передал дальше':'');
      if(order.stage==='Подготовка')return displayStatus(order.cadOperatorStatus)||'Ожидает принятия';
      if(order.stage==='Моделирование')return 'В работе';
      if(order.stage==='Контроль качества'&&order.qualityRequest?.kind==='cad')return 'ОТК';
      if(order.stage==='Согласование CAD')return 'Согласование с врачом';
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
    if(route.role==='technician'){state.page=route.page;if(route.orderId)state.orderId=orderById(route.orderId)?.id||route.orderId}
    try {overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}} catch {overrides={}}
    team=loadEmployees();
    try {const saved=JSON.parse(localStorage.getItem('create-dental-tech-clients')||'null');if(Array.isArray(saved))clients=saved} catch { /* Keep current directory. */ }
    const pages={overview,orders:ordersPage,production:productionPage,pulse:pulsePage,tasks:tasksPage,requests:clientRequestsPage,detail:orderDetail,clients:clientsPage,messages:messagesPage,analytics:analyticsPage,team:teamPage,intake:qualityPage,quality:qualityPage,pricing:pricingPage,salary:salaryPage,profile:profilePage};
    shell((pages[state.page]||overview)());
    if(state.page==='salary')queueMicrotask(()=>payrollUI.load());
    const cadFrame=root().querySelector('#tech-cad-preview-frame');if(cadFrame&&state.cadPreview?.url)cadFrame.src=state.cadPreview.url;
    arrangeAssignmentFilters();
    arrangeProductionTimeline();
    if(state.page==='messages')queueMicrotask(()=>{refreshMessages();scrollChiefChat()});
    if(state.page==='profile'&&!state.integration)queueMicrotask(loadIntegrationStatus);
  }
  document.addEventListener('pointerdown',event=>{
    if(!isActive()||state.page!=='pricing'||event.button!==0||state.pricingSaving)return;
    const categoryHandle=event.target.closest?.('[data-pricing-category-drag]'),categoryRow=categoryHandle?.closest('[data-pricing-category-row]');
    if(categoryHandle&&categoryRow){
      pricingCategoryPointerDrag={pointerId:event.pointerId,x:event.clientX,y:event.clientY,row:categoryRow,started:false};
      pricingCategoryDrag={from:Number(categoryRow.dataset.category)};event.preventDefault();categoryHandle.focus({preventScroll:true});categoryHandle.setPointerCapture?.(event.pointerId);return;
    }
    const handle=event.target.closest?.('[data-pricing-drag]'),row=handle?.closest('[data-pricing-row]');if(!row||handle.disabled)return;
    pricingPointerDrag={pointerId:event.pointerId,x:event.clientX,y:event.clientY,row,started:false};
    pricingDrag={category:Number(row.dataset.category),from:Number(row.dataset.option)};event.preventDefault();handle.focus({preventScroll:true});handle.setPointerCapture?.(event.pointerId);
  });
  document.addEventListener('pointermove',event=>{
    const categoryPointer=pricingCategoryPointerDrag;
    if(categoryPointer&&categoryPointer.pointerId===event.pointerId){
      if(!categoryPointer.started&&Math.hypot(event.clientX-categoryPointer.x,event.clientY-categoryPointer.y)<7)return;
      if(!categoryPointer.started){
        categoryPointer.started=true;categoryPointer.row.classList.add('is-dragging');categoryPointer.preview=document.createElement('div');categoryPointer.preview.className='tech-pricing-drag-preview';categoryPointer.preview.textContent=state.pricingDraft?.[pricingCategoryDrag.from]?.name||'Раздел прайса';root().append(categoryPointer.preview);
      }
      event.preventDefault();categoryPointer.preview.style.left=Math.max(8,Math.min(event.clientX+14,innerWidth-categoryPointer.preview.offsetWidth-8))+'px';categoryPointer.preview.style.top=Math.max(8,Math.min(event.clientY+14,innerHeight-categoryPointer.preview.offsetHeight-8))+'px';
      root().querySelectorAll('.tech-pricing-category.is-drop-before,.tech-pricing-category.is-drop-after').forEach(item=>item.classList.remove('is-drop-before','is-drop-after'));
      const target=pricingCategoryDropTarget(event.clientX,event.clientY);if(target&&Number(target.dataset.category)!==pricingCategoryDrag.from){const rect=target.getBoundingClientRect();target.classList.add(event.clientY>rect.top+rect.height/2?'is-drop-after':'is-drop-before')}
      if(event.clientY<70)window.scrollBy(0,-16);else if(event.clientY>innerHeight-70)window.scrollBy(0,16);return;
    }
    const drag=pricingPointerDrag;if(!drag||drag.pointerId!==event.pointerId)return;
    if(!drag.started&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<7)return;
    if(!drag.started){
      drag.started=true;drag.row.classList.add('is-dragging');drag.preview=document.createElement('div');drag.preview.className='tech-pricing-drag-preview';
      drag.preview.textContent=state.pricingDraft?.[pricingDrag.category]?.options?.[pricingDrag.from]?.name||'Услуга';root().append(drag.preview);
    }
    event.preventDefault();
    drag.preview.style.left=Math.max(8,Math.min(event.clientX+14,innerWidth-drag.preview.offsetWidth-8))+'px';drag.preview.style.top=Math.max(8,Math.min(event.clientY+14,innerHeight-drag.preview.offsetHeight-8))+'px';
    markPricingDrop(pricingDropTarget(event.clientX,event.clientY),event.clientY);
    if(event.clientY<70)window.scrollBy(0,-16);else if(event.clientY>innerHeight-70)window.scrollBy(0,16);
  },{passive:false});
  document.addEventListener('pointerup',event=>{
    if(pricingCategoryPointerDrag?.pointerId===event.pointerId){if(pricingCategoryPointerDrag.started)finishPricingCategoryDrop(pricingCategoryDropTarget(event.clientX,event.clientY),event.clientY);else clearPricingDrag();return}
    if(!pricingPointerDrag||pricingPointerDrag.pointerId!==event.pointerId)return;
    if(pricingPointerDrag.started)finishPricingDrop(pricingDropTarget(event.clientX,event.clientY),event.clientY);else clearPricingDrag();
  });
  document.addEventListener('pointercancel',()=>{if(pricingPointerDrag||pricingCategoryPointerDrag)clearPricingDrag()});
  document.addEventListener('dragstart',event=>{
    if(!isActive()||state.page!=='tasks')return;
    const card=event.target.closest('[data-task-drag]');
    if(!card)return;
    taskDragId=card.dataset.taskDrag;
    card.classList.add('is-dragging');
    event.dataTransfer?.setData('text/plain',taskDragId);
    if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
  });
  document.addEventListener('dragover',event=>{
    if(!isActive()||state.page!=='tasks'||!taskDragId)return;
    const column=event.target.closest('[data-task-column]');
    if(!column)return;
    event.preventDefault();
    if(event.dataTransfer)event.dataTransfer.dropEffect='move';
    root().querySelectorAll('.task-column.is-drag-over').forEach(item=>{if(item!==column)item.classList.remove('is-drag-over')});
    column.classList.add('is-drag-over');
  });
  document.addEventListener('drop',event=>{
    if(!isActive()||state.page!=='tasks'||!taskDragId)return;
    const column=event.target.closest('[data-task-column]');
    if(!column)return;
    event.preventDefault();
    const id=event.dataTransfer?.getData('text/plain')||taskDragId,status=column.dataset.taskColumn;
    clearTaskDrag();
    void moveTaskToStatus(id,status);
  });
  document.addEventListener('dragend',()=>{if(taskDragId)clearTaskDrag()});
  document.addEventListener('click',async event=>{
    if(currentUser()?.role!=='technician')return;
    const groupSummary=event.target.closest?.('.tech-nav-group>summary');
    if(groupSummary&&matchMedia('(min-width:761px)').matches&&root().querySelector('#tech-sidebar')?.classList.contains('sidebar-collapsed')){
      event.preventDefault();
      const selectedGroup=groupSummary.parentElement,open=!selectedGroup.open;
      state.sidebarGroup=open?groupSummary.dataset.sidebarLabel||'':'';
      root().querySelectorAll('.tech-nav-group').forEach(group=>{group.open=group===selectedGroup&&open});
      return;
    }
    if(groupSummary){
      state.sidebarGroup='';
      root().querySelectorAll('.tech-nav-group[open]').forEach(group=>{if(!group.contains(groupSummary))group.removeAttribute('open')});
    }
    // A compact flyout is transient: clicking anywhere in the workspace
    // closes it, while clicks inside the flyout keep it available for a
    // second navigation choice.
    if(sidebarCollapsed()&&!groupSummary&&state.sidebarGroup&&!event.target.closest('.tech-nav-group')){
      state.sidebarGroup='';
      root().querySelectorAll('.tech-nav-group[open]').forEach(group=>group.removeAttribute('open'));
    }
    if(root().querySelector('.notification-panel')&&!event.target.closest('.notification-center')){closeNotificationCenter();root().querySelector('.notification-panel')?.remove()}
    if(activeOrderFilters().orderFilterOpen&&!event.target.closest('.tech-order-filter-panel')&&!event.target.closest('[data-tech-filter-panel]')){activeOrderFilters().orderFilterOpen=false;root().querySelector('.tech-order-filter-panel')?.remove()}
    if(state.taskFilterOpen&&!event.target.closest('.task-filter-panel')&&!event.target.closest('[data-task-filter-panel]')&&!event.target.closest('[data-task-create]')){state.taskFilterOpen=false;render();return}
    if(event.target.closest('[data-notification-toggle]')){await toggleNotificationCenter();render();return}
    const sidebarToggle=event.target.closest('[data-tech-sidebar-toggle]');
    if(sidebarToggle){try{localStorage.setItem('create-dental-sidebar-collapsed',sidebarCollapsed()?'0':'1')}catch{};render();return}
    if(event.target.closest('[data-notification-close]')){closeNotificationCenter();render();return}
    const taskCreateAction=event.target.closest('[data-task-create]');
    if(taskCreateAction){
      const action=taskCreateAction.dataset.taskCreate;
      // Clicks on the form bubble through the backdrop; only the backdrop itself dismisses it.
      if(action==='backdrop'&&event.target!==taskCreateAction)return;
      if(taskSaving)return;
      if(action==='open'){state.taskCreateOpen=true;state.taskEditId=null;state.taskFilterOpen=false}
      else if(action==='close'||action==='backdrop'){state.taskCreateOpen=false;state.taskEditId=null}
      render();
      return;
    }
    const taskEditAction=event.target.closest('[data-task-edit]');
    if(taskEditAction){
      const task=tasks().find(item=>item.id===taskEditAction.dataset.taskEdit);
      if(!task)return;
      state.taskEditId=task.id;state.taskCreateOpen=true;state.taskFilterOpen=false;render();
      return;
    }
    const taskDeleteAction=event.target.closest('[data-task-delete]');
    if(taskDeleteAction){
      const task=tasks().find(item=>item.id===taskDeleteAction.dataset.taskDelete);
      if(!task||taskSaving)return;
      if(!window.confirm(`Удалить задачу «${task.title||'Задача'}»?`))return;
      const next=tasks().filter(item=>item.id!==task.id);
      taskSaving=true;
      try{await savePortal('tasks',next);tasks().splice(0,tasks().length,...next);toast('Задача удалена');render()}
      catch(error){toast('Не удалось удалить задачу: '+error.message)}
      finally{taskSaving=false}
      return;
    }
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
    const orderView=event.target.closest('[data-tech-order-view]');
    if(orderView){state.orderDisplayMode=orderView.dataset.techOrderView==='list'?'list':'grouped';try{localStorage.setItem('create-dental-order-display-mode',state.orderDisplayMode)}catch{}render();return}
    const orderGroupToggle=event.target.closest('[data-tech-order-group-toggle]');
    if(orderGroupToggle){const groupId=orderGroupToggle.dataset.techOrderGroupToggle;state.expandedOrderGroups[groupId]=!state.expandedOrderGroups[groupId];render();return}
    const orderParentOpen=event.target.closest('[data-tech-order-parent]');
    if(orderParentOpen&&(!event.target.closest('button')||event.target.closest('button')===orderParentOpen)){event.preventDefault();state.orderId=orderParentOpen.dataset.techOrderParent;state.detailReturnPage='orders';setPage('detail');return}
    const orderFilterButton=event.target.closest('[data-tech-filter-panel]');
    if(orderFilterButton){
      const action=orderFilterButton.dataset.techFilterPanel,filterState=activeOrderFilters();
      if(action==='toggle')filterState.orderFilterOpen=!filterState.orderFilterOpen;
      else if(action==='close')filterState.orderFilterOpen=false;
      else if(action==='reset'){filterState.orderClinicFilter='';filterState.orderMonthFilter='';filterState.orderDoctorFilter='';filterState.orderEmployeeFilter='';filterState.orderWorkFilter='';filterState.orderFilterOpen=false;}
      render();
      return;
    }
    const taskFilterButton=event.target.closest('[data-task-filter-panel]');
    if(taskFilterButton){
      const action=taskFilterButton.dataset.taskFilterPanel;
      if(action==='toggle')state.taskFilterOpen=!state.taskFilterOpen;
      else if(action==='close')state.taskFilterOpen=false;
      else if(action==='reset'){state.taskEmployeeFilter='';state.taskStatusFilter='';state.taskPriorityFilter='';state.taskFilterOpen=false}
      render();
      return;
    }
    const qualityFilter=event.target.closest('[data-tech-quality-filter]');
    if(qualityFilter){state.qualityFilter=qualityFilter.dataset.techQualityFilter||'all';render();return}
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
      else if(action==='delete'&&employee&&!employee.deleted)state.confirmEmployeeDeleteId=id;
      else if(action==='cancel-delete')state.confirmEmployeeDeleteId=null;
      else if(action==='confirm-delete'&&employee&&!employee.deleted){
        for(const order of allOrders().filter(order=>[order.assigneeKey,order.cadOperatorKey,order.preprodTechnicianKey,order.frameTechnicianKey,order.painterKey,order.ceramicistKey].includes(employee.originalName)&&!['Работа принята','В доставке','Принято доктором','Готово к выдаче'].includes(order.stage))){
          overrides[order.id]={...(overrides[order.id]||{}),assignee:'',cadOperator:'',preprodTechnician:'',technician:'',frameTechnician:'',painter:'',ceramicist:'',cadOperatorStatus:'',preprodTechnicianStatus:'',technicianStatus:'',frameTechnicianStatus:'',painterStatus:'',ceramicistStatus:'',stage:'Ожидает распределения'};
        }
        localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
        savePortal('orderOverrides',overrides).catch(error=>toast('Не удалось сохранить заказы на сервере: '+error.message));
        employee.status='fired';employee.deleted=true;
        saveTeam().catch(()=>{});
        state.confirmEmployeeDeleteId=null;
        if(state.editEmployeeId===id)state.editEmployeeId=null;
      }
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
      if(action==='parent-send-milling'){
        const parent=orderById(state.orderId),works=parent?.serviceWorks?.filter(work=>camMethodForOrder(work)==='milling'&&routeForOrder(work).flow.includes('cam'))||[];
        if(state.millingSendingOrderId||!parent||parent.id!==id||parentSharedMilling(parent)||!works.length||works.some(parentMillingBlockReason)||orderFilesState.loading||orderFilesState.error||!orderFilesState.files.some(file=>/\.constructionInfo$/i.test(file.name||'')||/_cad\.stl$/i.test(file.name||'')))return;
        state.millingSendingOrderId=id;state.parentMillingNotice=null;render();
        try{const result=await sendOrderToMilling(parent.id);applySharedMillingResult(result);state.parentMillingNotice={parentId:parent.id,text:'Весь заказ отправлен на фрезеровку.',error:false};}
        catch(error){state.parentMillingNotice={parentId:parent.id,text:error.message||'Не удалось отправить заказ на фрезеровку.',error:true};}
        finally{state.millingSendingOrderId='';await refreshProduction();render()}return;
      }
      if(action==='print-order'){const order=orderById(id);if(order)openOrderPrint({order,toothChart,logo});return}
      if(action==='send-milling'){
        if(!id||state.millingSendingOrderId)return;
        state.millingSendingOrderId=id;render();
        try{
          const result=await sendOrderToMilling(id);
          applySharedMillingResult(result);
          toast('Заказ целиком отправлен на фрезеровку');
        }catch(error){toast(error.message||'Не удалось отправить файлы на фрезеровку')}
        finally{
          state.millingSendingOrderId='';
          const refreshed=await loadOrderFiles(id).catch(()=>null);
          if(refreshed){orderFilesState.files=refreshed.files||[];orderFilesState.folderUrl=refreshed.folderUrl||''}
          render();
        }
        return;
      }
      if(action==='milling-complete'){
        const order=orderById(id);
        if(!order||order.stage!=='Изготовление'||order.manufacturingStatus!==manufacturingStatuses[0]||!order.milling?.sentAt||order.milling.completedAt)return;
        orderAction.disabled=true;
        try{
          const next={...overrides,[id]:camAfterMilling({...overrides[id],milling:order.milling},new Date().toISOString())};
          await savePortal('orderOverrides',next);
          overrides=next;localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
          toast('Фрезеровка завершена. Заказ доступен CAM-оператору для принятия.');
        }catch(error){toast('Не удалось завершить фрезеровку: '+error.message)}
        finally{render()}
        return;
      }
      if(action==='open-cad-page'){const popup=window.open('about:blank','_blank','noopener,noreferrer');try{const result=await loadOrderFiles(id);if(!result?.cadPreviewUrl)throw new Error('Страница CAD пока недоступна');if(popup)popup.location.replace(result.cadPreviewUrl);else window.location.assign(result.cadPreviewUrl)}catch(error){popup?.close();toast(error.message||'Не удалось открыть CAD')}return}
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
        if(order)await saveOrderRecord(id,order.paidAt?{paidAt:'',paidAmount:0,paymentStatus:'Не оплачено'}:{paidAt:new Date().toISOString(),paidAmount:Number(String(order.sum||'').replace(/[^0-9]/g,''))||0,paymentStatus:'Оплачено'});
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
      if(action.dataset.techAction==='menu-close'){root().querySelector('#tech-sidebar')?.classList.remove('open');return}
      if(action.dataset.techAction==='cancel-quality-rework'){state.qualityReworkOrderId=null;render();return}
      if(!order)return;
      if(action.dataset.techAction==='approve-draft'){
        if(order.parentOrderId||confirmingOrderId)return;
        confirmingOrderId=id;action.disabled=true;action.textContent='Подтверждаем…';
        try{
          const response=await fetch(`/api/orders/${encodeURIComponent(id)}/confirm`,{method:'POST',headers:{'X-Portal-Token':portalToken()}});
          const result=await response.json();if(!response.ok)throw new Error(result.error||'Не удалось подтвердить заказ');
          const data=await loadPortal('compact');
          if(Array.isArray(data.orders))orders.splice(0,orders.length,...data.orders);
          overrides=data.orderOverrides||{};localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
          if(Array.isArray(data.orderHistory)){const history=orderHistory();history.splice(0,history.length,...data.orderHistory)}
          toast(order.serviceWorks?.length?'Заказ подтверждён. Все новые подзаказы переведены на этап «Приём / Доставка».':'Заказ подтверждён и переведён на этап «Приём / Доставка».');
        }catch(error){toast(error.message)}
        finally{confirmingOrderId='';render()}
        return;
      }
      if(['approve','approve-final'].includes(action.dataset.techAction)&&order.stage==='Контроль качества'){
        if(event.detail>1)return;
        const request=order.qualityRequest,qualityApprovedAt=new Date().toISOString(),final=request?.kind==='final';
        if((action.dataset.techAction==='approve-final')!==final)return;
        if(action.dataset.qualityKind!==undefined&&action.dataset.qualityKind!==(request?.kind||''))return;
        if(state.qualitySavingId)return;
        state.qualitySavingId=id;action.disabled=true;
        const change=qualityApprovalChange(order,action.dataset.qualityKind??request?.kind??'',qualityApprovedAt);
        if(!change){state.qualitySavingId='';return}
        try{
          const decision=request?.kind?{qualityDecision:{kind:request.kind,result:'approved',at:qualityApprovedAt,requestedAt:request.requestedAt||'',reasonCategory:'',reason:''}}:{};
          const next={...overrides,[id]:{...overrides[id],...change,...decision}};
          await savePortal('orderOverrides',next);overrides=next;
          localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
          toast(final?'Финальная ОТК пройдена. Заказ передан на доставку.':change.qualityRequest?.kind==='final'?'ОТК эстетиста принята. Заказ ожидает отдельной финальной ОТК.':'Работа принята.');
        }catch(error){toast('Не удалось принять работу: '+error.message)}
        finally{state.qualitySavingId='';render()}
        return;
      }
      if(action.dataset.techAction==='rework'&&order.stage==='Контроль качества'){
        state.qualityReworkOrderId=id;render();return;
      }
      if(action.dataset.techAction==='rework-resume'&&order.stage==='На доработке')saveOrder(id,{stage:order.reworkKind==='preprod'?'Препрод':'Изготовление',manufacturingStatus:order.reworkKind==='preprod'?'':order.reworkKind==='esthetic'?manufacturingStatuses[1]:manufacturingStatuses[0],preprodTechnicianStatus:order.reworkKind==='preprod'?'Принял работу':'',technicianStatus:'В работе'});
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
    const pricingAction=event.target.closest('[data-tech-pricing-action]');
    if(pricingAction&&pricingAction.dataset.techPricingAction==='edit-category'){
      const categoryIndex=Number(pricingAction.dataset.category);
      state.pricingEditingCategories[categoryIndex]=state.pricingEditingCategories[categoryIndex]!==true;render();
      if(state.pricingEditingCategories[categoryIndex])queueMicrotask(()=>root().querySelector(`[data-pricing-category-name][data-category="${categoryIndex}"]`)?.focus());
      return;
    }
    if(pricingAction&&pricingAction.dataset.techPricingAction==='edit'){
      const categoryIndex=Number(pricingAction.dataset.category),optionIndex=Number(pricingAction.dataset.option),rowKey=categoryIndex+':'+optionIndex;
      state.pricingEditingRows[rowKey]=state.pricingEditingRows[rowKey]!==true;render();
      if(state.pricingEditingRows[rowKey])queueMicrotask(()=>root().querySelector(`[data-pricing-field="name"][data-category="${categoryIndex}"][data-option="${optionIndex}"]`)?.focus());
      return;
    }
    if(pricingAction&&pricingAction.dataset.techPricingAction==='download-pdf'){
      openPricePrint({catalog:state.pricingDraft||workCatalog,logo:`${assets}create-dental-logo-print.png`,onError:()=>toast('Не удалось открыть печать прайса. Обновите страницу и повторите попытку.')});
      return;
    }

    if(pricingAction&&pricingAction.dataset.techPricingAction==='add-promo'){
      if(!state.promoCodesDraft)return;
      state.promoCodesDraft.push({code:'',name:'',active:true,prices:{}});render();return;
    }
    if(pricingAction&&pricingAction.dataset.techPricingAction==='remove-promo'){
      state.promoCodesDraft?.splice(Number(pricingAction.dataset.promoIndex),1);render();return;
    }
    if(pricingAction&&pricingAction.dataset.techPricingAction==='save-promos'){
      const normalized=(state.promoCodesDraft||[]).map(item=>({code:String(item.code||'').trim().toUpperCase(),name:String(item.name||'').trim(),active:item.active!==false,prices:Object.fromEntries(Object.entries(item.prices||{}).filter(([,price])=>Number.isFinite(Number(price))&&Number(price)>=0).map(([key,price])=>[key,Number(price)]))}));
      if(normalized.some(item=>!/^[A-Z0-9_-]{2,40}$/.test(item.code)))return toast('Промокод должен содержать 2–40 латинских букв, цифр, дефисов или подчёркиваний');
      if(new Set(normalized.map(item=>item.code)).size!==normalized.length)return toast('Промокоды должны быть уникальными');
      state.promoCodesSaving=true;render();
      try{await savePortal('promoCodes',normalized);onPromoCodesUpdate(normalized);state.promoCodesDraft=null;toast('Промокоды и специальные цены сохранены')}catch(error){toast('Не удалось сохранить промокоды: '+error.message)}finally{state.promoCodesSaving=false;render()}
      return;
    }
    if(pricingAction&&pricingAction.dataset.techPricingAction==='add-category'){
      if(!state.pricingDraft)return;
      const categoryIndex=state.pricingDraft.push({name:'',options:[]})-1;
      state.pricingEditingCategories[categoryIndex]=true;
      state.pricingAddingCategory=categoryIndex;render();
      queueMicrotask(()=>root().querySelector(`[data-pricing-category-name][data-category="${categoryIndex}"]`)?.focus());
      return;
    }
    if(pricingAction&&pricingAction.dataset.techPricingAction==='add'){
      const categoryIndex=Number(pricingAction.dataset.category),category=state.pricingDraft?.[categoryIndex];
      if(category){const optionIndex=category.options.push({name:'',price:0,productionDays:null})-1;state.pricingEditingRows[categoryIndex+':'+optionIndex]=true;state.pricingAddingCategory=categoryIndex;render();queueMicrotask(()=>root().querySelector(`[data-pricing-field="name"][data-category="${categoryIndex}"][data-option="${optionIndex}"]`)?.focus())}
      return;
    }
    if(pricingAction&&pricingAction.dataset.techPricingAction==='remove'){
      const category=state.pricingDraft?.[Number(pricingAction.dataset.category)],index=Number(pricingAction.dataset.option);
      const option=category?.options?.[index];
      if(!category||!option)return;
      if(String(option.name||'').trim()&&!window.confirm(`Удалить услугу «${option.name}»? Она исчезнет из прайса после сохранения.`))return;
      category.options.splice(index,1);
      render();return;
    }
    if(pricingAction&&pricingAction.dataset.techPricingAction==='remove-category'){
      const category=state.pricingDraft?.[Number(pricingAction.dataset.category)];
      if(!category)return;
      const categoryLabel=String(category.name||'').trim()||'без названия';
      const serviceNote=category.options?.length?` Вместе с ним будут удалены услуги: ${category.options.length}.`:' '; 
      if(!window.confirm(`Удалить раздел «${categoryLabel}»?${serviceNote} Изменение вступит в силу после сохранения.`))return;
      state.pricingDraft.splice(Number(pricingAction.dataset.category),1);
      render();return;
    }
    if(pricingAction&&pricingAction.dataset.techPricingAction==='save'){
      const unnamedCategory=state.pricingDraft?.find(category=>!String(category.name||'').trim());
      if(unnamedCategory)return toast('Укажите название нового раздела прайса');
      const unnamed=state.pricingDraft?.flatMap(category=>category.options).find(option=>!String(option.name||'').trim());
      if(unnamed)return toast('Укажите название каждой услуги прайса');
      if(!state.pricingDraft)return;
      state.pricingSaving=true;render();
      try{await savePortal('workCatalog',state.pricingDraft);workCatalog.splice(0,workCatalog.length,...structuredClone(state.pricingDraft));state.pricingDraft=null;state.pricingOrderChanged=false;state.pricingEditingRows={};state.pricingEditingCategories={};toast('Названия услуг, цены и сроки сохранены для кабинета и Telegram-бота')}catch(error){toast('Не удалось сохранить цены и сроки: '+error.message)}finally{state.pricingSaving=false;render()}
      return;
    }
    if(pricingAction&&pricingAction.dataset.techPricingAction==='save-delivery'){
      if(!state.deliverySettingsDraft)return;
      const freeThreshold=Math.max(0,Number(state.deliverySettingsDraft.freeThreshold)||0),fee=Math.max(0,Number(state.deliverySettingsDraft.fee)||0),saved={freeThreshold,fee};
      state.deliverySettingsSaving=true;render();
      try{await savePortal('deliverySettings',saved);onDeliverySettingsUpdate(saved);state.deliverySettingsDraft=null;toast('Условия доставки сохранены для новых заказов')}catch(error){toast('Не удалось сохранить условия доставки: '+error.message)}finally{state.deliverySettingsSaving=false;render()}
      return;
    }
    const scope=event.target.closest('[data-production-scope]');
    if(scope){state.productionScope=scope.dataset.productionScope;render();return}
    const page=event.target.closest('[data-tech-page]');
    if(page){event.preventDefault();state.sidebarGroup='';root().querySelector('#tech-sidebar')?.classList.remove('open');const destination=page.classList.contains('tech-back')&&['production','pulse'].includes(state.detailReturnPage)?state.detailReturnPage:page.dataset.techPage;if(destination==='orders'){state.orderDueFilter='';if(page.dataset.techOverdue)state.filter='Врач не принял 2 дня'}setPage(destination);return}
    const order=event.target.closest('[data-tech-order]');
    if(order){event.preventDefault();state.orderId=order.dataset.techOrder;if(state.page!=='detail')state.detailReturnPage=state.page;setPage('detail')}
  });
  document.addEventListener('keydown',event=>{
    if(!isActive())return;
    if(event.key==='Escape'&&sidebarCollapsed()&&state.sidebarGroup){
      const summary=root().querySelector('.tech-nav-group[open]>summary');
      state.sidebarGroup='';
      root().querySelectorAll('.tech-nav-group[open]').forEach(group=>{group.open=false});
      summary?.focus();event.preventDefault();return;
    }
    if(event.key==='Escape'&&(pricingDrag||pricingCategoryDrag)){clearPricingDrag();return}
    const handle=event.target.closest?.('[data-pricing-drag]');
    if(state.page==='pricing'&&handle&&['ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();const row=handle.closest('[data-pricing-row]');movePricingService(Number(row.dataset.category),Number(row.dataset.option),Number(row.dataset.option)+(event.key==='ArrowUp'?-1:1));return;
    }
    const categoryHandle=event.target.closest?.('[data-pricing-category-drag]');
    if(state.page==='pricing'&&categoryHandle&&['ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();const row=categoryHandle.closest('[data-pricing-category-row]');movePricingCategory(Number(row.dataset.category),Number(row.dataset.category)+(event.key==='ArrowUp'?-1:1));return;
    }

    if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-tech-order-parent]')){event.preventDefault();event.target.click();return}
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('tr[data-tech-order]')){event.preventDefault();event.target.click()}
  });
  document.addEventListener('change',event=>{
    if(!isActive())return;
    if(event.target.matches('[data-task-employee-filter],[data-task-status-filter],[data-task-priority-filter]')){
      if(event.target.matches('[data-task-employee-filter]'))state.taskEmployeeFilter=event.target.value;
      if(event.target.matches('[data-task-status-filter]'))state.taskStatusFilter=event.target.value;
      if(event.target.matches('[data-task-priority-filter]'))state.taskPriorityFilter=event.target.value;
      return;
    }
    if(event.target.matches('[data-pricing-field]')){
      const category=state.pricingDraft?.[Number(event.target.dataset.category)],option=category?.options?.[Number(event.target.dataset.option)];
      if(!option)return;
      if(event.target.dataset.pricingField==='name')option.name=event.target.value;
      if(event.target.dataset.pricingField==='days')option.productionDays=event.target.value===''?null:Number(event.target.value);
      if(event.target.dataset.pricingField==='price')option.price=Math.max(0,Number(event.target.value)||0);
      return;
    }
    if(event.target.matches('[data-delivery-setting]')){
      if(!state.deliverySettingsDraft)state.deliverySettingsDraft=structuredClone(deliverySettings()||{freeThreshold:4000,fee:500});
      state.deliverySettingsDraft[event.target.dataset.deliverySetting]=Math.max(0,Number(event.target.value)||0);
      return;
    }
    if(event.target.matches('[data-promo-field]')){
      const promo=state.promoCodesDraft?.[Number(event.target.dataset.promoIndex)];
      if(!promo)return;
      const field=event.target.dataset.promoField;promo[field]=field==='active'?event.target.checked:event.target.value;
      return;
    }
    if(event.target.matches('[data-promo-price]')){
      const promo=state.promoCodesDraft?.[Number(event.target.dataset.promoIndex)];
      if(!promo)return;
      promo.prices=promo.prices||{};
      const key=event.target.dataset.promoKey,value=event.target.value.trim();
      if(value==='')delete promo.prices[key];else promo.prices[key]=Math.max(0,Number(value)||0);
      return;
    }
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
    if(event.target.matches('[data-tech-order-employee-filter]')){activeOrderFilters().orderEmployeeFilter=event.target.value;render();return}
    if(event.target.matches('[data-tech-order-work-filter]')){activeOrderFilters().orderWorkFilter=event.target.value;render();return}
    if(event.target.matches('[data-tech-order-doctor-filter]')){activeOrderFilters().orderDoctorFilter=event.target.value;render();return}
    if(event.target.matches('[data-tech-order-clinic-filter]')){activeOrderFilters().orderClinicFilter=event.target.value;render();return}
    if(event.target.matches('[data-tech-order-month-filter]')){activeOrderFilters().orderMonthFilter=event.target.value;render();return}
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
      if(role==='frame'&&name&&!current.milling?.sentAt)return toast('Сначала подтвердите отправку заказа на фрезеровку');
      if(role==='painter'&&name&&!(current.stage==='Изготовление'&&current.manufacturingStatus===manufacturingStatuses[1]||['Контроль качества','Работа принята','В доставке','Принято доктором'].includes(current.stage)))return toast('Сначала завершите работу CAM оператора и его ОТК');
      const reassignedFrame=role==='frame'&&name!==current.frameTechnicianKey;
      const frameReset=reassignedFrame?{frameTechnicianStatus:'',technicianStatus:'',qualityRequest:null,workerAcceptances:Object.fromEntries(Object.entries(current.workerAcceptances||{}).filter(([,item])=>item?.role!=='frame'))}:{};
      const change=role==='cad'?{cadOperator:name,assignee:current.frameTechnicianKey||current.painterKey||name||''}:role==='preprod'?{preprodTechnician:name,assignee:name||current.cadOperatorKey||''}:role==='frame'?{...frameReset,frameTechnician:name,technician:name,assignee:name||current.painterKey||current.cadOperatorKey||''}:{painter:name,ceramicist:name,assignee:current.frameTechnicianKey||name||current.cadOperatorKey||''};
      saveOrder(id,change);
    }
  });

  document.addEventListener('submit',async event=>{
    if(!isActive()||event.target.id!=='tech-order-edit-form')return;
    event.preventDefault();
    const form=event.target,date=form.elements.namedItem('date').value.trim(),valid=new Set([11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28,31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48]),upper=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],lower=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
    if(!/^\d{2}\.\d{2}\.\d{4}$/.test(date))return toast('Укажите срок в формате дд.мм.гггг');
    const variants=[...form.querySelectorAll('[data-edit-variant]')].map(card=>{const service=String(card.querySelector('[data-edit-service]')?.value||'').split('|'),mode=card.querySelector('[data-edit-mode]')?.value||'Одиночка',jaw=card.querySelector('[data-edit-jaw]')?.value||'';let teeth=[...card.querySelectorAll('[data-edit-tooth]:checked')].map(input=>Number(input.value)).filter(tooth=>valid.has(tooth));if(mode==='Челюсть')teeth=jaw==='upper'?[...upper]:jaw==='lower'?[...lower]:[];teeth=[...new Set(teeth)].sort((a,b)=>a-b);const variant={work:service[0]||'',workOption:service[1]||'',toothMode:mode,bridgeRanges:mode==='Мост'?[teeth]:[],selectedTeeth:teeth};if(isSurgicalSocket(variant))variant.units=Math.max(1,Number(card.dataset.units)||1);return variant});
    if(variants.some(variant=>!variant.work||!variant.workOption))return toast('Выберите услугу для каждой позиции');
    if(variants.some(variant=>!variant.selectedTeeth.length))return toast('Выберите зубы для каждой услуги');
    const amounts=variants.map(editVariantPrice),total=amounts.every(Number.isFinite)?amounts.reduce((sum,amount)=>sum+amount,0):null,teeth=[...new Set(variants.flatMap(variant=>variant.selectedTeeth))].sort((a,b)=>a-b),quantity=variants.reduce((sum,variant)=>sum+(surgicalVariantUnits(variant)??Math.max(1,variant.selectedTeeth.length)),0),first=variants[0],shade=form.elements.namedItem('shade').value.trim();
    await saveOrderRecord(state.editOrderId,{patient:form.elements.namedItem('patient').value.trim(),birth:form.elements.namedItem('birth').value,toothMode:variants.length>1?'Несколько услуг':first.toothMode,bridgeRanges:variants.flatMap(variant=>variant.bridgeRanges||[]),work:variants.length>1?`Несколько услуг (${variants.length})`:first.work,material:variants.length>1?variants.map(variant=>variant.workOption).join(' · '):first.workOption,date,sum:total===null?form.elements.namedItem('sum')?.value.trim()||'Стоимость уточняется':rubles(total),quantity,teeth,shade,comment:form.elements.namedItem('comment').value.trim(),variants});
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
    if(!isActive()||event.target.id!=='pulse-payment-form')return;
    event.preventDefault();
    const form=event.target,id=form.dataset.orderId,order=orderById(id);
    if(!order)return toast('Заказ не найден');
    const total=Number(String(order.sum||'').replace(/[^0-9]/g,''))||0;
    const paidAmount=Number(form.elements.namedItem('paidAmount').value);
    if(!Number.isInteger(paidAmount)||paidAmount<0||paidAmount>total)return toast('Укажите оплаченную сумму от 0 до суммы заказа');
    const paymentDueDate=form.elements.namedItem('paymentDueDate').value;
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      if(await saveOrderRecord(id,{paymentDueDate,paidAmount,paidAt:total>0&&paidAmount===total?(order.paidAt||new Date().toISOString()):'',paymentStatus:total>0&&paidAmount===total?'Оплачено':paidAmount>0?'Частично оплачено':'Не оплачено'}))toast('Данные оплаты сохранены');
    }catch(error){toast('Не удалось сохранить оплату: '+error.message)}
    finally{if(button.isConnected)button.disabled=false}
  });
  document.addEventListener('submit',async event=>{
    if(!isActive()||event.target.id!=='quality-rework-form')return;
    event.preventDefault();
    const id=state.qualityReworkOrderId,order=id&&orderById(id),form=event.target;
    const category=form.elements.namedItem('category').value.trim(),reason=form.elements.namedItem('reason').value.trim();
    if(!category||reason.length<8)return toast('Укажите категорию и конкретное исправление (не менее 8 символов)');
    const change=qualityReworkChange(order,category,reason,new Date().toISOString());
    if(!change)return toast('Заказ больше не ожидает этого решения ОТК. Обновите страницу.');
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const next={...overrides,[id]:{...overrides[id],...change}};
      await savePortal('orderOverrides',next);overrides=next;
      localStorage.setItem('create-dental-tech-orders',JSON.stringify(overrides));
      state.qualityReworkOrderId=null;render();toast('Работа возвращена на доработку. Причина сохранена.');
    }catch(error){button.disabled=false;toast('Не удалось вернуть работу: '+error.message)}
  });
  document.addEventListener('submit',async event=>{
    if(!isActive()||event.target.id!=='tech-task-form')return;
    event.preventDefault();
    if(taskSaving)return;
    const form=event.target,editing=state.taskEditId?tasks().find(item=>item.id===state.taskEditId):null,assigneeId=form.elements.namedItem('assigneeId').value,employee=team.find(item=>item.id===assigneeId&&item.status==='active');
    const comment=form.elements.namedItem('comment').value.trim(),priority=form.elements.namedItem('priority').value,dueDate=form.elements.namedItem('dueDate').value;
    const title=(comment.split(/\r?\n/).find(Boolean)||'Задача').trim().slice(0,200);
    const errorMessage=form.querySelector('[data-task-create-error]');
    const showError=message=>{errorMessage.textContent=message;errorMessage.hidden=false};
    if(!employee||!comment)return showError('Выберите исполнителя и добавьте комментарий');
    const stamp=new Date().toISOString(),task=editing?{...editing,title,description:comment,assigneeId:employee.id,assigneeName:employee.name,priority,dueDate,updatedAt:stamp}:{id:`task-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,title,description:comment,assigneeId:employee.id,assigneeName:employee.name,priority,status:'backlog',dueDate,createdBy:chiefProfile().displayName||'Главный техник',createdAt:stamp,updatedAt:stamp,completedAt:''};
    const next=editing?tasks().map(item=>item.id===editing.id?task:item):[task,...tasks()];
    const button=form.querySelector('button[type="submit"]');
    taskSaving=true;button.disabled=true;button.textContent='Сохранение…';errorMessage.hidden=true;
    try{await savePortal('tasks',next);tasks().splice(0,tasks().length,...next);state.taskCreateOpen=false;state.taskEditId=null;toast(editing?'Карточка обновлена':'Карточка добавлена')}
    catch(error){showError('Не удалось добавить карточку: '+error.message)}
    finally{taskSaving=false;if(button.isConnected){button.disabled=false;button.textContent=editing?'Сохранить изменения':'Добавить карточку'}}
  });
  document.addEventListener('submit',async event=>{
    if(!isActive()||event.target.id!=='tech-employee-form')return;
    event.preventDefault();
    const form=event.target;
    const values={};
    for(const name of ['name','specialty','phone','email'])values[name]=form.elements.namedItem(name).value.trim();
    const rawLimit=form.elements.namedItem('wipLimit').value.trim();
    if(rawLimit&&(!Number.isInteger(Number(rawLimit))||Number(rawLimit)<1||Number(rawLimit)>100))return toast('Лимит должен быть от 1 до 100 заказов');
    values.wipLimit=rawLimit?Number(rawLimit):null;
    values.rank=Number(form.elements.namedItem('rank').value);
    if(!Number.isInteger(values.rank)||values.rank<1||values.rank>5)return toast('Выберите ранг от 1 до 5');
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
    if(event.target.id==='task-search'&&state.page==='tasks'){
      state.taskSearch=event.target.value;
      const board=root().querySelector('.task-board');
      if(board)board.outerHTML=taskBoardMarkup(filteredTasks(tasks()));
      return;
    }
    if(event.target.id==='production-search'&&state.page==='production'){
      const position=event.target.selectionStart;state.productionSearch=event.target.value;render();
      const input=root().querySelector('#production-search');input?.focus();if(input&&position!==null)input.setSelectionRange(position,position);
      return;
    }
    if(event.target.matches('[data-pricing-category-name]')){
      const category=state.pricingDraft?.[Number(event.target.dataset.category)];
      if(category)category.name=event.target.value;
      return;
    }
    if(event.target.matches('[data-pricing-field]')){
      const category=state.pricingDraft?.[Number(event.target.dataset.category)],option=category?.options?.[Number(event.target.dataset.option)];
      if(option&&event.target.dataset.pricingField==='name')option.name=event.target.value;
      if(option&&event.target.dataset.pricingField==='price')option.price=Math.max(0,Number(event.target.value)||0);
      return;
    }
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
    if(event.target.id==='tech-search'&&['intake','quality'].includes(state.page)){
      const position=event.target.selectionStart;state.qualitySearch=event.target.value;render();
      const input=root().querySelector('#tech-search');input?.focus();if(input&&position!==null)input.setSelectionRange(position,position);
      return;
    }
    if(event.target.id==='tech-request-search'&&state.page==='requests'){
      const position=event.target.selectionStart;state.requestSearch=event.target.value;render();
      const input=root().querySelector('#tech-request-search');input?.focus();if(input&&position!==null)input.setSelectionRange(position,position);
      return;
    }
    if(event.target.id!=='tech-search')return;
    state.search=event.target.value;
    if(state.page==='orders'){const position=event.target.selectionStart;render();const input=root().querySelector('#tech-search');input?.focus();if(input&&position!==null)input.setSelectionRange(position,position);return}
    root().querySelectorAll('.tech-order-row').forEach(row=>{row.hidden=!row.textContent.toLowerCase().includes(state.search.toLowerCase())});
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
  return {render,refreshMessages,refreshClientRequests,refreshProduction};
}
