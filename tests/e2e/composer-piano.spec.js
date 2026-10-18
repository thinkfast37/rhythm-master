import { test, expect } from '@playwright/test';
import { launch, openApp, enterComposer, loadFourBeats, key, fret } from './composer-helpers.js';

test.use(launch);

async function toPiano(page) {
  await page.locator('.instrument-switch [data-instrument="piano"]').click();
  await expect(page.locator('.piano')).toBeVisible();
}

// --- AC-19.3.1: sized by key count --------------------------------------------

test('AC-19.3.1/1 — The key count control offers 25, 37, 49, 61, 76 and 88 keys, 49 on first use', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  await toPiano(page);
  const values = await page.locator('.keys-picker option').evaluateAll((os) => os.map((o) => o.value));
  expect(values).toEqual(['25', '37', '49', '61', '76', '88']);
  await expect(page.locator('.keys-picker')).toHaveValue('49');
  await expect(page.locator('.piano')).toHaveAttribute('data-keys', '49');
  await expect(page.locator('.piano .key')).toHaveCount(49);
});

test('AC-19.3.1/2 — Each count spans its range: 25 keys C3–C5 and 49 keys C2–C6, centred on middle C; 37 keys C3–C6, 61 keys C2–C7, 76 keys E1–G7 and 88 keys A0–C8, as such keyboards are built; every range contains middle C, which is marked C4', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  await toPiano(page);
  const ranges = { 25: ['C3', 'C5'], 37: ['C3', 'C6'], 49: ['C2', 'C6'], 61: ['C2', 'C7'], 76: ['E1', 'G7'], 88: ['A0', 'C8'] };
  for (const [count, [low, high]] of Object.entries(ranges)) {
    await page.locator('.keys-picker').selectOption(count);
    const piano = page.locator('.piano');
    await expect(piano).toHaveAttribute('data-keys', count);
    await expect(piano).toHaveAttribute('data-low', low);
    await expect(piano).toHaveAttribute('data-high', high);
    await expect(piano.locator('.key')).toHaveCount(Number(count));
    await expect(piano.locator('.key.middle-c')).toHaveCount(1);
    await expect(piano.locator('.key.middle-c')).toHaveAttribute('data-name', 'C4');
    await expect(piano.locator('.key.middle-c .middle-c-mark')).toHaveCount(1);
  }
  // Centred on middle C for 25 and 49: as many keys below C4 as above.
  for (const count of ['25', '49']) {
    await page.locator('.keys-picker').selectOption(count);
    const midis = await page.locator('.piano .key').evaluateAll((ks) => ks.map((k) => Number(k.dataset.midi)));
    expect(midis.filter((m) => m < 60).length).toBe(midis.filter((m) => m > 60).length);
  }
});

test('AC-19.3.1/3 — The key count is remembered in `rm.settings.v1` and is in force after a reload', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  await toPiano(page);
  await page.locator('.keys-picker').selectOption('61');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).composerKeys)).toBe(61);
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await enterComposer(page);
  await expect(page.locator('.keys-picker')).toHaveValue('61');
  await expect(page.locator('.piano')).toHaveAttribute('data-keys', '61');
});

// --- AC-19.3.2: two rows -------------------------------------------------------

test('AC-19.3.2/1 — When one row would make a white key narrower than 18 CSS pixels, the keyboard is laid out as two rows, split at the C nearest the middle of the range, the lower half in the upper row', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  await toPiano(page);
  await page.locator('.keys-picker').selectOption('88');
  await page.setViewportSize({ width: 700, height: 900 });
  await page.locator('.library-toggle').click().catch(() => {});
  const piano = page.locator('.piano');
  await expect(piano).toHaveAttribute('data-rows', '2');
  const rows = piano.locator('.piano-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute('data-low', 'A0');
  await expect(rows.nth(0)).toHaveAttribute('data-high', 'B3');
  await expect(rows.nth(1)).toHaveAttribute('data-low', 'C4');
  await expect(rows.nth(1)).toHaveAttribute('data-high', 'C8');
  const top = (await rows.nth(0).boundingBox()).y;
  const bottom = (await rows.nth(1).boundingBox()).y;
  expect(top).toBeLessThan(bottom);
  // Wide enough for one row, and it is one.
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect(piano).toHaveAttribute('data-rows', '1');
});

test('AC-19.3.2/2 — Each row keeps its black keys between the white keys they belong to, and the keyboard never scrolls sideways at any width', async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  await toPiano(page);
  await page.locator('.keys-picker').selectOption('88');
  for (const width of [390, 700, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('.main-panel');
      const panel = document.querySelector('.composer-panel');
      return { main: main.scrollWidth - main.clientWidth, panel: panel.scrollWidth - panel.clientWidth };
    });
    expect(overflow.main).toBeLessThanOrEqual(1);
    expect(overflow.panel).toBeLessThanOrEqual(1);
    // C#4 sits between C4 and D4, in whichever row holds them.
    const [c, cs, d] = await Promise.all([key(page, 60).boundingBox(), key(page, 61).boundingBox(), key(page, 62).boundingBox()]);
    expect(cs.x).toBeGreaterThan(c.x);
    expect(cs.x + cs.width).toBeLessThan(d.x + d.width);
    expect(cs.x + cs.width / 2).toBeGreaterThan(c.x + c.width * 0.6);
    expect(cs.x + cs.width / 2).toBeLessThan(d.x + d.width * 0.4);
  }
});

// --- AC-19.3.3: colour by degree -------------------------------------------------

test('AC-19.3.3/1 — An in-scale key, white or black, is filled with the degree-role colour of its semitone above the root and the root key carries its mark', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await toPiano(page);
  await page.locator('.composer-key').selectOption('Eb');
  // Eb Ionian: Eb(root, black) F G Ab(black) Bb(black) C D.
  await expect(key(page, 63)).toHaveClass(/black/);
  await expect(key(page, 63)).toHaveClass(/is-root/);
  await expect(key(page, 63)).toHaveClass(/role-1/);
  await expect(key(page, 65)).toHaveClass(/role-2/);
  await expect(key(page, 68)).toHaveClass(/black/);
  await expect(key(page, 68)).toHaveClass(/role-4/);
  await expect(key(page, 70)).toHaveClass(/role-5/);
  await expect(key(page, 62)).toHaveClass(/role-7/);
  await expect(key(page, 64)).not.toHaveClass(/is-diatonic/);
  const fill = await key(page, 68).locator('.key-role').evaluate((el) => getComputedStyle(el).fill);
  const role4 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--role-4').trim());
  const rgb = `rgb(${parseInt(role4.slice(1, 3), 16)}, ${parseInt(role4.slice(3, 5), 16)}, ${parseInt(role4.slice(5, 7), 16)})`;
  expect(fill).toBe(rgb);
  const ring = await key(page, 63).locator('.key-role').evaluate((el) => getComputedStyle(el).strokeWidth);
  expect(parseFloat(ring)).toBeGreaterThan(0);
  await expect(key(page, 64).locator('.key-role')).toHaveCount(0);
});

test('AC-19.3.3/2 — An in-scale key is labelled by the label mode — note name, degree or interval — and an out-of-scale key is plain, white or black, with only each C carrying its name and octave', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await toPiano(page);
  await page.locator('.composer-key').selectOption('D');
  await expect(key(page, 66)).toHaveAttribute('data-label', 'F#');
  await expect(key(page, 65)).toHaveAttribute('data-label', '');
  await expect(key(page, 60)).toHaveAttribute('data-label', 'C4'); // out of D Ionian, but a C
  await page.locator('.label-mode-picker').selectOption('degrees');
  await expect(key(page, 66)).toHaveAttribute('data-label', '3');
  await expect(key(page, 62)).toHaveAttribute('data-label', '1');
  await expect(key(page, 60)).toHaveAttribute('data-label', 'C4');
  await page.locator('.label-mode-picker').selectOption('intervals');
  await expect(key(page, 66)).toHaveAttribute('data-label', 'M3');
  await expect(key(page, 62)).toHaveAttribute('data-label', 'R');
  await expect(key(page, 65).locator('.key-label')).toHaveCount(0);
});

test('AC-19.3.3/3 — The scale root, scale and label mode controls are shared with the guitar view, so a change made in one view is in force in the other', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await toPiano(page);
  await page.locator('.composer-key').selectOption('A');
  await page.locator('.composer-scale').selectOption('aeolian');
  await page.locator('.label-mode-picker').selectOption('degrees');
  await page.locator('.instrument-switch [data-instrument="guitar"]').click();
  await expect(page.locator('.composer-key')).toHaveValue('A');
  await expect(page.locator('.composer-scale')).toHaveValue('aeolian');
  await expect(page.locator('.label-mode-picker')).toHaveValue('degrees');
  await expect(fret(page, 0, 5)).toHaveClass(/is-root/);
  await expect(fret(page, 0, 5)).toHaveAttribute('data-label', '1');
  await expect(fret(page, 0, 3)).toHaveAttribute('data-label', 'b7');
  await page.locator('.composer-key').selectOption('E');
  await toPiano(page);
  await expect(page.locator('.composer-key')).toHaveValue('E');
  await expect(key(page, 64)).toHaveClass(/is-root/);
});

// --- AC-19.3.4: free play -------------------------------------------------------------

test('AC-19.3.4 — Tapping a key sounds its note at any time', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await toPiano(page);
  const count = () => page.evaluate(() => window.__rm.voiceLog().filter((v) => v.midi === 67).length);
  await key(page, 67).click();
  expect(await count()).toBe(1);
  expect((await page.evaluate(() => window.__rm.voiceLog())).at(-1)).toEqual({ instrument: 'piano', via: 'synth', midi: 67 });
  await page.locator('.transport').first().click();
  await key(page, 67).click();
  expect(await count()).toBe(2);
  await page.locator('.record').click();
  await key(page, 67).click();
  expect(await count()).toBe(3);
  await page.locator('.transport').first().click();
});
