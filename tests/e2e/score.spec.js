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

const sectionOrder = (page) =>
  page.locator('.main-panel > *').evaluateAll((els) =>
    els
      .filter((e) => !e.classList.contains('main-top-bar'))
      .map((e) => (e.dataset.section ? `${e.tagName}[${e.dataset.section}]` : `${e.tagName}.${e.className.split(' ')[0]}`))
  );

const patternJson = (page) => page.evaluate(() => JSON.stringify(window.__rm.getState().pattern));

/* --- AC-12.2.1 — two views of one Pattern ----------------------------------- */

test('AC-12.2.1/1 — A Grid | Sheet toggle sits at the head of the grid section; the choice is remembered as an app preference across loads, and a first load shows Grid', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
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
  await page.locator('.counting-picker').selectOption('one-e-and-a');
  await expect(labels()).toHaveText(['1', '(e)', '&', '(a)']);
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
