import { sleep, hex, findReport, matchesId, ReportQueue, Unsupported } from '../common.js';

export const CMD = {
  VERSION: 0x03, BUTTONS: 0x09, MACRO: 0x0d, PARAMS: 0x0f, COMMIT: 0x10,
  LIGHT: 0x21, DPI: 0x22, RATE: 0x23, BATTERY: 0x30,
};
export const FLAG = { WRITE: 0xa5, PARAM: 0xae };
export const MACRO_PLAY = ['Repeat N times', 'Repeat until released', 'Repeat until any click'];
export const BUTTON_SLOTS = ['Left', 'Right', 'Middle', 'Back (button 4)', 'Forward (button 5)', 'DPI button'];
export const DEFAULT_BUTTONS = [
  [0x20, 0x01, 0, 0], [0x20, 0x02, 0, 0], [0x20, 0x04, 0, 0], [0x20, 0x08, 0, 0], [0x20, 0x10, 0, 0],
  [0x21, 0x55, 0, 0], [0x21, 0x38, 0x01, 0], [0x21, 0x38, 0xff, 0], [0x21, 0xaa, 0, 0], [0x21, 0x61, 0, 0], [0x21, 0x62, 0, 0],
];
export const SENSOR = { RIPPLE: 0x10, ANGLE_SNAP: 0x01, MOTION_SYNC: 0x20 };
const MACRO_FLAG = { KEY_DOWN: 0x40, KEY_UP: 0x00, MOUSE_DOWN: 0x43, MOUSE_UP: 0x03 };

export function packet(cmd, flag, len, data = [], profile = 0, offset = 0) {
  const p = new Uint8Array(64);
  p[0] = 0x55; p[1] = cmd; p[2] = flag; p[4] = len;
  p[5] = offset & 0xff; p[6] = offset >> 8; p[7] = profile;
  p.set(Array.from(data).slice(0, 56), 8);
  let sum = 0;
  for (let i = 4; i < 64; i++) sum += p[i];
  p[3] = sum & 0xff;
  return p;
}

export function encodeButton(a) {
  switch (a?.type) {
    case 'disable': return [0, 0, 0, 0];
    case 'mouse':
      return {
        1: [0x20, 0x01, 0, 0], 2: [0x20, 0x04, 0, 0], 3: [0x20, 0x02, 0, 0], 4: [0x20, 0x01, 0x02, 0],
        5: [0x21, 0x38, 0x01, 0], 6: [0x21, 0x38, 0xff, 0], 7: [0x20, 0x08, 0, 0], 8: [0x20, 0x10, 0, 0],
      }[a.id] ?? null;
    case 'dpiLoop': return [0x21, 0x55, 0, 0];
    case 'key':
      if (a.code >= 0xe0 && a.code <= 0xe7) return [0x10, (a.mods & 0xff) | (1 << (a.code - 0xe0)), 0, 0];
      return [0x10, a.mods & 0xff, a.code & 0xff, 0];
    case 'media': return [0x30, a.usage & 0xff, (a.usage >> 8) & 0xff, 0];
    case 'macro':
      if (a.mode === 1) return [0x70, a.index, 1, 2];
      if (a.mode === 2) return [0x70, a.index, 1, 3];
      return [0x70, a.index, Math.max(1, Math.min(255, a.loops ?? 1)), 0];
    default: return null;
  }
}

export function buttonBlock(buttons) {
  const out = new Uint8Array(44);
  DEFAULT_BUTTONS.forEach((d, i) => out.set(encodeButton(buttons?.[i]) ?? d, i * 4));
  return out;
}

export function paramsBlock(m, profile = 0) {
  const b = new Uint8Array(46);
  b[0] = profile;
  b[1] = m.lightMode;
  b[2] = m.rate;
  b[3] = m.dpi.length;
  b[4] = m.dpiIndex + 1;
  m.dpi.forEach((v, i) => {
    const d = Math.max(50, Math.min(26000, v | 0));
    b[5 + i * 2] = d & 0xff; b[6 + i * 2] = d >> 8;
  });
  m.dpiColors.forEach((c, i) => b.set(c, 17 + i * 3));
  b[40] = m.scrollReverse ? 1 : 0;
  b[41] = m.liftoff;
  b[42] = (m.ripple ? SENSOR.RIPPLE : 0) | (m.angleSnap ? SENSOR.ANGLE_SNAP : 0) | (m.motionSync ? SENSOR.MOTION_SYNC : 0);
  b[43] = m.debounce;
  b[44] = m.sleep;
  b[45] = m.esports ? 1 : 0;
  return b;
}

export function macroBlock(macros) {
  const table = new Uint8Array(64);
  const body = [];
  macros.slice(0, 32).forEach((m, i) => {
    const off = 64 + body.length;
    table[i * 2] = off & 0xff; table[i * 2 + 1] = off >> 8;
    const ev = [];
    for (const s of m.steps ?? []) {
      if (s.kind === 'delay') {
        if (ev.length) ev[ev.length - 1].delay += s.ms | 0;
        continue;
      }
      const mouse = s.kind.startsWith('MOUSE');
      const mod = !mouse && s.code >= 0xe0 && s.code <= 0xe7;
      const flag = mouse ? MACRO_FLAG[s.kind] : (s.kind === 'KEY_DOWN' ? 0x40 : 0) | (mod ? 1 : 2);
      ev.push({ delay: 0, flag, code: s.code });
    }
    if (!ev.length) ev.push({ delay: 0, flag: 0, code: 0 });
    ev[ev.length - 1].flag |= 0x80;
    for (const e of ev) {
      const d = e.code || e.flag & 0x7f ? Math.max(1, Math.min(0xffff, e.delay || 1)) : 0;
      body.push(d & 0xff, d >> 8, e.flag, e.code);
    }
  });
  return Uint8Array.from([...table, ...body]);
}

export class Mouse55 {
  static async discover(devices, model) {
    for (const d of devices) {
      const role = model.usb.find((u) => matchesId(d, [u]))?.role;
      if (!role) continue;
      const o = findReport(d, 'outputReports', (n) => n === 64);
      const i = findReport(d, 'inputReports', (n) => n === 64);
      if (!o || !i) continue;
      if (!d.opened) await d.open();
      return { [role === 'dongle' ? 'dongle' : 'main']: { dev: d, reportId: o.reportId ?? 0 } };
    }
    return null;
  }

  constructor({ main, dongle } = {}, model, { log = () => {}, delay = 35 } = {}) {
    this.model = model;
    this.main = main;
    this.dongle = dongle;
    this.link = main ?? dongle;
    this.log = log;
    this.delay = delay;
    this.profile = 0;
    this.busy = Promise.resolve();
    if (this.link) this.q = new ReportQueue(this.link.dev);
  }

  get mode() { return this.main ? 'usb' : this.dongle ? '2.4g' : 'sim'; }
  get name() { return this.link?.dev.productName ?? 'Simulator'; }

  exclusive(fn) {
    const run = this.busy.then(fn, fn);
    this.busy = run.catch(() => {});
    return run;
  }

  async xfer(p) {
    this.log('→', hex(p));
    if (!this.link) { await sleep(1); return null; }
    for (const wait of [0, 100, 1000]) {
      if (wait) await sleep(wait);
      this.q.flush();
      await this.link.dev.sendReport(this.link.reportId, p);
      const deadline = performance.now() + 1000;
      while (performance.now() < deadline) {
        const r = await this.q.next(deadline - performance.now());
        if (!r) break;
        if (r[0] === 0xaa) {
          this.log('←', hex(r));
          return r;
        }
      }
    }
    throw new Error(`No reply to command 0x${p[1].toString(16)}`);
  }

  send(cmd, flag, len, data) { return this.xfer(packet(cmd, flag, len, data, this.profile)); }

  setLighting({ mode }) {
    return this.exclusive(() => this.send(CMD.LIGHT, FLAG.WRITE, 3, [0, 0, mode]));
  }

  setMouseConfig(m) {
    return this.exclusive(async () => {
      this.profile = m.profile ?? 0;
      await this.send(CMD.PARAMS, FLAG.PARAM, 46, paramsBlock(m, this.profile));
      const v = m.dpi[m.dpiIndex] | 0;
      await this.send(CMD.DPI, FLAG.PARAM, 3, [0, 0, m.dpiIndex + 1, v & 0xff, v >> 8]);
      await this.send(CMD.RATE, FLAG.PARAM, 3, [0, 0, m.rate]);
    });
  }

  setButtons(buttons, macros) {
    return this.exclusive(async () => {
      if (buttons.some((b) => b?.type === 'macro')) await this.writeMacros(macros);
      await this.send(CMD.BUTTONS, FLAG.WRITE, 44, buttonBlock(buttons));
    });
  }

  async writeMacros(macros) {
    const data = macroBlock(macros);
    for (let off = 0; off < data.length; off += 56) {
      const part = data.slice(off, off + 56);
      await this.xfer(packet(CMD.MACRO, 0, part.length, part, 0, off));
    }
    await this.xfer(packet(CMD.COMMIT, FLAG.WRITE, 0, []));
  }

  setMacros(macros) {
    return this.exclusive(() => this.writeMacros(macros));
  }

  battery() {
    return this.exclusive(async () => {
      if (this.mode !== '2.4g') return null;
      const r = await this.send(CMD.BATTERY, FLAG.WRITE, 0x2e, []).catch(() => null);
      return r && r[1] === CMD.BATTERY ? Math.min(100, r[8]) : null;
    });
  }

  setKeymap() { return Promise.reject(new Unsupported('Keyboard keymap')); }
  setUserLight() { return Promise.reject(new Unsupported('Per-key lighting')); }
  readUserLight() { return Promise.reject(new Unsupported('Per-key lighting')); }
  setSettings() { return Promise.reject(new Unsupported('Keyboard settings')); }
  setBarLight() { return Promise.reject(new Unsupported('Bar light')); }
  setMatrixEffect() { return Promise.reject(new Unsupported('LED matrix')); }
  uploadScreen() { return Promise.reject(new Unsupported('Screen upload')); }
  syncTime() { return Promise.reject(new Unsupported('Clock sync')); }
  resetKeys() { return Promise.reject(new Unsupported('Reset')); }
  factoryReset() { return Promise.reject(new Unsupported('Reset')); }
}
