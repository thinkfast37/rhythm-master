import { test, expect } from '@playwright/test';

/*
 * AC-15.1.20 — One frame for every goal (research.md D-018, phase 2). The
 * pinned bar, the goal strip, the rhythm band and one work surface, under
 * every goal and at every width; the Playback layout under Practise a rhythm
 * and the Design layout elsewhere.
 *
 * Opens in Lab through playwright.config.js's storage state and moves between
 * goals through the handler, since which goal is open is the subject and the
 * goals screen itself is tests/e2e/goals.spec.js's.
 */
test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 900, height: 1000 },
  { width: 1400, height: 900 },
];
const chooseGoal = (page, id) => page.evaluate((g) => window.__rm.handlers.onGoal(g), id);
const rect = (page, selector) =>
  page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  });

/** Eight plain 4/4 bars, owned, tall enough to overflow a 700px window. */
async function loadBars(page, count = 8) {
  await page.evaluate((n) => {
    const bar = () => ({
      timeSignature: '4/4',
      beats: Array.from({ length: 4 }, () => ({ recipe: 'straight-8ths', slots: [{ on: true }, { on: false }] })),
    });
    window.__rm.loadPattern(
      { id: 'p_frame', name: 'Frame', soundMode: 'percussive', tempo: 120, tags: [], rating: 0, measures: Array.from({ length: n }, bar) },
      { owned: true }
    );
  }, count);
  await expect(page.locator('.measure')).toHaveCount(count);
}

test('AC-15.1.20/1 — The pinned bar holds, left to right, ‹ Goals, Library, Related, Play/Stop with the tempo entry and its ♩/♪ unit, and Prev/Next, the same under every goal and at every width; Related is a placeholder, disabled and saying so, until Share and tidy up lands', async ({ page }) => {
  await page.goto('/');
  const barOrder = () =>
    page.locator('.main-top-bar > *:not(.goal-strip)').evaluateAll((els) => els.map((e) => e.className.split(' ')[0]));
  for (const goal of ['lab', 'practise', 'build', 'share']) {
    await chooseGoal(page, goal);
    for (const size of WIDTHS) {
      await page.setViewportSize(size);
      const tag = `${goal} @ ${size.width}px`;
      expect(await barOrder(), tag).toEqual(['goals-button', 'library-toggle', 'related-button', 'controls', 'pattern-nav']);
      const bar = page.locator('.main-top-bar');
      await expect(bar.locator('> .goals-button[data-action="show-goals"]'), tag).toBeVisible();
      await expect(bar.locator('> .library-toggle'), tag).toBeVisible();
      await expect(bar.locator('> .related-button'), tag).toBeVisible();
      await expect(bar.locator('.play-controls .transport'), tag).toBeVisible();
      await expect(bar.locator('.play-controls .tempo-entry'), tag).toBeVisible();
      await expect(bar.locator('.play-controls [data-action="toggle-tempo-unit"]'), tag).toBeVisible();
      await expect(bar.locator('.pattern-nav [data-action="prev-pattern"]'), tag).toBeVisible();
      await expect(bar.locator('.pattern-nav [data-action="next-pattern"]'), tag).toBeVisible();
      // Left to right: each control starts no further left than the one before it
      // on its row, and Prev/Next end the bar.
      const lefts = await page
        .locator('.main-top-bar > *:not(.goal-strip)')
        .evaluateAll((els) => els.map((e) => ({ left: e.getBoundingClientRect().left, top: e.getBoundingClientRect().top })));
      for (let i = 1; i < lefts.length; i++) {
        if (lefts[i].top === lefts[i - 1].top) expect(lefts[i].left, `${tag} item ${i}`).toBeGreaterThan(lefts[i - 1].left);
        else expect(lefts[i].top, `${tag} item ${i} wraps below`).toBeGreaterThan(lefts[i - 1].top);
      }
      // No Practice | Composer switch in the bar's own row (AC-15.1.20): the
      // strip carries it where a goal has one.
      await expect(bar.locator('> .mode-switch'), tag).toHaveCount(0);
    }
  }
  // Related: there, disabled, and saying what it waits for.
  const related = page.locator('.main-top-bar > .related-button');
  await expect(related).toBeDisabled();
  await expect(related).toHaveAttribute('aria-disabled', 'true');
  expect(await related.getAttribute('title')).toContain('Share and tidy up');
  await expect(related).toHaveText('Related');
});

test('AC-15.1.20/2 — The goal strip under the pinned bar names the goal and holds its own quick controls: Practise a rhythm’s level, Give me one, Pick from the library, Click and Count-in; Lab’s Help toggle; and, on every goal but Practise a rhythm, the Practice | Composer switch until Play it in’s own screen lands', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  const strip = page.locator('.main-top-bar .goal-strip');
  const first = page.locator('.main-top-bar > .goals-button');

  await chooseGoal(page, 'practise');
  await expect(strip).toBeVisible();
  expect((await rect(page, '.goal-strip')).top).toBeGreaterThanOrEqual((await rect(page, '.main-top-bar > .goals-button')).bottom - 1);
  await expect(first).toBeVisible();
  await expect(strip.locator('.goal-name')).toHaveText('Practise a rhythm');
  await expect(strip.locator('.level-picker')).toBeVisible();
  await expect(strip.locator('[data-action="give-me-one"]')).toBeVisible();
  await expect(strip.locator('[data-action="pick-from-library"]')).toBeVisible();
  await expect(strip.locator('[data-action="toggle-metronome"]')).toBeVisible();
  await expect(strip.locator('[data-action="toggle-count-in"]')).toBeVisible();
  await expect(strip.locator('.mode-switch')).toHaveCount(0);
  await expect(strip.locator('[data-action="toggle-help"]')).toHaveCount(0);
  // The strip's toggles are the app's: one press turns the click on.
  const on = await page.evaluate(() => Boolean(window.__rm.getState().settings.metronomeEnabled));
  await strip.locator('[data-action="toggle-metronome"]').click();
  expect(await page.evaluate(() => Boolean(window.__rm.getState().settings.metronomeEnabled))).toBe(!on);

  await chooseGoal(page, 'lab');
  await expect(strip.locator('.goal-name')).toHaveText('Lab');
  await expect(strip.locator('[data-action="toggle-help"]')).toBeVisible();
  await expect(strip.locator('.mode-switch [data-mode="practice"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(strip.locator('.mode-switch [data-mode="composer"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(strip.locator('.level-picker')).toHaveCount(0);
  await expect(strip.locator('[data-action="toggle-metronome"]')).toHaveCount(0);

  for (const [id, title] of [
    ['build', 'Build a rhythm'],
    ['melodic', 'Make it melodic'],
    ['combine', 'Combine patterns'],
    ['share', 'Share and tidy up'],
  ]) {
    await chooseGoal(page, id);
    await expect(strip.locator('.goal-name'), id).toHaveText(title);
    await expect(strip.locator('.mode-switch'), id).toBeVisible();
    await expect(strip.locator('[data-action="toggle-help"]'), id).toHaveCount(0);
    await expect(strip.locator('.level-picker'), id).toHaveCount(0);
  }
});

test('AC-15.1.20/3 — The rhythm band holds the Pattern header, the chord strip, and the grid or sheet with the View control at its head — Grid | Sheet, with Note aids and Print / PDF while Sheet shows — and the brush line under it, across the panel’s full width under every goal', async ({ page }) => {
  await page.goto('/');
  for (const goal of ['lab', 'practise', 'build']) {
    await chooseGoal(page, goal);
    for (const size of WIDTHS) {
      await page.setViewportSize(size);
      const tag = `${goal} @ ${size.width}px`;
      const band = page.locator('.main-panel > .rhythm-band');
      const children = await band.locator('> *').evaluateAll((els) =>
        els.map((e) => (e.dataset.section ? `SECTION[${e.dataset.section}]` : e.className.split(' ')[0]))
      );
      expect(children, tag).toEqual(['pattern-header', 'SECTION[chords]', 'pattern-view']);
      await expect(band.locator('.pattern-view > .view-toggle'), tag).toBeVisible();
      await expect(band.locator('.view-toggle .view-button[data-view="grid"]'), tag).toBeVisible();
      await expect(band.locator('.view-toggle .view-button[data-view="sheet"]'), tag).toBeVisible();
      await expect(band.locator('.pattern-view > .grid'), tag).toBeVisible();
      await expect(band.locator('.pattern-view > .score'), tag).toBeHidden();
      await expect(band.locator('.view-toggle .aids-button'), tag).toBeHidden();
      await expect(band.locator('.view-toggle .print-button'), tag).toBeHidden();
      // Across the panel's full width: the band is as wide as the panel.
      const panel = await rect(page, '.main-panel');
      const bandBox = await rect(page, '.rhythm-band');
      expect(Math.abs(bandBox.width - panel.width), tag).toBeLessThanOrEqual(1);
    }
  }
  // Sheet: Print / PDF appears; Note aids on a Melodic Pattern.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.locator('.view-toggle .view-button[data-view="sheet"]').click();
  await expect(page.locator('.rhythm-band .pattern-view > .score')).toBeVisible();
  await expect(page.locator('.rhythm-band .pattern-view > .grid')).toBeHidden();
  await expect(page.locator('.rhythm-band .view-toggle .print-button')).toBeVisible();
  await page.evaluate(async () => {
    window.__rm.loadBlank('4/4');
    await window.__rm.handlers.onSoundMode('melodic');
  });
  await expect(page.locator('.rhythm-band .view-toggle .aids-button')).toBeVisible();
  // The brush line is under the grid in a making goal, and absent on the sheet.
  await page.locator('.view-toggle .view-button[data-view="grid"]').click();
  const brush = page.locator('.rhythm-band .pattern-view > .brush-hint');
  await expect(brush).toBeVisible();
  expect((await rect(page, '.rhythm-band .pattern-view > .brush-hint')).top).toBeGreaterThanOrEqual((await rect(page, '.rhythm-band .grid')).bottom - 1);
});

test('AC-15.1.20/4 — One work surface under the band holds what the goal is for — the tabbed workbench with Pattern actions and the family members under Lab and the making goals, the settings rail under Practise a rhythm, and the Composer’s panel in Composer mode — and nothing sits beside the band', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  const surface = page.locator('.main-panel > .work-surface');
  const besideNothing = async (tag) => {
    const band = await rect(page, '.rhythm-band');
    const sur = await rect(page, '.work-surface');
    expect(sur.top, tag).toBeGreaterThanOrEqual(band.bottom - 1);
    expect(Math.abs(sur.left - band.left), tag).toBeLessThanOrEqual(1);
    expect(Math.abs(sur.width - band.width), tag).toBeLessThanOrEqual(1);
  };

  // Lab: the workbench, tabs and all.
  await chooseGoal(page, 'lab');
  await expect(surface).toBeVisible();
  await expect(surface.locator('> .workbench-tabs')).toBeVisible();
  await expect(surface.locator('> details[data-section="actions"]')).toBeVisible();
  await expect(surface.locator('> section[data-section="family"]')).toBeAttached();
  await expect(surface.locator('.practice-panel')).toHaveCount(0);
  await besideNothing('lab');
  expect(await page.locator('.main-panel > *').evaluateAll((els) => els.map((e) => e.className.split(' ')[0]))).toEqual([
    'main-top-bar',
    'rhythm-band',
    'work-surface',
    'composer-panel',
  ]);

  // A making goal: the workbench as the goal names it.
  await chooseGoal(page, 'build');
  await expect(surface.locator('> .workbench-tabs')).toBeVisible();
  await expect(surface.locator('> details[data-section="actions"]')).toBeVisible();
  await besideNothing('build');

  // Practise a rhythm: the settings rail, no tab bar.
  await chooseGoal(page, 'practise');
  await expect(surface.locator('> .workbench-tabs')).toBeHidden();
  await expect(surface.locator('> [data-section="practice"].practice-panel')).toBeVisible();
  await expect(surface.locator('> details[data-section="actions"]')).toBeHidden();
  await besideNothing('practise');

  // Composer mode: the Composer's panel in place of the band and the surface.
  await chooseGoal(page, 'lab');
  await page.locator('.goal-strip .mode-switch [data-mode="composer"]').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'composer');
  await expect(page.locator('.main-panel > .composer-panel')).toBeVisible();
  await expect(page.locator('.main-panel > .rhythm-band')).toBeHidden();
  await expect(surface).toBeHidden();
  await page.locator('.goal-strip .mode-switch [data-mode="practice"]').click();
  await expect(page.locator('.main-panel > .rhythm-band')).toBeVisible();
  await expect(surface).toBeVisible();
});

test('AC-15.1.20/5 — The panel is marked with the layout in force: Playback under Practise a rhythm, where on a wide panel the band takes at least the height the rail does and the rail is capped; Design under every other goal, where on a wide panel the band is capped and the work surface takes the rest', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 700 });
  await page.goto('/');
  await page.locator('.library-toggle').click();
  await loadBars(page, 8);
  const main = page.locator('.main-panel');
  await expect(main).toHaveAttribute('data-layout', 'wide');

  // Design: Lab and every making goal.
  for (const goal of ['lab', 'build', 'melodic', 'combine', 'share']) {
    await chooseGoal(page, goal);
    await expect(main, goal).toHaveAttribute('data-frame', 'design');
  }
  await chooseGoal(page, 'lab');
  const panel = await rect(page, '.main-panel');
  let band = await rect(page, '.rhythm-band');
  let surface = await rect(page, '.work-surface');
  // The band is capped — eight bars want more than half the window — and the
  // surface takes the rest, down to the panel's foot.
  expect(band.height).toBeLessThanOrEqual(panel.height / 2 + 1);
  expect(band.height).toBeGreaterThan(100);
  expect(surface.top).toBeGreaterThanOrEqual(band.bottom - 1);
  expect(Math.abs(surface.bottom - panel.bottom)).toBeLessThanOrEqual(1);
  expect(surface.height).toBeGreaterThan(band.height / 2);

  // Playback: Practise a rhythm. The rail is capped and the music gets the rest.
  await chooseGoal(page, 'practise');
  await expect(main).toHaveAttribute('data-frame', 'playback');
  band = await rect(page, '.rhythm-band');
  surface = await rect(page, '.work-surface');
  expect(surface.height).toBeLessThanOrEqual(panel.height * 0.34 + 1);
  expect(band.height).toBeGreaterThanOrEqual(surface.height);
  expect(surface.top).toBeGreaterThanOrEqual(band.bottom - 1);
  expect(Math.abs(surface.bottom - panel.bottom)).toBeLessThanOrEqual(1);
  // The rail is still reachable in full: it scrolls on its own where it is capped.
  const railOverflow = await page.locator('.work-surface').evaluate((el) => el.scrollHeight - el.clientHeight);
  if (railOverflow > 0) expect(await page.locator('.work-surface').evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');

  // On a narrow panel the mark stays and neither cap applies: one scroll.
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect(main).toHaveAttribute('data-layout', 'narrow');
  await expect(main).toHaveAttribute('data-frame', 'playback');
  expect(await page.locator('.work-surface').evaluate((el) => getComputedStyle(el).overflowY)).toBe('visible');
  await chooseGoal(page, 'lab');
  await expect(main).toHaveAttribute('data-frame', 'design');
  expect(await page.locator('.rhythm-band').evaluate((el) => getComputedStyle(el).overflowY)).toBe('visible');
});
