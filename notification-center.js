import {portalToken} from './portal-client.js?v=mobile-fast-4';

let state={items:[],unreadCount:0,open:false,loaded:false};
const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export async function refreshNotificationCenter(){
  const response=await fetch('/api/notifications',{cache:'no-store',headers:{'X-Portal-Token':portalToken()}});
  if(!response.ok)throw new Error('Не удалось загрузить уведомления');
  const data=await response.json();
  state={...state,items:Array.isArray(data.items)?data.items:[],unreadCount:Number(data.unreadCount)||0,loaded:true};
  return state;
}
export async function markNotificationCenterRead(){
  const response=await fetch('/api/notifications',{method:'POST',headers:{'X-Portal-Token':portalToken()}});
  if(!response.ok)throw new Error('Не удалось отметить уведомления прочитанными');
  state.items=state.items.map(item=>({...item,read:true}));state.unreadCount=0;
  return state;
}
export async function toggleNotificationCenter(){
  state.open=!state.open;
  if(state.open){
    try{await refreshNotificationCenter();if(state.unreadCount)await markNotificationCenterRead()}
    catch(error){state.items=[{id:'error',orderId:'',at:new Date().toISOString(),text:error.message,read:true}];state.unreadCount=0;state.loaded=true}
  }
  return state;
}
export function closeNotificationCenter(){state.open=false}
export function notificationCenterMarkup(){
  const icons={message:'✉',registration:'+',order:'№',quality:'✓',update:'•'};
  const rows=state.items.length?state.items.map(item=>`<button class="notification-item ${item.read?'':'unread'}" data-notification-id="${safe(item.id)}" data-notification-order="${safe(item.orderId)}" data-notification-target="${safe(item.target)}" data-notification-clinic="${safe(item.clinicId)}"><span class="notification-kind ${safe(item.type||'update')}" aria-hidden="true">${icons[item.type]||icons.update}</span><span class="notification-copy"><strong>${safe(item.text)}</strong><small>${new Date(item.at).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</small></span>${item.read?'':'<i aria-label="Новое"></i>'}</button>`).join(''):'<p class="notification-empty">Пока нет новых событий</p>';
  return `<div class="notification-center"><button class="bell" data-notification-toggle aria-label="Уведомления${state.unreadCount?`, непрочитанных: ${state.unreadCount}`:''}"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>${state.unreadCount?`<i>${state.unreadCount>9?'9+':state.unreadCount}</i>`:''}</button>${state.open?`<section class="notification-panel" aria-label="Уведомления"><div class="notification-heading"><strong>Уведомления</strong><button data-notification-close aria-label="Закрыть">×</button></div><div class="notification-list">${rows}</div></section>`:''}</div>`;
}
export function notificationCenterState(){return state}
