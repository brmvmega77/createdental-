import {portalToken} from '/portal-client.js?v=reliability-retry-1';

export async function workerCadPreviewSource(orderId,fileId){
  const response=await fetch(`/api/orders/${encodeURIComponent(orderId)}/cad-preview-link?fileId=${encodeURIComponent(fileId)}`,{
    headers:{'X-Portal-Token':portalToken()},cache:'no-store',signal:AbortSignal.timeout(45000),
  });
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Не удалось открыть CAD');
  const url=new URL(data.url,location.origin);
  const token=url.searchParams.get('token');
  if(!token||!/^[A-Za-z0-9_-]{30,80}$/.test(token))throw new Error('Ссылка на CAD недоступна');
  return new URL(`/api/cad-preview/${encodeURIComponent(token)}`,location.origin).href;
}
