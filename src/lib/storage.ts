const KEY = 'goonchess:state';
export function saveState(obj: unknown) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch {}
}
export function loadState(): any | null {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}