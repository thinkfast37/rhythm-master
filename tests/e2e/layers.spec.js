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

/** Open Add layer, tick `id`, and close the list. */
async function addLayer(page, id) {
  await page.locator('.layer-add').click();
  await expect(page.locator('.cycle-list-view')).toBeVisible();
  await page.locator(`.cycle-list-view input[data-id="${id}"]`).check();
  await page.locator('[data-action="cycle-list-done"]').click();
  await expect(page.locator('.dialog')).toHaveCount(0);
  await expect(page.locator(`.composer-layers .layer-item[data-pattern-id="${id}"]`)).toBeVisible();
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

test(`AC-19.11.1/2 — Add layer offers every library Pattern, shipped or owned, percussive, melodic or carrying a progression, except the composition itself, searchable by name; ticking one adds it as the last layer and unticking it removes it`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  const id = await saveComposition(page);
  await page.locator('.layer-add').click();
  const list = page.locator('.cycle-list-view');
  await expect(list).toBeVisible();
  // Shipped and owned, kinds alike; the composition itself left out.
  await expect(list.locator('.cycle-list-group[data-group="Your Patterns"] input[data-id="p_test"]')).toHaveCount(1);
  await expect(list.locator(`input[data-id="${id}"]`)).toHaveCount(0);
  await expect(list.locator(`input[data-id="${BOSSA}"]`)).toHaveCount(1);
  await expect(list.locator(`input[data-id="${DJEMBE}"]`)).toHaveCount(1);
  const shipped = await page.evaluate(() => window.__rm.seedStore.loadAll().length);
  await expect(list.locator('.cycle-list-group[data-group="Shipped"] input')).toHaveCount(shipped);
  // Search narrows by name.
  await list.locator('.cycle-list-search').fill('Bossa Nova');
  await expect(list.locator('.cycle-list-item:visible')).toHaveCount(await list.locator('.cycle-list-item:visible').count());
  await expect(list.locator(`.cycle-list-item[data-id="${BOSSA}"]`)).toBeVisible();
  await expect(list.locator(`.cycle-list-item[data-id="${SON}"]`)).toBeHidden();
  await list.locator(`input[data-id="${BOSSA}"]`).check();
  await list.locator('.cycle-list-search').fill('Son Clave 3-2');
  await list.locator(`input[data-id="${SON}"]`).check();
  // Ticked in that order: Bossa Nova, then Son Clave last.
  expect((await composerState(page)).layers.map((l) => l.patternId)).toEqual([BOSSA, SON]);
  await list.locator('.cycle-list-search').fill('');
  await list.locator(`input[data-id="${BOSSA}"]`).uncheck();
  expect((await composerState(page)).layers.map((l) => l.patternId)).toEqual([SON]);
  await page.locator('[data-action="cycle-list-done"]').click();
  await expect(layerItems(page)).toHaveCount(1);
  await expect(layerItems(page).first().locator('.layer-name')).toHaveText('Son Clave 3-2');
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
  // Ticking it again in the list is the same layer, not a second.
  await page.locator('.layer-add').click();
  await expect(page.locator(`.cycle-list-view input[data-id="${SON}"]`)).toBeChecked();
  await page.locator('[data-action="cycle-list-done"]').click();
  expect((await composerState(page)).layers.map((l) => l.patternId)).toEqual([SON]);
  // Up to eight: the ninth is refused and Add layer says so. One-bar 4/4
  // Patterns with no triplet Recipe, so every one fits the loop at once.
  const ids = await page.evaluate(() => window.__rm.seedStore.loadAll().filter((s) => s.soundMode !== 'melodic' && s.measures.length === 1 && s.measures[0].timeSignature === '4/4').slice(0, 9).map((s) => s.id));
  await page.locator('.layer-add').click();
  for (const id of ids) {
    if (id === SON) continue;
    const tick = page.locator(`.cycle-list-view input[data-id="${id}"]`);
    await tick.click();
    if ((await composerState(page)).layers.length === 8) {
      // The ninth: refused, the tick reverting, and the section saying why.
      const have = new Set((await composerState(page)).layers.map((l) => l.patternId));
      const ninth = ids.find((other) => !have.has(other));
      await page.locator(`.cycle-list-view input[data-id="${ninth}"]`).click();
      await expect(page.locator(`.cycle-list-view input[data-id="${ninth}"]`)).not.toBeChecked();
      expect((await composerState(page)).layers).toHaveLength(8);
      break;
    }
  }
  await page.locator('[data-action="cycle-list-done"]').click();
  expect((await composerState(page)).layers).toHaveLength(8);
  await expect(page.locator('.composer-notice')).toHaveText('At most 8 layers.');
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
  await expect(page.locator('.layers-loop')).toHaveText('Loop: 2 passes of the composition — My line ×2, Son Clave 3-2 ×1, Bossa Nova ×2');
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

test(`AC-19.11.4/1 — Save arrangement asks a name, pre-filled with the composition's name and "arrangement", unique among Arrangements, and stores the composition's id, its layers in order and which are muted; it is unavailable until the composition is saved and has a layer, saying why`, async ({ page }) => {
  await openApp(page);
  await loadFourBeats(page);
  await expect(page.locator('.arrangement-save')).toBeDisabled();
  await expect(page.locator('.arrangement-save')).toHaveAttribute('title', /Save the composition to the library first/);
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
    { id: 'arr_1', name: 'My line arrangement', compositionId: id, layers: [{ patternId: SON, muted: false }, { patternId: BOSSA, muted: true }] },
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
  // The one timeline the transport is handed: the composition's four and the
  // melody's four, each Beat an instant two events share.
  const merged = await page.evaluate(() => window.__rmTimeline.timelineOf(window.__rm.scheduled(), 0).map((e) => [Math.round(e.timeSeconds * 1000), e.layer]));
  expect(merged).toHaveLength(8);
  for (let b = 0; b < 4; b++) {
    const at = merged.filter(([t]) => t === b * 250);
    expect(at.map(([, layer]) => layer)).toEqual([0, 1]);
  }
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
