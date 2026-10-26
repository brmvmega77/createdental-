import {estimateWork,rubles} from './work-catalog.js';
export const normalizePromoCode=value=>String(value||'').trim().toUpperCase();
export const validPromoCode=value=>/^[A-Z0-9_-]{2,40}$/.test(normalizePromoCode(value));
export function promoRegistrationLink(code,origin){
 if(!validPromoCode(code))return '';
 const link=new URL('/register',origin);link.searchParams.set('promo',normalizePromoCode(code));return link.href;
}
export function promoRulesWithClients(rules=[],clients=[]){
 return rules.map(rule=>({...rule,clinicIds:clients.filter(clinic=>!clinic.deleted&&normalizePromoCode(clinic.promoCode)===normalizePromoCode(rule.code)).map(clinic=>clinic.id)}));
}
// Only explicit selections replace assignments. Legacy saves that omit clinicIds
// retain the current clinic assignments; removed codes release their clinics.
export function applyPromoAssignments(clients,previousRules,rules){
 const known=new Set(clients.filter(clinic=>!clinic.deleted).map(clinic=>clinic.id)),selected=new Map(),managed=new Set(previousRules.filter(old=>!rules.some(rule=>normalizePromoCode(rule.code)===normalizePromoCode(old.code))).map(rule=>normalizePromoCode(rule.code)));
 for(const rule of rules){
  if(!Object.hasOwn(rule,'clinicIds'))continue;
  if(!Array.isArray(rule.clinicIds)||rule.clinicIds.length>2000||new Set(rule.clinicIds).size!==rule.clinicIds.length)throw new Error('invalid_promo_clinics');
  const code=normalizePromoCode(rule.code);managed.add(code);
  for(const id of rule.clinicIds){if(!known.has(id))throw new Error('invalid_promo_clinics');if(selected.has(id))throw new Error('duplicate_promo_clinic');selected.set(id,code);}
 }
 let changed=false;
 const updated=clients.map(clinic=>{
  if(clinic.deleted)return clinic;
  const before=normalizePromoCode(clinic.promoCode),code=selected.get(clinic.id)??(managed.has(before)?'':before);
  if(code===before)return clinic;
  changed=true;return {...clinic,promoCode:code};
 });
 return changed?updated:clients;
}

// Use the clinic's saved assignment, never a discount supplied in the order body.
export function priceNewClinicOrder(order,clinic,rules=[],delivery={freeThreshold:4000,fee:500}){
  const code=normalizePromoCode(clinic?.promoCode),rule=rules.find(item=>item.active!==false&&normalizePromoCode(item.code)===code);
  const incoming=order.variants?.length?order.variants:[{work:order.work,workOption:order.material,selectedTeeth:order.teeth||[],toothMode:order.toothMode}];
  const variants=incoming.map(variant=>{
    const estimate=estimateWork({work:variant.work,option:variant.workOption,teeth:variant.selectedTeeth||[],units:variant.units}),special=rule?.prices?.[`${variant.work}|||${variant.workOption}`];
    const unitPrice=special!==undefined&&Number.isFinite(Number(special))?Number(special):estimate.price;
    return {...variant,unitPrice,amount:unitPrice===null?null:unitPrice*estimate.units};
  });
  if(!variants.every(variant=>Number.isFinite(variant.amount)))throw new Error('invalid_order_service');
  const servicesTotal=variants.reduce((sum,variant)=>sum+variant.amount,0),threshold=Number(delivery?.freeThreshold??4000),fee=Number(delivery?.fee??500),deliveryFee=servicesTotal<threshold?fee:0;
  return {...order,variants,servicesTotal,deliveryFee,promoCode:rule?code:'',sum:rubles(servicesTotal+deliveryFee)};
}
