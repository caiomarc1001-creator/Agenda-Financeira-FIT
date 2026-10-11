/* Editor de evento: formulário, estado da edição (escopo da série, exclusões) e abertura do modal. */
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

