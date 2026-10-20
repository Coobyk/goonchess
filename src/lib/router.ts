import type { MakerTab, View } from '@/store/useAppStore'

export const MAKER_TABS: MakerTab[] = ['board', 'pieces', 'setup', 'rules']

export interface Route {
  view: View
  makerTab: MakerTab
}

/** Reads the current URL. Unknown paths fall back to the play page. */
export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'maker') {
    const tab = parts[1] as MakerTab
    return {
      view: 'maker',
      makerTab: MAKER_TABS.includes(tab) ? tab : 'board',
    }
  }
  if (parts[0] === 'rulebook') return { view: 'rulebook', makerTab: 'board' }
  return { view: 'play', makerTab: 'board' }
}

/** The canonical URL for a view. */
export function pathFor(view: View, makerTab: MakerTab = 'board'): string {
  if (view === 'maker') return makerTab === 'board' ? '/maker' : `/maker/${makerTab}`
  if (view === 'rulebook') return '/rulebook'
  return '/'
}

/** Push a route without reloading the page, keeping query and variant hash. */
export function pushRoute(view: View, makerTab: MakerTab = 'board') {
  if (typeof window === 'undefined') return
  const path = pathFor(view, makerTab)
  if (window.location.pathname === path) return
  try {
    window.history.pushState(null, '', `${path}${window.location.search}${window.location.hash}`)
  } catch {
    /* history is unavailable in some embedded contexts */
  }
}

/** Replace the current entry (used when normalising an unknown URL). */
export function replaceRoute(view: View, makerTab: MakerTab = 'board') {
  if (typeof window === 'undefined') return
  const path = pathFor(view, makerTab)
  if (window.location.pathname === path) return
  try {
    window.history.replaceState(null, '', `${path}${window.location.search}${window.location.hash}`)
  } catch {
    /* ignore */
  }
}

export const routeFromLocation = (): Route =>
  parseRoute(typeof window === 'undefined' ? '/' : window.location.pathname)
