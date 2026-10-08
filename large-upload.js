const $=selector=>document.querySelector(selector);
const token=new URLSearchParams(location.search).get('token')||'';
let selectedFiles=[],uploading=false,finished=false;
const allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf)$/i;
const maxSize=200*1024*1024,maxFiles=10;
const sizeLabel=size=>size>=1024*1024?`${(size/1024/1024).toFixed(1)} МБ`:`${Math.max(1,Math.ceil(size/1024))} КБ`;
function error(message){$('#error').textContent=message||'Не удалось загрузить файлы'}
function renderFiles(){
  $('#selected').innerHTML='';
  selectedFiles.forEach((item,index)=>{
    const row=document.createElement('div');row.className=`selected${item.uploaded?' uploaded':''}`;
    const icon=document.createElement('span');icon.className='file-icon';icon.textContent=item.uploaded?'✓':'📄';
    const details=document.createElement('span'),name=document.createElement('strong'),size=document.createElement('small');
    name.textContent=item.file.name;size.textContent=item.uploaded?`${sizeLabel(item.file.size)} · загружен`:sizeLabel(item.file.size);details.append(name,size);
    const remove=document.createElement('button');remove.type='button';remove.dataset.removeFile=String(index);remove.ariaLabel=`Убрать файл ${item.file.name}`;remove.textContent='×';remove.disabled=uploading||item.uploaded;
    row.append(icon,details,remove);$('#selected').append(row);
  });
  $('#submit').disabled=uploading||!selectedFiles.length||finished;
}
function choose(files){
  error('');
  const list=[...(files||[])];if(!list.length)return;
  if(list.length>maxFiles)return error(`Можно выбрать не больше ${maxFiles} файлов.`);
  for(const file of list){
    if(!allowed.test(file.name))return error(`Формат файла «${file.name}» не поддерживается.`);
    if(file.size>maxSize)return error(`Файл «${file.name}» больше 200 МБ.`);
    if(!file.size)return error(`Файл «${file.name}» пустой.`);
  }
  selectedFiles=list.map(file=>({file,uploaded:false}));finished=false;renderFiles();
}
function sendFile(url,file,onProgress){
  return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(event.loaded/event.total)};xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error('Хранилище не приняло файл'));xhr.onerror=()=>reject(new Error('Соединение прервано'));xhr.send(file)});
}
async function load(){
  if(!token)throw new Error('В ссылке нет кода загрузки');
  const response=await fetch(`/api/large-upload/${encodeURIComponent(token)}`,{cache:'no-store'}),data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Ссылка недействительна');
  $('#clinic').textContent=data.clinic;$('#order').textContent=data.orderId;$('#patient').textContent=data.patient;$('#work').textContent=`${data.work} · ${data.date}`;$('#loader').classList.add('hidden');$('#upload').classList.remove('hidden');
}
$('#file').addEventListener('change',event=>choose(event.target.files));
$('#selected').addEventListener('click',event=>{const button=event.target.closest('[data-remove-file]');if(!button||uploading)return;selectedFiles.splice(Number(button.dataset.removeFile),1);$('#file').value='';renderFiles()});
for(const name of ['dragenter','dragover'])$('#drop').addEventListener(name,event=>{event.preventDefault();$('#drop').classList.add('drag')});
for(const name of ['dragleave','drop'])$('#drop').addEventListener(name,event=>{event.preventDefault();$('#drop').classList.remove('drag')});
$('#drop').addEventListener('drop',event=>choose(event.dataTransfer.files));
$('#submit').addEventListener('click',async()=>{
  if(!selectedFiles.length||finished)return;
  uploading=true;renderFiles();$('#progress').classList.add('show');error('');
  try{
    const total=selectedFiles.length;
    for(let index=0;index<selectedFiles.length;index++){
      const item=selectedFiles[index];if(item.uploaded)continue;
      const file=item.file,current=index+1;
      $('#status').textContent=`Подготавливаем файл ${current} из ${total}…`;
      const preparedResponse=await fetch(`/api/large-upload/${encodeURIComponent(token)}/init`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,size:file.size,type:file.type||'application/octet-stream'})}),prepared=await preparedResponse.json().catch(()=>({}));
      if(!preparedResponse.ok)throw new Error(prepared.error||`Не удалось начать загрузку файла «${file.name}»`);
      await sendFile(prepared.href,file,value=>{const progress=Math.round(((index+value)/total)*100);$('#bar').style.width=`${progress}%`;$('#status').textContent=`Файл ${current} из ${total}: ${Math.round(value*100)}%`});
      $('#status').textContent=`Добавляем файл ${current} из ${total} в заказ…`;
      const completeResponse=await fetch(`/api/large-upload/${encodeURIComponent(token)}/complete/${encodeURIComponent(prepared.uploadId)}`,{method:'POST'}),complete=await completeResponse.json().catch(()=>({}));
      if(!completeResponse.ok)throw new Error(complete.error||`Не удалось добавить файл «${file.name}» в заказ`);
      item.uploaded=true;renderFiles();
    }
    $('#status').textContent='Завершаем загрузку…';
    const finishResponse=await fetch(`/api/large-upload/${encodeURIComponent(token)}/finish`,{method:'POST'}),finish=await finishResponse.json().catch(()=>({}));
    if(!finishResponse.ok)throw new Error(finish.error||'Не удалось завершить загрузку');
    finished=true;$('#bar').style.width='100%';$('#upload').classList.add('hidden');$('#success').classList.add('show');
  }catch(reason){error(reason.message);$('#status').textContent='Загрузка не завершена'}
  finally{uploading=false;renderFiles()}
});
load().catch(reason=>{$('#loader').innerHTML='<h1>Ссылка недоступна</h1>';error(reason.message)});
