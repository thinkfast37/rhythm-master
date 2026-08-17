/**
 * The Pattern library: browse, search, Tag filter, rate, navigate.
 *
 * Sorting is alphabetical by name, then by rating within that — the order the
 * maintainer asked for, and stable regardless of which store a Pattern came
 * from, so shipped and owned Patterns interleave naturally (US-5.1).
 */
import { automaticTags } from '../core/pattern.js';

/** Automatic Tags render as outlined chips with no removal control (D-007). */
export const AUTOMATIC_TAGS = ['custom', 'swing', 'percussive', 'melodic'];

/**
 * Every Pattern with its provenance and derived Tags attached for display.
 * Derived on read, never persisted (data-model §4).
 */
export function buildEntries(shipped, owned) {
  const entries = [
    ...shipped.map((p) => ({ pattern: p, owned: false })),
    ...owned.map((p) => ({ pattern: p, owned: true })),
  ];
  return entries.map((e) => ({
    ...e,
    autoTags: automaticTags(e.pattern, e.owned),
    userTags: e.pattern.tags ?? [],
  }));
}

/** Alphabetical by name, then by rating (highest first) within a name. */
export function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const byName = a.pattern.name.localeCompare(b.pattern.name, undefined, { sensitivity: 'base' });
    if (byName !== 0) return byName;
    return (b.pattern.rating ?? 0) - (a.pattern.rating ?? 0);
  });
}

/** Case-insensitive substring match over name and both Tag kinds. */
export function filterEntries(entries, { query = '', tag = null, minRating = 0 } = {}) {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (tag && ![...e.autoTags, ...e.userTags].some((t) => String(t).toLowerCase() === tag.toLowerCase())) {
      return false;
    }
    // Rating narrows whatever the Tag and query filters already produced,
    // rather than replacing them (AC-6.1.6).
    if (minRating > 0 && (e.pattern.rating ?? 0) < minRating) return false;
    if (!q) return true;
    const haystack = [e.pattern.name, ...e.autoTags, ...e.userTags].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

/** Every Tag in use, automatic ones first, then user Tags alphabetically. */
export function allTags(entries) {
  const auto = new Set();
  const user = new Set();
  for (const e of entries) {
    for (const t of e.autoTags) auto.add(t);
    for (const t of e.userTags) user.add(String(t));
  }
  return [
    ...AUTOMATIC_TAGS.filter((t) => auto.has(t)).map((name) => ({ name, automatic: true })),
    ...[...user].sort((a, b) => a.localeCompare(b)).map((name) => ({ name, automatic: false })),
  ];
}

function el(tag, className, props = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  Object.assign(node, props);
  return node;
}

export function renderLibrary(root, entries, viewState, handlers) {
  root.innerHTML = '';
  root.className = 'library';

  const search = el('input', 'library-search', {
    type: 'search',
    placeholder: 'Search patterns',
    value: viewState.query ?? '',
  });
  search.dataset.action = 'search';
  search.addEventListener('input', (e) => handlers.onSearch(e.target.value));
  root.appendChild(search);

  const newButton = el('button', 'new-pattern', { type: 'button', textContent: '+ New Pattern' });
  newButton.dataset.action = 'new-pattern';
  newButton.addEventListener('click', () => handlers.onNewPattern());
  root.appendChild(newButton);

  const ratingFilter = el('div', 'rating-filter');
  for (const min of [0, 3, 4, 5]) {
    const b = el('button', `rating-option${(viewState.minRating ?? 0) === min ? ' on' : ''}`, {
      type: 'button',
      textContent: min === 0 ? 'All' : `${min}★+`,
    });
    b.dataset.action = 'filter-rating';
    b.dataset.min = String(min);
    b.addEventListener('click', () => handlers.onRatingFilter(min));
    ratingFilter.appendChild(b);
  }
  root.appendChild(ratingFilter);

  const tagRow = el('div', 'tag-row');
  for (const t of allTags(entries)) {
    // Deliberately NOT `.tag-chip`: a filter chip and a Pattern's own Tag chip
    // look similar but do different things, and sharing a class made them
    // indistinguishable to anything selecting by it.
    const chip = el('button', `tag-filter ${t.automatic ? 'automatic' : 'user'}`, {
      type: 'button',
      textContent: t.name,
    });
    chip.dataset.action = 'filter-tag';
    chip.dataset.tag = t.name;
    chip.dataset.automatic = String(t.automatic);
    if (viewState.tag === t.name) chip.classList.add('on');
    chip.addEventListener('click', () =>
      handlers.onTagFilter(viewState.tag === t.name ? null : t.name)
    );
    tagRow.appendChild(chip);
  }
  root.appendChild(tagRow);

  const visible = sortEntries(filterEntries(entries, viewState));

  const count = el('p', 'library-count', {
    textContent: `${visible.length} pattern${visible.length === 1 ? '' : 's'}`,
  });
  root.appendChild(count);

  const list = el('ul', 'pattern-list');
  for (const entry of visible) {
    list.appendChild(renderEntry(entry, viewState, handlers));
  }
  root.appendChild(list);

  return root;
}

function renderEntry(entry, viewState, handlers) {
  const { pattern, owned, autoTags, userTags } = entry;

  const item = el('li', 'pattern-item');
  item.dataset.patternId = pattern.id;
  item.dataset.owned = String(owned);
  if (viewState.currentId === pattern.id) item.classList.add('current');

  const open = el('button', 'pattern-name', { type: 'button', textContent: pattern.name });
  open.dataset.action = 'open-pattern';
  open.addEventListener('click', () => handlers.onOpen(pattern.id, owned));
  item.appendChild(open);

  item.appendChild(renderStars(pattern, handlers));

  const tags = el('div', 'pattern-tags');
  // Automatic Tags: outlined, no removal control — you cannot delete them, and
  // the absent "×" says so without a glyph to interpret (AC-5.3.5).
  for (const t of autoTags) {
    const chip = el('span', 'tag-chip automatic', { textContent: t });
    chip.dataset.automatic = 'true';
    tags.appendChild(chip);
  }
  for (const t of userTags) {
    const chip = el('span', 'tag-chip user', { textContent: t });
    chip.dataset.automatic = 'false';
    const remove = el('button', 'tag-remove', { type: 'button', textContent: '×' });
    remove.dataset.action = 'remove-tag';
    remove.dataset.tag = t;
    remove.addEventListener('click', () => handlers.onRemoveTag(pattern.id, t));
    chip.appendChild(remove);
    tags.appendChild(chip);
  }
  item.appendChild(tags);

  return item;
}

function renderStars(pattern, handlers) {
  const wrap = el('div', 'rating');
  wrap.dataset.rating = String(pattern.rating ?? 0);
  for (let n = 1; n <= 5; n++) {
    const star = el('button', `star${n <= (pattern.rating ?? 0) ? ' on' : ''}`, {
      type: 'button',
      textContent: n <= (pattern.rating ?? 0) ? '★' : '☆',
    });
    star.dataset.action = 'rate';
    star.dataset.value = String(n);
    // Tapping the current rating clears it, so 0 is reachable without a
    // separate control.
    star.addEventListener('click', () =>
      handlers.onRate(pattern.id, n === pattern.rating ? 0 : n)
    );
    wrap.appendChild(star);
  }
  return wrap;
}

/** Prev/Next traverse the filtered, sorted order the musician is looking at. */
export function neighbours(entries, viewState) {
  const visible = sortEntries(filterEntries(entries, viewState));
  const i = visible.findIndex((e) => e.pattern.id === viewState.currentId);
  if (i === -1) return { previous: null, next: visible[0] ?? null };
  return {
    previous: i > 0 ? visible[i - 1] : visible[visible.length - 1],
    next: i < visible.length - 1 ? visible[i + 1] : visible[0],
  };
}
