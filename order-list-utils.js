const clean = value => typeof value === 'string' ? value.trim() : '';
const isSurgicalSocketOption = value => /дополнительное\s+гн[её]здо\s+под\s+имплантант(?:\s+в\s+хирургическом\s+шаблоне)?/i.test(clean(value).replace(/\s+/g, ' '));

// Internal IDs keep their original form for links, storage and API calls.
// This is the compact human-facing form used in cabinets and printouts.
export function displayOrderId(value) {
  const raw = clean(typeof value === 'object' ? value?.id : value);
  return raw.replace(/^CD-/i, '').replace(/_W(\d+)$/i, '_$1');
}

// Routes use the same compact identifier that people see in the cabinets.
// Resolve it back to the stored identifier before reading or mutating an order.
export function resolveOrderId(value, orders = []) {
  const raw = clean(value);
  if (!raw) return '';
  const match = (Array.isArray(orders) ? orders : []).find(order =>
    clean(order?.id) === raw || displayOrderId(order) === raw || clean(order?.clinicOrder?.id) === raw
  );
  return match?.id || raw;
}

function constructionLabelWithQuantity(variant, label) {
  if (!isSurgicalSocketOption(variant?.workOption)) return label;
  const units = Math.max(1, Math.trunc(Number(variant?.units) || 1));
  return `${label} (${units})`;
}

// Use stable employee IDs where available; old orders store original names.
export function orderParticipants(order, employees = [], history = []) {
  const aliases = new Map();
  for (const employee of employees) {
    for (const alias of [employee.id, employee.originalName, employee.name]) {
      if (clean(alias)) aliases.set(clean(alias), employee);
    }
  }
  for (const [id, acceptance] of Object.entries(order.workerAcceptances || {})) {
    const employee = aliases.get(id);
    if (employee && clean(acceptance?.name)) aliases.set(clean(acceptance.name), employee);
  }
  const participants = new Map();
  const add = (reference, fallbackName = '', participated = false) => {
    reference = clean(reference);
    if (!reference || reference === 'Не назначен') return;
    const employee = aliases.get(reference) || aliases.get(clean(fallbackName));
    const name = clean(employee?.name) || clean(fallbackName) || reference;
    const id = employee?.id || `name:${name}`;
    const previous = participants.get(id);
    participants.set(id, {id, name, participated: participated || !!previous?.participated});
  };
  for (const field of ['preprodTechnicianKey', 'preprodTechnician', 'preprod', 'cadOperatorKey', 'cadOperator', 'frameTechnicianKey', 'frameTechnician', 'technician', 'category1TechnicianKey', 'category1Technician', 'painterKey', 'painter', 'ceramicist', 'assigneeKey', 'assignee']) {
    add(order[field]);
  }
  for (const [id, acceptance] of Object.entries(order.workerAcceptances || {})) {
    add(id, acceptance?.name, true);
  }
  if (order.qualityRequest) {
    const request = order.qualityRequest;
    add(request.employeeId || request.requestedBy, request.requestedByName || request.requestedBy, true);
  }
  for (const event of history) {
    if (event.orderId !== order.id) continue;
    if (event.actorRole === 'worker' || (event.actorRole === 'technician' && aliases.has(clean(event.actor)))) {
      add(event.actor, '', true);
    }
  }
  return [...participants.values()];
}

export function orderWorkTypes(order) {
  const variants = Array.isArray(order.variants) ? order.variants : [];
  const works = variants.map(variant => clean(variant?.work)).filter(Boolean);
  if (!works.length && clean(order.work)) works.push(clean(order.work));
  return [...new Set(works)];
}

// The stored fields keep their business meaning: `work` is the catalogue
// section and `workOption`/`material` is the selected service.  These helpers
// expose the labels used in order cards and detail views so the UI cannot
// accidentally swap them again.
export function orderVariantExecutionLabel(variant, order = {}) {
  return clean(variant?.work) || clean(order?.work) || '—';
}

export function orderVariantConstructionLabel(variant, order = {}) {
  const label = clean(variant?.workOption) || clean(variant?.material) ||
    (!Array.isArray(order?.variants) || order.variants.length <= 1 ? clean(order?.material) : '') || '—';
  return constructionLabelWithQuantity(variant, label);
}

export function orderExecutionLabel(order) {
  const variants = Array.isArray(order?.variants) && order.variants.length
    ? order.variants
    : [{work: order?.work, workOption: order?.material}];
  const labels = [...new Set(variants.map(variant => orderVariantExecutionLabel(variant, order)).filter(label => label !== '—'))];
  return labels.join(', ') || '—';
}

export function orderConstructionLabel(order) {
  const variants = Array.isArray(order?.variants) && order.variants.length
    ? order.variants
    : [{work: order?.work, workOption: order?.material}];
  const labels = [...new Set(variants.map(variant => orderVariantConstructionLabel(variant, order)).filter(label => label !== '—'))];
  return labels.join(', ') || '—';
}

// A compact label for cards, tables and bot messages.  Orders with several
// variants keep the actual service names instead of the internal summary
// "Несколько услуг (N)".
export function orderWorkLabel(order) {
  const variants = Array.isArray(order?.variants) ? order.variants : [];
  if (variants.length > 1) {
    const services = variants.map(variant => orderVariantConstructionLabel(variant, order) === '—'
      ? clean(variant?.workOption || variant?.material || variant?.work)
      : orderVariantConstructionLabel(variant, order)).filter(Boolean);
    if (services.length) return services.join(', ');
  }
  if (variants.length === 1 && isSurgicalSocketOption(variants[0]?.workOption)) {
    const category = clean(order?.work) || clean(variants[0]?.work);
    return category ? `${category} · ${orderVariantConstructionLabel(variants[0], order)}` : orderVariantConstructionLabel(variants[0], order);
  }
  return clean(order?.work) || clean(order?.material) || '—';
}

// Older history records stored the internal multi-service summary. Render
// those records with the same concrete service label used everywhere else.
export function orderEventSummary(order, event) {
  const summary = clean(event?.summary);
  if (!summary) return '';
  const label = orderWorkLabel(order);
  if (!label || label === clean(order?.work)) return summary;
  return summary.replace(/^Несколько услуг(?:\s*\(\d+\))?/i, label);
}

export function matchesParticipantAndWork(order, employeeId = '', workType = '') {
  return (!employeeId || order.participants.some(person => person.id === employeeId)) &&
    (!workType || order.workTypes.includes(workType));
}
