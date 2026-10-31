/* The Lamp of Dawn (a Haverbex tale) — non-interactive screen texts (credits / prologue / ending / help). */
var STORY = {
  title: 'THE LAMP OF DAWN', subtitle: 'A Haverbex tale', studio: 'HAVERBEX',
  credits: [
    [['HAVERBEX', 'big'], ['PRESENTS', 'sub']],
    [['Pixel art & animation', 'h'], ['Landing Page Bot (랜딩페이지 관리봇)', 'n'], ['', ''], ['Direction', 'h'], ['Direction: 파뱀 토', 'n']],
    [['Quantization · Speed', 'n'], ['Altermagnet RAM · Bio', 'n']],
  ],
  roll: [
    ['CAST', 'h'], ['Rahim  ·  Narin  ·  Orban', 'n'], ['Bones, guards, sentinels', 'n'], ['and Physarum, the Golden Net', 'n'], ['', ''],
    ['TABLETS', 'h'], ['mix-stq  ·  bitnet-embed  ·  bitsandbytes-TPU', 'n'], ['Omegahee  ·  ZCR  ·  Crab-cookbook  ·  blastid', 'n'], ['github.com/Topabaem05', 's'], ['', ''],
    ['PIXEL ART & ANIMATION', 'h'], ['Landing Page Bot (랜딩페이지 관리봇)', 'n'], ['', ''],
    ['DIRECTION', 'h'], ['Direction: 파뱀 토', 'n'], ['', ''],
    ['FONT', 'h'], ['Galmuri (SIL OFL 1.1)', 'n'], ['', ''],
    ['A HAVERBEX PRODUCTION', 'h'], ['', ''], ['', ''], ['THE LAMP OF DAWN', 'T'],
  ],
  prologue: [
    { msg: 'Saraban. The Lamp of Dawn burned on the altar.', dur: 3 },
    { msg: 'It made every mind light and swift.', dur: 2.6 },
    { msg: 'Narin knelt to tend it.', dur: 2.2 },
    { act: 'orvan', msg: 'Your light ends tonight.', who: 'Orban', dur: 2.6 },
    { msg: 'Stay back!', who: 'Narin', dur: 1.8 },
    { act: 'strike', msg: '', dur: 1.2 },
    { act: 'flash', msg: 'The Lamp went dark. Narin vanished.', dur: 3.2 },
  ],
  epilogue: [
    'The Lamp burned again, lighter and swifter.',
    'Rahim carved new tablets.',
    'They are read today at Haverbex.',
  ],
  controls: [
    ['← → / A D', 'Move (hold to run)'],
    ['↑ / W', 'Jump · grab a ledge and climb'],
    ['↓ / S', 'Crouch · pick up · hang from a ledge'],
    ['Shift / Z', 'Careful step · grab a ledge'],
    ['Space / X', 'Strike · skip dialogue'],
    ['↑ / C', 'Block (in a sword fight)'],
    ['Enter / H', 'Pause · show controls'],
    ['M / V', 'Sound on/off · CRT screen on/off'],
    ['F / G', 'Fullscreen · pixel-perfect / fill'],
  ],
  ui: {
    press: 'PRESS ENTER TO BEGIN', boot: 'Press any key or click', skip: 'ENTER: skip',
    pause: 'PAUSED', paused2: 'Enter: resume  ·  R: restart chapter  ·  H: controls', help: 'CONTROLS', helpClose: 'Press any key to close',
    dead: 'Rahim has fallen...', retry: 'Press any key to restart the chapter', mute: 'Sound off', unmute: 'Sound on',
    crtOn: 'CRT effect on', crtOff: 'CRT effect off', time: 'Time', deaths: 'Falls', thanks: 'Thank you for playing',
    loading: 'Loading', next: 'Space: next', start: 'Space: start', chapter: 'CHAPTER', level: 'LEVEL',
    fsOn: 'Fullscreen', fsOff: 'Windowed', fit: 'Scale: fill window', pixel: 'Scale: pixel-perfect', boothint: 'M: sound  ·  V: CRT  ·  F: fullscreen',
    copyright: '© Haverbex  ·  Direction: 파뱀 토  ·  Pixel art: Landing Page Bot (랜딩페이지 관리봇)', rollfoot: 'Haverbex  ·  Pixel art & animation: Landing Page Bot  ·  Direction: 파뱀 토', read: 'Stand by a tablet to read it', lore: 'LORE',
  },
};
if (typeof module !== 'undefined') module.exports = STORY;
