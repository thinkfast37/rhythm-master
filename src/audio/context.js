/**
 * AudioContext lifecycle. FR-010, FR-011, Constitution Principle III.
 *
 * The context is created lazily INSIDE a user-gesture handler, never at module
 * load, so nothing can autoplay and browser autoplay policy is satisfied by
 * construction rather than by hoping.
 *
 * When the device suspends audio — phone locks, a call arrives, the tab is
 * backgrounded — the transport stops and resets rather than silently continuing
 * or auto-resuming on return (AC-4.1.5, AC-4.1.6).
 */

let ctx = null;
const suspendListeners = new Set();

/**
 * Get the AudioContext, creating it if needed.
 *
 * MUST be called from within a user-gesture handler the first time. Calling it
 * anywhere else is the autoplay bug this design exists to prevent.
 */
export function getContext() {
  if (!ctx) {
    const Ctor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio is not available in this browser');
    ctx = new Ctor();
    watchForSuspension();
  }
  return ctx;
}

export function isReady() {
  return Boolean(ctx) && ctx.state === 'running';
}

/*
 * iPadOS Safari parks a backgrounded context in the non-standard 'interrupted'
 * state rather than 'suspended' — the watcher below has always treated the two
 * alike on the way down, and recovery must do the same on the way back up
 * (AC-4.1.10/1).
 */
const STUCK_STATES = ['suspended', 'interrupted'];

/**
 * Resume a context the OS or browser suspended. Also gesture-only.
 *
 * A context can refuse to come back — iOS sometimes leaves one permanently
 * interrupted after the app was backgrounded — and scheduling into a dead
 * context is silence with no error. So a context still not running after the
 * resume attempt is closed and replaced (AC-4.1.10/2); callers take the
 * returned context rather than assuming the one they held is still the one.
 */
export async function resume() {
  let context = getContext();
  if (STUCK_STATES.includes(context.state)) {
    try {
      await context.resume();
    } catch {
      // Replaced below: a context whose resume() rejects is as dead as one
      // that resolves without leaving the stuck state.
    }
  }
  if (STUCK_STATES.includes(context.state)) {
    try {
      await context.close?.();
    } catch {
      // A dead context may refuse even close(); replacement proceeds anyway.
    }
    ctx = null;
    context = getContext();
    if (context.state === 'suspended') {
      try {
        await context.resume();
      } catch {
        // The caller's gesture has done all it can.
      }
    }
  }
  return context;
}

/** Notified when the device takes audio away. */
export function onSuspended(fn) {
  suspendListeners.add(fn);
  return () => suspendListeners.delete(fn);
}

function fireSuspended() {
  for (const fn of suspendListeners) fn();
}

let watchingVisibility = false;

function watchForSuspension() {
  const watched = ctx;
  ctx.addEventListener?.('statechange', () => {
    // Only the current context speaks for the transport — a replaced one's
    // dying statechange must not stop a run on its successor (AC-4.1.10/2).
    if (watched !== ctx) return;
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') fireSuspended();
  });

  // A backgrounded tab suspends audio on mobile without always firing
  // statechange, so visibility is watched too. Once: the context can be
  // replaced (AC-4.1.10/2), and the document must not collect a listener per
  // replacement.
  if (!watchingVisibility && typeof document !== 'undefined') {
    watchingVisibility = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && ctx?.state === 'running') fireSuspended();
    });
  }
}

/** Test seam. */
export function __reset() {
  ctx = null;
  suspendListeners.clear();
  watchingVisibility = false;
}
