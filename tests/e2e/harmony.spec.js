/**
 * Chord progressions layered on a rhythm — the controls, the strip and the grid
 * (US-2.6). The pure resolution is proved in tests/unit/core/harmony.test.js;
 * these prove what the Composer sees and taps.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

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
  await page.locator('.sound-mode [data-mode="melodic"]').click();
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

test('AC-2.6.1/1 — The picker offers None first, then every catalogue entry under seven group headings in this order: Three chords and repeats, Pop, Minor, Jazz, Blues, Modal and rock, Classical and folk', async ({ page }) => {
  await melodicBlank(page);
  const picker = page.locator('.progression-picker');
  // None stands first, outside every group.
  const first = await picker.locator(':scope > :first-child').evaluate((n) => ({ tag: n.tagName, value: n.value, text: n.textContent }));
  expect(first).toEqual({ tag: 'OPTION', value: 'none', text: 'None' });
  // Then the seven headings, in order.
  const headings = await picker.locator('optgroup').evaluateAll((gs) => gs.map((g) => g.label));
  expect(headings).toEqual([
    'Three chords and repeats', 'Pop', 'Minor', 'Jazz', 'Blues', 'Modal and rock', 'Classical and folk',
  ]);
  // Every option but None sits under a heading, and the catalogue is the whole of it.
  const stray = await picker.locator(':scope > option').count();
  expect(stray).toBe(1);
  const grouped = await picker.locator('optgroup option').count();
  const { PROGRESSIONS } = await import('../../src/core/harmony.js');
  expect(grouped).toBe(PROGRESSIONS.length);
  expect(grouped).toBeGreaterThanOrEqual(86);
  await expect(picker).toHaveValue('none');
  // Choosing one names its chords in the Key.
  await picker.selectOption('I-IV-V');
  expect(await chordNames(page)).toEqual(['C', 'F', 'G']);
  // And Custom is not on offer until the chords stop matching the catalogue.
  expect(await picker.locator('option[value="custom"]').count()).toBe(0);
});

/** The entries under one heading, as [value, label] pairs, in order. */
const groupEntries = (page, heading) =>
  page
    .locator(`.progression-picker optgroup[label="${heading}"] option`)
    .evaluateAll((os) => os.map((o) => [o.value, o.textContent]));

/** Choose an entry and read the chord names on the strip. */
async function chooseAndRead(page, id) {
  await page.locator('.progression-picker').selectOption(id);
  await expect(page.locator('.progression-picker')).toHaveValue(id);
  return chordNames(page);
}

test('AC-2.6.1/8 — The Three chords and repeats group holds I–IV–V, I–I–IV–V, I–IV–IV–V, I–IV–V–V, I–IV–V–IV, I–IV–V–I, I–IV–I–V, I–V–IV, I–V–IV–I, I–IV and I–V', async ({ page }) => {
  await melodicBlank(page);
  expect(await groupEntries(page, 'Three chords and repeats')).toEqual([
    ['I-IV-V', 'I–IV–V'],
    ['I-I-IV-V', 'I–I–IV–V'],
    ['I-IV-IV-V', 'I–IV–IV–V'],
    ['I-IV-V-V', 'I–IV–V–V (La Bamba)'],
    ['I-IV-V-IV', 'I–IV–V–IV (Wild Thing)'],
    ['I-IV-V-I', 'I–IV–V–I'],
    ['I-IV-I-V', 'I–IV–I–V'],
    ['I-V-IV', 'I–V–IV'],
    ['I-V-IV-I', 'I–V–IV–I'],
    ['I-IV', 'I–IV'],
    ['I-V', 'I–V'],
  ]);
  // The repeat shapes hold the chord they double, in C.
  expect(await chooseAndRead(page, 'I-I-IV-V')).toEqual(['C', 'C', 'F', 'G']);
  expect(await chooseAndRead(page, 'I-IV-IV-V')).toEqual(['C', 'F', 'F', 'G']);
  expect(await chooseAndRead(page, 'I-IV-V-V')).toEqual(['C', 'F', 'G', 'G']);
});

test("AC-2.6.1/9 — The Pop group holds I–V–vi–IV, vi–IV–I–V, IV–I–V–vi, V–vi–IV–I, IV–V–vi–I, I–vi–IV–V, I–IV–vi–V, I–V–vi–iii, I–iii–vi–IV, I–ii–IV–V, I–IV–ii–V, I–ii–iii–IV, vi–V–IV–III, the Royal Road IV–V–iii–vi, Creep's I–III–IV–iv, I–IV–iv–I, Something's I–Imaj7–I7–IV and Wonderwall's vi–I–V–II", async ({ page }) => {
  await melodicBlank(page);
  expect(await groupEntries(page, 'Pop')).toEqual([
    ['I-V-vi-IV', 'I–V–vi–IV (pop)'],
    ['vi-IV-I-V', 'vi–IV–I–V'],
    ['IV-I-V-vi', 'IV–I–V–vi'],
    ['V-vi-IV-I', 'V–vi–IV–I'],
    ['IV-V-vi-I', 'IV–V–vi–I'],
    ['I-vi-IV-V', 'I–vi–IV–V (’50s)'],
    ['I-IV-vi-V', 'I–IV–vi–V'],
    ['I-V-vi-iii', 'I–V–vi–iii'],
    ['I-iii-vi-IV', 'I–iii–vi–IV'],
    ['I-ii-IV-V', 'I–ii–IV–V'],
    ['I-IV-ii-V', 'I–IV–ii–V'],
    ['I-ii-iii-IV', 'I–ii–iii–IV (ascending)'],
    ['vi-V-IV-III', 'vi–V–IV–III (Andalusian, relative minor)'],
    ['IV-V-iii-vi', 'IV–V–iii–vi (Royal Road)'],
    ['I-III-IV-iv', 'I–III–IV–iv (Creep)'],
    ['I-IV-iv-I', 'I–IV–iv–I (minor four)'],
    ['I-Imaj7-I7-IV', 'I–Imaj7–I7–IV (Something)'],
    ['vi-I-V-II', 'vi–I–V–II (Wonderwall)'],
  ]);
  expect(await chooseAndRead(page, 'IV-V-iii-vi')).toEqual(['Fmaj7', 'G7', 'Em7', 'Am']);
  expect(await chooseAndRead(page, 'I-III-IV-iv')).toEqual(['C', 'E', 'F', 'Fm']);
  expect(await chooseAndRead(page, 'vi-I-V-II')).toEqual(['Am7', 'C', 'G', 'D7sus4']);
});

test("AC-2.6.1/10 — The Minor group holds i–iv–v, i–i–iv–v, i–iv–iv–v, i–iv–v–v, i–iv–V, i–i–iv–V, i–iv–iv–V, i–iv–V–V, i–iv–i–V, i–♭VI–♭III–♭VII, the Andalusian i–♭VII–♭VI–V, the Aeolian vamp i–♭VII–♭VI–♭VII, i–♭VI–♭VII, i–♭VII–♭VI, i–♭III–♭VII–♭VI, i–iv–♭VII–♭III, ♭VI–♭VII–i and Hotel California's i–V–♭VII–IV–♭VI–♭III–iv–V", async ({ page }) => {
  await melodicBlank(page);
  expect(await groupEntries(page, 'Minor')).toEqual([
    ['i-iv-v', 'i–iv–v'],
    ['i-i-iv-v', 'i–i–iv–v'],
    ['i-iv-iv-v', 'i–iv–iv–v'],
    ['i-iv-v-v', 'i–iv–v–v'],
    ['i-iv-V', 'i–iv–V (harmonic minor)'],
    ['i-i-iv-V', 'i–i–iv–V'],
    ['i-iv-iv-V', 'i–iv–iv–V'],
    ['i-iv-V-V', 'i–iv–V–V'],
    ['i-iv-i-V', 'i–iv–i–V'],
    ['i-bVI-bIII-bVII', 'i–♭VI–♭III–♭VII'],
    ['andalusian', 'i–♭VII–♭VI–V (Andalusian)'],
    ['i-bVII-bVI-bVII', 'i–♭VII–♭VI–♭VII (Aeolian vamp)'],
    ['i-bVI-bVII', 'i–♭VI–♭VII'],
    ['i-bVII-bVI', 'i–♭VII–♭VI'],
    ['i-bIII-bVII-bVI', 'i–♭III–♭VII–♭VI'],
    ['i-iv-bVII-bIII', 'i–iv–♭VII–♭III'],
    ['bVI-bVII-i', '♭VI–♭VII–i'],
    ['hotel-california', 'i–V–♭VII–IV–♭VI–♭III–iv–V (Hotel California)'],
  ]);
  // Minor entries are minor under the default scale too: they carry their qualities.
  expect(await chooseAndRead(page, 'i-iv-v-v')).toEqual(['Cm', 'Fm', 'Gm', 'Gm']);
  expect(await chooseAndRead(page, 'i-iv-V')).toEqual(['Cm', 'Fm', 'G']);
  expect(await chooseAndRead(page, 'hotel-california')).toEqual(['Cm', 'G', 'Bb', 'F', 'Ab', 'Eb', 'Fm', 'G']);
});

test("AC-2.6.1/11 — The Jazz group holds ii–V–I, ii–V, ii–V–I–I, the ii–V–I–VI7 turnaround, I–vi–ii–V, iii–vi–ii–V, I–VI7–ii–V, the minor ii°–V–i, the ragtime III7–VI7–II7–V7–I, the backdoor iv–♭VII–I, the tritone substitution ii–♭II–I, Autumn Leaves' iv–♭VII–♭III–♭VI–ii°–V–i, the Coltrane changes and the circle of fifths in sevenths", async ({ page }) => {
  await melodicBlank(page);
  expect(await groupEntries(page, 'Jazz')).toEqual([
    ['ii-V-I', 'ii–V–I (jazz)'],
    ['ii-V', 'ii–V'],
    ['ii-V-I-I', 'ii–V–I–I'],
    ['ii-V-I-VI7', 'ii–V–I–VI7 (turnaround)'],
    ['I-vi-ii-V', 'I–vi–ii–V (turnaround)'],
    ['iii-vi-ii-V', 'iii–vi–ii–V'],
    ['I-VI7-ii-V', 'I–VI7–ii–V'],
    ['iio-V-i', 'ii°–V–i (minor)'],
    ['ragtime', 'III7–VI7–II7–V7–I (ragtime)'],
    ['backdoor', 'iv–♭VII–I (backdoor)'],
    ['tritone', 'ii–♭II–I (tritone substitution)'],
    ['autumn-leaves', 'iv–♭VII–♭III–♭VI–ii°–V–i (Autumn Leaves)'],
    ['coltrane', 'I–♭III7–♭VI–VII7–III–V7–I (Coltrane changes)'],
    ['circle-sevenths', 'I–IV–vii°–iii–vi–ii–V–I (circle of fifths, sevenths)'],
  ]);
  expect(await chooseAndRead(page, 'iio-V-i')).toEqual(['Dm7♭5', 'G7', 'Cm7']);
  expect(await chooseAndRead(page, 'ragtime')).toEqual(['E7', 'A7', 'D7', 'G7', 'Cmaj7']);
  expect(await chooseAndRead(page, 'coltrane')).toEqual(['Cmaj7', 'Eb7', 'Abmaj7', 'B7', 'Emaj7', 'G7', 'Cmaj7']);
});

test('AC-2.6.1/12 — The Blues group holds the twelve-bar blues, its quick-change, V–V and no-turnaround forms, the twelve-bar minor blues, the twelve-bar jazz blues, the eight-bar blues and I7–IV7–V7', async ({ page }) => {
  await melodicBlank(page);
  expect(await groupEntries(page, 'Blues')).toEqual([
    ['twelve-bar-blues', 'Twelve-bar blues'],
    ['quick-change-blues', 'Twelve-bar blues, quick change'],
    ['v-v-blues', 'Twelve-bar blues, V–V'],
    ['no-turnaround-blues', 'Twelve-bar blues, no turnaround'],
    ['minor-blues', 'Twelve-bar minor blues'],
    ['jazz-blues', 'Twelve-bar jazz blues'],
    ['eight-bar-blues', 'Eight-bar blues'],
    ['I7-IV7-V7', 'I7–IV7–V7'],
  ]);
  expect(await chooseAndRead(page, 'quick-change-blues')).toEqual([
    'C7', 'F7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7',
  ]);
  expect(await chooseAndRead(page, 'minor-blues')).toEqual([
    'Cm7', 'Cm7', 'Cm7', 'Cm7', 'Fm7', 'Fm7', 'Cm7', 'Cm7', 'Ab7', 'G7', 'Cm7', 'G7',
  ]);
  expect(await chooseAndRead(page, 'eight-bar-blues')).toEqual(['C7', 'G7', 'F7', 'F7', 'C7', 'G7', 'C7', 'G7']);
});

test('AC-2.6.1/13 — The Modal and rock group holds I–♭VII–IV, I–♭VII–IV–I, I–I–♭VII–IV, I–♭VII–IV–IV, I–♭VII, the Mario cadence ♭VI–♭VII–I, I–♭III–IV, the Dorian i–IV, i–♭VII, the Lydian I–II and the Phrygian i–♭II', async ({ page }) => {
  await melodicBlank(page);
  expect(await groupEntries(page, 'Modal and rock')).toEqual([
    ['I-bVII-IV', 'I–♭VII–IV (Mixolydian)'],
    ['I-bVII-IV-I', 'I–♭VII–IV–I'],
    ['I-I-bVII-IV', 'I–I–♭VII–IV'],
    ['I-bVII-IV-IV', 'I–♭VII–IV–IV'],
    ['I-bVII', 'I–♭VII (Mixolydian vamp)'],
    ['bVI-bVII-I', '♭VI–♭VII–I (Mario cadence)'],
    ['I-bIII-IV', 'I–♭III–IV'],
    ['i-IV', 'i–IV (Dorian)'],
    ['i-bVII', 'i–♭VII'],
    ['I-II', 'I–II (Lydian)'],
    ['i-bII', 'i–♭II (Phrygian)'],
  ]);
  expect(await chooseAndRead(page, 'I-I-bVII-IV')).toEqual(['C', 'C', 'Bb', 'F']);
  expect(await chooseAndRead(page, 'bVI-bVII-I')).toEqual(['Ab', 'Bb', 'C']);
  expect(await chooseAndRead(page, 'i-IV')).toEqual(['Cm', 'F']);
  expect(await chooseAndRead(page, 'i-bII')).toEqual(['Cm', 'Db']);
});

test("AC-2.6.1/14 — The Classical and folk group holds Pachelbel's I–V–vi–iii–IV–I–IV–V, the Passamezzo antico, the Romanesca, the Folia, the circle of fifths in triads and I–ii–V–I", async ({ page }) => {
  await melodicBlank(page);
  expect(await groupEntries(page, 'Classical and folk')).toEqual([
    ['pachelbel', 'I–V–vi–iii–IV–I–IV–V (Pachelbel)'],
    ['passamezzo-antico', 'i–♭VII–i–V–♭III–♭VII–i–V (Passamezzo antico)'],
    ['romanesca', '♭III–♭VII–i–V (Romanesca)'],
    ['folia', 'i–V–i–♭VII–♭III–♭VII–i–V (Folia)'],
    ['circle-triads', 'I–IV–vii°–iii–vi–ii–V–I (circle of fifths, triads)'],
    ['I-ii-V-I', 'I–ii–V–I'],
  ]);
  expect(await chooseAndRead(page, 'folia')).toEqual(['Cm', 'G', 'Cm', 'Bb', 'Eb', 'Bb', 'Cm', 'G']);
  expect(await chooseAndRead(page, 'circle-triads')).toEqual(['C', 'F', 'Bdim', 'Em', 'Am', 'Dm', 'G', 'C']);
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

test('AC-2.6.5/7 — While a Pattern has a progression, no arpeggio, and no Slot holds a role, the harmony section says so and points at the arpeggio setting and the role chips', async ({ page }) => {
  await melodicBlank(page);
  await expect(page.locator('.harmony-hint')).toHaveCount(0);
  await page.locator('.progression-picker').selectOption('I-IV-V');
  // Nothing sounds yet, so nothing holds a role: the hint is up.
  const hint = page.locator('.harmony-hint');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Arpeggio');
  await expect(hint).toContainText('chord tone');
  // The armed pitch was re-read as the Root, so the first Slot turned on holds a role.
  await accentZone(page, 0, 0).click();
  expect((await slotState(page, 0, 0)).pitch).toEqual({ tone: 1, octaveOffset: 0 });
  await expect(page.locator('.harmony-hint')).toHaveCount(0);
  // A fixed degree stamped over it brings the hint back …
  await page.locator('.degree[data-degree="2"]').click();
  await noteBand(page, 0, 0).click();
  await expect(page.locator('.harmony-hint')).toBeVisible();
  // … and an arpeggio settles it.
  await page.locator('.arpeggio-picker').selectOption('up');
  await expect(page.locator('.harmony-hint')).toHaveCount(0);
});

// --- AC-2.6.6 — An arpeggio deals chord tones across the sounding Slots ---

test("AC-2.6.6/1 — The arpeggio setting offers None and a catalogue in three groups — chord tones: Ascending, Descending, Up and down, Up and down repeating the turn, Alberti, Root only, Root and fifth, Up to the octave, Down from the octave, Up over and down; drones: Drone above, Drone below, Chord root drone; scale walks: Scale up and Scale up and down, each in major, natural minor, major pentatonic, minor pentatonic and the Pattern's scale — and is saved with the Pattern", async ({ page }) => {
  await harmonicBlank(page); // owned Pattern p_test
  expect(await page.locator('.arpeggio-picker > option').allTextContents()).toEqual(['None (as stamped)']);
  expect(await page.locator('.arpeggio-picker optgroup').evaluateAll((gs) => gs.map((g) => g.label))).toEqual([
    'Chord tones', 'Drones', 'Scale walks',
  ]);
  expect(await page.locator('.arpeggio-picker optgroup[label="Chord tones"] option').allTextContents()).toEqual([
    'Ascending', 'Descending', 'Up and down', 'Up and down, repeating the turn', 'Alberti', 'Root only', 'Root and fifth',
    'Up to the octave', 'Down from the octave', 'Up over and down',
  ]);
  expect(await page.locator('.arpeggio-picker optgroup[label="Drones"] option').allTextContents()).toEqual([
    'Drone above (tonic)', 'Drone below (tonic)', 'Chord root drone',
  ]);
  expect(await page.locator('.arpeggio-picker optgroup[label="Scale walks"] option').allTextContents()).toEqual([
    'Scale up, major', 'Scale up, natural minor', 'Scale up, major pentatonic', 'Scale up, minor pentatonic', "Scale up, the Pattern's scale",
    'Scale up and down, major', 'Scale up and down, natural minor', 'Scale up and down, major pentatonic', 'Scale up and down, minor pentatonic', "Scale up and down, the Pattern's scale",
  ]);
  await expect(page.locator('.arpeggio-picker')).toHaveValue('none');
  for (const s of [0, 1, 2, 3]) await accentZone(page, 0, s).click();
  await page.locator('.arpeggio-picker').selectOption('alberti');
  expect(await page.locator('.measure[data-measure="0"] .beat[data-beat="0"] .slot-degree').allTextContents()).toEqual(['R', '5', '3', '5']);
  expect((await pattern(page)).harmony.arpeggio).toBe('alberti');

  await page.evaluate(() => window.__rm.loadBlank('3/4', 'Elsewhere'));
  await page.evaluate(() => window.__rm.handlers.onOpen('p_test', true));
  await expect(page.locator('.arpeggio-picker')).toHaveValue('alberti');
  expect(await page.locator('.measure[data-measure="0"] .beat[data-beat="0"] .slot-degree').allTextContents()).toEqual(['R', '5', '3', '5']);
});

test('AC-2.6.6/7 — Setting the arpeggio to None returns every Slot to the Pitch it holds; while an arpeggio is set the degree and role chips are absent, the note bands are inert, and the pitch strip says the notes follow the arpeggio', async ({ page }) => {
  await harmonicBlank(page);
  await accentZone(page, 0, 0).click(); // Root, from the re-read armed pitch
  await page.locator('.tone[data-tone="5"]').click();
  await accentZone(page, 1, 0).click(); // 5th
  await expect(slotAt(page, 1, 0).locator('.slot-degree')).toHaveText('5');

  await page.locator('.arpeggio-picker').selectOption('up');
  // Dealt: Root then 3rd, whatever was stamped.
  await expect(slotAt(page, 0, 0).locator('.slot-degree')).toHaveText('R');
  await expect(slotAt(page, 1, 0).locator('.slot-degree')).toHaveText('3');
  await expect(slotAt(page, 1, 0).locator('.slot-pitch')).toHaveAttribute('data-dealt', 'true');
  // The stored Pitch is untouched underneath.
  expect((await slotState(page, 1, 0)).pitch).toEqual({ tone: 5, octaveOffset: 0 });
  // The chips stand down, the bands are inert, and the strip says why.
  await expect(page.locator('.pitch-strip .degree')).toHaveCount(0);
  await expect(page.locator('.pitch-strip .tone')).toHaveCount(0);
  await expect(page.locator('.pitch-strip-note')).toContainText('Ascending');
  await expect(noteBand(page, 1, 0)).toBeDisabled();
  await expect(page.locator('.key-picker')).toBeVisible();

  await page.locator('.arpeggio-picker').selectOption('none');
  await expect(slotAt(page, 1, 0).locator('.slot-degree')).toHaveText('5');
  await expect(slotAt(page, 1, 0).locator('.slot-pitch')).not.toHaveAttribute('data-dealt');
  await expect(page.locator('.pitch-strip .degree')).toHaveCount(12);
  await expect(page.locator('.pitch-strip .tone')).toHaveCount(5);
  await expect(page.locator('.pitch-strip-note')).toHaveCount(0);
  await expect(noteBand(page, 1, 0)).toBeEnabled();
});

test('AC-2.6.6/12 — The note band names a dealt step by what it is — a chord tone with its octave mark, the tonic drone, or a scale step — beside the note it sounds', async ({ page }) => {
  await harmonicBlank(page);
  for (const s of [0, 1, 2, 3]) await accentZone(page, 0, s).click();
  const labels = () => page.locator('.measure[data-measure="0"] .slot-degree').allTextContents();
  const names = () => page.locator('.measure[data-measure="0"] .slot-note-name').allTextContents();

  await page.locator('.arpeggio-picker').selectOption('up-octave');
  expect(await labels()).toEqual(['R', '3', '5', 'R↑']);
  expect(await names()).toEqual(['C4', 'E4', 'G4', 'C5']);

  await page.locator('.arpeggio-picker').selectOption('drone-above');
  expect(await labels()).toEqual(['R', 'T↑', '3', 'T↑']);
  expect(await names()).toEqual(['C4', 'C5', 'E4', 'C5']);
  await expect(slotAt(page, 0, 1).locator('.slot-pitch')).toHaveAttribute('data-step', 'T↑');

  await page.locator('.arpeggio-picker').selectOption('scale-up-minor-pentatonic');
  expect(await labels()).toEqual(['s1', 's2', 's3', 's4']);
  expect(await names()).toEqual(['C4', 'Eb4', 'F4', 'G4']);
});

test('AC-2.6.6/8 — Changing the arpeggio on a shipped Pattern goes through the naming prompt', async ({ page }) => {
  await harmonicBlank(page);
  await accentZone(page, 0, 0).click();
  await loadAsShipped(page);
  await page.locator('.arpeggio-picker').selectOption('up');
  await expect(page.locator('.dialog-input')).toBeVisible();
  await page.locator('.dialog-button:not(.primary)', { hasText: 'Cancel' }).click();
  // Cancelled: no arpeggio, nothing owned, and the picker reads None again.
  expect('arpeggio' in (await pattern(page)).harmony).toBe(false);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  await expect(page.locator('.arpeggio-picker')).toHaveValue('none');
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
  await page.locator('.sound-mode [data-mode="percussive"]').click();
  await expect(page.locator('.chord-strip')).toBeHidden();
  await expect(page.locator('.chord-chip')).toHaveCount(0);
  await expect(page.locator('.harmony')).toBeHidden();
});

test("AC-2.6.7/7 — With an arpeggio set, each sounding Slot's note band shows the role dealt to it and the note it sounds under the chord in force", async ({ page }) => {
  await harmonicBlank(page);
  await page.evaluate(() => window.__rm.handlers.onAddMeasure());
  for (const s of [0, 1, 2]) await accentZone(page, 0, s).click();
  await accentZone(page, 0, 0, 1).click();
  await page.locator('.arpeggio-picker').selectOption('up');
  // C E G | C — continuous through the pass, under the I at rest.
  expect(await page.locator('.measure[data-measure="0"] .slot-note-name').allTextContents()).toEqual(['C4', 'E4', 'G4']);
  expect(await page.locator('.measure[data-measure="1"] .slot-note-name').allTextContents()).toEqual(['C4']);
  // Under "every Measure", Measure 2 is the IV: the same dealt Root reads F4.
  await page.locator('.chord-change[data-change="measure"]').click();
  expect(await page.locator('.measure[data-measure="1"] .slot-note-name').allTextContents()).toEqual(['F4']);
  expect(await page.locator('.measure[data-measure="1"] .slot-degree').allTextContents()).toEqual(['R']);
});

// --- AC-2.6.8 — The progression is saved with the Pattern ---

test('AC-2.6.8/1 — A progression, its chord edits, the change setting and the arpeggio survive closing and reopening the Pattern', async ({ page }) => {
  await harmonicBlank(page); // owned Pattern p_test
  await page.locator('.chord-editor[data-chord="2"] .chord-quality').selectOption('7');
  await page.locator('.chord-change[data-change="measure"]').click();
  await page.locator('.arpeggio-picker').selectOption('up-down');
  const saved = (await pattern(page)).harmony;

  await page.evaluate(() => window.__rm.loadBlank('3/4', 'Elsewhere'));
  await expect(page.locator('.chord-strip')).toBeHidden();
  await page.evaluate(() => window.__rm.handlers.onOpen('p_test', true));
  expect((await pattern(page)).harmony).toEqual(saved);
  expect(saved).toEqual({
    change: 'measure',
    arpeggio: 'up-down',
    chords: [
      { degree: '1', quality: 'maj' },
      { degree: '4', quality: 'maj' },
      { degree: '5', quality: '7' },
    ],
  });
  expect(await chordNames(page)).toEqual(['C', 'F', 'G7']);
  await expect(page.locator('.chord-change[data-change="measure"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.arpeggio-picker')).toHaveValue('up-down');
  await expect(page.locator('.progression-picker')).toHaveValue('custom');
});

test('AC-2.6.8/3 — Switching to Percussive removes the progression along with the Key, scale and Pitch data', async ({ page }) => {
  await harmonicBlank(page);
  await page.locator('.tone[data-tone="3"]').click();
  await accentZone(page, 0, 0).click();
  await page.locator('.sound-mode [data-mode="percussive"]').click();
  const p = await pattern(page);
  expect('harmony' in p).toBe(false);
  expect('key' in p).toBe(false);
  expect('pitch' in p.measures[0].beats[0].slots[0]).toBe(false);
  // Back to Melodic: no progression, and the sounding Slot takes a degree it can sound.
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await expect(page.locator('.progression-picker')).toHaveValue('none');
  expect((await slotState(page, 0, 0)).pitch).toEqual({ degree: '1', octaveOffset: 0 });
});

// --- US-2.7 — Cycle through the fill patterns while practising ---

const fillInForce = (page) => page.evaluate(() => window.__rm.fillInForce());
const cycleState = (page) => page.evaluate(() => window.__rm.getState().fillCycle);

/** A harmonic blank with three sounding Slots and the tempo up, so a harmonic cycle passes in seconds. */
async function cyclingBlank(page) {
  await harmonicBlank(page);
  for (const s of [0, 1, 2]) await accentZone(page, 0, s).click();
  await page.evaluate(() => window.__rm.handlers.onTempo(300));
}

/** Wait until the fill in force is `id`, polling the real transport. */
async function untilFill(page, id, timeout = 9000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if ((await fillInForce(page)) === id) return true;
    await page.waitForTimeout(80);
  }
  return false;
}

test('AC-2.7.1/1 — A Cycle toggle and a Repeats count, 1 to 16 and 4 by default, sit in the Practice group, and are absent, like the Arpeggio picker, on a Pattern without a progression', async ({ page }) => {
  await melodicBlank(page);
  await expect(page.locator('.fill-cycle')).toHaveCount(0);
  await expect(page.locator('.arpeggio-picker')).toHaveCount(0);
  await page.locator('.progression-picker').selectOption('I-IV-V');
  const row = page.locator('[data-section="practice"] .fill-cycle-row');
  await expect(row).toBeVisible();
  await expect(row.locator('.fill-cycle')).toHaveAttribute('aria-pressed', 'false');
  const repeats = row.locator('.fill-cycle-repeats');
  await expect(repeats).toHaveValue('4');
  await expect(repeats).toHaveAttribute('min', '1');
  await expect(repeats).toHaveAttribute('max', '16');
  // With the playback settings, not in the harmony block the picker sits in.
  await expect(page.locator('.harmony .fill-cycle')).toHaveCount(0);
  await expect(page.locator('.harmony .arpeggio-picker')).toBeVisible();
});

test('AC-2.7.1/2 — The Repeats count is remembered as an app preference across loads; cycle mode itself is off on every load', async ({ page }) => {
  await harmonicBlank(page);
  await page.locator('.fill-cycle-repeats').fill('6');
  await page.locator('.fill-cycle-repeats').dispatchEvent('change');
  await page.locator('.fill-cycle').click();
  await expect(page.locator('.fill-cycle')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).fillCycleRepeats)).toBe(6);

  await page.reload();
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await page.locator('.progression-picker').selectOption('I-IV-V');
  await expect(page.locator('.fill-cycle-repeats')).toHaveValue('6');
  await expect(page.locator('.fill-cycle')).toHaveAttribute('aria-pressed', 'false');
  expect((await cycleState(page)).on).toBe(false);
  // Out-of-range counts are held to 1–16.
  await page.locator('.fill-cycle-repeats').fill('40');
  await page.locator('.fill-cycle-repeats').dispatchEvent('change');
  await expect(page.locator('.fill-cycle-repeats')).toHaveValue('16');
});

test("AC-2.7.1/3 — Turning cycle mode on with the arpeggio at None puts the first fill of the catalogue in force at once; with a fill set, that fill stays in force and the cycle begins from it", async ({ page }) => {
  await harmonicBlank(page);
  await expect(page.locator('.arpeggio-picker')).toHaveValue('none');
  await page.locator('.fill-cycle').click();
  await expect(page.locator('.arpeggio-picker')).toHaveValue('up');
  expect(await fillInForce(page)).toBe('up');
  expect(await cycleState(page)).toEqual({ on: true, start: 0, baseLoop: 0 });

  await page.locator('.fill-cycle').click();
  await page.locator('.arpeggio-picker').selectOption('alberti');
  await page.locator('.fill-cycle').click();
  await expect(page.locator('.arpeggio-picker')).toHaveValue('alberti');
  expect(await fillInForce(page)).toBe('alberti');
  const alberti = await page.evaluate(() => window.__rm.getState().fillCycle.start);
  expect(alberti).toBeGreaterThan(0);
});

test("AC-2.7.1/4 — The fill in force is a playback setting: the Pattern's own arpeggio is not changed, nothing auto-saves, and a shipped Pattern is never prompted for a name by cycling", async ({ page }) => {
  await harmonicBlank(page);
  const savedBefore = await page.evaluate(() => JSON.stringify(window.__rm.patternStore.findById('p_test')));
  await page.locator('.fill-cycle').click();
  expect(await fillInForce(page)).toBe('up');
  expect('arpeggio' in (await pattern(page)).harmony).toBe(false);
  expect(await page.evaluate(() => JSON.stringify(window.__rm.patternStore.findById('p_test')))).toBe(savedBefore);

  // A shipped Pattern: cycling shows no naming prompt and stays unowned.
  await page.locator('.fill-cycle').click();
  await accentZone(page, 0, 0).click();
  await loadAsShipped(page);
  await page.locator('.fill-cycle').click();
  await expect(page.locator('.dialog-input')).toHaveCount(0);
  expect(await fillInForce(page)).toBe('up');
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  expect('arpeggio' in (await pattern(page)).harmony).toBe(false);
});

test("AC-2.7.1/5 — Turning cycle mode off returns the Pattern's own arpeggio, from the next pass while playing and at once otherwise", async ({ page }) => {
  await cyclingBlank(page);
  await page.locator('.fill-cycle').click();
  expect(await fillInForce(page)).toBe('up');
  await page.locator('.fill-cycle').click();
  expect(await fillInForce(page)).toBeNull();
  await expect(page.locator('.arpeggio-picker')).toHaveValue('none');

  // While playing: the transport is handed the Pattern for its next pass, and the run keeps going.
  await page.locator('.fill-cycle').click();
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });
  await page.locator('.fill-cycle').click();
  const pending = await page.evaluate(() => window.__rm.transport._snapshot().pendingEdit);
  expect(pending).toBe(true);
  expect(await page.evaluate(() => window.__rm.transport.isRunning)).toBe(true);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__rm.transport._snapshot().pattern.harmony.arpeggio ?? null)).toBeNull();
  await page.locator('[data-action="stop"]').click();
});

test('AC-2.7.2/2 — At the boundary the next fill is in force from the very next pass, the loop counter keeps counting, and nothing stops or restarts', async ({ page }) => {
  await cyclingBlank(page);
  await page.locator('.fill-cycle-repeats').fill('1');
  await page.locator('.fill-cycle-repeats').dispatchEvent('change');
  await page.locator('.fill-cycle').click();
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });
  expect(await fillInForce(page)).toBe('up');

  // One repeat is one harmonic cycle: three passes of I–IV–V, then Descending.
  expect(await untilFill(page, 'down')).toBe(true);
  const at = await page.evaluate(() => ({ loop: window.__rm.getState().loop, running: window.__rm.transport.isRunning, sounding: window.__rm.transport._snapshot().pattern.harmony.arpeggio }));
  expect(at.running).toBe(true);
  expect(at.loop).toBeGreaterThanOrEqual(3);
  expect(at.sounding).toBe('down');
  // And on to the third without a reset of the counter.
  expect(await untilFill(page, 'up-down')).toBe(true);
  const later = await page.evaluate(() => window.__rm.getState().loop);
  expect(later).toBeGreaterThan(at.loop);
  await expect(page.locator('[data-action="stop"]')).toBeVisible();
  await page.locator('[data-action="stop"]').click();
});

test("AC-2.7.2/4 — The picker shows the fill in force, the note bands show its deal and the pitch strip says the notes follow it, and the score shows it — every view follows the fill in force, not the Pattern's own arpeggio", async ({ page }) => {
  await cyclingBlank(page);
  await page.locator('.fill-cycle').click();
  await expect(page.locator('.arpeggio-picker')).toHaveValue('up');
  expect(await page.locator('.measure[data-measure="0"] .slot-note-name').allTextContents()).toEqual(['C4', 'E4', 'G4']);
  await expect(page.locator('.pitch-strip-note')).toContainText('Ascending');
  expect('arpeggio' in (await pattern(page)).harmony).toBe(false);

  await page.locator('[data-action="view-sheet"]').click();
  await expect(page.locator('.score .score-fill')).toHaveText('Fill: Ascending');
  const steps = await page.locator('.score .note-item[data-pass="0"]').evaluateAll((els) => els.map((e) => e.dataset.step));
  expect(steps).toEqual(['-2', '0', '2']); // C4 E4 G4
});

test('AC-2.7.2/5 — Changing the Repeats count while playing applies without a restart: the fill in force keeps its place and plays the new count from the pass it is on before the cycle moves on', async ({ page }) => {
  await cyclingBlank(page);
  await page.locator('.fill-cycle-repeats').fill('1');
  await page.locator('.fill-cycle-repeats').dispatchEvent('change');
  await page.locator('.fill-cycle').click();
  await page.locator('[data-action="play"]').click();
  expect(await untilFill(page, 'down')).toBe(true);
  const before = await page.evaluate(() => ({ loop: window.__rm.getState().loop, running: window.__rm.transport.isRunning }));

  await page.locator('.fill-cycle-repeats').fill('4');
  await page.locator('.fill-cycle-repeats').dispatchEvent('change');
  // Still Descending, counted afresh from here, and the run untouched.
  expect(await fillInForce(page)).toBe('down');
  const cycle = await cycleState(page);
  expect(cycle.on).toBe(true);
  expect(cycle.baseLoop).toBeGreaterThanOrEqual(before.loop);
  expect(await page.evaluate(() => window.__rm.transport.isRunning)).toBe(true);
  expect(await page.evaluate(() => window.__rm.getState().loop)).toBeGreaterThanOrEqual(before.loop);
  await page.locator('[data-action="stop"]').click();
});

test("AC-2.7.2/6 — Stopping returns the fill in force to the starting fill — the Pattern's own, or the first of the catalogue when it has none — so every Play begins the cycle from the same place", async ({ page }) => {
  await cyclingBlank(page);
  await page.locator('.fill-cycle-repeats').fill('1');
  await page.locator('.fill-cycle-repeats').dispatchEvent('change');
  await page.locator('.fill-cycle').click();
  await page.locator('[data-action="play"]').click();
  expect(await untilFill(page, 'down')).toBe(true);
  await page.locator('[data-action="stop"]').click();
  expect(await fillInForce(page)).toBe('up');
  await expect(page.locator('.arpeggio-picker')).toHaveValue('up');
  expect(await cycleState(page)).toEqual({ on: true, start: 0, baseLoop: 0 });

  // With a fill of its own, the Pattern's own fill is the starting place.
  await page.locator('.fill-cycle').click();
  await page.locator('.arpeggio-picker').selectOption('alberti');
  await page.locator('.fill-cycle').click();
  await page.locator('[data-action="play"]').click();
  expect(await untilFill(page, 'root')).toBe(true);
  await page.locator('[data-action="stop"]').click();
  expect(await fillInForce(page)).toBe('alberti');
});

test("AC-2.7.2/7 — Choosing a fill in the picker while cycling is the ordinary edit of the Pattern's arpeggio, and the cycle begins again from that fill with its repeats counted afresh; choosing None hands the notes back to the stamped Pitches, which turns cycle mode off", async ({ page }) => {
  await harmonicBlank(page);
  await page.locator('.fill-cycle').click();
  await page.locator('.arpeggio-picker').selectOption('alberti');
  expect((await pattern(page)).harmony.arpeggio).toBe('alberti');
  expect(await fillInForce(page)).toBe('alberti');
  const cycle = await cycleState(page);
  expect(cycle.on).toBe(true);
  expect(cycle.start).toBe(await page.evaluate(() => window.__rm.getState().fillCycle.start));
  expect(cycle.start).toBeGreaterThan(0);

  await page.locator('.arpeggio-picker').selectOption('none');
  expect('arpeggio' in (await pattern(page)).harmony).toBe(false);
  expect(await fillInForce(page)).toBeNull();
  await expect(page.locator('.fill-cycle')).toHaveAttribute('aria-pressed', 'false');
});

test("AC-2.7.3/1 — While cycle mode is on the score's head carries a Fill line naming the fill in force, and the notes are that fill's; Print / PDF prints the same score", async ({ page }) => {
  await cyclingBlank(page);
  await page.locator('[data-action="view-sheet"]').click();
  await expect(page.locator('.score .score-fill')).toHaveCount(0);
  await page.locator('.fill-cycle').click();
  await expect(page.locator('.score .score-fill')).toHaveText('Fill: Ascending');
  await page.evaluate(() => {
    window.print = () => {};
    window.__rm.handlers.onPrintScore();
  });
  await expect(page.locator('.score-print .score-fill')).toHaveText('Fill: Ascending');
  const onScreen = await page.locator('.score .note-item').evaluateAll((els) => els.map((e) => e.dataset.step));
  const onPaper = await page.locator('.score-print .note-item').evaluateAll((els) => els.map((e) => e.dataset.step));
  expect(onPaper).toEqual(onScreen);
});

/** The note-on pitches of a Format 0 .mid, in order — enough to read what a file sounds. */
function midiNoteOns(bytes) {
  const ons = [];
  let i = 14 + 8; // past MThd and the MTrk header
  while (i < bytes.length) {
    while (bytes[i] & 0x80) i += 1; // variable-length delta time
    i += 1;
    const status = bytes[i];
    if (status === 0xff) i += 3 + bytes[i + 2];
    else {
      if ((status & 0xf0) === 0x90 && bytes[i + 2] > 0) ons.push(bytes[i + 1]);
      i += 3;
    }
  }
  return ons;
}

test("AC-2.7.3/2 — MIDI export carries the Pattern's own arpeggio, never the fill in force: the file is the Pattern's data, and cycling is practice", async ({ page }) => {
  await cyclingBlank(page); // three Roots under the I, no arpeggio of its own
  await page.locator('.fill-cycle').click();
  expect(await fillInForce(page)).toBe('up');
  // The views follow Ascending: C E G. The file does not.
  expect(await page.locator('.measure[data-measure="0"] .slot-note-name').allTextContents()).toEqual(['C4', 'E4', 'G4']);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="export-midi"]').click()]);
  const ons = midiNoteOns(readFileSync(await download.path()));
  expect(ons.slice(0, 3)).toEqual([60, 60, 60]);
  expect('arpeggio' in (await pattern(page)).harmony).toBe(false);
});
