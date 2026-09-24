/* Pacientes & Leads (Controle Comercial): cadastro, recontatos, alertas, relatórios por médico e indicadores. */
const CRMForm = { editingId: null, tab: 'patient' };
const crmItem = id => state.crm.find(x => x.id === id);
const nowISO = () => new Date().toISOString();
const daysUntil = date => date ? Math.ceil((parseISO(date) - parseISO(todayISO())) / 86400000) : null;

const CRM_CONVERTED = ['ativo', 'renovacao', 'expirado', 'convertido'];
const crmStatusLabel = s => CRM_CONVERTED.includes(s) ? 'Paciente convertido' : (['novo', 'negociacao', 'recontatar', 'sem_resposta', 'perdido', 'nao_convertido'].includes(s) ? 'Paciente não convertido' : (s || '—'));

function packageEnd(item) {
  if (!item.packageStart || !Number(item.packageMonths || 0)) return '';
  const d = parseISO(item.packageStart);
  d.setMonth(d.getMonth() + Number(item.packageMonths));
  return iso(d);
}
function crmIsDue(item) { const d = daysUntil(item.nextContact); return d !== null && d <= Number(item.reminderDays || 0); }
function crmDueText(item) {
  if (!item.nextContact) return 'Sem lembrete';
  const d = daysUntil(item.nextContact);
  return d < 0 ? `Atrasado há ${Math.abs(d)} dia(s)` : d === 0 ? 'Recontatar hoje' : `Faltam ${d} dia(s)`;
}
function crmPackageText(item) {
  if (item.type !== 'patient') return item.statusLabel || crmStatusLabel(item.status || 'novo');
  const end = packageEnd(item);
  if (!end) return item.packageName || 'Sem pacote definido';
  const d = daysUntil(end);
  return d < 0 ? `Pacote expirado há ${Math.abs(d)} dia(s)` : `${item.packageName || 'Pacote'} · faltam ${d} dia(s)`;
}
function crmBadgeClass(item) {
  if (crmIsDue(item)) return 'bad';
  if (item.type === 'lead') return item.status === 'perdido' ? 'bad' : (item.status === 'recontatar' || item.status === 'sem_resposta') ? 'warn' : item.status === 'convertido' ? 'good' : 'info';
  const end = packageEnd(item), d = end ? daysUntil(end) : null;
  return d !== null && d < 0 ? 'bad' : d !== null && d <= 30 ? 'warn' : 'good';
}
const crmDoctors = item => [...new Set([item?.doctor, ...(item?.additionalDoctors || [])].map(x => String(x || '').trim()).filter(Boolean))];
const crmDoctorName = item => (item.doctor || '').trim() || 'Médico não informado';
const crmDay = v => { if (!v) return ''; const s = String(v); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const d = new Date(s); return isNaN(d) ? '' : iso(d); };
const crmSpent = item => Number(item.totalSpent ?? item.amountPaid ?? 0);

/* ---------- timeline e auditoria ---------- */
function timelinePush(item, type, text) {
  if (!item) return;
  item.timeline = [...(Array.isArray(item.timeline) ? item.timeline : []), { at: nowISO(), type: String(type || 'evento'), text: String(text || '') }].slice(-100);
}
function ensureTimeline(item) {
  item.timeline = Array.isArray(item.timeline) ? item.timeline : [];
  if (item.timeline.length) return;
  const add = (at, type, text) => at && item.timeline.push({ at, type, text });
  add(item.createdAt, 'cadastro', item.type === 'lead' ? 'Lead criado' : 'Paciente criado');
  add(item.firstContact, 'contato', 'Primeiro contato registrado');
  add(item.lastContact, 'contato', 'Último contato registrado');
  add(item.packageStart, 'pacote', 'Início do pacote / acompanhamento');
  add(item.convertedAt, 'conversao', 'Lead convertido em paciente');
  add(item.repositionedAt, 'reposicionado', 'Reposicionado como lead não convertido');
}
function timelineHtml(item) {
  ensureTimeline(item);
  const audits = (state.auditLog || []).filter(x => x.targetId && x.targetId === item.id).slice(0, 6).map(x => ({ at: x.at, type: x.entity, text: x.action + (x.details ? ' · ' + x.details : '') }));
  const items = [...item.timeline, ...audits].filter(x => x && (x.at || x.text)).sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))).slice(-10);
  return items.length ? `<div class="agoraTimelineFull"><div class="agoraTimelineTitle">Timeline do paciente / lead</div><div class="agoraTimelineList">${items.map(x => `<div class="agoraTimelineItem"><div class="agoraTimelineDate">${esc(dateTimeBR(x.at))}</div><div class="agoraTimelineText">${esc(x.text || x.type || 'Registro')}</div></div>`).join('')}</div></div>` : '';
}
function auditLog(action, entity, target, details, targetId) {
  state.auditLog = [{ id: uid(), at: nowISO(), user: (user && (user.displayName || user.email)) || 'Usuário local', action: String(action || ''), entity: String(entity || 'geral'), target: String(target || ''), targetId: String(targetId || ''), details: String(details || '') }, ...(state.auditLog || [])].slice(0, 500);
}

/* ---------- cartões ---------- */
function crmCard(item) {
  const cls = crmBadgeClass(item), end = packageEnd(item), id = escAttr(item.id), lead = item.type === 'lead';
  const contacts = (item.contactHistory || []).slice(-8).map(h => h.at ? new Date(h.at).toLocaleDateString('pt-BR') : '').filter(Boolean);
  const badges = [`<span class="crmBadge ${cls}">${lead ? 'Lead' : 'Paciente'} · ${esc(crmStatusLabel(item.status))}</span>`];
  if (item.origin) badges.push(`<span class="crmBadge info">Origem: ${esc(item.origin)}</span>`);
  if (crmIsDue(item)) badges.push(`<span class="crmBadge bad">🔔 ${esc(crmDueText(item))}</span>`);
  else if (item.nextContact) badges.push(`<span class="crmBadge warn">${esc(crmDueText(item))}</span>`);
  if (!lead && end) { const left = daysUntil(end); if (left !== null && left <= 30) badges.push(`<span class="crmBadge warn">⚠ Pacote ${left < 0 ? 'expirado há ' + Math.abs(left) + ' dia(s)' : 'vence em ' + left + ' dia(s)'}</span>`); }
  return `<details class="crmCard ${crmIsDue(item) ? 'crmDueLate' : ''}">
    <summary class="crmCardSummary">
      <div><div class="crmName">${esc(item.name || 'Sem nome')}</div><div class="crmMeta">${esc(item.phone || 'Sem WhatsApp')} · ${esc(item.doctor || 'Médico não definido')}<br>${esc(item.interest || item.procedures || 'Sem interesse/procedimento definido')}</div></div>
      <div class="crmBadgeRow">${badges.join('')}</div><span class="crmExpandHint" aria-hidden="true"></span>
    </summary>
    <div class="crmCardDetails">
      <div class="crmTimeline">
        <div class="crmTimeBox"><div class="k">${lead ? 'Próximo recontato' : 'Retorno / consulta'}</div><div class="v">${item.nextContact ? dateBR(item.nextContact) : '—'}</div></div>
        <div class="crmTimeBox"><div class="k">Pacote</div><div class="v">${esc(crmPackageText(item))}</div></div>
        <div class="crmTimeBox"><div class="k">Fim pacote</div><div class="v">${end ? dateBR(end) : '—'}</div></div>
        <div class="crmTimeBox"><div class="k">Total gasto</div><div class="v">${fmtMoney(crmSpent(item))}</div></div>
      </div>
      <div class="crmMeta mt8"><b>Recontatos registrados:</b> ${(item.contactHistory || []).length}${contacts.length ? ` (${esc(contacts.join(', '))})` : ''}${item.lastConsultation ? ` · Última consulta: ${dateBR(item.lastConsultation)}` : ''}${item.additionalDoctors?.length ? ` · Outros médicos: ${esc(item.additionalDoctors.join(', '))}` : ''}</div>
      ${item.repositionedAt ? `<div class="crmRepositionNote">Paciente reposicionado como lead não convertido em ${esc(dateBR(String(item.repositionedAt).slice(0, 10)))}.</div>` : ''}
      ${item.notes ? `<div class="crmMeta mt10"><b>Obs.:</b> ${esc(item.notes)}</div>` : ''}
      ${timelineHtml(item)}
      <div class="crmActions">
        <button class="smallBtn whatsapp" type="button" data-crm="whatsapp" data-id="${id}">📲 WhatsApp</button>
        <button class="smallBtn" type="button" data-crm="edit" data-id="${id}">Editar</button>
        <button class="smallBtn" type="button" data-crm="next" data-id="${id}">Reagendar contato</button>
        ${lead ? `<button class="smallBtn primary" type="button" data-crm="convert" data-id="${id}">Converter em paciente</button>` : `<button class="smallBtn" type="button" data-crm="backlead" data-id="${id}">Reposicionar como lead não convertido</button>`}
        <button class="smallBtn danger" type="button" data-crm="del" data-id="${id}">Excluir</button>
      </div>
      <div class="crmQuickDelay">${[3, 7, 15, 30].map(n => `<button class="smallBtn" type="button" data-crm="delay" data-days="${n}" data-id="${id}">+${n} dias</button>`).join('')}</div>
    </div></details>`;
}

function crmOverdueItem(item) {
  const late = Math.abs(daysUntil(item.nextContact) || 0), id = escAttr(item.id);
  return `<div class="crmOverdueItem"><div>
      <div class="crmOverdueName">${esc(item.name || 'Sem nome')}</div>
      <div class="crmOverdueMeta">${esc(item.phone || 'Sem WhatsApp')} · ${esc(item.owner || item.doctor || 'Responsável não definido')}<br>Data marcada: ${item.nextContact ? dateBR(item.nextContact) : '—'} · ${esc(item.interest || item.procedures || 'Sem interesse definido')}</div></div>
    <div class="crmOverdueActions"><span class="crmOverdueDays">${late} dia(s) em atraso</span>
      <button class="smallBtn whatsapp" type="button" data-crm="whatsapp" data-id="${id}">WhatsApp</button>
      <button class="smallBtn primary" type="button" data-crm="done" data-id="${id}">Contato feito</button>
      <button class="smallBtn" type="button" data-crm="next" data-id="${id}">Reagendar</button></div></div>`;
}

function renderOverdue() {
  const box = $('crmOverdueBox');
  const overdue = state.crm.filter(x => x.nextContact && daysUntil(x.nextContact) < 0 && x.status !== 'convertido' && x.status !== 'perdido').sort((a, b) => a.nextContact.localeCompare(b.nextContact));
  box.classList.toggle('on', !!overdue.length);
  box.innerHTML = overdue.length ? `<div class="crmOverdueHead"><div><div class="crmOverdueTitle">Recontatos em atraso</div>
    <div class="crmOverdueSub">Contatos que não foram realizados na data marcada. Eles permanecem aqui até serem marcados como contato feito ou reagendados.</div></div><div class="crmOverdueCount">${overdue.length}</div></div>
    <div class="crmOverdueList">${overdue.map(crmOverdueItem).join('')}</div>` : '';
}

/* ---------- indicadores e alertas ---------- */
function crmMetrics() {
  const week = parseISO(todayISO()); week.setDate(week.getDate() - 7);
  const patients = state.crm.filter(x => x.type !== 'lead');
  const leadsOpen = state.crm.filter(x => x.type === 'lead' && x.status !== 'convertido');
  const converted = state.crm.filter(x => x.status === 'convertido' || (x.type !== 'lead' && x.origin));
  const dueToday = leadsOpen.filter(x => x.nextContact && daysUntil(x.nextContact) === 0);
  const overdue = leadsOpen.filter(x => x.nextContact && daysUntil(x.nextContact) < 0);
  const convertedWeek = converted.filter(x => { const d = x.updatedAt || x.createdAt; return d && new Date(d) >= week; });
  const renew = patients.filter(x => { const e = packageEnd(x); return e && daysUntil(e) <= 30; });
  const base = leadsOpen.length + converted.length;
  return { patients, leadsOpen, converted, dueToday, overdue, convertedWeek, renew, rate: base ? Math.round(converted.length / base * 100) : 0 };
}

function renderCRMAlerts() {
  const m = crmMetrics(), box = $('crmGlobalAlertStrip'), urgent = m.dueToday.length + m.overdue.length;
  const show = urgent || m.renew.length || m.convertedWeek.length;
  box.classList.toggle('on', !!show);
  box.innerHTML = show ? `
    <button class="crmAlertTile bad" type="button" data-crm-alert="due"><div><div class="big">🔔 ${m.dueToday.length}</div><div class="small">Recontatos hoje</div></div><b>Ver</b></button>
    <button class="crmAlertTile warn" type="button" data-crm-alert="late"><div><div class="big">⚠ ${m.overdue.length}</div><div class="small">Leads atrasados</div></div><b>Prioridade</b></button>
    <button class="crmAlertTile good" type="button" data-crm-alert="renew"><div><div class="big">🟢 ${m.convertedWeek.length}</div><div class="small">Conversões na semana · ${m.renew.length} pacotes vencendo</div></div><b>CRM</b></button>` : '';
  $('crmCommercialBox').innerHTML = `
    <div class="crmCommercialMini bad"><div class="k">Recontatar hoje</div><div class="v">${m.dueToday.length}</div></div>
    <div class="crmCommercialMini warn"><div class="k">Atrasados</div><div class="v">${m.overdue.length}</div></div>
    <div class="crmCommercialMini good"><div class="k">Conversão geral</div><div class="v">${m.rate}%</div></div>`;
}

const barRow = (label, value, max, suffix = '') => `<div class="commercialBarRow"><div class="commercialBarLabel"><span>${esc(label)}</span><b>${esc(String(value))}${suffix}</b></div><div class="commercialBarTrack"><span style="width:${max > 0 ? Math.max(4, Math.round(value / max * 100)) : 0}%"></span></div></div>`;
const isPaidTraffic = item => /(google|instagram|facebook|meta|ads|tr[aá]fego|pago|patrocin)/i.test(`${item?.origin || ''} ${item?.referral || ''}`);

function renderAnalytics() {
  const items = state.crm, patients = items.filter(x => x.type !== 'lead');
  const { from, to } = monthRange(state.view.y, state.view.m);
  const byDoctor = new Map();
  items.filter(x => { const d = crmDay(x.lastConsultation || x.lastContact || x.firstConsultation || x.firstContact || x.createdAt); return d && d >= from && d <= to; })
    .forEach(item => crmDoctors(item).forEach(doc => {
      const row = byDoctor.get(doc) || { attended: 0, patients: 0, total: 0 };
      row.attended++; if (item.type !== 'lead') row.patients++; row.total += crmSpent(item);
      byDoctor.set(doc, row);
    }));
  const doctors = [...byDoctor].sort((a, b) => b[1].total - a[1].total || b[1].attended - a[1].attended);
  const max = Math.max(1, ...doctors.map(([, x]) => x.attended));
  const rate = arr => arr.length ? Math.round(arr.filter(x => x.type !== 'lead').length / arr.length * 100) : 0;
  const contacted = items.filter(x => (x.contactHistory || []).length || x.lastContact);
  $('crmAnalytics').innerHTML = `<div class="themeSectionTitle">Indicadores comerciais</div>
    <div class="commercialKpis">
      <div class="commercialKpi"><span>Total no consultório</span><b>${patients.length}</b></div>
      <div class="commercialKpi"><span>Conversão geral</span><b>${items.length ? Math.round(patients.length / items.length * 100) : 0}%</b></div>
      <div class="commercialKpi"><span>Conversão após recontato</span><b>${rate(contacted)}%</b></div>
      <div class="commercialKpi"><span>Receita registrada</span><b>${fmtMoney(patients.reduce((s, x) => s + crmSpent(x), 0))}</b></div>
    </div>
    <div class="commercialChartGrid">
      <div class="commercialChart"><h4>Produtividade médica no mês exibido</h4>${doctors.length ? doctors.map(([doc, x]) => barRow(`${doc} · ${x.patients} paciente(s)`, x.attended, max)).join('') : '<div class="helper">Sem dados por médico neste mês.</div>'}</div>
      <div class="commercialChart"><h4>Conversão por origem</h4>${barRow('Tráfego pago', rate(items.filter(isPaidTraffic)), 100, '%')}${barRow('Orgânico / indicação', rate(items.filter(x => !isPaidTraffic(x))), 100, '%')}</div>
    </div>`;
}

/* ---------- relatório por médico/período ---------- */
function crmReportDate(item, basis) {
  switch (basis) {
    case 'lastConsultation': return crmDay(item.lastConsultation || item.lastContact);
    case 'firstConsultation': return crmDay(item.firstConsultation || item.firstContact);
    case 'firstContact': return crmDay(item.firstContact);
    case 'packageStart': return crmDay(item.packageStart);
    case 'createdAt': return crmDay(item.createdAt);
    case 'updatedAt': return crmDay(item.updatedAt);
    default: return crmDay(item.lastContact || item.nextContact || item.firstContact || item.createdAt);
  }
}
function reportFilters() {
  return { from: $('crmDoctorPeriodFrom').value, to: $('crmDoctorPeriodTo').value, basis: $('crmDoctorPeriodBasis').value || 'lastContact', type: $('crmDoctorPeriodType').value || 'all', doctor: $('crmDoctorPeriodDoctor').value || 'all' };
}
const typeMatches = (item, type) => !(type === 'patient' && item.type === 'lead') && !(type === 'lead' && item.type !== 'lead');

function renderDoctorReport() {
  const f = reportFilters();
  const base = state.crm.filter(x => typeMatches(x, f.type));
  fillDoctorSelect('crmDoctorPeriodDoctor', 'all', f.doctor, [...state.doctors, ...base.map(crmDoctorName)]);
  const doctor = $('crmDoctorPeriodDoctor').value || 'all';
  const rows = base.filter(x => { const d = crmReportDate(x, f.basis); return d && (!f.from || d >= f.from) && (!f.to || d <= f.to) && (doctor === 'all' || crmDoctorName(x) === doctor); });
  const groups = new Map();
  rows.forEach(item => {
    const g = groups.get(crmDoctorName(item)) || { total: 0, patients: 0, leads: 0, amount: 0 };
    g.total++; item.type === 'lead' ? g.leads++ : g.patients++; g.amount += Number(item.amountPaid || 0);
    groups.set(crmDoctorName(item), g);
  });
  const label = `${f.from ? dateBR(f.from) : 'início'} até ${f.to ? dateBR(f.to) : 'hoje'}`;
  const box = $('crmDoctorPeriodReport');
  if (!rows.length) { box.innerHTML = `<div class="crmDoctorEmpty">Nenhum atendimento encontrado no período selecionado (${esc(label)}).</div>`; return; }
  const tiles = [...groups].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], 'pt-BR')).map(([doc, g]) =>
    `<div class="crmDoctorTile"><div class="doc">${esc(doc)}</div><div class="num">${g.total}</div><div class="mini">${g.patients} paciente(s) · ${g.leads} lead(s)<br>Total pago registrado: ${fmtMoney(g.amount)}</div></div>`).join('');
  const body = [...rows].sort((a, b) => crmReportDate(b, f.basis).localeCompare(crmReportDate(a, f.basis)) || crmDoctorName(a).localeCompare(crmDoctorName(b), 'pt-BR')).map(item =>
    `<tr><td>${esc(dateBR(crmReportDate(item, f.basis)))}</td><td>${esc(crmDoctorName(item))}</td><td><b>${esc(item.name || 'Sem nome')}</b><br>${esc(item.phone || '')}</td><td>${item.type === 'lead' ? 'Lead' : 'Paciente'}</td><td>${esc(item.interest || item.procedures || '—')}</td><td>${esc(crmStatusLabel(item.status))}</td><td>${fmtMoney(item.amountPaid || 0)}</td></tr>`).join('');
  box.innerHTML = `<div class="crmDoctorReportSub mb10"><b>${rows.length}</b> cadastro(s) no período: ${esc(label)}.</div>
    <div class="crmDoctorReportGrid">${tiles}</div>
    <div class="crmDoctorTableWrap"><table class="crmDoctorTable"><thead><tr><th>Data</th><th>Médico</th><th>Paciente/Lead</th><th>Tipo</th><th>Interesse/Procedimento</th><th>Status</th><th>Valor pago</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
function reportThisMonth() {
  const n = new Date();
  $('crmDoctorPeriodFrom').value = iso(new Date(n.getFullYear(), n.getMonth(), 1));
  $('crmDoctorPeriodTo').value = iso(new Date(n.getFullYear(), n.getMonth() + 1, 0));
  renderDoctorReport();
}
function applyReportCollapse() {
  const c = !!state.ui.crmDoctorReportCollapsed;
  $('crmDoctorReportBox').style.display = c ? 'none' : '';
  $('crmToggleDoctorReport').textContent = c ? 'Expandir' : 'Recolher';
  $('crmToggleDoctorReport').setAttribute('aria-expanded', c ? 'false' : 'true');
}
function toggleReportCollapse() { state.ui.crmDoctorReportCollapsed = !state.ui.crmDoctorReportCollapsed; save(); applyReportCollapse(); }

/* Linhas exportáveis (CSV / DOC / PDF / impressão) com os filtros do relatório. */
function reportRows() {
  const f = reportFilters();
  return state.crm.filter(item => typeMatches(item, f.type) && (f.doctor === 'all' || crmDoctors(item).includes(f.doctor)) && (d => d && (!f.from || d >= f.from) && (!f.to || d <= f.to))(crmReportDate(item, f.basis)))
    .map(item => ({ date: crmReportDate(item, f.basis), doctor: crmDoctors(item).join(' / ') || 'Não informado', name: item.name || '', type: item.type === 'lead' ? 'Lead' : 'Paciente', status: crmStatusLabel(item.status), amount: crmSpent(item) }));
}

/* ---------- listas e seletores ---------- */
function fillDoctorSelect(id, mode, selected, names = state.doctors) {
  const select = $(id), current = selected !== undefined ? String(selected || '') : select.value;
  const list = uniqueSorted(names);
  const head = mode === 'all' ? [['all', 'Todos os médicos']] : [['', 'Selecione o médico']];
  const opts = [...head, ...list.map(v => [v, v])];
  if (current && current !== 'all' && !list.some(v => v.localeCompare(current, 'pt-BR', { sensitivity: 'base' }) === 0)) opts.push([current, current + ' (histórico)']);
  select.innerHTML = opts.map(([v, t]) => `<option value="${escAttr(v)}">${esc(t)}</option>`).join('');
  select.value = opts.some(([v]) => v === current) ? current : (mode === 'all' ? 'all' : '');
}

function renderCRMPanel() {
  fillDoctorSelect('crmDoctor', 'empty');
  const listDoctors = uniqueSorted([...state.doctors, ...state.crm.flatMap(crmDoctors)]);
  fillDoctorSelect('crmListDoctor', 'all', undefined, listDoctors);

  const patients = state.crm.filter(x => x.type !== 'lead'), leads = state.crm.filter(x => x.type === 'lead' && x.status !== 'convertido');
  $('crmStatPatients').textContent = patients.length;
  $('crmStatLeads').textContent = leads.length;
  $('crmStatDue').textContent = state.crm.filter(crmIsDue).length;
  $('crmStatPaid').textContent = fmtMoney(patients.reduce((a, b) => a + Number(b.amountPaid || 0), 0));

  const q = $('crmSearch').value.toLowerCase().trim(), quick = $('crmQuickFilter').value || 'all';
  let arr = CRMForm.tab === 'lead' ? leads : CRMForm.tab === 'due' ? state.crm.filter(crmIsDue) : patients;
  if (quick === 'due') arr = arr.filter(crmIsDue);
  if (quick === 'converted') arr = arr.filter(x => x.type !== 'lead' || x.status === 'convertido');
  if (quick === 'not_converted') arr = arr.filter(x => x.type === 'lead' || x.status === 'nao_convertido');
  if (q) arr = arr.filter(x => [x.name, x.phone, x.cpf, x.email, x.address, x.referral, x.origin, x.doctor, (x.additionalDoctors || []).join(' '), x.owner, x.interest, x.procedures, x.notes].join(' ').toLowerCase().includes(q));
  const doc = $('crmListDoctor').value || 'all', from = $('crmListFrom').value, to = $('crmListTo').value;
  if (doc !== 'all') arr = arr.filter(x => x.doctor === doc || (x.additionalDoctors || []).includes(doc));
  if (from || to) arr = arr.filter(x => { const d = crmDay(x.lastConsultation || x.lastContact || x.firstConsultation || x.firstContact || x.createdAt); return d && (!from || d >= from) && (!to || d <= to); });
  arr = [...arr].sort((a, b) => (crmIsDue(a) ? 0 : 1) - (crmIsDue(b) ? 0 : 1) || (a.nextContact || '9999-12-31').localeCompare(b.nextContact || '9999-12-31') || String(a.name || '').localeCompare(String(b.name || '')));

  renderCRMAlerts(); renderOverdue();
  $('crmList').innerHTML = arr.length ? arr.map(crmCard).join('') : '<div class="crmEmpty">Nenhum cadastro encontrado nesta visão.</div>';
  renderDoctorReport();
}

/* ---------- formulário ---------- */
function syncCheckboxes() {
  const internet = $('crmOriginInternet').checked;
  $('crmInternetOptions').style.display = internet ? '' : 'none';
  if (!internet) $$('[data-crm-internet]').forEach(el => { el.checked = false; });
  $('crmOriginInternet').closest('.crmCleanChoicePanel').classList.toggle('internet-on', internet);
  $$('#crmPageCard label.crmCleanCheck').forEach(l => l.classList.toggle('is-checked', !!l.querySelector('input')?.checked));
}
function formOrigin() {
  const channels = $$('[data-crm-internet]:checked').map(el => el.dataset.crmInternet), parts = [];
  if ($('crmOriginOrganic').checked) parts.push('Orgânico');
  if ($('crmOriginInternet').checked) parts.push(channels.length ? `Internet: ${channels.join(', ')}` : 'Internet');
  return parts.join(' | ');
}
function restoreCheckboxes(item) {
  $$('#crmPageCard input[type=checkbox]').forEach(el => { el.checked = false; });
  const origin = String(item?.origin || item?.referral || ''), interest = String(item?.interest || '');
  if (/org[aâã]nico/i.test(origin)) $('crmOriginOrganic').checked = true;
  if (/internet|google|instagram|ia|youtube|facebook|tiktok|outros/i.test(origin)) {
    $('crmOriginInternet').checked = true;
    $$('[data-crm-internet]').forEach(el => { el.checked = origin.toLowerCase().includes(el.dataset.crmInternet.toLowerCase()); });
  }
  const tokens = interest.split('|').map(x => x.trim().toLowerCase()).filter(Boolean);
  $$('[data-crm-interest]').forEach(el => { const k = el.dataset.crmInterest.toLowerCase(); el.checked = tokens.length ? tokens.includes(k) : interest.toLowerCase() === k; });
  syncCheckboxes();
}

const CRM_TEXT_FIELDS = { crmName: 'name', crmPhone: 'phone', crmBirthDate: 'birthDate', crmCpf: 'cpf', crmEmail: 'email', crmAddress: 'address' };

function clearCRMForm(type) {
  CRMForm.editingId = null;
  if (type) CRMForm.tab = type;
  const lead = CRMForm.tab === 'lead';
  $('crmFormTitle').textContent = lead ? 'Cadastrar lead não convertido' : 'Cadastrar paciente';
  Object.keys(CRM_TEXT_FIELDS).forEach(id => { $(id).value = ''; });
  fillDoctorSelect('crmDoctor', 'empty', '');
  $('crmStatus').value = lead ? 'nao_convertido' : 'convertido';
  restoreCheckboxes(null);
}

function setCRMTab(type) {
  CRMForm.tab = type === 'lead' || type === 'due' ? type : 'patient';
  $('crmTabPatients').classList.toggle('active', CRMForm.tab === 'patient');
  $('crmTabLeads').classList.toggle('active', CRMForm.tab === 'lead');
  $('crmTabDue').classList.toggle('active', CRMForm.tab === 'due');
  if (CRMForm.tab !== 'due') clearCRMForm(CRMForm.tab);
  renderCRMPanel();
}

function saveCRM() {
  const name = $('crmName').value.trim();
  if (!name) return alert('Informe o nome.');
  const lead = $('crmStatus').value === 'nao_convertido', now = nowISO(), old = CRMForm.editingId ? crmItem(CRMForm.editingId) : null;
  const origin = formOrigin();
  const item = {
    // campos que o formulário não edita são preservados do cadastro existente
    additionalDoctors: [], owner: '', procedures: '', packageName: '', packageMonths: 0, packageStart: '', amountPaid: 0, nextContact: '', recurrenceDays: 0,
    firstContact: todayISO(), lastContact: '', firstConsultation: '', lastConsultation: '', reminderDays: 0, notes: '', contactHistory: [], timeline: [],
    ...(old || {}),
    id: old?.id || uid(), type: lead ? 'lead' : 'patient', name, phone: $('crmPhone').value.trim(), birthDate: $('crmBirthDate').value || '', cpf: $('crmCpf').value.trim(),
    email: $('crmEmail').value.trim(), address: $('crmAddress').value.trim(), referral: $('crmOriginOrganic').checked ? 'Orgânico' : '', origin,
    doctor: $('crmDoctor').value.trim(), interest: $$('[data-crm-interest]:checked').map(el => el.dataset.crmInterest).join(' | '),
    status: lead ? 'nao_convertido' : 'convertido', updatedAt: now, createdAt: old?.createdAt || now
  };
  item.totalSpent = Number(old?.totalSpent ?? item.amountPaid ?? 0);
  if (!lead && item.recurrenceDays > 0 && item.lastConsultation) item.nextContact = addDays(item.lastConsultation, item.recurrenceDays);
  if (item.doctor) state.doctors = uniqueSorted([...state.doctors, item.doctor]);
  if (old) timelinePush(item, 'atualizacao', 'Cadastro atualizado'); else ensureTimeline(item);
  auditLog(old ? 'Cadastro atualizado' : 'Cadastro criado', 'crm', name, lead ? 'Lead' : 'Paciente', item.id);
  const i = state.crm.findIndex(x => x.id === item.id);
  if (i >= 0) state.crm[i] = item; else state.crm.push(item);
  CRMForm.tab = item.type;
  pushHistory(); save(); clearCRMForm(item.type); renderCRMPanel();
}

function editCRM(id) {
  const item = crmItem(id);
  if (!item) return;
  setCommercialView('register');
  CRMForm.editingId = id;
  CRMForm.tab = item.type === 'lead' ? 'lead' : 'patient';
  $('crmTabPatients').classList.toggle('active', CRMForm.tab === 'patient');
  $('crmTabLeads').classList.toggle('active', CRMForm.tab === 'lead');
  $('crmTabDue').classList.remove('active');
  $('crmFormTitle').textContent = 'Editando: ' + (item.name || 'cadastro');
  Object.entries(CRM_TEXT_FIELDS).forEach(([field, key]) => { $(field).value = item[key] || ''; });
  fillDoctorSelect('crmDoctor', 'empty', item.doctor || '');
  $('crmStatus').value = item.type === 'lead' || item.status === 'nao_convertido' ? 'nao_convertido' : 'convertido';
  restoreCheckboxes(item);
  $('crmPageCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- ações sobre um cadastro ---------- */
function crmChange(id, mutate, type, text, action, details) {
  const item = crmItem(id);
  if (!item) return;
  pushHistory();
  mutate(item);
  item.updatedAt = nowISO();
  timelinePush(item, type, text(item));
  auditLog(action, 'crm', item.name || 'Cadastro', details(item), id);
  save(); renderCRMPanel();
}
const followUpBase = item => item.type !== 'lead' && item.lastConsultation ? item.lastConsultation : todayISO();
const followUpStatus = item => item.type === 'lead' ? 'recontatar' : (item.status || 'ativo');

const convertLead = id => { CRMForm.tab = 'patient'; crmChange(id, i => { i.type = 'patient'; i.status = 'convertido'; i.convertedAt = nowISO(); }, 'conversao', () => 'Lead convertido em paciente', 'Lead convertido em paciente', () => 'Conversão'); };

function repositionToLead(id) {
  if (!crmItem(id)) return;
  const reason = prompt('Motivo do reposicionamento para lead não convertido:', 'Marcou cirurgia e não compareceu à consulta') || 'Marcou cirurgia e não compareceu à consulta';
  CRMForm.tab = 'lead';
  crmChange(id, i => {
    Object.assign(i, { type: 'lead', status: 'sem_resposta', packageName: '', packageMonths: 0, packageStart: '', amountPaid: Number(i.amountPaid || 0), repositionedAt: nowISO(), lastContact: i.lastContact || todayISO(), nextContact: i.nextContact || todayISO() });
    timelinePush(i, 'reposicionado', reason);
  }, 'reposicionado', () => 'Retornou para Lead não convertido', 'Reposicionado como Lead não convertido', () => 'Não compareceu / não convertido');
}

const rescheduleContact = id => crmChange(id, i => {
  i.lastContact = todayISO(); i.nextContact = addDays(followUpBase(i), Number(i.recurrenceDays || 0) || 7);
  i.contactHistory = [...(i.contactHistory || []), { at: nowISO(), type: 'reagendamento', nextContact: i.nextContact }];
  i.status = followUpStatus(i);
}, 'recontato', i => 'Contato reagendado para ' + (i.nextContact ? dateBR(i.nextContact) : 'nova data'), 'Recontato reagendado', i => i.nextContact ? dateBR(i.nextContact) : '');

const markContactDone = id => crmChange(id, i => {
  const rec = Number(i.recurrenceDays || 0);
  i.contactHistory = [...(i.contactHistory || []), { at: nowISO(), type: 'contato_realizado', previousNextContact: i.nextContact || '' }];
  i.lastContact = todayISO();
  i.nextContact = rec > 0 ? addDays(followUpBase(i), rec) : '';
}, 'contato', () => 'Contato realizado', 'Contato realizado', () => 'Saiu da pendência de recontato');

const postponeContact = (id, days) => crmChange(id, i => {
  i.lastContact = todayISO(); i.nextContact = addDays(todayISO(), days);
  i.contactHistory = [...(i.contactHistory || []), { at: nowISO(), type: 'adiamento', days, nextContact: i.nextContact }];
  i.status = followUpStatus(i);
}, 'recontato', () => `Recontato adiado +${days} dias`, 'Recontato adiado', () => `+${days} dias`);

function deleteCRM(id) {
  const item = crmItem(id);
  if (!item || !confirm('Excluir este cadastro?')) return;
  pushHistory();
  state.crm = state.crm.filter(x => x.id !== id);
  auditLog('Cadastro excluído', 'crm', item.name || 'Cadastro', item.type === 'lead' ? 'Lead' : 'Paciente', id);
  save(); renderCRMPanel();
}

function openWhatsApp(id) {
  const item = crmItem(id);
  if (!item) return;
  let n = String(item.phone || '').replace(/\D/g, '');
  if (n.length === 10 || n.length === 11) n = '55' + n;
  if (!n.startsWith('55') && n.length > 8) n = '55' + n;
  if (!n) return alert('Este cadastro não possui telefone/WhatsApp válido.');
  const msg = item.type === 'lead'
    ? `Olá, ${item.name || ''}! Tudo bem? Estou entrando em contato da clínica para dar continuidade ao seu atendimento.`
    : `Olá, ${item.name || ''}! Tudo bem? Estou entrando em contato da clínica sobre seu acompanhamento.`;
  window.open(`https://wa.me/${n}?text=${encodeURIComponent(msg)}`, '_blank');
}

const CRM_ACTIONS = { whatsapp: openWhatsApp, edit: editCRM, next: rescheduleContact, convert: convertLead, backlead: repositionToLead, del: deleteCRM, done: markContactDone };
function onCRMAction(e) {
  const btn = e.target.closest('[data-crm]');
  if (!btn) return;
  const { crm, id } = btn.dataset;
  if (crm === 'delay') postponeContact(id, Number(btn.dataset.days));
  else CRM_ACTIONS[crm]?.(id);
}
