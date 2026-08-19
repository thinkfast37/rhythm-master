/**
 * A scripted store for Playwright. Selected by `?billing=fake`. US-17.1.
 *
 * Driven from `window.__rmFakeStore`, which a test sets in `addInitScript`:
 *
 *   {
 *     products:  { monthly: StoreProduct|null, lifetime: StoreProduct|null },
 *     purchases: Purchase[],              // what the store currently reports
 *     account:   Purchase[],              // what Restore finds on the account
 *     nextPurchase: 'ok'|'cancelled'|'failed',
 *     now: epoch ms (optional; defaults to the real clock for purchase dates)
 *   }
 *
 * A successful purchase is appended to `purchases`, exactly as the real store
 * would then report it, so the app's re-query after buying sees it. Every call
 * is logged to `window.__rmFakeStore.calls` so a test can assert what was asked.
 */
import { PRODUCTS, DAY_MS } from '../core/entitlement.js';

const DEFAULT_PRODUCTS = {
  monthly: { id: PRODUCTS.monthly.id, title: 'Rhythm Master Monthly', priceString: '$2.99', trialDays: 3 },
  lifetime: { id: PRODUCTS.lifetime.id, title: 'Rhythm Master Forever', priceString: '$29.99' },
};

function store() {
  const w = window;
  w.__rmFakeStore ??= {};
  const s = w.__rmFakeStore;
  s.products ??= DEFAULT_PRODUCTS;
  s.purchases ??= [];
  s.account ??= [];
  s.nextPurchase ??= 'ok';
  s.calls ??= [];
  return s;
}

/** @returns {import('./web.js').BillingAdapter} */
export function createFakeBilling() {
  return {
    name: 'fake',
    hasStore: true,
    async getProducts() {
      store().calls.push('getProducts');
      return { monthly: store().products.monthly ?? null, lifetime: store().products.lifetime ?? null };
    },
    async currentPurchases() {
      store().calls.push('currentPurchases');
      return [...store().purchases];
    },
    async purchase(productKey) {
      const s = store();
      s.calls.push(`purchase:${productKey}`);
      if (s.nextPurchase === 'cancelled') return { status: 'cancelled', message: 'Purchase cancelled.' };
      if (s.nextPurchase === 'failed') return { status: 'failed', message: 'The store could not complete the purchase.' };
      const now = Number.isFinite(s.now) ? s.now : Date.now();
      const product = PRODUCTS[productKey];
      s.purchases.push({
        productId: product.id,
        purchasedAt: now,
        expiresAt: product.kind === 'subscription' ? now + product.trialDays * DAY_MS : null,
      });
      return { status: 'ok' };
    },
    async restore() {
      const s = store();
      s.calls.push('restore');
      s.purchases = [...s.account];
      return [...s.purchases];
    },
    async manageSubscriptions() {
      const s = store();
      s.calls.push('manageSubscriptions');
      s.managed = true;
    },
  };
}
