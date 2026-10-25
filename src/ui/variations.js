/**
 * The Add variation picker (US-10.3, AC-10.3.4): the device catalogue by group,
 * the phrase length and the base to vary, Roll the dice, and a No dice toggle
 * on each group. A named dialog: focus comes in with it and goes back to the
 * control that opened it.
 *
 * No dice is session state — a toggle that persisted would be one more
 * remembered setting to find (research.md D-020) — and nothing here is Pattern
 * content.
 */
import { GROUPS, rollable, pick } from '../core/variations.js';

let host = null;
function ensureHost() {
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.className = 'dialog-host';
  document.body.appendChild(host);
  return host;
}

/** The groups marked No dice, for this session. */
const noDice = new Set();

const GROUP_HINTS = {
  Pitch: 'Needs a melody',
  Fill: 'Needs a progression and a fill',
};

/**
 * Open the picker.
 *
 * @param {object} spec
 * @param {number} spec.phraseLength      the length to open on (AC-10.3.2/1)
 * @param {number} spec.maxPhrase         the Pattern's length
 * @param {(phraseLength: number, base: string) => {devices: Array, baseChoice: boolean, hint: string|null}} spec.describe
 *   the catalogue with each device's availability on that base, whether a base
 *   choice exists, and the progression note (AC-10.3.2/4)
 * @param {() => number} [spec.random]    the dice; `Math.random` by default
 * @returns {Promise<{deviceId: string, phraseLength: number, base: string, rolled: boolean}|null>}
 */
export function showVariationPicker({ phraseLength, maxPhrase, describe, random = Math.random }) {
  const root = ensureHost();
  const opener = document.activeElement;
  let length = phraseLength;
  let base = 'original';

  return new Promise((resolve) => {
    root.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    const box = document.createElement('div');
    box.className = 'dialog variation-view';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Add variation');
    box.tabIndex = -1;

    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      root.innerHTML = '';
      if (opener && typeof opener.focus === 'function' && opener.isConnected) opener.focus();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
    };
    document.addEventListener('keydown', onKey);

    box.appendChild(Object.assign(document.createElement('h2'), { className: 'dialog-title', textContent: 'Add variation' }));
    box.appendChild(
      Object.assign(document.createElement('p'), {
        className: 'dialog-note',
        textContent: 'Appends a copy of the phrase with one device applied. One tap, one variation; add three or four and the loop changes on every repeat.',
      })
    );

    // --- the phrase: its length, and original or latest (AC-10.3.2) ---
    const phraseRow = document.createElement('div');
    phraseRow.className = 'variation-phrase';
    const lengthLabel = document.createElement('label');
    lengthLabel.className = 'variation-length';
    lengthLabel.append('Phrase ');
    const lengthSelect = document.createElement('select');
    lengthSelect.className = 'variation-length-select';
    lengthSelect.setAttribute('aria-label', 'Phrase length in Measures');
    for (let n = 1; n <= maxPhrase; n++) {
      lengthSelect.appendChild(Object.assign(document.createElement('option'), { value: String(n), textContent: `${n} ${n === 1 ? 'Measure' : 'Measures'}` }));
    }
    lengthSelect.value = String(length);
    lengthSelect.addEventListener('change', () => {
      length = Number(lengthSelect.value);
      paint();
    });
    lengthLabel.appendChild(lengthSelect);
    phraseRow.appendChild(lengthLabel);

    const baseWrap = document.createElement('div');
    baseWrap.className = 'variation-base';
    baseWrap.setAttribute('role', 'group');
    baseWrap.setAttribute('aria-label', 'Vary which phrase');
    for (const [value, label] of [
      ['original', 'Original phrase'],
      ['latest', 'Latest copy'],
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'variation-base-option';
      b.dataset.base = value;
      b.textContent = label;
      b.addEventListener('click', () => {
        base = value;
        paint();
      });
      baseWrap.appendChild(b);
    }
    phraseRow.appendChild(baseWrap);
    box.appendChild(phraseRow);

    const hint = Object.assign(document.createElement('p'), { className: 'variation-hint dialog-note' });
    box.appendChild(hint);

    // --- Roll the dice (AC-10.3.4/7) ---
    const roll = document.createElement('button');
    roll.type = 'button';
    roll.className = 'dialog-button primary variation-roll';
    roll.dataset.action = 'roll-variation';
    box.appendChild(roll);

    const list = document.createElement('div');
    list.className = 'variation-groups';
    box.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'dialog-actions variation-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'dialog-button';
    cancel.dataset.action = 'close-variation';
    cancel.textContent = 'Close';
    cancel.addEventListener('click', () => close(null));
    actions.appendChild(cancel);
    box.appendChild(actions);

    let devices = [];
    const paint = () => {
      const described = describe(length, base);
      devices = described.devices;
      if (!described.baseChoice) base = 'original';
      baseWrap.hidden = !described.baseChoice;
      for (const b of baseWrap.querySelectorAll('.variation-base-option')) {
        b.setAttribute('aria-pressed', String(b.dataset.base === base));
        b.classList.toggle('on', b.dataset.base === base);
      }
      hint.textContent = described.hint ?? '';
      hint.hidden = !described.hint;

      const canRoll = rollable(devices, [...noDice]).length > 0;
      roll.disabled = !canRoll;
      roll.textContent = canRoll ? '🎲 Roll the dice' : '🎲 Roll the dice — nothing left to roll';
      roll.title = canRoll ? 'Apply one available device at random, from the groups without No dice' : 'Every available device is in a group marked No dice';

      list.innerHTML = '';
      for (const group of GROUPS) {
        const section = document.createElement('section');
        section.className = 'variation-group';
        section.dataset.group = group;
        const head = document.createElement('div');
        head.className = 'variation-group-head';
        const h3 = Object.assign(document.createElement('h3'), { className: 'variation-group-label', textContent: group });
        head.appendChild(h3);
        const members = devices.filter((d) => d.group === group);
        // The group's own reason, when every device in it waits on the same thing (AC-10.3.4/3).
        const groupReason = GROUP_HINTS[group] && members.every((d) => d.reason) ? members[0].reason : null;
        if (groupReason) head.appendChild(Object.assign(document.createElement('span'), { className: 'variation-group-reason', textContent: groupReason }));
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'variation-nodice';
        toggle.dataset.group = group;
        toggle.textContent = 'No dice';
        toggle.title = 'Keep this group out of the roll';
        toggle.setAttribute('aria-pressed', String(noDice.has(group)));
        toggle.classList.toggle('on', noDice.has(group));
        toggle.addEventListener('click', () => {
          if (noDice.has(group)) noDice.delete(group);
          else noDice.add(group);
          paint();
        });
        head.appendChild(toggle);
        section.appendChild(head);

        const ul = document.createElement('ul');
        ul.className = 'variation-devices';
        for (const d of members) {
          const li = document.createElement('li');
          li.className = 'variation-device';
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'variation-device-button';
          b.dataset.device = d.id;
          b.disabled = Boolean(d.reason);
          const name = Object.assign(document.createElement('span'), { className: 'variation-device-name', textContent: d.label });
          const desc = Object.assign(document.createElement('span'), { className: 'variation-device-desc', textContent: d.reason ?? d.description });
          if (d.reason) desc.classList.add('reason');
          b.append(name, desc);
          b.setAttribute('aria-label', d.reason ? `${d.label}: ${d.reason}` : `${d.label}: ${d.description}`);
          b.addEventListener('click', () => close({ deviceId: d.id, phraseLength: length, base, rolled: false }));
          li.appendChild(b);
          ul.appendChild(li);
        }
        section.appendChild(ul);
        list.appendChild(section);
      }
    };

    roll.addEventListener('click', () => {
      const chosen = pick(rollable(devices, [...noDice]), random());
      if (chosen) close({ deviceId: chosen.id, phraseLength: length, base, rolled: true });
    });

    paint();
    backdrop.appendChild(box);
    root.appendChild(backdrop);
    box.focus();
  });
}
