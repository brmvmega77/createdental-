import {employeeRank,payrollRole,payrollRoles} from './payroll.js';

const money=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value)+' ₽';
const month=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).format(new Date(value));
const date=value=>new Date(value).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'});
const short=(value,size)=>Array.from(String(value||'').replace(/\s+/g,' ')).slice(0,size).join('');
const total=items=>items.reduce((sum,item)=>sum+Math.round(Number(item.amount)*100),0)/100;

export function employeePayrollProfile(employee){
  const role=payrollRoles.find(item=>item.key===payrollRole(employee));
  return [short(employee.name,150),role.label,`Ранг: ${employeeRank(employee)} из 5`].join('\n');
}

export function employeePayrollText(employee,snapshot,{now=new Date()}={}){
  const items=(snapshot.salaryAccruals||[]).filter(item=>item.employeeId===employee.id&&Number.isFinite(Date.parse(item.at))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const current=items.filter(item=>month(item.at)===month(now));
  const lines=['💰 Зарплата',employeePayrollProfile(employee),'',`Начислено за текущий месяц: ${money(total(current))}`,`Всего начислено: ${money(total(items))}`,'Ставки зависят от услуги и ранга на момент приёмки.'];
  if(!items.length)lines.push('','Начислений пока нет.');
  else{
    lines.push('','Последние начисления:');
    for(const item of items.slice(0,10)){
      const block=[`${date(item.at)} · ${short(item.orderId,80)} · ${money(item.amount)}`,item.legacy?'Прежняя ставка':`Ранг при начислении: ${item.rank}`,...(item.lines||[]).slice(0,3).map(line=>`${short(line.service,90)} · ${line.units} ед. × ${money(line.rate)} = ${money(line.amount)}`)];
      if((item.lines||[]).length>3)block.push('Остальные услуги — в кабинете на сайте.');
      if(lines.join('\n').length+block.join('\n').length>3400)break;
      lines.push('',...block);
    }
  }
  lines.push('','Полная детализация и текущие ставки — в разделе «Зарплата» вашего кабинета.','CAD начисляется после согласования врачом, остальные работы — после приёмки главным техником.');
  return lines.join('\n');
}
