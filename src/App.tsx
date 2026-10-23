import { useEffect } from 'react'
import { AppHeader } from './components/AppHeader'
import { MakerView } from './components/MakerView'
import { PlayView } from './components/PlayView'
import { RulebookView } from './components/RulebookView'
import { Toaster } from './components/ui/sonner'
import { TooltipProvider } from './components/ui/tooltip'
import { pathFor, replaceRoute, routeFromLocation } from './lib/router'
import { useAppStore } from './store/useAppStore'

const buildDate = new Date(__BUILD_TIME__)
const buildTimeLabel = buildDate.toISOString().slice(0, 19).replace('T', ' ')
const ago = (() => {
  const s = Math.max(0, Math.floor((Date.now() - buildDate.getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`
  if (s < 31536000) return `${Math.floor(s / 2592000)}mo ago`
  return `${Math.floor(s / 31536000)}y ago`
})()

export default function App() {
  const view = useAppStore((s) => s.view)
  const theme = useAppStore((s) => s.theme)

  useEffect(() => {
    const sync = () => useAppStore.getState().applyRoute(routeFromLocation())
    window.addEventListener('popstate', sync)

    // Unknown or non-canonical paths get rewritten to a real route.
    const route = routeFromLocation()
    useAppStore.getState().applyRoute(route)
    if (window.location.pathname !== pathFor(route.view, route.makerTab, route.gameCode)) {
      replaceRoute(route.view, route.makerTab, route.gameCode)
    }

    return () => window.removeEventListener('popstate', sync)
  }, [])

  return (
    <TooltipProvider>
      <div className="relative flex min-h-full flex-col">
        {/* A drawing sheet under everything: faint, and gone before it reaches
            the board. */}
        <div aria-hidden className="app-grid pointer-events-none fixed inset-0 z-0" />
        <AppHeader />
        <main className="relative z-10 mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {view === 'play' ? <PlayView /> : view === 'maker' ? <MakerView /> : <RulebookView />}
        </main>
        <footer className="relative z-10 mt-8 border-t">
          <div className="text-muted-foreground mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 font-mono text-[10px] tracking-[0.12em] uppercase lg:px-8">
            <span className="flex items-center gap-2">
              <span>Goonchess</span>
              <span className="text-border">/</span>
              <a
                href="https://coobyk.com"
                target="_blank"
                rel="noreferrer"
                className="decoration-border hover:text-foreground underline-offset-4 hover:underline"
              >
                Coobyk
              </a>
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                built{' '}
                <time dateTime={__BUILD_TIME__} title={new Date(__BUILD_TIME__).toUTCString()}>
                  {buildTimeLabel}
                </time>
              </span>
              {__BUILD_COMMIT__ !== 'unknown' && (
                <>
                  <span className="text-border">/</span>
                  <a
                    href={`https://github.com/Coobyk/goonchess/commit/${__BUILD_COMMIT__}`}
                    target="_blank"
                    rel="noreferrer"
                    className="decoration-border hover:text-foreground underline-offset-4 hover:underline"
                  >
                    commit {__BUILD_COMMIT__.slice(0, 7)}
                  </a>
                  <span>({ago})</span>
                </>
              )}
            </span>
          </div>
        </footer>
        <Toaster theme={theme} position="bottom-right" closeButton richColors />
      </div>
    </TooltipProvider>
  )
}
