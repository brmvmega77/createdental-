import {resolveWorkSelection,priceUnitsForSelection} from './work-catalog.js';

export const payrollRoles=[{key:'cad',label:'CAD оператор',fallback:900},{key:'cam',label:'CAM оператор',fallback:450},{key:'esthetic',label:'Эстетист',fallback:450},{key:'gypsum',label:'Гипсовщик',fallback:450}];
export const employeeRank=employee=>Number.isInteger(employee?.rank)&&employee.rank>=1&&employee.rank<=5?employee.rank:1;
export function payrollRole(employee){
  const value=String(employee?.specialty||'');
  if(/cad|кад|моделировщик/i.test(value))return 'cad';
  if(/гипсов|препрод|pre\s*prod|предпрод/i.test(value))return 'gypsum';
  if(/красильщик|керамист|эстетист/i.test(value))return 'esthetic';
  return 'cam';
}
export const payrollServiceKey=(work,service)=>{const option=resolveWorkSelection(work,service).option;return option?.id?'service:'+option.id:String(work||'')+'|||'+String(service||'')};
export function payrollCatalog(catalog=[]){
  return catalog.flatMap(category=>(category.options||[]).length?category.options.map(option=>({work:category.name,service:typeof option==='string'?option:option.name,key:payrollServiceKey(category.name,typeof option==='string'?option:option.name)})):Number.isFinite(category.price)?[{work:category.name,service:category.name,key:payrollServiceKey(category.name,category.name)}]:[]);
}
export function payrollRate(settings,role,rank,key){
  const rates=settings?.rates?.[role]||{};let rate=rates[key]?.[rank-1];
  if(rate===undefined&&key.startsWith('service:')){for(const [oldKey,values] of Object.entries(rates)){const [work,service]=oldKey.split('|||');if(service&&payrollServiceKey(work,service)===key){rate=values?.[rank-1];break}}}
  return typeof rate==='number'&&Number.isFinite(rate)?rate:payrollRoles.find(item=>item.key===role)?.fallback??450;
}
export function validPayrollSettings(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isSafeInteger(value.revision)||value.revision<0||!value.rates||typeof value.rates!=='object'||Array.isArray(value.rates))return false;
  return Object.entries(value.rates).every(([role,rates])=>payrollRoles.some(item=>item.key===role)&&rates&&typeof rates==='object'&&!Array.isArray(rates)&&Object.keys(rates).length<=10000&&Object.entries(rates).every(([key,values])=>key.length>0&&key.length<=600&&!/[<>]/.test(key)&&Array.isArray(values)&&values.length===5&&values.every(rate=>rate===null||typeof rate==='number'&&Number.isFinite(rate)&&rate>=0&&rate<=10000000&&Math.abs(rate*100-Math.round(rate*100))<0.000001)));
}
const roundMoney=amount=>Math.round(amount*100)/100;
const fields={cad:['cadOperator','assignee'],cam:['frameTechnician','technician'],esthetic:['painter','ceramicist'],gypsum:['preprodTechnician']};
function completion(detail,role){
  if(role==='cad')return detail?.cadReview?.status==='approved'&&detail.cadReview.reviewedAt?detail.cadReview.reviewedAt:'';
  const status=role==='cam'?detail?.frameTechnicianStatus:role==='esthetic'?(detail?.painterStatus||detail?.ceramicistStatus):detail?.preprodTechnicianStatus;
  if(status!=='Работа сдана')return '';
  return (role==='esthetic'?detail.estheticQualityApprovedAt:'')||detail.qualityApprovedAt||detail.completedAt||detail.reworkAt||'';
}
export function collectPayrollAccruals(state,{previousOverrides={},legacy=false,actorRole='technician',now=new Date().toISOString()}={}){
  const existing=new Set((state.salaryAccruals||[]).map(item=>item.orderId+'|'+item.role));
  const result=[];
  for(const order of state.orders||[]){
    const detail=state.orderOverrides?.[order.id]||{};
    for(const role of payrollRoles){
      const id=order.id+'|'+role.key;
      if(existing.has(id))continue;
      if(!legacy&&(role.key==='cad'?actorRole!=='clinic':actorRole!=='technician'))continue;
      const at=completion(detail,role.key);
      if(!at&&!legacy)continue;
      // Old production data can have a submitted status without a timestamp.
      const statusDone=role.key==='cad'?Boolean(at):role.key==='cam'?detail.frameTechnicianStatus==='Работа сдана':role.key==='esthetic'?(detail.painterStatus||detail.ceramicistStatus)==='Работа сдана':detail.preprodTechnicianStatus==='Работа сдана';
      if(!statusDone||!legacy&&completion(previousOverrides[order.id]||{},role.key))continue;
      const submitted=previousOverrides[order.id]?.qualityRequest,submittedRole=submitted?.kind==='preprod'?'gypsum':submitted?.kind;
      const reference=fields[role.key].map(field=>detail[field]).find(Boolean)||(submittedRole===role.key?submitted.employeeId:'')||(role.key==='cad'?(detail.cadReview?.employeeId||detail.cadReview?.sentBy):'');
      const employee=(state.employees||[]).find(item=>[item.id,item.originalName,item.name].includes(reference));
      if(!employee||legacy&&payrollRole(employee)!==role.key)continue;
      const rank=legacy?null:employeeRank(employee);
      let lines;
      if(legacy){
        const units=Math.max(1,Number(order.quantity)||(Array.isArray(order.teeth)?order.teeth.length:1));
        lines=[{work:order.work||'',service:order.material||order.work||'Работа',units,rate:role.fallback,amount:roundMoney(role.fallback*units),legacy:true}];
      }else{
        const variants=Array.isArray(order.variants)&&order.variants.length?order.variants:[{work:order.work,workOption:order.material,selectedTeeth:order.teeth||[],units:order.quantity}];
        lines=variants.map(variant=>{
          const work=String(variant.work||order.work||''),service=String(variant.workOption||variant.material||work),key=variant.serviceId?'service:'+variant.serviceId:payrollServiceKey(work,service),units=priceUnitsForSelection(variant.workId||work,variant.selectedTeeth||variant.teeth||[],variant.units,variant.pricingUnit),rate=payrollRate(state.payrollSettings,role.key,rank,key);
          return {key,work,service,units,rate,amount:roundMoney(rate*units)};
        });
      }
      result.push({id:'salary-'+order.id+'-'+role.key,orderId:order.id,employeeId:employee.id,employeeName:employee.name,role:role.key,rank,at:legacy?([at,order.createdAt,now].find(value=>value&&Number.isFinite(Date.parse(value)))||now):now,clinic:order.clinic||'',lines,amount:roundMoney(lines.reduce((sum,item)=>sum+item.amount,0)),legacy,settingsRevision:state.payrollSettings?.revision||0});
      existing.add(id);
    }
  }
  return result;
}
export function initializePayrollState(state){
  if(state.payrollVersion===1)return state;
  const next={...state,payrollSettings:state.payrollSettings||{revision:0,rates:{}},salaryAccruals:state.salaryAccruals||[],payrollVersion:1};
  next.salaryAccruals=[...next.salaryAccruals,...collectPayrollAccruals(next,{legacy:true})];
  return next;
}
