import { test, expect } from '@playwright/test';
import { launch, openApp, enterComposer, loadFourBeats, fret, SAMPLE_URL, fakeSoundfont } from './composer-helpers.js';

test.use(launch);

const roleColours = (page) =>
  page.evaluate(() => Object.fromEntries(['1', 'b2', '2', 'b3', '3', '4', '4s5b', '5', 'b6', '6', 'b7', '7'].map((r) => [r, getComputedStyle(document.documentElement).getPropertyValue(`--role-${r}`).trim()])));

// --- AC-19.2.1: the board ----------------------------------------------------

test('AC-19.2.1/1 — Six strings, high E at the top and low E at the bottom, an open-string column and frets 1 to 24, with single inlay dots at frets 3, 5, 7, 9, 15, 17, 19 and 21 and double dots at 12 and 24', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  const board = page.locator('.fretboard');
  await expect(board.locator('.string-line')).toHaveCount(6);
  await expect(board.locator('.note[data-fret="0"]')).toHaveCount(6);
  await expect(board.locator('.note')).toHaveCount(6 * 25);
  await expect(board.locator('.nut-line')).toHaveCount(1);
  // High E on top: string 0 is E4 and sits above string 5, E2.
  const top = await board.locator('.note[data-string="0"][data-fret="0"]').getAttribute('data-midi');
  const bottom = await board.locator('.note[data-string="5"][data-fret="0"]').getAttribute('data-midi');
  expect([top, bottom]).toEqual(['64', '40']);
  const topY = (await board.locator('.note[data-string="0"][data-fret="0"]').boundingBox()).y;
  const bottomY = (await board.locator('.note[data-string="5"][data-fret="0"]').boundingBox()).y;
  expect(topY).toBeLessThan(bottomY);
  for (const f of [3, 5, 7, 9, 15, 17, 19, 21]) await expect(board.locator(`.inlay-dot[data-fret="${f}"]`)).toHaveCount(1);
  for (const f of [12, 24]) await expect(board.locator(`.inlay-dot[data-fret="${f}"]`)).toHaveCount(2);
  await expect(board.locator('.inlay-dot')).toHaveCount(12);
  await expect(board.locator('.fret-number[data-fret="12"]')).toHaveCount(2);
});

test('AC-19.2.1/2 — The strings sound standard tuning — E4 B3 G3 D3 A2 E2 from the top — and no tuning control is shown', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  const board = page.locator('.fretboard');
  const open = [];
  for (let s = 0; s < 6; s++) open.push(Number(await board.locator(`.note[data-string="${s}"][data-fret="0"]`).getAttribute('data-midi')));
  expect(open).toEqual([64, 59, 55, 50, 45, 40]);
  await expect(board).toHaveAttribute('data-tuning', 'standard');
  await expect(page.locator('.composer-panel select[aria-label*="uning"], .composer-panel .tuning-picker')).toHaveCount(0);
  // A tapped open string sounds its true pitch.
  await fret(page, 5, 0).click();
  expect((await page.evaluate(() => window.__rm.voiceLog())).at(-1)).toMatchObject({ midi: 40 });
});

test('AC-19.2.1/3 — Fret numbers and note names are always absolute: fret 5 is fret 5 whatever the capo, and no fret-reference control is shown', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  await page.locator('.capo-picker').selectOption('3');
  await expect(page.locator('.fretboard .fret-number[data-fret="5"]').first()).toHaveText('5');
  await expect(page.locator('.fretboard .fret-number[data-fret="12"]').first()).toHaveText('12');
  // A5 is at fret 5 of the high E string with or without the capo.
  await expect(fret(page, 0, 5)).toHaveAttribute('data-label', 'A');
  await expect(fret(page, 0, 5)).toHaveAttribute('data-midi', '69');
  await expect(page.locator('.composer-panel [aria-label*="eference"], .composer-panel .fret-reference')).toHaveCount(0);
});

// --- AC-19.2.2: the controls --------------------------------------------------

test("AC-19.2.2/1 — The scale root picker offers the twelve Keys and the scale picker the scale catalogue, and choosing either sets the composition's Key or scale — the same values the saved Pattern carries", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await expect(page.locator('.composer-key option')).toHaveCount(12);
  await expect(page.locator('.composer-scale option')).toHaveCount(16);
  await page.locator('.composer-key').selectOption('D');
  await page.locator('.composer-scale').selectOption('dorian');
  const draft = await page.evaluate(() => window.__rm.composer().draft);
  expect(draft.key).toBe('D');
  expect(draft.scale).toBe('dorian');
  await expect(fret(page, 1, 3)).toHaveClass(/is-root/);
});

test('AC-19.2.2/2 — The label mode offers Notes, Degrees and Intervals: an in-scale note is labelled with its note name, its scale degree or its interval from the root accordingly, and an out-of-scale note always with its name', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const options = await page.locator('.label-mode-picker option').allTextContents();
  expect(options).toEqual(['Notes', 'Degrees', 'Intervals']);
  const e4 = fret(page, 0, 0); // in scale, the 3rd
  const f = fret(page, 0, 2); // F#4, out of C Ionian
  await expect(e4).toHaveAttribute('data-label', 'E');
  await expect(f).toHaveAttribute('data-label', 'F#');
  await page.locator('.label-mode-picker').selectOption('degrees');
  await expect(e4).toHaveAttribute('data-label', '3');
  await expect(f).toHaveAttribute('data-label', 'F#');
  await page.locator('.label-mode-picker').selectOption('intervals');
  await expect(e4).toHaveAttribute('data-label', 'M3');
  await expect(fret(page, 1, 1)).toHaveAttribute('data-label', 'R');
  await expect(f).toHaveAttribute('data-label', 'F#');
});

test("AC-19.2.2/3 — The capo takes 0 to 12: the frets below it are drawn muted and are inert, a capo bar is drawn at the end of the capo fret's cell, distinct from the nut, and the lower bound of the visible frets follows the capo up", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await expect(page.locator('.capo-picker option')).toHaveCount(13);
  await page.locator('.fret-upper').fill('12');
  await page.locator('.fret-upper').press('Enter');
  await page.locator('.capo-picker').selectOption('3');
  await expect(page.locator('.fretboard')).toHaveAttribute('data-capo', '3');
  await expect(page.locator('.fretboard')).toHaveAttribute('data-lower', '3');
  await expect(page.locator('.fretboard')).toHaveAttribute('data-upper', '15');
  await expect(page.locator('.fretboard .capo-line')).toHaveCount(1);
  await expect(page.locator('.fretboard .capo-line')).toHaveAttribute('data-fret-wire', '3');
  await expect(page.locator('.fretboard .nut-line')).toHaveCount(0);
  await expect(fret(page, 0, 2)).toHaveClass(/is-muted/);
  await expect(fret(page, 0, 2)).toHaveAttribute('data-playable', 'false');
  await expect(fret(page, 0, 3)).not.toHaveClass(/is-muted/);
  // Inert: no sound, nothing recorded.
  // Draw the muted frets again by widening the range back, then aim at one.
  await page.locator('.fret-lower').fill('0');
  await page.locator('.fret-lower').press('Enter');
  await expect(fret(page, 0, 2)).toBeVisible();
  await expect(fret(page, 0, 2)).toHaveClass(/is-muted/);
  const logBefore = (await page.evaluate(() => window.__rm.voiceLog())).length;
  await page.locator('.record').click();
  await fret(page, 0, 2).click({ force: true });
  expect((await page.evaluate(() => window.__rm.voiceLog())).length).toBe(logBefore);
  expect(await page.evaluate(() => window.__rm.composer().draft.measures[0].beats[0].slots[0].pitch ?? null)).toBeNull();
});

test('AC-19.2.2/4 — The visible frets are a lower and an upper bound, 0 to 24, and the board redraws to the range at its full width, so fewer frets are wider', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  const wide = (await fret(page, 0, 7).boundingBox()).width;
  const boardWidth = (await page.locator('.fretboard').boundingBox()).width;
  await page.locator('.fret-lower').fill('5');
  await page.locator('.fret-lower').press('Enter');
  await page.locator('.fret-upper').fill('12');
  await page.locator('.fret-upper').press('Enter');
  await expect(page.locator('.fretboard')).toHaveAttribute('data-lower', '5');
  await expect(page.locator('.fretboard')).toHaveAttribute('data-upper', '12');
  await expect(fret(page, 0, 4)).toBeHidden();
  await expect(fret(page, 0, 13)).toBeHidden();
  await expect(fret(page, 0, 5)).toBeVisible();
  expect((await page.locator('.fretboard').boundingBox()).width).toBeCloseTo(boardWidth, 0);
  // Fret cells are wider: fret 7 and fret 8 sit further apart than before.
  const x7 = (await fret(page, 0, 7).boundingBox()).x;
  const x8 = (await fret(page, 0, 8).boundingBox()).x;
  expect(x8 - x7).toBeGreaterThan(wide * 2);
  // Bounds clamp to the board.
  await page.locator('.fret-upper').fill('40');
  await page.locator('.fret-upper').press('Enter');
  await expect(page.locator('.fretboard')).toHaveAttribute('data-upper', '24');
});

test('AC-19.2.2/5 — The label mode, capo and visible frets are remembered in `rm.settings.v1` and are in force after a reload', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  await page.locator('.label-mode-picker').selectOption('degrees');
  await page.locator('.fret-upper').fill('14');
  await page.locator('.fret-upper').press('Enter');
  await page.locator('.capo-picker').selectOption('2');
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')));
  expect(settings).toMatchObject({ composerLabelMode: 'degrees', composerCapo: 2, composerFretRange: [2, 16] });
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await enterComposer(page);
  await expect(page.locator('.label-mode-picker')).toHaveValue('degrees');
  await expect(page.locator('.capo-picker')).toHaveValue('2');
  await expect(page.locator('.fretboard')).toHaveAttribute('data-capo', '2');
  await expect(page.locator('.fretboard')).toHaveAttribute('data-lower', '2');
  await expect(page.locator('.fretboard')).toHaveAttribute('data-upper', '16');
});

// --- AC-19.2.3: colour by degree -----------------------------------------------

test('AC-19.2.3/1 — An in-scale note is filled with the degree-role colour of its semitone above the root, one colour per chromatic degree, and the root carries its ring', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const colours = await roleColours(page);
  expect(new Set(Object.values(colours)).size).toBe(12);
  // C Ionian: C=1, D=2, E=3, F=4, G=5, A=6, B=7.
  const expectRole = async (s, f, role) => {
    const note = fret(page, s, f);
    await expect(note).toHaveClass(new RegExp(`\\brole-${role}\\b`));
    const fill = await note.locator('.note-marker').evaluate((el) => getComputedStyle(el).fill);
    const hex = colours[role];
    const rgb = `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
    expect(fill).toBe(rgb);
  };
  await expectRole(1, 1, '1'); // C4
  await expectRole(1, 3, '2'); // D4
  await expectRole(0, 0, '3'); // E4
  await expectRole(0, 1, '4'); // F4
  await expectRole(0, 3, '5'); // G4
  await expectRole(0, 5, '6'); // A4
  await expectRole(0, 7, '7'); // B4
  await expect(fret(page, 1, 1)).toHaveClass(/is-root/);
  const ring = await fret(page, 1, 1).locator('.note-marker').evaluate((el) => getComputedStyle(el).strokeWidth);
  const plain = await fret(page, 1, 3).locator('.note-marker').evaluate((el) => getComputedStyle(el).strokeWidth);
  expect(parseFloat(ring)).toBeGreaterThan(parseFloat(plain));
  // Lydian: the #4 takes the tritone's colour.
  await page.locator('.composer-scale').selectOption('lydian');
  await expectRole(0, 2, '4s5b');
});

test('AC-19.2.3/2 — An out-of-scale note is a plain label with no marker behind it', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const fs = fret(page, 0, 2); // F#4, out of C Ionian
  await expect(fs).not.toHaveClass(/is-diatonic|role-/);
  // No marker is drawn: the circle is fully transparent and unstroked.
  expect(await fs.locator('.note-marker').evaluate((el) => getComputedStyle(el).fill)).toBe('rgba(0, 0, 0, 0)');
  expect(await fs.locator('.note-marker').evaluate((el) => getComputedStyle(el).stroke)).toBe('none');
  await expect(fs.locator('.note-label')).toHaveText('F#');
  // And it is still a note that can be tapped.
  await fs.click();
  expect((await page.evaluate(() => window.__rm.voiceLog())).at(-1)).toMatchObject({ midi: 66 });
});

test('AC-19.2.3/3 — Changing the Key or the scale recolours and relabels every note at once, with nothing stored on the Pattern beyond the Key and scale themselves', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await expect(fret(page, 0, 2)).not.toHaveClass(/is-diatonic/);
  // What the draft held before: the Key and scale changes may add nothing to it.
  const before = await page.evaluate(() => Object.keys(window.__rm.composer().draft));
  await page.locator('.composer-key').selectOption('D');
  await expect(fret(page, 0, 2)).toHaveClass(/is-diatonic/);
  await expect(fret(page, 0, 2)).toHaveClass(/role-3/);
  await expect(fret(page, 1, 3)).toHaveClass(/is-root/);
  await expect(fret(page, 1, 1)).not.toHaveClass(/is-diatonic/);
  await page.locator('.composer-scale').selectOption('minor-pentatonic');
  await expect(fret(page, 0, 2)).not.toHaveClass(/is-diatonic/);
  await expect(fret(page, 0, 1)).toHaveClass(/role-b3/);
  const draft = await page.evaluate(() => window.__rm.composer().draft);
  expect(draft.key).toBe('D');
  expect(draft.scale).toBe('minor-pentatonic');
  expect(Object.keys(draft).sort()).toEqual(['key', 'measures', 'name', 'rating', 'scale', 'soundMode', 'swingAmount', 'swingFeel', 'tags', 'tempo', 'tempoUnit'].filter((k) => k in draft).sort());
  expect(Object.keys(draft).filter((k) => !before.includes(k)).every((k) => k === 'key' || k === 'scale')).toBe(true);
});

// --- AC-19.2.4: free play ---------------------------------------------------------

test('AC-19.2.4/1 — A tap on a playable fret sounds that note with the guitar voice at rest, while the composition plays, and while recording', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const count = () => page.evaluate(() => window.__rm.voiceLog().filter((v) => v.midi === 69).length);
  await fret(page, 0, 5).click(); // A4 at rest, nothing selected: heard, nothing recorded
  expect(await count()).toBe(1);
  expect((await page.evaluate(() => window.__rm.voiceLog())).at(-1).instrument).toBe('guitar');
  expect(await page.evaluate(() => window.__rm.composer().draft.measures[0].beats.some((b) => b.slots[0].pitch))).toBe(false);
  await page.locator('.transport').first().click();
  await fret(page, 0, 5).click();
  expect(await count()).toBe(2);
  await page.locator('.record').click();
  await fret(page, 0, 5).click();
  expect(await count()).toBe(3);
  expect(await page.evaluate(() => window.__rm.composer().draft.measures[0].beats[0].slots[0].pitch)).toEqual({ degree: '6', octaveOffset: 0 });
  await page.locator('.transport').first().click();
});

test('AC-19.2.4/2 — A fret below the capo is inert: no sound, no note recorded', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.capo-picker').selectOption('5');
  await page.locator('.fret-lower').fill('0');
  await page.locator('.fret-lower').press('Enter');
  await expect(fret(page, 0, 4)).toBeVisible();
  await page.locator('.record').click();
  const before = (await page.evaluate(() => window.__rm.voiceLog())).length;
  await fret(page, 0, 4).click({ force: true });
  await fret(page, 2, 0).click({ force: true });
  expect((await page.evaluate(() => window.__rm.voiceLog())).length).toBe(before);
  expect(await page.evaluate(() => window.__rm.composer().target)).toEqual({ measureIndex: 0, beatIndex: 0, slotIndex: 0 });
  await expect(fret(page, 0, 4)).toHaveAttribute('tabindex', '-1');
});

// --- US-19.7: the sampled guitar ----------------------------------------------------

test('AC-19.7.1/1 — No sample is requested on page load, in the Piano view, or in Practice under Piano or Synth; the first showing of the Guitar view, or the first melodic note in Practice under Guitar, requests them once', async ({ page }) => {
  const requests = [];
  await page.route('https://gleitz.github.io/**', (route) => {
    requests.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont() });
  });
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('rm.settings.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('rm.settings.v1')), composerInstrument: 'piano' })));
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  // Practice under Piano, then Synth: play something melodic, no request.
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.grid .slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  for (const voice of ['piano', 'synth']) {
    await page.locator(`.voice-switch [data-voice="${voice}"]`).click();
    await page.locator('.transport').first().click();
    await page.waitForTimeout(400);
    await page.locator('.transport').first().click();
  }
  expect(requests).toHaveLength(0);
  // The Piano view: still nothing.
  await enterComposer(page, { load: 'none' });
  await expect(page.locator('.piano')).toBeVisible();
  await page.locator('.piano .key[data-midi="60"]').click();
  expect(requests).toHaveLength(0);
  // The Guitar view: one request.
  await page.locator('.instrument-switch [data-instrument="guitar"]').click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toBe(SAMPLE_URL);
  await expect.poll(() => page.evaluate(() => window.__rm.composer().guitar.status)).toBe('ready');
  await page.locator('.instrument-switch [data-instrument="piano"]').click();
  await page.locator('.instrument-switch [data-instrument="guitar"]').click();
  await fret(page, 0, 0).click();
  expect(requests).toHaveLength(1);

  // Practice under Guitar: the first melodic note requests them, once.
  const fresh = await page.context().newPage();
  const freshRequests = [];
  await fresh.route('https://gleitz.github.io/**', (route) => {
    freshRequests.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont() });
  });
  await fresh.goto('/');
  await expect(fresh.locator('.mode-switch')).toBeVisible();
  await fresh.evaluate(() => window.__rm.loadBlank('4/4'));
  await fresh.locator('.grid .slot[data-beat="0"][data-slot="0"]').click();
  await fresh.locator('.sound-mode [data-mode="melodic"]').click();
  await fresh.locator('.voice-switch [data-voice="guitar"]').click();
  expect(freshRequests).toHaveLength(0);
  await fresh.locator('.transport').first().click();
  await expect.poll(() => freshRequests.length).toBe(1);
  expect(freshRequests[0]).toBe(SAMPLE_URL);
  await fresh.waitForTimeout(600);
  await fresh.locator('.transport').first().click();
  expect(freshRequests).toHaveLength(1);
  await fresh.close();
});

test('AC-19.7.1/2 — Once loaded, a tapped fret and a pitched Slot played back in Guitar view sound through the sampled guitar at the tapped or stored MIDI note', async ({ page }) => {
  await page.route('https://gleitz.github.io/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont(['C4', 'D4', 'E4', 'F4']) })
  );
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await loadFourBeats(page);
  await expect.poll(() => page.evaluate(() => window.__rm.composer().guitar.status)).toBe('ready');
  await expect(page.locator('.guitar-status')).toHaveCount(0);
  await fret(page, 0, 0).click(); // E4
  const tapped = (await page.evaluate(() => window.__rm.voiceLog())).at(-1);
  expect(tapped).toEqual({ instrument: 'guitar', voice: 'guitar', via: 'sampled', midi: 64 });
  expect(await page.evaluate(() => window.__rm.guitar.__sampledPlays())).toBe(1);
  await page.locator('.composer-tempo-entry').fill('240');
  await page.locator('.composer-tempo-entry').press('Enter');
  await page.locator('.record').click();
  await fret(page, 1, 1).click(); // C4
  await page.locator('.record').click();
  const before = (await page.evaluate(() => window.__rm.voiceLog())).length;
  await page.locator('.transport').first().click();
  await expect.poll(() => page.evaluate(() => window.__rm.voiceLog().length), { timeout: 8000 }).toBeGreaterThan(before);
  const played = (await page.evaluate(() => window.__rm.voiceLog())).slice(before);
  expect(played.every((v) => v.via === 'sampled' && v.midi === 60)).toBe(true);
  await page.locator('.transport').first().click();
});

test('AC-19.7.1/3 — The attribution — FluidR3_GM by Frank Wen via gleitz/midi-js-soundfonts, CC BY 3.0 — is shown in the Composer', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('.composer-attribution')).toHaveCount(0);
  await enterComposer(page);
  // The guitar's own line; the piano's credit stands beside it (AC-2.13.4/4).
  const credit = page.locator('.composer-attribution[data-attribution="guitar-samples"]');
  await expect(credit).toBeVisible();
  await expect(credit).toContainText('FluidR3_GM');
  await expect(credit).toContainText('Frank Wen');
  await expect(credit).toContainText('CC BY 3.0');
  await expect(credit.locator('a[href*="gleitz/midi-js-soundfonts"]')).toBeVisible();
  await expect(credit.locator('a[href*="creativecommons.org/licenses/by/3.0"]')).toBeVisible();
});

test('AC-19.7.2/1 — While the samples load, a loading state is shown and every guitar note sounds through the melodic synth voice rather than waiting', async ({ page }) => {
  const pending = [];
  await page.route('https://gleitz.github.io/**', (route) => {
    pending.push(route);
  });
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await loadFourBeats(page);
  await expect(page.locator('.guitar-status')).toHaveAttribute('data-status', 'loading');
  await expect(page.locator('.guitar-status')).toContainText('Loading');
  await fret(page, 0, 0).click();
  expect((await page.evaluate(() => window.__rm.voiceLog())).at(-1)).toEqual({ instrument: 'guitar', voice: 'guitar', via: 'fallback', midi: 64 });
  // Recording went ahead too.
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  expect(await page.evaluate(() => window.__rm.composer().draft.measures[0].beats[0].slots[0].pitch)).toEqual({ degree: '1', octaveOffset: 0 });
  expect(pending).toHaveLength(1);
  await pending[0].fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont() });
  await expect.poll(() => page.evaluate(() => window.__rm.composer().guitar.status)).toBe('ready');
  await expect(page.locator('.guitar-status')).toHaveCount(0);
  await fret(page, 0, 0).click();
  expect((await page.evaluate(() => window.__rm.voiceLog())).at(-1).via).toBe('sampled');
});

test('AC-19.7.2/2 — A failed load shows a non-blocking notice with a Retry control, guitar notes keep sounding through the synth voice, and Retry requests the samples again', async ({ page }) => {
  let fail = true;
  const requests = [];
  await page.route('https://gleitz.github.io/**', (route) => {
    requests.push(route.request().url());
    if (fail) route.abort();
    else route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont() });
  });
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await loadFourBeats(page);
  const status = page.locator('.guitar-status');
  await expect(status).toHaveAttribute('data-status', 'error');
  await expect(status).toContainText('synth voice');
  await expect(status.locator('.guitar-retry')).toBeVisible();
  // Non-blocking: the board, Record and the grid all work.
  await fret(page, 0, 0).click();
  expect((await page.evaluate(() => window.__rm.voiceLog())).at(-1)).toEqual({ instrument: 'guitar', voice: 'guitar', via: 'fallback', midi: 64 });
  await expect(page.locator('.record')).toBeEnabled();
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect(requests).toHaveLength(1);
  fail = false;
  await status.locator('.guitar-retry').click();
  await expect.poll(() => requests.length).toBe(2);
  await expect.poll(() => page.evaluate(() => window.__rm.composer().guitar.status)).toBe('ready');
  await expect(page.locator('.guitar-status')).toHaveCount(0);
});

test("AC-19.7.2/3 — The Piano view's sampled piano falls back the same way: while its recordings load, or when they cannot, each note sounds through the synth", async ({ page }) => {
  // Held: the recordings are on their way.
  const held = [];
  await page.route('**/audio/piano/*.mp3', (route) => held.push(route));
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('rm.settings.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('rm.settings.v1')), composerInstrument: 'piano' })));
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await loadFourBeats(page);
  await expect(page.locator('.piano')).toBeVisible();
  await page.locator('.piano .key[data-midi="64"]').click();
  await expect.poll(() => page.evaluate(() => window.__rm.piano.getStatus().status)).toBe('loading');
  await page.locator('.piano .key[data-midi="65"]').click();
  expect((await page.evaluate(() => window.__rm.voiceLog())).slice(-2)).toEqual([
    { instrument: 'piano', voice: 'piano', via: 'fallback', midi: 64 },
    { instrument: 'piano', voice: 'piano', via: 'fallback', midi: 65 },
  ]);

  // Failed: they cannot come, and the keys still sound through the synth.
  for (const r of held.splice(0)) await r.abort();
  await page.unroute('**/audio/piano/*.mp3');
  await expect.poll(() => page.evaluate(() => window.__rm.piano.getStatus().status)).toBe('error');
  await page.locator('.piano .key[data-midi="67"]').click();
  expect((await page.evaluate(() => window.__rm.voiceLog())).at(-1)).toEqual({ instrument: 'piano', voice: 'piano', via: 'fallback', midi: 67 });
  // And the guitar's samples are never asked for by the Piano view.
  expect(await page.evaluate(() => window.__rm.composer().guitar.status)).toBe('idle');
});
