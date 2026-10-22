import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollRole,employeeRank,payrollServiceKey,payrollRate,validPayrollSettings,collectPayrollAccruals,initializePayrollState} from './payroll.js';
const at='2026-10-22T10:00:00Z',key=payrollServiceKey('Реставрации','Коронка');
const employee={id:'staff-1',name:'Техник',originalName:'Техник',specialty:'Каркасист',rank:3,status:'active'};
const order={id:'CD-PAY',clinic:'Клиника',quantity:2,createdAt:at,variants:[{work:'Реставрации',workOption:'Коронка',selectedTeeth:[16,17]}]};
const state=()=>({employees:[{...employee}],orders:[structuredClone(order)],orderOverrides:{'CD-PAY':{frameTechnician:'Техник',frameTechnicianStatus:'Работа сдана',qualityApprovedAt:at}},salaryAccruals:[],payrollSettings:{revision:1,rates:{cam:{[key]:[100,200,325.5,400,500]}}}});
test('specialties and ranks map to four separate compensation roles',()=>{
 for(const [specialty,role] of [['CAD/CAM оператор','cad'],['CAD оператор','cad'],['CAM оператор','cam'],['Красильщик','esthetic'],['Эстетист','esthetic'],['Препрод техник','gypsum'],['Гипсовщик','gypsum']])assert.equal(payrollRole({specialty}),role);
 assert.equal(employeeRank({}),1);assert.equal(employeeRank({rank:5}),5);assert.equal(employeeRank({rank:6}),1);
});
test('custom rates are per role, service and rank; explicit zero is preserved',()=>{
 const settings=state().payrollSettings;
 assert.equal(payrollRate(settings,'cam',3,key),325.5);assert.equal(payrollRate(settings,'cad',3,key),900);
 settings.rates.cam[key][2]=0;assert.equal(payrollRate(settings,'cam',3,key),0);
 settings.rates.cam[key][2]=null;assert.equal(payrollRate(settings,'cam',3,key),450);
 for(const value of [-1,NaN,Infinity,'300',1.001]){settings.rates.cam[key][2]=value;assert.equal(validPayrollSettings(settings),false)}
 settings.rates.cam[key][2]=123.45;assert.equal(validPayrollSettings(settings),true);
});
test('each service is calculated independently, jaws count as jaws and sockets as units',()=>{
 const s=state();s.orders[0].variants.push({work:'Каппы',workOption:'Каппа',selectedTeeth:[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28]},{work:'Хирургические шаблоны',workOption:'Дополнительное гнездо',selectedTeeth:[11],units:4});
 const [row]=collectPayrollAccruals(s,{now:at});
 assert.deepEqual(row.lines.map(line=>line.units),[2,1,4]);assert.equal(row.lines[0].amount,651);assert.equal(row.amount,2901);assert.equal(row.rank,3);
});
test('ledger preserves rank and rate; rework and reassignment do not duplicate the same stage',()=>{
 const s=state(),[row]=collectPayrollAccruals(s,{now:at});s.salaryAccruals=[row];
 s.employees[0].rank=5;s.payrollSettings.rates.cam[key][2]=9999;
 assert.equal(s.salaryAccruals[0].rank,3);assert.equal(s.salaryAccruals[0].amount,651);
 assert.deepEqual(collectPayrollAccruals(s,{now:at}),[]);
 s.employees.push({...employee,id:'staff-2',originalName:'Другой'});s.orderOverrides['CD-PAY'].frameTechnician='Другой';
 assert.deepEqual(collectPayrollAccruals(s,{now:at}),[]);
});
test('submission and worker payloads cannot create payroll; CAD waits for doctor approval',()=>{
 const s=state();assert.deepEqual(collectPayrollAccruals(s,{actorRole:'worker'}),[]);
 s.employees[0].specialty='CAD оператор';s.orderOverrides['CD-PAY']={cadOperator:'Техник',cadReview:{status:'pending',reviewedAt:at}};
 assert.deepEqual(collectPayrollAccruals(s,{actorRole:'clinic'}),[]);
 s.orderOverrides['CD-PAY'].cadReview.status='approved';
 assert.equal(collectPayrollAccruals(s,{actorRole:'clinic',now:at})[0].amount,1800);
 assert.deepEqual(collectPayrollAccruals(s,{actorRole:'technician'}),[]);
});
test('legacy migration preserves old money exactly and runs once',()=>{
 const s=state();s.orders[0].quantity=5;
 const migrated=initializePayrollState(s);
 assert.equal(migrated.salaryAccruals[0].amount,2250);assert.equal(migrated.salaryAccruals[0].legacy,true);assert.equal(migrated.salaryAccruals[0].rank,null);
 assert.equal(initializePayrollState(migrated),migrated);
});
