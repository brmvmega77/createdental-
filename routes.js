const pages={
  clinic:new Set(['home','new','orders','messages','clinic']),
  technician:new Set(['overview','orders','intake','clients','messages','analytics','team','quality','profile']),
  worker:new Set(['overview','orders','profile'])
};

export function routeFromPath(pathname){
  const parts=pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if(!parts.length||parts[0]==='login')return {role:null,mode:'login'};
  if(parts[0]==='register')return {role:null,mode:'register'};
  if(parts[0]==='forgot-password')return {role:null,mode:'recover'};
  if(parts[0]==='verify-email')return {role:null,mode:'verify'};
  const role=parts[0];
  if(!pages[role])return {role:null,mode:'login'};
  const defaultPage=role==='clinic'?'home':'overview';
  const page=parts[1]==='orders'&&parts[2]?'detail':parts[1]||defaultPage;
  return {role,page:page==='detail'||pages[role].has(page)?page:defaultPage,orderId:page==='detail'?parts[2]:null};
}

export function pathFor(role,page,orderId){
  if(!role)return page==='register'?'/register':page==='recover'?'/forgot-password':page==='verify'?'/verify-email':'/login';
  const defaultPage=role==='clinic'?'home':'overview';
  if(page==='detail'&&orderId)return `/${role}/orders/${encodeURIComponent(orderId)}`;
  return page===defaultPage?`/${role}`:`/${role}/${page}`;
}

export function navigate(path,{replace=false}={}){
  if(location.pathname===path&&!location.search)return;
  history[replace?'replaceState':'pushState'](null,'',path);
}
