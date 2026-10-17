import { KEYS, EXTRA_DEFAULTS } from './f75.layout.js';
import { MACRO_PLAY } from '../protocols/g5kb.js';

export default {
  id: 'f75',
  name: 'AULA F75',
  kind: 'keyboard',
  protocol: 'g5kb',
  usb: [{ vendorId: 0x258a, productId: 0x010c, role: 'usb' }],
  layout: KEYS,
  extraDefaults: EXTRA_DEFAULTS,
  matrixLen: 128,
  image: { src: 'assets/f75.png', width: 679, height: 284 },
  features: { lighting: true, keymap: true, macros: true, settings: true },
  lightRange: { brightness: 9, speed: 4 },
  lightModes: [
    { mode: 1, hw: 1, name: 'Fixed on', caps: 0x31 }, { mode: 2, hw: 3, name: 'Respire', caps: 0x33 },
    { mode: 3, hw: 2, name: 'Rainbow', caps: 0x03 }, { mode: 4, hw: 19, name: 'Flash away', caps: 0x33 },
    { mode: 5, hw: 15, name: 'Raindrops', caps: 0x33 }, { mode: 6, hw: 13, name: 'Rainbow wheel', caps: 0x33 },
    { mode: 7, hw: 20, name: 'Ripples shining', caps: 0x33 }, { mode: 8, hw: 16, name: 'Stars twinkle', caps: 0x33 },
    { mode: 9, hw: 18, name: 'Shadow disappear', caps: 0x33 }, { mode: 10, hw: 5, name: 'Retro snake', caps: 0x33 },
    { mode: 11, hw: 7, name: 'Neon stream', caps: 0x33 }, { mode: 12, hw: 17, name: 'Reaction', caps: 0x33 },
    { mode: 13, hw: 12, name: 'Sine wave', caps: 0x33 }, { mode: 14, hw: 8, name: 'Retinue scanning', caps: 0x33 },
    { mode: 15, hw: 28, name: 'Rotating windmill', caps: 0x03 }, { mode: 16, hw: 30, name: 'Colorful waterfall', caps: 0x03 },
    { mode: 17, hw: 14, name: 'Blossoming', caps: 0x03 }, { mode: 18, hw: 29, name: 'Rotating storm', caps: 0x33 },
    { mode: 0, hw: 0, name: 'Off', caps: 0x00 },
  ],
  macroPlay: MACRO_PLAY,
  settings: [
    { key: 'sleep', label: 'Sleep after (wireless)', type: 'select', default: 10, options: [[0, 'Never'], [2, '1 min'], [3, '1.5 min'], [4, '2 min'], [6, '3 min'], [8, '4 min'], [10, '5 min'], [20, '10 min'], [30, '15 min'], [40, '20 min']] },
    { key: 'debounce', label: 'Debounce', type: 'select', default: 1, options: [[1, '1'], [2, '2'], [3, '3'], [4, '4']] },
  ],
};
