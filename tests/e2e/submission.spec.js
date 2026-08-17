/**
 * US-13.1 — submitting a Pattern for the shared library.
 *
 * These are e2e rather than unit tests because the criteria are about the hand-off
 * itself: a link on screen that the Contributor clicks, opening GitHub's own page in
 * a new tab. `export/submit.js` can prove the URL is right and never that anybody can
 * reach it — which is exactly how Submit shipped as a button that did nothing.
 */
import { test, expect } from '@playwright/test';

test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined } });

/** Create an owned Pattern by editing a shipped one and naming the copy. */
async function makeOwned(page, name = 'Samba Break') {
  await page.locator('.slot').first().click();
  await page.locator('.dialog-input').fill(name);
  await page.locator('.dialog-button', { hasText: 'Create' }).click();
}

/**
 * Nothing in these tests may actually reach github.com — the app is offline by
 * design and a test that depends on a third party is a test that fails for reasons
 * of its own. The stub also proves the point of AC-13.1.1/3: every request the app
 * makes is visible here, and none of them is to GitHub.
 */
async function stubGitHub(page) {
  await page.context().route('https://github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>GitHub, stubbed.</p>' })
  );
}

const submissionLink = (page) => page.locator('[data-action="open-submission"]');

test("AC-13.1.1/1 — The submission URL carries the title, the `new-pattern` label and the Pattern's full definition as query parameters", async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Samba Break');
  await page.locator('[data-action="submit-pattern"]').click();

  const href = await submissionLink(page).getAttribute('href');
  const url = new URL(href);

  expect(url.origin + url.pathname).toBe('https://github.com/thinkfast37/rhythm-master/issues/new');
  expect(url.searchParams.get('title')).toBe('New Pattern: Samba Break');
  expect(url.searchParams.get('labels')).toBe('new-pattern');
  expect(url.searchParams.get('body')).toContain('### Pattern: Samba Break');
  expect(url.searchParams.get('body')).toContain('"soundMode"');
});

test("AC-13.1.1/2 — Submit presents the URL as a clickable link that opens GitHub's own issue page in a new tab", async ({ page }) => {
  await stubGitHub(page);
  await page.goto('/');
  await makeOwned(page, 'Samba Break');
  await page.locator('[data-action="submit-pattern"]').click();

  const link = submissionLink(page);
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('target', '_blank');

  const [opened] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  expect(opened.url()).toContain('github.com');
  expect(opened.url()).toContain('issues/new');
  // The app is still there behind it: submitting never costs the Contributor their place.
  expect(await page.evaluate(() => window.__rm.getState().pattern.name)).toBe('Samba Break');
});

test("AC-13.1.1/2 — Submit presents the URL as a clickable link that opens GitHub's own issue page in a new tab: following it is what records the submission", async ({ page }) => {
  await stubGitHub(page);
  await page.goto('/');
  await makeOwned(page, 'Samba Break');

  const submittedAt = async () =>
    page.evaluate(() => {
      const id = window.__rm.getState().pattern.id;
      return window.__rm.localMetaStore.forPattern(id).submittedAt ?? null;
    });

  await page.locator('[data-action="submit-pattern"]').click();
  // Opening the dialog is not submitting: a Pattern marked as sent that was only
  // looked at would exclude itself from the next bulk run and never go anywhere.
  expect(await submittedAt()).toBeNull();

  await Promise.all([page.context().waitForEvent('page'), submissionLink(page).click()]);
  expect(await submittedAt()).not.toBeNull();
});

test("AC-13.1.1/3 — No GitHub credential is held and GitHub's API is never called", async ({ page }) => {
  const requested = [];
  page.context().on('request', (r) => requested.push(r.url()));
  await stubGitHub(page);
  await page.goto('/');
  await makeOwned(page, 'Samba Break');
  await page.locator('[data-action="submit-pattern"]').click();
  await Promise.all([page.context().waitForEvent('page'), submissionLink(page).click()]);

  // The only github.com the app ever touches is the tab the Contributor opened
  // themselves, on the web form — never the API, and never with a credential.
  expect(requested.filter((u) => u.includes('api.github.com'))).toEqual([]);

  const stored = await page.evaluate(() => JSON.stringify(window.localStorage));
  expect(stored).not.toMatch(/token|api_key|authorization|gh[pousr]_/i);
});

test('AC-13.1.2 — Bulk submission batches multiple Patterns into one issue', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__rm.patternStore.saveAll(
      ['Samba Break', 'My Fill', 'Bossa Take 2'].map((name, i) => ({
        ...window.__rm.getState().pattern,
        id: `p_${i + 1}`,
        name,
      }))
    );
  });
  await page.locator('[data-action="submit-all"]').click();

  const url = new URL(await submissionLink(page).getAttribute('href'));
  expect(url.searchParams.get('title')).toBe('Bulk Pattern Submission (3 patterns)');
  expect(url.searchParams.get('labels')).toBe('new-pattern');

  const body = url.searchParams.get('body');
  expect(body.match(/```json/g)).toHaveLength(3);
  for (const name of ['Samba Break', 'My Fill', 'Bossa Take 2']) {
    expect(body).toContain(`### Pattern: ${name}`);
  }
});

test('AC-13.1.3/1 — A submission too large to prefill readably prefills the same content compressed', async ({
  page,
}) => {
  await page.goto('/');
  // Enough Patterns that the readable body cannot fit in a URL.
  await page.evaluate(() => {
    window.__rm.patternStore.saveAll(
      Array.from({ length: 40 }, (_, i) => ({
        ...window.__rm.getState().pattern,
        id: `p_${i + 1}`,
        name: `Pattern ${i + 1}`,
      }))
    );
  });
  await page.locator('[data-action="submit-all"]').click();

  const href = await submissionLink(page).getAttribute('href');
  expect(href).toContain('labels=new-pattern');
  // Still prefilled: nobody is asked to paste anything.
  expect(href).toContain('body=');
  expect(href.length).toBeLessThanOrEqual(8000);

  const sent = new URL(href).searchParams.get('body');
  expect(sent).toContain('```rhythm-master');
  expect(sent).toContain('v1 gzip base64url');

  // The block decodes, in the page, to all 40 Patterns.
  const decoded = await page.evaluate(
    (body) => window.__rm.readSubmittedPatterns(body).then((ps) => ps.map((p) => p.name)),
    sent
  );
  expect(decoded).toHaveLength(40);
  expect(decoded).toContain('Pattern 1');
  expect(decoded).toContain('Pattern 40');

  // Explained, not silently different — and no paste-it-yourself note, since there
  // is nothing to paste.
  await expect(page.locator('.submission-compressed')).toContainText('compressed block');
  await expect(page.locator('.submission-fallback')).toHaveCount(0);
});

test('AC-13.1.3/2 — A submission within the limit prefills title, label and body in full', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Samba Break');
  await page.locator('[data-action="submit-pattern"]').click();

  const href = await submissionLink(page).getAttribute('href');
  expect(href).toContain('title=');
  expect(href).toContain('labels=new-pattern');
  expect(href).toContain('body=');
  expect(href.length).toBeLessThanOrEqual(8000);
  // No paste-it-yourself note: nothing was left out of the link.
  await expect(page.locator('.submission-fallback')).toHaveCount(0);
});

test('AC-13.1.3/2 — A submission within the limit prefills title, label and body in full: a four-Measure Pattern, as reported', async ({
  page,
}) => {
  await page.goto('/');
  await makeOwned(page, 'Four Bar Line');
  // The reported case, built through the UI it was reported against.
  for (let i = 1; i < 4; i++) await page.locator('[data-action="add-measure"]').click();
  expect(await page.evaluate(() => window.__rm.getState().pattern.measures.length)).toBe(4);

  await page.locator('[data-action="submit-pattern"]').click();

  const href = await submissionLink(page).getAttribute('href');
  expect(href).toContain('body=');
  expect(href.length).toBeLessThanOrEqual(8000);
  await expect(page.locator('.submission-fallback')).toHaveCount(0);

  // The whole Pattern is in the link, not a prefix of it.
  const body = new URL(href).searchParams.get('body');
  expect(JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1)).measures).toHaveLength(4);
});

test('AC-13.1.4/1 — A Pattern submitted and unedited since is excluded from a later bulk submission', async ({ page }) => {
  await stubGitHub(page);
  await page.goto('/');
  await page.evaluate(() => {
    window.__rm.patternStore.saveAll(
      ['Samba Break', 'My Fill'].map((name, i) => ({
        ...window.__rm.getState().pattern,
        id: `p_${i + 1}`,
        name,
      }))
    );
  });

  await page.locator('[data-action="submit-all"]').click();
  await Promise.all([page.context().waitForEvent('page'), submissionLink(page).click()]);
  await page.locator('[data-action="close-submission"]').click();

  await page.locator('[data-action="submit-all"]').click();
  await expect(page.locator('.dialog-message')).toContainText('Nothing to submit');
});

test('AC-13.1.4/2 — A Pattern edited since it was submitted is included again', async ({ page }) => {
  await stubGitHub(page);
  await page.goto('/');
  await page.evaluate(() => {
    window.__rm.patternStore.saveAll(
      ['Samba Break', 'My Fill'].map((name, i) => ({
        ...window.__rm.getState().pattern,
        id: `p_${i + 1}`,
        name,
      }))
    );
  });

  await page.locator('[data-action="submit-all"]').click();
  await Promise.all([page.context().waitForEvent('page'), submissionLink(page).click()]);
  await page.locator('[data-action="close-submission"]').click();

  // "My Fill" changes; "Samba Break" does not.
  await page.evaluate(() => {
    const all = window.__rm.patternStore.loadAll();
    const fill = all.find((p) => p.name === 'My Fill');
    const slot = fill.measures[0].beats[0].slots[0];
    fill.measures[0].beats[0].slots[0] = { on: !slot.on };
    window.__rm.patternStore.upsert(fill);
  });

  await page.locator('[data-action="submit-all"]').click();
  const body = new URL(await submissionLink(page).getAttribute('href')).searchParams.get('body');
  expect(body).toContain('### Pattern: My Fill');
  expect(body).not.toContain('### Pattern: Samba Break');
});

test('AC-13.1.4/3 — A Pattern never submitted is included', async ({ page }) => {
  await page.goto('/');
  await makeOwned(page, 'Never Sent');
  await page.locator('[data-action="submit-all"]').click();

  const body = new URL(await submissionLink(page).getAttribute('href')).searchParams.get('body');
  expect(body).toContain('### Pattern: Never Sent');
});

test('AC-13.1.3/3 — A submission too large even compressed falls back to title and label with the paste-it-yourself note', async ({
  page,
}) => {
  await page.goto('/');
  // Real entropy in the music is the one thing gzip cannot fold away, so this is
  // what it takes to defeat the compressed tier rather than merely the readable one.
  await page.evaluate(() => {
    let seed = 1;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const base = window.__rm.getState().pattern;
    // 160 eight-Measure Patterns of noise, sized from the measured breakpoint in this
    // very page: 80 of them still compress to 4,618 and would prove the wrong tier.
    window.__rm.patternStore.saveAll(
      Array.from({ length: 160 }, (_, i) => {
        const p = structuredClone(base);
        p.id = `p_${i + 1}`;
        p.name = `Take ${i + 1}`;
        while (p.measures.length < 8) p.measures.push(structuredClone(p.measures[0]));
        for (const m of p.measures) {
          for (const b of m.beats) {
            b.slots = b.slots.map(() =>
              rand() > 0.5 ? { on: true, accent: 1 + Math.floor(rand() * 3) } : { on: false }
            );
          }
        }
        return p;
      })
    );
  });
  await page.locator('[data-action="submit-all"]').click();

  const href = await submissionLink(page).getAttribute('href');
  expect(href).toContain('labels=new-pattern');
  expect(href).not.toContain('body=');
  expect(href.length).toBeLessThanOrEqual(8000);

  await expect(page.locator('.submission-fallback')).toContainText('Copy all to clipboard');
  await expect(page.locator('[data-action="copy-submission"]')).toBeVisible();
  await expect(page.locator('.submission-compressed')).toHaveCount(0);
});
