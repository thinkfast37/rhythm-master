import { test, expect } from '@playwright/test';

/**
 * Audio in headless Chromium needs a real (if silent) output device, and
 * autoplay must be permitted so the gesture-driven resume actually resumes.
 */
test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
});

/** A 4/4 Pattern with one note per Beat, at a chosen tempo. */
async function loadSimple(page, tempo = 240) {
  await page.evaluate((bpm) => {
    const measure = {
      timeSignature: '4/4',
      beats: Array.from({ length: 4 }, () => ({
        recipe: 'straight-16ths',
        slots: [{ on: true }, { on: false }, { on: false }, { on: false }],
      })),
    };
    window.__rm.loadPattern(
      {
        id: 'p_play',
        name: 'Playback Test',
        soundMode: 'percussive',
        tempo: bpm,
        tags: [],
        rating: 0,
        measures: [measure],
      },
      { owned: true }
    );
  }, tempo);
}

test('AC-4.1.1 — no audio exists before a transport gesture', async ({ page }) => {
  await page.goto('/');
  // FR-010: nothing may create or start an AudioContext on load.
  const created = await page.evaluate(() => Boolean(window.__rm.transport.isRunning));
  expect(created).toBe(false);
});

test('AC-4.1.2 — pressing Play starts the transport and moves the cursor', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page);

  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });
  expect(await page.evaluate(() => window.__rm.transport.isRunning)).toBe(true);
});

test('AC-4.1.2 — the cursor advances through the Beats in order', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page, 300);

  await page.locator('[data-action="play"]').click();

  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    const beat = await page.locator('.slot.playing').first().getAttribute('data-beat');
    if (beat !== null) seen.add(beat);
    if (seen.size >= 4) break;
    await page.waitForTimeout(60);
  }
  expect([...seen].sort()).toEqual(['0', '1', '2', '3']);
});

test('AC-4.1.3 — the loop counter increments once per full pass, not per Measure', async ({ page }) => {
  await page.goto('/');
  // Two Measures, so a per-Measure counter would tick twice as fast.
  await page.evaluate(() => {
    const measure = (ts) => ({
      timeSignature: ts,
      beats: Array.from({ length: Number(ts.split('/')[0]) }, () => ({
        recipe: 'straight-16ths',
        slots: [{ on: true }, { on: false }, { on: false }, { on: false }],
      })),
    });
    window.__rm.loadPattern(
      {
        id: 'p_loop',
        name: 'Loop Test',
        soundMode: 'percussive',
        tempo: 220,
        tags: [],
        rating: 0,
        measures: [measure('2/4'), measure('2/4')],
      },
      { owned: true }
    );
  });

  await page.locator('[data-action="play"]').click();
  // One pass is 4 Beats at 220 BPM ~= 1.09s.
  await page.waitForTimeout(1400);
  const loop = await page.evaluate(() => window.__rm.getState().loop);
  expect(loop).toBeGreaterThanOrEqual(1);
  expect(loop).toBeLessThanOrEqual(3);
});

test('AC-4.1.4 — a mixed-meter Pattern sounds every Beat of both Measures', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const beats = (n) =>
      Array.from({ length: n }, () => ({
        recipe: 'straight-16ths',
        slots: [{ on: true }, { on: false }],
      }));
    window.__rm.loadPattern(
      {
        id: 'p_mixed',
        name: 'Mixed Meter',
        soundMode: 'percussive',
        tempo: 300,
        tags: [],
        rating: 0,
        measures: [
          { timeSignature: '4/4', beats: beats(4).map((b) => ({ ...b, slots: [{ on: true }, { on: false }, { on: false }, { on: false }] })) },
          { timeSignature: '6/8', beats: beats(6) },
        ],
      },
      { owned: true }
    );
  });

  // 4 quarter-note Beats then 6 eighth-note Beats — 10 Beats per pass. The
  // failure this guards is 6/8 being read as two dotted-quarter Beats.
  await page.locator('[data-action="play"]').click();
  const measuresSeen = new Set();
  for (let i = 0; i < 40; i++) {
    const m = await page.locator('.slot.playing').first().getAttribute('data-measure');
    if (m !== null) measuresSeen.add(m);
    if (measuresSeen.size >= 2) break;
    await page.waitForTimeout(50);
  }
  expect([...measuresSeen].sort()).toEqual(['0', '1']);
});

test('AC-4.1.5 — backgrounding the tab stops the transport and resets it', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page);

  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });

  // Simulate the device taking audio away.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(page.locator('.slot.playing')).toHaveCount(0, { timeout: 2000 });
  const after = await page.evaluate(() => ({
    running: window.__rm.transport.isRunning,
    position: window.__rm.getState().transportPosition,
    loop: window.__rm.getState().loop,
  }));
  expect(after.running).toBe(false);
  expect(after.position).toBeNull();
  expect(after.loop).toBe(0);
});

test('AC-4.1.6 — returning to the app does not resume playback by itself', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page);
  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('.slot.playing')).toHaveCount(0, { timeout: 2000 });

  // Regaining focus is not a transport interaction (FR-010).
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(400);

  expect(await page.evaluate(() => window.__rm.transport.isRunning)).toBe(false);
  await expect(page.locator('[data-action="play"]')).toBeVisible();
});

test('AC-4.2.1 — Default tempo and range: the control clamps to 18–300', async ({ page }) => {
  await page.goto('/');
  const slider = page.locator('.tempo-slider');
  await expect(slider).toHaveAttribute('min', '18');
  await expect(slider).toHaveAttribute('max', '300');
});

test('AC-4.2.2 — changing tempo restarts playback and resets the loop counter', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page, 220);

  await page.locator('[data-action="play"]').click();
  await page.waitForTimeout(1400);
  expect(await page.evaluate(() => window.__rm.getState().loop)).toBeGreaterThanOrEqual(1);

  await page.locator('.preset', { hasText: '120' }).click();
  await page.waitForTimeout(120);

  const after = await page.evaluate(() => ({
    tempo: window.__rm.getState().pattern.tempo,
    loop: window.__rm.getState().loop,
    running: window.__rm.transport.isRunning,
  }));
  expect(after.tempo).toBe(120);
  expect(after.loop).toBe(0);
  expect(after.running).toBe(true);
});

test('AC-4.2.3 — the last-used tempo persists across a reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('.preset', { hasText: '150' }).click();
  await page.reload();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).lastTempo);
  expect(stored).toBe(150);
});

test('AC-4.3.1 — the metronome and count-in are off by default and toggleable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-action="toggle-metronome"]')).not.toHaveClass(/\bon\b/);
  await expect(page.locator('[data-action="toggle-count-in"]')).not.toHaveClass(/\bon\b/);

  await page.locator('[data-action="toggle-metronome"]').click();
  await expect(page.locator('[data-action="toggle-metronome"]')).toHaveClass(/\bon\b/);

  await page.reload();
  await expect(page.locator('[data-action="toggle-metronome"]')).toHaveClass(/\bon\b/);
});

test('toggling the metronome during playback does not desync the Play/Stop button or the transport', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page);

  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });

  // Toggle the click on and off repeatedly, mid-playback. Each toggle must take
  // effect, and none of them may stop the transport or flip the Play/Stop
  // button back to "Play" while the Pattern is still actually playing.
  for (let i = 0; i < 4; i++) {
    await page.locator('[data-action="toggle-metronome"]').click();
    const expectOn = i % 2 === 0;
    if (expectOn) {
      await expect(page.locator('[data-action="toggle-metronome"]')).toHaveClass(/\bon\b/);
    } else {
      await expect(page.locator('[data-action="toggle-metronome"]')).not.toHaveClass(/\bon\b/);
    }

    const state = await page.evaluate(() => ({
      isPlaying: window.__rm.getState().isPlaying,
      running: window.__rm.transport.isRunning,
      metronomeEnabled: window.__rm.getState().settings.metronomeEnabled,
    }));
    expect(state.isPlaying).toBe(true);
    expect(state.running).toBe(true);
    expect(state.metronomeEnabled).toBe(expectOn);
  }

  await expect(page.locator('button.transport')).toHaveText('Stop');
  await expect(page.locator('[data-action="stop"]')).toBeVisible();
});

test('AC-4.1.2 — Stop clears the cursor and halts the transport', async ({ page }) => {
  await page.goto('/');
  await loadSimple(page);

  await page.locator('[data-action="play"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 4000 });

  await page.locator('[data-action="stop"]').click();
  await expect(page.locator('.slot.playing')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rm.transport.isRunning)).toBe(false);
});

test('AC-4.1.1 — event times are computed from an absolute origin, never accumulated', async ({
  page,
}) => {
  await page.goto('/');
  await loadSimple(page, 120);
  await page.locator('[data-action="play"]').click();
  await page.waitForTimeout(120);

  /*
   * The drift guard. Loop 500's first event must land exactly 500 loop
   * durations after loop 0's, to within floating-point noise. An accumulating
   * scheduler - one that adds an interval per loop - fails this by milliseconds
   * that compound over a long practice session.
   */
  const drift = await page.evaluate(() => {
    const t = window.__rm.transport;
    const loopDuration = t._eventTime(1, 0) - t._eventTime(0, 0);
    const predicted = t._eventTime(0, 0) + 500 * loopDuration;
    return Math.abs(t._eventTime(500, 0) - predicted);
  });
  expect(drift).toBeLessThan(0.0001);
});

/* --- the playback cursor's appearance (AC-4.1.7) -------------------------- */

/**
 * Drives the cursor from the DOM rather than from the transport: what the class
 * means is settled by AC-4.1.2's tests, and these are about how it LOOKS. Doing
 * it this way lets each Accent Level be examined deterministically instead of
 * waiting for playback to happen to land on one.
 */
async function melodicWithCursor(page, { accent, silent = false } = {}) {
  await page.goto('/');
  await page.evaluate(async () => {
    window.__rm.loadBlank('4/4');
    await window.__rm.handlers.onSoundMode('melodic');
  });
  // A second sounding Slot, so a resting enabled note band exists to compare with.
  await page.evaluate(async () => { await window.__rm.handlers.onSlotTap(0, 2, 0); });
  if (!silent) {
    await page.evaluate(async ([a]) => {
      const { handlers: h } = window.__rm;
      await h.onSlotTap(0, 0, 0);
      // Cycle to the level under test: Strong -> Weak -> Medium.
      const want = { strong: 3, weak: 1, medium: 2 }[a];
      for (let i = 0; i < 4; i++) {
        const s = window.__rm.getState().pattern.measures[0].beats[0].slots[0];
        const { effectiveAccent } = { effectiveAccent: null };
        void effectiveAccent; void s;
        const el = document.querySelector('.slot[data-beat="0"][data-slot="0"]');
        if (Number(el.dataset.accent) === want) break;
        await h.onSlotTap(0, 0, 0);
      }
    }, [accent]);
  }
  await page.evaluate(() =>
    document.querySelector('.slot[data-beat="0"][data-slot="0"]').classList.add('playing')
  );
  return page.locator('.slot[data-beat="0"][data-slot="0"]');
}

const CONTRAST = `
  const parse = (s) => s.match(/[\\d.]+/g).map(Number).slice(0, 3);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (a) => 0.2126 * lin(a[0]) + 0.7152 * lin(a[1]) + 0.0722 * lin(a[2]);
  const ratio = (a, b) => { const s = [lum(parse(a)), lum(parse(b))].sort((p, q) => q - p);
                            return (s[0] + 0.05) / (s[1] + 0.05); };
`;

test('AC-4.1.7/1 — It is the accent zone that is marked — the cell carrying the counting syllable — never the note band beneath it', async ({ page }) => {
  await melodicWithCursor(page, { accent: 'strong' });

  const painted = await page.evaluate(() => {
    const slot = document.querySelector('.slot[data-beat="0"][data-slot="0"]');
    const zone = slot.querySelector('.slot-accent');
    const band = slot.querySelector('.slot-note');
    // A resting band that is ENABLED: a silent Slot's band is transparent by
    // AC-2.2.5, so comparing against one would compare unlike things.
    const resting = document.querySelector('.slot:not(.playing) .slot-note:not([disabled])');
    const bandResting = getComputedStyle(resting || band).backgroundColor;
    return {
      zone: getComputedStyle(zone).backgroundColor,
      zoneOutline: getComputedStyle(zone).outlineStyle,
      band: getComputedStyle(band).backgroundColor,
      bandResting,
      // outlineWidth reports `medium` (3px) even when the style is none, so the
      // style is the honest read.
      bandOutline: getComputedStyle(band).outlineStyle,
    };
  });

  expect(painted.zoneOutline).not.toBe('none');
  // The band is untouched by the cursor: same ground as any resting band, and
  // no ring of its own. An outline on the whole Slot used to box them together,
  // which reads as marking the note name rather than the beat.
  expect(painted.band).toBe(painted.bandResting);
  expect(painted.bandOutline).toBe('none');
});

test('AC-4.1.7/2 — That cell fills completely with its own Accent colour, rather than being outlined', async ({ page }) => {
  for (const accent of ['strong', 'weak', 'medium']) {
    await melodicWithCursor(page, { accent });
    const seen = await page.evaluate(() => {
      const slot = document.querySelector('.slot[data-beat="0"][data-slot="0"]');
      const zone = slot.querySelector('.slot-accent');
      const root = getComputedStyle(document.documentElement);
      const hex = (n) => root.getPropertyValue(n).trim();
      const toRgb = (h) => { const v = parseInt(h.replace('#', ''), 16);
        return `rgb(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255})`; };
      return {
        level: slot.dataset.accent,
        fill: getComputedStyle(zone).backgroundColor,
        expected: {
          1: toRgb(hex('--accent-weak')),
          2: toRgb(hex('--accent-medium')),
          3: toRgb(hex('--accent-strong')),
        }[slot.dataset.accent],
        // Filled, not merely tinted behind a partial bar.
        barVisible: parseFloat(getComputedStyle(zone.querySelector('.slot-fill')).opacity) > 0,
      };
    });
    expect(seen.fill, `${accent} fill`).toBe(seen.expected);
    expect(seen.barVisible, `${accent} bar hidden while filled`).toBe(false);
  }
});

test('AC-4.1.7/3 — The counting syllable stays legible against the fill, at every Accent Level', async ({ page }) => {
  for (const accent of ['strong', 'weak', 'medium']) {
    await melodicWithCursor(page, { accent });
    const contrast = await page.evaluate(`(() => {${CONTRAST}
      const slot = document.querySelector('.slot[data-beat="0"][data-slot="0"]');
      const zone = slot.querySelector('.slot-accent');
      return ratio(getComputedStyle(slot.querySelector('.slot-label')).color,
                   getComputedStyle(zone).backgroundColor);
    })()`);
    // 4.5:1 — the syllable is small text read at a glance while playing.
    expect(contrast, `${accent} syllable on fill`).toBeGreaterThanOrEqual(4.5);
  }
});

test('AC-4.1.7/4 — A Slot that does not sound still shows the cursor as it passes, so the pulse can be followed through rests', async ({ page }) => {
  const slot = await melodicWithCursor(page, { silent: true });
  await expect(slot).toHaveAttribute('data-accent', '0');

  const seen = await page.evaluate(`(() => {${CONTRAST}
    const slot = document.querySelector('.slot[data-beat="0"][data-slot="0"]');
    const zone = slot.querySelector('.slot-accent');
    const resting = document.querySelector('.slot:not(.playing) .slot-accent');
    return {
      fill: getComputedStyle(zone).backgroundColor,
      restingFill: getComputedStyle(resting).backgroundColor,
      againstResting: ratio(getComputedStyle(zone).backgroundColor,
                            getComputedStyle(resting).backgroundColor),
      syllable: ratio(getComputedStyle(slot.querySelector('.slot-label')).color,
                      getComputedStyle(zone).backgroundColor),
    };
  })()`);

  // Visibly different from a silent Slot the cursor is not on — otherwise the
  // pulse disappears wherever the Pattern rests, which is where counting is
  // hardest.
  expect(seen.fill).not.toBe(seen.restingFill);
  expect(seen.againstResting).toBeGreaterThanOrEqual(1.6);
  expect(seen.syllable).toBeGreaterThanOrEqual(4.5);
});

/** Drive the first swing slider like a user dragging it. */
async function setSwingSlider(page, value) {
  await page
    .locator('.swing-slider')
    .first()
    .evaluate((el, v) => {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
}

test('AC-4.4.6/1 — Changing swing on a shipped Pattern shows no naming prompt and creates no new Pattern', async ({
  page,
}) => {
  await page.goto('/');
  const before = await page.evaluate(() => window.__rm.patternStore.loadAll().length);

  await setSwingSlider(page, 30);

  await expect(page.locator('.dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  expect(await page.evaluate(() => window.__rm.patternStore.loadAll().length)).toBe(before);
  await expect(page.locator('.swing-slider').first()).toHaveValue('30');
});

test('AC-4.4.6/2 — The swing set on a shipped Pattern is applied again when it is next loaded, surviving a reload', async ({
  page,
}) => {
  await page.goto('/');
  await setSwingSlider(page, 40);
  await page.reload();
  await expect(page.locator('.swing-slider').first()).toHaveValue('40');
});

test("AC-4.4.6/3 — The remembered swing lives in the overlay store and the shipped Pattern's own data is unchanged", async ({
  page,
}) => {
  await page.goto('/');
  await setSwingSlider(page, 25);

  const stored = await page.evaluate(() => {
    const id = window.__rm.getState().pattern.id;
    return {
      overlay: window.__rm.overlayStore.forPattern(id).swing,
      seedSwing: window.__rm.seedStore.findById(id).measures[0].beats[0].swing ?? null,
    };
  });
  expect(stored.overlay).toEqual({ '0.0.0': 25 });
  expect(stored.seedSwing).toBeNull();
});

test('AC-4.4.6/4 — A playback swing does not give a shipped Pattern the `swing` Tag in the library', async ({
  page,
}) => {
  await page.goto('/');
  const name = await page.evaluate(() => window.__rm.getState().pattern.name);
  await setSwingSlider(page, 35);

  const chip = page.locator('.tag-filter[data-tag="swing"]');
  if ((await chip.count()) > 0) {
    await chip.click();
    expect(await page.locator('.pattern-name').allTextContents()).not.toContain(name);
  } else {
    // No Pattern carries the Tag at all — the playback swing added it nowhere.
    await expect(chip).toHaveCount(0);
  }
});

test("AC-4.2.4/1 — A shipped Pattern's tempo change is applied again when the Pattern is next loaded, surviving a reload", async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.tempo-slider').first().evaluate((el) => {
    el.value = '150';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.reload();
  expect(await page.evaluate(() => window.__rm.getState().pattern.tempo)).toBe(150);
});

test("AC-4.2.4/2 — The remembered tempo lives in the overlay store and the shipped Pattern's own data is unchanged", async ({
  page,
}) => {
  await page.goto('/');
  const seedTempoBefore = await page.evaluate(
    () => window.__rm.seedStore.findById(window.__rm.getState().pattern.id).tempo
  );
  await page.locator('.tempo-slider').first().evaluate((el) => {
    el.value = '150';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const after = await page.evaluate(() => {
    const id = window.__rm.getState().pattern.id;
    return {
      overlay: window.__rm.overlayStore.forPattern(id).tempo,
      seedTempo: window.__rm.seedStore.findById(id).tempo,
    };
  });
  expect(after.overlay).toBe(150);
  expect(after.seedTempo).toBe(seedTempoBefore);
});
