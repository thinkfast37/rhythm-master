/**
 * US-15.2 — Structural boundaries in the grid are visible.
 *
 * These read computed styles from a real rendered grid rather than asserting
 * the token values in `tokens.css`. Asserting the tokens would prove only that
 * the file says what the file says: it would pass while a later rule overrode
 * them, or while the border was drawn on an element nobody can see. What has to
 * hold is what reaches the screen, so the ratios are computed here from the
 * colours the browser actually resolved.
 */
import { test, expect } from '@playwright/test';

test.use({
  launchOptions: {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  },
});

/**
 * WCAG 2.1 relative luminance and contrast, injected into the page so the
 * colours never make a round trip as strings.
 */
const CONTRAST_HELPERS = `
  const parse = (s) => s.match(/[\\d.]+/g).map(Number).slice(0, 3);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (a) => 0.2126 * lin(a[0]) + 0.7152 * lin(a[1]) + 0.0722 * lin(a[2]);
  const ratio = (a, b) => { const s = [lum(parse(a)), lum(parse(b))].sort((p, q) => q - p);
                            return (s[0] + 0.05) / (s[1] + 0.05); };
  const cs = (e) => getComputedStyle(e);
  // Cell grounds are translucent tints now (AC-3.1.18), so a colour must be
  // composited over what sits behind it before it means anything to the eye.
  const over = (fg, bg) => {
    const f = fg.match(/[\\d.]+/g).map(Number);
    const b = bg.match(/[\\d.]+/g).map(Number);
    const a = f.length > 3 ? f[3] : 1;
    return 'rgb(' + [0, 1, 2].map((i) => f[i] * a + b[i] * (1 - a)).join(',') + ')';
  };
`;

/** A Melodic Pattern with a sounding Slot, which is what puts a divider on screen. */
async function melodicGrid(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    window.__rm.loadBlank('4/4');
    await window.__rm.handlers.onSoundMode('melodic');
    await window.__rm.handlers.onSlotTap(0, 0, 0);
  });
  await expect(page.locator('.slot-note').first()).toBeVisible();
}

test('AC-15.2.1/1 — A Measure block’s border, against the page background behind it', async ({ page }) => {
  await melodicGrid(page);
  const contrast = await page.evaluate(`(() => {${CONTRAST_HELPERS}
    const measure = document.querySelector('.measure');
    return ratio(cs(measure).borderTopColor, cs(document.body).backgroundColor);
  })()`);
  expect(contrast).toBeGreaterThanOrEqual(3);
});

test('AC-15.2.1/2 — A Beat’s border, against the Measure panel behind it', async ({ page }) => {
  await melodicGrid(page);
  // The Beat boundary is a rule drawn in the gap by a pseudo-element, not a box
  // around each Beat (AC-15.2.2) — a border would make every Beat but the first
  // a different width, which AC-15.1.14/1 forbids.
  const contrast = await page.evaluate(`(() => {${CONTRAST_HELPERS}
    const beat = document.querySelectorAll('.beat')[1];
    const measure = document.querySelector('.measure');
    return ratio(getComputedStyle(beat, '::before').backgroundColor, cs(measure).backgroundColor);
  })()`);
  expect(contrast).toBeGreaterThanOrEqual(3);
});

test('AC-15.2.1/3 — A Slot’s border, against the Measure panel behind it', async ({ page }) => {
  await melodicGrid(page);
  const contrast = await page.evaluate(`(() => {${CONTRAST_HELPERS}
    const zone = document.querySelector('.slot.has-note .slot-accent');
    const measure = document.querySelector('.measure');
    return ratio(cs(zone).borderTopColor, cs(measure).backgroundColor);
  })()`);
  expect(contrast).toBeGreaterThanOrEqual(3);
});

test('AC-15.2.1/4 — A Melodic Slot’s accent-to-note divider, against the Slot’s unfilled background', async ({ page }) => {
  await melodicGrid(page);
  const contrast = await page.evaluate(`(() => {${CONTRAST_HELPERS}
    // The divider is drawn by the strip inside the note button, not by the
    // button: the button is the 24px tap target (AC-2.2.12) and the strip is
    // the thinner thing you see (AC-2.2.15/3).
    const strip = document.querySelector('.slot-note:not([disabled]) .slot-pitch');
    const zone = document.querySelector('.slot.has-note .slot-accent');
    const ground = over(cs(zone).backgroundColor, cs(zone.closest('.measure')).backgroundColor);
    return ratio(cs(strip).borderTopColor, ground);
  })()`);
  expect(contrast).toBeGreaterThanOrEqual(3);
});

test('AC-15.2.2 — A Beat boundary is drawn, not left to spacing alone', async ({ page }) => {
  await melodicGrid(page);
  const drawn = await page.evaluate(() => {
    const beats = [...document.querySelectorAll('.beat')];
    // Measured from what is painted rather than from `content`, which Chrome
    // reports inconsistently for an empty string.
    const painted = (el) => {
      const r = getComputedStyle(el, '::before');
      return { width: parseFloat(r.width) || 0, colour: r.backgroundColor };
    };
    return {
      rule: painted(beats[1]),
      // A rule BETWEEN Beats, not around each: the first draws none.
      first: painted(beats[0]),
      panel: getComputedStyle(document.querySelector('.measure')).backgroundColor,
      // And the Beats themselves carry no box, which is what made the grid read
      // as borders inside borders inside borders.
      beatBorder: getComputedStyle(beats[1]).borderTopStyle,
    };
  });

  expect(drawn.rule.width).toBeGreaterThan(0);
  expect(drawn.rule.colour).not.toBe('rgba(0, 0, 0, 0)');
  expect(drawn.rule.colour).not.toBe(drawn.panel);
  expect(drawn.first.colour).toBe('rgba(0, 0, 0, 0)');
  expect(drawn.beatBorder).toBe('none');
});

test('AC-15.2.3 — The boundaries form a hierarchy, so nesting is readable', async ({ page }) => {
  await melodicGrid(page);
  const lums = await page.evaluate(`(() => {${CONTRAST_HELPERS}
    const L = (sel) => lum(parse(cs(document.querySelector(sel)).borderTopColor));
    return {
      measure: L('.measure'),
      // The Beat's boundary is its separator rule, drawn as a pseudo-element.
      beat: lum(parse(getComputedStyle(document.querySelectorAll('.beat')[1], '::before').backgroundColor)),
      slot: L('.slot.has-note .slot-accent'),
    };
  })()`);
  expect(lums.measure).toBeGreaterThanOrEqual(lums.beat);
  expect(lums.beat).toBeGreaterThan(lums.slot);
});

test('AC-15.2.4 — The grid’s boundary colours belong to the grid alone', async ({ page }) => {
  await melodicGrid(page);

  const leaked = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const gridTokens = ['--grid-measure-line', '--grid-beat-line', '--grid-slot-line', '--grid-zone-line']
      .map((n) => root.getPropertyValue(n).trim().toLowerCase())
      .filter(Boolean);

    const hexToRgb = (h) => {
      const n = parseInt(h.replace('#', ''), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    const gridRgb = new Set(gridTokens.map(hexToRgb));

    // Every element outside the grid that draws a border at all.
    const found = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.grid')) continue;
      const s = getComputedStyle(el);
      for (const side of ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor']) {
        const styleSide = side.replace('Color', 'Style');
        if (s[styleSide] === 'none' || parseFloat(s[side.replace('Color', 'Width')]) === 0) continue;
        if (gridRgb.has(s[side])) {
          found.push(`${el.className || el.tagName} ${side}=${s[side]}`);
        }
      }
    }
    return { tokens: gridTokens.length, found };
  });

  expect(leaked.tokens).toBe(4);
  expect(leaked.found).toEqual([]);
});

test('AC-15.2.5 — Raising boundary contrast leaves the Accent and feel encodings intact', async ({ page }) => {
  await page.goto('/');
  // A mixed Recipe, so a straight group and a triplet group are both on screen,
  // and Slots at every Accent Level.
  await page.evaluate(async () => {
    const { handlers: h } = window.__rm;
    window.__rm.loadBlank('4/4');
    await h.onRecipe('straight-triplet-split', 0, 0);
    for (let s = 0; s < 3; s++) await h.onSlotTap(0, 0, s);
  });

  const state = await page.evaluate(`(() => {${CONTRAST_HELPERS}
    // The four Accent states are still distinct fills, not flattened into the
    // brighter chrome around them.
    const root = getComputedStyle(document.documentElement);
    const fills = ['--accent-off', '--accent-weak', '--accent-medium', '--accent-strong']
      .map((n) => root.getPropertyValue(n).trim());

    const triplet = document.querySelector('.group.feel-triplet');
    const slot = document.querySelector('.slot');
    return {
      distinctFills: new Set(fills).size,
      tripletStyle: triplet ? cs(triplet).borderBottomStyle : null,
      slotStyle: cs(slot).borderTopStyle,
      tripletColour: triplet ? cs(triplet).borderBottomColor : null,
      slotColour: cs(slot).borderTopColor,
    };
  })()`);

  expect(state.distinctFills).toBe(4);
  // The feel boundary stays distinguishable from an ordinary Slot border by
  // stroke style, not merely by colour — so a brighter grid cannot absorb it.
  expect(state.tripletStyle).toBe('dotted');
  expect(state.slotStyle).toBe('solid');
  expect(state.tripletColour).not.toBe(state.slotColour);
});
