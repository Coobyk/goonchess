import { useEffect, useState } from 'react'

/** How wide an element is, live — the boards size their squares from this. */
export function useElementWidth<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    setWidth(node.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [node])
  return [setNode, width] as const
}

/** The square size a board of `cols` columns fits into `containerWidth`,
 * leaving room for the coordinate labels around it. */
export function boardCellSize(containerWidth: number, cols: number, max = 64, min = 20) {
  if (!containerWidth) return max
  const raw = Math.floor((containerWidth - 44) / cols)
  return Math.max(min, Math.min(max, raw))
}
