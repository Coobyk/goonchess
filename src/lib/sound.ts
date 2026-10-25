import { loadSoundEnabled, saveSoundEnabled } from './persist'
import { DEFAULT_PACK, findPack, SOUND_PACKS } from './soundPacks'

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
/** Keyed by pack and sound, so every pack stays downloaded across a switch. */
const elements = new Map<string, HTMLAudioElement>()

function elementFor(pack: string, name: SoundName) {
  const key = `${pack}/${name}`
  let audio = elements.get(key)
  if (!audio) {
    audio = new Audio()
    audio.preload = 'auto'
    audio.src = `${findPack(pack).dir}/${name}.mp3`
    elements.set(key, audio)
  }
  return audio
}

function source(name: SoundName) {
  return elementFor(packId, name)
}

/** Swaps the sound pack. Every pack is already downloaded, so this is instant. */
export function setSoundPack(id: string) {
  if (id === packId) return
  packId = id
  preloadSounds()
}

export function currentSoundPack() {
  return packId
}

/**
 * Download every sound of every pack. Called once when the app opens, so a
 * fresh session with an empty cache still plays the very first move at once.
 */
export function preloadSounds() {
  if (typeof window === 'undefined') return
  for (const pack of SOUND_PACKS) {
    for (const name of Object.keys(VOLUME) as SoundName[]) elementFor(pack.id, name)
  }
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
