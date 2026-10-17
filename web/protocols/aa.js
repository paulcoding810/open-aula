import { sleep, hex, findReport, matchesId, ReportQueue, Unsupported } from '../common.js';
import { encodeKeyAction } from './aula04.js';

export const CMD = {
  SAVE: 0x00, RESET: 0x0f,
  INFO: 0x10, READ_SETTINGS: 0x11, READ_KEYS: 0x12, READ_LED: 0x13, READ_COLORS: 0x14, READ_MACRO: 0x15, READ_FN: 0x16,
  WRITE_SETTINGS: 0x21, WRITE_KEYS: 0x22, WRITE_LED: 0x23, WRITE_COLORS: 0x24, WRITE_MACRO: 0x25, WRITE_FN: 0x26,
  MATRIX: 0x2a,
};
export const RESET = { KEYS: 0x05, ALL: 0xff };
export const USER_LIGHT_MODE = 0x80;
export const PACK = 512;
export const MACRO_TABLE = 400;
export const MACRO_SIZE = 4008;
export const MACRO_PLAY = ['Play once', 'Repeat N times', 'Toggle (press again to stop)'];
const MACRO_FLAG = { KEY_DOWN: 0xb0, KEY_UP: 0x30, MOUSE_DOWN: 0x90, MOUSE_UP: 0x10 };

export function packet(cmd, len, offset, data = [], packLen = 32, opt) {
  const p = new Uint8Array(packLen);
  p[0] = 0xaa; p[1] = cmd; p[2] = len; p[3] = offset & 0xff; p[4] = offset >> 8;
  if (opt) p.set(opt.slice(0, 3), 5);
  p.set(Array.from(data).slice(0, packLen - 8), 8);
  return p;
}

export function chunked(cmd, data, packLen, opt) {
  const size = packLen - 8;
  const rem = data.length % size;
  const n = Math.ceil(data.length / size) || 1;
  const out = [];
  for (let c = 0; c < n; c++) {
    const len = c === n - 1 && c !== 0 && rem !== 0 ? rem : size;
    out.push(packet(cmd, len, c * size, data.slice(c * size, c * size + size), packLen, opt));
  }
  return out;
}

export function command(cmd, args, packLen) {
  const p = new Uint8Array(packLen);
  p[0] = 0xaa; p[1] = cmd;
  p.set(args, 2);
  return p;
}

export function ledPayload({ mode, r = 0, g = 0, b = 0, colorful = 0, brightness = 5, speed = 3, direction = 0 }) {
  return Uint8Array.from([mode, r, g, b, 0xff, 0, 0, 0, colorful ? 1 : 0, brightness, speed, direction, 0, 0, 0xaa, 0x55]);
}

export function keyPack(layout, actions, current, { defaults = true } = {}) {
  const buf = current ? Uint8Array.from(current.slice(0, PACK)) : new Uint8Array(PACK);
  for (const k of layout) {
    const a = actions[k.code];
    const bytes = encodeKeyAction(a) ?? (defaults && k.hid ? encodeKeyAction({ type: 'key', code: k.hid, mods: 0 }) : null);
    if (bytes) buf.set(bytes, k.idx * 4);
  }
  return buf;
}

export function colorPack(layout, colors) {
  const buf = new Uint8Array(PACK);
  for (const k of layout) {
    const c = colors[k.code] ?? [0, 0, 0];
    buf.set([k.light, c[0], c[1], c[2]], k.light * 4);
  }
  return buf;
}

export function decodeColorPack(layout, buf) {
  const colors = {};
  for (const k of layout) colors[k.code] = Array.from(buf.slice(k.light * 4 + 1, k.light * 4 + 4));
  return colors;
}

export function macroRecords(steps) {
  const recs = [];
  for (const s of steps) {
    if (s.kind === 'delay') {
      if (recs.length) recs[recs.length - 1].delay += s.ms | 0;
    } else {
      recs.push({ code: s.code, flag: MACRO_FLAG[s.kind], delay: 0 });
    }
  }
  return recs;
}

export function macroPack(macros, size = MACRO_SIZE) {
  const buf = new Uint8Array(size);
  let addr = MACRO_TABLE;
  macros.forEach((m, i) => {
    const recs = macroRecords(m.steps ?? []);
    if (addr + 4 + recs.length * 4 > size) throw new Error('Macro memory full');
    buf.set([addr & 0xff, (addr >> 8) & 0xff, (addr >> 16) & 0xff, addr >>> 24], i * 4);
    const n = recs.length * 2;
    buf.set([n & 0xff, n >> 8, 0, 0], addr);
    recs.forEach((r, j) => {
      const d = Math.min(0xffff, Math.max(0, r.delay));
      buf.set([d & 0xff, d >> 8, r.code, r.flag], addr + 4 + j * 4);
    });
    addr += 4 + recs.length * 4;
  });
  return buf;
}

export function settingsPack(current, { sleep: rest, response, rate }) {
  const t = new Uint8Array(16);
  for (const i of [3, 4, 5, 6, 7, 8, 9, 11, 14, 15]) t[i] = current?.[i] ?? 0;
  if (rest != null) t[3] = rest;
  if (response != null) t[4] = response;
  if (rate != null) t[5] = rate;
  return t;
}

export class AA {
  static async discover(devices, model) {
    const out = {};
    for (const d of devices) {
      const role = model.usb.find((u) => matchesId(d, [u]))?.role;
      if (!role) continue;
      const vendor = (c) => c.usagePage >= 0xff00;
      const o = findReport(d, 'outputReports', (n, c) => vendor(c) && (n === 32 || n === 64));
      const i = findReport(d, 'inputReports', (n, c) => vendor(c) && (n === 32 || n === 64));
      if (!o || !i) continue;
      const packLen = [64, 32].find((n) => findReport(d, 'outputReports', (b, c) => vendor(c) && b === n)) ?? 32;
      const key = role === 'dongle' ? 'dongle' : 'main';
      if (!out[key]) out[key] = { dev: d, reportId: o.reportId ?? 0, packLen };
    }
    if (!out.main && !out.dongle) return null;
    for (const k of Object.values(out)) if (!k.dev.opened) await k.dev.open();
    return out;
  }

  constructor({ main, dongle } = {}, model, { log = () => {}, delay = 35 } = {}) {
    this.model = model;
    this.main = main;
    this.dongle = dongle;
    this.link = main ?? dongle;
    this.packLen = this.link?.packLen ?? model.packLen ?? 32;
    this.log = log;
    this.delay = delay;
    this.busy = Promise.resolve();
    this.cache = {};
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
    for (let attempt = 0; attempt < 2; attempt++) {
      this.q.flush();
      await this.link.dev.sendReport(this.link.reportId, p);
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        const r = await this.q.next(deadline - performance.now());
        if (!r) break;
        if (r[1] === p[1]) {
          this.log('←', hex(r));
          return r;
        }
      }
    }
    throw new Error(`No reply to command 0x${p[1].toString(16)}`);
  }

  async send(cmd, data, opt) {
    for (const p of chunked(cmd, data, this.packLen, opt)) await this.xfer(p);
  }

  async read(cmd, size) {
    const buf = new Uint8Array(size);
    for (const p of chunked(cmd, new Uint8Array(size), this.packLen)) {
      const r = await this.xfer(p);
      if (!r) continue;
      const len = r[2], off = r[3] | (r[4] << 8);
      buf.set(r.slice(8, 8 + len).slice(0, Math.max(0, size - off)), off);
    }
    return buf;
  }

  save() { return this.send(CMD.SAVE, [0, 0, 0, 0]); }

  async info() {
    if (!this.cache.info) this.cache.info = await this.read(CMD.INFO, 32);
    return this.cache.info;
  }

  async macroSize() {
    const d = await this.info();
    const total = d[2] | ((d[3] & 0x7f) << 8);
    if (!total) return MACRO_SIZE;
    return total === 4608 ? total - 600 : total - 100;
  }

  setLighting(cfg) {
    return this.exclusive(() => this.send(CMD.WRITE_LED, ledPayload(cfg)));
  }

  setBarLight() { return Promise.reject(new Unsupported('Bar light')); }
  uploadScreen() { return Promise.reject(new Unsupported('Screen upload')); }
  syncTime() { return Promise.reject(new Unsupported('Clock sync')); }

  setUserLight(layout, colors, brightness) {
    return this.exclusive(async () => {
      await this.send(CMD.WRITE_LED, ledPayload({ mode: USER_LIGHT_MODE, brightness, speed: 0 }));
      await this.send(CMD.WRITE_COLORS, colorPack(layout, colors));
    });
  }

  readUserLight(layout) {
    return this.exclusive(async () => decodeColorPack(layout, await this.read(CMD.READ_COLORS, PACK)));
  }

  setKeymap(layer, layout, actions) {
    return this.exclusive(async () => {
      const fn = layer === 'fn';
      const current = await this.read(fn ? CMD.READ_FN : CMD.READ_KEYS, PACK);
      await this.send(fn ? CMD.WRITE_FN : CMD.WRITE_KEYS, keyPack(layout, actions, current, { defaults: !fn }));
    });
  }

  setMacros(macros) {
    return this.exclusive(async () => {
      await this.send(CMD.WRITE_MACRO, macroPack(macros, await this.macroSize()));
      await this.save();
    });
  }

  setSettings(s) {
    return this.exclusive(async () => {
      const current = await this.read(CMD.READ_SETTINGS, 32);
      await this.send(CMD.WRITE_SETTINGS, settingsPack(current, s));
      await this.save();
    });
  }

  setMatrixEffect(value) {
    return this.exclusive(() => {
      const t = new Uint8Array(8);
      t[6] = value;
      return this.send(CMD.MATRIX, t);
    });
  }

  resetKeys() {
    return this.exclusive(() => this.xfer(command(CMD.RESET, [RESET.KEYS, 0, 0, 0], this.packLen)));
  }

  factoryReset() {
    return this.exclusive(() => this.xfer(command(CMD.RESET, [RESET.ALL, 0, 0, 0], this.packLen)));
  }

  battery() { return Promise.resolve(null); }
}
