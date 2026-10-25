import {samePortalValue} from './collection-concurrency.js';
import {camCanAccept,camCanSubmitQuality} from './cam-workflow.js';
export const completedOrderStages=new Set(['Работа принята','В доставке','Принято доктором','Готово к выдаче','Отменён','Отменен','Удалён']);
export function employeeFlowRole(employee){
 const text=String(employee?.specialty||'');
 if(/cad\s*\/?\s*cam|cadcam|cad\s*оператор|моделировщик/i.test(text))return 'cad';
 if(/гипсов|препрод|pre\s*prod|предпрод/i.test(text))return 'preprod';
 if(/красильщик|керамист|эстетист/i.test(text))return 'esthetic';
 if(/техник\s+первой\s+категории/i.test(text))return 'category1';
 return 'cam';
}
const assignments={cad:['cadOperator','assignee'],preprod:['preprodTechnician'],cam:['frameTechnician','technician'],esthetic:['painter','ceramicist'],category1:['category1Technician']};
const statuses={cad:'cadOperatorStatus',preprod:'preprodTechnicianStatus',cam:'frameTechnicianStatus',esthetic:'painterStatus',category1:'category1TechnicianStatus'};
export function workerTransitionAllowed(old,next,employee){
 if(!old||!next||!employee)return false;
 const role=employeeFlowRole(employee),name=employee.originalName;
 if(!assignments[role].some(field=>old[field]===name))return false;
 const field=statuses[role];
 const allowed=new Set(['stage',field,'technicianStatus','workerAcceptances']);
 if(role==='category1')allowed.add('category1TechnicianStatus');
 if(role==='esthetic')allowed.add('ceramicistStatus');
 const starting=role==='cad'?old.stage==='Подготовка':role==='preprod'?old.stage==='Подготовка':role==='category1'?old.stage==='Техник первой категории':old.stage==='Изготовление'&&old.manufacturingStatus===(role==='cam'?'В работе у Каркасиста':'В работе у Красильщика');
 const resuming=old.stage==='На доработке'&&old.reworkKind===role&&!old.reworkNeedsAssignment;
 const target=role==='cad'?'Моделирование':role==='preprod'?'Препрод':role==='category1'?'Техник первой категории':'Изготовление';
 const status=old[field]||(role==='esthetic'?old.ceramicistStatus:'')||'';
 const legacyAccepted=old.stage===target&&['Принял работу','Принял в работу'].includes(status);
 const accept=(starting||resuming||legacyAccepted)&&next.stage===target&&next[field]==='В работе'&&!['В работе','ОТК','Работа сдана'].includes(status)&&(role!=='cam'||camCanAccept(old));
 if(resuming){allowed.add('manufacturingStatus');const targetManufacturing=role==='cam'?'В работе у Каркасиста':role==='esthetic'?'В работе у Красильщика':'';if(role!=='category1'&&next.manufacturingStatus!==targetManufacturing)return false;}
 const working=old.stage===target&&status==='В работе';
 const submit=role!=='cad'&&working&&next.stage==='Контроль качества'&&next[field]==='ОТК'&&next.qualityRequest?.kind===role&&next.qualityRequest?.employeeId===employee.id&&(role!=='cam'||camCanSubmitQuality(old));
 if(submit)allowed.add('qualityRequest');
 // A submitted stage can only be reopened by the chief technician.
 const rollback=['cad','preprod'].includes(role)&&old.stage===target&&next.stage==='Подготовка'&&!old.qualityRequest;
 if(rollback)allowed.add('reworkReason');
 if(!accept&&!submit&&!rollback)return false;
 const keys=new Set([...Object.keys(old),...Object.keys(next)]);
 if([...keys].some(key=>!allowed.has(key)&&!samePortalValue(old[key],next[key])))return false;
 if(submit&&Object.keys(next.qualityRequest).some(key=>!['kind','employeeId','requestedBy','requestedByName','requestedAt','next'].includes(key)))return false;
 return true;
}
export function qualityReturnChange(order,category,reason,at){
 const request=order?.qualityRequest;
 if(order?.stage!=='Контроль качества'||!request?.kind||!category||!reason?.trim())return null;
 const detail=`${category}: ${reason.trim()}`,kind=request.kind==='final'?(order.category1Technician?'category1':'esthetic'):request.kind;
 const shared={qualityRequest:null,reworkKind:kind,reworkReason:detail,reworkAt:at,reworkNeedsAssignment:false,qualityDecision:{kind:request.kind,result:'rejected',reasonCategory:category,reason:reason.trim(),at,requestedAt:request.requestedAt||''}};
 if(kind==='cad')return {...shared,stage:'Моделирование',cadOperatorStatus:'В работе',cadReview:{...(order.cadReview||{}),status:'returned',comment:detail,reviewedAt:at}};
 const role=kind==='preprod'?'preprod':kind;
 const acceptanceRole=kind==='cam'?'frame':kind==='esthetic'?'painter':kind;
 return {...shared,stage:kind==='category1'?'Техник первой категории':'На доработке',manufacturingStatus:kind==='cam'?'В работе у Каркасиста':kind==='esthetic'?'В работе у Красильщика':'',[statuses[role]]:'',...(kind==='esthetic'?{ceramicistStatus:''}:{}),technicianStatus:'',workerAcceptances:Object.fromEntries(Object.entries(order.workerAcceptances||{}).filter(([,item])=>item?.role!==acceptanceRole))};
}
export function releaseEmployeeAssignments(overrides,employees){
 const unavailable=new Set(employees.filter(item=>item.status!=='active'||item.deleted).map(item=>item.originalName).filter(Boolean));
 let changed=false;const result=Object.fromEntries(Object.entries(overrides).map(([id,detail])=>{
  if(completedOrderStages.has(detail.stage))return [id,detail];
  const next={...detail};let removed=false;
  for(const [role,fields] of Object.entries(assignments)){
   const affected=fields.some(field=>unavailable.has(next[field]));
   if(!affected)continue;
   const current=fields.map(field=>next[field]).find(Boolean);
   for(const field of fields)if(unavailable.has(next[field])){next[field]='';removed=true;}
   if(unavailable.has(current)){next[statuses[role]]='';if(role==='esthetic')next.ceramicistStatus='';}
  }
  if(removed){changed=true;next.technicianStatus='';next.workerAcceptances=Object.fromEntries(Object.entries(next.workerAcceptances||{}).filter(([employeeId])=>!employees.some(e=>e.id===employeeId&&unavailable.has(e.originalName))));}
  return [id,removed?next:detail];
 }));
 return changed?result:overrides;
}

// Repair only the signatures produced by the old return workflow, once.
export function repairLegacyFlowState(state){
 if(state.flowIntegrityVersion===1)return state;
 let overrides={...state.orderOverrides};
 for(const [id,old] of Object.entries(overrides)){
  let next=old;
  if(old.stage==='На доработке'&&!old.reworkKind)next={...old,reworkKind:'pending',reworkNeedsAssignment:true};
  const decision=old.qualityDecision,kind=decision?.kind==='final'?'esthetic':decision?.kind;
  const stuckCam=kind==='cam'&&old.stage==='Изготовление'&&!old.manufacturingStatus&&old.frameTechnicianStatus==='ОТК';
  if(decision?.result==='rejected'&&!old.qualityRequest&&['cam','esthetic','preprod'].includes(kind)&&(stuckCam||old.stage==='На доработке')){
   next={...old,stage:'На доработке',reworkKind:kind,reworkNeedsAssignment:false,manufacturingStatus:kind==='cam'?'В работе у Каркасиста':kind==='esthetic'?'В работе у Красильщика':'',[statuses[kind]]:'',...(kind==='esthetic'?{ceramicistStatus:''}:{}),technicianStatus:''};
  }
  if(next!==old)overrides[id]={...next,_revision:(old._revision||0)+1};
 }
 overrides=releaseEmployeeAssignments(overrides,state.employees||[]);
 overrides=Object.fromEntries(Object.entries(overrides).map(([id,item])=>[id,JSON.stringify(item)!==JSON.stringify(state.orderOverrides[id])?{...item,_revision:(state.orderOverrides[id]?._revision||0)+1}:item]));
 return {...state,orderOverrides:overrides,collectionVersions:{...state.collectionVersions,orderOverrides:(state.collectionVersions?.orderOverrides||0)+1},flowIntegrityVersion:1};
}

export function cadDecisionChange(order,approved,review){
 const shared={stage:approved?'Изготовление':'Моделирование',cadOperatorStatus:approved?'Передал дальше':'В работе',cadReview:review};
 if(!approved)return shared;
 return {...shared,manufacturingStatus:'В работе у Каркасиста',frameTechnicianStatus:'',painterStatus:'',ceramicistStatus:'',technicianStatus:'',workerAcceptances:Object.fromEntries(Object.entries(order.workerAcceptances||{}).filter(([,item])=>item?.role==='cad'||item?.role==='preprod')),...(['cad','preprod'].includes(order.reworkKind)?{milling:{}}:{})};
}
export function reworkRouteChange(order,kind){
 if(!['На доработке','Техник первой категории'].includes(order.stage)||!['cad','preprod','cam','esthetic','category1'].includes(kind))return null;
 const roles=kind==='preprod'?['preprod','cad','cam','category1','esthetic']:kind==='cad'?['cad','cam','category1','esthetic']:kind==='cam'?['cam','category1','esthetic']:kind==='category1'?['category1']:['esthetic'];
 const change={stage:['cad','preprod'].includes(kind)?'Подготовка':kind==='category1'?'Техник первой категории':'Изготовление',reworkKind:kind,reworkNeedsAssignment:false,manufacturingStatus:kind==='cam'?'В работе у Каркасиста':kind==='esthetic'?'В работе у Красильщика':'',technicianStatus:'',qualityRequest:null,workerAcceptances:Object.fromEntries(Object.entries(order.workerAcceptances||{}).filter(([,item])=>!roles.includes(({frame:'cam',painter:'esthetic'})[item?.role]||item?.role)))};
 for(const role of roles)change[statuses[role]]='';
 if(roles.includes('esthetic'))change.ceramicistStatus='';
 if(roles.includes('category1'))change.category1TechnicianStatus='';
 if(roles.includes('cad')&&order.cadReview)change.cadReview={...order.cadReview,status:'returned',comment:order.reworkReason||''};
 return change;
}

export function assignmentChange(before,next){
 const roles=Object.entries(assignments).filter(([,fields])=>{
  const a=fields.map(field=>before[field]).find(Boolean)||'',b=fields.map(field=>next[field]).find(Boolean)||'';
  return a!==b;
 }).map(([role])=>role);
 // The generic assignee is a legacy fallback, not a separate CAD reassignment.
 if(before.cadOperator===next.cadOperator&&before.cadOperator)roles.splice(roles.indexOf('cad')<0?roles.length:roles.indexOf('cad'),1);
 if(!roles.length)return next;
 const checked=before.qualityRequest?.kind==='final'?'esthetic':before.qualityRequest?.kind;
 if(before.stage==='Контроль качества'&&roles.includes(checked)||before.stage==='Согласование CAD'&&roles.includes('cad'))throw new Error('assignment_under_review');
 const result={...next};
 for(const role of roles){
  result[statuses[role]]='';if(role==='esthetic')result.ceramicistStatus='';
  const acceptanceRole={cam:'frame',esthetic:'painter'}[role]||role;
  result.workerAcceptances=Object.fromEntries(Object.entries(result.workerAcceptances||{}).filter(([,item])=>item?.role!==acceptanceRole));
  if((role==='cad'&&before.stage==='Моделирование')||(role==='preprod'&&before.stage==='Препрод'))result.stage='Подготовка';
 }
 result.technicianStatus='';return result;
}
