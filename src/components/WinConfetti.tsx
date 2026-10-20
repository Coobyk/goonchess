import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/useAppStore'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  rot: number
  vr: number
  color: string
  round: boolean
  life: number
}

const COLORS = ['#f59e0b', '#fbbf24', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#3b82f6', '#22c55e', '#f8fafc']

function makeParticles(width: number, height: number, teamColor?: string) {
  const colors = teamColor ? [teamColor, ...COLORS] : COLORS
  const particles: Particle[] = []
  const cannon = (side: 'left' | 'right', count: number) => {
    const x = side === 'left' ? width * 0.08 : width * 0.92
    const y = height * 0.92
    for (let i = 0; i < count; i++) {
      const angle = (side === 'left' ? -Math.PI / 3 : (-Math.PI * 2) / 3) + (Math.random() - 0.5) * 0.5
      const speed = 12 + Math.random() * 12
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
        round: Math.random() < 0.2,
        life: 1,
      })
    }
  }
  cannon('left', 55)
  cannon('right', 55)
  // A soft shower from the top of the board area.
  for (let i = 0; i < 45; i++) {
    particles.push({
      x: width * 0.2 + Math.random() * width * 0.6,
      y: -20 - Math.random() * 120,
      vx: (Math.random() - 0.5) * 2.5,
      vy: 1.5 + Math.random() * 2.5,
      w: 5 + Math.random() * 5,
      h: 7 + Math.random() * 8,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      round: Math.random() < 0.25,
      life: 1,
    })
  }
  return particles
}

function ConfettiCanvas({ teamColor }: { teamColor?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const particles = makeParticles(width, height, teamColor)
    let frame = 0
    let raf = 0
    const started = performance.now()

    const tick = () => {
      frame += 1
      ctx.clearRect(0, 0, width, height)
      let alive = 0
      for (const p of particles) {
        p.vy += 0.18
        p.vx *= 0.994
        p.vy *= 0.996
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        p.life = Math.max(0, 1 - (performance.now() - started) / 4200)
        if (p.y < height + 60 && p.life > 0) alive += 1
        if (p.y > height + 60 || p.life <= 0) continue
        ctx.save()
        ctx.globalAlpha = Math.min(1, p.life * 3)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        if (p.round) {
          ctx.beginPath()
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        }
        ctx.restore()
      }
      if (alive > 0 && frame < 400) {
        raf = window.requestAnimationFrame(tick)
      } else {
        ctx.clearRect(0, 0, width, height)
      }
    }
    raf = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [teamColor])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[70]"
    />
  )
}

/** Fires a confetti volley whenever a team wins (not on draws or undo). */
export function WinConfetti() {
  const winner = useAppStore((s) => s.game.winner)
  const variant = useAppStore((s) => s.variant)
  const previous = useRef(winner)
  const [volley, setVolley] = useState(0)

  useEffect(() => {
    if (winner && winner !== 'draw' && winner !== previous.current) {
      setVolley((n) => n + 1)
    }
    previous.current = winner
  }, [winner])

  if (!volley) return null
  const color = variant.teams.find((t) => t.id === winner)?.color
  return <ConfettiCanvas key={volley} teamColor={color} />
}
