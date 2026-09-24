/* Barra lateral financeira: valores a receber, contas a pagar, painéis recolhíveis e editores de regras. */
const PANELS = [['summaryBody', 'btnToggleSummary', 'summaryCollapsed'], ['paymentsBody', 'btnTogglePayments', 'paymentsCollapsed'], ['payablesBody', 'btnTogglePayables', 'payablesCollapsed'], ['surgeriesBody', 'btnToggleSurgeries', 'surgeriesCollapsed']];

function applyPanels() {
  PANELS.forEach(([body, btn, key]) => {
    const collapsed = !!state.ui[key];
    $(body).style.display = collapsed ? 'none' : '';
    $(btn).textContent = collapsed ? 'Expandir' : 'Recolher';
  });
}
function togglePanel(key) { state.ui[key] = !state.ui[key]; save(); applyPanels(); }

/* Linha (instituição) de valores a receber / contas a pagar, com detalhe recolhível. */
function ruleRowHtml(row, kind) {
  const payable = kind === 'payable';
  const bag = payable ? 'payableRowsCollapsed' : 'paymentRowsCollapsed';
  const key = `${payable ? 'payable' : 'rule'}:${row.name}:${row.payDate}:${row.from}:${row.to}`;
  const collapsed = !!state.ui[bag][key];
  const items = row.items.map(i => `<div class="small rowItem"><b>${dateBR(i.date)}</b> • ${esc(i.type)} • ${esc(i.time)} • ${fmtHours(i.hours)} • ${fmtMoney(i.total)}${payable && i.note ? ` • ${esc(i.note)}` : ''}</div>`).join('');
  return `<div class="payRow${payable ? ' payable' : ''}">
    <div class="payRowTop"><div class="a">${esc(row.name)}</div>
      <div class="rowTools"><button class="smallBtn" type="button" data-row-toggle="${kind}" data-key="${escAttr(key)}">${collapsed ? 'Expandir' : 'Recolher'}</button><div class="b">${fmtMoney(row.total)}</div></div></div>
    <div class="small"><b>${payable ? 'Vencimento' : 'Pagamento'}:</b> ${dateBR(row.payDate)} • <b>Competência:</b> ${dateBR(row.from)} → ${dateBR(row.to)} • <b>${payable ? 'Contas' : 'Eventos'}:</b> ${row.count} • <b>Horas:</b> ${fmtHours(row.hours)}</div>
    <div class="rowBody" style="display:${collapsed ? 'none' : 'block'}">${items}</div></div>`;
}

function toggleRow(kind, key) {
  const bag = kind === 'payable' ? 'payableRowsCollapsed' : 'paymentRowsCollapsed';
  state.ui[bag][key] = !state.ui[bag][key];
  save();
  kind === 'payable' ? renderPayables() : renderPayments();
}

function renderPayments() {
  const host = $('payList'), { y, m } = state.view;
  let html = '', total = 0;
  if (!state.payRules.length) html = '<div class="helper">Cadastre regras em “Regras de pagamento”. O painel “Valores a receber” segue exclusivamente essas regras.</div>';
  else {
    const rows = ruleRows(state.payRules, 'receivable', y, m, { positiveOnly: true });
    total = rows.reduce((s, r) => s + r.total, 0);
    html = rows.length ? rows.map(r => ruleRowHtml(r, 'receivable')).join('') : '<div class="helper">Nenhuma instituição com valor a receber neste mês conforme as regras de pagamento cadastradas.</div>';
  }
  host.innerHTML = html;
  $('paySum').textContent = fmtMoney(total);
}

function renderPayables() {
  const host = $('payablesList'), { y, m } = state.view, { from, to } = monthRange(y, m);
  let total = 0, html = '';
  if (state.payableRules.some(r => String(r.name || '').trim())) {
    const rows = ruleRows(state.payableRules, 'payable', y, m);
    total = rows.reduce((s, r) => s + r.total, 0);
    html = rows.length ? rows.map(r => ruleRowHtml(r, 'payable')).join('') : '<div class="helper">Nenhuma conta a pagar para este mês conforme as regras cadastradas. Confira a instituição/local, a competência e os eventos marcados como “A pagar”.</div>';
  } else {
    const items = occurrencesBetween(from, to).filter(isPayable)
      .map(o => ({ date: o.startDate, name: o.name || 'Conta a pagar', type: typeLabel(o.type), time: o.time || '—', hours: eventHours(o), total: eventTotal(o), note: o.note || '' }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
    total = items.reduce((s, i) => s + i.total, 0);
    html = items.length ? items.map(i => `<div class="payRow payable">
      <div class="payRowTop"><div class="a">${esc(i.name)}</div><div class="b">${fmtMoney(i.total)}</div></div>
      <div class="small"><b>Vencimento/Data:</b> ${dateBR(i.date)} • <b>Tipo:</b> ${esc(i.type)} • <b>Horário:</b> ${esc(i.time)} • <b>Horas:</b> ${fmtHours(i.hours)}${i.note ? `<br><b>Obs.:</b> ${esc(i.note)}` : ''}</div></div>`).join('')
      : '<div class="helper">Nenhuma conta a pagar cadastrada neste mês. Ao criar um evento, marque “Natureza financeira: A pagar”. Para vencimentos por competência, cadastre uma regra de conta em “Regras de pagamento”.</div>';
  }
  host.innerHTML = html;
  $('payableSum').textContent = fmtMoney(total);

  const show = !!state.ui.showNetBalance;
  $('netBalanceBox').style.display = show ? '' : 'none';
  $('netBalanceBox').innerHTML = `<b>Saldo líquido opcional:</b> ${fmtMoney(receivableTotal(y, m) - total)} <br><span class="muted">Receitas menos contas a pagar. Esse botão é apenas visual e não altera os valores a receber por regras.</span>`;
  $('btnToggleNetBalance').textContent = show ? 'Ocultar saldo' : 'Abater no saldo';
}

/* ---------- editores de regras (trabalham em cópia até "Salvar") ---------- */
const PAY_TYPES = [['day', 'Dia fixo'], ['last', 'Último dia do mês'], ['nthBusinessDay', 'Nº dia útil'], ['lastBusinessDay', 'Último dia útil']];

function ruleCardHtml(r, kind) {
  const payable = kind === 'payable', type = r.payType || 'day';
  const showDay = type === 'day' || type === 'nthBusinessDay';
  return `<div class="payRow${payable ? ' payable' : ''}" data-id="${escAttr(r.id)}">
    <div class="payRowTop"><div class="a">${payable ? 'Conta / Instituição' : 'Instituição'}</div><button class="smallBtn danger" type="button" data-remove>Remover</button></div>
    <div class="row2 mt10">
      <div><div class="lbl">Nome</div><input class="input" data-k="name" list="dlHospitals" value="${escAttr(r.name || '')}" placeholder="Ex: Hospital Regional"></div>
      <div><div class="lbl">Dia do pagamento</div><select class="input" data-k="payType">${PAY_TYPES.map(([v, t]) => `<option value="${v}"${v === type ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
    </div>
    <div class="row2 mt10">
      <div data-role="dayBox" style="${showDay ? '' : 'display:none'}"><div class="lbl" data-role="dayLabel">${type === 'nthBusinessDay' ? 'Nº do dia útil' : 'Número do dia'}</div><input class="input" data-k="payDay" type="number" min="1" max="31" step="1" value="${escAttr(String(r.payDay || 18))}"></div>
      <div class="helper"><b>Competência:</b> se início ≤ fim → mês anterior. Se início > fim → cruza 2 meses.</div>
    </div>
    <div class="row2 mt10">
      <div><div class="lbl">Dia início da competência</div><input class="input" data-k="compStart" type="number" min="1" max="31" step="1" value="${escAttr(String(r.compStart || 1))}"></div>
      <div><div class="lbl">Dia fim da competência</div><input class="input" data-k="compEnd" type="number" min="1" max="31" step="1" value="${escAttr(String(r.compEnd || 31))}"></div>
    </div></div>`;
}

const RULE_HOSTS = { receivable: ['rulesHost', 'Nenhuma instituição cadastrada ainda.'], payable: ['payableRulesHost', 'Nenhuma regra de conta a pagar cadastrada ainda.'] };
function fillRuleHost(kind, rules) {
  const [id, empty] = RULE_HOSTS[kind];
  $(id).innerHTML = rules.length ? rules.map(r => ruleCardHtml(r, kind)).join('') : `<div class="helper">${empty}</div>`;
}
const newRule = () => ({ id: uid(), name: '', payType: 'day', payDay: 18, compStart: 1, compEnd: 31 });

function openRules() {
  fillRuleHost('receivable', state.payRules);
  fillRuleHost('payable', state.payableRules);
  openModal('ovPay');
}
function addRule(kind) {
  const [id] = RULE_HOSTS[kind], host = $(id);
  host.querySelector('.helper')?.remove();
  host.insertAdjacentHTML('beforeend', ruleCardHtml(newRule(), kind));
}
function collectRules(kind) {
  const [id, empty] = RULE_HOSTS[kind];
  return $$('.payRow', $(id)).map(card => {
    const v = k => card.querySelector(`[data-k="${k}"]`)?.value;
    return {
      id: card.dataset.id || uid(), name: String(v('name') || '').trim(), payType: String(v('payType') || 'day'),
      payDay: clamp(parseInt(v('payDay') || 18, 10), 1, 31), compStart: clamp(parseInt(v('compStart') || 1, 10), 1, 31), compEnd: clamp(parseInt(v('compEnd') || 31, 10), 1, 31)
    };
  }).filter(r => r.name);
}
function saveRules() {
  state.payRules = collectRules('receivable');
  state.payableRules = collectRules('payable');
  save(); closeModal('ovPay'); renderPayments(); renderPayables(); renderCatalogs();
}
/* Clique em "Remover" e mudança do tipo de pagamento dentro dos cartões de regra. */
function bindRuleHost(id) {
  const host = $(id);
  host.addEventListener('click', e => {
    if (!e.target.closest('[data-remove]')) return;
    e.target.closest('.payRow').remove();
    if (!host.querySelector('.payRow')) host.innerHTML = `<div class="helper">${id === 'rulesHost' ? RULE_HOSTS.receivable[1] : RULE_HOSTS.payable[1]}</div>`;
  });
  host.addEventListener('change', e => {
    if (e.target.dataset.k !== 'payType') return;
    const card = e.target.closest('.payRow'), v = e.target.value;
    card.querySelector('[data-role="dayBox"]').style.display = (v === 'day' || v === 'nthBusinessDay') ? '' : 'none';
    card.querySelector('[data-role="dayLabel"]').textContent = v === 'nthBusinessDay' ? 'Nº do dia útil' : 'Número do dia';
  });
}

/* ---------- regras de bonificação ---------- */
function bonusCardHtml(r) {
  const opts = [['', 'Todos'], ...Object.entries(TYPE_LABELS)].map(([v, t]) => `<option value="${v}"${r.serviceType === v ? ' selected' : ''}>${t}</option>`).join('');
  return `<div class="payRow" data-id="${escAttr(r.id)}">
    <div class="payRowTop"><div class="a">Regra de bonificação</div><button class="smallBtn danger" type="button" data-remove>Remover</button></div>
    <div class="row2 mt10">
      <div><div class="lbl">Instituição (opcional)</div><input class="input" data-k="locationName" list="dlHospitals" value="${escAttr(r.locationName || '')}" placeholder="Ex: Hospital Regional"></div>
      <div><div class="lbl">Tipo (opcional)</div><select class="input" data-k="serviceType">${opts}</select></div>
    </div>
    <div class="row3 mt10">
      <div><div class="lbl">Início</div><input class="input" data-k="startTime" value="${escAttr(r.startTime || '')}" placeholder="18:00"></div>
      <div><div class="lbl">Fim</div><input class="input" data-k="endTime" value="${escAttr(r.endTime || '')}" placeholder="06:00"></div>
      <div><div class="lbl">Percentual</div><input class="input" data-k="percentage" type="number" min="0" step="0.01" value="${Number(r.percentage || 0)}"></div>
    </div>
    <div class="row2 mt10">
      <div><div class="lbl">Data específica (opcional)</div><input class="input" data-k="applyDate" type="date" value="${escAttr(r.applyDate || '')}"></div>
      <div class="helper">A bonificação é aplicada apenas nas horas que coincidirem com essa faixa horária.</div>
    </div></div>`;
}
const EMPTY_BONUS = '<div class="helper">Nenhuma regra de bonificação cadastrada ainda.</div>';
function openBonus() {
  $('bonusRulesHost').innerHTML = state.bonusRules.length ? state.bonusRules.map(bonusCardHtml).join('') : EMPTY_BONUS;
  openModal('ovBonusRules');
}
function addBonus() {
  const host = $('bonusRulesHost');
  host.querySelector('.helper')?.remove();
  host.insertAdjacentHTML('beforeend', bonusCardHtml({ id: uid(), locationName: '', serviceType: '', startTime: '', endTime: '', percentage: 0, applyDate: '' }));
}
function saveBonus() {
  state.bonusRules = $$('.payRow', $('bonusRulesHost')).map(card => {
    const v = k => card.querySelector(`[data-k="${k}"]`)?.value || '';
    return { id: card.dataset.id || uid(), locationName: v('locationName').trim(), serviceType: v('serviceType'), startTime: v('startTime').trim(), endTime: v('endTime').trim(), percentage: Number(v('percentage') || 0), applyDate: v('applyDate') };
  }).filter(r => r.percentage > 0 && r.startTime && r.endTime);
  save(); closeModal('ovBonusRules'); renderPayments(); renderCalendar(); renderSummary();
}
function bindBonusHost() {
  $('bonusRulesHost').addEventListener('click', e => {
    if (!e.target.closest('[data-remove]')) return;
    e.target.closest('.payRow').remove();
    if (!$('bonusRulesHost').querySelector('.payRow')) $('bonusRulesHost').innerHTML = EMPTY_BONUS;
  });
}
