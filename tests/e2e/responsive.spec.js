import { test, expect } from '@playwright/test';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

const DESKTOP = { width: 1400, height: 900 };
const TABLET = { width: 900, height: 1000 };
const MOBILE = { width: 390, height: 844 };

test('AC-15.1.2 — desktop shows a persistent 300px sidebar with no drawer toggle', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');

  await expect(page.locator('.shell')).toHaveAttribute('data-viewport', 'desktop');
  const width = await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(width)).toBe(300);
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.drawer-toggle')).toBeHidden();
});

test('AC-15.1.3 — tablet shows a persistent 240px sidebar, narrower but still visible', async ({ page }) => {
  await page.setViewportSize(TABLET);
  await page.goto('/');

  await expect(page.locator('.shell')).toHaveAttribute('data-viewport', 'tablet');
  const width = await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(width)).toBe(240);
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.drawer-toggle')).toBeHidden();
});

test('AC-15.1.4 — mobile turns the sidebar into an off-canvas drawer at 85vw, capped at 320px', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');

  await expect(page.locator('.shell')).toHaveAttribute('data-viewport', 'mobile');
  await expect(page.locator('.drawer-toggle')).toBeVisible();

  const width = await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(width)).toBe(Math.round(Math.min(390 * 0.85, 320)));
  expect(width).toBeLessThanOrEqual(320);
});

test('AC-15.1.5 — the mobile drawer auto-opens on every load, not just the first', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');

  await page.reload();
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');

  // And again after closing it once, so it is not a one-time-per-browser thing.
  await page.locator('.drawer-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'closed');
  await page.reload();
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');
});

test('AC-15.1.6 — selecting a Pattern closes the drawer on mobile only', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');

  await page.locator('.pattern-name').nth(3).click();
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'closed');

  // On desktop the sidebar is a column; selecting changes nothing about it.
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.locator('.pattern-name').nth(3).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.shell')).not.toHaveAttribute('data-drawer', /.*/);
});

test('AC-15.1.7 — secondary sections are collapsed accordions on mobile, expanded on desktop', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  for (const name of ['playback-settings', 'edit', 'actions']) {
    const section = page.locator(`details[data-section="${name}"]`);
    await expect(section).toHaveAttribute('data-accordion', 'true');
    expect(await section.evaluate((el) => el.open), name).toBe(false);
  }

  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  for (const name of ['playback-settings', 'edit', 'actions']) {
    const section = page.locator(`details[data-section="${name}"]`);
    await expect(section).toHaveAttribute('data-accordion', 'false');
    expect(await section.evaluate((el) => el.open), name).toBe(true);
  }
});

test('AC-15.1.8 — main-panel section order is fixed and identical at every width', async ({ page }) => {
  const expected = [
    'HEADER.pattern-header',
    'DIV.grid',
    'SECTION',
    'DETAILS[playback-settings]',
    'DETAILS[edit]',
    'DETAILS[actions]',
    'NAV.pattern-nav',
  ];

  for (const size of [DESKTOP, TABLET, MOBILE]) {
    await page.setViewportSize(size);
    await page.goto('/');
    const order = await page.locator('.main-panel > *').evaluateAll((els) =>
      els
        .filter((e) => !e.classList.contains('drawer-toggle'))
        .map((e) => {
          if (e.tagName === 'DETAILS') return `DETAILS[${e.dataset.section}]`;
          if (e.tagName === 'SECTION') return 'SECTION';
          return e.className ? `${e.tagName}.${e.className.split(' ')[0]}` : e.tagName;
        })
    );
    expect(order, `${size.width}px`).toEqual(expected);
  }
});

test('AC-15.1.9 — wide controls never push the page sideways on mobile', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');

  await page.locator('.drawer-toggle').click(); // close the auto-opened drawer

  // Open every section and switch to Melodic, which adds the widest controls.
  for (const name of ['playback-settings', 'edit', 'actions']) {
    await page.locator(`details[data-section="${name}"] > summary`).click();
  }
  await page.locator('.sound-mode').selectOption('melodic');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('AC-15.1.11 — playback scrolls the sounding Measure into view and back on loop', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await page.locator('.drawer-toggle').click(); // close the drawer

  // Six Measures, so later ones start below the fold.
  await page.evaluate(() => {
    // 12/8 wraps to several lines per Measure at phone width, so later
    // Measures genuinely start below the fold.
    const measure = () => ({
      timeSignature: '12/8',
      beats: Array.from({ length: 12 }, () => ({
        recipe: 'straight-16ths',
        slots: [{ on: true }, { on: false }],
      })),
    });
    window.__rm.loadPattern(
      {
        id: 'p_long',
        name: 'Long One',
        soundMode: 'percussive',
        tempo: 220,
        tags: [],
        rating: 0,
        measures: Array.from({ length: 6 }, measure),
      },
      { owned: true }
    );
  });

  // Find the first Measure that genuinely starts below the fold, rather than
  // assuming which index that is — it depends on how the Beats wrap.
  const offscreen = await page.evaluate(() => {
    const measures = [...document.querySelectorAll('.measure')];
    const found = measures.find((m) => m.getBoundingClientRect().top >= window.innerHeight);
    return found ? Number(found.dataset.measure) : null;
  });
  expect(offscreen, 'expected at least one Measure below the fold').not.toBeNull();

  await page.locator('[data-action="play"]').click();
  await page.waitForFunction(
    (index) => {
      const el = document.querySelector(`.measure[data-measure="${index}"]`);
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    },
    offscreen,
    { timeout: 20000 }
  );

  // And it comes back to Measure 1 when the loop wraps.
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.measure[data-measure="0"]');
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    },
    null,
    { timeout: 15000 }
  );
});

test('AC-15.1.1 — the library is reachable at every width', async ({ page }) => {
  for (const size of [DESKTOP, TABLET, MOBILE]) {
    await page.setViewportSize(size);
    await page.goto('/');
    if (size.width < 768) {
      await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');
    }
    await expect(page.locator('.pattern-item').first()).toBeVisible();
  }
});

test('AC-15.1.6 — creating a new Pattern closes the drawer so you can see it', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');

  await page.locator('[data-action="new-pattern"]').click();

  // The drawer gets out of the way, revealing the Pattern that was just made.
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'closed');
  await expect(page.locator('.pattern-title')).toHaveValue('New Pattern');
  await expect(page.locator('.grid .measure').first()).toBeInViewport();
});

test('AC-15.1.6 — working inside the drawer leaves it open', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');

  // Searching, filtering and rating are all work done *in* the library.
  await page.locator('.library-search').fill('clave');
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');

  await page.locator('.rating-option', { hasText: 'All' }).click();
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');

  await page.locator('.pattern-item').first().locator('.star').nth(2).click();
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');

  await page.locator('.tag-filter').first().click();
  await expect(page.locator('.shell')).toHaveAttribute('data-drawer', 'open');
});
