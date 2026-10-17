import { MOUSE_ACTIONS } from '../keycodes.js';
import { sleep, hex, toU8, findReport, matchesId, ReportQueue, Unsupported } from '../common.js';

export const OP = {
  BEGIN: 0x18, END: 0x02, APPLY: 0xf0,
  LIGHT: 0x13, SETTINGS: 0x17, TIME: 0x28,
  KEYMAP: 0x11, KEYMAP_FN: 0x27,
  USER_LIGHT: 0x23, USER_LIGHT_READ: 0xf5, LIVE_LIGHT: 0x20,
  MACRO_BEGIN: 0x19, MACRO: 0x15, SCREEN: 0x72,
};

export const USER_LIGHT_MODE = 0x80;

export function barPayload(mode) {
  const p = new Uint8Array(64);
  p[0] = mode;
  tag(p, 62);
  return p;
}

export const BLOCK = 0x240;

const tag = (buf, off) => { buf[off] = 0xaa; buf[off + 1] = 0x55; };

export function command(op, { b2 = 0, count = 0 } = {}) {
  const b = new Uint8Array(64);
  b[0] = 0x04; b[1] = op; b[2] = b2;
  b[8] = count & 0xff; b[9] = (count >> 8) & 0xff;
  return b;
}

export function lightPayload({ mode, r = 0, g = 0, b = 0, colorful = 0, brightness = 5, speed = 3, direction = 0 }) {
  const p = new Uint8Array(64);
  p.set([mode, r, g, b, 0, 0, 0, 0, colorful ? 1 : 0, brightness, speed, direction]);
  tag(p, 62);
  return p;
}

export function settingsPayload({ winLock = 0, altF4 = 0, altTab = 0, fnSwitch = 0, sleep = 0, response = 1 }) {
  const p = new Uint8Array(64);
  p.set([0x00, 0x01, winLock ? 1 : 0, altF4 ? 1 : 0, altTab ? 1 : 0, fnSwitch, sleep, 0, response]);
  tag(p, 62);
  return p;
}

export function timePayload(date = new Date(), slot = 1) {
  const p = new Uint8Array(64);
  p.set([0, slot, 0x5a, date.getFullYear() % 2000, date.getMonth() + 1, date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds(), 0, date.getDay()]);
  tag(p, 62);
  return p;
}

export function encodeKeyAction(a) {
  switch (a?.type) {
    case 'disable': return [0x05, 0x03, 0, 0];
    case 'key': {
      const mods = a.mods & 0xff;
      if (a.code >= 0xe0 && a.code <= 0xe7) return [0x02, mods | (1 << (a.code - 0xe0)), 0, 0];
      return [0x02, mods, a.code & 0xff, 0];
    }
    case 'mouse': {
      const m = MOUSE_ACTIONS.find((x) => x.id === a.id);
      return m ? [0x01, ...m.bytes, 0] : null;
    }
    case 'media': return [0x03, a.usage & 0xff, (a.usage >> 8) & 0xff, 0];
    case 'macro': return [0x06, a.index & 0xff, a.mode & 0xff, (a.loops ?? 1) & 0xff];
    case 'raw': return a.bytes.slice(0, 4);
    default: return null;
  }
}

export function keymapBlock(keys, actions) {
  const buf = new Uint8Array(BLOCK);
  for (const k of keys) {
    const bytes = encodeKeyAction(actions[k.code]);
    if (bytes) buf.set(bytes, k.idx * 4);
  }
  tag(buf, BLOCK - 2);
  return buf;
}

export function userLightBlock(keys, colors) {
  const buf = new Uint8Array(BLOCK);
  for (const k of keys) {
    const c = colors[k.code];
    if (c) buf.set([k.light, c[0], c[1], c[2]], k.light * 4);
  }
  tag(buf, BLOCK - 2);
  return buf;
}

export function decodeUserLightBlock(keys, buf) {
  const colors = {};
  for (const k of keys) {
    const o = k.light * 4;
    if (o + 3 < buf.length) colors[k.code] = [buf[o + 1], buf[o + 2], buf[o + 3]];
  }
  return colors;
}

export const MACRO_EVENT = { KEY_DOWN: 0xb0, KEY_UP: 0x30, MOUSE_DOWN: 0x90, MOUSE_UP: 0x10, DELAY: 0x50 };
export const MACRO_MOUSE = { LEFT: 1, RIGHT: 2, MIDDLE: 4 };
export const MACRO_PLAY = ['Play once', 'Repeat N times', 'Toggle (press again to stop)', 'Repeat while held', 'Click to play'];
const MACRO_TABLE = 400;
const MACRO_MAX = 0xe00;

function macroBody(macros) {
  const buf = new Uint8Array(MACRO_MAX);
  let off = MACRO_TABLE;
  macros.forEach((m, i) => {
    const steps = m.steps ?? [];
    if (!steps.length) { buf.set([0xff, 0xff, 0xff, 0xff], i * 4); return; }
    if (off + 8 + steps.length * 4 > MACRO_MAX - 64) throw new Error('Macro memory full');
    buf[i * 4] = off & 0xff; buf[i * 4 + 1] = off >> 8;
    buf[off] = steps.length & 0xff; buf[off + 1] = steps.length >> 8;
    steps.forEach((s, j) => {
      const o = off + 8 + j * 4;
      if (s.kind === 'delay') {
        const ms = Math.max(10, s.ms | 0);
        buf.set([ms & 0xff, (ms >> 8) & 0xff, 0, MACRO_EVENT.DELAY], o);
      } else {
        buf.set([0, 0, s.code, MACRO_EVENT[s.kind]], o);
      }
    });
    off += 8 + steps.length * 4;
  });
  return { buf, len: off };
}

export function macroBlock(macros) {
  const { buf, len } = macroBody(macros);
  const packets = (len >> 6) + (len % 64 === 0 ? 1 : 2);
  const out = buf.slice(0, packets * 64);
  tag(out, out.length - 2);
  return { data: out, packets };
}

export function macroBlockWireless(macros) {
  const { buf, len } = macroBody(macros);
  const chunks = Math.floor(len / 28) + 1 + (len % 28 !== 0 ? 1 : 0);
  const out = new Uint8Array(chunks * 28);
  out.set(buf.slice(0, Math.min(len, out.length)));
  tag(out, out.length - 2);
  return { data: out, chunks, lastLen: len % 28 };
}

export function screenImage(frames, { width, height, headLength, chunk }) {
  const frameSize = width * height * 2;
  const total = headLength + frameSize * frames.length;
  const chunks = Math.ceil(total / chunk);
  const buf = new Uint8Array(chunks * chunk).fill(0xff);
  buf[0] = frames.length;
  frames.forEach((f, i) => {
    buf[1 + i] = Math.max(1, Math.min(255, Math.round(f.delayMs / 2)));
    buf.set(f.pixels, headLength + i * frameSize);
  });
  return { data: buf, chunks };
}

export function dongleFrame(cmd, len, seq, data = []) {
  const b = new Uint8Array(33);
  b[1] = cmd; b[2] = len; b[3] = seq;
  b.set(data.slice(0, 28), 4);
  let sum = 0;
  for (let i = 0; i < 32; i++) sum += b[i];
  b[32] = sum & 0xff;
  return b;
}

export function dongleShort(cmd, payload) {
  const d = new Uint8Array(28);
  d.set(payload.slice(0, 14));
  tag(d, 14);
  return dongleFrame(cmd, 0x10, 0, d);
}

export function dongleBlock(cmd, block) {
  const frames = [];
  for (let i = 0; i < 21; i++) {
    frames.push(dongleFrame(cmd, i === 20 ? 0x10 : 0x1c, i, block.slice(i * 28, i * 28 + 28)));
  }
  return frames;
}

export class Aula04 {
  static async discover(devices, model) {
    const usb = model.usb.filter((u) => u.role === 'usb');
    const dongle = model.usb.filter((u) => u.role === 'dongle');
    const out = {};
    for (const d of devices) {
      if (matchesId(d, usb)) {
        const f = !out.main && findReport(d, 'featureReports', (n) => n === 64);
        if (f) out.main = { dev: d, reportId: f.reportId ?? 0 };
        const s = !out.screen && model.screen && findReport(d, 'outputReports', (n) => n >= model.screen.chunk);
        if (s) out.screen = { dev: d, reportId: s.reportId ?? 0 };
      }
      if (matchesId(d, dongle) && !out.dongle) {
        const o = findReport(d, 'outputReports', (n) => n === 32);
        const i = findReport(d, 'inputReports', (n) => n === 32);
        if (o && i) out.dongle = { dev: d, reportId: o.reportId ?? 0 };
      }
    }
    if (!out.main && !out.dongle) return null;
    for (const k of Object.values(out)) if (!k.dev.opened) await k.dev.open();
    return out;
  }

  constructor({ main, screen, dongle } = {}, model, { log = () => {}, delay = 35 } = {}) {
    this.model = model;
    this.main = main;
    this.screen = screen;
    this.dongle = dongle;
    this.log = log;
    this.delay = delay;
    this.busy = Promise.resolve();
    if (dongle) this.dongleQ = new ReportQueue(dongle.dev);
    if (screen) this.screenQ = new ReportQueue(screen.dev);
  }

  get mode() { return this.main ? 'usb' : this.dongle ? '2.4g' : 'sim'; }
  get name() { return (this.main ?? this.dongle)?.dev.productName ?? 'Simulator'; }

  exclusive(fn) {
    const run = this.busy.then(fn, fn);
    this.busy = run.catch(() => {});
    return run;
  }

  async feature(bytes, readback) {
    this.log('→', hex(bytes));
    await sleep(this.delay);
    if (!this.main) return null;
    await this.main.dev.sendFeatureReport(this.main.reportId, bytes);
    if (!readback) return null;
    await sleep(this.delay);
    let res = toU8(await this.main.dev.receiveFeatureReport(this.main.reportId), 64);
    this.log('←', hex(res));
    if (res[1] === bytes[1] && res[3] === 0xff) {
      this.log('⚠', 'device reported 0xff, retrying');
      await sleep(this.delay);
      await this.main.dev.sendFeatureReport(this.main.reportId, bytes);
      await sleep(this.delay);
      res = toU8(await this.main.dev.receiveFeatureReport(this.main.reportId), 64);
      this.log('←', hex(res));
    }
    return res;
  }

  cmd(op, opts, readback = true) { return this.feature(command(op, opts), readback); }

  async block(data) {
    await sleep(this.delay);
    for (let i = 0; i < data.length; i += 64) {
      const chunk = data.slice(i, i + 64);
      this.log('→', hex(chunk));
      if (!this.main) continue;
      for (let tries = 0; ; tries++) {
        try {
          await this.main.dev.sendFeatureReport(this.main.reportId, chunk);
          break;
        } catch (e) {
          if (tries >= 10) throw e;
          await sleep(this.delay);
        }
      }
      await sleep(this.delay);
    }
  }

  async radio(frame) {
    this.log('⇢', hex(frame));
    if (!this.dongle) { await sleep(2); return null; }
    this.dongleQ.flush();
    const body = frame.slice(1);
    try {
      await this.dongle.dev.sendReport(this.dongle.reportId, body);
    } catch {
      await sleep(10);
      await this.dongle.dev.sendReport(this.dongle.reportId, body);
    }
    await sleep(5);
    const deadline = performance.now() + 300;
    while (performance.now() < deadline) {
      const r = await this.dongleQ.next(deadline - performance.now());
      if (!r) break;
      if (r[0] === frame[1] && r[1] === frame[2] && r[2] === frame[3]) {
        this.log('⇠', hex(r));
        return r;
      }
    }
    return null;
  }

  async radioMany(frames) {
    for (const f of frames) { await this.radio(f); await sleep(2); }
  }

  setLighting(cfg) {
    return this.exclusive(async () => {
      const p = lightPayload(cfg);
      if (this.mode === '2.4g') return this.radio(dongleShort(0x05, p));
      await this.cmd(OP.BEGIN);
      await this.cmd(OP.LIGHT, { count: 1 });
      await this.feature(p, false);
      await this.cmd(OP.END);
      await this.cmd(OP.APPLY, {}, false);
    });
  }

  setBarLight(mode) {
    return this.exclusive(async () => {
      if (!this.model.features.bar) throw new Unsupported('Bar light');
      const p = barPayload(mode);
      if (this.mode === '2.4g') {
        const d = new Uint8Array(28);
        d[0] = mode; d[14] = 0xaa; d[15] = 0x55;
        return this.radio(dongleFrame(0x05, 0x01, 0, d));
      }
      await this.cmd(OP.BEGIN);
      await this.cmd(OP.LIGHT, { count: 1 });
      await this.feature(p, false);
      await this.cmd(OP.END);
      await this.cmd(OP.APPLY, {}, false);
    });
  }

  setUserLight(keys, colors, brightness) {
    return this.exclusive(async () => {
      const p = lightPayload({ mode: USER_LIGHT_MODE, colorful: 0, brightness, speed: 0 });
      const block = userLightBlock(keys, colors);
      if (this.mode === '2.4g') {
        await this.radio(dongleShort(0x05, p));
        return this.radioMany(dongleBlock(0x14, block));
      }
      await this.cmd(OP.BEGIN);
      await this.cmd(OP.LIGHT, { count: 1 });
      await this.feature(p, false);
      await this.cmd(OP.END);
      await this.cmd(OP.APPLY, {}, false);
      await this.cmd(OP.BEGIN);
      await this.cmd(OP.USER_LIGHT, { count: BLOCK / 64 });
      await this.block(block);
      await this.cmd(OP.END);
      await this.cmd(OP.APPLY);
    });
  }

  readUserLight(keys) {
    return this.exclusive(async () => {
      if (this.mode !== 'usb') throw new Error('Reading per-key colours needs a USB connection');
      const n = BLOCK / 64;
      await this.cmd(OP.USER_LIGHT_READ, { count: n });
      const buf = new Uint8Array(BLOCK);
      for (let i = 0; i < n; i++) {
        await sleep(3);
        const r = toU8(await this.main.dev.receiveFeatureReport(this.main.reportId), 64);
        this.log('←', hex(r));
        buf.set(r, i * 64);
      }
      await this.cmd(OP.END);
      return decodeUserLightBlock(keys, buf);
    });
  }

  setSettings(s) {
    return this.exclusive(async () => {
      const p = settingsPayload(s);
      if (this.mode === '2.4g') return this.radio(dongleShort(0x07, p));
      await this.cmd(OP.BEGIN);
      await this.cmd(OP.SETTINGS, { b2: 1, count: 1 });
      await this.feature(p, false);
      await this.cmd(OP.END);
    });
  }

  setKeymap(layer, keys, actions) {
    return this.exclusive(async () => {
      const block = keymapBlock(keys, actions);
      if (this.mode === '2.4g') return this.radioMany(dongleBlock(layer === 'fn' ? 0x12 : 0x10, block));
      await this.cmd(OP.BEGIN);
      await this.cmd(layer === 'fn' ? OP.KEYMAP_FN : OP.KEYMAP, { count: BLOCK / 64 });
      await this.block(block);
      await this.cmd(OP.END);
      await this.cmd(OP.APPLY);
    });
  }

  setMacros(macros) {
    return this.exclusive(async () => {
      if (this.mode === '2.4g') {
        const { data, chunks, lastLen } = macroBlockWireless(macros);
        const frames = [];
        for (let i = 0; i < chunks; i++) {
          frames.push(dongleFrame(0x09, i === chunks - 1 ? lastLen : 0x1c, i, data.slice(i * 28, i * 28 + 28)));
        }
        return this.radioMany(frames);
      }
      const { data, packets } = macroBlock(macros);
      await this.cmd(OP.MACRO_BEGIN);
      await this.cmd(OP.MACRO, { count: packets });
      await sleep(30);
      await this.block(data);
      await sleep(30);
      await this.cmd(OP.END);
    });
  }

  syncTime(slot = 1, date = new Date()) {
    return this.exclusive(async () => {
      const p = timePayload(date, slot);
      if (this.mode === '2.4g') return this.radio(dongleShort(0x0c, p));
      await this.cmd(OP.BEGIN);
      await this.cmd(OP.TIME, { count: 1 });
      await this.feature(p, true);
      await this.cmd(OP.END);
    });
  }

  uploadScreen(frames, slot = 1, onProgress = () => {}) {
    return this.exclusive(async () => {
      if (!this.model.screen) throw new Unsupported('Screen upload');
      if (this.mode === '2.4g') throw new Error('The screen can only be updated over USB');
      if (this.mode === 'usb' && !this.screen) throw new Error('Screen interface not found — grant access to all keyboard interfaces');
      const { data, chunks } = screenImage(frames, this.model.screen);
      await this.cmd(OP.BEGIN);
      await this.cmd(OP.SCREEN, { b2: slot, count: chunks });
      for (let i = 0; i < chunks; i++) {
        const chunk = data.slice(i * this.model.screen.chunk, (i + 1) * this.model.screen.chunk);
        if (this.screen) {
          this.screenQ.flush();
          await this.screen.dev.sendReport(this.screen.reportId, chunk);
          await this.screenQ.next(300);
        } else if (i < 2) {
          this.log('⇒', `${hex(chunk.slice(0, 32))} … (${chunk.length} bytes)`);
        }
        onProgress((i + 1) / chunks);
      }
      await this.cmd(OP.END);
    });
  }

  setMatrixEffect() { return Promise.reject(new Unsupported('LED matrix')); }
  resetKeys() { return Promise.reject(new Unsupported('Keymap reset')); }
  factoryReset() { return Promise.reject(new Unsupported('Factory reset')); }

  battery() {
    return this.exclusive(async () => {
      if (this.mode !== '2.4g') return null;
      const r = await this.radio(dongleFrame(0x20, 0x01, 0));
      return r && r[0] === 0x20 && r[3] ? Math.min(100, r[3]) : null;
    });
  }
}
