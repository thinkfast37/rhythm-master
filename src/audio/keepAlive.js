/**
 * The silent keep-alive media element (AC-4.1.12).
 *
 * iOS Safari takes a page's audio away within seconds of the screen locking.
 * AC-4.1.5/AC-4.1.6 make the return graceful — the run pauses where it was and
 * picks itself back up on unlock — but a Pattern that goes silent the moment
 * the screen sleeps cannot be practised hands-free, which is the case this
 * module exists for.
 *
 * The one lever a web page has over that decision is to be *playing media*: an
 * OS that would suspend an idle page is markedly more willing to leave a page
 * with an active media element alone. So a looping, silent `<audio>` element
 * runs for exactly as long as a transport run lasts.
 *
 * Three things this is not:
 *
 * - **Not an audio asset.** The silence is a WAV generated here at runtime,
 *   the same standing as the reverb impulse (Constitution 6). Nothing is
 *   fetched and nothing is shipped.
 * - **Not a guarantee.** Apple specifies none of this and may change it
 *   whenever it likes, which is why AC-4.1.5/AC-4.1.6's pause-and-resume is
 *   kept underneath rather than retired.
 * - **Not required.** Every path is feature-detected and every failure is
 *   swallowed (AC-4.1.12/3): a browser with no `Audio` constructor, or one
 *   whose `play()` rejects, plays exactly as it would without this module.
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

let element = null;

function ensure() {
  if (element) return element;
  if (typeof Audio !== 'function' || typeof btoa !== 'function') return null;
  try {
    element = new Audio(silentWavUri());
    element.loop = true;
    element.preload = 'auto';
    // iOS refuses to play an element it thinks wants the full-screen player.
    element.playsInline = true;
    element.setAttribute('playsinline', '');
  } catch {
    // A browser that cannot construct it simply does without (AC-4.1.12/3).
    element = null;
  }
  return element;
}

/**
 * Start the keep-alive (AC-4.1.12/1).
 *
 * MUST be called from within the same user-gesture handler that starts the
 * transport: `play()` on a fresh element is gesture-gated exactly as the
 * AudioContext is. A rejected promise is swallowed — the run carries on
 * without the keep-alive rather than failing over it.
 */
export function start() {
  const el = ensure();
  if (!el) return;
  try {
    const played = el.play();
    if (played && typeof played.catch === 'function') {
      played.catch(() => {
        // Autoplay policy, a codec refusal, anything: best-effort throughout.
      });
    }
  } catch {
    // A synchronous throw from play() is the same non-event as a rejection.
  }
}

/**
 * Stop the keep-alive (AC-4.1.12/1).
 *
 * Called only on an actual stop — never on a suspension, since holding the
 * session open through one is the entire point (AC-4.1.12/2).
 */
export function stop() {
  if (!element) return;
  try {
    element.pause();
    element.currentTime = 0;
  } catch {
    // Nothing downstream of a stop depends on this succeeding.
  }
}

/** Test seam: the element, once one exists, or null. */
export function current() {
  return element;
}
