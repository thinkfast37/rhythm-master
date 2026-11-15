/**
 * The melodic voice (US-2.13): Piano, Synth or Guitar, chosen beside the
 * Sound Mode switch, heard in Practice, overridden by the instrument on screen
 * in the Composer, and carried into the screen-off render.
 *
 * The piano's recordings are the real ones, served by the preview server from
 * `public/audio/piano/`; the guitar's CDN is stubbed with a fake soundfont.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, enterComposer, fret, key, SAMPLE_URL, fakeSoundfont } from './composer-helpers.js';

test.use(launch);

const PIANO = '**/audio/piano/*.mp3';
const RECORDINGS = 29;

/** Every piano recording requested, by URL. */
function watchPiano(page) {
  const urls = [];
  page.on('request', (r) => {
    if (/\/audio\/piano\/[^/]+\.mp3$/.test(r.url())) urls.push(r.url());
  });
  return urls;
}

/** An owned four-Beat Melodic Pattern, one note on each Beat. */
async function melodicPattern(page) {
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  for (let b = 0; b < 4; b++) await page.locator(`.grid .slot[data-beat="${b}"][data-slot="0"]`).click();
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await expect(page.locator('.voice-switch')).toBeVisible();
}

const voiceButton = (page, voice) => page.locator(`.voice-switch [data-voice="${voice}"]`);
const voiceLog = (page) => page.evaluate(() => window.__rm.voiceLog());
const play = (page) => page.locator('[data-action="play"]').click();
const stop = (page) => page.locator('[data-action="stop"]').click();

/** The settings store, edited before the app reads it. */
async function withSettings(page, partial) {
  await page.evaluate((p) => localStorage.setItem('rm.settings.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('rm.settings.v1') ?? '{}'), ...p })), partial);
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
}

// --- AC-2.13.1: the switch ------------------------------------------------------

test('AC-2.13.1/1 — While the Pattern is Melodic, the Pattern header shows a voice switch — Piano, Synth, Guitar, Electric guitar, Bass, Sax, Trumpet, Flute, Drums — beside the Sound Mode switch, the voice in force pressed; while it is Percussive the switch is not shown', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.grid .slot[data-beat="0"][data-slot="0"]').click();
  await expect(page.locator('.pattern-header .sound-mode')).toBeVisible();
  await expect(page.locator('.voice-switch')).toHaveCount(0);

  await page.locator('.sound-mode [data-mode="melodic"]').click();
  const sw = page.locator('.pattern-header .voice-switch');
  await expect(sw).toBeVisible();
  await expect(sw.locator('button')).toHaveText(['Piano', 'Synth', 'Guitar', 'Electric guitar', 'Bass', 'Sax', 'Trumpet', 'Flute', 'Drums']);
  await expect(voiceButton(page, 'piano')).toHaveAttribute('aria-pressed', 'true');
  await expect(sw.locator('[aria-pressed="true"]')).toHaveCount(1);
  // Beside the Sound Mode switch: the next thing in the header, on the same row.
  const adjacent = await page.evaluate(() => document.querySelector('.pattern-header .sound-mode').nextElementSibling?.contains(document.querySelector('.voice-switch')));
  expect(adjacent).toBe(true);
  const mode = await page.locator('.sound-mode').boundingBox();
  const voice = await sw.boundingBox();
  expect(Math.abs(mode.y - voice.y)).toBeLessThan(4);
  expect(voice.x).toBeGreaterThan(mode.x + mode.width - 1);

  await voiceButton(page, 'synth').click();
  await expect(voiceButton(page, 'synth')).toHaveAttribute('aria-pressed', 'true');
  await expect(voiceButton(page, 'piano')).toHaveAttribute('aria-pressed', 'false');

  await page.locator('.sound-mode [data-mode="percussive"]').click();
  await expect(page.locator('.voice-switch')).toHaveCount(0);
});

test('AC-2.13.1/2 — Piano is the voice of a Pattern until another is chosen for it; the choice is remembered for that Pattern alone across loads, and is never Pattern content — choosing a voice never prompts on a shipped Pattern, never changes the Pattern, and no Pattern export carries it', async ({ page }) => {
  // Rewritten 2026-11-15 with the criterion (T504): it proved one app-wide voice,
  // the same on every Pattern, which the revision retires.
  await openApp(page);
  // A shipped Melodic Pattern: on Piano until a voice is chosen, and choosing one is not an edit to it.
  const [shipped, other] = await page.evaluate(() => window.__rm.seedStore.loadAll().filter((p) => p.soundMode === 'melodic').slice(0, 2).map((p) => p.id));
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), shipped);
  await expect(page.locator('.voice-switch')).toBeVisible();
  await expect(voiceButton(page, 'piano')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__rm.currentVoice())).toBe('piano');
  const before = await page.evaluate(() => JSON.stringify(window.__rm.getState().pattern));

  await voiceButton(page, 'guitar').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(voiceButton(page, 'guitar')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__rm.currentVoice())).toBe('guitar');
  expect(await page.evaluate(() => JSON.stringify(window.__rm.getState().pattern))).toBe(before);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  expect(await page.evaluate(() => window.__rm.getState().canUndo ?? window.__rm.canUndo())).toBe(false);

  // That Pattern alone: another shipped Pattern, and a new one of the musician's own, are on Piano.
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), other);
  await expect(voiceButton(page, 'piano')).toHaveAttribute('aria-pressed', 'true');
  await melodicPattern(page);
  await expect(voiceButton(page, 'piano')).toHaveAttribute('aria-pressed', 'true');
  // An owned Pattern remembers its own as a shipped one does.
  const owned = await page.evaluate(() => window.__rm.getState().pattern.id);
  await voiceButton(page, 'sax').click();
  const ownedBefore = await page.evaluate((id) => JSON.stringify(window.__rm.patternStore.findById(id)), owned);

  // Remembered across a reload, each for its own Pattern.
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), shipped);
  await expect(voiceButton(page, 'guitar')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), other);
  await expect(voiceButton(page, 'piano')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, true), owned);
  await expect(voiceButton(page, 'sax')).toHaveAttribute('aria-pressed', 'true');

  // Never Pattern content: it is kept beside the Patterns, and no stored Pattern or export carries it.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rm.overlays.v1')).byPatternId)).toMatchObject({ [shipped]: { voice: 'guitar' }, [owned]: { voice: 'sax' } });
  expect(await page.evaluate((id) => JSON.stringify(window.__rm.patternStore.findById(id)), owned)).toBe(ownedBefore);
  expect(await page.evaluate(() => localStorage.getItem('rm.patterns.v1'))).not.toMatch(/"voice"|melodicVoice/);
  expect(await page.evaluate(() => localStorage.getItem('rm.settings.v1') ?? '')).not.toMatch(/melodicVoice/);
  const exported = await page.evaluate(() => JSON.stringify(window.__rm.getState().pattern));
  expect(exported).not.toMatch(/"voice"|melodicVoice/);
});

test('AC-2.13.1/3 — Choosing a voice while playing changes it from the next melodic note, with no restart', async ({ page }) => {
  await openApp(page);
  await melodicPattern(page);
  await voiceButton(page, 'synth').click();
  await play(page);
  await expect.poll(async () => (await voiceLog(page)).length).toBeGreaterThan(2);
  expect((await voiceLog(page)).every((e) => e.voice === 'synth' && e.via === 'synth')).toBe(true);
  const loop = await page.evaluate(() => window.__rm.getState().loop);

  await voiceButton(page, 'piano').click();
  const at = (await voiceLog(page)).length;
  await expect.poll(async () => (await voiceLog(page)).length).toBeGreaterThan(at + 1);
  const after = (await voiceLog(page)).slice(at);
  expect(after.every((e) => e.voice === 'piano')).toBe(true);
  expect(await page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);
  // No restart: the run carries on counting passes from where it was.
  expect(await page.evaluate(() => window.__rm.getState().loop)).toBeGreaterThanOrEqual(loop);
  await stop(page);
});

// --- AC-2.13.2: Practice plays the voice chosen ----------------------------------

test('AC-2.13.2/1 — Under Piano, a melodic note sounds through the Salamander Grand recording nearest its MIDI note, re-pitched to that note, louder at each stronger Accent Level', async ({ page }) => {
  await openApp(page);
  await melodicPattern(page);
  await play(page);
  await expect.poll(() => page.evaluate(() => window.__rm.getState().pianoStatus.status), { timeout: 15000 }).toBe('ready');
  const at = (await voiceLog(page)).length;
  await expect.poll(async () => (await voiceLog(page)).length).toBeGreaterThan(at + 3);
  const heard = (await voiceLog(page)).slice(at);
  expect(heard.every((e) => e.voice === 'piano' && e.via === 'sampled')).toBe(true);
  expect(await page.evaluate(() => window.__rm.piano.__sampledPlays())).toBeGreaterThan(3);
  await stop(page);

  // Through the recording nearest the note, re-pitched, louder per accent:
  // the live voice on a context of the page's own, its nodes inspected.
  const shape = await page.evaluate(async () => {
    const { piano } = window.__rm;
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    await piano.prepare(ctx);
    const sources = [];
    const realSource = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => {
      const s = realSource();
      sources.push(s);
      return s;
    };
    const gains = [];
    const realGain = ctx.createGain.bind(ctx);
    ctx.createGain = () => {
      const g = realGain();
      const set = g.gain.setValueAtTime.bind(g.gain);
      g.gain.setValueAtTime = (v, t) => {
        if (g.__peak === undefined) g.__peak = v;
        return set(v, t);
      };
      gains.push(g);
      return g;
    };
    const notes = [
      [61, 1],
      [64, 2],
      [70, 3],
    ];
    const via = notes.map(([midi, accent]) => piano.playPiano(ctx, null, { accent, pitch: { midiNote: midi, frequency: 440 * 2 ** ((midi - 69) / 12) } }, 0.1, () => {}));
    return { via, rates: sources.map((s) => s.playbackRate.value), peaks: gains.map((g) => g.__peak), buffers: sources.map((s) => Boolean(s.buffer)) };
  });
  expect(shape.via).toEqual(['sampled', 'sampled', 'sampled']);
  expect(shape.buffers).toEqual([true, true, true]);
  // 61 plays C4 (60) up a semitone; 64 plays its own Ds4 (63) up one; 70 plays A4 (69) up one.
  for (const rate of shape.rates) expect(rate).toBeCloseTo(2 ** (1 / 12), 5);
  expect(shape.peaks[0]).toBeLessThan(shape.peaks[1]);
  expect(shape.peaks[1]).toBeLessThan(shape.peaks[2]);
});

test('AC-2.13.2/2 — Under Synth, a melodic note sounds through the ported synthesis chain', async ({ page }) => {
  const piano = watchPiano(page);
  await openApp(page);
  await melodicPattern(page);
  await voiceButton(page, 'synth').click();
  await play(page);
  await expect.poll(async () => (await voiceLog(page)).length).toBeGreaterThan(3);
  await stop(page);
  const heard = await voiceLog(page);
  expect(heard.every((e) => e.voice === 'synth' && e.via === 'synth')).toBe(true);
  expect(piano).toHaveLength(0);
  // The dispatcher hands Synth to the very function AC-2.4.1's chain is.
  const same = await page.evaluate(() => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    let oscillators = 0;
    const real = ctx.createOscillator.bind(ctx);
    ctx.createOscillator = () => {
      oscillators += 1;
      return real();
    };
    window.__rm.melodic.playMelodic(ctx, null, { accent: 3, pitch: { frequency: 440, midiNote: 69 } }, 0);
    return oscillators;
  });
  expect(same).toBe(3);
});

test('AC-2.13.2/3 — Under Guitar, a melodic note sounds through the sampled guitar of US-19.7', async ({ page }) => {
  const requests = [];
  await page.route('https://gleitz.github.io/**', (route) => {
    requests.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont() });
  });
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await melodicPattern(page);
  await voiceButton(page, 'guitar').click();
  // Choosing Guitar asks for nothing; the first melodic note does.
  expect(requests).toHaveLength(0);
  await play(page);
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toBe(SAMPLE_URL);
  await expect.poll(() => page.evaluate(() => window.__rm.guitar.getStatus().status)).toBe('ready');
  const at = (await voiceLog(page)).length;
  await expect.poll(async () => (await voiceLog(page)).length).toBeGreaterThan(at + 2);
  const heard = (await voiceLog(page)).slice(at);
  expect(heard.every((e) => e.voice === 'guitar' && e.via === 'sampled')).toBe(true);
  expect(await page.evaluate(() => window.__rm.guitar.__sampledPlays())).toBeGreaterThan(0);
  await stop(page);
});

test('AC-2.13.2/4 — Percussive notes and the metronome click sound the same whatever the voice', async ({ page }) => {
  const piano = watchPiano(page);
  const cdn = [];
  await page.route('https://gleitz.github.io/**', (route) => {
    cdn.push(route.request().url());
    route.abort();
  });
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  // A Percussive Pattern with the click on, played under each voice: nothing
  // reaches the melodic voice, and no voice's samples are asked for.
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  for (let b = 0; b < 4; b++) await page.locator(`.grid .slot[data-beat="${b}"][data-slot="0"]`).click();
  await page.evaluate(() => window.__rm.handlers.onSetting({ metronomeEnabled: true }));
  for (const voice of ['piano', 'synth', 'guitar']) {
    await page.evaluate((v) => window.__rm.handlers.onMelodicVoice(v), voice);
    await play(page);
    await expect(page.locator('.slot.playing')).toHaveCount(1, { timeout: 3000 });
    await page.waitForTimeout(600);
    await stop(page);
  }
  expect(await voiceLog(page)).toEqual([]);
  expect(piano).toHaveLength(0);
  expect(cdn).toHaveLength(0);
  // The click's voice takes no account of the melodic one.
  const clicks = await page.evaluate(async () => {
    const shapes = [];
    for (const v of ['piano', 'synth', 'guitar']) {
      window.__rm.handlers.onMelodicVoice(v);
      const ctx = new OfflineAudioContext(1, 4410, 44100);
      const freqs = [];
      const real = ctx.createOscillator.bind(ctx);
      ctx.createOscillator = () => {
        const o = real();
        const set = o.frequency.setValueAtTime.bind(o.frequency);
        o.frequency.setValueAtTime = (f, t) => {
          freqs.push(f);
          return set(f, t);
        };
        return o;
      };
      window.__rmAudio.playClick(ctx, null, { downbeat: true, when: 0 });
      window.__rmAudio.playPercussive(ctx, null, 3, 0);
      shapes.push(JSON.stringify(freqs));
    }
    return shapes;
  });
  expect(new Set(clicks).size).toBe(1);
});

// --- AC-2.13.3: the Composer plays the instrument on screen -----------------------

test("AC-2.13.3/1 — A part's melodic notes sound through the instrument chosen for that part, whatever voice Practice has chosen", async ({ page }) => {
  await openApp(page);
  for (const voice of ['piano', 'synth', 'guitar', 'sax']) {
    await page.evaluate((v) => window.__rm.handlers.onMelodicVoice(v), voice);
    await withSettings(page, { composerInstrument: 'guitar' });
    await enterComposer(page);
    await expect(page.locator('.fretboard')).toBeVisible();
    await fret(page, 0, 0).click();
    const last = (await voiceLog(page)).at(-1);
    expect(last).toMatchObject({ instrument: 'guitar', voice: 'guitar', midi: 64 });
    // And a keyboard instrument the same (revised 2026-11-15 with AC-2.13.3): the part's, not Practice's.
    await page.locator('.instrument-switch [data-instrument="trumpet"]').click();
    await key(page, 60).click();
    expect((await voiceLog(page)).at(-1)).toMatchObject({ instrument: 'piano', voice: 'trumpet', midi: 60 });
  }
});

test('AC-2.13.3/2 — Synth is an instrument of its own: a part on Piano sounds the sampled piano and a part on Synth the synth, whatever voice Practice has chosen', async ({ page }) => {
  await openApp(page);
  // Rewritten 2026-11-15 with AC-2.13.3/2's revision: the instrument is the
  // part's own, so Practice being on Synth no longer turns the piano into it.
  for (const [voice, instrument, heard] of [
    ['synth', 'piano', 'piano'],
    ['piano', 'synth', 'synth'],
    ['guitar', 'piano', 'piano'],
    ['guitar', 'synth', 'synth'],
  ]) {
    await page.evaluate((v) => window.__rm.handlers.onMelodicVoice(v), voice);
    await withSettings(page, { composerInstrument: instrument });
    await enterComposer(page);
    await expect(page.locator('.piano')).toBeVisible();
    await key(page, 60).click();
    const last = (await voiceLog(page)).at(-1);
    expect(last).toMatchObject({ instrument: 'piano', voice: heard, midi: 60 });
    if (heard === 'synth') expect(last.via).toBe('synth');
    else {
      // The piano's recordings, once they are in.
      await expect.poll(() => page.evaluate(() => window.__rm.piano.getStatus().status), { timeout: 15000 }).toBe('ready');
      await key(page, 62).click();
      expect((await voiceLog(page)).at(-1)).toMatchObject({ voice: 'piano', via: 'sampled', midi: 62 });
    }
  }
});

test('AC-2.4.1 — The Synth voice uses the ported synthesis chain: the Synth instrument builds three detuned sines, the low-pass sweep and the reverb send', async ({ page }) => {
  await openApp(page);
  const chain = await page.evaluate(() => {
    // The player the dispatcher hands every Synth note to, in Practice and in the Composer alike.
    const synth = window.__rm.instruments.PLAYERS.synth;
    const ctx = new OfflineAudioContext(2, 44100, 44100);
    const made = { oscillators: [], filters: [], convolvers: 0, sweep: [] };
    const osc = ctx.createOscillator.bind(ctx);
    ctx.createOscillator = () => {
      const o = osc();
      made.oscillators.push(o);
      return o;
    };
    const filter = ctx.createBiquadFilter.bind(ctx);
    ctx.createBiquadFilter = () => {
      const f = filter();
      const set = f.frequency.setValueAtTime.bind(f.frequency);
      const ramp = f.frequency.exponentialRampToValueAtTime.bind(f.frequency);
      f.frequency.setValueAtTime = (v, t) => (made.sweep.push(['from', v]), set(v, t));
      f.frequency.exponentialRampToValueAtTime = (v, t) => (made.sweep.push(['to', v]), ramp(v, t));
      made.filters.push(f);
      return f;
    };
    const conv = ctx.createConvolver.bind(ctx);
    ctx.createConvolver = () => {
      made.convolvers += 1;
      return conv();
    };
    synth(ctx, ctx.destination, { accent: 3, pitch: { frequency: 440, midiNote: 69 } }, 0);
    return {
      same: synth === window.__rm.melodic.playMelodic,
      types: made.oscillators.map((o) => o.type),
      detunes: made.oscillators.map((o) => o.detune.value).sort((a, b) => a - b),
      filterTypes: made.filters.map((f) => f.type),
      sweep: made.sweep,
      convolvers: made.convolvers,
    };
  });
  // The predecessor's chain, unchanged: three detuned sines, a low-pass sweeping 2000 Hz down to 600 Hz, a reverb send.
  expect(chain.same).toBe(true);
  expect(chain.types).toEqual(['sine', 'sine', 'sine']);
  expect(chain.detunes).toEqual([-5, 0, 5]);
  expect(chain.filterTypes).toEqual(['lowpass']);
  expect(chain.sweep).toEqual([
    ['from', 2000],
    ['to', 600],
  ]);
  expect(chain.convolvers).toBe(1);
});

test("AC-2.13.2/5 — Under Electric guitar, Bass, Sax or Trumpet, a melodic note sounds through that instrument's samples, loaded as AC-19.12.5 says", async ({ page }) => {
  const requests = [];
  await page.route('https://gleitz.github.io/**', (route) => {
    requests.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont() });
  });
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await melodicPattern(page);
  const fonts = { electric: 'overdriven_guitar', bass: 'electric_bass_finger', sax: 'alto_sax', trumpet: 'trumpet' };
  for (const [voice, font] of Object.entries(fonts)) {
    const before = requests.length;
    await voiceButton(page, voice).click();
    await expect(voiceButton(page, voice)).toHaveAttribute('aria-pressed', 'true');
    // Choosing it asks for nothing; the first melodic note does, once.
    expect(requests).toHaveLength(before);
    await play(page);
    await expect.poll(() => requests.length).toBe(before + 1);
    expect(requests.at(-1)).toBe(SAMPLE_URL.replace('acoustic_guitar_steel', font));
    await expect.poll(() => page.evaluate((v) => window.__rm.instruments.statusOf(v).status, voice)).toBe('ready');
    const at = (await voiceLog(page)).length;
    await expect.poll(async () => (await voiceLog(page)).length).toBeGreaterThan(at + 2);
    expect((await voiceLog(page)).slice(at).every((e) => e.voice === voice && e.via === 'sampled')).toBe(true);
    await stop(page);
    expect(requests).toHaveLength(before + 1);
  }
});

test("AC-2.13.2/6 — Under Flute, a melodic note sounds through the flute's samples, and under Drums it sounds the synthesised drum its MIDI note names (AC-19.13.1)", async ({ page }) => {
  const requests = [];
  await page.route('https://gleitz.github.io/**', (route) => {
    requests.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont() });
  });
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await melodicPattern(page);
  await voiceButton(page, 'flute').click();
  expect(requests).toHaveLength(0);
  await play(page);
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toBe(SAMPLE_URL.replace('acoustic_guitar_steel', 'flute'));
  await expect.poll(() => page.evaluate(() => window.__rm.instruments.statusOf('flute').status)).toBe('ready');
  let at = (await voiceLog(page)).length;
  await expect.poll(async () => (await voiceLog(page)).length).toBeGreaterThan(at + 2);
  expect((await voiceLog(page)).slice(at).every((e) => e.voice === 'flute' && e.via === 'sampled')).toBe(true);
  // Drums: no request, and each note the drum its MIDI number names — synthesised, or silent where the kit has none.
  await voiceButton(page, 'drums').click();
  at = (await voiceLog(page)).length;
  await expect.poll(async () => (await voiceLog(page)).length).toBeGreaterThan(at + 2);
  const drums = (await voiceLog(page)).slice(at).filter((e) => e.voice === 'drums');
  expect(drums.length).toBeGreaterThan(0);
  expect(drums.every((e) => e.via === (e.midi >= 35 && e.midi <= 81 ? 'drum' : 'silent'))).toBe(true);
  expect(drums.some((e) => e.via === 'drum')).toBe(true);
  await stop(page);
  expect(requests).toHaveLength(1);
});

// --- AC-2.13.4: shipped, lazy, never blocking ------------------------------------

test("AC-2.13.4/1 — The recordings are served from the app's own origin, and none is requested on page load; the first moment the piano could sound — Play, a note sounded at once, or choosing Piano — requests them, each once", async ({ page }) => {
  const urls = watchPiano(page);
  await openApp(page);
  await page.waitForTimeout(500);
  expect(urls).toHaveLength(0);
  await melodicPattern(page);
  expect(urls).toHaveLength(0);
  await play(page);
  await expect.poll(() => urls.length, { timeout: 15000 }).toBe(RECORDINGS);
  const origin = new URL(page.url()).origin;
  expect(urls.every((u) => new URL(u).origin === origin)).toBe(true);
  expect(new Set(urls).size).toBe(RECORDINGS);
  await expect.poll(() => page.evaluate(() => window.__rm.getState().pianoStatus.status), { timeout: 15000 }).toBe('ready');
  await stop(page);
  await play(page);
  await page.waitForTimeout(500);
  await stop(page);
  expect(urls).toHaveLength(RECORDINGS);

  // Choosing Piano is such a moment too.
  const fresh = await page.context().newPage();
  const freshUrls = watchPiano(fresh);
  await openApp(fresh);
  await melodicPattern(fresh);
  // On another voice first (a Pattern's voice is its own since AC-2.13.1/2's revision), so that choosing Piano is the moment.
  await voiceButton(fresh, 'synth').click();
  expect(freshUrls).toHaveLength(0);
  await voiceButton(fresh, 'piano').click();
  await expect.poll(() => freshUrls.length, { timeout: 15000 }).toBe(RECORDINGS);
  await fresh.close();
});

test("AC-2.13.4/2 — While a note's recording is not ready, the note sounds through the synth instead, and the voice switch shows the piano loading", async ({ page }) => {
  const held = [];
  await page.route(PIANO, (route) => held.push(route));
  await openApp(page);
  await melodicPattern(page);
  await play(page);
  await expect(page.locator('.melodic-voice .voice-status.loading')).toBeVisible();
  await expect.poll(async () => (await voiceLog(page)).length).toBeGreaterThan(2);
  // Play was not held for the load: notes are sounding, through the synth.
  expect((await voiceLog(page)).every((e) => e.voice === 'piano' && e.via === 'fallback')).toBe(true);
  expect(await page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);

  for (const r of held.splice(0)) await r.continue();
  await page.unroute(PIANO);
  await expect(page.locator('.melodic-voice .voice-status')).toHaveCount(0, { timeout: 15000 });
  const at = (await voiceLog(page)).length;
  await expect.poll(async () => (await voiceLog(page)).length).toBeGreaterThan(at + 1);
  expect((await voiceLog(page)).slice(at).every((e) => e.via === 'sampled')).toBe(true);
  await stop(page);
});

test('AC-2.13.4/3 — A failed load shows a non-blocking notice with Retry beside the voice switch; notes keep sounding through the synth, and Retry requests the recordings again', async ({ page }) => {
  await page.route(PIANO, (route) => route.abort());
  await openApp(page);
  await melodicPattern(page);
  await play(page);
  await expect(page.locator('.melodic-voice .voice-status.error')).toBeVisible();
  const retry = page.locator('.melodic-voice [data-action="piano-retry"]');
  await expect(retry).toBeVisible();
  // Non-blocking: the run goes on, through the synth.
  const at = (await voiceLog(page)).length;
  await expect.poll(async () => (await voiceLog(page)).length).toBeGreaterThan(at + 1);
  expect((await voiceLog(page)).slice(at).every((e) => e.via === 'fallback')).toBe(true);
  expect(await page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);

  await page.unroute(PIANO);
  const urls = watchPiano(page);
  await retry.click();
  await expect.poll(() => urls.length, { timeout: 15000 }).toBe(RECORDINGS);
  await expect(page.locator('.melodic-voice .voice-status')).toHaveCount(0, { timeout: 15000 });
  const now = (await voiceLog(page)).length;
  await expect.poll(async () => (await voiceLog(page)).length).toBeGreaterThan(now + 1);
  expect((await voiceLog(page)).slice(now).every((e) => e.via === 'sampled')).toBe(true);
  await stop(page);
});

test("AC-2.13.4/4 — The piano's credit — Salamander Grand Piano by Alexander Holm, CC BY 3.0 — is shown in the Composer's attribution line beside the guitar's, and as the Piano option's description", async ({ page }) => {
  await openApp(page);
  await melodicPattern(page);
  await expect(voiceButton(page, 'piano')).toHaveAttribute('title', /Salamander Grand Piano by Alexander Holm.*CC BY 3\.0/);
  await enterComposer(page, { load: 'none' });
  const credit = page.locator('.composer-attribution[data-attribution="piano-samples"]');
  await expect(credit).toBeVisible();
  await expect(credit).toContainText('Salamander Grand Piano');
  await expect(credit).toContainText('Alexander Holm');
  await expect(credit).toContainText('CC BY 3.0');
  await expect(credit.locator('a', { hasText: 'CC BY 3.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/3.0/');
  // Beside the guitar's.
  const adjacent = await page.evaluate(() => document.querySelector('.composer-attribution[data-attribution="guitar-samples"]').nextElementSibling?.dataset.attribution);
  expect(adjacent).toBe('piano-samples');
});

// --- AC-2.13.5: the screen-off render ---------------------------------------------

test('AC-2.13.5/1 — With the piano in force and its recordings loaded, the render sounds its melodic notes through the piano; with them not loaded, through the synth', async ({ page }) => {
  const held = [];
  await page.route(PIANO, (route) => held.push(route));
  await openApp(page);
  await melodicPattern(page);
  await play(page);
  // Not loaded: the render is the synth.
  await expect.poll(() => page.evaluate(() => window.__rm.rendered()?.voice ?? null), { timeout: 10000 }).toBe('synth');
  for (const r of held.splice(0)) await r.continue();
  await page.unroute(PIANO);
  // Loaded: rendered again, through the piano.
  await expect.poll(() => page.evaluate(() => window.__rm.rendered()?.voice ?? null), { timeout: 15000 }).toBe('piano');
  await stop(page);
});

test('AC-2.13.5/2 — With the guitar in force and its samples loaded, the render sounds its melodic notes through the guitar; with them not loaded, through the synth', async ({ page }) => {
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route('https://gleitz.github.io/**', async (route) => {
    await gate;
    route.fulfill({ status: 200, contentType: 'application/javascript', body: fakeSoundfont() });
  });
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await melodicPattern(page);
  await voiceButton(page, 'guitar').click();
  await play(page);
  await expect.poll(() => page.evaluate(() => window.__rm.rendered()?.voice ?? null), { timeout: 10000 }).toBe('synth');
  release();
  await expect.poll(() => page.evaluate(() => window.__rm.guitar.getStatus().status)).toBe('ready');
  // Arriving, the samples are rendered again, through the guitar.
  await expect.poll(() => page.evaluate(() => window.__rm.rendered()?.voice ?? null), { timeout: 15000 }).toBe('guitar');
  await stop(page);
});
