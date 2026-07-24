/**
 * build-grid.js — shared PC-grid generator for room data files.
 *
 * Previously this loop was copy-pasted inline into gpl.html, mtl.html,
 * s28-104.html, and s28-107.html (each with its own start/gap/block numbers).
 * Now it lives in one place and is used to (re)generate data/*.json.
 *
 * Usage:
 *   node tools/build-grid.js
 *
 * To change a room's PC layout, edit the matching block in ROOM_GRIDS below
 * and re-run this script — it patches only the `devices` field of that
 * room's JSON file, leaving `layout`, `canvasWidth`, `canvasHeight` untouched.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Generates a grid of PC devices, optionally split into `blocks` side-by-side
 * groups (each `rows` x `cols`), with `blockGap` extra horizontal space
 * between groups. Matches the original per-room IIFE logic exactly.
 */
function makeGrid({ startTop, startLeft, rowGap, colGap, rows, cols, blocks = 1, blockGap = 0, startCount = 1 }) {
  const devices = [];
  let count = startCount;
  for (let block = 0; block < blocks; block++) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        devices.push({
          id: `PC${count++}`,
          type: 'pc',
          top: startTop + row * rowGap,
          left: startLeft + block * blockGap + col * colGap,
        });
      }
    }
  }
  return devices;
}

/** Per-room grid parameters + any extra hand-placed devices (e.g. a staff PC). */
const ROOM_GRIDS = {
  gpl: {
    grid: { startTop: 74, startLeft: 214, rowGap: 122, colGap: 122, rows: 6, cols: 3, blocks: 2, blockGap: 486 },
    extra: [],
  },
  mtl: {
    grid: { startTop: 245, startLeft: 312, rowGap: 88, colGap: 89, rows: 6, cols: 3, blocks: 2, blockGap: 354 },
    extra: [{ id: 'STAFF-PC', type: 'pc', top: 135, left: 335 }],
  },
  's28-104': {
    grid: { startTop: 201, startLeft: 274, rowGap: 122, colGap: 122, rows: 4, cols: 6 },
    extra: [],
  },
  's28-107': {
    grid: { startTop: 245, startLeft: 274, rowGap: 122, colGap: 122, rows: 4, cols: 6 },
    extra: [],
  },
};

for (const [room, { grid, extra }] of Object.entries(ROOM_GRIDS)) {
  const file = path.join(DATA_DIR, `${room}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.devices = [...makeGrid(grid), ...extra];
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`${room}: wrote ${data.devices.length} devices`);
}

// Note: library.json's devices are hand-placed (scattered clusters + staff
// desks + a printer), not a regular grid, so it's left as-is — edit
// data/library.json directly for that room.
