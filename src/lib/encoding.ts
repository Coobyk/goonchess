export function encodeVariant(variant: unknown): string {
  const json = JSON.stringify(variant)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const b64 = btoa(binary)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeVariant(input: string): unknown {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  const binary = atob(b64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

export function variantToHash(variant: unknown): string {
  return '#v=' + encodeVariant(variant)
}

export function variantFromHash(): unknown | null {
  if (typeof window === 'undefined') return null
  const m = window.location.hash.match(/[#&]v=([^&]+)/)
  if (!m) return null
  try {
    return decodeVariant(m[1])
  } catch {
    return null
  }
}
