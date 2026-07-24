/**
 * export.js — .txt status reports, plus JSON backup/restore of the raw
 * localStorage state (the practical workaround for state being per-device —
 * see the note in state.js).
 */
import { loadState, saveState } from './state.js';
import { formatDate, today } from './format.js';

export const ALL_ROOMS = [
  { id: 'LIBRARY', label: 'Library',  campus: 'King George Campus' },
  { id: 'S28-107', label: 'S28-107',  campus: 'King George Campus' },
  { id: 'S28-104', label: 'S28-104',  campus: 'King George Campus' },
  { id: 'GPL',     label: 'GPL',      campus: 'Lawson Tama Campus' },
  { id: 'MTL',     label: 'MTL',      campus: 'Lawson Tama Campus' },
];

/** Lines for one room — minor/major devices only. prefix=true prepends "[LABEL] ". */
function buildRoomLines(roomId, roomLabel, state, prefix) {
  const lines = [];
  const tag = prefix ? `[${roomLabel}] ` : '';
  const entries = Object.entries(state)
    .filter(([k]) => k.startsWith(roomId + '_'))
    .map(([k, v]) => ({ deviceId: k.slice(roomId.length + 1), ...v }))
    .filter(e => e.status === 'minor' || e.status === 'major')
    .sort((a, b) => (a.status === 'major' ? -1 : 1));

  entries.forEach(({ deviceId, status, notes, updatedAt }) => {
    const badge = status === 'major' ? '🔴 MAJOR' : '🟡 MINOR';
    const notePart = notes ? ` — ${notes}` : '';
    const datePart = updatedAt ? ` (${formatDate(updatedAt)})` : '';
    lines.push(`${tag}${deviceId}  ${badge}${notePart}${datePart}`);
  });
  return lines;
}

function download(content, filename, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function exportRoom(roomId, roomLabel) {
  const state = loadState();
  const issues = buildRoomLines(roomId, roomLabel, state, false);
  const lines = [
    'IT Room Monitor — Status Report',
    `Room: ${roomLabel}`,
    `Generated: ${new Date().toLocaleString()}`,
    '─'.repeat(44),
    '',
    ...(issues.length ? issues : ['No issues recorded.']),
    '',
    'All other devices are working properly.',
  ];
  download(lines.join('\n'), `report-${roomId}-${today()}.txt`);
}

export function exportAllRooms() {
  const state = loadState();
  const lines = [
    'IT Room Monitor — Full Status Report',
    `Generated: ${new Date().toLocaleString()}`,
    '─'.repeat(44),
    '',
  ];
  let lastCampus = '';
  ALL_ROOMS.forEach(({ id, label, campus }) => {
    if (campus !== lastCampus) {
      if (lastCampus) lines.push('');
      lines.push(`▌ ${campus}`);
      lastCampus = campus;
    }
    const issues = buildRoomLines(id, label, state, true);
    lines.push(`  [ ${label} ]`);
    if (issues.length) issues.forEach(l => lines.push(`  ${l}`));
    else lines.push('  No issues recorded.');
  });
  lines.push('', 'All other devices across all rooms are working properly.');
  download(lines.join('\n'), `report-ALL-${today()}.txt`);
}

/** Full raw-state backup, for manually transferring data between devices/browsers. */
export function exportStateJSON() {
  const state = loadState();
  download(JSON.stringify(state, null, 2), `state-backup-${today()}.json`, 'application/json');
}

/** Restores a raw-state backup produced by exportStateJSON. Overwrites current state. */
export async function importStateJSON(file) {
  const text = await file.text();
  const incoming = JSON.parse(text);
  if (typeof incoming !== 'object' || incoming === null || Array.isArray(incoming)) {
    throw new Error('That file doesn\'t look like a state backup.');
  }
  saveState(incoming);
  return incoming;
}
