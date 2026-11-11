// One durable milling handoff per clinic order; child routes resolve to that scope.
export function millingScope(snapshot,id){
 const requested=snapshot.orders.find(order=>order.id===id);
 if(!requested)throw failure(404,'Заказ не найден');
 const parent=requested.parentOrderId?snapshot.orders.find(order=>order.id===requested.parentOrderId):requested;
 if(!parent)throw failure(404,'Главный заказ не найден');
 const children=snapshot.orders.filter(order=>order.parentOrderId===parent.id);
 return {parent,orders:children.length?children:[parent]};
}
const failure=(status,message)=>Object.assign(new Error(message),{status});
const reserved=status=>['sending','sent','uncertain'].includes(status);
export function sharedMillingState(snapshot,parent,orders){
 const receipt=snapshot.orderOverrides[parent.id]?.sharedMilling;
 if(receipt&&reserved(receipt.status))return receipt;
 const legacy=orders.map(order=>snapshot.orderOverrides[order.id]?.milling).find(item=>item?.sentAt);
 return legacy?{...legacy,status:'sent',scopeId:parent.id,legacy:true}:null;
}
export function createMillingHandoff({snapshot,saveOverrides,migrateFiles,getFiles,usesMilling,cadReady,requiresApproval,preparePackage,sendPackage,recordEvent=async()=>{},now=()=>new Date().toISOString(),createId=()=>crypto.randomUUID()}){
 const inFlight=new Set();
 return async function handoff(id,actor){
  const initial=snapshot(),scope=millingScope(initial,id),scopeId=scope.parent.id;
  if(inFlight.has(scopeId))throw failure(409,'Общая отправка этого заказа уже выполняется');
  if(sharedMillingState(initial,scope.parent,scope.orders))throw failure(409,'Этот заказ уже передан на фрезеровку или его отправка требует проверки. Повторная отправка не выполняется.');
  const works=scope.orders.filter(usesMilling);
  if(!works.length)throw failure(409,'В заказе нет работ для фрезеровки');
  const validate=(state)=>{
   for(const work of works){const detail=state.orderOverrides[work.id]||{};
    if(!cadReady(work,detail))throw failure(409,requiresApproval(work)?'Ожидается общее согласование CAD врачом':'Ожидается внутренняя ОТК CAD');
    if(detail.stage!=='Изготовление'||detail.manufacturingStatus!=='В работе у Каркасиста')throw failure(409,'Все работы для фрезеровки должны быть готовы к этапу CAM');
    if(!detail.frameTechnician&&!detail.technician)throw failure(409,'Назначьте CAM-оператора для каждой работы, участвующей во фрезеровке');
   }
  };
  validate(initial);inFlight.add(scopeId);let receipt=null,reservedOperation=false,emailed=false;
  try{
   const ids=[...new Set([scopeId,...scope.orders.map(order=>order.id)])];
   for(const orderId of ids)await migrateFiles(orderId);
   const files=[...new Map(ids.flatMap(getFiles).filter(file=>file.storage==='yandex-disk'&&file.diskPath&&(/\.constructionInfo$/i.test(file.name||'')||/_cad\.stl$/i.test(file.name||''))).map(file=>[file.diskPath,file])).values()];
   if(!files.length)throw failure(409,'В общей папке заказа нет файлов .constructionInfo или _cad.stl');
   const prepared=await preparePackage(scope.parent,files);
   const fresh=snapshot();validate(fresh);
   if(sharedMillingState(fresh,scope.parent,scope.orders))throw failure(409,'Общая отправка заказа уже зарегистрирована');
   receipt={scopeId,requestId:createId(),workIds:works.map(work=>work.id),status:'sending',attemptedAt:now(),folderUrl:prepared.folderUrl,fileNames:prepared.fileNames,sendCount:1,completedAt:''};
   // Reserve before contacting email: a process restart cannot initiate a second send.
   await saveOverrides(current=>{
    if(reserved(current[scopeId]?.sharedMilling?.status))throw failure(409,'Общая отправка заказа уже зарегистрирована');
    return {...current,[scopeId]:{...(current[scopeId]||{}),sharedMilling:receipt}};
   },actor);
   reservedOperation=true;
   await sendPackage(scope.parent,prepared);emailed=true;
   receipt={...receipt,status:'sent',sentAt:now(),lastSentAt:now()};
   await saveOverrides(current=>{
    const next={...current,[scopeId]:{...(current[scopeId]||{}),sharedMilling:receipt}};
    for(const work of works)next[work.id]={...(next[work.id]||{}),milling:{...(next[work.id]?.milling||{}),...receipt}};
    return next;
   },actor);
   await recordEvent(scopeId,actor,'milling_sent',{clinicId:scope.parent.clinicId,summary:'Заказ целиком отправлен на фрезеровку',fileNames:receipt.fileNames}).catch(()=>{});
   return {ok:true,resent:false,scopeId,workIds:receipt.workIds,folderUrl:receipt.folderUrl,files:receipt.fileNames,sentAt:receipt.sentAt,milling:receipt,sharedMilling:receipt};
  }catch(error){
   if(reservedOperation){
    const uncertain={...receipt,status:emailed?'sent':'uncertain',...(emailed?{sentAt:receipt.sentAt||now()}:{}),error:emailed?'Не удалось подтвердить сохранение статуса':'Не удалось подтвердить результат отправки'};
    await saveOverrides(current=>({...current,[scopeId]:{...(current[scopeId]||{}),sharedMilling:uncertain}}),actor).catch(()=>{});
    throw failure(502,emailed?'Письмо отправлено, но статус требует проверки. Повторная отправка заблокирована.':'Результат отправки требует проверки. Повторная отправка заблокирована.');
   }
   throw error;
  }finally{inFlight.delete(scopeId);}
 };
}
