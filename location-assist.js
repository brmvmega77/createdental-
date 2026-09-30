const cities=['Москва','Санкт-Петербург','Новосибирск','Екатеринбург','Казань','Нижний Новгород','Красноярск','Челябинск','Самара','Уфа','Ростов-на-Дону','Краснодар','Омск','Воронеж','Пермь','Волгоград','Саратов','Тюмень','Тольятти','Барнаул','Ижевск','Махачкала','Хабаровск','Ульяновск','Иркутск','Владивосток','Ярославль','Кемерово','Томск','Набережные Челны','Ставрополь','Оренбург','Новокузнецк','Рязань','Астрахань','Пенза','Липецк','Киров','Чебоксары','Тула','Калининград','Курск','Сочи','Улан-Удэ','Тверь','Магнитогорск','Брянск','Иваново','Белгород','Сургут','Владимир','Архангельск','Мурманск','Петрозаводск','Псков','Великий Новгород','Смоленск','Кострома','Вологда','Севастополь','Симферополь'];
const emailDomains=['mail.ru','yandex.ru','bk.ru','list.ru','inbox.ru','rambler.ru'];
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const timers=new WeakMap();
const controllers=new WeakMap();

function formatPhone(value){
  let digits=value.replace(/\D/g,'');
  if(digits.startsWith('7')||digits.startsWith('8'))digits=digits.slice(1);
  digits=digits.slice(0,10);
  if(!digits)return '';
  let result='+7 ('+digits.slice(0,3);
  if(digits.length>=3)result+=')';
  if(digits.length>3)result+=' '+digits.slice(3,6);
  if(digits.length>6)result+='-'+digits.slice(6,8);
  if(digits.length>8)result+='-'+digits.slice(8,10);
  return result;
}

function suggestions(input,items){
  input.parentElement.querySelector('.location-options')?.remove();
  if(!items.length)return;
  const list=document.createElement('div');
  list.className='location-options';
  list.setAttribute('role','listbox');
  list.innerHTML=items.map(item=>`<button type="button" role="option" data-location-choice="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('');
  input.parentElement.append(list);
}

document.addEventListener('input',event=>{
  const input=event.target;
  if(input.matches('input[type="tel"]')){input.value=formatPhone(input.value);input.placeholder='+7 (999) 123-45-67';input.inputMode='tel';input.maxLength=18;input.pattern='\\+7 \\(\\d{3}\\) \\d{3}-\\d{2}-\\d{2}';input.setCustomValidity('');return}
  if(input.matches('input[type="email"]')){
    const value=input.value.trim().toLowerCase(),at=value.indexOf('@');
    suggestions(input,at>0?emailDomains.map(domain=>value.slice(0,at+1)+domain).filter(candidate=>candidate.startsWith(value)&&candidate!==value).slice(0,5):[]);
    return;
  }
  if(!input.matches('input[name="city"],input[name="address"]'))return;
  clearTimeout(timers.get(input));controllers.get(input)?.abort();
  const kind=input.name,query=input.value.trim();
  if(kind==='city')suggestions(input,cities.filter(city=>city.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))).slice(0,7));
  else suggestions(input,[]);
  if(query.length<2)return;
  const controller=new AbortController();controllers.set(input,controller);
  timers.set(input,setTimeout(async()=>{
    try{
      const city=input.form?.elements.namedItem('city')?.value?.trim()||'';
      const params=new URLSearchParams({kind,q:query,city});
      const response=await fetch('/api/locations?'+params,{signal:controller.signal});
      if(!response.ok)throw new Error('Адреса недоступны');
      const {items=[]}=await response.json();
      if(document.contains(input)&&input.value.trim()===query)suggestions(input,[...new Set(kind==='city'?[...cities.filter(value=>value.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))).slice(0,3),...items]:items)].slice(0,7));
    }catch{/* Manual entry remains available. */}
  },300));
});

document.addEventListener('click',event=>{
  const choice=event.target.closest('[data-location-choice]');
  if(choice){const input=choice.parentElement.parentElement.querySelector('input');input.value=choice.dataset.locationChoice;input.dispatchEvent(new Event('change',{bubbles:true}));choice.parentElement.remove();input.focus();return}
  if(!event.target.closest('.location-options'))document.querySelectorAll('.location-options').forEach(list=>list.remove());
});
document.addEventListener('blur',event=>{
  const input=event.target;
  if(input.matches('input[type="email"]'))input.value=input.value.trim().toLowerCase();
  if(input.matches('input[type="tel"]')&&input.value&&input.value.replace(/\D/g,'').length!==11)input.setCustomValidity('Введите российский номер полностью');
  else if(input.matches('input[type="tel"]'))input.setCustomValidity('');
},true);
