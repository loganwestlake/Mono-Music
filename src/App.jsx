import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { AddToPlaylistProvider } from './components/AddToPlaylist'
import CommandPalette from './components/CommandPalette'
import DevicesDialog from './components/DevicesDialog'
import ImportDialog from './components/ImportDialog'
import { Drawer, MobileTopBar, Sidebar, TabBar } from './components/Navigation'
import ShortcutsDialog from './components/ShortcutsDialog'
import { useMediaQuery } from './components/ui'
import { completeSpotifyLogin } from './lib/importers'
import { navigate, useRoute } from './lib/router'
import LyricsView from './player/LyricsView'
import { MiniWindowProvider } from './player/MiniWindow'
import NowPlaying from './player/NowPlaying'
import PlayerBar from './player/PlayerBar'
import { PlayerProvider, usePlayer } from './player/PlayerProvider'
import { LibraryProvider, useLibrary } from './store/library'
import { CloudProvider } from './store/cloud'
import { ResolverProvider } from './store/resolver'
import { ToastProvider, useToast } from './store/toast'
import { UiProvider, useUi } from './store/ui'
import ArtistView from './views/ArtistView'
import ChooseArtistsView from './views/ChooseArtistsView'
import HomeView from './views/HomeView'
import LibraryView from './views/LibraryView'
import PlaylistView from './views/PlaylistView'
import SearchView from './views/SearchView'
import SettingsView from './views/SettingsView'
import StatsView from './views/StatsView'
import WelcomeView from './views/WelcomeView'

export default function App() {
  return (
    <LibraryProvider>
      <ToastProvider>
        <UiProvider>
          <ResolverProvider>
            <PlayerProvider>
              <CloudProvider>
                <MiniWindowProvider>
                  <AddToPlaylistProvider>
                    <Root />
                  </AddToPlaylistProvider>
                </MiniWindowProvider>
              </CloudProvider>
            </PlayerProvider>
          </ResolverProvider>
        </UiProvider>
      </ToastProvider>
    </LibraryProvider>
  )
}

function Root() {
  const route = useRoute()
  const { profile } = useLibrary()
  const { setImportOpen } = useUi()
  const toast = useToast()

  // Finish a Spotify sign-in that just redirected back here.
  useEffect(() => {
    completeSpotifyLogin().then((ok) => {
      if (ok) {
        toast('Connected to Spotify')
        setImportOpen(true)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (route.path === '/welcome/artists') return <ChooseArtistsView />
  if (route.path === '/welcome' || !profile.onboarded) return <WelcomeView />
  return <Shell route={route} />
}

/**
 * App frame (Spotify-style):
 *   phone   — top bar · content · player bar · tab bar; Now Playing is a sheet
 *   ≥768px  — sidebar (all playlists) · content, player bar along the bottom
 *   ≥1280px — plus a toggleable Now Playing column on the right
 */
function Shell({ route }) {
  const docked = useMediaQuery('(min-width: 1280px)')
  const ui = useUi()
  const mainRef = useRef(null)
  const routeKey = `${route.path}?${route.params.toString()}`

  // New page → back to top, close sheets.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
    ui.setSheetOpen(false)
    ui.setDrawerOpen(false)
  }, [routeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useKeyboardShortcuts(docked)

  const cols = docked
    ? ui.panel
      ? 'md:grid-cols-[264px_minmax(0,1fr)_400px]'
      : 'md:grid-cols-[264px_minmax(0,1fr)_0px]'
    : 'md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[264px_minmax(0,1fr)]'

  return (
    <div className={`flex h-dvh flex-col overflow-hidden md:grid md:grid-rows-[minmax(0,1fr)_auto] ${cols}`}>
      <Sidebar path={route.path} />
      <main ref={mainRef} className="relative min-h-0 flex-1 overflow-y-auto md:col-start-2 md:row-start-1">
        <MobileTopBar />
        <OfflineBanner />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={routeKey}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <View route={route} />
          </motion.div>
        </AnimatePresence>
      </main>
      <NowPlaying docked={docked} />
      <PlayerBar docked={docked} />
      <TabBar path={route.path} />

      <Drawer path={route.path} />
      <LyricsView open={ui.lyricsOpen} onClose={() => ui.setLyricsOpen(false)} />
      <ImportDialog open={ui.importOpen} onClose={() => ui.setImportOpen(false)} />
      <CommandPalette open={ui.paletteOpen} onClose={() => ui.setPaletteOpen(false)} />
      <ShortcutsDialog open={ui.shortcutsOpen} onClose={() => ui.setShortcutsOpen(false)} />
      <DevicesDialog open={ui.devicesOpen} onClose={() => ui.setDevicesOpen(false)} />
    </div>
  )
}

function View({ route }) {
  const [first, second] = route.segments
  switch (first) {
    case undefined:
      return <HomeView />
    case 'search':
      return <SearchView params={route.params} />
    case 'library':
      return <LibraryView params={route.params} />
    case 'liked':
      return <PlaylistView kind="liked" />
    case 'recent':
      return <PlaylistView kind="recent" />
    case 'playlist':
      return <PlaylistView kind="playlist" id={second} />
    case 'artist':
      return <ArtistView name={decodeURIComponent(second ?? '')} />
    case 'stats':
      return <StatsView />
    case 'settings':
      return <SettingsView />
    default:
      return <HomeView />
  }
}

function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  if (online) return null
  return (
    <div className="sticky top-0 z-20 flex items-center justify-center gap-2 bg-[#111] py-2 text-[10px] font-bold uppercase tracking-widest text-white">
      <WifiOff size={12} /> You’re offline — your library is still here
    </div>
  )
}

function useKeyboardShortcuts(docked) {
  const player = usePlayer()
  const library = useLibrary()
  const ui = useUi()
  const toast = useToast()
  const ref = useRef()
  ref.current = { player, library, ui, toast, docked }

  useEffect(() => {
    const onKey = (e) => {
      const { player: p, library: lib, ui: u, toast: say, docked: wide } = ref.current
      // ⌘K / Ctrl+K works everywhere, even in inputs.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        u.setPaletteOpen(!u.paletteOpen)
        return
      }
      const el = e.target
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      const key = e.key

      if (key === ' ' && el.tagName !== 'BUTTON') {
        e.preventDefault()
        p.toggle()
      } else if (key === 'ArrowRight' && e.shiftKey) p.next()
      else if (key === 'ArrowLeft' && e.shiftKey) p.prev()
      else if (key === 'ArrowRight' || key === 'ArrowLeft') {
        if (!p.current) return
        e.preventDefault()
        p.seek(Math.max(0, p.getTime() + (key === 'ArrowRight' ? 5 : -5)))
      } else if (key === 'ArrowUp' || key === 'ArrowDown') {
        e.preventDefault()
        p.setVolume(Math.max(0, Math.min(100, p.volume + (key === 'ArrowUp' ? 5 : -5))))
      } else if (key === 'l' || key === 'L') {
        if (!p.current) return
        say(lib.isLiked(p.current.id) ? 'Removed from Liked Songs' : 'Added to Liked Songs')
        lib.toggleLike(p.current)
      } else if (key === 'm' || key === 'M') p.toggleMute()
      else if (key === 's' || key === 'S') p.toggleShuffle()
      else if (key === 'r' || key === 'R') p.cycleRepeat()
      else if (key === 'y' || key === 'Y') u.setLyricsOpen(!u.lyricsOpen)
      else if (key === 'q' || key === 'Q') (wide ? u.togglePanel() : u.setSheetOpen(!u.sheetOpen))
      else if (key === 'd' || key === 'D') {
        const dark = lib.settings.theme !== 'dark'
        lib.updateSettings({ theme: dark ? 'dark' : 'light' })
        say(dark ? 'Dark mode' : 'Light mode')
      } else if (key === '?') u.setShortcutsOpen(true)
      else if (key === '/') {
        e.preventDefault()
        navigate('/search')
        setTimeout(() => document.getElementById('search-input')?.focus(), 50)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
