import { MACRO_PLAY, BUTTON_SLOTS } from '../protocols/mouse55.js';

export default {
  id: 'sc620',
  name: 'AULA SC620',
  kind: 'mouse',
  protocol: 'mouse55',
  usb: [
    { vendorId: 0xa8a4, productId: 0x2255, role: 'usb' },
    { vendorId: 0xa8a5, productId: 0x2255, role: 'dongle' },
  ],
  layout: [],
  image: { src: 'assets/sc620.png', width: 297, height: 525 },
  features: { lighting: true, dpi: true, buttons: true, macros: true, settings: true },
  lightModes: [
    { mode: 0, name: 'Wave', caps: 0 }, { mode: 1, name: 'Neon', caps: 0 }, { mode: 2, name: 'Cycling flash', caps: 0 },
    { mode: 3, name: 'YOYO ball', caps: 0 }, { mode: 4, name: 'Single flash', caps: 0 }, { mode: 5, name: 'Breathing loop', caps: 0 },
    { mode: 6, name: 'Off', caps: 0 },
  ],
  macroPlay: MACRO_PLAY,
  buttonSlots: BUTTON_SLOTS,
  mouseDefaults: {
    dpi: [800, 1600, 3200, 4800, 8000, 12000],
    dpiIndex: 2,
    dpiColors: [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255]],
    buttons: [],
  },
  settings: [
    { key: 'profile', label: 'Onboard profile', type: 'select', default: 0, options: [[0, '1'], [1, '2'], [2, '3'], [3, '4'], [4, '5']] },
    { key: 'rate', label: 'Polling rate', type: 'select', default: 4, options: [[1, '125 Hz'], [2, '250 Hz'], [3, '500 Hz'], [4, '1000 Hz']] },
    { key: 'sleep', label: 'Sleep after', type: 'select', default: 20, options: [[1, '1 min'], [3, '3 min'], [5, '5 min'], [10, '10 min'], [20, '20 min'], [30, '30 min'], [60, '1 hour']] },
    { key: 'debounce', label: 'Button debounce (ms)', type: 'number', min: 0, max: 30, default: 8 },
    { key: 'liftoff', label: 'Lift-off distance', type: 'select', default: 1, options: [[1, 'Low (1 mm)'], [2, 'High (2 mm)']] },
    { key: 'scrollReverse', label: 'Reverse scroll direction', type: 'check', default: 0 },
    { key: 'esports', label: 'E-sports mode', type: 'check', default: 1 },
    { key: 'ripple', label: 'Ripple control', type: 'check', default: 1 },
    { key: 'angleSnap', label: 'Angle snap', type: 'check', default: 0 },
    { key: 'motionSync', label: 'Motion sync', type: 'check', default: 1 },
  ],
};
