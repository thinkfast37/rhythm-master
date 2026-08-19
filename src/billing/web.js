/**
 * The web build's store: there is none, and the app is free. AC-17.1.9.
 *
 * This file is also the adapter contract every other adapter follows.
 *
 * @typedef {object} StoreProduct
 * @property {string} id            store product id (core/entitlement PRODUCTS)
 * @property {string} title         the store's own title — never hard-coded (AC-17.1.2/2)
 * @property {string} priceString   the store's own localised price
 * @property {number} [trialDays]   free-trial length of the introductory offer, if any
 *
 * @typedef {object} PurchaseResult
 * @property {'ok'|'cancelled'|'failed'} status
 * @property {string} [message]
 *
 * @typedef {object} BillingAdapter
 * @property {string} name
 * @property {boolean} hasStore                    false → no gating, no Purchases control
 * @property {() => Promise<{monthly: StoreProduct|null, lifetime: StoreProduct|null}>} getProducts
 * @property {() => Promise<import('../core/entitlement.js').Purchase[]>} currentPurchases
 * @property {(productKey: 'monthly'|'lifetime') => Promise<PurchaseResult>} purchase
 * @property {() => Promise<import('../core/entitlement.js').Purchase[]>} restore
 * @property {() => Promise<void>} manageSubscriptions
 */

/** @returns {BillingAdapter} */
export function createWebBilling() {
  return {
    name: 'web',
    hasStore: false,
    async getProducts() {
      return { monthly: null, lifetime: null };
    },
    async currentPurchases() {
      return [];
    },
    async purchase() {
      return { status: 'failed', message: 'There is nothing to buy on the web version.' };
    },
    async restore() {
      return [];
    },
    async manageSubscriptions() {},
  };
}
