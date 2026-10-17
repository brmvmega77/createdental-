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
const localeOptions=[['ru','RU · Русский'],['hy','HY · Հայերեն'],['uz','UZ · O‘zbekcha'],['kk','KZ · Қазақша'],['ar','AR · العربية']];
function readLocale(){try{return localStorage.getItem(localeKey)||'ru'}catch{return 'ru'}}
export const languageSwitcherMarkup=()=>`<label class="portal-language" aria-label="Язык интерфейса"><span class="sr-only">Язык интерфейса</span><select data-language-switcher aria-label="Язык интерфейса">${localeOptions.map(([code,label])=>`<option value="${code}" ${readLocale()===code?'selected':''}>${label}</option>`).join('')}</select></label>`;
function applyLocale(language){
  const code=localeOptions.some(([key])=>key===language)?language:'ru';
  try{localStorage.setItem(localeKey,code)}catch{}
  document.documentElement.lang=code;
  document.querySelectorAll('[data-language-switcher]').forEach(select=>{select.value=code});
  document.dispatchEvent(new CustomEvent('create-dental:locale-changed',{detail:{locale:code}}));
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
  document.addEventListener('change',event=>{
    const select=event.target.closest?.('[data-language-switcher]');
    if(select)applyLocale(select.value);
  });
}
