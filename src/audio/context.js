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

/** Resume a context the OS or browser suspended. Also gesture-only. */
export async function resume() {
  const context = getContext();
  if (context.state === 'suspended') await context.resume();
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

function watchForSuspension() {
  ctx.addEventListener?.('statechange', () => {
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') fireSuspended();
  });

  // A backgrounded tab suspends audio on mobile without always firing
  // statechange, so visibility is watched too.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && ctx?.state === 'running') fireSuspended();
    });
  }
}

/** Test seam. */
export function __reset() {
  ctx = null;
  suspendListeners.clear();
}
