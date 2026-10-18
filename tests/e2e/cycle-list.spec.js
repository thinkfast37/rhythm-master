/**
 * US-2.12 — Choose what a cycle steps through. Each cycle steps through its
 * whole catalogue (All) or a list the musician picks (My list), built in a
 * checklist; one list each for fills and progressions, app-wide. The pure
 * ordering is proved in tests/unit/core/harmony.test.js; these prove the
 * controls, the checklist, what is stored, and what the transport plays.
 */
import { test, expect } from '@playwright/test';
import { ARPEGGIOS, PROGRESSIONS, PROGRESSION_GROUPS } from '../../src/core/harmony.js';

test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
});

/** A blank owned Melodic 4/4 Pattern under I–IV–V, the arpeggio at None. */
async function harmonicBlank(page) {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await page.locator('.progression-picker').selectOption('I-IV-V');
  await page.locator('.arpeggio-picker').selectOption('none');
}

/** The same, with notes to sound and a fast tempo, so passes go by quickly. */
async function cyclingBlank(page) {
  await harmonicBlank(page);
  for (const s of [0, 1, 2]) {
    await page.locator(`.measure[data-measure="0"] .slot[data-beat="0"][data-slot="${s}"] .slot-accent`).click();
  }
  await page.evaluate(() => window.__rm.handlers.onTempo(300));
  await page.locator('.fill-cycle-repeats').fill('1');
  await page.locator('.fill-cycle-repeats').dispatchEvent('change');
}

/** Load a Pattern as if shipped — not owned — so an edit would go through the naming prompt. */
async function loadAsShipped(page) {
  await page.evaluate(() => {
    const p = structuredClone(window.__rm.getState().pattern);
    p.id = 'p_pretend_shipped';
    p.name = 'Pretend Shipped';
    p.measures[0].beats[3].slots[1] = { on: true, pitch: { degree: '5', octaveOffset: 0 } };
    window.__rm.loadPattern(p, { owned: false });
  });
}

const settings = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')));
const fillInForce = (page) => page.evaluate(() => window.__rm.fillInForce());
const progressionInForce = (page) => page.evaluate(() => window.__rm.progressionInForce());
const line = (page, kind) => page.locator(`[data-section="melody"] .cycle-from[data-kind="${kind}"]`);
const option = (page, kind, from) => line(page, kind).locator(`[data-action="cycle-from"][data-from="${from}"]`);
const checklist = (page) => page.locator('.cycle-list-view');
const tick = (page, id) => checklist(page).locator(`.cycle-list-item[data-id="${id}"] input`);

async function choose(page, kind) {
  await line(page, kind).locator('[data-action="choose-cycle-list"]').click();
  await expect(checklist(page)).toBeVisible();
}

/** Put `ids` on a cycle's list through the checklist, and close it. */
async function pick(page, kind, ids) {
  await choose(page, kind);
  for (const id of ids) await tick(page, id).check();
  await checklist(page).locator('[data-action="cycle-list-done"]').click();
  await expect(checklist(page)).toHaveCount(0);
}

/** Record every fill in force, in order, while the real transport runs for `ms`. */
async function watchFills(page, ms) {
  const seen = [];
  const started = Date.now();
  while (Date.now() - started < ms) {
    const id = await fillInForce(page);
    if (seen.at(-1) !== id) seen.push(id);
    await page.waitForTimeout(60);
  }
  return seen;
}

async function untilFill(page, id, timeout = 9000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if ((await fillInForce(page)) === id) return true;
    await page.waitForTimeout(60);
  }
  return false;
}

const fill = (i) => ARPEGGIOS[i].id;

// --- AC-2.12.1 — Each cycle steps through All or My list ---

test("AC-2.12.1/1 — Beside the cycle toggles, fills and progressions each have an All or My list choice and a Choose control, wherever Cycle fills and Cycle progressions are offered — the Melody group and Play melodies over it's practice panel alike", async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__rm.loadBlank('4/4'));
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  // No progression: no cycle toggles, and no choice either.
  await expect(page.locator('.cycle-from')).toHaveCount(0);

  await page.locator('.progression-picker').selectOption('I-IV-V');
  const group = page.locator('[data-section="melody"] .fill-cycle-block');
  await expect(group.locator('[data-action="toggle-fill-cycle"]')).toBeVisible();
  for (const kind of ['fills', 'progressions']) {
    const row = group.locator(`.cycle-from[data-kind="${kind}"]`);
    await expect(row).toBeVisible();
    await expect(row.locator('[data-action="cycle-from"][data-from="all"]')).toBeVisible();
    await expect(row.locator('[data-action="cycle-from"][data-from="list"]')).toBeVisible();
    await expect(row.locator('[data-action="choose-cycle-list"]')).toHaveText('Choose…');
  }
  await expect(line(page, 'fills').locator('.cycle-from-label')).toHaveText('Fills from');
  await expect(line(page, 'progressions').locator('.cycle-from-label')).toHaveText('Progressions from');

  // Play melodies over it: the practice panel's cycling row carries the same.
  await page.locator('[data-action="show-goals"]').click();
  await page.locator('.goal-card[data-goal="melody"]').click();
  await page.locator('.goal-bar [data-action="give-me-one"]').click();
  const panel = page.locator('.practice-panel');
  await expect(panel.locator('[data-action="toggle-fill-cycle"]')).toBeVisible();
  for (const kind of ['fills', 'progressions']) {
    const row = panel.locator(`.cycle-from[data-kind="${kind}"]`);
    await expect(row.locator('[data-action="cycle-from"]')).toHaveCount(2);
    await expect(row.locator('[data-action="choose-cycle-list"]')).toBeVisible();
  }
  // And it works there: the checklist opens from the panel.
  await panel.locator('.cycle-from[data-kind="fills"] [data-action="choose-cycle-list"]').click();
  await expect(checklist(page)).toBeVisible();
});

test('AC-2.12.1/2 — All is the default; My list names how many entries the list holds, and cannot be chosen while the list is empty', async ({ page }) => {
  await harmonicBlank(page);
  for (const [kind, total] of [['fills', ARPEGGIOS.length], ['progressions', PROGRESSIONS.length]]) {
    await expect(option(page, kind, 'all')).toHaveAttribute('aria-pressed', 'true');
    await expect(option(page, kind, 'all')).toHaveText(`All ${total}`);
    await expect(option(page, kind, 'list')).toHaveAttribute('aria-pressed', 'false');
    await expect(option(page, kind, 'list')).toHaveText('My list · empty');
    await expect(option(page, kind, 'list')).toBeDisabled();
  }
  // Pressing it anyway (bypassing the disabled button) changes nothing.
  await page.evaluate(() => window.__rm.handlers.onCycleFrom('fills', 'list'));
  expect((await settings(page)).fillCycleFrom).toBe('all');

  await pick(page, 'fills', [fill(3), fill(8)]);
  await expect(option(page, 'fills', 'list')).toHaveText('My list · 2');
  await expect(option(page, 'fills', 'list')).toBeEnabled();
  await option(page, 'fills', 'all').click();
  await expect(option(page, 'fills', 'all')).toHaveAttribute('aria-pressed', 'true');
  await expect(option(page, 'fills', 'list')).toHaveText('My list · 2');
  await option(page, 'fills', 'list').click();
  await expect(option(page, 'fills', 'list')).toHaveAttribute('aria-pressed', 'true');
  expect((await settings(page)).fillCycleFrom).toBe('list');
});

test('AC-2.12.1/3 — Both lists and both choices are app preferences — one fills list and one progressions list, the same on every Pattern — remembered across loads; neither is Pattern content, nothing auto-saves, and a shipped Pattern is never prompted for a name', async ({ page }) => {
  await harmonicBlank(page);
  const patternsBefore = await page.evaluate(() => localStorage.getItem('rm.patterns.v1'));
  await pick(page, 'fills', [fill(5)]);
  await pick(page, 'progressions', [PROGRESSIONS[2].id, PROGRESSIONS[40].id]);
  await option(page, 'progressions', 'all').click();

  const stored = await settings(page);
  expect(stored.fillCycleList).toEqual([fill(5)]);
  expect(stored.fillCycleFrom).toBe('list');
  expect(stored.progressionCycleList).toEqual([PROGRESSIONS[2].id, PROGRESSIONS[40].id]);
  expect(stored.progressionCycleFrom).toBe('all');
  // Not Pattern content: the Pattern store is exactly as it was, and the open Pattern carries none of it.
  expect(await page.evaluate(() => localStorage.getItem('rm.patterns.v1'))).toBe(patternsBefore);
  const json = await page.evaluate(() => JSON.stringify(window.__rm.getState().pattern));
  expect(json).not.toContain('CycleList');
  expect(await page.evaluate(() => 'arpeggio' in window.__rm.getState().pattern.harmony)).toBe(false);

  // Remembered across a reload, and the same on a different Pattern.
  await harmonicBlank(page);
  await expect(option(page, 'fills', 'list')).toHaveAttribute('aria-pressed', 'true');
  await expect(option(page, 'fills', 'list')).toHaveText('My list · 1');
  await expect(option(page, 'progressions', 'all')).toHaveAttribute('aria-pressed', 'true');
  await expect(option(page, 'progressions', 'list')).toHaveText('My list · 2');

  // A shipped Pattern: choosing and switching never asks for a name, and it stays unowned.
  await loadAsShipped(page);
  await option(page, 'progressions', 'list').click();
  await pick(page, 'fills', [fill(6)]);
  await expect(page.locator('.dialog-input')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rm.getState().isOwned)).toBe(false);
  expect((await settings(page)).fillCycleList).toEqual([fill(5), fill(6)]);
});

// --- AC-2.12.2 — Choose builds the list from a checklist of the catalogue ---

test("AC-2.12.2/1 — The checklist holds every entry of its catalogue under the picker's own group headings and in the picker's order, each with a tick that puts it on the list or takes it off at once, and says how many of how many are on the list", async ({ page }) => {
  await harmonicBlank(page);
  await choose(page, 'fills');
  const groups = await checklist(page).locator('.cycle-list-group-label').allTextContents();
  expect(groups).toEqual([...new Set(ARPEGGIOS.map((a) => a.group))]);
  const pickerGroups = await page.locator('.arpeggio-picker optgroup').evaluateAll((gs) => gs.map((g) => g.label));
  expect(groups).toEqual(pickerGroups);
  expect(await checklist(page).locator('.cycle-list-item').evaluateAll((li) => li.map((n) => n.dataset.id))).toEqual(
    ARPEGGIOS.map((a) => a.id)
  );
  await expect(checklist(page).locator('.cycle-list-count')).toHaveText(`0 of ${ARPEGGIOS.length} on your list`);

  // A tick applies at once, before Done.
  await tick(page, fill(10)).check();
  expect((await settings(page)).fillCycleList).toEqual([fill(10)]);
  await expect(checklist(page).locator('.cycle-list-count')).toHaveText(`1 of ${ARPEGGIOS.length} on your list`);
  await tick(page, fill(1)).check();
  // Held in the catalogue's order, not the order ticked.
  expect((await settings(page)).fillCycleList).toEqual([fill(1), fill(10)]);
  await tick(page, fill(10)).uncheck();
  expect((await settings(page)).fillCycleList).toEqual([fill(1)]);
  await expect(checklist(page).locator('.cycle-list-count')).toHaveText(`1 of ${ARPEGGIOS.length} on your list`);
  await checklist(page).locator('[data-action="cycle-list-done"]').click();

  // Progressions: the picker's nine headings, every entry in its order.
  await choose(page, 'progressions');
  expect(await checklist(page).locator('.cycle-list-group-label').allTextContents()).toEqual(PROGRESSION_GROUPS.map((g) => g.label));
  const ids = await checklist(page).locator('.cycle-list-item').evaluateAll((li) => li.map((n) => n.dataset.id));
  const pickerOrder = await page.locator('.progression-picker optgroup option').evaluateAll((os) => os.map((o) => o.value));
  expect(ids).toEqual(pickerOrder);
  expect(ids).toHaveLength(PROGRESSIONS.length);
  await expect(checklist(page).locator('.cycle-list-count')).toHaveText(`0 of ${PROGRESSIONS.length} on your list`);
});

test('AC-2.12.2/2 — Each group heading has All and None, which put every entry of that group on the list or take them all off', async ({ page }) => {
  await harmonicBlank(page);
  await choose(page, 'fills');
  const drones = ARPEGGIOS.filter((a) => a.group === 'Drones').map((a) => a.id);
  await tick(page, fill(0)).check();
  const head = checklist(page).locator('.cycle-list-group[data-group="Drones"] .cycle-list-group-head');
  await head.locator('[data-action="group-all"]').click();
  expect((await settings(page)).fillCycleList).toEqual([fill(0), ...drones]);
  await expect(head.locator('.cycle-list-group-count')).toHaveText(`${drones.length} of ${drones.length}`);
  for (const id of drones) await expect(tick(page, id)).toBeChecked();

  await head.locator('[data-action="group-none"]').click();
  // That group's entries alone come off; the rest of the list stays.
  expect((await settings(page)).fillCycleList).toEqual([fill(0)]);
  await expect(head.locator('.cycle-list-group-count')).toHaveText(`0 of ${drones.length}`);
  await expect(tick(page, fill(0))).toBeChecked();
});

test('AC-2.12.2/3 — The progressions checklist has a search that shows only the entries whose name, or a song credited to them, contains the text typed; entries the search hides keep their ticks', async ({ page }) => {
  const { heardIn } = await import('../../src/core/songbook.js');
  await harmonicBlank(page);
  // The fills checklist has no search; the progressions one does.
  await choose(page, 'fills');
  await expect(checklist(page).locator('.cycle-list-search')).toHaveCount(0);
  await checklist(page).locator('[data-action="cycle-list-done"]').click();
  await choose(page, 'progressions');
  const search = checklist(page).locator('.cycle-list-search');
  await expect(search).toBeVisible();

  const shown = () =>
    checklist(page).locator('.cycle-list-item:not([hidden])').evaluateAll((li) => li.map((n) => n.dataset.id));

  // By song: every entry credited with a song whose title holds "creep", and nothing else.
  await search.fill('creep');
  const bySong = PROGRESSIONS.filter((p) =>
    [p.label, ...heardIn(p.id).flatMap(({ artist, songs }) => [artist, ...songs.map((s) => s.title)])]
      .join(' ')
      .toLowerCase()
      .includes('creep')
  ).map((p) => p.id);
  expect(bySong.length).toBeGreaterThan(0);
  expect(await shown()).toEqual(bySong);
  // A group with nothing to show is hidden whole.
  await expect(checklist(page).locator('.cycle-list-group[data-group="Blues"]')).toBeHidden();

  // By name.
  await search.fill('ii–v–i');
  const byName = PROGRESSIONS.filter((p) => p.label.toLowerCase().includes('ii–v–i')).map((p) => p.id);
  expect(byName.length).toBeGreaterThan(0);
  expect(await shown()).toEqual(expect.arrayContaining(byName));

  // A tick survives being hidden by the search.
  await search.fill('creep');
  await tick(page, bySong[0]).check();
  await search.fill('blues');
  await expect(checklist(page).locator(`.cycle-list-item[data-id="${bySong[0]}"]`)).toBeHidden();
  expect((await settings(page)).progressionCycleList).toEqual([bySong[0]]);
  await search.fill('');
  expect(await shown()).toHaveLength(PROGRESSIONS.length);
  await expect(tick(page, bySong[0])).toBeChecked();
});

test('AC-2.12.2/4 — Ticking the first entry onto an empty list switches that cycle to My list, and taking the last one off switches it back to All', async ({ page }) => {
  await harmonicBlank(page);
  await choose(page, 'progressions');
  await tick(page, PROGRESSIONS[3].id).check();
  expect((await settings(page)).progressionCycleFrom).toBe('list');
  await tick(page, PROGRESSIONS[7].id).check();
  await tick(page, PROGRESSIONS[3].id).uncheck();
  expect((await settings(page)).progressionCycleFrom).toBe('list');
  await tick(page, PROGRESSIONS[7].id).uncheck();
  expect((await settings(page)).progressionCycleFrom).toBe('all');
  await checklist(page).locator('[data-action="cycle-list-done"]').click();
  await expect(option(page, 'progressions', 'all')).toHaveAttribute('aria-pressed', 'true');
  await expect(option(page, 'progressions', 'list')).toBeDisabled();

  // With the list kept but All chosen, adding to it leaves All chosen.
  await pick(page, 'fills', [fill(2)]);
  await option(page, 'fills', 'all').click();
  await pick(page, 'fills', [fill(4)]);
  expect((await settings(page)).fillCycleFrom).toBe('all');
  await expect(option(page, 'fills', 'list')).toHaveText('My list · 2');
});

test('AC-2.12.2/5 — Done closes the checklist with the list as ticked, and the cycle controls show the new count', async ({ page }) => {
  await harmonicBlank(page);
  await choose(page, 'fills');
  await tick(page, fill(2)).check();
  await tick(page, fill(9)).check();
  await tick(page, fill(20)).check();
  await tick(page, fill(9)).uncheck();
  await checklist(page).locator('[data-action="cycle-list-done"]').click();
  await expect(checklist(page)).toHaveCount(0);
  await expect(option(page, 'fills', 'list')).toHaveText('My list · 2');
  await expect(option(page, 'fills', 'list')).toHaveAttribute('aria-pressed', 'true');
  expect((await settings(page)).fillCycleList).toEqual([fill(2), fill(20)]);
  // Opened again, it shows the list as left.
  await choose(page, 'fills');
  await expect(tick(page, fill(2))).toBeChecked();
  await expect(tick(page, fill(9))).not.toBeChecked();
  await expect(tick(page, fill(20))).toBeChecked();
  // Escape closes it too, changing nothing.
  await page.keyboard.press('Escape');
  await expect(checklist(page)).toHaveCount(0);
  expect((await settings(page)).fillCycleList).toEqual([fill(2), fill(20)]);
});

// --- AC-2.12.3 — A cycle on My list steps through the list alone ---

test("AC-2.12.3/1 — Under My list the cycle steps through the listed entries alone, in the catalogue's order whatever order they were ticked in, wrapping from the last listed to the first; with one entry listed, that one stays in force", async ({ page }) => {
  await cyclingBlank(page);
  // Ticked out of order.
  await pick(page, 'fills', [fill(6), fill(2)]);
  await page.locator('.fill-cycle').click();
  expect(await fillInForce(page)).toBe(fill(2));
  await page.locator('[data-action="play"]').click();
  const seen = await watchFills(page, 8500);
  await page.locator('[data-action="stop"]').click();
  // Only the two listed fills, alternating in catalogue order, wrapping.
  expect(seen.length).toBeGreaterThanOrEqual(3);
  expect(seen.slice(0, 3)).toEqual([fill(2), fill(6), fill(2)]);
  expect(new Set(seen)).toEqual(new Set([fill(2), fill(6)]));
  // The picker followed the fill in force.
  await expect(page.locator('.arpeggio-picker')).toHaveValue(await fillInForce(page));

  // One entry listed: it stays in force.
  await choose(page, 'fills');
  await tick(page, fill(6)).uncheck();
  await checklist(page).locator('[data-action="cycle-list-done"]').click();
  await page.locator('.fill-cycle').click();
  await page.locator('.fill-cycle').click();
  await page.locator('[data-action="play"]').click();
  const single = await watchFills(page, 5500);
  await page.locator('[data-action="stop"]').click();
  expect(single).toEqual([fill(2)]);
});

test("AC-2.12.3/2 — Turning a cycle on, or the second Stop, begins it from the Pattern's own fill or progression when that is listed, and otherwise from the first listed entry after it in the catalogue's order, wrapping round", async ({ page }) => {
  await cyclingBlank(page);
  const alberti = ARPEGGIOS.findIndex((a) => a.id === 'alberti');
  await page.locator('.arpeggio-picker').selectOption('alberti');
  // The Pattern's own (Alberti) is not listed: the first listed after it.
  await pick(page, 'fills', [fill(alberti - 1), fill(alberti + 3)]);
  await page.locator('.fill-cycle').click();
  expect(await fillInForce(page)).toBe(fill(alberti + 3));
  // Listed: it begins from the Pattern's own.
  await choose(page, 'fills');
  await tick(page, 'alberti').check();
  await checklist(page).locator('[data-action="cycle-list-done"]').click();
  await page.locator('.fill-cycle').click();
  await page.locator('.fill-cycle').click();
  expect(await fillInForce(page)).toBe('alberti');

  // Progressions: I–IV–V is the first entry; with a later one listed alone, that one.
  await pick(page, 'progressions', [PROGRESSIONS[30].id]);
  await page.locator('.progression-cycle').click();
  expect(await progressionInForce(page)).toBe(PROGRESSIONS[30].id);
  // Listed only before the Pattern's own: it wraps round to it.
  await page.locator('.progression-cycle').click();
  await page.locator('.progression-picker').selectOption(PROGRESSIONS[50].id);
  await page.locator('.arpeggio-picker').selectOption('alberti');
  await page.locator('.progression-cycle').click();
  expect(await progressionInForce(page)).toBe(PROGRESSIONS[30].id);

  // The second Stop begins the cycle again from the same place.
  await page.locator('[data-action="play"]').click();
  expect(await untilFill(page, fill(alberti + 3))).toBe(true);
  await page.locator('[data-action="stop"]').click();
  expect(await fillInForce(page)).toBe(fill(alberti + 3));
  await page.locator('.main-top-bar [data-action="reset-cycle"]').click();
  expect(await fillInForce(page)).toBe('alberti');
  expect(await progressionInForce(page)).toBe(PROGRESSIONS[30].id);
});

test('AC-2.12.3/3 — A fill or progression chosen by hand in the picker while cycling is where the cycle begins again, listed or not; after its repeats the cycle moves on to the first listed entry after it', async ({ page }) => {
  await cyclingBlank(page);
  await pick(page, 'fills', [fill(3), fill(12)]);
  await page.locator('.fill-cycle').click();
  await page.locator('[data-action="play"]').click();
  // Chosen by hand while playing, not on the list: it is in force…
  await page.locator('.arpeggio-picker').selectOption(fill(7));
  expect(await fillInForce(page)).toBe(fill(7));
  // …then the first listed after it, then round the list.
  const seen = await watchFills(page, 6500);
  await page.locator('[data-action="stop"]').click();
  expect(seen.slice(0, 3)).toEqual([fill(7), fill(12), fill(3)]);
});

test('AC-2.12.3/4 — Changing the list, or switching between All and My list, while playing applies without a restart: the entry in force keeps its place and plays its repeats from the pass it is on before the cycle moves on through what it now steps through', async ({ page }) => {
  await cyclingBlank(page);
  await page.locator('.fill-cycle').click();
  await page.locator('[data-action="play"]').click();
  expect(await untilFill(page, fill(1))).toBe(true);
  const loopBefore = await page.evaluate(() => window.__rm.getState().loop);

  // A list that does not hold the fill in force: it keeps its place…
  await pick(page, 'fills', [fill(10), fill(20)]);
  expect(await fillInForce(page)).toBe(fill(1));
  const after = await page.evaluate(() => ({ loop: window.__rm.getState().loop, playing: window.__rm.getState().isPlaying }));
  // …without a restart: still playing, and the loop counter did not go back.
  expect(after.playing).toBe(true);
  expect(after.loop).toBeGreaterThanOrEqual(loopBefore);
  // …then moves on through the list.
  const seen = await watchFills(page, 7000);
  expect(seen[0]).toBe(fill(1));
  expect(seen.slice(1, 3)).toEqual([fill(10), fill(20)]);

  // Back to All while playing: the fill in force keeps its place, then the catalogue's next.
  const inForce = await fillInForce(page);
  await option(page, 'fills', 'all').click();
  expect(await fillInForce(page)).toBe(inForce);
  const next = ARPEGGIOS[(ARPEGGIOS.findIndex((a) => a.id === inForce) + 1) % ARPEGGIOS.length].id;
  expect(await untilFill(page, next)).toBe(true);
  expect(await page.evaluate(() => window.__rm.getState().isPlaying)).toBe(true);
  await page.locator('[data-action="stop"]').click();
});

test('AC-2.12.3/5 — What is rendered for the screen off is the whole cycle of the list: a cycle on My list repeats after as many entries as the list holds', async ({ page }) => {
  await cyclingBlank(page);
  // I–IV–V changing every pass is three passes a harmonic cycle; Repeats is 1.
  await pick(page, 'fills', [fill(2), fill(6)]);
  await page.locator('.fill-cycle').click();
  await page.locator('[data-action="play"]').click();
  await expect.poll(() => page.evaluate(() => window.__rm.rendered()?.passes ?? null), { timeout: 8000 }).toBe(2 * 3);
  expect(await page.evaluate(() => window.__rm.rendered().whole)).toBe(true);

  // A third on the list: three entries' worth.
  await pick(page, 'fills', [fill(9)]);
  await expect.poll(() => page.evaluate(() => window.__rm.rendered()?.passes ?? null), { timeout: 8000 }).toBe(3 * 3);

  // Progressions on My list too: two entries for one harmonic cycle each, and
  // each turns its own chords over by the pass — three and four of them — so
  // the run repeats at lcm(fills 3 × 3, progressions 2 × 3, 3, 4) = 36.
  expect([PROGRESSIONS[0].steps.length, PROGRESSIONS[1].steps.length]).toEqual([3, 4]);
  await pick(page, 'progressions', [PROGRESSIONS[0].id, PROGRESSIONS[1].id]);
  await page.locator('.progression-cycle').click();
  await expect.poll(() => page.evaluate(() => window.__rm.rendered()?.passes ?? null), { timeout: 8000 }).toBe(36);
  await page.locator('[data-action="stop"]').click();
});
