/** menu.js — wiring for menu.html: campus toggles, export-all, backup/restore. */
import { exportAllRooms, exportStateJSON, importStateJSON } from './export.js';

export function initMenuPage() {
  document.querySelectorAll('.campus-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      const open = target.style.display !== 'none';
      target.style.display = open ? 'none' : 'flex';
      btn.textContent = open ? 'View Rooms ▾' : 'Hide Rooms ▴';
    });
  });

  document.getElementById('btn-export-all').addEventListener('click', () => exportAllRooms());

  document.getElementById('btn-backup-state').addEventListener('click', () => exportStateJSON());

  const restoreInput = document.getElementById('restore-state-input');
  document.getElementById('btn-restore-state').addEventListener('click', () => restoreInput.click());
  restoreInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await importStateJSON(file);
      alert('State restored from backup. Reloading…');
      window.location.reload();
    } catch (err) {
      alert('Could not restore that file: ' + err.message);
    } finally {
      restoreInput.value = '';
    }
  });
}
