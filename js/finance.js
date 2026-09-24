/* Motor de eventos e finanças: recorrência, totais, bonificação e regras de pagamento. */
const TYPE_LABELS = { plantao: 'Plantão', cirurgia: 'Cirurgia', peq_cir: 'Pequenas Cirurgias', ambulatorio: 'Ambulatório', particular: 'Atendimento Particular' };
const typeLabel = t => TYPE_LABELS[t] || 'Serviço';
const kindOf = e => e?.financeKind || e?.transactionKind || 'receivable';
const isPayable = e => kindOf(e) === 'payable';

/* ---------- horários e totais ---------- */
function timeToMinutes(value) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], min = +m[2];
  return h > 23 || min > 59 ? null : h * 60 + min;
}
function parseTimeRange(value) {
  const parts = String(value || '').trim().replace(/\s*[–—]\s*/g, '-').replace(/\s+até\s+/gi, '-').replace(/\s+/g, '').split('-').filter(Boolean);
  if (parts.length !== 2) return null;
  const start = timeToMinutes(parts[0]), end = timeToMinutes(parts[1]);
  return start == null || end == null ? null : { start, end };
}
function rangeToHours(value) {
  const r = parseTimeRange(value);
  if (!r) return null;
  let diff = r.end - r.start;
  if (diff <= 0) diff += 1440;
  return Math.round(diff / 60 * 100) / 100;
}

function bonusMatches(rule, e) {
  const name = String(rule.locationName || '').trim().toLowerCase();
  if (name && String(e.name || '').trim().toLowerCase() !== name) return false;
  const type = String(rule.serviceType || '').trim();
  if (type && String(e.type || '').trim() !== type) return false;
  const date = String(rule.applyDate || '').trim();
  return !date || String(e.dateISO || e.startDate || '').trim() === date;
}

const eventHours = e => Number(e.hours || 0);
const eventRate = e => Number(e.rate || 0);

function eventTotal(e) {
  const payable = isPayable(e);
  const full = Number(e?.fullAmount || e?.payableFullAmount || 0);
  if (payable && Number.isFinite(full) && full > 0) return full;
  const base = eventRate(e) * eventHours(e);
  if (payable) return base;
  const range = parseTimeRange(e?.time);
  if (!range || eventHours(e) <= 0 || eventRate(e) <= 0 || !state.bonusRules.length) return base;

  const evStart = range.start;
  let evEnd = range.end;
  if (evEnd <= evStart) evEnd += 1440;
  let bonus = 0;
  for (const rule of state.bonusRules) {
    if (!bonusMatches(rule, e)) continue;
    const rs = timeToMinutes(rule.startTime), re = timeToMinutes(rule.endTime);
    const pct = Number(rule.percentage || 0) / 100;
    if (rs == null || re == null || !Number.isFinite(pct) || pct <= 0) continue;
    const windows = re <= rs
      ? [{ start: rs, end: 1440 }, { start: 1440, end: 2880 + re }]
      : [{ start: rs, end: re }, { start: rs + 1440, end: re + 1440 }];
    for (const w of windows) {
      const overlap = Math.max(0, Math.min(evEnd, w.end) - Math.max(evStart, w.start));
      if (overlap > 0) bonus += overlap / 60 * eventRate(e) * pct;
    }
  }
  return base + bonus;
}

/* ---------- ocorrências por data ---------- */
function occursOn(master, dateISO) {
  const d = parseISO(dateISO), start = parseISO(master.startDate);
  if (d < start) return false;
  if (master.endDate && d > parseISO(master.endDate)) return false;
  if (Array.isArray(master.exceptions) && master.exceptions.includes(dateISO)) return false;
  const rec = master.rec || 'none';
  if (rec === 'none') return master.startDate === dateISO;
  const diff = Math.round((d - start) / 86400000);
  if (rec === 'weekly') return diff % 7 === 0;
  if (rec === 'biweekly') return diff % 14 === 0;
  if (rec === 'monthly') return d.getDate() === start.getDate();
  return false;
}

let evIndex = null;
const resetEventIndex = () => { evIndex = null; };
function eventIndex() {
  if (evIndex) return evIndex;
  const singles = new Map(), overrides = new Map(), overrideOf = new Map(), masters = [];
  const push = (map, key, e) => { if (!map.has(key)) map.set(key, []); map.get(key).push(e); };
  for (const e of state.events) {
    if (e.isOverride) {
      const d = e.dateISO || e.startDate;
      push(overrides, d, e);
      if (e.seriesId) overrideOf.set(`${e.seriesId}@@${d}`, e);
    } else if ((e.rec || 'none') !== 'none') masters.push(e);
    else push(singles, e.startDate, e);
  }
  return evIndex = { singles, overrides, overrideOf, masters };
}

function eventsOn(dateISO) {
  const ix = eventIndex();
  const virtuals = [];
  for (const m of ix.masters) {
    if (ix.overrideOf.has(`${m.id}@@${dateISO}`) || !occursOn(m, dateISO)) continue;
    virtuals.push({ ...m, _virtual: true, _masterId: m.id, _instanceDate: dateISO, startDate: dateISO });
  }
  return [...(ix.singles.get(dateISO) || []), ...(ix.overrides.get(dateISO) || []), ...virtuals]
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')) || String(a.name || '').localeCompare(String(b.name || '')));
}

function occurrencesBetween(fromISO, toISO) {
  const out = [];
  for (let d = parseISO(fromISO), end = parseISO(toISO); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = iso(d);
    for (const e of eventsOn(ds)) out.push({ ...e, startDate: ds });
  }
  return out;
}

/* ---------- regras de pagamento / vencimento ---------- */
const isBusinessDay = d => d.getDay() !== 0 && d.getDay() !== 6;
function nthBusinessDay(y, m, n) {
  let count = 0, day = 1, date = new Date(y, m, day);
  while (count < n) {
    if (isBusinessDay(date)) count++;
    if (count < n) { date = new Date(y, m, ++day); if (date.getMonth() !== m) return null; }
  }
  return date;
}
function lastBusinessDay(y, m) {
  let day = new Date(y, m + 1, 0).getDate(), date = new Date(y, m, day);
  while (!isBusinessDay(date)) date = new Date(y, m, --day);
  return date;
}

/* Competência do mês de pagamento: início ≤ fim → mês anterior; início > fim → cruza dois meses. */
function competenceRange(rule, payY, payM) {
  const startDay = clamp(parseInt(rule.compStart || 1, 10), 1, 31), endDay = clamp(parseInt(rule.compEnd || 31, 10), 1, 31);
  const lastOf = (y, m) => new Date(y, m + 1, 0).getDate();
  if (startDay <= endDay) {
    const p = monthAdd(payY, payM, -1);
    return { from: iso(new Date(p.y, p.m, Math.min(startDay, lastOf(p.y, p.m)))), to: iso(new Date(p.y, p.m, Math.min(endDay, lastOf(p.y, p.m)))) };
  }
  const a = monthAdd(payY, payM, -2), b = monthAdd(payY, payM, -1);
  return { from: iso(new Date(a.y, a.m, Math.min(startDay, lastOf(a.y, a.m)))), to: iso(new Date(b.y, b.m, Math.min(endDay, lastOf(b.y, b.m)))) };
}

function paymentDate(rule, payY, payM) {
  const type = rule.payType || 'day';
  if (type === 'last') return iso(new Date(payY, payM + 1, 0));
  if (type === 'nthBusinessDay') return iso(nthBusinessDay(payY, payM, clamp(parseInt(rule.payDay || 1, 10), 1, 22)) || new Date(payY, payM, 1));
  if (type === 'lastBusinessDay') return iso(lastBusinessDay(payY, payM) || new Date(payY, payM, 1));
  const last = new Date(payY, payM + 1, 0).getDate();
  return iso(new Date(payY, payM, Math.min(clamp(parseInt(rule.payDay || 18, 10), 1, 31), last)));
}

/* Linhas por instituição para o mês de pagamento (y, m). kind: 'receivable' | 'payable'. */
function ruleRows(rules, kind, y, m, { positiveOnly = false } = {}) {
  const rows = [];
  for (const rule of rules || []) {
    const name = String(rule.name || '').trim();
    if (!name) continue;
    const { from, to } = competenceRange(rule, y, m);
    const items = occurrencesBetween(from, to)
      .filter(o => String(o.name || '').trim() === name && (kind === 'payable' ? isPayable(o) : !isPayable(o)))
      .map(o => ({ date: o.startDate, name: o.name || '', type: typeLabel(o.type), time: o.time || '—', hours: eventHours(o), total: eventTotal(o), note: o.note || '' }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    const total = items.reduce((s, i) => s + i.total, 0), hours = items.reduce((s, i) => s + i.hours, 0);
    if (positiveOnly ? total > 0 : items.length) rows.push({ rule, name, from, to, payDate: paymentDate(rule, y, m), items, total, hours, count: items.length });
  }
  return rows;
}

/* Faturamento do mês: por regras de recebimento; sem regras, soma das ocorrências do mês. */
function receivableTotal(y, m) {
  const rows = ruleRows(state.payRules, 'receivable', y, m);
  if (rows.length) return rows.reduce((s, r) => s + r.total, 0);
  const { from, to } = monthRange(y, m);
  return occurrencesBetween(from, to).filter(o => !isPayable(o)).reduce((s, o) => s + eventTotal(o), 0);
}
