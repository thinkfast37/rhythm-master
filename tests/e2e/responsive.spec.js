import { test, expect } from '@playwright/test';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

const DESKTOP = { width: 1400, height: 900 };
const TABLET = { width: 900, height: 1000 };
const MOBILE = { width: 390, height: 844 };

test('AC-15.1.2 — desktop opens with a 300px sidebar column that the toggle collapses', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');

  await expect(page.locator('.shell')).toHaveAttribute('data-viewport', 'desktop');
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');
  const width = await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(width)).toBe(300);
  await expect(page.locator('.sidebar')).toBeVisible();

  // The toggle collapses the column out of the layout, and the main panel takes
  // back the width it was occupying.
  const before = await page.locator('.main-panel').evaluate((el) => el.getBoundingClientRect().width);
  await page.locator('.library-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'collapsed');
  await expect(page.locator('.sidebar')).toBeHidden();
  const after = await page.locator('.main-panel').evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(after - before)).toBe(300);
});

test('AC-15.1.3 — tablet opens with a 240px sidebar column, collapsible the same way', async ({ page }) => {
  await page.setViewportSize(TABLET);
  await page.goto('/');

  await expect(page.locator('.shell')).toHaveAttribute('data-viewport', 'tablet');
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');
  const width = await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(width)).toBe(240);
  await expect(page.locator('.sidebar')).toBeVisible();

  await page.locator('.library-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'collapsed');
  await expect(page.locator('.sidebar')).toBeHidden();
});

test('AC-15.1.4 — mobile turns the sidebar into an off-canvas drawer at 85vw, capped at 320px', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');

  await expect(page.locator('.shell')).toHaveAttribute('data-viewport', 'mobile');
  await expect(page.locator('.library-toggle')).toBeVisible();

  const width = await page.locator('.sidebar').evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(width)).toBe(Math.round(Math.min(390 * 0.85, 320)));
  expect(width).toBeLessThanOrEqual(320);
});

test('AC-15.1.5 — the mobile drawer auto-opens on every load, not just the first', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');

  await page.reload();
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');

  // And again after closing it once, so it is not a one-time-per-browser thing.
  await page.locator('.library-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'collapsed');
  await page.reload();
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');
});

test('AC-15.1.6 — selecting a Pattern collapses the library at every width', async ({ page }) => {
  for (const size of [MOBILE, TABLET, DESKTOP]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');

    await page.locator('.pattern-name').nth(3).click();
    await expect(page.locator('.shell'), `${size.width}px`).toHaveAttribute(
      'data-library',
      'collapsed'
    );
    // Above mobile it leaves the layout; on mobile it slides off-canvas.
    if (size.width >= 768) await expect(page.locator('.sidebar')).toBeHidden();
  }
});

test('AC-15.1.6 — loading a Pattern returns the main panel to its top', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await loadTallPattern(page); // tall enough that the panel has somewhere to scroll

  // Scroll the main panel well down, as it would be after working on a Pattern.
  await page.locator('.main-panel').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await page.locator('.main-panel').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  await page.locator('.pattern-name').nth(5).click();

  // The Pattern just loaded is what you are looking at, not whatever was at the
  // old offset.
  expect(await page.locator('.main-panel').evaluate((el) => el.scrollTop)).toBe(0);
  await expect(page.locator('.pattern-title')).toBeInViewport();
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

test('AC-15.1.8 — Fixed main-panel section order', async ({ page }) => {
  // The pitch strip sits between the grid and the play controls, and is present
  // in the DOM at both Sound Modes — hidden rather than removed in Percussive,
  // so the order itself never depends on the mode (AC-2.2.13). The family members
  // area is last and follows the same convention: always in the DOM, shown only at
  // 768px and wider and only when there are members (AC-11.2.5, which is where its
  // visibility is proved).
  const expected = [
    'HEADER.pattern-header',
    'DIV.grid',
    'SECTION[pitch]',
    'SECTION[play]',
    'DETAILS[playback-settings]',
    'DETAILS[edit]',
    'DETAILS[actions]',
    'NAV.pattern-nav',
    'SECTION[family]',
  ];

  const orderNow = () =>
    page.locator('.main-panel > *').evaluateAll((els) =>
      els
        .filter((e) => !e.classList.contains('library-toggle'))
        .map((e) => {
          if (e.tagName === 'DETAILS') return `DETAILS[${e.dataset.section}]`;
          if (e.tagName === 'SECTION') return `SECTION[${e.dataset.section}]`;
          return e.className ? `${e.tagName}.${e.className.split(' ')[0]}` : e.tagName;
        })
    );

  for (const size of [DESKTOP, TABLET, MOBILE]) {
    await page.setViewportSize(size);
    await page.goto('/');
    expect(await orderNow(), `${size.width}px`).toEqual(expected);

    // Same order in Melodic mode, where the strip is the one that becomes
    // visible rather than the one that moves.
    // Driven through the handler rather than the Sound Mode control, which is
    // inside the Edit accordion and so collapsed at mobile width (AC-15.1.7) —
    // and the point here is the section order, not how the mode was reached.
    await page.evaluate(async () => {
      window.__rm.loadBlank('4/4');
      await window.__rm.handlers.onSoundMode('melodic');
    });
    await expect(page.locator('.pitch-strip')).toBeVisible();
    expect(await orderNow(), `${size.width}px melodic`).toEqual(expected);
  }
});

test('AC-15.1.9 — wide controls never push the page sideways on mobile', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');

  // A Pattern of our own. The app opens on a shipped one, and editing that
  // asks for a copy name first (US-7.3) — a dialog that would swallow the mode
  // change and leave this measuring a Percussive panel.
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  await page.locator('.library-toggle').click(); // close the auto-opened drawer

  // Open every section and switch to Melodic, which adds the widest controls.
  for (const name of ['playback-settings', 'edit', 'actions']) {
    await page.locator(`details[data-section="${name}"] > summary`).click();
  }
  await page.locator('.sound-mode').selectOption('melodic');
  await expect(page.locator('.pitch-strip')).toBeVisible();
  // The pitch strip at its widest: all fifteen degrees, not just the default
  // eight. It wraps within the panel rather than scrolling the page (US-2.2).
  await page.locator('[data-action="toggle-extended-degrees"]').click();
  await expect(page.locator('.degree')).toHaveCount(15);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('AC-15.1.11 — playback scrolls the sounding Measure into view and back on loop', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await page.locator('.library-toggle').click(); // close the drawer

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
    await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');
    await expect(page.locator('.pattern-item').first()).toBeVisible();
  }
});

test('AC-15.1.6 — creating a new Pattern collapses the library so you can see it', async ({ page }) => {
  for (const size of [MOBILE, DESKTOP]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');

    await page.locator('[data-action="new-pattern"]').click();

    // The library gets out of the way, revealing the Pattern that was just made.
    await expect(page.locator('.shell'), `${size.width}px`).toHaveAttribute(
      'data-library',
      'collapsed'
    );
    await expect(page.locator('.pattern-title')).toHaveValue('New Pattern');
    await expect(page.locator('.grid .measure').first()).toBeInViewport();
  }
});

test('AC-15.1.6 — working inside the library leaves it open, at every width', async ({ page }) => {
  for (const size of [MOBILE, DESKTOP]) {
    await page.setViewportSize(size);
    await page.goto('/');
    const shell = page.locator('.shell');
    await expect(shell).toHaveAttribute('data-library', 'open');

    // Searching, filtering and rating are all work done *in* the library.
    await page.locator('.library-search').fill('clave');
    await expect(shell, `search @ ${size.width}px`).toHaveAttribute('data-library', 'open');

    await page.locator('.rating-option', { hasText: 'All' }).click();
    await expect(shell, `rating filter @ ${size.width}px`).toHaveAttribute('data-library', 'open');

    await page.locator('.pattern-item').first().locator('.star').nth(2).click();
    await expect(shell, `rate @ ${size.width}px`).toHaveAttribute('data-library', 'open');

    await page.locator('.tag-filter').first().click();
    await expect(shell, `tag filter @ ${size.width}px`).toHaveAttribute('data-library', 'open');
  }
});

/**
 * A Pattern tall enough that the main panel genuinely has somewhere to scroll,
 * so "the main panel did not move" is a real assertion rather than a vacuous one.
 */
async function loadTallPattern(page) {
  await page.evaluate(() => {
    const measure = () => ({
      timeSignature: '12/8',
      beats: Array.from({ length: 12 }, () => ({
        recipe: 'straight-16ths',
        slots: [{ on: true }, { on: false }],
      })),
    });
    window.__rm.loadPattern(
      {
        id: 'p_tall',
        name: 'Tall One',
        soundMode: 'percussive',
        tempo: 120,
        tags: [],
        rating: 0,
        measures: Array.from({ length: 6 }, measure),
      },
      { owned: true }
    );
  });
}

test('AC-15.1.12 — the library and the main panel scroll independently, and the page does not', async ({
  page,
}) => {
  for (const size of [DESKTOP, TABLET]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await loadTallPattern(page);

    const shell = page.locator('.shell');
    const sidebar = page.locator('.sidebar');
    const main = page.locator('.main-panel');
    await expect(shell).toHaveAttribute('data-library', 'open');

    // Both panes must actually overflow, or the test proves nothing.
    for (const [name, pane] of [['sidebar', sidebar], ['main panel', main]]) {
      const overflow = await pane.evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(overflow, `${name} @ ${size.width}px has nothing to scroll`).toBeGreaterThan(0);
    }

    // Scrolling the library leaves the main panel exactly where it was.
    const headerTop = () =>
      page.locator('.pattern-header').evaluate((el) => el.getBoundingClientRect().top);
    const before = await headerTop();
    await sidebar.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await sidebar.evaluate((el) => el.scrollTop), `${size.width}px`).toBeGreaterThan(0);
    expect(await main.evaluate((el) => el.scrollTop), `${size.width}px`).toBe(0);
    expect(await headerTop(), `${size.width}px`).toBeCloseTo(before, 0);

    // And scrolling the main panel leaves the library where it was.
    const libraryScroll = await sidebar.evaluate((el) => el.scrollTop);
    await main.evaluate((el) => {
      el.scrollTop = 400;
    });
    expect(await main.evaluate((el) => el.scrollTop), `${size.width}px`).toBeGreaterThan(0);
    expect(await sidebar.evaluate((el) => el.scrollTop), `${size.width}px`).toBe(libraryScroll);

    // Neither pane extends the document, so there is no third scrollbar to fight.
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight
    );
    expect(pageOverflow, `${size.width}px`).toBeLessThanOrEqual(0);
  }
});

test('AC-15.1.13 — the toggle reopens a collapsed library from any scroll offset', async ({ page }) => {
  for (const size of [DESKTOP, TABLET, MOBILE]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await loadTallPattern(page);

    const toggle = page.locator('.library-toggle');
    const shell = page.locator('.shell');

    await toggle.click();
    await expect(shell, `${size.width}px`).toHaveAttribute('data-library', 'collapsed');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Scroll the main panel to the bottom: the toggle must still be reachable,
    // or reopening the library means scrolling back up to find the control.
    await page.locator('.main-panel').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(toggle, `${size.width}px`).toBeInViewport();

    await toggle.click();
    await expect(shell, `${size.width}px`).toHaveAttribute('data-library', 'open');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.pattern-item').first()).toBeVisible();
  }
});

test('AC-15.1.13 — a reload opens the library again, at every width', async ({ page }) => {
  for (const size of [DESKTOP, TABLET, MOBILE]) {
    await page.setViewportSize(size);
    await page.goto('/');

    await page.locator('.library-toggle').click();
    await expect(page.locator('.shell')).toHaveAttribute('data-library', 'collapsed');

    // Collapsed is a within-session position, not a stored preference: the app
    // never opens with its library missing.
    await page.reload();
    await expect(page.locator('.shell'), `${size.width}px`).toHaveAttribute('data-library', 'open');
  }
});
