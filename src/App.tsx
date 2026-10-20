import { AppHeader } from './components/AppHeader'
import { MakerView } from './components/MakerView'
import { PlayView } from './components/PlayView'
import { Toaster } from './components/ui/sonner'
import { TooltipProvider } from './components/ui/tooltip'
import { useAppStore } from './store/useAppStore'

const buildTimeLabel = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(__BUILD_TIME__))

export default function App() {
  const view = useAppStore((s) => s.view)
  const theme = useAppStore((s) => s.theme)

  return (
    <TooltipProvider>
      <div className="flex min-h-full flex-col">
        <AppHeader />
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 lg:px-8">
          {view === 'play' ? <PlayView /> : <MakerView />}
        </main>
        <footer className="border-t">
          <div className="text-muted-foreground mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs lg:px-8">
            <span>Every rule is editable. Nothing is fixed.</span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
              <span>
                built{' '}
                <time dateTime={__BUILD_TIME__} title={new Date(__BUILD_TIME__).toUTCString()}>
                  {buildTimeLabel}
                </time>
              </span>
              {__BUILD_COMMIT__ !== 'unknown' && (
                <a
                  href={`https://github.com/Coobyk/goonchess/commit/${__BUILD_COMMIT__}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-border underline-offset-4 hover:text-foreground"
                >
                  commit {__BUILD_COMMIT__.slice(0, 7)}
                </a>
              )}
            </span>
          </div>
        </footer>
        <Toaster theme={theme} position="bottom-right" closeButton richColors />
      </div>
    </TooltipProvider>
  )
}
