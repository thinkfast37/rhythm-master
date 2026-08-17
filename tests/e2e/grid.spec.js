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

test('AC-1.4.1 — each Measure shows its own Time Signature in the grid', async ({ page }) => {
  await page.goto('/');
  const meter = page.locator('.measure-meter').first();
  await expect(meter).toBeVisible();
  await expect(meter).toHaveText(/^\d+\/\d+$/);
});

test('AC-1.4.2 — the Time Signature shown matches the Measure it labels', async ({ page }) => {
  await page.goto('/');
  const measure = page.locator('.measure').first();
  const ts = await measure.getAttribute('data-time-signature');
  await expect(measure.locator('.measure-meter')).toHaveText(ts);
  const numerator = Number(ts.split('/')[0]);
  await expect(measure.locator('.beat')).toHaveCount(numerator);
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
  const first = page.locator('.beat[data-recipe="straight-16ths"] .slot-label');
  if ((await first.count()) >= 4) {
    await expect(first.nth(0)).toHaveText('ta');
    await expect(first.nth(1)).toHaveText('ka');
  }

  await page.locator('.counting-picker').selectOption('one-e-and-a');
  const relabelled = page.locator('.beat[data-recipe="straight-16ths"] .slot-label');
  await expect(relabelled.nth(0)).toHaveText('1');
  await expect(relabelled.nth(1)).toHaveText('e');
});

test("AC-5.6.12 — 1-e-&-a scheme, the leading digit is the Beat's own number", async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.counting-picker').selectOption('one-e-and-a');

  for (let beat = 0; beat < 4; beat++) {
    const firstLabel = page.locator(`.beat[data-beat="${beat}"] .slot-label`).first();
    await expect(firstLabel).toHaveText(String(beat + 1));
  }
});

test('AC-1.3.4 — a mixed-feel Recipe renders two groups with different feels', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  await page.locator('.recipe-picker').selectOption('straight-triplet-split');

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
  await page.locator('.recipe-picker').selectOption('triplet-straight-split');

  const labels = page.locator('.beat[data-recipe="triplet-straight-split"] .slot-label');
  await expect(labels.nth(0)).toHaveText('1');
  await expect(labels.nth(4)).toHaveText('5');
  await expect(page.locator('[data-forced-numbered]')).toBeVisible();
  // The stored preference is untouched (AC-5.6.3).
  await expect(page.locator('.counting-picker')).toHaveValue('takadimi');
});

test('AC-1.3.7 — changing a Recipe on a Beat with notes asks first', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  await page.locator('.slot[data-measure="0"][data-beat="0"][data-slot="0"]').click();
  await page.locator('.recipe-picker').selectOption('triplet-8ths');

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

  await page.locator('.recipe-picker').selectOption('straight-8ths');
  await page.locator('.slot[data-measure="0"][data-beat="0"][data-slot="0"]').click();
  await page.locator('.recipe-picker').selectOption('straight-16ths');

  await expect(page.locator('.dialog-message')).toContainText('will clear 1 note');
});

test('AC-1.3.10 — changing a Recipe on an empty Beat does not ask', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));

  await page.locator('.recipe-picker').selectOption('triplet-8ths');
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
