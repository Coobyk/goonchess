/**
 * Sound packs.
 *
 * A pack is a folder of files under `/sounds`, one per sound: move, capture,
 * check, promote, explosion, win and draw. Adding a pack means adding a folder
 * and a line here — nothing else in the app has to change.
 */

export interface SoundPack {
  id: string
  name: string
  description: string
  /** The folder the sounds live in. */
  dir: string
  /** Where the sounds came from, shown in the picker. */
  credit?: string
}

export const SOUND_PACKS: SoundPack[] = [
  {
    id: 'wooden',
    name: 'Wooden',
    description: 'Real pieces on a real board.',
    dir: '/sounds/wooden',
    credit: 'CC0 recordings — JJTaynos, TheBuilder15, el_boss',
  },
  {
    id: 'eightbit',
    name: '8-bit',
    description: 'Chiptune blips and boops.',
    dir: '/sounds/eightbit',
    credit: 'Synthesised for goonchess',
  },
  {
    id: 'memes',
    name: 'Memes',
    description: 'Vine booms, sad trombones and a lot of drama.',
    dir: '/sounds/memes',
    credit: 'CC0 recordings — LilMati, Sorinius_Genious, kirbydx, mcpable, modusmogulus, Krizin, unfa',
  },
]

export const DEFAULT_PACK = SOUND_PACKS[0].id

export function findPack(id: string): SoundPack {
  return SOUND_PACKS.find((pack) => pack.id === id) ?? SOUND_PACKS[0]
}
