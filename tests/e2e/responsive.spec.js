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
  // With the library open beside a 1400px window the panel is 1100px and has
  // two panes (AC-15.1.18); what scrolls is then its grid pane, and both are
  // put back to the top.
  const layout = await page.locator('.main-panel').getAttribute('data-layout');
  const scroller = page.locator(layout === 'wide' ? '.pane-pattern' : '.main-panel');
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

  await page.locator('.pattern-name').nth(5).click();

  // The Pattern just loaded is what you are looking at, not whatever was at the
  // old offset.
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await page.locator('.main-panel').evaluate((el) => el.scrollTop)).toBe(0);
  await expect(page.locator('.pattern-title')).toBeInViewport();
});

// --- AC-15.1.7: the workbench is tabbed at every width ---

const GROUPS = ['melody', 'rhythm', 'practice', 'compose'];
const group = (page, name) => page.locator(`section[data-section="${name}"]`);
const tab = (page, name) => page.locator(`.workbench-tab[data-tab="${name}"]`);

/** Which of the three groups are actually on screen. */
async function visibleGroups(page) {
  const out = [];
  for (const name of GROUPS) if (await group(page, name).isVisible()) out.push(name);
  return out;
}

test('AC-15.1.7/1 — On mobile a tab bar names the workbench groups and exactly one group is on screen', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.library-toggle').click();

  await expect(page.locator('.workbench-tabs')).toBeVisible();
  await expect(tab(page, 'rhythm')).toBeVisible();
  await expect(tab(page, 'practice')).toBeVisible();
  expect(await visibleGroups(page)).toHaveLength(1);

  await page.evaluate(() => window.__rm.handlers.onSoundMode('melodic'));
  await expect(tab(page, 'melody')).toBeVisible();
  expect(await visibleGroups(page)).toHaveLength(1);
});

test('AC-15.1.7/2 — On desktop and tablet the tab bar is shown too, and exactly one applicable group is on screen at a time', async ({
  page,
}) => {
  for (const size of [DESKTOP, TABLET]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await page.evaluate(() => window.__rm.loadBlank('4/4'));
    await page.locator('.library-toggle').click();

    await expect(page.locator('.workbench-tabs'), `${size.width}px`).toBeVisible();
    await expect(tab(page, 'rhythm'), `${size.width}px`).toBeVisible();
    await expect(tab(page, 'practice'), `${size.width}px`).toBeVisible();
    expect(await visibleGroups(page), `${size.width}px`).toEqual(['rhythm']);

    await tab(page, 'practice').click();
    expect(await visibleGroups(page), `${size.width}px practice`).toEqual(['practice']);

    await page.evaluate(() => window.__rm.handlers.onSoundMode('melodic'));
    await expect(tab(page, 'melody'), `${size.width}px melodic`).toBeVisible();
    expect(await visibleGroups(page), `${size.width}px melodic`).toEqual(['melody']);
  }
});

test('AC-15.1.7/3 — A Melodic Pattern opens on the Melody tab and a Percussive one on the Rhythm tab, and switching Mode selects the tab for the new Mode', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.library-toggle').click();

  await expect(tab(page, 'rhythm')).toHaveAttribute('aria-selected', 'true');
  expect(await visibleGroups(page)).toEqual(['rhythm']);

  // Switching Mode, from the header, moves to the Melody tab — even though the
  // musician had chosen another tab first.
  await tab(page, 'practice').click();
  expect(await visibleGroups(page)).toEqual(['practice']);
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await expect(tab(page, 'melody')).toHaveAttribute('aria-selected', 'true');
  expect(await visibleGroups(page)).toEqual(['melody']);

  // And back: Percussive opens on Rhythm.
  await page.locator('.sound-mode [data-mode="percussive"]').click();
  await expect(tab(page, 'rhythm')).toHaveAttribute('aria-selected', 'true');
  expect(await visibleGroups(page)).toEqual(['rhythm']);

  // Loading a Melodic Pattern opens on Melody, whatever tab was in force.
  await tab(page, 'practice').click();
  await page.evaluate(async () => {
    const p = window.__rm.loadBlank('4/4', 'Sung');
    window.__rm.loadPattern({ ...p, soundMode: 'melodic', key: 'C', scale: 'ionian' }, { owned: true });
  });
  await expect(tab(page, 'melody')).toHaveAttribute('aria-selected', 'true');
  expect(await visibleGroups(page)).toEqual(['melody']);
});

test('AC-15.1.7/4 — Tapping a tab shows that group and hides the others, and the Melody and Compose tabs are absent on a Percussive Pattern, Compose also on a Melodic one without a progression', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.library-toggle').click();

  await expect(tab(page, 'melody')).toBeHidden();
  await expect(tab(page, 'compose')).toBeHidden();
  // Melodic without a progression: Melody appears, Compose still does not;
  // a progression brings Compose with it (AC-18.1.1/1).
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await expect(tab(page, 'melody')).toBeVisible();
  await expect(tab(page, 'compose')).toBeHidden();
  await page.locator('.progression-picker').selectOption('I-IV-V');
  await expect(tab(page, 'compose')).toBeVisible();
  await tab(page, 'compose').click();
  expect(await visibleGroups(page)).toEqual(['compose']);
  await page.locator('.sound-mode [data-mode="percussive"]').click();
  await expect(tab(page, 'compose')).toBeHidden();
  await tab(page, 'practice').click();
  expect(await visibleGroups(page)).toEqual(['practice']);
  await expect(page.locator('.tempo-slider')).toBeVisible();
  await tab(page, 'rhythm').click();
  expect(await visibleGroups(page)).toEqual(['rhythm']);
  await expect(page.locator('.recipe-chips')).toBeVisible();
});

test('AC-15.1.7/5 — Pattern actions is a collapsed accordion on mobile and an expanded section on desktop', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  const section = page.locator('details[data-section="actions"]');
  await expect(section).toHaveAttribute('data-accordion', 'true');
  expect(await section.evaluate((el) => el.open)).toBe(false);

  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await expect(section).toHaveAttribute('data-accordion', 'false');
  expect(await section.evaluate((el) => el.open)).toBe(true);
});

test('AC-15.1.8 — Fixed main-panel section order', async ({ page }) => {
  // Every entry is present in the DOM at both Sound Modes and every width —
  // the Melody group and the chord strip hidden rather than removed in
  // Percussive (AC-2.2.13), the tab bar hidden above mobile and the family
  // members area below it (AC-15.1.7, AC-11.2.5) — so the order itself never
  // depends on the mode or the viewport.
  const expected = [
    'HEADER.pattern-header',
    'SECTION[chords]',
    // The grid section: the grid, or the sheet music in its place (US-12.2),
    // with the brush line under it (AC-1.3.12).
    'DIV.pattern-view',
    'NAV.workbench-tabs',
    'SECTION[melody]',
    'SECTION[rhythm]',
    'SECTION[practice]',
    'SECTION[compose]',
    'DETAILS[actions]',
    'SECTION[family]',
  ];

  // The sections of both panes in document order (AC-15.1.18): the Pattern
  // pane's, then the workbench pane's. The pinned bar — the library toggle,
  // the transport and quick navigation — sits above the panes rather than
  // among the sections (AC-5.5.3, AC-15.1.17), so it is not walked.
  const orderNow = () =>
    page.locator('.main-panel .pane > *').evaluateAll((els) =>
      els
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
    // Driven through the handler: the point here is the section order, not
    // how the mode was reached.
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

  // Open the one accordion and switch to Melodic, which adds the widest controls.
  await page.locator('details[data-section="actions"] > summary').click();
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await expect(page.locator('.pitch-strip')).toBeVisible();
  // The pitch strip at its widest: all twelve chromatic degrees. It wraps
  // within the panel rather than scrolling the page (US-2.2).
  await expect(page.locator('.degree')).toHaveCount(12);

  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow(), 'melody').toBeLessThanOrEqual(0);
  // Each tab in turn: the Subdivision chips, then the tempo preset row.
  for (const name of ['rhythm', 'practice']) {
    await page.locator(`.workbench-tab[data-tab="${name}"]`).click();
    expect(await overflow(), name).toBeLessThanOrEqual(0);
  }
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
    // What scrolls beside the library: the panel itself, or — with the
    // library open beside a 1400px window, a 1100px panel — its grid pane
    // (AC-15.1.18). The panel's own offset stays zero either way.
    const layout = await page.locator('.main-panel').getAttribute('data-layout');
    const main = page.locator(layout === 'wide' ? '.pane-pattern' : '.main-panel');
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

test('AC-15.1.16/1 — The control being operated keeps focus across the update it causes', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4', 'Keeps Focus'));

  // The swing slider, on the Practice tab: two keyboard adjustments in a row,
  // each re-rendering the panel, without ever re-selecting the control.
  await tab(page, 'practice').click();
  const slider = page.locator('.swing-slider').first();
  await slider.focus();
  const before = Number(await slider.inputValue());
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue(String(before + 1));
  await expect(slider).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue(String(before + 2));
  await expect(slider).toBeFocused();

  // The Sound Mode switch: the mode change rebuilds the panel around it and
  // brings in the Melody group, and focus stays on the option just tapped.
  const melodic = page.locator('.sound-mode [data-mode="melodic"]');
  await melodic.focus();
  await page.keyboard.press('Enter');
  await expect(melodic).toHaveAttribute('aria-pressed', 'true');
  await expect(melodic).toBeFocused();
  const percussive = page.locator('.sound-mode [data-mode="percussive"]');
  await percussive.focus();
  await page.keyboard.press('Enter');
  await expect(percussive).toHaveAttribute('aria-pressed', 'true');
  await expect(percussive).toBeFocused();
});

test('AC-15.1.16/2 — Touching or scrolling the main panel during playback stands the autoscroll down for the rest of that run, and the next Start restores it', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadTallPattern(page);

  // The swing slider lives in the Practice group, a tab at mobile width
  // (AC-15.1.7).
  await page.locator('.workbench-tab[data-tab="practice"]').click();
  await page.locator('[data-action="play"]').click();

  // Scroll the panel down to the slider, leaving the sounding Measure far
  // above the viewport — exactly where the autoscroll would fetch it back from.
  //
  // Focus first, THEN scroll: playback re-renders the panel on every sounding
  // event, and the app preserves the node of the control being operated, never
  // one merely being reached for (AC-15.1.16/1). Scrolling to an unfocused
  // slider races those renders.
  const slider = page.locator('.swing-slider').first();
  await slider.focus();
  await slider.scrollIntoViewIfNeeded();

  const sliderVisible = () =>
    slider.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    });

  // One touch of the panel is enough: the autoscroll stands down from here to
  // the end of the run.
  await page.keyboard.press('ArrowRight');

  // Hands off for six seconds — three times the grace window this replaced,
  // and long enough for a Pattern this tall to loop back to Measure 1 more
  // than once. Playback renders throughout, and the view does not move.
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500);
    expect(await sliderVisible(), `slider stays in view hands-off (${(i + 1) * 500}ms)`).toBe(true);
  }

  // The next Start is a fresh run, and a fresh run tracks again: the autoscroll
  // takes the view back to the sounding Measure, leaving the slider behind.
  await page.evaluate(() => window.__rm.handlers.onStop());
  await page.evaluate(() => window.__rm.handlers.onPlay());
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.swing-slider');
      const r = el.getBoundingClientRect();
      return r.top >= window.innerHeight || r.bottom <= 0;
    },
    null,
    { timeout: 10000 }
  );
});

test('AC-15.1.16/9 — A scroll of the main panel the app did not itself perform stands the autoscroll down, whatever gesture produced it and whether or not it raised a pointer or keyboard event', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadTallPattern(page);
  await page.locator('[data-action="play"]').click();

  /*
   * Wait until the panel is genuinely at rest, rather than for a fixed time:
   * the autoscroll scrolls smoothly, and a smooth scroll keeps animating toward
   * its target after the call that started it. A real gesture cancels one — an
   * assignment to `scrollTop` cannot, so a scroll set mid-animation is simply
   * overridden by the animation finishing, which is a fact about this test's
   * instrument and not about the criterion. Under parallel load the animation
   * landed after the fixed wait and the test failed on it.
   */
  const panelAtRest = async () => {
    for (let i = 0; i < 40; i++) {
      const before = await page.locator('.main-panel').evaluate((el) => el.scrollTop);
      await page.waitForTimeout(250);
      const after = await page.locator('.main-panel').evaluate((el) => el.scrollTop);
      if (before === after) return after;
    }
    throw new Error('the panel never stopped scrolling');
  };
  await panelAtRest();

  /*
   * Scroll with no input event of any kind — no pointer, no touch, no wheel,
   * no key. This is the case /2's listeners could not see: a finger drag raises
   * `pointerdown` before it scrolls, but momentum carrying on after the finger
   * lifts does not, and nor does whatever iOS does in a Home-Screen app, where
   * this was reported still standing. Setting `scrollTop` is the same thing
   * from the page's point of view: the view moved and no input said so.
   */
  const panel = page.locator('.main-panel');
  // Set and read in one evaluation, so `parked` is where the musician put the
  // view and never where the app afterwards dragged it back to. Reading it in a
  // second step made this test pass against the unfixed code: the autoscroll
  // yanked the view, the panel came to rest there, and the test then asserted
  // only that it stayed yanked.
  const parked = await panel.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  });
  expect(parked).toBeGreaterThan(0);

  // Four seconds of playback, and the view stays exactly where it was put.
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    expect(await panel.evaluate((el) => el.scrollTop), `offset held at ${(i + 1) * 500}ms`).toBe(parked);
  }
});

test('AC-15.1.16/3 — A control keeps its place on screen when an update changes the height of the content above it', async ({
  page,
}) => {
  // Tablet, library collapsed: a 900px panel, so the workbench sits under the
  // grid (AC-15.1.18/3) and a taller grid moves it.
  await page.setViewportSize(TABLET);
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadTallPattern(page);

  // The swing slider, on the Practice tab, scrolled to mid-panel and focused.
  await page.locator('.workbench-tab[data-tab="practice"]').click();
  const slider = page.locator('.swing-slider').first();
  await slider.scrollIntoViewIfNeeded();
  await slider.focus();
  const before = await slider.evaluate((el) => el.getBoundingClientRect().top);

  // Adding a Measure grows the grid above the workbench by a whole 12/8 bar —
  // and the slider neither moves on screen nor loses focus.
  await page.evaluate(() => window.__rm.handlers.onAddMeasure());
  await expect(page.locator('.measure')).toHaveCount(7);
  const after = await slider.evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  await expect(slider).toBeFocused();
});

test('AC-15.1.16/4 — A slider under a pointer drag keeps its DOM node across the updates it causes even when it never received focus, so a touch drag is not severed mid-gesture', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4', 'Touch Drag'));

  // iPadOS Safari moves no focus onto a range input on touch: hold the slider
  // by pointer only, and drive it with input events, never focusing it.
  await page.evaluate(() => {
    const slider = document.querySelector('.swing-slider');
    window.__heldSlider = slider;
    slider.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });

  for (const value of ['10', '20', '30']) {
    await page.evaluate((v) => {
      window.__heldSlider.value = v;
      window.__heldSlider.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    const alive = await page.evaluate(() => ({
      sameNode: document.querySelector('.swing-slider') === window.__heldSlider,
      connected: window.__heldSlider.isConnected,
      focusedElsewhere: document.activeElement === document.body,
    }));
    expect(alive.sameNode, `value ${value}`).toBe(true);
    expect(alive.connected, `value ${value}`).toBe(true);
    expect(alive.focusedElsewhere, `value ${value}`).toBe(true);
  }
  expect(await page.evaluate(() => window.__rm.getState().pattern.swingAmount)).toBe(30);

  // Released: the next rebuild may replace the node again.
  await page.evaluate(() => {
    window.__heldSlider.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
});

test('AC-15.1.16/5 — The height compensation anchors on the control under the pointer when nothing holds focus', async ({ page }) => {
  await page.setViewportSize(TABLET);
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadTallPattern(page);

  // The swing slider, on the Practice tab, scrolled to mid-panel and held by
  // pointer — never focused.
  await page.locator('.workbench-tab[data-tab="practice"]').click();
  const slider = page.locator('.swing-slider').first();
  await slider.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    // Shed whatever holds focus, so the anchor can only come from the
    // pointer-held control — the case under test.
    document.activeElement?.blur?.();
    const el = document.querySelector('.swing-slider');
    window.__heldSlider = el;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  const before = await slider.evaluate((el) => el.getBoundingClientRect().top);

  // Adding a Measure grows the grid above the workbench by a whole 12/8 bar —
  // and the held slider neither moves on screen nor was ever focused.
  await page.evaluate(() => window.__rm.handlers.onAddMeasure());
  await expect(page.locator('.measure')).toHaveCount(7);
  const after = await slider.evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test('AC-15.1.16/6 — A button held mid-tap keeps its DOM node across the renders playback streams, so a tap on Stop lands at any tempo', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.evaluate(async () => {
    window.__rm.handlers.onSetting({ countInEnabled: false });
    window.__rm.loadBlank('4/4', 'Fast Stop');
    window.__rm.handlers.onTempo(300);
    // Sound every Slot, so playback streams a render on every subdivision —
    // denser than the reported 200 BPM, the worst tap-eating rate on offer.
    const beats = window.__rm.getState().pattern.measures[0].beats;
    for (let b = 0; b < beats.length; b++) {
      for (let s = 0; s < beats[b].slots.length; s++) {
        if (!window.__rm.getState().pattern.measures[0].beats[b].slots[s].on) {
          await window.__rm.handlers.onSlotTap(0, b, s);
        }
      }
    }
  });
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });

  // Finger down on Stop, held across several playback renders. The browser
  // dispatches the click only if this exact node survives to finger-up.
  await page.evaluate(() => {
    const stop = document.querySelector('[data-action="stop"]');
    window.__heldStop = stop;
    stop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  const survived = await page.evaluate(() => ({
    sameNode: document.querySelector('[data-action="stop"]') === window.__heldStop,
    connected: window.__heldStop.isConnected,
  }));
  expect(survived.sameNode).toBe(true);
  expect(survived.connected).toBe(true);

  // Finger up: the tap completes on the surviving node and playback stops.
  await page.evaluate(() => {
    window.__heldStop.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    window.__heldStop.click();
  });
  expect(await page.evaluate(() => window.__rm.transport.isRunning)).toBe(false);
  await expect(page.locator('[data-action="play"]')).toBeVisible();
});

/**
 * A Melodic Pattern on a progression, every Slot of Beat 1 sounding and the
 * tempo up, played — so a render streams several times a second while the
 * entries below are typed into. Cycle mode on, so the Repeats box is live.
 */
async function playingWithEntries(page) {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.evaluate(() => {
    window.__rm.handlers.onSetting({ countInEnabled: false });
    window.__rm.loadBlank('4/4', 'Typed Entries');
  });
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await page.locator('.progression-picker').selectOption('I-IV-V');
  for (const slot of [0, 1, 2]) {
    await page.locator('.measure[data-measure="0"] .slot[data-beat="0"][data-slot="' + slot + '"] .slot-accent').click();
  }
  await page.evaluate(() => window.__rm.handlers.onTempo(300));
  await page.locator('.fill-cycle').click();
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });
}

/** Type `value` into `entry` a digit at a time, slowly enough that renders land between keystrokes. */
async function typeInto(entry, value) {
  await entry.click();
  await entry.press('Control+a');
  for (const character of value) {
    await entry.press(character);
    await entry.page().waitForTimeout(150);
  }
}

test('AC-15.1.16/8 — A number or text entry typed into but not yet committed keeps what is typed across the renders playback streams: a render writes its own value onto that entry only once the typing is committed or the entry is left: the Cycle fills Repeats count', async ({ page }) => {
  await playingWithEntries(page);
  const repeats = page.locator('.fill-cycle-repeats');
  await expect(repeats).toHaveValue('4');

  // Typed, and still standing several playback renders later — the reported bug
  // was the stored 4 being written back over it before `change` could fire.
  await typeInto(repeats, '2');
  await page.waitForTimeout(600);
  await expect(repeats).toHaveValue('2');

  // Leaving the entry commits it: the setting, and the cycle, take the count.
  await repeats.press('Tab');
  await expect(repeats).toHaveValue('2');
  expect(await page.evaluate(() => window.__rm.getState().settings.fillCycleRepeats)).toBe(2);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).fillCycleRepeats)
  ).toBe(2);
  await page.locator('[data-action="stop"]').click();
});

test('AC-15.1.16/8 — A number or text entry typed into but not yet committed keeps what is typed across the renders playback streams: a render writes its own value onto that entry only once the typing is committed or the entry is left: the Tempo entry, and the committed value written back once the entry is left', async ({ page }) => {
  await playingWithEntries(page);
  const tempo = page.locator('.tempo-entry');
  await expect(tempo).toHaveValue('300');

  // Three keystrokes, each with renders streaming between them.
  await typeInto(tempo, '120');
  await expect(tempo).toHaveValue('120');
  await tempo.press('Tab');
  expect(await page.evaluate(() => window.__rm.getState().pattern.tempo)).toBe(120);

  // The write-back itself is untouched: an entry left holding a value the app
  // refuses — over the maximum — is returned to what the state says, which is
  // the behaviour AC-7.1.1 relies on for a cleared name.
  await typeInto(tempo, '999');
  await tempo.press('Tab');
  await expect(tempo).toHaveValue('300');
  expect(await page.evaluate(() => window.__rm.getState().pattern.tempo)).toBe(300);
  await page.locator('[data-action="stop"]').click();
});

// --- AC-15.1.18: two panes on a wide panel, each scrolling on its own ------

/**
 * `count` plain 4/4 bars on Straight 8ths — the bar the thresholds are set
 * by — owned so nothing asks for a copy name.
 */
async function loadBars(page, count, tempo = 120) {
  await page.evaluate(
    ({ count, tempo }) => {
      const bar = () => ({
        timeSignature: '4/4',
        beats: Array.from({ length: 4 }, () => ({ recipe: 'straight-8ths', slots: [{ on: true }, { on: false }] })),
      });
      window.__rm.loadPattern(
        { id: 'p_bars', name: 'Bars', soundMode: 'percussive', tempo, tags: [], rating: 0, measures: Array.from({ length: count }, bar) },
        { owned: true }
      );
    },
    { count, tempo }
  );
  await expect(page.locator('.measure')).toHaveCount(count);
}
const rect = (page, selector) =>
  page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
const scrollOf = (page, selector) =>
  page.locator(selector).evaluate((el) => ({ top: el.scrollTop, overflow: el.scrollHeight - el.clientHeight }));

test('AC-15.1.18/1 — With the panel 1024px or wider the grid pane and the workbench pane sit side by side under the pinned bar, and the workbench is on screen without scrolling however long the Pattern is', async ({
  page,
}) => {
  // Short, so eight bars genuinely overflow the window.
  await page.setViewportSize({ width: 1400, height: 700 });
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadBars(page, 8);

  await expect(page.locator('.main-panel')).toHaveAttribute('data-layout', 'wide');
  const bar = await rect(page, '.main-top-bar');
  const pattern = await rect(page, '.pane-pattern');
  const workbench = await rect(page, '.pane-workbench');
  // Side by side, both starting under the bar.
  expect(workbench.left).toBeGreaterThanOrEqual(pattern.right - 1);
  expect(Math.abs(pattern.top - workbench.top)).toBeLessThanOrEqual(1);
  expect(pattern.top).toBeGreaterThanOrEqual(bar.bottom - 1);
  // The grid is taller than the window — the case the layout exists for.
  expect((await scrollOf(page, '.pane-pattern')).overflow).toBeGreaterThan(0);
  // And every tab's controls are on screen with nothing scrolled.
  await expect(page.locator('.workbench-tabs')).toBeInViewport();
  await page.locator('.workbench-tab[data-tab="practice"]').click();
  await expect(page.locator('.tempo-slider')).toBeInViewport();
  expect((await scrollOf(page, '.pane-workbench')).top).toBe(0);
  expect((await scrollOf(page, '.main-panel')).top).toBe(0);
});

test('AC-15.1.18/2 — The grid pane scrolls on its own: scrolled to the foot of an eight-Measure Pattern, the workbench has not moved and the main panel’s own scroll offset is still zero', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 700 });
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadBars(page, 8);
  await expect(page.locator('.main-panel')).toHaveAttribute('data-layout', 'wide');

  const before = await rect(page, '.workbench-tabs');
  const scrolled = await page.locator('.pane-pattern').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  });
  expect(scrolled).toBeGreaterThan(0);
  // The last Measure is now on screen and the first is not.
  await expect(page.locator('.measure').last()).toBeInViewport();
  await expect(page.locator('.measure').first()).not.toBeInViewport();
  // The workbench did not move, and the panel itself has nothing to scroll.
  const after = await rect(page, '.workbench-tabs');
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1);
  expect(await scrollOf(page, '.main-panel')).toEqual({ top: 0, overflow: 0 });
  expect((await scrollOf(page, '.pane-workbench')).top).toBe(0);
});

test('AC-15.1.18/3 — Below 1024px of panel width the workbench sits under the grid, tabbed, and the main panel scrolls as one', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadBars(page, 8);

  await expect(page.locator('.main-panel')).toHaveAttribute('data-layout', 'narrow');
  const pattern = await rect(page, '.pane-pattern');
  const workbench = await rect(page, '.pane-workbench');
  expect(workbench.top).toBeGreaterThanOrEqual(pattern.bottom - 1);
  expect(Math.abs(workbench.left - pattern.left)).toBeLessThanOrEqual(1);
  // Still tabbed: one group on screen.
  await expect(page.locator('.workbench-tabs')).toBeVisible();
  expect(await visibleGroups(page)).toEqual(['rhythm']);
  // One scroll for the lot: scrolling the panel carries the tab bar with it.
  const tabsBefore = (await rect(page, '.workbench-tabs')).top;
  const scrolled = await page.locator('.main-panel').evaluate((el) => {
    el.scrollTop = 120;
    return el.scrollTop;
  });
  expect(scrolled).toBe(120);
  expect((await rect(page, '.workbench-tabs')).top).toBeCloseTo(tabsBefore - 120, 0);
  expect((await scrollOf(page, '.pane-pattern')).overflow).toBe(0);
});

test('AC-15.1.18/4 — The split follows the panel’s width, not the viewport’s: opening the library beside a 1200px window drops the workbench under the grid, and collapsing it restores the panes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await loadBars(page, 4);
  const main = page.locator('.main-panel');

  // Library open: a 900px panel, one column.
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');
  await expect(main).toHaveAttribute('data-layout', 'narrow');
  let pattern = await rect(page, '.pane-pattern');
  let workbench = await rect(page, '.pane-workbench');
  expect(workbench.top).toBeGreaterThanOrEqual(pattern.bottom - 1);

  // Collapsed: the whole 1200px, two panes — and no resize event was fired.
  await page.locator('.library-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'collapsed');
  await expect(main).toHaveAttribute('data-layout', 'wide');
  pattern = await rect(page, '.pane-pattern');
  workbench = await rect(page, '.pane-workbench');
  expect(workbench.left).toBeGreaterThanOrEqual(pattern.right - 1);
  expect(Math.abs(pattern.top - workbench.top)).toBeLessThanOrEqual(1);

  // And back.
  await page.locator('.library-toggle').click();
  await expect(main).toHaveAttribute('data-layout', 'narrow');
  pattern = await rect(page, '.pane-pattern');
  workbench = await rect(page, '.pane-workbench');
  expect(workbench.top).toBeGreaterThanOrEqual(pattern.bottom - 1);
});

test('AC-15.1.18/5 — During playback in the two-pane layout the sounding Measure is scrolled into view within the grid pane and the workbench pane does not move', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 600 });
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadBars(page, 8, 240);
  await expect(page.locator('.main-panel')).toHaveAttribute('data-layout', 'wide');

  // A Measure that genuinely starts below the pane's foot.
  const offscreen = await page.evaluate(() => {
    const pane = document.querySelector('.pane-pattern').getBoundingClientRect();
    const found = [...document.querySelectorAll('.measure')].find((m) => m.getBoundingClientRect().top >= pane.bottom);
    return found ? Number(found.dataset.measure) : null;
  });
  expect(offscreen, 'expected at least one Measure below the pane').not.toBeNull();
  const tabsBefore = (await rect(page, '.workbench-tabs')).top;

  await page.locator('[data-action="play"]').click();
  await page.waitForFunction(
    (index) => {
      const pane = document.querySelector('.pane-pattern').getBoundingClientRect();
      const r = document.querySelector(`.measure[data-measure="${index}"]`).getBoundingClientRect();
      return r.top >= pane.top && r.bottom <= pane.bottom;
    },
    offscreen,
    { timeout: 20000 }
  );
  await page.locator('[data-action="stop"]').click();

  // The grid pane scrolled; nothing else did.
  expect((await scrollOf(page, '.pane-pattern')).top).toBeGreaterThan(0);
  expect((await scrollOf(page, '.main-panel')).top).toBe(0);
  expect((await scrollOf(page, '.pane-workbench')).top).toBe(0);
  expect((await rect(page, '.workbench-tabs')).top).toBeCloseTo(tabsBefore, 0);
});

// --- AC-15.1.19: Measures flow left to right and wrap by whole Measure -----

const measureTops = (page) =>
  page.locator('.measure').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
const measureLefts = (page) =>
  page.locator('.measure').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));

test('AC-15.1.19/1 — Where the grid is wide enough for several Measures at their preferred cell size, they sit on one row, left to right, in Pattern order', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadBars(page, 8);

  const tops = await measureTops(page);
  const lefts = await measureLefts(page);
  // Two plain bars fit the grid pane at this width: rows of two, four rows.
  expect(new Set(tops).size).toBe(4);
  for (let i = 0; i < 8; i += 2) {
    expect(tops[i + 1], `Measures ${i + 1} and ${i + 2} share a row`).toBe(tops[i]);
    expect(lefts[i + 1], `Measure ${i + 2} is to the right of ${i + 1}`).toBeGreaterThan(lefts[i]);
  }
  // Rows read down the page in Pattern order.
  for (let i = 2; i < 8; i += 2) expect(tops[i]).toBeGreaterThan(tops[i - 2]);
});

test('AC-15.1.19/2 — A Measure that does not fit the room left on a row starts the next row whole: no Measure is split across rows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadBars(page, 3);

  const tops = await measureTops(page);
  const lefts = await measureLefts(page);
  const widths = await page.locator('.measure').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  // Two on the first row; the third would not fit beside them, so it starts
  // the second row at the left edge — as wide as the first, its Beats on one
  // line, not squeezed into the room that was left.
  expect(tops[1]).toBe(tops[0]);
  expect(tops[2]).toBeGreaterThan(tops[0]);
  expect(lefts[2]).toBe(lefts[0]);
  expect(Math.abs(widths[2] - widths[0])).toBeLessThanOrEqual(1);
  const beatTops = await page
    .locator('.measure[data-measure="2"] .beat')
    .evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  expect(beatTops).toBe(1);
});

test('AC-15.1.19/3 — A Measure wider than the grid takes the whole row and wraps its Beats inside it, so at 390px the densest supported Pattern still stacks one Measure per row', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await page.evaluate(() => {
    const measure = () => ({
      timeSignature: '12/8',
      beats: Array.from({ length: 12 }, () => ({ recipe: 'straight-16ths', slots: [{ on: true }, { on: false }] })),
    });
    window.__rm.loadPattern(
      { id: 'p_dense', name: 'Densest', soundMode: 'percussive', tempo: 80, tags: [], rating: 0, measures: Array.from({ length: 8 }, measure) },
      { owned: true }
    );
  });
  await expect(page.locator('.measure')).toHaveCount(8);

  const { tops, widths, available, beatLines } = await page.evaluate(() => {
    const grid = document.querySelector('.grid');
    const pad = parseFloat(getComputedStyle(grid).paddingLeft);
    const measures = [...document.querySelectorAll('.measure')];
    return {
      tops: measures.map((m) => Math.round(m.getBoundingClientRect().top)),
      widths: measures.map((m) => Math.round(m.getBoundingClientRect().width)),
      available: Math.round(grid.getBoundingClientRect().width - 2 * pad),
      beatLines: new Set([...measures[0].querySelectorAll('.beat')].map((b) => Math.round(b.getBoundingClientRect().top))).size,
    };
  });
  expect(new Set(tops).size).toBe(8);
  for (const w of widths) expect(Math.abs(w - available)).toBeLessThanOrEqual(1);
  expect(beatLines).toBeGreaterThan(1);
});

test('AC-15.1.19/4 — The rows re-flow when the grid’s width changes: collapsing the library beside the grid can put on one row two Measures that were on separate rows before', async ({
  page,
}) => {
  // 1700: with the library's 300px column beside it the grid pane holds one
  // 516px bar per row, and without it two (a 1920px window holds two either
  // way, so it would prove nothing here).
  await page.setViewportSize({ width: 1700, height: 900 });
  await page.goto('/');
  await loadBars(page, 8);

  // With the library's column taken out of the grid pane, one bar per row.
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');
  expect(new Set(await measureTops(page)).size).toBe(8);

  // Collapsed, the pane has room for two — and re-flows without a reload.
  await page.locator('.library-toggle').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'collapsed');
  await expect.poll(async () => new Set(await measureTops(page)).size).toBe(4);

  // And back to one per row when the library returns.
  await page.locator('.library-toggle').click();
  await expect.poll(async () => new Set(await measureTops(page)).size).toBe(8);
});
