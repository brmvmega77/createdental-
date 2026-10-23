import {completedOrderStages} from './flow-rules.js';
const finishedStages = new Set(['Работа принята', 'В доставке', 'Принято доктором', 'Готово к выдаче']);
const paymentStages = new Set(['В доставке', 'Принято доктором', 'Готово к выдаче']);
const initialStages = new Set(['Черновик из Telegram', 'Ожидает распределения', 'Ожидает подтверждения']);
const dayMs = 86400000;
const roundPercent = (part, total) => total > 0 ? Math.round(part / total * 100) : null;
const amountOf = value => Number(String(value || '').replace(/[^0-9]/g, '')) || 0;
const validTime = value => { const time = Date.parse(value || ''); return Number.isFinite(time) ? time : null; };

function dueDay(value) {
  const raw = String(value || '');
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw) || /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const [year,month,day] = raw.includes('-') ? match.slice(1).map(Number) : [Number(match[3]),Number(match[2]),Number(match[1])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date.getTime() : null;
}

function specialistKey(order) {
  if (order.stage === 'Моделирование') return order.cadOperatorKey || '';
  if (order.stage === 'Препрод') return order.preprodTechnicianKey || '';
  if (order.stage === 'Изготовление') return order.manufacturingStatus === 'В работе у Красильщика'
    ? order.painterKey || '' : order.frameTechnicianKey || '';
  if (order.stage === 'На доработке') return order.reworkKind === 'preprod' ? order.preprodTechnicianKey || ''
    : order.reworkKind === 'cam' ? order.frameTechnicianKey || '' : order.painterKey || '';
  return null;
}

function stageSince(order, events) {
  if (order.stage === 'Контроль качества') return validTime(order.qualityRequest?.requestedAt);
  if (order.stage === 'Изготовление' && order.manufacturingStatus === 'В работе у Каркасиста') {
    const completed = validTime(order.milling?.completedAt);
    if (completed) return completed;
    const sent = validTime(order.milling?.sentAt);
    if (sent) return sent;
  }
  const relevant = events.filter(event => event.orderId === order.id &&
    (event.action === 'stage_changed' && event.to === order.stage ||
      order.stage === 'Изготовление' && event.action === 'manufacturing_status_changed' && event.to === order.manufacturingStatus));
  const last = relevant.reduce((latest,event) => Math.max(latest, validTime(event.at) || 0), 0);
  return last || (initialStages.has(order.stage) ? validTime(order.createdAt) : null);
}

export function calculateCompanyPulse(orders, team, now = new Date(), history = [], clientRequests = []) {
  const current = now instanceof Date ? now : new Date(now);
  const currentTime = current.getTime(), today = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const active = orders.filter(order => !completedOrderStages.has(order.stage));
  const deadlines = {score:null, total:0, onTrack:0, soon:0, overdue:0, noDate:0, risks:[]};
  let deadlinePoints = 0;
  for (const order of active) {
    const due = dueDay(order.date);
    if (due === null) { deadlines.noDate++; continue; }
    deadlines.total++;
    const days = Math.round((due - today) / dayMs);
    if (days < 0) { deadlines.overdue++; deadlines.risks.push({order, days}); }
    else if (days <= 2) { deadlines.soon++; deadlinePoints += .5; deadlines.risks.push({order, days}); }
    else { deadlines.onTrack++; deadlinePoints++; }
  }
  deadlines.score = roundPercent(deadlinePoints, deadlines.total);
  deadlines.risks.sort((a,b) => a.days - b.days);

  const available = new Map(team.filter(employee => employee.status === 'active').map(employee => [employee.originalName || employee.name, employee]));
  const staffing = {score:null, total:0, assigned:0, unassigned:[], loads:[], overloaded:[], limitsMissing:0};
  const loadCounts = new Map(), loadOrders = new Map();
  for (const order of active) {
    const key = specialistKey(order);
    if (key === null) continue;
    staffing.total++;
    if (key && available.has(key)) {
      staffing.assigned++;
      loadCounts.set(key, (loadCounts.get(key) || 0) + 1);
      if (!loadOrders.has(key)) loadOrders.set(key, []);
      loadOrders.get(key).push(order);
    } else staffing.unassigned.push(order);
  }
  staffing.score = roundPercent(staffing.assigned, staffing.total);
  staffing.loads = [...loadCounts].map(([key,count]) => {
    const employee = available.get(key), limit = Number(employee?.wipLimit);
    const validLimit = Number.isInteger(limit) && limit > 0 && limit <= 100 ? limit : null;
    if (!validLimit) staffing.limitsMissing++;
    return {name:employee?.name || key, key, count, limit:validLimit, orders:loadOrders.get(key) || []};
  }).sort((a,b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'));
  staffing.overloaded = staffing.loads.filter(item => item.limit !== null && item.count > item.limit);

  const flow = {score:null, total:0, stalled:[], externalWaiting:[], unknown:0};
  for (const order of active) {
    const external = order.stage === 'Согласование CAD';
    if (external || order.stage === 'В доставке') {
      const since = stageSince(order, history);
      if (external && since && currentTime - since > 48 * 3600000) flow.externalWaiting.push({order,hours:Math.floor((currentTime - since) / 3600000)});
      continue;
    }
    const since = stageSince(order, history);
    if (!since || since > currentTime) { flow.unknown++; continue; }
    const limitHours = order.stage === 'Контроль качества' || initialStages.has(order.stage) || order.stage === 'Подготовка' ? 24 : 48;
    const hours = Math.floor((currentTime - since) / 3600000);
    flow.total++;
    if (hours > limitHours) flow.stalled.push({order,hours,limitHours});
  }
  flow.score = roundPercent(flow.total - flow.stalled.length, flow.total);
  flow.stalled.sort((a,b) => b.hours / b.limitHours - a.hours / a.limitHours);
  flow.externalWaiting.sort((a,b) => b.hours - a.hours);

  const quality = {score:null, sample:0, passedFirstTime:0, rejected:0, pending:[], recentFailures:[], reasons:[]};
  const decisions = history.filter(event => ['quality_check_approved','quality_check_rejected'].includes(event.action) && event.kind && validTime(event.at)).sort((a,b) => validTime(a.at) - validTime(b.at));
  const firstDecisions = new Map();
  for (const event of decisions) {
    const key = `${event.orderId}:${event.kind}`;
    if (!firstDecisions.has(key)) firstDecisions.set(key, event);
  }
  const monthAgo = currentTime - 30 * dayMs;
  for (const event of firstDecisions.values()) {
    if (validTime(event.at) < monthAgo || validTime(event.at) > currentTime) continue;
    quality.sample++;
    if (event.action === 'quality_check_approved') quality.passedFirstTime++;
  }
  quality.score = quality.sample >= 5 ? roundPercent(quality.passedFirstTime, quality.sample) : null;
  const reasons = new Map();
  for (const event of decisions) {
    if (event.action !== 'quality_check_rejected' || validTime(event.at) < monthAgo || validTime(event.at) > currentTime) continue;
    quality.rejected++;
    const label = event.reasonCategory || 'Причина не указана';
    reasons.set(label, (reasons.get(label) || 0) + 1);
    quality.recentFailures.push(event);
  }
  quality.recentFailures.sort((a,b) => validTime(b.at) - validTime(a.at));
  quality.reasons = [...reasons].map(([label,count]) => ({label,count})).sort((a,b) => b.count - a.count);
  quality.pending = active.filter(order => order.stage === 'Контроль качества').map(order => ({order,since:validTime(order.qualityRequest?.requestedAt)}));

  const payments = {score:null, total:0, paid:0, totalAmount:0, paidAmount:0, outstandingAmount:0, unknownAmount:0, unpaid:[], overdue:[]};
  for (const order of orders) {
    if (!paymentStages.has(order.stage)) continue;
    const amount = amountOf(order.sum);
    if (!amount) { payments.unknownAmount++; continue; }
    const paid = order.paidAt ? amount : Math.min(amount,Math.max(0,Number(order.paidAmount) || 0));
    const outstanding = amount - paid;
    payments.total++;
    payments.totalAmount += amount;
    payments.paidAmount += paid;
    if (!outstanding) payments.paid++;
    else {
      const due = dueDay(order.paymentDueDate);
      const item = {order,amount:outstanding,daysLate:due !== null ? Math.max(0,Math.round((today - due) / dayMs)) : null};
      payments.unpaid.push(item);
      if (due !== null && due < today) payments.overdue.push(item);
      payments.outstandingAmount += outstanding;
    }
  }
  payments.score = roundPercent(payments.paidAmount, payments.totalAmount);
  payments.unpaid.sort((a,b) => b.amount - a.amount);
  payments.overdue.sort((a,b) => b.daysLate - a.daysLate);

  const amendments = {recent:[], pending:[], rate:null, orderCount:0};
  amendments.recent = clientRequests.filter(request => {const at=validTime(request.createdAt);return at && at >= monthAgo && at <= currentTime;});
  amendments.pending = clientRequests.filter(request => request.status === 'pending');
  amendments.orderCount = orders.filter(order => {const at=validTime(order.createdAt);return at && at >= monthAgo && at <= currentTime;}).length;
  amendments.rate = amendments.orderCount ? Math.round(amendments.recent.length / amendments.orderCount * 100) : null;

  const weighted = [[deadlines.score,.30],[flow.score,.20],[quality.score,.30],[staffing.score,.10],[payments.score,.10]].filter(([value]) => value !== null);
  const weight = weighted.reduce((sum,[,share]) => sum + share, 0);
  const score = weight ? Math.round(weighted.reduce((sum,[value,share]) => sum + value * share, 0) / weight) : null;
  const critical = deadlines.overdue > 0 || flow.stalled.length > 0 || staffing.overloaded.length > 0 || payments.overdue.length > 0;
  return {score, critical, deadlines, flow, quality, staffing, payments, amendments, activeCount:active.length};
}
