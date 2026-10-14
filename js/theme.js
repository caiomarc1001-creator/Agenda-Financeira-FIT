/* Temas: aplicação de variáveis, Estúdio de Tema e altura das datas do calendário. */
const PRESET_THEMES = [
  { key: 'senna_brasil', name: 'Ayrton Senna do Brasil', desc: 'Amarelo velocidade, faixa verde, faixa azul e visual inspirado no carro da imagem.', sw: ['#FFD700', '#009739', '#0B1D6B'] },
  { key: 'nasa', name: 'NASA', desc: 'Azul espacial, branco técnico e vermelho NASA em estilo centro de controle.', sw: ['#0B1F3A', '#FFFFFF', '#FC3D21'] },
  { key: 'tesla', name: 'Tesla', desc: 'Minimalismo preto, branco e vermelho.', sw: ['#111111', '#e82127', '#f3f4f6'] },
  { key: 'windows_xp', name: 'Windows XP', desc: 'Nostalgia premium com azul e verde clássico.', sw: ['#2d7de0', '#7ddc4b', '#f4f9ff'] },
  { key: 'toy_story', name: 'Toy Story', desc: 'Azul céu, amarelo e vermelho lúdicos.', sw: ['#2f78d6', '#ffd230', '#ef4444'] },
  { key: 'sexta_13', name: 'Sexta-feira 13', desc: 'Escuro, vermelho e suspense refinado.', sw: ['#0b0b0b', '#c1121f', '#5c0c0c'] },
  { key: 'game_of_thrones', name: 'Game of Thrones', desc: 'Aço, couro e trono em tons nobres.', sw: ['#1c232c', '#9b7b4f', '#e8dcc6'] },
  { key: 'sonic', name: 'Sonic', desc: 'Azul veloz com dourado dos anéis.', sw: ['#0a56c2', '#0ea5ff', '#ffd700'] },
  { key: 'resident_evil_2', name: 'Resident Evil 2', desc: 'Aço frio, sombra e vermelho tenso.', sw: ['#131d29', '#8b1e1e', '#d8d8d6'] },
  { key: 'dark', name: 'Dark', desc: 'O tema escuro clássico.', sw: ['#0b1330', '#60a5fa', '#f2f6ff'] },
  { key: 'light', name: 'Light', desc: 'Claro limpo e profissional.', sw: ['#eef3ff', '#2563eb', '#0b1220'] },
  { key: 'ocean', name: 'Ocean', desc: 'Azul profundo com energia marítima.', sw: ['#06131f', '#38bdf8', '#ecfeff'] },
  { key: 'violet', name: 'Violet', desc: 'Roxo premium com brilho suave.', sw: ['#12081f', '#a78bfa', '#f5f3ff'] },
  { key: 'gold', name: 'Gold', desc: 'Dourado executivo com contraste escuro.', sw: ['#120d04', '#facc15', '#fffbea'] },
  { key: 'graphite', name: 'Graphite', desc: 'Grafite moderno, sóbrio e técnico.', sw: ['#111317', '#7dd3fc', '#f7fafc'] },
  { key: 'paper', name: 'Paper', desc: 'Papel claro, limpo e confortável.', sw: ['#f7f7f4', '#2563eb', '#18212b'] },
  { key: 'emerald', name: 'Emerald', desc: 'Verde esmeralda, saúde e produtividade.', sw: ['#071610', '#34d399', '#f3fff9'] },
  { key: 'custom', name: 'Meu tema', desc: '', sw: [] }
];

const root = document.documentElement;
const themeName = key => PRESET_THEMES.find(t => t.key === key)?.name || key;

/* ---------- Meu tema: personalização por áreas ----------
   Os temas prontos nunca mudam. Ao editar qualquer cor, o tema ativo é copiado para o "Meu tema" (state.customTheme),
   que guarda só {base, groups}: a aparência herdada do tema pronto + as cores escolhidas por área.
   Cada área traduz suas cores em variáveis (tokens) aplicadas direto no <body>, por cima do tema base. */
const mix = (a, b, pct) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
const A = (c, a) => hexToRgba(c, a);
const THEME_AREAS = [
  { id: 'page', title: 'Fundo da página', hint: 'Degradê atrás de todo o sistema.', fields: [
      { k: 'top', label: 'Cor superior', probe: ['body', 'bg'], def: '#0b1330' }, { k: 'bottom', label: 'Cor inferior', probe: ['body', 'bg2'], def: '#070b14' }],
    build: v => ({ '--page-img': `linear-gradient(180deg, ${v.top}, ${v.bottom})`, '--page-col': 'transparent' }) },
  { id: 'header', title: 'Cabeçalho', hint: 'Faixa do topo com título, botões e usuário.', fields: [
      { k: 'bg', label: 'Fundo', probe: ['.hdr', 'bg'], def: '#0b1330' }, { k: 'text', label: 'Título', probe: ['.compactBrand h1', 'color'], def: '#f2f6ff' }],
    build: v => ({ '--hdr-img': 'none', '--hdr-col': v.bg, '--hdrtxt-color': v.text, '--ui-header-text': v.text }) },
  { id: 'panels', title: 'Painéis laterais', hint: 'Cartões de resumo, valores a receber, contas e cirurgias.', fields: [
      { k: 'bg', label: 'Fundo', probe: ['.sidebarCol .card', 'bg'], def: '#10162a' }, { k: 'title', label: 'Títulos', probe: ['.sidebarCol .card .ttl', 'color'], def: '#f2f6ff' },
      { k: 'text', label: 'Textos secundários', probe: ['.sidebarCol .card .sub', 'color'], def: '#b8c4de' }],
    build: v => ({ '--card-img': 'none', '--card-col': v.bg, '--ttl-color': v.title, '--payA-color': v.title, '--subtxt-color': v.text, '--lbltxt-color': v.text, '--paysmall-color': v.text, '--minik-color': v.text }) },
  { id: 'calendar', title: 'Calendário', hint: 'Dias, dia de hoje, dia selecionado, título do mês e dias da semana.', fields: [
      { k: 'dayBg', label: 'Fundo do dia', probe: ['.day:not(.other):not(.today)', 'bg'], def: '#1a2138' }, { k: 'dayNum', label: 'Número do dia', probe: ['.day:not(.other) .num', 'color'], def: '#f2f6ff' },
      { k: 'today', label: 'Dia de hoje', probe: ['.day.today .num', 'color'], def: '#facc15' }, { k: 'selected', label: 'Dia selecionado', probe: ['body', 'var:--acc'], def: '#60a5fa' },
      { k: 'barBg', label: 'Barra do mês', probe: ['.mainCalendarCard .sectionHead', 'bg'], def: '#0b1220' }, { k: 'barText', label: 'Texto do mês', probe: ['#monthLabel', 'color'], def: '#ffffff' },
      { k: 'weekBg', label: 'Dias da semana', probe: ['.dow', 'bg'], def: '#1a2138' }, { k: 'weekText', label: 'Texto da semana', probe: ['.dow', 'color'], def: '#f2f6ff' }],
    build: v => ({
      '--cell-img': 'none', '--cell-col': v.dayBg, '--num-color': v.dayNum, '--today-img': 'none', '--today-col': A(v.today, .22), '--today-border': `1px solid ${v.today}`,
      '--today-shadow': `0 0 0 3px ${A(v.today, .34)} inset, 0 0 0 2px ${A(v.today, .34)}, 0 0 28px ${A(v.today, .28)}`, '--todaynum-color': v.today, '--todaynum-tshadow': 'none',
      '--sel-border': `1px solid ${v.selected}`, '--sel-shadow': `0 0 0 2px ${A(v.selected, .4)} inset`, '--surface-calendar-title-bg': v.barBg, '--surface-calendar-title-text': v.barText,
      '--month-color': v.barText, '--pill-img': 'none', '--pill-col': v.weekBg, '--pill-color': v.weekText }) },
  { id: 'buttons', title: 'Botões', hint: 'Botão principal (degradê), botões comuns e botões de perigo (Logout, Remover).', fields: [
      { k: 'mainA', label: 'Principal — cor 1', probe: ['#btnLoginTop', 'bg'], def: '#2563eb' }, { k: 'mainB', label: 'Principal — cor 2', probe: ['#btnLoginTop', 'bg2'], def: '#111827' },
      { k: 'mainText', label: 'Principal — texto', probe: ['#btnLoginTop', 'color'], def: '#ffffff' }, { k: 'plainBg', label: 'Comum — fundo', probe: ['#btnPay', 'bg'], def: '#e5edf8' },
      { k: 'plainText', label: 'Comum — texto', probe: ['#btnPay', 'color'], def: '#101827' }, { k: 'dangerBg', label: 'Perigo — fundo', probe: ['#btnLogoutTop', 'bg'], def: '#c7352b' },
      { k: 'dangerText', label: 'Perigo — texto', probe: ['#btnLogoutTop', 'color'], def: '#ffffff' }],
    build: v => ({
      '--component-active-bg': `linear-gradient(135deg, ${v.mainA}, ${v.mainB})`, '--component-active-text': v.mainText, '--component-active-border': v.mainA,
      '--component-choice-active-bg': `linear-gradient(135deg, ${v.mainA}, ${v.mainB})`, '--component-choice-active-text': v.mainText, '--component-choice-active-border': v.mainA,
      '--component-neutral-bg': v.plainBg, '--component-neutral-text': v.plainText, '--component-neutral-border': A(v.plainText, .35),
      '--component-choice-bg': v.plainBg, '--component-choice-text': v.plainText, '--component-choice-border': A(v.plainText, .35),
      '--ui-menu-button-bg': v.plainBg, '--ui-menu-button-text': v.plainText, '--ui-menu-button-border': A(v.plainText, .35),
      '--component-danger-bg': v.dangerBg, '--component-danger-text': v.dangerText, '--component-danger-border': v.dangerBg }) },
  { id: 'windows', title: 'Janelas e formulários', hint: 'Janelas (evento, regras, cirurgia…), menus e campos de preenchimento.', fields: [
      { k: 'bg', label: 'Fundo da janela', probe: ['#ovLogin .modal', 'bg'], def: '#1c2129' }, { k: 'text', label: 'Texto da janela', probe: ['#ovLogin .modal .mHead h3', 'color'], def: '#f2f6ff' },
      { k: 'muted', label: 'Texto secundário', probe: ['#ovLogin .modal .lbl', 'color'], def: '#b8c4de' }, { k: 'fieldBg', label: 'Fundo dos campos', probe: ['#loginEmail', 'bg'], def: '#f8fbff' },
      { k: 'fieldText', label: 'Texto dos campos', probe: ['#loginEmail', 'color'], def: '#101827' }],
    build: v => ({
      '--ui-window-bg': `linear-gradient(180deg, ${v.bg}, ${v.bg})`, '--ui-panel-bg': mix(v.bg, v.text, 92), '--ui-text': v.text, '--ui-muted': v.muted, '--ui-border': A(v.text, .28),
      '--ui-field-bg': v.fieldBg, '--ui-field-text': v.fieldText, '--ui-menu-bg': `linear-gradient(180deg, ${v.bg}, ${v.bg})`, '--ui-menu-border': A(v.text, .28) }) },
  { id: 'status', title: 'Destaque e cores de status', hint: 'Cor de destaque geral e as cores de valor positivo, negativo e aviso.', fields: [
      { k: 'accent', label: 'Destaque geral', probe: ['body', 'var:--acc'], def: '#60a5fa' }, { k: 'good', label: 'Positivo / recebido', probe: ['body', 'var:--good'], def: '#39d98a' },
      { k: 'bad', label: 'Negativo / a pagar', probe: ['body', 'var:--bad'], def: '#ff5d5d' }, { k: 'warn', label: 'Aviso / pendente', probe: ['body', 'var:--warn'], def: '#ffb020' }],
    build: v => ({ '--acc': v.accent, '--good': v.good, '--bad': v.bad, '--warn': v.warn }) },
  { id: 'crm', title: 'Comercial (CRM)', hint: 'Destaque dos contatos atrasados e fundo do formulário de cadastro.', fields: [
      { k: 'alert', label: 'Cor de alerta', probe: ['body', 'var:--crm-alert-color'], def: '#ff5d5d' }, { k: 'formBg', label: 'Fundo do formulário', probe: ['#crmPageCard', 'bg'], def: '#22304f' }],
    build: v => ({ '--crm-alert-color': v.alert, '--crm-alert-soft': A(v.alert, .26), '--crm-alert-strong': A(v.alert, .62), '--crm-alert-glow': A(v.alert, .32), '--crm-form-bg': A(v.formBg, .62) }) }
];
const areaDefaults = a => Object.fromEntries(a.fields.map(f => [f.k, f.def]));

/* ---------- leitura da cor atual de cada campo (para mostrar e para copiar o tema ativo) ---------- */
const hex2 = c => '#' + [c.r, c.g, c.b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const overRgb = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
function probeColor([sel, prop], def) {
  const el = document.querySelector(sel); if (!el) return def;
  const cs = getComputedStyle(el), P = AutoContrast.parse, stops = (cs.backgroundImage.match(/rgba?\([^)]*\)|color\([^)]*\)/g) || []).map(P);
  if (prop === 'color') return hex2(P(cs.color));
  if (prop.startsWith('var:')) { const v = cs.getPropertyValue(prop.slice(4)).trim(); return v ? hex2(P(v)) : def; }
  const solid = P(cs.backgroundColor), opaque = stops.filter(s => s.a > .99);
  let c = sel === 'body' ? (prop === 'bg' ? opaque[0] : opaque.at(-1)) : solid.a > .3 ? solid : (prop === 'bg2' ? stops.at(-1) : stops[0]) || solid;
  if (!c || !c.a) return def;
  if (c.a < 1) c = overRgb(c, P(getComputedStyle(document.body).backgroundImage.match(/rgba?\([^)]*\)/g)?.at(-1) || '#000'));
  return hex2(c);
}
const probeArea = id => Object.fromEntries(THEME_AREAS.find(a => a.id === id).fields.map(f => [f.k, probeColor(f.probe, f.def)]));

/* ---------- aplicação ---------- */
let appliedVars = [];
function clearApplied() { appliedVars.forEach(v => document.body.style.removeProperty(v)); appliedVars = []; }

/* Formato antigo (cores soltas + ajustes por tema pronto) → "Meu tema" por áreas. Os temas prontos deixam de guardar ajustes. */
function migrateTheme() {
  const t = state.customTheme || {}, ov = t.presetOverrides || {}, legacyCustom = state.theme === 'custom', o = legacyCustom ? (ov.custom || {}) : (ov[state.theme] || {});
  const anyManual = o.manualAccentColor || o.manualTextColors || o.manualButtonColors || o.manualAlertHighlight || o.manualCRMFormBg;
  const base = legacyCustom ? 'dark' : anyManual ? state.theme : null;
  state.customTheme = { v: 2, base, groups: {} };
  if (!base) return;
  document.body.setAttribute('data-theme', base); clearApplied();
  const g = id => (state.customTheme.groups[id] ||= probeArea(id));
  if (legacyCustom) {
    Object.assign(g('page'), { top: t.bg0, bottom: t.bg1 }); Object.assign(g('panels'), { bg: t.card, title: t.txt, text: t.mut });
    Object.assign(g('status'), { accent: t.acc, good: t.good });
  }
  if (o.manualAccentColor) g('status').accent = o.acc || t.acc;
  if (o.manualTextColors) { g('windows').text = o.modalText; g('calendar').barText = o.month; }
  if (o.manualButtonColors) Object.assign(g('buttons'), { mainA: o.buttonBg1 || o.buttonBg, mainB: o.buttonBg2 || o.buttonBg, mainText: o.buttonText });
  if (o.manualAlertHighlight || legacyCustom) g('crm').alert = o.alertColor || t.alertColor;
  if (o.manualCRMFormBg || legacyCustom) g('crm').formBg = o.crmFormBg || t.crmFormBg;
  for (const [id, grp] of Object.entries(state.customTheme.groups)) {
    Object.keys(grp).forEach(k => { if (!/^#[0-9a-f]{6}$/i.test(grp[k] || '')) delete grp[k]; });
    state.customTheme.groups[id] = { ...areaDefaults(THEME_AREAS.find(a => a.id === id)), ...grp };
  }
  state.theme = 'custom';
}

function applyTheme() {
  if (state.customTheme?.v !== 2) migrateTheme();
  const t = state.customTheme, mine = state.theme === 'custom' && !!t.base;
  state.theme = mine ? 'custom' : (state.theme === 'custom' ? 'senna_brasil' : normalizeTheme(state.theme || 'dark'));
  document.body.setAttribute('data-theme', mine ? t.base : state.theme);
  clearApplied();
  if (mine) THEME_AREAS.forEach(a => {
    const grp = t.groups[a.id]; if (!grp) return;
    Object.entries(a.build({ ...areaDefaults(a), ...grp })).forEach(([k, v]) => { document.body.style.setProperty(k, v); appliedVars.push(k); });
  });
  AutoContrast.schedule();
}

const CELL_MIN = 100; // menor tamanho da data: cabem 3 eventos inteiros
function applyCellHeight() {
  const h = state.cellH = Math.max(CELL_MIN, Math.min(220, Number(state.cellH) || 128));
  root.style.setProperty('--cellH', `${h}px`);
  $('dayHRange').value = String(h);
  $('dayHVal').textContent = `${h}px`;
}

/* ---------- Estúdio de Tema ---------- */
const hasMine = () => !!state.customTheme?.base;

function renderThemeGrid() {
  const grid = $('themeGrid'); grid.innerHTML = '';
  PRESET_THEMES.filter(t => t.key !== 'custom' || hasMine()).forEach(theme => {
    const mine = theme.key === 'custom', base = state.customTheme.base, sw = mine ? PRESET_THEMES.find(x => x.key === base)?.sw || [] : theme.sw;
    const card = document.createElement('div');
    card.className = 'themeCard' + (state.theme === theme.key ? ' active' : '');
    card.innerHTML = `<div class="themePreview themePreview_${mine ? base : theme.key}"><span></span></div><div class="themeTitle">${mine ? 'Meu tema' : theme.name}</div>
      <div class="themeSwatches">${sw.map(c => `<span class="themeSw" style="background:${c}"></span>`).join('')}</div><div class="themeDesc">${mine ? `Sua cópia editável, baseada em ${esc(themeName(base))}.` : theme.desc}</div>`;
    card.addEventListener('click', () => { state.theme = theme.key; save(); renderAll(); renderThemeStudio(); });
    grid.appendChild(card);
  });
}

function renderThemeAreas() {
  const box = $('themeAreas'), open = new Set([...box.querySelectorAll('details[open]')].map(d => d.dataset.area)), t = state.customTheme;
  box.innerHTML = THEME_AREAS.map(a => {
    const edited = state.theme === 'custom' && !!t.groups[a.id], vals = { ...probeArea(a.id), ...(edited ? t.groups[a.id] : {}) };
    return `<details class="themeStudioSection themeStudioDetails" data-area="${a.id}"${open.has(a.id) ? ' open' : ''}>
      <summary><span>${a.title}${edited ? ' <em class="themeEdited">editado</em>' : ''}</span><small>${a.hint}</small></summary>
      <div class="customThemeGrid">${a.fields.map(f => `<div class="themeStudioField"><div class="lbl">${f.label}</div><input class="input" type="color" data-area="${a.id}" data-k="${f.k}" value="${vals[f.k]}"></div>`).join('')}</div>
      <div class="themeAreaFoot"><button class="mBtn" type="button" data-reset-area="${a.id}"${edited ? '' : ' disabled'}>Restaurar esta área</button></div></details>`;
  }).join('');
}
function renderThemeStatus() {
  $('themeMineStatus').textContent = state.theme === 'custom'
    ? `Você está editando o "Meu tema", baseado em ${themeName(state.customTheme.base)}. O tema pronto original continua intacto.`
    : `${themeName(state.theme)} é um tema pronto e fixo. Ao alterar qualquer cor abaixo, ele é copiado para o "Meu tema" e o original não muda.`;
  $('btnResetMyTheme').disabled = !hasMine();
}
function renderThemeStudio() { renderThemeGrid(); renderThemeAreas(); renderThemeStatus(); }
function openThemeStudio() { renderThemeStudio(); openModal('ovThemeSelector'); }

/* Garante que exista um "Meu tema" ativo; se o tema ativo for pronto, cria a cópia (pedindo confirmação se já houver outra). */
function ensureMine() {
  if (state.theme === 'custom') return true;
  if (hasMine() && !confirm(`Você já tem um "Meu tema" (baseado em ${themeName(state.customTheme.base)}).\nEditar agora o substitui por uma cópia de ${themeName(state.theme)}. Continuar?`)) return false;
  state.customTheme = { v: 2, base: state.theme, groups: {} };
  state.theme = 'custom';
  return true;
}
function editArea(id, k, value) {
  const created = state.theme !== 'custom';
  if (!ensureMine()) { renderThemeAreas(); return; }
  const grp = state.customTheme.groups[id] ||= probeArea(id);
  grp[k] = value;
  applyTheme(); save();
  // atualiza só os indicadores (recriar os campos fecharia o seletor de cor aberto)
  const d = document.querySelector(`#themeAreas details[data-area="${id}"]`);
  d.querySelector('[data-reset-area]').disabled = false;
  if (!d.querySelector('.themeEdited')) d.querySelector('summary span').insertAdjacentHTML('beforeend', ' <em class="themeEdited">editado</em>');
  if (created) renderThemeGrid();
  renderThemeStatus();
}
function resetArea(id) {
  delete state.customTheme.groups[id];
  applyTheme(); save(); renderThemeStudio();
}
/* Zerar: o "Meu tema" deixa de existir e volta-se ao tema pronto de origem. */
function resetMyTheme() {
  if (!hasMine() || !confirm('Zerar o "Meu tema"? Todas as suas cores personalizadas serão apagadas e ele deixará de existir.')) return;
  const base = state.customTheme.base;
  state.customTheme = { v: 2, base: null, groups: {} };
  if (state.theme === 'custom') state.theme = base || 'senna_brasil';
  save(); renderAll(); renderThemeStudio();
}
function bindThemeStudio() {
  const box = $('themeAreas');
  box.addEventListener('input', e => { const i = e.target.closest('input[data-area]'); if (i) editArea(i.dataset.area, i.dataset.k, i.value); });
  box.addEventListener('change', e => { if (e.target.closest('input[data-area]')) renderThemeStudio(); });
  box.addEventListener('click', e => { const b = e.target.closest('[data-reset-area]'); if (b) resetArea(b.dataset.resetArea); });
}
