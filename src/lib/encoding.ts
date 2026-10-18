export function encodeRuleset(ruleset: unknown): string {
  const json = JSON.stringify(ruleset);
  // base64 url-safe
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeRuleset(s: string): any {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json);
}

export function rulesetToHash(ruleset: unknown): string {
  return '#rs=' + encodeRuleset(ruleset);
}

export function parseHashRuleset(): any | null {
  const h = window.location.hash;
  const m = h.match(/rs=([^&]+)/);
  if (!m) return null;
  try { return decodeRuleset(m[1]); } catch { return null; }
}