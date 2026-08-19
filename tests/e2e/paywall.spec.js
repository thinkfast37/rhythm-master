/**
 * US-17.1 — the store build's paywall and Purchases dialog, driven against the
 * scripted fake store (`?billing=fake`, `src/billing/fake.js`).
 *
 * The real store cannot be reached from a browser, and a test that depended on
 * Apple's or Google's sandbox would fail for reasons of its own. What can be
 * proved here is everything the app does with the store's answers: what it
 * shows, what it asks the store for, and what it does with the reply.
 */
import { test, expect } from '@playwright/test';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const PRODUCTS = {
  monthly: { id: 'rm.monthly', title: 'Rhythm Master Monthly', priceString: '£2.49', trialDays: 3 },
  lifetime: { id: 'rm.lifetime', title: 'Rhythm Master Forever', priceString: '£24.99' },
};
const trialSub = () => ({ productId: 'rm.monthly', purchasedAt: NOW - DAY, expiresAt: NOW + 2 * DAY });
const paidSub = () => ({ productId: 'rm.monthly', purchasedAt: NOW - 40 * DAY, expiresAt: NOW + 20 * DAY });
const lifetime = () => ({ productId: 'rm.lifetime', purchasedAt: NOW - 10 * DAY, expiresAt: null });

/** Script the store before the page loads, then open the store build. */
async function openStoreBuild(page, script = {}) {
  await page.addInitScript((s) => {
    window.__rmFakeStore = s;
  }, { products: PRODUCTS, purchases: [], account: [], nextPurchase: 'ok', ...script });
  await page.goto('/?billing=fake');
}

const paywall = (page) => page.getByTestId('paywall');
const notice = (page) => page.getByTestId('paywall-notice');
const app = (page) => page.locator('#app');
const calls = (page) => page.evaluate(() => window.__rmFakeStore.calls);
const entitlement = (page) => page.evaluate(() => window.__rm.getState().store.entitlement);

async function openPurchases(page) {
  await page.locator('[data-action="purchases"]').click();
  return page.getByTestId('purchases');
}

// --- AC-17.1.2 — the paywall ---------------------------------------------------

test('AC-17.1.2/1 — The paywall covers the app and nothing behind it is reachable', async ({ page }) => {
  await openStoreBuild(page);
  await expect(paywall(page)).toBeVisible();
  // Nothing behind it is reachable: the root is inert, and the cover fills the viewport.
  await expect(app(page)).toHaveAttribute('inert', '');
  const box = await paywall(page).boundingBox();
  const viewport = page.viewportSize();
  expect(box.width).toBeGreaterThanOrEqual(viewport.width);
  expect(box.height).toBeGreaterThanOrEqual(viewport.height);
  // A Slot is on the page but cannot be clicked through the paywall.
  await expect(page.locator('.slot').first()).toBeAttached();
  await expect(page.locator('.slot').first().click({ timeout: 800, trial: true })).rejects.toThrow();
});

test("AC-17.1.2/2 — Both products appear with the store's own title and price string", async ({ page }) => {
  await openStoreBuild(page);
  const trial = paywall(page).locator('[data-action="start-trial"]');
  const buy = paywall(page).locator('[data-action="buy-lifetime"]');
  await expect(trial).toContainText('Rhythm Master Monthly');
  await expect(trial).toContainText('£2.49');
  await expect(buy).toContainText('Rhythm Master Forever');
  await expect(buy).toContainText('£24.99');
  // Exactly two products, nothing invented by the app.
  await expect(paywall(page).locator('.paywall-product')).toHaveCount(2);
});

test("AC-17.1.2/3 — The subscription is offered as a 3-day free trial that continues at the store's monthly price", async ({ page }) => {
  await openStoreBuild(page);
  const trial = paywall(page).locator('[data-action="start-trial"]');
  await expect(trial).toContainText('Start your free 3-day trial');
  await expect(trial).toContainText('then £2.49 a month');
  await expect(paywall(page)).toContainText('Cancel any time during the trial and you pay nothing');
});

// --- AC-17.1.3 — starting the trial ---------------------------------------------

test('AC-17.1.3/1 — A completed `rm.monthly` purchase closes the paywall and opens the app', async ({ page }) => {
  await openStoreBuild(page);
  await paywall(page).locator('[data-action="start-trial"]').click();
  await expect(paywall(page)).toHaveCount(0);
  await expect(app(page)).not.toHaveAttribute('inert', '');
  await page.locator('.slot').first().click({ trial: true });
  expect(await calls(page)).toContain('purchase:monthly');
});

test('AC-17.1.3/2 — After the trial purchase the entitlement is `trial`', async ({ page }) => {
  await openStoreBuild(page);
  await paywall(page).locator('[data-action="start-trial"]').click();
  await expect(paywall(page)).toHaveCount(0);
  const e = await entitlement(page);
  expect(e.level).toBe('trial');
  expect(e.until).toBeGreaterThan(NOW);
  await expect(page.locator('[data-action="purchases"]')).toHaveAttribute('data-entitlement', 'trial');
});

test('AC-17.1.3/3 — A cancelled or failed purchase leaves the paywall up, with a one-line notice', async ({ page }) => {
  await openStoreBuild(page, { nextPurchase: 'cancelled' });
  await paywall(page).locator('[data-action="start-trial"]').click();
  await expect(paywall(page)).toBeVisible();
  await expect(notice(page)).toBeVisible();
  await expect(notice(page)).toHaveText('Purchase cancelled.');
  await expect(app(page)).toHaveAttribute('inert', '');
  expect((await entitlement(page)).level).toBe('none');

  await page.evaluate(() => {
    window.__rmFakeStore.nextPurchase = 'failed';
  });
  await paywall(page).locator('[data-action="buy-lifetime"]').click();
  await expect(notice(page)).toContainText('could not complete');
  await expect(paywall(page)).toBeVisible();
});

// --- AC-17.1.4 — buying outright ------------------------------------------------

test('AC-17.1.4/1 — A completed `rm.lifetime` purchase from the paywall opens the app as `lifetime`', async ({ page }) => {
  await openStoreBuild(page);
  await paywall(page).locator('[data-action="buy-lifetime"]').click();
  await expect(paywall(page)).toHaveCount(0);
  expect((await entitlement(page)).level).toBe('lifetime');
  expect(await calls(page)).toContain('purchase:lifetime');
});

test('AC-17.1.4/2 — On a later launch with only `rm.lifetime` current, the app opens without a paywall', async ({ page }) => {
  await openStoreBuild(page, { purchases: [lifetime()] });
  await expect(page.locator('[data-action="purchases"]')).toHaveAttribute('data-entitlement', 'lifetime');
  await expect(paywall(page)).toHaveCount(0);
  await expect(app(page)).not.toHaveAttribute('inert', '');
});

// --- AC-17.1.5 — restore --------------------------------------------------------

test('AC-17.1.5/1 — Restoring with a purchase on the account closes the paywall and opens the app', async ({ page }) => {
  await openStoreBuild(page, { account: [lifetime()] });
  await expect(paywall(page)).toBeVisible();
  await paywall(page).locator('[data-action="restore-purchases"]').click();
  await expect(paywall(page)).toHaveCount(0);
  await expect(app(page)).not.toHaveAttribute('inert', '');
  expect(await calls(page)).toContain('restore');
});

test('AC-17.1.5/2 — After restoring `rm.lifetime` the entitlement is `lifetime`', async ({ page }) => {
  await openStoreBuild(page, { account: [lifetime()] });
  await paywall(page).locator('[data-action="restore-purchases"]').click();
  await expect(paywall(page)).toHaveCount(0);
  expect((await entitlement(page)).level).toBe('lifetime');
});

test('AC-17.1.5/3 — Restoring with nothing on the account leaves the paywall up, and says so', async ({ page }) => {
  await openStoreBuild(page, { account: [] });
  await paywall(page).locator('[data-action="restore-purchases"]').click();
  await expect(notice(page)).toContainText('Nothing to restore');
  await expect(paywall(page)).toBeVisible();
  await expect(app(page)).toHaveAttribute('inert', '');
});

// --- AC-17.1.6 — never trusted from local storage ---------------------------------

test('AC-17.1.6 — Entitlement is asked of the store on every launch, never trusted from local storage', async ({ page }) => {
  await page.addInitScript(() => {
    // Every plausible place a lie could sit.
    for (const key of ['rm.entitlement', 'rm.purchases.v1', 'rm.store.v1', 'entitlement', 'purchased']) {
      localStorage.setItem(key, JSON.stringify({ level: 'lifetime', productId: 'rm.lifetime', purchased: true }));
    }
  });
  await openStoreBuild(page, { purchases: [] });
  await expect(paywall(page)).toBeVisible();
  await expect(app(page)).toHaveAttribute('inert', '');
  expect(await calls(page)).toContain('currentPurchases');
});

// --- AC-17.1.7 — legal and account controls --------------------------------------

test('AC-17.1.7/1 — Terms of Use and Privacy Policy links are present and each opens the shipped page', async ({ page }) => {
  await openStoreBuild(page);
  const terms = paywall(page).locator('[data-action="open-terms"]');
  const privacy = paywall(page).locator('[data-action="open-privacy"]');
  await expect(terms).toHaveText('Terms of Use');
  await expect(privacy).toHaveText('Privacy Policy');

  await terms.click();
  await expect(page).toHaveURL(/terms\.html$/);
  await expect(page.locator('h1')).toHaveText('Terms of Use');
  await expect(page.locator('.legal')).toContainText('free trial');

  await page.goBack();
  await expect(paywall(page)).toBeVisible();
  await paywall(page).locator('[data-action="open-privacy"]').click();
  await expect(page).toHaveURL(/privacy\.html$/);
  await expect(page.locator('h1')).toHaveText('Privacy Policy');
  await expect(page.locator('.legal')).toContainText('collects no personal data');
});

test('AC-17.1.7/2 — "Restore purchases" is present on the paywall', async ({ page }) => {
  await openStoreBuild(page);
  const restore = paywall(page).locator('[data-action="restore-purchases"]');
  await expect(restore).toBeVisible();
  await expect(restore).toHaveText('Restore purchases');
  await expect(restore).toBeEnabled();
});

// --- AC-17.1.8 — the Purchases dialog --------------------------------------------

test('AC-17.1.8/1 — The Purchases dialog states the current entitlement in one line, with its date where there is one', async ({ page }) => {
  const fmt = (ms) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(ms));

  await openStoreBuild(page, { purchases: [trialSub()] });
  let dialog = await openPurchases(page);
  await expect(dialog.getByTestId('entitlement-line')).toHaveText(`Free trial, ends ${fmt(NOW + 2 * DAY)}`);
  await dialog.locator('[data-action="close"]').click();
  await expect(page.getByTestId('purchases')).toHaveCount(0);

  await openStoreBuild(page, { purchases: [paidSub()] });
  dialog = await openPurchases(page);
  await expect(dialog.getByTestId('entitlement-line')).toHaveText(`Subscribed, renews ${fmt(NOW + 20 * DAY)}`);

  await openStoreBuild(page, { purchases: [lifetime()] });
  dialog = await openPurchases(page);
  await expect(dialog.getByTestId('entitlement-line')).toHaveText('Purchased — yours to keep');
});

test('AC-17.1.8/2 — Buy outright is offered until `lifetime`, and completing it updates the line', async ({ page }) => {
  await openStoreBuild(page, { purchases: [paidSub()] });
  const dialog = await openPurchases(page);
  const buy = dialog.locator('[data-action="buy-lifetime"]');
  await expect(buy).toContainText('Buy outright');
  await expect(buy).toContainText('£24.99');
  await buy.click();
  await expect(dialog.getByTestId('entitlement-line')).toHaveText('Purchased — yours to keep');
  await expect(dialog.locator('[data-action="buy-lifetime"]')).toHaveCount(0);
  expect((await entitlement(page)).level).toBe('lifetime');

  // Already `lifetime` from the start: nothing to buy.
  await openStoreBuild(page, { purchases: [lifetime()] });
  const again = await openPurchases(page);
  await expect(again.locator('[data-action="buy-lifetime"]')).toHaveCount(0);
});

test("AC-17.1.8/3 — Manage subscription is offered while on the trial or subscribed, and opens the store's own management", async ({ page }) => {
  await openStoreBuild(page, { purchases: [trialSub()] });
  let dialog = await openPurchases(page);
  await dialog.locator('[data-action="manage-subscription"]').click();
  expect(await page.evaluate(() => window.__rmFakeStore.managed)).toBe(true);
  expect(await calls(page)).toContain('manageSubscriptions');

  await openStoreBuild(page, { purchases: [paidSub()] });
  dialog = await openPurchases(page);
  await expect(dialog.locator('[data-action="manage-subscription"]')).toBeVisible();

  await openStoreBuild(page, { purchases: [lifetime()] });
  dialog = await openPurchases(page);
  await expect(dialog.locator('[data-action="manage-subscription"]')).toHaveCount(0);
});

// --- AC-17.1.9 — the web build is free ---------------------------------------------

test('AC-17.1.9/1 — The web build opens the app with no paywall and no Purchases control', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.slot').first()).toBeVisible();
  await expect(paywall(page)).toHaveCount(0);
  await expect(page.locator('[data-action="purchases"]')).toHaveCount(0);
  await expect(app(page)).not.toHaveAttribute('inert', '');
  await expect(page.locator('body')).not.toContainText(/Buy outright|free trial|Restore purchases/i);
  expect(await page.evaluate(() => window.__rm.getState().store.hasStore)).toBe(false);
});

test('AC-17.1.9/2 — The web build never statically imports the billing plugin', async ({ page }) => {
  const scripts = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(r.url());
  });
  await page.goto('/');
  await expect(page.locator('.slot').first()).toBeVisible();
  // Give the composition root time to select its adapter and load whatever it loads.
  await expect.poll(() => page.evaluate(() => window.__rm.getState().store.hasStore)).toBe(false);

  // The page loaded the app and the web adapter — and never the native chunk,
  // which is the only place the plugin lives.
  expect(scripts.some((u) => /\/assets\/main-/.test(u))).toBe(true);
  expect(scripts.some((u) => /\/assets\/native-/.test(u))).toBe(false);
  for (const url of scripts) {
    const body = await page.evaluate(async (u) => (await fetch(u)).text(), url);
    expect(body, url).not.toContain('NativePurchases');
  }
});
