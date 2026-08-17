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
    text.textContent = 'This Pattern ships with the app. Name your own copy to start editing.';
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
