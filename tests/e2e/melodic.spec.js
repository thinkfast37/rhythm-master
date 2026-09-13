import { test, expect } from '@playwright/test';
import { SCALES } from '../../src/core/scales.js';

test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
});

test('AC-2.1.1 — Sound Mode is Percussive by default and switchable', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await expect(page.locator('.sound-mode')).toHaveValue('percussive');
  await page.locator('.sound-mode').selectOption('melodic');
  await expect(page.locator('.sound-mode')).toHaveValue('melodic');
});

test('AC-2.1.2 — Key appears only in Melodic mode, not disabled in Percussive', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await expect(page.locator('.key-picker')).toHaveCount(0);

  await page.locator('.sound-mode').selectOption('melodic');
  await expect(page.locator('.key-picker')).toBeVisible();
  await expect(page.locator('.key-picker')).toHaveValue('C');

  await page.locator('.sound-mode').selectOption('percussive');
  await expect(page.locator('.key-picker')).toHaveCount(0);
});

test('AC-2.1.3 — switching to Melodic gives every sounding Slot a pitch', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('.sound-mode').selectOption('melodic');

  const pitched = await page.evaluate(() =>
    window.__rm.getState().pattern.measures[0].beats[0].slots[0].pitch
  );
  expect(pitched).toEqual({ degree: '1', octaveOffset: 0 });
  await expect(page.locator('.slot-pitch').first()).toBeVisible();
});

test('AC-2.1.4 — switching back to Percussive strips pitch, keeping the Pattern valid', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('.sound-mode').selectOption('percussive');

  const state = await page.evaluate(() => {
    const p = window.__rm.getState().pattern;
    return { key: 'key' in p, pitch: 'pitch' in p.measures[0].beats[0].slots[0] };
  });
  expect(state.key).toBe(false);
  expect(state.pitch).toBe(false);
});

/** A blank Melodic 4/4 Pattern, which is where every strip test starts. */
async function melodicBlank(page) {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
}

const slotAt = (page, beat, slot) => page.locator(`.slot[data-beat="${beat}"][data-slot="${slot}"]`);
const noteBand = (page, beat, slot) => slotAt(page, beat, slot).locator('.slot-note');
const accentZone = (page, beat, slot) => slotAt(page, beat, slot).locator('.slot-accent');
const pitchOf = (page, beat, slot) =>
  page.evaluate(
    ([b, s]) => window.__rm.getState().pattern.measures[0].beats[b].slots[s].pitch,
    [beat, slot]
  );
const slotState = (page, beat, slot) =>
  page.evaluate(
    ([b, s]) => window.__rm.getState().pattern.measures[0].beats[b].slots[s],
    [beat, slot]
  );

test('AC-2.2.1 — a stamped pitch replaces the previous one and is shown in the grid', async ({ page }) => {
  await melodicBlank(page);
  await accentZone(page, 0, 0).click();

  await page.locator('.degree[data-degree="b3"]').click();
  await page.locator('[data-action="octave-down"]').click();
  await noteBand(page, 0, 0).click();

  const badge = slotAt(page, 0, 0).locator('.slot-pitch');
  await expect(badge).toHaveAttribute('data-degree', 'b3');
  await expect(badge).toHaveAttribute('data-octave', '-1');
  // What the badge reads is AC-2.2.15's business, not this AC's; all that
  // matters here is that the stamped Pitch is the one on screen. The octave
  // used to be trailing comma marks on the degree and is now carried by the
  // note name, which states it as a number.
  await expect(badge.locator('.slot-degree')).toHaveText('b3');
  await expect(badge.locator('.slot-note-name')).toHaveText('Eb3');

  // A second stamp fully replaces the first — never two pitches on one Slot.
  await page.locator('.degree[data-degree="5"]').click();
  await noteBand(page, 0, 0).click();
  expect(await pitchOf(page, 0, 0)).toEqual({ degree: '5', octaveOffset: -1 });
});

test('AC-2.2.2 — the armed pitch starts at degree 1 octave 4 and stays armed', async ({ page }) => {
  await melodicBlank(page);
  await expect(page.locator('.degree[data-degree="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.octave-readout')).toHaveAttribute('data-octave', '4');

  // Arming once and stamping three Slots gives all three that pitch: the strip
  // is not disarmed by use.
  await page.locator('.degree[data-degree="6"]').click();
  for (const slot of [0, 1, 2]) {
    await accentZone(page, 0, slot).click();
    await noteBand(page, 0, slot).click();
  }
  for (const slot of [0, 1, 2]) {
    expect(await pitchOf(page, 0, slot), `slot ${slot}`).toEqual({ degree: '6', octaveOffset: 0 });
  }
  await expect(page.locator('.degree[data-degree="6"]')).toHaveAttribute('aria-pressed', 'true');

  // Switching Pattern leaves it armed, since it belongs to the strip, not the
  // Pattern — but a reload starts over at the root.
  await page.evaluate(() => window.__rm.loadBlank('3/4', 'Another Pattern'));
  await page.locator('.sound-mode').selectOption('melodic');
  await expect(page.locator('.degree[data-degree="6"]')).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await expect(page.locator('.degree[data-degree="1"]')).toHaveAttribute('aria-pressed', 'true');
});

test('AC-2.2.3 — the octave stepper clamps at 1 and 7 rather than wrapping', async ({ page }) => {
  await melodicBlank(page);
  const readout = page.locator('.octave-readout');
  const down = page.locator('[data-action="octave-down"]');
  const up = page.locator('[data-action="octave-up"]');

  for (let i = 0; i < 3; i++) await down.click();
  await expect(readout).toHaveAttribute('data-octave', '1');
  // At the bound the control is disabled, so there is nothing to press that
  // could wrap — pressing on is not merely ignored, it is not offered.
  await expect(down).toBeDisabled();

  for (let i = 0; i < 6; i++) await up.click();
  await expect(readout).toHaveAttribute('data-octave', '7');
  await expect(up).toBeDisabled();

  // Octave 7 is stored as offset +3, not as an absolute 7.
  await accentZone(page, 0, 0).click();
  expect((await pitchOf(page, 0, 0)).octaveOffset).toBe(3);
});

test('AC-2.2.4/1 — All twelve chromatic degrees are shown at once, each armed by a single tap', async ({ page }) => {
  await melodicBlank(page);
  await expect(page.locator('.degree')).toHaveCount(12);
  const CHROMATIC = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
  await accentZone(page, 0, 0).click();
  for (const token of CHROMATIC) {
    const chip = page.locator(`.degree[data-degree="${token}"]`);
    await expect(chip).toBeVisible();
    await chip.click(); // one tap arms it — no accidental mode to set first
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await noteBand(page, 0, 0).click();
    expect((await pitchOf(page, 0, 0)).degree).toBe(token);
  }
});

test('AC-2.2.4/2 — There is no flat/natural/sharp mode: a chip is the degree it names, so arming `b3` never relabels or re-pitches any other chip', async ({ page }) => {
  await melodicBlank(page);
  await expect(page.locator('[data-action="set-accidental"]')).toHaveCount(0);

  const tokensBefore = await page.locator('.degree').evaluateAll((els) => els.map((e) => e.dataset.degree));
  const namesBefore = await page.locator('.degree').evaluateAll((els) => els.map((e) => e.dataset.noteName));
  await page.locator('.degree[data-degree="b3"]').click();
  expect(await page.locator('.degree').evaluateAll((els) => els.map((e) => e.dataset.degree))).toEqual(tokensBefore);
  expect(await page.locator('.degree').evaluateAll((els) => els.map((e) => e.dataset.noteName))).toEqual(namesBefore);
});

test('AC-2.2.4/3 — Degrees above the octave are reached with the octave stepper — a ninth is stamped as degree `2` an octave up — while a stored Pattern whose tokens use `8`–`15` still displays and plays unchanged', async ({ page }) => {
  await melodicBlank(page);
  await expect(page.locator('[data-action="toggle-extended-degrees"]')).toHaveCount(0);

  // A ninth: degree 2, one octave up.
  await accentZone(page, 0, 0).click();
  await page.locator('.degree[data-degree="2"]').click();
  await page.locator('[data-action="octave-up"]').click();
  await noteBand(page, 0, 0).click();
  expect(await pitchOf(page, 0, 0)).toEqual({ degree: '2', octaveOffset: 1 });

  // A stored token above the strip's span still displays and resolves: "9" in
  // C is D5, exactly what core/pitch.js has always said it is.
  await page.evaluate(() => {
    const state = window.__rm.getState();
    const pattern = structuredClone(state.pattern);
    pattern.measures[0].beats[1].slots[0] = { on: true, pitch: { degree: '9', octaveOffset: 0 } };
    window.__rm.loadPattern(pattern, { owned: true });
  });
  await expect(page.locator('.slot[data-beat="1"][data-slot="0"] .slot-pitch')).toHaveAttribute('data-note-name', 'D5');
});

test('AC-2.2.5 — a Slot that is not sounding cannot be stamped', async ({ page }) => {
  await melodicBlank(page);
  const band = noteBand(page, 0, 0);

  // Inert, not merely unresponsive: disabled says so to pointer, keyboard and
  // screen reader alike.
  await expect(band).toBeDisabled();
  await band.click({ force: true });
  expect(await slotState(page, 0, 0)).toEqual({ on: false });

  // Turning it on makes the band live; turning it off again makes it inert.
  await accentZone(page, 0, 0).click();
  await expect(band).toBeEnabled();
  for (let i = 0; i < 3; i++) await accentZone(page, 0, 0).click();
  await expect(band).toBeDisabled();
});

test('AC-2.2.6 — stamping a sounding Slot changes its pitch and not its accent', async ({ page }) => {
  await melodicBlank(page);
  // Beat 1 Slot 1 defaults to Strong; override it to Weak so an accidental
  // reset to the default would be visible.
  await accentZone(page, 0, 0).click();
  await accentZone(page, 0, 0).click();
  const before = await slotState(page, 0, 0);
  expect(before.accent).toBe(1);

  await page.locator('.degree[data-degree="7"]').click();
  await noteBand(page, 0, 0).click();

  const after = await slotState(page, 0, 0);
  expect(after.accent).toBe(1);
  expect(after.on).toBe(true);
  expect(after.pitch).toEqual({ degree: '7', octaveOffset: 0 });
});

test('AC-2.2.7 — cycling accent to off clears the pitch with it', async ({ page }) => {
  await melodicBlank(page);
  await accentZone(page, 0, 0).click();
  await page.locator('.degree[data-degree="5"]').click();
  await noteBand(page, 0, 0).click();
  expect(await pitchOf(page, 0, 0)).toEqual({ degree: '5', octaveOffset: 0 });

  // Strong -> Weak -> Medium -> Off (AC-3.1.11), by the accent zone alone.
  for (let i = 0; i < 3; i++) await accentZone(page, 0, 0).click();
  expect(await slotState(page, 0, 0)).toEqual({ on: false });
});

test('AC-2.2.8 — no path leaves a Slot with accent and pitch disagreeing', async ({ page }) => {
  await melodicBlank(page);
  const invariantHolds = () =>
    page.evaluate(() =>
      window.__rm.getState().pattern.measures.every((m) =>
        m.beats.every((b) =>
          b.slots.every((s) => (s.on ? Boolean(s.pitch) : !('pitch' in s)))
        )
      )
    );

  expect(await invariantHolds()).toBe(true);
  // Walk a Slot right round the accent cycle, stamping at each step.
  for (let i = 0; i < 5; i++) {
    await accentZone(page, 0, 1).click();
    const band = noteBand(page, 0, 1);
    if (await band.isEnabled()) await band.click();
    expect(await invariantHolds(), `after ${i + 1} taps`).toBe(true);
  }
});

test('AC-2.2.9 — re-arming the strip does not change already-stamped Slots', async ({ page }) => {
  await melodicBlank(page);
  await accentZone(page, 0, 0).click();
  await page.locator('.degree[data-degree="4"]').click();
  await noteBand(page, 0, 0).click();

  await page.locator('.degree[data-degree="2"]').click();
  await page.locator('.degree[data-degree="#4"]').click();
  await page.locator('[data-action="octave-up"]').click();

  expect(await pitchOf(page, 0, 0)).toEqual({ degree: '4', octaveOffset: 0 });
});

test('AC-2.2.9 — arming does not fork a shipped Pattern or leave an undo step', async ({ page }) => {
  await page.goto('/');
  // A built-in Pattern, loaded unowned: touching the strip must not trigger the
  // "name your copy" flow, because nothing has been edited yet.
  const loaded = await page.evaluate(() => {
    const shipped = window.__rm.seedStore.loadAll().find((p) => p.soundMode === 'melodic');
    if (!shipped) return null;
    window.__rm.loadPattern(structuredClone(shipped), { owned: false });
    return shipped.name;
  });
  test.skip(loaded === null, 'the shipped library has no Melodic Pattern to load');

  await page.locator('.degree[data-degree="6"]').click();
  await page.locator('[data-action="octave-up"]').click();

  await expect(page.locator('.dialog')).toHaveCount(0);
  const after = await page.evaluate(() => ({
    owned: window.__rm.getState().isOwned,
    canUndo: window.__rm.canUndo(),
  }));
  expect(after).toEqual({ owned: false, canUndo: false });
});

test('AC-2.2.10 — A Melodic Slot has two tap zones, and they do different jobs', async ({ page }) => {
  await melodicBlank(page);
  await expect(noteBand(page, 0, 0)).toHaveCount(1);
  await expect(accentZone(page, 0, 0)).toHaveCount(1);
  await expect(noteBand(page, 0, 0)).toHaveAttribute('data-action', 'stamp-pitch');
  await expect(accentZone(page, 0, 0)).toHaveAttribute('data-action', 'cycle-accent');

  // Percussive has no band at all: the whole Slot is the accent control.
  await page.locator('.sound-mode').selectOption('percussive');
  await expect(page.locator('.slot-note')).toHaveCount(0);
  await expect(slotAt(page, 0, 0)).toHaveAttribute('data-action', 'cycle-accent');
});

test('AC-2.2.14/1 — The note band is rendered below the accent zone, not above it', async ({ page }) => {
  await melodicBlank(page);
  const zone = await accentZone(page, 0, 0).boundingBox();
  const band = await noteBand(page, 0, 0).boundingBox();
  // The whole band is below the whole accent zone: not merely lower-centred.
  expect(band.y).toBeGreaterThanOrEqual(zone.y + zone.height - 1);
});

test('AC-2.2.14/2 — A visible gap separates the two zones, so neither reads as part of the other', async ({ page }) => {
  await melodicBlank(page);
  const zone = await accentZone(page, 0, 0).boundingBox();
  const band = await noteBand(page, 0, 0).boundingBox();
  const gap = band.y - (zone.y + zone.height);
  expect(gap).toBeGreaterThanOrEqual(3);
});

test("AC-2.2.14/3 — The note band's text is rendered at least a third smaller than the counting syllable, so the difference is legible as a difference rather than merely present", async ({ page }) => {
  await melodicBlank(page);
  await accentZone(page, 0, 0).click(); // sound it, so it carries a pitch to show

  const sizes = await page.evaluate(() => {
    const slot = document.querySelector('.slot[data-beat="0"][data-slot="0"]');
    const px = (el) => parseFloat(getComputedStyle(el).fontSize);

    // Measured from the glyphs the browser actually drew, not from the size the
    // CSS asked for. Reading `font-size` back proves only that the stylesheet
    // says what the stylesheet says: under a substituted face the declared
    // sizes are unchanged while the rendered ink is not, which is exactly how a
    // "1.5x smaller" note band shipped looking the same size as the syllable.
    const ink = (el) => {
      const cs = getComputedStyle(el);
      const c = document.createElement('canvas').getContext('2d');
      c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = c.measureText('bEg4');
      return m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    };

    const label = slot.querySelector('.slot-label');
    const degree = slot.querySelector('.slot-degree');
    const name = slot.querySelector('.slot-note-name');
    return {
      declared: { syllable: px(label), degree: px(degree), name: px(name) },
      ink: { syllable: ink(label), degree: ink(degree), name: ink(name) },
    };
  });

  // A margin, not merely `<`. The first implementation put 10px under 13px,
  // which passes any "is it smaller" check and looks identical on screen.
  for (const key of ['degree', 'name']) {
    expect(sizes.declared.syllable / sizes.declared[key], `${key} declared`).toBeGreaterThanOrEqual(4 / 3);
    expect(sizes.ink.syllable / sizes.ink[key], `${key} as drawn`).toBeGreaterThanOrEqual(4 / 3);
  }
  // And the pitch stays readable: shrinking it is not an allowed way to pass.
  expect(sizes.declared.degree).toBeGreaterThanOrEqual(10);
  expect(sizes.declared.name).toBeGreaterThanOrEqual(10);
});

test('AC-2.2.14/5 — Neither line of the note band is clipped on any axis: the band gives its two lines enough leading that ascenders and descenders are not shaved: under a substituted typeface and an enforced minimum size', async ({ page }) => {
  await melodicBlank(page);
  await page.locator('.key-picker').selectOption('Gb');
  await page.locator('.degree[data-degree="b2"]').click();
  for (let s = 0; s < 4; s++) await accentZone(page, 0, s).click();

  // The grid names its faces explicitly so a system-font setting cannot reach
  // it — but an extension or a minimum-size setting still can, and then the
  // text is larger than anything the stylesheet declared. Every Slot box sizes
  // from its content for exactly this case, so nothing may clip.
  const clipped = await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent =
      '.slot-label,.slot-degree,.slot-note-name{font-family:Verdana,Geneva,sans-serif !important}' +
      '.slot-degree,.slot-note-name{font-size:14px !important}' +
      '.slot-label{font-size:20px !important}';
    document.head.appendChild(style);
    void document.body.offsetHeight;

    const over = (el) => el.scrollHeight > el.clientHeight + 0.5;
    const bands = [...document.querySelectorAll('.slot-note:not([disabled])')].filter(over).length;
    const zones = [...document.querySelectorAll('.slot-accent')].filter(over).length;
    style.remove();
    return { bands, zones };
  });

  expect(clipped.bands).toBe(0);
  expect(clipped.zones).toBe(0);
});

test(`AC-2.2.14/4 — The counting syllable is rendered bold and the note band's text is not, at a weight separation of at least 300 — a Medium face reads as bold at these sizes, so "bolder" is not enough`, async ({ page }) => {
  await melodicBlank(page);
  await accentZone(page, 0, 0).click();

  const weights = await page.evaluate(() => {
    const slot = document.querySelector('.slot[data-beat="0"][data-slot="0"]');
    const w = (el) => Number(getComputedStyle(el).fontWeight);
    return {
      syllable: w(slot.querySelector('.slot-label')),
      degree: w(slot.querySelector('.slot-degree')),
      name: w(slot.querySelector('.slot-note-name')),
    };
  });

  expect(weights.syllable).toBeGreaterThanOrEqual(700);
  // 500 is not "not bold": in SF Mono at 10px a Medium face is
  // indistinguishable from Bold, which is how the first implementation looked
  // bold while satisfying a `>` comparison.
  for (const [what, weight] of [['degree', weights.degree], ['name', weights.name]]) {
    expect(weight, `${what} weight`).toBeLessThanOrEqual(400);
    expect(weights.syllable - weight, `${what} separation`).toBeGreaterThanOrEqual(300);
  }
});

test("AC-2.2.14/5 — Neither line of the note band is clipped on any axis: the band gives its two lines enough leading that ascenders and descenders are not shaved", async ({ page }) => {
  await melodicBlank(page);
  await page.locator('.key-picker').selectOption('Gb');

  // Glyphs with the tallest ascenders and deepest descenders this can produce,
  // plus the widest name any Key spells (Abb4, the flattened second of Gb).
  await page.locator('.degree[data-degree="b2"]').click();
  await accentZone(page, 0, 0).click();
  await expect(slotAt(page, 0, 0).locator('.slot-note-name')).toHaveText('Abb4');

  const fit = await page.evaluate(() => {
    const slot = document.querySelector('.slot[data-beat="0"][data-slot="0"]');
    const band = slot.querySelector('.slot-note');
    const badge = slot.querySelector('.slot-pitch');
    const lines = [...badge.querySelectorAll('.slot-degree, .slot-note-name')];
    return {
      // Both axes. The first implementation checked width only, and shipped
      // text clipped vertically past a green gate.
      badgeH: badge.getBoundingClientRect().height,
      bandContentH: band.clientHeight,
      overflowY: badge.scrollHeight > band.clientHeight,
      overflowX: lines.some((l) => l.scrollWidth > band.clientWidth + 0.5),
      // Each line needs real leading: a line box no taller than its font size
      // has nowhere to put ascenders and descenders.
      leading: lines.map((l) => {
        const c = getComputedStyle(l);
        return parseFloat(c.lineHeight) - parseFloat(c.fontSize);
      }),
    };
  });

  expect(fit.overflowY).toBe(false);
  expect(fit.overflowX).toBe(false);
  expect(fit.badgeH).toBeLessThanOrEqual(fit.bandContentH);
  for (const leading of fit.leading) expect(leading).toBeGreaterThanOrEqual(2);
});

test("AC-2.2.14/6 — The counting syllable is the brightest text in the Slot, the scale degree dimmer, and the note name dimmer still — so the ordering survives a reader whose browser settings flatten every size and weight difference", async ({ page }) => {
  await melodicBlank(page);
  await accentZone(page, 0, 0).click();

  const lum = await page.evaluate(() => {
    const slot = document.querySelector('.slot[data-beat="0"][data-slot="0"]');
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = (el) => {
      const [r, g, b] = getComputedStyle(el).color.match(/[\d.]+/g).slice(0, 3).map(Number);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    return {
      syllable: L(slot.querySelector('.slot-label')),
      degree: L(slot.querySelector('.slot-degree')),
      name: L(slot.querySelector('.slot-note-name')),
    };
  });

  // Strictly descending, with a real gap at the top. This is the channel the
  // hierarchy rests on: a minimum-font-size setting flattens the sizes and a
  // substituted face flattens the weights, but neither touches colour.
  expect(lum.syllable).toBeGreaterThan(lum.degree);
  expect(lum.degree).toBeGreaterThan(lum.name);
  expect(lum.syllable / lum.degree).toBeGreaterThanOrEqual(1.5);

  // And it still holds with size and weight forced identical, which is exactly
  // the state the maintainer's browser settings produce.
  const flattened = await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent =
      '.slot-label,.slot-degree,.slot-note-name{font-size:16px !important;font-weight:400 !important}';
    document.head.appendChild(style);
    void document.body.offsetHeight;
    const slot = document.querySelector('.slot[data-beat="0"][data-slot="0"]');
    const c = (sel) => getComputedStyle(slot.querySelector(sel)).color;
    const out = { syllable: c('.slot-label'), degree: c('.slot-degree'), name: c('.slot-note-name') };
    style.remove();
    return out;
  });
  expect(flattened.syllable).not.toBe(flattened.degree);
  expect(flattened.degree).not.toBe(flattened.name);
});

test("AC-2.2.15/1 — The band shows the Slot's scale degree, including any accidental", async ({ page }) => {
  await melodicBlank(page);
  await page.locator('.degree[data-degree="b3"]').click();
  await accentZone(page, 0, 0).click();

  await expect(slotAt(page, 0, 0).locator('.slot-degree')).toHaveText('b3');
});

test("AC-2.2.15/2 — The band shows the note name that degree resolves to in the Pattern's Key — letter, accidental where the spelling has one, and absolute octave number", async ({ page }) => {
  await melodicBlank(page);
  await page.locator('.key-picker').selectOption('Db');
  await page.locator('.degree[data-degree="b3"]').click();
  await accentZone(page, 0, 0).click();

  // b3 in Db is Fb — the flattened third, spelled on the third's own letter.
  await expect(slotAt(page, 0, 0).locator('.slot-note-name')).toHaveText('Fb4');
});

test('AC-2.2.15/3 — The two are shown on one line within the band, so the band stays a thin strip under the accent zone rather than a second block of text competing with it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  // The AC-15.1.10 worst case, in the Key producing the widest name any Key
  // can spell: b2 in Gb is Abb, a double accidental at four characters.
  await page.evaluate(async () => {
    const { handlers: h } = window.__rm;
    window.__rm.loadBlank('12/8');
    await h.onSoundMode('melodic');
    await h.onKey('Gb');
    for (let i = 0; i < 7; i++) await h.onAddMeasure();
    const p = window.__rm.getState().pattern;
    for (let m = 0; m < p.measures.length; m++)
      for (let b = 0; b < p.measures[m].beats.length; b++)
        for (let s = 0; s < p.measures[m].beats[b].slots.length; s++)
          if (!window.__rm.getState().pattern.measures[m].beats[b].slots[s].on)
            await h.onSlotTap(m, b, s);
    h.onArmDegree('b2');
    for (let b = 0; b < 12; b++) for (let s = 0; s < 2; s++) await h.onStampPitch(0, b, s);
  });
  await expect(page.locator('.measure')).toHaveCount(8);
  await expect(page.locator('.slot-note-name').first()).toHaveText('Abb4');

  const report = await page.evaluate(() => {
    const sameLine = [];
    for (const badge of document.querySelectorAll('.slot-pitch')) {
      const degree = badge.querySelector('.slot-degree');
      const name = badge.querySelector('.slot-note-name');
      if (!degree || !name) continue;
      // One line: the two share a baseline rather than the name sitting under
      // the degree.
      const d = degree.getBoundingClientRect();
      const n = name.getBoundingClientRect();
      sameLine.push(Math.abs(n.top - d.top) < 2 && n.left >= d.right - 0.5);
    }

    const strip = document.querySelector('.slot-pitch');
    const zone = document.querySelector('.slot.has-note .slot-accent');
    return {
      count: sameLine.length,
      allOnOneLine: sameLine.every(Boolean),
      // Thin: the strip is a fraction of the counting cell it sits under, which
      // is what stops it reading as a second block of text (AC-2.2.14).
      stripH: strip.getBoundingClientRect().height,
      zoneH: zone.getBoundingClientRect().height,
    };
  });

  expect(report.count).toBeGreaterThan(100);
  expect(report.allOnOneLine).toBe(true);
  expect(report.stripH).toBeLessThan(report.zoneH * 0.6);
});

test("AC-2.2.15/4 — Changing the Pattern's Key updates every note name shown, while no stored degree or octave value changes (AC-2.3.2)", async ({ page }) => {
  await melodicBlank(page);
  await page.locator('.degree[data-degree="3"]').click();
  await accentZone(page, 0, 0).click();
  await accentZone(page, 1, 0).click();

  await expect(slotAt(page, 0, 0).locator('.slot-note-name')).toHaveText('E4'); // 3 in C
  const before = await page.evaluate(() =>
    JSON.stringify(window.__rm.getState().pattern.measures[0].beats.map((b) => b.slots.map((s) => s.pitch)))
  );

  await page.locator('.key-picker').selectOption('Eb');
  await expect(slotAt(page, 0, 0).locator('.slot-note-name')).toHaveText('G4'); // 3 in Eb
  await expect(slotAt(page, 1, 0).locator('.slot-note-name')).toHaveText('G4');

  const after = await page.evaluate(() =>
    JSON.stringify(window.__rm.getState().pattern.measures[0].beats.map((b) => b.slots.map((s) => s.pitch)))
  );
  expect(after).toBe(before);
});

/** Each degree button as `number:name`, in strip order. */
const degreesNamed = (page) =>
  page.locator('.degree').evaluateAll((els) =>
    els.map((e) => `${e.querySelector('.degree-number').textContent}:${e.dataset.noteName}`)
  );

test('AC-2.2.16/1 — Each degree chip shows the note name it would stamp at the currently armed octave, alongside the degree', async ({ page }) => {
  await melodicBlank(page);
  await page.locator('.key-picker').selectOption('Db');

  // The chromatic octave in Db, at the armed octave — every chip diatonically
  // spelled from its own degree letter, chromatic alterations included.
  expect(await degreesNamed(page)).toEqual([
    '1:Db4', '♭2:Ebb4', '2:Eb4', '♭3:Fb4', '3:F4', '4:Gb4',
    '♯4:G4', '5:Ab4', '♭6:Bbb4', '6:Bb4', '♭7:Cb5', '7:C5',
  ]);

  // The degree itself is still there beside the name, not replaced by it.
  await expect(page.locator('.degree[data-degree="3"] .degree-number')).toHaveText('3');
  await expect(page.locator('.degree[data-degree="3"] .degree-name')).toHaveText('F4');
});

test('AC-2.2.16/2 — Changing the Key or the octave updates those names, since they describe what the chip will do rather than what it is called', async ({ page }) => {
  await melodicBlank(page);
  await page.locator('.key-picker').selectOption('Db');
  expect((await degreesNamed(page))[0]).toBe('1:Db4');

  await page.locator('.key-picker').selectOption('C');
  expect(await degreesNamed(page)).toEqual([
    '1:C4', '♭2:Db4', '2:D4', '♭3:Eb4', '3:E4', '4:F4',
    '♯4:F#4', '5:G4', '♭6:Ab4', '6:A4', '♭7:Bb4', '7:B4',
  ]);

  await page.locator('[data-action="octave-up"]').click();
  expect((await degreesNamed(page))[0]).toBe('1:C5');
});

test('AC-2.2.15/5 — The note name is spelled diatonically against the Key: each degree takes its own letter, so degree 3 in D♭ is `F` and `b3` is `Fb` rather than `E`, which is how the interval is written on a stave: on the strip as well as in the grid', async ({ page }) => {
  await melodicBlank(page);
  await page.locator('.key-picker').selectOption('Gb');

  // Gb major's fourth is Cb, not B: a fourth must sit on the fourth's letter.
  await expect(page.locator('.degree[data-degree="4"] .degree-name')).toHaveText('Cb5');

  // And the seven in-scale degrees use seven different letters, which is the
  // property that makes a scale readable at all.
  const letters = await page.locator('.degree[data-in-scale="true"]').evaluateAll((els) =>
    els.map((e) => e.dataset.noteName[0])
  );
  expect(letters).toHaveLength(7);
  expect(new Set(letters).size).toBe(7);
});

test('AC-2.2.11 — turning a Slot on gives it the armed pitch', async ({ page }) => {
  await melodicBlank(page);
  await page.locator('.degree[data-degree="5"]').click();
  await page.locator('[data-action="octave-down"]').click();

  // Beat 2 Slot 1, whose computed default accent is Weak (AC-3.1.1).
  await accentZone(page, 1, 0).click();
  const slot = await slotState(page, 1, 0);
  expect(slot.on).toBe(true);
  expect(slot.pitch).toEqual({ degree: '5', octaveOffset: -1 });
  expect(slot.accent).toBeUndefined(); // left computed, not frozen
});

test.describe('touchscreen', () => {
  // AC-2.2.12's floor is about fingers, so this context reports a coarse
  // pointer. Without it Playwright's desktop Chromium reports `pointer: fine`
  // and AC-2.2.17 hands back the smaller target — which would be correct
  // behaviour and a false failure here.
  test.use({ hasTouch: true, isMobile: true });

test('AC-2.2.12 — both zones stay tappable on the largest Pattern at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // The AC-15.1.10 worst case: 8 Measures of 12/8 at Straight 16ths, Melodic.
  // A new Measure inherits the previous one's meter, and a blank Beat changes
  // Recipe without prompting, so this needs no dialog handling.
  await page.evaluate(async () => {
    window.__rm.loadBlank('12/8');
    await window.__rm.handlers.onSoundMode('melodic');
    for (let i = 0; i < 7; i++) await window.__rm.handlers.onAddMeasure();
    const p = window.__rm.getState().pattern;
    for (let m = 0; m < p.measures.length; m++) {
      for (let b = 0; b < p.measures[m].beats.length; b++) {
        await window.__rm.handlers.onRecipe('straight-16ths', m, b);
      }
    }
  });
  await expect(page.locator('.measure')).toHaveCount(8);

  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('.slot')].map((s) => ({
      w: s.getBoundingClientRect().width,
      note: s.querySelector('.slot-note').getBoundingClientRect().height,
      accent: s.querySelector('.slot-accent').getBoundingClientRect().height,
    }))
  );
  expect(boxes.length).toBeGreaterThan(100);
  for (const b of boxes) {
    expect(b.w).toBeGreaterThanOrEqual(24);
    expect(b.note).toBeGreaterThanOrEqual(24);
    expect(b.accent).toBeGreaterThanOrEqual(24);
  }

  // And the page still never scrolls sideways (AC-15.1.10).
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflows).toBe(false);
});

});

test('AC-2.2.13 — the pitch strip is visible without opening anything, and absent in Percussive', async ({ page }) => {
  await melodicBlank(page);
  await expect(page.locator('.pitch-strip')).toBeVisible();

  // Not inside a collapsed section: no <details> ancestor.
  const insideDetails = await page.evaluate(
    () => Boolean(document.querySelector('.pitch-strip')?.closest('details'))
  );
  expect(insideDetails).toBe(false);

  await page.locator('.sound-mode').selectOption('percussive');
  await expect(page.locator('.pitch-strip')).toBeHidden();
  await expect(page.locator('.degree')).toHaveCount(0);

  // Still there at mobile width, where the accordions are collapsed (AC-15.1.7).
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.sound-mode').selectOption('melodic');
  await expect(page.locator('.pitch-strip')).toBeVisible();
});

test('AC-2.3.1 — the Key control offers exactly twelve keys', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await expect(page.locator('.key-picker option')).toHaveCount(12);
});

test('AC-2.3.2 — changing Key transposes playback but leaves stored degrees alone', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();

  const inC = await page.evaluate(() => window.__rmMidi());
  await page.locator('.key-picker').selectOption('D');
  const inD = await page.evaluate(() => window.__rmMidi());

  expect(inD - inC).toBe(2);
  const degree = await page.evaluate(
    () => window.__rm.getState().pattern.measures[0].beats[0].slots[0].pitch.degree
  );
  expect(degree).toBe('1');
});

test('AC-2.4.3 — Percussive playback starts immediately, with nothing to load', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();

  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 3000 });
  expect(await page.evaluate(() => window.__rm.getState().soundStatus.status)).toBe('ready');
});

test('AC-2.4.3 — Melodic playback starts immediately too, with no loading state', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();

  await page.locator('[data-action="play"]').click();
  // No wait-for-load: there is nothing to load, so this must be as fast as Percussive.
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 3000 });
  expect(await page.evaluate(() => window.__rm.melodic.getStatus().status)).toBe('ready');
});

test('AC-2.4.2 — playing either Sound Mode fetches no audio asset at all', async ({ page }) => {
  const audioRequests = [];
  page.on('request', (r) => {
    const url = r.url();
    if (/\.(mp3|ogg|wav|sf2|m4a)(\?|$)/i.test(url) || /soundfont/i.test(url)) {
      audioRequests.push(url);
    }
  });

  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 3000 });
  await page.locator('[data-action="stop"]').click();

  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 3000 });

  // Both Modes are pure synthesis; the reverb impulse is generated, not loaded.
  expect(audioRequests, `unexpected audio requests: ${audioRequests.join(', ')}`).toEqual([]);
});

test('AC-2.4.1 — a Melodic note runs the ported chorus, filter and reverb chain', async ({ page }) => {
  await page.goto('/');
  const chain = await page.evaluate(() => {
    const { playMelodic } = window.__rm.melodic;
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const created = { oscillators: [], filters: [], convolvers: [], compressors: [] };
    const realOsc = ctx.createOscillator.bind(ctx);
    ctx.createOscillator = () => {
      const o = realOsc();
      created.oscillators.push(o);
      return o;
    };
    const realFilter = ctx.createBiquadFilter.bind(ctx);
    ctx.createBiquadFilter = () => {
      const f = realFilter();
      created.filters.push(f);
      return f;
    };
    const realConv = ctx.createConvolver.bind(ctx);
    ctx.createConvolver = () => {
      const c = realConv();
      created.convolvers.push(c);
      return c;
    };
    const realComp = ctx.createDynamicsCompressor.bind(ctx);
    ctx.createDynamicsCompressor = () => {
      const c = realComp();
      created.compressors.push(c);
      return c;
    };

    playMelodic(ctx, ctx.destination, { accent: 3, pitch: { frequency: 440, midiNote: 69 } }, 0);

    return {
      oscillators: created.oscillators.length,
      types: created.oscillators.map((o) => o.type),
      detunes: created.oscillators.map((o) => o.detune.value),
      filters: created.filters.length,
      filterType: created.filters[0]?.type,
      convolvers: created.convolvers.length,
      compressors: created.compressors.length,
      hasImpulse: Boolean(created.convolvers[0]?.buffer),
    };
  });

  // Three detuned sines, one low-pass, one shared reverb, one shared compressor.
  expect(chain.oscillators).toBe(3);
  expect(chain.types).toEqual(['sine', 'sine', 'sine']);
  expect(chain.detunes.sort((a, b) => a - b)).toEqual([-5, 0, 5]);
  expect(chain.filters).toBe(1);
  expect(chain.filterType).toBe('lowpass');
  expect(chain.convolvers).toBe(1);
  expect(chain.compressors).toBe(1);
  expect(chain.hasImpulse).toBe(true); // synthesised, not loaded
});

test('AC-2.4.4 — concurrent Melodic notes share one reverb and one compressor', async ({ page }) => {
  await page.goto('/');
  const counts = await page.evaluate(() => {
    const { playMelodic } = window.__rm.melodic;
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    let convolvers = 0;
    let compressors = 0;
    const realConv = ctx.createConvolver.bind(ctx);
    ctx.createConvolver = () => {
      convolvers += 1;
      return realConv();
    };
    const realComp = ctx.createDynamicsCompressor.bind(ctx);
    ctx.createDynamicsCompressor = () => {
      compressors += 1;
      return realComp();
    };

    for (let i = 0; i < 8; i++) {
      playMelodic(ctx, ctx.destination, { accent: 2, pitch: { frequency: 440, midiNote: 69 } }, i * 0.1);
    }
    return { convolvers, compressors };
  });

  // Eight notes, still one of each — shared, not per note.
  expect(counts.convolvers).toBe(1);
  expect(counts.compressors).toBe(1);
});

test('AC-2.4.5 — a Percussive note is one sine bending down, dry', async ({ page }) => {
  await page.goto('/');
  const shape = await page.evaluate(() => {
    const { playPercussive } = window.__rmAudio;
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const oscillators = [];
    let filters = 0;
    let convolvers = 0;
    const realOsc = ctx.createOscillator.bind(ctx);
    ctx.createOscillator = () => {
      const o = realOsc();
      const ramp = o.frequency.exponentialRampToValueAtTime.bind(o.frequency);
      o.frequency.exponentialRampToValueAtTime = (v, t) => {
        o.__rampTarget = v;
        return ramp(v, t);
      };
      oscillators.push(o);
      return o;
    };
    const realFilter = ctx.createBiquadFilter.bind(ctx);
    ctx.createBiquadFilter = () => {
      filters += 1;
      return realFilter();
    };
    const realConv = ctx.createConvolver.bind(ctx);
    ctx.createConvolver = () => {
      convolvers += 1;
      return realConv();
    };

    playPercussive(ctx, ctx.destination, 3, 0);
    return {
      count: oscillators.length,
      type: oscillators[0].type,
      start: oscillators[0].frequency.value,
      rampTarget: oscillators[0].__rampTarget,
      filters,
      convolvers,
    };
  });

  expect(shape.count).toBe(1);
  expect(shape.type).toBe('sine');
  // The downward bend to 0.85x is what makes it read as a struck drum.
  expect(shape.rampTarget / 620).toBeCloseTo(0.85, 5);
  expect(shape.filters).toBe(0);
  expect(shape.convolvers).toBe(0);
});

test("AC-2.2.17/1 — On a precise pointer the note band's hit area shrinks to the strip it draws, so the Slot is shorter and the strip reads as the thin thing it is", async ({ browser }) => {
  const pointer = await bandOn(browser, { hasTouch: false });
  expect(pointer.band).toBeLessThan(24);
  expect(pointer.band).toBeCloseTo(pointer.strip, 0);

  const touch = await bandOn(browser, { hasTouch: true, isMobile: true });
  expect(pointer.slot).toBeLessThan(touch.slot);
});

test("AC-2.2.17/2 — On a touchscreen, at any viewport width, it keeps the 24 CSS pixel target AC-2.2.12 requires — a tablet held in the hand is a touchscreen whatever its width", async ({ browser }) => {
  // 1280px wide and still a touchscreen: the case a viewport-keyed rule gets
  // wrong, which is why this keys on the pointing device.
  const wide = await bandOn(browser, { hasTouch: true, isMobile: true }, { width: 1280, height: 800 });
  expect(wide.band).toBeGreaterThanOrEqual(24);

  const narrow = await bandOn(browser, { hasTouch: true, isMobile: true }, { width: 390, height: 844 });
  expect(narrow.band).toBeGreaterThanOrEqual(24);
});

test("AC-2.2.17/3 — The finger-sized target is the default, so a browser that cannot report the pointing device keeps it rather than losing it", async ({ page }) => {
  // The 24px target is declared unconditionally and only relaxed inside
  // `@media (pointer: fine)`. A browser that does not understand the query
  // never applies the relaxation, so it keeps the safe value — assert the
  // stylesheet is written that way round, since a UA that ignores the query
  // cannot be emulated here.
  await page.goto('/');
  const rules = await page.evaluate(() => {
    const found = { base: null, relaxed: null };
    for (const sheet of document.styleSheets) {
      let list;
      try { list = sheet.cssRules; } catch { continue; }
      for (const rule of list) {
        if (rule.selectorText === '.slot-note' && rule.style.minHeight) {
          found.base = rule.style.minHeight;
        }
        if (rule.media && rule.conditionText && rule.conditionText.includes('pointer: fine')) {
          for (const inner of rule.cssRules) {
            if (inner.selectorText === '.slot-note' && inner.style.minHeight) {
              found.relaxed = inner.style.minHeight;
            }
          }
        }
      }
    }
    return found;
  });

  expect(rules.base).toBe('24px');
  expect(rules.relaxed).not.toBeNull();
  expect(rules.relaxed).not.toBe('24px');
});

/** The note band, strip and Slot heights under a given device profile. */
async function bandOn(browser, deviceOptions, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport, ...deviceOptions });
  const page = await context.newPage();
  await page.goto('/');
  await page.evaluate(async () => {
    window.__rm.loadBlank('4/4');
    await window.__rm.handlers.onSoundMode('melodic');
    await window.__rm.handlers.onSlotTap(0, 0, 0);
  });
  const band = await page.locator('.slot-note:not([disabled])').first().boundingBox();
  const strip = await page.locator('.slot-pitch').first().boundingBox();
  const slot = await page.locator('.slot.has-note').first().boundingBox();
  await context.close();
  return { band: band.height, strip: strip.height, slot: slot.height };
}

test('AC-2.2.18 — The armed control stays marked while the pointer is on it', async ({ page }) => {
  await melodicBlank(page);

  // Tap a degree; on a touchscreen the hover state then sticks to it, so the
  // hovered rendering *is* the resting rendering there. The armed fill must
  // survive it — before the fix, hover outranked armed and left the chip's
  // near-black ink on the hover ground.
  const armedFill = async (locator) => {
    await locator.hover();
    return locator.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fill: cs.backgroundColor, ink: cs.color };
    });
  };

  const degree = page.locator('.degree[data-degree="4"]');
  await degree.click();
  await expect(degree).toHaveAttribute('aria-pressed', 'true');
  const brand = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()
  );
  const hovered = await armedFill(degree);
  expect(hovered.fill).toBe('rgb(240, 160, 32)'); // --brand, not the hover ground
  expect(brand).toBe('#f0a020'); // the literal above tracks the token

  // A second chip arms the same way — the rule is the strip's, not one button's.
  const flatThree = page.locator('.degree[data-degree="b3"]');
  await flatThree.click();
  await expect(flatThree).toHaveAttribute('aria-pressed', 'true');
  expect((await armedFill(flatThree)).fill).toBe('rgb(240, 160, 32)');
});

/* --- US-2.5 — Choose a scale --------------------------------------------- */

/** The scale picker's option values, grouped by their optgroup label. */
const scaleGroups = (page) =>
  page.locator('.scale-picker optgroup').evaluateAll((groups) =>
    Object.fromEntries(
      groups.map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.value)])
    )
  );

/** The strip's in-scale chip tokens, in order. */
const inScaleTokens = (page) =>
  page.locator('.degree').evaluateAll((els) =>
    els.filter((e) => e.dataset.inScale === 'true').map((e) => e.dataset.degree)
  );

test('AC-2.5.1/1 — The seven church modes are offered', async ({ page }) => {
  await melodicBlank(page);
  expect((await scaleGroups(page))['Church Modes']).toEqual([
    'ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian',
  ]);
});

test('AC-2.5.1/2 — All five pentatonic modes are offered — Major, Suspended, Blues Minor, Blues Major, and Minor Pentatonic', async ({ page }) => {
  await melodicBlank(page);
  expect((await scaleGroups(page))['Pentatonic']).toEqual([
    'major-pentatonic', 'suspended-pentatonic', 'blues-minor-pentatonic',
    'blues-major-pentatonic', 'minor-pentatonic',
  ]);
});

test('AC-2.5.1/3 — Minor Blues and Major Blues (six-note) are offered', async ({ page }) => {
  await melodicBlank(page);
  expect((await scaleGroups(page))['Blues']).toEqual(['minor-blues', 'major-blues']);
});

test('AC-2.5.1/4 — Harmonic Minor and Melodic Minor are offered', async ({ page }) => {
  await melodicBlank(page);
  expect((await scaleGroups(page))['Other']).toEqual(['harmonic-minor', 'melodic-minor']);
});

test("AC-2.5.2/1 — Exactly the scale's own degrees are marked in-scale, and changing the scale re-marks the strip", async ({ page }) => {
  await melodicBlank(page);
  // Ionian by default: the major scale and nothing else.
  expect(await inScaleTokens(page)).toEqual(['1', '2', '3', '4', '5', '6', '7']);

  await page.locator('.scale-picker').selectOption('minor-pentatonic');
  expect(await inScaleTokens(page)).toEqual(['1', 'b3', '4', '5', 'b7']);

  await page.locator('.scale-picker').selectOption('lydian');
  expect(await inScaleTokens(page)).toEqual(['1', '2', '3', '#4', '5', '6', '7']);
});

test('AC-2.5.2/2 — An out-of-scale chip can still be armed and stamped', async ({ page }) => {
  await melodicBlank(page); // ionian: b6 is out of scale
  await accentZone(page, 0, 0).click();
  const chip = page.locator('.degree[data-degree="b6"]');
  await expect(chip).toHaveAttribute('data-in-scale', 'false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await noteBand(page, 0, 0).click();
  expect((await pitchOf(page, 0, 0)).degree).toBe('b6');
});

test('AC-2.5.2/3 — In-scale is legible by more than colour alone', async ({ page }) => {
  await melodicBlank(page);
  // The marking is a shape difference — a thicker bottom edge — not only a hue.
  const widthOf = (sel) =>
    page.locator(sel).evaluate((el) => parseFloat(getComputedStyle(el).borderBottomWidth));
  const inScale = await widthOf('.degree[data-degree="2"]');
  const outOfScale = await widthOf('.degree[data-degree="b2"]');
  expect(inScale).toBeGreaterThan(outOfScale);
});

test("AC-2.5.3 — Chip labels follow the scale's own spelling", async ({ page }) => {
  await melodicBlank(page);
  // Ionian spells the tritone #4…
  await expect(page.locator('.degree[data-degree="#4"]')).toBeVisible();
  await expect(page.locator('.degree[data-degree="b5"]')).toHaveCount(0);

  // …Locrian and the Blues scales spell it b5, and the chip stamps what it says.
  for (const scale of ['locrian', 'minor-blues']) {
    await page.locator('.scale-picker').selectOption(scale);
    await expect(page.locator('.degree[data-degree="b5"]')).toBeVisible();
    await expect(page.locator('.degree[data-degree="#4"]')).toHaveCount(0);
  }
  await accentZone(page, 0, 0).click();
  await page.locator('.degree[data-degree="b5"]').click();
  await noteBand(page, 0, 0).click();
  expect((await pitchOf(page, 0, 0)).degree).toBe('b5');
});

test('AC-2.5.4/1 — A changed scale survives a close and reopen of the Pattern', async ({ page }) => {
  await melodicBlank(page); // owned Pattern p_test
  await page.locator('.scale-picker').selectOption('dorian');

  await page.evaluate(() => window.__rm.loadBlank('3/4', 'Elsewhere'));
  await page.evaluate(() => window.__rm.handlers.onOpen('p_test', true));
  await expect(page.locator('.scale-picker')).toHaveValue('dorian');
  expect(await page.evaluate(() => window.__rm.getState().pattern.scale)).toBe('dorian');
});

test('AC-2.5.4/2 — A Melodic Pattern that carries no stored scale reads as Ionian (Major), so Patterns saved before the field existed need no migration', async ({ page }) => {
  await melodicBlank(page);
  await page.evaluate(() => {
    const pattern = structuredClone(window.__rm.getState().pattern);
    delete pattern.scale;
    window.__rm.loadPattern(pattern, { owned: true });
  });
  await expect(page.locator('.scale-picker')).toHaveValue('ionian');
  expect(await inScaleTokens(page)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  // Reading it as Ionian writes nothing: the Pattern still carries no scale.
  expect(await page.evaluate(() => 'scale' in window.__rm.getState().pattern)).toBe(false);
});

test('AC-2.5.4/3 — `scale` is present only on Melodic Patterns: switching to Percussive removes it, switching to Melodic restores one (the stored value if present, else Ionian)', async ({ page }) => {
  await melodicBlank(page);
  expect(await page.evaluate(() => window.__rm.getState().pattern.scale)).toBe('ionian');

  await page.locator('.sound-mode').selectOption('percussive');
  expect(await page.evaluate(() => 'scale' in window.__rm.getState().pattern)).toBe(false);

  await page.locator('.sound-mode').selectOption('melodic');
  expect(await page.evaluate(() => window.__rm.getState().pattern.scale)).toBe('ionian');
});

test('AC-2.5.4/4 — Every shipped Melodic Pattern carries its `scale` explicitly, a catalogue id, never left to the default', async ({ page }) => {
  await melodicBlank(page);
  const scales = await page.evaluate(() =>
    window.__rm.seedStore.loadAll().filter((p) => p.soundMode === 'melodic').map((p) => [p.name, p.scale])
  );
  expect(scales.length).toBeGreaterThan(0);
  const ids = SCALES.map((s) => s.id);
  for (const [name, s] of scales) expect(ids, name).toContain(s);
});

test('AC-2.5.4/5 — On a shipped Pattern the scale is read-only in place, exactly as the Key is: changing it goes through the same guarded copy flow, never mutating the shipped Pattern', async ({ page }) => {
  await page.goto('/');
  const id = await page.evaluate(() => {
    const shipped = window.__rm.seedStore.loadAll().find((p) => p.soundMode === 'melodic');
    window.__rm.handlers.onOpen(shipped.id, false);
    return shipped.id;
  });

  // Changing the scale on the shipped Pattern asks for a new name first.
  await page.locator('.scale-picker').selectOption('aeolian');
  await expect(page.locator('.dialog-input')).toBeVisible();

  // Cancelling leaves the shipped Pattern exactly as shipped, still not owned.
  await page.locator('.dialog-button:not(.primary)', { hasText: 'Cancel' }).click();
  const after = await page.evaluate(
    (pid) => ({
      scale: window.__rm.seedStore.loadAll().find((p) => p.id === pid).scale,
      isOwned: window.__rm.getState().isOwned,
    }),
    id
  );
  expect(after.scale).toBe('ionian');
  expect(after.isOwned).toBe(false);
});

test('AC-2.5.5 — The scale never changes what is stamped or heard', async ({ page }) => {
  await melodicBlank(page);
  await accentZone(page, 0, 0).click();
  await page.locator('.degree[data-degree="3"]').click();
  await noteBand(page, 0, 0).click();
  await accentZone(page, 1, 0).click();
  await page.locator('.degree[data-degree="b7"]').click();
  await noteBand(page, 1, 0).click();

  const before = await page.evaluate(() =>
    JSON.stringify(window.__rm.getState().pattern.measures)
  );
  for (const scale of ['minor-pentatonic', 'harmonic-minor', 'ionian']) {
    await page.locator('.scale-picker').selectOption(scale);
    const after = await page.evaluate(() =>
      JSON.stringify(window.__rm.getState().pattern.measures)
    );
    expect(after, scale).toBe(before);
  }
});

/* --- the two strips are tools for the same grid (AC-1.3.11/5) -------------- */

test('AC-1.3.11/5 — Arming a pitch on the pitch strip disarms the armed Recipe', async ({ page }) => {
  await melodicBlank(page);
  await accentZone(page, 0, 0).click();

  // Stepping the octave is arming a pitch: the Recipe brush stands down.
  await page.locator('.recipe-chip[data-recipe="straight-8ths"]').click();
  await expect(page.locator('.grid')).toHaveClass(/recipe-armed/);
  await page.locator('[data-action="octave-down"]').click();
  await expect(page.locator('.grid')).not.toHaveClass(/recipe-armed/);
  await expect(page.locator('.recipe-chip.armed')).toHaveCount(0);

  // So is arming a degree.
  await page.locator('.recipe-chip[data-recipe="straight-8ths"]').click();
  await expect(page.locator('.grid')).toHaveClass(/recipe-armed/);
  await page.locator('.degree[data-degree="b3"]').click();
  await expect(page.locator('.grid')).not.toHaveClass(/recipe-armed/);

  // The maintainer's exact gesture now stamps: octave changed, degree armed,
  // note band tapped — the Slot takes the pitch and the Beat keeps its Recipe.
  await noteBand(page, 0, 0).click();
  expect(await pitchOf(page, 0, 0)).toEqual({ degree: 'b3', octaveOffset: -1 });
  expect(
    await page
      .locator('.measure[data-measure="0"] .beat[data-beat="0"]')
      .getAttribute('data-recipe')
  ).toBe('straight-16ths');
});

// --- AC-2.2.19: the Key is chosen on the pitch strip ------------------------

test('AC-2.2.19/1 — The Key picker renders on the pitch strip beside the scale picker', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');

  await expect(page.locator('.pitch-strip .key-picker')).toBeVisible();
  await expect(page.locator('.pitch-strip .scale-picker')).toBeVisible();

  // Beside: both sit on the strip, the Key first — with the palette it governs.
  const order = await page.evaluate(() => {
    const key = document.querySelector('.pitch-strip .key-picker');
    const scale = document.querySelector('.pitch-strip .scale-picker');
    return Boolean(key.compareDocumentPosition(scale) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(order).toBe(true);

  // And it is the working Key control: changing it renames the degree chips.
  await page.locator('.pitch-strip .key-picker').selectOption('D');
  expect(await page.evaluate(() => window.__rm.getState().pattern.key)).toBe('D');
});

test('AC-2.2.19/2 — The Edit section holds no Key picker', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');

  await expect(page.locator('.pitch-strip .key-picker')).toBeVisible();
  await expect(page.locator('[data-section="edit"] .key-picker')).toHaveCount(0);
});

test("AC-2.2.19/3 — In Percussive mode there is no Key picker anywhere, the pitch strip included (consistent with AC-2.1.2's treatment of Key)", async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await expect(page.locator('.sound-mode')).toHaveValue('percussive');
  await expect(page.locator('.key-picker')).toHaveCount(0);
});
