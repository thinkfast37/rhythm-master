/**
 * US-17.1 — entitlement is a pure function of the store's purchases and the clock.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { deriveEntitlement, isEntitled, PRODUCTS, DAY_MS } from '../../../src/core/entitlement.js';

const NOW = Date.UTC(2026, 7, 18, 12, 0, 0);
const monthly = (purchasedAt, expiresAt) => ({ productId: PRODUCTS.monthly.id, purchasedAt, expiresAt });
const lifetime = () => ({ productId: PRODUCTS.lifetime.id, purchasedAt: NOW - 30 * DAY_MS, expiresAt: null });

describe('core/entitlement', () => {
  it('AC-17.1.1/1 — No current purchase derives `none`', () => {
    expect(deriveEntitlement([], NOW)).toEqual({ level: 'none', until: null });
    expect(isEntitled(deriveEntitlement([], NOW))).toBe(false);
  });

  it("AC-17.1.1/2 — A current `rm.monthly` inside its free-trial period derives `trial`, with the trial's end", () => {
    const bought = NOW - 1 * DAY_MS;
    const trialEnd = bought + PRODUCTS.monthly.trialDays * DAY_MS;
    // During the trial the store's expiry IS the trial end.
    expect(deriveEntitlement([monthly(bought, trialEnd)], NOW)).toEqual({ level: 'trial', until: trialEnd });
    // A minute before the trial ends is still the trial.
    expect(deriveEntitlement([monthly(bought, trialEnd)], trialEnd - 60_000).level).toBe('trial');
  });

  it('AC-17.1.1/3 — A current `rm.monthly` past its free-trial period derives `subscribed`, with its next renewal', () => {
    const bought = NOW - 40 * DAY_MS;
    const renews = NOW + 20 * DAY_MS;
    expect(deriveEntitlement([monthly(bought, renews)], NOW)).toEqual({ level: 'subscribed', until: renews });
    // The instant the trial ends, it is a paid subscription.
    const trialEnd = bought + PRODUCTS.monthly.trialDays * DAY_MS;
    expect(deriveEntitlement([monthly(bought, renews)], trialEnd).level).toBe('subscribed');
  });

  it('AC-17.1.1/4 — A current `rm.lifetime` derives `lifetime`, whatever else is present', () => {
    expect(deriveEntitlement([lifetime()], NOW)).toEqual({ level: 'lifetime', until: null });
    // Alongside a live subscription, an expired one, or in any order.
    expect(deriveEntitlement([monthly(NOW - DAY_MS, NOW + DAY_MS), lifetime()], NOW).level).toBe('lifetime');
    expect(deriveEntitlement([lifetime(), monthly(NOW - 90 * DAY_MS, NOW - 60 * DAY_MS)], NOW).level).toBe('lifetime');
  });

  it('AC-17.1.1/5 — An `rm.monthly` whose expiry has passed derives `none`', () => {
    expect(deriveEntitlement([monthly(NOW - 90 * DAY_MS, NOW - 1)], NOW)).toEqual({ level: 'none', until: null });
    // Expiring exactly now is expired.
    expect(deriveEntitlement([monthly(NOW - 90 * DAY_MS, NOW)], NOW).level).toBe('none');
    // A one-time purchase of anything else is not a subscription.
    expect(deriveEntitlement([{ productId: 'rm.other', purchasedAt: NOW, expiresAt: null }], NOW).level).toBe('none');
  });

  it('AC-17.1.9/2 — The web build never statically imports the billing plugin', () => {
    // The web adapter and the composition root must not pull the plugin into the
    // page bundle; only `native.js` may name it, and only the shell loads that.
    for (const file of ['src/main.js', 'src/billing/index.js', 'src/billing/web.js', 'src/billing/fake.js']) {
      const source = readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/^\s*import[^;]*['"]@capgo\/native-purchases['"]/m);
      expect(source, file).not.toMatch(/^\s*import[^;]*['"]@capacitor\/core['"]/m);
    }
    const native = readFileSync(new URL('../../../src/billing/native.js', import.meta.url), 'utf8');
    expect(native).toMatch(/@capgo\/native-purchases/);
  });
});
