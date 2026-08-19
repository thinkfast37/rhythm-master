/**
 * The paywall and the Purchases dialog. US-17.1 (AC-17.1.2, AC-17.1.7, AC-17.1.8).
 *
 * Both are rendered from what the store said — titles, prices, the trial length —
 * and never from a value written here (AC-17.1.2/2; an App Review requirement).
 * `main.js` owns the entitlement and the adapter; this module only draws and
 * reports clicks.
 */

let host = null;

function ensureHost() {
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.className = 'paywall-host';
  document.body.appendChild(host);
  return host;
}

function el(tag, className, props = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.assign(node, props);
  return node;
}

const dateFormat =
  typeof Intl !== 'undefined' ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }) : null;
export function formatDate(ms) {
  return dateFormat ? dateFormat.format(new Date(ms)) : new Date(ms).toISOString().slice(0, 10);
}

/** One line saying where the Musician stands (AC-17.1.8/1). */
export function entitlementLine(entitlement) {
  switch (entitlement?.level) {
    case 'trial':
      return `Free trial, ends ${formatDate(entitlement.until)}`;
    case 'subscribed':
      return `Subscribed, renews ${formatDate(entitlement.until)}`;
    case 'lifetime':
      return 'Purchased — yours to keep';
    default:
      return 'Not purchased';
  }
}

function legalLinks() {
  const wrap = el('p', 'paywall-legal');
  const terms = el('a', 'paywall-link', { href: 'terms.html', textContent: 'Terms of Use' });
  terms.dataset.action = 'open-terms';
  const privacy = el('a', 'paywall-link', { href: 'privacy.html', textContent: 'Privacy Policy' });
  privacy.dataset.action = 'open-privacy';
  wrap.append(terms, ' · ', privacy);
  return wrap;
}

function productButton(product, { action, primary, lead, trail }) {
  const button = el('button', `paywall-product${primary ? ' primary' : ''}`, { type: 'button' });
  button.dataset.action = action;
  button.disabled = !product;
  const title = el('span', 'paywall-product-lead', { textContent: lead });
  const detail = el('span', 'paywall-product-detail', {
    textContent: product ? trail(product) : 'Not available from the store right now',
  });
  button.append(title, detail);
  return button;
}

/**
 * Show — or update — the paywall. Call again to re-render with new products or a
 * new notice; call `hidePaywall` when the Musician is entitled.
 *
 * @param {{
 *   products: {monthly: object|null, lifetime: object|null} | null,  // null while loading
 *   notice?: string,
 *   busy?: boolean,
 *   onStartTrial: () => void,
 *   onBuyLifetime: () => void,
 *   onRestore: () => void,
 * }} spec
 */
export function showPaywall({ products, notice = '', busy = false, onStartTrial, onBuyLifetime, onRestore }) {
  const root = ensureHost();
  root.innerHTML = '';

  const backdrop = el('div', 'paywall-backdrop');
  backdrop.dataset.testid = 'paywall';
  const box = el('div', 'paywall');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'paywall-title');

  box.appendChild(el('h1', 'paywall-title', { id: 'paywall-title', textContent: 'Rhythm Master' }));
  box.appendChild(
    el('p', 'paywall-lede', {
      textContent: 'Rhythm and melody practice, on your own instrument, at your own tempo.',
    })
  );

  if (!products) {
    box.appendChild(el('p', 'paywall-status', { textContent: 'Checking your purchases…' }));
  } else {
    const monthly = products.monthly;
    const trialDays = monthly?.trialDays;
    box.appendChild(
      productButton(monthly, {
        action: 'start-trial',
        primary: true,
        lead: trialDays ? `Start your free ${trialDays}-day trial` : 'Subscribe monthly',
        trail: (p) => (trialDays ? `then ${p.priceString} a month · ${p.title}` : `${p.priceString} a month · ${p.title}`),
      })
    );
    box.appendChild(
      productButton(products.lifetime, {
        action: 'buy-lifetime',
        primary: false,
        lead: 'Buy outright',
        trail: (p) => `${p.priceString} once · ${p.title}`,
      })
    );
    box.appendChild(
      el('p', 'paywall-fineprint', {
        textContent: trialDays
          ? `Cancel any time during the trial and you pay nothing. The subscription renews monthly until cancelled in your store account.`
          : 'The subscription renews monthly until cancelled in your store account.',
      })
    );
  }

  const status = el('p', 'paywall-status paywall-notice', { textContent: notice });
  status.dataset.testid = 'paywall-notice';
  status.hidden = !notice;
  box.appendChild(status);

  const restore = el('button', 'paywall-restore', { type: 'button', textContent: 'Restore purchases' });
  restore.dataset.action = 'restore-purchases';
  restore.disabled = busy || !products;
  box.appendChild(restore);
  box.appendChild(legalLinks());

  box.querySelector('[data-action="start-trial"]')?.addEventListener('click', () => onStartTrial?.());
  box.querySelector('[data-action="buy-lifetime"]')?.addEventListener('click', () => onBuyLifetime?.());
  restore.addEventListener('click', () => onRestore?.());
  if (busy) for (const b of box.querySelectorAll('button')) b.disabled = true;

  backdrop.appendChild(box);
  root.appendChild(backdrop);
  return backdrop;
}

export function hidePaywall() {
  if (host) host.innerHTML = '';
}

/**
 * The Purchases dialog, opened from the header inside the store build (AC-17.1.8).
 * Re-renders itself in place after a purchase, so the line updates without the
 * dialog closing under the Musician.
 *
 * @param {{
 *   getEntitlement: () => object,
 *   products: {monthly: object|null, lifetime: object|null},
 *   onBuyLifetime: () => Promise<{status: string, message?: string}>,
 *   onManage: () => Promise<void>,
 *   onRestore: () => Promise<object>,
 * }} spec
 */
export function showPurchases({ getEntitlement, products, onBuyLifetime, onManage, onRestore }) {
  const root = ensureHost();

  const draw = (notice = '') => {
    root.innerHTML = '';
    const entitlement = getEntitlement();
    const backdrop = el('div', 'dialog-backdrop');
    backdrop.dataset.testid = 'purchases';
    const box = el('div', 'dialog purchases');
    box.setAttribute('role', 'dialog');

    box.appendChild(el('p', 'dialog-title', { textContent: 'Purchases' }));
    const line = el('p', 'dialog-message purchases-line', { textContent: entitlementLine(entitlement) });
    line.dataset.testid = 'entitlement-line';
    box.appendChild(line);

    if (notice) box.appendChild(el('p', 'dialog-note', { textContent: notice }));

    const actions = el('div', 'dialog-actions');
    if (entitlement.level !== 'lifetime') {
      const buy = el('button', 'dialog-button primary', {
        type: 'button',
        textContent: products.lifetime
          ? `Buy outright · ${products.lifetime.priceString}`
          : 'Buy outright (not available right now)',
      });
      buy.dataset.action = 'buy-lifetime';
      buy.disabled = !products.lifetime;
      buy.addEventListener('click', async () => {
        buy.disabled = true;
        const result = await onBuyLifetime();
        draw(result.status === 'ok' ? '' : result.message ?? 'Purchase cancelled.');
      });
      actions.appendChild(buy);
    }
    if (entitlement.level === 'trial' || entitlement.level === 'subscribed') {
      const manage = el('button', 'dialog-button', { type: 'button', textContent: 'Manage subscription' });
      manage.dataset.action = 'manage-subscription';
      manage.addEventListener('click', () => onManage());
      actions.appendChild(manage);
    }
    const restore = el('button', 'dialog-button', { type: 'button', textContent: 'Restore purchases' });
    restore.dataset.action = 'restore-purchases';
    restore.addEventListener('click', async () => {
      await onRestore();
      draw();
    });
    actions.appendChild(restore);

    const close = el('button', 'dialog-button', { type: 'button', textContent: 'Close' });
    close.dataset.action = 'close';
    close.addEventListener('click', () => {
      root.innerHTML = '';
    });
    actions.appendChild(close);

    box.appendChild(actions);
    box.appendChild(legalLinks());
    backdrop.appendChild(box);
    root.appendChild(backdrop);
  };

  draw();
}
