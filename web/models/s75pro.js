import { KEYS } from './s75pro.layout.js';
import { MACRO_PLAY } from '../protocols/aula04.js';

export default {
  id: 's75pro',
  name: 'AULA S75 Pro',
  kind: 'keyboard',
  protocol: 'aula04',
  usb: [
    { vendorId: 0x0c45, productId: 0x800a, role: 'usb' },
    { vendorId: 0x05ac, productId: 0x024f, role: 'dongle' },
  ],
  layout: KEYS,
  image: { src: 'assets/s75pro.png', width: 800, height: 300 },
  features: { lighting: true, perkey: true, keymap: true, fnLayer: true, macros: true, screen: true, settings: true, bar: true },
  lightRange: { brightness: 5, speed: 5 },
  lightModes: [
    { mode: 1, name: 'Static', caps: 0x31 }, { mode: 2, name: 'Single On', caps: 0x33 },
    { mode: 3, name: 'Single Off', caps: 0x33 }, { mode: 4, name: 'Glittering', caps: 0x33 },
    { mode: 5, name: 'Fluttering', caps: 0x33 }, { mode: 6, name: 'Colourful', caps: 0x03 },
    { mode: 7, name: 'Breath', caps: 0x33 }, { mode: 8, name: 'Spectrum', caps: 0x03 },
    { mode: 9, name: 'Outward', caps: 0x33 }, { mode: 10, name: 'Scrolling', caps: 0x3b },
    { mode: 11, name: 'Rolling', caps: 0x37 }, { mode: 12, name: 'Rotating', caps: 0x37 },
    { mode: 13, name: 'Explode', caps: 0x33 }, { mode: 14, name: 'Launch', caps: 0x33 },
    { mode: 15, name: 'Ripples', caps: 0x33 }, { mode: 16, name: 'Flowing', caps: 0x37 },
    { mode: 17, name: 'Pulsating', caps: 0x33 }, { mode: 18, name: 'Tilt', caps: 0x37 },
    { mode: 19, name: 'Shuttle', caps: 0x33 }, { mode: 0, name: 'LED Off', caps: 0x00 },
  ],
  barModes: [
    { mode: 0x20, name: 'Flowing' }, { mode: 0x21, name: 'Red' }, { mode: 0x22, name: 'Yellow' },
    { mode: 0x23, name: 'Green' }, { mode: 0x24, name: 'Ice Blue' }, { mode: 0x25, name: 'Blue' },
    { mode: 0x26, name: 'Pink' }, { mode: 0x27, name: 'White' }, { mode: 0x28, name: 'Neon' },
    { mode: 0x29, name: 'Off' },
  ],
  macroPlay: MACRO_PLAY,
  settings: [
    { key: 'winLock', label: 'Disable Windows key', type: 'check', default: 0 },
    { key: 'altF4', label: 'Disable Alt + F4', type: 'check', default: 0 },
    { key: 'altTab', label: 'Disable Alt + Tab', type: 'check', default: 0 },
    { key: 'fnSwitch', label: 'Fn layer switch', type: 'select', options: [[0, 'Momentary'], [1, 'Toggle']], default: 0 },
    { key: 'sleep', label: 'Sleep after', type: 'select', options: [[0, 'Never'], [1, '1 min'], [2, '5 min'], [3, '30 min']], default: 0 },
    { key: 'response', label: 'Key response (debounce)', type: 'select', options: [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], default: 1 },
  ],
  screen: { width: 135, height: 240, headLength: 256, maxFrames: 141, chunk: 4096 },
};
