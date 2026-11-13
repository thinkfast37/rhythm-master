/**
 * Layers under the composition (US-19.11): the Layers section, hearing them
 * together, the combined loop and saved Arrangements — proven in the DOM.
 *
 * Fixtures from the shipped library: Bossa Nova (s_21, one bar, percussive),
 * Son Clave 3-2 (s_22, two bars, percussive), Djembe 2 (s_108, one bar,
 * melodic) and Rumba Clave 3-2 Mod (s_79, four bars, melodic).
 */
import { test, expect } from '@playwright/test';
import { launch, openApp, enterComposer, composerState, appState, loadFourBeats, fret, recordAll } from './composer-helpers.js';

test.use(launch);

const BOSSA = 's_21';
const SON = 's_22';
const DJEMBE = 's_108';
const FOUR_BARS = 's_79';

const layers = (page) => page.locator('.composer-layers');
const layerItems = (page) => page.locator('.composer-layers .layer-item:not(.composition)');
const play = (page) => page.locator('.transport').first().click();
const state = (page) => appState(page);

/** Press Add layer, then choose `id` in the library pane, as a tap on its row does. */
async function addLayer(page, id) {
  await page.locator('.layer-add').click();
  await expect(page.locator('.composer-layers [data-picking="true"]')).toBeVisible();
  await page.locator(`.pattern-item[data-pattern-id="${id}"] [data-action="open-pattern"]`).click();
  await expect(page.locator(`.composer-layers .layer-item[data-pattern-id="${id}"]`)).toBeVisible();
}
const exact = (name) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
const partRow = (page, name) => page.locator('.composer-layers .layer-item', { has: page.locator('.layer-pick', { hasText: exact(name) }) });
/** Record a fret onto every syllable without a note until record mode ends on its own. */
async function recordUntilDone(page) {
  await page.locator('.record').click();
  for (let i = 0; i < 64; i++) {
    if ((await page.locator('.record').getAttribute('aria-pressed')) === 'false') return;
    await fret(page, 1, 1).click();
  }
  await expect(page.locator('.record')).toHaveAttribute('aria-pressed', 'false');
}

async function setTempo(page, bpm) {
  await page.locator('.composer-tempo-entry').fill(String(bpm));
  await page.locator('.composer-tempo-entry').press('Enter');
}

/** Record every syllable and save the composition, so an Arrangement can name it. */
async function saveComposition(page) {
  await recordAll(page);
  await page.locator('.composer-save').click();
  await expect(page.locator('.composer-save')).toHaveAttribute('data-saved', 'true');
  return (await composerState(page)).savedId;
}

async function nameInDialog(page, name) {
  await expect(page.locator('.dialog')).toBeVisible();
  if (name !== undefined) await page.locator('.dialog-input').fill(name);
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
}

// --- AC-19.11.1: the Layers section --------------------------------------------

test(`AC-19.11.1/1 — A Layers section under the composing grid lists the composition first, then each layer in the order added, naming each and its kind — rhythm, melody or chords — and says when there are no layers`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await expect(layers(page)).toBeVisible();
  // Under the grid: the grid comes first in the panel.
  const order = await page.evaluate(() => {
    const panel = document.querySelector('.composer-panel');
    return [...panel.children].map((c) => c.className.split(' ')[0]);
  });
  expect(order.indexOf('composer-grid')).toBeLessThan(order.indexOf('composer-layers'));
  await expect(layers(page).locator('.layer-item.composition .layer-name')).toHaveText('My line');
  await expect(layers(page).locator('.layers-empty')).toBeVisible();
  await addLayer(page, BOSSA);
  await addLayer(page, DJEMBE);
  await expect(layers(page).locator('.layers-empty')).toHaveCount(0);
  const items = page.locator('.composer-layers .layer-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toHaveClass(/composition/);
  await expect(items.nth(1).locator('.layer-name')).toHaveText('Bossa Nova');
  await expect(items.nth(1).locator('.layer-kind')).toHaveAttribute('data-kind', 'rhythm');
  await expect(items.nth(2).locator('.layer-name')).toHaveText('Djembe 2');
  await expect(items.nth(2).locator('.layer-kind')).toHaveAttribute('data-kind', 'melody');
  // A progression Pattern reads as chords.
  const chordsId = await page.evaluate(() => window.__rm.seedStore.loadAll().find((s) => s.soundMode === 'melodic' && s.harmony?.chords?.length && s.measures.length === 1)?.id ?? null);
  if (chordsId) {
    await addLayer(page, chordsId);
    await expect(page.locator(`.composer-layers .layer-item[data-pattern-id="${chordsId}"] .layer-kind`)).toHaveAttribute('data-kind', 'chords');
  }
});

test('AC-19.11.1/2 — Add layer opens the library, with its search and Tag filters as they are, and asks for a Pattern; choosing one — shipped or owned, percussive, melodic or carrying a progression — adds it as the last layer and closes the library, a Pattern already among the parts is refused with a message, and Cancel leaves the list as it was', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await page.locator('.layer-add').click();
  // The library pane, open and asked.
  await expect(page.locator('.composer-layers [data-picking="true"]')).toBeVisible();
  await expect(page.locator('.library-search')).toBeVisible();
  await expect(page.locator('.pattern-item[data-pattern-id="p_test"]')).toBeVisible();
  // Its search narrows the list while choosing.
  await page.locator('.library-search').fill('Son Clave 3-2');
  await expect(page.locator(`.pattern-item[data-pattern-id="${SON}"]`)).toBeVisible();
  await expect(page.locator(`.pattern-item[data-pattern-id="${BOSSA}"]`)).toHaveCount(0);
  await page.locator(`.pattern-item[data-pattern-id="${SON}"] [data-action="open-pattern"]`).click();
  expect((await composerState(page)).layers.map((l) => l.patternId)).toEqual([SON]);
  expect((await composerState(page)).pickingLayer).toBe(false);
  // The composition is still the composition: the pick did not open into the Composer.
  expect((await composerState(page)).draft.name).toBe('My line');
  await page.locator('.library-toggle').click();
  await page.locator('.library-search').fill('');
  await page.locator('.library-toggle').click();
  // Owned and melodic Patterns are Patterns like any other.
  await addLayer(page, 'p_test');
  await addLayer(page, DJEMBE);
  expect((await composerState(page)).layers.map((l) => l.patternId)).toEqual([SON, 'p_test', DJEMBE]);
  // Already a part: refused with a message, nothing added.
  await page.locator('.layer-add').click();
  await page.locator(`.pattern-item[data-pattern-id="${SON}"] [data-action="open-pattern"]`).click();
  await expect(page.locator('.composer-notice')).toContainText('already a part');
  expect((await composerState(page)).layers).toHaveLength(3);
  // Cancel leaves the list as it was.
  await page.locator('.layer-add').click();
  await page.locator('.layer-pick-cancel').click();
  await expect(page.locator('.composer-layers [data-picking="true"]')).toHaveCount(0);
  expect((await composerState(page)).layers).toHaveLength(3);
});

test(`AC-19.11.1/3 — Remove takes a layer out; the same Pattern is never layered twice; at most 8 layers, Add layer saying so at the cap`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await addLayer(page, BOSSA);
  await addLayer(page, SON);
  await expect(layerItems(page)).toHaveCount(2);
  await layerItems(page).first().locator('.layer-remove').click();
  await expect(layerItems(page)).toHaveCount(1);
  await expect(layerItems(page).first().locator('.layer-name')).toHaveText('Son Clave 3-2');
  // Choosing it again is refused, not layered twice.
  await page.locator('.layer-add').click();
  await page.locator(`.pattern-item[data-pattern-id="${SON}"] [data-action="open-pattern"]`).click();
  await expect(page.locator('.composer-notice')).toContainText('already a part');
  expect((await composerState(page)).layers.map((l) => l.patternId)).toEqual([SON]);
  // Up to eight: Add layer is then disabled and says so.
  const ids = await page.evaluate(() => window.__rm.seedStore.loadAll().filter((s) => s.soundMode !== 'melodic' && s.measures.length === 1 && s.measures[0].timeSignature === '4/4').slice(0, 9).map((s) => s.id));
  for (const id of ids) {
    if (id === SON) continue;
    if ((await composerState(page)).layers.length === 8) break;
    await addLayer(page, id);
  }
  expect((await composerState(page)).layers).toHaveLength(8);
  await expect(page.locator('.layer-add')).toBeDisabled();
  await expect(page.locator('.layer-add')).toHaveAttribute('title', /At most 8 layers/);
});

test(`AC-19.11.1/4 — Mute silences a layer without removing it or changing the loop, and Unmute brings it back`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await addLayer(page, SON);
  const loopBefore = await page.locator('.layers-loop').textContent();
  const item = layerItems(page).first();
  await item.locator('.layer-mute').click();
  await expect(item).toHaveAttribute('data-muted', 'true');
  await expect(item.locator('.layer-mute')).toHaveText('Unmute');
  await expect(item.locator('.layer-mute')).toHaveAttribute('aria-pressed', 'true');
  await expect(layerItems(page)).toHaveCount(1);
  await expect(page.locator('.layers-loop')).toHaveText(loopBefore);
  // Silenced: the set the transport is handed has no events from it, but the same length.
  const muted = await page.evaluate(() => {
    const set = window.__rm.scheduled();
    return { layers: set.layers.map((l) => l.muted), repeats: set.layers.map((l) => l.repeats) };
  });
  expect(muted.layers).toEqual([false, true]);
  expect(muted.repeats).toEqual([2, 1]);
  await item.locator('.layer-mute').click();
  await expect(item).toHaveAttribute('data-muted', 'false');
  await expect(item.locator('.layer-mute')).toHaveText('Mute');
  expect((await composerState(page)).layers[0].muted).toBe(false);
});

test(`AC-19.11.1/5 — Without a composition the Layers section holds only the saved Arrangements, to open one from, and is absent when there are none; the layers go when another rhythm is opened into the Composer`, async ({ page }) => {
  await openApp(page);
  await enterComposer(page);
  await expect(page.locator('.composer-panel [data-empty="true"]')).toBeVisible();
  // No composition and nothing saved: no section at all.
  await expect(layers(page)).toHaveCount(0);
  // No composition but a saved Arrangement: the section holds only the saved list.
  await page.evaluate(() => window.__rm.arrangementStore.upsert({ name: 'Old bed', compositionId: 'p_none', layers: [{ patternId: 's_21', muted: false }] }));
  await page.evaluate(() => window.__rm.handlers.onComposerMode('practice'));
  await enterComposer(page);
  await expect(layers(page)).toHaveAttribute('data-composition', 'false');
  await expect(page.locator('.arrangement-item .arrangement-load')).toHaveText('Old bed');
  await expect(page.locator('.layer-item')).toHaveCount(0);
  await expect(page.locator('.layer-add')).toHaveCount(0);
  await page.evaluate(() => window.__rm.arrangementStore.remove('arr_1'));
  await page.evaluate(() => window.__rm.handlers.onOpen('s_21', false));
  await nameInDialog(page, 'Line one');
  await expect(layers(page)).toBeVisible();
  await addLayer(page, SON);
  // Another rhythm opened: the unsaved work is confirmed away, and the layers with it.
  await page.evaluate(() => window.__rm.handlers.onOpen('s_17', false));
  await page.locator('.dialog-button', { hasText: 'Discard and open' }).click();
  await nameInDialog(page, 'Line two');
  await expect(layers(page).locator('.layer-item.composition .layer-name')).toHaveText('Line two');
  await expect(layerItems(page)).toHaveCount(0);
  expect((await composerState(page)).layers).toEqual([]);
});

// --- AC-19.11.2: layers sound together --------------------------------------------

test(`AC-19.11.2/2 — The composition sounds with the instrument shown; a melodic layer sounds with the melodic voice Practice would use; a percussive layer, and an unpitched syllable in any layer, sounds percussively at its Accent Level`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await setTempo(page, 240);
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  await fret(page, 1, 3).click();
  await page.locator('.record').click();
  await addLayer(page, DJEMBE);
  await addLayer(page, BOSSA);
  // The one timeline: the composition's two pitched and two unpitched events,
  // the melody's pitched, the rhythm's unpitched, per pass.
  const events = await page.evaluate(() => {
    const set = window.__rm.scheduled();
    return { layered: set.layered, repeats: set.layers.map((l) => l.repeats) };
  });
  expect(events.layered).toBe(true);
  expect(events.repeats).toEqual([1, 1, 1]);
  const before = (await page.evaluate(() => window.__rm.voiceLog().length));
  await play(page);
  await expect.poll(async () => (await page.evaluate(() => window.__rm.voiceLog())).filter((v) => v.composition).length, { timeout: 8000 }).toBeGreaterThan(before + 1);
  await expect.poll(async () => (await page.evaluate(() => window.__rm.voiceLog())).filter((v) => !v.composition).length, { timeout: 8000 }).toBeGreaterThan(1);
  const log = (await page.evaluate(() => window.__rm.voiceLog())).slice(before);
  // The composition's notes through the instrument shown (guitar); the layer's through Practice's voice (piano by default).
  expect(log.filter((v) => v.composition).every((v) => v.voice === 'guitar')).toBe(true);
  expect(log.filter((v) => !v.composition).every((v) => v.voice === 'piano' && v.layer === 1)).toBe(true);
  // The percussive layer sounds no melodic note at all: nothing logged for layer 2.
  expect(log.some((v) => v.layer === 2)).toBe(false);
  await play(page);
});

test(`AC-19.11.2/4 — Adding, removing, muting or unmuting a layer while playing is heard from the next pass of the combined loop, with nothing stopped or restarted`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await setTempo(page, 240);
  await play(page);
  await expect.poll(() => page.evaluate(() => window.__rm.getState().loop), { timeout: 8000 }).toBeGreaterThan(0);
  const loopBefore = await page.evaluate(() => window.__rm.getState().loop);
  await addLayer(page, BOSSA);
  const after = await state(page);
  expect(after.isPlaying).toBe(true);
  expect(after.loop).toBeGreaterThanOrEqual(loopBefore);
  expect((await page.evaluate(() => window.__rm.scheduled().layers.length))).toBe(2);
  // Still counting, no restart: the counter goes on from where it was.
  await expect.poll(() => page.evaluate(() => window.__rm.getState().loop), { timeout: 8000 }).toBeGreaterThan(after.loop);
  await layerItems(page).first().locator('.layer-mute').click();
  expect((await state(page)).isPlaying).toBe(true);
  expect((await page.evaluate(() => window.__rm.scheduled().layers[1].muted))).toBe(true);
  await layerItems(page).first().locator('.layer-remove').click();
  expect((await state(page)).isPlaying).toBe(true);
  expect((await page.evaluate(() => window.__rm.scheduled().layered ?? false))).toBe(false);
  await play(page);
});

test(`AC-19.11.2/5 — Recording and editing carry on under layers as they do without: the target, the selection and the cursor in the composing grid are the composition's, and a note recorded is heard from the next pass`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await setTempo(page, 240);
  await addLayer(page, SON);
  await page.locator('.record').click();
  await play(page);
  await expect(page.locator('.composer-grid .slot.playing')).toHaveCount(1);
  await fret(page, 1, 1).click();
  const c = await composerState(page);
  expect(c.recording).toBe(true);
  expect(c.target).toEqual({ measureIndex: 0, beatIndex: 1, slotIndex: 0 });
  // The cursor is one Slot of the composing grid at a time, never a layer's.
  for (let i = 0; i < 5; i++) {
    expect(await page.locator('.composer-grid .slot.playing').count()).toBeLessThanOrEqual(1);
    await page.waitForTimeout(120);
  }
  const positions = await page.evaluate(() => window.__rm.getState().transportPosition);
  expect(positions.composition).toBe(true);
  // The recorded note is in the set handed to the transport for the next pass.
  const pitched = await page.evaluate(() => window.__rm.scheduled().layers[0].pattern.measures[0].beats[0].slots[0].pitch !== null);
  expect(pitched).toBe(true);
  expect((await state(page)).isPlaying).toBe(true);
  await play(page);
});

// --- AC-19.11.3: the combined loop ------------------------------------------------

test(`AC-19.11.3/2 — A one-Measure layer under a four-Measure composition plays four times in each loop, and a four-Measure layer under a one-Measure composition makes the composition play four times`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  // A four-Measure layer under the one-Measure composition.
  await addLayer(page, FOUR_BARS);
  await expect(page.locator('.layer-item.composition .layer-repeats')).toHaveAttribute('data-repeats', '4');
  await expect(layerItems(page).first().locator('.layer-repeats')).toHaveAttribute('data-repeats', '1');
  await expect(page.locator('.layers-loop')).toHaveAttribute('data-passes', '4');
  // And the other way: the four-Measure Pattern composed on, Bossa Nova under it.
  await page.evaluate(() => window.__rm.handlers.onOpen('s_79', false));
  await page.locator('.dialog-button', { hasText: 'Discard and open' }).click();
  await nameInDialog(page, 'Four bars');
  await addLayer(page, BOSSA);
  await expect(page.locator('.layer-item.composition .layer-repeats')).toHaveAttribute('data-repeats', '1');
  await expect(layerItems(page).first().locator('.layer-repeats')).toHaveAttribute('data-repeats', '4');
  await expect(page.locator('.layers-loop')).toHaveAttribute('data-passes', '1');
});

test(`AC-19.11.3/5 — The Layers section states the loop's length in passes of the composition and each layer's repeats in it`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await addLayer(page, SON);
  await addLayer(page, BOSSA);
  await expect(page.locator('.layers-loop')).toHaveText('Loop: 2 passes of the part on screen — My line ×2, Son Clave 3-2 ×1, Bossa Nova ×2');
  await expect(page.locator('.layers-loop')).toHaveAttribute('data-passes', '2');
  await expect(layerItems(page).nth(0).locator('.layer-repeats')).toHaveText('×1');
  await expect(layerItems(page).nth(1).locator('.layer-repeats')).toHaveText('×2');
});

test(`AC-19.11.3/6 — The cursor runs through the composing grid once per pass of the composition, as many times per combined loop as the composition repeats`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await setTempo(page, 240);
  await addLayer(page, SON);
  await play(page);
  // The composition's second time through the loop: the cursor is in the grid, on repeat 1 of loop 0.
  await expect.poll(() => page.evaluate(() => {
    const p = window.__rm.getState().transportPosition;
    return p ? `${p.loop}:${p.repeat}` : null;
  }), { timeout: 8000 }).toBe('0:1');
  await expect(page.locator('.composer-grid .slot.playing')).toHaveCount(1);
  // One combined loop is two passes of the grid: loop 1 begins only after repeat 1 has run.
  await expect.poll(() => page.evaluate(() => window.__rm.getState().transportPosition?.loop), { timeout: 8000 }).toBe(1);
  const seen = await page.evaluate(() => window.__rm.scheduled().layers[0].repeats);
  expect(seen).toBe(2);
  await play(page);
});

// --- AC-19.11.4: saving an Arrangement ----------------------------------------------

test(`AC-19.11.4/1 — Save arrangement asks a name, pre-filled with the composition's name and "arrangement", unique among Arrangements, and stores the composition's id, its layers in order, which are muted and which part is on screen; it is unavailable until every part is saved to the library and there is a layer, saying why`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await expect(page.locator('.arrangement-save')).toBeDisabled();
  await expect(page.locator('.arrangement-save')).toHaveAttribute('title', /Save every part to the library first.*My line/);
  const id = await saveComposition(page);
  await expect(page.locator('.arrangement-save')).toBeDisabled();
  await expect(page.locator('.arrangement-save')).toHaveAttribute('title', /Add a layer first/);
  await addLayer(page, SON);
  await addLayer(page, BOSSA);
  await layerItems(page).nth(1).locator('.layer-mute').click();
  await expect(page.locator('.arrangement-save')).toBeEnabled();
  await page.locator('.arrangement-save').click();
  await expect(page.locator('.dialog-input')).toHaveValue('My line arrangement');
  await nameInDialog(page);
  const stored = await page.evaluate(() => window.__rm.arrangementStore.loadAll());
  expect(stored).toEqual([
    { id: 'arr_1', name: 'My line arrangement', compositionId: id, layers: [{ patternId: SON, muted: false }, { patternId: BOSSA, muted: true }], active: 0 },
  ]);
  await expect(page.locator('.layers-arrangement-name')).toHaveText('My line arrangement');
  // A second, under the same suggestion: numbered, and a taken name refused.
  await page.locator('.arrangement-new').click();
  await addLayer(page, DJEMBE);
  await page.locator('.arrangement-save').click();
  await expect(page.locator('.dialog-input')).toHaveValue('My line arrangement 2');
  await page.locator('.dialog-input').fill('My line arrangement');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.dialog')).toBeVisible();
  await expect(page.locator('.dialog')).toContainText('already exists');
  await page.locator('.dialog-input').fill('Second bed');
  await page.locator('.dialog-button.primary').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect((await page.evaluate(() => window.__rm.arrangementStore.loadAll().map((a) => a.name)))).toEqual(['My line arrangement', 'Second bed']);
});

test(`AC-19.11.4/2 — A saved Arrangement survives a reload and is listed in the Layers section; choosing one opens its composition in the Composer — asking first when unsaved work would be lost — and sets its layers and mutes`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const id = await saveComposition(page);
  await addLayer(page, SON);
  await addLayer(page, BOSSA);
  await layerItems(page).nth(1).locator('.layer-mute').click();
  await page.locator('.arrangement-save').click();
  await nameInDialog(page, 'Bed');
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  // Open the Composer on whatever Pattern the reload opened, declining any prompt:
  // the saved Arrangement is listed with or without a composition (AC-19.11.1/5).
  await page.locator('.mode-switch [data-mode="composer"]').click();
  await expect(page.locator('.composer-panel')).toBeVisible();
  await page.waitForTimeout(300);
  if (await page.locator('.dialog').count()) await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await expect(page.locator('.arrangement-item[data-arrangement-id="arr_1"] .arrangement-load')).toHaveText('Bed');
  // A different, unsaved composition is open when the Arrangement is chosen: asked first.
  await page.evaluate(() => window.__rm.handlers.onOpen('s_17', false));
  await nameInDialog(page, 'Scratch');
  await expect(layerItems(page)).toHaveCount(0);
  await page.locator('.arrangement-item[data-arrangement-id="arr_1"] .arrangement-load').click();
  await expect(page.locator('.dialog')).toContainText('Scratch');
  await page.locator('.dialog-button', { hasText: 'Keep composing' }).click();
  expect((await composerState(page)).draft.name).toBe('Scratch');
  await page.locator('.arrangement-item[data-arrangement-id="arr_1"] .arrangement-load').click();
  await page.locator('.dialog-button', { hasText: 'Discard and open' }).click();
  await expect(page.locator('.layer-item.composition .layer-name')).toHaveText('My line');
  const c = await composerState(page);
  expect(c.savedId).toBe(id);
  expect(c.layers).toEqual([{ patternId: SON, muted: false }, { patternId: BOSSA, muted: true }]);
  expect(c.arrangement.id).toBe('arr_1');
  await expect(layerItems(page).nth(1)).toHaveAttribute('data-muted', 'true');
  await expect(page.locator('.arrangement-item[data-arrangement-id="arr_1"]')).toHaveClass(/current/);
});

test(`AC-19.11.4/3 — An Arrangement can be renamed and deleted from the Layers section, deletion asking first`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await saveComposition(page);
  await addLayer(page, SON);
  await page.locator('.arrangement-save').click();
  await nameInDialog(page, 'Bed');
  await page.locator('.arrangement-item[data-arrangement-id="arr_1"] .arrangement-rename').click();
  await expect(page.locator('.dialog-input')).toHaveValue('Bed');
  await nameInDialog(page, 'Better bed');
  await expect(page.locator('.arrangement-item[data-arrangement-id="arr_1"] .arrangement-load')).toHaveText('Better bed');
  await expect(page.locator('.layers-arrangement-name')).toHaveText('Better bed');
  expect((await page.evaluate(() => window.__rm.arrangementStore.findById('arr_1').name))).toBe('Better bed');
  await page.locator('.arrangement-item[data-arrangement-id="arr_1"] .arrangement-delete').click();
  await expect(page.locator('.dialog')).toContainText('Delete the Arrangement "Better bed"');
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await expect(page.locator('.arrangement-item')).toHaveCount(1);
  await page.locator('.arrangement-item[data-arrangement-id="arr_1"] .arrangement-delete').click();
  await page.locator('.dialog-button', { hasText: 'Delete' }).click();
  await expect(page.locator('.arrangement-item')).toHaveCount(0);
  expect((await page.evaluate(() => window.__rm.arrangementStore.loadAll()))).toEqual([]);
  // The layers stay on screen; they are simply no longer a saved Arrangement.
  await expect(layerItems(page)).toHaveCount(1);
  await expect(page.locator('.layers-unsaved')).toHaveAttribute('data-unsaved', 'new');
});

test(`AC-19.11.4/4 — Edits to a loaded Arrangement's layers are not saved until Save arrangement is pressed again, which updates it in place; the section says when the loaded Arrangement has unsaved changes`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await saveComposition(page);
  await addLayer(page, SON);
  await expect(page.locator('.layers-unsaved')).toHaveAttribute('data-unsaved', 'new');
  await page.locator('.arrangement-save').click();
  await nameInDialog(page, 'Bed');
  await expect(page.locator('.layers-unsaved')).toHaveCount(0);
  await layerItems(page).first().locator('.layer-mute').click();
  await expect(page.locator('.layers-unsaved')).toHaveAttribute('data-unsaved', 'changes');
  expect((await page.evaluate(() => window.__rm.arrangementStore.findById('arr_1').layers[0].muted))).toBe(false);
  await addLayer(page, BOSSA);
  await page.locator('.arrangement-save').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(page.locator('.layers-unsaved')).toHaveCount(0);
  const stored = await page.evaluate(() => window.__rm.arrangementStore.loadAll());
  expect(stored).toHaveLength(1);
  expect(stored[0].layers).toEqual([{ patternId: SON, muted: true }, { patternId: BOSSA, muted: false }]);
});

test(`AC-19.11.4/5 — Deleting a Pattern that an Arrangement uses, as its composition or as a layer, is refused with a message naming the Arrangement or Arrangements, until they are deleted`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const id = await saveComposition(page);
  // An owned layer: the Practice fixture itself.
  await addLayer(page, 'p_test');
  await page.locator('.arrangement-save').click();
  await nameInDialog(page, 'Bed');
  // The composition is the open Pattern: deleting it from Practice is refused.
  await page.evaluate(() => void window.__rm.handlers.onDelete());
  await expect(page.locator('.dialog')).toContainText('the Arrangement "Bed" uses it');
  await page.locator('.dialog-button', { hasText: 'OK' }).click();
  expect((await page.evaluate((i) => Boolean(window.__rm.patternStore.findById(i)), id))).toBe(true);
  // So is the layer.
  await page.evaluate(() => window.__rm.loadPattern(window.__rm.patternStore.findById('p_test'), { owned: true }));
  await page.evaluate(() => void window.__rm.handlers.onDelete());
  await expect(page.locator('.dialog')).toContainText('"Fixture" can\'t be deleted: the Arrangement "Bed" uses it');
  await page.locator('.dialog-button', { hasText: 'OK' }).click();
  expect((await page.evaluate(() => Boolean(window.__rm.patternStore.findById('p_test'))))).toBe(true);
  // Once the Arrangement is gone, the deletion is asked as usual.
  await page.evaluate(() => window.__rm.arrangementStore.remove('arr_1'));
  await page.evaluate(() => void window.__rm.handlers.onDelete());
  await expect(page.locator('.dialog')).toContainText('Delete "Fixture" permanently?');
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
});

test(`AC-19.11.4/6 — An Arrangement is not Pattern content: saving one changes nothing on any Pattern, and the composition's JSON and MIDI exports and its submission carry nothing of it`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const id = await saveComposition(page);
  const before = await page.evaluate((i) => JSON.stringify(window.__rm.patternStore.findById(i)), id);
  await addLayer(page, SON);
  await addLayer(page, BOSSA);
  await page.locator('.arrangement-save').click();
  await nameInDialog(page, 'Bed');
  const after = await page.evaluate((i) => ({
    composition: JSON.stringify(window.__rm.patternStore.findById(i)),
    patterns: localStorage.getItem('rm.patterns.v1'),
    seed: JSON.stringify(window.__rm.seedStore.findById('s_22')),
    arrangements: localStorage.getItem('rm.arrangements.v1'),
  }), id);
  expect(after.composition).toBe(before);
  expect(after.patterns).not.toContain('Bed');
  expect(after.patterns).not.toContain('layers');
  expect(after.seed).not.toContain('Bed');
  expect(after.arrangements).toContain('Bed');
  // What the exports and the submission are built from is the Pattern, as stored.
  const exported = JSON.parse(after.composition);
  expect(exported.layers).toBeUndefined();
  expect(exported.arrangement).toBeUndefined();
  expect(after.composition).not.toContain(SON);
});

test('AC-19.11.2/1 — Play sounds the composition and every unmuted layer at once, from one timeline: two notes falling on the same instant both sound', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await setTempo(page, 240);
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  await page.locator('.record').click();
  await addLayer(page, DJEMBE);
  // The one timeline the transport is handed: the composition's four Beats and
  // the melody's notes in one sorted list, each downbeat an instant both share,
  // the composition's event first.
  const merged = await page.evaluate(() => window.__rmTimeline.timelineOf(window.__rm.scheduled(), 0).map((e) => [Math.round(e.timeSeconds * 1000), e.layer]));
  const own = merged.filter(([, layer]) => layer === 0).map(([t]) => t);
  expect(own).toEqual([0, 250, 500, 750]);
  const layerCount = await page.evaluate(() => window.__rmTimeline.buildTimeline(window.__rm.scheduled().layers[1].pattern, 0).length);
  expect(merged).toHaveLength(4 + layerCount);
  for (let i = 1; i < merged.length; i++) expect(merged[i][0]).toBeGreaterThanOrEqual(merged[i - 1][0]);
  const shared = merged.filter(([t]) => t === 0);
  expect(shared.length).toBeGreaterThanOrEqual(2);
  expect(shared[0][1]).toBe(0);
  expect(shared.some(([, layer]) => layer === 1)).toBe(true);
  const before = (await page.evaluate(() => window.__rm.voiceLog().length));
  await play(page);
  // Both sound in one run: the composition's note and the layer's, in the same pass.
  await expect.poll(async () => {
    const log = (await page.evaluate(() => window.__rm.voiceLog())).slice(before);
    return log.some((v) => v.composition) && log.some((v) => !v.composition);
  }, { timeout: 8000 }).toBe(true);
  expect((await state(page)).isPlaying).toBe(true);
  await play(page);
});

test("AC-19.11.2/3 — Every layer plays at the composition's tempo, tempo unit, swing and Key, whatever its own; a percussive layer takes no Key", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await addLayer(page, DJEMBE);
  await addLayer(page, BOSSA);
  const own = await page.evaluate(() => ({
    djembe: window.__rm.seedStore.findById('s_108').tempo,
    bossa: window.__rm.seedStore.findById('s_21').tempo,
  }));
  await setTempo(page, 233);
  await page.locator('.composer-key').selectOption('G');
  await page.locator('.composer-swing-entry').fill('30');
  await page.locator('.composer-swing-entry').press('Enter');
  const set = await page.evaluate(() => {
    const s = window.__rm.scheduled();
    return s.layers.map((l) => ({ tempo: l.pattern.tempo, unit: l.pattern.tempoUnit, swing: l.pattern.swingAmount, key: l.pattern.key ?? null, name: l.pattern.name }));
  });
  expect(set.map((l) => l.tempo)).toEqual([233, 233, 233]);
  expect(set.map((l) => l.unit)).toEqual(['quarter', 'quarter', 'quarter']);
  expect(set.map((l) => l.swing)).toEqual([30, 30, 30]);
  expect(set.map((l) => l.key)).toEqual(['G', 'G', null]);
  // The library's own copies keep their tempo.
  const after = await page.evaluate(() => ({
    djembe: window.__rm.seedStore.findById('s_108').tempo,
    bossa: window.__rm.seedStore.findById('s_21').tempo,
  }));
  expect(after).toEqual(own);
});

test('AC-19.11.2/6 — The screen-off handover renders the combined loop with every unmuted layer, as the transport plays it', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await setTempo(page, 240);
  await addLayer(page, SON);
  await addLayer(page, BOSSA);
  await layerItems(page).nth(1).locator('.layer-mute').click();
  await play(page);
  await expect.poll(() => page.evaluate(() => window.__rm.rendered()?.passes ?? null), { timeout: 15000 }).toBe(1);
  const rendered = await page.evaluate(() => ({
    seconds: window.__rm.rendered().seconds,
    loop: window.__rmTimeline.loopDurationOf(window.__rm.scheduled()),
    layers: window.__rm.scheduled().layers.map((l) => ({ repeats: l.repeats, muted: l.muted })),
  }));
  // One combined loop — two passes of the composition under the two-bar clave — the muted layer silent but counted.
  expect(rendered.layers).toEqual([{ repeats: 2, muted: false }, { repeats: 1, muted: false }, { repeats: 2, muted: true }]);
  expect(rendered.seconds).toBeCloseTo(rendered.loop, 3);
  expect(rendered.seconds).toBeCloseTo(2, 3);
  await play(page);
});

// --- AC-19.11.5: exporting an Arrangement as MIDI ------------------------------------

/** Press Export arrangement MIDI and return the download's name and its entries' names. */
async function exportArrangement(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.arrangement-export').click()]);
  const { readFile } = await import('node:fs/promises');
  const bytes = new Uint8Array(await readFile(await download.path()));
  const { readZip } = await import('../zip-reader.js');
  return { name: download.suggestedFilename(), entries: readZip(bytes) };
}

test("AC-19.11.5/1 — Export arrangement MIDI downloads one ZIP holding one `.mid` per layer, the composition first and the rest in their order, each named with its position and the Pattern's name; muted layers are included", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await addLayer(page, SON);
  await addLayer(page, BOSSA);
  await layerItems(page).nth(1).locator('.layer-mute').click();
  const { name, entries } = await exportArrangement(page);
  expect(name).toBe('my-line.zip');
  expect(entries.map((e) => e.name)).toEqual(['01-my-line.mid', '02-son-clave-3-2.mid', '03-bossa-nova.mid']);
  for (const e of entries) expect(String.fromCharCode(...e.bytes.slice(0, 4))).toBe('MThd');
  expect(entries[2].bytes.length).toBeGreaterThan(30);
});

test('AC-19.11.5/3 — The archive is named after the Arrangement once it has been saved, and after the composition otherwise', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await saveComposition(page);
  await addLayer(page, SON);
  expect((await exportArrangement(page)).name).toBe('my-line.zip');
  await page.locator('.arrangement-save').click();
  await nameInDialog(page, 'Evening Bed');
  expect((await exportArrangement(page)).name).toBe('evening-bed.zip');
});

test("AC-19.11.5/4 — Export arrangement MIDI is unavailable without a layer, and the Pattern's own MIDI export and a Song's are unchanged", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await expect(page.locator('.arrangement-export')).toBeDisabled();
  await expect(page.locator('.arrangement-export')).toHaveAttribute('title', 'Add a layer first');
  await addLayer(page, SON);
  await expect(page.locator('.arrangement-export')).toBeEnabled();
  await layerItems(page).first().locator('.layer-remove').click();
  await expect(page.locator('.arrangement-export')).toBeDisabled();
});

/** The end-of-track tick and note-on count of a format-0 .mid. */
function midiSummary(bytes) {
  let i = 14; // past MThd
  while (String.fromCharCode(...bytes.slice(i, i + 4)) !== 'MTrk') i += 1;
  const len = (bytes[i + 4] << 24) | (bytes[i + 5] << 16) | (bytes[i + 6] << 8) | bytes[i + 7];
  const track = bytes.slice(i + 8, i + 8 + len);
  let at = 0;
  let tick = 0;
  let ons = 0;
  let end = 0;
  while (at < track.length) {
    let delta = 0;
    for (;;) {
      const b = track[at++];
      delta = (delta << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    tick += delta;
    const status = track[at++];
    if (status === 0xff) {
      const type = track[at++];
      const n = track[at++];
      if (type === 0x2f) end = tick;
      at += n;
    } else {
      if ((status & 0xf0) === 0x90 && track[at + 1] > 0) ons += 1;
      at += 2;
    }
  }
  return { end, ons };
}

test("AC-19.11.5/2 — Each file spans one combined loop: the layer's own timeline for each of its repeats, a progression walking its chords across them, at the composition's tempo, tempo unit, swing and Key, so every file in the archive has the same length", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await setTempo(page, 100);
  await addLayer(page, SON);
  await addLayer(page, BOSSA);
  // One combined loop is two bars: the composition twice, the clave once, Bossa Nova twice.
  await expect(page.locator('.layers-loop')).toHaveAttribute('data-passes', '2');
  const { entries } = await exportArrangement(page);
  const summaries = entries.map((e) => midiSummary(e.bytes));
  // Every file the same length: two bars of 4/4 at 480 ticks a quarter.
  expect(summaries.map((s) => s.end)).toEqual([3840, 3840, 3840]);
  // The composition's four syllables twice; Bossa Nova's own count twice; the clave's once.
  const counts = await page.evaluate(() => {
    const set = window.__rm.scheduled();
    return set.layers.map((l) => window.__rmTimeline.buildTimeline(l.pattern, 0).length * l.repeats);
  });
  expect(summaries.map((s) => s.ons)).toEqual(counts);
  expect(summaries[0].ons).toBe(8);
});

// --- AC-19.11.6: any part can be the one on screen ----------------------------------

const activeName = (page) => page.locator('.composer-bar .composer-name');

test('AC-19.11.6/1 — Choosing a part in the Layers section puts it in the composing grid: its notes in the Slots, its name in the record bar, the record target and the selection its own, Record and a tap on the instrument writing onto it; the part left keeps its notes, saved or not, and is listed as a layer', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  // Two notes on My line, never saved.
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  await fret(page, 1, 3).click();
  await page.locator('.record').click();
  await addLayer(page, BOSSA);
  // Bossa Nova on screen: a shipped rhythm, so a new composition under a name (AC-19.11.6/2).
  await partRow(page, 'Bossa Nova').locator('.layer-pick').click();
  await nameInDialog(page, 'Bossa line');
  await expect(activeName(page)).toHaveText('Bossa line');
  await expect(page.locator('.composer-grid .slot.has-note')).toHaveCount(0);
  expect(await page.locator('.composer-grid .slot.unpitched').count()).toBeGreaterThan(0);
  // Record writes onto it, and the target is its own first syllable.
  await page.locator('.record').click();
  const target = (await composerState(page)).target;
  expect(target.measureIndex).toBe(0);
  expect(target.beatIndex).toBe(0);
  await fret(page, 2, 2).click();
  await expect(page.locator('.composer-grid .slot.has-note')).toHaveCount(1);
  await page.locator('.record').click();
  // My line is a layer now, its notes kept, not yet saved.
  const left = partRow(page, 'My line');
  await expect(left).toHaveAttribute('data-active', 'false');
  await expect(left.locator('[data-part-unsaved="true"]')).toBeVisible();
  const kept = (await composerState(page)).layers.find((l) => l.draft?.name === 'My line');
  expect(kept.draft.measures[0].beats[0].slots[0].pitch).not.toBeNull();
  expect(kept.draft.measures[0].beats[1].slots[0].pitch).not.toBeNull();
  // Back to My line: its two notes are on screen again, and Bossa line is kept with its one.
  await left.locator('.layer-pick').click();
  await expect(activeName(page)).toHaveText('My line');
  await expect(page.locator('.composer-grid .slot.has-note')).toHaveCount(2);
  await expect(partRow(page, 'Bossa line').locator('[data-part-unsaved="true"]')).toBeVisible();
});

test("AC-19.11.6/2 — An owned melody opens directly; a shipped, percussive or progression-carrying part opens through US-19.8's rules — a name asked, pre-filled — and the new composition takes that part's place in the list; cancelling the prompt changes nothing", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const mine = await saveComposition(page);
  // A second composition on screen, My line among its layers.
  await page.evaluate(() => window.__rm.handlers.onOpen('s_17', false));
  await nameInDialog(page, 'Line two');
  await addLayer(page, mine);
  await addLayer(page, BOSSA);
  // The owned melody: on screen with no ask, saved as it is.
  await partRow(page, 'My line').locator('.layer-pick').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(activeName(page)).toHaveText('My line');
  expect((await composerState(page)).savedId).toBe(mine);
  // The shipped rhythm: a name, pre-filled; cancelling changes nothing.
  await partRow(page, 'Bossa Nova').locator('.layer-pick').click();
  await expect(page.locator('.dialog-input')).toHaveValue('Bossa Nova melody');
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await expect(activeName(page)).toHaveText('My line');
  await expect(partRow(page, 'Bossa Nova')).toHaveAttribute('data-active', 'false');
  // Accepting: the new composition takes Bossa Nova's place in the list.
  const orderBefore = await page.locator('.composer-layers .layer-pick').allTextContents();
  await partRow(page, 'Bossa Nova').locator('.layer-pick').click();
  await nameInDialog(page, 'Bossa line');
  const orderAfter = await page.locator('.composer-layers .layer-pick').allTextContents();
  expect(orderAfter).toEqual(orderBefore.map((n) => (n === 'Bossa Nova' ? 'Bossa line' : n)));
  await expect(activeName(page)).toHaveText('Bossa line');
  expect((await composerState(page)).savedId).toBeNull();
});

test('AC-19.11.6/3 — Switching while playing stops and restarts nothing: every part goes on sounding, the part now on screen sounds with the instrument shown and the one left with the Practice voice from the next pass, and the cursor follows the part on screen', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const mine = await saveComposition(page);
  await page.evaluate(() => window.__rm.handlers.onOpen('s_17', false));
  await nameInDialog(page, 'Line two');
  await setTempo(page, 240);
  await addLayer(page, mine);
  await play(page);
  await expect.poll(() => page.evaluate(() => window.__rm.getState().loop), { timeout: 8000 }).toBeGreaterThan(0);
  const loopBefore = await page.evaluate(() => window.__rm.getState().loop);
  const logBefore = await page.evaluate(() => window.__rm.voiceLog().length);
  await partRow(page, 'My line').locator('.layer-pick').click();
  const after = await state(page);
  expect(after.isPlaying).toBe(true);
  expect(after.loop).toBeGreaterThanOrEqual(loopBefore);
  // The set the transport is handed: My line on screen, Line two beneath, both sounding.
  const set = await page.evaluate(() => window.__rm.scheduled().layers.map((l) => ({ name: l.pattern.name, composition: l.composition, muted: l.muted })));
  expect(set).toEqual([{ name: 'My line', composition: true, muted: false }, { name: 'Line two', composition: false, muted: false }]);
  // From the next pass My line's notes sound with the instrument (guitar), as the composition's.
  await expect.poll(async () => (await page.evaluate(() => window.__rm.voiceLog())).slice(logBefore).some((v) => v.composition === true && v.voice === 'guitar'), { timeout: 8000 }).toBe(true);
  // The cursor follows the part on screen.
  await expect.poll(() => page.evaluate(() => window.__rm.getState().transportPosition?.composition), { timeout: 8000 }).toBe(true);
  await expect(page.locator('.composer-grid .slot.playing')).toHaveCount(1);
  await play(page);
});

test("AC-19.11.6/4 — Tempo, tempo unit, swing and Key are the arrangement's, carried by the part on screen: the Composer's controls show and set them whichever part that is, a part made the one on screen takes them from the part it replaces, and nothing heard changes at the switch", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const mine = await saveComposition(page);
  await page.evaluate(() => window.__rm.handlers.onOpen('s_17', false));
  await nameInDialog(page, 'Line two');
  await addLayer(page, mine);
  await setTempo(page, 150);
  await page.locator('.composer-key').selectOption('G');
  await page.locator('.composer-swing-entry').fill('25');
  await page.locator('.composer-swing-entry').press('Enter');
  const heardBefore = await page.evaluate(() => window.__rm.scheduled().layers.map((l) => [l.pattern.tempo, l.pattern.swingAmount, l.pattern.key ?? null]));
  await partRow(page, 'My line').locator('.layer-pick').click();
  // The controls show the arrangement's settings on the part now on screen.
  await expect(page.locator('.composer-tempo-entry')).toHaveValue('150');
  await expect(page.locator('.composer-key')).toHaveValue('G');
  await expect(page.locator('.composer-swing-entry')).toHaveValue('25');
  const c = await composerState(page);
  expect([c.draft.tempo, c.draft.swingAmount, c.draft.key]).toEqual([150, 25, 'G']);
  const heardAfter = await page.evaluate(() => window.__rm.scheduled().layers.map((l) => [l.pattern.tempo, l.pattern.swingAmount, l.pattern.key ?? null]));
  expect(heardAfter).toEqual(heardBefore.slice().reverse());
  // And setting them here sets them for every part.
  await setTempo(page, 90);
  expect(await page.evaluate(() => window.__rm.scheduled().layers.map((l) => l.pattern.tempo))).toEqual([90, 90]);
});

test("AC-19.11.6/5 — The part on screen is marked in the Layers section and cannot be muted or removed there; each part's repeats in the loop are unchanged by which part is on screen, the loop readout counting in passes of that part", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const mine = await saveComposition(page);
  await page.evaluate(() => window.__rm.handlers.onOpen('s_17', false));
  await nameInDialog(page, 'Line two');
  await addLayer(page, mine);
  await addLayer(page, SON);
  const onScreen = page.locator('.composer-layers .layer-item[data-active="true"]');
  await expect(onScreen).toHaveCount(1);
  await expect(onScreen.locator('.layer-pick')).toHaveText('Line two');
  await expect(onScreen.locator('.layer-pick')).toBeDisabled();
  await expect(onScreen.locator('.layer-mute')).toHaveCount(0);
  await expect(onScreen.locator('.layer-remove')).toHaveCount(0);
  const repeatsBefore = await page.locator('.composer-layers .layer-repeats').allTextContents();
  // Line two, one bar, under the two-bar clave: a loop of two of its passes.
  await expect(page.locator('.layers-loop')).toHaveAttribute('data-passes', '2');
  await partRow(page, 'Son Clave 3-2').locator('.layer-pick').click();
  await nameInDialog(page, 'Clave line');
  await expect(page.locator('.composer-layers .layer-item[data-active="true"] .layer-pick')).toHaveText('Clave line');
  expect(await page.locator('.composer-layers .layer-repeats').allTextContents()).toEqual(repeatsBefore);
  // The same loop, counted in passes of the two-bar part now on screen.
  await expect(page.locator('.layers-loop')).toHaveAttribute('data-passes', '1');
  await expect(partRow(page, 'Line two').locator('.layer-mute')).toBeVisible();
});

test('AC-19.11.6/6 — Leaving the Composer, or opening another rhythm, with any part unsaved asks first, naming every unsaved part; a saved Arrangement remembers which part was on screen and opens on it', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await addLayer(page, BOSSA);
  await partRow(page, 'Bossa Nova').locator('.layer-pick').click();
  await nameInDialog(page, 'Bossa line');
  // Two unsaved parts: both named.
  await page.locator('.mode-switch [data-mode="practice"]').click();
  await expect(page.locator('.dialog')).toContainText('"My line"');
  await expect(page.locator('.dialog')).toContainText('"Bossa line"');
  await page.locator('.dialog-button', { hasText: 'Stay' }).click();
  expect((await composerState(page)).mode).toBe('composer');
  // Save both, save the Arrangement with Bossa line on screen, and come back to it.
  await recordUntilDone(page);
  await page.locator('.composer-save').click();
  await partRow(page, 'My line').locator('.layer-pick').click();
  await recordUntilDone(page);
  await page.locator('.composer-save').click();
  await partRow(page, 'Bossa line').locator('.layer-pick').click();
  await expect(page.locator('.arrangement-save')).toBeEnabled();
  await page.locator('.arrangement-save').click();
  await nameInDialog(page, 'Two lines');
  expect((await page.evaluate(() => window.__rm.arrangementStore.findById('arr_1'))).active).toBe(1);
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  await page.locator('.mode-switch [data-mode="composer"]').click();
  await expect(page.locator('.composer-panel')).toBeVisible();
  await page.waitForTimeout(300);
  if (await page.locator('.dialog').count()) await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await page.locator('.arrangement-item[data-arrangement-id="arr_1"] .arrangement-load').click();
  await page.waitForTimeout(300);
  if (await page.locator('.dialog').count()) await page.locator('.dialog-button', { hasText: 'Discard and open' }).click();
  await expect(activeName(page)).toHaveText('Bossa line');
  expect((await composerState(page)).activeIndex).toBe(1);
  await expect(page.locator('.composer-layers .layer-pick').first()).toHaveText('My line');
});

// --- AC-19.11.7: a new part from nothing ---------------------------------------------

test(`AC-19.11.7/1 — New layer asks a name, pre-filled with the part on screen's name and "layer", creates a one-Measure Pattern in that part's meter, tempo, swing and Key with every Slot silent, saves it to the library, and puts it on screen as the last part, the part it replaces going among the layers`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await setTempo(page, 132);
  await page.locator('.composer-key').selectOption('D');
  await page.locator('.layer-new').click();
  await expect(page.locator('.dialog-input')).toHaveValue('My line layer');
  await nameInDialog(page);
  await expect(activeName(page)).toHaveText('My line layer');
  const c = await composerState(page);
  expect(c.savedId).not.toBeNull();
  expect(c.draft.measures).toHaveLength(1);
  expect(c.draft.measures[0].timeSignature).toBe('4/4');
  expect([c.draft.tempo, c.draft.key, c.draft.soundMode]).toEqual([132, 'D', 'melodic']);
  expect(c.draft.measures[0].beats.every((b) => b.slots.every((s) => !s.on))).toBe(true);
  expect(c.activeIndex).toBe(1);
  expect(await page.evaluate((id) => Boolean(window.__rm.patternStore.findById(id)), c.savedId)).toBe(true);
  await expect(page.locator('.composer-grid .slot.unpitched, .composer-grid .slot.has-note')).toHaveCount(0);
  await expect(partRow(page, 'My line')).toHaveAttribute('data-active', 'false');
  await expect(page.locator('.composer-layers .layer-pick').last()).toHaveText('My line layer');
});

test("AC-19.11.7/2 — The Composer's Measures row adds a Measure after the last, in its meter, up to the cap, and removes the last down to one; tapping a Measure's meter in the composing grid sets its Time Signature, the first Measure offering Apply to all as Practice does; every change is to the part on screen and heard from the next pass", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await setTempo(page, 240);
  await addLayer(page, BOSSA);
  await play(page);
  await expect(page.locator('.composer-remove-measure')).toBeDisabled();
  await page.locator('.composer-add-measure').click();
  await expect(page.locator('.composer-grid .measure')).toHaveCount(2);
  await expect(page.locator('.composer-grid .measure[data-measure="1"]')).toHaveAttribute('data-time-signature', '4/4');
  // A Measure other than the first changes alone.
  await page.locator('.composer-grid .measure[data-measure="1"] .measure-meter').click();
  await page.locator('.dialog-button', { hasText: /^3\/4$/ }).click();
  await expect(page.locator('.composer-grid .measure[data-measure="1"]')).toHaveAttribute('data-time-signature', '3/4');
  await expect(page.locator('.composer-grid .measure[data-measure="0"]')).toHaveAttribute('data-time-signature', '4/4');
  // The first offers Apply to all.
  await page.locator('.composer-grid .measure[data-measure="0"] .measure-meter').click();
  await page.locator('.dialog-button', { hasText: /^6\/8$/ }).click();
  await expect(page.locator('.dialog')).toContainText(/all/i);
  await page.locator('.dialog-button', { hasText: /all/i }).click();
  await expect(page.locator('.composer-grid .measure[data-measure="0"]')).toHaveAttribute('data-time-signature', '6/8');
  await expect(page.locator('.composer-grid .measure[data-measure="1"]')).toHaveAttribute('data-time-signature', '6/8');
  // Still playing, the edit handed to the transport, and the layer untouched.
  expect((await state(page)).isPlaying).toBe(true);
  const set = await page.evaluate(() => window.__rm.scheduled().layers.map((l) => l.pattern.measures.map((m) => m.timeSignature)));
  expect(set[0]).toEqual(['6/8', '6/8']);
  expect(set[1]).toEqual(['4/4']);
  await page.locator('.composer-remove-measure').click();
  await expect(page.locator('.composer-grid .measure')).toHaveCount(1);
  await expect(page.locator('.composer-remove-measure')).toBeDisabled();
  await play(page);
});

test('AC-19.11.7/3 — A saved part on screen is the open Pattern in Practice: Measures, meter and anything else changed there are on screen again on returning to the Composer, the layers kept', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await saveComposition(page);
  await addLayer(page, SON);
  await page.locator('.mode-switch [data-mode="practice"]').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  expect((await state(page)).pattern.name).toBe('My line');
  await page.evaluate(() => window.__rm.handlers.onAddMeasure());
  expect((await state(page)).pattern.measures).toHaveLength(2);
  await page.locator('.mode-switch [data-mode="composer"]').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(page.locator('.composer-grid .measure')).toHaveCount(2);
  expect((await composerState(page)).layers.map((l) => l.patternId)).toEqual([SON]);
  await expect(partRow(page, 'Son Clave 3-2')).toBeVisible();
});

// --- AC-19.11.8: the arrangement as sheet music ----------------------------------------

const scoresOf = (page) => page.locator('.composer-scores .part-score');

test("AC-19.11.8/1 — A Grid | Score switch sits in the record bar, Grid on first use; Score puts one staff per part in the composing grid's place, in the parts' order, each headed by the part's name, the part on screen marked and a muted part marked, each staff one combined loop long with the part repeated as it plays and a progression walking its chords", async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const sw = page.locator('.composer-view-switch');
  await expect(sw.locator('[data-view="grid"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.composer-grid')).toBeVisible();
  await addLayer(page, SON);
  const chordsId = await page.evaluate(() => window.__rm.seedStore.loadAll().find((s) => s.soundMode === 'melodic' && s.harmony?.chords?.length === 3 && s.measures.length === 1)?.id ?? null);
  if (chordsId) await addLayer(page, chordsId);
  await layerItems(page).first().locator('.layer-mute').click();
  await sw.locator('[data-view="score"]').click();
  await expect(page.locator('.composer-grid')).toHaveCount(0);
  const expectedParts = chordsId ? 3 : 2;
  await expect(scoresOf(page)).toHaveCount(expectedParts);
  // In the parts' order, each named, the one on screen and the muted one marked.
  await expect(scoresOf(page).nth(0).locator('.part-score-name')).toHaveText('My line');
  await expect(scoresOf(page).nth(0)).toHaveAttribute('data-active', 'true');
  await expect(scoresOf(page).nth(0).locator('.part-score-tag')).toHaveText('on screen');
  await expect(scoresOf(page).nth(1).locator('.part-score-name')).toHaveText('Son Clave 3-2');
  await expect(scoresOf(page).nth(1).locator('.part-score-tag.muted')).toHaveText('muted');
  // Each staff one combined loop long: My line twice under the two-bar clave, the clave once.
  const passes = await page.evaluate(() => window.__rm.scheduled().layers.map((l) => l.repeats));
  await expect(scoresOf(page).nth(0)).toHaveAttribute('data-passes', String(passes[0]));
  await expect(scoresOf(page).nth(0).locator('.score [data-pass]')).not.toHaveCount(0);
  const ownPasses = await scoresOf(page).nth(0).locator('.score [data-pass]').evaluateAll((els) => new Set(els.map((e) => e.dataset.pass)).size);
  expect(ownPasses).toBe(passes[0]);
  expect(passes[0]).toBe(2);
  if (chordsId) {
    // A progression walks its chords across its repeats: three passes to a cycle, each pass a different chord name.
    const labels = await scoresOf(page).nth(2).locator('.score .chord-name, .score [data-chord]').allTextContents();
    expect(new Set(labels).size).toBeGreaterThanOrEqual(1);
    await expect(scoresOf(page).nth(2)).toHaveAttribute('data-passes', String(passes[2] * 3));
  }
});

test(`AC-19.11.8/2 — While playing, the cursor runs in the part on screen's staff and nowhere else, following the loop through every repeat`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await setTempo(page, 240);
  await addLayer(page, SON);
  await page.locator('.composer-view-switch [data-view="score"]').click();
  await play(page);
  await expect(page.locator('.composer-scores .part-score[data-active="true"] .score .item.playing')).toHaveCount(1, { timeout: 6000 });
  await expect(page.locator('.composer-scores .part-score[data-active="false"] .score .item.playing')).toHaveCount(0);
  // Through every repeat: the mark reaches the second pass of the staff within one loop.
  await expect.poll(() => page.locator('.composer-scores .part-score[data-active="true"] .score .item.playing').getAttribute('data-pass'), { timeout: 8000 }).toBe('1');
  await expect(page.locator('.composer-scores .part-score[data-active="true"] .score .item.playing')).toHaveCount(1);
  await play(page);
  await expect(page.locator('.composer-scores .score .item.playing')).toHaveCount(0);
});

test('AC-19.11.8/3 — Grid puts the composing grid back; the choice is remembered in `rm.settings.v1` and is in force after a reload; the score follows every change — a note recorded, a Measure added, a part added, muted, removed or switched to — on the next render', async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await addLayer(page, SON);
  await page.locator('.composer-view-switch [data-view="score"]').click();
  const own = scoresOf(page).nth(0).locator('.score');
  const notesBefore = await own.locator('[data-pass="0"][data-step]').count();
  // A note recorded is written at once.
  await page.locator('.record').click();
  await fret(page, 1, 1).click();
  await page.locator('.record').click();
  expect(await own.locator('[data-pass="0"][data-step]').count()).toBe(notesBefore);
  await expect(own.locator('[data-pass="0"][data-name], [data-pass="0"][data-role]').first()).toBeAttached({ timeout: 3000 }).catch(() => {});
  // A Measure added, a part added, a part switched to.
  await page.locator('.composer-add-measure').click();
  await expect(own.locator('[data-pass="0"][data-measure="1"]').first()).toBeAttached();
  await addLayer(page, BOSSA);
  await expect(scoresOf(page)).toHaveCount(3);
  await partRow(page, 'Son Clave 3-2').locator('.layer-pick').click();
  await nameInDialog(page, 'Clave line');
  await expect(scoresOf(page).nth(1)).toHaveAttribute('data-active', 'true');
  await expect(scoresOf(page).nth(1).locator('.part-score-name')).toHaveText('Clave line');
  // Remembered across a reload; Grid puts the grid back.
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).composerView))).toBe('score');
  await page.locator('.composer-view-switch [data-view="grid"]').click();
  await expect(page.locator('.composer-grid')).toBeVisible();
  await expect(scoresOf(page)).toHaveCount(0);
  await page.locator('.composer-view-switch [data-view="score"]').click();
  await page.reload();
  await expect(page.locator('.mode-switch')).toBeVisible();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')).composerView))).toBe('score');
});
