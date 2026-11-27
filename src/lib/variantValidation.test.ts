import { describe, expect, it } from 'vitest'
import type { Variant } from '@/engine/types'
import { blankVariant, classicChess, TEMPLATES } from '@/engine/templates'
import { packVariant, unpackVariant } from './variantCodec'
import { isValidVariant, normalizeVariant, validateVariant, VARIANT_LIMITS } from './variantValidation'

function cloneVariant(): Variant {
  return structuredClone(classicChess())
}

function rejection(mutate: (variant: Variant) => void): string[] {
  const variant = cloneVariant()
  mutate(variant)
  const result = validateVariant(variant)
  expect(result.ok).toBe(false)
  return result.ok ? [] : result.errors
}

describe('validateVariant', () => {
  it.each(TEMPLATES.map((template) => [template.id, template] as const))(
    'accepts the built-in %s template',
    (_id, template) => {
      const result = validateVariant(template.build())
      expect(result.errors).toEqual([])
      expect(result.ok).toBe(true)
    },
  )

  it.each(TEMPLATES.map((template) => [template.id, template] as const))(
    'accepts the packed and unpacked %s template',
    (_id, template) => {
      const result = validateVariant(unpackVariant(packVariant(template.build())))
      expect(result.errors).toEqual([])
      expect(result.ok).toBe(true)
    },
  )

  it('accepts the blank maker canvas and copied custom pieces', () => {
    expect(validateVariant(blankVariant()).ok).toBe(true)

    const variant = cloneVariant()
    const copy = structuredClone(variant.pieceTypes[1])
    copy.id = 'queen-copy'
    copy.name = 'Queen copy'
    variant.pieceTypes.push(copy)
    const result = validateVariant(variant)
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
    expect(isValidVariant(variant)).toBe(true)

    const reordered = cloneVariant()
    reordered.pieceTypes.reverse()
    reordered.board.tiles[2][2] = { terrain: 'portal' }
    expect(validateVariant(reordered).ok).toBe(true)

    const withoutWinConditions = cloneVariant()
    withoutWinConditions.winConditions = []
    expect(validateVariant(withoutWinConditions).ok).toBe(true)
  })

  it('normalizes schema-1 legacy colors, flags and promotions', () => {
    const variant = cloneVariant()
    variant.teams[0].color = '#fff'
    variant.teams[1].color = '#000'
    for (const piece of variant.pieceTypes) {
      delete (piece.flags as unknown as Record<string, unknown>).predator
    }
    ;(variant.pieceTypes[0] as { promotion?: unknown }).promotion = { typeId: variant.pieceTypes[1].id }

    const normalized = normalizeVariant(variant)
    expect(normalized).not.toBeNull()
    expect(normalized?.teams[0].color).toBe('#ffffff')
    expect(normalized?.teams[1].color).toBe('#000000')
    expect(normalized?.pieceTypes[0].flags.predator).toBe(false)
    expect(normalized?.pieceTypes[0].promotion).toEqual({ typeIds: [variant.pieceTypes[1].id] })
    const result = validateVariant(normalized)
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('normalization preserves malformed values for validation instead of throwing', () => {
    const variant = cloneVariant() as unknown as { pieceTypes: unknown[] }
    variant.pieceTypes = [null]
    let normalized: unknown
    expect(() => {
      normalized = normalizeVariant(variant)
    }).not.toThrow()
    expect(validateVariant(normalized).ok).toBe(false)
  })

  it('rejects malformed top-level and team shapes', () => {
    expect(validateVariant(null).ok).toBe(false)
    expect(rejection((v) => { (v as { schema: unknown }).schema = 2 })).toBeTruthy()
    expect(rejection((v) => { v.teams = v.teams.slice(0, 1) })).toBeTruthy()
    expect(rejection((v) => { v.teams[1].id = v.teams[0].id })).toBeTruthy()
    expect(rejection((v) => { v.teams[0].id = 'constructor' })).toBeTruthy()
    expect(rejection((v) => { v.teams[0].name = ' ' })).toBeTruthy()
    expect(rejection((v) => { v.teams[0].color = 'red' })).toBeTruthy()
    expect(rejection((v) => { (v.teams[0] as { forward: unknown }).forward = 'sideways' })).toBeTruthy()
  })

  it('rejects bad board dimensions, rows, terrain and portal targets', () => {
    expect(rejection((v) => { v.board.width = 2 })).toBeTruthy()
    expect(rejection((v) => { v.board.height = 17 })).toBeTruthy()
    expect(rejection((v) => { v.board.tiles[0] = v.board.tiles[0].slice(1) })).toBeTruthy()
    expect(rejection((v) => { v.board.tiles = v.board.tiles.slice(1) })).toBeTruthy()
    expect(rejection((v) => { v.board.tiles[0][0] = { terrain: 'lava' as never } })).toBeTruthy()
    expect(rejection((v) => {
      v.board.tiles[0][0] = { terrain: 'portal', target: { x: v.board.width, y: 0 } }
    })).toBeTruthy()
    expect(rejection((v) => {
      v.board.tiles[0][0] = { terrain: 'oneway', target: { x: 1.5, y: 0 } }
    })).toBeTruthy()
  })

  it('rejects setup pieces with bad references, positions or duplicate squares', () => {
    expect(rejection((v) => { v.setup[0].typeId = 'missing' })).toBeTruthy()
    expect(rejection((v) => { v.setup[0].team = 'missing' })).toBeTruthy()
    expect(rejection((v) => { v.setup[0].x = v.board.width })).toBeTruthy()
    expect(rejection((v) => { v.setup[0].y = -1 })).toBeTruthy()
    expect(rejection((v) => { v.setup[1] = { ...v.setup[0] } })).toBeTruthy()
  })

  it('rejects duplicate or unsafe piece ids and malformed required piece fields', () => {
    expect(rejection((v) => { v.pieceTypes[1].id = v.pieceTypes[0].id })).toBeTruthy()
    expect(rejection((v) => { v.pieceTypes[0].id = '__proto__' })).toBeTruthy()
    expect(rejection((v) => { v.pieceTypes[0].name = '' })).toBeTruthy()
    expect(rejection((v) => { (v.pieceTypes[0] as { icon: unknown }).icon = 'dragon' })).toBeTruthy()
    expect(rejection((v) => { v.pieceTypes[0].symbol = 'too-long-symbol' })).toBeTruthy()
    expect(rejection((v) => { v.pieceTypes[0].value = Number.POSITIVE_INFINITY })).toBeTruthy()
    expect(rejection((v) => { v.pieceTypes[0].value = -1 })).toBeTruthy()
    expect(rejection((v) => { delete (v.pieceTypes[0] as { flags?: unknown }).flags })).toBeTruthy()
  })

  it('requires boolean piece flags and sane numeric piece fields', () => {
    expect(rejection((v) => {
      ;(v.pieceTypes[0].flags as { royal: unknown }).royal = 1
    })).toBeTruthy()
    expect(rejection((v) => { v.pieceTypes[0].lives = 1.5 })).toBeTruthy()
    expect(rejection((v) => { v.pieceTypes[0].lives = 0 })).toBeTruthy()
    expect(rejection((v) => { v.randomSeed = 1.5 })).toBeTruthy()
    expect(rejection((v) => { v.randomSeed = -1 })).toBeTruthy()
  })

  it('rejects degenerate movement patterns', () => {
    expect(rejection((v) => {
      v.pieceTypes[0].move = [{ id: 'bad-slider', kind: 'slider', vectors: [{ x: 2, y: 0 }], maxRange: 0 }]
    })).toBeTruthy()
    expect(rejection((v) => {
      v.pieceTypes[0].move = [{ id: 'zero', kind: 'leaper', vectors: [{ x: 0, y: 0 }], maxRange: 0 }]
    })).toBeTruthy()
    expect(rejection((v) => {
      v.pieceTypes[0].move = [{ id: 'fraction', kind: 'leaper', vectors: [{ x: 0.5, y: 0 }], maxRange: 0 }]
    })).toBeTruthy()
    expect(rejection((v) => {
      v.pieceTypes[0].move = [{ id: 'far-range', kind: 'slider', vectors: [{ x: 1, y: 0 }], maxRange: 17 }]
    })).toBeTruthy()
    expect(rejection((v) => {
      v.pieceTypes[0].move = [{
        id: 'duplicates',
        kind: 'leaper',
        vectors: [{ x: 1, y: 0 }, { x: 1, y: 0 }],
        maxRange: 0,
      }]
    })).toBeTruthy()
  })

  it('caps oversized piece, pattern and vector lists', () => {
    const errors = rejection((v) => {
      while (v.pieceTypes.length <= VARIANT_LIMITS.maxPieceTypes) {
        const copy = structuredClone(v.pieceTypes[1])
        copy.id = `copy-${v.pieceTypes.length}`
        v.pieceTypes.push(copy)
      }
    })
    expect(errors.some((error) => error.includes('at most'))).toBe(true)

    expect(rejection((v) => {
      v.pieceTypes[0].move = Array.from({ length: VARIANT_LIMITS.maxPatternsPerList + 1 }, (_, i) => ({
        id: `pattern-${i}`,
        kind: 'leaper' as const,
        vectors: [{ x: 1, y: 0 }],
        maxRange: 0,
      }))
    })).toBeTruthy()

    expect(rejection((v) => {
      const vectors = []
      for (const y of [1, 2, 3]) {
        for (let x = -16; x <= 16; x += 1) vectors.push({ x, y })
      }
      v.pieceTypes[0].move = [{
        id: 'wide',
        kind: 'leaper',
        vectors: vectors.slice(0, VARIANT_LIMITS.maxVectorsPerPattern + 1),
        maxRange: 0,
      }]
    })).toBeTruthy()
  })

  it('rejects promotions and effects that reference missing types or use bad values', () => {
    expect(rejection((v) => {
      v.pieceTypes[0].promotion = { typeIds: ['missing'] }
    })).toBeTruthy()
    expect(rejection((v) => {
      v.pieceTypes[0].promotion = { typeIds: [] }
    })).toBeTruthy()
    expect(rejection((v) => {
      v.pieceTypes[0].effects = [{ kind: 'spawn', pieceTypeId: 'missing', offset: { x: 0, y: 1 } }]
    })).toBeTruthy()
    expect(rejection((v) => {
      v.pieceTypes[0].effects = [{ kind: 'explosion', radius: 4 }]
    })).toBeTruthy()
    expect(rejection((v) => {
      v.pieceTypes[0].effects = [{ kind: 'explosion', radius: 1.5 }]
    })).toBeTruthy()
    expect(rejection((v) => {
      v.pieceTypes[0].effects = [{
        kind: 'spawn',
        pieceTypeId: v.pieceTypes[1].id,
        offset: { x: 0, y: 17 },
      }]
    })).toBeTruthy()
  })

  it('rejects uncapturable royal pieces and excessive movement complexity', () => {
    expect(rejection((v) => {
      v.pieceTypes[0].flags.royal = true
      v.pieceTypes[0].flags.uncapturable = true
    })).toBeTruthy()

    const errors = rejection((v) => {
      const queen = v.pieceTypes[1]
      v.setup = []
      for (let y = 0; y < v.board.height; y += 1) {
        for (let x = 0; x < v.board.width; x += 1) {
          v.setup.push({
            typeId: queen.id,
            team: v.teams[y < v.board.height / 2 ? 0 : 1].id,
            x,
            y,
          })
        }
      }
    })
    expect(errors.some((error) => error.includes('movement patterns are too expensive'))).toBe(true)

    const pieceErrors = rejection((v) => {
      const queen = v.pieceTypes[1]
      queen.move = [0, 1, 2].map((index) => ({
        ...queen.move[0],
        id: `queen-lines-${index}`,
      }))
      v.setup = [{ typeId: queen.id, team: v.teams[0].id, x: 0, y: 0 }]
    })
    expect(pieceErrors.some((error) => error.includes("one piece's movement patterns"))).toBe(true)

    const smallSpawn = cloneVariant()
    smallSpawn.pieceTypes[1].effects = [{
      kind: 'spawn',
      pieceTypeId: smallSpawn.pieceTypes[1].id,
      offset: { x: 1, y: 0 },
    }]
    expect(validateVariant(smallSpawn).ok).toBe(true)

    const spawnErrors = rejection((v) => {
      v.board.width = 16
      v.board.height = 16
      v.board.tiles = Array.from({ length: 16 }, () =>
        Array.from({ length: 16 }, () => ({ terrain: 'normal' as const })),
      )
      v.pieceTypes[1].effects = [{
        kind: 'spawn',
        pieceTypeId: v.pieceTypes[1].id,
        offset: { x: 1, y: 0 },
      }]
    })
    expect(spawnErrors.some((error) => error.includes('spawn effects can amplify movement'))).toBe(true)

    for (const random of [false, true]) {
      const bypassErrors = rejection((v) => {
        const queen = v.pieceTypes[1]
        const pawn = v.pieceTypes[5]
        v.board.width = 16
        v.board.height = 16
        v.board.tiles = Array.from({ length: 16 }, () =>
          Array.from({ length: 16 }, () => ({ terrain: 'normal' as const })),
        )
        v.setup = v.setup.filter((piece) => piece.typeId !== queen.id)
        queen.effects = [{ kind: 'spawn', pieceTypeId: queen.id, offset: { x: 1, y: 0 } }]
        if (random) {
          pawn.promotion = null
          pawn.flags.random = true
        }
      })
      expect(bypassErrors.some((error) => error.includes('spawn effects can amplify movement'))).toBe(true)
    }
  })

  it('rejects malformed win conditions and rules', () => {
    expect(rejection((v) => {
      v.winConditions = [{ id: 'bad', kind: 'sudden-death' as never }]
    })).toBeTruthy()
    expect(rejection((v) => {
      v.winConditions = [
        { id: 'one', kind: 'checkmate' },
        { id: 'two', kind: 'checkmate' },
      ]
    })).toBeTruthy()
    expect(rejection((v) => {
      v.winConditions = [{ id: 'points', kind: 'points', threshold: 0 }]
    })).toBeTruthy()
    expect(rejection((v) => {
      v.winConditions = [{ id: 'mate', kind: 'checkmate', threshold: 3 }]
    })).toBeTruthy()
    expect(rejection((v) => { v.rules = ['atomic', 'atomic'] })).toBeTruthy()
    expect(rejection((v) => { v.rules = ['atomic', 'unknown' as never] })).toBeTruthy()
  })

  it('rejects overlong strings and unsafe presentation values', () => {
    expect(rejection((v) => { v.name = 'x'.repeat(VARIANT_LIMITS.maxVariantNameLength + 1) })).toBeTruthy()
    expect(rejection((v) => { v.description = 'x'.repeat(VARIANT_LIMITS.maxDescriptionLength + 1) })).toBeTruthy()
    expect(rejection((v) => { v.name = 'bad\u0000name' })).toBeTruthy()
    expect(rejection((v) => { v.pieceTypes[0].images = ['https://example.com/piece.svg'] })).toBeTruthy()
    expect(rejection((v) => { v.pieceTypes[0].images = ['/pieces/../secret.svg'] })).toBeTruthy()
    expect(rejection((v) => {
      v.pieceTypes[0].art = [{ shape: 'king', x: 0, y: 0, scale: 0 }]
    })).toBeTruthy()
  })
})
