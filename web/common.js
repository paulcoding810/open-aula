export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const hex = (u8) => Array.from(u8, (x) => x.toString(16).padStart(2, '0')).join(' ');

export const CAP = { BRIGHTNESS: 0x01, SPEED: 0x02, DIR_LR: 0x04, DIR_UD: 0x08, COLORFUL: 0x10, COLOR: 0x20 };
export const DIRECTION = { LEFT: 0, RIGHT: 1, UP: 2, DOWN: 3 };

export const reportBytes = (r) => (r.items ?? []).reduce((n, it) => n + it.reportSize * it.reportCount, 0) / 8;

export function findReport(dev, kind, pred) {
  for (const c of dev.collections) for (const r of c[kind] ?? []) if (pred(reportBytes(r), c)) return r;
  return null;
}

export function toU8(dv, want) {
  const u = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
  return u.length > want ? u.slice(u.length - want) : u.slice();
}

export const matchesId = (dev, ids) => ids.some((i) => i.vendorId === dev.vendorId && i.productId === dev.productId);

export class ReportQueue {
  constructor(dev) {
    this.items = [];
    this.waiters = [];
    dev.addEventListener('inputreport', (e) => {
      const u = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength).slice();
      const w = this.waiters.shift();
      w ? w(u) : this.items.push(u);
      if (this.items.length > 64) this.items.shift();
    });
  }
  flush() { this.items = []; }
  next(timeout) {
    if (this.items.length) return Promise.resolve(this.items.shift());
    return new Promise((resolve) => {
      const w = (u) => { clearTimeout(t); resolve(u); };
      const t = setTimeout(() => { this.waiters = this.waiters.filter((x) => x !== w); resolve(null); }, timeout);
      this.waiters.push(w);
    });
  }
}

export function rgb565(rgba, width, height) {
  const out = new Uint8Array(width * height * 2);
  for (let i = 0, o = 0; i < width * height; i++, o += 2) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const v = ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
    out[o] = v & 0xff; out[o + 1] = v >> 8;
  }
  return out;
}

export class Unsupported extends Error {
  constructor(what) { super(`${what} is not supported on this model`); }
}
