/**
 * The real store, inside the Capacitor shell: StoreKit 2 on iOS, Google Play
 * Billing on Android, through `@capgo/native-purchases`. US-17.1, D-010.
 *
 * Loaded ONLY by `index.js` when the `Capacitor` bridge says this is a native
 * platform — the web bundle never imports it (AC-17.1.9/2). Everything the store
 * says is normalised here to the shape `core/entitlement.js` reads, so the pure
 * layer never sees a Transaction.
 */
import { NativePurchases, PURCHASE_TYPE } from '@capgo/native-purchases';
import { PRODUCTS } from '../core/entitlement.js';

const UNIT_DAYS = { day: 1, week: 7, month: 30, year: 365 };

/** Days in a free-trial introductory offer, or undefined when the store shows none. */
function trialDaysOf(product) {
  const intro = product?.introductoryPrice;
  if (!intro) return undefined;
  const isFree = intro.price === 0 || intro.paymentMode === 0 || /free/i.test(String(intro.paymentMode));
  if (!isFree) return undefined;
  const unit = String(intro.subscriptionPeriod?.unit ?? '').toLowerCase();
  const n = Number(intro.subscriptionPeriod?.numberOfUnits) || 1;
  const perUnit = UNIT_DAYS[unit];
  return perUnit ? n * perUnit * (Number(intro.numberOfPeriods) || 1) : PRODUCTS.monthly.trialDays;
}

function toStoreProduct(product, extra = {}) {
  if (!product) return null;
  return { id: product.identifier, title: product.title, priceString: product.priceString, ...extra };
}

/** Transaction → Purchase. Revoked purchases are not current. */
function toPurchase(t) {
  if (!t || t.revocationDate) return null;
  const purchasedAt = Date.parse(t.originalPurchaseDate ?? t.purchaseDate);
  const expiresAt = t.expirationDate ? Date.parse(t.expirationDate) : null;
  return { productId: t.productIdentifier, purchasedAt, expiresAt };
}

function isCancellation(error) {
  return /cancel/i.test(String(error?.message ?? error));
}

/** @returns {import('./web.js').BillingAdapter} */
export function createNativeBilling() {
  async function currentPurchases() {
    const { purchases } = await NativePurchases.getPurchases({ onlyCurrentEntitlements: true });
    return (purchases ?? []).map(toPurchase).filter(Boolean);
  }

  return {
    name: 'native',
    hasStore: true,

    async getProducts() {
      const [subs, inapp] = await Promise.all([
        NativePurchases.getProducts({ productIdentifiers: [PRODUCTS.monthly.id], productType: PURCHASE_TYPE.SUBS }),
        NativePurchases.getProducts({ productIdentifiers: [PRODUCTS.lifetime.id], productType: PURCHASE_TYPE.INAPP }),
      ]);
      const monthly = subs.products?.find((p) => p.identifier === PRODUCTS.monthly.id) ?? null;
      const lifetime = inapp.products?.find((p) => p.identifier === PRODUCTS.lifetime.id) ?? null;
      return {
        monthly: toStoreProduct(monthly, { trialDays: trialDaysOf(monthly) }),
        lifetime: toStoreProduct(lifetime),
      };
    },

    currentPurchases,

    async purchase(productKey) {
      const product = PRODUCTS[productKey];
      const isSub = product.kind === 'subscription';
      try {
        await NativePurchases.purchaseProduct({
          productIdentifier: product.id,
          productType: isSub ? PURCHASE_TYPE.SUBS : PURCHASE_TYPE.INAPP,
          ...(isSub ? { planIdentifier: product.plan } : {}),
        });
        return { status: 'ok' };
      } catch (error) {
        if (isCancellation(error)) return { status: 'cancelled', message: 'Purchase cancelled.' };
        return { status: 'failed', message: String(error?.message ?? 'The store could not complete the purchase.') };
      }
    },

    async restore() {
      await NativePurchases.restorePurchases();
      return currentPurchases();
    },

    async manageSubscriptions() {
      await NativePurchases.manageSubscriptions();
    },
  };
}
