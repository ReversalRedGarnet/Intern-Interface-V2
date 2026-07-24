/**
 * room.js — everything needed to render and drive a single room page.
 * Call initRoomPage(CFG) once CFG (metadata + layout + devices) is ready.
 */
import { loadState, saveState, stateKey } from './state.js';
import { formatDate } from './format.js';
import { exportRoom, exportAllRooms } from './export.js';

function escapeXML(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/** Builds floor-plan SVG from layout data; falls back to a plain <img> if no `layout` is given. */
function drawLayout(layout, w = 1200, h = 800) {
  const parts = [];

  const outline = layout.find(o => o.type === 'outline');
  if (outline) {
    const d = 'M' + outline.points.map(p => p.join(',')).join(' L') + ' Z';
    parts.push(`<path d="${d}" class="floor-outline"/>`);
  }

  layout.filter(o => o.type === 'floor').forEach(f => {
    parts.push(`<rect x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}" class="floor-fill"/>`);
  });

  layout.filter(o => o.type === 'wall').forEach(wl => {
    parts.push(`<line x1="${wl.x1}" y1="${wl.y1}" x2="${wl.x2}" y2="${wl.y2}" class="floor-wall"/>`);
  });

  // Rough centroid of the room(s), used to pick which side a door swings into.
  function layoutCenter() {
    const shapes = layout.filter(o => o.type === 'floor' || o.type === 'room');
    if (shapes.length) {
      let sx = 0, sy = 0;
      shapes.forEach(s => { sx += s.x + s.width / 2; sy += s.y + s.height / 2; });
      return [sx / shapes.length, sy / shapes.length];
    }
    if (outline) {
      let sx = 0, sy = 0;
      outline.points.forEach(p => { sx += p[0]; sy += p[1]; });
      return [sx / outline.points.length, sy / outline.points.length];
    }
    return [w / 2, h / 2];
  }

  // Door swing indicator: solid leaf (hinge → open tip) + dashed arc to the far jamb.
  layout.filter(o => o.type === 'door').forEach(dr => {
    if (dr.hinge && dr.jamb) {
      const [hx, hy] = dr.hinge;
      const [jx, jy] = dr.jamb;
      const dx = jx - hx, dy = jy - hy;
      const width = Math.sqrt(dx * dx + dy * dy);
      const ux = dx / width, uy = dy / width;

      const p1 = [-uy, ux], p2 = [uy, -ux];
      const [cx, cy] = layoutCenter();
      const toCenter = [cx - hx, cy - hy];
      const perp = (p1[0] * toCenter[0] + p1[1] * toCenter[1]) >= 0 ? p1 : p2;

      const tipX = hx + perp[0] * width;
      const tipY = hy + perp[1] * width;
      const sweepFlag = (ux * perp[1] - uy * perp[0]) > 0 ? 1 : 0;

      parts.push(`<line x1="${hx}" y1="${hy}" x2="${tipX}" y2="${tipY}" class="floor-door-leaf"/>`);
      parts.push(`<path d="M${tipX},${tipY} A${width},${width} 0 0 ${sweepFlag} ${jx},${jy}" class="floor-door-arc"/>`);
    } else {
      parts.push(`<line x1="${dr.x1}" y1="${dr.y1}" x2="${dr.x2}" y2="${dr.y2}" class="floor-door"/>`);
    }
  });

  layout.filter(o => o.type === 'room').forEach(r => {
    parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" class="floor-room"/>`);
    if (r.label) {
      parts.push(`<text x="${r.x + r.width / 2}" y="${r.y + r.height / 2}" class="floor-label" text-anchor="middle" dominant-baseline="middle">${escapeXML(r.label)}</text>`);
    }
  });

  layout.filter(o => o.type === 'entrance').forEach(r => {
    parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" class="floor-entrance"/>`);
    if (r.label) {
      parts.push(`<text x="${r.x + r.width / 2}" y="${r.y + r.height / 2}" class="floor-label floor-label-entrance" text-anchor="middle" dominant-baseline="middle">${escapeXML(r.label)}</text>`);
    }
  });

  layout.filter(o => o.type === 'counter').forEach(c => {
    parts.push(`<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" class="floor-counter"/>`);
  });

  layout.filter(o => o.type === 'wallrect').forEach(wr => {
    parts.push(`<rect x="${wr.x}" y="${wr.y}" width="${wr.width}" height="${wr.height}" class="floor-wallrect"/>`);
  });

  layout.filter(o => o.type === 'pillar').forEach(p => {
    parts.push(`<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" class="floor-pillar"/>`);
    const k = p.r * 0.7;
    parts.push(`<line x1="${p.cx - k}" y1="${p.cy - k}" x2="${p.cx + k}" y2="${p.cy + k}" class="floor-pillar-mark"/>`);
    parts.push(`<line x1="${p.cx - k}" y1="${p.cy + k}" x2="${p.cx + k}" y2="${p.cy - k}" class="floor-pillar-mark"/>`);
    if (p.label) parts.push(`<title>${escapeXML(p.label)}</title>`);
  });

  return `<svg class="room-bg-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

function buildFloorPlanHTML(cfg) {
  if (cfg.layout) return drawLayout(cfg.layout, cfg.canvasWidth || 1200, cfg.canvasHeight || 800);
  return `<img src="${cfg.bgImage}" class="room-bg" alt="${cfg.label} floor plan">`;
}

function buildDeviceHTML(devices) {
  return devices.map(d => {
    if (d.type === 'printer') {
      return `<div class="printer" data-id="${d.id}" style="top:${d.top}px;left:${d.left}px">
                <span class="printer-icon">⎙</span> Printer
              </div>`;
    }
    const cls = d.type === 'staff' ? 'pc staff' : 'pc';
    const label = d.label || d.id;
    return `<div class="${cls}" data-id="${d.id}" style="top:${d.top}px;left:${d.left}px">${label}</div>`;
  }).join('\n');
}

export function initRoomPage(CFG) {
  const roomId = CFG.id;
  const state = loadState();

  document.title = `${CFG.label} — Room Monitor`;
  document.getElementById('room-root').innerHTML = `
    <div class="app">

      <header>
        <div class="header-inner">
          <div class="header-title">
            <a href="${CFG.back}" class="back-btn">← Menu</a>
            <span class="header-icon">⬡</span>
            <div>
              <h1>${CFG.label}</h1>
              <p class="campus-crumb">${CFG.campus}</p>
            </div>
          </div>
          <div class="status-summary">
            <span class="summary-pill working" id="count-working">0 Working</span>
            <span class="summary-pill minor"   id="count-minor">0 Minor</span>
            <span class="summary-pill major"   id="count-major">0 Major</span>
          </div>
        </div>
        <p class="subtitle">Click any device to update its status</p>
      </header>

      <div class="toolbar">
        <button class="toolbar-btn" id="btn-export-room">⬇ Export This Room</button>
        <button class="toolbar-btn" id="btn-export-all">⬇ Export All Rooms</button>
        <button class="toolbar-btn" id="btn-reset">↺ Reset This Room</button>
      </div>

      <div class="room" id="room" style="width:${CFG.canvasWidth || 1200}px;height:${CFG.canvasHeight || 800}px">
        ${buildFloorPlanHTML(CFG)}
        ${buildDeviceHTML(CFG.devices)}
      </div>

      <div class="legend">
        <div class="legend-item"><span class="dot working"></span>Working</div>
        <div class="legend-item"><span class="dot minor"></span>Minor Issue</div>
        <div class="legend-item"><span class="dot major"></span>Major Issue</div>
        <div class="legend-item"><span class="dot unknown"></span>Unknown</div>
      </div>

    </div>

    <!-- PC popup -->
    <div class="overlay" id="pc-overlay" role="dialog" aria-modal="true">
      <div class="popup">
        <button class="popup-close" id="pc-close">✕</button>
        <h3 class="popup-title">Update Status</h3>
        <p class="popup-id" id="popup-id"></p>
        <div class="status-grid">
          <button class="status-btn" data-status="working"><span class="status-dot working"></span>Working</button>
          <button class="status-btn" data-status="minor"><span class="status-dot minor"></span>Minor Issue</button>
          <button class="status-btn" data-status="major"><span class="status-dot major"></span>Major Issue</button>
          <button class="status-btn" data-status="unknown"><span class="status-dot unknown"></span>Unknown</button>
        </div>
        <label class="notes-label" for="pc-notes">Notes (optional)</label>
        <textarea id="pc-notes" class="notes-input" rows="3" placeholder="Describe the issue…"></textarea>
        <p class="last-updated" id="pc-last-updated"></p>
        <div class="popup-actions">
          <button class="btn-primary" id="pc-save">Save</button>
          <button class="btn-secondary" id="pc-cancel">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Printer popup -->
    <div class="overlay" id="printer-overlay" role="dialog" aria-modal="true">
      <div class="popup">
        <button class="popup-close" id="printer-close">✕</button>
        <h3 class="popup-title">Printer Status</h3>
        <p class="popup-id">${roomId} › PRINTER</p>
        <div class="status-grid printer-grid">
          <button class="status-btn" data-status="working"><span class="status-dot working"></span>Working</button>
          <button class="status-btn" data-status="major"><span class="status-dot major"></span>Not Working</button>
        </div>
        <label class="notes-label" for="printer-notes">Notes (optional)</label>
        <textarea id="printer-notes" class="notes-input" rows="3" placeholder="Describe the issue…"></textarea>
        <p class="last-updated" id="printer-last-updated"></p>
        <div class="popup-actions">
          <button class="btn-primary" id="printer-save">Save</button>
          <button class="btn-secondary" id="printer-cancel">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Reset confirmation -->
    <div class="overlay" id="reset-overlay" role="dialog" aria-modal="true">
      <div class="popup popup-sm">
        <h3 class="popup-title">Reset ${CFG.label}?</h3>
        <p class="popup-body">Clears all statuses and notes for this room only.</p>
        <div class="popup-actions">
          <button class="btn-danger"    id="reset-confirm">Yes, Reset</button>
          <button class="btn-secondary" id="reset-cancel">Cancel</button>
        </div>
      </div>
    </div>
  `;

  /* DOM refs */
  const pcs = document.querySelectorAll('.pc');
  const printer = document.querySelector('.printer');
  const pcOverlay = document.getElementById('pc-overlay');
  const printerOverlay = document.getElementById('printer-overlay');
  const resetOverlay = document.getElementById('reset-overlay');
  const popupIdEl = document.getElementById('popup-id');
  const pcNotesEl = document.getElementById('pc-notes');
  const pcLastUpdated = document.getElementById('pc-last-updated');
  const printerNotesEl = document.getElementById('printer-notes');
  const printerLastUp = document.getElementById('printer-last-updated');
  const statusBtns = document.querySelectorAll('#pc-overlay .status-btn');
  const printerBtns = document.querySelectorAll('#printer-overlay .status-btn');

  let activePcId = null;
  let selectedStatus = null;

  function applyStatus(el, entry) {
    if (!el) return;
    el.dataset.status = entry?.status || 'unknown';
  }

  function applyAllStatuses() {
    pcs.forEach(pc => applyStatus(pc, state[stateKey(roomId, pc.dataset.id)]));
    if (printer) applyStatus(printer, state[stateKey(roomId, 'PRINTER')]);
  }

  function updateSummary() {
    let w = 0, m = 0, maj = 0;
    CFG.devices.forEach(({ id }) => {
      const s = state[stateKey(roomId, id)]?.status;
      if (s === 'working') w++;
      else if (s === 'minor') m++;
      else if (s === 'major') maj++;
    });
    document.getElementById('count-working').textContent = `${w} Working`;
    document.getElementById('count-minor').textContent = `${m} Minor`;
    document.getElementById('count-major').textContent = `${maj} Major`;
  }

  function saveEntry(deviceId, status, notes) {
    const key = stateKey(roomId, deviceId);
    state[key] = { status, notes, updatedAt: new Date().toISOString() };
    saveState(state);
    const el = deviceId === 'PRINTER' ? printer : [...pcs].find(p => p.dataset.id === deviceId);
    applyStatus(el, state[key]);
    updateSummary();
  }

  function resetRoom() {
    CFG.devices.forEach(({ id }) => delete state[stateKey(roomId, id)]);
    saveState(state);
    applyAllStatuses();
    updateSummary();
  }

  function openPcPopup(deviceId) {
    activePcId = deviceId;
    const entry = state[stateKey(roomId, deviceId)];
    selectedStatus = entry?.status || 'unknown';
    popupIdEl.textContent = `${roomId} › ${deviceId}`;
    pcNotesEl.value = entry?.notes || '';
    pcLastUpdated.textContent = entry?.updatedAt ? `Updated ${formatDate(entry.updatedAt)}` : '';
    statusBtns.forEach(b => b.classList.toggle('selected', b.dataset.status === selectedStatus));
    pcOverlay.classList.add('open');
  }

  function closePcPopup() {
    pcOverlay.classList.remove('open');
    activePcId = selectedStatus = null;
  }

  function openPrinterPopup() {
    activePcId = 'PRINTER';
    const entry = state[stateKey(roomId, 'PRINTER')];
    selectedStatus = entry?.status || 'unknown';
    printerNotesEl.value = entry?.notes || '';
    printerLastUp.textContent = entry?.updatedAt ? `Updated ${formatDate(entry.updatedAt)}` : '';
    printerBtns.forEach(b => b.classList.toggle('selected', b.dataset.status === selectedStatus));
    printerOverlay.classList.add('open');
  }

  function closePrinterPopup() {
    printerOverlay.classList.remove('open');
    activePcId = selectedStatus = null;
  }

  /* Events */
  pcs.forEach(pc => pc.addEventListener('click', () => openPcPopup(pc.dataset.id)));
  if (printer) printer.addEventListener('click', openPrinterPopup);

  statusBtns.forEach(btn => btn.addEventListener('click', () => {
    selectedStatus = btn.dataset.status;
    statusBtns.forEach(b => b.classList.toggle('selected', b === btn));
  }));

  printerBtns.forEach(btn => btn.addEventListener('click', () => {
    selectedStatus = btn.dataset.status;
    printerBtns.forEach(b => b.classList.toggle('selected', b === btn));
  }));

  document.getElementById('pc-save').addEventListener('click', () => {
    if (activePcId && selectedStatus) saveEntry(activePcId, selectedStatus, pcNotesEl.value.trim());
    closePcPopup();
  });
  document.getElementById('pc-close').addEventListener('click', closePcPopup);
  document.getElementById('pc-cancel').addEventListener('click', closePcPopup);
  pcOverlay.addEventListener('click', e => { if (e.target === pcOverlay) closePcPopup(); });

  document.getElementById('printer-save').addEventListener('click', () => {
    if (selectedStatus) saveEntry('PRINTER', selectedStatus, printerNotesEl.value.trim());
    closePrinterPopup();
  });
  document.getElementById('printer-close').addEventListener('click', closePrinterPopup);
  document.getElementById('printer-cancel').addEventListener('click', closePrinterPopup);
  printerOverlay.addEventListener('click', e => { if (e.target === printerOverlay) closePrinterPopup(); });

  document.getElementById('btn-reset').addEventListener('click', () => resetOverlay.classList.add('open'));
  document.getElementById('reset-confirm').addEventListener('click', () => { resetRoom(); resetOverlay.classList.remove('open'); });
  document.getElementById('reset-cancel').addEventListener('click', () => resetOverlay.classList.remove('open'));
  resetOverlay.addEventListener('click', e => { if (e.target === resetOverlay) resetOverlay.classList.remove('open'); });

  document.getElementById('btn-export-room').addEventListener('click', () => exportRoom(roomId, CFG.label));
  document.getElementById('btn-export-all').addEventListener('click', () => exportAllRooms());

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closePcPopup(); closePrinterPopup();
    resetOverlay.classList.remove('open');
  });

  applyAllStatuses();
  updateSummary();
}
