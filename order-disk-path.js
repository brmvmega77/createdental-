import {displayOrderId} from './order-list-utils.js';

export function orderDiskFolderPath(orderId,orders,{fallbackDate=new Date()}={}){
  const order=orders.find(item=>item.id===orderId);
  if(!order)throw new Error('Заказ не найден');
  const parent=order.parentOrderId?orders.find(item=>item.id===order.parentOrderId)||order:order;
  const id=displayOrderId(order.parentOrderId||parent.id);
  if(!/^[A-Za-z0-9_-]+$/.test(id))throw new Error('Неверный ID заказа');
  let created=new Date(parent.createdAt||order.createdAt||fallbackDate);
  if(Number.isNaN(created.getTime()))created=new Date(fallbackDate);
  if(Number.isNaN(created.getTime()))throw new Error('Не удалось определить дату заказа');
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).formatToParts(created);
  return `/clients/${parts.find(p=>p.type==='year').value}/${parts.find(p=>p.type==='month').value}/${id}`;
}
