import type { CSSProperties } from 'react'

const WING = [
  { shape: 'R', x: 94, y: 113, size: 43, angle: -22 },
  { shape: 'N', x: 69, y: 91, size: 42, angle: -32 },
  { shape: 'B', x: 43, y: 66, size: 42, angle: -40 },
  { shape: 'P', x: 22, y: 43, size: 37, angle: -48 },
  { shape: 'P', x: 11, y: 80, size: 34, angle: -56 },
]
const TAIL = [[144, 177, 32], [163, 200, 30], [190, 193, 28], [202, 167, 26]]

export function BossAssembly({ size, lives, maxLives, staggered, hit }: {
  size: number
  lives: number
  maxLives: number
  staggered: boolean
  hit: boolean
}) {
  const wingCount = Math.max(0, 10 - Math.max(0, maxLives - lives))
  return (
    <svg
      viewBox="0 0 300 300"
      width={size}
      height={size}
      className={`boss-assembly${staggered ? ' boss-staggered' : ''}`}
      role="img"
      aria-label={`Fused chess army${staggered ? ', staggered' : ''}`}
      data-wing-pieces={wingCount}
    >
      <g className="boss-body">
        <g className="boss-tail">
          {TAIL.map(([x, y, width], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${-i * 28} ${width / 2} ${width / 2})`}>
              <image className="boss-drift" href="/pieces/cburnett/bP.svg" width={width} height={width} style={{ animationDelay: `${-i * 0.47}s` }} />
            </g>
          ))}
        </g>
        {[-1, 1].map((side, sideIndex) => (
          <g key={side} className={side === -1 ? 'boss-wing-left' : 'boss-wing-right'}>
            {WING.map(({ shape, x, y, size: width, angle }, i) => {
              const index = i * 2 + sideIndex
              const falling = hit && index === wingCount
              if (index >= wingCount && !falling) return null
              return (
                <g key={i} transform={`translate(${side === -1 ? x : 300 - x - width} ${y}) rotate(${-side * angle} ${width / 2} ${width / 2})`}>
                  <g className={falling ? 'boss-falling' : 'boss-drift'} style={{ '--drift-delay': `${-index * 0.37}s` } as CSSProperties}>
                    <image href={`/pieces/cburnett/b${shape}.svg`} width={width} height={width} />
                  </g>
                </g>
              )
            })}
          </g>
        ))}
        <image href="/pieces/cburnett/bQ.svg" x="123" y="127" width="54" height="62" />
        <image href="/pieces/cburnett/bK.svg" x="119" y="77" width="62" height="70" />
        <g className="boss-eyes">
          <ellipse cx="145" cy="115" rx="2.8" ry="1.8" />
          <ellipse cx="155" cy="115" rx="2.8" ry="1.8" />
        </g>
      </g>
    </svg>
  )
}
