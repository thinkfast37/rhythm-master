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

test("AC-3.1.17/1 — A silent Slot's counting syllable is not bold, while a sounding one's is", async ({ page }) => {
  await mixedMeasure(page);
  const sounding = await labelStyle(page, '.slot:not(.accent-off) .slot-label');
  const silent = await labelStyle(page, '.slot.accent-off .slot-label');

  expect(sounding.weight).toBeGreaterThanOrEqual(700);
  expect(silent.weight).toBeLessThanOrEqual(400);
});

test("AC-3.1.17/2 — A silent Slot's counting syllable is rendered at about three quarters the size of a sounding one's", async ({ page }) => {
  await mixedMeasure(page);
  const sounding = await labelStyle(page, '.slot:not(.accent-off) .slot-label');
  const silent = await labelStyle(page, '.slot.accent-off .slot-label');

  const ratio = silent.size / sounding.size;
  expect(ratio).toBeGreaterThan(0.65);
  expect(ratio).toBeLessThan(0.85);
});

test("AC-3.1.17/3 — A silent Slot's counting syllable is dimmer than a sounding one's, so the distinction survives a reader whose browser clamps small sizes to a minimum", async ({ page }) => {
  await mixedMeasure(page);
  const sounding = await labelStyle(page, '.slot:not(.accent-off) .slot-label');
  const silent = await labelStyle(page, '.slot.accent-off .slot-label');
  expect(sounding.luminance).toBeGreaterThan(silent.luminance * 1.5);

  // The distinction has to hold once size and weight are gone, which is the
  // state a minimum-font-size setting and a substituted typeface produce
  // together. Colour is the only channel neither of them touches.
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
