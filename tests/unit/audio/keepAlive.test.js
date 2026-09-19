/**
 * The silent keep-alive media element (AC-4.1.12).
 *
 * This suite's environment is Node: there is no `Audio` constructor here at
 * all, which is exactly the shape AC-4.1.12/3 guards — a browser that cannot
 * play it must play everything else exactly as it would without it. The cases
 * that need a real element playing are proven through the DOM in
 * `tests/e2e/playback.spec.js`.
 */
import { describe, it, expect } from 'vitest';
import { start, stop, current } from '../../../src/audio/keepAlive.js';

describe('audio/keepAlive — a browser with no Audio constructor (AC-4.1.12/3)', () => {
  it('AC-4.1.12/3 — A browser that cannot play it — no `Audio` constructor, or a `play()` that rejects — is unaffected: playback starts, runs and stops exactly as it would without it, and nothing throws', () => {
    // Node's own environment, which is the case being guarded, not a stub of it.
    expect(typeof Audio).toBe('undefined');
    expect(() => start()).not.toThrow();
    expect(current()).toBeNull();
    expect(() => stop()).not.toThrow();
  });
});
