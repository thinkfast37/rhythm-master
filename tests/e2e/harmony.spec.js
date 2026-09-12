/**
 * Chord progressions layered on a rhythm — the controls, the strip and the grid
 * (US-2.6). The pure resolution is proved in tests/unit/core/harmony.test.js;
 * these prove what the Composer sees and taps.
 */
import { test, expect } from '@playwright/test';

test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
});

/** A blank owned Melodic 4/4 Pattern, where every harmony test starts. */
async function melodicBlank(page, timeSignature = '4/4') {
  await page.goto('/');
  await page.evaluate((ts) => window.__rm.loadBlank(ts), timeSignature);
  await page.locator('.sound-mode').selectOption('melodic');
}

/** The same, with a progression chosen. */
async function harmonicBlank(page, progression = 'I-IV-V') {
  await melodicBlank(page);
  await page.locator('.progression-picker').selectOption(progression);
}

const pattern = (page) => page.evaluate(() => window.__rm.getState().pattern);
const slotAt = (page, beat, slot, measure = 0) =>
  page.locator(`.measure[data-measure="${measure}"] .slot[data-beat="${beat}"][data-slot="${slot}"]`);
const noteBand = (page, beat, slot, measure = 0) => slotAt(page, beat, slot, measure).locator('.slot-note');
const accentZone = (page, beat, slot, measure = 0) => slotAt(page, beat, slot, measure).locator('.slot-accent');
const slotState = (page, beat, slot, measure = 0) =>
  page.evaluate(
    ([m, b, s]) => window.__rm.getState().pattern.measures[m].beats[b].slots[s],
    [measure, beat, slot]
  );
const chordNames = (page) => page.locator('.chord-chip .chord-name').allTextContents();

/** Load a Pattern as if shipped — not owned — so every edit must go through the naming prompt. */
async function loadAsShipped(page) {
  await page.evaluate(() => {
    const p = structuredClone(window.__rm.getState().pattern);
    p.id = 'p_pretend_shipped';
    p.name = 'Pretend Shipped';
    // One extra note, so the copy the naming prompt makes is not a note-for-note
    // duplicate of the owned Pattern it was cloned from (AC-11.1.3 would ask).
    p.measures[0].beats[3].slots[1] = { on: true, pitch: { degree: '5', octaveOffset: 0 } };
    window.__rm.loadPattern(p, { owned: false });
  });
}

// --- AC-2.6.1 — A progression is chosen from a catalogue of named progressions ---

test("AC-2.6.1/1 — The picker offers None and the catalogue: I–IV–V, I–V–vi–IV, vi–IV–I–V, I–vi–IV–V, ii–V–I, I–vi–ii–V, the twelve-bar blues, the Andalusian i–♭VII–♭VI–V, i–iv–v, i–♭VI–♭III–♭VII, I–IV–vi–V, Pachelbel's I–V–vi–iii–IV–I–IV–V, I–♭VII–IV, I–IV, and ii–V", async ({ page }) => {
  await melodicBlank(page);
  const options = await page.locator('.progression-picker option').evaluateAll((os) =>
    os.map((o) => ({ value: o.value, text: o.textContent }))
  );
  expect(options.map((o) => o.value)).toEqual([
    'none', 'I-IV-V', 'I-V-vi-IV', 'vi-IV-I-V', 'I-vi-IV-V', 'ii-V-I', 'I-vi-ii-V', 'twelve-bar-blues',
    'andalusian', 'i-iv-v', 'i-bVI-bIII-bVII', 'I-IV-vi-V', 'pachelbel', 'I-bVII-IV', 'I-IV', 'ii-V',
  ]);
  expect(options[0].text).toBe('None');
  expect(options.map((o) => o.text)).toEqual(
    expect.arrayContaining([
      'I–IV–V', 'I–V–vi–IV (pop)', 'Twelve-bar blues', 'i–♭VII–♭VI–V (Andalusian)',
      'I–V–vi–iii–IV–I–IV–V (Pachelbel)', 'I–♭VII–IV (Mixolydian)', 'ii–V',
    ])
  );
  await expect(page.locator('.progression-picker')).toHaveValue('none');
  // Choosing one names its chords in the Key.
  await page.locator('.progression-picker').selectOption('I-IV-V');
  expect(await chordNames(page)).toEqual(['C', 'F', 'G']);
});

// --- AC-2.6.2 — Each chord's root and quality are adjusted individually ---

test('AC-2.6.2/1 — The quality picker offers major, minor, diminished, augmented, sus2, sus4, 6, m6, maj7, m7, 7, m7♭5, dim7, mMaj7, 7sus4, add9, 9, maj9 and m9', async ({ page }) => {
  await harmonicBlank(page);
  const labels = await page.locator('.chord-editor[data-chord="0"] .chord-quality option').allTextContents();
  expect(labels).toEqual([
    'major', 'minor', 'diminished', 'augmented', 'sus2', 'sus4', '6', 'm6', 'maj7', 'm7', '7',
    'm7♭5', 'dim7', 'mMaj7', '7sus4', 'add9', '9', 'maj9', 'm9',
  ]);
  // Setting one changes that chord alone, in the editor and on the strip.
  await page.locator('.chord-editor[data-chord="0"] .chord-quality').selectOption('maj7');
  expect(await chordNames(page)).toEqual(['Cmaj7', 'F', 'G']);
  await expect(page.locator('.chord-editor[data-chord="0"] .chord-editor-name')).toHaveText('Cmaj7');
  // And the root of another.
  await page.locator('.chord-editor[data-chord="1"] .chord-root').selectOption('b3');
  expect(await chordNames(page)).toEqual(['Cmaj7', 'Eb', 'G']);
  // Add and remove.
  await page.locator('.add-chord').click();
  expect(await chordNames(page)).toEqual(['Cmaj7', 'Eb', 'G', 'G']);
  await page.locator('.chord-editor[data-chord="3"] .remove-chord').click();
  expect(await chordNames(page)).toEqual(['Cmaj7', 'Eb', 'G']);
});

test('AC-2.6.2/6 — Editing a chord on a shipped Pattern goes through the naming prompt, as the Key does', async ({ page }) => {
  await harmonicBlank(page);
  await loadAsShipped(page);
  await expect(page.locator('.chord-strip')).toBeVisible();

  await page.locator('.chord-editor[data-chord="0"] .chord-quality').selectOption('maj7');
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog-button:not(.primary)', { hasText: 'Cancel' }).click();

  // Cancelled: nothing changed, still not owned.
  expect(await chordNames(page)).toEqual(['C', 'F', 'G']);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);

  // Confirmed: the edit lands on a named copy.
  await page.locator('.chord-editor[data-chord="0"] .chord-quality').selectOption('maj7');
  await page.locator('.dialog-input').fill('My progression');
  await page.locator('.dialog-button.primary').click();
  await expect.poll(() => chordNames(page)).toEqual(['Cmaj7', 'F', 'G']);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(true);
  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe('My progression');
});

// --- AC-2.6.5 — The pitch strip offers chord-tone roles while a progression is active ---

test('AC-2.6.5/1 — The role chips are on the pitch strip when the Pattern has a progression, and absent when it does not', async ({ page }) => {
  await melodicBlank(page);
  await expect(page.locator('.pitch-strip .tone')).toHaveCount(0);
  await page.locator('.progression-picker').selectOption('I-IV-V');
  await expect(page.locator('.pitch-strip .tone')).toHaveCount(5);
  expect(await page.locator('.pitch-strip .tone .degree-number').allTextContents()).toEqual(['R', '3', '5', '7', '9']);
  // Beside the degree chips, which stay.
  await expect(page.locator('.pitch-strip .degree')).toHaveCount(12);
  await page.locator('.progression-picker').selectOption('none');
  await expect(page.locator('.pitch-strip .tone')).toHaveCount(0);
});

test("AC-2.6.5/2 — Arming a role and tapping a sounding Slot's note band stores a chord-tone Pitch, leaving its Accent Level as it was", async ({ page }) => {
  await harmonicBlank(page);
  await accentZone(page, 0, 0).click();
  await accentZone(page, 0, 0).click(); // an explicit override, to prove it survives
  const before = await slotState(page, 0, 0);

  await page.locator('.tone[data-tone="3"]').click();
  await expect(page.locator('.tone[data-tone="3"]')).toHaveAttribute('aria-pressed', 'true');
  await noteBand(page, 0, 0).click();

  const after = await slotState(page, 0, 0);
  expect(after.pitch).toEqual({ tone: 3, octaveOffset: 0 });
  expect(after.accent).toBe(before.accent);
  expect(after.on).toBe(true);
  await expect(slotAt(page, 0, 0).locator('.slot-degree')).toHaveText('3');
});

test('AC-2.6.5/3 — Each role chip names the note it sounds under the chord in force, and a role that chord lacks says which member stands in', async ({ page }) => {
  await harmonicBlank(page); // C, F, G triads; chord in force at rest is C
  await expect(page.locator('.tone[data-tone="1"] .degree-name')).toHaveText('C4');
  await expect(page.locator('.tone[data-tone="3"] .degree-name')).toHaveText('E4');
  await expect(page.locator('.tone[data-tone="5"] .degree-name')).toHaveText('G4');
  // A triad has no 7th: the chip says its 5th stands in.
  await expect(page.locator('.tone[data-tone="7"]')).toHaveAttribute('data-stand-in', '5');
  await expect(page.locator('.tone[data-tone="7"] .degree-name')).toHaveText('as 5 · G4');
  // Give the C a 7th and the chip becomes a real member.
  await page.locator('.chord-editor[data-chord="0"] .chord-quality').selectOption('maj7');
  await expect(page.locator('.tone[data-tone="7"]')).not.toHaveAttribute('data-stand-in');
  await expect(page.locator('.tone[data-tone="7"] .degree-name')).toHaveText('B4');
  // The Key moves every name.
  await page.locator('.key-picker').selectOption('G');
  await expect(page.locator('.tone[data-tone="3"] .degree-name')).toHaveText('B4');
});

test('AC-2.6.5/4 — Arming a role disarms an armed degree and arming a degree disarms the role, so the strip holds one armed pitch', async ({ page }) => {
  await harmonicBlank(page);
  // Choosing the progression re-read the armed tonic as the Root (AC-2.6.1/7).
  await expect(page.locator('.tone[aria-pressed="true"]')).toHaveAttribute('data-tone', '1');
  await expect(page.locator('.degree[aria-pressed="true"]')).toHaveCount(0);
  await page.locator('.tone[data-tone="5"]').click();
  await expect(page.locator('.tone[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('.degree[aria-pressed="true"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rm.getState().armedPitch)).toEqual({ tone: 5, octaveOffset: 0 });

  await page.locator('.degree[data-degree="3"]').click();
  await expect(page.locator('.degree[aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('.tone[aria-pressed="true"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rm.getState().armedPitch)).toEqual({ degree: '3', octaveOffset: 0 });
});

test('AC-2.6.5/5 — The octave stepper applies to a role exactly as to a degree', async ({ page }) => {
  await harmonicBlank(page);
  await page.locator('.tone[data-tone="3"]').click();
  await page.locator('[data-action="octave-up"]').click();
  await expect(page.locator('.octave-readout')).toHaveText('Oct 5');
  await expect(page.locator('.tone[data-tone="3"] .degree-name')).toHaveText('E5');
  await expect(page.locator('.tone[data-tone="3"]')).toHaveAttribute('aria-pressed', 'true');

  await accentZone(page, 1, 0).click();
  await noteBand(page, 1, 0).click();
  expect((await slotState(page, 1, 0)).pitch).toEqual({ tone: 3, octaveOffset: 1 });
  await expect(slotAt(page, 1, 0).locator('.slot-note-name')).toHaveText('E5');
});

test('AC-2.6.5/6 — Turning a Slot on while a role is armed gives it that role', async ({ page }) => {
  await harmonicBlank(page);
  await page.locator('.tone[data-tone="5"]').click();
  await accentZone(page, 2, 0).click();
  const slot = await slotState(page, 2, 0);
  expect(slot.on).toBe(true);
  expect(slot.pitch).toEqual({ tone: 5, octaveOffset: 0 });
  await expect(slotAt(page, 2, 0).locator('.slot-degree')).toHaveText('5');
  await expect(slotAt(page, 2, 0).locator('.slot-note-name')).toHaveText('G4');
});

test('AC-2.6.5/7 — While a Pattern has a progression but no Slot holds a role, the harmony section says so and points at the role chips and Fill', async ({ page }) => {
  await melodicBlank(page);
  await expect(page.locator('.harmony-hint')).toHaveCount(0);
  await page.locator('.progression-picker').selectOption('I-IV-V');
  // Nothing sounds yet, so nothing holds a role: the hint is up.
  const hint = page.locator('.harmony-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Fill');
  await expect(hint).toContainText('chord tone');
  // The armed pitch was re-read as the Root, so the first Slot turned on holds a role.
  await accentZone(page, 0, 0).click();
  expect((await slotState(page, 0, 0)).pitch).toEqual({ tone: 1, octaveOffset: 0 });
  await expect(page.locator('.harmony-hint')).toHaveCount(0);
  // A fixed degree stamped over it brings the hint back.
  await page.locator('.degree[data-degree="2"]').click();
  await noteBand(page, 0, 0).click();
  await expect(page.locator('.harmony-hint')).toBeVisible();
});

// --- AC-2.6.6 — Fill deals chord tones across the sounding Slots ---

test('AC-2.6.6/1 — The orders offered are Ascending, Descending, Up and down, Alberti, Root only, and Root and fifth', async ({ page }) => {
  await harmonicBlank(page);
  expect(await page.locator('.fill-order option').allTextContents()).toEqual([
    'Ascending', 'Descending', 'Up and down', 'Alberti', 'Root only', 'Root and fifth',
  ]);
  // Fill deals over the sounding Slots in the chosen order.
  for (const s of [0, 1, 2, 3]) await accentZone(page, 0, s).click();
  await page.locator('.fill-order').selectOption('alberti');
  await page.locator('.fill-chord-tones').click();
  expect(await page.locator('.measure[data-measure="0"] .beat[data-beat="0"] .slot-degree').allTextContents()).toEqual(['R', '5', '3', '5']);
});

test('AC-2.6.6/7 — Fill on a shipped Pattern goes through the naming prompt', async ({ page }) => {
  await harmonicBlank(page);
  await accentZone(page, 0, 0).click();
  await loadAsShipped(page);
  await page.locator('.fill-chord-tones').click();
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog-button:not(.primary)', { hasText: 'Cancel' }).click();
  // Cancelled: the Slot keeps the Root it had (the re-read armed pitch), and nothing is owned.
  expect((await slotState(page, 0, 0)).pitch).toEqual({ tone: 1, octaveOffset: 0 });
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
});

// --- AC-2.6.7 — The progression is visible while playing ---

test('AC-2.6.7/1 — A chord strip above the grid lists every chord of the progression in order, each with its numeral and its name in the Key', async ({ page }) => {
  await harmonicBlank(page, 'ii-V-I');
  const strip = page.locator('.chord-strip');
  await expect(strip).toBeVisible();
  // Above the grid in the panel's order.
  const order = await page.evaluate(() => {
    const strip = document.querySelector('.chord-strip');
    const grid = document.querySelector('.grid');
    return strip.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING ? 'strip-first' : 'grid-first';
  });
  expect(order).toBe('strip-first');
  expect(await strip.locator('.chord-numeral').allTextContents()).toEqual(['ii7', 'V7', 'Imaj7']);
  expect(await chordNames(page)).toEqual(['Dm7', 'G7', 'Cmaj7']);
  await page.locator('.key-picker').selectOption('F');
  expect(await chordNames(page)).toEqual(['Gm7', 'C7', 'Fmaj7']);
});

test('AC-2.6.7/2 — The chord in force is marked Now and the chord that follows it Next, by a word as well as a colour, and the marks move as playback reaches each chord', async ({ page }) => {
  await harmonicBlank(page);
  await page.evaluate(() => window.__rm.handlers.onTempo(300)); // a 0.8s pass
  await accentZone(page, 0, 0).click();

  await expect(page.locator('.chord-chip.now')).toHaveAttribute('data-chord', '0');
  await expect(page.locator('.chord-chip.now .chord-mark')).toHaveText('Now');
  await expect(page.locator('.chord-chip.next')).toHaveAttribute('data-chord', '1');
  await expect(page.locator('.chord-chip.next .chord-mark')).toHaveText('Next');

  await page.locator('[data-action="play"]').click();
  await expect
    .poll(() => page.locator('.chord-chip.now').getAttribute('data-chord'), { timeout: 5000 })
    .toBe('1');
  await expect(page.locator('.chord-chip.next')).toHaveAttribute('data-chord', '2');
  await page.locator('[data-action="stop"]').click();
  // Back at rest: the first pass again.
  await expect(page.locator('.chord-chip.now')).toHaveAttribute('data-chord', '0');
});

test("AC-2.6.7/3 — With the chord changing every Measure, each Measure's header names the chord it sounds in the pass being played", async ({ page }) => {
  await harmonicBlank(page);
  await page.evaluate(() => window.__rm.handlers.onAddMeasure());
  await expect(page.locator('.measure-chord')).toHaveCount(0);
  await page.locator('.chord-change[data-change="measure"]').click();
  await expect(page.locator('.measure-chord')).toHaveCount(2);
  expect(await page.locator('.measure-chord').allTextContents()).toEqual(['C', 'F']);
  await expect(page.locator('.measure[data-measure="1"] .measure-chord')).toHaveAttribute('data-chord', '1');
  // Rendered for a later pass, the headers move on: pass 1 of two Measures is chords 2 and 0.
  await page.evaluate(() => {
    const p = window.__rm.getState().pattern;
    window.__rmRenderGrid(document.querySelector('.grid'), p, { loop: 1, measureIndex: 0, beatIndex: 0, slotIndex: 0 });
  });
  expect(await page.locator('.measure-chord').allTextContents()).toEqual(['G', 'C']);
});

test('AC-2.6.7/4 — At rest, the chord strip and the Measure headers show the first pass', async ({ page }) => {
  await harmonicBlank(page);
  await page.evaluate(() => window.__rm.handlers.onAddMeasure());
  await page.locator('.chord-change[data-change="measure"]').click();
  await expect(page.locator('.chord-strip')).toHaveAttribute('data-pass', '0');
  await expect(page.locator('.chord-chip.now')).toHaveAttribute('data-chord', '0');
  await expect(page.locator('.chord-chip.next')).toHaveAttribute('data-chord', '1');
  expect(await page.locator('.measure-chord').allTextContents()).toEqual(['C', 'F']);
  // Every pass: Measure headers carry no chord, the strip still marks the first.
  await page.locator('.chord-change[data-change="pass"]').click();
  await expect(page.locator('.measure-chord')).toHaveCount(0);
  await expect(page.locator('.chord-chip.now')).toHaveAttribute('data-chord', '0');
});

test("AC-2.6.7/5 — A chord-tone Slot's note band shows its role and the note it sounds under the chord governing it in the current pass, updating as the chord changes", async ({ page }) => {
  await harmonicBlank(page);
  await page.evaluate(() => window.__rm.handlers.onAddMeasure());
  await page.locator('.tone[data-tone="3"]').click();
  await accentZone(page, 0, 0, 1).click();
  await expect(slotAt(page, 0, 0, 1).locator('.slot-degree')).toHaveText('3');
  await expect(slotAt(page, 0, 0, 1).locator('.slot-note-name')).toHaveText('E4');
  // Under "every Measure", Measure 2 is the IV: the same Slot now reads A4.
  await page.locator('.chord-change[data-change="measure"]').click();
  await expect(slotAt(page, 0, 0, 1).locator('.slot-note-name')).toHaveText('A4');
  await expect(slotAt(page, 0, 0, 1).locator('.slot-degree')).toHaveText('3');
  // And in a later pass, the chord that pass brings.
  await page.evaluate(() => {
    const p = window.__rm.getState().pattern;
    window.__rmRenderGrid(document.querySelector('.grid'), p, { loop: 1, measureIndex: 0, beatIndex: 0, slotIndex: 0 });
  });
  await expect(slotAt(page, 0, 0, 1).locator('.slot-note-name')).toHaveText('E4'); // chord 3 mod 3 = I
});

test('AC-2.6.7/6 — The chord strip is absent on a Pattern with no progression, and on a Percussive Pattern', async ({ page }) => {
  await melodicBlank(page);
  await expect(page.locator('.chord-strip')).toBeHidden();
  await expect(page.locator('.chord-chip')).toHaveCount(0);
  await page.locator('.progression-picker').selectOption('I-IV-V');
  await expect(page.locator('.chord-strip')).toBeVisible();
  await page.locator('.sound-mode').selectOption('percussive');
  await expect(page.locator('.chord-strip')).toBeHidden();
  await expect(page.locator('.chord-chip')).toHaveCount(0);
  await expect(page.locator('.harmony')).toBeHidden();
});

// --- AC-2.6.8 — The progression is saved with the Pattern ---

test('AC-2.6.8/1 — A progression, its chord edits and the change setting survive closing and reopening the Pattern', async ({ page }) => {
  await harmonicBlank(page); // owned Pattern p_test
  await page.locator('.chord-editor[data-chord="2"] .chord-quality').selectOption('7');
  await page.locator('.chord-change[data-change="measure"]').click();
  const saved = (await pattern(page)).harmony;

  await page.evaluate(() => window.__rm.loadBlank('3/4', 'Elsewhere'));
  await expect(page.locator('.chord-strip')).toBeHidden();
  await page.evaluate(() => window.__rm.handlers.onOpen('p_test', true));
  expect((await pattern(page)).harmony).toEqual(saved);
  expect(saved).toEqual({
    change: 'measure',
    chords: [
      { degree: '1', quality: 'maj' },
      { degree: '4', quality: 'maj' },
      { degree: '5', quality: '7' },
    ],
  });
  expect(await chordNames(page)).toEqual(['C', 'F', 'G7']);
  await expect(page.locator('.chord-change[data-change="measure"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.progression-picker')).toHaveValue('custom');
});

test('AC-2.6.8/3 — Switching to Percussive removes the progression along with the Key, scale and Pitch data', async ({ page }) => {
  await harmonicBlank(page);
  await page.locator('.tone[data-tone="3"]').click();
  await accentZone(page, 0, 0).click();
  await page.locator('.sound-mode').selectOption('percussive');
  const p = await pattern(page);
  expect('harmony' in p).toBe(false);
  expect('key' in p).toBe(false);
  expect('pitch' in p.measures[0].beats[0].slots[0]).toBe(false);
  // Back to Melodic: no progression, and the sounding Slot takes a degree it can sound.
  await page.locator('.sound-mode').selectOption('melodic');
  await expect(page.locator('.progression-picker')).toHaveValue('none');
  expect((await slotState(page, 0, 0)).pitch).toEqual({ degree: '1', octaveOffset: 0 });
});
