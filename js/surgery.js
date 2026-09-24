/* Controle cirúrgico: cadastro, filtros, cartões, retrospecto e Modo Cirurgião. */
const SurgeryForm = { editingId: null };
const surgeryClass = status => status === 'paid' ? 'paid' : 'unpaid';
const surgeryStatusLabel = status => status === 'paid' ? 'Pago' : 'Não Pago';
const surgeryRoleLabel = role => role === 'auxiliar' ? 'Auxiliar' : 'Cirurgião principal';
const surgeryReceived = s => Number(s.receivedAmount || s.amount || 0);
const surgeryPending = s => Math.max(0, Number(s.amount || 0) - Number(s.receivedAmount || 0));

const surgeriesOn = date => state.surgeries.filter(s => String(s.date || '') === date).sort((a, b) => String(a.patientName || '').localeCompare(String(b.patientName || '')));

function filteredSurgeries() {
  const v = id => $(id)?.value || '';
  const search = v('surgerySearch').trim().toLowerCase(), status = v('surgeryStatusFilter') || 'all', category = v('surgeryCategoryFilter') || 'all', role = v('surgeryRoleFilter') || 'all';
  const from = v('surgeryPeriodFrom'), to = v('surgeryPeriodTo'), hospital = v('surgeryHospitalFilter').trim().toLowerCase();
  return state.surgeries.filter(s => {
    const d = String(s.date || '');
    if ((from && d < from) || (to && d > to)) return false;
    if (status !== 'all' && surgeryClass(s.paymentStatus) !== status) return false;
    if (category !== 'all' && s.paymentType !== category) return false;
    if (role !== 'all' && s.role !== role) return false;
    if (hospital && !String(s.hospital || '').toLowerCase().includes(hospital)) return false;
    return !search || [s.patientName, s.attendanceNumber, s.birthDate, s.procedures, s.paymentType, s.insuranceProvider, s.healthPlan, s.hospital, s.role, s.paymentStatus, s.notes].join(' ').toLowerCase().includes(search);
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.patientName || '').localeCompare(String(b.patientName || '')));
}

function surgeryCard(s, compact) {
  const status = surgeryClass(s.paymentStatus), paid = status === 'paid';
  const amount = Number(s.amount || 0), received = Number(s.receivedAmount || (paid ? amount : 0) || 0), diff = Math.max(0, amount - received);
  const conv = s.paymentType === 'particular' ? 'Particular' : `Convênio${s.insuranceProvider ? ' · ' + esc(s.insuranceProvider) : ''}${s.healthPlan ? ' · ' + esc(s.healthPlan) : ''}`;
  const timeline = [s.date && `Cirurgia: ${dateBR(s.date)}`, s.paidDate && `Pago: ${dateBR(s.paidDate)}`].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('');
  const id = escAttr(s.id);
  return `<div class="surgeryRow">
    <div class="surgeryRowTop">
      <div><div class="surgeryPatient">${esc(s.patientName || 'Paciente sem nome')}</div>
        <div class="surgeryMeta"><b>${dateBR(s.date)}</b> • ${esc(s.hospital || 'Hospital não informado')} • ${surgeryRoleLabel(s.role)}<br>Atend.: ${esc(s.attendanceNumber || '—')} • ${conv}${compact ? '' : `<br>Proced.: ${esc(s.procedures || '—')}`}</div></div>
      <div class="payBadge ${status}">${paid ? '●' : '○'} ${surgeryStatusLabel(status)}${amount ? ' · ' + fmtMoney(amount) : ''}</div>
    </div>
    <div class="surgeryMoneyLine"><span>Previsto: <b>${fmtMoney(amount)}</b></span><span>Recebido: <b>${fmtMoney(received)}</b></span>${diff ? `<span>Diferença: <b>${fmtMoney(diff)}</b></span>` : ''}</div>
    ${timeline ? `<div class="surgeryTimeline">${timeline}</div>` : ''}
    ${!compact && s.birthDate ? `<div class="small"><b>Nascimento:</b> ${esc(dateBR(s.birthDate))}</div>` : ''}
    <div class="surgeryActions">
      <button class="smallBtn" type="button" data-surg="pay" data-id="${id}">Marcar como ${paid ? 'não pago' : 'pago'}</button>
      <button class="smallBtn" type="button" data-surg="edit" data-id="${id}">Editar</button>
      ${compact ? '<button class="smallBtn" type="button" data-surg="open">Abrir central</button>' : `<button class="smallBtn danger" type="button" data-surg="delete" data-id="${id}">Excluir</button>`}
    </div></div>`;
}

function renderSurgeryPanel() {
  const { from, to } = monthRange(state.view.y, state.view.m);
  const month = state.surgeries.filter(s => String(s.date || '') >= from && String(s.date || '') <= to);
  const open = month.filter(s => surgeryClass(s.paymentStatus) !== 'paid');
  $('surgCountMonth').textContent = month.length;
  $('surgPendingMonth').textContent = open.length;
  $('surgPaidValue').textContent = fmtMoney(month.filter(s => s.paymentStatus === 'paid').reduce((a, s) => a + surgeryReceived(s), 0));
  $('surgUnpaidValue').textContent = fmtMoney(open.reduce((a, s) => a + surgeryPending(s), 0));

  const paidAll = state.surgeries.filter(s => s.paymentStatus === 'paid'), unpaidAll = state.surgeries.filter(s => s.paymentStatus !== 'paid');
  $('surgAllPaidValue').textContent = fmtMoney(paidAll.reduce((a, s) => a + surgeryReceived(s), 0));
  $('surgAllUnpaidValue').textContent = fmtMoney(unpaidAll.reduce((a, s) => a + surgeryPending(s), 0));
  $('surgAllPaidCount').textContent = paidAll.length;
  $('surgAllUnpaidCount').textContent = unpaidAll.length;

  const preview = $('surgeryPreviewList');
  if (state.ui.surgeonMode) {
    const sel = state.selDate || todayISO(), day = surgeriesOn(sel);
    preview.innerHTML = `<div class="surgeryDateTitle">Pacientes operados em ${dateBR(sel)}</div>` +
      (day.length ? day.map(s => surgeryCard(s, false)).join('') : '<div class="helper">Nenhuma cirurgia cadastrada nesta data. Use “Nova cirurgia” para cadastrar um paciente operado nesta data.</div>');
  } else {
    const recent = [...month].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 3);
    preview.innerHTML = recent.length ? recent.map(s => surgeryCard(s, true)).join('') : '<div class="helper">Nenhum paciente operado cadastrado neste mês. Clique em “Modo Cirurgião” para iniciar o controle.</div>';
  }

  const items = filteredSurgeries();
  $('surgeryFullList').innerHTML = items.length ? items.map(s => surgeryCard(s, false)).join('') : '<div class="helper">Nenhum registro encontrado para os filtros atuais.</div>';
  $('surgeryReportSummary').innerHTML = `<b>${items.length}</b> cirurgia(s) encontrada(s) com os filtros atuais.`;
}

/* ---------- formulário ---------- */
const SURG_FIELDS = { surgPatient: 'patientName', surgBirthDate: 'birthDate', surgAttendance: 'attendanceNumber', surgProcedures: 'procedures', surgPaymentType: 'paymentType', surgInsurance: 'insuranceProvider', surgHealthPlan: 'healthPlan', surgHospital: 'hospital', surgRole: 'role', surgPaidDate: 'paidDate', surgNotes: 'notes' };

function clearSurgeryForm() {
  SurgeryForm.editingId = null;
  Object.keys(SURG_FIELDS).forEach(id => { $(id).value = ''; });
  $('surgPaymentType').value = 'convenio';
  $('surgRole').value = 'principal';
  $('surgPaymentStatus').value = 'unpaid';
  $('surgDate').value = state.selDate || todayISO();
  $('surgAmount').value = $('surgReceivedAmount').value = '';
}
function openSurgeryCenter(fresh) { if (fresh) clearSurgeryForm(); renderSurgeryPanel(); openModal('ovSurgeryCenter'); }
function openSurgeryOn(date) {
  state.selDate = date || state.selDate || todayISO();
  save(); clearSurgeryForm(); $('surgDate').value = state.selDate;
  renderCalendar(); renderSurgeryPanel(); openModal('ovSurgeryCenter');
}

function saveSurgery() {
  const patientName = $('surgPatient').value.trim();
  if (!patientName) return alert('Informe o nome do paciente.');
  const particular = $('surgPaymentType').value === 'particular';
  const model = {
    id: SurgeryForm.editingId || uid(), date: $('surgDate').value || todayISO(), patientName, birthDate: $('surgBirthDate').value || '',
    attendanceNumber: $('surgAttendance').value.trim(), procedures: $('surgProcedures').value.trim(), paymentType: $('surgPaymentType').value,
    insuranceProvider: particular ? '' : $('surgInsurance').value.trim(), healthPlan: particular ? '' : $('surgHealthPlan').value.trim(),
    hospital: $('surgHospital').value.trim(), role: $('surgRole').value, amount: Number($('surgAmount').value || 0), receivedAmount: Number($('surgReceivedAmount').value || 0),
    paidDate: $('surgPaidDate').value || '', paymentStatus: $('surgPaymentStatus').value === 'paid' ? 'paid' : 'unpaid', notes: $('surgNotes').value.trim(), updatedAt: new Date().toISOString()
  };
  const i = state.surgeries.findIndex(s => s.id === model.id);
  if (i >= 0) state.surgeries[i] = model; else state.surgeries.push(model);
  auditLog('Cirurgia salva', 'surgery', patientName, 'Controle cirúrgico');
  save(); clearSurgeryForm(); renderSurgeryPanel(); renderCalendar();
}

function editSurgery(id) {
  const s = state.surgeries.find(x => x.id === id);
  if (!s) return;
  SurgeryForm.editingId = id;
  Object.entries(SURG_FIELDS).forEach(([field, key]) => { $(field).value = s[key] || ''; });
  $('surgDate').value = s.date || todayISO();
  $('surgPaymentType').value = s.paymentType || 'convenio';
  $('surgRole').value = s.role || 'principal';
  $('surgAmount').value = Number(s.amount || 0) || '';
  $('surgReceivedAmount').value = Number(s.receivedAmount || 0) || '';
  $('surgPaymentStatus').value = surgeryClass(s.paymentStatus);
  openModal('ovSurgeryCenter');
}

function toggleSurgeryPaid(id) {
  const s = state.surgeries.find(x => x.id === id);
  if (!s) return;
  if (s.paymentStatus === 'paid') { s.paymentStatus = 'unpaid'; s.paidDate = ''; }
  else { s.paymentStatus = 'paid'; s.receivedAmount = Number(s.receivedAmount || 0) || Number(s.amount || 0) || 0; s.paidDate = s.paidDate || todayISO(); }
  s.updatedAt = new Date().toISOString();
  save(); renderSurgeryPanel(); renderCalendar();
}

function deleteSurgery(id) {
  const s = state.surgeries.find(x => x.id === id);
  if (!s || !confirm(`Excluir o registro cirúrgico de ${s.patientName || 'paciente'}?`)) return;
  state.surgeries = state.surgeries.filter(x => x.id !== id);
  save(); renderSurgeryPanel(); renderCalendar();
}

function onSurgeryAction(e) {
  const btn = e.target.closest('[data-surg]');
  if (!btn) return;
  const { surg, id } = btn.dataset;
  if (surg === 'pay') toggleSurgeryPaid(id);
  else if (surg === 'edit') editSurgery(id);
  else if (surg === 'delete') deleteSurgery(id);
  else openSurgeryCenter(false);
}

/* ---------- modos de tela ---------- */
function applySurgeonMode() {
  const on = !!state.ui.surgeonMode, btn = $('btnNewSurgery');
  document.body.classList.toggle('surgeon-mode', on);
  btn.textContent = on ? 'Sair do Modo Cirurgião' : 'Modo Cirurgião';
  btn.classList.toggle('modeActive', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}
function toggleSurgeonMode() {
  state.ui.surgeonMode = !state.ui.surgeonMode;
  if (state.ui.surgeonMode) { state.ui.crmMode = false; state.ui.personalFinanceMode = false; state.ui.surgeriesCollapsed = false; state.selDate ||= todayISO(); }
  save(); renderAll();
}
