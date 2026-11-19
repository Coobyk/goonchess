import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BossAssembly } from './BossAssembly'

describe('assembled boss', () => {
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
