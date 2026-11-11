import test from 'node:test';
import assert from 'node:assert/strict';
import {productionAssignmentAllowed} from './production-routes.js';
import {assignmentChange} from './flow-rules.js';
const roles=['cad','preprod','frame','painter','category1'];
const digital={work:'Реставрации',material:'PMMA коронка CAD/CAM',productionType:'digital'};

test('every specialist is locked throughout every quality check and doctor review',()=>{
 for(const kind of ['cad','preprod','cam','category1','esthetic','final']){
  const before={stage:'Контроль качества',qualityRequest:{kind},cadOperator:'CAD',painter:'Painter'};
  for(const role of roles)assert.equal(productionAssignmentAllowed({...digital,...before},role),false,kind+':'+role);
  assert.throws(()=>assignmentChange(before,{...before,painter:'Other',qualityRequest:null},digital),/assignment_under_review/);
  assert.throws(()=>assignmentChange(before,{...before,cadOperator:'Other'},digital),/assignment_under_review/);
 }
 for(const role of roles)assert.equal(productionAssignmentAllowed({...digital,stage:'Согласование CAD'},role),false);
});
test('aesthetic assignment starts at the aesthetic phase, never at CAD, CAM or completed stages',()=>{
 for(const stage of ['Подготовка','Моделирование','Согласование CAD','Контроль качества','Работа принята','В доставке','Принято доктором'])assert.equal(productionAssignmentAllowed({...digital,stage},'painter'),false,stage);
 assert.equal(productionAssignmentAllowed({...digital,stage:'Изготовление',manufacturingStatus:'В работе у Каркасиста'},'painter'),false);
 const before={stage:'Изготовление',manufacturingStatus:'В работе у Красильщика',painter:'Old',painterStatus:'В работе',workerAcceptances:{old:{role:'painter'}}};
 assert.equal(productionAssignmentAllowed({...digital,...before},'painter'),true);
 const next=assignmentChange(before,{...before,painter:'New'},digital);assert.equal(next.painterStatus,'');assert.deepEqual(next.workerAcceptances,{});
 assert.throws(()=>assignmentChange({stage:'Моделирование',cadOperator:'CAD'},{stage:'Изготовление',manufacturingStatus:'В работе у Красильщика',cadOperator:'CAD',painter:'New'},digital),/assignment_stage_unavailable/);
});
test('CAD, preproduction and CAM retain their own assignment windows',()=>{
 assert.equal(productionAssignmentAllowed({...digital,stage:'Подготовка'},'cad'),true);
 assert.equal(productionAssignmentAllowed({...digital,stage:'Моделирование'},'cad'),true);
 const analog={...digital,productionType:'analog',stage:'Подготовка'};
 assert.equal(productionAssignmentAllowed(analog,'preprod'),true);assert.equal(productionAssignmentAllowed(analog,'cad'),false);
 const cam={...digital,stage:'Изготовление',manufacturingStatus:'В работе у Каркасиста'};
 assert.equal(productionAssignmentAllowed(cam,'frame'),false);assert.equal(productionAssignmentAllowed({...cam,milling:{sentAt:'now'}},'frame'),true);
 assert.equal(productionAssignmentAllowed({...cam,manufacturingStatus:'В работе у Красильщика',milling:{sentAt:'now'}},'frame'),false);
});
