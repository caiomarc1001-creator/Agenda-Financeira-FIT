/* Administração (médicos, hospitais, convênios) e Auditoria. */
const CATALOGS = {
  doctor: { key: 'doctors', one: 'médico', input: 'adminDoctorName', button: 'adminAddDoctor', addLabel: 'Adicionar médico', list: 'adminDoctorsList', meta: 'Disponível nos cadastros, filtros e relatórios médicos' },
  hospital: { key: 'hospitals', one: 'hospital', input: 'adminHospitalName', button: 'adminAddHospital', addLabel: 'Adicionar hospital', list: 'adminHospitalsList', meta: 'Disponível em cirurgias, agenda, filtros e regras financeiras' },
  insurance: { key: 'insurances', one: 'convênio', input: 'adminInsuranceName', button: 'adminAddInsurance', addLabel: 'Adicionar convênio', list: 'adminInsurancesList', meta: 'Disponível em cirurgias, filtros e relatórios' }
};
const cap = s => s[0].toUpperCase() + s.slice(1);
const catName = v => String(v || '').trim().replace(/\s+/g, ' ');
const sameName = (a, b) => catName(a).localeCompare(catName(b), 'pt-BR', { sensitivity: 'base' }) === 0;
const catSort = values => { const out = []; (values || []).map(catName).filter(Boolean).forEach(v => { if (!out.some(x => sameName(x, v))) out.push(v); }); return out.sort(sortPT); };

/* Na primeira vez, aproveita hospitais/convênios já usados em cirurgias e regras. */
function ensureCatalogs() {
  Object.values(CATALOGS).forEach(c => { if (!Array.isArray(state[c.key])) state[c.key] = []; });
  state.auditLog = Array.isArray(state.auditLog) ? state.auditLog : [];
  state.payableCategories = Array.isArray(state.payableCategories) ? state.payableCategories : ['Aluguel', 'Funcionários', 'Marketing', 'Materiais', 'Impostos', 'Outros'];
  if (!state.adminCatalogsV2Initialized) {
    state.hospitals = [...state.hospitals, ...state.surgeries.map(x => x?.hospital), ...state.payRules.map(x => x?.name), ...state.payableRules.map(x => x?.name), ...state.bonusRules.map(x => x?.locationName)];
    state.insurances = [...state.insurances, ...state.surgeries.map(x => x?.insuranceProvider || x?.insurance || x?.convenio)];
    state.adminCatalogsV2Initialized = true;
    Object.values(CATALOGS).forEach(c => { state[c.key] = catSort(state[c.key]); });
    if (user) save();
  } else Object.values(CATALOGS).forEach(c => { state[c.key] = catSort(state[c.key]); });
}

function fillDatalist(id, values) { $(id).innerHTML = values.map(v => `<option value="${escAttr(v)}"></option>`).join(''); }
function renderCatalogs() {
  ensureCatalogs();
  fillDatalist('dlHospitals', state.hospitals);
  fillDatalist('dlInsurances', state.insurances);
  Object.entries(CATALOGS).forEach(([kind, c]) => {
    $(c.list).innerHTML = state[c.key].length ? state[c.key].map(v => `<div class="catRow"><div><div class="catName">${esc(v)}</div><div class="catMeta">${esc(c.meta)}</div></div>
      <div class="catActions"><button class="smallBtn" type="button" data-cat-edit="${kind}" data-name="${escAttr(v)}">Editar</button><button class="smallBtn danger" type="button" data-cat-remove="${kind}" data-name="${escAttr(v)}">Excluir</button></div></div>`).join('') : '<div class="crmEmpty">Nenhum item cadastrado.</div>';
  });
}

function catalogUsage(kind, value) {
  const eq = x => sameName(x, value);
  const count = (list, ...keys) => list.reduce((n, item) => n + keys.filter(k => eq(item?.[k])).length, 0);
  if (kind === 'doctor') return state.crm.reduce((n, i) => n + (eq(i.doctor) ? 1 : 0) + (i.additionalDoctors || []).filter(eq).length, 0) + state.surgeries.filter(i => eq(i.doctor || i.surgeon || i.assistantDoctor)).length;
  if (kind === 'hospital') return count(state.surgeries, 'hospital') + count(state.events, 'name') + count(state.payRules, 'name') + count(state.payableRules, 'name') + count(state.bonusRules, 'locationName');
  return state.surgeries.filter(i => eq(i.insuranceProvider || i.insurance || i.convenio)).length;
}
function renameEverywhere(kind, from, to) {
  const rename = (obj, key) => { if (obj && sameName(obj[key], from)) obj[key] = to; };
  if (kind === 'doctor') {
    state.crm.forEach(i => { rename(i, 'doctor'); i.additionalDoctors = (i.additionalDoctors || []).map(v => sameName(v, from) ? to : v); });
    state.surgeries.forEach(i => ['doctor', 'surgeon', 'assistantDoctor'].forEach(k => rename(i, k)));
  } else if (kind === 'hospital') {
    state.surgeries.forEach(i => rename(i, 'hospital'));
    state.events.forEach(i => rename(i, 'name'));
    [...state.payRules, ...state.payableRules].forEach(i => rename(i, 'name'));
    state.bonusRules.forEach(i => rename(i, 'locationName'));
  } else state.surgeries.forEach(i => ['insuranceProvider', 'insurance', 'convenio'].forEach(k => rename(i, k)));
}

function afterCatalogChange(message) { save(); renderCatalogs(); renderCRMPanel(); renderSurgeryPanel(); setStatus('saved', message); }
function resetCatalogEditor(kind) {
  const c = CATALOGS[kind], input = $(c.input);
  input.value = ''; delete input.dataset.editing;
  $(c.button).textContent = c.addLabel;
}

function catalogAdd(kind, value) {
  const c = CATALOGS[kind], name = catName(value);
  if (!name) { alert(`Informe o nome do ${c.one}.`); return false; }
  if (state[c.key].some(x => sameName(x, name))) { alert(`${cap(c.one)} já cadastrado.`); return false; }
  pushHistory();
  state[c.key] = catSort([...state[c.key], name]);
  auditLog(`${cap(c.one)} adicionado`, 'admin', name, 'Catálogo administrativo');
  afterCatalogChange(`${c.one} adicionado`);
  return true;
}
function catalogEdit(kind, from, value) {
  const c = CATALOGS[kind], to = catName(value);
  if (!to) { alert(`Informe o novo nome do ${c.one}.`); return false; }
  if (sameName(to, from)) { resetCatalogEditor(kind); return true; }
  if (state[c.key].some(x => !sameName(x, from) && sameName(x, to))) { alert(`${cap(c.one)} já cadastrado.`); return false; }
  pushHistory();
  state[c.key] = catSort(state[c.key].map(x => sameName(x, from) ? to : x));
  renameEverywhere(kind, from, to);
  auditLog(`${cap(c.one)} editado`, 'admin', to, `Nome anterior: ${from}`);
  afterCatalogChange(`${c.one} atualizado`);
  resetCatalogEditor(kind);
  return true;
}
function catalogRemove(kind, value) {
  const c = CATALOGS[kind], refs = catalogUsage(kind, value);
  const note = refs ? `\n\nHá ${refs} registro(s) histórico(s) usando este nome. Eles serão preservados; apenas a opção para novos cadastros será excluída.` : '';
  if (!confirm(`Excluir ${c.one} “${value}” da lista administrativa?${note}`)) return;
  pushHistory();
  state[c.key] = catSort(state[c.key].filter(x => !sameName(x, value)));
  auditLog(`${cap(c.one)} excluído`, 'admin', value, refs ? `${refs} referência(s) histórica(s) preservada(s)` : 'Sem referências históricas');
  afterCatalogChange(`${c.one} excluído`);
}

function submitCatalog(kind) {
  const input = $(CATALOGS[kind].input), editing = input.dataset.editing || '';
  const ok = editing ? catalogEdit(kind, editing, input.value) : catalogAdd(kind, input.value);
  if (ok && !editing) input.value = '';
}
function bindAdmin() {
  Object.entries(CATALOGS).forEach(([kind, c]) => {
    $(c.button).addEventListener('click', () => submitCatalog(kind));
    $(c.input).addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); resetCatalogEditor(kind); }
      else if (e.key === 'Enter') { e.preventDefault(); submitCatalog(kind); }
    });
  });
  $('ovAdminCenter').addEventListener('click', e => {
    const edit = e.target.closest('[data-cat-edit]'), del = e.target.closest('[data-cat-remove]');
    if (edit) {
      const c = CATALOGS[edit.dataset.catEdit], input = $(c.input);
      input.value = input.dataset.editing = edit.dataset.name;
      $(c.button).textContent = 'Salvar alteração';
      input.focus(); input.select();
    } else if (del) catalogRemove(del.dataset.catRemove, del.dataset.name);
  });
  $('adminClose').addEventListener('click', () => closeModal('ovAdminCenter'));
  $('auditClose').addEventListener('click', () => closeModal('ovAuditCenter'));
  $('auditFilterEntity').addEventListener('change', renderAudit);
  $('auditSearch').addEventListener('input', renderAudit);
  $('auditClear').addEventListener('click', () => { $('auditFilterEntity').value = 'all'; $('auditSearch').value = ''; renderAudit(); });
}
const openAdmin = () => { renderCatalogs(); openModal('ovAdminCenter'); };

/* ---------- auditoria ---------- */
function renderAudit() {
  const q = $('auditSearch').value.toLowerCase().trim(), entity = $('auditFilterEntity').value || 'all';
  let rows = [...(state.auditLog || [])];
  if (entity !== 'all') rows = rows.filter(x => x.entity === entity);
  if (q) rows = rows.filter(x => [x.user, x.action, x.entity, x.target, x.details].join(' ').toLowerCase().includes(q));
  $('auditSummary').textContent = `${rows.length} registro(s) de auditoria exibido(s). Histórico total: ${(state.auditLog || []).length}.`;
  $('auditRows').innerHTML = rows.length ? rows.map(x => `<tr><td>${esc(dateTimeBR(x.at))}</td><td><span class="auditBadge ${escAttr(x.entity)}">${esc(x.entity || 'geral')}</span></td><td>${esc(x.action || '')}</td><td>${esc(x.target || '')}</td><td>${esc(x.user || '')}</td><td>${esc(x.details || '')}</td></tr>`).join('') : '<tr><td colspan="6">Nenhum registro encontrado.</td></tr>';
}
const openAudit = () => { renderAudit(); openModal('ovAuditCenter'); };
