/* Despesas pessoais: lançamentos (com recorrência mensal e ajustes por mês) ligados ao faturamento da Agenda. */
const PersonalForm = { editingId: null };
const expenses = () => state.personalExpenses ||= [];

function personalBounds() {
  const raw = $('personalFinanceMonth').value || state.ui.personalFinanceMonth || monthKey(state.view.y, state.view.m);
  const m = String(raw).match(/^(\d{4})-(\d{2})$/) || monthKey(state.view.y, state.view.m).match(/^(\d{4})-(\d{2})$/);
  const y = +m[1], mo = +m[2] - 1;
  return { y, m: mo, key: `${m[1]}-${m[2]}`, ...monthRange(y, mo) };
}

/* Visão de uma despesa no mês: valor/status/observação podem ter ajuste específico do mês. */
function expenseView(exp, b) {
  const o = (exp.months && typeof exp.months === 'object' && exp.months[b.key]) || {}, monthly = exp.recurrence === 'monthly';
  const day = Math.max(1, Math.min(31, Number(String(exp.date || '').slice(8, 10)) || 1));
  return {
    ...exp, _id: exp.id, _key: b.key,
    _date: !exp.date ? '' : monthly ? `${b.key}-${pad2(Math.min(day, new Date(b.y, b.m + 1, 0).getDate()))}` : exp.date,
    _value: Number(o.value ?? exp.value ?? 0), _status: String(o.status ?? (monthly ? 'pending' : (exp.status || 'pending'))),
    _notes: String(o.notes ?? exp.notes ?? ''), _order: Number(o.order ?? exp.order ?? 0)
  };
}
const occursInMonth = (exp, b) => !!exp.date && (exp.recurrence === 'monthly' ? exp.date <= b.to : exp.date >= b.from && exp.date <= b.to);

function visibleExpenses() {
  const b = personalBounds(), q = $('personalExpenseSearch').value.trim().toLowerCase(), status = $('personalExpenseFilterStatus').value || 'all', sort = $('personalExpenseSort').value || state.ui.personalExpenseSort || 'manual';
  return expenses().filter(e => occursInMonth(e, b)).map(e => expenseView(e, b))
    .filter(e => status === 'all' || e._status === status)
    .filter(e => !q || [e.desc, e.category, e.notes].some(v => String(v || '').toLowerCase().includes(q)))
    .sort((a, c) => {
      const byDate = String(a._date || a.date || '').localeCompare(String(c._date || c.date || '')) || String(a.desc || '').localeCompare(String(c.desc || ''), 'pt-BR');
      return sort === 'date_asc' ? byDate : (a._order - c._order || byDate);
    });
}

function expenseHtml(e) {
  const paid = e._status === 'paid', id = escAttr(e._id);
  return `<details class="personalExpenseItem">
    <summary class="personalExpenseSummary">
      <span><b>${esc(e.desc || 'Despesa sem descrição')}</b><small>${esc(e.category || 'Sem categoria')} · vence ${dateBR(e._date || e.date)}${e.recurrence === 'monthly' ? ` · mensal · competência ${esc(e._key)}` : ''}</small></span>
      <strong>${fmtMoney(e._value)}</strong><em class="${paid ? 'paid' : 'pending'}">${paid ? 'Pago' : 'Pendente'}</em>
    </summary>
    <div class="personalExpenseDetails"><div class="helper">${esc(e._notes || 'Sem observações.')}</div>
      <div class="personalExpenseActions">
        <button class="smallBtn" type="button" data-pf="up" data-id="${id}">↑ Subir</button>
        <button class="smallBtn" type="button" data-pf="down" data-id="${id}">↓ Descer</button>
        <button class="smallBtn" type="button" data-pf="toggle" data-id="${id}">${paid ? 'Marcar pendente neste mês' : 'Marcar pago neste mês'}</button>
        <button class="smallBtn" type="button" data-pf="edit" data-id="${id}">Editar</button>
        <button class="smallBtn danger" type="button" data-pf="del" data-id="${id}">Excluir</button>
      </div></div></details>`;
}

function renderPersonal() {
  const b = personalBounds();
  if (!$('personalFinanceMonth').value) $('personalFinanceMonth').value = b.key;
  if (!$('personalExpenseSort').value) $('personalExpenseSort').value = state.ui.personalExpenseSort || 'manual';
  const month = expenses().filter(e => occursInMonth(e, b)).map(e => expenseView(e, b));
  const paid = month.filter(x => x._status === 'paid').reduce((a, x) => a + x._value, 0), pending = month.filter(x => x._status !== 'paid').reduce((a, x) => a + x._value, 0);
  const revenue = receivableTotal(b.y, b.m);
  $('personalFinanceDashboard').innerHTML = `
    <div class="personalFinanceKpi income"><span>Faturamento da Agenda</span><b>${fmtMoney(revenue)}</b><small>Receita vinculada ao mês selecionado</small></div>
    <div class="personalFinanceKpi"><span>Despesas pessoais</span><b>${fmtMoney(paid + pending)}</b><small>${month.length} despesa(s) no mês</small></div>
    <div class="personalFinanceKpi paid"><span>Pagas</span><b>${fmtMoney(paid)}</b><small>Já quitadas</small></div>
    <div class="personalFinanceKpi pending"><span>Pendentes</span><b>${fmtMoney(pending)}</b><small>Ainda em aberto</small></div>
    <div class="personalFinanceKpi balance"><span>Saldo estimado</span><b>${fmtMoney(revenue - paid - pending)}</b><small>Faturamento da Agenda - despesas pessoais</small></div>`;
  const list = visibleExpenses();
  $('personalExpenseList').innerHTML = list.length ? list.map(expenseHtml).join('') : '<div class="crmEmpty">Nenhuma despesa encontrada neste mês.</div>';
}

function clearExpenseForm() {
  PersonalForm.editingId = null;
  ['personalExpenseDesc', 'personalExpenseCategory', 'personalExpenseDate', 'personalExpenseValue', 'personalExpenseNotes'].forEach(id => { $(id).value = ''; });
  $('personalExpenseStatus').value = 'pending';
  $('personalExpenseRecurrence').value = 'none';
  $('personalExpenseSave').textContent = 'Salvar despesa';
}

/* Em despesas mensais, valor/status/observação editados valem só para o mês em exibição. */
function saveExpense() {
  const desc = $('personalExpenseDesc').value.trim(), value = Number($('personalExpenseValue').value || 0), date = $('personalExpenseDate').value;
  if (!desc) return alert('Informe a descrição da despesa.');
  if (!date) return alert('Informe o vencimento da despesa.');
  if (!(value > 0)) return alert('Informe um valor maior que zero.');
  pushHistory();
  const now = nowISO(), key = personalBounds().key, list = expenses();
  const status = $('personalExpenseStatus').value || 'pending', recurrence = $('personalExpenseRecurrence').value || 'none', notes = $('personalExpenseNotes').value.trim(), category = $('personalExpenseCategory').value.trim();
  const prev = PersonalForm.editingId ? list.find(x => x.id === PersonalForm.editingId) : null;
  const model = { id: PersonalForm.editingId || uid(), desc, category, date, value, status, recurrence, notes, updatedAt: now };

  if (!prev) {
    const created = { ...model, order: list.length ? Math.max(...list.map(x => Number(x.order || 0))) + 1 : 1, createdAt: now };
    if (recurrence === 'monthly') { created.months = { [key]: { value, status, notes, updatedAt: now } }; created.status = 'pending'; }
    list.push(created);
  } else {
    const i = list.indexOf(prev);
    if (prev.recurrence === 'monthly') {
      const baseDate = String(prev.date || date), day = date.slice(8, 10);
      const months = { ...(prev.months || {}), [key]: { ...(prev.months?.[key] || {}), value, status, notes, updatedAt: now } };
      const updated = { ...prev, months, desc, category, date: /^\d{4}-\d{2}-\d{2}$/.test(baseDate) && /^\d{2}$/.test(day) ? baseDate.slice(0, 8) + day : date, recurrence, updatedAt: now };
      if (recurrence !== 'monthly') Object.assign(updated, { value, status, notes });
      list[i] = updated;
    } else {
      const updated = { ...prev, ...model };
      if (recurrence === 'monthly') { updated.months = { ...(updated.months || {}), [key]: { ...(updated.months?.[key] || {}), value, status, notes, updatedAt: now } }; updated.status = 'pending'; }
      list[i] = updated;
    }
  }
  save(); clearExpenseForm(); renderPersonal();
}

function editExpense(id) {
  const exp = expenses().find(x => x.id === id);
  if (!exp) return;
  const v = expenseView(exp, personalBounds());
  PersonalForm.editingId = id;
  $('personalExpenseDesc').value = exp.desc || '';
  $('personalExpenseCategory').value = exp.category || '';
  $('personalExpenseDate').value = v._date || exp.date || '';
  $('personalExpenseValue').value = v._value;
  $('personalExpenseStatus').value = v._status || 'pending';
  $('personalExpenseRecurrence').value = exp.recurrence || 'none';
  $('personalExpenseNotes').value = v._notes || '';
  $('personalExpenseSave').textContent = exp.recurrence === 'monthly' ? 'Atualizar este mês' : 'Atualizar despesa';
  $('personalFinancePageCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function toggleExpensePaid(id) {
  const exp = expenses().find(x => x.id === id);
  if (!exp) return;
  pushHistory();
  if (exp.recurrence === 'monthly') {
    exp.months ||= {};
    const o = exp.months[personalBounds().key] ||= {};
    o.status = String(o.status || 'pending') === 'paid' ? 'pending' : 'paid';
    o.updatedAt = nowISO();
  } else exp.status = String(exp.status || 'pending') === 'paid' ? 'pending' : 'paid';
  exp.updatedAt = nowISO();
  save(); renderPersonal();
}

function moveExpense(id, dir) {
  expenses().forEach((e, i) => { if (!(Number(e.order) > 0)) e.order = i + 1; });
  state.ui.personalExpenseSort = 'manual';
  $('personalExpenseSort').value = 'manual';
  const ids = visibleExpenses().map(e => e._id), i = ids.indexOf(id), t = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || t < 0 || t >= ids.length) return;
  const a = expenses().find(e => e.id === ids[i]), b = expenses().find(e => e.id === ids[t]);
  if (!a || !b) return;
  pushHistory();
  [a.order, b.order] = [Number(b.order || t + 1), Number(a.order || i + 1)];
  save(); renderPersonal();
}

function deleteExpense(id) {
  const exp = expenses().find(x => x.id === id);
  if (!exp || !confirm(`Excluir a despesa "${exp.desc || 'sem descrição'}"?`)) return;
  pushHistory();
  state.personalExpenses = expenses().filter(x => x.id !== id);
  save(); renderPersonal();
}

const EXPENSE_ACTIONS = { up: id => moveExpense(id, 'up'), down: id => moveExpense(id, 'down'), toggle: toggleExpensePaid, edit: editExpense, del: deleteExpense };
function onExpenseAction(e) {
  const btn = e.target.closest('[data-pf]');
  if (btn) EXPENSE_ACTIONS[btn.dataset.pf](btn.dataset.id);
}

function useAgendaMonth() {
  const v = monthKey(state.view.y, state.view.m);
  $('personalFinanceMonth').value = v;
  state.ui.personalFinanceMonth = v;
  save(); renderPersonal();
}
