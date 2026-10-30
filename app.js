import {workProgress} from './lab-orders.js';
import {productionFlowLabel} from './production-routes.js';
import {createClinicMobileUI,clinicSections} from './assets/clinic-mobile-ui.js?v=clinic-info-4';
import { seedOrders } from './seed-orders.js?v=mobile-fast-1';
import {portalToken,setPortalToken,clearPortalToken,loadPortal,loadPortalSection,savePortal,authRequest,uploadOrderFile,loadOrderFiles,loadOrderFilePreview,requestOrderRework,uploadClinicMessageFile,downloadClinicMessageFile,decideCadReview,loadCadPreviewSource} from './portal-client.js?v=order-detail-layout-2';
import {routeFromPath,pathFor,navigate} from './routes.js?v=order-routing-1';
import {notificationCenterMarkup,refreshNotificationCenter,markNotificationCenterRead,toggleNotificationCenter,closeNotificationCenter,notificationCenterState} from './notification-center.js?v=flow-integrity-1';
import {workCatalog,rubles,productionDaysForOrder,earliestDueDateForOrder,isWorkingDay,isoDateLocal,estimateWork,priceUnitsForSelection,camMethodForSelection} from './work-catalog.js?v=deadline-batch-1';
import {themeToggleMarkup,languageSwitcherMarkup} from './theme.js?v=light-only-2';
import {orderWorkTypes,orderWorkLabel,orderEventSummary,orderExecutionLabel,orderConstructionLabel,orderVariantExecutionLabel,orderVariantConstructionLabel,displayOrderId,resolveOrderId} from './order-list-utils.js?v=order-fields-5';
import {productionStages,compactStageLabel} from './production-stages.js?v=perf-split-2';
import {SURGICAL_TEMPLATE_CATEGORY,SURGICAL_SOCKET_OPTION,SURGICAL_SOCKETS_PER_JAW,adjustSurgicalSockets,isSurgicalTemplate,isSurgicalSocket,hasSurgicalJaw,maxSurgicalSockets,surgicalVariantUnits,groupSurgicalSockets} from '/assets/surgical-template-utils.js?v=surgical-sockets-3';
import './location-assist.js?v=country-cities-1';

const $ = (selector) => document.querySelector(selector);
const icons = {
  home:'<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-7h6v7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  orders:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M8.5 10h7M8.5 14h7M8.5 18h4"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  pulse:'<path d="M2 12h4l2.4-5 3.3 10 2.5-5H22"/>',
  file:'<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v6h5M9 13h6M9 17h6"/>',
  message:'<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3a2 2 0 0 1-1-2V6a2 2 0 0 1 2-2z"/><path d="M8 9h8M8 13h5"/>',
  book:'<path d="M12 6c-2.4-1.5-5.4-1.7-9-.8v14c3.6-.9 6.6-.7 9 .8 2.4-1.5 5.4-1.7 9-.8v-14c-3.6-.9-6.6-.7-9 .8zM12 6v14"/>',
  clinic:'<g stroke-width="1.5"><path d="M5 5V2h14v3M8 6H2v3h6M16 6h6v3h-6M3 9v13h18V9"/><circle cx="12" cy="7.5" r="4.3"/><path d="M12 5.8v3.4M10.3 7.5h3.4M9 22v-6h6v6M12 16v6M5.5 13H7M5.5 16H7M5.5 19H7M17 13h1.5M17 16h1.5M17 19h1.5"/></g>',
  crm:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  factory:'<path d="M3 21V9l6 3V8l6 4V5h6v16"/><path d="M3 21h18M7 17h.01M11 17h.01M16 17h.01M20 17h.01"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  shieldCheck:'<path d="M12 3 20 6v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
  tag:'<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V4h9l8.6 8.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="8.5" r="1"/>',
  profile:'<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="9" r="3"/><path d="M8 17c1.2-1.8 2.5-2.5 4-2.5s2.8.7 4 2.5"/>',
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
  ,wallet:'<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5z"/><path d="M4 8h15M16 13h5"/><circle cx="16" cy="13" r=".8" fill="currentColor" stroke="none"/>',
  edit:'<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="m14.5 7.5 2 2"/>'
  ,sliders:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>'
};
const icon = (name,size=18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.home}</svg>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayActor = (event) => event?.actorRole === 'clinic' ? 'Вы' : 'Create Dental Team';
const assets = '/assets/';
const logo = `${assets}create-dental-logo.png`;
const sidebarMark = '<span class="sidebar-mark" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9c3-3.2 7.4-3.5 12-1 4.6-2.5 9-2.2 12 1 2.6 2.8 1.6 8.2.6 12.9-.9 4.5-2 10.6-4.6 15-.9 1.5-3.1 1.4-4-.2l-3.9-8.1c-.8-1.6-3.3-1.6-4.1 0l-3.9 8.1c-.9 1.6-3.1 1.7-4 .2-2.6-4.4-3.7-10.5-4.6-15C10.4 17.2 9.4 11.8 12 9Z"/><path d="M18 10.5c.3 3.1.5 5.6 1.6 7.2M30 10.5c-.3 3.1-.5 5.6-1.6 7.2"/></svg></span>';
const orders = seedOrders.map(order=>({...order}));
const nav = [['home','Главная','home'],['new','Новый заказ','plus'],['orders','Мои заказы','orders'],['clinic','Моя клиника','clinic']];
const steps = ['Пациент','Зубы и работа','Дополнительно','Подтверждение'];
const oldLink=new URLSearchParams(location.search);
if(oldLink.has('role')||oldLink.has('page')){
  const oldRole=['technician','worker'].includes(oldLink.get('role'))?oldLink.get('role'):'clinic';
  navigate(pathFor(oldRole,oldLink.get('page')|| (oldRole==='clinic'?'home':'overview'),oldLink.get('order')),{replace:true});
}
const initialRoute=routeFromPath(location.pathname);
if(location.pathname.split('/').filter(Boolean).length>0&&['ru','am','uz','kz','uea','uae'].includes(location.pathname.split('/').filter(Boolean)[0])){
  const canonical=initialRoute.role?pathFor(initialRoute.role,initialRoute.page,initialRoute.orderId):pathFor(null,initialRoute.mode);
  navigate(canonical,{replace:true});
}
const state = {role:initialRoute.role||'clinic',page:initialRoute.role==='clinic'?initialRoute.page:'home',step:0,filter:'Все',query:'',dueDateFilter:'',orderMonthFilter:'',orderWorkFilter:'',orderStatusFilter:'',orderDoctorFilter:'',orderFilterOpen:false,sortKey:'',sortDirection:'asc',orderId:initialRoute.orderId||'',detailTab:'Обзор',fileTab:'Все файлы',clinicTab:'Основная информация',clinicMobileSection:'',clinicDrafts:{},selectedTeeth:[],bridgeRanges:[],bridgeStart:null,dentition:'Постоянные зубы',toothMode:'Одиночка',work:'',workOption:'',currentVariantBase:null,orderVariants:[],cart:[],messages:[],chatText:'',chatAttachment:null,chatStatus:'Служба поддержки онлайн · отвечаем 10:00–21:00 МСК',calendarMonth:new Date(new Date().getFullYear(),new Date().getMonth(),1),calendarDay:new Date().getDate(),datePickerOpen:false,datePickerField:'due',datePickerMonth:'',datePickerYearOpen:false,uploaded:[],orderFiles:[],orderFolderUrl:'',filesFor:'',orderUpload:null,reworkOrderId:'',cadReturnOrderId:'',cadReturnComment:'',cadReturnAttachments:[],cadPreview:null,clientRequest:null,form:{doctorId:'',surname:'',initials:'',birth:'',orderType:'',construction:'',material:'',quantity:'1',due:new Date(Date.now()+14*86400000).toISOString().slice(0,10),shade:'A1',comment:''},toast:''};
let cadPreviewRequest=0;
let messagesRequestController=null;
let orderCreationInFlight=false;
let portalHistory=[];
let portalClientRequests=[];
let portalTasks=[];
let portalPromoCodes=[];
const defaultDeliverySettings={freeThreshold:4000,fee:500};
let deliverySettings={...defaultDeliverySettings};
let activePromoCode='';
let promoPrices={};
const selectedWork=()=>workCatalog.find(item=>item.name===state.work);
const workOptionName=option=>typeof option==='string'?option:option.name;
const selectedWorkOption=()=>selectedWork()?.options.find(option=>workOptionName(option)===state.workOption);
const jawSplitCategories=new Set(['Каппы','Ложки прикуса','Сплинты','Хирургические шаблоны']);
const prostheticNoTeethOptions=new Set(['Титановое основание Geo Medi','Титановое основание Аналог']);
// These services are priced and selected by whole jaw. Keep the jaw picker
// active as soon as the category is chosen, even before the specific service
// option is selected, so choosing teeth and choosing a service work in either
// order without exposing individual-tooth selection.
const isJawSplitSelection=(work,option)=>jawSplitCategories.has(work)||workCatalog.find(item=>item.name===work)?.pricingUnit==='jaw';
const isNoTeethSelection=(work,option)=>work==='Протетика'&&prostheticNoTeethOptions.has(option);
const currentUsesJawSplit=()=>isJawSplitSelection(state.work,state.workOption);
const currentNeedsNoTeeth=()=>isNoTeethSelection(state.work,state.workOption);
const variantUsesShade=variant=>String(variant?.work||'')==='Реставрации';
const shadeVariants=()=>allVariants().filter(variantUsesShade);
const variantUsesJawSplit=variant=>isJawSplitSelection(variant?.work,variant?.workOption);
const variantNeedsNoTeeth=variant=>isNoTeethSelection(variant?.work,variant?.workOption);
const variantJawCount=variant=>variantUsesJawSplit(variant)?[upperTeeth.every(tooth=>variant.selectedTeeth?.includes(tooth)),lowerTeeth.every(tooth=>variant.selectedTeeth?.includes(tooth))].filter(Boolean).length:0;
const variantUnits=variant=>surgicalVariantUnits(variant)??(variantNeedsNoTeeth(variant)?1:priceUnitsForSelection(variant?.work,variant?.selectedTeeth));
const orderServiceCount=variants=>groupSurgicalSockets(variants).length;
const orderUnits=()=>variantUnits(currentVariant());
const promoPriceFor=(work,option)=>{const value=promoPrices?.[`${work}|||${option}`];return Number.isFinite(Number(value))?Number(value):null};
const estimateWithPromo=variant=>{const base=estimateWork({work:variant.work,option:variant.workOption,teeth:variant.selectedTeeth,units:surgicalVariantUnits(variant)}),special=promoPriceFor(variant.work,variant.workOption),amount=Number.isFinite(special)?special*base.units:base.amount;return {...base,amount,baseAmount:base.amount,promoPrice:special}};
const orderEstimate = () => estimateWithPromo(currentVariant()).amount;
const orderEstimateText = () => orderEstimate()===null?'Стоимость уточняется':rubles(orderEstimate());
const currentVariant = () => ({toothMode:state.toothMode,bridgeRanges:state.bridgeRanges.map(range=>[...range]),selectedTeeth:[...state.selectedTeeth],work:state.work,workOption:state.workOption,shade:variantUsesShade({work:state.work})?state.form.shade:''});
const variantSignature = variant => JSON.stringify({work:variant?.work||'',workOption:variant?.workOption||'',toothMode:variant?.toothMode||'',selectedTeeth:[...(variant?.selectedTeeth||[])].sort((a,b)=>a-b),bridgeRanges:(variant?.bridgeRanges||[]).map(range=>[...range]).sort((a,b)=>(a[0]||0)-(b[0]||0))});
const currentVariantSaved = () => {const current=variantSignature(currentVariant());return Boolean(current)&&Boolean(state.orderVariants?.some(variant=>variantSignature(variant)===current))};
const cloneVariant = variant => ({...variant,bridgeRanges:(variant?.bridgeRanges||[]).map(range=>[...range]),selectedTeeth:[...(variant?.selectedTeeth||[])]});
const variantIsComplete = variant => Boolean(variant?.work&&(!workCatalog.find(item=>item.name===variant.work)?.options.length||variant.workOption)&&(variantNeedsNoTeeth(variant)||(variantUsesJawSplit(variant)?variantJawCount(variant)>0:variant?.selectedTeeth?.length)));
const variantEstimate = variant => estimateWithPromo(variant).amount;
const promoPriceMarkup=(standard,special)=>{if(!Number.isFinite(special))return 'Стоимость уточняется';if(Number.isFinite(standard)&&Number(special)!==Number(standard))return `<span class="promo-price"><del>${rubles(standard)}</del><strong>${rubles(special)}</strong></span>`;return rubles(special)};
const standardVariantEstimate=variant=>estimateWithPromo(variant).baseAmount;
const serviceSubtotalStandardEstimate=()=>{const variants=allVariants().filter(variantIsComplete),values=variants.map(standardVariantEstimate);return variants.length&&values.every(Number.isFinite)?values.reduce((sum,value)=>sum+value,0):null};
const promoSummaryMarkup=()=>{const standard=serviceSubtotalStandardEstimate(),special=serviceSubtotalEstimate();return activePromoCode&&Number.isFinite(standard)&&Number.isFinite(special)&&standard!==special?`<div class="order-promo-row"><span>Цена по промокоду ${escapeHtml(activePromoCode)}</span><strong>${promoPriceMarkup(standard,special)}</strong></div>`:''};
const currentSurgicalGuideIncluded=()=>{const current=currentVariant(),jaws=['upper','lower'].filter(jaw=>hasSurgicalJaw(current,jaw));return isSurgicalTemplate(current)&&jaws.length>0&&jaws.every(jaw=>(state.orderVariants||[]).some(variant=>isSurgicalTemplate(variant)&&hasSurgicalJaw(variant,jaw)))};
// The selected service is a draft of one cart line, not another copy of it.
const currentVariantBaseIndex = () => {
  const base=state.currentVariantBase,current=currentVariant();
  if(!base||base.work!==current.work||base.workOption!==current.workOption)return -1;
  return (state.orderVariants||[]).findIndex(variant=>variantSignature(variant)===variantSignature(base));
};
const allVariants = () => {
  const saved=state.orderVariants||[],current=currentVariant(),index=currentVariantBaseIndex();
  if(index>=0&&variantIsComplete(current))return saved.map((variant,i)=>i===index?current:variant);
  return [...saved,...(currentSurgicalGuideIncluded()||currentVariantSaved()?[]:[current])];
};
const serviceSubtotalEstimate = () => {const variants=allVariants().filter(variantIsComplete),values=variants.map(variantEstimate);return variants.length&&values.every(Number.isFinite)?values.reduce((sum,value)=>sum+value,0):null};
const deliveryFeeForSubtotal = subtotal => {const threshold=Number(deliverySettings.freeThreshold),fee=Number(deliverySettings.fee);return Number.isFinite(subtotal)?(subtotal<(Number.isFinite(threshold)&&threshold>=0?threshold:4000)?(Number.isFinite(fee)&&fee>=0?fee:500):0):null};
const orderDeliveryFee = () => deliveryFeeForSubtotal(serviceSubtotalEstimate());
const totalOrderEstimate = () => {const subtotal=serviceSubtotalEstimate(),delivery=deliveryFeeForSubtotal(subtotal);return Number.isFinite(subtotal)&&Number.isFinite(delivery)?subtotal+delivery:null};
const serviceSubtotalText = () => serviceSubtotalEstimate()===null?'Стоимость уточняется':rubles(serviceSubtotalEstimate());
const deliveryFeeText = () => orderDeliveryFee()===null?'Стоимость уточняется':rubles(orderDeliveryFee());
const totalOrderEstimateText = () => totalOrderEstimate()===null?'Стоимость уточняется':rubles(totalOrderEstimate());
const currentProductionOrder=()=>({variants:allVariants().filter(variantIsComplete)});
const currentProductionDays=()=>productionDaysForOrder(currentProductionOrder());
const currentEarliestDueDate=()=>earliestDueDateForOrder(currentProductionOrder(),new Date());
const currentEarliestDueIso=()=>isoDateLocal(currentEarliestDueDate());
const displayIsoDate=value=>{const date=dateValueParts(value);return date?`${String(date.getDate()).padStart(2,'0')}.${String(date.getMonth()+1).padStart(2,'0')}.${date.getFullYear()}`:''};
const upperTeeth=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const vitaShadeOptions=['A1','A2','A3','A3.5','A4','B1','B2','B3','B4','C1','C2','C3','C4','D2','D3','D4','Не требуется'];
const lowerTeeth=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
const statusClass = s => ['В работе','Работа принята','Принято','Принято доктором','Принято врачом','Завершен'].includes(s)?'green':s==='Новый'?'blue':'orange';
const displayClientStatus = status => ({'На согласовании':'Согласование врача','В пути к вам':'Доставка','Принято':'Готово'}[status]||status);
const orderDateLabel = value => value || 'Без фиксированного срока';
const badge = s => `<span class="badge ${statusClass(s)}">${s}</span>`;
const button = (label,action,kind='primary',extra='') => `<button class="btn ${kind}" data-action="${action}" ${extra}>${label}</button>`;
const sidebarCollapsed = () => { try { return localStorage.getItem('create-dental-sidebar-collapsed') === '1'; } catch { return false; } };
const sidebarCollapseMarkup = () => `<button class="sidebar-collapse-toggle" data-action="sidebar-toggle" aria-label="${sidebarCollapsed()?'Развернуть':'Свернуть'} боковое меню" title="${sidebarCollapsed()?'Развернуть':'Свернуть'} боковое меню">${icon('chevron',16)}</button>`;
function sidebar(){return `<aside class="sidebar ${sidebarCollapsed()?'sidebar-collapsed':''}" id="sidebar"><a class="brand brand-home" href="${pathFor('clinic','home')}" data-page="home" aria-label="На главную"><img class="portal-logo" src="${logo}" alt="Create Dental">${sidebarMark}</a>${sidebarCollapseMarkup()}<div class="tech-side-label">КАБИНЕТ КЛИНИКИ</div><nav class="sidebar-nav">${nav.map(([id,label,ico])=>`<a class="nav-link ${state.page===id||(state.page==='detail'&&id==='orders')?'active':''}" href="${pathFor('clinic',id)}" data-page="${id}" data-sidebar-label="${label}" title="${label}">${icon(ico,20)}<span>${label}</span></a>`).join('')}</nav><a class="help-box" href="${pathFor('clinic','messages')}" data-page="messages">${icon('message',20)}<span><strong>Нужна помощь?</strong><small>Напишите нам</small></span></a><button type="button" class="mobile-sidebar-logout" data-auth-logout>↪ <span>Выйти из кабинета</span></button></aside>`}
function mobileBottomNav(){const items=[['home','Главная','home'],['orders','Заказы','orders'],['new','Создать','plus'],['messages','Сообщения','message']],moreActive=!['home','orders','new','messages','detail'].includes(state.page);return `<nav class="mobile-bottom-nav" aria-label="Основная навигация">${items.map(([page,label,ico])=>`<a class="mobile-bottom-item ${state.page===page||(state.page==='detail'&&page==='orders')?'active':''}" href="${pathFor('clinic',page)}" data-page="${page}" aria-label="${page==='new'?'Создать новый заказ':label}" ${state.page===page||(state.page==='detail'&&page==='orders')?'aria-current="page"':''}>${icon(ico,20)}<span>${label}</span></a>`).join('')}<button type="button" class="mobile-bottom-item ${moreActive?'active':''}" data-action="menu" aria-label="Ещё разделы" ${moreActive?'aria-current="page"':''}>${icon('more',20)}<span>Ещё</span></button></nav>`}
function header(){const clinic=clinicRecord();return `<header class="topbar"><button class="mobile-menu" data-action="menu" aria-label="Открыть меню">☰</button><div class="topbar-spacer"></div>${languageSwitcherMarkup()}${themeToggleMarkup()}<button class="role-toggle" data-auth-logout>Выйти</button><span class="topbar-clinic-name">${escapeHtml(clinic?.name||'Клиника')}</span>${notificationCenterMarkup()}<a class="profile" href="${pathFor('clinic','clinic')}" data-page="clinic"><span class="avatar">${clinic?.logo?`<img src="${escapeHtml(clinic.logo)}" alt="Логотип ${escapeHtml(clinic.name||'клиники')}">`:'К'}</span><span><strong>${escapeHtml(clinic?.contact||clinic?.name||'Клиника')}</strong><small>Стоматологическая клиника</small></span>${icon('chevron',13)}</a></header>`}
const clinicLocaleOptions=['ru','am','uz','kk','ar'];
function clinicIntlLocale(){const locale=(()=>{try{return localStorage.getItem('create-dental-locale')||'ru'}catch{return 'ru'}})();return ({ru:'ru-RU',am:'hy-AM',uz:'uz-UZ',kk:'kk-KZ',ar:'ar-AE'})[locale]||'ru-RU'}
const clinicTranslations={
'КАБИНЕТ КЛИНИКИ':['ԿԼԻՆԻԿԱՅԻ ԱՆՁՆԱԿԱՆ ԷՋ','KLINIKA KABINETI','КЛИНИКА КАБИНЕТІ','حساب العيادة'],
'Главная':['Գլխավոր','Bosh sahifa','Басты бет','الرئيسية'],
'Новый заказ':['Նոր պատվեր','Yangi buyurtma','Жаңа тапсырыс','طلب جديد'],
'Мои заказы':['Իմ պատվերները','Buyurtmalarim','Менің тапсырыстарым','طلباتي'],
'Сообщения':['Հաղորդագրություններ','Xabarlar','Хабарламалар','الرسائل'],
'Моя клиника':['Իմ կլինիկան','Mening klinikam','Менің клиникам','عيادتي'],
'Нужна помощь?':['Օգնությո՞ւն է պետք','Yordam kerakmi?','Көмек керек пе?','هل تحتاج إلى مساعدة؟'],
'Напишите нам':['Գրեք մեզ','Bizga yozing','Бізге жазыңыз','راسلنا'],
'Выйти':['Ելք','Chiqish','Шығу','تسجيل الخروج'],
'Стоматологическая клиника':['Ատամնաբուժական կլինիկա','Stomatologiya klinikasi','Стоматологиялық клиника','عيادة أسنان'],
'Заказы не найдены':['Պատվերներ չեն գտնվել','Buyurtmalar topilmadi','Тапсырыстар табылмады','لم يتم العثور على طلبات'],
'Календарь сроков':['Վերջնաժամկետների օրացույց','Muddatlar taqvimi','Мерзімдер күнтізбесі','تقويم المواعيد النهائية'],
'Все':['Բոլորը','Barchasi','Барлығы','الكل'],
'Все заказы':['Բոլոր պատվերները','Barcha buyurtmalar','Барлық тапсырыс','كل الطلبات'],
'В этот день нет сдачи':['Այս օրը հանձնում չկա','Bu kunda topshirish yo‘q','Бұл күні тапсыру жоқ','لا يوجد تسليم في هذا اليوم'],
'Выберите дату':['Ընտրեք ամսաթիվը','Sanani tanlang','Күнді таңдаңыз','اختر تاريخًا'],
'Сдачи на {…}':['Հանձնումներ՝ {…}','Topshirish sanasi: {…}','Тапсыру күні: {…}','التسليم في {…}'],
'Последние сообщения':['Վերջին հաղորդագրությունները','So‘nggi xabarlar','Соңғы хабарламалар','أحدث الرسائل'],
'Сообщений пока нет.':['Հաղորդագրություններ դեռ չկան։','Hozircha xabarlar yo‘q.','Әзірге хабарламалар жоқ.','لا توجد رسائل حتى الآن.'],
'Написать в поддержку →':['Գրել աջակցման ծառայությանը →','Yordam xizmatiga yozish →','Қолдау қызметіне жазу →','مراسلة الدعم ←'],
'Создать новый заказ':['Ստեղծել նոր պատվեր','Yangi buyurtma yaratish','Жаңа тапсырыс жасау','إنشاء طلب جديد'],
'Создавайте заказы, отслеживайте статус и получайте готовые работы в срок.':['Ստեղծեք պատվերներ, հետևեք դրանց ընթացքին և ստացեք պատրաստի աշխատանքները ժամանակին։','Buyurtma yarating, holatini kuzating va tayyor ishlarni o‘z vaqtida oling.','Тапсырыс беріп, мәртебесін бақылаңыз және дайын жұмысты уақытында алыңыз.','أنشئ الطلبات وتابع حالتها واستلم الأعمال الجاهزة في موعدها.'],
'Активных заказов':['Ակտիվ պատվերներ','Faol buyurtmalar','Белсенді тапсырыстар','طلبات نشطة'],
'CAD на согласовании у врача':['CAD-ը բժշկի հաստատմանն է սպասում','CAD shifokor tasdig‘ida','CAD дәрігердің келісуінде','CAD بانتظار موافقة الطبيب'],
'В работе':['Ընթացքում','Jarayonda','Жұмыста','قيد التنفيذ'],
'После приемки':['Ընդունումից հետո','Qabul qilingandan so‘ng','Қабылданғаннан кейін','بعد الاستلام'],
'Качество в каждой детали':['Որակ՝ յուրաքանչյուր մանրուքում','Har bir detalda sifat','Әр бөлшектегі сапа','الجودة في كل تفصيل'],
'Современные технологии.':['Ժամանակակից տեխնոլոգիաներ։','Zamonaviy texnologiyalar.','Заманауи технологиялар.','تقنيات حديثة.'],
'Индивидуальный подход.':['Անհատական մոտեցում։','Individual yondashuv.','Жеке тәсіл.','نهج فردي.'],
'Надежные сроки.':['Հուսալի ժամկետներ։','Ishonchli muddatlar.','Сенімді мерзімдер.','مواعيد موثوقة.'],
'Тип работы':['Աշխատանքի տեսակ','Ish turi','Жұмыс түрі','نوع العمل'],
'Статус':['Կարգավիճակ','Holat','Мәртебе','الحالة'],
'Месяц заказа':['Պատվերի ամիս','Buyurtma oyi','Тапсырыс айы','شهر الطلب'],
'Фильтр':['Զտիչ','Filtr','Сүзгі','تصفية'],
'Все типы работ':['Աշխատանքի բոլոր տեսակները','Barcha ish turlari','Жұмыстың барлық түрі','كل أنواع العمل'],
'Все статусы':['Բոլոր կարգավիճակները','Barcha holatlar','Барлық мәртебелер','كل الحالات'],
'Все месяцы':['Բոլոր ամիսները','Barcha oylar','Барлық айлар','كل الأشهر'],
'Сбросить':['Մաքրել','Tozalash','Тазалау','إعادة ضبط'],
'Готово':['Պատրաստ է','Tayyor','Дайын','تم'],
'ПРОИЗВОДСТВО':['ԱՐՏԱԴՐՈՒԹՅՈՒՆ','ISHLAB CHIQARISH','ӨНДІРІС','الإنتاج'],
'Срок сдачи:':['Հանձնման ժամկետը՝','Topshirish muddati:','Тапсыру мерзімі:','موعد التسليم:'],
'Поиск по номеру заказа, пациенту или типу работы...':['Որոնել ըստ պատվերի համարի, հիվանդի կամ աշխատանքի տեսակի...','Buyurtma raqami, bemor yoki ish turi bo‘yicha qidirish...','Тапсырыс нөмірі, пациент немесе жұмыс түрі бойынша іздеу...','ابحث برقم الطلب أو المريض أو نوع العمل...'],
'ID заказа':['Պատվերի ID','Buyurtma ID','Тапсырыс ID','رقم الطلب'],
'Пациент':['Հիվանդ','Bemor','Пациент','المريض'],
'Создан':['Ստեղծվել է','Yaratilgan','Құрылған','تاريخ الإنشاء'],
'Срок':['Ժամկետ','Muddat','Мерзімі','الموعد النهائي'],
'Сумма':['Գումար','Summa','Сома','المبلغ'],
'Минимальная дата для выбранных услуг: {…}':['Ընտրված ծառայությունների նվազագույն ամսաթիվը՝ {…}','Tanlangan xizmatlar uchun eng erta sana: {…}','Таңдалған қызметтердің ең ерте күні: {…}','أقرب موعد للخدمات المحددة: {…}'],
'Выберите год':['Ընտրեք տարին','Yilni tanlang','Жылды таңдаңыз','اختر السنة'],
'‹ Раньше':['‹ Նախորդը','‹ Oldingi','‹ Алдыңғы','‹ السابق'],
'Позже ›':['Հաջորդը ›','Keyingi ›','Келесі ›','التالي ›'],
'Год: {…}':['Տարի՝ {…}','Yil: {…}','Жыл: {…}','السنة: {…}'],
'← Вернуться к календарю':['← Վերադառնալ օրացույց','← Taqvimga qaytish','← Күнтізбеге оралу','→ العودة إلى التقويم'],
'Очистить':['Մաքրել','Tozalash','Тазалау','مسح'],
'Сегодня':['Այսօր','Bugun','Бүгін','اليوم'],
'Данные пациента':['Հիվանդի տվյալներ','Bemor ma’lumotlari','Пациент деректері','بيانات المريض'],
'Выберите, по какому маршруту пойдёт заказ.':['Ընտրեք պատվերի մշակման ուղին։','Buyurtma qaysi yo‘nalishda bajarilishini tanlang.','Тапсырыс жүретін бағытты таңдаңыз.','اختر مسار تنفيذ الطلب.'],
'Цифровой':['Թվային','Raqamli','Цифрлық','رقمي'],
'Цифровой заказ · нужны STL или сканы':['Թվային պատվեր · անհրաժեշտ են STL ֆայլեր կամ սկաներ','Raqamli buyurtma · STL fayllar yoki skanerlar kerak','Цифрлық тапсырыс · STL файлдары немесе скан қажет','طلب رقمي · يلزم STL أو مسح ضوئي'],
'Аналоговый':['Անալոգային','Analog','Аналогтық','تقليدي'],
'Аналоговый заказ · нужен гипсовый слепок':['Անալոգային պատվեր · անհրաժեշտ է գիպսե կաղապար','Analog buyurtma · gips qolip kerak','Аналогтық тапсырыс · гипс қалып қажет','طلب تقليدي · يلزم قالب جبسي'],
'Фамилия пациента · обязательно':['Հիվանդի ազգանուն · պարտադիր','Bemor familiyasi · majburiy','Пациенттің тегі · міндетті','اسم عائلة المريض · مطلوب'],
'Имя пациента · обязательно':['Հիվանդի անուն · պարտադիր','Bemor ismi · majburiy','Пациенттің аты · міндетті','اسم المريض · مطلوب'],
'Дата рождения · необязательно':['Ծննդյան ամսաթիվ · պարտադիր չէ','Tug‘ilgan sana · ixtiyoriy','Туған күні · міндетті емес','تاريخ الميلاد · اختياري'],
'Фамилия':['Ազգանուն','Familiya','Тегі','اسم العائلة'],
'Имя · отчество по желанию':['Անուն · հայրանունը՝ ըստ ցանկության','Ism · otasining ismi ixtiyoriy','Аты · әкесінің аты қалауыңызша','الاسم · اسم الأب اختياري'],
'Фамилия и имя обязательны. Отчество можно указать по желанию.':['Ազգանունն ու անունը պարտադիր են։ Հայրանունը կարելի է նշել ըստ ցանկության։','Familiya va ism majburiy. Otasining ismini ixtiyoriy kiritish mumkin.','Тегі мен аты міндетті. Әкесінің атын қалауыңызша көрсетуге болады.','اسم العائلة والاسم مطلوبان. يمكن إدخال اسم الأب اختياريًا.'],
'← Все виды работ':['← Աշխատանքի բոլոր տեսակները','← Barcha ish turlari','← Барлық жұмыс түрлері','→ كل أنواع العمل'],
'Категория выбрана':['Կատեգորիան ընտրված է','Turkum tanlandi','Санат таңдалды','تم اختيار الفئة'],
'Выберите вариант исполнения':['Ընտրեք կատարման տարբերակը','Bajarish variantini tanlang','Орындау нұсқасын таңдаңыз','اختر خيار التنفيذ'],
'Услуга {…}':['Ծառայություն {…}','Xizmat {…}','Қызмет {…}','الخدمة {…}'],
'Количество':['Քանակ','Soni','Саны','الكمية'],
'Предварительно':['Նախնական','Dastlabki','Алдын ала','مبدئي'],
'Ваш заказ':['Ձեր պատվերը','Buyurtmangiz','Тапсырысыңыз','طلبك'],
'Выберите нужные зубы и работу':['Ընտրեք անհրաժեշտ ատամներն ու աշխատանքը','Kerakli tishlar va ishni tanlang','Қажетті тістер мен жұмысты таңдаңыз','اختر الأسنان والعمل المطلوب'],
'Здесь появится состав заказа и предварительная стоимость.':['Այստեղ կցուցադրվեն պատվերի կազմը և նախնական արժեքը։','Bu yerda buyurtma tarkibi va taxminiy narxi ko‘rinadi.','Мұнда тапсырыс құрамы мен алдын ала бағасы көрсетіледі.','سيظهر هنا محتوى الطلب والتكلفة التقديرية.'],
'＋ Заказать ещё':['＋ Ավելացնել պատվեր','＋ Yana buyurtma berish','＋ Тағы тапсырыс беру','＋ إضافة طلب آخر'],
'Итого предварительно':['Նախնական ընդհանուր գումար','Dastlabki jami','Алдын ала барлығы','الإجمالي المبدئي'],
'Зубы':['Ատամներ','Tishlar','Тістер','الأسنان'],
'Для этой услуги номера зубов не выбираются.':['Այս ծառայության համար ատամների համարներ չեն ընտրվում։','Bu xizmat uchun tish raqamlari tanlanmaydi.','Бұл қызмет үшін тіс нөмірлері таңдалмайды.','لا يتم تحديد أرقام الأسنان لهذه الخدمة.'],
'Выберите челюсть':['Ընտրեք ծնոտը','Jag‘ni tanlang','Жақты таңдаңыз','اختر الفك'],
'Выберите зуб(ы)':['Ընտրեք ատամ(ներ)','Tish(lar)ni tanlang','Тіс(терді) таңдаңыз','اختر السن/الأسنان'],
'Верхняя челюсть':['Վերին ծնոտ','Yuqori jag‘','Жоғарғы жақ','الفك العلوي'],
'Нижняя челюсть':['Ստորին ծնոտ','Pastki jag‘','Төменгі жақ','الفك السفلي'],
'Одиночка':['Առանձին ատամ','Yakka tish','Жеке тіс','سن منفرد'],
'Мост':['Կամուրջ','Ko‘prik','Көпір','جسر'],
'Челюсть':['Ծնոտ','Jag‘','Жақ','الفك'],
'Что нужно сделать?':['Ի՞նչ է պետք անել։','Nima qilish kerak?','Не істеу керек?','ما المطلوب؟'],
'Добавить':['Ավելացնել','Qo‘shish','Қосу','إضافة'],
'Дополнительная информация':['Լրացուցիչ տեղեկություններ','Qo‘shimcha ma’lumot','Қосымша ақпарат','معلومات إضافية'],
'Файлы заказа — сканы, КТ и фото':['Պատվերի ֆայլեր՝ սկաներ, ԿՏ և լուսանկարներ','Buyurtma fayllari — skanerlar, KT va rasmlar','Тапсырыс файлдары — скан, КТ және фотосуреттер','ملفات الطلب — المسح والأشعة المقطعية والصور'],
'Перетащите файлы сюда':['Քաշեք ֆայլերն այստեղ','Fayllarni shu yerga torting','Файлдарды осында сүйреңіз','اسحب الملفات إلى هنا'],
'или нажмите, чтобы выбрать':['կամ սեղմեք՝ ընտրելու համար','yoki tanlash uchun bosing','немесе таңдау үшін басыңыз','أو انقر للاختيار'],
'Изображения, PDF, 3D-файлы, архивы и документы — до 200 МБ на файл. Файлы прикрепятся к заказу.':['Պատկերներ, PDF, 3D ֆայլեր, արխիվներ և փաստաթղթեր՝ մինչև 200 ՄԲ յուրաքանչյուր ֆայլի համար։ Ֆայլերը կկցվեն պատվերին։','Rasm, PDF, 3D fayl, arxiv va hujjatlar — har bir fayl 200 MB gacha. Fayllar buyurtmaga biriktiriladi.','Суреттер, PDF, 3D файлдар, архивтер мен құжаттар — әр файл 200 МБ дейін. Файлдар тапсырысқа тіркеледі.','صور وPDF وملفات ثلاثية الأبعاد وأرشيفات ومستندات — حتى 200 ميغابايت للملف. ستُرفق الملفات بالطلب.'],
'Комментарий к заказу':['Մեկնաբանություն պատվերի վերաբերյալ','Buyurtma izohi','Тапсырысқа түсініктеме','تعليق على الطلب'],
'Напишите пожелания, особенности, дополнительные инструкции...':['Նշեք նախընտրությունները, առանձնահատկությունները կամ լրացուցիչ հրահանգները...','Istaklar, xususiyatlar va qo‘shimcha ko‘rsatmalarni yozing...','Тілектерді, ерекшеліктерді немесе қосымша нұсқауларды жазыңыз...','اكتب التفضيلات أو التفاصيل أو التعليمات الإضافية...'],
'Проверьте данные заказа':['Ստուգեք պատվերի տվյալները','Buyurtma ma’lumotlarini tekshiring','Тапсырыс деректерін тексеріңіз','تحقق من بيانات الطلب'],
'Номера зубов не требуются':['Ատամների համարներ պետք չեն','Tish raqamlari talab qilinmaydi','Тіс нөмірлері қажет емес','أرقام الأسنان غير مطلوبة'],
'Заказы':['Պատվերներ','Buyurtmalar','Тапсырыстар','الطلبات'],
'Услуги':['Ծառայություններ','Xizmatlar','Қызметтер','الخدمات'],
'Желаемый срок':['Ցանկալի ժամկետ','Istalgan muddat','Қалаған мерзім','الموعد المطلوب'],
'Предварительная сумма':['Նախնական գումար','Taxminiy summa','Алдын ала сома','المبلغ التقديري'],
'Цвет':['Գույն','Rang','Түс','اللون'],
'Комментарий':['Մեկնաբանություն','Izoh','Түсініктеме','تعليق'],
'Файлы':['Ֆայլեր','Fayllar','Файлдар','الملفات'],
'Корзина заказов':['Պատվերների զամբյուղ','Buyurtmalar savati','Тапсырыстар себеті','سلة الطلبات'],
'Назад':['Հետ','Orqaga','Артқа','رجوع'],
'Далее →':['Հաջորդը →','Keyingi →','Келесі →','التالي →'],
'Создать заказ':['Ստեղծել պատվեր','Buyurtma yaratish','Тапсырыс жасау','إنشاء الطلب'],
'Заказ отменится после подтверждения главным техником.':['Պատվերը կչեղարկվի գլխավոր տեխնիկի հաստատումից հետո։','Buyurtma bosh texnik tasdiqlagandan keyin bekor qilinadi.','Тапсырыс бас техник растағаннан кейін тоқтатылады.','سيتم إلغاء الطلب بعد موافقة كبير الفنيين.'],
'Причина отмены':['Չեղարկման պատճառը','Bekor qilish sababi','Бас тарту себебі','سبب الإلغاء'],
'Отправить запрос':['Ուղարկել հարցումը','So‘rov yuborish','Сұрау жіберу','إرسال الطلب'],
'Запросить правку':['Պահանջել փոփոխություն','Tuzatish so‘rash','Түзету сұрау','طلب تعديل'],
'Что изменить':['Ինչ փոխել','Nimani o‘zgartirish kerak','Нені өзгерту керек','ما الذي تريد تغييره'],
'Сумма заказа':['Պատվերի գումարը','Buyurtma summasi','Тапсырыс сомасы','مبلغ الطلب'],
'Исполнитель заказа':['Պատվերի կատարողը','Buyurtma ijrochisi','Тапсырысты орындаушы','منفذ الطلب'],
'Исполнитель назначен':['Կատարողը նշանակված է','Ijrochi tayinlandi','Орындаушы тағайындалды','تم تعيين المنفذ'],
'Пока не назначен':['Դեռ նշանակված չէ','Hali tayinlanmagan','Әзірге тағайындалмаған','لم يتم التعيين بعد'],
'Услуги заказа':['Պատվերի ծառայությունները','Buyurtma xizmatlari','Тапсырыс қызметтері','خدمات الطلب'],
'Режим':['Ռեժիմ','Rejim','Режим','الوضع'],
'Мосты':['Կամուրջներ','Ko‘priklar','Көпірлер','الجسور'],
'Раздел':['Բաժին','Bo‘lim','Бөлім','القسم'],
'Папка заказа на Яндекс Диске':['Պատվերի պանակը Yandex Disk-ում','Buyurtma papkasi Yandex Disk’da','Тапсырыс қалтасы Yandex Disk ішінде','مجلد الطلب على Yandex Disk'],
'Все файлы хранятся только на Яндекс Диске':['Բոլոր ֆայլերը պահվում են միայն Yandex Disk-ում','Barcha fayllar faqat Yandex Disk’da saqlanadi','Барлық файлдар тек Yandex Disk ішінде сақталады','تُحفظ جميع الملفات على Yandex Disk فقط'],
'Открыть папку':['Բացել պանակը','Papkani ochish','Қалтаны ашу','فتح المجلد'],
'Папка создаётся…':['Պանակը ստեղծվում է…','Papka yaratilmoqda…','Қалта жасалуда…','جارٍ إنشاء المجلد…'],
'Файлы заказа':['Պատվերի ֆայլերը','Buyurtma fayllari','Тапсырыс файлдары','ملفات الطلب'],
'Загрузить файлы':['Վերբեռնել ֆայլեր','Fayllarni yuklash','Файлдарды жүктеу','رفع الملفات'],
'Добавьте до 10 файлов в папку заказа на Яндекс Диске':['Ավելացրեք մինչև 10 ֆայլ պատվերի Yandex Disk պանակում','Buyurtma Yandex Disk papkasiga 10 tagacha fayl qo‘shing','Тапсырыстың Yandex Disk қалтасына 10 файлға дейін қосыңыз','أضف حتى 10 ملفات إلى مجلد الطلب على Yandex Disk'],
'Выбрать файлы':['Ընտրել ֆայլեր','Fayllarni tanlash','Файлдарды таңдау','اختيار الملفات'],
'Согласование CAD':['CAD-ի հաստատում','CAD tasdig‘i','CAD келісімі','موافقة CAD'],
'Открыть CAD':['Բացել CAD-ը','CAD’ni ochish','CAD ашу','فتح CAD'],
'Вернуть':['Վերադարձնել','Qaytarish','Қайтару','إرجاع'],
'Подтвердить':['Հաստատել','Tasdiqlash','Растау','تأكيد'],
'История появится после первого действия с заказом.':['Պատմությունը կհայտնվի պատվերի առաջին գործողությունից հետո։','Buyurtma bilan birinchi amal bajarilgandan so‘ng tarix ko‘rinadi.','Тапсырыспен алғашқы әрекеттен кейін тарих көрсетіледі.','سيظهر السجل بعد أول إجراء على الطلب.'],
'←  Назад к заказам':['← Վերադառնալ պատվերներին','← Buyurtmalarga qaytish','← Тапсырыстарға оралу','→ العودة إلى الطلبات'],
'Создан {…}':['Ստեղծվել է՝ {…}','Yaratilgan: {…}','Құрылған: {…}','تاريخ الإنشاء {…}'],
'Распечатать наряд':['Տպել պատվերի թերթիկը','Buyurtma varag‘ini chop etish','Тапсырыс парағын басып шығару','طباعة أمر العمل'],
'Сообщение':['Հաղորդագրություն','Xabar','Хабарлама','رسالة'],
'Общая информация':['Ընդհանուր տեղեկություններ','Umumiy ma’lumot','Жалпы ақпарат','معلومات عامة'],
'Статус заказа':['Պատվերի կարգավիճակը','Buyurtma holati','Тапсырыс мәртебесі','حالة الطلب'],
'Прогресс заказа':['Պատվերի ընթացքը','Buyurtma jarayoni','Тапсырыс барысы','تقدم الطلب'],
'Принять работу':['Ընդունել աշխատանքը','Ishni qabul qilish','Жұмысты қабылдау','قبول العمل'],
'Отправить на доработку':['Ուղարկել վերամշակման','Qayta ishlashga yuborish','Қайта өңдеуге жіберу','إرسال لإعادة العمل'],
'Комментарии к заказу пока отсутствуют.':['Պատվերի վերաբերյալ մեկնաբանություններ դեռ չկան։','Buyurtma bo‘yicha izohlar hozircha yo‘q.','Тапсырысқа қатысты әзірге пікір жоқ.','لا توجد تعليقات على الطلب حتى الآن.'],
'Опишите, что нужно исправить. Запрос появится в истории заказа и кабинете исполнителя.':['Նկարագրեք, թե ինչն է պետք ուղղել։ Հարցումը կհայտնվի պատվերի պատմության և կատարողի էջում։','Nimani tuzatish kerakligini yozing. So‘rov buyurtma tarixi va ijrochi kabinetida ko‘rinadi.','Нені түзету керегін сипаттаңыз. Сұрау тапсырыс тарихында және орындаушы кабинетінде көрінеді.','صف ما يجب تصحيحه. سيظهر الطلب في سجل الطلب وحساب المنفذ.'],
'Отмена':['Չեղարկել','Bekor qilish','Болдырмау','إلغاء'],
'Отправить в лабораторию':['Ուղարկել լաբորատորիա','Laboratoriyaga yuborish','Зертханаға жіберу','إرسال إلى المختبر'],
'Вернуть CAD моделировщику':['Վերադարձնել CAD-ը մոդելավորողին','CAD’ni modelchiga qaytarish','CAD-ты модельдеушіге қайтару','إعادة CAD إلى المصمم'],
'Укажите конкретно, что нужно изменить.':['Հստակ նշեք, թե ինչն է պետք փոխել։','Nimani o‘zgartirish kerakligini aniq yozing.','Нені өзгерту керегін нақты көрсетіңіз.','حدد بدقة ما الذي يجب تغييره.'],
'Добавить скриншоты или файлы':['Ավելացնել սքրինշոթեր կամ ֆայլեր','Skrinshot yoki fayllarni qo‘shish','Скриншоттар немесе файлдар қосу','إضافة لقطات شاشة أو ملفات'],
'Вернуть на исправление':['Ուղարկել ուղղման','Tuzatishga qaytarish','Түзетуге қайтару','إعادة للتصحيح'],
'Файлы':['Ֆայլեր','Fayllar','Файлдар','الملفات'],
'Откройте нужный заказ, чтобы загрузить файлы прямо в его папку на Яндекс Диске.':['Բացեք անհրաժեշտ պատվերը՝ ֆայլերը անմիջապես դրա Yandex Disk պանակում վերբեռնելու համար։','Fayllarni to‘g‘ridan-to‘g‘ri Yandex Disk papkasiga yuklash uchun kerakli buyurtmani oching.','Файлдарды Yandex Disk қалтасына тікелей жүктеу үшін қажетті тапсырысты ашыңыз.','افتح الطلب المطلوب لرفع الملفات مباشرة إلى مجلده على Yandex Disk.'],
'Все файлы':['Բոլոր ֆայլերը','Barcha fayllar','Барлық файлдар','كل الملفات'],
'КТ/Рентген':['ԿՏ/Ռենտգեն','KT/Rentgen','КТ/Рентген','الأشعة المقطعية/السينية'],
'Фото':['Լուսանկարներ','Rasmlar','Фотосуреттер','الصور'],
'3D модели':['3D մոդելներ','3D modellar','3D модельдер','نماذج ثلاثية الأبعاد'],
'Документы':['Փաստաթղթեր','Hujjatlar','Құжаттар','المستندات'],
'Ваш диалог со службой поддержки':['Ձեր զրույցը աջակցության ծառայության հետ','Yordam xizmati bilan suhbatingiz','Қолдау қызметімен диалогыңыз','محادثتك مع الدعم'],
'Служба поддержки онлайн · отвечаем 10:00–21:00 МСК':['Աջակցման ծառայությունը առցանց է · պատասխանում ենք 10:00–21:00 Մոսկվայի ժամանակով','Yordam xizmati onlayn · javob vaqti 10:00–21:00 Moskva vaqti','Қолдау қызметі желіде · жауап беру уақыты 10:00–21:00 Мәскеу уақыты','الدعم متصل · نرد من 10:00 إلى 21:00 بتوقيت موسكو'],
'Напишите сообщение, и оператор увидит его в своей панели.':['Գրեք հաղորդագրություն, և օպերատորը կտեսնի այն իր վահանակում։','Xabar yozing, operator uni o‘z panelida ko‘radi.','Хабарлама жазыңыз, оператор оны өз панелінен көреді.','اكتب رسالة وسيظهر للمشغل في لوحته.'],
'Напишите сообщение...':['Գրեք հաղորդագրություն...','Xabar yozing...','Хабарлама жазыңыз...','اكتب رسالة...'],
'Отправить сообщение':['Ուղարկել հաղորդագրությունը','Xabar yuborish','Хабарлама жіберу','إرسال الرسالة'],
'КЛИНИКА':['ԿԼԻՆԻԿԱ','KLINIKA','КЛИНИКА','العيادة'],
'Логотип клиники':['Կլինիկայի լոգոն','Klinika logotipi','Клиника логотипі','شعار العيادة'],
'Изменить логотип':['Փոխել լոգոն','Logotipni o‘zgartirish','Логотипті өзгерту','تغيير الشعار'],
'Сохранить изменения':['Պահպանել փոփոխությունները','O‘zgarishlarni saqlash','Өзгерістерді сақтау','حفظ التغييرات'],
'Основная информация':['Հիմնական տեղեկություններ','Asosiy ma’lumot','Негізгі ақпарат','المعلومات الأساسية'],
'Контактные лица':['Կոնտակտային անձինք','Aloqa shaxslari','Байланыс тұлғалары','جهات الاتصال'],
'Настройки':['Կարգավորումներ','Sozlamalar','Баптаулар','الإعدادات'],
'Безопасность':['Անվտանգություն','Xavfsizlik','Қауіпсіздік','الأمان'],
'Название клиники':['Կլինիկայի անվանումը','Klinika nomi','Клиника атауы','اسم العيادة'],
'Страна':['Երկիր','Mamlakat','Ел','الدولة'],
'Россия':['Ռուսաստան','Rossiya','Ресей','روسيا'],
'Беларусь':['Բելառուս','Belarus','Беларусь','بيلاروس'],
'Армения':['Հայաստան','Armaniston','Армения','أرمينيا'],
'Казахстан':['Ղազախստան','Qozog‘iston','Қазақстан','كازاخستان'],
'Узбекистан':['Ուզբեկստան','O‘zbekiston','Өзбекстан','أوزبكستان'],
'ОАЭ':['ԱՄԷ','BAA','БАӘ','الإمارات'],
'ИНН':['ՀՎՀՀ','STIR','БСН','الرقم الضريبي'],
'Город':['Քաղաք','Shahar','Қала','المدينة'],
'Адрес':['Հասցե','Manzil','Мекенжай','العنوان'],
'Телефон':['Հեռախոս','Telefon','Телефон','الهاتف'],
'Email':['Էլ․ փոստ','Email','Email','البريد الإلكتروني'],
'Контактное лицо':['Կոնտակտային անձ','Aloqa shaxsi','Байланыс тұлғасы','جهة الاتصال'],
'Должность':['Պաշտոն','Lavozim','Лауазымы','المنصب'],
'Телефон контакта':['Կոնտակտային հեռախոս','Aloqa telefoni','Байланыс телефоны','هاتف جهة الاتصال'],
'Email контакта':['Կոնտակտային էլ․ փոստ','Aloqa emaili','Байланыс email-ы','بريد جهة الاتصال'],
'График работы':['Աշխատանքային ժամեր','Ish vaqti','Жұмыс кестесі','ساعات العمل'],
'Предпочтительный способ доставки':['Նախընտրելի առաքման եղանակը','Afzal yetkazib berish usuli','Қалаулы жеткізу тәсілі','طريقة التسليم المفضلة'],
'Условия оплаты':['Վճարման պայմաններ','To‘lov shartlari','Төлем шарттары','شروط الدفع'],
'Комментарий для лаборатории':['Մեկնաբանություն լաբորատորիային','Laboratoriya uchun izoh','Зертханаға түсініктеме','ملاحظة للمختبر'],
'Email для входа':['Մուտքի էլ․ փոստ','Kirish uchun email','Кіру email-ы','بريد تسجيل الدخول'],
'Ответственный за доступ':['Մուտքի համար պատասխանատու','Kirish uchun mas’ul','Қолжетімділікке жауапты','المسؤول عن الوصول'],
'Телефон для подтверждений':['Հաստատումների հեռախոսահամար','Tasdiqlash uchun telefon','Растау телефоны','هاتف التأكيدات'],
'Заметка по доступу':['Մուտքի նշում','Kirish bo‘yicha eslatma','Қолжетімділік туралы ескертпе','ملاحظة الوصول'],
'Введите город':['Մուտքագրեք քաղաքը','Shaharni kiriting','Қаланы енгізіңіз','أدخل المدينة'],
'Введите адрес':['Մուտքագրите հասցեն','Manzilni kiriting','Мекенжайды енгізіңіз','أدخل العنوان'],
'Информация о конструкциях, материалах и оформлении заказов.':['Տեղեկություններ կոնստրուկցիաների, նյութերի և պատվերների ձևակերպման մասին։','Konstruksiyalar, materiallar va buyurtma berish haqida ma’lumot.','Құрылымдар, материалдар және тапсырысты рәсімдеу туралы ақпарат.','معلومات عن التركيبات والمواد وتقديم الطلبات.'],
'Эстетичные цельнокерамические реставрации.':['Էսթետիկ ամբողջական կերամիկական վերականգնումներ։','Estetik to‘liq keramik restavratsiyalar.','Эстетикалық тұтас керамикалық қалпына келтірулер.','ترميمات خزفية كاملة ذات مظهر جمالي.'],
'Тонкие накладки для восстановления улыбки.':['Ժպիտը վերականգնելու բարակ ծածկույթներ։','Tabassumni tiklash uchun yupqa qoplamalar.','Күлкіні қалпына келтіруге арналған жұқа жапсырмалар.','قشور رقيقة لاستعادة الابتسامة.'],
'Конструкции для замещения отсутствующих зубов.':['Բացակայող ատամները փոխարինող կոնստրուկցիաներ։','Yo‘qolgan tishlar o‘rnini bosuvchi konstruksiyalar.','Жоқ тістердің орнын толтыратын құрылымдар.','تركيبات لتعويض الأسنان المفقودة.'],
'Цифровые слепки для точной работы.':['Թվային սկանավորումներ՝ ճշգրիտ աշխատանքի համար։','Aniq ish uchun raqamli qoliplar.','Дәл жұмысқа арналған цифрлық қалыптар.','مسح رقمي لعمل دقيق.'],
'Коронки E.max':['E.max պսակներ','E.max qoplamalar','E.max сауыттары','تيجان E.max'],
'Виниры':['Վինիրներ','Vinirlar','Винирлер','قشور تجميلية'],
'Мостовидные протезы':['Կամրջաձև պրոթեզներ','Ko‘priksimon protezlar','Көпір тәрізді протездер','جسور سنية'],
'3D сканирование':['3D սկանավորում','3D skanerlash','3D сканерлеу','المسح ثلاثي الأبعاد'],
'Изменение заказа':['Պատվերի փոփոխություն','Buyurtmani o‘zgartirish','Тапсырысты өзгерту','تعديل الطلب'],
'В пути к вам':['Ձեզ է ուղարկվել','Sizga yo‘lda','Сізге жеткізілуде','في الطريق إليك'],
'На согласовании':['Հաստատման փուլում','Tasdiqlashda','Келісуде','بانتظار الموافقة'],
'На доработке':['Վերամշակման փուլում','Qayta ishlashda','Қайта өңдеуде','قيد إعادة العمل'],
'Новый':['Նոր','Yangi','Жаңа','جديد'],
'Принято врачом':['Բժշկի կողմից ընդունված','Shifokor qabul qildi','Дәрігер қабылдады','قبله الطبيب'],
'Принято доктором':['Բժշկի կողմից ընդունված','Shifokor qabul qildi','Дәрігер қабылдады','قبله الطبيب'],
'Доставка в клинику':['Առաքում կլինիկա','Klinikaga yetkazish','Клиникаға жеткізу','التوصيل إلى العيادة'],
'Приняты':['Ընդունված','Qabul qilingan','Қабылданған','مقبول'],
'Новые':['Նոր','Yangi','Жаңа','جديد'],
'Все заказы →':['Բոլոր պատվերները →','Barcha buyurtmalar →','Барлық тапсырыс →','كل الطلبات ←'],
'Все ({…}) →':['Բոլորը ({…}) →','Barchasi ({…}) →','Барлығы ({…}) →','الكل ({…}) ←'],
'Клиника не найдена':['Կլինիկան չի գտնվել','Klinika topilmadi','Клиника табылмады','لم يتم العثور على العيادة'],
'Укажите название клиники':['Նշեք կլինիկայի անվանումը','Klinika nomini kiriting','Клиника атауын енгізіңіз','أدخل اسم العيادة'],
'Данные клиники сохранены':['Կլինիկայի տվյալները պահպանվել են','Klinika ma’lumotlari saqlandi','Клиника деректері сақталды','تم حفظ بيانات العيادة'],
'Справочник':['Տեղեկատու','Ma’lumotnoma','Анықтамалық','الدليل'],
'Загрузка кабинета...':['Անձնական էջի բեռնում...','Kabinet yuklanmoqda...','Кабинет жүктелуде...','جارٍ تحميل الحساب...'],
'Не удалось открыть изображение':['Չհաջողվեց բացել պատկերը','Rasmni ochib bo‘lmadi','Суретті ашу мүмкін болмады','تعذر فتح الصورة'],
'Файл должен быть не больше 200 МБ':['Ֆայլի չափը չպետք է գերազանցի 200 ՄԲ-ը','Fayl hajmi 200 MB dan oshmasligi kerak','Файл өлшемі 200 МБ-тан аспауы керек','يجب ألا يتجاوز حجم الملف 200 ميغابايت'],
'Выберите изображение, PDF, 3D-файл, архив, Word, Excel или текстовый документ':['Ընտրեք պատկեր, PDF, 3D ֆայլ, արխիվ, Word, Excel կամ տեքստային փաստաթուղթ','Rasm, PDF, 3D fayl, arxiv, Word, Excel yoki matnli hujjatni tanlang','Сурет, PDF, 3D файл, архив, Word, Excel немесе мәтіндік құжат таңдаңыз','اختر صورة أو PDF أو ملفًا ثلاثي الأبعاد أو أرشيفًا أو مستند Word أو Excel أو نصيًا'],
'Выберите зуб или челюсть':['Ընտրեք ատամը կամ ծնոտը','Tish yoki jag‘ni tanlang','Тісті немесе жақты таңдаңыз','اختر السن أو الفك'],
'Выберите вид работы':['Ընտրեք աշխատանքի տեսակը','Ish turini tanlang','Жұмыс түрін таңдаңыз','اختر نوع العمل'],
'Выберите вариант услуги':['Ընտրեք ծառայության տարբերակը','Xizmat variantini tanlang','Қызмет нұсқасын таңдаңыз','اختر خيار الخدمة'],
'Укажите желаемый срок готовности':['Նշեք պատրաստ լինելու ցանկալի ժամկետը','Tayyor bo‘lish muddatini kiriting','Дайын болу мерзімін көрсетіңіз','حدد الموعد المطلوب للإنجاز'],
'Срок сдачи должен приходиться на рабочий день':['Հանձնման օրը պետք է աշխատանքային օր լինի','Topshirish sanasi ish kuniga to‘g‘ri kelishi kerak','Тапсыру күні жұмыс күні болуы керек','يجب أن يكون موعد التسليم يوم عمل'],
'Введите сообщение, чтобы отправить его':['Հաղորդագրություն մուտքագրեք՝ ուղարկելու համար','Yuborish uchun xabar kiriting','Жіберу үшін хабарлама енгізіңіз','أدخل رسالة لإرسالها'],
'Не удалось отправить сообщение':['Չհաջողվեց ուղարկել հաղորդագրությունը','Xabarni yuborib bo‘lmadi','Хабарламаны жіберу мүмкін болмады','تعذر إرسال الرسالة'],
'Запрос отмены отправлен':['Չեղարկման հարցումն ուղարկվել է','Bekor qilish so‘rovi yuborildi','Бас тарту сұрауы жіберілді','تم إرسال طلب الإلغاء'],
'Запрос на доработку отправлен':['Վերամշակման հարցումն ուղարկվել է','Qayta ishlash so‘rovi yuborildi','Қайта өңдеу сұрауы жіберілді','تم إرسال طلب إعادة العمل'],
'Загрузка файлов заказа':['Պատվերի ֆայլերի վերբեռնում','Buyurtma fayllari yuklanmoqda','Тапсырыс файлдары жүктелуде','رفع ملفات الطلب'],
'Выберите до 10 файлов. Они сразу загружаются в папку этого заказа на Яндекс Диске.':['Ընտրեք մինչև 10 ֆայլ։ Դրանք անմիջապես կվերբեռնվեն պատվերի Yandex Disk պանակ։','10 tagacha fayl tanlang. Ular darhol buyurtmaning Yandex Disk papkasiga yuklanadi.','10 файлға дейін таңдаңыз. Олар бірден тапсырыстың Yandex Disk қалтасына жүктеледі.','اختر حتى 10 ملفات. سيتم رفعها مباشرة إلى مجلد الطلب على Yandex Disk.'],
'Общий прогресс':['Ընդհանուր առաջընթաց','Umumiy jarayon','Жалпы барысы','التقدم الإجمالي'],
'Отправить на согласование':['Ուղարկել հաստատման','Tasdiqlash uchun yuborish','Келісуге жіберу','إرسال للموافقة'],
'Новая клиника':['Նոր կլինիկա','Yangi klinika','Жаңа клиника','عيادة جديدة'],
'Клиника':['Կլինիկա','Klinika','Клиника','عيادة'],
'Открыть меню':['Բացել ընտրացանկը','Menyuni ochish','Мәзірді ашу','فتح القائمة'],
'Включить ночную тему':['Միացնել գիշերային թեման','Tungi mavzuni yoqish','Түнгі режимді қосу','تفعيل الوضع الليلي'],
'Включить дневную тему':['Միացնել ցերեկային թեման','Kunduzgi mavzuni yoqish','Күндізгі режимді қосу','تفعيل الوضع النهاري'],
'Ночная тема':['Գիշերային թեմա','Tungi mavzu','Түнгі режим','الوضع الليلي'],
'Дневная тема':['Ցերեկային թեմա','Kunduzgi mavzu','Күндізгі режим','الوضع النهاري'],
'Добавить файлы':['Ավելացնել ֆայլեր','Fayllarni qo‘shish','Файлдарды қосу','إضافة ملفات'],
'Логотип клиники':['Կլինիկայի լոգոն','Klinika logotipi','Клиника логотипі','شعار العيادة'],
'Открыть папку заказа':['Բացել պատվերի պանակը','Buyurtma papkasini ochish','Тапсырыс қалтасын ашу','فتح مجلد الطلب'],
'Перейти на главную':['Անցնել գլխավոր էջ','Bosh sahifaga o‘tish','Басты бетке өту','الانتقال إلى الرئيسية'],
'Свернуть боковое меню':['Փակել կողային ընտրացանկը','Yon menyuni yig‘ish','Бүйірлік мәзірді жинау','طي القائمة الجانبية'],
'Развернуть боковое меню':['Բացել կողային ընտրացանկը','Yon menyuni yoyish','Бүйірлік мәзірді ашу','توسيع القائمة الجانبية'],
'Имя клиники':['Կլինիկայի անունը','Klinika nomi','Клиника атауы','اسم العيادة'],
'Введите пожелания, особенности или инструкции':['Մուտքագրեք ցանկությունները, առանձնահատկությունները կամ հրահանգները','Istaklar, xususiyatlar yoki ko‘rsatmalarni kiriting','Тілектерді, ерекшеліктерді немесе нұсқауларды енгізіңіз','أدخل التفضيلات أو التفاصيل أو التعليمات'],
'Принято':['Ընդունված է','Qabul qilindi','Қабылданды','مقبول'],
'Готово':['Պատրաստ է','Tayyor','Дайын','جاهز'],
'В доставке':['Առաքման մեջ է','Yetkazilmoqda','Жеткізілуде','قيد التوصيل'],
'Выполнено':['Կատարված է','Bajarildi','Орындалды','مكتمل'],
'Работа принята':['Աշխատանքն ընդունված է','Ish qabul qilindi','Жұмыс қабылданды','تم قبول العمل'],
'Согласование врача':['Բժշկի հաստատում','Shifokor tasdig‘i','Дәрігердің келісімі','موافقة الطبيب'],
'Доставка':['Առաքում','Yetkazib berish','Жеткізу','التوصيل'],
'Доработка и эстетика':['Վերամշակում և էսթետիկա','Qayta ishlash va estetika','Қайта өңдеу және эстетика','إعادة العمل والجماليات'],
'Срок сдачи':['Հանձնման ժամկետ','Topshirish muddati','Тапсыру мерзімі','موعد التسليم'],
'Файлы не найдены':['Ֆայլեր չեն գտնվել','Fayllar topilmadi','Файлдар табылмады','لم يتم العثور على ملفات'],
'Работа':['Աշխատանք','Ish','Жұмыс','العمل'],
'Пока нет заказов':['Պատվերներ դեռ չկան','Hozircha buyurtmalar yo‘q','Әзірге тапсырыс жоқ','لا توجد طلبات بعد'],
'Выберите нужный заказ':['Ընտրեք անհրաժեշտ պատվերը','Kerakli buyurtmani tanlang','Қажетті тапсырысты таңдаңыз','اختر الطلب المطلوب'],
'Лаборатория':['Լաբորատորիա','Laboratoriya','Зертхана','المختبر'],
'Загрузить':['Վերբեռնել','Yuklash','Жүктеу','رفع'],
'Удалить':['Ջնջել','O‘chirish','Жою','حذف'],
'Отправить':['Ուղարկել','Yuborish','Жіберу','إرسال'],
'Сохранить':['Պահպանել','Saqlash','Сақтау','حفظ'],
'Выберите врача':['Ընտրեք բժշկին','Shifokorni tanlang','Дәрігерді таңдаңыз','اختر الطبيب'],
'Проверьте обязательные поля':['Ստուգեք պարտադիր դաշտերը','Majburiy maydonlarni tekshiring','Міндетті өрістерді тексеріңіз','تحقق من الحقول المطلوبة'],
'Зубы и работа':['Ատամներ և աշխատանք','Tishlar va ish','Тістер мен жұмыс','الأسنان والعمل'],
'Дополнительно':['Լրացուցիչ','Qo‘shimcha','Қосымша','إضافات'],
'Подтверждение':['Հաստատում','Tasdiqlash','Растау','التأكيد'],
'Все заказы':['Բոլոր պատվերները','Barcha buyurtmalar','Барлық тапсырыстар','كل الطلبات'],
'Работа принята':['Աշխատանքն ընդունված է','Ish qabul qilindi','Жұмыс қабылданды','تم قبول العمل'],
'На согласовании':['Հաստատման փուլում','Tasdiqlashda','Келісуде','بانتظار الموافقة'],
'Согласование врача':['Բժշկի հաստատում','Shifokor tasdig‘i','Дәрігердің келісімі','موافقة الطبيب'],
'Доставка в клинику':['Առաքում կլինիկա','Klinikaga yetkazish','Клиникаға жеткізу','التوصيل إلى العيادة'],
'Запросить отмену заказа':['Պահանջել պատվերի չեղարկում','Buyurtmani bekor qilishni so‘rash','Тапсырысты тоқтатуды сұрау','طلب إلغاء الطلب'],
'Отмена заказа':['Պատվերի չեղարկում','Buyurtmani bekor qilish','Тапсырыстан бас тарту','إلغاء الطلب'],
'Услуга добавлена':['Ծառայությունն ավելացվել է','Xizmat qo‘shildi','Қызмет қосылды','تمت إضافة الخدمة'],
'Предварительная стоимость':['Նախնական արժեք','Taxminiy narx','Алдын ала құны','التكلفة التقديرية'],
'Стоимость уточняется':['Արժեքը կհստակեցվի','Narxi aniqlanadi','Құны нақтыланады','سيتم تحديد التكلفة'],
'Выберите вариант исполнения':['Ընտրեք կատարման տարբերակը','Bajarish variantini tanlang','Орындау нұсқасын таңдаңыз','اختر خيار التنفيذ'],
'Желаемый срок готовности':['Ցանկալի պատրաստման ժամկետ','Istalgan tayyor bo‘lish muddati','Қалаған дайын болу мерзімі','موعد الإنجاز المطلوب'],
'Цвет/оттенок (например, Vita)':['Գույն/երանգ (օրինակ՝ Vita)','Rang/ton (masalan, Vita)','Түс/реңк (мысалы, Vita)','اللون/الدرجة (مثل Vita)'],
'Нажмите на нужные зубы':['Սեղմեք անհրաժեշտ ատամների վրա','Kerakli tishlarni bosing','Қажетті тістерді басыңыз','انقر على الأسنان المطلوبة'],
'Выберите первый и последний зуб моста':['Ընտրեք կամրջի առաջին և վերջին ատամները','Ko‘prikning birinchi va oxirgi tishini tanlang','Көпірдің бірінші және соңғы тісін таңдаңыз','اختر أول وآخر سن في الجسر'],
'Выберите последний зуб на этой челюсти':['Ընտրեք այս ծնոտի վերջին ատամը','Bu jag‘dagi oxirgi tishni tanlang','Осы жақтағы соңғы тісті таңдаңыз','اختر آخر سن في هذا الفك'],
'Выберите верхнюю или нижнюю челюсть':['Ընտրեք վերին կամ ստորին ծնոտը','Yuqori yoki pastki jag‘ni tanlang','Жоғарғы немесе төменгі жақты таңдаңыз','اختر الفك العلوي أو السفلي'],
'Верхняя челюсть выбрана автоматически':['Վերին ծնոտն ընտրվել է ավտոմատ կերպով','Yuqori jag‘ avtomatik tanlandi','Жоғарғы жақ автоматты түрде таңдалды','تم اختيار الفك العلوي تلقائيًا'],
'Нижняя челюсть':['Ստորին ծնոտ','Pastki jag‘','Төменгі жақ','الفك السفلي'],
'Выбраны верхняя и нижняя челюсти':['Ընտրված են վերին և ստորին ծնոտները','Yuqori va pastki jag‘lar tanlandi','Жоғарғы және төменгі жақтар таңдалды','تم اختيار الفكين العلوي والسفلي'],
'Очистить выбор':['Մաքրել ընտրությունը','Tanlovni tozalash','Таңдауды тазалау','مسح الاختيار'],
'Файлы заказа добавлены':['Պատվերի ֆայլերն ավելացվել են','Buyurtma fayllari qo‘shildi','Тапсырыс файлдары қосылды','تمت إضافة ملفات الطلب'],
'Подтвердите получение работы':['Հաստատեք աշխատանքի ստացումը','Ish qabul qilinganini tasdiqlang','Жұмысты алғаныңызды растаңыз','أكد استلام العمل'],
'Пожалуйста, опишите, что нужно исправить':['Նկարագրեք, խնդրում ենք, թե ինչն է պետք ուղղել','Nimani tuzatish kerakligini yozing','Нені түзету керегін сипаттаңыз','يرجى وصف ما يجب تصحيحه'],
'Номер заказа':['Պատվերի համար','Buyurtma raqami','Тапсырыс нөмірі','رقم الطلب'],
'Общая информация':['Ընդհանուր տեղեկություններ','Umumiy ma’lumot','Жалпы ақпарат','معلومات عامة'],
'Основная информация':['Հիմնական տեղեկություններ','Asosiy ma’lumot','Негізгі ақпарат','المعلومات الأساسية'],
'Контакты':['Կոնտակտներ','Aloqalar','Байланыс','جهات الاتصال'],
'Комментарии':['Մեկնաբանություններ','Izohlar','Пікірлер','التعليقات'],
'Обзор':['Տեսություն','Ko‘rib chiqish','Шолу','نظرة عامة'],
'Текущая стадия производства':['Արտադրության ընթացիկ փուլը','Joriy ishlab chiqarish bosqichi','Өндірістің ағымдағы кезеңі','مرحلة الإنتاج الحالية'],
'Данные заказа':['Պատվերի տվյալներ','Buyurtma ma’lumotlari','Тапсырыс деректері','بيانات الطلب'],
'Отправлено на согласование':['Ուղարկվել է հաստատման','Tasdiqlash uchun yuborildi','Келісуге жіберілді','أُرسل للموافقة'],
'Ожидает вашего решения':['Սպասում է ձեր որոշմանը','Qaroringizni kutmoqda','Сіздің шешіміңізді күтуде','بانتظار قرارك'],
'CAD подтверждён':['CAD-ը հաստատված է','CAD tasdiqlandi','CAD расталды','تمت الموافقة على CAD'],
'CAD возвращён моделировщику':['CAD-ը վերադարձվել է մոդելավորողին','CAD modelchiga qaytarildi','CAD модельдеушіге қайтарылды','أُعيد CAD إلى المصمم'],
'Нужно внести изменения':['Պետք է փոփոխություններ կատարել','O‘zgartirishlar kiritish kerak','Өзгерістер енгізу керек','يجب إجراء تعديلات'],
'Исполнитель пока не назначен':['Կատարողը դեռ նշանակված չէ','Ijrochi hali tayinlanmagan','Орындаушы әлі тағайындалмаған','لم يتم تعيين المنفذ بعد'],
'Открыть файл':['Բացել ֆայլը','Faylni ochish','Файлды ашу','فتح الملف'],
'Добавить комментарий':['Ավելացնել մեկնաբանություն','Izoh qo‘shish','Пікір қосу','إضافة تعليق'],
'ИСТОРИЯ ЗАКАЗА':['ՊԱՏՎԵՐԻ ՊԱՏՄՈՒԹՅՈՒՆ','BUYURTMA TARIXI','ТАПСЫРЫС ТАРИХЫ','سجل الطلب'],
'Все этапы':['Բոլոր փուլերը','Barcha bosqichlar','Барлық кезеңдер','كل المراحل'],
'Предыдущий месяц':['Նախորդ ամիս','O‘tgan oy','Алдыңғы ай','الشهر السابق'],
'Следующий месяц':['Հաջորդ ամիս','Keyingi oy','Келесі ай','الشهر التالي'],
'Все файлы заказа':['Պատվերի բոլոր ֆայլերը','Buyurtmaning barcha fayllari','Тапсырыстың барлық файлдары','كل ملفات الطلب'],
'Получить консультацию':['Ստանալ խորհրդատվություն','Maslahat olish','Кеңес алу','طلب استشارة'],
'Скачать файл':['Ներբեռնել ֆայլը','Faylni yuklab olish','Файлды жүктеп алу','تنزيل الملف'],
'Открыть изображение':['Բացել պատկերը','Rasmni ochish','Суретті ашу','فتح الصورة'],
'Уведомления':['Ծանուցումներ','Bildirishnomalar','Хабарландырулар','الإشعارات'],
'Пока нет новых событий':['Նոր իրադարձություններ դեռ չկան','Hozircha yangi hodisalar yo‘q','Әзірге жаңа оқиғалар жоқ','لا توجد أحداث جديدة'],
'Новое':['Նոր','Yangi','Жаңа','جديد'],
'Закрыть':['Փակել','Yopish','Жабу','إغلاق'],
'Уведомления, непрочитанных: {…}':['Ծանուցումներ, չկարդացված՝ {…}','Bildirishnomalar, o‘qilmagan: {…}','Хабарландырулар, оқылмаған: {…}','الإشعارات، غير المقروءة: {…}'],
'Клиент':['Հաճախորդ','Mijoz','Клиент','العميل'],
'Ответ AI':['AI-ի պատասխան','AI javobi','AI жауабы','رد الذكاء الاصطناعي'],
'Уведомление':['Ծանուցում','Bildirishnoma','Хабарландыру','إشعار'],
'Главная страница':['Գլխավոր էջ','Bosh sahifa','Басты бет','الصفحة الرئيسية'],
'Войти':['Մուտք գործել','Kirish','Кіру','دخول'],
'Дополнительно':['Լրացուցիչ','Qo‘shimcha','Қосымша','إضافات'],
'В работе':['Ընթացքում','Jarayonda','Жұмыста','قيد التنفيذ'],
'Принято доктором':['Բժշկի կողմից ընդունված','Shifokor qabul qildi','Дәрігер қабылдады','قبله الطبيب'],
'Проверка качества':['Որակի ստուգում','Sifat nazorati','Сапаны тексеру','فحص الجودة'],
'Материал':['Նյութ','Material','Материал','المادة'],
'Срок изготовления':['Պատրաստման ժամկետ','Ishlab chiqarish muddati','Өндіру мерзімі','مدة التصنيع'],
'Оформить заказ':['Տեղադրել պատվերը','Buyurtma berish','Тапсырысты рәсімдеу','تقديم الطلب'],
'Состав заказа':['Պատվերի կազմը','Buyurtma tarkibi','Тапсырыс құрамы','محتوى الطلب'],
'Отправлено на доработку':['Ուղարկվել է վերամշակման','Qayta ishlashga yuborildi','Қайта өңдеуге жіберілді','أُرسل لإعادة العمل'],
'Изготовление':['Արտադրություն','Ishlab chiqarish','Өндіру','التصنيع'],
'Моделирование':['Մոդելավորում','Modellashtirish','Модельдеу','النمذجة'],
'Эстетика':['Էսթետիկա','Estetika','Эстетика','الجماليات'],
'Контроль качества':['Որակի վերահսկում','Sifat nazorati','Сапаны бақылау','مراقبة الجودة'],
'Доставка в клинику':['Առաքում կլինիկա','Klinikaga yetkazish','Клиникаға жеткізу','التوصيل إلى العيادة'],
'Работа принята':['Աշխատանքն ընդունված է','Ish qabul qilindi','Жұмыс қабылданды','تم قبول العمل'],
'На доработке':['Վերամշակման փուլում','Qayta ishlashda','Қайта өңдеуде','قيد إعادة العمل'],
'Сумма заказа':['Պատվերի գումարը','Buyurtma summasi','Тапсырыс сомасы','مبلغ الطلب'],
'Заказ успешно создан':['Պատվերը հաջողությամբ ստեղծվել է','Buyurtma muvaffaqiyatli yaratildi','Тапсырыс сәтті жасалды','تم إنشاء الطلب بنجاح'],
'Заказы успешно созданы':['Պատվերները հաջողությամբ ստեղծվել են','Buyurtmalar muvaffaqiyatli yaratildi','Тапсырыстар сәтті жасалды','تم إنشاء الطلبات بنجاح'],
'Пожалуйста, заполните все обязательные поля':['Լրացրեք բոլոր պարտադիր դաշտերը','Barcha majburiy maydonlarni to‘ldiring','Барлық міндетті өрістерді толтырыңыз','يرجى ملء جميع الحقول المطلوبة'],
'Выберите страну':['Ընտրեք երկիրը','Mamlakatni tanlang','Елді таңдаңыз','اختر الدولة'],
'На главную':['Գլխավոր էջ','Bosh sahifa','Басты бет','الرئيسية'],
'Язык интерфейса':['Ինտերֆեյսի լեզուն','Interfeys tili','Интерфейс тілі','لغة الواجهة'],
'Выберите язык':['Ընտրեք լեզուն','Tilni tanlang','Тілді таңдаңыз','اختر اللغة'],
'Все →':['Բոլորը →','Barchasi →','Барлығы →','الكل ←'],
'+ Добавить ещё один заказ в корзину':['+ Ավելացնել ևս մեկ պատվեր զամբյուղում','+ Savatga yana bir buyurtma qo‘shish','+ Себетке тағы бір тапсырыс қосу','+ إضافة طلب آخر إلى السلة'],
'Дата рождения':['Ծննդյան ամսաթիվ','Tug‘ilgan sana','Туған күні','تاريخ الميلاد'],
'Новое ФИО':['Նոր անուն-ազգանուն','Yangi F.I.Sh.','Жаңа аты-жөні','الاسم الكامل الجديد'],
'Новая дата рождения':['Նոր ծննդյան ամսաթիվ','Yangi tug‘ilgan sana','Жаңа туған күні','تاريخ الميلاد الجديد'],
'Номера зубов':['Ատամների համարներ','Tish raqamlari','Тіс нөмірлері','أرقام الأسنان'],
'Новый режим':['Նոր ռեժիմ','Yangi rejim','Жаңа режим','الوضع الجديد'],
'Новая услуга':['Նոր ծառայություն','Yangi xizmat','Жаңа қызмет','خدمة جديدة'],
'Новый срок':['Նոր ժամկետ','Yangi muddat','Жаңа мерзім','الموعد الجديد'],
'Новый цвет':['Նոր գույն','Yangi rang','Жаңа түс','اللون الجديد'],
'Новый комментарий':['Նոր մեկնաբանություն','Yangi izoh','Жаңа түсініктеме','تعليق جديد'],
'Выберите один пункт. Изменение применится после подтверждения главным техником.':['Ընտրեք մեկ կետ։ Փոփոխությունը կկիրառվի գլխավոր տեխնիկի հաստատումից հետո։','Bitta bandni tanlang. O‘zgarish bosh texnik tasdiqlaganidan keyin qo‘llanadi.','Бір тармақты таңдаңыз. Өзгеріс бас техник растағаннан кейін қолданылады.','اختر عنصرًا واحدًا. سيُطبّق التغيير بعد موافقة كبير الفنيين.'],
'ФИО пациента':['Հիվանդի անուն-ազգանունը','Bemorning F.I.Sh.','Пациенттің аты-жөні','الاسم الكامل للمريض'],
'Режим / челюсть':['Ռեժիմ / ծնոտ','Rejim / jag‘','Режим / жақ','الوضع / الفك'],
'Услуга':['Ծառայություն','Xizmat','Қызмет','الخدمة'],
'ЯНДЕКС ДИСК':['YANDEX DISK','YANDEX DISK','YANDEX DISK','YANDEX DISK'],
'Отправить заказ на доработку':['Ուղարկել պատվերը վերամշակման','Buyurtmani qayta ishlashga yuborish','Тапсырысты қайта өңдеуге жіберу','إرسال الطلب لإعادة العمل'],
'До 10 файлов, каждый до 200 МБ':['Մինչև 10 ֆայլ, յուրաքանչյուրը մինչև 200 ՄԲ','10 tagacha fayl, har biri 200 MB gacha','10 файлға дейін, әрқайсысы 200 МБ дейін','حتى 10 ملفات، كل ملف حتى 200 ميغابايت'],
'Интерактивный предпросмотр из HTML-файла':['HTML ֆայլի ինտերակտիվ նախադիտում','HTML faylidan interaktiv ko‘rib chiqish','HTML файлынан интерактивті алдын ала қарау','معاينة تفاعلية من ملف HTML'],
'Пн':['Երկ','Du','Дс','الإثنين'],
'Вт':['Երք','Se','Сс','الثلاثاء'],
'Ср':['Չոր','Chor','Ср','الأربعاء'],
'Чт':['Հնգ','Pay','Бс','الخميس'],
'Пт':['Ուրբ','Jum','Жм','الجمعة'],
'Сб':['Շբթ','Shan','Сб','السبت'],
'Вс':['Կիր','Yak','Жс','الأحد'],
'Планирование и диагностика':['Պլանավորում և ախտորոշում','Rejalashtirish va diagnostika','Жоспарлау және диагностика','التخطيط والتشخيص'],
'Вкладки':['Ներդիրներ','Inleylar','Қоймалар','الحشوات'],
'Реставрации':['Վերականգնումներ','Restavratsiyalar','Қалпына келтірулер','الترميمات'],
'Протетика':['Պրոթեզավորում','Protezlash','Протездеу','التعويضات السنية'],
'Балочные конструкции':['Балային կոնստրուկցիաներ','Balkali konstruksiyalar','Балкалы құрылымдар','تركيبات القضبان'],
'Каппы':['Կապպաներ','Kappalar','Каппалар','الواقيات السنية'],
'Сплинты':['Սպլինտներ','Splintlar','Сплинттер','الجبائر'],
'Ложки прикуса':['Կծվածքի գդալներ','Tish qoliplari','Тістем қасықтары','قوالب العضة'],
'Хирургические шаблоны':['Վիրաբուժական ձևանմուշներ','Jarrohlik shablonlari','Хирургиялық үлгілер','قوالب جراحية'],
'Дополнительные работы':['Լրացուցիչ աշխատանքներ','Qo‘shimcha ishlar','Қосымша жұмыстар','أعمال إضافية'],
'Wax up цифровой':['Թվային Wax up','Raqamli Wax up','Цифрлық Wax up','Wax up رقمي'],
'Wax up аналоговый':['Անալոգային Wax up','Analog Wax up','Аналогтық Wax up','Wax up تقليدي'],
'Wax up по Славичеку':['Wax up՝ ըստ Սլավիչեկի','Slavichek usuli bo‘yicha Wax up','Славичек әдісімен Wax up','Wax up وفق سلافيتشيك'],
'Вкладка культевая':['Կուլտային ներդիր','Shtiftli inley','Түбірлік салма','حشوة دعامة'],
'Вкладка культевая ZrO2/Дисиликат лития':['ZrO2/լիթիումի դիսիլիկատ կուլտային ներդիր','ZrO2/litiy disilikat shtiftli inley','ZrO2/литий дисиликат түбірлік салма','حشوة دعامة من ZrO2/ثنائي سيليكات الليثيوم'],
'PMMA коронка CAD/CAM':['PMMA CAD/CAM պսակ','PMMA CAD/CAM qoplama','PMMA CAD/CAM сауыты','تاج PMMA بتقنية CAD/CAM'],
'Композитная коронка CAD/CAM':['Կոմպոզիտային CAD/CAM պսակ','Kompozit CAD/CAM qoplama','Композит CAD/CAM сауыты','تاج مركب بتقنية CAD/CAM'],
'Коронка дисиликат лития':['Լիթիումի դիսիլիկատե պսակ','Litiy disilikat qoplama','Литий дисиликат сауыты','تاج من ثنائي سيليكات الليثيوم'],
'Дисиликат лития по Славичеку':['Լիթիումի դիսիլիկատ՝ ըստ Սլավիչեկի','Slavichek usuli bo‘yicha litiy disilikat','Славичек әдісімен литий дисиликат','ثنائي سيليكات الليثيوم وفق سلافيتشيك'],
'Коронка, винир на рефракторе':['Պսակ, վինիր հրակայուն մոդելի վրա','Refraktor ustida qoplama yoki vinir','Отқа төзімді модельдегі сауыт немесе винир','تاج أو قشرة على نموذج حراري'],
'Одиночная реставрация OPTISHADE/MATISSE':['Մեկ ատամի վերականգնում OPTISHADE/MATISSE','Yakka restavratsiya OPTISHADE/MATISSE','Жеке тіс реставрациясы OPTISHADE/MATISSE','ترميم سن واحد OPTISHADE/MATISSE'],
'Индивидуальный Ti абатмент (Ti-включая вине)':['Անհատական Ti աբաթմենտ (Ti ներառյալ)','Individual Ti abutment (Ti bilan)','Жеке Ti абатменті (Ti қоса)','دعامة Ti مخصصة (تشمل Ti)'],
'Индивидуальный ZrO2 абатмент (Без Ti-Base)':['Անհատական ZrO2 աբաթմենտ (առանց Ti-Base)','Individual ZrO2 abutment (Ti-Base siz)','Жеке ZrO2 абатменті (Ti-Base жоқ)','دعامة ZrO2 مخصصة (من دون Ti-Base)'],
'Титановое основание Geo Medi':['Geo Medi տիտանե հիմք','Geo Medi titan asosi','Geo Medi титан негізі','قاعدة تيتانيوم Geo Medi'],
'Титановое основание Аналог':['Անալոգային տիտանե հիմք','Analog titan asosi','Аналогтық титан негізі','قاعدة تيتانيوم تقليدية'],
'Цельнофрезерованная балка CoCr за единицу':['Ամբողջությամբ ֆրեզավորված CoCr բալկա՝ մեկ միավորի համար','Yaxlit frezalangan CoCr balkasi — dona uchun','Тұтас фрезерленген CoCr балкасы — бір данаға','عارضة CoCr مفرزة بالكامل للوحدة'],
'Цельнофрезерованная балка Ti за единицу':['Ամբողջությամբ ֆրեզավորված Ti բալկա՝ մեկ միավորի համար','Yaxlit frezalangan Ti balkasi — dona uchun','Тұтас фрезерленген Ti балкасы — бір данаға','عارضة Ti مفرزة بالكامل للوحدة'],
'Бруксчекер':['Բրուքսչեքեր','Brukscheker','Бруксчекер','واقي صرير الأسنان'],
'Каппа для отбеливания':['Սպիտակեցման կապպա','Oqartirish kappasi','Ағартуға арналған каппа','واقي تبييض الأسنان'],
'Каппа ретенционная':['Ռետենցիոն կապպա','Retension kappasi','Ретенциялық каппа','واقي تثبيت'],
'Каппа разобщающая':['Ապաբաժանող կապպա','Ajratuvchi kappa','Ажыратқыш каппа','واقي فصل'],
'Релаксационная шина':['Ռելաքսացիոն շինա','Relaksatsion shina','Релаксациялық шина','جبيرة استرخاء'],
'Депрограмматор Койса':['Կոյսի դեփրոգրամատոր','Koys depressogrammasi','Койс депрограмматоры','جهاز كويز لإزالة البرمجة'],
'Каппа-сплинт для завышения прикуса (ORTHOTIC)':['Կապպա-սպլինտ՝ կծվածքի բարձրացման համար (ORTHOTIC)','Tishlashni ko‘tarish uchun kappa-splint (ORTHOTIC)','Тістемді көтеруге арналған каппа-сплинт (ORTHOTIC)','واقي جبيرة لرفع العضة (ORTHOTIC)'],
'Сплинт с функциональными буграми':['Սպլինտ՝ ֆունկցիոնալ թմբիկներով','Funksional do‘mboqli splint','Функционалдық төмпешіктері бар сплинт','جبيرة ذات حدبات وظيفية'],
'Индивидуальная ложка':['Անհատական գդալ','Individual qolip qoshig‘i','Жеке қасық','قالب مخصص'],
'Прикусной шаблон':['Կծվածքի ձևանմուշ','Tishlash shabloni','Тістем үлгісі','قالب العضة'],
'Прикусной шаблон на жёстком базисе':['Կծվածքի ձևանմուշ՝ կոշտ հիմքով','Qattiq asosli tishlash shabloni','Қатты негіздегі тістем үлгісі','قالب عضة بقاعدة صلبة'],
'Прикусной шаблон на жёстком базисе с фиксацией к имплантатам на магнитах':['Կծվածքի ձևանմուշ՝ կոշտ հիմքով և մագնիսական ամրացմամբ իմպլանտներին','Qattiq asosli, implantlarga magnit bilan mahkamlanadigan tishlash shabloni','Импланттарға магнитпен бекітілетін қатты негізді тістем үлгісі','قالب عضة بقاعدة صلبة مع تثبيت مغناطيسي على الزرعات'],
'Хирургический навигационный шаблон на 1 имплантант':['Վիրաբուժական ուղեցույց՝ 1 իմպլանտի համար','1 ta implant uchun jarrohlik yo‘riqnomasi','1 имплантқа арналған хирургиялық үлгі','قالب توجيه جراحي لزرعة واحدة'],
'Дополнительное гнездо под имплантант в хирургическом шаблоне':['Լրացուցիչ տեղ իմպլանտի համար վիրաբուժական ձևանմուշում','Jarrohlik shablonida implant uchun qo‘shimcha uyacha','Хирургиялық үлгіде имплантқа арналған қосымша ұяшық','موضع إضافي للزرعة في القالب الجراحي'],
'Маркировочный шаблон':['Նշագրման ձևանմուշ','Belgilash shabloni','Таңбалау үлгісі','قالب تحديد'],
'Шаблон под КТ рентгеноконтрастный':['Ռենտգենակոնտրաստ ձևանմուշ՝ ԿՏ-ի համար','KT uchun rentgen-kontrast shablon','КТ-ға арналған рентгенконтраст үлгі','قالب ظليل للأشعة للتصوير المقطعي'],
'Ожидает подтверждения':['Սպասում է հաստատման','Tasdiqni kutmoqda','Растауды күтуде','بانتظار التأكيد'],
'Ожидает распределения':['Սպասում է բաշխման','Taqsimlanishni kutmoqda','Бөлуді күтуде','بانتظار التوزيع'],
'Приём / Доставка':['Ընդունում / առաքում','Qabul / Yetkazib berish','Қабылдау / жеткізу','الاستلام / التوصيل'],
'CAD на согласовании у врача':['CAD-ը բժշկի հաստատման փուլում է','CAD shifokor tasdig‘ida','CAD дәрігердің келісуінде','CAD بانتظار موافقة الطبيب'],
'Препрод':['Նախապատրաստում','Dastlabki tayyorgarlik','Алдын ала өңдеу','التحضير الأولي'],
'Аналоговая подготовка':['Անալոգային նախապատրաստում','Analog tayyorgarlik','Аналогтық дайындау','التحضير التقليدي'],
'Изготовление':['Արտադրություն','Ishlab chiqarish','Өндіру','التصنيع'],
'Доработка и эстетика':['Վերամշակում և էսթետիկա','Qayta ishlash va estetika','Қайта өңдеу және эстетика','إعادة العمل والجماليات'],
'Контроль качества':['Որակի վերահսկում','Sifat nazorati','Сапаны бақылау','مراقبة الجودة'],
'Завершен':['Ավարտված է','Yakunlandi','Аяқталды','مكتمل'],
'Коротко укажите причину':['Հակիրճ նշեք պատճառը','Sababni qisqacha yozing','Себебін қысқаша көрсетіңіз','اذكر السبب باختصار'],
'Загружен на Яндекс Диск':['Վերբեռնվել է Yandex Disk','Yandex Disk’ka yuklandi','Yandex Disk-ке жүктелді','تم الرفع إلى Yandex Disk'],
'Не удалось загрузить':['Չհաջողվեց վերբեռնել','Yuklab bo‘lmadi','Жүктеу мүмкін болмады','تعذر الرفع'],
'Ожидает загрузки':['Սպասում է վերբեռնման','Yuklash kutilmoqda','Жүктеуді күтуде','بانتظار الرفع'],
'Загрузка':['Վերբեռնում','Yuklanmoqda','Жүктелуде','جارٍ الرفع'],
'Добавить другие файлы':['Ավելացնել այլ ֆայլեր','Boshqa fayllarni qo‘shish','Басқа файлдарды қосу','إضافة ملفات أخرى'],
'Введите новый комментарий':['Մուտքագրեք նոր մեկնաբանություն','Yangi izohni kiriting','Жаңа түсініктеме енгізіңіз','أدخل تعليقًا جديدًا'],
'Причина':['Պատճառ','Sabab','Себеп','السبب'],
'Комментарий:':['Մեկնաբանություն՝','Izoh:','Түсініктеме:','تعليق:'],
'Все события':['Բոլոր իրադարձությունները','Barcha hodisalar','Барлық оқиғалар','كل الأحداث']
};
function clinicTranslate(value){
  const locale=(()=>{try{return localStorage.getItem('create-dental-locale')||'ru'}catch{return 'ru'}})();
  if(locale==='ru')return value;
  const index=clinicLocaleOptions.indexOf(locale)-1;
  if(clinicTranslations[value])return clinicTranslations[value][index]||value;
  for(const [source,translations] of Object.entries(clinicTranslations)){
    if(!source.includes('{…}'))continue;
    const [before,after]=source.split('{…}');
    if(value.startsWith(before)&&value.endsWith(after)&&value.length>=before.length+after.length){
      const dynamic=value.slice(before.length,value.length-after.length);
      return (translations[index]||source).replace('{…}',dynamic);
    }
  }
  return value;
}
let clinicTranslationObserver=null;
function clinicTranslateDom(root=document.querySelector('#app')){
  if(!root)return;
  const locale=(()=>{try{return localStorage.getItem('create-dental-locale')||'ru'}catch{return 'ru'}})();
  if(locale==='am')root.lang='hy';else root.lang=locale;
  root.dir=locale==='ar'?'rtl':'ltr';
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    const parent=node.parentElement;if(!parent||parent.closest('.bubble,.file-card strong,.recent-message small,[data-user-content]'))continue;
    const raw=node.nodeValue,trimmed=raw.trim();if(!trimmed)continue;
    const translated=clinicTranslate(trimmed);
    if(translated!==trimmed)node.nodeValue=raw.replace(trimmed,translated);
    else {
      const prefix=trimmed.match(/^(Услуга|Файл|Создан|Сдачи на|Загрузка)\s+(.+)$/);
      if(prefix){const label=clinicTranslate(prefix[1]);if(label!==prefix[1])node.nodeValue=raw.replace(trimmed,`${label} ${prefix[2]}`)}
      const welcome=trimmed.match(/^Добро пожаловать,\s*(.+)!$/);if(welcome&&locale!=='ru'){const labels={am:'Բարի գալուստ,',uz:'Xush kelibsiz,',kk:'Қош келдіңіз,',ar:'مرحبًا،'};node.nodeValue=raw.replace(trimmed,`${labels[locale]||'Welcome,'} ${welcome[1]}!`)}
    }
  }
  root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(element=>{
    for(const attribute of ['placeholder','title','aria-label']){
      const value=element.getAttribute(attribute);if(!value)continue;const translated=clinicTranslate(value);if(translated!==value)element.setAttribute(attribute,translated);
    }
  });
  root.querySelectorAll('select option').forEach(option=>{
    const raw=option.textContent.trim();const translated=clinicTranslate(raw);if(translated!==raw){if(!option.hasAttribute('value'))option.value=raw;option.textContent=translated}
  });
  root.querySelectorAll('[alt]').forEach(element=>{const value=element.getAttribute('alt');if(value){const translated=clinicTranslate(value);if(translated!==value)element.setAttribute('alt',translated)}});
  if(!clinicTranslationObserver){clinicTranslationObserver=new MutationObserver(()=>{if(portalUser?.role==='clinic')clinicTranslateDom(root)});clinicTranslationObserver.observe(root,{subtree:true,childList:true,characterData:true,attributes:false})}
}

function portalFooter(){return `<footer class="portal-footer"><span class="portal-footer-copy">© 2019–2026 Create Dental</span><span class="portal-footer-tagline">Для клиник, которым важен результат</span><a class="portal-footer-email" href="mailto:orders@createdental.io">orders@createdental.io</a><nav class="portal-footer-legal" aria-label="Правовые документы"><a href="/assets/legal/privacy.html">Политика конфиденциальности</a><a href="/assets/legal/consent-data.html">Согласие на обработку персональных данных</a></nav></footer>`}
function shell(content){$('#app').innerHTML=`${sidebar()}<button type="button" class="mobile-drawer-backdrop" data-action="menu-close" aria-label="Закрыть меню"></button><div class="shell ${sidebarCollapsed()?'sidebar-shell-collapsed':''}">${header()}<main class="content">${content}</main>${portalFooter()}</div>${mobileBottomNav()}<div class="toast ${state.toast?'visible':''}">${escapeHtml(state.toast)}</div>`;if(portalUser?.role==='clinic')clinicTranslateDom($('#app'));}
function title(text,sub='',right=''){return `<div class="page-title"><div><h1>${text}</h1>${sub?`<p>${sub}</p>`:''}</div>${right}</div>`}
function tabs(items,selected,action='filter',className=''){return `<div class="tabs ${className}">${items.map(([label,count,key=label])=>`<button class="tab ${selected===key?'active':''}" data-action="${action}" data-value="${key}">${label}${count!==undefined?` <span class="count">${count}</span>`:''}</button>`).join('')}</div>`}
const clinicOrderDoctorLabel=order=>String(order?.doctor||order?.doctorName||order?.dentist||'').trim()||'Не указан';
const clinicTableWorkLabel=order=>{
  const groups=Array.isArray(order?.variants)&&order.variants.length?groupSurgicalSockets(order.variants).length:0;
  return groups>1||/^Несколько услуг(?:\s*\(\d+\))?$/i.test(String(order?.work||''))?'Несколько услуг':orderWorkLabel(order);
};
function orderTable(list){const heading=(key,label)=>`<th aria-sort="${state.sortKey===key?(state.sortDirection==='asc'?'ascending':'descending'):'none'}"><button class="order-sort" data-order-sort="${key}">${label}<span aria-hidden="true">${state.sortKey===key?(state.sortDirection==='asc'?'↑':'↓'):'↕'}</span></button></th>`;return `<div class="table-wrap"><table class="orders-table"><thead><tr><th>ID заказа</th><th>Пациент</th>${heading('doctor','Врач')}${heading('work','Тип работы')}${heading('createdAt','Создан')}${heading('date','Срок')}${heading('status','Статус')}${heading('sum','Сумма')}</tr></thead><tbody>${list.map(o=>`<tr data-order="${escapeHtml(o.id)}" tabindex="0"><td><a class="order-row-link" href="${pathFor('clinic','detail',o.id)}" data-order="${escapeHtml(o.id)}"><strong>${escapeHtml(displayOrderId(o))}</strong></a></td><td>${escapeHtml(o.patient)}</td><td>${escapeHtml(clinicOrderDoctorLabel(o))}</td><td>${escapeHtml(clinicTableWorkLabel(o))}</td><td>${o.createdAt?new Date(o.createdAt).toLocaleDateString(clinicIntlLocale()):'—'}</td><td>${escapeHtml(orderDateLabel(o.date))}</td><td>${badge(escapeHtml(displayClientStatus(o.status)))}</td><td><strong>${escapeHtml(o.sum)}</strong></td></tr>`).join('')||'<tr><td colspan="8" class="empty">Заказы не найдены</td></tr>'}</tbody></table></div>`}
function orderDate(order){if(!/^\d{2}\.\d{2}\.\d{4}$/.test(String(order.date||'')))return new Date(Number.NaN);const [day,month,year]=order.date.split('.').map(Number);return new Date(year,month-1,day)}
function deadlineCalendar(){
  const month=state.calendarMonth;
  const year=month.getFullYear(),monthNumber=month.getMonth();
  const daysInMonth=new Date(year,monthNumber+1,0).getDate();
  const leading=(new Date(year,monthNumber,1).getDay()+6)%7;
  const monthName=new Intl.DateTimeFormat(clinicIntlLocale(),{month:'long'}).format(month);
  const label=monthName.charAt(0).toUpperCase()+monthName.slice(1)+' '+year;
  const due=currentOrders().filter(order=>{const date=orderDate(order);return date.getFullYear()===year&&date.getMonth()===monthNumber});
  const cells=Array.from({length:leading},()=>'<span class="calendar-blank"></span>');
  for(let day=1;day<=daysInMonth;day++){
    const statuses=due.filter(order=>orderDate(order).getDate()===day).map(order=>statusClass(order.status));
    const dayLabel=new Intl.DateTimeFormat(clinicIntlLocale(),{day:'numeric',month:'long'}).format(new Date(year,monthNumber,day));
    cells.push(`<button class="calendar-day ${state.calendarDay===day?'selected':''}" data-action="calendar-day" data-value="${day}" aria-label="${dayLabel}, заказов: ${statuses.length}"><span>${day}</span><i class="calendar-markers">${statuses.length?'<b></b>':''}</i></button>`);
  }
  const selected=Number.isInteger(state.calendarDay)?due.filter(order=>orderDate(order).getDate()===state.calendarDay):[];
  const selectedDate=Number.isInteger(state.calendarDay)?`${String(state.calendarDay).padStart(2,'0')}.${String(monthNumber+1).padStart(2,'0')}.${year}`:'';
  const selectedTitle=Number.isInteger(state.calendarDay)?`Сдачи на ${new Intl.DateTimeFormat(clinicIntlLocale(),{day:'numeric',month:'long'}).format(new Date(year,monthNumber,state.calendarDay))}`:'Выберите дату';
  return `<section class="dashboard-card deadline-card"><h2>Календарь сроков</h2><div class="calendar-head"><strong>${label}</strong><div><button data-action="calendar-prev" aria-label="Предыдущий месяц">‹</button><button data-action="calendar-next" aria-label="Следующий месяц">›</button></div></div><div class="calendar-grid">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(day=>`<span class="calendar-weekday">${day}</span>`).join('')}${cells.join('')}</div><div class="dashboard-card-heading"><h3>${selectedTitle}</h3>${selected.length?`<button data-action="calendar-show-all" data-value="${selectedDate}">Все (${selected.length}) →</button>`:''}</div><div class="upcoming-list">${selected.length?selected.slice(0,3).map(order=>`<a class="upcoming-order" href="${pathFor('clinic','detail',order.id)}" data-order="${escapeHtml(order.id)}"><i class="deadline-status ${statusClass(order.status)}"></i><span><strong>${escapeHtml(displayOrderId(order))}</strong></span></a>`).join(''):'<p class="dashboard-empty">В этот день нет сдачи</p>'}</div></section>`;
}
function recentMessagesMarkup(){
  const recent=state.messages.slice(-3).reverse();
  return recent.length?recent.map(message=>{const bot=message.from==='bot',support=message.from==='support',clientName=message.source==='telegram'&&message.sender?'Клиент':'Вы',supportName='Create Dental Team',preview=message.text||(message.attachment?.kind==='photo'?'Послано изображение':message.attachment?`Файл: ${message.attachment.name}`:'');return `<a class="recent-message" href="${pathFor('clinic','messages')}" data-page="messages"><span class="recent-avatar ${support||bot?'support':''}">${bot?'AI':support?'CD':'Я'}</span><span><strong>${bot?'Ответ AI':support?escapeHtml(supportName):escapeHtml(clientName)}</strong><small>${escapeHtml(preview)}</small></span><time>${new Date(message.time).toLocaleTimeString(clinicIntlLocale(),{hour:'2-digit',minute:'2-digit'})}</time></a>`}).join(''):'<div class="dashboard-empty">Сообщений пока нет. <a class="text-link" href="'+pathFor('clinic','messages')+'" data-page="messages">Написать в поддержку →</a></div>';
}
function recentMessagesCard(){return `<section class="dashboard-card recent-card"><div class="dashboard-card-heading"><h2>Последние сообщения</h2><a class="text-link" href="${pathFor('clinic','messages')}" data-page="messages">Все →</a></div><div id="recent-messages">${recentMessagesMarkup()}</div></section>`}
function currentOrders(){
  let overrides={};
  try {overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{}} catch {overrides={}}
  const status={"Ожидает распределения":"Новый","Подготовка":"В работе","Моделирование":"Моделирование","Согласование CAD":"На согласовании","Изготовление":"В работе","Контроль качества":"На согласовании","Работа принята":"Работа принята","В доставке":"В пути к вам","На доработке":"На доработке","Принято доктором":"Принято","Готово к выдаче":"Работа принята"};
  return orders.filter(order=>order.clinicId===portalUser?.subjectId).map(order=>({...order,status:status[overrides[order.id]?.stage]||order.status}));
}
function clinicHasRestoration(details={}){
  const variants=Array.isArray(details.variants)&&details.variants.length?details.variants:[details];
  return variants.some(item=>String(item?.work||details.work||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е')==='реставрации');
}
function clinicStageValue(details={}){
  const stage=String(details.stage||'').trim();
  if(stage)return stage;
  return ({'Новый':'Ожидает распределения','В работе':'Изготовление','Моделирование':'Моделирование','На согласовании':'Согласование CAD','Согласование':'Согласование CAD','На доработке':'На доработке','В пути к вам':'В доставке','Принято':'Принято доктором','Работа принята':'Работа принята'}[String(details.status||'').trim()]||'Ожидает распределения');
}
function clinicVisibleProductionStages(details={}){
  const progress=workProgress(details,details);
  return progress.steps.map(id=>({id,label:id==='new'?'Новый':productionFlowLabel(id),matches:[id]}));
}
function clinicOrderProgress(details){return workProgress(details,details).progress;}
function orderTabs(){
  const list=currentOrders();
  return [['Все',list.length,'Все'],['Новые',list.filter(o=>o.status==='Новый').length,'Новые'],['В работе',list.filter(o=>o.status==='В работе').length,'В работе'],['CAD на согласовании у врача',list.filter(o=>['На согласовании','Согласование'].includes(o.status)).length,'На согласовании'],['Приняты',list.filter(o=>o.status==='Работа принята').length,'Приняты'],['Доставка в клинику',list.filter(o=>o.status==='В пути к вам').length,'В пути к вам'],['На доработке',list.filter(o=>o.status==='На доработке').length,'На доработке'],['Принято врачом',list.filter(o=>o.status==='Принято').length,'Принято']];
}
function dashboard(){
  const list=currentOrders();
  const stats=[['orders',list.filter(o=>!['Принято','Завершен'].includes(o.status)).length,'Активных заказов','blue'],['clock',list.filter(o=>['На согласовании','Согласование'].includes(o.status)).length,'CAD на согласовании у врача','orange'],['user',list.filter(o=>o.status==='В работе').length,'В работе','navy'],['heart',list.filter(o=>['Работа принята','В пути к вам','Принято','Завершен'].includes(o.status)).length,'После приемки','green']];
  shell(`${title('Добро пожаловать, '+escapeHtml(clinicRecord()?.name||'клиника')+'!','Создавайте заказы, отслеживайте статус и получайте готовые работы в срок.',button(`${icon('plus',16)} Создать новый заказ`,'new'))}<div class="stats">${stats.map(([ico,n,label,color])=>`<div class="stat card"><span class="stat-icon ${color}">${icon(ico,25)}</span><div><strong>${n}</strong><span>${label}</span></div></div>`).join('')}</div><div class="dashboard-grid"><div class="dashboard-main"><section class="hero"><div><h2>Качество в каждой детали</h2><p>Современные технологии.<br>Индивидуальный подход.<br>Надежные сроки.</p></div><img src="${assets}banner-restoration.webp" alt="Керамические зубные конструкции"></section><div class="section-heading"><h2>Мои заказы</h2><a class="text-link" href="${pathFor('clinic','orders')}" data-page="orders">Все заказы →</a></div>${clinicMobileUI.controlsMarkup()}<div class="clinic-dashboard-status-tabs">${tabs(orderTabs(),state.filter)}</div>${orderTable(filteredOrders().slice(0,4))}</div><aside class="dashboard-aside">${deadlineCalendar()}${recentMessagesCard()}</aside></div>`);
}
function clinicOrderMonthKey(order){const date=new Date(order.createdAt||0);return Number.isNaN(date.getTime())?'':`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`}
function clinicOrderMonthLabel(key){const [year,month]=key.split('-').map(Number),name=new Intl.DateTimeFormat(clinicIntlLocale(),{month:'long'}).format(new Date(year,month-1,1));return `${name.charAt(0).toUpperCase()+name.slice(1)} ${year}`}
function clinicOrderWorkTypes(order){return orderWorkTypes(order).filter(type=>!/^Несколько услуг(?:\s*\(\d+\))?$/i.test(type))}
function clinicMatchesQuickStatus(order,key){
  const matches={'Новые':['Новый'],'В работе':['В работе'],'На согласовании':['На согласовании','Согласование'],'Приняты':['Работа принята'],'В пути к вам':['В пути к вам'],'На доработке':['На доработке'],'Принято':['Принято']};
  return !matches[key]||matches[key].includes(order.status);
}
function clinicMobileSnapshot(){
  const all=currentOrders(),status=state.orderStatusFilter?`exact:${state.orderStatusFilter}`:state.filter;
  const statuses=orderTabs().map(([label,count,key])=>({label:key==='Все'?'Все заказы':label,count,value:key}));
  const extra=all.filter(order=>!statuses.slice(1).some(item=>clinicMatchesQuickStatus(order,item.value)));
  for(const label of [...new Set(extra.map(order=>displayClientStatus(order.status)))])statuses.push({label,value:`exact:${label}`,count:all.filter(order=>displayClientStatus(order.status)===label).length});
  if(!statuses.some(item=>item.value===status))statuses.push({label:state.orderStatusFilter||state.filter,value:status,count:all.filter(order=>displayClientStatus(order.status)===state.orderStatusFilter).length});
  const works=[{label:'Все типы работ',value:''},...[...new Set(all.flatMap(clinicOrderWorkTypes))].sort((a,b)=>a.localeCompare(b,'ru')).map(value=>({label:value,value}))];
  const months=[{label:'За всё время',value:''},...[...new Set(all.map(clinicOrderMonthKey).filter(Boolean))].sort().reverse().map(value=>({label:clinicOrderMonthLabel(value),value}))];
  return {statuses,works,months,filters:{status,work:state.orderWorkFilter,month:state.orderMonthFilter}};
}
function setClinicMobileStatus(value){
  state.filter=value.startsWith('exact:')?'Все':value;
  state.orderStatusFilter=value.startsWith('exact:')?value.slice(6):'';
}
function rememberClinicForm(){
  const form=document.getElementById('clinic-form');if(!form)return;
  state.clinicDrafts[state.clinicTab]=Object.fromEntries([...new FormData(form)].filter(([name])=>name!=='logoFile'));
}
const clinicMobileUI=createClinicMobileUI({
  getSnapshot:clinicMobileSnapshot,
  enabled:()=>portalUser?.role==='clinic',
  chooseStatus(value){setClinicMobileStatus(value);render()},
  applyFilters(filters){setClinicMobileStatus(filters.status);state.orderMonthFilter=filters.month;state.orderWorkFilter=filters.work;render()},
  chooseClinicSection(section){rememberClinicForm();state.clinicMobileSection=section;if(section)state.clinicTab=section;render();window.scrollTo(0,0)},
});
function filteredOrders(){let list=currentOrders();if(state.filter==='Новые')list=list.filter(o=>o.status==='Новый');else if(state.filter==='В работе')list=list.filter(o=>o.status==='В работе');else if(state.filter==='На согласовании')list=list.filter(o=>['На согласовании','Согласование'].includes(o.status));else if(state.filter==='Приняты')list=list.filter(o=>o.status==='Работа принята');else if(state.filter==='В пути к вам')list=list.filter(o=>o.status==='В пути к вам');else if(state.filter==='На доработке')list=list.filter(o=>o.status==='На доработке');else if(state.filter==='Принято')list=list.filter(o=>o.status==='Принято');if(state.dueDateFilter)list=list.filter(o=>o.date===state.dueDateFilter);if(state.orderMonthFilter)list=list.filter(o=>clinicOrderMonthKey(o)===state.orderMonthFilter);if(state.orderWorkFilter)list=list.filter(o=>clinicOrderWorkTypes(o).includes(state.orderWorkFilter));if(state.orderStatusFilter)list=list.filter(o=>displayClientStatus(o.status)===state.orderStatusFilter);if(state.orderDoctorFilter)list=list.filter(o=>state.orderDoctorFilter==='__none__'?!String(o?.doctor||o?.doctorName||o?.dentist||'').trim():clinicOrderDoctorLabel(o)===state.orderDoctorFilter);if(state.query)list=list.filter(o=>Object.values(o).some(v=>String(v).toLowerCase().includes(state.query.toLowerCase())));if(['doctor','work','createdAt','date','status','sum'].includes(state.sortKey)){const key=state.sortKey,sign=state.sortDirection==='asc'?1:-1;list.sort((a,b)=>{let x=key==='doctor'?clinicOrderDoctorLabel(a):a[key]??'',y=key==='doctor'?clinicOrderDoctorLabel(b):b[key]??'';if(key==='sum'){x=Number(String(x).replace(/\D/g,''));y=Number(String(y).replace(/\D/g,''));return (x-y)*sign}if(key==='date'){x=String(x).split('.').reverse().join('-');y=String(y).split('.').reverse().join('-')}return String(x).localeCompare(String(y),'ru',{numeric:true})*sign})}return list}
function clinicOrderFilter(){const all=currentOrders(),months=[...new Set(all.map(clinicOrderMonthKey).filter(Boolean))].sort().reverse(),works=[...new Set(all.flatMap(clinicOrderWorkTypes))].sort((a,b)=>a.localeCompare(b,'ru')),statuses=[...new Set(all.map(o=>displayClientStatus(o.status)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')),doctors=[...new Set(all.map(clinicOrderDoctorLabel))].sort((a,b)=>a.localeCompare(b,'ru')),active=[state.orderMonthFilter,state.orderWorkFilter,state.orderStatusFilter,state.orderDoctorFilter].filter(Boolean).length;return `<div class="clinic-filter-wrap"><button class="btn outline ${active?'active':''}" data-action="filters">${icon('filter',15)} Фильтр${active?` · ${active}`:''}</button>${state.orderFilterOpen?`<div class="clinic-order-filter"><label>Тип работы<select id="clinic-order-work"><option value="">Все типы работ</option>${works.map(work=>`<option value="${escapeHtml(work)}" ${state.orderWorkFilter===work?'selected':''}>${escapeHtml(work)}</option>`).join('')}</select></label><label>Врач<select id="clinic-order-doctor"><option value="">Все врачи</option>${doctors.map(doctor=>`<option value="${escapeHtml(doctor)}" ${state.orderDoctorFilter===doctor?'selected':''}>${escapeHtml(doctor)}</option>`).join('')}</select></label><label>Статус<select id="clinic-order-status"><option value="">Все статусы</option>${statuses.map(status=>`<option value="${escapeHtml(status)}" ${state.orderStatusFilter===status?'selected':''}>${escapeHtml(status)}</option>`).join('')}</select></label><label>Месяц заказа<select id="clinic-order-month"><option value="">Все месяцы</option>${months.map(month=>`<option value="${month}" ${state.orderMonthFilter===month?'selected':''}>${clinicOrderMonthLabel(month)}</option>`).join('')}</select></label><div><button class="btn outline" data-action="filter-reset">Сбросить</button><button class="btn primary" data-action="filter-close">Готово</button></div></div>`:''}</div>`}
function ordersPage(){const statusTabs=`<div class="tech-segment clinic-status-segment">${orderTabs().map(([label,,key=label])=>`<button data-action="filter" data-value="${escapeHtml(key)}" class="${state.filter===key?'active':''}">${escapeHtml(label)}</button>`).join('')}</div>`;shell(`<div class="tech-heading clinic-orders-heading"><div><span class="tech-eyebrow">ПРОИЗВОДСТВО</span><h1>Мои заказы</h1></div></div><section class="clinic-orders-panel">${clinicMobileUI.controlsMarkup()}${statusTabs}${state.dueDateFilter?`<div class="active-date-filter"><span>Срок сдачи: <strong>${escapeHtml(state.dueDateFilter)}</strong></span><button data-action="clear-date-filter" aria-label="Сбросить фильтр по дате">×</button></div>`:''}<div class="toolbar"><label class="search">${icon('search',17)}<input id="order-search" value="${escapeHtml(state.query)}" placeholder="Поиск по номеру заказа, пациенту или типу работы..."></label>${clinicOrderFilter()}</div>${orderTable(filteredOrders())}</section>`)}
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
  const selectedSet=new Set((Array.isArray(selectedTeeth)?selectedTeeth:[]).map(value=>Number(value)).filter(Number.isFinite));
  const centers=new Map(teeth.map(([number,x,y,width,height])=>[number,[x+width/2,y+height/2]]));
  const bridgeMarkup=(Array.isArray(bridgeRanges)?bridgeRanges:[]).map(range=>{const points=(Array.isArray(range)?range:[]).map(number=>centers.get(Number(number))).filter(Boolean);if(points.length<2)return '';return `<polyline class="tooth-bridge-line" points="${points.map(point=>point.join(',')).join(' ')}"/>${points.map(point=>`<circle class="tooth-bridge-point" cx="${point[0]}" cy="${point[1]}" r="5"/>`).join('')}`}).join('');
  return `<div class="tooth-chart"><svg viewBox="0 0 509 772" role="img" aria-label="Схема зубов верхней и нижней челюсти">
    ${teeth.map(([n,x,y,width,height,imageX,imageY,imageWidth,imageHeight])=>{
      const selected=selectedSet.has(n);
      return `<g class="tooth ${selected?'selected':''}" ${interactive?`data-tooth="${n}" role="button" tabindex="0" aria-label="Зуб ${n}" aria-pressed="${selected}"`:''}>
        <rect class="tooth-hitbox" x="${x}" y="${y}" width="${width}" height="${height}" rx="10"/>
        <image class="tooth-image" href="${assets}teeth/${n}.png?v=3" x="${imageX}" y="${imageY}" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="none"/>
        ${selected?`<rect class="tooth-selection-overlay" x="${x+2}" y="${y+2}" width="${Math.max(1,width-4)}" height="${Math.max(1,height-4)}" rx="${Math.min(14,Math.round(Math.min(width,height)*.24))}" aria-hidden="true"/>`:''}
        <text x="${x+width/2}" y="${y+height/2}" text-anchor="middle" dominant-baseline="middle">${n}</text>
      </g>`;
    }).join('')}${bridgeMarkup}</svg></div>`;
}
function stepper(){return `<div class="stepper" aria-label="Шаг ${state.step+1} из ${steps.length}">${steps.map((s,i)=>`<button class="step ${state.step===i?'active':''} ${state.step>i?'done':''}" data-step="${i}" ${state.step===i?'aria-current="step"':''}><b>${state.step>i?icon('check',13):i+1}</b><span class="step-label">${s}</span></button>${i<steps.length-1?'<span class="step-line" aria-hidden="true"></span>':''}`).join('')}</div>`}
function field(label,control){return `<label class="field"><span>${label}</span>${control}</label>`}
function dateValueParts(value){const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!match)return null;const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));return Number.isNaN(date.getTime())?null:date}
function datePickerControl(field='due'){
  const value=state.form[field]||'',selected=dateValueParts(value)||new Date(),viewKey=state.datePickerMonth||`${selected.getFullYear()}-${String(selected.getMonth()+1).padStart(2,'0')}`,viewParts=viewKey.split('-').map(Number),view=new Date(viewParts[0],viewParts[1]-1,1),year=view.getFullYear(),month=view.getMonth(),days=new Date(year,month+1,0).getDate(),leading=(new Date(year,month,1).getDay()+6)%7,monthName=new Intl.DateTimeFormat(clinicIntlLocale(),{month:'long'}).format(view),display=value?`${String(selected.getDate()).padStart(2,'0')}.${String(selected.getMonth()+1).padStart(2,'0')}.${selected.getFullYear()}`:'ДД.ММ.ГГГГ';
  const cells=Array.from({length:leading},()=>'<span class="date-picker-empty"></span>');
  const minimumDue=field==='due'?currentEarliestDueIso():'';
  for(let day=1;day<=days;day++){const dateKey=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,isSelected=dateKey===value,isToday=dateKey===new Date().toISOString().slice(0,10),date=dateValueParts(dateKey),blocked=field==='due'&&(!isWorkingDay(date)||(minimumDue&&dateKey<minimumDue));cells.push(`<button type="button" class="date-picker-day ${isSelected?'selected':''} ${isToday?'today':''} ${blocked?'disabled':''}" ${blocked?'disabled title="Недоступно для выбранной услуги"':`data-action="date-select" data-value="${dateKey}"`}>${day}</button>`)}
  const open=state.datePickerOpen&&state.datePickerField===field,yearOpen=open&&state.datePickerYearOpen,currentYear=new Date().getFullYear(),yearRangeEnd=field==='birth'?Math.min(year+6,currentYear):year+6,yearRangeStart=yearRangeEnd-11;
  const years=Array.from({length:12},(_,index)=>yearRangeStart+index).map(item=>`<button type="button" class="date-picker-year ${item===year?'selected':''}" data-action="date-year-select" data-value="${item}">${item}</button>`).join('');
  const dueHint=field==='due'&&minimumDue?`<small class="date-picker-hint">Минимальная дата для выбранных услуг: ${displayIsoDate(minimumDue)}</small>`:'';
  return `<div class="date-picker"><button type="button" class="date-picker-trigger ${value?'has-value':''}" data-action="date-open" data-value="${field}"><span>${display}</span><span class="date-picker-icon" aria-hidden="true"></span></button>${open?`<div class="date-picker-popover"><div class="date-picker-head">${yearOpen?`<div class="date-picker-year-mode-head"><strong class="date-picker-year-mode-title">Выберите год</strong><div class="date-picker-year-nav"><button type="button" data-action="date-year-nav" data-value="-12" aria-label="Предыдущие годы">‹ Раньше</button><button type="button" data-action="date-year-nav" data-value="12" aria-label="Следующие годы">Позже ›</button></div></div>`:`<div class="date-picker-title"><strong>${monthName.charAt(0).toUpperCase()+monthName.slice(1)}</strong><button type="button" class="date-picker-year-trigger" data-action="date-year-toggle" data-value="${field}">Год: ${year}</button></div>`}${yearOpen?'':`<div class="date-picker-month-nav"><button type="button" data-action="date-nav" data-value="-1" aria-label="Предыдущий месяц">‹</button><button type="button" data-action="date-nav" data-value="1" aria-label="Следующий месяц">›</button></div>`}</div>${yearOpen?`<div class="date-picker-years">${years}</div><button type="button" class="date-picker-back" data-action="date-year-toggle" data-value="${field}">← Вернуться к календарю</button>`:`<div class="date-picker-weekdays">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(day=>`<span>${day}</span>`).join('')}</div><div class="date-picker-days">${cells.join('')}</div>`}<div class="date-picker-foot"><button type="button" data-action="date-clear" data-value="${field}">Очистить</button><button type="button" data-action="date-today" data-value="${field}">Сегодня</button>${dueHint}</div></div>`:''}</div>`;
}
function positionDatePicker(){const pop=document.querySelector('.date-picker-popover'),trigger=document.querySelector('.date-picker-trigger');if(!pop||!trigger)return;const rect=trigger.getBoundingClientRect(),spaceBelow=window.innerHeight-rect.bottom,spaceAbove=rect.top;pop.classList.toggle('above',spaceBelow<pop.offsetHeight+12&&spaceAbove>spaceBelow)}
function textInput(value='',placeholder='',key=''){return `<input ${key?`data-field="${key}"`:''} value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`}
function selectInput(options,key=''){const choices=key&&state.form[key]&&!options.includes(state.form[key])?[state.form[key],...options]:options;return `<select ${key?`data-field="${key}"`:''}>${choices.map(o=>`<option ${state.form[key]===o?'selected':''}>${o}</option>`).join('')}</select>`}
const activeClinicDoctors=()=>{const clinic=clinicRecord()||{},hiddenIds=new Set(Array.isArray(clinic.clinicHiddenDoctorIds)?clinic.clinicHiddenDoctorIds:[]);return (clinic.doctors||[]).filter(item=>item.active!==false&&!hiddenIds.has(item.id))};
function doctorChoice(){
  const doctors=activeClinicDoctors();
  return '<div class="doctor-choice-field">'+field('Врач'+(doctors.length?' · обязательно':''),`<select data-field="doctorId" ${doctors.length?'required':'disabled'}><option value="">${doctors.length?'Выберите врача':'Врачи пока не добавлены'}</option>${doctors.map(item=>`<option value="${escapeHtml(item.id)}" ${state.form.doctorId===item.id?'selected':''}>${escapeHtml(item.name)}${item.specialty?` · ${escapeHtml(item.specialty)}`:''}</option>`).join('')}</select><small class="doctor-field-hint">${doctors.length?'Врач будет указан в заказе и наряде.':'Добавьте врачей вашей клиники, чтобы выбирать их в заказах.'}</small>`)+`<button type="button" class="text-link doctor-manage-link" data-action="doctor-manage">${doctors.length?'Управление врачами':'Добавить врача'}</button></div>`;
}
function patientStep(){return `<h2>Данные пациента</h2><div class="order-type-choice"><div><h3>Тип работы</h3><p>Выберите, по какому маршруту пойдёт заказ.</p></div><div class="order-type-options"><button type="button" class="${state.form.orderType==='digital'?'selected':''}" data-action="order-type" data-value="digital"><strong>Цифровой</strong><small>Цифровой заказ · нужны STL или сканы</small></button><button type="button" class="${state.form.orderType==='analog'?'selected':''}" data-action="order-type" data-value="analog"><strong>Аналоговый</strong><small>Аналоговый заказ · нужен гипсовый слепок</small></button></div></div><div class="form-grid patient-fields">${field('Фамилия пациента · обязательно',textInput(state.form.surname,'Фамилия','surname'))}${field('Имя пациента · обязательно',textInput(state.form.initials,'Имя · отчество по желанию','initials'))}${doctorChoice()}${field('Дата рождения · необязательно',datePickerControl('birth'))}</div><div class="info-note">Фамилия и имя обязательны. Отчество можно указать по желанию.</div>`}
function workChooser(){
  const work=selectedWork();
  if(!work)return `<div class="order-work-grid">${workCatalog.map(item=>`<button data-action="work" data-value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</button>`).join('')}</div>`;
  if(!work.options.length)return `<div class="work-detail"><button class="work-back" data-action="work-back">← Все виды работ</button><div class="work-current"><strong>${escapeHtml(work.name)}</strong><small>Категория выбрана</small></div></div>`;
  const prostheticCategory=workCatalog.find(item=>item.name==='Протетика');
  const extraCategory=workCatalog.find(item=>item.name==='Дополнительные работы');
  const planningAddonNames=new Set(['Силиконовый ключ','Прозрачный силиконовый ключ']);
  const planningAddonOptions=(extraCategory?.options||[]).filter(option=>planningAddonNames.has(workOptionName(option)));
  const showProstheticAddons=work.name==='Реставрации'&&Boolean(state.workOption)&&prostheticCategory?.options.length&&!/рефрактор/i.test(String(state.workOption));
  const showPlanningAddons=work.name==='Планирование и диагностика'&&Boolean(state.workOption)&&planningAddonOptions.length;
  const showSurgicalSocketAddon=isSurgicalTemplate(currentVariant());
  const currentServiceReady=variantIsComplete(currentVariant()),currentServiceSaved=currentVariantSaved()||currentVariantBaseIndex()>=0,savedServiceCount=orderServiceCount(state.orderVariants||[]),prostheticLimitReached=savedServiceCount+(currentServiceSaved?1:2)>10,prostheticAddonsReady=currentServiceReady&&!prostheticLimitReached,planningLimitReached=savedServiceCount+(currentServiceSaved?1:2)>10,planningAddonsReady=currentServiceReady&&!planningLimitReached;
  const currentTemplateNeedsSaving=isSurgicalTemplate(currentVariant())&&['upper','lower'].some(jaw=>hasSurgicalJaw(currentVariant(),jaw)&&!(state.orderVariants||[]).some(variant=>isSurgicalTemplate(variant)&&hasSurgicalJaw(variant,jaw)));
  const surgicalSocketLimitReached=savedServiceCount+(currentTemplateNeedsSaving?1:0)>10,surgicalSocketReady=currentServiceReady&&!surgicalSocketLimitReached;
  const prostheticAddonsNote=prostheticLimitReached?'В одном заказе можно добавить не больше 10 услуг.':currentServiceReady?'':'Сначала выберите зубы для текущей услуги.';
  const prostheticAddons=showProstheticAddons?`<section class="prosthetic-addons"><div class="prosthetic-addons-heading"><h3>Дополните выбранную коронку</h3><p>Добавьте комплектующую — она сразу попадёт в заказ отдельной услугой.</p></div><div class="prosthetic-addon-list">${prostheticCategory.options.map(option=>{const optionName=workOptionName(option),special=promoPriceFor(prostheticCategory.name,optionName),price=Number.isFinite(special)?special:option.price;return `<button type="button" data-action="add-prosthetic-addon" data-value="${escapeHtml(optionName)}" ${prostheticAddonsReady?'':'disabled'}><span class="prosthetic-addon-name"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg><span>${escapeHtml(optionName)}</span></span><span class="prosthetic-addon-cta"><b>${promoPriceMarkup(option.price,price)}</b><small>Добавить</small></span></button>`}).join('')}</div>${prostheticAddonsNote?`<small class="prosthetic-addons-note">${prostheticAddonsNote}</small>`:''}</section>`:'';
  const planningAddons=showPlanningAddons?`<section class="prosthetic-addons planning-addons"><div class="prosthetic-addons-heading"><h3>Дополните выбранную услугу</h3><p>Добавьте ключ — он сразу попадёт в заказ отдельной услугой.</p></div><div class="prosthetic-addon-list">${planningAddonOptions.map(option=>{const optionName=workOptionName(option),special=promoPriceFor(extraCategory.name,optionName),price=Number.isFinite(special)?special:option.price;return `<button type="button" data-action="add-planning-addon" data-value="${escapeHtml(optionName)}" ${planningAddonsReady?'':'disabled'}><span class="prosthetic-addon-name"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg><span>${escapeHtml(optionName)}</span></span><span class="prosthetic-addon-cta"><b>${promoPriceMarkup(option.price,price)}</b><small>Добавить</small></span></button>`}).join('')}</div>${planningLimitReached?'<small class="prosthetic-addons-note">В одном заказе можно добавить не больше 10 услуг.</small>':''}</section>`:'';
  const selectedJawCount=variantJawCount(currentVariant()),socketMax=selectedJawCount*SURGICAL_SOCKETS_PER_JAW;
  const selectedJaws=['upper','lower'].filter(jaw=>hasSurgicalJaw(currentVariant(),jaw));
  const surgicalSocketBase=workCatalog.find(item=>item.name===SURGICAL_TEMPLATE_CATEGORY)?.options.find(option=>workOptionName(option)===SURGICAL_SOCKET_OPTION),surgicalSocketPrice=promoPriceFor(SURGICAL_TEMPLATE_CATEGORY,SURGICAL_SOCKET_OPTION),surgicalSocketAddon=showSurgicalSocketAddon?`<section class="prosthetic-addons surgical-socket-upsell"><div class="prosthetic-addons-heading"><h3>Добавьте гнёзда под импланты</h3><p>Шаблонов: ${selectedJawCount}. Можно указать до ${socketMax} гнёзд — до 16 на челюсть.</p></div><div class="prosthetic-addon-list">${selectedJaws.map(jaw=>`<button type="button" data-action="add-surgical-socket" data-value="${jaw}" ${surgicalSocketReady?'':'disabled'}><span class="prosthetic-addon-name"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg><span>Добавить гнездо · ${jaw==='upper'?'верхняя':'нижняя'} челюсть</span></span><span class="prosthetic-addon-cta"><b>${promoPriceMarkup(surgicalSocketBase?.price||0,Number.isFinite(surgicalSocketPrice)?surgicalSocketPrice:surgicalSocketBase?.price||0)}</b><small>Добавить</small></span></button>`).join('')}</div>${surgicalSocketLimitReached?'<small class="prosthetic-addons-note">В одном заказе можно добавить не больше 10 услуг.</small>':''}</section>`:'';
  const visibleOptions=work.options.filter(option=>!(work.name===SURGICAL_TEMPLATE_CATEGORY&&workOptionName(option)===SURGICAL_SOCKET_OPTION));
  return `<div class="work-detail"><button class="work-back" data-action="work-back">← Все виды работ</button><div class="work-current"><strong>${escapeHtml(work.name)}</strong><small>Выберите вариант исполнения${activePromoCode?' · действует промокод '+escapeHtml(activePromoCode):''}</small></div><div class="work-option-list">${visibleOptions.map(option=>{const name=workOptionName(option),special=promoPriceFor(work.name,name),base=typeof option==='object'&&Number.isFinite(option.price)?option.price:null,price=Number.isFinite(special)?special:base;return `<button type="button" class="${state.workOption===name?'selected':''}" data-action="work-option" data-value="${escapeHtml(name)}"><span>${escapeHtml(name)}</span><b>${Number.isFinite(price)?promoPriceMarkup(base,price):'→'}</b></button>${state.workOption===name?`${prostheticAddons}${planningAddons}${surgicalSocketAddon}`:''}`}).join('')}</div></div>`;
}
function variantCard(variant,index,removable=true,sockets=[],displayIndex=index){
  const pricing=estimateWithPromo(variant),estimate=pricing.amount,standardEstimate=pricing.baseAmount;
  const teethLabel=variantNeedsNoTeeth(variant)?'Не требуется':variantUsesJawSplit(variant)?(variantJawCount(variant)>1?'Верхняя и нижняя челюсти':variant.selectedTeeth?.some(tooth=>tooth<30)?'Верхняя челюсть':'Нижняя челюсть'):(variant.selectedTeeth||[]).join(', ');
  const quantity=isSurgicalSocket(variant)?`<div class="surgical-socket-quantity" aria-label="Количество гнёзд"><button type="button" data-action="surgical-socket-quantity" data-value="-1" data-index="${index}" aria-label="Уменьшить количество гнёзд" ${variantUnits(variant)<=1?'disabled':''}>−</button><strong>${variantUnits(variant)} / ${maxSurgicalSockets(variant)}</strong><button type="button" data-action="surgical-socket-quantity" data-value="1" data-index="${index}" aria-label="Увеличить количество гнёзд" ${variantUnits(variant)>=maxSurgicalSockets(variant)?'disabled':''}>+</button></div>`:'';
  const quantityLabel=isSurgicalSocket(variant)?'Гнёзда под имплант':isSurgicalTemplate(variant)?'Количество шаблонов':'Количество';
  const priceLabel=isSurgicalTemplate(variant)&&sockets.length?'Стоимость шаблона':'Предварительно';
  const socketLines=sockets.map(({variant:socket,index:socketIndex})=>{const socketPricing=estimateWithPromo(socket),socketJaw=hasSurgicalJaw(socket,'upper')?'верхняя':'нижняя',socketEstimate=socketPricing.amount;return `<div class="surgical-socket-order-addon"><div class="surgical-socket-order-heading"><span>Дополнительные гнёзда · ${socketJaw} челюсть</span><div class="surgical-socket-quantity" aria-label="Количество гнёзд"><button type="button" data-action="surgical-socket-quantity" data-value="-1" data-index="${socketIndex}" aria-label="Уменьшить количество гнёзд" ${variantUnits(socket)<=1?'disabled':''}>−</button><strong>${variantUnits(socket)} / ${maxSurgicalSockets(socket)}</strong><button type="button" data-action="surgical-socket-quantity" data-value="1" data-index="${socketIndex}" aria-label="Увеличить количество гнёзд" ${variantUnits(socket)>=maxSurgicalSockets(socket)?'disabled':''}>+</button></div></div><div class="surgical-socket-order-price"><span>Стоимость гнёзд</span><strong>${promoPriceMarkup(socketPricing.baseAmount,socketEstimate)}</strong></div></div>`}).join('');
  const optionLabel=variant.workOption?orderVariantConstructionLabel(variant):'';
  return `<article class="order-variant-card"><div class="order-variant-head"><span>Услуга ${displayIndex+1}</span>${removable?`<button type="button" class="order-variant-remove" data-action="remove-variant" data-value="${index}" aria-label="Удалить услугу">×</button>`:''}</div><div class="order-variant-mode">${escapeHtml(variant.toothMode||'Одиночка')}</div><strong>${variantNeedsNoTeeth(variant)?'Зубы не выбираются':'Зубы'}: ${escapeHtml(teethLabel)}</strong><h3>${escapeHtml(variant.work||'')}</h3>${optionLabel?`<p>${escapeHtml(optionLabel)}</p>`:''}${socketLines}<dl><div><dt>${quantityLabel}</dt><dd>${quantity||variantUnits(variant)}</dd></div><div><dt>${priceLabel}</dt><dd>${promoPriceMarkup(standardEstimate,estimate)}</dd></div></dl></article>`;
}
function orderDraft(){
  const current=currentVariant(),complete=variantIsComplete(current),currentIncluded=currentSurgicalGuideIncluded(),cards=allVariants().filter(variantIsComplete);
  if(!cards.length)return `<aside class="order-draft"><button type="button" class="mobile-order-summary" data-action="mobile-cart-toggle" aria-expanded="false"><span><strong>Ваш заказ</strong><small>Пока пусто</small></span><strong>＋</strong></button><h2>Ваш заказ</h2><div class="order-draft-empty">${icon('orders',24)}<strong>Выберите нужные зубы и работу</strong><span>Здесь появится состав заказа и предварительная стоимость.</span></div></aside>`;
  const groupedCards=groupSurgicalSockets(cards),serviceCount=groupedCards.length;
  const threshold=Number.isFinite(Number(deliverySettings.freeThreshold))?Number(deliverySettings.freeThreshold):4000,fee=Number.isFinite(Number(deliverySettings.fee))?Number(deliverySettings.fee):500;
  return `<aside class="order-draft"><button type="button" class="mobile-order-summary" data-action="mobile-cart-toggle" aria-expanded="false"><span><strong>Ваш заказ</strong><small>${serviceCount} ${serviceCount===1?'услуга':'услуги'}</small></span><strong>${totalOrderEstimateText()}</strong><span class="mobile-cart-chevron" aria-hidden="true">⌃</span></button><div class="order-draft-title"><h2>Ваш заказ</h2><span>${serviceCount}/10 услуг</span></div><div class="order-variants">${groupedCards.map(({variant,index,sockets},serviceIndex)=>variantCard(variant,index,true,sockets,serviceIndex)).join('')}</div>${complete&&!currentIncluded&&serviceCount<10?`<button type="button" class="order-variant-add" data-action="add-variant">＋ Заказать ещё</button>`:''}${promoSummaryMarkup()}<div class="order-delivery-row"><span>Доставка</span><strong>${deliveryFeeText()}</strong></div><div class="order-total"><span>Итого с доставкой</span><strong>${totalOrderEstimateText()}</strong></div><small class="order-total-note">Доставка ${rubles(fee)} при сумме услуг меньше ${rubles(threshold)}. От ${rubles(threshold)} — бесплатно.</small></aside>`;
}
function bridgeSelectionText(){if(state.toothMode!=='Мост')return state.selectedTeeth.length?`Выбрано: ${state.selectedTeeth.join(', ')}`:'Нажмите на нужные зубы';if(state.bridgeStart)return `Начало моста: ${state.bridgeStart}. Выберите последний зуб на этой челюсти`;if(state.bridgeRanges.length)return `Мосты: ${state.bridgeRanges.map(range=>`${range[0]}–${range.at(-1)}`).join(', ')}`;return 'Выберите первый и последний зуб моста'}
function jawSelectionText(){const upper=upperTeeth.every(tooth=>state.selectedTeeth.includes(tooth)),lower=lowerTeeth.every(tooth=>state.selectedTeeth.includes(tooth));return upper&&lower?'Выбраны верхняя и нижняя челюсти':upper?'Верхняя челюсть':lower?'Нижняя челюсть':'Выберите челюсть'}
function mobileToothPicker(){return '';}
function teethStep(){const work=selectedWork(),noTeeth=currentNeedsNoTeeth(),jawWork=currentUsesJawSplit(),toothPicker=noTeeth?`<section class="tooth-picker tooth-picker-no-teeth"><h2>Зубы</h2><div class="no-teeth-note">Для этой услуги номера зубов не выбираются.</div></section>`:`<section class="tooth-picker"><h2>${jawWork?'Выберите челюсть':'Выберите зуб(ы)'}</h2>${jawWork?`<div class="jaw-choice"><button type="button" class="${upperTeeth.every(tooth=>state.selectedTeeth.includes(tooth))?'selected':''}" data-action="jaw-toggle" data-value="upper">Верхняя челюсть</button><button type="button" class="${lowerTeeth.every(tooth=>state.selectedTeeth.includes(tooth))?'selected':''}" data-action="jaw-toggle" data-value="lower">Нижняя челюсть</button></div>`:`<div class="tooth-mode">${['Одиночка','Мост','Челюсть'].map(mode=>`<button type="button" class="${state.toothMode===mode?'selected':''}" data-action="tooth-mode" data-value="${mode}">${mode}</button>`).join('')}</div>`}<div class="desktop-tooth-chart">${toothChart(true,state.selectedTeeth,state.bridgeRanges)}</div>${mobileToothPicker()}<div class="selected-teeth"><strong>${jawWork?jawSelectionText():bridgeSelectionText()}</strong>${state.selectedTeeth.length?'<button type="button" class="clear" data-action="clear-teeth">Очистить</button>':''}</div></section>`;return `<div class="order-builder">${toothPicker}<section class="work-picker"><div class="work-picker-title"><div><h2>Что нужно сделать?</h2><p>${work?.options.length?'Уточните вариант исполнения':state.work?'Категория выбрана':'Выберите вид работы из списка'}</p></div>${state.work?'<button type="button" data-action="work-back" aria-label="Вернуться к списку">⌕</button>':''}</div>${workChooser()}</section>${orderDraft()}</div>`}
const uploadPreviewUrls=new WeakMap();
function uploadPreview(file){
  if(!file?.type?.startsWith('image/')&&!/\.(?:jpg|jpeg|png)$/i.test(file?.name||''))return '';
  if(!uploadPreviewUrls.has(file))uploadPreviewUrls.set(file,URL.createObjectURL(file));
  return uploadPreviewUrls.get(file);
}
function releaseUploadPreview(file){const url=uploadPreviewUrls.get(file);if(url)URL.revokeObjectURL(url);uploadPreviewUrls.delete(file)}
function attachmentTiles(){return `<div class="attachment-grid">${state.uploaded.map(file=>{const preview=uploadPreview(file),extension=(file.name.split('.').pop()||'FILE').toUpperCase().slice(0,5),size=file.size>=1024*1024?`${(file.size/1024/1024).toFixed(1)} МБ`:`${Math.max(1,Math.ceil(file.size/1024))} КБ`;return `<div class="attachment">${preview?`<img src="${preview}" loading="lazy" decoding="async" alt="Миниатюра ${escapeHtml(file.name)}">`:`<span class="attachment-file-icon">${escapeHtml(extension)}</span>`}<span class="attachment-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span><small>${size}</small><button aria-label="Удалить файл ${escapeHtml(file.name)}" data-action="remove-file" data-value="${escapeHtml(file.name)}">×</button></div>`}).join('')}<label class="attachment-add" title="Добавить файлы">${icon('plus',26)}<span>Добавить</span><input type="file" id="upload-input" accept="*/*" multiple hidden></label></div>`}
function extraStep(){const hasRestoration=shadeVariants().length>0;return `<h2>Дополнительная информация</h2><div class="form-grid">${field('Желаемый срок готовности',datePickerControl('due'))}${hasRestoration?field('Цвет реставраций (например, Vita)',selectInput(vitaShadeOptions,'shade')):''}</div><div class="form-grid extra-fields"><div class="field"><span>Файлы заказа — сканы, КТ и фото</span><label class="upload-zone">${icon('upload',26)}<span>Перетащите файлы сюда<br>или нажмите, чтобы выбрать</span><input type="file" id="upload-input" accept="*/*" multiple hidden></label><small class="hint">Изображения, PDF, 3D-файлы, архивы и документы — до 200 МБ на файл. Файлы прикрепятся к заказу.</small>${attachmentTiles()}</div>${field('Комментарий к заказу',`<textarea rows="5" data-field="comment" placeholder="Напишите пожелания, особенности, дополнительные инструкции...">${escapeHtml(state.form.comment)}</textarea>`)}</div>`}
function confirmStep(){
  const variants=allVariants().filter(variantIsComplete),groups=groupSurgicalSockets(variants),teeth=[...new Set(variants.flatMap(variant=>variant.selectedTeeth||[]))].sort((a,b)=>a-b),orderCount=1;
  const serviceRows=groups.map(({variant,sockets},index)=>{
    const serviceTeeth=variant.selectedTeeth||[],socketDetails=sockets.map(({variant:socket})=>`${variantUnits(socket)} доп. гнёзд · ${hasSurgicalJaw(socket,'upper')?'верхняя':'нижняя'} челюсть · ${rubles(variantEstimate(socket))}`).join('; ');
    const serviceItems=[variant,...sockets.map(item=>item.variant)],serviceTotal=serviceItems.reduce((sum,item)=>sum+(variantEstimate(item)||0),0),serviceStandardTotal=serviceItems.reduce((sum,item)=>sum+(standardVariantEstimate(item)||0),0),serviceLabel=`${variant.work}${variant.workOption?` · ${orderVariantConstructionLabel(variant)}`:''} · ${variantNeedsNoTeeth(variant)?'без выбора зубов':variantUsesJawSplit(variant)?(variantJawCount(variant)>1?'верхняя и нижняя челюсти':serviceTeeth.some(tooth=>tooth<30)?'верхняя челюсть':'нижняя челюсть'):`зубы ${serviceTeeth.join(', ')}`}${socketDetails?` · ${socketDetails}`:''}`,serviceTeethLabel=variantNeedsNoTeeth(variant)?'Зубы не выбираются':serviceTeeth.length?`Зубы по услуге: ${serviceTeeth.join(', ')}`:'Зубы по услуге: не выбраны';
    return `<div class="confirmation-service-row"><span>Услуга ${index+1}</span><strong>${escapeHtml(serviceLabel)} · сумма ${promoPriceMarkup(serviceStandardTotal,serviceTotal)}</strong><small>${escapeHtml(serviceTeethLabel)}</small></div>`;
  }).join('');
  const allTeeth=[...new Set(variants.flatMap(variant=>variant.selectedTeeth||[]))].sort((a,b)=>a-b);
  return `<h2>Проверьте данные заказа</h2><div class="confirmation"><div>${allTeeth.length?toothChart(false,allTeeth,[]):`<div class="no-teeth-confirmation">Номера зубов не требуются</div>`}</div><div class="summary-list"><div><span>Пациент</span><strong>${escapeHtml(`${state.form.surname} ${state.form.initials}`)}</strong></div><div><span>Врач</span><strong>${escapeHtml(activeClinicDoctors().find(item=>item.id===state.form.doctorId)?.name||'Не указан')}</strong></div>${state.form.birth?`<div><span>Дата рождения</span><strong>${escapeHtml(state.form.birth.split('-').reverse().join('.'))}</strong></div>`:''}<div><span>Тип работы</span><strong>${state.form.orderType==='analog'?'Аналоговый':'Цифровой'}</strong></div><div><span>Заказы</span><strong>${orderCount}</strong></div><div><span>Услуги</span><strong>${groups.length}</strong></div><div><span>Зубы</span><strong>${escapeHtml(allTeeth.join(', ')||'Не выбираются')}</strong></div>${serviceRows}${activePromoCode?`<div><span>Промокод</span><strong>${escapeHtml(activePromoCode)}</strong></div>`:''}<div><span>Желаемый срок</span><strong>${escapeHtml(state.form.due?state.form.due.split('-').reverse().join('.'):orderDateLabel(''))}</strong></div>${promoSummaryMarkup()}<div><span>Услуги без доставки</span><strong>${escapeHtml(serviceSubtotalText())}</strong></div><div><span>Доставка</span><strong>${escapeHtml(deliveryFeeText())}</strong></div><div><span>Итого с доставкой</span><strong>${escapeHtml(totalOrderEstimateText())}</strong></div>${shadeVariants().length?`<div><span>Цвет реставраций</span><strong>${escapeHtml(state.form.shade)}</strong></div>`:''}<div><span>Комментарий</span><strong>${escapeHtml(state.form.comment||'—')}</strong></div><div><span>Файлы</span><strong>${state.uploaded.length} файла</strong></div>${attachmentTiles()}</div></div>`;
}
function newOrder(){const body=[patientStep,teethStep,extraStep,confirmStep][state.step](),final=state.step===3,subtitle=orderServiceCount(state.orderVariants||[])?`Добавлено услуг: ${orderServiceCount(state.orderVariants||[])}. Можно добавить до 10 услуг для одного пациента.`:'';shell(`${title(state.step===1?'Зубы и работа':state.step===2?'Дополнительные параметры':state.step===3?'Подтверждение':'Новый заказ',subtitle)}${stepper()}<section class="wizard order-flow ${state.step===1?'order-builder-wizard':''}">${body}<div class="wizard-actions">${state.step>0?button('Назад','previous','outline'):''}${button(final?'Создать заказ':'Далее →','next')}</div></section>`)}
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
  const variants=order.variants?.length?order.variants:[{work:order.work,workOption:order.material}];
  const position=Math.min(state.clientRequest.variantIndex||0,variants.length-1),selected=variants[position];
  const positionField=['teeth','mode','service'].includes(field)?`<label>Позиция заказа<select id="client-request-position" name="variantIndex">${variants.map((v,index)=>`<option value="${index}" ${index===position?'selected':''}>${index+1}. ${escapeHtml(v.workOption||v.work)}</option>`).join('')}</select></label>`:'';
  return `<div class="tech-dialog-backdrop"><section class="tech-dialog client-request-dialog" role="dialog" aria-modal="true"><h2>Запросить правку</h2><p>Выберите один пункт. Изменение применится после подтверждения главным техником.</p><form id="clinic-client-request-form"><input type="hidden" name="type" value="edit"><label>Что изменить<select id="client-request-field" name="field"><option value="patient" ${field==='patient'?'selected':''}>ФИО пациента</option><option value="birth" ${field==='birth'?'selected':''}>Дата рождения</option><option value="teeth" ${field==='teeth'?'selected':''}>Зубы</option><option value="mode" ${field==='mode'?'selected':''}>Режим / челюсть</option><option value="service" ${field==='service'?'selected':''}>Услуга</option><option value="date" ${field==='date'?'selected':''}>Срок</option><option value="shade" ${field==='shade'?'selected':''}>Цвет</option><option value="comment" ${field==='comment'?'selected':''}>Комментарий</option></select></label>${positionField}${clientRequestControl({...order,...selected,material:selected.workOption,teeth:selected.selectedTeeth||order.teeth},field)}<div class="order-rework-actions"><button type="button" class="btn outline" data-action="client-request-close">Назад</button><button type="submit" class="btn primary">Отправить запрос</button></div></form></section></div>`;
}
const orderUploadAccept='*/*';
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
  const allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|constructionInfo|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf)$/i;
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
function createdOrderHistoryMarkup(order,event){
  if(event.action!=='order_created')return '';
  const summary=orderEventSummary(order,event),separator=summary.lastIndexOf(' · ');
  const patient=separator>=0?summary.slice(separator+3).trim():'';
  const savedWork=separator>=0?summary.slice(0,separator).trim():summary;
  const variants=Array.isArray(order.variants)?order.variants:[];
  const services=savedWork===orderWorkLabel(order)&&variants.length
    ?variants.map(variant=>String(variant.workOption||variant.material||variant.work||'').trim()).filter(Boolean)
    :[savedWork].filter(Boolean);
  return `<div class="order-history-content"><strong>Заказ создан</strong>${patient?`<p class="order-history-patient">Пациент: ${escapeHtml(patient)}</p>`:''}${services.length?`<ul class="order-history-services">${services.map(service=>`<li>${escapeHtml(service)}</li>`).join('')}</ul>`:''}</div>`;
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
  const hasRestoration=variants.some(variantUsesShade);
  const facts=[['Тип работы',o.productionType==='analog'?'Аналоговый':'Цифровой'],['Раздел',orderExecutionLabel(o)],['Конструкция',orderConstructionLabel(o)],['Пациент',o.patient],['Врач',o.doctor||o.dentist||'Не указан'],...(o.birth?[['Дата рождения',String(o.birth).split('-').reverse().join('.')]]:[]),['Желаемый срок',orderDateLabel(o.date)],['Сумма заказа',o.sum],...(hasRestoration?[['Цвет реставраций',o.shade||'—']]:[]),['Комментарий',o.comment||'—'],['Исполнитель заказа',details.assigned?'Исполнитель назначен':'Пока не назначен']];
  const serviceGroups=groupSurgicalSockets(variants);
  const serviceMarkup=`<section class="order-services"><h3>Услуги заказа</h3><div class="order-service-list">${serviceGroups.map(({variant,sockets},index)=>{const serviceTeeth=Array.isArray(variant.selectedTeeth)?variant.selectedTeeth:[],serviceRanges=Array.isArray(variant.bridgeRanges)?variant.bridgeRanges:[],serviceAmount=[variant,...sockets.map(item=>item.variant)].reduce((sum,item)=>sum+(variantEstimate(item)||0),0),socketRows=sockets.map(({variant:socket})=>`<div><dt>Дополнительные гнёзда</dt><dd>${variantUnits(socket)} · ${hasSurgicalJaw(socket,'upper')?'верхняя':'нижняя'} челюсть · ${rubles(variantEstimate(socket))}</dd></div>`).join('');return `<article class="order-service-card"><header><span>Услуга ${index+1}</span><strong>${escapeHtml(orderVariantConstructionLabel(variant,o))}</strong></header><div class="order-service-body"><div class="order-service-chart">${toothChart(false,serviceTeeth,serviceRanges)}</div><dl><div><dt>Зубы</dt><dd>${escapeHtml(serviceTeeth.join(', ')||'—')}</dd></div><div><dt>Режим</dt><dd>${escapeHtml(variant.toothMode||'Одиночка')}</dd></div>${serviceRanges.length?`<div><dt>Мосты</dt><dd>${escapeHtml(serviceRanges.map(range=>`${range[0]}–${range.at(-1)}`).join(', '))}</dd></div>`:''}<div><dt>Раздел</dt><dd>${escapeHtml(orderVariantExecutionLabel(variant,o))}</dd></div><div><dt>Конструкция</dt><dd>${escapeHtml(orderVariantConstructionLabel(variant,o))}</dd></div>${socketRows}<div><dt>${isSurgicalTemplate(variant)?'Количество шаблонов':'Количество'}</dt><dd>${variantUnits(variant)}</dd></div><div><dt>Сумма</dt><dd>${escapeHtml(rubles(serviceAmount))}</dd></div></dl></div></article>`}).join('')}</div></section>`;
  const created=o.createdAt?new Date(o.createdAt).toLocaleDateString(clinicIntlLocale()):'—';
  const history=portalHistory.filter(event=>event.orderId===o.id).slice().reverse();
  const folderCard=`<div class="order-folder-link"><div><strong>Папка заказа на Яндекс Диске</strong><small>Все файлы хранятся только на Яндекс Диске</small></div><div class="order-folder-actions">${state.orderFolderUrl?`<a class="btn outline" href="${escapeHtml(state.orderFolderUrl)}" target="_blank" rel="noopener noreferrer">Открыть папку</a>`:'<span class="muted">Папка создаётся…</span>'}</div></div>`;
  const fileMarkup=`<section class="order-files-panel"><div class="order-file-toolbar"><h3>Файлы заказа</h3></div><div class="order-files-layout"><div class="order-upload-card"><strong>Загрузить файлы</strong><small>Добавьте до 10 файлов в папку заказа на Яндекс Диске</small><button class="btn primary" data-action="add-order-file">Выбрать файлы</button></div>${folderCard}</div></section>`;

  const cadCandidates=details.serviceWorks?.length?details.serviceWorks.filter(work=>work.cadReview).map(work=>({id:work.id,cad:work.cadReview})):(details.cadReview?[{id:details.cadReviewOrderId||o.id,cad:details.cadReview}]:[{id:o.id,cad:{}}]);
  // One patient/order has one CAD decision. Keep the review card singular even
  // when the laboratory splits several service lines internally.
  const cadCard=cadCandidates.find(item=>item.cad?.status==='pending')||cadCandidates.find(item=>item.cad?.status==='returned')||cadCandidates.at(-1);
  const cadReviewMarkup=cadCard?.cad?.status&&cadCard.cad.status!=='not-required'?`<div class="cad-review-card compact ${escapeHtml(cadCard.cad.status)}"><div><span class="cad-review-label">Согласование CAD · версия ${Number(cadCard.cad.revision)||1}</span><h3>${cadCard.cad.status==='pending'?'CAD ожидает вашего решения':cadCard.cad.status==='approved'?'CAD подтверждён':'CAD возвращён моделировщику'}</h3><p>${cadCard.cad.status==='pending'?(cadCard.cad.sentAt?`Отправлено ${new Date(cadCard.cad.sentAt).toLocaleString(clinicIntlLocale())}`:'Отправлено на согласование'):cadCard.cad.status==='approved'?`Подтвердил ${escapeHtml(cadCard.cad.reviewedBy||'врач')}`:`Комментарий: ${escapeHtml(cadCard.cad.comment||'Нужно внести изменения')}`}</p></div><div class="cad-review-actions"><button class="btn outline" data-action="cad-open" data-value="${escapeHtml(cadCard.cad.fileId||'')}">Открыть CAD</button>${cadCard.cad.status==='pending'?`<button class="btn outline" data-action="cad-return" data-value="${escapeHtml(cadCard.id)}">Вернуть</button><button class="btn primary" data-action="cad-approve" data-value="${escapeHtml(cadCard.id)}">Подтвердить</button>`:''}</div></div>`:'';
  const historyMarkup=history.length?`<ol class="order-history">${history.map(event=>`<li><time>${new Date(event.at).toLocaleString(clinicIntlLocale())}</time><strong>${escapeHtml(displayActor(event))}</strong><div class="order-history-description">${event.action==='stage_changed'?`${escapeHtml(event.from)} → ${escapeHtml(event.to)}${event.reason?`: ${escapeHtml(event.reason)}`:''}`:event.action==='assignee_changed'?(event.assigned?'Исполнитель назначен':'Исполнитель пока не назначен'):event.action==='rework_requested'?`Запрошена доработка: ${escapeHtml(event.reason)}`:createdOrderHistoryMarkup(o,event)||escapeHtml(orderEventSummary(o,event)||'Изменение заказа')}</div></li>`).join('')}</ol>`:'<div class="info-note">История появится после первого действия с заказом.</div>';
  const visibleStage=details.stage==="Препрод"?"Аналоговая подготовка":details.stage==="Моделирование"?"Моделирование":details.stage==="Согласование CAD"||details.stage==="На согласовании"?"CAD на согласовании у врача":details.stage==="В доставке"||details.stage==="В пути к вам"?"Доставка в клинику":details.stage==="Принято доктором"||details.stage==="Принято"?"Принято врачом":details.stage==="На доработке"?"Доработка и эстетика":details.stage||"";
  const clinicDetails={...o,...details},singleProgress=workProgress(o,details);
  const progress=details.serviceWorks?.length?details.progress:singleProgress.progress;
  const renderTimeline=work=>work.steps.map((id,index)=>{const current=id===work.step,done=index<work.completed;return `<div class="${done?'complete ':''}${current?'current':''}"><i></i><strong>${escapeHtml(id==='new'?'Новый':productionFlowLabel(id))}</strong></div>`}).join('');
  const clinicTimeline=details.serviceWorks?.length?details.serviceWorks.map(work=>`<article class="clinic-service-progress"><h4>${escapeHtml(work.service)}</h4><p class="muted">Сейчас: <strong>${escapeHtml(work.label)}</strong> · ${work.progress}%</p><div class="tech-progress-track"><i style="width:${work.progress}%"></i></div><details><summary class="text-link">Этапы работы</summary><div class="timeline clinic-production-timeline">${renderTimeline(work)}</div></details></article>`).join(''):renderTimeline(singleProgress);
  shell(`<a class="back-link" href="${pathFor('clinic','orders')}" data-page="orders">← &nbsp; Назад к заказам</a><div class="detail-heading">${title(`Заказ ${escapeHtml(displayOrderId(o))}`,badge(escapeHtml(displayClientStatus(o.status)))+` <span class="muted">Создан ${created}</span>`,`<div class="detail-actions"><button type="button" class="btn outline" data-action="print-order">Распечатать наряд</button>${button('Запросить правку','request-edit','outline')}${button('Запросить отмену','request-cancel','outline')}</div>`)}</div>${tabs([['Обзор'],['Файлы'],['Комментарии'],['История']],state.detailTab,'detail-tab','segmented-tabs clinic-detail-tabs')}${state.detailTab==='Обзор'?`<div class="detail-grid"><div class="detail-main-column"><section><h3>Общая информация</h3><div class="facts">${facts.map(([k,v])=>`<div><span>${k}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}</div></section>${serviceMarkup}</div><aside class="detail-side-column">${cadReviewMarkup?`<div class="order-side-stack cad-review-stack">${cadReviewMarkup}</div>`:''}<section><h3>Статус заказа</h3><div class="${details.serviceWorks?.length?'clinic-service-progress-list':'timeline clinic-production-timeline'}">${clinicTimeline}</div><div class="tech-stage-progress clinic-stage-progress" aria-label="Прогресс заказа ${progress}%"><div class="tech-progress-head"><span>Прогресс заказа</span><b>${progress}%</b></div><div class="tech-progress-track"><i style="width:${progress}%"></i></div></div>${details.stage==='В доставке'?`<div class="clinic-accept-actions"><button class="btn primary" data-action="doctor-accept" data-value="${escapeHtml(o.id)}">Принять работу</button><button class="btn outline" data-action="doctor-rework" data-value="${escapeHtml(o.id)}">Отправить на доработку</button></div>`:''}</section></aside></div>`:state.detailTab==='Файлы'?fileMarkup:state.detailTab==='Комментарии'?'<div class="info-note">Комментарии к заказу пока отсутствуют.</div>':historyMarkup}${clientRequestDialog(o)}${state.reworkOrderId===o.id?`<div class="tech-dialog-backdrop" data-action="cancel-rework"><section class="tech-dialog" role="dialog" aria-modal="true" aria-labelledby="rework-title"><h2 id="rework-title">Отправить заказ на доработку</h2><p>Опишите, что нужно исправить. Запрос появится в истории заказа и кабинете исполнителя.</p><form id="order-rework-form"><textarea name="reason" minlength="5" maxlength="2000" rows="5" required placeholder="Что нужно поправить в работе?" aria-label="Причина доработки"></textarea><div class="order-rework-actions"><button type="button" class="btn outline" data-action="cancel-rework">Отмена</button><button type="submit" class="btn primary">Отправить в лабораторию</button></div></form></section></div>`:''}${(state.cadReturnOrderId===o.id||details.serviceWorks?.some(work=>work.id===state.cadReturnOrderId))?`<div class="tech-dialog-backdrop cad-return-backdrop"><section class="tech-dialog cad-return-dialog" role="dialog" aria-modal="true" aria-labelledby="cad-return-title"><h2 id="cad-return-title">Вернуть CAD моделировщику</h2><p>Укажите конкретно, что нужно изменить.</p><form id="cad-return-form"><textarea name="comment" minlength="5" maxlength="2000" rows="5" required placeholder="Комментарий для моделировщика">${escapeHtml(state.cadReturnComment||'')}</textarea><div class="cad-return-files">${cadReturnAttachmentMarkup()}</div><label class="chat-attach-button cad-return-file-picker" title="Прикрепить скриншоты или файлы">${icon('paperclip',18)}<span>Добавить скриншоты или файлы</span><input id="cad-return-files" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.stl,.ply,.constructionInfo,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt,.rtf,.html" multiple hidden></label><small class="cad-return-file-hint">До 10 файлов, каждый до 200 МБ</small><div class="order-rework-actions"><button type="button" class="btn outline" data-action="cad-return-cancel">Отмена</button><button type="submit" class="btn primary">Вернуть на исправление</button></div></form></section></div>`:''}${orderUploadDialog()}${state.cadPreview?.orderId===o.id?`<div class="cad-preview-backdrop"><section class="cad-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="cad-preview-title"><header><div><h2 id="cad-preview-title">${escapeHtml(state.cadPreview.name||'CAD')}</h2><p>Интерактивный предпросмотр из HTML-файла</p></div><button data-action="cad-close" aria-label="Закрыть">×</button></header><iframe id="cad-preview-frame" src="${escapeHtml(state.cadPreview.url||'')}" sandbox="allow-scripts allow-same-origin allow-pointer-lock" referrerpolicy="no-referrer" title="Предпросмотр CAD"></iframe></section></div>`:''}`);
  const cadFrame=$('#cad-preview-frame');if(cadFrame&&state.cadPreview?.url)cadFrame.src=state.cadPreview.url;
}
function filesPage(){const files=[['xray.png','КТ_верхняя.jpg','12.03.2024','КТ/Рентген'],['tooth.png','Фото_16.jpg','12.03.2024','Фото'],['scan.png','Скан_верхняя.stl','10.03.2024','3D модели'],['smile.png','Прикус.jpg','10.03.2024','Фото'],['tooth.png','Фото_26.jpg','06.03.2024','Фото'],['file.png','План_лечения.pdf','08.03.2024','Документы'],['scan.png','Скан_нижняя.stl','05.03.2024','3D модели'],['xray.png','КТ_панорама.jpg','05.03.2024','КТ/Рентген'],['smile.png','Фото_улыбка.jpg','04.03.2024','Фото'],['tooth.png','Другое.jpg','04.03.2024','Фото']];shell(`${title('Файлы','Откройте нужный заказ, чтобы загрузить файлы прямо в его папку на Яндекс Диске.')}${tabs([['Все файлы'],['КТ/Рентген'],['Фото'],['3D модели'],['Документы']],state.fileTab,'file-tab','segmented-tabs')}<div class="file-grid">${files.filter(f=>state.fileTab==='Все файлы'||f[3]===state.fileTab).map(([src,name,date])=>`<button class="file-card" data-action="file-preview" data-value="${name}"><img src="${assets+src}" loading="lazy" decoding="async" alt=""><strong>${name}</strong><small>${date}</small></button>`).join('')}</div>`)}
const chatFileSize=size=>size>=1024*1024?`${(size/1024/1024).toFixed(1)} МБ`:`${Math.max(1,Math.ceil(size/1024))} КБ`;
function chatAttachmentMarkup(attachment,pending=false){if(!attachment)return '';const preview=attachment.preview?`<img src="${escapeHtml(attachment.preview)}" loading="lazy" decoding="async" alt="">`:`<span class="chat-file-icon">📄</span>`;return `<${pending?'div':'button'} class="chat-attachment ${pending?'pending':''}" ${pending?'':`type="button" data-chat-file="${escapeHtml(attachment.id)}"`}>${preview}<span><strong>${escapeHtml(attachment.name)}</strong><small>${chatFileSize(attachment.size)}</small></span>${pending?'<button type="button" data-action="remove-chat-attachment" aria-label="Убрать файл">×</button>':''}</${pending?'div':'button'}>`}
function cadReturnAttachmentMarkup(){return (state.cadReturnAttachments||[]).map((attachment,index)=>`<div class="cad-return-file"><div>${attachment.preview?`<img src="${escapeHtml(attachment.preview)}" alt="">`:'<span class="chat-file-icon">📄</span>'}<span><strong>${escapeHtml(attachment.name)}</strong><small>${chatFileSize(attachment.size)}</small></span></div><button type="button" data-action="remove-cad-return-attachment" data-value="${index}" aria-label="Убрать файл">×</button></div>`).join('')}
function formattedChatText(value){return escapeHtml(value).replace(/\s+(?=(?:Клиника|Заказ|Пациент|Работа|Раздел|Конструкция|Зубы|Режим|Челюсть|Срок|Цвет|Причина|Содержание|Запросил|Выполнить это действие в CRM)\s*:)/g,'\n')}
function chatMessageMarkup(message){const bot=message.from==='bot',sender=String(message.sender||'').trim(),author=bot?'Ответ AI':message.source==='telegram'&&message.from==='support'?(String(message.senderLabel||'').trim()||'Create Dental Team'):message.source==='telegram'&&sender?`Клиент · ${sender}`:'';return `<div class="bubble ${message.from==='client'?'me':'them'} ${bot?'bot':''}">${author?`<small class="message-author">${escapeHtml(author)}</small>`:''}${message.text?`<p>${formattedChatText(message.text)}</p>`:''}${chatAttachmentMarkup(message.attachment)}<time>${new Date(message.time).toLocaleTimeString(clinicIntlLocale(),{hour:'2-digit',minute:'2-digit'})}</time></div>`}
function clinicChatScrollElement(){
  return window.matchMedia('(max-width: 900px)').matches?document.scrollingElement:$('#chat-bubbles');
}
function scrollClinicChatToEnd(){
  const bubbles=$('#chat-bubbles');
  if(!bubbles)return;
  if(window.matchMedia('(max-width: 900px)').matches){
    const form=$('#chat-form'),nav=document.querySelector('.mobile-bottom-nav');
    if(form)window.scrollBy({top:bubbles.getBoundingClientRect().bottom+form.offsetHeight-window.innerHeight+(nav?.getBoundingClientRect().height||0)});
  }else bubbles.scrollTop=bubbles.scrollHeight;
}
function clinicChatNearEnd(){
  const bubbles=$('#chat-bubbles');
  if(!bubbles)return false;
  if(window.matchMedia('(max-width: 900px)').matches){
    const form=$('#chat-form'),nav=document.querySelector('.mobile-bottom-nav');
    return Boolean(form&&bubbles.getBoundingClientRect().bottom<=window.innerHeight-form.offsetHeight-(nav?.getBoundingClientRect().height||0)+64);
  }
  return bubbles.scrollHeight-bubbles.scrollTop-bubbles.clientHeight<64;
}
function messagesPage(){const previous=clinicChatScrollElement(),scrollTop=$('#chat-bubbles')?previous?.scrollTop:null;shell(`${title('Сообщения')}<div class="messages-layout"><div class="contacts"><button class="contact active"><span class="contact-avatar">CD</span><span><strong>Поддержка Create Dental</strong><small>Ваш диалог со службой поддержки</small></span></button></div><div class="conversation"><div class="conversation-head"><span class="contact-avatar">CD</span><span><strong>Поддержка Create Dental</strong><small id="chat-status">${escapeHtml(state.chatStatus)}</small></span></div><div class="chat-bubbles" id="chat-bubbles">${state.messages.length?state.messages.map(chatMessageMarkup).join(''):'<p class="chat-empty">Напишите сообщение, и оператор увидит его в своей панели.</p>'}</div><form id="chat-form" class="chat-compose chat-compose-files">${state.chatAttachment?`<div class="chat-pending-file">${chatAttachmentMarkup(state.chatAttachment,true)}</div>`:''}<label class="chat-attach-button" title="Прикрепить файл">📎<input id="clinic-chat-file" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.stl,.ply,.constructionInfo,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt,.rtf" hidden></label><input id="chat-input" maxlength="2000" placeholder="Напишите сообщение..." value="${escapeHtml(state.chatText)}" autocomplete="off"><button class="send-btn" aria-label="Отправить сообщение">➤</button></form></div></div>`);requestAnimationFrame(()=>{if(state.page!=='messages')return;if(scrollTop===null)scrollClinicChatToEnd();else{const scroller=clinicChatScrollElement();if(scroller)scroller.scrollTop=scrollTop}})}
function imageChatPreview(file){return new Promise((resolve,reject)=>{if(!file.type.startsWith('image/'))return resolve('');const image=new Image(),url=URL.createObjectURL(file);image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Не удалось открыть изображение'))};image.onload=()=>{const scale=Math.min(1,240/image.width,180/image.height),canvas=document.createElement('canvas'),context=canvas.getContext('2d');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));context.drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.72))};image.src=url})}
async function selectChatAttachment(file){if(!file)return;const allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|constructionInfo|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf)$/i;if(!allowed.test(file.name))return notify('Выберите изображение, PDF, 3D-файл, архив, Word, Excel или текстовый документ');if(file.size>200*1024*1024)return notify('Файл должен быть не больше 200 МБ');try{state.chatAttachment={file,name:file.name,size:file.size,type:file.type||'application/octet-stream',preview:await imageChatPreview(file)};messagesPage()}catch(error){notify(error.message)}}
async function loadMessages(){
  if(!portalReady||state.role!=='clinic') return;
  if(state.page!=='messages'&&state.page!=='home') return;
  const subjectId=portalUser?.subjectId;
  messagesRequestController?.abort();
  const controller=new AbortController();
  messagesRequestController=controller;
  try{
    const response=await fetch('/api/clinic-messages',{cache:'no-store',headers:{'X-Portal-Token':portalToken()},signal:controller.signal});
    if(!response.ok) throw new Error('Чат временно недоступен');
    const data=await response.json();
    if(portalUser?.subjectId!==subjectId)return;
    state.chatStatus='Служба поддержки онлайн · отвечаем 10:00–21:00 МСК';
    if($('#chat-status'))$('#chat-status').textContent=state.chatStatus;
    if(JSON.stringify(data.messages)!==JSON.stringify(state.messages)){
      state.messages=data.messages;
      const bubbles=$('#chat-bubbles');
      if(bubbles){
        const follow=clinicChatNearEnd()||!bubbles.children.length,scroller=clinicChatScrollElement(),scrollTop=scroller?.scrollTop||0;
        bubbles.innerHTML=state.messages.length?state.messages.map(chatMessageMarkup).join(''):'<p class="chat-empty">Напишите сообщение, и оператор увидит его в своей панели.</p>';
        if(follow)scrollClinicChatToEnd();else if(scroller)scroller.scrollTop=scrollTop;
      }
      if($('#recent-messages'))$('#recent-messages').innerHTML=recentMessagesMarkup();
    }
  }catch(error){if(error?.name==='AbortError')return;state.chatStatus=error.message; if($('#chat-status'))$('#chat-status').textContent=state.chatStatus}
  finally{if(messagesRequestController===controller)messagesRequestController=null}
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
let clinicDoctorEditId='',clinicDoctorBusy=false,doctorReturnToOrder=false;
function clinicDoctorsMarkup(){
  const clinic=clinicRecord()||{},hiddenIds=new Set(Array.isArray(clinic.clinicHiddenDoctorIds)?clinic.clinicHiddenDoctorIds:[]),doctors=(clinic.doctors||[]).filter(item=>!hiddenIds.has(item.id)),editing=doctors.find(item=>item.id===clinicDoctorEditId);
  return `<section class="clinic-doctors"><header><div><h2>Врачи клиники</h2><p>Добавьте врачей, чтобы указывать их в заказах и печатных нарядах.</p></div>${doctorReturnToOrder?'<button type="button" class="btn outline" data-action="doctor-return">Вернуться к заказу</button>':''}</header><form id="clinic-doctor-form"><label class="field"><span>ФИО врача</span><input name="doctorName" autocomplete="off" maxlength="120" minlength="2" required value="${escapeHtml(editing?.name||'')}" placeholder="Фамилия Имя Отчество"></label><label class="field"><span>Специальность · необязательно</span><input name="doctorSpecialty" autocomplete="off" maxlength="80" value="${escapeHtml(editing?.specialty||'')}" placeholder="Например, ортопед"></label><div class="clinic-doctor-form-actions"><button class="btn primary" type="submit">${editing?'Сохранить врача':'Добавить врача'}</button>${editing?'<button class="btn outline" type="button" data-action="doctor-cancel">Отмена</button>':''}</div></form><div class="clinic-doctor-list">${doctors.length?doctors.map(item=>`<article class="clinic-doctor-row"><div><strong>${escapeHtml(item.name)}</strong>${item.specialty?`<span class="clinic-doctor-specialty">${escapeHtml(item.specialty)}</span>`:''}<span>${item.active!==false?'Доступен при создании заказа':'В архиве — сохранён в прежних заказах'}</span></div><div class="clinic-doctor-actions"><button type="button" class="btn outline" data-action="doctor-edit" data-value="${escapeHtml(item.id)}" aria-label="Изменить врача ${escapeHtml(item.name)}">Изменить</button><button type="button" class="btn outline" data-action="doctor-delete" data-value="${escapeHtml(item.id)}" aria-label="Удалить врача ${escapeHtml(item.name)}">Удалить</button></div></article>`).join(''):'<p class="info-note">Врачей пока нет. Добавьте первого врача — он появится в списке при создании заказа.</p>'}</div></section>`;
}
async function persistClinicDoctors(doctors,hiddenIds){
  const subjectId=portalUser?.subjectId,token=portalToken();
  let clients=JSON.parse(localStorage.getItem('create-dental-tech-clients')||'[]');
  const clinic=clients.find(item=>item.id===portalUser?.subjectId);
  if(!clinic)throw new Error('Клиника не найдена');
  const nextHiddenIds=Array.isArray(hiddenIds)?[...new Set(hiddenIds.filter(id=>typeof id==='string'))]:(Array.isArray(clinic.clinicHiddenDoctorIds)?clinic.clinicHiddenDoctorIds:[]);
  const next=clients.map(item=>item.id===clinic.id?{...item,doctors,clinicHiddenDoctorIds:nextHiddenIds,doctorsRevision:clinic.doctorsRevision||0}:item);
  await savePortal('clients',next);
  if(portalUser?.subjectId!==subjectId||portalToken()!==token)throw new Error('Сеанс изменился. Откройте список врачей заново.');
  const data=await loadPortalSection('clients');
  if(portalUser?.subjectId!==subjectId||portalToken()!==token)throw new Error('Сеанс изменился. Откройте список врачей заново.');
  localStorage.setItem('create-dental-tech-clients',JSON.stringify(data.clients));
}
async function deleteClinicDoctor(id){
  if(clinicDoctorBusy)return;
  const clinic=clinicRecord()||{},doctors=clinic.doctors||[],doctor=doctors.find(item=>item.id===id);if(!doctor)return;
  if(!window.confirm(`Удалить врача «${doctor.name}» из кабинета клиники? В рабочей части главного техника и в старых заказах врач останется.`))return;
  const hiddenIds=[...(Array.isArray(clinic.clinicHiddenDoctorIds)?clinic.clinicHiddenDoctorIds:[]),id];
  clinicDoctorBusy=true;
  try{await persistClinicDoctors(doctors,hiddenIds);render();notify('Врач удалён из кабинета клиники. История заказов сохранена')}
  catch(error){notify(error.message)}finally{clinicDoctorBusy=false}
}
async function changeClinicDoctor(id){
  if(clinicDoctorBusy)return;
  const doctors=clinicRecord()?.doctors||[],doctor=doctors.find(item=>item.id===id);if(!doctor)return;
  clinicDoctorBusy=true;
  try{await persistClinicDoctors(doctors.map(item=>item.id===id?{...item,active:item.active===false}:item));render();notify(doctor.active!==false?'Врач убран из выбора. В старых заказах имя сохранено.':'Врач снова доступен для выбора')}
  catch(error){notify(error.message)}finally{clinicDoctorBusy=false}
}
document.addEventListener('submit',async event=>{
  if(event.target.id!=='clinic-doctor-form')return;
  event.preventDefault();if(clinicDoctorBusy)return;
  const form=event.target;if(!form.reportValidity())return;
  const clinic=clinicRecord()||{},allDoctors=clinic.doctors||[],hiddenIds=new Set(Array.isArray(clinic.clinicHiddenDoctorIds)?clinic.clinicHiddenDoctorIds:[]),doctors=allDoctors.filter(item=>!hiddenIds.has(item.id));
  const name=form.elements.doctorName.value.trim().replace(/\s+/g,' '),specialty=form.elements.doctorSpecialty.value.trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>120||/[<>]/.test(name))return notify('Укажите ФИО врача: от 2 до 120 символов');
  if(specialty.length>80||/[<>]/.test(specialty))return notify('Специальность: до 80 символов, без угловых скобок');
  if(doctors.some(item=>item.id!==clinicDoctorEditId&&item.active!==false&&item.name.toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru')))return notify('Врач с таким ФИО уже добавлен');
  const next=clinicDoctorEditId?allDoctors.map(item=>item.id===clinicDoctorEditId?{...item,name,specialty}:item):[...allDoctors,{id:crypto.randomUUID(),name,specialty,active:true}];
  clinicDoctorBusy=true;const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{await persistClinicDoctors(next);clinicDoctorEditId='';render();notify('Врач сохранён')}
  catch(error){notify(error.message);button.disabled=false}finally{clinicDoctorBusy=false}
});

function clinicPage(){
  const clinic={...(clinicRecord()||{name:'Клиника',inn:'',city:'',address:'',phone:'',email:''}),...(state.clinicDrafts[state.clinicTab]||{})};
  const input=(name,value,type='text',placeholder='')=>`<input name="${name}" type="${type}" value="${escapeHtml(value||'')}" ${placeholder?`placeholder="${escapeHtml(placeholder)}"`:''}>`;
  const area=(name,value,placeholder='')=>`<textarea name="${name}" rows="4" ${placeholder?`placeholder="${escapeHtml(placeholder)}"`:''}>${escapeHtml(value||'')}</textarea>`;
  const tabsList=[['Основная информация'],['Врачи'],['Рабочие настройки']];
  const fields={
    'Основная информация':`${field('Название клиники',input('name',clinic.name))}${field('Страна',`<select name="country" required>${[['RU','Россия'],['BY','Беларусь'],['AM','Армения'],['KZ','Казахстан'],['UZ','Узбекистан'],['AE','ОАЭ']].map(([code,name])=>`<option value="${code}" ${(clinic.country||'RU')===code?'selected':''}>${name}</option>`).join('')}</select>`)}${field('ИНН',input('inn',clinic.inn))}${field('Город',input('city',clinic.city))}${field('Адрес',input('address',clinic.address))}${field('Телефон клиники',input('phone',clinic.phone,'tel','+7 (___) ___-__-__'))}${field('Email клиники',input('email',clinic.email,'email'))}${field('Контактное лицо',input('contact',clinic.contact||''))}${field('Должность контактного лица',input('contactPosition',clinic.contactPosition||''))}${field('Телефон контактного лица',input('contactPhone',clinic.contactPhone||clinic.phone||'','tel','+7 (___) ___-__-__'))}`,
    'Рабочие настройки':`${field('График работы',input('workHours',clinic.workHours||'','text','Пн–Пт 09:00–18:00'))}<div class="clinic-work-instructions">${field('Инструкции для лаборатории',area('labNotes',clinic.labNotes||'','Например: позвонить перед доставкой или вложить документы в заказ'))}</div>`
  };
  const active=state.clinicTab==='Врачи'?'Врачи':fields[state.clinicTab]?state.clinicTab:'Основная информация';
  const clinicTabs=`<div class="tech-segment clinic-page-segment">${tabsList.map(([label])=>`<button data-action="clinic-tab" data-value="${escapeHtml(label)}" class="${active===label?'active':''}">${escapeHtml(label)}</button>`).join('')}</div>`;
  const sectionLabel=clinicSections.find(section=>section.key===state.clinicMobileSection)?.label;
  shell(`${sectionLabel?`<button type="button" class="clinic-mobile-back" data-mobile-ui="clinic-back">${icon('back',18)} Моя клиника</button>`:''}<div class="tech-heading clinic-page-heading"><div><span class="tech-eyebrow">КЛИНИКА</span><h1><span class="clinic-desktop-title">Моя клиника</span><span class="clinic-mobile-title">${escapeHtml(sectionLabel||'Моя клиника')}</span></h1></div></div>${clinicTabs}${clinicMobileUI.sectionsMarkup(state.clinicMobileSection)}<div class="clinic-content clinic-settings-content${sectionLabel?' section-open':''}" data-section="${escapeHtml(active)}">${active==='Врачи'?clinicDoctorsMarkup():`<div class="clinic-photo"><strong>Логотип клиники</strong><img id="clinic-logo-preview" src="${clinic.logo||assets+'clinic.png'}" alt="Логотип клиники"><button type="button" data-action="change-logo">Изменить логотип</button><input id="clinic-logo-input" name="logoFile" type="file" accept="image/png,image/jpeg,image/webp" hidden></div><form id="clinic-form" class="clinic-form"><input type="hidden" name="logo" value="${escapeHtml(clinic.logo||'')}"><div class="form-grid">${fields[active]}<div class="save-field"><button class="btn primary" type="submit">Сохранить изменения</button></div></div></form>`}</div>`);
}
function referencePage(){shell(`${title('Справочник','Информация о конструкциях, материалах и оформлении заказов.')}<div class="reference-grid">${[['Коронки E.max','Эстетичные цельнокерамические реставрации.'],['Виниры','Тонкие накладки для восстановления улыбки.'],['Мостовидные протезы','Конструкции для замещения отсутствующих зубов.'],['3D сканирование','Цифровые слепки для точной работы.']].map(([h,p])=>`<article class="reference-card">${icon('book',25)}<h3>${h}</h3><p>${p}</p></article>`).join('')}</div>`)}
let technicianCabinet=null;
let workerCabinet=null;
let portalReady=false;
let portalUser=null;
let authMode=initialRoute.mode||'login';
let portalError='';
let authNotice='';
let authDraft={name:'',phone:'',email:'',country:'RU',city:'',address:'',password:'',promoCode:String(oldLink.get('promo')||oldLink.get('promoCode')||'').trim().toUpperCase()};
const authTranslations={
  ru:{login:'Личный кабинет Create Dental',register:'Регистрация клиники',subtitle:'Заказы, производство и связь с лабораторией.',clinic:'Название клиники',phone:'Телефон',email:'Email',country:'Страна',city:'Город',address:'Адрес',password:'Пароль от 8 символов',emailLogin:'Email или логин',loginButton:'Войти',registerButton:'Зарегистрироваться',registerLink:'Регистрация',forgot:'Забыли пароль?',back:'← Вернуться ко входу',recover:'Восстановление пароля',recoverText:'Напишите нам, чтобы получить новый пароль:',countries:['Россия','Беларусь','Армения','Казахстан','Узбекистан','ОАЭ']},
  am:{login:'Create Dental-ի անձնական էջ',register:'Կլինիկայի գրանցում',subtitle:'Պատվերներ, արտադրություն և կապ լաբորատորիայի հետ։',clinic:'Կլինիկայի անվանումը',phone:'Հեռախոս',email:'Էլ․ փոստ',country:'Երկիր',city:'Քաղաք',address:'Հասցե',password:'Գաղտնաբառ՝ առնվազն 8 նիշ',emailLogin:'Էլ․ փոստ կամ մուտքանուն',loginButton:'Մուտք գործել',registerButton:'Գրանցել կլինիկան',registerLink:'Գրանցում',forgot:'Մոռացե՞լ եք գաղտնաբառը',back:'← Վերադառնալ մուտքին',recover:'Գաղտնաբառի վերականգնում',recoverText:'Նոր գաղտնաբառ ստանալու համար գրեք մեզ՝',countries:['Ռուսաստան','Բելառուս','Հայաստան','Ղազախստան','Ուզբեկստան','ԱՄԷ']},
  uz:{login:'Create Dental shaxsiy kabineti',register:'Klinikani ro‘yxatdan o‘tkazish',subtitle:'Buyurtmalar, ishlab chiqarish va laboratoriya bilan aloqa.',clinic:'Klinika nomi',phone:'Telefon',email:'Email',country:'Mamlakat',city:'Shahar',address:'Manzil',password:'Parol — kamida 8 belgi',emailLogin:'Email yoki login',loginButton:'Kirish',registerButton:'Klinikani ro‘yxatdan o‘tkazish',registerLink:'Ro‘yxatdan o‘tish',forgot:'Parolni unutdingizmi?',back:'← Kirishga qaytish',recover:'Parolni tiklash',recoverText:'Yangi parol olish uchun bizga yozing:',countries:['Rossiya','Belarus','Armaniston','Qozog‘iston','O‘zbekiston','BAA']},
  kk:{login:'Create Dental жеке кабинеті',register:'Клиниканы тіркеу',subtitle:'Тапсырыстар, өндіріс және зертханамен байланыс.',clinic:'Клиника атауы',phone:'Телефон',email:'Email',country:'Ел',city:'Қала',address:'Мекенжай',password:'Құпиясөз — кемінде 8 таңба',emailLogin:'Email немесе логин',loginButton:'Кіру',registerButton:'Клиниканы тіркеу',registerLink:'Тіркелу',forgot:'Құпиясөзді ұмыттыңыз ба?',back:'← Кіруге оралу',recover:'Құпиясөзді қалпына келтіру',recoverText:'Жаңа құпиясөз алу үшін бізге жазыңыз:',countries:['Ресей','Беларусь','Армения','Қазақстан','Өзбекстан','БАӘ']},
  ar:{login:'الحساب الشخصي — Create Dental',register:'تسجيل العيادة',subtitle:'الطلبات والإنتاج والتواصل مع المختبر.',clinic:'اسم العيادة',phone:'الهاتف',email:'البريد الإلكتروني',country:'الدولة',city:'المدينة',address:'العنوان',password:'كلمة المرور — 8 أحرف على الأقل',emailLogin:'البريد الإلكتروني أو اسم المستخدم',loginButton:'دخول',registerButton:'تسجيل العيادة',registerLink:'التسجيل',forgot:'هل نسيت كلمة المرور؟',back:'العودة إلى تسجيل الدخول ←',recover:'استعادة كلمة المرور',recoverText:'راسلنا للحصول على كلمة مرور جديدة:',countries:['روسيا','بيلاروس','أرمينيا','كازاخستان','أوزبكستان','الإمارات']}
};
function localizeAuth(){
  const page=document.querySelector('.portal-login');if(!page)return;
  const route=routeFromPath(location.pathname);let locale=route.locale||document.documentElement.dataset.locale||'ru';try{if(!route.locale)locale=localStorage.getItem('create-dental-locale')||locale}catch{}
  if(locale==='hy')locale='am';const t=authTranslations[locale]||authTranslations.ru;page.dir=locale==='ar'?'rtl':'ltr';page.lang=locale==='am'?'hy':locale==='kk'?'kk':locale;
  const title=page.querySelector('h1');if(title)title.textContent=authMode==='register'?t.register:authMode==='recover'?t.recover:t.login;
  const subtitle=page.querySelector('section>p');if(subtitle)subtitle.textContent=authMode==='recover'?t.recoverText:t.subtitle;
  const labels=[t.clinic,t.phone,t.email,t.city,t.address,t.password];
  page.querySelectorAll('#portal-login-form label').forEach(label=>{if(label.dataset.authField==='country'){const country=label.querySelector('input[name=country]')?.value||'RU',index=['RU','BY','AM','KZ','UZ','AE'].indexOf(country);label.querySelector('[data-auth-label]').textContent=t.country;label.querySelector('[data-auth-country]').textContent=t.countries[index]||country;return}if(label.querySelector('select')){label.childNodes[0].textContent=t.country;label.querySelectorAll('option').forEach((option,i)=>{option.textContent=t.countries[i]||option.textContent});return}if(label.firstChild?.nodeType===Node.TEXT_NODE){const name=label.querySelector('input')?.name;const byName={name:t.clinic,phone:t.phone,email:t.email,city:t.city,address:t.address,password:t.password,promoCode:'Промокод'};label.firstChild.textContent=byName[name]||t.emailLogin}});
  const recoveryCopy=page.querySelector('.auth-recovery p');if(recoveryCopy)recoveryCopy.innerHTML=`${t.recoverText} <a href="mailto:ceo@createdental.ai"><bdi dir="ltr">ceo@createdental.ai</bdi></a>`;
  const submit=page.querySelector('#portal-login-form .btn.primary');if(submit)submit.textContent=authMode==='register'?t.registerButton:t.loginButton;
  const links=page.querySelectorAll('.auth-links button');links.forEach(button=>{if(button.dataset.authMode==='register')button.textContent=t.registerLink;else if(button.dataset.authMode==='recover')button.textContent=t.forgot;else button.textContent=t.back});
  const recovery=page.querySelector('.auth-recovery h2');if(recovery)recovery.textContent=t.recover;
}
document.addEventListener('create-dental:locale-changed',()=>{if(portalReady&&portalUser?.role==='clinic'){render();return}localizeAuth()});
function currentAuthLocale(){return 'ru'}
const authLocaleMeta={ru:{slug:'ru',country:'RU'},am:{slug:'am',country:'AM'},uz:{slug:'uz',country:'UZ'},kk:{slug:'kz',country:'KZ'},ar:{slug:'uae',country:'AE'}};
function loginView(){
  const locale='ru',meta=authLocaleMeta.ru;
  if(authMode==='register'){
    const canonical=pathFor(null,'register');
    if(location.pathname!==canonical)navigate(canonical,{replace:true});
  }
  const field=(label,name,type='text',minimum='',value='')=>`<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${minimum?`minlength="${minimum}"`:''} required></label>`;
  const labels=authTranslations[locale]||authTranslations.ru;
  const countryIndex=['RU','BY','AM','KZ','UZ','AE'].indexOf(meta.country);
  const countryCodes=['RU','BY','AM','KZ','UZ','AE'];
  const fixedCountry=`<label><span>${labels.country}</span><select name="country" required>${countryCodes.map((code,index)=>`<option value="${code}" ${authDraft.country===code?'selected':''}>${escapeHtml(labels.countries[index])}</option>`).join('')}</select></label>`;
  const form=authMode==='register'
    ?`${field(labels.clinic,'name','text','',authDraft.name)}${field(labels.phone,'phone','tel','',authDraft.phone)}${field(labels.email,'email','email','',authDraft.email)}${fixedCountry}${field(labels.city,'city','text','',authDraft.city)}${field(labels.address,'address','text','',authDraft.address)}${field('Промокод','promoCode','text','',authDraft.promoCode)}${field(labels.password,'password','password',8,authDraft.password)}<label class="auth-consent"><input type="checkbox" name="personalDataConsentVersion" value="1.0" required><span>Даю отдельное согласие на обработку персональных данных для регистрации и работы в кабинете клиники. <a href="/assets/legal/consent-data.html" target="_blank" rel="noopener">Текст согласия</a></span></label><button class="btn primary">${labels.registerButton}</button>`
    :`${field(labels.emailLogin,'email')}${field(labels.password,'password','password')}<button class="btn primary">${labels.loginButton}</button>`;
  const links=authMode==='login'
    ?'<div class="auth-links"><button type="button" data-auth-mode="register">Регистрация</button><button type="button" data-auth-mode="recover">Забыли пароль?</button></div>'
    :'<div class="auth-links"><button type="button" data-auth-mode="login">← Вернуться ко входу</button></div>';
  const content=authMode==='recover'
    ?'<div class="auth-recovery"><p></p></div>'
    :`<form id="portal-login-form" data-mode="${authMode}">${form}</form>`;
  $('#app').innerHTML=`<main class="portal-login"><div class="portal-login-tools">${languageSwitcherMarkup()}${themeToggleMarkup()}</div><section><img class="portal-logo" src="${logo}" alt="Create Dental"><h1>${authMode==='register'?labels.register:authMode==='recover'?labels.recover:labels.login}</h1>${authMode==='recover'?'':`<p>${labels.subtitle}</p>`}${content}${links}${authNotice?`<p class="portal-login-success">${escapeHtml(authNotice)}</p>`:''}${portalError?`<p class="portal-login-error">${escapeHtml(portalError)}</p>`:''}</section>${portalFooter()}</main>`;
  localizeAuth();
}
function render(){if(!portalReady){if(portalToken()){$('#app').innerHTML='<div class="startup-notice">Загрузка кабинета...</div>';return}loginView();return}state.role=portalUser.role;if(state.role==='technician'){technicianCabinet.render();return}if(state.role==='worker'){workerCabinet.render();return}const page=state.page;({home:dashboard,new:newOrder,orders:ordersPage,detail,files:filesPage,messages:messagesPage,clinic:clinicPage,reference:referencePage}[page]||dashboard)();if(state.datePickerOpen)queueMicrotask(positionDatePicker);if(page==='messages'||page==='home')queueMicrotask(loadMessages)}
function syncRoute(){
  const route=routeFromPath(location.pathname);
  if(!portalReady){authMode=route.mode||'login';render();return}
  if(route.role!==portalUser.role){navigate(pathFor(portalUser.role,portalUser.role==='clinic'?'home':'overview'),{replace:true});state.page='home'}
  else if(portalUser.role==='clinic'){
    state.page=route.page;
    if(route.orderId){
      state.orderId=resolveOrderId(route.orderId,orders);
      const canonical=pathFor('clinic','detail',state.orderId);
      if(location.pathname!==canonical)navigate(canonical,{replace:true});
    }
  }
  render();
}
function applyPortalData(data){
  if(portalUser?.subjectId!==data.user.subjectId){state.messages=[];clinicDoctorEditId='';doctorReturnToOrder=false;}
  portalUser=data.user;
  activePromoCode=String(data.promoCode||'').toUpperCase();
  promoPrices=data.promoPrices&&typeof data.promoPrices==='object'?data.promoPrices:{};
  if(data.deliverySettings&&typeof data.deliverySettings==='object'){const freeThreshold=Number(data.deliverySettings.freeThreshold),fee=Number(data.deliverySettings.fee);deliverySettings={freeThreshold:Number.isFinite(freeThreshold)&&freeThreshold>=0?freeThreshold:defaultDeliverySettings.freeThreshold,fee:Number.isFinite(fee)&&fee>=0?fee:defaultDeliverySettings.fee};}
  portalPromoCodes=Array.isArray(data.promoCodes)?structuredClone(data.promoCodes):portalPromoCodes;
  if(Array.isArray(data.workCatalog))workCatalog.splice(0,workCatalog.length,...structuredClone(data.workCatalog));
  orders.splice(0,orders.length,...data.orders);
  portalHistory=data.orderHistory||[];
  portalClientRequests=data.clientRequests||[];
  portalTasks.splice(0,portalTasks.length,...(data.tasks||[]));
  localStorage.setItem('create-dental-tech-orders',JSON.stringify(data.orderOverrides));
  localStorage.setItem('create-dental-tech-clients',JSON.stringify(data.clients));
  localStorage.setItem('create-dental-employees',JSON.stringify(data.employees));
}
async function hydratePortal(){
  // Start the technician cabinet from a compact response. The complete
  // history and logo payload is fetched in the background for detail pages.
  const data=await loadPortal('compact');
  if(data.user.role==='technician'&&!technicianCabinet){
      const {createTechnicianCabinet}=await import('./technician.js?v=compact-toolbar-2');
    technicianCabinet=createTechnicianCabinet({root:()=>$('#app'),orders,assets,logo,icon,toothChart,isActive:()=>state.role==='technician',currentUser:()=>portalUser,orderHistory:()=>portalHistory,clientRequests:()=>portalClientRequests,tasks:()=>portalTasks,deliverySettings:()=>({...deliverySettings}),onDeliverySettingsUpdate:settings=>{deliverySettings={...defaultDeliverySettings,...settings}},promoCodes:()=>portalPromoCodes,onPromoCodesUpdate:items=>{portalPromoCodes=structuredClone(items)},onUserUpdate:user=>{portalUser=user}});
  }
  if(data.user.role==='worker'&&!workerCabinet){
    const {createWorkerCabinet}=await import('./worker.js?v=worker-sidebar-route-1');
    workerCabinet=createWorkerCabinet({root:()=>$('#app'),orders,assets,logo,icon,toothChart,isActive:()=>state.role==='worker',currentUser:()=>portalUser,orderHistory:()=>portalHistory,tasks:()=>portalTasks,onUserUpdate:user=>{portalUser=user}});
  }
  applyPortalData(data);
  portalReady=true;
  portalError='';
  refreshNotificationCenter().then(()=>{const center=document.querySelector('.notification-center');if(center)center.outerHTML=notificationCenterMarkup()}).catch(()=>{});
  syncRoute();
  if(data.user.role==='technician'){
    // Keep the first paint compact and hydrate the two heavy collections in
    // parallel. Other sections already arrive in the compact snapshot.
    Promise.all([loadPortalSection('orderHistory'),loadPortalSection('clients')]).then(([historyData,clientsData])=>{
      if(!portalReady||portalUser?.subjectId!==data.user.subjectId)return;
      portalHistory=historyData.orderHistory||[];
      localStorage.setItem('create-dental-tech-clients',JSON.stringify(clientsData.clients||[]));
      technicianCabinet?.render();
    }).catch(()=>{});
  }
}
function currentOrderDraft(){return {form:{...state.form},variants:allVariants().filter(variantIsComplete).map(variant=>({...variant,bridgeRanges:variant.bridgeRanges.map(range=>[...range]),selectedTeeth:[...variant.selectedTeeth]})),uploaded:[...state.uploaded],estimate:totalOrderEstimateText()}}
function resetCurrentVariant({keepWork=false}={}){const work=keepWork?state.work:'';state.currentVariantBase=null;state.toothMode='Одиночка';state.bridgeRanges=[];state.bridgeStart=null;state.selectedTeeth=[];state.work=work;state.workOption='';state.form.construction=work;state.form.material=''}
function resetOrderDraft(){const due=new Date(Date.now()+14*86400000).toISOString().slice(0,10);state.form={doctorId:'',surname:'',initials:'',birth:'',orderType:'',construction:'',material:'',quantity:'1',due,shade:'A1',comment:''};state.orderVariants=[];resetCurrentVariant();state.uploaded=[];state.step=0}
function persistCurrentVariant(){
  const variant=currentVariant();
  if(!variantIsComplete(variant)||state.toothMode==='Мост'&&(state.bridgeStart||!state.bridgeRanges.length))return false;
  const saved=state.orderVariants||[],baseIndex=currentVariantBaseIndex();
  if(baseIndex>=0){
    const changed=variantSignature(saved[baseIndex])!==variantSignature(variant);
    saved[baseIndex]=cloneVariant(variant);
    state.currentVariantBase=cloneVariant(variant);
    return changed;
  }
  if(currentVariantSaved()){state.currentVariantBase=cloneVariant(variant);return false}
  if(orderServiceCount(saved)>=10){notify('В одном заказе можно добавить до 10 услуг');return false}
  state.orderVariants=[...saved,cloneVariant(variant)];
  state.currentVariantBase=cloneVariant(variant);
  return true;
}
function addOrderVariant(){
  if(!variantIsComplete(currentVariant()))return notify('Сначала выберите зубы и услугу для текущей позиции');
  persistCurrentVariant();
  if(!currentVariantSaved())return;
  resetCurrentVariant({keepWork:true});
  notify('Услуга добавлена · выберите зубы для следующей услуги');
}
function selectWorkOption(option){
  const current=currentVariant(),baseIndex=currentVariantBaseIndex();
  if(current.workOption&&current.workOption!==option){
    // Newly selected teeth belong to the next service. Teeth already attached
    // to the previous cart line remain on that line until explicitly edited.
    const base=baseIndex>=0?state.orderVariants[baseIndex]:null;
    if(base){
      const existing=new Set(base.selectedTeeth||[]);
      state.selectedTeeth=current.selectedTeeth.filter(tooth=>!existing.has(tooth));
      state.bridgeRanges=current.bridgeRanges.filter(range=>range.every(tooth=>!existing.has(tooth))).map(range=>[...range]);
      if(current.toothMode==='Мост')state.selectedTeeth=state.bridgeRanges.flat();
      state.bridgeStart=null;
    }else if(variantIsComplete(current)){
      persistCurrentVariant();state.selectedTeeth=[];state.bridgeRanges=[];state.bridgeStart=null;
    }
    state.currentVariantBase=null;
  }
  const selectedBefore=[...state.selectedTeeth];
  state.workOption=option;state.form.material=option;
  if(isNoTeethSelection(state.work,option)){
    state.selectedTeeth=[];state.toothMode='Одиночка';state.bridgeRanges=[];state.bridgeStart=null;
    if(!state.orderVariants?.length&&currentProductionDays()===null)state.form.due='';
  }else if(currentUsesJawSplit()){
    const jaws=[upperTeeth,lowerTeeth].filter(arch=>arch.some(tooth=>selectedBefore.includes(tooth)));
    state.toothMode='Челюсть';state.selectedTeeth=jaws.length?jaws.flatMap(arch=>arch):selectedBefore;state.bridgeRanges=[];state.bridgeStart=null;
  }
  persistCurrentVariant();
}
function addProstheticAddon(optionName){
  const category=workCatalog.find(item=>item.name==='Протетика'),option=category?.options.find(item=>workOptionName(item)===optionName),current=currentVariant();
  if(!option)return notify('Не удалось найти выбранную позицию протетики');
  if(!variantIsComplete(current))return notify('Сначала выберите зубы и раздел текущей услуги');
  if(orderServiceCount(allVariants().filter(variantIsComplete))+1>10)return notify('В одном заказе можно добавить до 10 услуг');
  const addon={...current,work:category.name,workOption:optionName,shade:''};
  if(isNoTeethSelection(category.name,optionName)){addon.selectedTeeth=[];addon.toothMode='Одиночка';addon.bridgeRanges=[]}
  persistCurrentVariant();
  state.orderVariants=[...(state.orderVariants||[]),cloneVariant(addon)];
  resetCurrentVariant({keepWork:true});
  refreshOrderBuilder();
  notifyWithoutRender('Позиция добавлена в заказ · выберите следующую услугу');
}
function addPlanningAddon(optionName){
  const category=workCatalog.find(item=>item.name==='Дополнительные работы'),option=category?.options.find(item=>workOptionName(item)===optionName),current=currentVariant();
  if(!option)return notify('Не удалось найти выбранную дополнительную работу');
  if(!variantIsComplete(current))return notify('Сначала выберите зубы и вариант услуги');
  const addon={...current,work:category.name,workOption:optionName,shade:''};
  if(orderServiceCount(allVariants().filter(variantIsComplete))+1>10)return notify('В одном заказе можно добавить до 10 услуг');
  persistCurrentVariant();
  if(!state.orderVariants.some(variant=>variantSignature(variant)===variantSignature(addon)))state.orderVariants=[...(state.orderVariants||[]),cloneVariant(addon)];
  resetCurrentVariant({keepWork:true});
  refreshOrderBuilder();
  notifyWithoutRender('Ключ добавлен в заказ');
}
function addSurgicalSocket(jaw){
  const current=currentVariant(),category=workCatalog.find(item=>item.name===SURGICAL_TEMPLATE_CATEGORY),option=category?.options.find(item=>workOptionName(item)===SURGICAL_SOCKET_OPTION);
  if(!option)return notify('Не удалось найти услугу дополнительного гнезда');
  if(!isSurgicalTemplate(current)||!variantIsComplete(current))return notify('Сначала выберите хирургический шаблон и челюсть');
  if(!hasSurgicalJaw(current,jaw))return notify('Сначала выберите эту челюсть для шаблона');
  const arch=jaw==='upper'?upperTeeth:lowerTeeth,saved=state.orderVariants||[],existing=saved.find(variant=>isSurgicalSocket(variant)&&hasSurgicalJaw(variant,jaw));
  const guideTeeth=current.selectedTeeth.filter(tooth=>!saved.some(variant=>isSurgicalTemplate(variant)&&hasSurgicalJaw(variant,tooth<30?'upper':'lower')));
  let guide=guideTeeth.length?{...current,selectedTeeth:guideTeeth,bridgeRanges:current.bridgeRanges.map(range=>[...range])}:null;
  if(guide&&orderServiceCount(saved)>=10)return notify('В одном заказе можно добавить до 10 услуг');
  if(existing){
    if((Number(existing.units)||1)>=SURGICAL_SOCKETS_PER_JAW)return notify(`Достигнут предел: ${SURGICAL_SOCKETS_PER_JAW} гнёзд на челюсть`);
    existing.units=(Number(existing.units)||1)+1;
  }else if(orderServiceCount(saved)+(guide?1:0)>10)return notify('В одном заказе можно добавить до 10 услуг');
  else{
    state.orderVariants=[...saved,...(guide?[guide]:[]),{...current,work:SURGICAL_TEMPLATE_CATEGORY,workOption:SURGICAL_SOCKET_OPTION,selectedTeeth:[...arch],toothMode:'Челюсть',bridgeRanges:[],units:1}];guide=null;
  }
  if(guide)state.orderVariants=[...(state.orderVariants||[]),guide];
  refreshOrderBuilder();
  notifyWithoutRender(`Добавлено гнездо · ${jaw==='upper'?'верхняя':'нижняя'} челюсть`);
}
function changeSurgicalSocketQuantity(index,delta){
  const variant=state.orderVariants?.[index];
  if(!isSurgicalSocket(variant))return;
  const next=adjustSurgicalSockets(variant,delta);
  if(next===(Number(variant.units)||1))return;
  variant.units=next;refreshOrderBuilder();
}
function removeOrderVariant(index){
  const saved=state.orderVariants||[],current=currentVariant();
  const unsavedCurrent=index===saved.length&&variantIsComplete(current)&&!currentVariantSaved()&&!currentSurgicalGuideIncluded();
  const variant=unsavedCurrent?current:saved[index];
  if(!variant)return;
  const removedSignature=variantSignature(variant);
  if(isSurgicalTemplate(variant)){
    const jaws=['upper','lower'].filter(jaw=>hasSurgicalJaw(variant,jaw));
    state.orderVariants=state.orderVariants.filter((item,itemIndex)=>itemIndex!==index&&!(isSurgicalSocket(item)&&jaws.some(jaw=>hasSurgicalJaw(item,jaw))));
  }else state.orderVariants.splice(index,1);
  if(variantSignature(currentVariant())===removedSignature||state.currentVariantBase&&variantSignature(state.currentVariantBase)===removedSignature)resetCurrentVariant();
}
function addCurrentOrderToCart(){if(state.cart.length>=19)return notify('За один раз можно оформить до 20 заказов');state.cart.push(currentOrderDraft());resetOrderDraft();notify('Заказ добавлен в корзину. Заполните следующий заказ.')}
function startAnotherCartOrder(){
  if(state.step!==0||state.selectedTeeth.length||state.work||state.form.surname||state.form.initials||state.uploaded.length)return notify('Сначала завершите текущий заказ или добавьте его в корзину');
  state.step=0;render();
}
function orderFromDraft(draft,index=0){
  const id=`CD-${(Date.now()+index).toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,4).toUpperCase()}`,draftVariants=draft.variants?.length?draft.variants:[{toothMode:draft.toothMode,bridgeRanges:draft.bridgeRanges||[],selectedTeeth:draft.selectedTeeth||[],work:draft.form.construction,workOption:draft.form.material}],variants=draftVariants.map(variant=>({...variant,camMethod:variant.camMethod==='manufacturing'?'manufacturing':variant.camMethod==='milling'?'milling':camMethodForSelection(variant.work,variant.workOption)})),groups=groupSurgicalSockets(variants),teeth=[...new Set(variants.flatMap(variant=>variant.selectedTeeth||[]))].sort((a,b)=>a-b),estimate=variants.map(variant=>variantEstimate(variant)).every(Number.isFinite)?variants.reduce((sum,variant)=>sum+(variantEstimate(variant)||0),0):null,deliveryFee=deliveryFeeForSubtotal(estimate),grandTotal=Number.isFinite(estimate)&&Number.isFinite(deliveryFee)?estimate+deliveryFee:null,quantity=variants.filter(variant=>!isSurgicalSocket(variant)).reduce((sum,variant)=>sum+variantUnits(variant),0),serviceLabels=groups.map(({variant,sockets})=>`${variant.workOption||variant.work}${sockets.length?` + ${sockets.map(({variant:socket})=>`${variantUnits(socket)} доп. гнёзд`).join(', ')}`:''}`),primary=groups[0]?.variant;
  const restorationShade=variants.find(variantUsesShade)?.shade||'';
  return {id,doctorId:draft.form.doctorId||'',doctor:activeClinicDoctors().find(item=>item.id===draft.form.doctorId)?.name||'',patient:`${draft.form.surname} ${draft.form.initials}`.trim(),birth:draft.form.birth||'',work:groups.length>1?`Несколько услуг (${groups.length})`:primary?.work||draft.form.construction,material:groups.length>1?serviceLabels.join(' · '):serviceLabels[0]||draft.form.material,toothMode:groups.length>1?'Несколько услуг':primary?.toothMode||'Одиночка',bridgeRanges:variants.flatMap(variant=>variant.bridgeRanges||[]).map(range=>[...range]),quantity:Math.max(1,quantity),date:draft.form.due.split('-').reverse().join('.'),status:'Новый',productionType:draft.form.orderType==='analog'?'analog':'digital',servicesTotal:estimate,deliveryFee:deliveryFee,promoCode:activePromoCode,sum:grandTotal===null?'Стоимость уточняется':rubles(grandTotal),image:'tooth.png',clinicId:portalUser.subjectId,clinic:clinicRecord()?.name||'Клиника',teeth,shade:restorationShade,comment:draft.form.comment,variants,createdAt:new Date(Date.now()+index).toISOString(),pendingFiles:draft.uploaded||[]};
}
async function createOrder(){
  if(orderCreationInFlight)return;
  if(activeClinicDoctors().length&&!activeClinicDoctors().some(item=>item.id===state.form.doctorId)){notify('Выберите действующего врача для заказа');state.step=0;render();return;}
  orderCreationInFlight=true;
  const drafts=[currentOrderDraft()],created=drafts.map((draft,index)=>orderFromDraft(draft,index));
  try {
    await savePortal('orders',[...created.map(({pendingFiles,...order})=>order),...orders]);
    orders.unshift(...created.map(({pendingFiles,...order})=>order));
    const failed=[];
    for(const order of created)for(const file of order.pendingFiles){try{await uploadOrderFile(order.id,file)}catch(error){failed.push(`${file.name}: ${error.message}`)}finally{releaseUploadPreview(file)}}
    state.cart=[];resetOrderDraft();state.page='detail';state.orderId=created[0].id;
    state.filesFor='';state.orderFiles=[];
    navigate(pathFor('clinic','detail',created[0].id));
    notify(failed.length?`Заказ создан, но не загружены файлы: ${failed.join('; ')}`:created.length>1?`Созданы ${created.length} заказа и доступны лаборатории`:'Заказ создан и доступен лаборатории');
  } catch(error){notify('Не удалось создать заказ: '+error.message)}
  finally{orderCreationInFlight=false}
}

function repeatOrder(orderId){
  const order=currentOrders().find(item=>item.id===orderId);
  if(!order)return;
  const due=new Date();due.setDate(due.getDate()+14);
  const repeatedShade=Array.isArray(order.variants)?order.variants.find(variantUsesShade)?.shade||'':variantUsesShade({work:order.work})?order.shade||'A1':'';
  state.currentVariantBase=null;state.orderVariants=[];state.form={...state.form,surname:'',initials:'',birth:'',orderType:order.productionType==='analog'?'analog':'digital',construction:order.work||'',material:order.material||'',quantity:String(order.quantity||Math.max(1,order.teeth?.length||1)),due:due.toISOString().slice(0,10),shade:repeatedShade||'A1',comment:order.comment||''};
  state.work=order.work||'';state.workOption=order.material||'';state.toothMode=order.toothMode||'Одиночка';
  state.bridgeRanges=state.toothMode==='Мост'?(Array.isArray(order.bridgeRanges)&&order.bridgeRanges.length?order.bridgeRanges.map(range=>[...range]):Array.isArray(order.teeth)&&order.teeth.length?[[...order.teeth]]:[]):[];
  state.bridgeStart=null;
  state.form.doctorId=activeClinicDoctors().some(item=>item.id===order.doctorId)?order.doctorId:'';
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

function toggleOrderJaw(jaw){
  const arch=jaw==='upper'?upperTeeth:lowerTeeth;
  const selected=arch.every(tooth=>state.selectedTeeth.includes(tooth));
  state.toothMode='Челюсть';
  state.selectedTeeth=selected?state.selectedTeeth.filter(tooth=>!arch.includes(tooth)):[...new Set([...state.selectedTeeth,...arch])].sort((a,b)=>a-b);
  state.bridgeRanges=[];
  state.bridgeStart=null;
}

function selectOrderTooth(number){
  if(currentUsesJawSplit()||state.toothMode==='Челюсть'){
    toggleOrderJaw(number<30?'upper':'lower');
    return;
  }
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
  state.selectedTeeth=state.selectedTeeth.includes(number)?state.selectedTeeth.filter(tooth=>tooth!==number):[...state.selectedTeeth,number].sort((a,b)=>a-b);
}

function advanceOrderStep(){
  if(state.step===0&&activeClinicDoctors().length&&!activeClinicDoctors().some(item=>item.id===state.form.doctorId)){notify('Выберите врача для этого заказа');return false}
  if(state.step===0&&(!state.form.surname.trim()||!state.form.initials.trim())){notify('Укажите фамилию и имя пациента. Отчество — по желанию');return false}
  if(state.step===0&&!state.form.orderType){notify('Выберите тип работы: цифровой или аналоговый');return false}
  const noTeeth=currentNeedsNoTeeth(),currentComplete=variantIsComplete(currentVariant()),hasSavedVariants=Boolean(state.orderVariants?.length),currentBlank=!state.selectedTeeth.length&&!state.work&&!state.workOption&&!state.bridgeStart&&!state.bridgeRanges.length;
  if(state.step===1&&!currentComplete&&!hasSavedVariants){notify(noTeeth?'Выберите вариант услуги':'Выберите зуб или челюсть');return false}
  if(state.step===1&&!currentComplete&&hasSavedVariants&&currentBlank){state.step=2;return true}
  if(state.step===1&&currentUsesJawSplit()&&!variantJawCount(currentVariant())){notify('Выберите верхнюю или нижнюю челюсть целиком');return false}
  if(state.step===1&&!noTeeth&&state.toothMode==='Мост'&&state.bridgeStart){notify('Выберите последний зуб моста');return false}
  if(state.step===1&&!noTeeth&&state.toothMode==='Мост'&&!state.bridgeRanges.length){notify('Выберите первый и последний зуб моста');return false}
  if(state.step===1&&!noTeeth&&!state.selectedTeeth.length){notify('Выберите зуб или челюсть');return false}
  if(state.step===1&&!state.work){notify('Выберите вид работы');return false}
  if(state.step===1&&selectedWork()?.options.length&&!state.workOption){notify('Выберите вариант исполнения');return false}
  if(state.step===1&&currentComplete)persistCurrentVariant();
  if(state.step===2){
    const due=dateValueParts(state.form.due),dueIso=isoDateLocal(due),minimumDue=currentEarliestDueIso();
    if(!due&&minimumDue){notify('Укажите желаемый срок готовности');return false}
    if(!isWorkingDay(due)){notify('Срок сдачи должен приходиться на рабочий день');return false}
    if(minimumDue&&dueIso<minimumDue){notify(`Для выбранных услуг минимальный срок — ${displayIsoDate(minimumDue)}`);return false}
  }
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
function refreshOrderBuilder(){
  const current=document.querySelector('.order-builder');
  if(!current||state.page!=='new'||state.step!==1){render();return}
  const template=document.createElement('template');
  template.innerHTML=teethStep().trim();
  const next=template.content.firstElementChild;
  if(next)current.replaceWith(next);else render();
}
function notifyWithoutRender(message){
  state.toast=message;
  const toast=document.querySelector('.toast');
  if(!toast){render();return}
  toast.textContent=message;
  toast.classList.add('visible');
  clearTimeout(notify.timer);
  notify.timer=setTimeout(()=>{state.toast='';document.querySelector('.toast')?.classList.remove('visible')},3000);
}
function notify(message){state.toast=message;render();clearTimeout(notify.timer);notify.timer=setTimeout(()=>{state.toast='';$('.toast')?.classList.remove('visible')},3000)}
document.addEventListener('click',event=>{const button=event.target.closest('[data-auth-mode]');if(!button)return;authMode=button.dataset.authMode;portalError='';authNotice='';navigate(pathFor(null,authMode,null,currentAuthLocale()));loginView();if(authMode==='register')import('./location-assist.js?v=country-cities-1').catch(()=>{})});
document.addEventListener('click',async event=>{if(!event.target.closest('[data-auth-logout]'))return;try{await authRequest('logout',{})}catch{}clearPortalToken();portalReady=false;portalUser=null;state.messages=[];state.chatText='';state.role='clinic';authMode='login';navigate('/login',{replace:true});render()});
document.addEventListener('click',event=>{const sort=event.target.closest('[data-order-sort]');if(!sort||state.role!=='clinic')return;const key=sort.dataset.orderSort;state.sortDirection=state.sortKey===key&&state.sortDirection==='asc'?'desc':'asc';state.sortKey=key;const table=$('.table-wrap');if(table)table.outerHTML=orderTable(filteredOrders().slice(0,state.page==='home'?4:Infinity))});
document.addEventListener('click',event=>{
  const control=event.target.closest('[data-action="mobile-cart-toggle"],[data-action="mobile-quadrant"]');
  if(!control)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(control.dataset.action==='mobile-cart-toggle'){
    const cart=document.querySelector('.order-draft');
    if(!cart)return;
    const expanded=cart.classList.toggle('expanded');
    control.setAttribute('aria-expanded',String(expanded));
    return;
  }
  state.mobileQuadrant=control.dataset.value;
  render();
},true);
document.addEventListener('click',async event=>{
  if(portalUser?.role!=='clinic')return;
  const cadPreviewBackdrop=event.target.closest('.cad-preview-backdrop');
  if(cadPreviewBackdrop&&event.target===cadPreviewBackdrop){cadPreviewRequest++;if(state.cadPreview?.url)URL.revokeObjectURL(state.cadPreview.url);state.cadPreview=null;render();return}
  const cadBackdrop=event.target.closest('.cad-return-backdrop');
  if(cadBackdrop&&event.target===cadBackdrop){state.cadReturnOrderId='';state.cadReturnComment='';state.cadReturnAttachments=[];render();return}
  if(document.querySelector('.notification-panel')&&!event.target.closest('.notification-center')){closeNotificationCenter();document.querySelector('.notification-panel')?.remove()}
  if(state.orderFilterOpen&&!event.target.closest('.clinic-filter-wrap')){state.orderFilterOpen=false;document.querySelector('.clinic-order-filter')?.remove()}
  if(state.datePickerOpen&&!event.target.closest('.date-picker')){state.datePickerOpen=false;state.datePickerYearOpen=false;render();return}
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
  const el=event.target.closest('[data-page],[data-order],[data-tooth],[data-step],[data-action]');if(!el)return;if((el.dataset.page||el.dataset.order)&&el.matches('a[href]')){const modified=event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0;if(modified)return;event.preventDefault();}if(el.dataset.page){doctorReturnToOrder=false;if(el.dataset.page==='clinic')state.clinicMobileSection='';state.page=el.dataset.page;if(state.page==='orders')state.dueDateFilter='';if(state.page==='new')resetOrderDraft();document.querySelector('#sidebar')?.classList.remove('open');navigate(pathFor('clinic',state.page));render();return}if(el.dataset.order){state.orderId=el.dataset.order;state.page='detail';state.filesFor='';navigate(pathFor('clinic','detail',state.orderId));render();return}if(el.dataset.tooth){selectOrderTooth(Number(el.dataset.tooth));if(!state.currentVariantBase&&variantIsComplete(currentVariant()))persistCurrentVariant();render();return}if(el.dataset.step!==undefined){const target=Number(el.dataset.step);if(target<=state.step)state.step=target;render();return}const a=el.dataset.action,v=el.dataset.value;if(a==='doctor-manage'){doctorReturnToOrder=true;state.page='clinic';state.clinicTab='Врачи';state.clinicMobileSection='Врачи';navigate(pathFor('clinic','clinic'));render();return}else if(a==='doctor-return'){doctorReturnToOrder=false;state.page='new';navigate(pathFor('clinic','new'));render();return}else if(a==='doctor-edit'){if(clinicDoctorBusy)return;clinicDoctorEditId=v;render();return}else if(a==='doctor-cancel'){clinicDoctorEditId='';render();return}else if(a==='doctor-status'){void changeClinicDoctor(v);return}else if(a==='doctor-delete'){void deleteClinicDoctor(v);return}else if(a==='print-order'){let order=currentOrders().find(item=>item.id===state.orderId);try{const overrides=JSON.parse(localStorage.getItem('create-dental-tech-orders')||'{}')||{};if(order)order={...order,...(overrides[order.id]||{})}}catch{}if(order){const {openOrderPrint}=await import('./order-print.js?v=a4-adaptive-4');openOrderPrint({order,toothChart,logo});}return}else if(a==='new'){state.page='new';resetOrderDraft()}else if(a==='next'){if(!advanceOrderStep())return}else if(a==='add-variant'){addOrderVariant();return}else if(a==='remove-variant'){const index=Number(v);if(Number.isInteger(index)&&index>=0&&index<=(state.orderVariants||[]).length)removeOrderVariant(index)}else if(a==='previous')state.step=Math.max(0,state.step-1);else if(a==='filter')state.filter=v;else if(a==='calendar-show-all'){state.dueDateFilter=v;state.filter='Все';state.query='';state.page='orders';navigate(pathFor('clinic','orders'));render();return}else if(a==='clear-date-filter'){state.dueDateFilter='';ordersPage();return}else if(a==='filter-reset'){state.orderMonthFilter='';state.orderWorkFilter='';state.orderStatusFilter='';state.orderDoctorFilter='';state.orderFilterOpen=false}else if(a==='filter-close')state.orderFilterOpen=false;else if(a==='file-tab')state.fileTab=v;else if(a==='detail-tab')state.detailTab=v;else if(a==='clinic-tab'){rememberClinicForm();state.clinicTab=v}else if(a==='dentition')state.dentition=v;else if(a==='tooth-mode'){state.toothMode=v;state.selectedTeeth=[];state.bridgeRanges=[];state.bridgeStart=null}else if(a==='jaw-toggle'){toggleOrderJaw(v);if(!state.currentVariantBase&&variantIsComplete(currentVariant()))persistCurrentVariant()}else if(a==='order-type'){state.form.orderType=v==='analog'?'analog':'digital'}else if(a==='work'){state.work=v;state.workOption='';state.form.construction=v;state.form.material=''}else if(a==='work-option'){selectWorkOption(v)}else if(a==='add-prosthetic-addon'){addProstheticAddon(v);return}else if(a==='add-planning-addon'){addPlanningAddon(v);return}else if(a==='add-surgical-socket'){addSurgicalSocket(v);return}else if(a==='surgical-socket-quantity'){changeSurgicalSocketQuantity(Number(el.dataset.index),Number(v));return}else if(a==='work-back'){persistCurrentVariant();resetCurrentVariant()}else if(a==='clear-teeth'){state.selectedTeeth=[];state.bridgeRanges=[];state.bridgeStart=null}else if(a==='date-open'){const field=v||'due',selected=dateValueParts(state.form[field]);state.datePickerField=field;state.datePickerMonth=selected?`${selected.getFullYear()}-${String(selected.getMonth()+1).padStart(2,'0')}`:`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;state.datePickerYearOpen=false;state.datePickerOpen=true}else if(a==='date-nav'){const parts=(state.datePickerMonth||'').split('-').map(Number),month=new Date(parts[0],parts[1]-1+Number(v),1);state.datePickerMonth=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`}else if(a==='date-year-toggle'){state.datePickerYearOpen=!state.datePickerYearOpen}else if(a==='date-year-nav'){const parts=(state.datePickerMonth||'').split('-').map(Number),limit=state.datePickerField==='birth'?new Date().getFullYear():Infinity,nextYear=Math.min(limit,parts[0]+Number(v)),month=new Date(nextYear,parts[1]-1,1);state.datePickerMonth=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`}else if(a==='date-year-select'){const parts=(state.datePickerMonth||'').split('-').map(Number);state.datePickerMonth=`${Number(v)}-${String(parts[1]).padStart(2,'0')}`;state.datePickerYearOpen=false}else if(a==='date-select'){const field=state.datePickerField||'due';state.form[field]=v;state.datePickerOpen=false}else if(a==='date-clear'){state.form[v||'due']='';state.datePickerOpen=false}else if(a==='date-today'){const field=v||'due',today=new Date();state.form[field]=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;state.datePickerOpen=false}else if(a==='open-messages')state.page='messages';else if(a==='repeat-order'){repeatOrder(state.orderId);return}else if(a==='request-edit'){state.clientRequest={orderId:state.orderId,type:'edit',field:'patient'}}else if(a==='request-cancel'){state.clientRequest={orderId:state.orderId,type:'cancel'}}else if(a==='client-request-close'){state.clientRequest=null}else if(a==='cad-open'){const requestId=++cadPreviewRequest;try{state.cadPreview={orderId:state.orderId,fileId:v,name:'Загрузка CAD…',html:'',url:''};render();const file=state.orderFiles.find(item=>item.id===v),url=await loadCadPreviewSource(state.orderId,v);if(requestId!==cadPreviewRequest||!state.cadPreview||state.cadPreview.fileId!==v)return;state.cadPreview={orderId:state.orderId,fileId:v,name:file?.name||'CAD',html:'',url};render()}catch(error){if(requestId!==cadPreviewRequest)return;state.cadPreview=null;notify(error.message)}return}else if(a==='cad-close'){cadPreviewRequest++;if(state.cadPreview?.url)URL.revokeObjectURL(state.cadPreview.url);state.cadPreview=null;render();return}else if(a==='cad-approve'){try{await decideCadReview(v,'approve');if(state.cadPreview?.url)URL.revokeObjectURL(state.cadPreview.url);state.cadPreview=null;await hydratePortal();notify('CAD подтверждён и передан в изготовление')}catch(error){notify(error.message)}return}else if(a==='cad-return'){state.cadReturnOrderId=v;state.cadReturnComment='';state.cadReturnAttachments=[];render();return}else if(a==='cad-return-cancel'){state.cadReturnOrderId='';state.cadReturnComment='';state.cadReturnAttachments=[];render();return}else if(a==='doctor-accept'){updateClinicStage(v,'Принято доктором');return}else if(a==='doctor-rework'){state.reworkOrderId=v;render();return}else if(a==='cancel-rework'){state.reworkOrderId='';render();return}else if(a==='add-order-file'){state.orderUpload={orderId:state.orderId,uploading:false,files:[]};render();return}else if(a==='order-upload-close'){if(!state.orderUpload?.uploading){state.orderUpload=null;render()}return}else if(a==='remove-file'){const removed=state.uploaded.filter(file=>file.name===v);removed.forEach(releaseUploadPreview);state.uploaded=state.uploaded.filter(file=>file.name!==v)}else if(a==='menu'){$('#sidebar').classList.toggle('open');return}else if(a==='menu-close'){$('#sidebar').classList.remove('open');return}else if(a==='sidebar-toggle'){try{localStorage.setItem('create-dental-sidebar-collapsed',sidebarCollapsed()?'0':'1')}catch{};render();return}else if(a==='save-clinic'){notify('Изменения сохранены локально');return}else if(a==='file-preview'){notify(v);return}else if(a==='filters'){state.orderFilterOpen=!state.orderFilterOpen}else if(a==='more'){notify('Дополнительные действия появятся после подключения сервера');return}else if(a==='change-logo'){$('#clinic-logo-input')?.click();return}else if(a==='attach'){notify('Прикрепление файлов доступно в разделе «Файлы»');return}else if(a==='contact'){notify('Демонстрационный диалог');return}else return;if(['new','open-messages'].includes(a))navigate(pathFor('clinic',state.page));render()});
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
document.addEventListener('input',event=>{if(event.target.dataset.field){state.form[event.target.dataset.field]=event.target.value;if(event.target.dataset.field==='shade'&&variantUsesShade({work:state.work})){const index=currentVariantBaseIndex();if(index>=0)state.orderVariants[index]={...state.orderVariants[index],shade:event.target.value};if(state.currentVariantBase)state.currentVariantBase={...state.currentVariantBase,shade:event.target.value};}}if(event.target.id==='order-search'){state.query=event.target.value;const table=$('.table-wrap');if(table)table.outerHTML=orderTable(filteredOrders());}if(event.target.id==='chat-input')state.chatText=event.target.value;if(event.target.form?.id==='cad-return-form'&&event.target.name==='comment')state.cadReturnComment=event.target.value});
document.addEventListener('change',async event=>{
  if(event.target.dataset.field){state.form[event.target.dataset.field]=event.target.value;if(event.target.dataset.field==='shade'&&variantUsesShade({work:state.work})){const index=currentVariantBaseIndex();if(index>=0)state.orderVariants[index]={...state.orderVariants[index],shade:event.target.value};if(state.currentVariantBase)state.currentVariantBase={...state.currentVariantBase,shade:event.target.value};}}
  if(event.target.id==='client-request-position'){state.clientRequest={...state.clientRequest,variantIndex:Number(event.target.value)};render();return;}
  if(event.target.id==='client-request-field'){
    state.clientRequest={...state.clientRequest,field:event.target.value};
    render();
    return;
  }
  if(event.target.id==='clinic-order-month'){state.orderMonthFilter=event.target.value;ordersPage();return}
  if(event.target.id==='clinic-order-work'){state.orderWorkFilter=event.target.value;ordersPage();return}
  if(event.target.id==='clinic-order-status'){state.orderStatusFilter=event.target.value;ordersPage();return}
  if(event.target.id==='clinic-order-doctor'){state.orderDoctorFilter=event.target.value;ordersPage();return}
  if(event.target.id==='clinic-chat-file'){await selectChatAttachment(event.target.files?.[0]);event.target.value='';return}
  if(event.target.id==='cad-return-files'){
    const selected=Array.from(event.target.files||[]),allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|constructionInfo|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf|html)$/i;
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
    const files=Array.from(event.target.files||[]),allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|constructionInfo|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf)$/i;
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
  const files=Array.from(event.dataTransfer?.files||[]),allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|constructionInfo|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf)$/i,valid=files.filter(file=>allowed.test(file.name)&&file.size<=200*1024*1024),invalid=files.filter(file=>!allowed.test(file.name)||file.size>200*1024*1024);
  if(invalid.length)notify(`Не добавлено: ${invalid.map(file=>file.name).join(', ')}. Проверьте формат и размер до 200 МБ.`);
  state.uploaded.push(...valid);render();
});
document.addEventListener('submit',event=>{if(event.target.id!=='clinic-form')return;event.preventDefault();let clients=[];try{clients=JSON.parse(localStorage.getItem('create-dental-tech-clients')||'[]')}catch{}const clinic=clients.find(client=>client.id===portalUser?.subjectId);if(!clinic)return notify('Клиника не найдена');for(const element of Array.from(event.target.elements)){if(!element.name||element.name==='logoFile')continue;clinic[element.name]=element.value.trim()}if(!clinic.name)return notify('Укажите название клиники');delete state.clinicDrafts[state.clinicTab];localStorage.setItem('create-dental-tech-clients',JSON.stringify(clients));savePortal('clients',clients).then(()=>notify('Данные клиники сохранены')).catch(error=>notify('Не удалось сохранить клинику на сервере: '+error.message))});
document.addEventListener('submit',async event=>{
  if(event.target.id!=='clinic-client-request-form')return;
  event.preventDefault();
  const form=event.target,data=new FormData(form),type=String(data.get('type')||''),body={type};
  if(type==='cancel')body.reason=String(data.get('reason')||'').trim();
  else{body.field=String(data.get('field')||'');body.value=String(data.get('value')||'').trim();if(data.has('variantIndex'))body.variantIndex=Number(data.get('variantIndex'))}
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
document.addEventListener('submit',async event=>{if(event.target.id==='chat-form'){event.preventDefault();const msg=state.chatText.trim(),pending=state.chatAttachment;if(!msg&&!pending)return;const send=event.target.querySelector('.send-btn');send.disabled=true;try{const uploaded=pending?(pending.uploaded||await uploadClinicMessageFile(pending.file)):null;if(pending&&!pending.uploaded)state.chatAttachment={...pending,uploaded};const attachment=uploaded?{...uploaded,preview:pending.preview||''}:null;const response=await fetch('/api/clinic-messages',{method:'POST',headers:{'Content-Type':'application/json','X-Portal-Token':portalToken()},body:JSON.stringify({text:msg,attachment})});if(!response.ok){let data={};try{data=await response.json()}catch{}throw new Error(data.error||'Не удалось отправить сообщение')}state.chatText='';state.chatAttachment=null;const input=$('#chat-input');if(input)input.value='';$('#chat-form .chat-pending-file')?.remove();await loadMessages()}catch(error){state.chatStatus=error.message;if($('#chat-status'))$('#chat-status').textContent=state.chatStatus}finally{if(send.isConnected)send.disabled=false}}});
document.addEventListener('submit',async event=>{
  if(event.target.id!=='portal-login-form')return;
  event.preventDefault();
  const form=event.target;
  const body=Object.fromEntries(new FormData(form));
  const action=form.dataset.mode==='register'?'register':'login';
  if(action==='register')authDraft={...authDraft,...body,promoCode:String(body.promoCode||'').trim().toUpperCase()};
  try{const data=await authRequest(action,body);if(data.pendingApproval){clearPortalToken();authDraft={name:'',phone:'',email:'',country:'RU',city:'',address:'',password:'',promoCode:''};authNotice='Спасибо за регистрация. Мы с вами свяжемся в ближайшее время.';authMode='login';navigate(pathFor(null,'login',null,currentAuthLocale()),{replace:true});render();return}await hydratePortal()}
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
