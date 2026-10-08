const apiRoot='https://cloud-api.yandex.net/v1/disk';

function diskError(data,status){
  const message=String(data?.message||data?.description||'').trim();
  return new Error(message||`Яндекс Диск вернул ошибку ${status}`);
}

async function diskRequest(token,pathname,{method='GET',body}={}){
  if(!token)throw new Error('Яндекс Диск не подключён');
  const response=await fetch(`${apiRoot}${pathname}`,{
    method,
    headers:{Authorization:`OAuth ${token}`,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(30000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw diskError(data,response.status);
  return data;
}

function query(pathname,params){
  const search=new URLSearchParams(params);
  return `${pathname}?${search}`;
}

export async function ensureDiskFolder(token,folderPath){
  const parts=String(folderPath||'').split('/').filter(Boolean);
  let current='';
  for(const part of parts){
    current+=`/${part}`;
    const response=await fetch(`${apiRoot}${query('/resources',{path:current})}`,{method:'PUT',headers:{Authorization:`OAuth ${token}`},signal:AbortSignal.timeout(30000)});
    if(response.ok||response.status===409)continue;
    throw diskError(await response.json().catch(()=>({})),response.status);
  }
}

export async function createDiskUpload(token,diskPath){
  const slash=String(diskPath).lastIndexOf('/');
  await ensureDiskFolder(token,slash>0?diskPath.slice(0,slash):'/Клиенты');
  const data=await diskRequest(token,query('/resources/upload',{path:diskPath,overwrite:'false'}));
  if(!data.href)throw new Error('Яндекс Диск не выдал адрес загрузки');
  return {href:data.href,method:data.method||'PUT',templated:Boolean(data.templated)};
}

async function waitForOperation(token,href){
  if(!href)return;
  for(let attempt=0;attempt<30;attempt+=1){
    const response=await fetch(href,{headers:{Authorization:`OAuth ${token}`},signal:AbortSignal.timeout(30000)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw diskError(data,response.status);
    if(data.status==='success')return;
    if(data.status==='failed')throw new Error('Яндекс Диск не смог переместить файл');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  throw new Error('Яндекс Диск слишком долго перемещает файл');
}

export async function moveDiskResource(token,fromPath,toPath){
  const slash=String(toPath).lastIndexOf('/');
  await ensureDiskFolder(token,slash>0?toPath.slice(0,slash):'/Клиенты');
  const response=await fetch(`${apiRoot}${query('/resources/move',{from:fromPath,path:toPath,overwrite:'false'})}`,{
    method:'POST',headers:{Authorization:`OAuth ${token}`},signal:AbortSignal.timeout(30000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw diskError(data,response.status);
  if(response.status===202)await waitForOperation(token,data.href);
  return true;
}

export async function copyDiskResource(token,fromPath,toPath){
  const slash=String(toPath).lastIndexOf('/');
  await ensureDiskFolder(token,slash>0?toPath.slice(0,slash):'/Клиенты');
  const response=await fetch(`${apiRoot}${query('/resources/copy',{from:fromPath,path:toPath,overwrite:'false'})}`,{
    method:'POST',headers:{Authorization:`OAuth ${token}`},signal:AbortSignal.timeout(30000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw diskError(data,response.status);
  if(response.status===202)await waitForOperation(token,data.href);
  return true;
}

export function diskMetadata(token,diskPath){
  return diskRequest(token,query('/resources',{path:diskPath,fields:'name,size,mime_type,path,md5,antivirus_status,created'}));
}

export async function diskDownloadUrl(token,diskPath){
  const data=await diskRequest(token,query('/resources/download',{path:diskPath}));
  if(!data.href)throw new Error('Яндекс Диск не выдал ссылку на файл');
  return data.href;
}

export async function deleteDiskResource(token,diskPath){
  if(!token||!diskPath)return false;
  const response=await fetch(`${apiRoot}${query('/resources',{path:diskPath,permanently:'true'})}`,{method:'DELETE',headers:{Authorization:`OAuth ${token}`},signal:AbortSignal.timeout(30000)});
  if(response.ok||response.status===404)return true;
  throw diskError(await response.json().catch(()=>({})),response.status);
}
