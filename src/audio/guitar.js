/**
 * The guitar voice (US-19.7): the FluidR3_GM steel-string guitar
 * fret-navigator plays — one fetched voice made by `soundfont.js`, under the
 * names this module has always exported. It rings: a guitar's note is not
 * stopped by the next (AC-19.12.5/3).
 */
import { createSoundfontVoice, ATTRIBUTION, SOUNDFONT } from './soundfont.js';

export const INSTRUMENT_NAME = 'acoustic_guitar_steel';
export { ATTRIBUTION, SOUNDFONT };

/** The voice itself, for the instrument table (`instruments.js`). */
export const voice = createSoundfontVoice(INSTRUMENT_NAME);

export const { getStatus, onStatus, load, retry, prepare, playOn } = voice;

/** Test seams. */
export const __setLoader = voice.seams.setLoader;
export const __sampledPlays = voice.seams.sampledPlays;
export const __reset = voice.seams.reset;

/** Sound one guitar note; see `soundfont.js` `play`. */
export const playGuitar = voice.play;
