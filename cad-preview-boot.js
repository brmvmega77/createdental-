const params=new URLSearchParams(location.search),token=params.get('token')||'',state=document.getElementById('state'),frame=document.getElementById('model'),external=document.getElementById('external');
if(!token){state.textContent='Ссылка на CAD не найдена';state.classList.add('error')}
else{
  const raw=`/api/cad-preview/${encodeURIComponent(token)}`;external.href=raw;external.style.display='inline-block';
  frame.addEventListener('load',()=>{state.style.display='none'});
  frame.addEventListener('error',()=>{state.textContent='Не удалось загрузить модель. Откройте её во внешнем браузере.';state.classList.add('error')});
  frame.src=raw;
}
