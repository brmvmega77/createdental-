import {portalSnapshot,portalEmployee,replacePortalCollection} from './portal-data.js';
import {payrollRoles,payrollRole,employeeRank,payrollCatalog,payrollRate,validPayrollSettings} from './payroll.js';

// This surface never returns another employee's compensation to a worker.
export function payrollView(user,snapshot){
  const employee=portalEmployee(user.subjectId);
  if(user.role==='technician')return {settings:snapshot.payrollSettings||{revision:0,rates:{}},accruals:snapshot.salaryAccruals||[],employees:(snapshot.employees||[]).map(({id,name,specialty,rank,status})=>({id,name,specialty,rank:employeeRank({rank}),status})),catalog:snapshot.workCatalog||[],roles:payrollRoles};
  const role=payrollRole(employee),rank=employeeRank(employee);
  return {employee:{id:employee.id,name:employee.name,rank,role},accruals:(snapshot.salaryAccruals||[]).filter(item=>item.employeeId===employee.id),rates:payrollCatalog(snapshot.workCatalog).map(item=>({...item,rate:payrollRate(snapshot.payrollSettings,role,rank,item.key)}))};
}
export async function handlePayroll(req,res,url,{user,json,readBody}){
  if(!user)return json(res,401,{error:'Войдите в кабинет'});
  if(!['technician','worker'].includes(user.role))return json(res,403,{error:'Доступ запрещён'});
  if(user.role==='worker'&&portalEmployee(user.subjectId)?.status!=='active')return json(res,403,{error:'Доступ сотрудника отключён'});
  if(req.method==='GET'&&url.pathname==='/api/payroll')return json(res,200,payrollView(user,portalSnapshot()));
  if(req.method!=='PUT'||url.pathname!=='/api/payroll/settings')return json(res,405,{error:'Метод не поддерживается'});
  if(user.role!=='technician')return json(res,403,{error:'Ставки меняет главный техник'});
  let body;try{body=await readBody(req,2000000)}catch{return json(res,400,{error:'Неверные настройки зарплат'})}
  if(!validPayrollSettings(body))return json(res,400,{error:'Укажите суммы от 0 до 10 000 000 ₽, не более двух знаков после запятой'});
  try{
    const snapshot=await replacePortalCollection('payrollSettings',body,{role:user.role,name:user.displayName||'Главный техник'});
    return json(res,200,{settings:snapshot.payrollSettings});
  }catch(error){
    if(error.message==='payroll_conflict')return json(res,409,{error:'Ставки уже изменились. Обновите раздел и повторите изменения.'});
    console.error('Payroll save failed:',error.message);
    return json(res,500,{error:'Не удалось сохранить ставки'});
  }
}
