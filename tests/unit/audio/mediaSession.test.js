/**
 * Media Session integration (AC-4.1.11) — best-effort scaffolding for
 * background playback (AC-4.1.6). Feature-detected, so this suite proves both
 * halves: a browser that has the API sees it driven correctly, and a browser
 * (or, exactly, this test environment) that lacks `navigator` entirely is
 * left alone.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setPlaying, setPaused, setStopped } from '../../../src/audio/mediaSession.js';

describe('audio/mediaSession — feature-detected, no navigator.mediaSession present (AC-4.1.11/2)', () => {
  it("AC-4.1.11/2 — A browser without `navigator.mediaSession` — including the automated test environment — is unaffected: every call is a no-op and none of them throw", () => {
    // Node's own global `navigator` — this Vitest suite's real environment —
    // has no `mediaSession` of its own, exactly the case this guards.
    expect(typeof navigator === 'undefined' || !('mediaSession' in navigator)).toBe(true);
    expect(() => setPlaying('Bossa Nova')).not.toThrow();
    expect(() => setPaused()).not.toThrow();
    expect(() => setStopped()).not.toThrow();
  });
});

describe('audio/mediaSession — a browser exposing navigator.mediaSession (AC-4.1.11/1)', () => {
  let session;

  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    session = { playbackState: 'none', metadata: null };
    // Node's own `navigator` is a getter-only global; a fake one for this
    // suite is installed the same way a browser's would be replaced for a test.
    Object.defineProperty(globalThis, 'navigator', { value: { mediaSession: session }, configurable: true });
    globalThis.MediaMetadata = function MediaMetadata(init) {
      this.title = init.title;
    };
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
    delete globalThis.MediaMetadata;
  });

  it("AC-4.1.11/1 — `playbackState` follows `'playing'`, `'paused'`, `'playing'` again and `'none'` across a start, a recoverable suspension, its resume and a stop, and `metadata` names the Pattern playing", () => {
    setPlaying('Bossa Nova');
    expect(session.playbackState).toBe('playing');
    expect(session.metadata.title).toBe('Bossa Nova');

    setPaused();
    expect(session.playbackState).toBe('paused');

    setPlaying('Bossa Nova');
    expect(session.playbackState).toBe('playing');

    setStopped();
    expect(session.playbackState).toBe('none');
  });
});
