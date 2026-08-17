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

test('AC-2.2.1 — a Slot’s degree and octave are settable and shown in the grid', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();

  await page.locator('.degree-picker').selectOption('b3');
  await page.locator('.octave-picker').selectOption('-1');

  const badge = page.locator('.slot[data-beat="0"][data-slot="0"] .slot-pitch');
  await expect(badge).toHaveAttribute('data-degree', 'b3');
  await expect(badge).toHaveAttribute('data-octave', '-1');
  await expect(badge).toHaveText('b3,');
});

test('AC-2.2.2 — pitch survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode').selectOption('melodic');
  await page.locator('.slot[data-beat="0"][data-slot="0"]').click();
  await page.locator('.degree-picker').selectOption('5');

  await page.reload();
  const pitch = await page.evaluate(
    () => window.__rm.getState().pattern.measures[0].beats[0].slots[0].pitch
  );
  expect(pitch.degree).toBe('5');
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
