import {createClinicMobileUI} from './clinic-mobile-ui.js?v=worker-mobile-1';

const mobileQuery='(max-width: 900px), ((pointer: coarse) and (hover: none) and (orientation: landscape) and (max-height: 560px))';
const arrow='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
const sections=[
  ['info','Данные сотрудника','Имя, специализация, контакты и ранг'],
  ['security','Безопасность','Пароль для входа в кабинет'],
  ['telegram','Telegram для работы','Уведомления и назначенные заказы'],
];

export function createWorkerMobileUI({root,enabled,getSnapshot,applyFilters,chooseStatus}){
  const media=matchMedia(mobileQuery);
  let profileSection='';
  const controls=createClinicMobileUI({getSnapshot,applyFilters,chooseStatus,enabled,filterFields:['work','status','clinic','month']});

  function paintProfile(){
    const main=root().querySelector('.worker-mobile-profile');if(!main)return;
    main.dataset.workerProfileSection=profileSection;
    const heading=main.querySelector('.tech-heading h1');
    if(heading)heading.textContent=media.matches&&profileSection?sections.find(item=>item[0]===profileSection)[1]:'Мои данные';
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-worker-profile-section]');
    if(!button||!media.matches||!root().querySelector('.worker-mobile-profile')||button.tagName!=='BUTTON')return;
    event.preventDefault();event.stopImmediatePropagation();
    profileSection=button.dataset.workerProfileSection;paintProfile();
    const main=root().querySelector('.worker-mobile-profile');
    (profileSection?main.querySelector('.worker-profile-back'):main.querySelector('.worker-profile-sections button'))?.focus({preventScroll:true});
    window.scrollTo({top:0,behavior:'instant'});
  },true);
  function paintDetailOrder(){
    const grid=root().querySelector('.worker-detail-grid');
    const history=grid?.querySelector('.worker-order-history');
    const main=grid?.querySelector('.tech-order-main');
    if(!grid||!history||!main)return;
    (media.matches?grid:main).append(history);
  }
  media.addEventListener('change',()=>{paintProfile();paintDetailOrder()});

  return {
    controlsMarkup:controls.controlsMarkup,
    enhance(page){
      const main=root().querySelector('main.content');if(!main)return;
      main.classList.add('worker-mobile-cabinet');
      if(page==='detail')paintDetailOrder();
      if(page!=='orders')controls.close({restoreFocus:false});
      if(page!=='profile'){profileSection='';return}
      main.classList.add('worker-mobile-profile');
      const heading=main.querySelector('.tech-heading');
      heading.insertAdjacentHTML('beforebegin','<button type="button" class="clinic-mobile-back worker-profile-back" data-worker-profile-section="">← Мои данные</button>');
      heading.insertAdjacentHTML('afterend',`<nav class="clinic-mobile-sections worker-profile-sections" aria-label="Разделы профиля">${sections.map(([key,label,description])=>`<button type="button" data-worker-profile-section="${key}"><span><strong>${label}</strong><small>${description}</small></span>${arrow}</button>`).join('')}</nav>`);
      for(const el of main.querySelectorAll('.tech-profile-avatar,.tech-profile-note,.worker-rate-note'))el.dataset.workerProfilePart='info';
      for(const label of main.querySelectorAll('#worker-profile-form>label'))label.dataset.workerProfilePart=label.querySelector('input[type="password"]')?'security':'info';
      const actions=main.querySelector('#worker-profile-form .tech-client-form-actions');if(actions)actions.dataset.workerProfilePart='security';
      paintProfile();
    },
  };
}
