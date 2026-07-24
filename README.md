# IT Room Monitor

## Structure
```
menu.html
style.css
js/
  main.js     — entry point (dual-mode: menu page vs room page)
  menu.js     — menu page: campus toggles, export-all, backup/restore
  room.js     — room page: floor-plan SVG, device rendering, popups, state
  export.js   — .txt reports + JSON state backup/restore
  state.js    — localStorage read/write helpers
  format.js   — date formatting helpers
data/
  gpl.json, library.json, mtl.json, s28-104.json, s28-107.json
  — each room's layout + device positions (previously inline in the HTML)
rooms/
  gpl.html, library.html, mtl.html, s28-104.html, s28-107.html
  — now just page shell + a few lines of routing metadata (id/label/campus/back/dataUrl)
tools/
  build-grid.js — shared PC-grid generator; regenerates the `devices` array
                  in data/*.json (was previously 4 copy-pasted inline loops)
```

## Running locally
The pages now use `fetch()` to load each room's JSON and `<script type="module">`,
both of which require **http(s)**, not `file://`. Serve the folder locally:

```
python3 -m http.server 8000
# then open http://localhost:8000/menu.html
```

(GitHub Pages, Netlify, Vercel, etc. all serve over http(s) automatically —
this only matters for opening the files directly by double-clicking them.)

## Editing a room's PC grid
For the 4 grid-based rooms (gpl, mtl, s28-104, s28-107), edit the params in
`tools/build-grid.js` and re-run:
```
node tools/build-grid.js
```
This regenerates only the `devices` field of the matching `data/*.json` —
`layout`, `canvasWidth`, `canvasHeight` are left untouched.

`library.json`'s devices are hand-placed (scattered clusters + staff desks +
printer), not a regular grid — edit `data/library.json` directly for that one.

## State & multi-device sync
Device statuses are saved in the browser's `localStorage` — **per browser,
per device**. Two people checking the same room from different computers
won't see each other's updates in real time.

As a practical workaround, the menu page has:
- **Backup State (JSON)** — downloads the full raw state as a `.json` file
- **Restore State (JSON)** — loads a previously-downloaded backup (this
  *overwrites* current state, it doesn't merge)

This lets you manually move state between devices (e.g. export on one
computer, copy the file over, import on another). True real-time sync across
devices would require a small backend (a shared database instead of
localStorage) — happy to help set that up if it becomes worth it.
