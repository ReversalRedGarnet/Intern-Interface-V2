/** format.js — small date helpers shared across modules. */

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
