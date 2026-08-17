/**
 * Confirmation and naming prompts.
 *
 * core/ never prompts — it just performs the mutation. The decision to warn
 * lives here, which is why AC-1.3.7 and AC-1.3.8 are UI criteria: the Pattern
 * layer clears a Beat on any Recipe change, and this is what asks first.
 */

let host = null;

function ensureHost() {
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.className = 'dialog-host';
  document.body.appendChild(host);
  return host;
}

/**
 * A modal question. Resolves to the chosen option's `value`.
 *
 * @param {{message: string, options: Array<{label: string, value: any, primary?: boolean}>}} spec
 */
export function ask({ message, options }) {
  const root = ensureHost();
  return new Promise((resolve) => {
    root.innerHTML = '';

    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';

    const box = document.createElement('div');
    box.className = 'dialog';
    box.setAttribute('role', 'dialog');

    const text = document.createElement('p');
    text.className = 'dialog-message';
    text.textContent = message;
    box.appendChild(text);

    const row = document.createElement('div');
    row.className = 'dialog-actions';
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `dialog-button${option.primary ? ' primary' : ''}`;
      button.textContent = option.label;
      button.dataset.value = String(option.value);
      button.addEventListener('click', () => {
        root.innerHTML = '';
        resolve(option.value);
      });
      row.appendChild(button);
    }
    box.appendChild(row);

    backdrop.appendChild(box);
    root.appendChild(backdrop);
    box.querySelector('.dialog-button')?.focus();
  });
}

export function confirm(message, { confirmLabel = 'Continue', cancelLabel = 'Cancel' } = {}) {
  return ask({
    message,
    options: [
      { label: confirmLabel, value: true, primary: true },
      { label: cancelLabel, value: false },
    ],
  });
}

/**
 * The Recipe-change guard. Required in BOTH directions whenever the Beat has
 * notes, because a Recipe change clears the Beat regardless of whether the Slot
 * count grows or shrinks (AC-1.3.6 … AC-1.3.8). An empty Beat changes silently
 * (AC-1.3.10).
 */
export function confirmRecipeChange(activeSlots) {
  if (activeSlots === 0) return Promise.resolve(true);
  const noun = activeSlots === 1 ? 'note' : 'notes';
  return confirm(`Changing subdivision will clear ${activeSlots} ${noun} on this beat — continue?`);
}

/**
 * The first-Measure meter prompt. AC-1.1.5 — three outcomes, not two, because
 * "all Measures" and "just this one" are both legitimate and neither is a safe
 * default to assume.
 */
export function askApplyToAllMeasures(timeSignature) {
  return ask({
    message: `Apply ${timeSignature} to every Measure, or only this one?`,
    options: [
      { label: 'All Measures', value: 'all', primary: true },
      { label: 'This Measure', value: 'one' },
      { label: 'Cancel', value: 'cancel' },
    ],
  });
}

/**
 * Naming an edit to a shipped Pattern, before the edit applies. US-7.3, US-7.4.
 *
 * @param {string} suggestion
 * @param {(name: string) => string|null} [validate] returns an error message, or
 *   null when the name is acceptable. Used to enforce unique names
 *   (AC-7.3.5, AC-7.4.4) without this module knowing what the library holds.
 */
export function askNewPatternName(suggestion, validate = null) {
  const root = ensureHost();
  return new Promise((resolve) => {
    root.innerHTML = '';

    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog';
    box.setAttribute('role', 'dialog');

    const text = document.createElement('p');
    text.className = 'dialog-message';
    text.textContent =
      'This is a built-in pattern. Give your version a name to start editing it.';
    box.appendChild(text);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dialog-input';
    input.value = suggestion;
    box.appendChild(input);

    const row = document.createElement('div');
    row.className = 'dialog-actions';

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'dialog-button primary';
    save.textContent = 'Create';
    // Appended, not inserted before `row`: `row` is not a child of `box` yet at
    // this point, and insertBefore against a non-child throws.
    const error = document.createElement('p');
    error.className = 'dialog-error';
    error.hidden = true;
    box.appendChild(error);

    save.addEventListener('click', () => {
      const name = input.value.trim();
      if (!name) {
        error.textContent = 'A Pattern needs a name.';
        error.hidden = false;
        input.focus();
        return;
      }
      const problem = validate?.(name) ?? null;
      if (problem) {
        // Re-prompt rather than closing: the Composer keeps what they typed and
        // can adjust it, instead of losing it to a dismissed dialog.
        error.textContent = problem;
        error.hidden = false;
        input.select();
        return;
      }
      root.innerHTML = '';
      resolve(name);
    });

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dialog-button';
    cancel.textContent = 'Cancel';
    // Cancelling discards the pending edit and leaves the shipped Pattern
    // untouched — never a partial application (AC-7.3.x).
    cancel.addEventListener('click', () => {
      root.innerHTML = '';
      resolve(null);
    });

    row.append(save, cancel);
    box.appendChild(row);
    backdrop.appendChild(box);
    root.appendChild(backdrop);
    input.select();
  });
}

/**
 * A single free-text prompt. Resolves to the trimmed text, or null if cancelled.
 * Used for adding a Tag, where a full naming dialog would be overkill.
 */
export function askForText({ message, placeholder = '', confirmLabel = 'OK' }) {
  const root = ensureHost();
  return new Promise((resolve) => {
    root.innerHTML = '';

    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog';
    box.setAttribute('role', 'dialog');

    const text = document.createElement('p');
    text.className = 'dialog-message';
    text.textContent = message;
    box.appendChild(text);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'dialog-input';
    input.placeholder = placeholder;
    box.appendChild(input);

    const finish = (value) => {
      root.innerHTML = '';
      resolve(value);
    };

    const row = document.createElement('div');
    row.className = 'dialog-actions';

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'dialog-button primary';
    ok.textContent = confirmLabel;
    ok.addEventListener('click', () => finish(input.value.trim() || null));

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dialog-button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => finish(null));

    // Enter commits, so adding several tags in a row does not need the mouse.
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(input.value.trim() || null);
      if (e.key === 'Escape') finish(null);
    });

    row.append(ok, cancel);
    box.appendChild(row);
    backdrop.appendChild(box);
    root.appendChild(backdrop);
    input.focus();
  });
}

/**
 * Copy text to the clipboard, falling back to a selection-and-`execCommand` when
 * the async Clipboard API is unavailable — it needs a secure context, and the app
 * is also opened from `file://` and over plain HTTP on a phone on the same network.
 *
 * @returns {Promise<boolean>} whether the text actually reached the clipboard
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denied, or no secure context. The fallback below still has a chance.
  }
  try {
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';
    document.body.appendChild(scratch);
    scratch.select();
    const ok = document.execCommand('copy');
    scratch.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * The submission hand-off. AC-13.1.1, AC-13.1.2, AC-13.1.3.
 *
 * The app never posts to GitHub — it builds a URL and hands it over on GitHub's
 * own domain, where the Contributor is authenticated as themselves (Principle V,
 * FR-008). So this dialog's whole job is to present that URL as a link the
 * Contributor clicks, and it opens in a new tab so the app and everything unsaved
 * in it survives the trip.
 *
 * The full text is always here to be copied, whether or not it fitted in the URL
 * (AC-13.1.2), because a submission that GitHub rejects for length would otherwise
 * lose work that only exists in this browser.
 *
 * @param {object} spec
 * @param {{url: string, body: string, truncated: boolean}} spec.submission
 * @param {string} spec.summary       what is being submitted, in words
 * @param {() => void} [spec.onOpened] called when the link is actually followed —
 *   which is the moment worth recording as "submitted", not the moment the button
 *   was pressed
 */
export function showSubmission({ submission, summary, onOpened }) {
  const root = ensureHost();

  return new Promise((resolve) => {
    root.innerHTML = '';

    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog submission-view';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Submit to the shared library');

    box.appendChild(
      Object.assign(document.createElement('p'), {
        className: 'dialog-message',
        textContent: summary,
      })
    );

    const link = document.createElement('a');
    link.className = 'dialog-link';
    link.dataset.action = 'open-submission';
    link.href = submission.url;
    link.target = '_blank';
    // Opener access is never needed and is the one thing a new tab should not get.
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open the pre-filled issue on GitHub';
    link.addEventListener('click', () => onOpened?.());
    box.appendChild(link);

    if (submission.truncated) {
      box.appendChild(
        Object.assign(document.createElement('p'), {
          className: 'dialog-note submission-fallback',
          textContent:
            'This batch is too long to pre-fill. Click "Copy all to clipboard", then paste into the issue body once the page opens.',
        })
      );
    }

    const status = Object.assign(document.createElement('p'), {
      className: 'dialog-note',
      hidden: true,
    });

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = `dialog-button${submission.truncated ? ' primary' : ''}`;
    copy.dataset.action = 'copy-submission';
    copy.textContent = 'Copy all to clipboard';
    copy.addEventListener('click', async () => {
      const ok = await copyToClipboard(submission.body);
      status.textContent = ok
        ? 'Copied. Paste it into the issue body.'
        : 'This browser blocked the copy — select the text on GitHub’s page and paste it yourself.';
      status.hidden = false;
    });

    const done = document.createElement('button');
    done.type = 'button';
    done.className = `dialog-button${submission.truncated ? '' : ' primary'}`;
    done.dataset.action = 'close-submission';
    done.textContent = 'Done';
    done.addEventListener('click', () => {
      root.innerHTML = '';
      resolve();
    });

    actions.append(copy, done);
    box.append(actions, status);
    backdrop.appendChild(box);
    root.appendChild(backdrop);
    link.focus();
  });
}

/**
 * The possible-duplicates view. AC-11.1.4, AC-11.1.5, AC-11.1.6.
 *
 * Library-wide and standing, rather than a warning: duplicates that emerge through
 * ongoing auto-saved edits never interrupt anyone (AC-11.1.3 confines warnings to the
 * two moments a Pattern is actually created), so this view is the only place such a
 * pair is ever seen. It stays open across removals, because a library with one
 * duplicate pair usually has several and closing after each would make clearing them
 * a sequence of round trips.
 *
 * @param {object} spec
 * @param {() => Array<Array<object>>} spec.groups     recomputed after every removal
 * @param {(id: string) => boolean}    spec.isOwned    shipped Patterns get no Remove (AC-7.5.3)
 * @param {(pattern: object, survivors: Array<object>) => Promise<boolean>} spec.onRemove
 */
export function showDuplicates({ groups, isOwned, onRemove }) {
  const root = ensureHost();

  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';

    const box = document.createElement('div');
    box.className = 'dialog duplicates-view';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Possible duplicates');

    const close = () => {
      root.innerHTML = '';
      resolve();
    };

    const paint = () => {
      box.innerHTML = '';
      box.appendChild(
        Object.assign(document.createElement('h2'), {
          className: 'dialog-title',
          textContent: 'Possible duplicates',
        })
      );

      const found = groups();

      if (found.length === 0) {
        box.appendChild(
          Object.assign(document.createElement('p'), {
            className: 'dialog-message',
            textContent: 'No two Patterns in your library are note-for-note identical.',
          })
        );
      } else {
        box.appendChild(
          Object.assign(document.createElement('p'), {
            className: 'dialog-message',
            textContent:
              found.length === 1
                ? 'One set of Patterns is note-for-note identical.'
                : `${found.length} sets of Patterns are note-for-note identical.`,
          })
        );

        const list = document.createElement('ul');
        list.className = 'duplicate-groups';

        for (const group of found) {
          const groupItem = document.createElement('li');
          groupItem.className = 'duplicate-group';

          for (const pattern of group) {
            const row = document.createElement('div');
            row.className = 'duplicate-row';
            row.dataset.patternId = pattern.id;

            const name = document.createElement('span');
            name.className = 'duplicate-name';
            name.textContent = pattern.name;
            row.appendChild(name);

            // A shipped Pattern is never removable (AC-7.5.3), and says why rather
            // than showing a control that would refuse.
            if (isOwned(pattern.id)) {
              const remove = document.createElement('button');
              remove.type = 'button';
              remove.className = 'dialog-button duplicate-remove';
              remove.dataset.action = 'remove-duplicate';
              remove.dataset.patternId = pattern.id;
              remove.textContent = 'Remove';
              remove.addEventListener('click', async () => {
                const survivors = group.filter((p) => p.id !== pattern.id);
                const removed = await onRemove(pattern, survivors);
                // `onRemove` puts up a confirmation, which shares this host and empties
                // it — so the view has to be put back, not merely repainted into a box
                // that is no longer in the document.
                show(removed);
              });
              row.appendChild(remove);
            } else {
              const note = document.createElement('span');
              note.className = 'duplicate-note';
              note.textContent = 'ships with the app';
              row.appendChild(note);
            }

            groupItem.appendChild(row);
          }
          list.appendChild(groupItem);
        }
        box.appendChild(list);
      }

      const actions = document.createElement('div');
      actions.className = 'dialog-actions';
      const done = document.createElement('button');
      done.type = 'button';
      done.className = 'dialog-button primary';
      done.dataset.action = 'close-duplicates';
      done.textContent = 'Done';
      done.addEventListener('click', close);
      actions.appendChild(done);
      box.appendChild(actions);
      done.focus();
    };

    /**
     * Put the view on screen, repainting it first when the library has changed under it.
     * Re-attaching every time is what survives a confirmation dialog having cleared the
     * shared host in between.
     */
    function show(repaint = true) {
      if (repaint) paint();
      root.innerHTML = '';
      backdrop.appendChild(box);
      root.appendChild(backdrop);
    }

    show();
  });
}
