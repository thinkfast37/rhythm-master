import { test, expect } from '@playwright/test';

/**
 * US-12.2 — the sheet music view, proved on the drawn staff: noteheads measured
 * against the staff lines the same svg draws, the printed page inspected under
 * print media, and the print call observed.
 */

test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
});

/** The workbench is tabbed at every width (AC-15.1.7): one group on screen at a time. */
const onTab = (page, name) => page.locator(`.workbench-tab[data-tab="${name}"]`).click();

const DESKTOP = { width: 1100, height: 900 };
const MOBILE = { width: 390, height: 844 };

/** A blank owned 4/4 Pattern, shown as Sheet. */
async function sheet(page, { melodic = false, name = 'Test Pattern' } = {}) {
  await page.goto('/');
  await page.evaluate(
    async ([m, n]) => {
      window.__rm.loadBlank('4/4', n);
      if (m) await window.__rm.handlers.onSoundMode('melodic');
    },
    [melodic, name]
  );
  await page.locator('[data-action="view-sheet"]').click();
  await expect(page.locator('.score')).toBeVisible();
}

/** Turn Slots on through the handler — the grid is hidden while Sheet shows. */
const turnOn = (page, ons) =>
  page.evaluate(async (list) => {
    for (const [m, b, s] of list) await window.__rm.handlers.onSlotTap(m, b, s);
  }, ons);

/** Stamp a degree at an octave onto a sounding Slot. */
const stamp = (page, m, b, s, degree, octaveOffset = 0) =>
  page.evaluate(
    async ([mm, bb, ss, d, o]) => {
      const h = window.__rm.handlers;
      await h.onArmOctave(o);
      await h.onArmDegree(d);
      await h.onStampPitch(mm, bb, ss);
    },
    [m, b, s, degree, octaveOffset]
  );

const noteItem = (page, m, b, s) => page.locator(`.score .note-item[data-measure="${m}"][data-beat="${b}"][data-slot="${s}"]`);
const noteY = async (page, m, b, s) => Number(await noteItem(page, m, b, s).locator('.notehead').getAttribute('cy'));
const lineY = async (page, line) => Number(await page.locator(`.score .staff-line[data-line="${line}"]`).first().getAttribute('y1'));

// The sections of both panes, in document order (AC-15.1.8, AC-15.1.18).
const sectionOrder = (page) =>
  page.locator('.main-panel .pane > *').evaluateAll((els) =>
    els
      .map((e) => (e.dataset.section ? `${e.tagName}[${e.dataset.section}]` : `${e.tagName}.${e.className.split(' ')[0]}`))
  );

const patternJson = (page) => page.evaluate(() => JSON.stringify(window.__rm.getState().pattern));

/* --- AC-12.2.1 — two views of one Pattern ----------------------------------- */

test('AC-12.2.1/1 — A Grid | Sheet toggle sits at the head of the grid section; the choice is remembered as an app preference across loads, and a first load shows Grid', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // A cleared store is a first launch, which opens on the goals screen
  // (AC-14.1.1/1); the main panel is reached by choosing one. Lab, so the
  // panel is the one this criterion was written against (AC-14.1.3/1).
  await page.locator('.goal-card[data-goal="lab"]').click();
  // The toggle heads the grid section, and a first load shows the grid.
  const view = page.locator('.pattern-view');
  await expect(view.locator('> .view-toggle')).toBeVisible();
  await expect(view.locator('.view-toggle .view-button[data-view="grid"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(view.locator('.grid')).toBeVisible();
  await expect(view.locator('.score')).toBeHidden();

  await page.locator('[data-action="view-sheet"]').click();
  await expect(page.locator('.score')).toBeVisible();
  await expect(page.locator('.view-button[data-view="sheet"]')).toHaveAttribute('aria-pressed', 'true');

  // Remembered across a load.
  await page.reload();
  await expect(page.locator('.score')).toBeVisible();
  await expect(page.locator('.grid')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).patternView)).toBe('sheet');

  await page.locator('[data-action="view-grid"]').click();
  await page.reload();
  await expect(page.locator('.grid')).toBeVisible();
});

test('AC-12.2.1/2 — Choosing Sheet replaces the grid with the score in the same place in the main panel; every other section keeps its position', async ({ page }) => {
  await page.goto('/');
  const before = await sectionOrder(page);
  await page.locator('[data-action="view-sheet"]').click();
  await expect(page.locator('.pattern-view > .score')).toBeVisible();
  await expect(page.locator('.pattern-view > .grid')).toBeHidden();
  expect(await sectionOrder(page)).toEqual(before);
  expect(before).toContain('DIV.pattern-view');
});

test('AC-12.2.1/3 — Choosing Grid brings the grid back, with the Pattern exactly as it was', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await turnOn(page, [[0, 0, 0], [0, 2, 1]]);
  const before = await patternJson(page);
  await page.locator('[data-action="view-sheet"]').click();
  await expect(page.locator('.score')).toBeVisible();
  await page.locator('[data-action="view-grid"]').click();
  await expect(page.locator('.grid')).toBeVisible();
  await expect(page.locator('.score')).toBeHidden();
  await expect(page.locator('.slot[data-beat="0"][data-slot="0"]')).toHaveAttribute('data-accent', /[1-3]/);
  expect(await patternJson(page)).toBe(before);
});

test('AC-12.2.1/4 — The score is read-only: it offers no way to change a Slot, an accent, a Recipe or a Pitch, and tapping a note changes nothing', async ({ page }) => {
  await sheet(page);
  await turnOn(page, [[0, 0, 0], [0, 1, 2]]);
  const before = await patternJson(page);
  await expect(page.locator('.score [data-action]')).toHaveCount(0);
  await expect(page.locator('.score button, .score select, .score input')).toHaveCount(0);
  await noteItem(page, 0, 0, 0).click({ force: true });
  await page.locator('.score .rest-item').first().click({ force: true });
  await page.locator('.score .count').first().click({ force: true });
  expect(await patternJson(page)).toBe(before);
});

test('AC-12.2.1/5 — The score always shows the current Pattern: an edit made in the grid is written in the score the next time Sheet is chosen, and a Pattern opened from the library while Sheet is showing is written at once', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4', 'Edited'));
  await page.locator('.slot[data-beat="1"][data-slot="0"]').click();
  await page.locator('[data-action="view-sheet"]').click();
  await expect(noteItem(page, 0, 1, 0)).toHaveCount(1);
  await expect(page.locator('.score-title')).toHaveText('Edited');

  // Back to the grid, another edit, and it is in the score on return.
  await page.locator('[data-action="view-grid"]').click();
  await page.locator('.slot[data-beat="3"][data-slot="2"]').click();
  await page.locator('[data-action="view-sheet"]').click();
  await expect(noteItem(page, 0, 3, 2)).toHaveCount(1);

  // Opening a library Pattern while Sheet shows writes that Pattern at once.
  const opened = await page.evaluate(() => {
    const shipped = window.__rm.seedStore.loadAll()[3];
    window.__rm.handlers.onOpen(shipped.id, false);
    return shipped.name;
  });
  await expect(page.locator('.score-title')).toHaveText(opened);
  await expect(page.locator('.score')).toBeVisible();
});

/* --- AC-12.2.2 — the head ----------------------------------------------------- */

test("AC-12.2.2/1 — The Pattern's name is the title", async ({ page }) => {
  await sheet(page, { name: 'Clave & Friends' });
  await expect(page.locator('.score-head .score-title')).toHaveText('Clave & Friends');
  await page.evaluate(() => window.__rm.handlers.onRename('Renamed'));
  await expect(page.locator('.score-title')).toHaveText('Renamed');
});

/* --- AC-12.2.3 — the single-line staff ----------------------------------------- */

test('AC-12.2.3 — A Percussive Pattern is written on a single-line rhythm staff', async ({ page }) => {
  await sheet(page);
  await turnOn(page, [[0, 0, 0], [0, 1, 0], [0, 1, 2], [0, 3, 3]]);
  const row = page.locator('.score-row').first();
  // One line, a percussion clef, no key signature.
  await expect(row.locator('.staff-line')).toHaveCount(1);
  await expect(row.locator('g.clef rect')).toHaveCount(2);
  await expect(row.locator('.accidental')).toHaveCount(0);
  // Every notehead centred on the line, every stem up.
  const line = Number(await row.locator('.staff-line').getAttribute('y1'));
  const heads = await row.locator('.note-item .notehead').evaluateAll((els) => els.map((e) => Number(e.getAttribute('cy'))));
  expect(heads.length).toBe(4);
  for (const cy of heads) expect(cy).toBeCloseTo(line, 1);
  const stems = await row.locator('.note-item .stem').evaluateAll((els) => els.map((e) => [Number(e.getAttribute('y1')), Number(e.getAttribute('y2'))]));
  for (const [y1, y2] of stems) expect(y2).toBeLessThan(y1);
});

/* --- AC-12.2.5 — the treble staff ----------------------------------------------- */

test('AC-12.2.5/2 — Every notehead sits at the staff position of its letter and octave, as the pitch strip names it: middle C — degree 1, Key C, octave 4 — on the first ledger line below the staff; E4 on the bottom line; B4 on the middle line; F5 on the top line; A5 on the first ledger line above; ledger lines drawn for every position outside the staff', async ({ page }) => {
  await sheet(page, { melodic: true });
  await turnOn(page, [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0], [0, 3, 2]]);
  await stamp(page, 0, 0, 0, '1', 0); // C4
  await stamp(page, 0, 1, 0, '3', 0); // E4
  await stamp(page, 0, 2, 0, '7', 0); // B4
  await stamp(page, 0, 3, 0, '4', 1); // F5
  await stamp(page, 0, 3, 2, '6', 1); // A5

  const row = page.locator('.score-row').first();
  await expect(row.locator('.staff-line')).toHaveCount(5);
  await expect(row.locator('g.clef')).toHaveCount(0);
  await expect(row.locator('path.clef')).toHaveCount(1);

  const bottom = await lineY(page, 0);
  const middle = await lineY(page, 2);
  const top = await lineY(page, 4);
  // The svg's y grows downward, so the bottom line has the largest y.
  const space = (bottom - middle) / 2;
  expect(space).toBeGreaterThan(0);

  // Middle C: below the staff, on its own ledger line, one space below the bottom line.
  const c4 = await noteY(page, 0, 0, 0);
  expect(c4).toBeCloseTo(bottom + space, 1);
  const c4Ledger = noteItem(page, 0, 0, 0).locator('.ledger');
  await expect(c4Ledger).toHaveCount(1);
  expect(Number(await c4Ledger.getAttribute('y1'))).toBeCloseTo(c4, 1);

  expect(await noteY(page, 0, 1, 0)).toBeCloseTo(bottom, 1);
  expect(await noteY(page, 0, 2, 0)).toBeCloseTo(middle, 1);
  expect(await noteY(page, 0, 3, 0)).toBeCloseTo(top, 1);
  await expect(noteItem(page, 0, 1, 0).locator('.ledger')).toHaveCount(0);
  await expect(noteItem(page, 0, 3, 0).locator('.ledger')).toHaveCount(0);

  // A5: one space above the top line, on a ledger line.
  const a5 = await noteY(page, 0, 3, 2);
  expect(a5).toBeCloseTo(top - space, 1);
  const a5Ledger = noteItem(page, 0, 3, 2).locator('.ledger');
  await expect(a5Ledger).toHaveCount(1);
  expect(Number(await a5Ledger.getAttribute('y1'))).toBeCloseTo(a5, 1);

  // An octave lower still: every position outside the staff gets its line — C3 sits below the fourth.
  await stamp(page, 0, 0, 0, '1', -1);
  await expect(noteItem(page, 0, 0, 0).locator('.ledger')).toHaveCount(4);
});

test('AC-12.2.5/7 — A note below the middle line has its stem up and a note on or above it has its stem down; a beamed group takes the direction of its note farthest from the middle line', async ({ page }) => {
  await sheet(page, { melodic: true });
  await turnOn(page, [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 2, 1]]);
  await stamp(page, 0, 0, 0, '3', 0); // E4, below the middle line
  await stamp(page, 0, 1, 0, '7', 0); // B4, on it
  await stamp(page, 0, 2, 0, '3', 0); // E4 …
  await stamp(page, 0, 2, 1, '5', 1); // … beamed with G5, which is farther from the middle

  const stem = async (m, b, s) => {
    const el = noteItem(page, m, b, s).locator('.stem');
    return Number(await el.getAttribute('y2')) - Number(await el.getAttribute('y1'));
  };
  expect(await stem(0, 0, 0)).toBeLessThan(0); // up
  expect(await stem(0, 1, 0)).toBeGreaterThan(0); // down
  expect(await stem(0, 2, 0)).toBeGreaterThan(0); // down, with its group
  expect(await stem(0, 2, 1)).toBeGreaterThan(0);
  await expect(page.locator('.score-row').first().locator('.beam')).not.toHaveCount(0);
});

/* --- AC-12.2.7 — the count ------------------------------------------------------- */

test('AC-12.2.7/4 — Changing the counting system while Sheet is showing relabels the score at once', async ({ page }) => {
  await sheet(page);
  await turnOn(page, [[0, 0, 0], [0, 0, 2]]);
  const labels = () => page.locator('.score .count[data-measure="0"][data-beat="0"]');
  await expect(labels()).toHaveText(['ta', '(ka)', 'di', '(mi)']);
  // The picker is in the playback settings accordion, open at desktop width.
  await onTab(page, 'practice');
  await page.locator('.counting-picker').selectOption('one-e-and-a');
  await expect(labels()).toHaveText(['1', '(e)', '&', '(a)']);
  await onTab(page, 'practice');
  await page.locator('.counting-picker').selectOption('numbered');
  await expect(labels()).toHaveText(['1', '(2)', '3', '(4)']);
});

/* --- AC-12.2.9 — the score follows playback ---------------------------------------- */

test("AC-12.2.9/1 — While playing, exactly one note or rest is marked as current, and it is the one at the transport position's Measure, Beat and Slot, in the line of the pass being played", async ({ page }) => {
  await sheet(page);
  await turnOn(page, [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0]]);
  await page.evaluate(() => window.__rm.handlers.onTempo(240));
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.score .item.playing')).toHaveCount(1, { timeout: 4000 });

  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const marked = page.locator('.score .item.playing');
    if ((await marked.count()) === 1) {
      const [beat, slot, pos] = await Promise.all([
        marked.getAttribute('data-beat'),
        marked.getAttribute('data-slot'),
        page.evaluate(() => window.__rm.getState().transportPosition),
      ]);
      // The one mark is at the transport's own position.
      if (pos && String(pos.beatIndex) === beat) expect(String(pos.slotIndex)).toBe(slot);
      seen.add(beat);
    }
    if (seen.size >= 4) break;
    await page.waitForTimeout(50);
  }
  expect([...seen].sort()).toEqual(['0', '1', '2', '3']);
  await page.locator('[data-action="stop"]').click();
});

test('AC-12.2.9/2 — When playback stops no note or rest is marked', async ({ page }) => {
  await sheet(page);
  await turnOn(page, [[0, 0, 0], [0, 2, 0]]);
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.score .item.playing')).toHaveCount(1, { timeout: 4000 });
  await page.locator('[data-action="stop"]').click();
  await expect(page.locator('.score .item.playing')).toHaveCount(0);
});

/* --- AC-12.2.10 — fitting the width ------------------------------------------------- */

test('AC-12.2.10/1 — A line holds as many whole Measures as fit; the next Measure starts the next line, and a pass always starts a new line', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await sheet(page, { melodic: true });
  await page.evaluate(async () => {
    const h = window.__rm.handlers;
    for (let i = 0; i < 5; i++) await h.onAddMeasure();
    for (let m = 0; m < 6; m++) for (let b = 0; b < 4; b++) for (let s = 0; s < 4; s++) await h.onSlotTap(m, b, s);
    await h.onProgression('I-IV');
  });
  const rows = page.locator('.score-row');
  expect(await rows.count()).toBeGreaterThan(2);
  // Every Measure is whole on its row, in order, and none is split.
  const perRow = await rows.evaluateAll((els) =>
    els.map((row) => ({
      pass: row.dataset.pass,
      measures: [...new Set([...row.querySelectorAll('.note-item')].map((n) => n.dataset.measure))],
      notes: row.querySelectorAll('.note-item').length,
    }))
  );
  for (const row of perRow) {
    expect(row.measures.length).toBeGreaterThan(0);
    expect(row.notes).toBe(row.measures.length * 16);
  }
  const sequence = perRow.flatMap((r) => r.measures.map((m) => `${r.pass}:${m}`));
  const expected = [0, 1].flatMap((p) => [0, 1, 2, 3, 4, 5].map((m) => `${p}:${m}`));
  expect(sequence).toEqual(expected);
  // Pass 2 starts a row of its own, under its label.
  const passOfRow = perRow.map((r) => r.pass);
  const firstOfPass2 = passOfRow.indexOf('1');
  expect(firstOfPass2).toBeGreaterThan(0);
  expect(perRow[firstOfPass2].measures[0]).toBe('0');
  await expect(page.locator('.score-pass-label')).toHaveText(['Pass 1', 'Pass 2']);
});

test('AC-12.2.10/2 — A single Measure wider than the line is scaled down to fit it rather than cut or scrolled, so a 7/4 Measure of Straight 16ths is legible in full at 390px', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  await page.evaluate(async () => {
    window.__rm.loadBlank('7/4');
    const h = window.__rm.handlers;
    for (let b = 0; b < 7; b++) for (let s = 0; s < 4; s++) await h.onSlotTap(0, b, s);
  });
  // The library drawer opens over the panel at this width; close it first.
  await page.locator('.library-toggle').click();
  await page.locator('[data-action="view-sheet"]').click();
  const svg = page.locator('.score-line');
  await expect(svg).toHaveCount(1);
  await expect(svg).toHaveAttribute('data-scaled', 'true');
  await expect(page.locator('.score .note-item')).toHaveCount(28);
  const [svgBox, scoreBox, panel] = await Promise.all([
    svg.boundingBox(),
    page.locator('.score').boundingBox(),
    page.locator('.main-panel').evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })),
  ]);
  expect(svgBox.width).toBeLessThanOrEqual(scoreBox.width + 0.5);
  expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);
  // The last note is inside the drawn width: nothing is cut.
  const last = await page.locator('.score .note-item[data-beat="6"][data-slot="3"]').boundingBox();
  expect(last.x + last.width).toBeLessThanOrEqual(svgBox.x + svgBox.width + 0.5);
});

test("AC-12.2.10/3 — A line carries its own clef and key signature, and a line beginning with a Measure whose meter is the previous Measure's repeats no Time Signature", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await sheet(page, { melodic: true });
  await page.evaluate(async () => {
    const h = window.__rm.handlers;
    await h.onKey('Eb');
    for (let i = 0; i < 5; i++) await h.onAddMeasure();
    for (let m = 0; m < 6; m++) for (let b = 0; b < 4; b++) for (let s = 0; s < 4; s++) await h.onSlotTap(m, b, s);
  });
  const rows = page.locator('.score-row');
  expect(await rows.count()).toBeGreaterThan(1);
  const second = rows.nth(1);
  await expect(second.locator('path.clef')).toHaveCount(1);
  // E♭ major: three flats at the head of the line.
  const heads = await second.locator('.accidental').count();
  expect(heads).toBeGreaterThanOrEqual(3);
  await expect(second.locator('.meter')).toHaveCount(0);
  await expect(rows.first().locator('.meter')).toHaveCount(2);
});

/* --- AC-12.2.11 — printing ------------------------------------------------------------ */

/**
 * Switch the emulated media and let the score settle. The switch changes the
 * score's width, and its ResizeObserver re-renders it in the next frame — after
 * that frame's animation callbacks — so two frames on, the re-render has run.
 * Read before then, a one-shot read can land on the nodes it replaced, which
 * keep their names but compute no style once detached (T412).
 */
const emulateSettled = async (page, media) => {
  await page.emulateMedia({ media });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};

/** Stub the print dialog and count the calls. */
const stubPrint = (page) =>
  page.evaluate(() => {
    window.__printed = 0;
    window.print = () => {
      window.__printed += 1;
    };
  });

test("AC-12.2.11/1 — A Print / PDF control sits with the Grid | Sheet toggle, present only while Sheet is showing, and choosing it opens the browser's print dialog", async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.view-toggle .print-button')).toBeHidden();
  await page.locator('[data-action="view-sheet"]').click();
  await expect(page.locator('.view-toggle .print-button')).toBeVisible();
  await stubPrint(page);
  await page.locator('[data-action="print-score"]').click();
  expect(await page.evaluate(() => window.__printed)).toBe(1);
  await page.locator('[data-action="view-grid"]').click();
  await expect(page.locator('.view-toggle .print-button')).toBeHidden();
});

test('AC-12.2.11/2 — The printed page carries the score alone — head, staves, chord names, pass labels and counting labels — and none of the grid, controls, library, pinned bar or navigation', async ({ page }) => {
  await sheet(page, { melodic: true });
  await turnOn(page, [[0, 0, 0], [0, 2, 0]]);
  await page.evaluate(() => window.__rm.handlers.onProgression('I-IV-V'));
  await stubPrint(page);
  await page.locator('[data-action="print-score"]').click();
  await page.emulateMedia({ media: 'print' });

  const printed = page.locator('.score-print');
  await expect(printed).toBeVisible();
  await expect(printed.locator('.score-title')).toBeVisible();
  await expect(printed.locator('svg.score-line').first()).toBeVisible();
  await expect(printed.locator('.notehead').first()).toBeVisible();
  await expect(printed.locator('.chord-name').first()).toBeVisible();
  await expect(printed.locator('.score-pass-label').first()).toBeVisible();
  await expect(printed.locator('.count').first()).toBeVisible();

  for (const selector of ['.grid', '.pattern-header', '.sidebar', '.main-top-bar', '.pattern-nav', '[data-section="play"]', '.view-toggle', '.pattern-view > .score']) {
    await expect(page.locator(selector).first(), selector).toBeHidden();
  }
});

test("AC-12.2.11/3 — The printed notation is identical to the screen's: the same notes, values, staff positions, accidentals, accents and labels; only the line breaks may differ, laid out to the page's width", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await sheet(page, { melodic: true });
  await page.evaluate(async () => {
    const h = window.__rm.handlers;
    await h.onKey('Eb');
    await h.onAddMeasure();
    await h.onRecipe('triplet-8ths', 0, 1);
    await h.onRecipe('straight-triplet-split', 1, 2);
    for (const [m, b, s] of [[0, 0, 0], [0, 0, 3], [0, 1, 0], [0, 1, 2], [0, 3, 1], [1, 0, 0], [1, 2, 0], [1, 2, 3], [1, 3, 2]]) await h.onSlotTap(m, b, s);
  });
  await stamp(page, 0, 0, 3, 'b7', 0);
  await stamp(page, 1, 3, 2, '#4', 1);
  await stubPrint(page);
  await page.locator('[data-action="print-score"]').click();

  const facts = (root) =>
    page.locator(`${root} .item`).evaluateAll((els) =>
      els.map((e) => ({
        pos: [e.dataset.pass, e.dataset.measure, e.dataset.beat, e.dataset.slot].join(':'),
        note: e.classList.contains('note-item'),
        value: e.dataset.value,
        tuplet: e.dataset.tuplet ?? null,
        step: e.dataset.step,
        accidental: e.querySelector('.accidental')?.getAttribute('transform')?.split('scale')[0].split(' ')[1] ? e.querySelector('.accidental') !== null : false,
        accent: e.querySelector('.accent') !== null,
        dot: e.querySelector('.dot') !== null,
        tie: e.querySelector('.tie') !== null,
      }))
    );
  const labels = (root) => page.locator(`${root} .count`).evaluateAll((els) => els.map((e) => e.textContent));

  const screen = await facts('.pattern-view > .score');
  const paper = await facts('.score-print');
  expect(paper).toEqual(screen);
  expect(screen.length).toBeGreaterThan(8);
  expect(await labels('.score-print')).toEqual(await labels('.pattern-view > .score'));
  expect(screen.filter((f) => f.accidental).length).toBe(2);
});

test('AC-12.2.11/4 — A line is never split across two pages', async ({ page }) => {
  await sheet(page);
  await turnOn(page, [[0, 0, 0]]);
  await stubPrint(page);
  await page.locator('[data-action="print-score"]').click();
  await page.emulateMedia({ media: 'print' });
  const rows = page.locator('.score-print .score-row');
  expect(await rows.count()).toBeGreaterThan(0);
  const styles = await rows.evaluateAll((els) => els.map((e) => getComputedStyle(e).breakInside));
  for (const s of styles) expect(s).toBe('avoid');
});

test("AC-12.2.11/5 — The document's title while printing is the Pattern's name, so a PDF saved from the dialog is named after the Pattern by default", async ({ page }) => {
  await sheet(page, { name: 'Bossa Groove' });
  const before = await page.title();
  await stubPrint(page);
  await page.locator('[data-action="print-score"]').click();
  expect(await page.title()).toBe('Bossa Groove');
  // Once the dialog closes the title and the page are put back.
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  expect(await page.title()).toBe(before);
  await expect(page.locator('.score-print')).toHaveCount(0);
});

test('AC-2.9.3/2 — The score writes each note at the octave the Register sounds it in', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await sheet(page, { melodic: true });
  await turnOn(page, [[0, 0, 0]]);
  await stamp(page, 0, 0, 0, '1', 0); // middle C

  const bottom = await lineY(page, 0);
  const middle = await lineY(page, 2);
  const space = (bottom - middle) / 2;
  const atNormal = await noteY(page, 0, 0, 0);

  await page.evaluate(async () => window.__rm.handlers.onRegister(-2));
  await expect(page.locator('.score')).toBeVisible();
  const atBass = await noteY(page, 0, 0, 0);

  // Two octaves is seven staff steps each, and y grows downward.
  expect(atBass - atNormal).toBeCloseTo(7 * space, 1);
});

/* --- US-12.3 — Note aids: names and degree colours ---------------------------------------- */

const aidsButton = (page) => page.locator('.view-toggle .aids-button');
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const fillOf = (locator) => locator.evaluate((e) => getComputedStyle(e).fill);
/** Eight sounding 16th Slots on Beats 1 and 2, stamped with `degrees` in order. */
async function eightNotes(page, degrees) {
  await page.evaluate(async () => {
    const h = window.__rm.handlers;
    await h.onRecipe('straight-16ths', 0, 0);
    await h.onRecipe('straight-16ths', 0, 1);
    for (let b = 0; b < 2; b++) for (let s = 0; s < 4; s++) await h.onSlotTap(0, b, s);
  });
  for (let i = 0; i < degrees.length; i++) await stamp(page, 0, Math.floor(i / 4), i % 4, degrees[i], 0);
}

test('AC-12.3.1/1 — A Note aids toggle sits with the Grid | Sheet toggle and Print / PDF, shown only while Sheet is showing a Melodic Pattern; it is hidden while Grid is showing and hidden for a Percussive Pattern', async ({ page }) => {
  await sheet(page);
  // Percussive, as Sheet: the toggle is not there.
  await expect(page.locator('.view-toggle .print-button')).toBeVisible();
  await expect(aidsButton(page)).toBeHidden();
  await page.evaluate(() => window.__rm.handlers.onSoundMode('melodic'));
  await expect(aidsButton(page)).toBeVisible();
  // With the Grid | Sheet toggle and Print / PDF, in the one bar.
  await expect(page.locator('.view-toggle > *')).toHaveText(['Grid', 'Sheet', 'Note aids', 'Print / PDF']);
  await page.locator('[data-action="view-grid"]').click();
  await expect(page.locator('.grid')).toBeVisible();
  await expect(aidsButton(page)).toBeHidden();
  await page.locator('[data-action="view-sheet"]').click();
  await expect(aidsButton(page)).toBeVisible();
});

test('AC-12.3.1/2 — The choice is remembered as an app preference across loads, and a first load has it off', async ({ page }) => {
  await sheet(page, { melodic: true });
  await turnOn(page, [[0, 0, 0]]);
  await stamp(page, 0, 0, 0, '1', 0);
  // Off on a first load: the stored settings carry no choice.
  await expect(aidsButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.score .note-name')).toHaveCount(0);
  await aidsButton(page).click();
  await expect(aidsButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.score .note-name')).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).sheetAids)).toBe(true);
  // An app preference, not a Pattern's: nothing on the Pattern says so.
  expect(await patternJson(page)).not.toContain('sheetAids');
  await page.reload();
  await expect(page.locator('.score')).toBeVisible();
  await expect(aidsButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.score .note-name')).toHaveCount(1);
});

test("AC-12.3.1/3 — With Note aids off the score is written as it was before this story: every notehead in the staff's black and no note names", async ({ page }) => {
  await sheet(page, { melodic: true });
  await turnOn(page, [[0, 0, 0], [0, 1, 0]]);
  await stamp(page, 0, 0, 0, '1', 0);
  await stamp(page, 0, 1, 0, 'b2', 0);
  await expect(aidsButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.score .note-name')).toHaveCount(0);
  await expect(page.locator('.score .note-item[data-role]')).toHaveCount(0);
  for (const head of await page.locator('.score .notehead').all()) expect(await fillOf(head)).toBe(rgb('#141414'));
});

test('AC-12.3.1/4 — Switching a Melodic Pattern to Percussive while Note aids is on hides the toggle and writes the plain rhythm staff; the preference is kept, and switching back to Melodic shows the aids again', async ({ page }) => {
  await sheet(page, { melodic: true });
  await turnOn(page, [[0, 0, 0]]);
  await stamp(page, 0, 0, 0, '3', 0);
  await aidsButton(page).click();
  await expect(page.locator('.score .note-name')).toHaveText(['E']);
  await page.evaluate(() => window.__rm.handlers.onSoundMode('percussive'));
  await expect(aidsButton(page)).toBeHidden();
  await expect(page.locator('.score .note-name')).toHaveCount(0);
  await expect(page.locator('.score .staff-line')).toHaveCount(1);
  expect(await fillOf(page.locator('.score .notehead').first())).toBe(rgb('#141414'));
  expect(await page.evaluate(() => window.__rm.getState().settings.sheetAids)).toBe(true);
  await page.evaluate(() => window.__rm.handlers.onSoundMode('melodic'));
  await expect(aidsButton(page)).toBeVisible();
  await expect(aidsButton(page)).toHaveAttribute('aria-pressed', 'true');
  // The aids are back: the Slot, re-pitched by the switch, is named and coloured again.
  await expect(page.locator('.score .note-name')).toHaveCount(1);
  await expect(page.locator('.score .note-item[data-role]')).toHaveCount(1);
});

test("AC-12.3.2/4 — A note's name is written in the same colour as its notehead", async ({ page }) => {
  await sheet(page, { melodic: true });
  await turnOn(page, [[0, 0, 0], [0, 1, 0]]);
  await stamp(page, 0, 0, 0, '5', 0);
  await stamp(page, 0, 1, 0, '2', 1);
  await aidsButton(page).click();
  for (const note of await page.locator('.score .note-item').all()) {
    const head = await fillOf(note.locator('.notehead'));
    expect(head).not.toBe(rgb('#141414'));
    expect(await fillOf(note.locator('.note-name'))).toBe(head);
  }
});

test("AC-12.3.3/2 — A degree in the Pattern's scale takes its colour from the twelve-colour degree scheme of the maintainer's fret-navigator: 1 `#c62828`, ♭2 `#b3541e`, 2 `#8a6d00`, ♭3 `#66790a`, 3 `#2e7d32`, 4 `#00795c`, ♯4/♭5 `#00707e`, 5 `#0b69b7`, ♭6 `#3f51b5`, 6 `#673ab7`, ♭7 `#8e24aa`, 7 `#c2185b`", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await sheet(page, { melodic: true });
  // C Ionian's seven, then an octave of 1.
  await eightNotes(page, ['1', '2', '3', '4', '5', '6', '7', '1']);
  await aidsButton(page).click();
  const heads = page.locator('.score .note-item .notehead');
  await expect(heads).toHaveCount(8);
  const fills = [];
  for (const head of await heads.all()) fills.push(await fillOf(head));
  expect(fills).toEqual(['#c62828', '#8a6d00', '#2e7d32', '#00795c', '#0b69b7', '#673ab7', '#c2185b', '#c62828'].map(rgb));
  await expect(page.locator('.score .note-name')).toHaveText(['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']);

  // The chromatic degrees a scale may hold take the rest of the scheme: C Locrian is 1 ♭2 ♭3 4 ♭5 ♭6 ♭7.
  await page.evaluate(() => window.__rm.handlers.onScale('locrian'));
  await stamp(page, 0, 0, 1, 'b2', 0);
  await stamp(page, 0, 0, 2, 'b3', 0);
  await stamp(page, 0, 1, 0, 'b5', 0);
  await stamp(page, 0, 1, 1, 'b6', 0);
  await stamp(page, 0, 1, 2, 'b7', 0);
  const chromatic = [];
  for (const head of await heads.all()) chromatic.push(await fillOf(head));
  expect(chromatic).toEqual(['#c62828', '#b3541e', '#66790a', '#00795c', '#00707e', '#3f51b5', '#8e24aa', '#c62828'].map(rgb));
  await expect(page.locator('.score .note-item.out-of-scale')).toHaveCount(0);
});

test("AC-12.3.3/3 — A degree outside the Pattern's scale takes its colour from a second set of twelve, none of which is in the scheme — 1 `#ff8a80`, ♭2 `#ffab40`, 2 `#ffe57f`, ♭3 `#ccff90`, 3 `#a5d6a7`, 4 `#80cbc4`, ♯4/♭5 `#84ffff`, 5 `#82b1ff`, ♭6 `#9fa8da`, 6 `#b39ddb`, ♭7 `#ea80fc`, 7 `#f48fb1` — with its notehead ringed in the staff's black and its name on a ground of the same tint; so ♭2 in C Ionian is coloured from the second set and ♭3 in C Aeolian from the scheme", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await sheet(page, { melodic: true });
  // C Ionian: the five chromatic degrees outside it, then three of its own.
  await eightNotes(page, ['b2', 'b3', '#4', 'b6', 'b7', '1', '3', '5']);
  await aidsButton(page).click();
  const notes = page.locator('.score .note-item');
  await expect(notes).toHaveCount(8);
  const out = page.locator('.score .note-item.out-of-scale');
  await expect(out).toHaveCount(5);
  const tints = ['#ffab40', '#ccff90', '#84ffff', '#9fa8da', '#ea80fc'];
  for (let i = 0; i < 5; i++) {
    const note = out.nth(i);
    const head = note.locator('.notehead');
    expect(await fillOf(head)).toBe(rgb(tints[i]));
    // Ringed in the staff's black.
    expect(await head.evaluate((e) => getComputedStyle(e).stroke)).toBe(rgb('#141414'));
    expect(Number.parseFloat(await head.evaluate((e) => getComputedStyle(e).strokeWidth))).toBeGreaterThan(0);
    // The name on a ground of the same tint, in the staff's black.
    await expect(note.locator('.note-name-ground')).toHaveCount(1);
    expect(await fillOf(note.locator('.note-name-ground'))).toBe(rgb(tints[i]));
    expect(await fillOf(note.locator('.note-name'))).toBe(rgb('#141414'));
  }
  // The scale's own take the scheme, unringed and without a ground.
  for (let i = 5; i < 8; i++) {
    const note = notes.nth(i);
    expect(await fillOf(note.locator('.notehead'))).toBe(rgb(['#c62828', '#2e7d32', '#0b69b7'][i - 5]));
    expect(await note.locator('.notehead').evaluate((e) => getComputedStyle(e).stroke)).toBe('none');
    await expect(note.locator('.note-name-ground')).toHaveCount(0);
  }
  // Under C Aeolian the ♭3, ♭6 and ♭7 are the scale's; the ♭2, ♯4 and now the 3 are not.
  await page.evaluate(() => window.__rm.handlers.onScale('aeolian'));
  await expect(page.locator('.score .note-item.out-of-scale')).toHaveCount(3);
  expect(await fillOf(notes.nth(6).locator('.notehead'))).toBe(rgb('#a5d6a7'));
  expect(await fillOf(notes.nth(1).locator('.notehead'))).toBe(rgb('#66790a'));
  expect(await fillOf(notes.nth(0).locator('.notehead'))).toBe(rgb('#ffab40'));
});

test("AC-12.3.3/5 — While playing, the current note's mark (AC-12.2.9) shows over its colour, so the position is never lost among the colours", async ({ page }) => {
  await sheet(page, { melodic: true });
  await turnOn(page, [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 3, 0]]);
  for (const [b, d] of [[0, '1'], [1, 'b2'], [2, '5'], [3, '7']]) await stamp(page, 0, b, 0, d, 0);
  await aidsButton(page).click();
  await page.evaluate(() => window.__rm.handlers.onTempo(60));
  await page.locator('[data-action="play"]').click();
  const playing = page.locator('.score .item.playing');
  await expect(playing).toHaveCount(1, { timeout: 4000 });
  // The score is redrawn on every cursor move, so finding the playing notehead and
  // reading its colour happen in one synchronous step in the page: read in two, a
  // redraw between them leaves a detached element whose computed fill is empty.
  // Polled until a note (not a rest) is the one playing.
  const read = () =>
    page.evaluate(() => {
      const head = document.querySelector('.score .note-item.playing .notehead');
      if (!head) return null;
      const others = [...document.querySelectorAll('.score .note-item:not(.playing) .notehead')];
      return { playing: getComputedStyle(head).fill, others: others.map((h) => getComputedStyle(h).fill) };
    });
  let seen = null;
  await expect
    .poll(
      async () => {
        seen = await read();
        return seen?.playing ?? null;
      },
      { timeout: 4000 }
    )
    .toBe(rgb('#d4880c'));
  // The others keep their colours — read in the same moment as the playing note.
  expect(seen.others.length).toBeGreaterThan(0);
  for (const fill of seen.others) expect(fill).not.toBe(rgb('#d4880c'));
  await page.locator('[data-action="stop"]').click();
  await expect(playing).toHaveCount(0);
});

test("AC-12.3.4/1 — With Note aids on, the printed page carries every note's name and colour as the screen does", async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await sheet(page, { melodic: true });
  await eightNotes(page, ['1', 'b2', '3', '#4', '5', 'b6', '7', '1']);
  await aidsButton(page).click();
  await stubPrint(page);
  await page.locator('[data-action="print-score"]').click();
  await emulateSettled(page, 'print');
  const facts = (root) =>
    page.locator(`${root} .note-item`).evaluateAll((els) =>
      els.map((e) => ({
        role: e.dataset.role,
        inScale: e.dataset.inScale,
        name: e.querySelector('.note-name')?.textContent ?? null,
        fill: getComputedStyle(e.querySelector('.notehead')).fill,
        ground: e.querySelector('.note-name-ground') !== null,
      }))
    );
  const printed = await facts('.score-print');
  expect(printed).toHaveLength(8);
  expect(printed.map((f) => f.name)).toEqual(['C', 'D♭', 'E', 'F♯', 'G', 'A♭', 'B', 'C']);
  expect(printed.map((f) => f.fill)).toEqual(['#c62828', '#ffab40', '#2e7d32', '#84ffff', '#0b69b7', '#9fa8da', '#c2185b', '#c62828'].map(rgb));
  await emulateSettled(page, 'screen');
  expect(printed).toEqual(await facts('.score'));
});

test('AC-12.3.4/2 — With Note aids off, the printed page carries neither', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await sheet(page, { melodic: true });
  await eightNotes(page, ['1', 'b2', '3', '#4', '5', 'b6', '7', '1']);
  await expect(aidsButton(page)).toHaveAttribute('aria-pressed', 'false');
  await stubPrint(page);
  await page.locator('[data-action="print-score"]').click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.score-print .note-item')).toHaveCount(8);
  await expect(page.locator('.score-print .note-name')).toHaveCount(0);
  await expect(page.locator('.score-print .note-item[data-role]')).toHaveCount(0);
  for (const head of await page.locator('.score-print .notehead').all()) expect(await fillOf(head)).toBe(rgb('#141414'));
});
