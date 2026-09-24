/* Estado da aplicação, normalização, desfazer e fila de gravação.
   Nada é gravado no navegador: a única persistência é a nuvem (ver cloud.js). */
const THEMES = ['senna_brasil', 'nasa', 'tesla', 'windows_xp', 'toy_story', 'sexta_13', 'game_of_thrones', 'sonic', 'resident_evil_2', 'dark', 'light', 'ocean', 'violet', 'gold', 'graphite', 'paper', 'emerald', 'custom'];
const THEME_ALIASES = { senna_mclaren: 'senna_brasil', senna_capacete: 'nasa' };
const BASE_DOCTORS = ['Dr. Caio Marcondes Jacomini', 'Dra. Bruna', 'Dr. Helber', 'Dra. Thaís Marcondes Jacomini', 'Dra. Fernanda Oyakawa'];
const HISTORY_LIMIT = 20;

const UI_DEFAULTS = () => ({ summaryCollapsed: false, paymentsCollapsed: false, surgeriesCollapsed: false, surgeonMode: false, crmMode: false, hideCalendarEvents: false, paymentRowsCollapsed: {}, payableRowsCollapsed: {} });
const CUSTOM_THEME_DEFAULTS = () => ({ v: 2, base: null, groups: {} }); // "Meu tema": tema pronto de origem + cores por área

function defaultState() {
  const now = new Date();
  return {
    theme: 'senna_brasil', cellH: 100, view: { y: now.getFullYear(), m: now.getMonth() }, selDate: todayISO(),
    events: [], payRules: [], payableRules: [], bonusRules: [], surgeries: [], crm: [],
    doctors: [...BASE_DOCTORS], hospitals: [], insurances: [],
    ui: UI_DEFAULTS(), customTheme: CUSTOM_THEME_DEFAULTS(), _meta: { updatedAt: '', updatedBy: 'local' }
  };
}

const normalizeTheme = key => { key = String(key || '').trim(); key = THEME_ALIASES[key] || key; return THEMES.includes(key) ? key : 'senna_brasil'; };

/* Mantém todos os campos desconhecidos do documento da nuvem (nada é descartado). */
function normalizeState(obj) {
  const s = { ...defaultState(), ...(obj || {}) };
  s.theme = normalizeTheme(s.theme);
  const now = new Date(), v = (s.view && typeof s.view === 'object') ? s.view : {};
  const y = Number(v.y), m = Number(v.m);
  s.view = { y: Number.isInteger(y) && y >= 1970 && y <= 2200 ? y : now.getFullYear(), m: Number.isInteger(m) && m >= 0 && m <= 11 ? m : now.getMonth() };
  ['events', 'payRules', 'payableRules', 'bonusRules', 'surgeries', 'crm'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });

  const used = s.crm.flatMap(x => [x?.doctor, ...(x?.additionalDoctors || [])]);
  s.doctors = uniqueSorted(obj && Array.isArray(obj.doctors) ? obj.doctors : [...BASE_DOCTORS, ...used]);
  s.hospitals = uniqueSorted(s.hospitals);
  s.insurances = uniqueSorted(s.insurances);

  s.ui = { ...UI_DEFAULTS(), ...(s.ui || {}) };
  if (!s.ui.responsiveCalendar100V1) { s.cellH = 100; s.ui.responsiveCalendar100V1 = true; }
  s.ui.paymentRowsCollapsed ||= {};
  s.ui.payableRowsCollapsed ||= {};

  // formato antigo (sem v:2) é mantido como está e convertido por migrateTheme() ao aplicar o tema
  s.customTheme = s.customTheme && typeof s.customTheme === 'object' ? (s.customTheme.v === 2 ? { ...CUSTOM_THEME_DEFAULTS(), ...s.customTheme } : s.customTheme) : CUSTOM_THEME_DEFAULTS();

  s.events = s.events.map(e => {
    const item = { ...e };
    if ((item.retroGenerated || item.retroParentId) && !item.retroGroupId && item.retroParentId) item.retroGroupId = 'retro_' + item.retroParentId;
    if ((item.copySourceId || item.copyGroupId || item.copyRootId) && !item.copyFamilyId) item.copyFamilyId = 'copyfam_' + (item.copyGroupId || item.copyRootId || item.copySourceId || item.id);
    return item;
  });
  return s;
}

let state = defaultState();
function setState(next) { state = normalizeState(next); resetEventIndex(); }

/* ---- contagens (usadas para recuperar/mostrar backups) ---- */
function countItems(candidate) {
  const s = normalizeState(candidate || {});
  return { events: s.events.length, surgeries: s.surgeries.length, payRules: s.payRules.length + s.payableRules.length, bonusRules: s.bonusRules.length, crm: s.crm.length };
}
const dataScore = c => { const n = countItems(c); return n.events + n.surgeries + n.payRules + n.bonusRules + n.crm; };
const hasData = c => dataScore(c) > 0;
const backupSummary = (c = state) => { const n = countItems(c); return { events: n.events, surgeries: n.surgeries, payRules: n.payRules, bonusRules: n.bonusRules, score: n.events + n.surgeries + n.payRules + n.bonusRules }; };

/* ---- desfazer (somente memória, nunca gravado) ---- */
let undoStack = [];
function pushHistory() {
  const snap = JSON.stringify(state);
  if (undoStack[undoStack.length - 1] === snap) return;
  undoStack = [...undoStack, snap].slice(-HISTORY_LIMIT);
  refreshUndoButton();
}
const refreshUndoButton = () => { $('btnUndo').disabled = !undoStack.length; };
function undo() {
  if (!undoStack.length) return alert('Nada para desfazer nesta sessão.');
  const last = undoStack.pop();
  setState(JSON.parse(last));
  resetTransientScopes();
  renderAll();
  if (user && cloudLoadDone) saveCloudNow();
  setStatus('saved', 'Desfeito e sincronizado');
}

/* ---- status e fila de gravação ---- */
function setStatus(kind, title) {
  const pill = $('savePill');
  pill.classList.remove('saved', 'dirty', 'saving', 'error');
  pill.classList.add(kind);
  pill.title = title || 'Status da nuvem';
  $('saveLabel').textContent = '☁ Nuvem';
}

let saveTimer = null, dirty = false;
function save() {
  resetEventIndex();
  dirty = true;
  setStatus('dirty', user ? 'Não salvo' : 'Entre para salvar na nuvem');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(false), 1200);
}
function persist(forceHistory) {
  clearTimeout(saveTimer);
  if (!user) { dirty = false; setStatus('error', 'Sem login: não salva'); return; }
  if (!cloudLoadDone) { setStatus('saving', 'Aguardando nuvem...'); scheduleCloudSave(900); return; }
  if (forceHistory) pushHistory();
  state._meta.updatedAt = new Date().toISOString();
  state._meta.updatedBy = user.uid;
  dirty = false;
  setStatus('saving', 'Salvando na nuvem...');
  scheduleCloudSave(250);
}
