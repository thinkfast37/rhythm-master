import { test, expect } from '@playwright/test';

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

  await page.locator('.degree[data-degree="3"]').click();
  await page.locator('.accidental[data-accidental="b"]').click();
  await page.locator('[data-action="octave-down"]').click();
  await noteBand(page, 0, 0).click();

  const badge = slotAt(page, 0, 0).locator('.slot-pitch');
  await expect(badge).toHaveAttribute('data-degree', 'b3');
  await expect(badge).toHaveAttribute('data-octave', '-1');
  await expect(badge).toHaveText('b3,');

  // A second stamp fully replaces the first — never two pitches on one Slot.
  await page.locator('.degree[data-degree="5"]').click();
  await page.locator('.accidental[data-accidental=""]').click();
  await noteBand(page, 0, 0).click();
  expect(await pitchOf(page, 0, 0)).toEqual({ degree: '5', octaveOffset: -1 });
});

test('AC-2.2.2 — the armed pitch starts at degree 1 octave 4 and stays armed', async ({ page }) => {
  await melodicBlank(page);
  await expect(page.locator('.degree[data-degree="1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.accidental[data-accidental=""]')).toHaveAttribute('aria-pressed', 'true');
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

test('AC-2.2.4 — degrees 1–8 show by default, 9–15 behind the extend control', async ({ page }) => {
  await melodicBlank(page);
  await expect(page.locator('.degree')).toHaveCount(8);
  await expect(page.locator('.degree[data-degree="8"]')).toBeVisible();
  await expect(page.locator('.degree[data-degree="9"]')).toHaveCount(0);

  await page.locator('[data-action="toggle-extended-degrees"]').click();
  await expect(page.locator('.degree')).toHaveCount(15);
  await expect(page.locator('.degree[data-degree="15"]')).toBeVisible();

  // The accidental control is what keeps the strip's vocabulary as wide as the
  // dropdown it replaces: b3, #4 and b7 are all reachable.
  await accentZone(page, 0, 0).click();
  for (const [accidental, degree, expected] of [['b', '3', 'b3'], ['#', '4', '#4'], ['b', '7', 'b7']]) {
    await page.locator(`.accidental[data-accidental="${accidental}"]`).click();
    await page.locator(`.degree[data-degree="${degree}"]`).click();
    await noteBand(page, 0, 0).click();
    expect((await pitchOf(page, 0, 0)).degree).toBe(expected);
  }

  await page.locator('[data-action="toggle-extended-degrees"]').click();
  await expect(page.locator('.degree')).toHaveCount(8);
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
  await page.locator('.accidental[data-accidental="#"]').click();
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

test('AC-2.2.10 — a Melodic Slot splits into a note band and an accent zone', async ({ page }) => {
  await melodicBlank(page);
  await expect(noteBand(page, 0, 0)).toHaveCount(1);
  await expect(accentZone(page, 0, 0)).toHaveCount(1);
  await expect(noteBand(page, 0, 0)).toHaveAttribute('data-action', 'stamp-pitch');
  await expect(accentZone(page, 0, 0)).toHaveAttribute('data-action', 'cycle-accent');

  // The band sits above the accent zone, and they do not overlap.
  const band = await noteBand(page, 0, 0).boundingBox();
  const zone = await accentZone(page, 0, 0).boundingBox();
  expect(band.y + band.height).toBeLessThanOrEqual(zone.y + 1);

  // Percussive has no band at all: the whole Slot is the accent control.
  await page.locator('.sound-mode').selectOption('percussive');
  await expect(page.locator('.slot-note')).toHaveCount(0);
  await expect(slotAt(page, 0, 0)).toHaveAttribute('data-action', 'cycle-accent');
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
