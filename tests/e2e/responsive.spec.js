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
  // The pitch strip sits below the play controls, and is present in the DOM at
  // both Sound Modes — hidden rather than removed in Percussive, so the order
  // itself never depends on the mode (AC-2.2.13). The family members area is last
  // and follows the same convention: always in the DOM, shown only at 768px and
  // wider and only when there are members (AC-11.2.5, which is where its
  // visibility is proved).
  // The chord strip and the harmony controls follow the same convention as the
  // pitch strip: always in the DOM, hidden unless they apply (US-2.6).
  const expected = [
    'HEADER.pattern-header',
    'SECTION[chords]',
    'DIV.grid',
    'SECTION[play]',
    'SECTION[recipe]',
    'SECTION[pitch]',
    'SECTION[harmony]',
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
  // The pitch strip at its widest: all twelve chromatic degrees. It wraps
  // within the panel rather than scrolling the page (US-2.2).
  await expect(page.locator('.degree')).toHaveCount(12);

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

test('AC-15.1.16/1 — The control being operated keeps focus across the update it causes', async ({
  page,
}) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4', 'Keeps Focus'));

  // The swing slider: two keyboard adjustments in a row, each re-rendering the
  // panel, without ever re-selecting the control.
  const slider = page.locator('.swing-slider').first();
  await slider.focus();
  const before = Number(await slider.inputValue());
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue(String(before + 1));
  await expect(slider).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue(String(before + 2));
  await expect(slider).toBeFocused();

  // The Sound select: the mode switch rebuilds the panel around it and brings
  // in the pitch strip, and the select stays under the musician's hands.
  const sound = page.locator('.sound-mode').first();
  await sound.focus();
  await sound.selectOption('melodic');
  await expect(sound).toHaveValue('melodic');
  await expect(sound).toBeFocused();
  await sound.selectOption('percussive');
  await expect(sound).toHaveValue('percussive');
  await expect(sound).toBeFocused();
});

test('AC-15.1.16/2 — During playback the autoscroll stands down while controls are in use and for two seconds after', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadTallPattern(page);

  // The swing slider lives in the Playback settings accordion, collapsed at
  // mobile width (AC-15.1.7).
  await page.locator('[data-section="playback-settings"] summary').click();
  await page.locator('[data-action="play"]').click();

  // Scroll the panel down to the slider, leaving the sounding Measure far
  // above the viewport — exactly where the autoscroll would fetch it back from.
  const slider = page.locator('.swing-slider').first();
  await slider.scrollIntoViewIfNeeded();
  await slider.focus();

  // Hands on: a nudge every 300ms for ~2.4s. Playback renders on every tick
  // throughout, and through all of it the slider stays on screen.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
    await page.waitForTimeout(300);
    const visible = await slider.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    });
    expect(visible, `slider stays in view while hands are on (nudge ${i + 1})`).toBe(true);
  }

  // Hands off: once the grace window passes, the autoscroll resumes and takes
  // the view back to the sounding Measure, leaving the slider behind.
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

test('AC-15.1.16/3 — A control keeps its place on screen when an update changes the height of the content above it', async ({
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadTallPattern(page);

  // The Sound select, inside the Edit accordion, scrolled to mid-panel.
  await page.locator('[data-section="edit"] summary').click();
  const sound = page.locator('.sound-mode').first();
  await sound.scrollIntoViewIfNeeded();
  await sound.focus();
  const before = await sound.evaluate((el) => el.getBoundingClientRect().top);

  // Switching to Melodic inserts the pitch strip above the editing controls —
  // and the select neither moves on screen nor loses focus.
  await sound.selectOption('melodic');
  await expect(page.locator('.pitch-strip')).toBeVisible();
  const after = await sound.evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
  await expect(sound).toBeFocused();
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
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadTallPattern(page);

  // The swing slider, inside the collapsed Playback settings accordion,
  // scrolled to mid-panel and held by pointer — never focused.
  await page.locator('[data-section="playback-settings"] summary').click();
  const slider = page.locator('.swing-slider').first();
  await slider.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    // The summary click above left focus behind; shed it, so the anchor can
    // only come from the pointer-held control — the case under test.
    document.activeElement?.blur?.();
    const el = document.querySelector('.swing-slider');
    window.__heldSlider = el;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  const before = await slider.evaluate((el) => el.getBoundingClientRect().top);

  // Switching to Melodic inserts the pitch strip above the playback settings —
  // and the held slider neither moves on screen nor was ever focused.
  await page.evaluate(() => window.__rm.handlers.onSoundMode('melodic'));
  await expect(page.locator('.pitch-strip')).toBeVisible();
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
