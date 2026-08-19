/**
 * Entitlement — what the store build may show. AC-17.1.1.
 *
 * Constitution Principle V (4.0.0): entitlement is a pure function of the
 * store's current purchases and the clock, and of nothing else. This module
 * has no idea where the purchases came from — `src/billing/` supplies them,
 * normalised to epoch milliseconds — and it never reads a clock of its own.
 * Nothing the app has stored about itself can enter here.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The two products, with the same ids on both stores (research.md D-010). */
export const PRODUCTS = Object.freeze({
  monthly: Object.freeze({
    id: 'rm.monthly',
    kind: 'subscription',
    /** Google Play base plan id; iOS ignores it. */
    plan: 'monthly',
    /** The introductory offer: a free trial this many days long. */
    trialDays: 3,
  }),
  lifetime: Object.freeze({ id: 'rm.lifetime', kind: 'lifetime' }),
});

/**
 * @typedef {object} Purchase  A current purchase as the store reports it, normalised.
 * @property {string} productId
 * @property {number} purchasedAt        epoch ms of the ORIGINAL purchase (Apple's originalPurchaseDate)
 * @property {number|null} expiresAt     epoch ms; null for a one-time purchase
 */

/**
 * @typedef {object} Entitlement
 * @property {'none'|'trial'|'subscribed'|'lifetime'} level
 * @property {number|null} until  trial end (trial), next renewal (subscribed), else null
 */

/**
 * Derive entitlement from the store's current purchases at time `now`.
 *
 * `lifetime` beats everything (AC-17.1.1/4). A subscription counts only while its
 * expiry is ahead of `now` (/5); inside its first `trialDays` from the original
 * purchase it is the free trial (/2), afterwards a paid subscription (/3). No
 * purchase at all is `none` (/1).
 *
 * @param {Purchase[]} purchases
 * @param {number} now epoch ms
 * @returns {Entitlement}
 */
export function deriveEntitlement(purchases, now) {
  if (!Array.isArray(purchases) || !Number.isFinite(now)) {
    throw new TypeError('deriveEntitlement(purchases[], now:ms)');
  }

  if (purchases.some((p) => p.productId === PRODUCTS.lifetime.id)) {
    return { level: 'lifetime', until: null };
  }

  const active = purchases
    .filter((p) => p.productId === PRODUCTS.monthly.id)
    .filter((p) => Number.isFinite(p.expiresAt) && p.expiresAt > now)
    .sort((a, b) => b.expiresAt - a.expiresAt)[0];
  if (!active) return { level: 'none', until: null };

  const trialEndsAt = active.purchasedAt + PRODUCTS.monthly.trialDays * DAY_MS;
  if (Number.isFinite(active.purchasedAt) && now < trialEndsAt) {
    return { level: 'trial', until: Math.min(trialEndsAt, active.expiresAt) };
  }
  return { level: 'subscribed', until: active.expiresAt };
}

/** True when the app may be used at all. */
export function isEntitled(entitlement) {
  return entitlement.level !== 'none';
}
