import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BossAssembly } from './BossAssembly'
import { PieceGlyph } from './PieceGlyph'
import { bossFight } from '@/engine/templates'

describe('assembled boss', () => {
  it('uses an oversized landscape canvas without stretching the chess glyphs', () => {
    const boss = bossFight().pieceTypes.find((p) => p.presentation === 'boss')!
    const html = renderToStaticMarkup(createElement(PieceGlyph, { piece: boss, teamIndex: 1, size: 78 }))
    expect(html).toContain('viewBox="0 0 400 350"')
    expect(html).toContain('width="450" height="393.75"')
  })
  it('builds the full army from sixteen real black glyphs', () => {
    const html = renderToStaticMarkup(createElement(BossAssembly, { size: 192, lives: 5, maxLives: 5, staggered: false, hit: false }))
    expect(html.match(/<image /g)).toHaveLength(16)
    expect(html).toContain('data-wing-pieces="10"')
    for (const shape of ['K', 'Q', 'R', 'B', 'N', 'P']) expect(html).toContain(`/pieces/cburnett/b${shape}.svg`)
    expect(html).not.toContain('boss-falling')
  })

  it('sheds one wing piece on a hit and shows stagger', () => {
    const html = renderToStaticMarkup(createElement(BossAssembly, { size: 192, lives: 4, maxLives: 5, staggered: true, hit: true }))
    expect(html).toContain('data-wing-pieces="9"')
    expect(html).toContain('boss-staggered')
    expect(html.match(/boss-falling/g)).toHaveLength(1)
    const settled = renderToStaticMarkup(createElement(BossAssembly, { size: 192, lives: 4, maxLives: 5, staggered: true, hit: false }))
    expect(settled.match(/<image /g)).toHaveLength(15)
  })

  it('does not create extra wings for invalid health', () => {
    const html = renderToStaticMarkup(createElement(BossAssembly, { size: 192, lives: 10, maxLives: 5, staggered: false, hit: false }))
    expect(html).toContain('data-wing-pieces="10"')
  })
})
