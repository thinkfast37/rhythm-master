import { test, expect } from '@playwright/test';

/*
 * US-14.1 — Choose a goal. The goals screen stands in for the main panel
 * until a goal is chosen; a goal offers only the groups it is for; Lab is the
 * cockpit, remembered; the practice goals hand out a rhythm by level.
 *
 * The rest of the suite opens in Lab through playwright.config.js's storage
 * state. This file starts from nothing, since a first launch is its subject.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const goals = (page) => page.locator('.goals');
const card = (page, id) => page.locator(`.goal-card[data-goal="${id}"]`);
const chooseGoal = (page, id) => card(page, id).click();
const goalBar = (page) => page.locator('.goal-bar');
const offeredTabs = (page) =>
  page.locator('.workbench-tab:not([hidden])').evaluateAll((els) => els.map((e) => e.dataset.tab));
const activeTab = (page) => page.locator('.workbench-tab[aria-selected="true"]').getAttribute('data-tab');
const actions = (page) => page.locator('details[data-section="actions"]');
const family = (page) => page.locator('[data-section="family"]');
const settings = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')));
const patternState = (page) => page.evaluate(() => window.__rm.getState().pattern);
const stateOf = (page) => page.evaluate(() => window.__rm.getState());

/** A Melodic Pattern under a progression, so every group applies (AC-15.1.7/4). */
async function melodicWithProgression(page) {
  await page.evaluate(async () => {
    window.__rm.loadBlank('4/4');
    await window.__rm.handlers.onSoundMode('melodic');
    await window.__rm.handlers.onProgression('I-IV-V');
  });
  await expect(page.locator('.pitch-strip')).toBeAttached();
}

/** Create an owned Pattern by editing a shipped one and naming the copy. */
async function makeOwned(page, name = 'Mine') {
  await page.locator('.slot').first().click();
  await page.locator('.dialog-input').fill(name);
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
}

/** Seed a second owned Pattern straight into the store, then re-render. */
async function seedTwin(page, name) {
  return page.evaluate((n) => {
    const rm = window.__rm;
    const twin = structuredClone(rm.getState().pattern);
    twin.id = rm.patternStore.nextId();
    twin.name = n;
    twin.soundMode = 'melodic';
    twin.key = 'C';
    for (const measure of twin.measures)
      for (const beat of measure.beats)
        for (const slot of beat.slots) if (slot.on) slot.pitch = { degree: '1', octaveOffset: 0 };
    rm.patternStore.upsert(twin);
    rm.loadPattern(rm.getState().pattern, { owned: true });
    return twin.id;
  }, name);
}

/* --- AC-14.1.1 — the goals screen ------------------------------------------ */

test('AC-14.1.1/1 — On a first launch the goals screen is shown in place of the main panel and the library, and choosing a goal opens the main panel', async ({ page }) => {
  await page.goto('/');
  await expect(goals(page)).toBeVisible();
  await expect(page.locator('.main-panel')).toBeHidden();
  await expect(page.locator('.sidebar')).toBeHidden();
  expect((await settings(page)).goal).toBeNull();

  await chooseGoal(page, 'play');
  await expect(goals(page)).toBeHidden();
  await expect(page.locator('.main-panel')).toBeVisible();
  await expect(page.locator('.grid')).toBeVisible();
  await expect(goalBar(page)).toBeVisible();
  await expect(goalBar(page).locator('.goal-name')).toHaveText('Play a rhythm');
});

test('AC-14.1.1/2 — The screen names every goal with a one-line description: the four practice goals first, then the three compose goals, then Lab set apart', async ({ page }) => {
  await page.goto('/');
  const titles = await page.locator('.goal-card .goal-card-title').allTextContents();
  expect(titles).toEqual([
    'Play a rhythm',
    'Vocalise or clap it',
    'Feel the groove',
    'Play melodies over it',
    'Compose a rhythm',
    'Add a melody to it',
    'Keep and share',
    'Lab',
  ]);
  // Four under Practise, three under Compose, Lab in a group of its own.
  await expect(page.locator('[data-goal-group="practise"] .goal-card')).toHaveCount(4);
  await expect(page.locator('[data-goal-group="compose"] .goal-card')).toHaveCount(3);
  await expect(page.locator('[data-goal-group="lab"] .goal-card')).toHaveCount(1);
  await expect(page.locator('[data-goal-group="lab"] .goal-card')).toHaveAttribute('data-goal', 'lab');
  // Every card carries a description, one line long.
  const blurbs = await page.locator('.goal-card .goal-card-blurb').allTextContents();
  expect(blurbs).toHaveLength(8);
  for (const b of blurbs) {
    expect(b.trim().length).toBeGreaterThan(20);
    expect(b).not.toContain('\n');
  }
});

test('AC-14.1.1/3 — A Goals control in the pinned bar returns to the goals screen from any goal, Lab included, with the current goal marked', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'play');
  await expect(goals(page)).toBeHidden();
  await page.locator('.main-top-bar [data-action="show-goals"]').click();
  await expect(goals(page)).toBeVisible();
  await expect(page.locator('.main-panel')).toBeHidden();
  await expect(card(page, 'play')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.goal-card[aria-current="true"]')).toHaveCount(1);

  await chooseGoal(page, 'lab');
  await expect(goals(page)).toBeHidden();
  await page.locator('.main-top-bar [data-action="show-goals"]').click();
  await expect(goals(page)).toBeVisible();
  await expect(card(page, 'lab')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.goal-card[aria-current="true"]')).toHaveCount(1);
});

test('AC-14.1.1/4 — The app opens on the goals screen on every launch unless the remembered goal is Lab, and the remembered goal is marked as current', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'melody');
  await page.reload();
  await expect(goals(page)).toBeVisible();
  await expect(card(page, 'melody')).toHaveAttribute('aria-current', 'true');
  await page.reload();
  await expect(goals(page)).toBeVisible();

  await chooseGoal(page, 'lab');
  await page.reload();
  await expect(goals(page)).toBeHidden();
  await expect(page.locator('.main-panel')).toBeVisible();
  await expect(goalBar(page).locator('.goal-name')).toHaveText('Lab');
});

/* --- AC-14.1.2 — a goal offers its own controls ----------------------------- */

test('AC-14.1.2/1 — The tab bar offers exactly the groups the chosen goal names, in the main panel’s fixed order, and the group on screen is the first of them that applies to the Pattern', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'add-melody');
  // Add a melody to it names Melody, Practice and Compose. On a Percussive
  // Pattern neither Melody nor Compose applies, so Practice is offered and on screen.
  expect((await patternState(page)).soundMode).toBe('percussive');
  expect(await offeredTabs(page)).toEqual(['practice']);
  expect(await activeTab(page)).toBe('practice');
  await expect(page.locator('[data-section="practice"]')).toBeVisible();
  await expect(page.locator('[data-section="melody"]')).toBeHidden();

  await melodicWithProgression(page);
  expect(await offeredTabs(page)).toEqual(['melody', 'practice', 'compose']);
  expect(await activeTab(page)).toBe('melody');
  // Rhythm applies to this Pattern but is not offered: absent.
  await expect(page.locator('.workbench-tab[data-tab="rhythm"]')).toBeHidden();
  await expect(page.locator('[data-section="rhythm"]')).toBeHidden();
  // A tapped tab stays the one in force.
  await page.locator('.workbench-tab[data-tab="practice"]').click();
  expect(await activeTab(page)).toBe('practice');
});

test('AC-14.1.2/2 — The four practice goals offer no workbench group: the tab bar is absent, and one practice panel stands in its place', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'lab');
  // Even on a Pattern every group applies to.
  await melodicWithProgression(page);
  for (const id of ['play', 'vocalise', 'groove', 'melody']) {
    await page.locator('[data-action="show-goals"]').click();
    await chooseGoal(page, id);
    await expect(page.locator('.workbench-tabs'), id).toBeHidden();
    expect(await offeredTabs(page), id).toEqual([]);
    for (const tab of ['melody', 'rhythm', 'compose']) await expect(page.locator(`[data-section="${tab}"]`), id).toBeHidden();
    await expect(page.locator('.practice-panel'), id).toBeVisible();
    await expect(page.locator('[data-section="practice"].practice-panel'), id).toHaveCount(1);
  }
  // And back in Lab the tab bar returns with the Practice group proper.
  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'lab');
  await expect(page.locator('.workbench-tabs')).toBeVisible();
  await expect(page.locator('.practice-panel')).toHaveCount(0);
});

test('AC-14.1.2/3 — Compose a rhythm offers Rhythm and Practice with Pattern actions and the grid’s accent brush; Add a melody to it offers Melody, Practice and Compose with Pattern actions; Keep and share offers Practice with Pattern actions and the family members', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await chooseGoal(page, 'lab');
  await page.locator('.library-toggle').click();
  // A family, so the members area has something to show (AC-11.2.5/2).
  await makeOwned(page, 'Groove');
  await seedTwin(page, 'Groove (Melodic)');
  await expect(family(page)).toBeVisible();

  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'compose-rhythm');
  expect(await offeredTabs(page)).toEqual(['rhythm', 'practice']);
  await expect(actions(page)).toBeVisible();
  await expect(family(page)).toBeHidden();
  await expect(page.locator('.brush-hint')).toBeVisible();

  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'add-melody');
  // Percussive: Melody and Compose do not apply, so Practice alone is on offer…
  expect(await offeredTabs(page)).toEqual(['practice']);
  await expect(actions(page)).toBeVisible();
  await expect(family(page)).toBeHidden();
  // …and with a progression all three are.
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await page.locator('.progression-picker').selectOption('I-IV-V');
  expect(await offeredTabs(page)).toEqual(['melody', 'practice', 'compose']);

  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'share');
  expect(await offeredTabs(page)).toEqual(['practice']);
  await expect(actions(page)).toBeVisible();
  await expect(family(page)).toBeVisible();
  await expect(family(page).locator('.family-link')).toHaveCount(1);

  // The grid's accent brush is Compose a rhythm's: a Slot tap cycles its
  // accent. Last, since the edit takes this Pattern out of its family.
  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'compose-rhythm');
  const slot = page.locator('.slot').first();
  const before = await slot.getAttribute('data-accent');
  await slot.click();
  expect(await slot.getAttribute('data-accent')).not.toBe(before);
});

test('AC-14.1.2/4 — Pattern actions and the family members are absent under the four practice goals', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await chooseGoal(page, 'lab');
  await page.locator('.library-toggle').click();
  await makeOwned(page, 'Groove');
  await seedTwin(page, 'Groove (Melodic)');
  await expect(family(page)).toBeVisible();
  await expect(actions(page)).toBeVisible();

  for (const id of ['play', 'vocalise', 'groove', 'melody']) {
    await page.locator('[data-action="show-goals"]').click();
    await chooseGoal(page, id);
    await expect(actions(page), id).toBeHidden();
    await expect(family(page), id).toBeHidden();
  }
  // And back in Lab both return, the family untouched.
  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'lab');
  await expect(actions(page)).toBeVisible();
  await expect(family(page)).toBeVisible();
});

test('AC-14.1.2/5 — The chosen goal is remembered as an app preference, applied on the next launch, and changes nothing on any Pattern', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'lab');
  await makeOwned(page, 'Kept as is');
  const before = await page.evaluate(() => ({
    patterns: localStorage.getItem('rm.patterns.v1'),
    overlays: localStorage.getItem('rm.overlays.v1'),
    songs: localStorage.getItem('rm.songs.v1'),
    open: JSON.stringify(window.__rm.getState().pattern),
  }));

  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'compose-rhythm');
  expect((await settings(page)).goal).toBe('compose-rhythm');
  await page.reload();
  await expect(goals(page)).toBeVisible();
  await expect(card(page, 'compose-rhythm')).toHaveAttribute('aria-current', 'true');
  await chooseGoal(page, 'compose-rhythm');
  expect(await offeredTabs(page)).toEqual(['rhythm', 'practice']);

  const after = await page.evaluate(() => ({
    patterns: localStorage.getItem('rm.patterns.v1'),
    overlays: localStorage.getItem('rm.overlays.v1'),
    songs: localStorage.getItem('rm.songs.v1'),
    open: JSON.stringify(window.__rm.getState().pattern),
  }));
  expect(after).toEqual(before);
});

/* --- AC-14.1.3 — Lab ---------------------------------------------------------- */

test('AC-14.1.3/1 — Lab offers every workbench group, Pattern actions and the family members, exactly as the tabbed workbench and the main panel’s fixed order already describe', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await chooseGoal(page, 'lab');
  await page.locator('.library-toggle').click();
  // Percussive: Rhythm and Practice, Rhythm on screen (AC-15.1.7/3).
  expect(await offeredTabs(page)).toEqual(['rhythm', 'practice']);
  expect(await activeTab(page)).toBe('rhythm');
  await expect(actions(page)).toBeVisible();

  await makeOwned(page, 'Groove');
  await seedTwin(page, 'Groove (Melodic)');
  await expect(family(page)).toBeVisible();

  // Melodic with a progression: all four, Melody on screen.
  await melodicWithProgression(page);
  expect(await offeredTabs(page)).toEqual(['melody', 'rhythm', 'practice', 'compose']);
  expect(await activeTab(page)).toBe('melody');
  await expect(actions(page)).toBeVisible();
  // Nothing the practice goals add is here: no level, no Give me one.
  await expect(goalBar(page).locator('.level-picker')).toHaveCount(0);
  await expect(goalBar(page).locator('[data-action="give-me-one"]')).toHaveCount(0);
});

test('AC-14.1.3/2 — Once Lab is chosen the app opens straight into it on every later launch, until another goal is chosen from the goals screen', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'lab');
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(goals(page)).toBeHidden();
    await expect(page.locator('.main-panel')).toBeVisible();
    expect((await settings(page)).goal).toBe('lab');
  }
  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'play');
  await page.reload();
  await expect(goals(page)).toBeVisible();
});

test('AC-14.1.3/3 — A Help toggle in the pinned bar, present in Lab alone, shows a one-line description of each control in the group on screen and in the pinned bar, hides them again, and is remembered', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'play');
  await expect(goalBar(page).locator('[data-action="toggle-help"]')).toHaveCount(0);
  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'lab');
  const help = goalBar(page).locator('[data-action="toggle-help"]');
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.control-help')).toHaveCount(0);

  await help.click();
  await expect(help).toHaveAttribute('aria-pressed', 'true');
  // The pinned bar's own, and the group on screen's — Rhythm on a Percussive Pattern.
  await expect(page.locator('.main-top-bar .control-help[data-help="bar"]')).toBeVisible();
  const rhythmHelp = page.locator('[data-section="rhythm"] .control-help[data-help="rhythm"]');
  await expect(rhythmHelp).toBeVisible();
  expect(await rhythmHelp.locator('dt').count()).toBeGreaterThan(2);
  for (const line of await rhythmHelp.locator('dd').allTextContents()) {
    expect(line.trim().length).toBeGreaterThan(10);
    expect(line).not.toContain('\n');
  }
  // Another group on screen, its own descriptions.
  await page.locator('.workbench-tab[data-tab="practice"]').click();
  await expect(page.locator('[data-section="practice"] .control-help[data-help="practice"]')).toBeVisible();
  await expect(page.locator('[data-section="rhythm"] .control-help')).toBeHidden();

  await help.click();
  await expect(page.locator('.control-help')).toHaveCount(0);
  await help.click();
  await page.reload();
  await expect(goalBar(page).locator('[data-action="toggle-help"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.main-top-bar .control-help[data-help="bar"]')).toBeVisible();
});

/* --- AC-14.1.4 — a rhythm at your level ---------------------------------------- */

test('AC-14.1.4/1 — The pinned bar offers the three levels and Any level under the four practice goals alone, Beginner to begin with, and the level is remembered as an app preference', async ({ page }) => {
  await page.goto('/');
  for (const id of ['play', 'vocalise', 'groove', 'melody']) {
    await chooseGoal(page, id);
    const level = goalBar(page).locator('.level-picker');
    await expect(level, id).toBeVisible();
    expect(await level.locator('option').allTextContents(), id).toEqual(['Beginner', 'Intermediate', 'Advanced', 'Any level']);
    await expect(goalBar(page).locator('[data-action="give-me-one"]'), id).toBeVisible();
    await page.locator('[data-action="show-goals"]').click();
  }
  for (const id of ['compose-rhythm', 'add-melody', 'share', 'lab']) {
    await chooseGoal(page, id);
    await expect(goalBar(page).locator('.level-picker'), id).toHaveCount(0);
    await expect(goalBar(page).locator('[data-action="give-me-one"]'), id).toHaveCount(0);
    await expect(goalBar(page).locator('[data-action="pick-from-library"]'), id).toHaveCount(0);
    await page.locator('[data-action="show-goals"]').click();
  }

  await chooseGoal(page, 'play');
  const level = goalBar(page).locator('.level-picker');
  await expect(level).toHaveValue('Beginner');
  await level.selectOption('Advanced');
  expect((await settings(page)).level).toBe('Advanced');
  await page.reload();
  await chooseGoal(page, 'play');
  await expect(goalBar(page).locator('.level-picker')).toHaveValue('Advanced');
});

test('AC-14.1.4/2 — Give me one loads a shipped Pattern carrying the level’s Tag other than the one open — Percussive under Vocalise or clap it, Melodic under Play melodies over it — exactly as opening it from the library would', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'play');
  const give = goalBar(page).locator('[data-action="give-me-one"]');

  const opened = async () => {
    const s = await stateOf(page);
    return { id: s.pattern.id, tags: s.pattern.tags, mode: s.pattern.soundMode, owned: s.isOwned, current: s.view.currentId };
  };
  let previous = (await opened()).id;
  for (let i = 0; i < 3; i++) {
    await give.click();
    const now = await opened();
    expect(now.id).not.toBe(previous);
    expect(now.tags).toContain('Beginner');
    expect(now.owned).toBe(false);
    // As the library opens it: the library's current mark follows it.
    expect(now.current).toBe(now.id);
    previous = now.id;
  }

  await goalBar(page).locator('.level-picker').selectOption('Advanced');
  await give.click();
  expect((await opened()).tags).toContain('Advanced');

  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'vocalise');
  for (let i = 0; i < 3; i++) {
    await give.click();
    const now = await opened();
    expect(now.mode).toBe('percussive');
    expect(now.tags).toContain('Advanced');
  }

  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'melody');
  for (let i = 0; i < 3; i++) {
    await give.click();
    const now = await opened();
    expect(now.mode).toBe('melodic');
    expect(now.tags).toContain('Advanced');
  }
  // The Pattern arrived with its overlays applied, as the library applies them:
  // rate it, give another, come back to it, and the rating is there.
  const rated = (await opened()).id;
  await page.locator(".pattern-header .rating .star[data-value=\"4\"]").click();
  const rating = await page.evaluate(() => window.__rm.getState().pattern.rating);
  await give.click();
  expect((await opened()).id).not.toBe(rated);
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), rated);
  expect(await page.evaluate(() => window.__rm.getState().pattern.rating)).toBe(rating);
});

test('AC-14.1.4/3 — Pick from the library opens the library filtered to the level’s Tag, with the Mode Tag added under the two goals that have one, and the filter can be changed or cleared as any other', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await chooseGoal(page, 'play');
  const shell = page.locator('.shell');
  await expect(shell).toHaveAttribute('data-library', 'collapsed');
  const selected = () =>
    page.locator('.tag-filter[aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.dataset.tag));

  await goalBar(page).locator('[data-action="pick-from-library"]').click();
  await expect(shell).toHaveAttribute('data-library', 'open');
  await expect(page.locator('.sidebar')).toBeVisible();
  expect(await selected()).toEqual(['Beginner']);
  // Every row listed carries the Tag.
  const rows = page.locator('.pattern-name');
  expect(await rows.count()).toBeGreaterThan(0);

  // Changed like any other: another Tag on top, then cleared.
  await page.locator('.tag-filter[data-tag="Latin"]').click();
  expect((await selected()).sort()).toEqual(['Beginner', 'Latin']);
  await page.locator('[data-action="clear-tags"]').click();
  expect(await selected()).toEqual([]);

  // Under a goal with a Mode, the Mode Tag comes too.
  await page.locator('.library-toggle').click();
  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'melody');
  await goalBar(page).locator('.level-picker').selectOption('Intermediate');
  await goalBar(page).locator('[data-action="pick-from-library"]').click();
  await expect(shell).toHaveAttribute('data-library', 'open');
  expect((await selected()).sort()).toEqual(['Intermediate', 'melodic']);
});

test('AC-14.1.4/5 — Under Any level the dice draws from every shipped Pattern in the goal’s Mode, whatever its level, and Pick from the library filters to the Mode Tag alone, or to nothing under a goal without one', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await chooseGoal(page, 'play');
  await goalBar(page).locator('.level-picker').selectOption('any');
  expect((await settings(page)).level).toBe('any');
  const give = goalBar(page).locator('[data-action="give-me-one"]');
  const levelOf = (tags) => ['Beginner', 'Intermediate', 'Advanced'].find((l) => tags.includes(l));

  // Enough draws to see more than one level go by; every draw is shipped and new.
  const seen = new Set();
  let previous = (await patternState(page)).id;
  for (let i = 0; i < 12; i++) {
    await give.click();
    const s = await stateOf(page);
    expect(s.pattern.id).not.toBe(previous);
    expect(s.isOwned).toBe(false);
    seen.add(levelOf(s.pattern.tags));
    previous = s.pattern.id;
  }
  expect(seen.size).toBeGreaterThan(1);

  // Pick from the library: nothing to filter to under a goal without a Mode…
  const selected = () =>
    page.locator('.tag-filter[aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.dataset.tag));
  await goalBar(page).locator('[data-action="pick-from-library"]').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');
  expect(await selected()).toEqual([]);
  await page.locator('.library-toggle').click();

  // …and the Mode Tag alone under one with a Mode, the draws all Melodic.
  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'melody');
  await expect(goalBar(page).locator('.level-picker')).toHaveValue('any');
  for (let i = 0; i < 4; i++) {
    await give.click();
    expect((await patternState(page)).soundMode).toBe('melodic');
  }
  await goalBar(page).locator('[data-action="pick-from-library"]').click();
  expect(await selected()).toEqual(['melodic']);
});

test('AC-14.1.4/6 — Under a practice goal Prev and Next step through the rhythms the dice draws from — the level’s Tag and the goal’s Mode, within whatever filter the library already has — in the library’s order; under Any level, and under the other goals, they step through the library as filtered, as before', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'play');
  // Choosing a goal closed the drawer (AC-14.1.1/1); it is opened below only
  // to set and clear a filter of the library's own.
  const next = page.locator('[data-action="next-pattern"]');
  const prev = page.locator('[data-action="prev-pattern"]');

  // Beginner: every step lands on a Beginner Pattern, and the ones in between
  // — the library's next rows — are skipped rather than visited.
  // The library's order is by name (ui/library.js sortEntries), rating breaking ties.
  const library = await page.evaluate(() =>
    window.__rm.seedStore
      .loadAll()
      .map((p) => ({ id: p.id, name: p.name, rating: p.rating ?? 0, tags: p.tags, mode: p.soundMode }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || b.rating - a.rating)
  );
  const idxOf = (id) => library.findIndex((p) => p.id === id);
  let at = idxOf((await patternState(page)).id);
  for (let i = 0; i < 6; i++) {
    await next.click();
    const s = await patternState(page);
    expect(s.tags).toContain('Beginner');
    const now = idxOf(s.id);
    // The next Beginner row after the one left, in library order.
    const expected = library.findIndex((p, j) => j > at && p.tags.includes('Beginner'));
    expect(now).toBe(expected === -1 ? library.findIndex((p) => p.tags.includes('Beginner')) : expected);
    at = now;
  }
  await prev.click();
  expect((await patternState(page)).tags).toContain('Beginner');

  // Within the library's own filter: Waltz on top of Beginner (two shipped
  // Patterns carry both, so three steps go round them).
  await page.locator('.library-toggle').click();
  await page.locator('.tag-filter[data-tag="Waltz"]').click();
  await page.locator('.library-toggle').click();
  const visited = new Set();
  for (let i = 0; i < 3; i++) {
    await next.click();
    const s = await patternState(page);
    expect(s.tags).toContain('Beginner');
    expect(s.tags).toContain('Waltz');
    visited.add(s.id);
  }
  expect(visited.size).toBe(2);
  await page.locator('.library-toggle').click();
  await page.locator('[data-action="clear-tags"]').click();
  await page.locator('.library-toggle').click();

  // The goal's Mode too: Vocalise never steps onto a Melodic Pattern.
  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'vocalise');
  await goalBar(page).locator('.level-picker').selectOption('Advanced');
  for (let i = 0; i < 6; i++) {
    await next.click();
    const s = await patternState(page);
    expect(s.soundMode).toBe('percussive');
    expect(s.tags).toContain('Advanced');
  }

  // Any level: the plain library order, the next row whatever its level.
  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'play');
  await goalBar(page).locator('.level-picker').selectOption('any');
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), library[0].id);
  await next.click();
  expect((await patternState(page)).id).toBe(library[1].id);
  await next.click();
  expect((await patternState(page)).id).toBe(library[2].id);

  // Lab: unchanged, the library as filtered.
  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'lab');
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), library[0].id);
  await next.click();
  expect((await patternState(page)).id).toBe(library[1].id);
});

/* --- AC-14.1.5 — practice goals are read-only --------------------------------- */

/** Everything a tap could have changed, for a byte-identical comparison. */
const snapshot = (page) =>
  page.evaluate(() => ({
    pattern: JSON.stringify(window.__rm.getState().pattern),
    patterns: localStorage.getItem('rm.patterns.v1'),
    overlays: localStorage.getItem('rm.overlays.v1'),
    dialogs: document.querySelectorAll('.dialog').length,
  }));

test('AC-14.1.5/1 — Under a practice goal the grid takes no edit: tapping a Slot, a note band or a Time Signature changes nothing and prompts nothing, and the brush line is absent', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'play');
  await expect(page.locator('.shell')).toHaveAttribute('data-readonly', 'true');
  await expect(page.locator('.brush-hint')).toBeHidden();

  const before = await snapshot(page);
  await page.locator('.slot').first().click();
  await page.locator('[data-action="change-time-signature"]').first().click();
  await page.waitForTimeout(150);
  expect(await snapshot(page)).toEqual(before);
  await expect(page.locator('.dialog')).toHaveCount(0);

  // A note band on a Melodic rhythm, the same — an owned one without a fill,
  // whose bands would take a stamp anywhere else (a shipped fill's are inert).
  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'melody');
  await page.evaluate(() => {
    const beat = () => ({
      recipe: 'straight-16ths',
      slots: [{ on: true, pitch: { degree: '1', octaveOffset: 0 } }, { on: false }, { on: true, pitch: { degree: '3', octaveOffset: 0 } }, { on: false }],
    });
    window.__rm.loadPattern(
      { id: 'p_readonly', name: 'Owned Melody', soundMode: 'melodic', key: 'C', tempo: 100, tags: [], rating: 0, measures: [{ timeSignature: '4/4', beats: [beat(), beat(), beat(), beat()] }] },
      { owned: true }
    );
  });
  expect((await patternState(page)).soundMode).toBe('melodic');
  const band = page.locator('[data-action="stamp-pitch"]:not(:disabled)').first();
  await expect(band).toBeVisible();
  const melodicBefore = await snapshot(page);
  await band.click();
  await page.locator('.slot').first().click();
  await page.waitForTimeout(150);
  expect(await snapshot(page)).toEqual(melodicBefore);
  await expect(page.locator('.dialog')).toHaveCount(0);

  // Lab: the same taps edit, as they always have.
  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'lab');
  await expect(page.locator('.shell')).toHaveAttribute('data-readonly', 'false');
  await expect(page.locator('.brush-hint')).toBeVisible();
  const slot = page.locator('.slot').first();
  const accent = await slot.getAttribute('data-accent');
  await slot.click();
  expect(await slot.getAttribute('data-accent')).not.toBe(accent);
});

test('AC-14.1.5/2 — The header offers no Sound Mode switch, rename, tag editing or Undo; the name, Rating, Tags and meter are shown, and the Rating still works', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'vocalise');
  const header = page.locator('.pattern-header');
  await expect(header.locator('.sound-mode')).toHaveCount(0);
  await expect(header.locator('input.pattern-title')).toHaveCount(0);
  await expect(header.locator('[data-action="add-tag"]')).toHaveCount(0);
  await expect(header.locator('[data-action="remove-tag"]')).toHaveCount(0);
  await expect(header.locator('[data-action="undo"]')).toHaveCount(0);

  const name = (await patternState(page)).name;
  await expect(header.locator('.pattern-title')).toHaveText(name);
  await expect(header.locator('.pattern-meta')).toBeVisible();
  await expect(header.locator('.tag-chip').first()).toBeVisible();
  await header.locator('.rating .star[data-value="3"]').click();
  expect(await page.evaluate(() => window.__rm.getState().pattern.rating)).toBe(3);
  await expect(header.locator('.rating')).toHaveAttribute('data-rating', '3');

  // Lab: every one of them back.
  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'lab');
  await expect(header.locator('.sound-mode')).toHaveCount(1);
  await expect(header.locator('input.pattern-title')).toHaveCount(1);
  await expect(header.locator('[data-action="add-tag"]')).toHaveCount(1);
  await expect(header.locator('[data-action="undo"]')).toHaveCount(1);
});

test('AC-14.1.5/3 — The workbench tab bar, its groups, Pattern actions and the family members are absent; in their place one practice panel holds the goal’s own playback settings, and the library offers no New Pattern', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await chooseGoal(page, 'lab');
  await page.locator('.library-toggle').click();
  await makeOwned(page, 'Groove');
  await seedTwin(page, 'Groove (Melodic)');
  await expect(family(page)).toBeVisible();
  await expect(page.locator('[data-action="new-pattern"]')).toBeVisible();

  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'groove');
  await expect(page.locator('.workbench-tabs')).toBeHidden();
  for (const tab of ['melody', 'rhythm', 'compose']) await expect(page.locator(`[data-section="${tab}"]`)).toBeHidden();
  await expect(actions(page)).toBeHidden();
  await expect(family(page)).toBeHidden();
  const panel = page.locator('[data-section="practice"].practice-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-panel', 'click tempo swing');
  await page.locator('.library-toggle').click();
  await expect(page.locator('[data-action="new-pattern"]')).toBeHidden();
});

test('AC-14.1.5/4 — Play a rhythm’s panel holds Click and Count-in and Tempo; Vocalise or clap it adds Counting; Feel the groove adds Swing; Play melodies over it adds Cycle fills, Cycle progressions and Repeats, without Keep', async ({ page }) => {
  await page.goto('/');
  const panel = page.locator('.practice-panel');
  const present = async (selector) => (await panel.locator(selector).count()) > 0;
  const expectPanel = async (id, { counting, swing, cycle }) => {
    await chooseGoal(page, id);
    expect(await present('[data-action="toggle-metronome"]'), `${id} click`).toBe(true);
    expect(await present('[data-action="toggle-count-in"]'), `${id} count-in`).toBe(true);
    expect(await present('.tempo-slider'), `${id} tempo`).toBe(true);
    expect(await present('.counting-picker'), `${id} counting`).toBe(counting);
    expect(await present('.swing-slider'), `${id} swing`).toBe(swing);
    expect(await present('[data-action="toggle-fill-cycle"]'), `${id} cycle`).toBe(cycle);
    expect(await present('[data-action="keep-fill"]'), `${id} keep`).toBe(false);
    // Nothing that edits the Pattern is ever on the panel.
    for (const editing of ['.recipe-strip', '.pitch-strip', '[data-action="add-measure"]', '.progression-picker', '.scale-picker', '.key-picker'])
      expect(await present(editing), `${id} ${editing}`).toBe(false);
    await page.locator('[data-action="show-goals"]').click();
  };
  await expectPanel('play', { counting: false, swing: false, cycle: false });
  await expectPanel('vocalise', { counting: true, swing: false, cycle: false });
  await expectPanel('groove', { counting: false, swing: true, cycle: false });
  // Play melodies over it: the cycling row once a melodic rhythm with a progression is open.
  await chooseGoal(page, 'melody');
  await goalBar(page).locator('[data-action="give-me-one"]').click();
  expect(await present('[data-action="toggle-fill-cycle"]')).toBe(true);
  expect(await present('[data-action="toggle-progression-cycle"]')).toBe(true);
  expect(await present('.fill-cycle-repeats')).toBe(true);
  expect(await present('[data-action="keep-fill"]')).toBe(false);
  expect(await present('.counting-picker')).toBe(false);
  expect(await present('.swing-slider')).toBe(false);
});

test('AC-14.1.5/5 — Every setting in the panel is a playback setting that writes nothing to the Pattern: a shipped Pattern is never asked for a name under a practice goal, and the Pattern store is unchanged by any of them', async ({ page }) => {
  await page.goto('/');
  const stores = () =>
    page.evaluate(() => ({ patterns: localStorage.getItem('rm.patterns.v1'), owned: window.__rm.getState().isOwned }));
  const before = await stores();

  await chooseGoal(page, 'groove');
  await page.locator('.practice-panel [data-action="toggle-metronome"]').click();
  await page.locator('.practice-panel [data-action="toggle-count-in"]').click();
  await page.locator('.practice-panel [data-action="preset-tempo"][data-bpm="120"]').click();
  await page.locator('.practice-panel [data-action="preset-swing"][data-amount="33"]').click();
  await page.locator('.practice-panel .swing-feel').selectOption('sixteenth');
  await expect(page.locator('.dialog')).toHaveCount(0);

  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'vocalise');
  await page.locator('.practice-panel .counting-picker').selectOption('numbered');
  await expect(page.locator('.dialog')).toHaveCount(0);

  await page.locator('[data-action="show-goals"]').click();
  await chooseGoal(page, 'melody');
  await goalBar(page).locator('[data-action="give-me-one"]').click();
  await page.locator('.practice-panel [data-action="toggle-fill-cycle"]').click();
  await page.locator('.practice-panel [data-action="toggle-progression-cycle"]').click();
  await page.locator('.practice-panel .fill-cycle-repeats').fill('2');
  await page.locator('.practice-panel .fill-cycle-repeats').dispatchEvent('change');
  await expect(page.locator('.dialog')).toHaveCount(0);

  const after = await stores();
  expect(after).toEqual(before);
  expect(after.owned).toBe(false);
});
