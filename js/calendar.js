/* Calendário mensal: grade de dias, resumo do mês, troca de mês e opção de ocultar eventos. */
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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
  $('sidePrev').title = `Mês anterior: ${monthShort(prev.y, prev.m)} / ${prev.y}`;
  $('sideNext').title = `Próximo mês: ${monthShort(next.y, next.m)} / ${next.y}`;

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

