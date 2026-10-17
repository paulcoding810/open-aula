import { HID_NAMES, MODIFIERS, MOUSE_ACTIONS, MEDIA_ACTIONS, hidFromEvent, hidName } from './keycodes.js';
import { CAP, DIRECTION, rgb565 } from './common.js';
import { MODELS, modelById, hidFilters, attach as attachModel, simulator } from './models/index.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const storeKey = (id) => `aula-config-${id}`;

const DEFAULTS = {
  light: { mode: 1, brightness: 5, speed: 3, direction: 0, colorful: 1, color: '#ff0000' },
  perkey: { brightness: 5, colors: {} },
  keymap: { base: {}, fn: {} },
  macros: [{ name: 'Macro 1', steps: [] }],
  settings: {},
  barMode: 0x20,
  delay: 35,
};

let model = modelById(safeGet('aula-model'));
let state = load();
let kb = simulator(model, { log, delay: state.delay });

function safeGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}

function defaults() {
  const d = structuredClone(DEFAULTS);
  d.settings = Object.fromEntries((model.settings ?? []).map((f) => [f.key, f.default]));
  if (model.mouseDefaults) d.mouse = structuredClone(model.mouseDefaults);
  return d;
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(storeKey(model.id)) ?? (model.id === 's75pro' ? localStorage.getItem('s75pro-config') : null));
    if (!s) return defaults();
    const d = defaults();
    return { ...d, ...s, settings: { ...d.settings, ...s.settings }, mouse: d.mouse && { ...d.mouse, ...s.mouse } };
  } catch {
    return defaults();
  }
}
function save() {
  try { localStorage.setItem(storeKey(model.id), JSON.stringify(state)); } catch {}
}

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (c) => '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), err ? 6000 : 2500);
}

function log(dir, text) {
  if (!$('#log-on').checked) return;
  const el = $('#log');
  el.textContent += `${new Date().toISOString().slice(11, 23)} ${dir} ${text}\n`;
  if (el.textContent.length > 400_000) el.textContent = el.textContent.slice(-300_000);
  el.scrollTop = el.scrollHeight;
}

async function run(btn, label, fn) {
  const old = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  try {
    const r = await fn();
    toast(kb.mode === 'sim' ? `${label}: simulated (see the Log tab)` : `${label}: done`);
    return r;
  } catch (e) {
    console.error(e);
    toast(`${label} failed: ${e.message}`, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}

// ---------- connection ----------

function setStatus() {
  const s = $('#status');
  const names = { usb: 'USB', '2.4g': '2.4 GHz dongle', sim: 'Simulator' };
  s.textContent = kb.mode === 'sim' ? 'Simulator — not connected' : `${kb.name} · ${names[kb.mode]}`;
  $('#model-name').textContent = model.name;
  $('#sim-model').hidden = kb.mode !== 'sim';
  $('#sim-model').value = model.id;
  s.className = 'pill ' + (kb.mode === 'sim' ? 'sim' : 'on');
  $('#connect').hidden = kb.mode !== 'sim';
  $('#disconnect').hidden = kb.mode === 'sim';
  $('#battery').hidden = true;
  if (kb.mode === '2.4g') refreshBattery();
}

async function refreshBattery() {
  const level = await kb.battery().catch(() => null);
  if (level != null) {
    $('#battery').textContent = `🔋 ${level}%`;
    $('#battery').hidden = false;
  }
}

async function attach(devices) {
  const k = await attachModel(devices, { log, delay: state.delay });
  if (!k) return false;
  if (k.model.id !== model.id) setModel(k.model);
  kb = k;
  kb.delay = state.delay;
  setStatus();
  log('ℹ', `connected ${model.name}: ${['main', 'screen', 'dongle'].filter((x) => kb[x]).join(', ')}`);
  return true;
}

function setModel(m) {
  model = m;
  try { localStorage.setItem('aula-model', m.id); } catch {}
  state = load();
  layer = 'base';
  selected = null;
  macroSel = 0;
  source = null;
  if (kb.mode === 'sim') kb = simulator(model, { log, delay: state.delay });
  initModelUi();
  setStatus();
}

async function connect() {
  try {
    const picked = await navigator.hid.requestDevice({ filters: hidFilters() });
    if (!picked.length) return;
    const all = await navigator.hid.getDevices();
    if (!(await attach([...picked, ...all]))) {
      toast('No configuration interface found on that device', true);
    }
  } catch (e) {
    toast(`Connect failed: ${e.message}`, true);
  }
}

async function disconnect() {
  for (const k of [kb.main, kb.screen, kb.dongle]) if (k?.dev.opened) await k.dev.close();
  kb = simulator(model, { log, delay: state.delay });
  setStatus();
}

function initConnection() {
  $('#sim-model').innerHTML = MODELS.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
  $('#sim-model').onchange = (e) => setModel(modelById(e.target.value));
  if (!('hid' in navigator)) {
    $('#unsupported').hidden = false;
    $('#connect').disabled = true;
    setStatus();
    return;
  }
  $('#connect').onclick = connect;
  $('#disconnect').onclick = disconnect;
  navigator.hid.addEventListener('disconnect', (e) => {
    if ([kb.main, kb.dongle].some((k) => k?.dev === e.device)) {
      kb = simulator(model, { log, delay: state.delay });
      setStatus();
      toast('Keyboard disconnected', true);
    }
  });
  navigator.hid.addEventListener('connect', async () => {
    if (kb.mode === 'sim') await attach(await navigator.hid.getDevices());
  });
  navigator.hid.getDevices().then((d) => attach(d)).finally(setStatus);
  setInterval(() => kb.mode === '2.4g' && refreshBattery(), 60_000);
}

// ---------- tabs ----------

function applyFeatures() {
  const f = model.features;
  $$('#tabs button').forEach((b) => (b.hidden = b.dataset.tab !== 'log' && !f[b.dataset.tab]));
  $('#bar-card').hidden = !f.bar;
  $('#matrix-card').hidden = !f.matrix;
  $('#reset-card').hidden = !f.reset;
  $('#km-layer [data-layer="fn"]').hidden = !f.fnLayer;
  const active = $('#tabs button.active');
  if (active?.hidden) $$('#tabs button').find((b) => !b.hidden)?.click();
}

function initTabs() {
  $$('#tabs button').forEach((b) => {
    b.onclick = () => {
      $$('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
      $$('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${b.dataset.tab}`));
      if (b.dataset.tab === 'keymap') refreshMacroSelect();
      if (b.dataset.tab === 'buttons') initButtons();
    };
  });
}

// ---------- keyboard view ----------

let painting = false;
window.addEventListener('pointerup', () => (painting = false));

function keyboardView(root, { onPress, onEnter, onContext }) {
  const { src, width: W, height: H } = model.image ?? { src: null, width: 1, height: 1 };
  root.innerHTML = src ? `<img src="${src}" alt="">` : '';
  root.classList.toggle('drawn', !src);
  root.style.aspectRatio = `${W} / ${H}`;
  const els = {};
  for (const k of model.layout) {
    const el = document.createElement('div');
    el.className = 'key';
    Object.assign(el.style, {
      left: `${(k.x / W) * 100}%`, top: `${(k.y / H) * 100}%`,
      width: `${(k.w / W) * 100}%`, height: `${(k.h / H) * 100}%`,
    });
    el.title = k.name;
    el.dataset.name = k.name;
    el.onpointerdown = (e) => {
      if (e.button !== 0) return;
      painting = true;
      onPress?.(k, el);
    };
    el.onpointerenter = () => painting && onEnter?.(k, el);
    el.oncontextmenu = (e) => { e.preventDefault(); onContext?.(k, el); };
    root.appendChild(el);
    els[k.code] = el;
  }
  return els;
}

// ---------- lighting ----------

function initLighting() {
  const L = state.light;
  const grid = $('#modes');
  grid.innerHTML = '';
  for (const m of model.lightModes ?? []) {
    const b = document.createElement('button');
    b.textContent = m.name;
    b.dataset.mode = m.mode;
    b.onclick = () => { L.mode = m.mode; save(); renderLighting(); };
    grid.appendChild(b);
  }
  const dir = $('#l-direction');
  dir.innerHTML = '';
  const dirs = [['Left', DIRECTION.LEFT, CAP.DIR_LR], ['Right', DIRECTION.RIGHT, CAP.DIR_LR], ['Up', DIRECTION.UP, CAP.DIR_UD], ['Down', DIRECTION.DOWN, CAP.DIR_UD]];
  for (const [name, v, cap] of dirs) {
    const l = document.createElement('label');
    l.dataset.dircap = cap;
    l.innerHTML = `<input type="radio" name="dir" value="${v}"> ${name}`;
    l.querySelector('input').onchange = () => { L.direction = v; save(); };
    dir.appendChild(l);
  }
  for (const [id, key] of [['#l-brightness', 'brightness'], ['#l-speed', 'speed']]) {
    const input = $(id);
    input.max = model.lightRange?.[key] ?? 5;
    input.oninput = () => { L[key] = +input.value; input.nextElementSibling.value = input.value; save(); };
  }
  $('#l-colorful').onchange = (e) => { L.colorful = e.target.checked ? 1 : 0; save(); renderLighting(); };
  $('#l-color').oninput = (e) => { L.color = e.target.value; save(); };
  $('#l-apply').onclick = (e) => {
    const caps = model.lightModes.find((m) => m.mode === L.mode)?.caps ?? 0;
    const [r, g, b] = hexToRgb(L.color);
    run(e.target, 'Lighting', () => kb.setLighting({
      mode: L.mode, r, g, b,
      colorful: caps & CAP.COLORFUL ? L.colorful : 0,
      brightness: L.brightness, speed: L.speed, direction: model.directionMap?.[L.direction] ?? L.direction,
    }));
  };
  const matrix = $('#matrix-modes');
  matrix.innerHTML = '';
  for (const m of model.matrixEffects ?? []) {
    const b = document.createElement('button');
    b.textContent = m.name;
    b.onclick = (e) => run(e.target, `Matrix: ${m.name}`, () => kb.setMatrixEffect(m.value));
    matrix.appendChild(b);
  }
  const bar = $('#bar-modes');
  bar.innerHTML = '';
  for (const m of model.barModes ?? []) {
    const b = document.createElement('button');
    b.textContent = m.name;
    b.dataset.mode = m.mode;
    b.onclick = () => { state.barMode = m.mode; save(); renderBar(); };
    bar.appendChild(b);
  }
  $('#bar-apply').onclick = (e) => run(e.target, 'Bar light', () => kb.setBarLight(state.barMode));
  renderBar();
  renderLighting();
}

function renderBar() {
  $$('#bar-modes button').forEach((b) => b.classList.toggle('active', +b.dataset.mode === state.barMode));
}

function renderLighting() {
  const L = state.light;
  const caps = model.lightModes?.find((m) => m.mode === L.mode)?.caps ?? 0;
  $$('#modes button').forEach((b) => b.classList.toggle('active', +b.dataset.mode === L.mode));
  $$('#tab-lighting [data-cap]').forEach((el) => (el.hidden = !(caps & +el.dataset.cap)));
  $$('#l-direction [data-dircap]').forEach((el) => (el.hidden = !(caps & +el.dataset.dircap)));
  const dirOk = (caps & CAP.DIR_LR && L.direction <= 1) || (caps & CAP.DIR_UD && L.direction >= 2);
  if (!dirOk && caps & (CAP.DIR_LR | CAP.DIR_UD)) L.direction = caps & CAP.DIR_LR ? DIRECTION.LEFT : DIRECTION.UP;
  $$('#l-direction input').forEach((i) => (i.checked = +i.value === L.direction));
  for (const [id, key] of [['#l-brightness', 'brightness'], ['#l-speed', 'speed']]) {
    $(id).value = L[key];
    $(id).nextElementSibling.value = L[key];
  }
  $('#l-colorful').checked = !!L.colorful;
  $('#l-color').value = L.color;
  $('#l-color').closest('label').hidden = !(caps & CAP.COLOR) || (caps & CAP.COLORFUL && L.colorful);
}

// ---------- per-key RGB ----------

function initPerKey() {
  const P = state.perkey;
  const paint = (k) => { P.colors[k.code] = hexToRgb($('#pk-color').value); draw(k.code); save(); };
  const els = keyboardView($('#kb-perkey'), {
    onPress: paint,
    onEnter: paint,
    onContext: (k) => { if (P.colors[k.code]) $('#pk-color').value = rgbToHex(P.colors[k.code]); },
  });
  const draw = (code) => {
    const c = P.colors[code];
    els[code].style.background = c && c.some((x) => x) ? `rgba(${c[0]},${c[1]},${c[2]},0.75)` : '';
  };
  const drawAll = () => model.layout.forEach((k) => draw(k.code));
  const br = $('#pk-brightness');
  br.value = P.brightness;
  br.nextElementSibling.value = P.brightness;
  br.oninput = () => { P.brightness = +br.value; br.nextElementSibling.value = br.value; save(); };
  $('#pk-fill').onclick = () => { model.layout.forEach((k) => (P.colors[k.code] = hexToRgb($('#pk-color').value))); drawAll(); save(); };
  $('#pk-clear').onclick = () => { P.colors = {}; drawAll(); save(); };
  $('#pk-read').onclick = async (e) => {
    const colors = await run(e.target, 'Read colours', () => kb.readUserLight(model.layout));
    if (colors) { P.colors = colors; drawAll(); save(); }
  };
  $('#pk-apply').onclick = (e) => run(e.target, 'Per-key lighting', () => kb.setUserLight(model.layout, P.colors, P.brightness));
  drawAll();
}

// ---------- keymap ----------

let layer = 'base';
let selected = null;
let kmEls = {};

function describe(a) {
  if (!a) return '';
  switch (a.type) {
    case 'disable': return '✕';
    case 'key': return [...MODIFIERS.filter(([, b]) => a.mods & b).map(([n]) => n.replace(/^[LR]-/, '')), hidName(a.code)].join('+');
    case 'mouse': return MOUSE_ACTIONS.find((m) => m.id === a.id)?.name ?? 'Mouse';
    case 'media': return MEDIA_ACTIONS.find(([, u]) => u === a.usage)?.[0] ?? 'Media';
    case 'macro': return `M${a.index + 1}`;
    default: return '';
  }
}

function initKeymap() {
  kmEls = keyboardView($('#kb-keymap'), { onPress: (k) => selectKey(k) });
  $$('#km-layer button').forEach((b) => {
    b.classList.toggle('active', b.dataset.layer === layer);
    b.onclick = () => {
      layer = b.dataset.layer;
      $$('#km-layer button').forEach((x) => x.classList.toggle('active', x === b));
      selected = null;
      renderKeymap();
    };
  });

  $('#km-mods').innerHTML = MODIFIERS.map(([n, bit]) => `<label class="check"><input type="checkbox" value="${bit}"> ${n}</label>`).join('');
  $('#km-code').innerHTML = Object.entries(HID_NAMES).map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
  $('#km-mouse').innerHTML = MOUSE_ACTIONS.map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
  $('#km-media').innerHTML = MEDIA_ACTIONS.map(([n, u]) => `<option value="${u}">${n}</option>`).join('');
  $('#km-macro-mode').innerHTML = (model.macroPlay ?? []).map((n, i) => `<option value="${i}">${n}</option>`).join('');

  for (const el of ['#km-type', '#km-code', '#km-mouse', '#km-media', '#km-macro', '#km-macro-mode', '#km-macro-loops']) {
    $(el).onchange = commitKey;
  }
  $('#km-mods').onchange = commitKey;
  $('#km-capture').onclick = (e) => {
    const btn = e.target;
    btn.textContent = 'Waiting for key…';
    const handler = (ev) => {
      ev.preventDefault();
      const code = hidFromEvent(ev);
      window.removeEventListener('keydown', handler, true);
      btn.textContent = 'Press a key…';
      if (code == null) return toast(`Unsupported key: ${ev.code}`, true);
      $('#km-code').value = code;
      commitKey();
    };
    window.addEventListener('keydown', handler, true);
  };
  $('#km-reset').onclick = () => { state.keymap[layer] = {}; save(); renderKeymap(); };
  $('#km-apply').onclick = (e) => {
    kb.macros = state.macros;
    run(e.target, `${layer === 'fn' ? 'Fn' : 'Base'} layer`, () => kb.setKeymap(layer, model.layout, state.keymap[layer]));
  };
  renderKeymap();
}

function selectKey(k) {
  selected = k;
  renderKeymap();
  const a = state.keymap[layer][k.code] ?? { type: 'default' };
  $('#km-type').value = a.type;
  $$('#km-mods input').forEach((i) => (i.checked = !!((a.mods ?? 0) & +i.value)));
  $('#km-code').value = a.code ?? k.hid ?? k.code;
  if (a.type === 'mouse') $('#km-mouse').value = a.id;
  if (a.type === 'media') $('#km-media').value = a.usage;
  refreshMacroSelect();
  if (a.type === 'macro') {
    $('#km-macro').value = a.index;
    $('#km-macro-mode').value = a.mode;
    $('#km-macro-loops').value = a.loops ?? 1;
  }
  showSubForm();
}

function showSubForm() {
  const t = $('#km-type').value;
  $$('#km-editor .sub-form').forEach((f) => f.classList.toggle('show', f.dataset.for === t));
  $('#km-macro-loops').closest('label').hidden = +$('#km-macro-mode').value !== 1;
}

function commitKey() {
  if (!selected) return;
  const t = $('#km-type').value;
  const map = state.keymap[layer];
  const mods = $$('#km-mods input').reduce((m, i) => (i.checked ? m | +i.value : m), 0);
  const actions = {
    default: null,
    disable: { type: 'disable' },
    key: { type: 'key', code: +$('#km-code').value, mods },
    mouse: { type: 'mouse', id: +$('#km-mouse').value },
    media: { type: 'media', usage: +$('#km-media').value },
    macro: { type: 'macro', index: +$('#km-macro').value, mode: +$('#km-macro-mode').value, loops: Math.max(1, Math.min(255, +$('#km-macro-loops').value || 1)) },
  };
  const a = actions[t];
  if (t === 'macro' && !state.macros.length) return toast('Create a macro on the Macros tab first', true);
  if (a) map[selected.code] = a; else delete map[selected.code];
  save();
  showSubForm();
  renderKeymap();
}

function refreshMacroSelect() {
  const sel = $('#km-macro');
  const v = sel.value;
  sel.innerHTML = state.macros.map((m, i) => `<option value="${i}">${i + 1}. ${m.name}</option>`).join('');
  if (v) sel.value = v;
}

function renderKeymap() {
  const map = state.keymap[layer];
  for (const k of model.layout) {
    const el = kmEls[k.code];
    const a = map[k.code];
    el.classList.toggle('mapped', !!a);
    el.classList.toggle('sel', selected?.code === k.code);
    el.textContent = describe(a);
  }
  $('#km-editor').hidden = !selected;
  if (selected) $('#km-title').textContent = `${selected.name} — ${layer === 'fn' ? 'Fn layer' : 'Base layer'}`;
}

// ---------- macros ----------

let macroSel = 0;
let recording = null;

function initMacros() {
  $('#mc-add').onclick = () => {
    state.macros.push({ name: `Macro ${state.macros.length + 1}`, steps: [] });
    macroSel = state.macros.length - 1;
    save(); renderMacros();
  };
  $('#mc-rename').onclick = () => {
    const m = state.macros[macroSel];
    if (!m) return;
    const name = prompt('Macro name', m.name);
    if (name?.trim()) { m.name = name.trim(); save(); renderMacros(); }
  };
  $('#mc-delete').onclick = () => {
    if (!state.macros[macroSel]) return;
    state.macros.splice(macroSel, 1);
    for (const l of ['base', 'fn']) {
      for (const [code, a] of Object.entries(state.keymap[l])) {
        if (a.type !== 'macro') continue;
        if (a.index === macroSel) delete state.keymap[l][code];
        else if (a.index > macroSel) a.index--;
      }
    }
    macroSel = Math.max(0, macroSel - 1);
    save(); renderMacros(); renderKeymap();
  };
  $('#mc-record').onclick = toggleRecord;
  $('#mc-add-delay').onclick = () => addStep({ kind: 'delay', ms: 50 });
  $('#mc-add-click').onclick = () => {
    addStep({ kind: 'MOUSE_DOWN', code: 1 });
    addStep({ kind: 'delay', ms: 30 });
    addStep({ kind: 'MOUSE_UP', code: 1 });
  };
  $('#mc-clear').onclick = () => { const m = state.macros[macroSel]; if (m) { m.steps = []; save(); renderMacros(); } };
  $('#mc-apply').onclick = (e) => run(e.target, 'Macros', () => kb.setMacros(state.macros));
  renderMacros();
}

function addStep(s) {
  const m = state.macros[macroSel];
  if (!m) return toast('Create a macro first', true);
  m.steps.push(s);
  save();
  renderMacros();
}

function toggleRecord() {
  const btn = $('#mc-record');
  if (recording) {
    window.removeEventListener('keydown', recording, true);
    window.removeEventListener('keyup', recording, true);
    recording = null;
    btn.classList.remove('rec');
    btn.textContent = '● Record';
    return;
  }
  if (!state.macros[macroSel]) return toast('Create a macro first', true);
  let last = null;
  recording = (e) => {
    if (e.repeat) return;
    e.preventDefault();
    const code = hidFromEvent(e);
    if (code == null) return;
    const now = performance.now();
    if (last != null && $('#mc-delays').checked) addStep({ kind: 'delay', ms: Math.round(now - last) });
    last = now;
    addStep({ kind: e.type === 'keydown' ? 'KEY_DOWN' : 'KEY_UP', code });
  };
  window.addEventListener('keydown', recording, true);
  window.addEventListener('keyup', recording, true);
  btn.classList.add('rec');
  btn.textContent = '■ Stop';
  btn.blur();
}

function renderMacros() {
  $('#mc-list').innerHTML = state.macros
    .map((m, i) => `<li data-i="${i}" class="${i === macroSel ? 'sel' : ''}">${i + 1}. ${escapeHtml(m.name)} <span>${m.steps.length} steps</span></li>`)
    .join('');
  $$('#mc-list li').forEach((li) => (li.onclick = () => { macroSel = +li.dataset.i; renderMacros(); }));
  const m = state.macros[macroSel];
  $('#mc-title').textContent = m ? `Steps — ${m.name}` : 'Steps';
  const mouse = { 1: 'Left', 2: 'Right', 4: 'Middle' };
  $('#mc-steps').innerHTML = (m?.steps ?? []).map((s, i) => {
    let body;
    if (s.kind === 'delay') body = `Delay <input type="number" min="10" max="65535" value="${s.ms}" data-i="${i}"> ms`;
    else if (s.kind.startsWith('KEY')) body = `<span class="${s.kind === 'KEY_DOWN' ? 'down' : 'up'}">${s.kind === 'KEY_DOWN' ? '↓' : '↑'}</span> ${hidName(s.code)}`;
    else body = `<span class="${s.kind === 'MOUSE_DOWN' ? 'down' : 'up'}">${s.kind === 'MOUSE_DOWN' ? '↓' : '↑'}</span> ${mouse[s.code] ?? s.code} mouse`;
    return `<li><div class="row">${body} <button data-del="${i}" title="Remove">×</button></div></li>`;
  }).join('');
  $$('#mc-steps input').forEach((inp) => (inp.onchange = () => { m.steps[+inp.dataset.i].ms = Math.max(10, +inp.value || 10); save(); }));
  $$('#mc-steps [data-del]').forEach((b) => (b.onclick = () => { m.steps.splice(+b.dataset.del, 1); save(); renderMacros(); }));
  const ol = $('#mc-steps');
  ol.scrollTop = ol.scrollHeight;
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- screen ----------

let frames = [];
let source = null;
let previewTimer = null;

function fitDraw(ctx, img, w, h, fit) {
  const iw = img.displayWidth ?? img.width, ih = img.displayHeight ?? img.height;
  const s = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const dw = iw * s, dh = ih * s;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

async function decodeImage(file) {
  if ('ImageDecoder' in window && file.type === 'image/gif') {
    const dec = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });
    await dec.tracks.ready;
    const count = Math.min(dec.tracks.selectedTrack.frameCount, model.screen.maxFrames);
    const out = [];
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      const bmp = await createImageBitmap(image);
      out.push({ img: bmp, delayMs: Math.round((image.duration ?? 100000) / 1000) || 100 });
      image.close();
    }
    dec.close();
    return out;
  }
  return [{ img: await createImageBitmap(file), delayMs: 100 }];
}

function renderFrames() {
  const { width: w, height: h } = model.screen;
  const fit = $('#sc-fit').value;
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d');
  frames = source.map((f) => {
    fitDraw(ctx, f.img, w, h, fit);
    const data = ctx.getImageData(0, 0, w, h);
    return { pixels: rgb565(data.data, w, h), delayMs: f.delayMs, preview: data };
  });
  const pctx = $('#sc-preview').getContext('2d');
  clearTimeout(previewTimer);
  let i = 0;
  const tick = () => {
    pctx.putImageData(frames[i].preview, 0, 0);
    const d = frames[i].delayMs;
    i = (i + 1) % frames.length;
    if (frames.length > 1) previewTimer = setTimeout(tick, Math.max(20, d));
  };
  tick();
  const kbytes = Math.round((model.screen.headLength + frames.length * w * h * 2) / 1024);
  $('#sc-info').textContent = `${frames.length} frame${frames.length > 1 ? 's' : ''} · ${kbytes} KB to upload`;
  $('#sc-upload').disabled = false;
}

function initScreen() {
  if (!model.screen) return;
  const cv = $('#sc-preview');
  cv.width = model.screen.width;
  cv.height = model.screen.height;
  cv.style.width = `${model.screen.width * 1.5}px`;
  cv.style.height = `${model.screen.height * 1.5}px`;
  cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
  clearTimeout(previewTimer);
  $('#sc-upload').disabled = true;
  $('#sc-file').value = '';
  $('#sc-info').textContent = `${model.screen.width} × ${model.screen.height} pixels, up to ${model.screen.maxFrames} frames.`;
  $('#sc-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      source = await decodeImage(file);
      renderFrames();
    } catch (err) {
      toast(`Could not read image: ${err.message}`, true);
    }
  };
  $('#sc-fit').onchange = () => source && renderFrames();
  $('#sc-upload').onclick = async (e) => {
    const bar = $('#sc-progress');
    bar.hidden = false;
    bar.value = 0;
    await run(e.target, 'Screen upload', () => kb.uploadScreen(frames, 1, (p) => (bar.value = p)));
    bar.hidden = true;
  };
  $('#sc-time').onclick = (e) => run(e.target, 'Clock sync', () => kb.syncTime(1));
}

// ---------- mouse ----------

const mouseConfig = () => ({ ...state.settings, ...state.mouse, lightMode: state.light.mode });

function initDpi() {
  const root = $('#dpi-stages');
  root.innerHTML = '';
  if (!state.mouse) return;
  const M = state.mouse;
  M.dpi.forEach((v, i) => {
    const row = document.createElement('div');
    row.className = 'dpi-stage';
    row.innerHTML = `<label class="check"><input type="radio" name="dpi-active" ${i === M.dpiIndex ? 'checked' : ''}> Stage ${i + 1}</label>
      <input type="range" min="50" max="26000" step="50" value="${v}">
      <input type="number" min="50" max="26000" step="50" value="${v}">
      <input type="color" value="${rgbToHex(M.dpiColors[i])}">`;
    const [radio, range, num, color] = row.querySelectorAll('input');
    radio.onchange = () => { M.dpiIndex = i; save(); };
    const set = (x) => { M.dpi[i] = Math.max(50, Math.min(26000, Math.round(+x / 50) * 50)); range.value = num.value = M.dpi[i]; save(); };
    range.oninput = () => set(range.value);
    num.onchange = () => set(num.value);
    color.oninput = () => { M.dpiColors[i] = hexToRgb(color.value); save(); };
    root.appendChild(row);
  });
  $('#dpi-apply').onclick = (e) => run(e.target, 'DPI', () => kb.setMouseConfig(mouseConfig()));
}

function initButtons() {
  const root = $('#btn-list');
  root.innerHTML = '';
  if (!state.mouse) return;
  const M = state.mouse;
  const types = [['default', 'Default'], ['disable', 'Disabled'], ['mouse', 'Mouse'], ['key', 'Keyboard key'], ['media', 'Media'], ['dpiLoop', 'DPI cycle'], ['macro', 'Macro']];
  (model.buttonSlots ?? []).forEach((name, i) => {
    const a = M.buttons[i] ?? { type: 'default' };
    const row = document.createElement('div');
    row.className = 'btn-row';
    const typeSel = `<select data-f="type">${types.map(([v, n]) => `<option value="${v}" ${a.type === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    const sub = {
      mouse: `<select data-f="id">${MOUSE_ACTIONS.map((m) => `<option value="${m.id}" ${a.id === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}</select>`,
      key: `<select data-f="code">${Object.entries(HID_NAMES).map(([c, n]) => `<option value="${c}" ${a.code === +c ? 'selected' : ''}>${n}</option>`).join('')}</select>`,
      media: `<select data-f="usage">${MEDIA_ACTIONS.map(([n, u]) => `<option value="${u}" ${a.usage === u ? 'selected' : ''}>${n}</option>`).join('')}</select>`,
      macro: `<select data-f="index">${state.macros.map((m, j) => `<option value="${j}" ${a.index === j ? 'selected' : ''}>${j + 1}. ${escapeHtml(m.name)}</option>`).join('')}</select>
        <select data-f="mode">${(model.macroPlay ?? []).map((n, j) => `<option value="${j}" ${a.mode === j ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <input data-f="loops" type="number" min="1" max="255" value="${a.loops ?? 1}" title="Repeat count">`,
    }[a.type] ?? '';
    row.innerHTML = `<span>${name}</span>${typeSel}${sub}`;
    row.querySelectorAll('[data-f]').forEach((el) => {
      el.onchange = () => {
        const f = el.dataset.f;
        if (f === 'type') {
          const fresh = { default: null, disable: { type: 'disable' }, mouse: { type: 'mouse', id: 1 }, key: { type: 'key', code: 0x04, mods: 0 },
            media: { type: 'media', usage: MEDIA_ACTIONS[0][1] }, dpiLoop: { type: 'dpiLoop' }, macro: { type: 'macro', index: 0, mode: 0, loops: 1 } }[el.value];
          if (el.value === 'macro' && !state.macros.length) { toast('Create a macro on the Macros tab first', true); el.value = a.type; return; }
          M.buttons[i] = fresh;
        } else {
          M.buttons[i] = { ...a, [f]: +el.value };
        }
        save();
        initButtons();
      };
    });
    root.appendChild(row);
  });
  $('#btn-reset').onclick = () => { M.buttons = []; save(); initButtons(); };
  $('#btn-apply').onclick = (e) => run(e.target, 'Buttons', () => kb.setButtons(M.buttons, state.macros));
}

// ---------- settings ----------

function initSettings() {
  const S = state.settings;
  const root = $('#s-fields');
  root.innerHTML = '';
  for (const f of model.settings ?? []) {
    const label = document.createElement('label');
    let input;
    if (f.type === 'check') {
      label.className = 'check';
      input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!S[f.key] });
      label.append(input, ` ${f.label}`);
    } else {
      if (f.type === 'select') {
        input = document.createElement('select');
        input.innerHTML = f.options.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
      } else {
        input = Object.assign(document.createElement('input'), { type: 'number', min: f.min, max: f.max });
      }
      input.value = S[f.key];
      label.append(`${f.label} `, input);
    }
    input.onchange = () => {
      S[f.key] = f.type === 'check' ? (input.checked ? 1 : 0) : Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, +input.value || 0));
      save();
    };
    root.appendChild(label);
  }
  $('#s-reset-keys').onclick = (e) => confirm('Reset all key assignments on the keyboard to factory defaults?') && run(e.target, 'Keymap reset', () => kb.resetKeys());
  $('#s-reset-all').onclick = (e) => confirm('Factory reset the keyboard? This clears lighting, keymaps and macros.') && run(e.target, 'Factory reset', () => kb.factoryReset());
  $('#s-apply').onclick = (e) => run(e.target, 'Settings', () => (model.kind === 'mouse' ? kb.setMouseConfig(mouseConfig()) : kb.setSettings(S)));
  $('#s-delay').value = state.delay;
  $('#s-delay').onchange = (e) => { state.delay = Math.max(5, +e.target.value || 35); kb.delay = state.delay; save(); };
  $('#s-export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    a.download = `${model.id}-config.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $('#s-import').onchange = async (e) => {
    try {
      const d = defaults();
      const imported = JSON.parse(await e.target.files[0].text());
      state = { ...d, ...imported, settings: { ...d.settings, ...imported.settings } };
      save();
      location.reload();
    } catch (err) {
      toast(`Import failed: ${err.message}`, true);
    }
  };
  $('#log-clear').onclick = () => ($('#log').textContent = '');
}

function initModelUi() {
  initDpi();
  initButtons();
  initLighting();
  initPerKey();
  initKeymap();
  initMacros();
  initScreen();
  initSettings();
  applyFeatures();
}

initTabs();
initModelUi();
initConnection();
setStatus();
