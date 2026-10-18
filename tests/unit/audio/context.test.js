/**
 * AudioContext recovery (AC-4.1.10, FR-011).
 *
 * iPadOS Safari parks a backgrounded context in the non-standard 'interrupted'
 * state, and can leave one permanently dead — scheduling into it is silence
 * with no error. resume() must recover both, replacing a context that will not
 * come back.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resume, getContext, onSuspended, onResumed, replace, clockIsRunning, __reset } from '../../../src/audio/context.js';
import { ensureCompressor, __reset as resetNodes } from '../../../src/audio/nodes.js';

class FakeAudioContext {
  static instances = [];

  constructor() {
    this.state = 'running';
    this.resumeCalls = 0;
    this.closed = false;
    /** An iOS-style context that no resume() can bring back. */
    this.deadForever = false;
    this.destination = { name: 'destination' };
    FakeAudioContext.instances.push(this);
  }

  async resume() {
    this.resumeCalls += 1;
    if (!this.deadForever) this.state = 'running';
  }

  async close() {
    this.closed = true;
    this.state = 'closed';
  }

  addEventListener() {}

  createDynamicsCompressor() {
    const param = () => ({ value: 0 });
    return {
      owner: this,
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      connect() {},
    };
  }
}

beforeEach(() => {
  __reset();
  resetNodes();
  FakeAudioContext.instances = [];
  globalThis.AudioContext = FakeAudioContext;
});

afterEach(() => {
  delete globalThis.AudioContext;
});

describe('resume() after a device suspension', () => {
  it('AC-4.1.10/1 — The gesture-time resume recovers a context reporting `interrupted`, not only `suspended`', async () => {
    const first = getContext();
    first.state = 'interrupted';

    const recovered = await resume();

    expect(recovered).toBe(first);
    expect(first.resumeCalls).toBe(1);
    expect(first.state).toBe('running');
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('AC-4.1.10/1 — The gesture-time resume recovers a context reporting `interrupted`, not only `suspended`: plain suspended still resumes', async () => {
    const first = getContext();
    first.state = 'suspended';

    const recovered = await resume();

    expect(recovered).toBe(first);
    expect(first.state).toBe('running');
  });

  it('AC-4.1.10/2 — A context still not running after a resume attempt is replaced, and the shared audio graph is rebuilt against the replacement rather than reused', async () => {
    const first = getContext();
    const staleGraph = ensureCompressor(first);
    first.state = 'interrupted';
    first.deadForever = true;

    const recovered = await resume();

    expect(recovered).not.toBe(first);
    expect(first.closed).toBe(true);
    expect(FakeAudioContext.instances).toHaveLength(2);
    expect(getContext()).toBe(recovered);

    const rebuiltGraph = ensureCompressor(recovered);
    expect(rebuiltGraph).not.toBe(staleGraph);
    expect(rebuiltGraph.owner).toBe(recovered);
  });
});

/**
 * Backgrounding is not a suspension (AC-4.1.5, revised 2026-09-19). The
 * visibility listener used to fire the suspend signal the moment a page went
 * hidden with its context still running, which is what made a locked phone
 * pause the app itself.
 */
describe('the visibility listener after AC-4.1.5\'s revision', () => {
  let handler;

  beforeEach(() => {
    handler = null;
    globalThis.document = {
      visibilityState: 'visible',
      addEventListener(type, fn) {
        if (type === 'visibilitychange') handler = fn;
      },
    };
  });

  afterEach(() => {
    delete globalThis.document;
  });

  it('AC-4.1.5/2 — A page hidden while its context keeps running plays on — scheduling continues and the loop counter keeps climbing: going hidden fires no suspend signal', () => {
    const suspends = [];
    const resumes = [];
    onSuspended(() => suspends.push(true));
    onResumed(() => resumes.push(true));
    getContext(); // registers the listener
    expect(handler).toBeTypeOf('function');

    globalThis.document.visibilityState = 'hidden';
    handler();
    expect(suspends).toEqual([]);

    // Coming back is still worth a resume attempt: some browsers hand the
    // context back without ever firing their own statechange.
    globalThis.document.visibilityState = 'visible';
    handler();
    expect(resumes).toEqual([true]);
  });
});

/**
 * Reset audio (AC-4.1.16). A frozen context's close() need not ever settle, and
 * Safari will not start a context created after an await — so the replacement
 * is made synchronously, inside the press, and the old close() is never waited on.
 */
describe('replace() and clockIsRunning() for Reset audio', () => {
  it('AC-4.1.16/2 — Pressing it stops playback, replaces the context inside the press without waiting on the old one to close, and sounds a confirmation note on the replacement: the replacement exists synchronously even when close() never settles', () => {
    const old = getContext();
    const staleGraph = ensureCompressor(old);
    let closeCalled = false;
    old.close = () => {
      closeCalled = true;
      return new Promise(() => {});
    };

    const fresh = replace();

    expect(closeCalled).toBe(true);
    expect(fresh).not.toBe(old);
    expect(FakeAudioContext.instances).toHaveLength(2);
    expect(getContext()).toBe(fresh);
    expect(fresh.resumeCalls).toBe(1);
    expect(ensureCompressor(fresh)).not.toBe(staleGraph);
  });

  it("AC-4.1.16/3 — When the replacement's clock still is not running, a message says to quit and reopen the app, and a reset that works shows no message: the clock check", async () => {
    const frozen = getContext();
    frozen.currentTime = 5;
    expect(await clockIsRunning(frozen, 20)).toBe(false);

    const moving = getContext();
    moving.currentTime = 5;
    setTimeout(() => (moving.currentTime = 5.01), 5);
    expect(await clockIsRunning(moving, 20)).toBe(true);

    const suspended = getContext();
    suspended.state = 'suspended';
    setTimeout(() => (suspended.currentTime = 6), 5);
    expect(await clockIsRunning(suspended, 20)).toBe(false);
  });
});
