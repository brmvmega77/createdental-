const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const chevron = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
const closeIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const backIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14 5-7 7 7 7"/></svg>';
const checkIcon = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="m7 12 3 3 7-7" stroke="#fff" stroke-width="1.8" fill="none"/></svg>';

export const clinicSections = [
  {key:'Основная информация',label:'Данные клиники',description:'Название, реквизиты и адрес'},
  {key:'Контактные лица',label:'Контактные лица',description:'Сотрудник для связи с лабораторией'},
  {key:'Врачи',label:'Врачи',description:'Врачи клиники для заказов и нарядов'},
  {key:'Рабочие настройки',label:'Рабочие настройки',description:'График и инструкции лаборатории'},
  {key:'Доступ и уведомления',label:'Доступ и уведомления',description:'Вход и подтверждения заказов'},
];

export function createClinicMobileUI({getSnapshot,applyFilters,chooseStatus,chooseClinicSection,enabled=()=>true}) {
  const media=window.matchMedia('(max-width: 900px)');
  let dialog=null,draft=null,mode='',field='',returnAction='',bodyStyles=null,pageScroll=0;
  const optionsFor=key=>getSnapshot()[key==='status'?'statuses':key==='work'?'works':'months'];
  const labelFor=(key,value)=>optionsFor(key).find(item=>item.value===value)?.label||value;
  const titles={status:'Статус заказа',work:'Тип работы',month:'Период заказа'};
  const statusKey=()=>getSnapshot().filters.status;
  const actionButton=(action,text,primary=false)=>`<button type="button" class="clinic-sheet-action${primary?' primary':''}" data-sheet-action="${action}">${text}</button>`;

  function unlockPage(){
    if(!bodyStyles)return;
    for(const [key,value] of Object.entries(bodyStyles))document.body.style[key]=value;
    bodyStyles=null;
    window.scrollTo(0,pageScroll);
  }
  function close({restoreFocus=true}={}){
    if(!dialog)return;
    const old=dialog;dialog=null;
    if(old.open)old.close();
    old.remove();unlockPage();
    if(restoreFocus)requestAnimationFrame(()=>document.querySelector(`[data-mobile-ui="${returnAction}"]`)?.focus({preventScroll:true}));
  }
  function rowsMarkup(key,selected){
    return `<div class="clinic-sheet-options" aria-label="${titles[key]}">${optionsFor(key).map(option=>`<button type="button" class="clinic-sheet-option${selected===option.value?' selected':''}" data-sheet-value="${escapeHtml(option.value)}" aria-pressed="${selected===option.value}"><span class="clinic-sheet-option-text">${escapeHtml(option.label)}</span>${option.count===undefined?'':`<span class="clinic-sheet-count">${option.count}</span>`}<span class="clinic-sheet-check">${selected===option.value?checkIcon:'<span class="clinic-sheet-unchecked"></span>'}</span></button>`).join('')}</div>`;
  }
  function paint(){
    if(!dialog)return;
    const picking=mode==='status'||Boolean(field),title=mode==='status'?'Статус заказа':field?titles[field]:'Фильтры';
    const body=picking?rowsMarkup(field||'status',mode==='status'?statusKey():draft[field]):`<div class="clinic-sheet-fields">${['work','status','month'].map(key=>`<button type="button" class="clinic-sheet-field" data-sheet-field="${key}"><span><small>${titles[key]}</small><strong>${escapeHtml(labelFor(key,draft[key]))}</strong></span>${chevron}</button>`).join('')}</div>`;
    const footer=mode==='filters'&&!field?`<footer class="clinic-sheet-footer">${actionButton('reset','Сбросить')}${actionButton('apply','Показать заказы',true)}</footer>`:'';
    dialog.innerHTML=`<header class="clinic-sheet-header">${field?`<button type="button" class="clinic-sheet-icon" data-sheet-action="back" aria-label="Назад к фильтрам">${backIcon}</button>`:''}<h2 id="clinic-sheet-title">${title}</h2><button type="button" class="clinic-sheet-icon" data-sheet-action="close" aria-label="Закрыть">${closeIcon}</button></header><div class="clinic-sheet-scroll">${body}</div>${footer}`;
    dialog.querySelector('.clinic-sheet-scroll').scrollTop=0;
  }
  function open(nextMode){
    if(!media.matches||!enabled())return;
    close({restoreFocus:false});
    mode=nextMode;field='';returnAction=nextMode;draft={...getSnapshot().filters};
    dialog=document.createElement('dialog');dialog.className='clinic-mobile-sheet';
    dialog.setAttribute('aria-labelledby','clinic-sheet-title');
    dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
    dialog.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const controls=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(control=>control.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(!first)return;
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    });
    dialog.addEventListener('click',event=>{
      if(event.target===dialog){close();return}
      const button=event.target.closest('button');if(!button)return;
      if(button.hasAttribute('data-sheet-value')){
        const value=button.dataset.sheetValue;
        if(mode==='status'){close();chooseStatus(value);return}
        draft[field]=value;field='';paint();dialog.querySelector('.clinic-sheet-field')?.focus();return;
      }
      if(button.dataset.sheetField){field=button.dataset.sheetField;paint();dialog.querySelector('[aria-pressed="true"]')?.focus();return}
      const action=button.dataset.sheetAction;
      if(action==='close'){close();return}
      if(action==='back'){field='';paint();dialog.querySelector('.clinic-sheet-field')?.focus();return}
      if(action==='reset'){draft={work:'',month:'',status:'Все'};paint();dialog.querySelector('[data-sheet-action="reset"]')?.focus();return}
      if(action==='apply'){const selected={...draft};close();applyFilters(selected)}
    });
    document.body.append(dialog);paint();
    pageScroll=window.scrollY;
    bodyStyles=Object.fromEntries(['position','top','left','right','width','overflow'].map(key=>[key,document.body.style[key]]));
    Object.assign(document.body.style,{position:'fixed',top:`-${pageScroll}px`,left:'0',right:'0',width:'100%',overflow:'hidden'});
    dialog.showModal();
    dialog.querySelector('[aria-pressed="true"],.clinic-sheet-field,.clinic-sheet-icon')?.focus({preventScroll:true});
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-mobile-ui]');
    if(!button||!media.matches||!enabled())return;
    event.preventDefault();event.stopImmediatePropagation();
    if(button.dataset.mobileUi==='section'){chooseClinicSection(button.dataset.section);return}
    if(button.dataset.mobileUi==='clinic-back'){chooseClinicSection('');return}
    open(button.dataset.mobileUi);
  },true);
  media.addEventListener('change',()=>{if(!media.matches)close({restoreFocus:false})});

  return {
    close,
    controlsMarkup(){
      const snapshot=getSnapshot(),selected=snapshot.statuses.find(item=>item.value===snapshot.filters.status)||snapshot.statuses[0];
      const active=Number(Boolean(snapshot.filters.work))+Number(Boolean(snapshot.filters.month))+Number(snapshot.filters.status!=='Все');
      return `<div class="clinic-mobile-order-controls"><button type="button" class="clinic-mobile-status-trigger" data-mobile-ui="status" aria-haspopup="dialog"><span>${escapeHtml(selected.label)}</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><button type="button" class="clinic-mobile-filter-trigger${active?' active':''}" data-mobile-ui="filters" aria-haspopup="dialog"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8z"/></svg><span>Фильтры${active?` · ${active}`:''}</span></button></div>`;
    },
    sectionsMarkup(openSection){
      return `<div class="clinic-mobile-sections${openSection?' section-open':''}" aria-label="Разделы настроек клиники">${clinicSections.map(section=>`<button type="button" data-mobile-ui="section" data-section="${section.key}"><span><strong>${section.label}</strong><small>${section.description}</small></span>${chevron}</button>`).join('')}</div>`;
    },
  };
}
