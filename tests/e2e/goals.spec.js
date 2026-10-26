import { test, expect } from '@playwright/test';

/*
 * US-14.1 — Choose a goal. The goals screen stands in for the main panel
 * until a goal is chosen, in storyboard board 1's four groups; a goal is a
 * screen inside the shared frame (AC-15.1.20) and offers only the controls it
 * is for; Lab is the cockpit, remembered; Practise a rhythm hands out a rhythm
 * by level and edits nothing.
 *
 * The rest of the suite opens in Lab through playwright.config.js's storage
 * state. This file starts from nothing, since a first launch is its subject.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const goals = (page) => page.locator('.goals');
const card = (page, id) => page.locator(`.goal-card[data-goal="${id}"]`);
const chooseGoal = (page, id) => card(page, id).click();
const strip = (page) => page.locator('.goal-strip');
const offeredTabs = (page) =>
  page.locator('.workbench-tab:not([hidden])').evaluateAll((els) => els.map((e) => e.dataset.tab));
const activeTab = (page) => page.locator('.workbench-tab[aria-selected="true"]').getAttribute('data-tab');
const actions = (page) => page.locator('details[data-section="actions"]');
const family = (page) => page.locator('[data-section="family"]');
const settings = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rm.settings.v1')));
const patternState = (page) => page.evaluate(() => window.__rm.getState().pattern);
const stateOf = (page) => page.evaluate(() => window.__rm.getState());
const showGoals = (page) => page.locator('[data-action="show-goals"]').click();

const MAKING = ['build', 'melodic', 'combine', 'share'];

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

/** Open a shipped Melodic Pattern with a chord progression, as the library would. */
async function openShippedMelodic(page) {
  await page.evaluate(() => {
    const p = window.__rm.seedStore.loadAll().find((x) => x.soundMode === 'melodic' && x.harmony?.chords?.length);
    window.__rm.handlers.onOpen(p.id, false);
  });
  await expect(page.locator('.pitch-strip, .practice-panel').first()).toBeAttached();
}

/* --- AC-14.1.1 — the goals screen ------------------------------------------ */

test('AC-14.1.1/1 — On a first launch the goals screen is shown in place of the main panel and the library, and choosing a goal opens the main panel', async ({ page }) => {
  await page.goto('/');
  await expect(goals(page)).toBeVisible();
  await expect(page.locator('.main-panel')).toBeHidden();
  await expect(page.locator('.sidebar')).toBeHidden();
  expect((await settings(page)).goal).toBeNull();

  await chooseGoal(page, 'practise');
  await expect(goals(page)).toBeHidden();
  await expect(page.locator('.main-panel')).toBeVisible();
  await expect(page.locator('.grid')).toBeVisible();
  await expect(strip(page)).toBeVisible();
  await expect(strip(page).locator('.goal-name')).toHaveText('Practise a rhythm');
});

test('AC-14.1.1/2 — The screen names every goal with a one-line description, in four groups: Hear it and practise it holds Practise a rhythm; Make something holds Build a rhythm, Make it melodic, Combine patterns and Play it in, numbered as stages; Keep it holds Share and tidy up; Everything at once holds Lab', async ({ page }) => {
  await page.goto('/');
  const titles = await page
    .locator('.goal-card .goal-card-title')
    .evaluateAll((els) => els.map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()));
  expect(titles).toEqual([
    'Practise a rhythm',
    'Build a rhythm',
    'Make it melodic',
    'Combine patterns',
    'Play it in',
    'Share and tidy up',
    'Lab',
  ]);
  // Four groups, in order, each with its heading.
  expect(await page.locator('.goal-group').evaluateAll((els) => els.map((e) => e.dataset.goalGroup))).toEqual(['practise', 'make', 'keep', 'lab']);
  expect(await page.locator('.goal-group .goal-group-title').allTextContents()).toEqual([
    'Hear it and practise it',
    'Make something',
    'Keep it',
    'Everything at once',
  ]);
  await expect(page.locator('[data-goal-group="practise"] .goal-card')).toHaveCount(1);
  await expect(page.locator('[data-goal-group="practise"] .goal-card')).toHaveAttribute('data-goal', 'practise');
  expect(await page.locator('[data-goal-group="make"] .goal-card').evaluateAll((els) => els.map((e) => e.dataset.goal))).toEqual([
    'build',
    'melodic',
    'combine',
    'play-in',
  ]);
  // The making goals are numbered as stages; nothing else is.
  expect(await page.locator('[data-goal-group="make"] .goal-card-number').allTextContents()).toEqual(['1', '2', '3', '4']);
  await expect(page.locator('.goal-group:not([data-goal-group="make"]) .goal-card-number')).toHaveCount(0);
  await expect(page.locator('[data-goal-group="keep"] .goal-card')).toHaveCount(1);
  await expect(page.locator('[data-goal-group="keep"] .goal-card')).toHaveAttribute('data-goal', 'share');
  await expect(page.locator('[data-goal-group="lab"] .goal-card')).toHaveCount(1);
  await expect(page.locator('[data-goal-group="lab"] .goal-card')).toHaveAttribute('data-goal', 'lab');
  // Every card carries a description, one line long.
  const blurbs = await page.locator('.goal-card .goal-card-blurb').allTextContents();
  expect(blurbs).toHaveLength(7);
  for (const b of blurbs) {
    expect(b.trim().length).toBeGreaterThan(20);
    expect(b).not.toContain('\n');
  }
});

test('AC-14.1.1/2 — The screen names every goal with a one-line description, in four groups: Hear it and practise it holds Practise a rhythm; Make something holds Build a rhythm, Make it melodic, Combine patterns and Play it in, numbered as stages; Keep it holds Share and tidy up; Everything at once holds Lab: a goal remembered under a 2026-09-20 id is marked as the goal it became', async ({ page }) => {
  for (const [old, now] of [
    ['vocalise', 'practise'],
    ['compose-rhythm', 'build'],
    ['add-melody', 'melodic'],
  ]) {
    await page.goto('/');
    await page.evaluate((g) => localStorage.setItem('rm.settings.v1', JSON.stringify({ schemaVersion: 1, goal: g })), old);
    await page.reload();
    await expect(goals(page), old).toBeVisible();
    await expect(card(page, now), old).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.goal-card[aria-current="true"]'), old).toHaveCount(1);
    expect((await settings(page)).goal, old).toBe(now);
    await chooseGoal(page, now);
    await expect(strip(page).locator('.goal-name'), old).toHaveText(await card(page, now).locator('.goal-card-title').evaluate((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()));
  }
});

test('AC-14.1.1/3 — A Goals control in the pinned bar returns to the goals screen from any goal, Lab included, with the current goal marked', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'practise');
  await expect(goals(page)).toBeHidden();
  await page.locator('.main-top-bar > [data-action="show-goals"]').click();
  await expect(goals(page)).toBeVisible();
  await expect(page.locator('.main-panel')).toBeHidden();
  await expect(card(page, 'practise')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.goal-card[aria-current="true"]')).toHaveCount(1);

  await chooseGoal(page, 'lab');
  await expect(goals(page)).toBeHidden();
  await page.locator('.main-top-bar > [data-action="show-goals"]').click();
  await expect(goals(page)).toBeVisible();
  await expect(card(page, 'lab')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.goal-card[aria-current="true"]')).toHaveCount(1);
});

test('AC-14.1.1/4 — The app opens on the goals screen on every launch unless the remembered goal is Lab, and the remembered goal is marked as current', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'melodic');
  await page.reload();
  await expect(goals(page)).toBeVisible();
  await expect(card(page, 'melodic')).toHaveAttribute('aria-current', 'true');
  await page.reload();
  await expect(goals(page)).toBeVisible();

  await chooseGoal(page, 'lab');
  await page.reload();
  await expect(goals(page)).toBeHidden();
  await expect(page.locator('.main-panel')).toBeVisible();
  await expect(strip(page).locator('.goal-name')).toHaveText('Lab');
});

/* --- AC-14.1.2 — a goal offers its own controls ----------------------------- */

test('AC-14.1.2/1 — The tab bar offers exactly the groups the chosen goal names, in the main panel’s fixed order, and the group on screen is the first of them that applies to the Pattern', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'melodic');
  // Make it melodic names Melody and Practice. On a Percussive Pattern Melody
  // does not apply, so Practice is offered and on screen.
  expect((await patternState(page)).soundMode).toBe('percussive');
  expect(await offeredTabs(page)).toEqual(['practice']);
  expect(await activeTab(page)).toBe('practice');
  await expect(page.locator('[data-section="practice"]')).toBeVisible();
  await expect(page.locator('[data-section="melody"]')).toBeHidden();

  await melodicWithProgression(page);
  expect(await offeredTabs(page)).toEqual(['melody', 'practice']);
  expect(await activeTab(page)).toBe('melody');
  // Rhythm and Compose apply to this Pattern but are not offered: absent.
  await expect(page.locator('.workbench-tab[data-tab="rhythm"]')).toBeHidden();
  await expect(page.locator('[data-section="rhythm"]')).toBeHidden();
  await expect(page.locator('.workbench-tab[data-tab="compose"]')).toBeHidden();
  // A tapped tab stays the one in force.
  await page.locator('.workbench-tab[data-tab="practice"]').click();
  expect(await activeTab(page)).toBe('practice');
});

test('AC-14.1.2/2 — Practise a rhythm offers no workbench group: the tab bar is absent, and its settings rail stands in the work surface’s place', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'lab');
  // Even on a Pattern every group applies to.
  await melodicWithProgression(page);
  await showGoals(page);
  await chooseGoal(page, 'practise');
  await expect(page.locator('.workbench-tabs')).toBeHidden();
  expect(await offeredTabs(page)).toEqual([]);
  for (const tab of ['melody', 'rhythm', 'compose']) await expect(page.locator(`[data-section="${tab}"]`)).toBeHidden();
  await expect(page.locator('.work-surface > .practice-panel')).toBeVisible();
  await expect(page.locator('[data-section="practice"].practice-panel')).toHaveCount(1);
  // And back in Lab the tab bar returns with the Practice group proper.
  await showGoals(page);
  await chooseGoal(page, 'lab');
  await expect(page.locator('.workbench-tabs')).toBeVisible();
  await expect(page.locator('.practice-panel')).toHaveCount(0);
});

test('AC-14.1.2/3 — Build a rhythm offers Rhythm and Practice with Pattern actions and the grid’s accent brush; Make it melodic offers Melody and Practice with Pattern actions; Combine patterns offers Melody, Practice and Compose with Pattern actions; Share and tidy up offers Practice with Pattern actions and the family members', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await chooseGoal(page, 'lab');
  await page.locator('.library-toggle').click();
  // A family, so the members area has something to show (AC-11.2.5/2).
  await makeOwned(page, 'Groove');
  await seedTwin(page, 'Groove (Melodic)');
  await expect(family(page)).toBeVisible();

  await showGoals(page);
  await chooseGoal(page, 'build');
  expect(await offeredTabs(page)).toEqual(['rhythm', 'practice']);
  await expect(actions(page)).toBeVisible();
  await expect(family(page)).toBeHidden();
  await expect(page.locator('.brush-hint')).toBeVisible();

  await showGoals(page);
  await chooseGoal(page, 'melodic');
  // Percussive: Melody does not apply, so Practice alone is on offer…
  expect(await offeredTabs(page)).toEqual(['practice']);
  await expect(actions(page)).toBeVisible();
  await expect(family(page)).toBeHidden();
  // …and Melodic with a progression, Melody and Practice — never Compose here.
  await page.locator('.sound-mode [data-mode="melodic"]').click();
  await page.locator('.progression-picker').selectOption('I-IV-V');
  expect(await offeredTabs(page)).toEqual(['melody', 'practice']);

  await showGoals(page);
  await chooseGoal(page, 'combine');
  expect(await offeredTabs(page)).toEqual(['melody', 'practice', 'compose']);
  await expect(actions(page)).toBeVisible();
  await expect(family(page)).toBeHidden();

  await showGoals(page);
  await chooseGoal(page, 'share');
  expect(await offeredTabs(page)).toEqual(['practice']);
  await expect(actions(page)).toBeVisible();
  await expect(family(page)).toBeVisible();
  await expect(family(page).locator('.family-link')).toHaveCount(1);

  // The grid's accent brush is Build a rhythm's: a Slot tap cycles its
  // accent. Last, since the edit takes this Pattern out of its family.
  await showGoals(page);
  await chooseGoal(page, 'build');
  const slot = page.locator('.slot').first();
  const before = await slot.getAttribute('data-accent');
  await slot.click();
  expect(await slot.getAttribute('data-accent')).not.toBe(before);
});

test('AC-14.1.2/4 — Pattern actions and the family members are absent under Practise a rhythm', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await chooseGoal(page, 'lab');
  await page.locator('.library-toggle').click();
  await makeOwned(page, 'Groove');
  await seedTwin(page, 'Groove (Melodic)');
  await expect(family(page)).toBeVisible();
  await expect(actions(page)).toBeVisible();

  await showGoals(page);
  await chooseGoal(page, 'practise');
  await expect(actions(page)).toBeHidden();
  await expect(family(page)).toBeHidden();
  // And back in Lab both return, the family untouched.
  await showGoals(page);
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

  await showGoals(page);
  await chooseGoal(page, 'build');
  expect((await settings(page)).goal).toBe('build');
  await page.reload();
  await expect(goals(page)).toBeVisible();
  await expect(card(page, 'build')).toHaveAttribute('aria-current', 'true');
  await chooseGoal(page, 'build');
  expect(await offeredTabs(page)).toEqual(['rhythm', 'practice']);

  const after = await page.evaluate(() => ({
    patterns: localStorage.getItem('rm.patterns.v1'),
    overlays: localStorage.getItem('rm.overlays.v1'),
    songs: localStorage.getItem('rm.songs.v1'),
    open: JSON.stringify(window.__rm.getState().pattern),
  }));
  expect(after).toEqual(before);
});

test('AC-14.1.2/6 — Choosing Play it in opens the Composer in the work surface, with the Practice | Composer switch in its goal strip to step out of it; on its Practice side it offers what Lab offers, until its own screen lands', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await chooseGoal(page, 'play-in');
  await expect(goals(page)).toBeHidden();
  expect((await settings(page)).goal).toBe('play-in');
  await expect(strip(page).locator('.goal-name')).toHaveText('Play it in');
  // The Composer, as the switch would open it: its panel in the frame, the open
  // Pattern offered as the composition (AC-19.1.2/2) and, declined, the library
  // offered for the first step (AC-19.1.2/3).
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'composer');
  await expect(page.locator('.composer-panel')).toBeVisible();
  await expect(page.locator('.rhythm-band')).toBeHidden();
  await expect(page.locator('.dialog')).toBeVisible();
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');
  const sw = strip(page).locator('.mode-switch');
  await expect(sw).toBeVisible();
  await expect(sw.locator('[data-mode="composer"]')).toHaveAttribute('aria-pressed', 'true');

  // Stepping out: the Practice side offers what Lab offers.
  await sw.locator('[data-mode="practice"]').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'practice');
  await expect(page.locator('.rhythm-band')).toBeVisible();
  await page.locator('.library-toggle').click();
  expect(await offeredTabs(page)).toEqual(['rhythm', 'practice']);
  await expect(actions(page)).toBeVisible();
  await melodicWithProgression(page);
  expect(await offeredTabs(page)).toEqual(['melody', 'rhythm', 'practice', 'compose']);

  // Choosing it again from the goals screen opens the Composer again.
  await showGoals(page);
  await chooseGoal(page, 'play-in');
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'composer');
  await expect(page.locator('.dialog')).toBeVisible();
  await page.locator('.dialog-button', { hasText: 'Cancel' }).click();
  // And Practise a rhythm, which has no Composer, leaves it.
  await showGoals(page);
  await chooseGoal(page, 'practise');
  await expect(page.locator('.shell')).toHaveAttribute('data-mode', 'practice');
  await expect(page.locator('.composer-panel')).toBeHidden();
  await expect(page.locator('.rhythm-band')).toBeVisible();
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
  // Nothing Practise a rhythm adds is here: no level, no Give me one.
  await expect(strip(page).locator('.level-picker')).toHaveCount(0);
  await expect(strip(page).locator('[data-action="give-me-one"]')).toHaveCount(0);
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
  await showGoals(page);
  await chooseGoal(page, 'practise');
  await page.reload();
  await expect(goals(page)).toBeVisible();
});

test('AC-14.1.3/3 — A Help toggle in the goal strip, present in Lab alone, puts a ? beside each control in the group on screen and in the pinned bar that pops up its one-line description when tapped, takes the ?s away again, and is remembered', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'practise');
  await expect(strip(page).locator('[data-action="toggle-help"]')).toHaveCount(0);
  await expect(page.locator('.help-tip')).toHaveCount(0);
  await showGoals(page);
  for (const id of MAKING) {
    await chooseGoal(page, id);
    await expect(strip(page).locator('[data-action="toggle-help"]'), id).toHaveCount(0);
    await showGoals(page);
  }
  await chooseGoal(page, 'lab');
  const help = strip(page).locator('[data-action="toggle-help"]');
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.help-tip')).toHaveCount(0);

  await help.click();
  await expect(help).toHaveAttribute('aria-pressed', 'true');
  // The pinned bar's own, each beside its control — the strip's included.
  const bar = page.locator('.main-top-bar');
  for (const [name, control] of [
    ['Goals', '.goals-button'],
    ['Library', '.library-toggle'],
    ['Related', '.related-button'],
    ['Play / Stop', '.transport'],
    ['Prev / Next', '[data-action="next-pattern"]'],
    ['Practice / Composer', '.mode-switch'],
  ]) {
    const tip = bar.locator(`.help-tip[data-help="bar"][data-help-for="${name}"]`);
    await expect(tip, name).toBeVisible();
    expect(await tip.evaluate((t, sel) => t.previousElementSibling?.matches(sel), control), name).toBe(true);
  }
  // The group on screen's — Rhythm on a Percussive Pattern — and no block of text.
  const rhythmTips = page.locator('[data-section="rhythm"] .help-tip[data-help="rhythm"]');
  expect(await rhythmTips.count()).toBeGreaterThan(2);
  await expect(rhythmTips.first()).toBeVisible();
  await expect(page.locator('.control-help')).toHaveCount(0);

  // Tapped, a ? pops up its one line over the page; tapped again, it closes.
  const pop = page.locator('.help-pop');
  await expect(pop).toBeHidden();
  const condense = page.locator('[data-section="rhythm"] .help-tip[data-help-for="Condense"]');
  await condense.click();
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('Condense');
  const line = await pop.locator('.help-pop-text').textContent();
  expect(line.trim().length).toBeGreaterThan(10);
  expect(line).not.toContain('\n');
  expect(await pop.evaluate((p) => getComputedStyle(p).position)).toBe('fixed');
  await condense.click();
  await expect(pop).toBeHidden();
  // A tap elsewhere, or Escape, dismisses it too.
  await condense.click();
  await expect(pop).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();

  // Another group on screen, its own ?s; the hidden group's are not seen.
  await page.locator('.workbench-tab[data-tab="practice"]').click();
  await expect(page.locator('[data-section="practice"] .help-tip[data-help="practice"]').first()).toBeVisible();
  await expect(page.locator('[data-section="rhythm"] .help-tip').first()).toBeHidden();

  await help.click();
  await expect(page.locator('.help-tip')).toHaveCount(0);
  await help.click();
  await page.reload();
  await expect(strip(page).locator('[data-action="toggle-help"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(bar.locator('.help-tip[data-help="bar"]').first()).toBeVisible();
});

test('AC-14.1.3/3 — A Help toggle in the goal strip, present in Lab alone, puts a ? beside each control in the group on screen and in the pinned bar that pops up its one-line description when tapped, takes the ?s away again, and is remembered: on a Melodic Pattern the ?s take no room above the controls, and an open description moves nothing', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'lab');
  await melodicWithProgression(page);
  const pitchStrip = page.locator('[data-section="melody"] .pitch-strip');
  const top = async (loc) => (await loc.boundingBox()).y;
  const stripOff = await top(pitchStrip);
  const gridOff = await top(page.locator('.grid'));

  await strip(page).locator('[data-action="toggle-help"]').click();
  const tips = page.locator('[data-section="melody"] .help-tip[data-help="melody"]');
  expect(await tips.count()).toBeGreaterThan(5);
  // Nothing is laid out ahead of the group's first row or the grid: the ?s sit in
  // the rows. The first row is Roll the dice (AC-15.1.8), its own ? inside it.
  const first = page.locator('[data-section="melody"] > :first-child');
  expect(await first.evaluate((e) => e.className)).toContain('dice-row');
  expect(await first.evaluate((e) => e.classList.contains('help-tip'))).toBe(false);
  expect(await first.locator('.help-tip[data-help-for="Roll the dice"]').count()).toBe(1);
  expect(Math.abs((await top(page.locator('.grid'))) - gridOff)).toBeLessThan(2);
  const stripOn = await top(pitchStrip);
  expect(Math.abs(stripOn - stripOff)).toBeLessThan(2);

  await page.locator('[data-section="melody"] .help-tip[data-help-for="Scale"]').click();
  await expect(page.locator('.help-pop')).toBeVisible();
  await expect(page.locator('.help-pop')).toContainText('Scale');
  expect(Math.abs((await top(pitchStrip)) - stripOn)).toBeLessThan(2);
});

/* --- AC-14.1.4 — a rhythm at your level ---------------------------------------- */

test('AC-14.1.4/1 — The goal strip offers the three levels and Any level under Practise a rhythm alone, Beginner to begin with, and the level is remembered as an app preference', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'practise');
  const level = strip(page).locator('.level-picker');
  await expect(level).toBeVisible();
  expect(await level.locator('option').allTextContents()).toEqual(['Beginner', 'Intermediate', 'Advanced', 'Any level']);
  await expect(strip(page).locator('[data-action="give-me-one"]')).toBeVisible();
  await showGoals(page);
  for (const id of [...MAKING, 'lab']) {
    await chooseGoal(page, id);
    await expect(strip(page).locator('.level-picker'), id).toHaveCount(0);
    await expect(strip(page).locator('[data-action="give-me-one"]'), id).toHaveCount(0);
    await expect(strip(page).locator('[data-action="pick-from-library"]'), id).toHaveCount(0);
    await showGoals(page);
  }

  await chooseGoal(page, 'practise');
  await expect(level).toHaveValue('Beginner');
  await level.selectOption('Advanced');
  expect((await settings(page)).level).toBe('Advanced');
  await page.reload();
  await chooseGoal(page, 'practise');
  await expect(strip(page).locator('.level-picker')).toHaveValue('Advanced');
});

test('AC-14.1.4/2 — Give me one loads a shipped Pattern carrying the level’s Tag other than the one open, Percussive or Melodic, exactly as opening it from the library would', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'practise');
  const give = strip(page).locator('[data-action="give-me-one"]');

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

  await strip(page).locator('.level-picker').selectOption('Advanced');
  await give.click();
  expect((await opened()).tags).toContain('Advanced');

  // Both Modes are in the draw: enough draws at one level see each.
  const modes = new Set();
  for (let i = 0; i < 40 && modes.size < 2; i++) {
    await give.click();
    const now = await opened();
    expect(now.tags).toContain('Advanced');
    expect(now.owned).toBe(false);
    modes.add(now.mode);
  }
  expect([...modes].sort()).toEqual(['melodic', 'percussive']);

  // The Pattern arrived with its overlays applied, as the library applies them:
  // rate it, give another, come back to it, and the rating is there.
  const rated = (await opened()).id;
  await page.locator('.pattern-header .rating .star[data-value="4"]').click();
  const rating = await page.evaluate(() => window.__rm.getState().pattern.rating);
  await give.click();
  expect((await opened()).id).not.toBe(rated);
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), rated);
  expect(await page.evaluate(() => window.__rm.getState().pattern.rating)).toBe(rating);
});

test('AC-14.1.4/3 — Pick from the library opens the library filtered to the level’s Tag alone, and the filter can be changed or cleared as any other, the Mode Tags among them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await chooseGoal(page, 'practise');
  const shell = page.locator('.shell');
  await expect(shell).toHaveAttribute('data-library', 'collapsed');
  const selected = () =>
    page.locator('.tag-filter[aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.dataset.tag));

  await strip(page).locator('[data-action="pick-from-library"]').click();
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

  // Another level, the level alone — and a Mode is a chip like any other,
  // chosen in the library rather than by the goal.
  await page.locator('.library-toggle').click();
  await strip(page).locator('.level-picker').selectOption('Intermediate');
  await strip(page).locator('[data-action="pick-from-library"]').click();
  await expect(shell).toHaveAttribute('data-library', 'open');
  expect(await selected()).toEqual(['Intermediate']);
  await page.locator('.tag-filter[data-tag="melodic"]').click();
  expect((await selected()).sort()).toEqual(['Intermediate', 'melodic']);
  const listed = await page.locator('.pattern-name').count();
  expect(listed).toBeGreaterThan(0);
  await page.locator('.tag-filter[data-tag="melodic"]').click();
  expect(await selected()).toEqual(['Intermediate']);
  expect(await page.locator('.pattern-name').count()).toBeGreaterThan(listed);
});

test('AC-14.1.4/4 — Give me one draws from the whole level: fed every position in turn it reaches every shipped Pattern at that level and never the one open, and yields nothing when the level has no other: through the dice in the strip', async ({ page }) => {
  // One press per shipped Beginner Pattern — well over a hundred, each a
  // reopen and a library render — so this one takes longer than the default.
  test.setTimeout(180_000);
  await page.goto('/');
  await chooseGoal(page, 'practise');
  const give = strip(page).locator('[data-action="give-me-one"]');
  const open = (await patternState(page)).id;
  // The dice's one impure input is the page's Math.random: fed every position
  // in turn, each press lands on the next shipped Beginner Pattern.
  const beginners = await page.evaluate(() =>
    window.__rm.seedStore.loadAll().filter((p) => p.tags.includes('Beginner')).map((p) => p.id)
  );
  const reached = new Set();
  const n = beginners.filter((id) => id !== open).length;
  for (let i = 0; i < n; i++) {
    // The middle of each bucket: a position exactly on a boundary can round
    // into the bucket below, which says nothing about the draw.
    await page.evaluate((r) => {
      window.Math.random = () => r;
    }, (i + 0.5) / n);
    // Back to the one open first, so every draw excludes the same Pattern.
    await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), open);
    await give.click();
    const now = (await patternState(page)).id;
    expect(now).not.toBe(open);
    expect(beginners).toContain(now);
    reached.add(now);
  }
  expect([...reached].sort()).toEqual(beginners.filter((id) => id !== open).sort());
  // The level with no other Pattern is the pure draw's case, proven in
  // tests/unit/core/goals.test.js: every shipped level has dozens, and the
  // seed store is a module the page cannot narrow.
});

test('AC-14.1.4/5 — Under Any level the dice draws from every shipped Pattern, whatever its level or Mode, and Pick from the library filters to nothing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await chooseGoal(page, 'practise');
  await strip(page).locator('.level-picker').selectOption('any');
  expect((await settings(page)).level).toBe('any');
  const give = strip(page).locator('[data-action="give-me-one"]');
  const levelOf = (tags) => ['Beginner', 'Intermediate', 'Advanced'].find((l) => tags.includes(l));

  // Enough draws to see more than one level and both Modes go by; every draw
  // is shipped and new.
  const seen = new Set();
  const modes = new Set();
  let previous = (await patternState(page)).id;
  for (let i = 0; i < 24; i++) {
    await give.click();
    const s = await stateOf(page);
    expect(s.pattern.id).not.toBe(previous);
    expect(s.isOwned).toBe(false);
    seen.add(levelOf(s.pattern.tags));
    modes.add(s.pattern.soundMode);
    previous = s.pattern.id;
  }
  expect(seen.size).toBeGreaterThan(1);
  expect(modes.size).toBe(2);

  // Pick from the library: nothing to filter to.
  const selected = () =>
    page.locator('.tag-filter[aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.dataset.tag));
  await strip(page).locator('[data-action="pick-from-library"]').click();
  await expect(page.locator('.shell')).toHaveAttribute('data-library', 'open');
  expect(await selected()).toEqual([]);
});

test('AC-14.1.4/6 — Under Practise a rhythm Prev and Next step through the rhythms the dice draws from — the level’s Tag, within whatever filter the library already has — in the library’s order; under Any level, and under the other goals, they step through the library as filtered, as before', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'practise');
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
  const modes = new Set();
  for (let i = 0; i < 6; i++) {
    await next.click();
    const s = await patternState(page);
    expect(s.tags).toContain('Beginner');
    modes.add(s.soundMode);
    const now = idxOf(s.id);
    // The next Beginner row after the one left, in library order — of either Mode.
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

  // Any level: the plain library order, the next row whatever its level.
  await strip(page).locator('.level-picker').selectOption('any');
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), library[0].id);
  await next.click();
  expect((await patternState(page)).id).toBe(library[1].id);
  await next.click();
  expect((await patternState(page)).id).toBe(library[2].id);

  // Lab: unchanged, the library as filtered.
  await showGoals(page);
  await chooseGoal(page, 'lab');
  await page.evaluate((id) => window.__rm.handlers.onOpen(id, false), library[0].id);
  await next.click();
  expect((await patternState(page)).id).toBe(library[1].id);
});

/* --- AC-14.1.5 — Practise a rhythm is read-only --------------------------------- */

/** Everything a tap could have changed, for a byte-identical comparison. */
const snapshot = (page) =>
  page.evaluate(() => ({
    pattern: JSON.stringify(window.__rm.getState().pattern),
    patterns: localStorage.getItem('rm.patterns.v1'),
    overlays: localStorage.getItem('rm.overlays.v1'),
    dialogs: document.querySelectorAll('.dialog').length,
  }));

test('AC-14.1.5/1 — Under Practise a rhythm the grid takes no edit: tapping a Slot, a note band or a Time Signature changes nothing and prompts nothing, and the brush line is absent', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'practise');
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
  await showGoals(page);
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
  await chooseGoal(page, 'practise');
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
  await showGoals(page);
  await chooseGoal(page, 'lab');
  await expect(header.locator('.sound-mode')).toHaveCount(1);
  await expect(header.locator('input.pattern-title')).toHaveCount(1);
  await expect(header.locator('[data-action="add-tag"]')).toHaveCount(1);
  await expect(header.locator('[data-action="undo"]')).toHaveCount(1);
});

test('AC-14.1.5/3 — The workbench tab bar, its groups, Pattern actions and the family members are absent; in their place the goal strip holds Click and Count-in and one settings rail holds the other playback settings, and the library offers no New Pattern', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  await chooseGoal(page, 'lab');
  await page.locator('.library-toggle').click();
  await makeOwned(page, 'Groove');
  await seedTwin(page, 'Groove (Melodic)');
  await expect(family(page)).toBeVisible();
  await expect(page.locator('[data-action="new-pattern"]')).toBeVisible();

  await showGoals(page);
  await chooseGoal(page, 'practise');
  await expect(page.locator('.workbench-tabs')).toBeHidden();
  for (const tab of ['melody', 'rhythm', 'compose']) await expect(page.locator(`[data-section="${tab}"]`)).toBeHidden();
  await expect(actions(page)).toBeHidden();
  await expect(family(page)).toBeHidden();
  // Click and Count-in in the strip, once each in the whole panel.
  await expect(strip(page).locator('[data-action="toggle-metronome"]')).toBeVisible();
  await expect(strip(page).locator('[data-action="toggle-count-in"]')).toBeVisible();
  await expect(page.locator('.main-panel [data-action="toggle-metronome"]')).toHaveCount(1);
  const panel = page.locator('.work-surface > [data-section="practice"].practice-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-panel', 'tempo counting swing cycle');
  await expect(page.locator('.work-surface > .practice-panel')).toHaveCount(1);
  await page.locator('.library-toggle').click();
  await expect(page.locator('[data-action="new-pattern"]')).toBeHidden();
});

test('AC-14.1.5/4 — The strip holds Click and Count-in; the rail holds Tempo, Counting and Swing, and on a Melodic rhythm with a chord progression Cycle fills, Cycle progressions and Repeats, without Keep', async ({ page }) => {
  await page.goto('/');
  await chooseGoal(page, 'practise');
  const panel = page.locator('.practice-panel');
  const inStrip = async (selector) => (await strip(page).locator(selector).count()) > 0;
  const inRail = async (selector) => (await panel.locator(selector).count()) > 0;

  // Percussive, as the app opens: the strip's toggles and the rail's three rows.
  expect((await patternState(page)).soundMode).toBe('percussive');
  expect(await inStrip('[data-action="toggle-metronome"]')).toBe(true);
  expect(await inStrip('[data-action="toggle-count-in"]')).toBe(true);
  expect(await inRail('.tempo-slider')).toBe(true);
  expect(await inRail('.counting-picker')).toBe(true);
  expect(await inRail('.swing-slider')).toBe(true);
  expect(await inRail('[data-action="toggle-fill-cycle"]')).toBe(false);
  expect(await inRail('[data-action="keep-fill"]')).toBe(false);
  // Nothing that edits the Pattern is ever on the rail or the strip.
  for (const editing of ['.recipe-strip', '.pitch-strip', '[data-action="add-measure"]', '.progression-picker', '.scale-picker', '.key-picker']) {
    expect(await inRail(editing), editing).toBe(false);
    expect(await inStrip(editing), editing).toBe(false);
  }

  // A Melodic rhythm with a progression: the cycling row joins the rail.
  await openShippedMelodic(page);
  expect(await inRail('[data-action="toggle-fill-cycle"]')).toBe(true);
  expect(await inRail('[data-action="toggle-progression-cycle"]')).toBe(true);
  expect(await inRail('.fill-cycle-repeats')).toBe(true);
  expect(await inRail('[data-action="keep-fill"]')).toBe(false);
  expect(await inRail('.tempo-slider')).toBe(true);
  expect(await inRail('.counting-picker')).toBe(true);
  expect(await inRail('.swing-slider')).toBe(true);
  expect(await page.locator('.rail-note, .panel-note').count()).toBe(0);
});

test('AC-14.1.5/5 — Every setting in the strip and the rail is a playback setting that writes nothing to the Pattern: a shipped Pattern is never asked for a name under Practise a rhythm, and the Pattern store is unchanged by any of them', async ({ page }) => {
  await page.goto('/');
  const stores = () =>
    page.evaluate(() => ({ patterns: localStorage.getItem('rm.patterns.v1'), owned: window.__rm.getState().isOwned }));
  const before = await stores();

  await chooseGoal(page, 'practise');
  await strip(page).locator('[data-action="toggle-metronome"]').click();
  await strip(page).locator('[data-action="toggle-count-in"]').click();
  await page.locator('.practice-panel [data-action="preset-tempo"][data-bpm="120"]').click();
  await page.locator('.practice-panel [data-action="preset-swing"][data-amount="33"]').click();
  await page.locator('.practice-panel .swing-feel').selectOption('sixteenth');
  await page.locator('.practice-panel .counting-picker').selectOption('numbered');
  await expect(page.locator('.dialog')).toHaveCount(0);

  await openShippedMelodic(page);
  await page.locator('.practice-panel [data-action="toggle-fill-cycle"]').click();
  await page.locator('.practice-panel [data-action="toggle-progression-cycle"]').click();
  await page.locator('.practice-panel .fill-cycle-repeats').fill('2');
  await page.locator('.practice-panel .fill-cycle-repeats').dispatchEvent('change');
  await expect(page.locator('.dialog')).toHaveCount(0);

  const after = await stores();
  expect(after).toEqual(before);
  expect(after.owned).toBe(false);
});
