import test from 'node:test';import assert from 'node:assert/strict';
import {mergeOrderVariant,reviseOrderServices,reviseOrderVariants,clientRequestConflict,reconcilePayment} from './order-revision.js';
import {assignmentChange,workerTransitionAllowed} from './flow-rules.js';
import {qualityApprovalChange} from './technician.js';
import {workCatalog,normalizeWorkCatalog,orderDeadlineError,prostheticSelectionError,isProstheticVariant,estimateWork,priceUnitsForSelection,isSiliconeKeySelection,siliconeKeyJaws,siliconeKeySelectionError} from './work-catalog.js';
import {priceNewClinicOrder} from './promo-codes.js';
import {telegramInternals} from './telegram-bot.js';
const variant={work:'Вкладки',workOption:'Вкладка культевая',selectedTeeth:[11],toothMode:'Одиночка',unitPrice:3500};
test('silicone keys are priced and validated by jaw, with at most one key per jaw',()=>{
 const category=workCatalog.find(item=>item.name==='Дополнительные работы'),original=structuredClone(category.options);
 const upper=[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],lower=[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
 try{
  category.options.push({id:'fixture-key',name:'Силиконовый ключ',price:1500},{id:'fixture-clear-key',name:'Прозрачный силиконовый ключ',price:2700},{id:'fixture-renamed-key',name:'Обновлённый ключ',aliases:['Прозрачный силиконовый ключ'],price:2700});
  for(const option of category.options.filter(item=>item.id?.startsWith('fixture-'))){
   assert.equal(isSiliconeKeySelection(category.id,option.id),true);
   for(const selectedTeeth of [upper,lower,[...upper,...lower]]){
    const v={work:category.name,workOption:option.name,selectedTeeth,units:99},quantity=selectedTeeth.length/16;
    assert.equal(priceUnitsForSelection(category.id,selectedTeeth,99,'tooth',option.id),quantity);
    assert.equal(estimateWork({work:v.work,option:v.workOption,teeth:selectedTeeth,units:99}).amount,option.price*quantity);
    assert.equal(priceNewClinicOrder({variants:[v]},{}).servicesTotal,option.price*quantity);
    const edited=reviseOrderVariants({variants:[]},[v]);
    assert.equal(edited.quantity,quantity);assert.equal(edited.servicesTotal,option.price*quantity);assert.deepEqual(edited.teeth,[...selectedTeeth].sort((a,b)=>a-b));
    assert.equal(edited.variants[0].units,quantity);assert.equal(edited.variants[0].pricingUnit,'jaw');assert.equal(edited.variants[0].toothMode,'Челюсть');
   }
  }
  const key=(option,selectedTeeth)=>({work:category.name,workOption:option,selectedTeeth});
  const upperKey=key('Силиконовый ключ',upper),lowerKey=key('Прозрачный силиконовый ключ',lower);
  assert.equal(siliconeKeySelectionError([upperKey,lowerKey]),'');
  assert.match(siliconeKeySelectionError([upperKey,key('Прозрачный силиконовый ключ',upper)]),/верхнюю челюсть уже/);
  assert.throws(()=>reviseOrderVariants({variants:[]},[upperKey,key('Силиконовый ключ',upper)]),/верхнюю челюсть уже/);
  assert.match(siliconeKeySelectionError([lowerKey,key('Силиконовый ключ',lower)]),/нижнюю челюсть уже/);
  for(const teeth of [[],[21,22,23,24],[...upper,31],[99]])assert.match(siliconeKeySelectionError([key('Силиконовый ключ',teeth)]),/челюсть целиком/);
  const partial=key('Силиконовый ключ',[21,22,23,24]);
  assert.deepEqual(siliconeKeyJaws(partial),['upper']);assert.deepEqual(siliconeKeyJaws(partial,{completeOnly:true}),[]);
  assert.equal(priceUnitsForSelection(category.name,partial.selectedTeeth,99,'tooth',partial.workOption),1);
  assert.equal(siliconeKeySelectionError([partial],{requireComplete:false}),'');
  assert.throws(()=>reviseOrderVariants({variants:[]},[partial]),/челюсть целиком/);
  const legacy={variants:[{...partial,unitPrice:1500}],quantity:4,servicesTotal:6000,deliveryFee:0,sum:'6 000 ₽'};
  const unchanged=reviseOrderVariants(legacy,legacy.variants);assert.equal(unchanged.sum,legacy.sum);assert.equal(unchanged.quantity,4);
  assert.equal(reviseOrderVariants(legacy,[{...legacy.variants[0],selectedTeeth:upper}]).servicesTotal,1500);
  assert.equal(estimateWork({work:'Реставрации',option:'PMMA коронка CAD/CAM',teeth:[21,22,23,24]}).units,4);
 }finally{category.options.splice(0,category.options.length,...original)}
});
test('each tooth has one prosthetic component while its restoration remains independent',()=>{
 const options=workCatalog.find(item=>item.name==='Протетика').options;
 const component=(index,teeth)=>({work:'Протетика',workOption:options[index].name,selectedTeeth:teeth});
 const crown={work:'Реставрации',workOption:'PMMA коронка CAD/CAM',selectedTeeth:[25,26]};
 assert.equal(isProstheticVariant({work:'Неизвестная услуга'}),false);
 assert.equal(prostheticSelectionError([crown,component(0,[26]),component(1,[25])]),'');
 for(let index=0;index<options.length;index++){
  assert.match(prostheticSelectionError([component(0,[26]),component(index,[25,26])]),/зуба 26/);
 }
 assert.equal(prostheticSelectionError([component(2,[])],{requireTeeth:true}),'Выберите зубы для каждой комплектующей.');
 assert.equal(prostheticSelectionError([component(2,[])]),''); // Historical unnumbered bases stay readable.
 const byId={workId:workCatalog.find(item=>item.name==='Протетика').id,serviceId:options[1].id,selectedTeeth:[26]};
 assert.match(prostheticSelectionError([component(0,[26]),byId]),/зуба 26/);
 const order={variants:[crown,component(0,[26]),component(1,[25])]};
 const incoming=structuredClone(order.variants);incoming[2].selectedTeeth=[26];
 assert.throws(()=>reviseOrderVariants(order,incoming),/зуба 26/);
 incoming[2].selectedTeeth=[24,25];
 assert.deepEqual(reviseOrderVariants(order,incoming).variants[2].selectedTeeth,[24,25]);
});
test('non-service edits preserve total, delivery, agreed unit prices and legacy snapshots',()=>{
 const order={work:variant.work,material:variant.workOption,variants:[variant],servicesTotal:3500,deliveryFee:500,sum:'4 000 ₽'};
 const result=reviseOrderVariants(order,[{...variant,unitPrice:4000}]);assert.equal(result.sum,order.sum);assert.equal(result.deliveryFee,500);assert.equal(result.variants[0].unitPrice,3500);
 const legacy={work:variant.work,material:variant.workOption,teeth:[11],sum:'3 500 ₽',deliveryFee:0};const revised=reviseOrderServices(legacy,{teeth:[11,21]});assert.equal(revised.variants[0].unitPrice,3500);assert.equal(revised.servicesTotal,7000);
});
test('tooth and bridge edits keep agreed prices even after a promotion is removed',()=>{
 const order={variants:[variant],servicesTotal:3500,deliveryFee:500,sum:'4 000 ₽'};
 const revised=reviseOrderServices(order,{teeth:[11,21]});assert.equal(revised.variants[0].unitPrice,3500);assert.equal(revised.servicesTotal,7000);assert.equal(revised.quantity,2);
 const changed=reviseOrderServices(order,{work:'Вкладки',material:'Вкладка культевая ZrO2/Дисиликат лития'});assert.equal(changed.variants[0].unitPrice,7000);
});
test('merging a chief edit retains service identity and price until its service actually changes',()=>{
 const original={...variant,workId:'category',serviceId:'service',pricingUnit:'tooth'};
 const same=mergeOrderVariant(original,{...variant,selectedTeeth:[11,21]});assert.equal(same.unitPrice,3500);assert.equal(same.serviceId,'service');
 const changed=mergeOrderVariant(original,{...original,workOption:'Вкладка культевая ZrO2/Дисиликат лития'});assert.equal(changed.unitPrice,undefined);assert.equal(changed.serviceId,undefined);
});
test('multi-service bridges contain only teeth belonging to their own position',()=>{
 const order={variants:[{...variant,selectedTeeth:[11,12]},{...variant,selectedTeeth:[21]}]};
 const revised=reviseOrderServices(order,{toothMode:'Мост',bridgeRanges:[[11,12,21]]},{variantIndex:0});assert.deepEqual(revised.variants[0].bridgeRanges,[[11,12]]);assert.deepEqual(revised.variants[1].selectedTeeth,[21]);
 assert.throws(()=>reviseOrderServices(order,{toothMode:'Мост'},{variantIndex:1}),/двух зубов/);
 assert.throws(()=>reviseOrderServices(order,{teeth:[11]}),error=>error.code==='variant_required');
});
test('old Telegram requests cannot overwrite newer data; legacy touched fields must still match',()=>{
 assert.equal(clientRequestConflict({baseOrderRevision:2},{_revision:3}),true);
 assert.equal(clientRequestConflict({before:{patient:'Старое Имя'}},{patient:'Новое Имя'}),true);
 assert.equal(clientRequestConflict({before:{patient:'Старое Имя'}},{patient:'Старое Имя'}),false);
 assert.equal(clientRequestConflict({before:{}},{}),true);
});
test('reassigned employees must accept their own work before submitting quality',()=>{
 const old={stage:'Изготовление',manufacturingStatus:'В работе у Красильщика',painter:'old',ceramicist:'old',painterStatus:'В работе',ceramicistStatus:'В работе',workerAcceptances:{old:{role:'painter'}}};
 const next=assignmentChange(old,{...old,painter:'new',ceramicist:'new'});assert.equal(next.painterStatus,'');assert.deepEqual(next.workerAcceptances,{});
 const employee={id:'new-id',originalName:'new',specialty:'Эстетист'};
 assert.equal(workerTransitionAllowed(next,{...next,stage:'Контроль качества',painterStatus:'ОТК',ceramicistStatus:'ОТК',qualityRequest:{kind:'esthetic',employeeId:employee.id}},employee),false);
 assert.equal(workerTransitionAllowed(next,{...next,painterStatus:'В работе',ceramicistStatus:'В работе'},employee),true);
 for(const [role,field,stage] of [['cad','cadOperator','Моделирование'],['preprod','preprodTechnician','Препрод']]){const before={stage,[field]:'old'};assert.equal(assignmentChange(before,{...before,[field]:'new'}).stage,'Подготовка',role);}
});
test('reassignment cannot erase a pending quality review and an untyped review cannot pass as final',()=>{
 const order={stage:'Контроль качества',frameTechnician:'old',qualityRequest:{kind:'cam'},frameTechnicianStatus:'ОТК'};
 assert.throws(()=>assignmentChange(order,{...order,frameTechnician:'new',qualityRequest:null}),/assignment_under_review/);
 assert.equal(qualityApprovalChange({...order,qualityRequest:null},'',new Date().toISOString()),null);
});
test('deadline edits reject weekends, impossible dates, past dates and insufficient production time',()=>{
 const order={variants:[variant],createdAt:'2026-10-22T12:00:00Z'};
 for(const date of ['24.10.2026','31.02.2027','23.10.2026'])assert.ok(orderDeadlineError(order,date));
 assert.ok(orderDeadlineError(order,'01.10.2026',{notBefore:new Date('2026-10-23T12:00:00Z')}));
 assert.equal(orderDeadlineError(order,'30.11.2026'),'');
});
test('renamed jaw categories keep the Telegram jaw picker instead of ordinary tooth mode',()=>{
 const previous=structuredClone(workCatalog),renamed=structuredClone(workCatalog);renamed.find(c=>c.name==='Каппы').name='Шины и каппы';
 try{workCatalog.splice(0,workCatalog.length,...normalizeWorkCatalog(renamed,previous));assert.equal(telegramInternals.isJawSplitSelection('Шины и каппы','Каппа для отбеливания'),true);
 const analysis=telegramInternals.normalizeAnalysis({intent:'create_order',fields:{patient:'Тестовый Пациент',work:'Шины и каппы',material:'Каппа для отбеливания',dueDate:'2026-11-30',shade:'A2'}});
 assert.ok(telegramInternals.missingCreateFields(analysis).includes('челюсть для шаблона'));assert.ok(telegramInternals.createOrderChoiceMarkup(analysis).inline_keyboard.flat().some(b=>b.callback_data==='tgnew:jaw:upper'));
 }finally{workCatalog.splice(0,workCatalog.length,...previous);}
});

test('editing another field preserves separate bridges; replacing a socket service drops old explicit units',()=>{
 const original={...variant,toothMode:'Мост',selectedTeeth:[11,12,21,22],bridgeRanges:[[11,12],[21,22]]};
 const merged=mergeOrderVariant(original,{...original,bridgeRanges:[[11,12,21,22]]});assert.deepEqual(merged.bridgeRanges,original.bridgeRanges);
 const replacement=mergeOrderVariant({work:'Хирургические шаблоны',workOption:'Дополнительное гнездо под имплантант в хирургическом шаблоне',units:4},{work:variant.work,workOption:variant.workOption,selectedTeeth:[11]});assert.equal(replacement.units,undefined);
});
test('payment state is reconciled when an agreed order total changes',()=>{
 const previous={sum:'2 500 ₽',paidAmount:2500,paidAt:'2026-10-22T12:00:00Z',paymentStatus:'Оплачено'};
 const increased=reconcilePayment(previous,{...previous,sum:'4 000 ₽'});assert.equal(increased.paidAmount,2500);assert.equal(increased.paidAt,'');assert.equal(increased.paymentStatus,'Частично оплачено');
 const reduced=reconcilePayment(previous,{...previous,sum:'2 000 ₽'});assert.equal(reduced.paidAmount,2000);assert.equal(reduced.paymentStatus,'Оплачено');
});
