import {resolveWorkSelection,priceUnitsForSelection,rubles} from './work-catalog.js';
export function reviseOrderServices(order,changes,{variantIndex,deliverySettings={freeThreshold:4000,fee:500},promoPrices={}}={}){
 const variants=structuredClone(order.variants?.length?order.variants:[{work:order.work,workOption:order.material,selectedTeeth:order.teeth||[],toothMode:order.toothMode||'Одиночка',bridgeRanges:order.bridgeRanges||[]}]);
 const position=variantIndex===undefined?(variants.length===1?0:-1):Number(variantIndex);
 if(!Number.isInteger(position)||position<0||position>=variants.length)throw new Error('Выберите позицию заказа, которую нужно изменить');
 let target=variants[position];
 if(changes.work!==undefined||changes.material!==undefined){target={...target,work:changes.work??target.work,workOption:changes.material??target.workOption};delete target.units;delete target.unitPrice;delete target.serviceId;delete target.workId;}
 if(changes.teeth!==undefined)target.selectedTeeth=[...changes.teeth];
 if(changes.toothMode!==undefined)target.toothMode=changes.toothMode;
 if(changes.bridgeRanges!==undefined)target.bridgeRanges=changes.bridgeRanges;
 variants[position]=target;
 let servicesTotal=0;
 for(let i=0;i<variants.length;i++){
  const variant=variants[i],selection=resolveWorkSelection(variant.workId||variant.work,variant.serviceId||variant.workOption);
  if(!selection.option||!Number.isFinite(Number(selection.price)))throw new Error('Услуга больше недоступна. Выберите актуальную услугу из прайса');
  const changed=i===position,basePrice=!changed&&Number.isFinite(variant.unitPrice)?variant.unitPrice:Number(selection.price),promo=promoPrices[`${selection.category.name}|||${selection.option.name}`];
  const unitPrice=changed&&Number.isFinite(Number(promo))?Number(promo):basePrice;
  const quantity=priceUnitsForSelection(selection.category.id,variant.selectedTeeth||[],variant.units);
  if(selection.category.pricingUnit==='jaw'&&!variant.units){const selected=new Set(variant.selectedTeeth||[]);const jaws=[[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]];if(!jaws.some(jaw=>jaw.every(n=>selected.has(n))))throw new Error('Для этой услуги выберите целую челюсть');}
  Object.assign(variant,{work:selection.category.name,workOption:selection.option.name,workId:selection.category.id,serviceId:selection.option.id,unitPrice,pricingUnit:selection.category.pricingUnit,amount:Math.round(unitPrice*quantity*100)/100});
  servicesTotal+=variant.amount;
 }
 servicesTotal=Math.round(servicesTotal*100)/100;
 const deliveryFee=servicesTotal<Number(deliverySettings.freeThreshold??4000)?Number(deliverySettings.fee??500):0;
 const teeth=[...new Set(variants.flatMap(v=>v.selectedTeeth||[]))].sort((a,b)=>a-b),first=variants[0];
 return {variants,work:variants.length>1?`Несколько услуг (${variants.length})`:first.work,material:variants.map(v=>v.workOption).join(' · '),teeth,quantity:variants.reduce((n,v)=>n+priceUnitsForSelection(v.workId||v.work,v.selectedTeeth||[],v.units),0),toothMode:variants.length>1?'Несколько услуг':first.toothMode,bridgeRanges:variants.flatMap(v=>v.bridgeRanges||[]),servicesTotal,deliveryFee,sum:rubles(servicesTotal+deliveryFee)};
}
