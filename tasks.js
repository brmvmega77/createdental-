export const taskStatuses=[
  {key:'backlog',label:'Бэклог'},
  {key:'in_progress',label:'В процессе'},
  {key:'review',label:'На проверке'},
  {key:'done',label:'Сделано'}
];
export const taskPriorities=[
  {key:'low',label:'Низкий'},
  {key:'normal',label:'Обычный'},
  {key:'high',label:'Высокий'},
  {key:'urgent',label:'Срочный'}
];
export const taskStatusLabel=status=>taskStatuses.find(item=>item.key===status)?.label||'Бэклог';
export const taskPriorityLabel=priority=>taskPriorities.find(item=>item.key===priority)?.label||'Обычный';
export const nextTaskStatus=status=>taskStatuses[Math.min(taskStatuses.length-1,Math.max(0,taskStatuses.findIndex(item=>item.key===status)+1))]?.key||'backlog';
export const previousTaskStatus=status=>taskStatuses[Math.max(0,taskStatuses.findIndex(item=>item.key===status)-1)]?.key||'backlog';
export const taskIsOverdue=(task,now=new Date())=>Boolean(task.dueDate&&task.status!=='done'&&new Date(`${task.dueDate}T23:59:59`).getTime()<now.getTime());
export const taskDateLabel=value=>value?new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}):'Без срока';
