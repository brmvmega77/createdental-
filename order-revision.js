import {resolveWorkSelection,priceUnitsForSelection,rubles} from './work-catalog.js';
import {samePortalValue} from './collection-concurrency.js';
export class OrderRevisionError extends Error{constructor(message,code='invalid_revision'){super(message);this.code=code;this.status=400;}}
export const hasServiceChanges=changes=>['work','material','teeth','toothMode','bridgeRanges','variants'].some(key=>Object.hasOwn(changes||{},key));
const money=value=>typeof value==='number'?value:!/[0-9]/.test(String(value??''))?NaN:Number(String(value??'').replace(/[^\d,.-]/g,'').replace(',','.'));
const teethOf=v=>[...new Set((v.selectedTeeth||v.teeth||[]).map(Number))].sort((a,b)=>a-b);
export function orderVariants(order){
 const rows=structuredClone(order.variants?.length?order.variants:[{work:order.work,workOption:order.material,selectedTeeth:order.teeth||[],toothMode:order.toothMode||'Одиночка',bridgeRanges:order.bridgeRanges||[]}]);
 // Legacy single-service orders can recover their agreed price from the saved total.
 if(rows.length===1&&!Number.isFinite(rows[0].unitPrice)){
  const v=rows[0],selection=resolveWorkSelection(v.workId||v.work,v.serviceId||v.workOption),units=priceUnitsForSelection(v.workId||v.work,teethOf(v),v.units,v.pricingUnit);
  const subtotal=Number.isFinite(order.servicesTotal)?order.servicesTotal:order.sum?money(order.sum)-(Number(order.deliveryFee)||0):NaN;
  if(Number.isFinite(subtotal)&&subtotal>=0&&selection.option) v.unitPrice=Math.round(subtotal/units*100)/100;
 }
 return rows;
}
function sameService(a,b){
 if(a.work===b.work&&a.workOption===b.workOption)return true;
 const before=resolveWorkSelection(a.workId||a.work,a.serviceId||a.workOption),after=resolveWorkSelection(b.work,b.workOption);
 return Boolean(before.option&&after.option&&before.option.id===after.option.id&&before.category.id===after.category.id);
}
export function mergeOrderVariant(previous,next){
 const same=previous&&sameService(previous,next);
 const merged={...(same?previous:{}),...next};
 if(same){for(const key of ['workId','serviceId','unitPrice','pricingUnit'])if(previous[key]!==undefined)merged[key]=previous[key];}
 else for(const key of ['workId','serviceId','unitPrice','pricingUnit','amount','units'])delete merged[key];
 if(previous&&previous.toothMode===next.toothMode&&samePortalValue(teethOf(previous),teethOf(next))&&previous.bridgeRanges?.length)merged.bridgeRanges=structuredClone(previous.bridgeRanges);
 return merged;
}
function shape(v){return {work:v.work,workOption:v.workOption,selectedTeeth:teethOf(v),toothMode:v.toothMode||'Одиночка',units:v.units??null,bridgeRanges:v.bridgeRanges||[]};}
export function reviseOrderVariants(order,incoming,{deliverySettings={freeThreshold:4000,fee:500},promoPrices={}}={}){
 if(!Array.isArray(incoming)||!incoming.length||incoming.length>10)throw new OrderRevisionError('В заказе должно быть от 1 до 10 услуг');
 const before=orderVariants(order);
 // No service edit means no recalculation, including delivery and legacy prices.
 if(incoming.length===before.length&&incoming.every((v,i)=>samePortalValue(shape(v),shape(before[i]))))return {...Object.fromEntries(['work','material','teeth','quantity','toothMode','bridgeRanges','servicesTotal','deliveryFee','sum'].filter(key=>Object.hasOwn(order,key)).map(key=>[key,structuredClone(order[key])])),variants:structuredClone(order.variants?.length?order.variants:before)};
 let servicesTotal=0;
 const variants=incoming.map((raw,index)=>{
  const variant=structuredClone(raw),selection=resolveWorkSelection(variant.work,variant.workOption);
  const previous=before[Number.isInteger(variant.sourcePosition)?variant.sourcePosition:index];
  const same=Boolean(previous&&sameService(previous,variant));
  const knownPrice=same&&Number.isFinite(previous?.unitPrice??variant.unitPrice)?previous?.unitPrice??variant.unitPrice:undefined;
  if(!selection.option&&knownPrice===undefined)throw new OrderRevisionError('Услуга больше недоступна. Выберите актуальную услугу из прайса');
  const promo=selection.option?promoPrices[`${selection.category.name}|||${selection.option.name}`]:undefined;
  const unitPrice=knownPrice??(Number.isFinite(promo)?promo:Number(selection.price));
  if(!Number.isFinite(unitPrice)||unitPrice<0)throw new OrderRevisionError('Не удалось определить цену услуги');
  const pricingUnit=variant.pricingUnit||selection.category?.pricingUnit,selectedTeeth=teethOf(variant);
  const quantity=priceUnitsForSelection(selection.category?.id||variant.work,selectedTeeth,variant.units,pricingUnit);
  if(pricingUnit==='jaw'&&!variant.units){const selected=new Set(selectedTeeth),jaws=[[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]];if(!jaws.some(jaw=>jaw.every(n=>selected.has(n))))throw new OrderRevisionError('Для этой услуги выберите целую челюсть');}
  const bridgeRanges=variant.toothMode==='Мост'?(variant.bridgeRanges?.length?variant.bridgeRanges:[selectedTeeth]).map(range=>[...new Set(range.map(Number))].sort((a,b)=>a-b)):[];
  if(variant.toothMode==='Мост'&&selectedTeeth.length<2)throw new OrderRevisionError('Для моста выберите не меньше двух зубов');
  if(bridgeRanges.some(range=>range.length<2||range.some(tooth=>!selectedTeeth.includes(tooth))))throw new OrderRevisionError('В мост могут входить только зубы выбранной услуги');
  delete variant.sourcePosition;
  Object.assign(variant,{work:selection.category?.name||variant.work,workOption:selection.option?.name||variant.workOption,workId:selection.category?.id||variant.workId,serviceId:selection.option?.id||variant.serviceId,selectedTeeth,bridgeRanges,unitPrice,pricingUnit,amount:Math.round(unitPrice*quantity*100)/100});
  servicesTotal+=variant.amount;return variant;
 });
 servicesTotal=Math.round(servicesTotal*100)/100;
 const oldSubtotal=Number.isFinite(order.servicesTotal)?order.servicesTotal:order.sum?money(order.sum)-(Number(order.deliveryFee)||0):NaN;
 const deliveryFee=servicesTotal===oldSubtotal&&Number.isFinite(order.deliveryFee)?order.deliveryFee:servicesTotal<Number(deliverySettings.freeThreshold??4000)?Number(deliverySettings.fee??500):0;
 const first=variants[0],teeth=[...new Set(variants.flatMap(v=>v.selectedTeeth))].sort((a,b)=>a-b);
 return {variants,work:variants.length>1?`Несколько услуг (${variants.length})`:first.work,material:variants.map(v=>v.workOption).join(' · '),teeth,quantity:variants.reduce((n,v)=>n+priceUnitsForSelection(v.workId||v.work,v.selectedTeeth,v.units,v.pricingUnit),0),toothMode:variants.length>1?'Несколько услуг':first.toothMode,bridgeRanges:variants.flatMap(v=>v.bridgeRanges),servicesTotal,deliveryFee,sum:rubles(servicesTotal+deliveryFee)};
}
export function reviseOrderServices(order,changes,options={}){
 const variants=orderVariants(order),position=options.variantIndex===undefined?(variants.length===1?0:-1):Number(options.variantIndex);
 if(!Number.isInteger(position)||position<0||position>=variants.length)throw new OrderRevisionError('Выберите позицию заказа, которую нужно изменить','variant_required');
 let target={...variants[position]};
 if(changes.work!==undefined||changes.material!==undefined)target=mergeOrderVariant(target,{...target,work:changes.work??target.work,workOption:changes.material??target.workOption});
 if(changes.teeth!==undefined)target.selectedTeeth=[...changes.teeth];
 if(changes.toothMode!==undefined)target.toothMode=changes.toothMode;
 target.bridgeRanges=target.toothMode==='Мост'?[teethOf(target)]:[];
 variants[position]=target;
 return reviseOrderVariants(order,variants.map((v,index)=>({...v,sourcePosition:index})),options);
}
export function clientRequestConflict(request,order){
 if(request.baseOrderRevision!==undefined)return request.baseOrderRevision!==(order._revision||0);
 const before=Object.entries(request.before||{});
 // Unversioned legacy requests may only be applied if their touched data still matches.
 return !before.length||before.some(([key,value])=>!samePortalValue(value,order[key]??''));
}
