/* Operações sobre eventos: retroativos, cópias para datas específicas, salvar e excluir (com escopo da série). */
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
