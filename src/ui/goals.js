/**
 * The goals screen and the goal bar (US-14.1).
 *
 * The screen stands in for the main panel and the library until a goal is
 * chosen (AC-14.1.1); the bar is the second row of the pinned bar, carrying
 * the way back, the goal's name and the goal's own controls: the level, Give
 * me one and Pick from the library under a practice goal (AC-14.1.4), the Help
 * toggle under Lab (AC-14.1.3/3).
 */
import { GOALS, LEVELS, ANY_LEVEL, LAB, goalById, isPracticeGoal } from '../core/goals.js';
import { el, rebuild } from './controls.js';

const GROUPS = [
  ['practise', 'Practise'],
  ['compose', 'Compose'],
];

/** Every goal, named and described, with the current one marked (AC-14.1.1/2, /4). */
export function renderGoals(root, state, handlers) {
  root.className = 'goals';
  root.dataset.section = 'goals';
  return rebuild(root, (fresh) => {
    const current = state.settings.goal;
    fresh.appendChild(el('h1', 'goals-title', { textContent: 'Rhythm Master' }));
    fresh.appendChild(el('p', 'goals-lead', { textContent: 'What do you want to do?' }));

    const card = (goal) => {
      const b = el('button', 'goal-card', { type: 'button' });
      b.dataset.action = 'choose-goal';
      b.dataset.goal = goal.id;
      if (goal.id === current) b.setAttribute('aria-current', 'true');
      b.appendChild(el('span', 'goal-card-title', { textContent: goal.title }));
      b.appendChild(el('span', 'goal-card-blurb', { textContent: goal.blurb }));
      b.addEventListener('click', () => handlers.onGoal?.(goal.id));
      return b;
    };

    for (const [group, heading] of GROUPS) {
      const section = el('section', 'goal-group');
      section.dataset.goalGroup = group;
      section.appendChild(el('h2', 'goal-group-title', { textContent: heading }));
      const list = el('div', 'goal-list');
      for (const goal of GOALS.filter((g) => g.group === group)) list.appendChild(card(goal));
      section.appendChild(list);
      fresh.appendChild(section);
    }

    // Lab set apart (AC-14.1.1/2): not a job but the whole cockpit.
    const lab = el('section', 'goal-group goal-group-lab');
    lab.dataset.goalGroup = LAB;
    lab.appendChild(card(goalById(LAB)));
    fresh.appendChild(lab);
  });
}

/**
 * The goal bar: `‹ Goals`, the goal's name, then the goal's own controls.
 * Rendered only once a goal has been chosen; empty and hidden before.
 */
export function renderGoalBar(root, state, handlers) {
  root.className = 'goal-bar';
  const id = state.settings.goal;
  root.hidden = !id;
  return rebuild(root, (fresh) => {
    if (root.hidden) return;
    const goal = goalById(id);

    const back = el('button', 'goals-button', { type: 'button', textContent: '‹ Goals' });
    back.dataset.action = 'show-goals';
    back.setAttribute('title', 'Back to the goals screen');
    back.addEventListener('click', () => handlers.onShowGoals?.());
    fresh.appendChild(back);

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
    }

    if (id === LAB) {
      const on = Boolean(state.settings.labHelp);
      const help = el('button', `help-toggle${on ? ' on' : ''}`, { type: 'button', textContent: 'Help' });
      help.dataset.action = 'toggle-help';
      help.setAttribute('aria-pressed', String(on));
      help.addEventListener('click', () => handlers.onHelp?.(!on));
      fresh.appendChild(help);
    }
  });
}
