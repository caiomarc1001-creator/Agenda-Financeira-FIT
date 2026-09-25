/* Calendário mensal, resumo, e o editor de eventos (recorrência, retroativos, datas específicas). */
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const COLOR_PRESETS = ['#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD', '#0EA5E9', '#06B6D4', '#14B8A6', '#22C55E', '#16A34A', '#84CC16', '#EAB308', '#F59E0B', '#F97316', '#EF4444', '#DC2626', '#EC4899', '#DB2777', '#8B5CF6', '#7C3AED'];

const Modal = { model: null };
const Scope = { masterId: null, instanceDate: null, pendingModel: null, mode: null };
const DelScope = { masterId: null, instanceDate: null };
const RetroDel = { parentId: null, eventId: null, startDate: '', endDate: '' };
const Specific = { mode: 'copy' };
const clearScope = () => Object.assign(Scope, { masterId: null, instanceDate: null, pendingModel: null, mode: null });
const clearDelScope = () => Object.assign(DelScope, { masterId: null, instanceDate: null });
const clearRetroDel = () => Object.assign(RetroDel, { parentId: null, eventId: null, startDate: '', endDate: '' });
const resetTransientScopes = () => { clearScope(); clearDelScope(); clearRetroDel(); };

/* ---------- ocultar eventos no calendário (não afeta os cálculos) ---------- */
function hideOptions() {
  state.ui.calendarHide ||= { all: !!state.ui.hideCalendarEvents, receivable: false, payable: false, types: {} };
  state.ui.calendarHide.types ||= {};
  return state.ui.calendarHide;
}
function isHiddenInCalendar(e) {
  const h = hideOptions();
  if (h.all || state.ui.hideCalendarEvents) return true;
  const payable = String(e.financeKind || e.financialNature || 'receivable') === 'payable';
  return (payable && h.payable) || (!payable && h.receivable) || !!h.types[String(e.type || '')];
}
function refreshHideButton() {
  const h = hideOptions(), on = !!(h.all || h.receivable || h.payable || Object.values(h.types).some(Boolean) || state.ui.hideCalendarEvents);
  const btn = $('btnToggleCalendarEvents');
  btn.textContent = on ? 'Ocultação ativa' : 'Ocultar eventos';
  btn.classList.toggle('danger', on);
  btn.title = on ? 'Há filtros de ocultação ativos apenas no calendário. A barra lateral continua calculando tudo.' : 'Escolha quais eventos ocultar no calendário sem mexer na barra lateral.';
}
function openHideOptions() {
  const h = hideOptions();
  $('hideAllEvents').checked = !!(h.all || state.ui.hideCalendarEvents);
  $('hideReceivableEvents').checked = !!h.receivable;
  $('hidePayableEvents').checked = !!h.payable;
  $$('[data-hide-type]').forEach(el => { el.checked = !!h.types[el.dataset.hideType]; });
  openModal('ovHideOptions');
}
function applyHideOptions() {
  const h = hideOptions();
  h.all = $('hideAllEvents').checked; h.receivable = $('hideReceivableEvents').checked; h.payable = $('hidePayableEvents').checked;
  h.types = Object.fromEntries($$('[data-hide-type]').map(el => [el.dataset.hideType, el.checked]));
  state.ui.hideCalendarEvents = h.all;
  save(); refreshHideButton(); renderCalendar(); closeModal('ovHideOptions');
}
function showAllEvents() {
  state.ui.hideCalendarEvents = false;
  state.ui.calendarHide = { all: false, receivable: false, payable: false, types: {} };
  save(); openHideOptions(); refreshHideButton(); renderCalendar();
}

/* ---------- renderização ---------- */
function renderDow() { $('dowRow').innerHTML = DOW.map(d => `<div class="dow">${d}</div>`).join(''); }

function renderCalendar() {
  const { y, m } = state.view;
  const label = $('monthLabel');
  label.textContent = monthLabel(y, m);
  const prev = monthAdd(y, m, -1), next = monthAdd(y, m, 1);
  $('prevMonthMini').textContent = `${monthShort(prev.y, prev.m)} / ${prev.y}`;
  $('nextMonthMini').textContent = `${monthShort(next.y, next.m)} / ${next.y}`;

  const first = new Date(y, m, 1), start = new Date(y, m, 1 - first.getDay()), today = todayISO();
  const grid = $('grid');
  grid.innerHTML = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const date = iso(d);
    const cell = document.createElement('div');
    cell.className = 'day' + (d.getMonth() === m ? '' : ' other') + (date === today ? ' today' : '') + (date === state.selDate ? ' selected' : '');
    cell.innerHTML = `<div class="dayTop"><div class="num">${d.getDate()}</div></div>`;
    const chips = document.createElement('div');
    chips.className = 'chips';

    if (state.ui.surgeonMode) {
      surgeriesOn(date).forEach(s => {
        const chip = document.createElement('div');
        chip.className = 'chip surgeryDayChip';
        chip.title = `${s.patientName || 'Paciente'} • ${dateBR(date)} • ${s.hospital || 'Hospital não informado'} • ${surgeryStatusLabel(s.paymentStatus)}`;
        chip.innerHTML = `<span class="chipMark"></span><span>${esc(s.patientName || 'Paciente')}</span>`;
        chip.addEventListener('click', ev => { ev.stopPropagation(); state.selDate = date; save(); renderCalendar(); renderSurgeryPanel(); });
        chips.appendChild(chip);
      });
    } else {
      eventsOn(date).filter(e => !isHiddenInCalendar(e)).forEach(e => {
        const chip = document.createElement('div');
        const bg = hexNorm(e.color || '#3B82F6');
        chip.className = 'chip';
        chip.style.setProperty('--chipBg', bg);
        chip.style.setProperty('--chipFg', bestText(bg));
        chip.title = `${e.name} • ${dateBR(date)} • ${typeLabel(e.type)}${e.time ? ` • ${e.time}` : ''} • ${fmtMoney(eventTotal(e))}`;
        chip.innerHTML = `<span class="chipMark"></span><span>${esc(e.name || '(sem nome)')}</span>`;
        chip.addEventListener('click', ev => { ev.stopPropagation(); openEventFromChip(e, date); });
        chips.appendChild(chip);
      });
    }
    cell.appendChild(chips);
    cell.addEventListener('click', () => {
      state.selDate = date; save(); renderSummary();
      if (state.ui.surgeonMode) { renderCalendar(); renderSurgeryPanel(); }
      else { openEventNew(date); renderCalendar(); }
    });
    grid.appendChild(cell);
  }
}

function renderSummary() {
  const { from, to } = monthRange(state.view.y, state.view.m);
  let count = 0, total = 0, hours = 0;
  for (const o of occurrencesBetween(from, to)) { count++; if (!isPayable(o)) total += eventTotal(o); hours += eventHours(o); }
  $('sumCount').textContent = count;
  $('sumTotal').textContent = fmtMoney(total);
  $('sumHours').textContent = fmtHours(hours);
  $('sumSel').textContent = state.selDate ? dateBR(state.selDate) : '—';
}

function changeMonth(delta) { state.view = monthAdd(state.view.y, state.view.m, delta); save(); renderAll(); }

/* Deslizar no calendário troca o mês (telas de toque). */
function bindCalendarSwipe() {
  const card = document.querySelector('.mainCalendarCard');
  let x0 = 0, y0 = 0, t0 = 0, tracking = false;
  const touch = () => matchMedia('(max-width: 1100px)').matches;
  card.addEventListener('touchstart', e => { if (!touch() || e.touches.length !== 1) return; ({ clientX: x0, clientY: y0 } = e.touches[0]); t0 = Date.now(); tracking = true; }, { passive: true });
  card.addEventListener('touchmove', e => {
    if (!tracking || !touch() || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.35) e.preventDefault();
  }, { passive: false });
  card.addEventListener('touchend', e => {
    if (!tracking || !touch()) return;
    tracking = false;
    const t = e.changedTouches[0]; if (!t) return;
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.45 && Date.now() - t0 < 700) changeMonth(dx < 0 ? 1 : -1);
  }, { passive: true });
  card.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
}

/* ---------- formulário de evento ---------- */
const defaultEvent = date => ({
  id: uid(), name: '', startDate: date || todayISO(), time: '', type: 'plantao', color: '#3B82F6', rate: 0, hours: 0, fullAmount: 0, note: '', financeKind: 'receivable',
  rec: 'none', endDate: '', exceptions: [], isOverride: false, seriesId: '', dateISO: '', retroMode: 'none', retroSingleDate: '', retroStartDate: '', retroEndDate: '', retroInfoDate: ''
});

/* lockDate: ao editar só uma ocorrência (ou um override) a data é a da ocorrência e não pode ser trocada aqui. */
function fillEventForm(m, title, lockDate = false) {
  $('evTitle').textContent = title || 'Evento';
  $('evName').value = m.name || '';
  $('evDate').value = m.startDate || todayISO();
  $('evDate').disabled = lockDate;
  $('evTime').value = m.time || '';
  $('evType').value = m.type || 'plantao';
  $('btnPickColor').dataset.color = hexNorm(m.color || '#3B82F6');
  $('evRate').value = m.rate || '';
  $('evHours').value = m.hours || '';
  $('evFullAmount').value = m.fullAmount || m.payableFullAmount || '';
  $('evNote').value = m.note || '';
  $('evFinanceKind').value = isPayable(m) ? 'payable' : 'receivable';
  $('evRec').value = m.rec || 'none';
  $('evEnd').value = m.endDate || '';
  $('evRetroMode').value = m.retroMode || 'none';
  $('evRetroSingleDate').value = m.retroSingleDate || '';
  $('evRetroStartDate').value = m.retroStartDate || '';
  $('evRetroEndDate').value = m.retroEndDate || '';
  $('evRetroInfoDate').value = m.retroInfoDate || '';
  updateEventUi();
}

function readEventForm() {
  const m = clone(Modal.model || defaultEvent(state.selDate || todayISO()));
  const rec = $('evRec').value || 'none', kind = $('evFinanceKind').value === 'payable' ? 'payable' : 'receivable';
  Object.assign(m, {
    name: $('evName').value.trim(), startDate: $('evDate').value || todayISO(), time: $('evTime').value.trim(), type: $('evType').value || 'plantao',
    color: hexNorm($('btnPickColor').dataset.color), rate: num($('evRate').value), hours: num($('evHours').value),
    fullAmount: num($('evFullAmount').value), rec, endDate: rec !== 'none' ? ($('evEnd').value || '') : '', note: $('evNote').value.trim(),
    financeKind: kind, transactionKind: kind, retroMode: $('evRetroMode').value || 'none', retroSingleDate: $('evRetroSingleDate').value || '',
    retroStartDate: $('evRetroStartDate').value || '', retroEndDate: $('evRetroEndDate').value || '', retroInfoDate: $('evRetroInfoDate').value || ''
  });
  m.payableFullAmount = m.fullAmount;
  delete m._virtual; delete m._masterId; delete m._instanceDate; // marcas de ocorrência virtual não podem ir para o evento gravado
  return m;
}

/* Mostra/oculta campos conforme recorrência, retroativo e natureza; recalcula total e prévia do chip. */
function updateEventUi() {
  const payable = $('evFinanceKind').value === 'payable', mode = $('evRetroMode').value || 'none';
  const badge = $('evFinanceBadge');
  badge.textContent = payable ? 'A pagar' : 'A receber';
  badge.classList.toggle('payable', payable);
  $('evFullAmountRow').style.display = payable ? 'grid' : 'none';
  $('recEndRow').style.display = $('evRec').value !== 'none' ? '' : 'none';
  $('retroSingleRow').style.display = mode === 'single' ? '' : 'none';
  $('retroPeriodRow').style.display = mode === 'period' ? 'grid' : 'none';
  $('retroInfoRow').style.display = mode === 'info' ? '' : 'none';

  const full = num($('evFullAmount').value);
  if (payable && full > 0) $('evTotal').value = fmtMoney(full);
  else {
    const auto = rangeToHours($('evTime').value);
    if (auto != null) $('evHours').value = String(auto);
    $('evTotal').value = fmtMoney(num($('evRate').value) * num($('evHours').value));
  }
  const model = readEventForm(), bg = hexNorm(model.color);
  $('chipPreview').style.setProperty('--chipBg', bg);
  $('chipPreview').style.setProperty('--chipFg', bestText(bg));
  $('chipPreviewTxt').textContent = model.name || 'Exemplo';
  $('colorPicker').value = bg;
  $('colorHex').value = bg;
}

function buildColorGrid() {
  const current = hexNorm($('btnPickColor').dataset.color);
  $('colorGrid').innerHTML = '';
  COLOR_PRESETS.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'colorBtn' + (hexNorm(c) === current ? ' on' : '');
    b.style.setProperty('--c', c);
    b.addEventListener('click', () => { $('btnPickColor').dataset.color = hexNorm(c); buildColorGrid(); updateEventUi(); });
    $('colorGrid').appendChild(b);
  });
}
function setPickedColor(value) { $('btnPickColor').dataset.color = hexNorm(value); buildColorGrid(); updateEventUi(); }

function openEventNew(date) {
  clearScope();
  Modal.model = defaultEvent(date);
  fillEventForm(Modal.model, 'Novo evento');
  $('evDelete').style.display = 'none';
  openModal('ovEvent');
}

function openEventFromChip(e, day) {
  if (e._virtual) {
    Object.assign(Scope, { masterId: e._masterId, instanceDate: e._instanceDate || day, pendingModel: clone(e), mode: null });
    Modal.model = clone(e);
    Modal.model.startDate = Scope.instanceDate;
    openModal('ovScope');
    return;
  }
  clearScope();
  Modal.model = clone(e);
  if (e.isOverride) Modal.model.startDate = e.dateISO || day;
  fillEventForm(Modal.model, e.isOverride ? 'Editar (override)' : 'Editar evento', !!e.isOverride);
  $('evDelete').style.display = '';
  openModal('ovEvent');
}

function chooseScope(scope) {
  if (!Scope.masterId || !Scope.instanceDate) { closeModal('ovScope'); return; }
  Scope.mode = scope;
  closeModal('ovScope');
  const labels = { single: 'apenas este evento', future: 'este evento e os futuros', all: 'todos os eventos da série' };
  const base = clone(Scope.pendingModel || Modal.model || defaultEvent(Scope.instanceDate));
  const master = state.events.find(e => e.id === Scope.masterId);
  base.startDate = base.dateISO = Scope.instanceDate;
  if (scope === 'single') { base.rec = 'none'; base.endDate = ''; }
  if (scope === 'all' && master) { base.startDate = master.startDate; base.dateISO = ''; } // "todos": mantém o início da série, senão as ocorrências anteriores sumiriam
  Modal.model = base;
  fillEventForm(base, `Editar (série • ${labels[scope]})`, scope === 'single');
  $('evDelete').style.display = '';
  openModal('ovEvent');
}

/* ---------- retroativos e cópias ---------- */
const isRetroChildOf = (e, parentId) => !!e && (e.retroParentId === parentId || e.retroGroupId === 'retro_' + parentId);
const rootGroupId = e => !e ? '' : e.retroParentId || e.copyFamilyId || (e.isOverride && e.seriesId) || ((e.rec || 'none') !== 'none' ? e.id : (e.copyGroupId || e.id));

function retroDates(base) {
  const mode = base.retroMode || 'none', today = todayISO(), out = new Set();
  const exists = d => state.events.some(e => (e.dateISO || e.startDate || '') === d && String(e.name || '').trim() === String(base.name || '').trim()
    && String(e.time || '').trim() === String(base.time || '').trim() && String(e.type || '').trim() === String(base.type || '').trim()
    && Number(e.rate || 0) === Number(base.rate || 0) && Number(e.hours || 0) === Number(base.hours || 0));
  const ok = d => d < base.startDate && d !== today && !exists(d);

  if (mode === 'single') return base.retroSingleDate && ok(base.retroSingleDate) ? [base.retroSingleDate] : [];
  if (mode !== 'period' || !base.retroStartDate || !base.retroEndDate) return [];

  const low = parseISO(base.retroStartDate), anchor = parseISO(base.startDate);
  const high = new Date(Math.min(parseISO(base.retroEndDate), parseISO(today), anchor.getTime() - 86400000));
  if (high < low) return [];
  const rec = base.rec || 'none';

  if (rec === 'weekly' || rec === 'biweekly') {
    const step = rec === 'weekly' ? 7 : 14;
    for (const d = new Date(anchor); d >= low; d.setDate(d.getDate() - step)) if (d <= high && ok(iso(d))) out.add(iso(d));
  } else if (rec === 'monthly') {
    const day = anchor.getDate(), cursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    for (;;) {
      cursor.setMonth(cursor.getMonth() - 1);
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(day, new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()));
      if (d < low) break;
      if (d <= high && ok(iso(d))) out.add(iso(d));
    }
  } else {
    for (const d = new Date(low); d <= high; d.setDate(d.getDate() + 1)) if (ok(iso(d))) out.add(iso(d));
  }
  return [...out].sort();
}

const retroSingles = base => retroDates(base).map(date => ({
  ...clone(base), id: uid(), rec: 'none', endDate: '', exceptions: [], isOverride: false, seriesId: '', dateISO: '',
  startDate: date, retroGenerated: true, retroParentId: base.id, retroGroupId: 'retro_' + base.id
}));

function parseDateList(raw) {
  const text = String(raw || '').replace(/\b(\d{2})[\/.-](\d{2})[\/.-](\d{4})\b/g, '$3-$2-$1');
  return [...new Set(text.split(/[,;\n]/).map(s => anyToISO(s.trim())).filter(Boolean))].sort();
}

function openSpecificDates(mode) {
  Specific.mode = mode;
  $('specificDatesTitle').textContent = mode === 'copy' ? 'Copiar para datas específicas' : 'Excluir datas específicas';
  $('specificDatesHint').textContent = mode === 'copy'
    ? 'Escolha se deseja copiar como evento único ou copiar a recorrência do evento atual.'
    : 'Na exclusão, as datas informadas serão removidas do grupo vinculado ao evento atual.';
  $('specificDatesText').value = $('specificStartDate').value = $('specificEndDate').value = '';
  $('copyModeWrap').style.display = mode === 'copy' ? '' : 'none';
  $('copyModeSingle').checked = true;
  openModal('ovSpecificDates');
}
function fillSpecificRange(step) {
  const a = anyToISO($('specificStartDate').value), b = anyToISO($('specificEndDate').value);
  if (!a || !b) return alert('Informe a data inicial e a data final no formato DD/MM/AAAA.');
  if (a > b) return alert('A data final não pode ser anterior à inicial.');
  const dates = [];
  for (let d = parseISO(a); iso(d) <= b; d.setDate(d.getDate() + step)) dates.push(dateBR(iso(d)));
  $('specificDatesText').value = dates.join('\n');
}

function applySpecificDates() {
  if (!Modal.model) return;
  const dates = parseDateList($('specificDatesText').value);
  if (!dates.length) return alert('Informe ao menos uma data válida no formato DD/MM/AAAA.');
  pushHistory();

  if (Specific.mode === 'copy') {
    const base = readEventForm(), sourceRoot = rootGroupId(Modal.model), single = $('copyModeSingle').checked, family = uid();
    dates.filter(d => d !== base.startDate).forEach(d => {
      const copy = {
        ...clone(base), id: uid(), startDate: d, exceptions: [], isOverride: false, seriesId: '', dateISO: '', retroGenerated: false, retroParentId: '', retroGroupId: '',
        copyFamilyId: family, copyGroupId: family, copyRootId: family, copySourceId: Modal.model.id || '', copySourceRootId: sourceRoot || ''
      };
      if (single) { copy.rec = 'none'; copy.endDate = ''; }
      else if ((copy.rec || 'none') !== 'none' && copy.endDate && copy.endDate < copy.startDate) copy.endDate = '';
      state.events.push(copy);
    });
  } else {
    const target = Modal.model, root = rootGroupId(target);
    if ((target.rec || 'none') !== 'none' || (target.isOverride && target.seriesId)) {
      const masterId = target.isOverride ? target.seriesId : target.id;
      const idx = state.events.findIndex(e => e.id === masterId);
      if (idx >= 0) {
        const master = clone(state.events[idx]);
        master.exceptions = [...new Set([...(master.exceptions || []), ...dates])];
        state.events[idx] = master;
      }
      state.events = state.events.filter(e => !(e.isOverride && e.seriesId === masterId && dates.includes(e.dateISO || e.startDate || '')));
    } else {
      state.events = state.events.filter(e => !((e.id === root || e.copyFamilyId === root || e.copyGroupId === root) && dates.includes(e.startDate || '')));
    }
  }
  save(); closeModal('ovSpecificDates'); closeModal('ovEvent'); renderAll();
}

/* ---------- salvar ---------- */
function validateEvent(e) {
  if (!e.name) return 'Informe a instituição / local.';
  if (!e.startDate) return 'Informe a data.';
  if (e.rate < 0 || e.hours < 0) return 'Valor por hora e horas não podem ser negativos.';
  if (e.rec !== 'none' && e.endDate && parseISO(e.endDate) < parseISO(e.startDate)) return 'A data final da recorrência não pode ser anterior à data inicial.';
  if (e.retroMode === 'period' && e.retroStartDate && e.retroEndDate && parseISO(e.retroEndDate) < parseISO(e.retroStartDate)) return 'No retroativo, a data final não pode ser anterior à inicial.';
  return '';
}

function upsertEvent(model) {
  const i = state.events.findIndex(x => x.id === model.id);
  if (i >= 0) state.events[i] = model; else state.events.push(model);
}

function saveEvent() {
  const model = readEventForm(), err = validateEvent(model);
  if (err) return alert(err);
  pushHistory();

  if (Scope.masterId && Scope.instanceDate && Scope.mode) {
    const idx = state.events.findIndex(e => e.id === Scope.masterId);
    if (idx === -1) { clearScope(); return alert('Não foi possível localizar a série original.'); }
    const master = clone(state.events[idx]), date = Scope.instanceDate;

    if (Scope.mode === 'single') {
      master.exceptions = [...new Set([...(master.exceptions || []), date])];
      state.events[idx] = master;
      const kind = kindOf(model);
      const override = {
        id: uid(), name: model.name, startDate: date, time: model.time, type: model.type, color: model.color, rate: model.rate, hours: model.hours,
        fullAmount: model.fullAmount, payableFullAmount: model.fullAmount, note: model.note, financeKind: kind, transactionKind: kind,
        rec: 'none', endDate: '', exceptions: [], isOverride: true, seriesId: master.id, dateISO: date,
        retroMode: model.retroMode || 'none', retroSingleDate: model.retroSingleDate || '', retroStartDate: model.retroStartDate || '', retroEndDate: model.retroEndDate || '', retroInfoDate: model.retroInfoDate || ''
      };
      const existing = state.events.findIndex(e => e.isOverride && e.seriesId === master.id && (e.dateISO || e.startDate) === date);
      if (existing >= 0) { override.id = state.events[existing].id; state.events[existing] = override; } else state.events.push(override);
    } else if (Scope.mode === 'future') {
      master.endDate = addDays(date, -1);
      state.events[idx] = master;
      state.events = state.events.filter(e => !(e.isOverride && e.seriesId === master.id && (e.dateISO || e.startDate) >= date) && !isRetroChildOf(e, master.id));
      const created = { ...clone(model), id: uid(), isOverride: false, seriesId: '', dateISO: '', exceptions: [] }; // vale a data do formulário (pode ter sido alterada)
      state.events.push(created, ...retroSingles(created));
    } else {
      const merged = { ...clone(model), id: master.id, isOverride: false, seriesId: '', dateISO: '', exceptions: master.exceptions || [] };
      state.events[idx] = merged;
      state.events = state.events.filter(e => !isRetroChildOf(e, master.id));
      state.events.push(...retroSingles(merged));
    }
    state.selDate = Scope.mode === 'all' ? date : model.startDate;
    clearScope();
  } else {
    if (model.isOverride) upsertEvent(model);
    else {
      state.events = state.events.filter(e => !isRetroChildOf(e, model.id));
      upsertEvent(model);
      state.events.push(...retroSingles(model));
    }
    state.selDate = model.startDate;
  }
  Modal.model = null;
  auditLog('Evento salvo', 'finance', model.name, 'Agenda / financeiro');
  save(); closeModal('ovEvent'); renderAll();
}

/* ---------- excluir ---------- */
function deleteEvent() {
  if (Scope.masterId && Scope.instanceDate) {
    const master = state.events.find(e => e.id === Scope.masterId);
    if (!master) { clearScope(); return; }
    if ((master.rec || 'none') !== 'none') {
      if (!confirm('Excluir esta ocorrência da série?')) return;
      Object.assign(DelScope, { masterId: Scope.masterId, instanceDate: Scope.instanceDate });
      openModal('ovDelScope');
      return;
    }
  }
  const m = Modal.model;
  if (!m || !confirm('Excluir este evento?')) return;
  pushHistory();

  if (m.retroParentId || m.retroGenerated) { prepareRetroDelete(m.retroParentId, m.id); openModal('ovRetroDelScope'); return; }
  if ((m.rec || 'none') !== 'none' && !m.isOverride) { Object.assign(DelScope, { masterId: m.id, instanceDate: m.startDate }); openModal('ovDelScope'); return; }

  state.events = state.events.filter(e => e.id !== m.id);
  Modal.model = null;
  save(); closeModal('ovEvent'); renderAll();
}

function confirmDeleteScope(mode) {
  const { masterId, instanceDate } = DelScope;
  if (!masterId || !instanceDate) { closeModal('ovDelScope'); return; }
  pushHistory();
  const idx = state.events.findIndex(e => e.id === masterId);
  if (mode === 'all') state.events = state.events.filter(e => e.id !== masterId && e.seriesId !== masterId);
  else if (idx >= 0) {
    const master = clone(state.events[idx]);
    if (mode === 'single') {
      master.exceptions = [...new Set([...(master.exceptions || []), instanceDate])];
      state.events[idx] = master;
      state.events = state.events.filter(e => !(e.isOverride && e.seriesId === masterId && (e.dateISO || e.startDate) === instanceDate));
    } else {
      master.endDate = addDays(instanceDate, -1);
      state.events[idx] = master;
      state.events = state.events.filter(e => !(e.isOverride && e.seriesId === masterId && (e.dateISO || e.startDate) >= instanceDate));
    }
  }
  resetTransientScopes();
  Modal.model = null;
  save(); closeModal('ovDelScope'); closeModal('ovEvent'); renderAll();
}

function prepareRetroDelete(parentId, eventId) {
  Object.assign(RetroDel, { parentId: parentId || null, eventId: eventId || null });
  const dates = state.events.filter(e => isRetroChildOf(e, parentId)).map(e => e.startDate || '').sort();
  const clicked = state.events.find(e => e.id === eventId)?.startDate || '';
  RetroDel.startDate = clicked || dates[0] || '';
  RetroDel.endDate = clicked || dates[dates.length - 1] || '';
  $('retroDelStartDate').value = RetroDel.startDate ? dateBR(RetroDel.startDate) : '';
  $('retroDelEndDate').value = RetroDel.endDate ? dateBR(RetroDel.endDate) : '';
}

function confirmRetroDelete(mode) {
  const { parentId, eventId } = RetroDel;
  if (!parentId && !eventId) { closeModal('ovRetroDelScope'); return; }
  if (mode === 'single') state.events = state.events.filter(e => e.id !== eventId);
  else if (mode === 'all') state.events = state.events.filter(e => !isRetroChildOf(e, parentId));
  else {
    const a = anyToISO($('retroDelStartDate').value) || RetroDel.startDate, b = anyToISO($('retroDelEndDate').value) || RetroDel.endDate;
    if (!a || !b) return alert('Informe a data inicial e a data final do período específico.');
    if (a > b) return alert('No período específico, a data final não pode ser anterior à inicial.');
    state.events = state.events.filter(e => !isRetroChildOf(e, parentId) || !(a <= (e.startDate || '') && (e.startDate || '') <= b));
  }
  if (mode !== 'single' && !state.events.some(e => isRetroChildOf(e, parentId))) {
    const i = state.events.findIndex(e => e.id === parentId);
    if (i >= 0) state.events[i] = { ...state.events[i], retroMode: 'none', retroSingleDate: '', retroStartDate: '', retroEndDate: '', retroInfoDate: '' };
  }
  clearRetroDel();
  Modal.model = null;
  save(); closeModal('ovRetroDelScope'); closeModal('ovEvent'); renderAll();
}
