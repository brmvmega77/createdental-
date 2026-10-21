const clean = value => typeof value === 'string' ? value.trim() : '';

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
  for (const field of ['preprodTechnicianKey', 'preprodTechnician', 'preprod', 'cadOperatorKey', 'cadOperator', 'frameTechnicianKey', 'frameTechnician', 'technician', 'painterKey', 'painter', 'ceramicist', 'assigneeKey', 'assignee']) {
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

// A compact label for cards, tables and bot messages.  Orders with several
// variants keep the actual service names instead of the internal summary
// "Несколько услуг (N)".
export function orderWorkLabel(order) {
  const variants = Array.isArray(order?.variants) ? order.variants : [];
  if (variants.length > 1) {
    const services = variants.map(variant => clean(variant?.workOption || variant?.material || variant?.work)).filter(Boolean);
    if (services.length) return services.join(', ');
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
