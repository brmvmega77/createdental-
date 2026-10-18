export const SURGICAL_TEMPLATE_CATEGORY='Хирургические шаблоны';
export const SURGICAL_TEMPLATE_OPTION='Хирургический навигационный шаблон на 1 имплантант';
export const SURGICAL_SOCKET_OPTION='Дополнительное гнездо под имплантант в хирургическом шаблоне';
export const SURGICAL_SOCKETS_PER_JAW=16;

const upperTeeth=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
const lowerTeeth=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

export function isSurgicalTemplate(variant){return variant?.work===SURGICAL_TEMPLATE_CATEGORY&&variant?.workOption===SURGICAL_TEMPLATE_OPTION}
export function isSurgicalSocket(variant){return variant?.work===SURGICAL_TEMPLATE_CATEGORY&&variant?.workOption===SURGICAL_SOCKET_OPTION}
export function groupSurgicalSockets(variants){
  const groups=(Array.isArray(variants)?variants:[]).flatMap((variant,index)=>isSurgicalSocket(variant)?[]:[{variant,index,sockets:[]}]);
  (Array.isArray(variants)?variants:[]).forEach((variant,index)=>{
    if(!isSurgicalSocket(variant))return;
    const group=groups.find(item=>isSurgicalTemplate(item.variant)&&['upper','lower'].some(jaw=>hasSurgicalJaw(item.variant,jaw)&&hasSurgicalJaw(variant,jaw)));
    if(group)group.sockets.push({variant,index});
    else groups.push({variant,index,sockets:[]});
  });
  return groups;
}
export function hasSurgicalJaw(variant,jaw){
  const teeth=Array.isArray(variant?.selectedTeeth)?variant.selectedTeeth:[];
  const jawTeeth=jaw==='upper'?upperTeeth:lowerTeeth;
  return jawTeeth.every(tooth=>teeth.includes(tooth));
}
export function surgicalJawCount(variant){return Number(hasSurgicalJaw(variant,'upper'))+Number(hasSurgicalJaw(variant,'lower'))}
export function maxSurgicalSockets(variant){return Math.max(1,surgicalJawCount(variant))*SURGICAL_SOCKETS_PER_JAW}
export function surgicalVariantUnits(variant){
  if(isSurgicalTemplate(variant))return Math.max(1,surgicalJawCount(variant));
  if(isSurgicalSocket(variant))return Math.max(1,Math.min(maxSurgicalSockets(variant),Math.trunc(Number(variant.units)||1)));
  return null;
}
export function adjustSurgicalSockets(variant,delta){
  if(!isSurgicalSocket(variant))return null;
  const current=surgicalVariantUnits(variant),step=Math.trunc(Number(delta)||0);
  return Math.max(1,Math.min(maxSurgicalSockets(variant),current+step));
}
