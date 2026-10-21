const $=selector=>document.querySelector(selector);
const token=new URLSearchParams(location.search).get('token')||'';
let selectedFiles=[],existingFiles=[],preparing=false,sending=false,finished=false;
const allowed=/\.(jpg|jpeg|png|webp|pdf|stl|constructionInfo|ply|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf)$/i;
const maxSize=200*1024*1024,maxFiles=10;
const sizeLabel=size=>size>=1024*1024?`${(size/1024/1024).toFixed(1)} МБ`:`${Math.max(1,Math.ceil(size/1024))} КБ`;
const sameFile=(left,right)=>String(left?.name||'').trim().toLocaleLowerCase('ru-RU')===String(right?.name||'').trim().toLocaleLowerCase('ru-RU')&&Number(left?.size||0)===Number(right?.size||0);

function feedback(message='',tone=''){
  const element=$('#feedback');element.textContent=message;element.className=`feedback${tone?' '+tone:''}`;
}
function status(message='',visible=true){
  $('#status').textContent=message;$('#progress').classList.toggle('show',visible);
}
function itemLabel(item){
  if(item.state==='uploading')return `${sizeLabel(item.file.size)} · ${item.progress||0}%`;
  if(item.state==='ready')return `${sizeLabel(item.file.size)} · готов к отправке`;
  if(item.state==='sending')return `${sizeLabel(item.file.size)} · отправляем`;
  if(item.state==='sent')return `${sizeLabel(item.file.size)} · отправлен`;
  if(item.state==='error')return `${sizeLabel(item.file.size)} · ошибка загрузки`;
  return sizeLabel(item.file.size);
}
function renderFiles(){
  $('#selected').innerHTML='';
  selectedFiles.forEach((item,index)=>{
    const row=document.createElement('div');row.className=`selected ${item.state}`;
    const icon=document.createElement('span');icon.className='file-icon';icon.textContent=item.state==='ready'||item.state==='sent'?'✓':item.state==='error'?'!':'📄';
    const details=document.createElement('span'),name=document.createElement('strong'),size=document.createElement('small');
    name.textContent=item.file.name;size.textContent=itemLabel(item);details.append(name,size);
    const remove=document.createElement('button');remove.type='button';remove.dataset.removeFile=String(index);remove.ariaLabel=`Убрать файл ${item.file.name}`;remove.textContent='×';remove.disabled=preparing||sending||item.state==='sent';
    row.append(icon,details,remove);$('#selected').append(row);
  });
  const ready=selectedFiles.length&&selectedFiles.every(item=>item.state==='ready'||item.state==='sent');
  $('#submit').disabled=!ready||preparing||sending||finished;
}
function sendFile(url,file,onProgress){
  return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(event.loaded/event.total)};xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error('Хранилище не приняло файл'));xhr.onerror=()=>reject(new Error('Соединение прервано'));xhr.send(file)});
}
async function cancelPrepared(item){
  if(!item.uploadId)return;
  const response=await fetch(`/api/large-upload/${encodeURIComponent(token)}/cancel/${encodeURIComponent(item.uploadId)}`,{method:'POST'}),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Не удалось убрать загруженный файл');
}
async function prepareFiles(){
  if(preparing||sending||finished)return;
  const pending=selectedFiles.filter(item=>item.state==='queued');if(!pending.length)return;
  preparing=true;feedback('');$('#progress').classList.add('show');renderFiles();
  let failed=0;
  for(const item of pending){
    try{
      const index=selectedFiles.indexOf(item),current=index+1,total=selectedFiles.length,file=item.file;
      item.state='uploading';item.progress=0;status(`Загружаем файл ${current} из ${total}…`);renderFiles();
      const preparedResponse=await fetch(`/api/large-upload/${encodeURIComponent(token)}/init`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,size:file.size,type:file.type||'application/octet-stream'})}),prepared=await preparedResponse.json().catch(()=>({}));
      if(!preparedResponse.ok)throw new Error(prepared.error||`Не удалось начать загрузку файла «${file.name}»`);
      item.uploadId=prepared.uploadId;
      await sendFile(prepared.href,file,value=>{item.progress=Math.round(value*100);const completed=selectedFiles.filter(entry=>entry.state==='ready'||entry.state==='sent').length;$('#bar').style.width=`${Math.round(((completed+value)/selectedFiles.length)*100)}%`;status(`Файл ${current} из ${total}: ${item.progress}%`);renderFiles()});
      item.state='ready';item.progress=100;renderFiles();
    }catch(reason){item.state='error';item.error=reason.message||'Не удалось загрузить файл';failed++;renderFiles()}
  }
  preparing=false;
  if(failed){const word=failed===1?'файл':failed<5?'файла':'файлов';status('Не все файлы удалось загрузить.');feedback(`${failed} ${word} не удалось загрузить. Уберите их из списка и попробуйте выбрать снова.`,'error')}
  else{$('#bar').style.width='100%';status('Файлы готовы к отправке.');feedback('Файлы успешно загружены. Нажмите «Отправить файлы».','success')}
  renderFiles();
}
function choose(files){
  const list=[...(files||[])];if(!list.length)return;
  feedback('');
  if(preparing||sending)return feedback('Дождитесь завершения текущей операции.','error');
  if(selectedFiles.length+list.length>maxFiles)return feedback(`Можно выбрать не больше ${maxFiles} файлов.`,'error');
  for(const file of list){
    if(!allowed.test(file.name))return feedback(`Формат файла «${file.name}» не поддерживается.`,'error');
    if(file.size>maxSize)return feedback(`Файл «${file.name}» больше 200 МБ.`,'error');
    if(!file.size)return feedback(`Файл «${file.name}» пустой.`,'error');
    if(existingFiles.some(existing=>sameFile(existing,file))||selectedFiles.some(item=>sameFile(item.file,file)))return feedback(`Файл «${file.name}» уже загружен в этот заказ.`,'error');
  }
  selectedFiles.push(...list.map(file=>({file,state:'queued',progress:0,uploadId:''})));finished=false;renderFiles();void prepareFiles();
}
async function load(){
  if(!token)throw new Error('В ссылке нет кода загрузки');
  const response=await fetch(`/api/large-upload/${encodeURIComponent(token)}`,{cache:'no-store'}),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Ссылка недействительна');
  existingFiles=Array.isArray(data.existingFiles)?data.existingFiles:[];
  $('#clinic').textContent=data.clinic;$('#order').textContent=data.orderId||'Новый заказ';$('#patient').textContent=data.patient||'—';$('#work').textContent=`${data.work||'—'}${data.date?` · ${data.date}`:''}`;
  if(data.draft){document.querySelector('#upload .eyebrow').textContent='ФАЙЛЫ ПАЦИЕНТА';document.querySelector('#upload h1').textContent='Загрузить файлы пациента';document.querySelector('#upload .lead').textContent='Файлы сохранятся и автоматически прикрепятся к заказу после его подтверждения.';document.querySelector('#success h1').textContent='Файлы сохранены';document.querySelector('#success .lead').textContent='Вернитесь в Telegram и нажмите «Файлы загружены, продолжить».'}
  $('#loader').classList.add('hidden');$('#upload').classList.remove('hidden');
}

$('#file').addEventListener('change',event=>{choose(event.target.files);event.target.value=''});
$('#selected').addEventListener('click',async event=>{
  const button=event.target.closest('[data-remove-file]');if(!button||preparing||sending)return;
  const index=Number(button.dataset.removeFile),item=selectedFiles[index];if(!item||item.state==='sent')return;
  button.disabled=true;
  try{await cancelPrepared(item);selectedFiles.splice(index,1);feedback(selectedFiles.length?'Файл убран. Остальные файлы готовы к отправке.':'');if(!selectedFiles.length){status('',false);$('#bar').style.width='0'}}
  catch(reason){feedback(reason.message,'error')}
  renderFiles();
});
for(const name of ['dragenter','dragover'])$('#drop').addEventListener(name,event=>{event.preventDefault();$('#drop').classList.add('drag')});
for(const name of ['dragleave','drop'])$('#drop').addEventListener(name,event=>{event.preventDefault();$('#drop').classList.remove('drag')});
$('#drop').addEventListener('drop',event=>choose(event.dataTransfer.files));
$('#submit').addEventListener('click',async()=>{
  if(sending||preparing||finished||!selectedFiles.length||!selectedFiles.every(item=>item.state==='ready'||item.state==='sent'))return;
  sending=true;feedback('');status('Отправляем файлы в заказ…');renderFiles();
  try{
    const ready=selectedFiles.filter(item=>item.state==='ready');
    for(let index=0;index<ready.length;index++){
      const item=ready[index];item.state='sending';status(`Отправляем файл ${index+1} из ${ready.length}…`);renderFiles();
      try{
        const response=await fetch(`/api/large-upload/${encodeURIComponent(token)}/complete/${encodeURIComponent(item.uploadId)}`,{method:'POST'}),data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||`Не удалось отправить файл «${item.file.name}»`);
        item.state='sent';renderFiles();
      }catch(reason){item.state='ready';throw reason}
    }
    const finishResponse=await fetch(`/api/large-upload/${encodeURIComponent(token)}/finish`,{method:'POST'}),finish=await finishResponse.json().catch(()=>({}));
    if(!finishResponse.ok)throw new Error(finish.error||'Не удалось завершить отправку');
    if(!finish.telegramNotified)$('#success .lead').textContent=finish.orderId
      ?'Файлы уже прикреплены к заказу. Уведомление в Telegram не доставлено; эту страницу можно закрыть.'
      :'Файлы сохранены. Уведомление в Telegram не доставлено; вернитесь в бот и продолжите оформление.';
    finished=true;$('#upload').classList.add('hidden');$('#success').classList.add('show');feedback('');
  }catch(reason){feedback(reason.message||'Не удалось отправить файлы','error');status('Отправка не завершена.')}
  finally{sending=false;renderFiles()}
});
load().catch(reason=>{$('#loader').innerHTML='<h1>Ссылка недоступна</h1>';feedback(reason.message,'error')});
