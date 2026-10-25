// Service-driven production routes. This module intentionally has no UI or
// storage dependencies so every cabinet can make the same routing decision.
const text = value => String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

const category = value => text(value).replace(/[^а-яa-z0-9]+/gi, ' ').trim();

export function orderServices(order = {}) {
  const variants = Array.isArray(order.variants) && order.variants.length
    ? order.variants
    : [{ work: order.work, workOption: order.material }];
  return variants.map(item => ({
    work: String(item.work || order.work || ''),
    service: String(item.workOption || item.material || order.material || item.work || '')
  }));
}

export function isRestorationRoute(order = {}) {
  const services = orderServices(order);
  return services.length > 0 && services.every(item => category(item.work) === 'реставрации');
}

export function hasRestorationService(order = {}) {
  return orderServices(order).some(item => category(item.work) === 'реставрации');
}

function serviceMatches(item, patterns) {
  const value = `${category(item.work)} ${category(item.service)}`;
  return patterns.some(pattern => value.includes(pattern));
}

// These services are explicitly assigned to a first-category technician after
// CAM. Restorations keep their existing CAM → aesthetic route.
export function requiresCategory1AfterCam(order = {}) {
  if (isRestorationRoute(order)) return false;
  return orderServices(order).some(item => serviceMatches(item, [
    'вкладк', 'балочн', 'капп', 'сплинт', 'ложк', 'прикусн', 'хирургическ',
    'армирован', 'анодирован', 'силиконов ключ', 'чек трансфер', 'депрограмматор',
    'заживляющ', 'генги', 'абатмент'
  ]));
}

export function isDirectCategory1(order = {}) {
  return orderServices(order).some(item => serviceMatches(item, [
    'анодирован', 'силиконов ключ', 'чек трансфер'
  ]));
}

export function routeForOrder(order = {}) {
  const analog = order.productionType === 'analog';
  const restoration = hasRestorationService(order);
  const category1 = requiresCategory1AfterCam(order);
  const direct = isDirectCategory1(order);
  const roles = [];
  if (analog) roles.push('preprod');
  if (!direct) roles.push('cad');
  if (!direct) roles.push('cam');
  if (category1) roles.push('category1');
  if (restoration) roles.push('esthetic');
  return { analog, restoration, directCategory1: direct, category1, roles };
}

export function nextProductionRole(order = {}) {
  const route = routeForOrder(order);
  return route.category1 ? 'category1' : route.restoration ? 'esthetic' : 'esthetic';
}

