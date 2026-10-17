const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const HID_NAMES = {};
[...LETTERS].forEach((c, i) => (HID_NAMES[0x04 + i] = c));
['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].forEach((c, i) => (HID_NAMES[0x1e + i] = c));
Object.assign(HID_NAMES, {
  0x28: 'Enter', 0x29: 'Esc', 0x2a: 'Backspace', 0x2b: 'Tab', 0x2c: 'Space',
  0x2d: '-', 0x2e: '=', 0x2f: '[', 0x30: ']', 0x31: '\\', 0x32: 'Non-US #', 0x33: ';', 0x34: "'",
  0x35: '`', 0x36: ',', 0x37: '.', 0x38: '/', 0x39: 'CapsLock',
  0x46: 'PrintScreen', 0x47: 'ScrollLock', 0x48: 'Pause', 0x49: 'Insert', 0x4a: 'Home',
  0x4b: 'PageUp', 0x4c: 'Delete', 0x4d: 'End', 0x4e: 'PageDown',
  0x4f: 'Right', 0x50: 'Left', 0x51: 'Down', 0x52: 'Up', 0x53: 'NumLock',
  0x54: 'KP /', 0x55: 'KP *', 0x56: 'KP -', 0x57: 'KP +', 0x58: 'KP Enter',
  0x59: 'KP 1', 0x5a: 'KP 2', 0x5b: 'KP 3', 0x5c: 'KP 4', 0x5d: 'KP 5', 0x5e: 'KP 6',
  0x5f: 'KP 7', 0x60: 'KP 8', 0x61: 'KP 9', 0x62: 'KP 0', 0x63: 'KP .', 0x64: 'Non-US \\', 0x65: 'Menu',
  0xe0: 'L-Ctrl', 0xe1: 'L-Shift', 0xe2: 'L-Alt', 0xe3: 'L-Win', 0xe4: 'R-Ctrl', 0xe5: 'R-Shift', 0xe6: 'R-Alt', 0xe7: 'R-Win',
});
for (let i = 0; i < 12; i++) HID_NAMES[0x3a + i] = `F${i + 1}`;
for (let i = 0; i < 12; i++) HID_NAMES[0x68 + i] = `F${i + 13}`;

export const MODIFIERS = [
  ['L-Ctrl', 0x01], ['L-Shift', 0x02], ['L-Alt', 0x04], ['L-Win', 0x08],
  ['R-Ctrl', 0x10], ['R-Shift', 0x20], ['R-Alt', 0x40], ['R-Win', 0x80],
];

const CODE_TO_HID = {
  Enter: 0x28, Escape: 0x29, Backspace: 0x2a, Tab: 0x2b, Space: 0x2c, Minus: 0x2d, Equal: 0x2e,
  BracketLeft: 0x2f, BracketRight: 0x30, Backslash: 0x31, Semicolon: 0x33, Quote: 0x34, Backquote: 0x35,
  Comma: 0x36, Period: 0x37, Slash: 0x38, CapsLock: 0x39, PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48,
  Insert: 0x49, Home: 0x4a, PageUp: 0x4b, Delete: 0x4c, End: 0x4d, PageDown: 0x4e,
  ArrowRight: 0x4f, ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52, NumLock: 0x53,
  NumpadDivide: 0x54, NumpadMultiply: 0x55, NumpadSubtract: 0x56, NumpadAdd: 0x57, NumpadEnter: 0x58,
  NumpadDecimal: 0x63, IntlBackslash: 0x64, ContextMenu: 0x65,
  ControlLeft: 0xe0, ShiftLeft: 0xe1, AltLeft: 0xe2, MetaLeft: 0xe3,
  ControlRight: 0xe4, ShiftRight: 0xe5, AltRight: 0xe6, MetaRight: 0xe7,
};
[...LETTERS].forEach((c, i) => (CODE_TO_HID[`Key${c}`] = 0x04 + i));
for (let i = 1; i <= 9; i++) CODE_TO_HID[`Digit${i}`] = 0x1d + i;
CODE_TO_HID.Digit0 = 0x27;
for (let i = 1; i <= 9; i++) CODE_TO_HID[`Numpad${i}`] = 0x58 + i;
CODE_TO_HID.Numpad0 = 0x62;
for (let i = 1; i <= 24; i++) CODE_TO_HID[`F${i}`] = i <= 12 ? 0x39 + i : 0x5b + i;

export const hidFromEvent = (e) => CODE_TO_HID[e.code];
export const hidName = (code) => HID_NAMES[code] ?? `0x${code.toString(16).padStart(2, '0')}`;

export const MOUSE_ACTIONS = [
  { id: 1, name: 'Left click', bytes: [0x01, 0x01] },
  { id: 3, name: 'Right click', bytes: [0x01, 0x02] },
  { id: 2, name: 'Middle click', bytes: [0x01, 0x04] },
  { id: 4, name: 'Double click', bytes: [0x01, 0x03] },
  { id: 5, name: 'Scroll up', bytes: [0x03, 0x01] },
  { id: 6, name: 'Scroll down', bytes: [0x03, 0xff] },
  { id: 7, name: 'Mouse button 4', bytes: [0x01, 0x08] },
  { id: 8, name: 'Mouse button 5', bytes: [0x01, 0x10] },
];

export const MEDIA_ACTIONS = [
  ['Play/Pause', 0xcd], ['Stop', 0xb7], ['Previous track', 0xb6], ['Next track', 0xb5],
  ['Volume +', 0xe9], ['Volume -', 0xea], ['Mute', 0xe2],
  ['Calculator', 0x192], ['Mail', 0x18a], ['Media player', 0x183], ['My computer', 0x194],
  ['Browser home', 0x223], ['Browser refresh', 0x227], ['Browser stop', 0x226],
  ['Browser back', 0x224], ['Browser forward', 0x225], ['Browser favorites', 0x22a], ['Browser search', 0x221],
];
