import { test, expect } from '@playwright/test';

/*
 * US-1.1 — Measures numbered, selected, inserted, removed and moved anywhere
 * (AC-1.1.10–AC-1.1.12), proven in Practice's grid and Measures row. The
 * Composer's row is proven in layers.spec.js (AC-19.11.7/2).
 */

const numbers = (page) => page.locator('.grid .measure-number').allTextContents();
const selectedNumber = (page) => page.locator('.grid .measure-number.selected').textContent();
const picker = (page) => page.locator('[data-action="measure-select"]');
const select = (page, i) => page.locator(`.measure[data-measure="${i}"] [data-action="select-measure"]`).click();

/** Measures as `{ ts, on }`, the on Slots as `beat.slot`. */
const shape = (page) =>
  page.evaluate(() =>
    window.__rm.getState().pattern.measures.map((m) => ({
      ts: m.timeSignature,
      on: m.beats.flatMap((b, bi) => b.slots.map((s, si) => (s.on ? `${bi}.${si}` : null))).filter(Boolean),
    }))
  );

/**
 * An owned Pattern of these meters, the n-th Measure's Beat n Slot 0 on, so
 * each Measure can be told apart by content as well as meter.
 */
async function load(page, meters, { owned = true } = {}) {
  await page.evaluate(
    ({ list, owned }) => {
      const base = window.__rm.loadBlank('4/4');
      const beats = { '4/4': 4, '3/4': 3, '2/4': 2, '5/4': 5, '6/8': 6, '7/8': 7 };
      const measures = list.map((ts, i) => ({
        timeSignature: ts,
        beats: Array.from({ length: beats[ts] }, (_, b) => {
          const eighth = ts.endsWith('/8');
          const slots = eighth ? [{ on: false }] : [{ on: false }, { on: false }];
          if (b === i) slots[0] = { on: true };
          return { recipe: eighth ? 'undivided' : 'straight-8ths', slots };
        }),
      }));
      window.__rm.loadPattern({ ...structuredClone(base), id: 'p_arrange', name: 'Arrange me', measures }, { owned });
    },
    { list: meters, owned }
  );
  await expect(page.locator('.grid .measure')).toHaveCount(meters.length);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

// --- AC-1.1.10: numbered, and one selected ------------------------------------

test("AC-1.1.10/1 — Every Measure shows its number, counting from 1, in Practice's grid, on a practice goal's read-only grid and in the Composer's grid, and the numbers follow every Measure edit: Practice's grid", async ({ page }) => {
  await load(page, ['4/4', '3/4', '7/8']);
  expect(await numbers(page)).toEqual(['1', '2', '3']);
  // Small and beside the meter: no wider than the meter label, and inside the Measure's box.
  const sizes = await page.locator('.measure[data-measure="1"]').evaluate((m) => {
    const n = m.querySelector('.measure-number').getBoundingClientRect();
    const t = m.querySelector('.measure-meter').getBoundingClientRect();
    const box = m.getBoundingClientRect();
    return { nh: n.height, th: t.height, left: n.left - box.left, visible: getComputedStyle(m.querySelector('.measure-number')).visibility };
  });
  expect(sizes.nh).toBeLessThan(sizes.th);
  expect(sizes.left).toBeGreaterThanOrEqual(0);
  expect(sizes.visible).toBe('visible');
  // The numbers follow an edit: one added before Measure 1 renumbers the rest.
  await select(page, 0);
  await page.locator('[data-action="add-measure-before"]').click();
  expect(await numbers(page)).toEqual(['1', '2', '3', '4']);
  await page.locator('[data-action="remove-measure"]').click();
  expect(await numbers(page)).toEqual(['1', '2', '3']);
});

test("AC-1.1.10/1 — Every Measure shows its number, counting from 1, in Practice's grid, on a practice goal's read-only grid and in the Composer's grid, and the numbers follow every Measure edit: the Composer's grid", async ({ page }) => {
  await load(page, ['4/4', '3/4']);
  await page.locator('.mode-switch [data-mode="composer"]').click();
  const open = page.locator('.dialog-button.primary');
  if (await open.isVisible().catch(() => false)) await open.click();
  await expect(page.locator('.composer-grid .measure-number')).toHaveText(['1', '2']);
  await page.locator('.composer-add-measure').click();
  await expect(page.locator('.composer-grid .measure-number')).toHaveText(['1', '2', '3']);
});

test("AC-1.1.10/2 — Tapping a Measure's number selects it: the Measure and its number are marked, the Measures row's picker shows it, and choosing in the picker selects the same way", async ({ page }) => {
  await load(page, ['4/4', '3/4', '7/8']);
  await select(page, 1);
  expect(await selectedNumber(page)).toBe('2');
  await expect(page.locator('.measure[data-measure="1"]')).toHaveClass(/selected/);
  await expect(page.locator('.measure.selected')).toHaveCount(1);
  await expect(page.locator('.measure[data-measure="1"] .measure-number')).toHaveAttribute('aria-pressed', 'true');
  await expect(picker(page)).toHaveValue('1');
  await picker(page).selectOption('0');
  expect(await selectedNumber(page)).toBe('1');
  await expect(page.locator('.measure[data-measure="0"]')).toHaveClass(/selected/);
});

test('AC-1.1.10/3 — With no Measure chosen, or the chosen one gone, the last Measure is selected; opening another Pattern clears the choice', async ({ page }) => {
  await load(page, ['4/4', '3/4', '7/8']);
  expect(await selectedNumber(page)).toBe('3');
  await expect(picker(page)).toHaveValue('2');
  // The chosen one removed: the last is selected.
  await select(page, 0);
  await page.locator('[data-action="remove-measure"]').click();
  expect(await selectedNumber(page)).toBe('2');
  // A choice, then another Pattern: cleared.
  await select(page, 0);
  await load(page, ['4/4', '4/4', '4/4', '4/4']);
  expect(await selectedNumber(page)).toBe('4');
});

test("AC-1.1.10/4 — A practice goal's read-only grid shows the numbers and offers no selection", async ({ page }) => {
  await load(page, ['4/4', '3/4']);
  await page.locator('[data-action="show-goals"]').click();
  await page.locator('.goal-card[data-goal="practise"]').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-readonly', 'true');
  const count = await page.locator('.grid .measure').count();
  expect(await numbers(page)).toEqual(Array.from({ length: count }, (_, i) => String(i + 1)));
  await expect(page.locator('.grid [data-action="select-measure"]')).toHaveCount(0);
  await expect(page.locator('.grid .measure.selected')).toHaveCount(0);
});

// --- AC-1.1.11: insert before or after -----------------------------------------

test("AC-1.1.11/1 — + Before inserts a blank Measure in the selected Measure's Time Signature immediately in front of it, and selects the new Measure", async ({ page }) => {
  await load(page, ['4/4', '3/4', '7/8']);
  await select(page, 1);
  await page.locator('[data-action="add-measure-before"]').click();
  expect(await shape(page)).toEqual([
    { ts: '4/4', on: ['0.0'] },
    { ts: '3/4', on: [] },
    { ts: '3/4', on: ['1.0'] },
    { ts: '7/8', on: ['2.0'] },
  ]);
  expect(await selectedNumber(page)).toBe('2');
});

test("AC-1.1.11/2 — + After inserts a blank Measure in the selected Measure's Time Signature immediately after it, and selects the new Measure", async ({ page }) => {
  await load(page, ['4/4', '3/4', '7/8']);
  await select(page, 0);
  await page.locator('[data-action="add-measure"]').click();
  expect(await shape(page)).toEqual([
    { ts: '4/4', on: ['0.0'] },
    { ts: '4/4', on: [] },
    { ts: '3/4', on: ['1.0'] },
    { ts: '7/8', on: ['2.0'] },
  ]);
  expect(await selectedNumber(page)).toBe('2');
  // Pressed again it builds forward, in order.
  await page.locator('[data-action="add-measure"]').click();
  expect((await shape(page)).map((m) => m.ts)).toEqual(['4/4', '4/4', '4/4', '3/4', '7/8']);
  expect(await selectedNumber(page)).toBe('3');
});

test('AC-1.1.11/3 — Every other Measure keeps its Time Signature, Beats, Slots and chord overrides, in its order', async ({ page }) => {
  await load(page, ['4/4', '3/4', '7/8']);
  const before = await page.evaluate(() => window.__rm.getState().pattern.measures);
  await select(page, 1);
  await page.locator('[data-action="add-measure"]').click();
  const after = await page.evaluate(() => window.__rm.getState().pattern.measures);
  expect([after[0], after[1], after[3]]).toEqual(before);
  // Both inserts are refused at the cap (AC-1.1.3).
  await load(page, Array.from({ length: 32 }, () => '4/4'));
  await expect(page.locator('[data-action="add-measure-before"]')).toBeDisabled();
  await expect(page.locator('[data-action="add-measure"]')).toBeDisabled();
});

// --- AC-1.1.12: move ------------------------------------------------------------

test('AC-1.1.12/1 — Move… opens a dialog naming the selected Measure that offers Before or After and the number of any other Measure, with Move and Cancel; Cancel changes nothing, and Move is disabled while the choice would leave the order as it is', async ({ page }) => {
  await load(page, ['4/4', '3/4', '7/8', '2/4']);
  const before = await shape(page);
  await select(page, 1);
  await page.locator('[data-action="move-measure"]').click();
  const dialog = page.locator('.move-measure-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('role', 'dialog');
  await expect(dialog.locator('.dialog-message')).toHaveText('Move Measure 2');
  await expect(dialog.locator('.move-measure-where option')).toHaveText(['Before', 'After']);
  await expect(dialog.locator('.move-measure-target option')).toHaveText(['Measure 1', 'Measure 3', 'Measure 4']);
  const move = dialog.locator('.dialog-button[data-value="move"]');
  // Before Measure 3 or after Measure 1 is where it already is.
  await dialog.locator('.move-measure-where').selectOption('before');
  await dialog.locator('.move-measure-target').selectOption('2');
  await expect(move).toBeDisabled();
  await dialog.locator('.move-measure-where').selectOption('after');
  await dialog.locator('.move-measure-target').selectOption('0');
  await expect(move).toBeDisabled();
  await dialog.locator('.move-measure-target').selectOption('3');
  await expect(move).toBeEnabled();
  await dialog.locator('.dialog-button[data-value="cancel"]').click();
  await expect(dialog).toHaveCount(0);
  expect(await shape(page)).toEqual(before);
});

test('AC-1.1.12/2 — The moved Measure carries its Time Signature, Beats, Slots, Accents, Pitches and chord overrides to its new place, every other Measure keeps its own in its order, and the moved Measure stays selected', async ({ page }) => {
  await load(page, ['4/4', '3/4', '7/8', '2/4']);
  // An Accent other than the default on Measure 2, so the Accent is seen to travel.
  await page.locator('.measure[data-measure="1"] .slot[data-beat="1"][data-slot="0"]').click();
  const before = await page.evaluate(() => window.__rm.getState().pattern.measures);
  await select(page, 1);
  await page.locator('[data-action="move-measure"]').click();
  await page.locator('.move-measure-where').selectOption('after');
  await page.locator('.move-measure-target').selectOption('3');
  await page.locator('.move-measure-dialog .dialog-button[data-value="move"]').click();
  const after = await page.evaluate(() => window.__rm.getState().pattern.measures);
  expect(after).toEqual([before[0], before[2], before[3], before[1]]);
  expect(await selectedNumber(page)).toBe('4');
  await expect(page.locator('.measure[data-measure="3"]')).toHaveAttribute('data-time-signature', '3/4');
  // And back to the front: before Measure 1.
  await page.locator('[data-action="move-measure"]').click();
  await page.locator('.move-measure-where').selectOption('before');
  await page.locator('.move-measure-target').selectOption('0');
  await page.locator('.move-measure-dialog .dialog-button[data-value="move"]').click();
  expect(await page.evaluate(() => window.__rm.getState().pattern.measures)).toEqual([before[1], before[0], before[2], before[3]]);
  expect(await selectedNumber(page)).toBe('1');
});

test('AC-1.1.12/3 — Move… is disabled on a one-Measure Pattern', async ({ page }) => {
  await load(page, ['4/4']);
  await expect(page.locator('[data-action="move-measure"]')).toBeDisabled();
  await page.locator('[data-action="add-measure"]').click();
  await expect(page.locator('[data-action="move-measure"]')).toBeEnabled();
});

test('AC-1.1.12/4 — An insert, a removal and a move are each one Undo step, and on a shipped Pattern each asks for a name first, as every edit to one does', async ({ page }) => {
  await load(page, ['4/4', '3/4', '7/8']);
  const original = await shape(page);
  await select(page, 0);
  await page.locator('[data-action="move-measure"]').click();
  await page.locator('.move-measure-target').selectOption('2');
  await page.locator('.move-measure-dialog .dialog-button[data-value="move"]').click();
  const moved = await shape(page);
  expect(moved.map((m) => m.ts)).toEqual(['3/4', '7/8', '4/4']);
  await page.locator('[data-action="add-measure-before"]').click();
  await page.locator('[data-action="remove-measure"]').click();
  expect((await shape(page)).length).toBe(3);
  // Three edits, three Undos: the removal, the insert, the move.
  await page.locator('[data-action="undo"]').click();
  expect((await shape(page)).length).toBe(4);
  await page.locator('[data-action="undo"]').click();
  expect(await shape(page)).toEqual(moved);
  await page.locator('[data-action="undo"]').click();
  expect(await shape(page)).toEqual(original);

  // On a shipped Pattern the naming prompt comes first, and cancelling it changes nothing.
  await load(page, ['4/4', '3/4', '7/8'], { owned: false });
  await select(page, 1);
  await page.locator('[data-action="add-measure-before"]').click();
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  expect((await shape(page)).length).toBe(3);
  await page.locator('[data-action="add-measure-before"]').click();
  await page.locator('.dialog-input').fill('Arranged copy');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.grid .measure')).toHaveCount(4);
  const s = await page.evaluate(() => window.__rm.getState());
  expect(s.pattern.name).toBe('Arranged copy');
  expect(s.isOwned).toBe(true);
  expect(s.pattern.measures[1].timeSignature).toBe('3/4');
});
