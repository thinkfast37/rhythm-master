/**
 * Saving the whole-library backup as a file (US-7.6). The file's contents are
 * `storage/backup.js`; this only hands them to the browser as a download.
 */
export function downloadBackup(text, filename) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
