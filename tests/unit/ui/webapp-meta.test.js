import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

// iOS opens a Home-Screen entry standalone only when the page declares the web-app metas;
// without them the saved icon is a plain bookmark that opens in the device's default
// browser with full browser chrome (T208). The safe-area padding in tokens.css relies on
// viewport-fit=cover once the standalone view extends under the status bar.
describe('Home-Screen web app declaration', () => {
  const html = readFileSync('index.html', 'utf8');

  it('AC-15.1.15/1 — `index.html` declares the Home-Screen web-app metas: `apple-mobile-web-app-capable` yes, `apple-mobile-web-app-status-bar-style` black-translucent, `apple-mobile-web-app-title` Rhythm Master, and a viewport with `viewport-fit=cover` so the existing safe-area padding keeps the top controls clear of the status bar', () => {
    expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*"/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes"/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-title" content="Rhythm Master"/);
    const css = readFileSync('src/styles/tokens.css', 'utf8');
    expect(css).toMatch(/env\(safe-area-inset-top\)/);
  });

  it("AC-15.1.15/2 — `index.html` links an `apple-touch-icon`, and the image it names ships with the build, so the saved icon is the app's own rather than a page screenshot", () => {
    const link = html.match(/<link rel="apple-touch-icon" href="\/([^"]+)"/);
    expect(link).not.toBeNull();
    // Vite copies public/ to the site root, so /apple-touch-icon.png ships as public/apple-touch-icon.png
    expect(existsSync(`public/${link[1]}`)).toBe(true);
  });
});
