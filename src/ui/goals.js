/**
 * The goals screen and the goal strip (US-14.1, AC-15.1.20/2).
 *
 * The screen stands in for the main panel and the library until a goal is
 * chosen (AC-14.1.1), in the four groups of storyboard board 1; the strip is
 * the pinned bar's second row, carrying the goal's name and the goal's own
 * quick controls: the level, Give me one, Pick from the library, Click and
 * Count-in under Practise a rhythm (AC-14.1.4, AC-14.1.5/4), the Help toggle
 * under Lab (AC-14.1.3/3), and — until Play it in is the Composer's own screen
 * — the Practice | Composer switch on every goal but Practise (AC-19.1.1/1).
 */
import { GOALS, GOAL_GROUPS, LAB, goalById, isPracticeGoal, LEVELS, ANY_LEVEL } from '../core/goals.js';
import { el, rebuild, renderClickControls } from './controls.js';
import { placeHelp } from './help.js';

/** Every goal, named and described, in board 1's groups, with the current one marked (AC-14.1.1/2, /4). */
export function renderGoals(root, state, handlers) {
  root.className = 'goals';
  root.dataset.section = 'goals';
  return rebuild(root, (fresh) => {
    const current = goalById(state.settings.goal).id;
    const chosen = state.settings.goal !== null && state.settings.goal !== undefined;
    fresh.appendChild(el('h1', 'goals-title', { textContent: 'Rhythm Master' }));
    fresh.appendChild(el('p', 'goals-lead', { textContent: 'What do you want to do today?' }));

    const card = (goal, number = null) => {
      const b = el('button', 'goal-card', { type: 'button' });
      b.dataset.action = 'choose-goal';
      b.dataset.goal = goal.id;
      if (chosen && goal.id === current) b.setAttribute('aria-current', 'true');
      const title = el('span', 'goal-card-title', { textContent: goal.title });
      if (number !== null) {
        // The making goals are the stages the app grew in, numbered as such.
        title.prepend(el('span', 'goal-card-number', { textContent: String(number) }));
      }
      b.appendChild(title);
      b.appendChild(el('span', 'goal-card-blurb', { textContent: goal.blurb }));
      b.addEventListener('click', () => handlers.onGoal?.(goal.id));
      return b;
    };

    for (const group of GOAL_GROUPS) {
      const section = el('section', `goal-group${group.id === LAB ? ' goal-group-lab' : ''}`);
      section.dataset.goalGroup = group.id;
      section.appendChild(el('h2', 'goal-group-title', { textContent: group.title }));
      const list = el('div', 'goal-list');
      list.dataset.numbered = String(Boolean(group.numbered));
      let n = 0;
      for (const goal of GOALS.filter((g) => g.group === group.id)) {
        n += 1;
        list.appendChild(card(goal, group.numbered ? n : null));
      }
      section.appendChild(list);
      fresh.appendChild(section);
    }
  });
}

/**
 * The goal strip: the goal's name, then the goal's own quick controls.
 * Rendered only once a goal has been chosen; empty and hidden before.
 */
export function renderGoalStrip(root, state, handlers) {
  root.className = 'goal-strip';
  const id = state.settings.goal;
  root.hidden = !id;
  return rebuild(root, (fresh) => {
    if (root.hidden) return;
    const goal = goalById(id);

    fresh.appendChild(el('span', 'goal-name', { textContent: goal.title }));

    if (isPracticeGoal(id)) {
      // The level, Beginner to begin with (AC-14.1.4/1).
      const level = el('select', 'level-picker');
      level.dataset.action = 'set-level';
      level.setAttribute('aria-label', 'Level');
      // The three levels, then Any level (AC-14.1.4/5): the whole library,
      // to see how hard things get.
      for (const [value, text] of [...LEVELS.map((n) => [n, n]), [ANY_LEVEL, 'Any level']]) {
        const option = el('option', '', { value, textContent: text });
        option.selected = value === state.settings.level;
        level.appendChild(option);
      }
      level.addEventListener('change', (e) => handlers.onLevel?.(e.target.value));
      fresh.appendChild(level);

      // The dice (AC-14.1.4/2): a rhythm at random, at the level set.
      const give = el('button', 'give-one', { type: 'button' });
      give.append('\u{1F3B2}', el('span', 'give-word', { textContent: ' Give me one' }));
      give.dataset.action = 'give-me-one';
      give.setAttribute('aria-label', 'Give me one: load a rhythm at random');
      give.setAttribute('title', 'Load a rhythm at random, at this level');
      give.addEventListener('click', () => handlers.onGiveMeOne?.());
      fresh.appendChild(give);

      const pick = el('button', 'pick-one', { type: 'button' });
      pick.append('Pick', el('span', 'pick-word', { textContent: ' from the library' }));
      pick.dataset.action = 'pick-from-library';
      pick.setAttribute('title', 'Open the library filtered to this level');
      pick.addEventListener('click', () => handlers.onPickFromLibrary?.());
      fresh.appendChild(pick);

      // The quick toggles (AC-14.1.5/4): Click and Count-in, one tap away in
      // the strip, as storyboard board 2 draws them.
      const quick = renderClickControls(state, handlers);
      quick.classList.add('strip-quick');
      fresh.appendChild(quick);
    } else {
      // Practice | Composer (AC-19.1.1/1): the Composer's door, carried in the
      // strip until Play it in is its own screen (AC-14.1.2/6, AC-15.1.20/2).
      fresh.appendChild(renderModeSwitch(state, handlers));
    }

    if (id === LAB) {
      const on = Boolean(state.settings.labHelp);
      const help = el('button', `help-toggle${on ? ' on' : ''}`, { type: 'button', textContent: 'Help' });
      help.dataset.action = 'toggle-help';
      help.setAttribute('aria-pressed', String(on));
      help.addEventListener('click', () => handlers.onHelp?.(!on));
      fresh.appendChild(help);
    }
    placeHelp(fresh, 'bar', state);
  });
}

/** The two-way Practice | Composer switch, the mode in force pressed (AC-19.1.1/1). */
function renderModeSwitch(state, handlers) {
  const group = el('div', 'mode-switch', { role: 'group' });
  group.setAttribute('aria-label', 'Mode');
  for (const [mode, label] of [
    ['practice', 'Practice'],
    ['composer', 'Composer'],
  ]) {
    const b = el('button', 'mode-option', { type: 'button', textContent: label });
    b.dataset.action = 'set-mode';
    b.dataset.mode = mode;
    b.setAttribute('aria-pressed', String(mode === state.composer.mode));
    b.addEventListener('click', () => handlers.onComposerMode?.(mode));
    group.appendChild(b);
  }
  return group;
}
