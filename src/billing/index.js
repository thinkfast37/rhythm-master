/**
 * Store adapter selection. US-17.1, research.md D-010.
 *
 * Three adapters share one shape (see `web.js` for the contract):
 *
 *   native — inside the Capacitor shell, talking to StoreKit / Play Billing
 *   fake   — `?billing=fake`, scripted from `window.__rmFakeStore`, for Playwright
 *   web    — everywhere else: always entitled, no products, no paywall
 *
 * The web build never statically imports the plugin (AC-17.1.9/2): the shell is
 * detected through the `Capacitor` global its bridge injects, and `native.js` is
 * loaded only then, so the free page never even downloads it.
 */

function isNativeShell() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;
  return Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

function wantsFake() {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).get('billing') === 'fake';
}

/**
 * Synchronous: will there be a store to ask? Lets `init` cover the app before it
 * mounts, without waiting on the adapter's dynamic import.
 */
export function hasStoreSync() {
  return wantsFake() || isNativeShell();
}

/** @returns {Promise<import('./web.js').BillingAdapter>} */
export async function selectBillingAdapter() {
  if (wantsFake()) return (await import('./fake.js')).createFakeBilling();
  if (isNativeShell()) return (await import('./native.js')).createNativeBilling();
  return (await import('./web.js')).createWebBilling();
}
