const $=selector=>document.querySelector(selector);
const token=new URLSearchParams(location.search).get('token')||'';
let selectedFile=null;
const allowed=/\.(jpg|jpeg|png|webp|pdf|stl|ply|zip|rar|7z|doc|docx|xls|xlsx|txt|rtf)$/i;
const maxSize=200*1024*1024;
const sizeLabel=size=>size>=1024*1024?`${(size/1024/1024).toFixed(1)} МБ`:`${Math.max(1,Math.ceil(size/1024))} КБ`;
function error(message){$('#error').textContent=message||'Не удалось загрузить файл'}
function choose(file){
  error('');
  if(!file)return;
  if(!allowed.test(file.name))return error('Этот формат не поддерживается. Выберите изображение, PDF, 3D-файл, архив или документ.');
  if(file.size>maxSize)return error('Файл больше 200 МБ.');
  if(!file.size)return error('Файл пустой.');
  selectedFile=file;$('#file-name').textContent=file.name;$('#file-size').textContent=sizeLabel(file.size);$('#selected').classList.add('show');$('#submit').disabled=false;
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
$('#file').addEventListener('change',event=>choose(event.target.files?.[0]));
$('#remove').addEventListener('click',()=>{selectedFile=null;$('#file').value='';$('#selected').classList.remove('show');$('#submit').disabled=true});
for(const name of ['dragenter','dragover'])$('#drop').addEventListener(name,event=>{event.preventDefault();$('#drop').classList.add('drag')});
for(const name of ['dragleave','drop'])$('#drop').addEventListener(name,event=>{event.preventDefault();$('#drop').classList.remove('drag')});
$('#drop').addEventListener('drop',event=>choose(event.dataTransfer.files?.[0]));
$('#submit').addEventListener('click',async()=>{
  if(!selectedFile)return;
  $('#submit').disabled=true;$('#progress').classList.add('show');error('');
  try{
    $('#status').textContent='Подготавливаем защищённую загрузку…';
    const preparedResponse=await fetch(`/api/large-upload/${encodeURIComponent(token)}/init`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:selectedFile.name,size:selectedFile.size,type:selectedFile.type||'application/octet-stream'})}),prepared=await preparedResponse.json().catch(()=>({}));
    if(!preparedResponse.ok)throw new Error(prepared.error||'Не удалось начать загрузку');
    $('#status').textContent='Загружаем файл…';
    await sendFile(prepared.href,selectedFile,value=>{$('#bar').style.width=`${Math.round(value*100)}%`;$('#status').textContent=`Загружаем файл… ${Math.round(value*100)}%`});
    $('#status').textContent='Добавляем файл в карточку заказа…';
    const completeResponse=await fetch(`/api/large-upload/${encodeURIComponent(token)}/complete/${encodeURIComponent(prepared.uploadId)}`,{method:'POST'}),complete=await completeResponse.json().catch(()=>({}));
    if(!completeResponse.ok)throw new Error(complete.error||'Не удалось добавить файл в заказ');
    $('#upload').classList.add('hidden');$('#success').classList.add('show');
  }catch(reason){error(reason.message);$('#submit').disabled=false;$('#status').textContent='Загрузка не завершена'}
});
load().catch(reason=>{$('#loader').innerHTML='<h1>Ссылка недоступна</h1>';error(reason.message)});
