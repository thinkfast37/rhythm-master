/**
 * The notice that a newer build is available. US-21.1
 *
 * A small strip at the foot of the window, outside the app's own render so that
 * redrawing a screen does not take it away. It stops nothing: it covers no
 * control it does not own, and playback goes on beneath it (AC-21.1.2/3).
 */

const CLASS = 'update-notice';

/** Take the notice down, if it is up. */
export function hideUpdateNotice(root = document.body) {
  root.querySelector(`.${CLASS}`)?.remove();
}

/**
 * Put the notice up, replacing any already there. AC-21.1.2/2
 *
 * @param {{ onReload: () => void, onDismiss: () => void }} handlers
 */
export function showUpdateNotice({ onReload, onDismiss }, root = document.body) {
  hideUpdateNotice(root);
  const notice = document.createElement('div');
  notice.className = CLASS;
  notice.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.className = 'update-notice-text';
  text.textContent = 'A newer version is available';

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'dialog-button primary update-reload';
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => onReload());

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'dialog-button update-dismiss';
  dismiss.textContent = 'Dismiss';
  dismiss.addEventListener('click', () => onDismiss());

  notice.append(text, reload, dismiss);
  root.appendChild(notice);
  return notice;
}
