const key='create-dental-portal-token';

export function portalToken(){
  const token=localStorage.getItem(key)||sessionStorage.getItem(key)||'';
  if(token&&!localStorage.getItem(key)){localStorage.setItem(key,token);sessionStorage.removeItem(key)}
  return token;
}
export function setPortalToken(token){localStorage.setItem(key,token.trim());sessionStorage.removeItem(key)}
export function clearPortalToken(){localStorage.removeItem(key);sessionStorage.removeItem(key)}

async function request(path,options={}){
  const response=await fetch(path,{...options,headers:{'X-Portal-Token':portalToken(),...(options.headers||{})}});
  let data;
  try {data=await response.json()} catch {throw new Error('Сервер вернул неверный ответ')}
  if(!response.ok){const error=new Error(data.error||'Ошибка связи с сервером');error.status=response.status;throw error}
  return data;
}

export const loadPortal=()=>request('/api/portal');
export const savePortal=(collection,value)=>request(`/api/portal/${collection}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
export const loadOrderFiles=orderId=>request(`/api/orders/${encodeURIComponent(orderId)}/files`);
async function uploadDirect(file,details,localUpload){
  const prepared=await request('/api/uploads/init',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...details,name:file.name,size:file.size,type:file.type||'application/octet-stream'})});
  if(prepared.mode==='local')return localUpload();
  const sent=await fetch(prepared.href,{method:prepared.method||'PUT',body:file});
  if(!sent.ok)throw new Error('Яндекс Диск не принял файл. Повторите загрузку');
  return request(`/api/uploads/${encodeURIComponent(prepared.uploadId)}/complete`,{method:'POST'});
}
export const uploadOrderFile=async(orderId,file,{purpose='order-file'}={})=>{
  const result=await uploadDirect(file,{target:'order',orderId,purpose},async()=>{
    const response=await fetch(`/api/orders/${encodeURIComponent(orderId)}/files`,{method:'POST',headers:{'X-Portal-Token':portalToken(),'Content-Type':'application/octet-stream','X-Upload-Name':encodeURIComponent(file.name),'X-File-Purpose':purpose},body:file});
    let data;try{data=await response.json()}catch{throw new Error('Сервер вернул неверный ответ')}
    if(!response.ok)throw new Error(data.error||'Не удалось загрузить файл');return data;
  });
  return result.file;
};
export const loadOrderFilePreview=async fileId=>{
  const response=await fetch(`/api/order-files/${encodeURIComponent(fileId)}?link=1`,{headers:{'X-Portal-Token':portalToken()}});
  if(!response.ok)throw new Error('Не удалось открыть фото результата');
  if(response.headers.get('Content-Type')?.includes('application/json')){const data=await response.json();if(data.url)return data.url}
  const blob=await response.blob();
  if(!blob.type.startsWith('image/'))throw new Error('Файл не является изображением');
  return URL.createObjectURL(blob);
};
export const downloadOrderFile=async fileId=>{
  const response=await fetch(`/api/order-files/${encodeURIComponent(fileId)}?link=1`,{headers:{'X-Portal-Token':portalToken()}});
  if(!response.ok){let data={};try{data=await response.json()}catch{}throw new Error(data.error||'Не удалось скачать файл')}
  if(response.headers.get('Content-Type')?.includes('application/json')){const data=await response.json();if(data.url){const anchor=document.createElement('a');anchor.href=data.url;anchor.download=data.name||'order-file';anchor.rel='noopener';document.body.append(anchor);anchor.click();anchor.remove();return}}
  const blob=await response.blob(),url=URL.createObjectURL(blob),anchor=document.createElement('a'),header=response.headers.get('Content-Disposition')||'',encoded=header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];anchor.href=url;anchor.download=encoded?decodeURIComponent(encoded):'order-file';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
};
export const requestOrderRework=(orderId,reason)=>request(`/api/orders/${encodeURIComponent(orderId)}/rework`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason})});
export const uploadClinicMessageFile=async(file,clinicId='')=>{
  const result=await uploadDirect(file,{target:'message',clinicId,purpose:'message-file'},async()=>{
    const response=await fetch('/api/clinic-message-files',{method:'POST',headers:{'X-Portal-Token':portalToken(),'Content-Type':'application/octet-stream','X-Upload-Name':encodeURIComponent(file.name),...(clinicId?{'X-Clinic-Id':clinicId}:{})},body:file});
    let data;try{data=await response.json()}catch{throw new Error('Сервер вернул неверный ответ')}
    if(!response.ok)throw new Error(data.error||'Не удалось загрузить файл');return data;
  });
  return result.attachment;
};
export const downloadClinicMessageFile=async fileId=>{
  const response=await fetch(`/api/clinic-message-files/${encodeURIComponent(fileId)}?link=1`,{headers:{'X-Portal-Token':portalToken()}});
  if(!response.ok){let data={};try{data=await response.json()}catch{}throw new Error(data.error||'Не удалось скачать файл')}
  if(response.headers.get('Content-Type')?.includes('application/json')){const data=await response.json();if(data.url){const anchor=document.createElement('a');anchor.href=data.url;anchor.download=data.name||'message-file';anchor.rel='noopener';document.body.append(anchor);anchor.click();anchor.remove();return}}
  const blob=await response.blob(),url=URL.createObjectURL(blob),anchor=document.createElement('a'),header=response.headers.get('Content-Disposition')||'',encoded=header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  anchor.href=url;anchor.download=encoded?decodeURIComponent(encoded):'message-file';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
};
export async function authRequest(action,value){
  const data=await request('/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  if(data.token)setPortalToken(data.token);
  return data;
}
