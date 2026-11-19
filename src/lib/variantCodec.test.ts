import { describe, expect, it } from 'vitest'
import { packVariant, unpackVariant } from './variantCodec'
import { classicChess, TEMPLATES } from '@/engine/templates'

describe('variant codec', () => {
  it('preserves the pre-lives Classic Chess packed bytes used by archive keys', () => {
    expect(JSON.stringify(packVariant(classicChess()))).toMatchInlineSnapshot(`"[6,"Classic Chess","The standard 8×8 game, rebuilt with the same rule system the Maker uses.",[8,8,"#f0d9b5","#b58863",[]],[["white","White","#f4f1ea",0],["black","Black","#3f3f46",1]],[["King",0,"K",0,40,[[0,0,[1,0,-1,0,0,1,0,-1,1,1,1,-1,-1,1,-1,-1]]],[],[],[],[]],["Queen",1,"Q",9,32,[[1,0,[1,0,-1,0,0,1,0,-1,1,1,1,-1,-1,1,-1,-1]]],[],[],[],[]],["Rook",2,"R",5,32,[[1,0,[1,0,-1,0,0,1,0,-1]]],[],[],[],[]],["Bishop",3,"B",3,32,[[1,0,[1,1,1,-1,-1,1,-1,-1]]],[],[],[],[]],["Knight",4,"K",3,33,[[0,0,[1,2,2,1,2,-1,1,-2,-1,-2,-2,-1,-2,1,-1,2]]],[],[],[],[]],["Pawn",5,"P",1,96,[[0,0,[0,-1]],[1,2,[0,-1],1]],[[0,0,[-1,-1,1,-1]]],[],[1,2,3,4],[]]],[[2,1,0,0],[4,1,1,0],[3,1,2,0],[1,1,3,0],[0,1,4,0],[3,1,5,0],[4,1,6,0],[2,1,7,0],[5,1,0,1],[5,1,1,1],[5,1,2,1],[5,1,3,1],[5,1,4,1],[5,1,5,1],[5,1,6,1],[5,1,7,1],[2,0,0,7],[4,0,1,7],[3,0,2,7],[1,0,3,7],[0,0,4,7],[3,0,5,7],[4,0,6,7],[2,0,7,7],[5,0,0,6],[5,0,1,6],[5,0,2,6],[5,0,3,6],[5,0,4,6],[5,0,5,6],[5,0,6,6],[5,0,7,6]],[[0],[1]],0,0]"`)
  })
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
