import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

/**
 * Nothing here may actually reach github.com: the submission hand-off opens a real
 * tab, and a test that depends on a third party fails for reasons of its own.
 */
async function stubGitHub(page) {
  await page.context().route('https://github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>GitHub, stubbed.</p>' })
  );
}

/**
 * The browser's save dialog, answering as the Composer would (AC-12.1.5/1): it
 * records what it was offered, and the bytes written to the file chosen in it.
 * `name` is the name typed there; `cancel` dismisses it.
 */
async function stubSavePicker(page, { name = null, cancel = false } = {}) {
  await page.addInitScript(
    ({ name, cancel }) => {
      window.__offered = null;
      window.__saved = null;
      window.showSaveFilePicker = async (options) => {
        window.__offered = options;
        if (cancel) throw new DOMException('The user aborted a request.', 'AbortError');
        const chosen = name ?? options.suggestedName;
        const parts = [];
        return {
          name: chosen,
          createWritable: async () => ({
            write: async (data) => parts.push(data),
            close: async () => {
              const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
              window.__saved = { name: chosen, bytes: Array.from(bytes) };
            },
          }),
        };
      };
    },
    { name, cancel }
  );
}

/** A browser with no save dialog of its own — Safari, Firefox, the apps (AC-12.1.5/2). */
const noSavePicker = (page) => page.addInitScript(() => (window.showSaveFilePicker = undefined));

/** Create an owned Pattern by editing a shipped one and naming the copy. */
async function makeOwned(page, name = 'Mine') {
  await page.locator('.slot').first().click();
  await page.locator('.dialog-input').fill(name);
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
}

test('AC-7.4.1 — Make Copy creates a second, independent Pattern', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Original');

  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-input').fill('The Copy');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
  // The copy is note-for-note identical, so the duplicate warning fires first.
  await page.locator('.dialog-button', { hasText: 'Keep both' }).click();

  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe('The Copy');
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(2);
});

test('AC-7.4.2 — editing a copy leaves the original untouched', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Original');
  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-input').fill('The Copy');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
  await page.locator('.dialog-button', { hasText: 'Keep both' }).click();

  await page.locator('.slot[data-beat="0"][data-slot="1"]').click();

  const both = await page.evaluate(() => {
    const all = window.__rm.patternStore.loadAll();
    return all.map((p) => ({
      name: p.name,
      on: p.measures[0].beats[0].slots[1].on,
    }));
  });
  expect(both.find((p) => p.name === 'Original').on).toBe(false);
  expect(both.find((p) => p.name === 'The Copy').on).toBe(true);
});

test('AC-11.1.3 — Duplicate warning fires only at Pattern-creation moments: Make Copy', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Original');

  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-input').fill('Same Notes');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();

  await expect(page.locator('.dialog-message')).toContainText('note-for-note identical');
  await page.locator('.dialog-button', { hasText: 'Keep both' }).click();
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(2);
});

test('AC-7.5.1 — Delete removes an owned Pattern permanently', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Doomed');

  await page.locator('[data-action="delete-pattern"]').click();
  await page.locator('.dialog-button', { hasText: 'Delete' }).click();

  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(0);
  await page.reload();
  await expect(page.locator('.pattern-item', { hasText: 'Doomed' })).toHaveCount(0);
});

test('AC-7.5.2 — a shipped Pattern offers no Delete control at all', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  await expect(page.locator('[data-action="delete-pattern"]')).toHaveCount(0);
});

test('AC-7.5.3 — deleting a Pattern drops its Local Metadata with it', async ({ page }) => {
  await stubGitHub(page);
  await page.goto('/');
  await makeOwned(page, 'Doomed');

  // Give the Pattern some Local Metadata to lose: submitting records it, and the
  // record is made when the link is followed, not when the dialog opens.
  await page.locator('[data-action="submit-pattern"]').click();
  await Promise.all([
    page.context().waitForEvent('page'),
    page.locator('[data-action="open-submission"]').click(),
  ]);
  await page.locator('[data-action="close-submission"]').click();

  const before = await page.evaluate(() => {
    const id = window.__rm.getState().pattern.id;
    return Boolean(window.__rm.localMetaStore.forPattern(id).submittedAt);
  });
  expect(before).toBe(true);

  const id = await page.evaluate(() => window.__rm.getState().pattern.id);
  await page.locator('[data-action="delete-pattern"]').click();
  await page.locator('.dialog-button', { hasText: 'Delete' }).click();

  const after = await page.evaluate((pid) => window.__rm.localMetaStore.forPattern(pid), id);
  expect(after).toEqual({});
});

test('AC-10.1.1 — Double Length duplicates the Pattern’s own Measures', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Doubler');
  const before = await page.evaluate(() => window.__rm.getState().pattern.measures.length);

  await page.locator('[data-action="duplicate-pattern"]').click();
  const after = await page.evaluate(() => window.__rm.getState().pattern.measures.length);
  expect(after).toBe(before * 2);
  await expect(page.locator('.measure')).toHaveCount(after);
});

test('AC-10.1.4 — Duplicate is disabled when doubling would exceed the cap: the operations-panel control', async ({
  page,
}) => {
  await page.goto('/');
  await makeOwned(page, 'Big');
  // Grow to 5 Measures; doubling would make 10, over the cap of 8.
  for (let i = 0; i < 4; i++) await page.locator('[data-action="add-measure"]').click();
  await expect(page.locator('.measure')).toHaveCount(5);
  await expect(page.locator('[data-action="duplicate-pattern"]')).toBeDisabled();
});

test('AC-8.1.1 — Append adds another Pattern’s Measures after this one', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Base');
  const before = await page.evaluate(() => window.__rm.getState().pattern.measures.length);

  await page.locator('[data-action="append-pattern"]').click();
  // The first option in the list is a real Pattern.
  await page.locator('.dialog-button').first().click();

  const after = await page.evaluate(() => window.__rm.getState().pattern.measures.length);
  expect(after).toBeGreaterThan(before);
});

test('AC-8.1.2 — Append is unavailable once the Pattern is at the Measure cap', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Full');
  for (let i = 0; i < 7; i++) await page.locator('[data-action="add-measure"]').click();
  await expect(page.locator('.measure')).toHaveCount(8);
  await expect(page.locator('[data-action="append-pattern"]')).toBeDisabled();
  await expect(page.locator('[data-action="add-measure"]')).toBeDisabled();
});

test('AC-12.1.1 — Export MIDI produces a downloadable .mid named after the Pattern', async ({ page }) => {
  // Without a save dialog the file still downloads, under the suggested name if
  // it is kept (AC-12.1.5/2).
  await noSavePicker(page);
  await page.goto('/');
  await makeOwned(page, 'Export Me');

  const download = page.waitForEvent('download');
  await page.locator('[data-action="export-midi"]').click();
  await page.locator('.dialog .dialog-button.primary').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('export-me.mid');
});

test('AC-12.1.5/1 — Where the browser offers a save dialog, Export MIDI opens it with the suggested name filled in and MIDI files offered; the file is written to the folder and under the name chosen there', async ({ page }) => {
  await stubSavePicker(page, { name: 'Take two.mid' });
  await page.goto('/');
  await makeOwned(page, 'Export Me');
  let downloads = 0;
  page.on('download', () => downloads++);

  await page.locator('[data-action="export-midi"]').click();
  await expect.poll(() => page.evaluate(() => window.__saved?.name ?? null)).toBe('Take two.mid');

  const offered = await page.evaluate(() => window.__offered);
  expect(offered.suggestedName).toBe('export-me.mid');
  expect(offered.types.flatMap((t) => Object.keys(t.accept))).toEqual(['audio/midi']);
  expect(offered.types.flatMap((t) => Object.values(t.accept).flat())).toEqual(['.mid', '.midi']);
  // The file chosen holds the MIDI, and nothing went to the downloads folder instead.
  const bytes = await page.evaluate(() => window.__saved.bytes);
  expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect(downloads).toBe(0);
});

test('AC-12.1.5/2 — Where it does not (Safari, Firefox, the iOS and Android apps), Export MIDI asks for the filename in the app, with the suggested name filled in, and the file downloads under the name given; the browser chooses the folder, as it does for every download', async ({ page }) => {
  await noSavePicker(page);
  await page.goto('/');
  await makeOwned(page, 'Export Me');

  await page.locator('[data-action="export-midi"]').click();
  const input = page.locator('.dialog .dialog-input');
  await expect(input).toHaveValue('export-me.mid');
  await input.fill('Groove for Tuesday');
  const download = page.waitForEvent('download');
  await page.locator('.dialog .dialog-button.primary').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Groove for Tuesday.mid');
  const bytes = readFileSync(await file.path());
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('MThd');
  await expect(page.locator('.dialog')).toHaveCount(0);
});

test('AC-12.1.5/4 — A name given without `.mid` or `.midi` gets `.mid` added; a name left blank falls back to the suggestion; characters no filesystem accepts in a name — slashes, backslashes, colons and `* ? " < > |` — are dropped: as typed in the app', async ({ page }) => {
  await noSavePicker(page);
  await page.goto('/');
  await makeOwned(page, 'Export Me');
  const saveAs = async (typed) => {
    await page.locator('[data-action="export-midi"]').click();
    await page.locator('.dialog .dialog-input').fill(typed);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.dialog .dialog-button.primary').click()]);
    return download.suggestedFilename();
  };
  expect(await saveAs('   ')).toBe('export-me.mid');
  expect(await saveAs('Bossa: take 3?')).toBe('Bossa take 3.mid');
  expect(await saveAs('verse.midi')).toBe('verse.midi');
});

test('AC-12.1.5/3 — Cancelling either writes no file and changes nothing', async ({ context }) => {
  // Each page opens in the test's context, so it keeps the configured base URL and storage.
  for (const setup of [(page) => stubSavePicker(page, { cancel: true }), noSavePicker]) {
    const page = await context.newPage();
    await setup(page);
    await page.goto('/');
    await page.evaluate(() => window.__rm.loadBlank('4/4', 'Export Me'));
    const before = await page.evaluate(() => JSON.stringify(window.__rm.getState().pattern));
    let downloads = 0;
    page.on('download', () => downloads++);

    await page.locator('[data-action="export-midi"]').click();
    const picker = await page.evaluate(() => typeof window.showSaveFilePicker === 'function');
    if (picker) {
      await expect.poll(() => page.evaluate(() => window.__offered !== null)).toBe(true);
    } else {
      await page.locator('.dialog .dialog-button:not(.primary)').click();
    }
    await page.waitForTimeout(300);
    expect(downloads).toBe(0);
    if (picker) expect(await page.evaluate(() => window.__saved)).toBeNull();
    // A cancelled save dialog does not fall back to asking in the app.
    await expect(page.locator('.dialog')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify(window.__rm.getState().pattern))).toBe(before);
    await page.close();
  }
});

test('AC-13.1.5 — Submission-tracking is Local Metadata, never part of the export payload: keyed by the Pattern, never written onto it', async ({
  page,
}) => {
  await stubGitHub(page);
  await page.goto('/');
  await makeOwned(page, 'Contribute Me');

  await page.locator('[data-action="submit-pattern"]').click();
  const href = await page.locator('[data-action="open-submission"]').getAttribute('href');
  expect(href).toContain('https://github.com/');
  expect(href).toContain('labels=new-pattern');
  expect(decodeURIComponent(href)).toContain('### Pattern: Contribute Me');

  await Promise.all([
    page.context().waitForEvent('page'),
    page.locator('[data-action="open-submission"]').click(),
  ]);

  const meta = await page.evaluate(() => {
    const id = window.__rm.getState().pattern.id;
    return window.__rm.localMetaStore.forPattern(id);
  });
  expect(meta.submittedAt).toBeTruthy();
  // Submission history is Local Metadata, never Pattern data (FR-006).
  const pattern = await page.evaluate(() => window.__rm.getState().pattern);
  expect(pattern).not.toHaveProperty('submittedAt');
  expect(pattern).not.toHaveProperty('submittedDigest');
});

test('AC-11.2.1 — Family match criteria: a melodic variant surfaces as a Family, not a duplicate', async ({
  page,
}) => {
  await page.goto('/');
  await makeOwned(page, 'Rhythm');
  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-input').fill('Melodic Version');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
  await page.locator('.dialog-button', { hasText: 'Keep both' }).click();
  await page.locator('.sound-mode [data-mode="melodic"]').click();

  const result = await page.evaluate(() => ({
    family: window.__rm.currentFamily().map((p) => p.name),
    duplicates: window.__rm.currentDuplicates().map((p) => p.name),
  }));
  expect(result.family).toContain('Rhythm');
  expect(result.duplicates).not.toContain('Rhythm');
});

test('AC-11.3.1 — a Pattern the library has since duplicated prompts once, then never again', async ({ page }) => {
  await page.goto('/');
  // Make an owned Pattern note-for-note identical to a shipped one.
  await page.evaluate(() => {
    const shipped = window.__rm.seedStore.loadAll()[0];
    const mine = { ...structuredClone(shipped), id: 'p_dupe', name: 'My Copy' };
    window.__rm.patternStore.upsert(mine);
  });

  const pending = await page.evaluate(() =>
    window.__rm.unresolvedLibraryDuplicates().map((d) => d.owned.name)
  );
  expect(pending).toEqual(['My Copy']);

  // Answering the prompt records the resolution as Local Metadata.
  await page.evaluate(() => window.__rm.localMetaStore.update('p_dupe', { duplicateResolved: true }));
  const after = await page.evaluate(() => window.__rm.unresolvedLibraryDuplicates().length);
  expect(after).toBe(0);

  // And the resolution never becomes part of the Pattern (FR-006).
  const stored = await page.evaluate(() => window.__rm.patternStore.findById('p_dupe'));
  expect(stored).not.toHaveProperty('duplicateResolved');
});

// --- US-10.2 Condense ---------------------------------------------------------

/**
 * Load a Pattern of the given Measures — each `[timeSignature, beats]`, a Beat being
 * `[recipe, onFlags]` — as owned or shipped. Built in the page so the shape is exact
 * rather than reached through a long sequence of clicks.
 */
async function loadShaped(page, measures, { owned = true } = {}) {
  await page.evaluate(
    ({ measures, owned }) => {
      const p = window.__rm.loadBlank('4/4', owned ? 'Shaped' : 'Shipped Shape');
      p.measures = measures.map(([timeSignature, beats]) => ({
        timeSignature,
        beats: beats.map(([recipe, flags]) => ({ recipe, slots: flags.map((on) => ({ on })) })),
      }));
      window.__rm.loadPattern({ ...p, id: owned ? 'p_test' : 'p_shipped_shape' }, { owned });
    },
    { measures, owned }
  );
}

const Q = ['straight-8ths', [true, false]]; // a quarter note, as the library writes one
const fourQ = ['4/4', [Q, Q, Q, Q]];

test('AC-10.2.3/1 — Enabled for two 4/4 Measures of Straight 8ths', async ({ page }) => {
  await page.goto('/');
  await loadShaped(page, [fourQ, fourQ]);
  const condense = page.locator('[data-action="condense-pattern"]');
  await expect(condense).toBeEnabled();
  // Beside Double Length (AC-10.2.3's When): the Measure controls of the
  // Rhythm group (AC-15.1.8).
  const actions = await page.locator('.structure-row button').evaluateAll((b) => b.map((x) => x.dataset.action));
  expect(actions.indexOf('condense-pattern')).toBe(actions.indexOf('duplicate-pattern') + 1);
});

test('AC-10.2.3/2 — Disabled for an odd number of Measures, a single Measure included', async ({ page }) => {
  await page.goto('/');
  await loadShaped(page, [fourQ]);
  await expect(page.locator('[data-action="condense-pattern"]')).toBeDisabled();
  await loadShaped(page, [fourQ, fourQ, fourQ]);
  await expect(page.locator('.measure')).toHaveCount(3);
  await expect(page.locator('[data-action="condense-pattern"]')).toBeDisabled();
});

test('AC-10.2.3/3 — Disabled when any Beat carries a triplet or split Recipe', async ({ page }) => {
  await page.goto('/');
  const T = ['triplet-8ths', [false, false, false]];
  await loadShaped(page, [fourQ, ['4/4', [Q, Q, T, Q]]]);
  await expect(page.locator('[data-action="condense-pattern"]')).toBeDisabled();
  const S = ['straight-triplet-split', [false, false, false, false, false]];
  await loadShaped(page, [['4/4', [S, Q, Q, Q]], fourQ]);
  await expect(page.locator('[data-action="condense-pattern"]')).toBeDisabled();
});

test('AC-10.2.3/4 — Disabled when any quarter-note Straight 16ths Beat has its second or fourth Slot on, or any eighth-note Straight 16ths Beat its second', async ({ page }) => {
  await page.goto('/');
  const offSixteenths = ['straight-16ths', [true, false, true, false]];
  await loadShaped(page, [fourQ, ['4/4', [offSixteenths, Q, Q, Q]]]);
  await expect(page.locator('[data-action="condense-pattern"]')).toBeEnabled();
  // Turn the fourth Slot of that Beat on through the grid: the control follows the edit.
  await page.locator('.slot[data-measure="1"][data-beat="0"][data-slot="3"]').click();
  await expect(page.locator('[data-action="condense-pattern"]')).toBeDisabled();

  const U = ['undivided', [true]];
  const E = ['straight-16ths', [true, true]];
  await loadShaped(page, [['6/8', [U, U, U, U, U, E]], ['6/8', [U, U, U, U, U, U]]]);
  await expect(page.locator('[data-action="condense-pattern"]')).toBeDisabled();
});

test('AC-10.2.3/5 — Disabled when the two Measures of any pair differ in Time Signature', async ({ page }) => {
  await page.goto('/');
  await loadShaped(page, [fourQ, ['3/4', [Q, Q, Q]]]);
  await expect(page.locator('[data-action="condense-pattern"]')).toBeDisabled();
});

test('AC-10.2.4 — Condense on an owned Pattern auto-saves', async ({ page }) => {
  await page.goto('/');
  await loadShaped(page, [fourQ, fourQ]);
  await page.locator('[data-action="condense-pattern"]').click();

  await expect(page.locator('.measure')).toHaveCount(1);
  const saved = await page.evaluate(() => {
    const p = window.__rm.patternStore.loadAll().find((x) => x.id === 'p_test');
    return {
      measures: p.measures.length,
      recipes: p.measures[0].beats.map((b) => b.recipe),
      on: p.measures[0].beats.map((b) => b.slots.map((s) => s.on)),
    };
  });
  expect(saved.measures).toBe(1);
  expect(saved.recipes).toEqual(['straight-16ths', 'straight-16ths', 'straight-16ths', 'straight-16ths']);
  expect(saved.on).toEqual([
    [true, false, true, false],
    [true, false, true, false],
    [true, false, true, false],
    [true, false, true, false],
  ]);
  // Nothing more to condense: the control now reports so.
  await expect(page.locator('[data-action="condense-pattern"]')).toBeDisabled();
});

test('AC-10.2.5 — Condense on a shipped Pattern triggers the naming prompt first', async ({ page }) => {
  await page.goto('/');
  await loadShaped(page, [fourQ, fourQ], { owned: false });
  await page.locator('[data-action="condense-pattern"]').click();

  // Cancel: the shipped Pattern is untouched and nothing was created.
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await expect(page.locator('.measure')).toHaveCount(2);
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(0);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);

  // Name it: the condensed result lands in the new owned Pattern.
  await page.locator('[data-action="condense-pattern"]').click();
  await page.locator('.dialog-input').fill('Condensed');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
  await expect(page.locator('.measure')).toHaveCount(1);
  const owned = await page.evaluate(() => {
    const all = window.__rm.patternStore.loadAll();
    return { count: all.length, name: all[0]?.name, measures: all[0]?.measures.length };
  });
  expect(owned).toEqual({ count: 1, name: 'Condensed', measures: 1 });
});
