import { describe, expect, it } from 'vitest'
import { packVariant, unpackVariant } from './variantCodec'
import { TEMPLATES } from '@/engine/templates'

describe('variant codec', () => {
  // Instance and win-condition ids are minted fresh on unpack, so the round
  // trip is compared in the packed form both ways.
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('round trips %s', (_id, template) => {
    const variant = template.build()
    const packed = packVariant(variant)
    const unpacked = unpackVariant(packed)
    expect(unpacked).not.toBeNull()
    expect(packVariant(unpacked)).toEqual(packed)
  })

  it('refuses garbage', () => {
    expect(() => unpackVariant(null)).toThrow()
    expect(() => unpackVariant({})).toThrow()
    expect(() => unpackVariant('a string')).toThrow()
  })
})
