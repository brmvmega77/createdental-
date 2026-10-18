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

export const themeToggleMarkup=()=>`<button type="button" class="theme-toggle" data-theme-toggle aria-label="Включить ночную тему" aria-pressed="false"><span class="theme-toggle-icon" data-theme-icon aria-hidden="true">☾</span><span data-theme-label>Ночная тема</span></button>`;

const localeKey='create-dental-locale';
const localeOptions=[['ru','Русский'],['am','Հայերեն'],['uz','O‘zbekcha'],['kk','Қазақша'],['ar','العربية']];
function readLocale(){try{const saved=localStorage.getItem(localeKey)||'ru';return saved==='hy'?'am':saved}catch{return 'ru'}}
export const languageSwitcherMarkup=()=>{const code=readLocale();const label=localeOptions.find(([key])=>key===code)?.[1]||'Русский';return `<div class="portal-language"><button type="button" class="portal-language-trigger" data-language-trigger aria-haspopup="listbox" aria-expanded="false" aria-label="Язык интерфейса"><span data-language-current>${code.toUpperCase()}</span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4.5 4 4 4-4"/></svg></button><div class="portal-language-menu" data-language-menu role="listbox" aria-label="Выберите язык" hidden>${localeOptions.map(([key,name])=>`<button type="button" role="option" data-language-option="${key}" aria-selected="${key===code}"><span>${name}</span><small>${key.toUpperCase()}</small></button>`).join('')}</div></div>`};
function applyLocale(language){
  const code=localeOptions.some(([key])=>key===language)?language:'ru';
  try{localStorage.setItem(localeKey,code)}catch{}
  document.documentElement.lang=code==='am'?'hy':code;
  document.documentElement.dataset.locale=code;
  document.querySelectorAll('[data-language-current]').forEach(node=>{node.textContent=code.toUpperCase()});
  document.querySelectorAll('[data-language-option]').forEach(option=>option.setAttribute('aria-selected',String(option.dataset.languageOption===code)));
  document.querySelectorAll('[data-language-menu]').forEach(menu=>{menu.hidden=true});
  document.querySelectorAll('[data-language-trigger]').forEach(button=>button.setAttribute('aria-expanded','false'));
  document.dispatchEvent(new CustomEvent('create-dental:locale-changed',{detail:{locale:code}}));
  window.dispatchEvent(new CustomEvent('portal:language-change',{detail:{locale:code}}));
}

export function initializeTheme(){return applyTheme(readTheme())}
export function toggleTheme(){return applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')}

if(typeof document!=='undefined'){
  initializeTheme();
  applyLocale(readLocale());
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-theme-toggle]');
    if(button){event.preventDefault();toggleTheme()}
  });
  document.addEventListener('click',event=>{
    const option=event.target.closest?.('[data-language-option]');
    if(option){applyLocale(option.dataset.languageOption);return}
    const trigger=event.target.closest?.('[data-language-trigger]');
    if(trigger){const menu=trigger.parentElement.querySelector('[data-language-menu]');const open=trigger.getAttribute('aria-expanded')==='true';menu.hidden=open;trigger.setAttribute('aria-expanded',String(!open));if(!open)menu.querySelector('[aria-selected="true"]')?.focus();return}
    if(!event.target.closest?.('.portal-language'))document.querySelectorAll('[data-language-menu]').forEach(menu=>{menu.hidden=true});document.querySelectorAll('[data-language-trigger]').forEach(button=>button.setAttribute('aria-expanded','false'));
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('[data-language-menu]').forEach(menu=>{menu.hidden=true;menu.parentElement.querySelector('[data-language-trigger]')?.setAttribute('aria-expanded','false')})});
}
