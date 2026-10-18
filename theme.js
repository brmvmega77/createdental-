const themeKey='create-dental-theme';

function readTheme(){
  try{return localStorage.getItem(themeKey)==='dark'?'dark':'light'}catch{return 'light'}
}

function applyTheme(value){
  const theme=value==='dark'?'dark':'light';
  document.documentElement.dataset.theme=theme;
  if(document.body)document.body.dataset.theme=theme;
  try{localStorage.setItem(themeKey,theme)}catch{}
  document.querySelectorAll('[data-theme-toggle]').forEach(button=>{
    const dark=theme==='dark';
    button.setAttribute('aria-label',dark?'Включить дневную тему':'Включить ночную тему');
    button.setAttribute('aria-pressed',String(dark));
    const icon=button.querySelector('[data-theme-icon]');
    const label=button.querySelector('[data-theme-label]');
    if(icon)icon.textContent=dark?'☀':'☾';
    if(label)label.textContent=dark?'Дневная тема':'Ночная тема';
  });
  return theme;
}

export const themeToggleMarkup=()=>{const dark=typeof document!=='undefined'?document.documentElement.dataset.theme==='dark':readTheme()==='dark';return `<button type="button" class="theme-toggle" data-theme-toggle aria-label="${dark?'Включить дневную тему':'Включить ночную тему'}" aria-pressed="${dark}"><span class="theme-toggle-icon" data-theme-icon aria-hidden="true">${dark?'☀':'☾'}</span><span data-theme-label>${dark?'Дневная тема':'Ночная тема'}</span></button>`};

const localeKey='create-dental-locale';
export const languageSwitcherMarkup=()=>'';
function applyLocale(){
  try{localStorage.removeItem(localeKey)}catch{}
  document.documentElement.lang='ru';
  document.documentElement.dir='ltr';
  document.documentElement.dataset.locale='ru';
  return 'ru';
}
export function initializeTheme(){return applyTheme(readTheme())}
export function toggleTheme(){return applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')}

if(typeof document!=='undefined'){
  initializeTheme();
  applyLocale();
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-theme-toggle]');
    if(button){event.preventDefault();toggleTheme()}
  },true);
  document.addEventListener('click',event=>{
    const option=event.target.closest?.('[data-language-option]');
    if(option){applyLocale(option.dataset.languageOption);return}
    const trigger=event.target.closest?.('[data-language-trigger]');
    if(trigger){const menu=trigger.parentElement.querySelector('[data-language-menu]');const open=trigger.getAttribute('aria-expanded')==='true';menu.hidden=open;trigger.setAttribute('aria-expanded',String(!open));if(!open)menu.querySelector('[aria-selected="true"]')?.focus();return}
    if(!event.target.closest?.('.portal-language'))document.querySelectorAll('[data-language-menu]').forEach(menu=>{menu.hidden=true});document.querySelectorAll('[data-language-trigger]').forEach(button=>button.setAttribute('aria-expanded','false'));
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('[data-language-menu]').forEach(menu=>{menu.hidden=true;menu.parentElement.querySelector('[data-language-trigger]')?.setAttribute('aria-expanded','false')})});
}
