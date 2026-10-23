try{localStorage.removeItem('create-dental-locale')}catch(_){ }
document.documentElement.lang='ru';
document.documentElement.dir='ltr';
document.documentElement.dataset.locale='ru';
const matched=location.pathname.match(/^\/(?:ru|am|uz|kz|uea|uae)(?=\/|$)/);
if(matched){const cleanPath=location.pathname.slice(matched[0].length)||'/';history.replaceState(null,'',cleanPath+location.search+location.hash)}
window.addEventListener('error',event=>{
  if(!event.filename||!event.filename.endsWith('.js'))return;
  const notice=document.getElementById('startup-notice');
  if(notice)notice.textContent='Не удалось загрузить кабинет. Обновите страницу. Если ошибка повторится, сообщите администрации.';
});
window.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{
  const notice=document.getElementById('startup-notice');
  if(!notice)return;
  if(location.protocol==='file:'){
    notice.innerHTML='Кабинет открыт как локальный файл и не может загрузить свои модули. Откройте его через сервер: <a href="http://localhost:4173/login">http://localhost:4173/login</a>. Если сервер не запущен, выполните <strong>npm start</strong> в папке проекта.';
    return;
  }
  notice.textContent='Кабинет не загрузился. Обновите страницу или сообщите администрации.';
},8000));
