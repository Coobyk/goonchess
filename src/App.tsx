import { AppHeader } from './components/AppHeader'
import { MakerView } from './components/MakerView'
import { PlayView } from './components/PlayView'
import { Toaster } from './components/ui/sonner'
import { TooltipProvider } from './components/ui/tooltip'
import { useAppStore } from './store/useAppStore'

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
            <span className="font-mono">goonchess</span>
          </div>
        </footer>
        <Toaster theme={theme} position="bottom-right" closeButton richColors />
      </div>
    </TooltipProvider>
  )
}
