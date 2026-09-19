/**
 * Media Session integration (AC-4.1.11). Best-effort scaffolding for
 * background playback (AC-4.1.6): setting `navigator.mediaSession`'s
 * playback state and metadata is what makes some mobile OSes more willing to
 * keep a backgrounded audio session alive, and gives the lock screen its own
 * "Now Playing" treatment while it does.
 *
 * Entirely feature-detected. A browser without `navigator.mediaSession` —
 * including jsdom and the Playwright Chromium build this app tests against
 * when the API is absent — is unaffected: every export here is a no-op in
 * that environment and none of them throw.
 */

function session() {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null;
}

/** Playback started or resumed; the lock screen names the Pattern playing. */
export function setPlaying(patternName) {
  const s = session();
  if (!s) return;
  if (patternName && typeof MediaMetadata === 'function') {
    try {
      s.metadata = new MediaMetadata({ title: patternName });
    } catch {
      // A browser exposing mediaSession but not MediaMetadata, or rejecting
      // these particular fields, is not worth failing playback over.
    }
  }
  s.playbackState = 'playing';
}

/** A recoverable device suspension paused the run (AC-4.1.5). */
export function setPaused() {
  const s = session();
  if (s) s.playbackState = 'paused';
}

/** Playback stopped — the musician's own Stop, or a suspension that could not recover. */
export function setStopped() {
  const s = session();
  if (s) s.playbackState = 'none';
}

/**
 * Wire the OS's own Now Playing controls to the app's transport (AC-4.1.13).
 *
 * The app has no pause of its own — the transport is Play and Stop — so
 * `'pause'` is mapped to Stop rather than inventing a third transport state
 * (AC-4.1.13/2). Registering is entirely optional: a browser exposing
 * `mediaSession` without `setActionHandler`, or one that rejects a particular
 * action it does not support, is left alone (AC-4.1.13/3).
 */
export function setHandlers({ onPlay, onStop }) {
  const s = session();
  if (!s || typeof s.setActionHandler !== 'function') return;
  const actions = [
    ['play', onPlay],
    ['pause', onStop],
    ['stop', onStop],
  ];
  for (const [action, handler] of actions) {
    try {
      s.setActionHandler(action, handler);
    } catch {
      // An action this browser does not know about throws on registration;
      // the ones it does know about are unaffected.
    }
  }
}
