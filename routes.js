const pages={
  clinic:new Set(['home','new','orders','messages','clinic']),
  technician:new Set(['overview','orders','production','pulse','tasks','requests','intake','clients','messages','analytics','team','quality','pricing','profile']),
  worker:new Set(['overview','orders','tasks','salary','profile'])
};
const localeSlugs={ru:'ru',am:'am',uz:'uz',kk:'kz',ar:'uea'};
const slugLocales=Object.fromEntries(Object.entries(localeSlugs).map(([locale,slug])=>[slug,locale]));slugLocales.uae='ar';
export function localeFromPath(){return null}
export function routeFromPath(pathname){
  const parts=pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const languagePrefix=slugLocales[parts[0]]||null;
  if(languagePrefix)parts.shift();
  const locale=null;
  if(!parts.length)return {role:null,mode:'landing',locale};
  if(parts[0]==='login')return {role:null,mode:'login',locale};
  if(parts[0]==='register')return {role:null,mode:'register',locale};
  if(parts[0]==='forgot-password')return {role:null,mode:'recover',locale};
  const role=parts[0];
  if(!pages[role])return {role:null,mode:'login',locale};
  const defaultPage=role==='clinic'?'home':'overview';
  const page=parts[1]==='orders'&&parts[2]?'detail':parts[1]||defaultPage;
  return {role,page:page==='detail'||pages[role].has(page)?page:defaultPage,orderId:page==='detail'?parts[2]:null,locale};
}
export function pathFor(role,page,orderId,locale=null){
  const prefix='';
  if(!role)return `${prefix}${page==='register'?'/register':page==='recover'?'/forgot-password':'/login'}`||'/';
  const defaultPage=role==='clinic'?'home':'overview';
  if(page==='detail'&&orderId)return `/${role}/orders/${encodeURIComponent(orderId)}`;
  return page===defaultPage?`/${role}`:`/${role}/${page}`;
}
export function navigate(path,{replace=false}={}){
  if(location.pathname===path&&!location.search)return;
  history[replace?'replaceState':'pushState'](null,'',path);
}
