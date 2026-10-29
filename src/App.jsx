import { useEffect, useRef, useState } from 'react'
import { Sidebar, TabBar } from './components/Navigation'
import { AddToPlaylistProvider } from './components/AddToPlaylist'
import { useMediaQuery } from './components/ui'
import { navigate, useRoute } from './lib/router'
import LyricsView from './player/LyricsView'
import MiniPlayer from './player/MiniPlayer'
import { MiniWindowProvider } from './player/MiniWindow'
import NowPlaying from './player/NowPlaying'
import { PlayerProvider, usePlayer } from './player/PlayerProvider'
import { LibraryProvider, useLibrary } from './store/library'
import { ToastProvider, useToast } from './store/toast'
import { UiProvider, useUi } from './store/ui'
import ChooseArtistsView from './views/ChooseArtistsView'
import HomeView from './views/HomeView'
import LibraryView from './views/LibraryView'
import PlaylistView from './views/PlaylistView'
import SearchView from './views/SearchView'
import SettingsView from './views/SettingsView'
import WelcomeView from './views/WelcomeView'

export default function App() {
  return (
    <LibraryProvider>
      <ToastProvider>
        <UiProvider>
          <PlayerProvider>
            <MiniWindowProvider>
              <AddToPlaylistProvider>
                <Root />
              </AddToPlaylistProvider>
            </MiniWindowProvider>
          </PlayerProvider>
        </UiProvider>
      </ToastProvider>
    </LibraryProvider>
  )
}

function Root() {
  const route = useRoute()
  const { profile } = useLibrary()

  if (route.path === '/welcome/artists') return <ChooseArtistsView />
  if (route.path === '/welcome' || !profile.onboarded) return <WelcomeView />
  return <Shell route={route} />
}

/**
 * App frame:
 *   phone   — content, mini player, tab bar; Now Playing is a sheet
 *   ≥1024px — sidebar + content + bottom player bar
 *   ≥1280px — sidebar + content + docked Now Playing column
 */
function Shell({ route }) {
  const docked = useMediaQuery('(min-width: 1280px)')
  const [sheetOpen, setSheetOpen] = useState(false)
  const { lyricsOpen, setLyricsOpen } = useUi()
  const mainRef = useRef(null)

  // New page → back to top, close the sheet.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
    setSheetOpen(false)
  }, [route.path, route.params.toString()]) // eslint-disable-line react-hooks/exhaustive-deps

  useKeyboardShortcuts()

  return (
    <div className="flex h-dvh flex-col overflow-hidden lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_auto] xl:grid-cols-[240px_minmax(0,1fr)_400px]">
      <Sidebar path={route.path} />
      <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto lg:col-start-2 lg:row-start-1">
        <View route={route} />
      </main>
      {!docked && <MiniPlayer onOpen={() => setSheetOpen(true)} />}
      <TabBar path={route.path} />
      <NowPlaying docked={docked} open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <LyricsView open={lyricsOpen} onClose={() => setLyricsOpen(false)} />
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
      return <LibraryView />
    case 'liked':
      return <PlaylistView kind="liked" />
    case 'recent':
      return <PlaylistView kind="recent" />
    case 'playlist':
      return <PlaylistView kind="playlist" id={second} />
    case 'settings':
      return <SettingsView />
    default:
      return <HomeView />
  }
}

function useKeyboardShortcuts() {
  const player = usePlayer()
  const { toggleLike, isLiked } = useLibrary()
  const toast = useToast()
  const ref = useRef()
  ref.current = { player, toggleLike, isLiked, toast }

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return
      const { player: p, toggleLike, isLiked, toast } = ref.current
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
        toast(isLiked(p.current.id) ? 'Removed from Liked Songs' : 'Added to Liked Songs')
        toggleLike(p.current)
      } else if (key === '/') {
        e.preventDefault()
        navigate('/search')
        setTimeout(() => document.getElementById('search-input')?.focus(), 50)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
