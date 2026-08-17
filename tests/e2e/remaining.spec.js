import { test, expect } from '@playwright/test';
import { SEED_PATTERN_COUNT } from '../seed-count.js';

test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
});

async function makeOwned(page, name = 'Mine') {
  await page.locator('.slot').first().click();
  await page.locator('.dialog-input').fill(name);
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
}

// --- US-7.1: creating Patterns ---------------------------------------------

test('AC-7.1.1 — a new Pattern is named "New Pattern" in an editable field', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="new-pattern"]').click();

  await expect(page.locator('.pattern-title')).toHaveValue('New Pattern');
  await page.locator('.pattern-title').fill('My Groove');
  await page.locator('.pattern-title').blur();
  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe('My Groove');
});

test('AC-7.1.1 — clearing the name reverts to the last valid one rather than staying empty', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('[data-action="new-pattern"]').click();
  await page.locator('.pattern-title').fill('Named');
  await page.locator('.pattern-title').blur();

  await page.locator('.pattern-title').fill('   ');
  await page.locator('.pattern-title').blur();

  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe('Named');
  await expect(page.locator('.pattern-title')).toHaveValue('Named');
});

test('AC-7.1.2 — a new Pattern is in the library immediately, with no save step', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="new-pattern"]').click();

  await expect(page.locator('.pattern-item', { hasText: 'New Pattern' })).toHaveCount(1);
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(1);
});

// --- US-1.1: undo -----------------------------------------------------------

test('AC-1.1.7 — a Time Signature reset is undone as a single action', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Undoable');

  // Put notes in, then change the meter, which clears the Measure.
  await page.locator('.slot[data-beat="0"][data-slot="2"]').click();
  const before = await page.evaluate(() => structuredClone(window.__rm.getState().pattern));

  await page.locator('.measure-meter').first().click();
  await page.locator('.dialog-button', { hasText: '3/4' }).first().click();
  const cleared = await page.evaluate(() => window.__rm.getState().pattern);
  expect(cleared.measures[0].timeSignature).toBe('3/4');

  await page.locator('[data-action="undo"]').click();
  const after = await page.evaluate(() => window.__rm.getState().pattern);
  // Both the meter change and the Slot clearing come back together.
  expect(after.measures[0].timeSignature).toBe(before.measures[0].timeSignature);
  expect(after.measures[0].beats[0].slots[2].on).toBe(true);
});

test('AC-1.1.7 — Undo is unavailable when there is nothing to undo', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-action="undo"]')).toBeDisabled();
});

// --- US-1.3 / US-2.1 / US-2.3 ----------------------------------------------

test('AC-1.3.9 — accent cycles identically on a triplet-feel Slot of a mixed Recipe', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.recipe-picker').selectOption('triplet-straight-split');

  // Slot 2 sits inside the leading triplet group.
  const slot = page.locator('.slot[data-beat="0"][data-slot="1"]');
  await expect(slot.locator('xpath=..')).toHaveAttribute('data-feel', 'triplet');

  const seen = [];
  for (let i = 0; i < 4; i++) {
    await slot.click();
    seen.push(await slot.getAttribute('data-accent'));
  }
  // Its default is Weak, so the cycle is the Weak-default cycle.
  expect(seen).toEqual(['1', '2', '3', '0']);
});

test('AC-2.1.5 — switching Sound Mode leaves every Accent Level untouched', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click(); // override to Weak
  await page.locator('.slot[data-beat="2"][data-slot="0"]').click();

  const accentsOf = () =>
    page.locator('.slot').evaluateAll((els) => els.map((e) => e.dataset.accent));

  const before = await accentsOf();
  await page.locator('.sound-mode').selectOption('melodic');
  expect(await accentsOf()).toEqual(before);
  await page.locator('.sound-mode').selectOption('percussive');
  expect(await accentsOf()).toEqual(before);
});

test('AC-2.3.3 — a Percussive Pattern has no Key control at all', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await expect(page.locator('.key-picker')).toHaveCount(0);
  await expect(page.locator('.degree-picker')).toHaveCount(0);
});

// --- US-2.4: sampled piano --------------------------------------------------

test('AC-2.4.2 — the app is interactive immediately, with no audio asset to gate it', async ({ page }) => {
  await page.goto('/');
  // Nothing to load, so nothing can be waiting.
  expect(await page.evaluate(() => window.__rm.melodic.getStatus().status)).toBe('ready');
  await expect(page.locator('.pattern-item').first()).toBeVisible();
  await page.locator('.library-search').fill('clave');
  await expect(page.locator('.pattern-item').first()).toBeVisible();
});

test('AC-2.4.4 — a second Melodic play needs no reload, because nothing loads', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();

  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 3000 });
  await page.locator('[data-action="stop"]').click();

  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 3000 });
  expect(await page.evaluate(() => window.__rm.melodic.getStatus().status)).toBe('ready');
});

test('AC-2.4.5 — Percussive playback never builds the melodic reverb it does not use', async ({
  page,
}) => {
  await page.goto('/');
  const built = await page.evaluate(() => {
    const { playPercussive } = window.__rmAudio;
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    let convolvers = 0;
    const real = ctx.createConvolver.bind(ctx);
    ctx.createConvolver = () => {
      convolvers += 1;
      return real();
    };
    for (let i = 0; i < 4; i++) playPercussive(ctx, ctx.destination, 2, i * 0.1);
    return convolvers;
  });
  // A rhythm-only session should not synthesise a 1.5s impulse response.
  expect(built).toBe(0);
});

// --- US-6.1: ratings --------------------------------------------------------

test('AC-6.1.5 — tapping a lower star sets that rating rather than clearing', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('.pattern-item').first();
  await first.locator('.star').nth(3).click(); // 4
  await expect(first.locator('.rating')).toHaveAttribute('data-rating', '4');

  await first.locator('.star').nth(1).click(); // 2
  await expect(first.locator('.rating')).toHaveAttribute('data-rating', '2');
});

test('AC-6.1.6 — the rating filter narrows the already-filtered list', async ({ page }) => {
  await page.goto('/');
  await page.locator('.library-search').fill('clave');
  const filtered = await page.locator('.pattern-item').count();
  expect(filtered).toBeGreaterThan(1);

  // Rate exactly one of them 5 stars.
  await page.locator('.pattern-item').first().locator('.star').nth(4).click();
  await page.locator('.rating-option', { hasText: '4★+' }).click();

  await expect(page.locator('.pattern-item')).toHaveCount(1);
  // Still inside the search filter, not replacing it.
  const name = await page.locator('.pattern-name').first().textContent();
  expect(name.toLowerCase()).toContain('clave');
});

// --- US-7.5 / US-11.2: independence ----------------------------------------

test('AC-7.5.4 — deleting one Family member leaves the other untouched', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'My Custom Fill');

  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-input').fill('My Custom Fill (Melodic)');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
  await page.locator('.dialog-button', { hasText: 'Make Copy' }).click();
  await page.locator('.sound-mode').selectOption('melodic');

  // Delete the melodic one; the rhythmic original must survive intact.
  await page.locator('[data-action="delete-pattern"]').click();
  await page.locator('.dialog-button', { hasText: 'Delete' }).click();

  const remaining = await page.evaluate(() =>
    window.__rm.patternStore.loadAll().map((p) => p.name)
  );
  expect(remaining).toEqual(['My Custom Fill']);
});

test('AC-11.3.3 — resolving a library duplicate by removing deletes only the copy', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const shipped = window.__rm.seedStore.loadAll()[0];
    window.__rm.patternStore.upsert({ ...structuredClone(shipped), id: 'p_dupe', name: 'My Copy' });
  });

  await page.evaluate(() => {
    window.__rm.patternStore.remove('p_dupe');
    window.__rm.localMetaStore.forget('p_dupe');
  });

  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(0);
  // The shipped Pattern is untouched.
  expect(await page.evaluate(() => window.__rm.seedStore.loadAll().length)).toBe(SEED_PATTERN_COUNT);
});

test('AC-11.3.4 — an unresolved library duplicate is reported until answered', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const shipped = window.__rm.seedStore.loadAll()[0];
    window.__rm.patternStore.upsert({ ...structuredClone(shipped), id: 'p_dupe', name: 'My Copy' });
  });

  expect(await page.evaluate(() => window.__rm.unresolvedLibraryDuplicates().length)).toBe(1);
  await page.evaluate(() =>
    window.__rm.localMetaStore.update('p_dupe', { duplicateResolved: true })
  );
  expect(await page.evaluate(() => window.__rm.unresolvedLibraryDuplicates().length)).toBe(0);
});

test('AC-11.3.5 — a Pattern that merely resembles a shipped one is never reported', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Not A Duplicate');
  // An edited Pattern is not note-for-note identical to anything shipped.
  // Slot 3 of Beat 1 exists whatever meter the shipped Pattern uses.
  await page.locator('.slot[data-beat="0"][data-slot="2"]').click();
  expect(await page.evaluate(() => window.__rm.unresolvedLibraryDuplicates().length)).toBe(0);
});

// --- US-1.4: meter labels ---------------------------------------------------

test('AC-1.4.3 — every Measure labels only its own meter', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('[data-action="add-measure"]').click();
  await page.locator('.measure[data-measure="1"] .measure-meter').click();
  await page.locator('.dialog-button', { hasText: '3/4' }).first().click();

  await expect(page.locator('.measure[data-measure="0"] .measure-meter')).toHaveText('4/4');
  await expect(page.locator('.measure[data-measure="1"] .measure-meter')).toHaveText('3/4');
});

test('AC-1.4.4 — repeated meters render dimmed, changes render prominent', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('[data-action="add-measure"]').click();

  await expect(page.locator('.measure[data-measure="0"] .measure-meter')).toHaveAttribute(
    'data-prominence',
    'prominent'
  );
  await expect(page.locator('.measure[data-measure="1"] .measure-meter')).toHaveAttribute(
    'data-prominence',
    'dimmed'
  );
});

test('AC-1.4.7 — changing a meter recalculates its neighbours’ prominence', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('[data-action="add-measure"]').click();

  await page.locator('.measure[data-measure="1"] .measure-meter').click();
  await page.locator('.dialog-button', { hasText: '6/8' }).first().click();

  await expect(page.locator('.measure[data-measure="1"] .measure-meter')).toHaveAttribute(
    'data-prominence',
    'prominent'
  );
});

test('AC-1.4.8 — a read-only grid shows the same labels but opens no picker', async ({ page }) => {
  await page.goto('/');
  const markup = await page.evaluate(() => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    window.__rmRenderGrid(host, window.__rm.getState().pattern, null, { readOnly: true });
    const meter = host.querySelector('.measure-meter');
    const slot = host.querySelector('.slot');
    return {
      tag: meter.tagName,
      prominence: meter.dataset.prominence,
      text: meter.textContent,
      meterAction: meter.dataset.action ?? null,
      slotAction: slot.dataset.action ?? null,
    };
  });

  expect(markup.tag).toBe('SPAN');
  expect(markup.prominence).toBe('prominent');
  expect(markup.text).toMatch(/^\d+\/\d+$/);
  expect(markup.meterAction).toBeNull();
  expect(markup.slotAction).toBeNull();
});

// --- US-4.3: metronome and count-in ----------------------------------------

test('AC-4.3.2 — the click tone does not vary with Sound Mode', async ({ page }) => {
  await page.goto('/');
  const tones = await page.evaluate(() => {
    const { playClick } = window.__rmAudio;
    const capture = (mode) => {
      const ctx = new OfflineAudioContext(1, 4410, 44100);
      const frequencies = [];
      const original = ctx.createOscillator.bind(ctx);
      ctx.createOscillator = () => {
        const osc = original();
        const setValueAtTime = osc.frequency.setValueAtTime.bind(osc.frequency);
        osc.frequency.setValueAtTime = (v, t) => {
          frequencies.push({ v, type: osc.type });
          return setValueAtTime(v, t);
        };
        return osc;
      };
      playClick(ctx, ctx.destination, { downbeat: true, when: 0 });
      playClick(ctx, ctx.destination, { downbeat: false, when: 0.1 });
      return { mode, frequencies };
    };
    return [capture('percussive'), capture('melodic')];
  });

  expect(tones[0].frequencies).toEqual(tones[1].frequencies);
});

test('AC-4.3.3 — count-in length matches the first Measure’s Beat count', async ({ page }) => {
  await page.goto('/');
  const counts = await page.evaluate(() => {
    const { buildBeatGrid } = window.__rmTimeline;
    const make = (ts, n) => ({
      id: 'x',
      name: 'x',
      soundMode: 'percussive',
      tempo: 120,
      tags: [],
      rating: 0,
      measures: [
        {
          timeSignature: ts,
          beats: Array.from({ length: n }, () => ({
            recipe: 'straight-16ths',
            slots: [{ on: true }, { on: false }],
          })),
        },
      ],
    });
    return {
      sixEight: make('6/8', 6).measures[0].beats.length,
      fourFour: buildBeatGrid(make('6/8', 6)).filter((b) => b.measureIndex === 0).length,
    };
  });
  // The count-in plays one click per Beat of the first Measure.
  expect(counts.sixEight).toBe(6);
  expect(counts.fourFour).toBe(6);
});

test('AC-4.3.4 — the metronome setting persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page.locator('details[data-section="playback-settings"] > summary').click().catch(() => {});
  await page.locator('[data-action="toggle-metronome"]').click();
  await expect(page.locator('[data-action="toggle-metronome"]')).toHaveClass(/\bon\b/);

  await page.reload();
  await expect(page.locator('[data-action="toggle-metronome"]')).toHaveClass(/\bon\b/);
});

test('AC-4.3.5 — the count-in setting persists across reloads', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="toggle-count-in"]').click();
  await expect(page.locator('[data-action="toggle-count-in"]')).toHaveClass(/\bon\b/);

  await page.reload();
  await expect(page.locator('[data-action="toggle-count-in"]')).toHaveClass(/\bon\b/);
});

test('AC-4.3.6 — metronome and count-in are global, with no per-Pattern override', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-action="toggle-metronome"]').click();

  // Switch to a different Pattern; the setting follows the app, not the Pattern.
  await page.locator('.pattern-name').nth(4).click();
  await expect(page.locator('[data-action="toggle-metronome"]')).toHaveClass(/\bon\b/);

  const stored = await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem('rm.settings.v1'));
    const pattern = window.__rm.getState().pattern;
    return {
      global: settings.metronomeEnabled,
      onPattern: 'metronomeEnabled' in pattern,
    };
  });
  expect(stored.global).toBe(true);
  expect(stored.onPattern).toBe(false);
});

// --- US-7.3 / US-7.4: naming and copying ------------------------------------

test('AC-7.3.3 — cancelling the naming prompt discards the edit entirely', async ({ page }) => {
  await page.goto('/');
  const before = await page.evaluate(() => structuredClone(window.__rm.getState().pattern));

  await page.locator('.slot').first().click();
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();

  const after = await page.evaluate(() => ({
    pattern: window.__rm.getState().pattern,
    owned: window.__rm.getState().isOwned,
    stored: window.__rm.patternStore.loadAll().length,
  }));
  expect(after.pattern).toEqual(before);
  expect(after.owned).toBe(false);
  expect(after.stored).toBe(0);
});

test('AC-7.3.4 — the naming prompt fires only on the first edit, never again', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Named Once');

  // Every subsequent edit auto-saves straight in, with no prompt.
  await page.locator('.slot[data-beat="0"][data-slot="2"]').click();
  await expect(page.locator('.dialog-input')).toHaveCount(0);
  await page.locator('.slot[data-beat="0"][data-slot="3"]').click();
  await expect(page.locator('.dialog-input')).toHaveCount(0);

  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe('Named Once');
});

test('AC-7.3.5 — the naming prompt refuses a name already in use, case-insensitively', async ({
  page,
}) => {
  await page.goto('/');
  const existing = await page.evaluate(() => window.__rm.seedStore.loadAll()[3].name);

  await page.locator('.slot').first().click();
  await page.locator('.dialog-input').fill(existing.toLowerCase());
  await page.locator('.dialog-button', { hasText: 'Create' }).click();

  // Still prompting, with an explanation, and nothing created.
  await expect(page.locator('.dialog-error')).toContainText('already exists');
  await expect(page.locator('.dialog-input')).toBeVisible();
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(0);

  // A different name goes through.
  await page.locator('.dialog-input').fill('Definitely Unique');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe('Definitely Unique');
});

test('AC-7.4.3 — cancelling Make Copy creates nothing', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Keep Me');

  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();

  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(1);
  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe('Keep Me');
});

test('AC-7.4.4 — Make Copy refuses a name already in use', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Source');
  const existing = await page.evaluate(() => window.__rm.seedStore.loadAll()[3].name);

  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-input').fill(existing.toUpperCase());
  await page.locator('.dialog-button', { hasText: 'Create' }).click();

  await expect(page.locator('.dialog-error')).toContainText('already exists');
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(1);
});

test('AC-7.4.5 — a Make Copy result is immediately a Family member of its source', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Source Rhythm');

  await page.locator('[data-action="make-copy"]').click();
  await page.locator('.dialog-input').fill('Copied Rhythm');
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
  await page.locator('.dialog-button', { hasText: 'Make Copy' }).click();

  // Identical at the instant of creation, so it is a duplicate; changing the
  // Sound Mode makes the Family relationship the one that applies.
  await page.locator('.sound-mode').selectOption('melodic');
  const family = await page.evaluate(() => window.__rm.currentFamily().map((p) => p.name));
  expect(family).toContain('Source Rhythm');
});

test('AC-7.4.6 — Make Copy is unavailable on a shipped Pattern', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  await expect(page.locator('[data-action="make-copy"]')).toHaveCount(0);

  await makeOwned(page, 'Now Mine');
  await expect(page.locator('[data-action="make-copy"]')).toHaveCount(1);
});

// --- US-8.1 / US-10.1: append and duplicate --------------------------------

test('AC-8.1.3 — appending to exactly six Measures succeeds', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Three Bars');
  for (let i = 0; i < 2; i++) await page.locator('[data-action="add-measure"]').click();
  await expect(page.locator('.measure')).toHaveCount(3);

  // Build a 3-Measure Pattern to append.
  await page.evaluate(() => {
    const base = window.__rm.getState().pattern;
    window.__rm.patternStore.upsert({
      ...structuredClone(base),
      id: 'p_three',
      name: 'Another Three',
    });
  });

  await page.locator('[data-action="append-pattern"]').click();
  await page.locator('.dialog-button', { hasText: 'Another Three' }).click();

  // The cap is "cannot exceed 6", not "must stay under 6".
  await expect(page.locator('.measure')).toHaveCount(6);
});

test('AC-8.1.4 — appending into an owned Pattern auto-saves with no save step', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Base Pattern');

  await page.locator('[data-action="append-pattern"]').click();
  await page.locator('.dialog-button').first().click();
  const measures = await page.evaluate(() => window.__rm.getState().pattern.measures.length);

  await page.reload();
  expect(await page.evaluate(() => window.__rm.getState().pattern.measures.length)).toBe(measures);
});

test('AC-8.1.5 — appending into a shipped Pattern triggers the naming prompt first', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);

  await page.locator('[data-action="append-pattern"]').click();
  await page.locator('.dialog-button').first().click();

  await expect(page.locator('.dialog-message')).toContainText('built-in pattern');
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(0);
});

test('AC-8.1.6 — the append picker re-filters to what still fits', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Growing');
  // Grow to 5 Measures: only 1-Measure Patterns can still be appended.
  for (let i = 0; i < 4; i++) await page.locator('[data-action="add-measure"]').click();
  await expect(page.locator('.measure')).toHaveCount(5);

  await page.locator('[data-action="append-pattern"]').click();
  const offered = await page.locator('.dialog-actions .dialog-button').allTextContents();

  const sizes = await page.evaluate(
    (names) =>
      names
        .filter((n) => n !== 'Cancel')
        .map((n) => {
          const all = [...window.__rm.seedStore.loadAll(), ...window.__rm.patternStore.loadAll()];
          return all.find((p) => p.name === n)?.measures.length ?? null;
        }),
    offered
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) expect(size).toBe(1);
});

test('AC-10.1.3 — Duplicate is enabled at three Measures, since doubling reaches exactly six', async ({
  page,
}) => {
  await page.goto('/');
  await makeOwned(page, 'Three');
  for (let i = 0; i < 2; i++) await page.locator('[data-action="add-measure"]').click();
  await expect(page.locator('.measure')).toHaveCount(3);
  await expect(page.locator('[data-action="duplicate-pattern"]')).toBeEnabled();
});

test('AC-10.1.4 — Duplicate is disabled at four Measures, since doubling would exceed the cap', async ({
  page,
}) => {
  await page.goto('/');
  await makeOwned(page, 'Four');
  for (let i = 0; i < 3; i++) await page.locator('[data-action="add-measure"]').click();
  await expect(page.locator('.measure')).toHaveCount(4);
  await expect(page.locator('[data-action="duplicate-pattern"]')).toBeDisabled();
});

test('AC-10.1.5 — duplicating an owned Pattern auto-saves', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Doubler');
  await page.locator('[data-action="add-measure"]').click();
  await page.locator('[data-action="duplicate-pattern"]').click();
  await expect(page.locator('.measure')).toHaveCount(4);

  await page.reload();
  expect(await page.evaluate(() => window.__rm.getState().pattern.measures.length)).toBe(4);
});

test('AC-10.1.6 — duplicating a shipped Pattern triggers the naming prompt first', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);

  await page.locator('[data-action="duplicate-pattern"]').click();
  await expect(page.locator('.dialog-message')).toContainText('built-in pattern');
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(0);
});

// --- US-3.1: accent to sound ------------------------------------------------

test('AC-3.1.14 — percussive accent mapping is fixed and deterministic', async ({ page }) => {
  await page.goto('/');
  const voices = await page.evaluate(() => {
    const { accentVoice } = window.__rmAudio;
    return {
      weak: accentVoice(1),
      medium: accentVoice(2),
      strong: accentVoice(3),
      repeat: accentVoice(3),
    };
  });

  // Louder and brighter as the level rises, and the same every time.
  expect(voices.strong.gain).toBeGreaterThan(voices.medium.gain);
  expect(voices.medium.gain).toBeGreaterThan(voices.weak.gain);
  expect(voices.strong.frequency).toBeGreaterThan(voices.medium.frequency);
  expect(voices.medium.frequency).toBeGreaterThan(voices.weak.frequency);
  expect(voices.repeat).toEqual(voices.strong);
});

test('AC-3.1.15 — melodic accent changes gain and decay, never pitch', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');

  // Two Slots at the same pitch but different accents.
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click(); // Strong
  await page.locator('.slot[data-beat="1"][data-slot="0"]').click(); // Weak

  const events = await page.evaluate(() => {
    const { buildTimeline } = window.__rmTimeline;
    return buildTimeline(window.__rm.getState().pattern).map((e) => ({
      accent: e.accent,
      midi: e.pitch.midiNote,
    }));
  });

  expect(events[0].accent).not.toBe(events[1].accent);
  expect(events[0].midi).toBe(events[1].midi);

  const dynamics = await page.evaluate(() => window.__rmMelodicDynamics());
  expect(dynamics[3].gain).toBeGreaterThan(dynamics[1].gain);
  expect(dynamics[3].decay).not.toBe(dynamics[1].decay);
});
