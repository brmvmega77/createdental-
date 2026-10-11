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

export function initializeTheme(){return applyTheme(readTheme())}
export function toggleTheme(){return applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')}

if(typeof document!=='undefined'){
  initializeTheme();
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-theme-toggle]');
    if(button){event.preventDefault();toggleTheme()}
  });
}
