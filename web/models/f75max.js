import s75pro from './s75pro.js';

// Epomaker x AULA F75 Max: same USB IDs and `aula04` protocol family as the S75 Pro,
// but with a 128 x 128 screen and no side light bar.
// The key layout and matrix indices are reused from the S75 Pro and are UNVERIFIED on a real F75 Max.
const F75_MAX_NAME = /F75\s*-?\s*Max/i;

export default {
  ...s75pro,
  id: 'f75max',
  name: 'AULA F75 Max',
  usb: s75pro.usb.map(({ notName, ...i }) => ({ ...i, name: F75_MAX_NAME })),
  // No photo yet: keys are drawn on the S75 Pro's 800 x 300 grid.
  image: { src: null, width: s75pro.image.width, height: s75pro.image.height },
  features: { ...s75pro.features, bar: false },
  barModes: [],
  screen: { width: 128, height: 128, headLength: 256, maxFrames: 255, chunk: 4096 },
};

export { F75_MAX_NAME };
