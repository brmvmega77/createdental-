const themeKey='create-dental-theme';

// The portal uses one visual language: the Create Dental light palette.
// Keep this module as a compatibility shim for existing imports while making
// the old theme preference and toggle permanently unavailable.
function applyLightTheme(){
  document.documentElement.removeAttribute('data-theme');
  document.body?.removeAttribute('data-theme');
  try{localStorage.removeItem(themeKey)}catch{}
  return 'light';
}

export const themeToggleMarkup=()=>'';

const localeKey='create-dental-locale';
export const languageSwitcherMarkup=()=>'';
function applyLocale(){
  try{localStorage.removeItem(localeKey)}catch{}
  document.documentElement.lang='ru';
  document.documentElement.dir='ltr';
  document.documentElement.dataset.locale='ru';
  return 'ru';
}
export function initializeTheme(){return applyLightTheme()}
export function toggleTheme(){return applyLightTheme()}

if(typeof document!=='undefined'){
  initializeTheme();
  applyLocale();
  document.addEventListener('click',event=>{
    const option=event.target.closest?.('[data-language-option]');
    if(option){applyLocale(option.dataset.languageOption);return}
    const trigger=event.target.closest?.('[data-language-trigger]');
    if(trigger){const menu=trigger.parentElement.querySelector('[data-language-menu]');const open=trigger.getAttribute('aria-expanded')==='true';menu.hidden=open;trigger.setAttribute('aria-expanded',String(!open));if(!open)menu.querySelector('[aria-selected="true"]')?.focus();return}
    if(!event.target.closest?.('.portal-language'))document.querySelectorAll('[data-language-menu]').forEach(menu=>{menu.hidden=true});document.querySelectorAll('[data-language-trigger]').forEach(button=>button.setAttribute('aria-expanded','false'));
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('[data-language-menu]').forEach(menu=>{menu.hidden=true;menu.parentElement.querySelector('[data-language-trigger]')?.setAttribute('aria-expanded','false')})});
}
