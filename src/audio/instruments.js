/**
 * Every instrument's player behind `playMelodic`'s signature (US-2.13,
 * US-19.12), keyed by the ids in `core/voice.INSTRUMENTS`: the synth, the
 * bundled piano, and the five fetched FluidR3_GM voices. The sampled ones
 * sound through the synth while their samples are not ready (AC-2.13.4/2,
 * AC-19.7.2/1, AC-19.12.5/2).
 */
import { INSTRUMENTS, FETCHED } from '../core/voice.js';
import { createSoundfontVoice } from './soundfont.js';
import { voice as guitarVoice, playGuitar } from './guitar.js';
import * as piano from './pianoSamples.js';
import { playMelodic } from './melodic.js';
import { playDrum } from './drums.js';

/** The fetched voices by instrument id; the guitar is the one `guitar.js` has always held. */
export const fetched = Object.freeze(
  Object.fromEntries(
    INSTRUMENTS.filter((i) => i.soundfont).map((i) => [i.id, i.id === 'guitar' ? guitarVoice : createSoundfontVoice(i.soundfont, { held: Boolean(i.held) })])
  )
);

/** Each instrument as a player: `(ctx, destination, event, when) → 'sampled' | 'fallback' | undefined`. */
export const PLAYERS = Object.freeze({
  synth: playMelodic,
  // Synthesised, so always ready and never a fallback (AC-19.13.1/2).
  drums: playDrum,
  piano: (ctx, destination, event, when) => piano.playPiano(ctx, destination, event, when, playMelodic),
  ...Object.fromEntries(FETCHED.map((id) => [id, (ctx, destination, event, when) => fetched[id].play(ctx, destination, event, when, playMelodic)])),
  guitar: (ctx, destination, event, when) => playGuitar(ctx, destination, event, when, playMelodic),
});

/** Whether an instrument's samples are fetched rather than bundled or synthesised. */
export const isFetched = (id) => Object.hasOwn(fetched, id);

/** `{ status, error }` for a sampled instrument; the synth is always ready. */
export function statusOf(id, ctx) {
  if (id === 'piano') return piano.getStatus(ctx);
  if (isFetched(id)) return fetched[id].getStatus(ctx);
  return { status: 'ready', error: null };
}

/**
 * An instrument on the screen-off render's own context (AC-2.13.5,
 * AC-19.12.5/4): a player, or null while its samples are not ready on the
 * live context — the render then uses the synth.
 */
export async function prepare(id, ctx) {
  if (id === 'piano') return (await piano.prepare(ctx)) ? PLAYERS.piano : null;
  if (isFetched(id)) {
    const instrument = await fetched[id].prepare(ctx);
    return instrument ? (c, d, event, when) => fetched[id].playOn(instrument, event, when) : null;
  }
  // The drums need nothing prepared: the same synthesis on the render's context.
  if (id === 'drums') return playDrum;
  return null;
}
