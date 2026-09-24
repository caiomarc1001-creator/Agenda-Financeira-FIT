/* Contraste automático: garante que todo texto visível seja legível sobre o fundo real (WCAG AA),
   em qualquer tema. Estima a cor do fundo NA POSIÇÃO do texto (camadas e gradientes dos ancestrais) e, quando o par
   é fraco, escurece ou clareia a cor do texto mantendo o matiz. */
const AutoContrast = (() => {
  const NEED = 4.6, STRONG = 7; // AA (4,5) com folga; sempre que possível chega a 7 (AAA) para dar destaque real
  const NEED_CHIP = 3; // etiquetas de evento (curtas, em negrito) aceitam 3:1, mantendo o branco sobre vermelho vivo
  const needOf = el => el.closest('.chip') ? NEED_CHIP : NEED;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'OPTION', 'HTML', 'HEAD', 'SVG', 'PATH', 'CANVAS', 'IMG', 'BR']);
  const WHITE = { r: 255, g: 255, b: 255, a: 1 };

  /* ---------- cores ---------- */
  const cx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const memo = new Map();
  const px = (s, base) => { cx.globalCompositeOperation = 'copy'; cx.fillStyle = base; cx.fillRect(0, 0, 1, 1); cx.globalCompositeOperation = 'source-over'; cx.fillStyle = s; cx.fillRect(0, 0, 1, 1); return cx.getImageData(0, 0, 1, 1).data; };
  const parse = s => {
    let c = memo.get(s); if (c) return c;
    const w = px(s, '#fff'), b = px(s, '#000'), a = 1 - (w[0] - b[0]) / 255;
    c = a > .003 ? { r: b[0] / a, g: b[1] / a, b: b[2] / a, a: Math.min(1, a) } : { r: 0, g: 0, b: 0, a: 0 };
    memo.set(s, c); return c;
  };
  const over = (f, bg, a = f.a) => ({ r: f.r * a + bg.r * (1 - a), g: f.g * a + bg.g * (1 - a), b: f.b * a + bg.b * (1 - a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const worst = (fg, bgs) => Math.min(...bgs.map(b => ratio(fg, b)));
  const hsl = ({ r, g, b }) => {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1)), h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  };
  const rgb = (h, s, l) => { const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a: 1 }; };
  const css = c => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;

  /* Melhor cor de texto (mesmo matiz). Se nem preto nem branco bastam, sugere um véu translúcido sobre o fundo. */
  const score = (c, bgs, op) => Math.min(...bgs.map(b => ratio(over(c, b, c.a * op), b)));
  const fix = (fg, bgs, op, need) => {
    const black = { r: 0, g: 0, b: 0, a: 1 }, toward = score(black, bgs, op) >= score(WHITE, bgs, op) ? black : WHITE, [h, s, l] = hsl(fg), end = toward === WHITE ? 1 : 0;
    for (const goal of need === NEED ? [STRONG, NEED] : [need]) for (let t = 0; t <= 1; t += .04) {
      const color = rgb(h, s * (1 - t * .5), l + (end - l) * t);
      if (score(color, bgs, op) >= goal) return { color };
    }
    const veil = toward === WHITE ? black : WHITE;
    for (const a of [.1, .16, .22, .3, .4]) if (score(toward, bgs.map(b => over(veil, b, a)), op) >= need) return { color: toward, veil, a };
    return { color: toward };
  };

  /* ---------- gradientes avaliados em um ponto ---------- */
  const splitTop = s => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
  const parseGradient = layer => {
    const m = layer.match(/^(linear|radial)-gradient\(([\s\S]*)\)$/); if (!m) return null;
    const parts = splitTop(m[2]); let head = ''; if (!/^(rgba?\(|color\(|#)/i.test(parts[0])) head = parts.shift();
    const stops = parts.map(p => { const c = p.match(/^(rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8})\s*([\s\S]*)$/i); return c ? { c: parse(c[1]), pos: c[2].trim().split(/\s+/)[0] || null } : null; }).filter(Boolean);
    return stops.length ? { type: m[1], head, stops } : null;
  };
  const DIRS = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270, 'to top right': 45, 'to right top': 45, 'to bottom right': 135, 'to right bottom': 135, 'to bottom left': 225, 'to left bottom': 225, 'to top left': 315, 'to left top': 315 };
  const at = (tok, o, len) => tok.endsWith('%') ? o + len * parseFloat(tok) / 100 : /px$/.test(tok) ? o + parseFloat(tok) : o + len * ({ left: 0, top: 0, center: .5, right: 1, bottom: 1 }[tok] ?? .5);
  const colorAt = (stops, t, unit) => {
    const pos = stops.map(s => s.pos == null ? null : s.pos.endsWith('%') ? parseFloat(s.pos) / 100 : parseFloat(s.pos) / unit);
    if (pos[0] == null) pos[0] = 0;
    if (pos[pos.length - 1] == null) pos[pos.length - 1] = 1;
    for (let i = 1, last = 0; i < pos.length; i++) {
      if (pos[i] == null) continue;
      for (let j = last + 1; j < i; j++) pos[j] = pos[last] + (pos[i] - pos[last]) * (j - last) / (i - last);
      last = i;
    }
    for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1]);
    if (t <= pos[0]) return stops[0].c;
    for (let i = 1; i < pos.length; i++) {
      if (t > pos[i]) continue;
      const a = stops[i - 1].c, b = stops[i].c, k = pos[i] === pos[i - 1] ? 1 : (t - pos[i - 1]) / (pos[i] - pos[i - 1]), al = a.a + (b.a - a.a) * k;
      const mix = ch => al ? (a[ch] * a.a * (1 - k) + b[ch] * b.a * k) / al : 0;
      return { r: mix('r'), g: mix('g'), b: mix('b'), a: al };
    }
    return stops[stops.length - 1].c;
  };
  const evalGradient = (g, box, x, y) => {
    if (g.type === 'linear') {
      const ang = g.head ? (DIRS[g.head] ?? parseFloat(g.head)) : 180, rad = ang * Math.PI / 180, dx = Math.sin(rad), dy = -Math.cos(rad);
      const len = Math.abs(box.w * dx) + Math.abs(box.h * dy) || 1;
      return colorAt(g.stops, ((x - box.x - box.w / 2) * dx + (y - box.y - box.h / 2) * dy) / len + .5, len);
    }
    const [, ax, ay] = g.head.match(/at\s+(\S+)\s+(\S+)/) || [, 'center', 'center'], cxp = at(ax, box.x, box.w), cyp = at(ay, box.y, box.h);
    const size = g.head.match(/([\d.]+)px(?:\s+([\d.]+)px)?/); let rx, ry;
    if (size) { rx = parseFloat(size[1]); ry = size[2] ? parseFloat(size[2]) : rx; }
    else { const fx = Math.max(cxp - box.x, box.x + box.w - cxp), fy = Math.max(cyp - box.y, box.y + box.h - cyp); if (/circle/.test(g.head)) rx = ry = Math.hypot(fx, fy); else { rx = fx * Math.SQRT2; ry = fy * Math.SQRT2; } }
    return colorAt(g.stops, Math.hypot((x - cxp) / (rx || 1), (y - cyp) / (ry || 1)), rx || 1);
  };

  /* Camadas de fundo de um elemento (cache por execução). */
  const layersOf = (el, cache) => {
    let L = cache.get(el); if (L) return L;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const vl = el.getAttribute('data-ac-veil');
    L = { color: parse(cs.backgroundColor), grads: [], veil: vl ? (([r, g, b, a]) => ({ r, g, b, a }))(vl.split(',').map(Number)) : null };
    if (cs.backgroundImage !== 'none') {
      const sizes = splitTop(cs.backgroundSize), fixed = splitTop(cs.backgroundAttachment);
      splitTop(cs.backgroundImage).forEach((layer, i) => {
        const g = parseGradient(layer); if (!g) return;
        const fx = fixed[i % fixed.length] === 'fixed', sz = (sizes[i % sizes.length] || 'auto').match(/^([\d.]+)px\s+([\d.]+)px$/);
        const box = fx ? { x: 0, y: 0, w: innerWidth, h: innerHeight } : { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
        L.grads.push({ g, box, fixed: fx, tile: sz ? { w: +sz[1], h: +sz[2] } : null });
      });
      L.grads.reverse(); // a primeira camada listada fica por cima
    }
    cache.set(el, L); return L;
  };
  const bgAt = (el, x, y, cache) => {
    const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
    let c = WHITE;
    for (const e of chain) {
      const L = layersOf(e, cache);
      if (L.color.a > 0) c = over(L.color, c);
      for (const { g, box, fixed, tile } of L.grads) {
        let gx = fixed ? x : x + scrollX, gy = fixed ? y : y + scrollY, b = box;
        if (tile) { gx = box.x + (((gx - box.x) % tile.w) + tile.w) % tile.w; gy = box.y + (((gy - box.y) % tile.h) + tile.h) % tile.h; b = { x: box.x, y: box.y, w: tile.w, h: tile.h }; }
        c = over(evalGradient(g, b, gx, gy), c);
      }
      if (L.veil) c = over(L.veil, c);
    }
    return c;
  };
  /* Fundos sob o texto: 5 pontos do retângulo do elemento (esquerda, centro, direita, topo, base). */
  const backgroundsOf = (el, cache) => {
    const r = el.getBoundingClientRect(), my = r.top + r.height / 2, mx = r.left + r.width / 2;
    return [[r.left + r.width * .15, my], [mx, my], [r.left + r.width * .85, my], [mx, r.top + r.height * .15], [mx, r.top + r.height * .85]].map(([x, y]) => bgAt(el, x, y, cache));
  };

  /* ---------- varredura ---------- */
  const opacityOf = el => { let o = 1; for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
  const scan = () => {
    const cache = new Map(), opCache = new Map(), out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (SKIP.has(el.tagName) || el.disabled || el.closest('.day.other')) continue;
      const field = el.matches('input,textarea,select');
      if (field ? /^(checkbox|radio|file|range|color|hidden)$/.test(el.type) : ![...el.childNodes].some(n => n.nodeType === 3 && /[\wÀ-ÿ]/.test(n.textContent))) continue;
      if (!el.getClientRects().length) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden') continue;
      const fg = parse(cs.color); if (fg.a < .05) continue;
      let op = opCache.get(el.parentElement); if (op === undefined) opCache.set(el.parentElement, op = el.parentElement ? opacityOf(el.parentElement) : 1);
      op *= +cs.opacity; if (op < .05) continue;
      const bgs = backgroundsOf(el, cache);
      const ratios = bgs.map(b => ratio(over(fg, b, fg.a * op), b)), i = ratios.indexOf(Math.min(...ratios));
      out.push({ el, fg, bgs, op, need: needOf(el), ratio: ratios[i], bg: bgs[i] });
    }
    return out;
  };

  /* Elemento que "possui" o fundo do texto, se for pequeno (botão, etiqueta): é onde o véu pode ser aplicado. */
  const ownerOf = (el, cache) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const L = layersOf(e, cache), r = e.getBoundingClientRect(); if (L.grads.length || L.color.a > .3) return r.width * r.height <= 60000 ? e : null; } return null; };

  let timer = 0, busy = false, on = true, obs = null;
  const run = () => {
    if (!on) return;
    busy = true;
    document.querySelectorAll('[data-ac]').forEach(e => { e.style.removeProperty('color'); e.style.removeProperty('box-shadow'); e.removeAttribute('data-ac'); e.removeAttribute('data-ac-veil'); });
    const cache = new Map(), veils = new Map();
    for (const t of scan()) {
      if (t.ratio >= t.need) continue;
      const out = fix({ ...t.fg, a: 1 }, t.bgs, t.op, t.need);
      t.el.style.setProperty('color', css(out.color), 'important'); t.el.setAttribute('data-ac', '');
      const owner = out.veil && ownerOf(t.el, cache); if (owner && (veils.get(owner)?.a ?? 0) < out.a) veils.set(owner, out);
    }
    for (const [e, v] of veils) {
      const base = getComputedStyle(e).boxShadow, veil = `inset 0 0 0 999px rgba(${v.veil.r},${v.veil.g},${v.veil.b},${v.a})`;
      e.style.setProperty('box-shadow', base === 'none' ? veil : `${base}, ${veil}`, 'important'); e.setAttribute('data-ac', ''); e.setAttribute('data-ac-veil', `${v.veil.r},${v.veil.g},${v.veil.b},${v.a}`);
    }
    busy = false;
    obs?.takeRecords(); // descarta as mudanças feitas por este próprio ajuste
  };
  const schedule = () => { if (busy) return; clearTimeout(timer); timer = setTimeout(run, 300); };
  const start = () => {
    try { const t = parse('color(srgb 1 0 0)'); if (Math.round(t.r) !== 255 || Math.round(t.g) !== 0) return on = false; } catch { return on = false; }
    obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-theme'] });
    schedule();
  };
  /* Só para testes: textos que continuam abaixo do mínimo depois do ajuste. */
  const audit = () => scan().filter(t => t.ratio < t.need).map(t => ({ el: t.el, ratio: t.ratio, need: t.need, fg: css(t.fg), bg: css(t.bg) }));
  const probe = el => backgroundsOf(el, new Map()).map(css);
  return { start, run, schedule, audit, probe, parse };
})();
