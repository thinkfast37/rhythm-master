/**
 * The keep-alive and carrier media elements (AC-4.1.12, AC-4.1.15).
 *
 * Two elements, because they do two different jobs and one element cannot do
 * both on iOS:
 *
 * - **The keep-alive** loops generated silence for as long as a run lasts. An
 *   OS that would suspend an idle page is markedly more willing to leave a page
 *   with an active media element alone, and this is the app's claim to that
 *   (AC-4.1.12). It is audible silence — not a muted element — because a muted
 *   element is not reliably treated as playing audio at all, and being treated
 *   as playing audio is its entire job.
 * - **The carrier** holds AC-4.1.15's rendered run. It plays from the moment
 *   the render lands, **muted**, and is unmuted when the screen goes off.
 *
 * `muted`, and never `volume`: **iOS Safari ignores `volume` on a media
 * element** — it is read-only there, so `volume = 0` silences the carrier on
 * every desktop browser and on no iPhone. That is exactly what shipped in
 * T338: the maintainer heard the live transport and the carrier at once,
 * slightly out of phase, whenever the screen was on. Both are set here, since
 * `volume` is honoured where it works and harmless where it does not, but
 * `muted` is the one that has to be right.
 *
 * Splitting the two also removes the risk that fix would otherwise carry: if
 * muting the carrier does drop its media session, the keep-alive's own is
 * untouched, so the page's claim to being alive never depended on it.
 *
 * Every path is feature-detected and every failure swallowed (AC-4.1.12/3,
 * AC-4.1.15/6): a browser with no `Audio` constructor, or one whose `play()`
 * rejects, plays exactly as it would without this module.
 */

/** 8-bit PCM silence is a run of 128s, not of zeroes. */
const SILENCE_BYTE = 128;
const SAMPLE_RATE = 8000;
const SECONDS = 1;

function ascii(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/**
 * A one-second mono 8-bit WAV of pure silence, as a data URI.
 *
 * Built rather than fetched, and small enough (about 8 KB before base64) that
 * inlining it costs nothing measurable.
 */
function silentWavUri() {
  const samples = SAMPLE_RATE * SECONDS;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  ascii(view, 0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  ascii(view, 8, 'WAVE');
  ascii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk length
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE, true); // byte rate: mono, one byte per sample
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(view, 36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(SILENCE_BYTE, 44);

  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

let silence = null;
let carrier = null;
let silentUri = null;

function build(src) {
  if (typeof Audio !== 'function') return null;
  try {
    const el = new Audio(src);
    el.loop = true;
    el.preload = 'auto';
    // iOS refuses to play an element it thinks wants the full-screen player.
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    return el;
  } catch {
    // A browser that cannot construct one simply does without (AC-4.1.12/3).
    return null;
  }
}

/** Play an element, swallowing both the throw and the rejection. */
function play(el) {
  try {
    el.play()?.catch?.(() => {});
  } catch {
    // Autoplay policy, a codec refusal, anything: best-effort throughout.
  }
}

/**
 * Silence an element the way iOS actually honours.
 *
 * `muted` is the one that counts; `volume` is set alongside it for browsers
 * that report it back and for anything reading the element's state.
 */
function setAudible(el, audible) {
  try {
    el.muted = !audible;
    el.volume = audible ? 1 : 0;
  } catch {
    // An element that refuses either is left as it is.
  }
}

function ensureSilence() {
  if (silence) return silence;
  if (typeof btoa !== 'function') return null;
  silentUri ??= silentWavUri();
  silence = build(silentUri);
  return silence;
}

/**
 * Start the keep-alive (AC-4.1.12/1).
 *
 * MUST be called from within the same user-gesture handler that starts the
 * transport: `play()` on a fresh element is gesture-gated exactly as the
 * AudioContext is.
 */
export function start() {
  const el = ensureSilence();
  if (!el) return;
  // Audible silence: a muted element is not reliably counted as playing audio,
  // and being counted as playing audio is the whole of this element's job.
  setAudible(el, true);
  play(el);
}

/**
 * Give the carrier the rendered run to hold (AC-4.1.15/1).
 *
 * It plays from here on, muted, so that the handover at the moment of locking
 * is a single property change on an element already rolling.
 */
export function setRendered(url) {
  if (typeof Audio !== 'function') return;
  carrier ??= build(url);
  if (!carrier) return;
  try {
    if (carrier.src !== url) carrier.src = url;
    carrier.loop = true;
  } catch {
    carrier = null;
    return;
  }
  setAudible(carrier, false);
  play(carrier);
}

/**
 * The screen went off: the carrier takes the sound over from the live
 * transport, from `phaseSeconds` into the rendered cycle (AC-4.1.15/2).
 *
 * A seek and an unmute, nothing more — both instant on an in-memory source,
 * which is what makes this safe to do at the moment of locking.
 */
export function takeOver(phaseSeconds) {
  // Nothing rendered is nothing to hand over to: the keep-alive goes on
  // holding the session and the run pauses as it always did (AC-4.1.15/6).
  if (!carrier) return;
  try {
    if (Number.isFinite(phaseSeconds)) carrier.currentTime = phaseSeconds;
  } catch {
    // A seek that fails leaves the carrier where it is, which still sounds.
  }
  setAudible(carrier, true);
  play(carrier);
}

/** The screen came back: the live transport has the sound again (AC-4.1.15/3). */
export function standDown() {
  if (!carrier) return;
  setAudible(carrier, false);
}

/** Test seam: whether the carrier is currently sounding the run. */
export function isCarrying() {
  return Boolean(carrier && !carrier.muted && !carrier.paused);
}

/**
 * Stop both elements (AC-4.1.12/1).
 *
 * Called only on an actual stop — never on a suspension, since holding the
 * session open through one is the entire point (AC-4.1.12/2).
 */
export function stop() {
  for (const el of [silence, carrier]) {
    if (!el) continue;
    setAudible(el, false);
    try {
      el.pause();
      el.currentTime = 0;
    } catch {
      // Nothing downstream of a stop depends on this succeeding.
    }
  }
  carrier = null;
}

/** Test seam: the keep-alive element, once one exists, or null. */
export function current() {
  return silence;
}

/** Test seam: the carrier element, once a render has landed, or null. */
export function currentCarrier() {
  return carrier;
}
