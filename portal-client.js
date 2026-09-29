const key='create-dental-portal-token';

export const portalToken=()=>sessionStorage.getItem(key)||'';
export function setPortalToken(token){sessionStorage.setItem(key,token.trim())}
export function clearPortalToken(){sessionStorage.removeItem(key)}

async function request(path,options={}){
  const response=await fetch(path,{...options,headers:{'X-Portal-Token':portalToken(),...(options.headers||{})}});
  let data;
  try {data=await response.json()} catch {throw new Error('Сервер вернул неверный ответ')}
  if(!response.ok)throw new Error(data.error||'Ошибка связи с сервером');
  return data;
}

export const loadPortal=()=>request('/api/portal');
export const savePortal=(collection,value)=>request(`/api/portal/${collection}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
export async function authRequest(action,value){
  const data=await request('/api/auth/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  if(data.token)setPortalToken(data.token);
  return data;
}
