import { loadSoundEnabled, saveSoundEnabled } from './persist'

export type SoundName =
  | 'move'
  | 'capture'
  | 'check'
  | 'promote'
  | 'explosion'
  | 'win'
  | 'draw'
  | 'illegal'

const VOLUME: Record<SoundName, number> = {
  move: 0.45,
  capture: 0.55,
  check: 0.5,
  promote: 0.55,
  explosion: 0.7,
  win: 0.6,
  draw: 0.45,
  illegal: 0.25,
}

let enabled = loadSoundEnabled()
const elements = new Map<SoundName, HTMLAudioElement>()

function source(name: SoundName) {
  let audio = elements.get(name)
  if (!audio) {
    audio = new Audio(`/sounds/${name}.mp3`)
    audio.preload = 'auto'
    elements.set(name, audio)
  }
  return audio
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
