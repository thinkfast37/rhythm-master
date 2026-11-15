/**
 * The drum kit (US-19.13, research.md D-029): which drum each MIDI note is,
 * what its key is labelled, and the recipe the synthesiser builds it from.
 *
 * The map is General MIDI's percussion key map, MIDI 35 to 81 — what Logic's Drum
 * Kit Designer plays: Kick on 36 (the key Logic names C1), Snare on 38, Closed
 * hat on 42. This table is the one place a name or a sound is decided; the
 * keyboard's labels, the synthesiser and the tests all read it. Pure.
 *
 * `kind` picks the recipe `audio/drums.js` builds, and the numbers beside it
 * are that recipe's own: `hz` a pitch, `to` where a swept pitch lands, `decay`
 * seconds to silence, `tone` a filter's corner or centre in Hz.
 */

/** The open hi-hat, and the two that close it (AC-19.13.1/4). */
export const OPEN_HAT = 46;
const HAT_CLOSERS = Object.freeze([42, 44]);

const drum = (name, kind, recipe) => Object.freeze({ name, kind, ...recipe });

export const DRUMS = Object.freeze({
  35: drum('Kick 2', 'kick', { hz: 120, to: 38, decay: 0.42 }),
  36: drum('Kick', 'kick', { hz: 150, to: 45, decay: 0.34 }),
  37: drum('Rim', 'click', { hz: 1750, decay: 0.035 }),
  38: drum('Snare', 'snare', { hz: 190, tone: 1800, decay: 0.19 }),
  39: drum('Clap', 'clap', { tone: 1200, decay: 0.2 }),
  40: drum('Snare 2', 'snare', { hz: 230, tone: 2600, decay: 0.15 }),
  41: drum('Floor tom 2', 'tom', { hz: 82, decay: 0.4 }),
  42: drum('Closed hat', 'hat', { tone: 7500, decay: 0.05 }),
  43: drum('Floor tom', 'tom', { hz: 98, decay: 0.38 }),
  44: drum('Pedal hat', 'hat', { tone: 6000, decay: 0.08 }),
  45: drum('Low tom', 'tom', { hz: 123, decay: 0.34 }),
  46: drum('Open hat', 'hat', { tone: 7000, decay: 0.42 }),
  47: drum('Mid tom 2', 'tom', { hz: 147, decay: 0.3 }),
  48: drum('Mid tom', 'tom', { hz: 175, decay: 0.28 }),
  49: drum('Crash', 'cymbal', { tone: 5200, decay: 1.3 }),
  50: drum('High tom', 'tom', { hz: 220, decay: 0.24 }),
  51: drum('Ride', 'cymbal', { tone: 7800, decay: 0.75, ping: 5300 }),
  52: drum('China', 'cymbal', { tone: 3800, decay: 0.9 }),
  53: drum('Ride bell', 'bell', { hz: 5300, decay: 0.55 }),
  54: drum('Tambourine', 'shaker', { tone: 8500, decay: 0.16 }),
  55: drum('Splash', 'cymbal', { tone: 6800, decay: 0.5 }),
  56: drum('Cowbell', 'bell', { hz: 560, decay: 0.3 }),
  57: drum('Crash 2', 'cymbal', { tone: 4400, decay: 1.5 }),
  58: drum('Vibraslap', 'rattle', { tone: 3200, decay: 0.7 }),
  59: drum('Ride 2', 'cymbal', { tone: 6600, decay: 0.85, ping: 4400 }),
  60: drum('High bongo', 'skin', { hz: 400, decay: 0.14 }),
  61: drum('Low bongo', 'skin', { hz: 300, decay: 0.17 }),
  62: drum('Conga mute', 'skin', { hz: 260, decay: 0.07 }),
  63: drum('High conga', 'skin', { hz: 240, decay: 0.22 }),
  64: drum('Low conga', 'skin', { hz: 180, decay: 0.26 }),
  65: drum('High timbale', 'skin', { hz: 520, decay: 0.2 }),
  66: drum('Low timbale', 'skin', { hz: 370, decay: 0.24 }),
  67: drum('High agogo', 'bell', { hz: 930, decay: 0.25 }),
  68: drum('Low agogo', 'bell', { hz: 660, decay: 0.28 }),
  69: drum('Cabasa', 'shaker', { tone: 9000, decay: 0.09 }),
  70: drum('Maracas', 'shaker', { tone: 10000, decay: 0.06 }),
  71: drum('Whistle', 'whistle', { hz: 2300, decay: 0.12 }),
  72: drum('Long whistle', 'whistle', { hz: 2100, decay: 0.45 }),
  73: drum('Guiro', 'rattle', { tone: 5200, decay: 0.12 }),
  74: drum('Long guiro', 'rattle', { tone: 4600, decay: 0.4 }),
  75: drum('Claves', 'click', { hz: 2500, decay: 0.06 }),
  76: drum('High block', 'click', { hz: 1250, decay: 0.07 }),
  77: drum('Low block', 'click', { hz: 850, decay: 0.09 }),
  78: drum('Cuica mute', 'skin', { hz: 620, decay: 0.1 }),
  79: drum('Cuica', 'skin', { hz: 480, decay: 0.3 }),
  80: drum('Triangle mute', 'bell', { hz: 4200, decay: 0.07 }),
  81: drum('Triangle', 'bell', { hz: 4200, decay: 0.9 }),
});

/** The drum a MIDI note is, or null where the kit has none (AC-19.13.1/3). */
export function drumFor(midi) {
  return DRUMS[midi] ?? null;
}

/** A drum's name, as its key is labelled, or '' for a key with no drum (AC-19.13.2/1). */
export function drumName(midi) {
  return DRUMS[midi]?.name ?? '';
}

/** Whether `midi` cuts off an open hi-hat still ringing in its part (AC-19.13.1/4). */
export function closesHat(midi) {
  return HAT_CLOSERS.includes(midi);
}

/* --- a Percussive Pattern on the kit (US-2.18) ------------------------------- */

/** How a Percussive Pattern sounds in Practice: its accent tones, or the kit (AC-2.18.1/1). */
export const PERCUSSION_MODES = Object.freeze([
  Object.freeze({ id: 'accents', label: 'Accents' }),
  Object.freeze({ id: 'drums', label: 'Drum kit' }),
]);
export const DEFAULT_PERCUSSION = 'accents';

/** A stored choice as one of the two, Accents for anything else. */
export function normalisePercussion(mode) {
  return mode === 'drums' ? 'drums' : DEFAULT_PERCUSSION;
}

/** The drum each Accent Level plays: Strong the Kick, Medium the Snare, Weak the Floor tom (AC-2.18.2/1). */
const AUTO_DRUMS = Object.freeze({ 3: 36, 2: 38, 1: 43 });

/** The MIDI note of the drum an Accent Level plays on Drum kit, or null for a Slot that is off. */
export function autoDrumNote(accent) {
  return AUTO_DRUMS[accent] ?? null;
}
