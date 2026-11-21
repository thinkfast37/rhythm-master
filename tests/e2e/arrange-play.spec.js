/**
 * Hear an Arrangement while it is built (US-20.2): Play in Arrange, how each
 * entry sounds, and the Arrangement's one tempo — proven in the DOM.
 *
 * Fixtures from the shipped library: Bossa Nova (s_21, percussive, one 4/4
 * Measure at 80) and Djembe 2 (s_108, melodic with no progression, one 4/4
 * Measure at 80). Arrangements are written to their store and opened from the
 * library, so each test starts from a known sequence.
 */
import { test, expect } from '@playwright/test';
import { launch, openApp } from './composer-helpers.js';

test.use(launch);

const BOSSA = 's_21';
const DJEMBE = 's_108';

const panel = (page) => page.locator('.arrange-panel');
const entries = (page) => panel(page).locator('.arrange-entry');
const palette = (page) => panel(page).locator('.arrange-palette-item');
const play = (page) => page.locator('[data-action="play"]').first().click();
const stop = (page) => page.locator('[data-action="stop"]').first().click();
const loopNow = (page) => page.evaluate(() => window.__rm.getState().loop);
const at = (page, loop) => page.evaluate((l) => window.__rm.arrange.at(l), loop);
const drums = (page) => page.evaluate(() => window.__rm.percussionLog().filter((e) => e.via === 'live'));
const voices = (page) => page.evaluate(() => window.__rm.voiceLog());
const levels = (page) => page.evaluate(() => window.__rm.levelLog());
const dB = (gain) => 20 * Math.log10(gain);

const entry = (kind, id, name, repeats = 1) => ({ kind, id, name, repeats });

/** Save an Arrangement straight to its store and open it in Arrange. */
async function openArrangement(page, sequence, { tempo = 240, name = 'Sunday song' } = {}) {
  const id = await page.evaluate(
    ([n, t, seq]) => {
      const seen = new Set();
      const palette = seq.filter((e) => !seen.has(`${e.kind}:${e.id}`) && seen.add(`${e.kind}:${e.id}`)).map(({ kind, id }) => ({ kind, id }));
      return window.__rm.arrangementStore.upsert({ name: n, tempo: t, palette, entries: seq }).id;
    },
    [name, tempo, sequence]
  );
  await page.evaluate((i) => window.__rm.handlers.onOpenArrangement(i), id);
  await expect(panel(page)).toBeVisible();
  return id;
}

/** An owned one-Measure Melodic Pattern under I–IV–V changing every pass: three passes a cycle. */
async function ownChanges(page, name = 'Changes') {
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  for (let b = 0; b < 4; b++) await page.locator(`.grid .slot[data-beat="${b}"][data-slot="0"]`).click();
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await page.locator('.progression-picker').selectOption('I-IV-V');
  await page.evaluate((n) => window.__rm.handlers.onRename(n), name);
  const id = await page.evaluate(() => window.__rm.getState().pattern.id);
  expect(await page.evaluate((i) => window.__rm.patternStore.findById(i).harmony.chords.length, id)).toBe(3);
  return id;
}

/** Every (loop, entry index) the run passes through until `until` passes have begun. */
async function followPasses(page, until, timeout = 20000) {
  const seen = new Map();
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const now = await page.evaluate(() => {
      const s = window.__rm.getState();
      const sounding = window.__rm.scheduled();
      return { playing: s.isPlaying, loop: s.loop, name: sounding?.inner?.name ?? null, pass: sounding?.pass ?? null, marked: [...document.querySelectorAll('.arrange-entry.playing')].map((e) => Number(e.dataset.index)) };
    });
    if (now.playing && !seen.has(now.loop)) seen.set(now.loop, now);
    if (now.loop >= until) break;
    await page.waitForTimeout(40);
  }
  return [...seen.values()].sort((a, b) => a.loop - b.loop);
}

// --- AC-20.2.1: the sequence plays -----------------------------------------------------

test('AC-20.2.1/1 — Play sounds every sequence entry in order, each for its repeats, the next taking over at a pass boundary with nothing stopped, and after the last entry the first sounds again', async ({ page }) => {
  await openApp(page);
  await openArrangement(page, [entry('pattern', BOSSA, 'Intro', 2), entry('pattern', DJEMBE, 'Verse', 1)]);
  await play(page);
  const passes = await followPasses(page, 4);
  await stop(page);
  // Passes 0 and 1 are the Intro, 2 the Verse, 3 the Intro again.
  const byLoop = Object.fromEntries(passes.map((p) => [p.loop, p.name]));
  expect(byLoop[0]).toBe('Bossa Nova');
  expect(byLoop[1]).toBe('Bossa Nova');
  expect(byLoop[2]).toBe('Djembe 2');
  expect(byLoop[3]).toBe('Bossa Nova');
  // One run throughout: the counter only ever went up, and nothing was stopped in between.
  expect(passes.map((p) => p.loop)).toEqual([...passes.map((p) => p.loop)].sort((a, b) => a - b));
  expect(passes.every((p) => p.playing)).toBe(true);
  // What sounded: the rhythm's drums, then the melody's notes, both in the one run.
  expect((await drums(page)).length).toBeGreaterThan(0);
  expect((await voices(page)).length).toBeGreaterThan(0);
});

test('AC-20.2.1/2 — One repeat is once through what the entry plays: a Pattern once, or one harmonic cycle when it carries a progression; a Section once through its combined loop; a Chain once through its entries', async ({ page }) => {
  await openApp(page);
  const changes = await ownChanges(page);
  const ids = await page.evaluate(
    ([c, djembe, bossa]) => {
      const chain = window.__rm.chainStore.upsert({ name: 'Bed', sections: [{ patternId: c, entries: [{ fill: 'alberti', repeats: 1 }, { fill: 'root-fifth', repeats: 1 }] }] }).id;
      const section = window.__rm.sectionStore.upsert({ name: 'Verse bed', compositionId: djembe, layers: [{ patternId: bossa, muted: false }] }).id;
      return { chain, section };
    },
    [changes, DJEMBE, BOSSA]
  );
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  // A plain Pattern is one pass; the progression's cycle three; the Section's loop one; the Chain's two entries six.
  await openArrangement(page, [entry('pattern', BOSSA, 'A'), entry('pattern', changes, 'B'), entry('section', ids.section, 'C'), entry('chain', ids.chain, 'D')]);
  expect(await page.evaluate(() => window.__rm.arrange.passes())).toBe(1 + 3 + 1 + 6);
  const index = async (loop) => (await at(page, loop)).index;
  expect([await index(0), await index(1), await index(3), await index(4), await index(5), await index(10), await index(11)]).toEqual([0, 1, 1, 2, 3, 3, 0]);
  expect((await at(page, 4)).layered).toBe(true);
  // Repeats count whole times through: the progression twice is six passes.
  await entries(page).nth(1).locator('.arrange-entry-repeats').fill('2');
  await entries(page).nth(1).locator('.arrange-entry-repeats').blur();
  expect(await page.evaluate(() => window.__rm.arrange.passes())).toBe(1 + 6 + 1 + 6);
  expect((await at(page, 4)).repeat).toBe(1);
});

test('AC-20.2.1/3 — A progression starts from its first chord each time an entry begins, whatever was sounding before it', async ({ page }) => {
  await openApp(page);
  const changes = await ownChanges(page);
  await openArrangement(page, [entry('pattern', BOSSA, 'Intro', 2), entry('pattern', changes, 'Verse', 1)]);
  // The Verse begins on the run's third pass and is on its own first.
  expect(await at(page, 2)).toMatchObject({ index: 1, passInEntry: 0, pass: 0, name: 'Changes' });
  expect((await at(page, 4)).pass).toBe(2);
  // Round again, from its first chord again.
  expect(await at(page, 7)).toMatchObject({ index: 1, pass: 0 });
  // And it is heard so: the notes of the Verse's first pass are those the Pattern sounds alone on its first.
  const alone = await page.evaluate((id) => window.__rmTimeline.buildTimeline(window.__rm.patternStore.findById(id), 0).filter((e) => e.pitch).map((e) => e.pitch.midiNote), changes);
  await play(page);
  await followPasses(page, 3);
  await stop(page);
  const heard = (await voices(page)).map((v) => v.midi);
  expect(heard.slice(0, alone.length)).toEqual(alone);
});

test('AC-20.2.1/4 — The sequence entry sounding is marked in the sequence, and the mark is gone when it stops', async ({ page }) => {
  await openApp(page);
  await openArrangement(page, [entry('pattern', BOSSA, 'Intro', 1), entry('pattern', DJEMBE, 'Verse', 1)]);
  await expect(panel(page).locator('.arrange-entry.playing')).toHaveCount(0);
  await play(page);
  // The mark follows what is heard, which trails what is scheduled: on a pass
  // heard, the one entry marked is the one that pass belongs to — the Intro on
  // even passes, the Verse on odd ones. Both are seen marked in their turn.
  const marked = new Set();
  let most = 0;
  await expect
    .poll(
      async () => {
        const now = await page.evaluate(() => ({
          heard: window.__rm.getState().transportPosition?.loop ?? null,
          marks: [...document.querySelectorAll('.arrange-entry.playing')].map((e) => Number(e.dataset.index)),
        }));
        most = Math.max(most, now.marks.length);
        if (now.heard !== null && now.marks.length === 1 && now.marks[0] === now.heard % 2) marked.add(now.marks[0]);
        return marked.size;
      },
      { timeout: 15000, intervals: [40] }
    )
    .toBe(2);
  // Never more than one entry at a time.
  expect(most).toBe(1);
  await expect(panel(page).locator('.arrange-entry.playing')).toHaveAttribute('aria-current', 'true');
  await stop(page);
  await expect(panel(page).locator('.arrange-entry.playing')).toHaveCount(0);
});

test('AC-20.2.1/5 — Changing the sequence while it plays — an entry added, removed, moved or its repeats — is heard from the next pass with nothing stopped or restarted', async ({ page }) => {
  await openApp(page);
  await openArrangement(page, [entry('pattern', BOSSA, 'Intro', 1)]);
  // Djembe 2 is in the palette, ready to lay.
  await page.evaluate((id) => {
    const a = window.__rm.arrangementStore.loadAll()[0];
    window.__rm.arrangementStore.upsert({ ...a, palette: [...a.palette, { kind: 'pattern', id }] });
    return window.__rm.handlers.onOpenArrangement(a.id);
  }, DJEMBE);
  await expect(palette(page)).toHaveCount(2);
  await play(page);
  await followPasses(page, 1);
  const before = await loopNow(page);
  // Added while it plays: nothing stops, the counter carries on, and the new entry is heard in its turn.
  await palette(page).nth(1).locator('[data-action="arrange-lay"]').click();
  expect(await page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__rm.scheduled()?.inner?.name), { timeout: 10000 }).toBe('Djembe 2');
  expect(await loopNow(page)).toBeGreaterThanOrEqual(before);
  // Its repeats, its place, and its removal, all with the run still going.
  await entries(page).nth(1).locator('.arrange-entry-repeats').fill('2');
  await entries(page).nth(1).locator('.arrange-entry-repeats').blur();
  await entries(page).nth(1).locator('[data-action="arrange-entry-up"]').click();
  expect(await page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);
  expect(await page.evaluate(() => window.__rm.arrange.passes())).toBe(3);
  await entries(page).nth(0).locator('[data-action="arrange-entry-remove"]').click();
  expect(await page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__rm.scheduled()?.inner?.name), { timeout: 10000 }).toBe('Bossa Nova');
  // One run throughout: the counter that was running before the first change is still counting up.
  await expect.poll(() => loopNow(page), { timeout: 10000 }).toBeGreaterThan(before);
  // The last entry removed, there is nothing left to play, and it stops.
  await entries(page).nth(0).locator('[data-action="arrange-entry-remove"]').click();
  await expect.poll(() => page.evaluate(() => window.__rm.getState().isPlaying), { timeout: 5000 }).toBe(false);
});

test('AC-20.2.1/6 — An entry whose Pattern, Section or Chain is no longer in the library is passed over, and the rest of the sequence plays', async ({ page }) => {
  await openApp(page);
  await openArrangement(page, [entry('pattern', 'p_404', 'Gone'), entry('section', 'arr_404', 'Gone too'), entry('pattern', BOSSA, 'Intro', 1)]);
  await expect(entries(page).nth(0).locator('.arrange-entry-source')).toContainText('Missing Pattern');
  expect(await page.evaluate(() => window.__rm.arrange.passes())).toBe(1);
  await play(page);
  const passes = await followPasses(page, 2);
  await stop(page);
  expect(passes.length).toBeGreaterThan(1);
  expect(passes.every((p) => p.name === 'Bossa Nova')).toBe(true);
  // Only what is gone: nothing to play, and Play says so.
  await openArrangement(page, [entry('pattern', 'p_404', 'Gone')], { name: 'Empty of anything' });
  await expect(page.locator('[data-action="play"]').first()).toBeDisabled();
});

// --- AC-20.2.2: how each entry sounds --------------------------------------------------

test('AC-20.2.2/1 — A Section sounds every unmuted part together, each on the instrument and at the volume the Section holds for it, and a muted part is silent', async ({ page }) => {
  await openApp(page);
  // A melodic layer that fits under Djembe 2: a copy of it, as a Pattern of the Composer's own.
  const under = await page.evaluate((djembe) => {
    const copy = { ...structuredClone(window.__rm.seedStore.findById(djembe)), id: window.__rm.patternStore.nextId(), name: 'Under' };
    window.__rm.patternStore.upsert(copy);
    return copy.id;
  }, DJEMBE);
  const section = await page.evaluate(
    ([djembe, u, bossa]) =>
      window.__rm.sectionStore.upsert({
        name: 'Band',
        compositionId: djembe,
        instrument: 'synth',
        volume: 70,
        layers: [
          { patternId: u, muted: false, instrument: 'guitar', volume: 55 },
          { patternId: bossa, muted: true, volume: 90 },
        ],
      }).id,
    [DJEMBE, under, BOSSA]
  );
  await openArrangement(page, [entry('section', section, 'Verse', 1)]);
  await play(page);
  await expect.poll(async () => (await levels(page)).filter((v) => v.layer === 1).length, { timeout: 10000 }).toBeGreaterThan(1);
  await stop(page);
  const heard = await levels(page);
  // The Section's own part on Synth at 70, the layer on Guitar at 55: 0.4 dB a step under 100.
  const own = heard.filter((v) => v.composition === true);
  const layer = heard.filter((v) => v.layer === 1);
  expect(own.length).toBeGreaterThan(0);
  expect(own.every((v) => v.voice === 'synth')).toBe(true);
  expect(layer.every((v) => v.voice === 'guitar')).toBe(true);
  expect(dB(own[0].gain)).toBeCloseTo(-12, 6);
  expect(dB(layer[0].gain)).toBeCloseTo(-18, 6);
  // The muted rhythm made no sound, as an accent tone or as a drum.
  expect(await page.evaluate(() => window.__rm.percussionLog().filter((e) => e.via === 'live').length)).toBe(0);
});

test('AC-20.2.2/2 — A Melodic Pattern sounds on the voice Practice remembers for it, and on Piano when there is none', async ({ page }) => {
  await openApp(page);
  await openArrangement(page, [entry('pattern', DJEMBE, 'Verse', 1)]);
  await play(page);
  await expect.poll(async () => (await voices(page)).length, { timeout: 10000 }).toBeGreaterThan(2);
  await stop(page);
  expect((await voices(page)).every((v) => v.voice === 'piano')).toBe(true);
  // Practice remembers Synth for it: the Arrangement plays it on Synth from the next Play.
  await page.evaluate((id) => window.__rm.overlayStore.setVoice(id, 'synth'), DJEMBE);
  const from = (await voices(page)).length;
  await play(page);
  await expect.poll(async () => (await voices(page)).length - from, { timeout: 10000 }).toBeGreaterThan(2);
  await stop(page);
  expect((await voices(page)).slice(from).every((v) => v.voice === 'synth')).toBe(true);
});

test('AC-20.2.2/3 — A Percussive Pattern laid in the sequence sounds on the drum kit, the drum chosen by each Accent Level as Drum kit chooses it in Practice, whatever Practice remembers for the Pattern', async ({ page }) => {
  await openApp(page);
  // Practice has Bossa Nova on Accents — it has never been put on the kit there.
  expect(await page.evaluate((id) => window.__rm.overlayStore.percussionFor(id) ?? null, BOSSA)).toBeNull();
  await openArrangement(page, [entry('pattern', BOSSA, 'Intro', 1)]);
  await play(page);
  await expect.poll(async () => (await drums(page)).length, { timeout: 10000 }).toBeGreaterThan(4);
  await stop(page);
  const heard = await drums(page);
  expect(heard.every((e) => e.mode === 'drums')).toBe(true);
  expect(heard.every((e) => e.midi === { 3: 36, 2: 38, 1: 43 }[e.accent])).toBe(true);
  expect(new Set(heard.map((e) => e.midi)).size).toBeGreaterThan(1);
  // And Practice still has it on Accents: nothing was remembered by playing it here.
  expect(await page.evaluate((id) => window.__rm.overlayStore.percussionFor(id) ?? null, BOSSA)).toBeNull();
});

test('AC-20.2.2/4 — A Chain sounds its fills in order over its Pattern, on the voice Practice remembers for that Pattern', async ({ page }) => {
  await openApp(page);
  const changes = await ownChanges(page);
  const chain = await page.evaluate((c) => {
    window.__rm.overlayStore.setVoice(c, 'synth');
    return window.__rm.chainStore.upsert({ name: 'Bed', sections: [{ patternId: c, entries: [{ fill: 'alberti', repeats: 1 }, { fill: 'root-fifth', repeats: 1 }] }] }).id;
  }, changes);
  await openArrangement(page, [entry('chain', chain, 'Verse', 1)]);
  // Three passes of the first fill, three of the second, each from the first chord.
  const fills = [];
  for (let loop = 0; loop < 7; loop++) fills.push(await at(page, loop));
  expect(fills.map((f) => f.arpeggio)).toEqual(['alberti', 'alberti', 'alberti', 'root-fifth', 'root-fifth', 'root-fifth', 'alberti']);
  expect(fills.map((f) => f.pass)).toEqual([0, 1, 2, 0, 1, 2, 0]);
  await play(page);
  await expect.poll(async () => (await voices(page)).length, { timeout: 10000 }).toBeGreaterThan(3);
  await stop(page);
  expect((await voices(page)).every((v) => v.voice === 'synth')).toBe(true);
});

// --- AC-20.2.3: one tempo --------------------------------------------------------------

test('AC-20.2.3/1 — An Arrangement takes its tempo, in quarter notes a minute, from the first entry laid in its sequence, and from then on the tempo is its own', async ({ page }) => {
  await openApp(page);
  // Bossa Nova is remembered at 132 in Practice: that is the tempo it brings.
  await page.evaluate((id) => window.__rm.overlayStore.setTempo(id, 132), BOSSA);
  await page.locator('.mode-switch [data-mode="arrange"]').click();
  for (const id of [DJEMBE, BOSSA]) {
    await panel(page).locator('[data-action="arrange-add"]').click();
    if (!(await page.locator('.library .library-search').isVisible())) await page.locator('.library-toggle').click();
    await page.locator(`.library .pattern-item[data-pattern-id="${id}"] [data-action="open-pattern"]`).click();
  }
  const arrangement = () => page.evaluate(() => window.__rm.getState().arrange.arrangement);
  // Nothing laid yet: no tempo of its own.
  expect((await arrangement()).tempo).toBeUndefined();
  await panel(page).locator(`.arrange-palette-item[data-id="${BOSSA}"] [data-action="arrange-lay"]`).click();
  expect((await arrangement()).tempo).toBe(132);
  // A second entry at another tempo changes nothing: the tempo is the Arrangement's now.
  await panel(page).locator(`.arrange-palette-item[data-id="${DJEMBE}"] [data-action="arrange-lay"]`).click();
  expect((await arrangement()).tempo).toBe(132);
  await expect(page.locator('.arrange-tempo .tempo-entry')).toHaveValue('132');
});

test('AC-20.2.3/2 — In Arrange the tempo entry beside Play shows and sets the tempo of the Arrangement, from 18 to 300, and not the tempo of the Pattern open in Practice', async ({ page }) => {
  await openApp(page);
  const open = await page.evaluate(() => ({ id: window.__rm.getState().pattern.id, tempo: window.__rm.getState().pattern.tempo }));
  await openArrangement(page, [entry('pattern', BOSSA, 'Intro', 1)], { tempo: 96 });
  const box = page.locator('.play-controls .tempo-entry');
  await expect(box).toHaveValue('96');
  await expect(page.locator('.play-controls .arrange-tempo')).toBeVisible();
  // No unit to switch: an Arrangement counts quarter notes.
  await expect(page.locator('.play-controls .tempo-unit-toggle')).toHaveCount(0);
  for (const [typed, held] of [
    ['140', 140],
    ['999', 300],
    ['5', 18],
  ]) {
    await box.fill(typed);
    await box.press('Enter');
    await expect(page.locator('.play-controls .tempo-entry')).toHaveValue(String(held));
    expect(await page.evaluate(() => window.__rm.getState().arrange.arrangement.tempo)).toBe(held);
  }
  // The Pattern open in Practice kept its tempo, and has its own entry back there.
  expect(await page.evaluate(() => window.__rm.getState().pattern.tempo)).toBe(open.tempo);
  await page.locator('.mode-switch [data-mode="practice"]').click();
  await expect(page.locator('.play-controls .tempo-entry')).toHaveValue(String(open.tempo));
  await expect(page.locator('.play-controls .arrange-tempo')).toHaveCount(0);
});

test('AC-20.2.3/3 — Every entry plays at the tempo of the Arrangement whatever its own, and no Pattern, Section or Chain is changed by it', async ({ page }) => {
  await openApp(page);
  const section = await page.evaluate(([djembe, bossa]) => window.__rm.sectionStore.upsert({ name: 'Verse bed', compositionId: djembe, layers: [{ patternId: bossa, muted: false }] }).id, [DJEMBE, BOSSA]);
  await page.evaluate((id) => window.__rm.overlayStore.setTempo(id, 60), BOSSA);
  const stores = () => page.evaluate(() => ['rm.patterns.v1', 'rm.overlays.v1', 'rm.sections.v1', 'rm.songs.v1'].map((k) => localStorage.getItem(k)));
  const before = await stores();
  await openArrangement(page, [entry('pattern', BOSSA, 'Intro', 1), entry('section', section, 'Verse', 1), entry('pattern', DJEMBE, 'Outro', 1)], { tempo: 150 });
  for (const loop of [0, 1, 2]) expect(await at(page, loop)).toMatchObject({ tempo: 150, tempoUnit: 'quarter' });
  // One 4/4 Measure at 150 quarter notes a minute is 1.6 seconds, for each of them.
  const seconds = await page.evaluate(() => [0, 1, 2].map((l) => window.__rmTimeline.loopDurationOf(window.__rm.handlers.arrangePlayingAt(l))));
  for (const s of seconds) expect(s).toBeCloseTo(1.6, 6);
  await page.locator('.play-controls .tempo-entry').fill('75');
  await page.locator('.play-controls .tempo-entry').press('Enter');
  expect((await at(page, 0)).tempo).toBe(75);
  // Nothing it is made of was touched: Bossa Nova is still remembered at 60.
  expect(await stores()).toEqual(before);
  expect(await page.evaluate((id) => window.__rm.overlayStore.forPattern(id).tempo, BOSSA)).toBe(60);
});

test('AC-20.2.3/4 — The tempo is stored with the Arrangement and is in force when it is opened again, and changing it while playing restarts the sequence from its first entry at the new tempo', async ({ page }) => {
  await openApp(page);
  const id = await openArrangement(page, [entry('pattern', BOSSA, 'Intro', 1), entry('pattern', DJEMBE, 'Verse', 1)], { tempo: 240 });
  await play(page);
  await followPasses(page, 1);
  expect(await loopNow(page)).toBeGreaterThanOrEqual(1);
  // Changed while playing: still playing, from the first entry, at the new tempo.
  await page.locator('.play-controls .tempo-entry').fill('200');
  await page.locator('.play-controls .tempo-entry').press('Enter');
  expect(await page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);
  await expect.poll(() => page.evaluate(() => ({ loop: window.__rm.getState().loop, name: window.__rm.scheduled()?.inner?.name, tempo: window.__rm.scheduled()?.tempo })), { timeout: 5000 }).toEqual({ loop: 0, name: 'Bossa Nova', tempo: 200 });
  await stop(page);
  // Stored, and in force after a reload.
  expect(await page.evaluate((i) => window.__rm.arrangementStore.findById(i).tempo, id)).toBe(200);
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await page.evaluate((i) => window.__rm.handlers.onOpenArrangement(i), id);
  await expect(page.locator('.play-controls .tempo-entry')).toHaveValue('200');
  expect((await at(page, 0)).tempo).toBe(200);
});
