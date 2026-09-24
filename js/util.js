/* Utilitários gerais: DOM, datas, dinheiro, cores, download. */
const $ = id => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
let modalZ = 50000; // a janela aberta por último fica sempre na frente (mesmo quando aberta de dentro de outra)
const openModal = id => {
  const ov = $(id);
  ov.style.zIndex = ++modalZ;
  ov.classList.remove('parked');
  ov.classList.add('open');
  ov.scrollTop = 0;
  const modal = ov.querySelector('.modal');
  if (modal) modal.scrollTop = 0;
};
const closeModal = id => $(id).classList.remove('open');

const pad2 = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayISO = () => iso(new Date());
const parseISO = s => { const [y, m, d] = String(s || '').split('-').map(Number); return new Date(y || 1970, (m || 1) - 1, d || 1); };
const addDays = (dateISO, n) => { const d = parseISO(dateISO); d.setDate(d.getDate() + n); return iso(d); };
const monthAdd = (y, m, delta) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; };
const monthKey = (y, m) => `${y}-${pad2(m + 1)}`;
const monthRange = (y, m) => ({ from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) });
const clamp = (n, a, b) => { n = Number.isFinite(n) ? n : parseInt(n || 0, 10); return Math.max(a, Math.min(b, n)); };
const uid = () => 'e_' + Math.random().toString(16).slice(2) + Date.now().toString(16);
const clone = x => JSON.parse(JSON.stringify(x));
const num = v => Number(String(v ?? 0).replace(',', '.')) || 0;
const sortPT = (a, b) => a.localeCompare(b, 'pt-BR');
const uniqueSorted = list => [...new Set((list || []).map(x => String(x || '').trim()).filter(Boolean))].sort(sortPT);

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const escAttr = s => esc(s).replace(/`/g, '&#96;');

const fmtMoney = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtHours = h => (Math.round(Number(h || 0) * 100) / 100).toLocaleString('pt-BR') + 'h';
const dateBR = v => { const s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s; };
const parseBR = v => { const m = String(v || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const anyToISO = v => { const s = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : parseBR(s); };
const dateTimeBR = v => { if (!v) return '—'; const s = String(v); return dateBR(s.slice(0, 10)) + (s.includes('T') ? ' ' + s.slice(11, 16) : ''); };
const stamp = v => { try { return new Date(v).toLocaleString('pt-BR'); } catch { return v || '—'; } };
const monthLabel = (y, m) => { const r = new Date(y, m, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return r.charAt(0).toUpperCase() + r.slice(1); };
const monthShort = (y, m) => { const r = new Date(y, m, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''); return r.charAt(0).toUpperCase() + r.slice(1); };

const hexNorm = hex => { let h = String(hex || '').trim(); if (!h) return '#3B82F6'; if (h[0] !== '#') h = '#' + h; if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; return h.toUpperCase(); };
const hexRgb = hex => { const h = hexNorm(hex).slice(1); return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }; };
const hexToRgba = (hex, a) => { const { r, g, b } = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
const bestText = bg => {
  const lin = [hexRgb(bg).r, hexRgb(bg).g, hexRgb(bg).b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] > 0.30 ? '#000000' : '#FFFFFF'; // branco só quando tem contraste >= 3:1 (ex.: vermelho vivo); nos demais, preto
};

function download(filename, data, type) {
  const url = URL.createObjectURL(new Blob(Array.isArray(data) ? data : [data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const downloadJson = (filename, payload) => download(filename, JSON.stringify(payload, null, 2), 'application/json');
