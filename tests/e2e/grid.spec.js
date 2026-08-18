import { test, expect } from '@playwright/test';

/*
 * No storage reset here on purpose: Playwright gives each test its own browser
 * context, so localStorage already starts empty. An addInitScript clear would
 * re-run on every navigation and wipe the store mid-test, which would make the
 * auto-save-survives-reload check unfalsifiable.
 */

test('AC-1.1.1 — the app opens with a Pattern in the grid, not an empty page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.measure')).not.toHaveCount(0);
  await expect(page.locator('.slot').first()).toBeVisible();
});

test('AC-1.1.3 — 8-Measure cap disables +Measure', async ({ page }) => {
  await page.goto('/');
  const add = page.locator('[data-action="add-measure"]');

  // Seven Measures: one short of the cap, so the control is still live.
  await page.evaluate(() => {
    const base = window.__rm.getState().pattern;
    window.__rm.loadPattern(
      {
        ...structuredClone(base),
        id: 'p_seven',
        name: 'Seven',
        measures: Array.from({ length: 7 }, () => structuredClone(base.measures[0])),
      },
      { owned: true }
    );
  });
  await expect(page.locator('.measure')).toHaveCount(7);
  await expect(add).toBeEnabled();

  // Taking it to the cap disables it — proving the disable is the cap, not the control.
  await add.click();
  await expect(page.locator('.measure')).toHaveCount(8);
  await expect(add).toBeDisabled();
});

/**
 * A Pattern of `count` Measures, each carrying the meters given, loaded into the
 * editor. Used by the US-1.4 and US-1.1 picker tests below, which all need more
 * than the one Measure a fresh Pattern opens with.
 */
async function loadMeasures(page, meters) {
  await page.evaluate((list) => {
    // From a blank 4/4, not from whatever the app opened with: the app opens on a
    // shipped Pattern, which is neither 4/4 nor editable without the naming prompt
    // (US-7.3). `loadBlank` hands back an owned Pattern, so the picker opens directly.
    const base = window.__rm.loadBlank('4/4');
    window.__rm.loadPattern(
      {
        ...structuredClone(base),
        id: 'p_meters',
        name: 'Meters',
        measures: list.map(() => structuredClone(base.measures[0])),
      },
      { owned: true }
    );
  }, meters);
  for (const [i, ts] of meters.entries()) {
    if (ts === '4/4') continue;
    await page.locator(`[data-action="change-time-signature"][data-measure="${i}"]`).click();
    await page.locator(`.dialog-button[data-value="${ts}"]`).click();
    // Measure 1 in a multi-Measure Pattern asks whether to apply throughout (AC-1.1.5).
    const scope = page.locator('.dialog-button[data-value="one"]');
    if (await scope.isVisible().catch(() => false)) await scope.click();
  }
  await expect(page.locator('.measure')).toHaveCount(meters.length);
}


/**
 * Give a Beat a Recipe through the strip: arm the chip, tap the Beat. Replaces
 * the single `.recipe-picker` dropdown, which only ever reached Measure 1 Beat 1.
 */
async function applyRecipe(page, recipeId, measure = 0, beat = 0) {
  const chip = page.locator(`.recipe-chip[data-recipe="${recipeId}"]`);
  await chip.click();
  await page.locator(`.measure[data-measure="${measure}"] .beat[data-beat="${beat}"]`).click();
  // Disarm before returning, unless a clear-confirmation is waiting (AC-1.3.7,
  // AC-1.3.8) — that dialog is the caller's to answer. An armed Recipe otherwise
  // hijacks a tap in the grid (AC-1.3.11/2), so a caller that goes on to click a
  // Slot would paint a Recipe instead of cycling an accent. That the arming
  // *persists* until dismissed is proved separately, by AC-1.3.11/4.
  if (!(await page.locator('.dialog').isVisible().catch(() => false))) await chip.click();
}

test('AC-1.4.1 — Time Signature label is itself the picker control: every Measure shows its own current Time Signature', async ({
  page,
}) => {
  await page.goto('/');
  await loadMeasures(page, ['4/4', '3/4', '7/8']);

  const measures = await page.locator('.measure').all();
  expect(measures).toHaveLength(3);
  for (const measure of measures) {
    const ts = await measure.getAttribute('data-time-signature');
    // The label is that Measure's own meter, not the Pattern's or its neighbour's.
    await expect(measure.locator('.measure-meter')).toHaveText(ts);
  }
  expect(
    await page.locator('.measure').evaluateAll((els) => els.map((e) => e.dataset.timeSignature))
  ).toEqual(['4/4', '3/4', '7/8']);
});

test('AC-1.4.1 — Time Signature label is itself the picker control: tapping a Measure’s label opens that Measure’s picker', async ({
  page,
}) => {
  await page.goto('/');
  await loadMeasures(page, ['4/4', '3/4', '7/8']);

  // The label itself is the control — a button, not a caption sat beside one.
  const label = page.locator('[data-action="change-time-signature"][data-measure="1"]');
  await expect(label).toHaveClass(/measure-meter/);
  await expect(page.locator('.dialog')).toHaveCount(0);

  await label.click();
  // And the picker it opens is that Measure's: it names Measure 2, not Measure 1.
  await expect(page.locator('.dialog-message')).toHaveText(/Measure 2/);
});

test('AC-1.4.2 — Picker offers exactly the 11 supported values', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('[data-action="change-time-signature"][data-measure="0"]').click();

  const offered = await page
    .locator('.dialog-button')
    .evaluateAll((els) => els.map((e) => e.dataset.value));
  // Cancel is a way out of the picker, not a Time Signature it offers.
  expect(offered.filter((v) => v !== 'null')).toEqual([
    '1/4', '2/4', '3/4', '4/4', '5/4', '6/4', '7/4', '6/8', '7/8', '9/8', '12/8',
  ]);
  // 1/4 specifically, so a single-beat drill cell is a valid Pattern in its own right.
  expect(offered).toContain('1/4');
  // No free-text entry: the picker is a closed set of buttons.
  await expect(page.locator('.dialog input, .dialog textarea')).toHaveCount(0);
});

test('AC-1.2.2 — every Measure renders exactly its numerator in Beats', async ({ page }) => {
  await page.goto('/');
  for (const measure of await page.locator('.measure').all()) {
    const ts = await measure.getAttribute('data-time-signature');
    await expect(measure.locator('.beat')).toHaveCount(Number(ts.split('/')[0]));
  }
});

test('AC-3.1.1 — tapping an off Slot turns it on at its computed metric default', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  // Beat 1 Slot 1 of a x/4 Measure is Strong; Beat 2 Slot 1 is Weak.
  const beat1 = page.locator('.slot[data-measure="0"][data-beat="0"][data-slot="0"]');
  const beat2 = page.locator('.slot[data-measure="0"][data-beat="1"][data-slot="0"]');
  await expect(beat1).toHaveAttribute('data-accent', '0');

  await beat1.click();
  await expect(beat1).toHaveAttribute('data-accent', '3');
  await beat2.click();
  await expect(beat2).toHaveAttribute('data-accent', '1');
});

test('AC-3.1.11 — tapping cycles the accent and eventually switches the Slot off', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  const slot = page.locator('.slot[data-measure="0"][data-beat="0"][data-slot="0"]');
  const seen = [];
  for (let i = 0; i < 4; i++) {
    await slot.click();
    seen.push(await slot.getAttribute('data-accent'));
  }
  expect(seen).toEqual(['3', '1', '2', '0']);
});

test('FR-012 — accent carries a size channel as well as a colour', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  const slot = page.locator('.slot[data-measure="0"][data-beat="0"][data-slot="0"]');
  const widthAt = async () => slot.locator('.slot-fill').evaluate((el) => el.style.width);

  // Bar width, not fill height (D-005, amended 2026-08-17). A fill growing up
  // the cell crossed the counting syllable's band; a bar pinned to the bottom
  // edge cannot reach it.
  expect(await widthAt()).toBe('0%');
  await slot.click(); // Strong
  expect(await widthAt()).toBe('100%');
  await slot.click(); // Weak
  expect(await widthAt()).toBe('33%');
  await slot.click(); // Medium
  expect(await widthAt()).toBe('67%');

  // And the bar stays clear of the text at every level, which is the whole
  // point of moving it: no Accent Level may put a colour boundary through the
  // syllable's ink.
  const clearance = await slot.evaluate((el) => {
    const bar = el.querySelector('.slot-fill').getBoundingClientRect();
    const label = el.querySelector('.slot-label');
    const cs = getComputedStyle(label);
    const box = label.getBoundingClientRect();
    const fs = parseFloat(cs.fontSize);
    const centre = box.top + box.height / 2;
    return bar.top - (centre + fs * 0.62); // bar top minus the deepest descender
  });
  expect(clearance).toBeGreaterThan(0);
});

test('AC-5.6.4 — the grid labels Slots in the selected counting system', async ({ page }) => {
  await page.goto('/');
  // Read the generated syllable, which every Slot carries whether or not it
  // sounds. A silent Slot displays a dot in its place (AC-3.1.17/1), and what
  // this AC is about is which vocabulary the labels come from.
  const first = page.locator('.beat[data-recipe="straight-16ths"] .slot-label');
  if ((await first.count()) >= 4) {
    await expect(first.nth(0)).toHaveAttribute('data-syllable', 'ta');
    await expect(first.nth(1)).toHaveAttribute('data-syllable', 'ka');
  }

  await page.locator('.counting-picker').selectOption('one-e-and-a');
  const relabelled = page.locator('.beat[data-recipe="straight-16ths"] .slot-label');
  await expect(relabelled.nth(0)).toHaveAttribute('data-syllable', '1');
  await expect(relabelled.nth(1)).toHaveAttribute('data-syllable', 'e');

  // And a Slot that sounds shows that syllable rather than the dot.
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.evaluate(async () => { await window.__rm.handlers.onSlotTap(0, 0, 0); });
  const sounding = page.locator('.slot[data-beat="0"][data-slot="0"] .slot-label');
  await expect(sounding).toHaveText('1');
});

test("AC-5.6.12 — 1-e-&-a scheme, the leading digit is the Beat's own number", async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.counting-picker').selectOption('one-e-and-a');

  for (let beat = 0; beat < 4; beat++) {
    const firstLabel = page.locator(`.beat[data-beat="${beat}"] .slot-label`).first();
    await expect(firstLabel).toHaveAttribute('data-syllable', String(beat + 1));
  }
});

test('AC-1.3.4 — Recipes applicable to a quarter-note Beat: a mixed-feel Recipe renders its two groups with different feels', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  await applyRecipe(page, 'straight-triplet-split');

  const beat = page.locator('.beat[data-measure]').first().or(page.locator('.beat').first());
  await expect(page.locator('.beat[data-recipe="straight-triplet-split"]')).toHaveCount(1);
  const groups = page.locator('.beat[data-recipe="straight-triplet-split"] .group');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toHaveAttribute('data-feel', 'straight');
  await expect(groups.nth(1)).toHaveAttribute('data-feel', 'triplet');
  await expect(beat).toBeVisible();
});

test('AC-5.6.2 — a mixed-feel Pattern counts by number whatever the preference', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  await page.locator('.counting-picker').selectOption('takadimi');
  await applyRecipe(page, 'triplet-straight-split');

  const labels = page.locator('.beat[data-recipe="triplet-straight-split"] .slot-label');
  await expect(labels.nth(0)).toHaveAttribute('data-syllable', '1');
  await expect(labels.nth(4)).toHaveAttribute('data-syllable', '5');
  await expect(page.locator('[data-forced-numbered]')).toBeVisible();
  // The stored preference is untouched (AC-5.6.3).
  await expect(page.locator('.counting-picker')).toHaveValue('takadimi');
});

test('AC-1.3.7 — changing a Recipe on a Beat with notes asks first', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  await page.locator('.slot[data-measure="0"][data-beat="0"][data-slot="0"]').click();
  await applyRecipe(page, 'triplet-8ths');

  await expect(page.locator('.dialog-message')).toContainText('will clear 1 note');
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  // Cancelling keeps the Recipe and the note.
  await expect(page.locator('.beat[data-beat="0"]').first()).toHaveAttribute(
    'data-recipe',
    'straight-16ths'
  );
});

test('AC-1.3.8 — growing a Recipe asks too, because it also clears the Beat', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  await applyRecipe(page, 'straight-8ths');
  await page.locator('.slot[data-measure="0"][data-beat="0"][data-slot="0"]').click();
  await applyRecipe(page, 'straight-16ths');

  await expect(page.locator('.dialog-message')).toContainText('will clear 1 note');
});

test('AC-1.3.10 — changing a Recipe on an empty Beat does not ask', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  await applyRecipe(page, 'triplet-8ths');
  await expect(page.locator('.dialog-message')).toHaveCount(0);
  await expect(page.locator('.beat[data-beat="0"]').first()).toHaveAttribute(
    'data-recipe',
    'triplet-8ths'
  );
});

test('AC-7.3.1 — editing a shipped Pattern asks for a name before the edit applies', async ({ page }) => {
  await page.goto('/');
  // The app opens on a shipped Pattern when nothing is owned.
  const owned = await page.evaluate(() => window.__rm.getState().isOwned);
  expect(owned).toBe(false);

  await page.locator('.slot').first().click();
  await expect(page.locator('.dialog-message')).toContainText('built-in pattern');

  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  // Cancelling discards the edit entirely.
  await expect(page.locator('.slot').first()).toHaveAttribute('data-accent', /^[0-3]$/);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
});

test('AC-7.3.2 — naming the copy applies the edit to the copy, not the original', async ({ page }) => {
  await page.goto('/');
  const originalName = await page.evaluate(() => window.__rm.getState().pattern.name);

  await page.locator('.slot').first().click();
  await page.locator('.dialog-input').fill('My Version');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();

  const after = await page.evaluate(() => {
    const s = window.__rm.getState();
    return { name: s.pattern.name, owned: s.isOwned, stored: window.__rm.patternStore.loadAll().length };
  });
  expect(after.name).toBe('My Version');
  expect(after.owned).toBe(true);
  expect(after.stored).toBe(1);

  // The shipped original is untouched and still in the library.
  const shippedIntact = await page.evaluate(
    (n) => window.__rm.seedStore.loadAll().some((p) => p.name === n),
    originalName
  );
  expect(shippedIntact).toBe(true);
});

test('AC-7.2.1 — edits to an owned Pattern survive a reload with no save action', async ({ page }) => {
  await page.goto('/');
  await page.locator('.slot').first().click();
  await page.locator('.dialog-input').fill('Autosaved');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();

  // Slot 2 of Beat 1 — present whatever meter the shipped Pattern uses, and
  // Weak by the within-Beat rule.
  await page.locator('.slot[data-measure="0"][data-beat="0"][data-slot="1"]').click();

  await page.reload();
  const state = await page.evaluate(() => {
    const s = window.__rm.getState();
    return { name: s.pattern.name, owned: s.isOwned };
  });
  expect(state.name).toBe('Autosaved');
  expect(state.owned).toBe(true);
  await expect(
    page.locator('.slot[data-measure="0"][data-beat="0"][data-slot="1"]')
  ).toHaveAttribute('data-accent', '1');
});

test('AC-15.1.10 — Grid remains usable for the largest supported Pattern on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  // 8 Measures of 12/8 at Straight 16ths — 192 Slots.
  await page.evaluate(() => {
    const measure = {
      timeSignature: '12/8',
      beats: Array.from({ length: 12 }, () => ({
        recipe: 'straight-16ths',
        slots: [{ on: true }, { on: false }],
      })),
    };
    window.__rm.loadPattern(
      {
        id: 'p_dense',
        name: 'Densest',
        soundMode: 'percussive',
        tempo: 80,
        tags: [],
        rating: 0,
        measures: Array.from({ length: 8 }, () => structuredClone(measure)),
      },
      { owned: true }
    );
  });

  await expect(page.locator('.measure')).toHaveCount(8);
  await expect(page.locator('.slot')).toHaveCount(192);

  // One Measure per row: each row starts at a distinct vertical offset.
  const tops = await page.locator('.measure').evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().top))
  );
  expect(new Set(tops).size).toBe(8);

  // Nothing scrolls sideways — not the body, not the grid.
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    grid: (() => {
      const g = document.querySelector('.grid');
      return g.scrollWidth - g.clientWidth;
    })(),
  }));
  expect(overflow.body).toBeLessThanOrEqual(0);
  expect(overflow.grid).toBeLessThanOrEqual(0);

  // Every Slot stays tappable.
  const widths = await page.locator('.slot').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().width)
  );
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(24);
});

test('AC-15.1.1 — the layout adapts across desktop, tablet, and phone', async ({ page }) => {
  for (const size of [
    { width: 1280, height: 800 },
    { width: 900, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.locator('.measure').first()).toBeVisible();
    const bodyOverflow = await page.evaluate(
      () => document.body.scrollWidth - document.body.clientWidth
    );
    expect(bodyOverflow, `${size.width}px`).toBeLessThanOrEqual(0);
  }
});

/* --- AC-15.1.14: the widths a wrapped Measure comes out at ----------------- */

/**
 * A 4/4 Measure of Straight 16ths — the reported case. Sixteen Slots is more
 * than a 390px phone fits on one line, so this is the Pattern that wraps.
 */
const FOUR_FOUR = {
  id: 'p_wrap',
  name: 'Wrapping',
  soundMode: 'percussive',
  tempo: 80,
  tags: [],
  rating: 0,
  measures: [
    {
      timeSignature: '4/4',
      beats: Array.from({ length: 4 }, () => ({
        recipe: 'straight-16ths',
        slots: [{ on: true }, { on: false }, { on: false }, { on: false }],
      })),
    },
  ],
};

/** The AC-15.1.10 worst case: 8 Measures of 12/8 at Straight 16ths, 192 Slots. */
const DENSEST = {
  id: 'p_densest',
  name: 'Densest',
  soundMode: 'percussive',
  tempo: 80,
  tags: [],
  rating: 0,
  measures: Array.from({ length: 8 }, () => ({
    timeSignature: '12/8',
    beats: Array.from({ length: 12 }, () => ({
      recipe: 'straight-16ths',
      slots: [{ on: true }, { on: false }],
    })),
  })),
};

/**
 * How far apart the widest and narrowest Beat are.
 *
 * Not exact equality: `1fr` tracks divide a fractional container width, so 12
 * Beats across 802px come out 61.328px and 61.344px. A sixtieth of a pixel is
 * the same width; anything a musician could see is a whole one.
 */
const spread = (widths) => Math.max(...widths) - Math.min(...widths);

/** Beat geometry for one Measure: widths, and the lines they fall on. */
async function beatLayout(page, measureIndex = 0) {
  return page.evaluate((index) => {
    const measure = document.querySelectorAll('.measure')[index];
    const beats = [...measure.querySelectorAll('.beat')].map((b) => {
      const r = b.getBoundingClientRect();
      return { width: Math.round(r.width * 100) / 100, top: Math.round(r.top) };
    });
    const beatsEl = measure.querySelector('.beats');
    const lines = new Map();
    for (const b of beats) lines.set(b.top, (lines.get(b.top) ?? 0) + 1);
    return {
      widths: beats.map((b) => b.width),
      perLine: [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n),
      // The container's own overflow, which `overflow-x: hidden` further up
      // would otherwise CLIP rather than scroll — a silent way to lose Beats.
      beatsOverflow: beatsEl.scrollWidth - beatsEl.clientWidth,
    };
  }, measureIndex);
}

test('AC-15.1.14/1 — Every Beat in a Measure is the same width as every other Beat in it, on its own line and across lines', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate((p) => window.__rm.loadPattern(p, { owned: true }), FOUR_FOUR);

  const wrapped = await beatLayout(page);
  expect(wrapped.perLine.length).toBeGreaterThan(1); // it does wrap at 390px
  expect(spread(wrapped.widths)).toBeLessThan(1);

  // And the shared width holds when the Beats are subdivided differently: a
  // 2-Slot Beat and a 4-Slot Beat sound the same duration, so they are the same
  // width and it is their Slots that differ.
  await page.evaluate(() => {
    const four = { recipe: 'straight-16ths', slots: [{ on: true }, {}, {}, {}] };
    const two = { recipe: 'straight-8ths', slots: [{ on: true }, {}] };
    window.__rm.loadPattern(
      {
        id: 'p_mixed',
        name: 'Mixed',
        soundMode: 'percussive',
        tempo: 80,
        tags: [],
        rating: 0,
        measures: [
          {
            timeSignature: '4/4',
            beats: [
              structuredClone(four),
              structuredClone(two),
              structuredClone(four),
              structuredClone(two),
            ],
          },
        ],
      },
      { owned: true }
    );
  });

  const mixed = await beatLayout(page);
  expect(spread(mixed.widths)).toBeLessThan(1);

  // The Slots are what absorb the difference: a 2-Slot Beat's Slots are wider.
  const slotWidths = await page.evaluate(() =>
    [...document.querySelectorAll('.measure .beat')].map((beat) =>
      Math.round(beat.querySelector('.slot').getBoundingClientRect().width)
    )
  );
  expect(slotWidths[1]).toBeGreaterThan(slotWidths[0]);
});

test('AC-15.1.14/2 — No Beat is narrower than its own Slots need at the 24px minimum, so the grid still never scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate((p) => window.__rm.loadPattern(p, { owned: true }), DENSEST);
  await expect(page.locator('.slot')).toHaveCount(192);

  const widths = await page
    .locator('.slot')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(24);

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    grid: (() => {
      const g = document.querySelector('.grid');
      return g.scrollWidth - g.clientWidth;
    })(),
    // Every Measure's Beat container, since a clipped one reports no page
    // overflow at all while hiding half the Measure.
    beats: Math.max(
      ...[...document.querySelectorAll('.beats')].map((b) => b.scrollWidth - b.clientWidth)
    ),
  }));
  expect(overflow.body).toBeLessThanOrEqual(0);
  expect(overflow.grid).toBeLessThanOrEqual(0);
  expect(overflow.beats).toBeLessThanOrEqual(0);
});

test('AC-15.1.14/3 — Beats divide evenly between lines: four Beats where three fit lay out two and two, never three and one', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate((p) => window.__rm.loadPattern(p, { owned: true }), FOUR_FOUR);

  const { perLine, widths, beatsOverflow } = await beatLayout(page);
  expect(perLine).toEqual([2, 2]);
  expect(spread(widths)).toBeLessThan(1);
  expect(beatsOverflow).toBeLessThanOrEqual(0);

  // Twelve Beats at the same width divide three ways, not five-five-two.
  await page.evaluate((p) => window.__rm.loadPattern(p, { owned: true }), DENSEST);
  const dense = await beatLayout(page);
  expect(new Set(dense.perLine).size).toBe(1); // every line equally full
  expect(dense.perLine.length).toBeGreaterThan(1);
  expect(dense.perLine.reduce((a, b) => a + b, 0)).toBe(12);
});

test('AC-15.1.14/4 — Where every Beat fits one line, they occupy that one line and still share the width', async ({
  page,
}) => {
  for (const width of [1400, 900]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.evaluate((p) => window.__rm.loadPattern(p, { owned: true }), FOUR_FOUR);

    const { perLine, widths } = await beatLayout(page);
    expect(perLine, `${width}px`).toEqual([4]);
    expect(spread(widths), `${width}px`).toBeLessThan(1);
  }
});

test('AC-15.1.14/5 — The layout re-balances when the width available to the grid changes', async ({
  page,
}) => {
  // Laid out for a desktop, then carried to a phone.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.evaluate((p) => window.__rm.loadPattern(p, { owned: true }), FOUR_FOUR);
  expect((await beatLayout(page)).perLine).toEqual([4]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await beatLayout(page)).perLine.join(',')).toBe('2,2');
  expect((await beatLayout(page)).beatsOverflow).toBeLessThanOrEqual(0);

  // And back, so the balance is not a one-way trip.
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect.poll(async () => (await beatLayout(page)).perLine.join(',')).toBe('4');

  // The library taking or giving back its column changes the grid's width
  // without resizing the window at all.
  await page.evaluate((p) => window.__rm.loadPattern(p, { owned: true }), DENSEST);
  const collapsed = await beatLayout(page);
  await page.locator('.library-toggle').click();
  await expect.poll(async () => (await beatLayout(page)).beatsOverflow).toBeLessThanOrEqual(0);

  const reopened = await beatLayout(page);
  expect(reopened.widths[0]).not.toBe(collapsed.widths[0]);
  expect(spread(reopened.widths)).toBeLessThan(1);
});

/* --- a silent Slot recedes (AC-3.1.17) ------------------------------------ */

/** A 4/4 Measure on Straight 16ths with Slot 1 of Beat 1 sounding and the rest off. */
async function mixedMeasure(page, recipe = 'straight-16ths') {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/');
  await page.evaluate(async ([r]) => {
    const { handlers: h } = window.__rm;
    window.__rm.loadBlank('4/4');
    for (let b = 0; b < 4; b++) await h.onRecipe(r, 0, b);
    await h.onSlotTap(0, 0, 0);
  }, [recipe]);
  await page.locator('.library-toggle').click();
  await expect(page.locator('.slot.accent-off').first()).toBeVisible();
}

const labelStyle = (page, selector) =>
  page.evaluate((sel) => {
    const cs = getComputedStyle(document.querySelector(sel));
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const [r, g, b] = cs.color.match(/[\d.]+/g).slice(0, 3).map(Number);
    return {
      size: parseFloat(cs.fontSize),
      weight: Number(cs.fontWeight),
      luminance: 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b),
    };
  }, selector);

test("AC-3.1.17/1 — A silent Slot shows a dot in place of its counting syllable, so a cell either carries a syllable or does not, rather than carrying the same syllable at two weights", async ({ page }) => {
  await mixedMeasure(page);

  const sounding = page.locator('.slot:not(.accent-off) .slot-label').first();
  const silent = page.locator('.slot.accent-off .slot-label').first();

  // The sounding Slot shows its syllable; the silent one shows a dot instead.
  await expect(sounding).toHaveText(await sounding.getAttribute('data-syllable'));
  await expect(silent).toHaveText('\u00b7');
  expect(await silent.getAttribute('data-syllable')).not.toBe('\u00b7');

  // Turning it on puts the syllable back — the dot is a rendering of state, not
  // a property of the Slot.
  await page.evaluate(async () => { await window.__rm.handlers.onSlotTap(0, 0, 1); });
  const wasSilent = page.locator('.slot[data-beat="0"][data-slot="1"] .slot-label');
  await expect(wasSilent).toHaveText(await wasSilent.getAttribute('data-syllable'));
});

test("AC-3.1.17/2 — That dot is dimmer than a sounding Slot's syllable, so the distinction survives a reader whose browser clamps small sizes to a minimum", async ({ page }) => {
  await mixedMeasure(page);
  const sounding = await labelStyle(page, '.slot:not(.accent-off) .slot-label');
  const silent = await labelStyle(page, '.slot.accent-off .slot-label');
  expect(sounding.luminance).toBeGreaterThan(silent.luminance * 1.5);

  // It must hold with size and weight forced equal, which is the state a
  // minimum-font-size setting and a substituted typeface produce together.
  const flattened = await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '.slot-label{font-size:16px !important;font-weight:400 !important}';
    document.head.appendChild(style);
    void document.body.offsetHeight;
    const c = (sel) => getComputedStyle(document.querySelector(sel)).color;
    const out = {
      sounding: c('.slot:not(.accent-off) .slot-label'),
      silent: c('.slot.accent-off .slot-label'),
    };
    style.remove();
    return out;
  });
  expect(flattened.sounding).not.toBe(flattened.silent);
});

test("AC-3.1.17/3 — The syllable the dot stands for stays available to assistive technology, so nothing is lost that a sighted reader still gets from position", async ({ page }) => {
  await mixedMeasure(page);

  const rests = await page.locator('.slot.accent-off .slot-label').evaluateAll((els) =>
    els.map((e) => ({
      shown: e.textContent,
      syllable: e.dataset.syllable,
      accessibleName: e.getAttribute('aria-label'),
      markedAsRest: e.dataset.rest,
    }))
  );

  expect(rests.length).toBeGreaterThan(0);
  for (const rest of rests) {
    expect(rest.shown).toBe('\u00b7');
    // The counting syllable survives on the element and as its accessible name,
    // so a screen reader still hears "e" where a sighted reader sees a dot in
    // the second position of the Beat.
    expect(rest.syllable).toBeTruthy();
    expect(rest.syllable).not.toBe('\u00b7');
    expect(rest.accessibleName).toBe(rest.syllable);
    expect(rest.markedAsRest).toBe('true');
  }
});

test('AC-3.1.17/4 — The Accent bar keeps its proportion to the Slot at every Recipe, so a wide cell does not reduce the Accent to a detail', async ({ page }) => {
  const barFor = async (recipe) => {
    await mixedMeasure(page, recipe);
    return page.evaluate(() => {
      const slot = document.querySelector('.slot:not(.accent-off)');
      return {
        slotWidth: slot.getBoundingClientRect().width,
        barHeight: parseFloat(getComputedStyle(slot.querySelector('.slot-fill')).height),
      };
    });
  };

  const dense = await barFor('straight-16ths');
  const sparse = await barFor('straight-8ths');

  // Half as many Slots to a Beat means roughly twice the width each.
  expect(sparse.slotWidth).toBeGreaterThan(dense.slotWidth * 1.5);
  // The bar grows with it rather than staying a hairline in a wide cell.
  expect(sparse.barHeight).toBeGreaterThan(dense.barHeight);
});

/* --- the cell's colour (AC-3.1.18) and its shape (AC-15.2.6) -------------- */

/** Background of the counting cell, and the colour of the syllable on it. */
const cellPaint = (page, selector) =>
  page.evaluate((sel) => {
    const slot = document.querySelector(sel);
    const cell = slot.querySelector('.slot-accent') ?? slot;
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const parse = (s) => s.match(/[\d.]+/g).map(Number);

    // Composite the cell's translucent tint over what is behind it, which is
    // what the eye actually sees.
    const over = (fg, bg) => {
      const f = parse(fg), b = parse(bg);
      const a = f.length > 3 ? f[3] : 1;
      return [0, 1, 2].map((i) => f[i] * a + b[i] * (1 - a));
    };
    const behind = getComputedStyle(slot.closest('.measure')).backgroundColor;
    const composited = over(getComputedStyle(cell).backgroundColor, behind);
    const lum = (a) => 0.2126 * lin(a[0]) + 0.7152 * lin(a[1]) + 0.0722 * lin(a[2]);
    const inkRgb = parse(getComputedStyle(slot.querySelector('.slot-label')).color).slice(0, 3);

    return {
      tint: getComputedStyle(cell).backgroundColor,
      tintLuminance: lum(composited),
      ink: getComputedStyle(slot.querySelector('.slot-label')).color,
      contrast: (() => {
        const s = [lum(inkRgb), lum(composited)].sort((x, y) => y - x);
        return (s[0] + 0.05) / (s[1] + 0.05);
      })(),
      metric: slot.dataset.metric,
      accent: slot.dataset.accent,
    };
  }, selector);

/** A 4/4 Measure on Straight 16ths with nothing turned on. */
async function emptyMeasure(page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await page.evaluate(async () => {
    window.__rm.loadBlank('4/4');
    for (let b = 0; b < 4; b++) await window.__rm.handlers.onRecipe('straight-16ths', 0, b);
  });
  await page.locator('.library-toggle').click();
  await expect(page.locator('.slot').first()).toBeVisible();
}

test('AC-3.1.18/1 — A Slot that does not sound is tinted by its metric position — the Accent Level it would take if turned on — so a downbeat never looks like an "e"', async ({ page }) => {
  await emptyMeasure(page);

  // Beat 1 Slot 1 is Strong by AC-3.1.2; Slot 2 of the same Beat is Weak.
  const downbeat = await cellPaint(page, '.slot[data-beat="0"][data-slot="0"]');
  const offbeat = await cellPaint(page, '.slot[data-beat="0"][data-slot="1"]');

  expect(downbeat.accent).toBe('0');
  expect(offbeat.accent).toBe('0');
  expect(downbeat.metric).not.toBe(offbeat.metric);
  // Neither sounds, and they still do not look alike.
  expect(downbeat.tint).not.toBe(offbeat.tint);
});

test('AC-3.1.18/2 — A Slot that sounds is tinted by its actual Accent Level instead, more strongly than any resting tint, so what sounds wins the eye over what merely could', async ({ page }) => {
  await emptyMeasure(page);
  const resting = await cellPaint(page, '.slot[data-beat="0"][data-slot="0"]');

  await page.evaluate(async () => { await window.__rm.handlers.onSlotTap(0, 0, 0); });
  const sounding = await cellPaint(page, '.slot[data-beat="0"][data-slot="0"]');

  expect(sounding.accent).not.toBe('0');
  expect(sounding.tint).not.toBe(resting.tint);
  // The same position, louder: a sounding cell is further from the Measure's
  // own ground than the resting one it replaced.
  const ground = await page.evaluate(
    () => getComputedStyle(document.querySelector('.measure')).backgroundColor
  );
  expect(ground).toBeTruthy();
  expect(Math.abs(sounding.tintLuminance - resting.tintLuminance)).toBeGreaterThan(0);
  expect(sounding.tintLuminance).toBeGreaterThan(resting.tintLuminance);
});

test("AC-3.1.18/3 — Its counting syllable takes the same Accent Level's colour, so the cell reads as one thing rather than as text sitting on an unrelated ground", async ({ page }) => {
  await emptyMeasure(page);

  const inks = {};
  for (const taps of [1, 2, 3]) {
    await page.evaluate(async ([n]) => {
      const { handlers: h } = window.__rm;
      for (let i = 0; i < n; i++) await h.onSlotTap(0, 0, 0);
    }, [taps]);
    const seen = await cellPaint(page, '.slot[data-beat="0"][data-slot="0"]');
    inks[seen.accent] = seen.ink;
    await page.evaluate(async () => {
      // Back to off, ready for the next level. The element is replaced on every
      // render, so it has to be re-queried each time round rather than held.
      const level = () =>
        document.querySelector('.slot[data-beat="0"][data-slot="0"]').dataset.accent;
      for (let i = 0; i < 5 && level() !== '0'; i++) {
        await window.__rm.handlers.onSlotTap(0, 0, 0);
      }
    });
  }

  // Three levels, three different syllable colours.
  const distinct = new Set(Object.values(inks));
  expect(Object.keys(inks).length).toBe(3);
  expect(distinct.size).toBe(3);
});

test("AC-3.1.18/4 — The syllable's colour clears 4.5:1 against the tint behind it at every Accent Level, since the fills are chosen for separability as blocks and are not all usable as text", async ({ page }) => {
  await emptyMeasure(page);

  for (let taps = 1; taps <= 3; taps++) {
    await page.evaluate(async () => { await window.__rm.handlers.onSlotTap(0, 0, 0); });
    const seen = await cellPaint(page, '.slot[data-beat="0"][data-slot="0"]');
    if (seen.accent === '0') continue;
    expect(seen.contrast, `accent ${seen.accent}`).toBeGreaterThanOrEqual(4.5);
  }
});

test('AC-15.2.6/1 — Each counting cell is as tall as it is wide, within a pixel, in both Sound Modes and at every Recipe', async ({ page }) => {
  for (const mode of ['percussive', 'melodic']) {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/');
    await page.evaluate(async ([m]) => {
      window.__rm.loadBlank('4/4');
      if (m === 'melodic') await window.__rm.handlers.onSoundMode(m);
      for (let b = 0; b < 4; b++) await window.__rm.handlers.onRecipe('straight-8ths', 0, b);
    }, [mode]);
    await page.locator('.library-toggle').click();

    const cells = await page.locator('.slot').evaluateAll((slots) =>
      slots.map((s) => {
        const cell = s.querySelector('.slot-accent') ?? s;
        const r = cell.getBoundingClientRect();
        return { w: r.width, h: r.height };
      })
    );

    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(Math.abs(c.w - c.h), `${mode} ${c.w}x${c.h}`).toBeLessThanOrEqual(1);
    }
  }
});

test('AC-15.2.6/2 — The square never costs a tap target: where a Slot is at its minimum width the cell is that wide and that tall, which still clears the 24 CSS pixels AC-2.2.12 requires', async ({ page }) => {
  // The densest supported Pattern on the narrowest supported viewport, which is
  // where Slots sit at the AC-15.1.10 floor.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { handlers: h } = window.__rm;
    window.__rm.loadBlank('12/8');
    for (let i = 0; i < 7; i++) await h.onAddMeasure();
  });
  await page.locator('.library-toggle').click();

  const cells = await page.locator('.slot').evaluateAll((slots) =>
    slots.map((s) => {
      const r = (s.querySelector('.slot-accent') ?? s).getBoundingClientRect();
      return { w: r.width, h: r.height };
    })
  );

  expect(cells.length).toBeGreaterThan(100);
  for (const c of cells) {
    expect(c.w, `width ${c.w}`).toBeGreaterThanOrEqual(24);
    expect(c.h, `height ${c.h}`).toBeGreaterThanOrEqual(24);
    expect(Math.abs(c.w - c.h)).toBeLessThanOrEqual(1);
  }
});

test('AC-1.1.5/1 — The first Measure’s Time Signature change offers Apply to all, This measure only, and Cancel', async ({
  page,
}) => {
  await page.goto('/');
  await loadMeasures(page, ['4/4', '4/4', '4/4']);

  await page.locator('[data-action="change-time-signature"][data-measure="0"]').click();
  await page.locator('.dialog-button[data-value="6/8"]').click();

  // Three choices, and only three: apply throughout, apply here, or back out.
  const choices = await page
    .locator('.dialog-button')
    .evaluateAll((els) => els.map((e) => e.dataset.value));
  expect(choices).toEqual(['all', 'one', 'cancel']);

  // Cancel makes no change anywhere.
  await page.locator('.dialog-button[data-value="cancel"]').click();
  expect(
    await page.locator('.measure').evaluateAll((els) => els.map((e) => e.dataset.timeSignature))
  ).toEqual(['4/4', '4/4', '4/4']);
});

test('AC-1.1.5/2 — A Measure other than the first changes alone, with no prompt', async ({
  page,
}) => {
  await page.goto('/');
  await loadMeasures(page, ['4/4', '4/4', '4/4']);

  await page.locator('[data-action="change-time-signature"][data-measure="1"]').click();
  await page.locator('.dialog-button[data-value="6/8"]').click();

  // No apply-to-all question: the change lands the moment the meter is picked.
  await expect(page.locator('.dialog-button[data-value="all"]')).toHaveCount(0);
  expect(
    await page.locator('.measure').evaluateAll((els) => els.map((e) => e.dataset.timeSignature))
  ).toEqual(['4/4', '6/8', '4/4']);
});

/* --- the Recipe strip: arm a Recipe, paint it onto a Beat (AC-1.3.11) ------ */

/** Arm a Recipe by its chip label, and confirm the grid entered brush mode. */
async function armRecipe(page, label) {
  await page.locator('.recipe-chip', { hasText: label }).click();
  await expect(page.locator('.grid')).toHaveClass(/recipe-armed/);
}

const recipeOf = (page, measure, beat) =>
  page.locator(`.measure[data-measure="${measure}"] .beat[data-beat="${beat}"]`).getAttribute('data-recipe');

test('AC-1.3.11/1 — With no Recipe armed, tapping within a Beat cycles Slot accents exactly as before', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  await expect(page.locator('.grid')).not.toHaveClass(/recipe-armed/);
  const slot = page.locator('.slot[data-measure="0"][data-beat="0"][data-slot="0"]');
  const before = await recipeOf(page, 0, 0);

  await slot.click();
  await expect(slot).toHaveAttribute('data-accent', '3');
  // The Beat's subdivision is untouched: unarmed, a tap is still an accent.
  expect(await recipeOf(page, 0, 0)).toBe(before);
});

test('AC-1.3.11/2 — With a Recipe armed, tapping any Beat of any Measure applies it to that Beat alone', async ({
  page,
}) => {
  await page.goto('/');
  await loadMeasures(page, ['4/4', '4/4']);
  await armRecipe(page, 'Triplet 8ths');

  // Beat 3 of Measure 2 — neither the first Beat nor the first Measure, which is
  // the whole point: the old dropdown could only ever reach Measure 1, Beat 1.
  await page.locator('.measure[data-measure="1"] .beat[data-beat="2"]').click();
  expect(await recipeOf(page, 1, 2)).toBe('triplet-8ths');
  await expect(
    page.locator('.measure[data-measure="1"] .beat[data-beat="2"] .slot')
  ).toHaveCount(3);

  // Every other Beat is untouched.
  expect(await recipeOf(page, 1, 1)).toBe('straight-16ths');
  expect(await recipeOf(page, 0, 2)).toBe('straight-16ths');
});

test('AC-1.3.11/3 — A Recipe inapplicable to the tapped Beat’s note value leaves that Beat unchanged', async ({
  page,
}) => {
  await page.goto('/');
  await loadMeasures(page, ['4/4', '6/8']);
  await armRecipe(page, 'Triplet 8ths');

  // Triplet feel is offered on a quarter-note Beat and not on an eighth-note one,
  // so the same armed Recipe lands on Measure 1 and is inert on Measure 2.
  const before = await recipeOf(page, 1, 0);
  await page.locator('.measure[data-measure="1"] .beat[data-beat="0"]').click();
  expect(await recipeOf(page, 1, 0)).toBe(before);

  await page.locator('.measure[data-measure="0"] .beat[data-beat="0"]').click();
  expect(await recipeOf(page, 0, 0)).toBe('triplet-8ths');
});

test('AC-1.3.11/4 — The armed Recipe stays armed across taps, and tapping the armed chip disarms it', async ({
  page,
}) => {
  await page.goto('/');
  await loadMeasures(page, ['4/4', '4/4']);
  await armRecipe(page, 'Straight 8ths');

  await page.locator('.measure[data-measure="0"] .beat[data-beat="0"]').click();
  await page.locator('.measure[data-measure="1"] .beat[data-beat="3"]').click();
  // Still armed after painting: a brush you must re-arm every stroke is not one.
  await expect(page.locator('.grid')).toHaveClass(/recipe-armed/);
  expect(await recipeOf(page, 0, 0)).toBe('straight-8ths');
  expect(await recipeOf(page, 1, 3)).toBe('straight-8ths');

  await page.locator('.recipe-chip.armed').click();
  await expect(page.locator('.grid')).not.toHaveClass(/recipe-armed/);
  await expect(page.locator('.recipe-chip.armed')).toHaveCount(0);
});

test('AC-1.3.4 — Recipes applicable to a quarter-note Beat', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  const enabled = await page
    .locator('.recipe-chip:not(:disabled)')
    .evaluateAll((els) => els.map((e) => e.dataset.recipe));
  expect(enabled).toEqual([
    'straight-8ths', 'straight-16ths', 'triplet-8ths', 'straight-triplet-split', 'triplet-straight-split',
  ]);
  // Undivided belongs to an eighth-note Beat, so it is shown and inert, not offered.
  await expect(page.locator('.recipe-chip[data-recipe="undivided"]')).toBeDisabled();
});

test('AC-1.3.5 — Recipes applicable to an eighth-note Beat', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('6/8'));

  const enabled = await page
    .locator('.recipe-chip:not(:disabled)')
    .evaluateAll((els) => els.map((e) => e.dataset.recipe));
  expect(enabled).toEqual(['straight-16ths', 'undivided']);
  // No triplet or mixed-feel option is live on an eighth-note Beat.
  for (const id of ['triplet-8ths', 'straight-triplet-split', 'triplet-straight-split']) {
    await expect(page.locator(`.recipe-chip[data-recipe="${id}"]`)).toBeDisabled();
  }
});
