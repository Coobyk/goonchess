import type { CSSProperties } from 'react'

const WING = [
  { shape: 'R', x: 121, y: 159, size: 64, angle: -22 },
  { shape: 'N', x: 86, y: 128, size: 64, angle: -32 },
  { shape: 'B', x: 48, y: 90, size: 66, angle: -40 },
  { shape: 'P', x: 6, y: 25, size: 64, angle: -48 },
  { shape: 'P', x: 5, y: 102, size: 58, angle: -56 },
]
const TAIL = [[192, 224, 52], [222, 271, 50], [272, 280, 48], [300, 235, 46]]

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
      viewBox="0 0 400 350"
      width={size}
      height={size * 350 / 400}
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
                <g key={i} transform={`translate(${side === -1 ? x : 400 - x - width} ${y}) rotate(${-side * angle} ${width / 2} ${width / 2})`}>
                  <g className={falling ? 'boss-falling' : 'boss-drift'} style={{ '--drift-delay': `${-index * 0.37}s` } as CSSProperties}>
                    <image href={`/pieces/cburnett/b${shape}.svg`} width={width} height={width} />
                  </g>
                </g>
              )
            })}
          </g>
        ))}
        <image href="/pieces/cburnett/bQ.svg" x="164" y="175" width="72" height="88" />
        <image href="/pieces/cburnett/bK.svg" x="158" y="106" width="84" height="96" />
        <g className="boss-eyes">
          <ellipse cx="193" cy="158" rx="3.8" ry="2.4" />
          <ellipse cx="207" cy="158" rx="3.8" ry="2.4" />
        </g>
      </g>
    </svg>
  )
}
