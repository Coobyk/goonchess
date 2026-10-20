import { loadSoundEnabled, saveSoundEnabled } from './persist'
import { DEFAULT_PACK, findPack } from './soundPacks'

export type SoundName =
  | 'move'
  | 'capture'
  | 'check'
  | 'promote'
  | 'explosion'
  | 'win'
  | 'draw'

const VOLUME: Record<SoundName, number> = {
  move: 0.5,
  capture: 0.6,
  check: 0.55,
  promote: 0.55,
  explosion: 0.7,
  win: 0.7,
  draw: 0.45,
}

let enabled = loadSoundEnabled()
let packId = DEFAULT_PACK
const elements = new Map<SoundName, HTMLAudioElement>()

function source(name: SoundName) {
  let audio = elements.get(name)
  if (!audio) {
    audio = new Audio(`${findPack(packId).dir}/${name}.mp3`)
    audio.preload = 'auto'
    elements.set(name, audio)
  }
  return audio
}

/** Swaps the sound pack. The cached files belong to the old one. */
export function setSoundPack(id: string) {
  if (id === packId) return
  packId = id
  elements.clear()
  if (enabled) preloadSounds()
}

export function currentSoundPack() {
  return packId
}

/** Warm the cache once, after the first interaction. */
export function preloadSounds() {
  if (typeof window === 'undefined') return
  for (const name of Object.keys(VOLUME) as SoundName[]) source(name)
}

export function isSoundEnabled() {
  return enabled
}

export function setSoundEnabled(value: boolean) {
  enabled = value
  saveSoundEnabled(value)
  if (value) preloadSounds()
}

/**
 * Fire-and-forget playback. A fresh clone per call lets sounds overlap (a
 * capture landing while the explosion still rings, for example).
 */
export function playSound(name: SoundName) {
  if (!enabled || typeof window === 'undefined') return
  try {
    const node = source(name).cloneNode(true) as HTMLAudioElement
    node.volume = VOLUME[name]
    const played = node.play()
    if (played) played.catch(() => {})
  } catch {
    /* Audio unavailable or blocked before a user gesture. */
  }
}
