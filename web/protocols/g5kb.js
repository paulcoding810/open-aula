import { sleep, hex, findReport, matchesId, toU8, Unsupported } from '../common.js';

export const CMD = { MATRIX: 0x03, LED: 0x04, MACRO: 0x05, COLOR_GROUP: 0x06, RGB_TAB: 0x0a, RESET: 0x11 };
export const READ = 0x80;
export const REPORT = { id: 6, size: 0x208 };
export const CHUNK = 0x200;
export const LED_SIZE = 0x80;
export const RGB_TAB_SIZE = 0x200;
export const SIGNATURE = [0x5a, 0xa5];
export const MACRO_PLAY = ['Repeat N times', 'Repeat while held', 'Repeat until any key'];
const MACRO_MODE = [1, 2, 4];
const MACRO_TYPE = { KEY_DOWN: 1, KEY_UP: 1, MOUSE_DOWN: 2, MOUSE_UP: 2 };
const MOUSE_BUTTON = { 1: 0x01, 2: 0x02, 4: 0x04 };

export function header(cmd, sub, total, idx, size) {
  const b = new Uint8Array(REPORT.size);
  b[0] = REPORT.id; b[1] = cmd; b[2] = sub; b[3] = 0;
  b[4] = total; b[5] = idx; b[6] = size & 0xff; b[7] = size >> 8;
  return b;
}

export function writePackets(cmd, sub, data) {
  const total = Math.max(1, Math.ceil(data.length / CHUNK));
  const out = [];
  for (let i = 0; i < total; i++) {
    const part = data.slice(i * CHUNK, (i + 1) * CHUNK);
    const p = header(cmd, sub, total, i, part.length);
    p.set(part, 8);
    out.push(p);
  }
  return out;
}

export function encodeKey(a) {
  switch (a?.type) {
    case 'disable': return [0, 0, 0, 0];
    case 'key': return [0, a.mods & 0xff, a.code & 0xff, 0];
    case 'media': return [2, 0, (a.usage >> 8) & 0xff, a.usage & 0xff];
    case 'mouse': {
      const btn = { 1: 1, 2: 3, 3: 2, 7: 4, 8: 5 }[a.id];
      if (btn) return [1, btn, 1, 0];
      return { 4: [1, 1, 2, 0], 5: [1, 8, 0, 0], 6: [1, 9, 0, 0] }[a.id] ?? null;
    }
    default: return null;
  }
}

export function matrixBlock(layout, actions, macroIds, matrixLen = 128, extra = []) {
  const buf = new Uint8Array(matrixLen * 4);
  for (const d of [...layout, ...extra]) if (d.def) buf.set(d.def, d.idx * 4);
  for (const k of layout) {
    const a = actions[k.code];
    let bytes;
    if (a?.type === 'macro') {
      const id = macroIds.get(a.index);
      if (id == null) continue;
      bytes = [3, MACRO_MODE[a.mode] ?? 1, a.mode === 0 ? Math.max(1, a.loops ?? 1) : 1, id];
    } else {
      bytes = encodeKey(a);
    }
    if (bytes) buf.set(bytes, k.idx * 4);
  }
  buf.set([0, 0, ...SIGNATURE], buf.length - 4);
  return buf;
}

export function macroEvents(steps) {
  const ev = [];
  for (const s of steps) {
    if (s.kind === 'delay') {
      if (ev.length) ev[ev.length - 1].delay += s.ms | 0;
      continue;
    }
    const code = s.kind.startsWith('MOUSE') ? MOUSE_BUTTON[s.code] ?? 1 : s.code;
    ev.push({ type: MACRO_TYPE[s.kind], up: s.kind.endsWith('UP'), code, delay: 0 });
  }
  return ev.map((e) => {
    const d = Math.min(0xfffff, e.delay);
    return [(e.type << 4) | ((d >> 16) & 0x0f) | (e.up ? 0x80 : 0), (d >> 8) & 0xff, d & 0xff, e.code];
  });
}

export function macroBlock(macros, used) {
  const bodies = used.map((i) => {
    const m = macros[i];
    const name = Array.from((m.name ?? '').slice(0, 30)).flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8]);
    return Uint8Array.from([name.length, ...name, ...macroEvents(m.steps ?? []).flat()]);
  });
  const table = bodies.length * 4;
  const out = new Uint8Array(table + bodies.reduce((n, b) => n + b.length, 0));
  let addr = table;
  bodies.forEach((b, i) => {
    out.set([addr & 0xff, addr >> 8, b.length & 0xff, b.length >> 8], i * 4);
    out.set(b, addr);
    addr += b.length;
  });
  return out;
}

export function checkSignature(buf, at) {
  return buf[at] === SIGNATURE[0] && buf[at + 1] === SIGNATURE[1];
}

export function patchLed(block, effects, { mode, brightness, speed, colorful }) {
  const slot = effects.findIndex((e) => e.mode === mode);
  if (slot < 0) throw new Error(`Unknown effect ${mode}`);
  const e = effects[slot];
  const out = Uint8Array.from(block);
  out[10] = e.hw;
  out[0x3a + slot * 2] = brightness;
  out[0x3b + slot * 2] = ((speed & 0x0f) << 4) | (colorful ? 7 : 0);
  return { block: out, slot };
}

export function patchRgbTab(tab, slot, [r, g, b]) {
  const out = Uint8Array.from(tab);
  out.set([r, g, b], 21 * (slot + 1));
  out.set(SIGNATURE, 0x1fa);
  return out;
}

export class G5KB {
  static async discover(devices, model) {
    for (const d of devices) {
      if (!matchesId(d, model.usb.filter((u) => u.role === 'usb'))) continue;
      const r = findReport(d, 'featureReports', (n, c) => c.usagePage === 0xff00 && n >= REPORT.size - 1);
      if (r) {
        if (!d.opened) await d.open();
        return { main: { dev: d, reportId: r.reportId ?? REPORT.id } };
      }
    }
    return null;
  }

  constructor({ main } = {}, model, { log = () => {}, delay = 35 } = {}) {
    this.model = model;
    this.main = main;
    this.log = log;
    this.delay = delay;
    this.busy = Promise.resolve();
    this.sim = { [CMD.LED | READ]: this.simLed(), [CMD.RGB_TAB | READ]: this.simTab() };
  }

  get mode() { return this.main ? 'usb' : 'sim'; }
  get name() { return this.main?.dev.productName ?? 'Simulator'; }

  simLed() {
    const b = new Uint8Array(LED_SIZE);
    b.set(SIGNATURE, 0x7e);
    return b;
  }

  simTab() {
    const b = new Uint8Array(RGB_TAB_SIZE);
    b.set(SIGNATURE, 0x1fa);
    return b;
  }

  exclusive(fn) {
    const run = this.busy.then(fn, fn);
    this.busy = run.catch(() => {});
    return run;
  }

  async set(p) {
    this.log('→', `${hex(p.slice(0, 24))} … (${p.length} bytes)`);
    await sleep(20);
    if (!this.main) return;
    await this.main.dev.sendFeatureReport(this.main.reportId, p.slice(1));
  }

  async get() {
    await sleep(20);
    const r = toU8(await this.main.dev.receiveFeatureReport(this.main.reportId), REPORT.size - 1);
    const full = new Uint8Array(REPORT.size);
    full[0] = REPORT.id;
    full.set(r, 1);
    this.log('←', `${hex(full.slice(0, 24))} …`);
    return full;
  }

  async write(cmd, sub, data) {
    for (const p of writePackets(cmd, sub, data)) await this.set(p);
  }

  async read(cmd, sub, size) {
    if (!this.main) return this.sim[cmd | READ]?.slice() ?? new Uint8Array(size);
    const total = Math.ceil(size / CHUNK);
    const buf = new Uint8Array(size);
    for (let i = 0; i < total; i++) {
      const n = Math.min(CHUNK, size - i * CHUNK);
      await this.set(header(cmd | READ, sub, total, i, n));
      const r = await this.get();
      buf.set(r.slice(8, 8 + n), i * CHUNK);
    }
    return buf;
  }

  setLighting(cfg) {
    return this.exclusive(async () => {
      const led = await this.read(CMD.LED, 0, LED_SIZE);
      if (!checkSignature(led, 0x7e)) throw new Error('Unexpected LED block from keyboard (signature mismatch) — not writing');
      const { block, slot } = patchLed(led, this.model.lightModes, cfg);
      await this.write(CMD.LED, 0, block);
      const caps = this.model.lightModes[slot].caps;
      if (caps & 0x20 && !cfg.colorful) {
        const tab = await this.read(CMD.RGB_TAB, 0, RGB_TAB_SIZE);
        if (!checkSignature(tab, 0x1fa)) throw new Error('Unexpected colour table (signature mismatch) — not writing');
        await this.write(CMD.RGB_TAB, 0, patchRgbTab(tab, slot, [cfg.r, cfg.g, cfg.b]));
      }
    });
  }

  setSettings({ sleep: sleepHw, debounce }) {
    return this.exclusive(async () => {
      const led = await this.read(CMD.LED, 0, LED_SIZE);
      if (!checkSignature(led, 0x7e)) throw new Error('Unexpected LED block from keyboard (signature mismatch) — not writing');
      const out = Uint8Array.from(led);
      if (debounce != null) out[3] = debounce;
      if (sleepHw != null) out[0x18] = sleepHw;
      await this.write(CMD.LED, 0, out);
    });
  }

  setKeymap(layer, layout, actions) {
    return this.exclusive(async () => {
      const used = [...new Set(Object.values(actions).filter((a) => a?.type === 'macro').map((a) => a.index))];
      const ids = new Map(used.map((idx, i) => [idx, i]));
      await this.write(CMD.MATRIX, layer === 'fn' ? 1 : 0, matrixBlock(layout, actions, ids, this.model.matrixLen, this.model.extraDefaults));
      if (used.length) await this.write(CMD.MACRO, 0, macroBlock(this.macros ?? [], used));
    });
  }

  setMacros(macros) {
    this.macros = macros;
    return Promise.reject(new Error('On this keyboard macros are stored with the keymap — bind them on the Keymap tab and press Apply layer'));
  }

  resetKeys() {
    return this.exclusive(() => this.write(CMD.RESET, 0, Uint8Array.of(1)));
  }

  factoryReset() { return this.resetKeys(); }
  setUserLight() { return Promise.reject(new Unsupported('Per-key lighting')); }
  readUserLight() { return Promise.reject(new Unsupported('Per-key lighting')); }
  setBarLight() { return Promise.reject(new Unsupported('Bar light')); }
  setMatrixEffect() { return Promise.reject(new Unsupported('LED matrix')); }
  uploadScreen() { return Promise.reject(new Unsupported('Screen upload')); }
  syncTime() { return Promise.reject(new Unsupported('Clock sync')); }
  battery() { return Promise.resolve(null); }
}
