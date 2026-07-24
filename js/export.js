/**
 * export.js — CSV status reports, plus JSON backup/restore of the raw
 * localStorage state (the practical workaround for state being per-device —
 * see the note in state.js).
 *
 * Each report is a CSV file. For every room, devices are split into two
 * tables: "Working" and "Not Working" (minor/major/unknown all count as
 * Not Working, with their status shown in the Status column). Note: only
 * devices that have been clicked at least once (i.e. have a localStorage
 * entry) are listed — a device that's never been touched won't appear in
 * either table, same as the previous .txt report's behavior.
 *
 * Every export prompts for the name of the person generating the report;
 * cancelling the prompt cancels the export.
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

const STATUS_LABELS = { working: 'Working', minor: 'Minor', major: 'Major', unknown: 'Unknown' };
const NOT_WORKING_SEVERITY = { major: 0, minor: 1, unknown: 2 };

/** Escapes a single CSV field (quotes it if it contains a comma, quote, or newline). */
function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function csvRow(cells) {
  return cells.map(csvEscape).join(',');
}

/**
 * Splits a room's tracked devices into working / not-working rows.
 * Each row is [deviceId, statusLabel, notes, lastUpdated].
 */
function buildRoomRows(roomId, state) {
  const entries = Object.entries(state)
    .filter(([k]) => k.startsWith(roomId + '_'))
    .map(([k, v]) => ({ deviceId: k.slice(roomId.length + 1), ...v }));

  const working = entries
    .filter(e => e.status === 'working')
    .sort((a, b) => a.deviceId.localeCompare(b.deviceId, undefined, { numeric: true }))
    .map(e => [e.deviceId, 'Working', e.notes || '', e.updatedAt ? formatDate(e.updatedAt) : '']);

  const notWorking = entries
    .filter(e => e.status !== 'working')
    .sort((a, b) => {
      const sev = (NOT_WORKING_SEVERITY[a.status] ?? 2) - (NOT_WORKING_SEVERITY[b.status] ?? 2);
      return sev !== 0 ? sev : a.deviceId.localeCompare(b.deviceId, undefined, { numeric: true });
    })
    .map(e => [e.deviceId, STATUS_LABELS[e.status] || 'Unknown', e.notes || '', e.updatedAt ? formatDate(e.updatedAt) : '']);

  return { working, notWorking };
}

/** CSV lines for one room: a "Room" row followed by the Working and Not Working tables. */
function buildRoomBlock(roomLabel, roomId, state) {
  const { working, notWorking } = buildRoomRows(roomId, state);
  const lines = [];

  lines.push(csvRow(['Room', roomLabel]));
  lines.push('');
  lines.push(csvRow(['Working']));
  lines.push(csvRow(['Device ID', 'Status', 'Notes', 'Last Updated']));
  if (working.length) working.forEach(r => lines.push(csvRow(r)));
  else lines.push(csvRow(['—', 'No working devices recorded', '', '']));
  lines.push('');
  lines.push(csvRow(['Not Working']));
  lines.push(csvRow(['Device ID', 'Status', 'Notes', 'Last Updated']));
  if (notWorking.length) notWorking.forEach(r => lines.push(csvRow(r)));
  else lines.push(csvRow(['—', 'No issues recorded', '', '']));

  return lines;
}

function download(content, filename, type = 'text/csv') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Prompts for the exporter's name. Returns the trimmed name (or "Unknown"
 * if left blank), or null if the prompt was cancelled — callers should
 * abort the export in that case.
 */
function getExporterName() {
  const name = window.prompt('Who is generating this export report? (name)', '');
  if (name === null) return null;
  return name.trim() || 'Unknown';
}

export function exportRoom(roomId, roomLabel) {
  const exporter = getExporterName();
  if (exporter === null) return;

  const state = loadState();
  const lines = [
    csvRow(['IT Room Monitor — Status Report']),
    csvRow(['Generated', new Date().toLocaleString()]),
    csvRow(['Exported By', exporter]),
    '',
    ...buildRoomBlock(roomLabel, roomId, state),
  ];
  download(lines.join('\r\n'), `report-${roomId}-${today()}.csv`);
}

export function exportAllRooms() {
  const exporter = getExporterName();
  if (exporter === null) return;

  const state = loadState();
  const lines = [
    csvRow(['IT Room Monitor — Full Status Report']),
    csvRow(['Generated', new Date().toLocaleString()]),
    csvRow(['Exported By', exporter]),
    '',
  ];

  let lastCampus = '';
  ALL_ROOMS.forEach(({ id, label, campus }) => {
    if (campus !== lastCampus) {
      if (lastCampus) lines.push('');
      lines.push(csvRow(['Campus', campus]));
      lines.push('');
      lastCampus = campus;
    } else {
      lines.push('');
    }
    lines.push(...buildRoomBlock(label, id, state));
  });

  download(lines.join('\r\n'), `report-ALL-${today()}.csv`);
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
