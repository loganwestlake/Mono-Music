import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import { load, save } from '../lib/storage'

/**
 * Everything the listener owns, persisted to localStorage: profile, liked
 * songs, history, playlists, play counts, search history and settings.
 */

export const DEFAULT_SETTINGS = {
  apiKey: '',
  adFree: true,
  autoplay: true, // keep playing similar music when the queue ends
  muteAds: true,
  notifications: false,
  theme: 'light',
  spotifyClientId: '',
  lyricsSize: 1, // 0.8 – 1.3
  lyricsOffset: 0, // seconds, to fix out-of-sync lyrics
}

const INITIAL = {
  profile: { onboarded: false, name: '', artists: [] },
  liked: [],
  recent: [],
  playlists: [],
  plays: {}, // id → { track, count, seconds, last }
  listening: { seconds: 0, days: [] }, // total time, ISO dates listened
  searches: [],
  settings: DEFAULT_SETTINGS,
}

const strip = ({ id, title, artist, duration, cover }) => ({
  id,
  title,
  artist,
  duration: duration || 0,
  ...(cover ? { cover } : {}),
})
const uid = () => Math.random().toString(36).slice(2, 10)
const today = () => new Date().toISOString().slice(0, 10)

const mapTracks = (state, fn) => ({
  ...state,
  liked: state.liked.map(fn),
  recent: state.recent.map(fn),
  playlists: state.playlists.map((p) => ({ ...p, tracks: p.tracks.map(fn) })),
})

function reducer(state, action) {
  switch (action.type) {
    case 'profile':
      return { ...state, profile: { ...state.profile, ...action.patch } }
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case 'toggleLike': {
      const has = state.liked.some((t) => t.id === action.track.id)
      return {
        ...state,
        liked: has ? state.liked.filter((t) => t.id !== action.track.id) : [strip(action.track), ...state.liked],
      }
    }
    case 'recent':
      return {
        ...state,
        recent: [strip(action.track), ...state.recent.filter((t) => t.id !== action.track.id)].slice(0, 100),
      }
    case 'clearRecent':
      return { ...state, recent: [] }
    case 'play': {
      const prev = state.plays[action.track.id]
      return {
        ...state,
        plays: {
          ...state.plays,
          [action.track.id]: {
            track: strip(action.track),
            count: (prev?.count ?? 0) + 1,
            seconds: prev?.seconds ?? 0,
            last: Date.now(),
          },
        },
      }
    }
    case 'listen': {
      const prev = state.plays[action.track.id]
      const days = state.listening.days.includes(today())
        ? state.listening.days
        : [...state.listening.days, today()].slice(-400)
      return {
        ...state,
        listening: { seconds: state.listening.seconds + action.seconds, days },
        plays: prev
          ? { ...state.plays, [action.track.id]: { ...prev, seconds: prev.seconds + action.seconds } }
          : state.plays,
      }
    }
    case 'search': {
      const q = action.query.trim()
      if (!q) return state
      return { ...state, searches: [q, ...state.searches.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, 12) }
    }
    case 'clearSearches':
      return { ...state, searches: [] }
    case 'createPlaylist':
      return {
        ...state,
        playlists: [
          { id: action.id, name: action.name, tracks: action.tracks.map(strip), createdAt: Date.now(), source: action.source },
          ...state.playlists,
        ],
      }
    case 'renamePlaylist':
      return { ...state, playlists: state.playlists.map((p) => (p.id === action.id ? { ...p, name: action.name } : p)) }
    case 'deletePlaylist':
      return { ...state, playlists: state.playlists.filter((p) => p.id !== action.id) }
    case 'restorePlaylist':
      return { ...state, playlists: [action.playlist, ...state.playlists] }
    case 'addToPlaylist':
      return {
        ...state,
        playlists: state.playlists.map((p) =>
          p.id === action.id && !p.tracks.some((t) => t.id === action.track.id)
            ? { ...p, tracks: [...p.tracks, strip(action.track)] }
            : p,
        ),
      }
    case 'insertInPlaylist':
      return {
        ...state,
        playlists: state.playlists.map((p) => {
          if (p.id !== action.id) return p
          const tracks = [...p.tracks]
          tracks.splice(action.index, 0, strip(action.track))
          return { ...p, tracks }
        }),
      }
    case 'removeFromPlaylist':
      return {
        ...state,
        playlists: state.playlists.map((p) =>
          p.id === action.id ? { ...p, tracks: p.tracks.filter((t) => t.id !== action.trackId) } : p,
        ),
      }
    case 'setPlaylistTracks':
      return {
        ...state,
        playlists: state.playlists.map((p) => (p.id === action.id ? { ...p, tracks: action.tracks.map(strip) } : p)),
      }
    case 'resolveTrack':
      // An imported/recommended song was matched to a YouTube video.
      return mapTracks(state, (t) => (t.id === action.from ? { ...t, id: action.to, duration: t.duration || action.duration || 0 } : t))
    case 'replace':
      return { ...INITIAL, ...action.state, settings: { ...DEFAULT_SETTINGS, ...action.state.settings } }
    case 'reset':
      return INITIAL
    default:
      return state
  }
}

function init() {
  const saved = load('library', INITIAL)
  return {
    ...INITIAL,
    ...saved,
    settings: { ...DEFAULT_SETTINGS, ...saved.settings },
    listening: { ...INITIAL.listening, ...saved.listening },
  }
}

const LibraryContext = createContext(null)

export function LibraryProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, init)

  useEffect(() => save('library', state), [state])

  // Apply theme to <html> (dark mode = whole-page invert; the app is pure monochrome).
  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', state.settings.theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', state.settings.theme === 'dark' ? '#0D0D0D' : '#F2F2F2')
  }, [state.settings.theme])

  const isLiked = useCallback((id) => state.liked.some((t) => t.id === id), [state.liked])

  const api = useMemo(
    () => ({
      updateProfile: (patch) => dispatch({ type: 'profile', patch }),
      updateSettings: (patch) => dispatch({ type: 'settings', patch }),
      toggleLike: (track) => dispatch({ type: 'toggleLike', track }),
      addRecent: (track) => dispatch({ type: 'recent', track }),
      clearRecent: () => dispatch({ type: 'clearRecent' }),
      countPlay: (track) => dispatch({ type: 'play', track }),
      addListen: (track, seconds) => dispatch({ type: 'listen', track, seconds }),
      addSearch: (query) => dispatch({ type: 'search', query }),
      clearSearches: () => dispatch({ type: 'clearSearches' }),
      createPlaylist: (name, tracks = [], source) => {
        const id = uid()
        dispatch({ type: 'createPlaylist', id, name: name.trim() || 'Untitled', tracks, source })
        return id
      },
      renamePlaylist: (id, name) => dispatch({ type: 'renamePlaylist', id, name }),
      deletePlaylist: (id) => dispatch({ type: 'deletePlaylist', id }),
      restorePlaylist: (playlist) => dispatch({ type: 'restorePlaylist', playlist }),
      addToPlaylist: (id, track) => dispatch({ type: 'addToPlaylist', id, track }),
      insertInPlaylist: (id, track, index) => dispatch({ type: 'insertInPlaylist', id, track, index }),
      removeFromPlaylist: (id, trackId) => dispatch({ type: 'removeFromPlaylist', id, trackId }),
      setPlaylistTracks: (id, tracks) => dispatch({ type: 'setPlaylistTracks', id, tracks }),
      resolveTrack: (from, to, duration) => dispatch({ type: 'resolveTrack', from, to, duration }),
      replaceAll: (next) => dispatch({ type: 'replace', state: next }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [],
  )

  const value = useMemo(() => ({ ...state, ...api, isLiked }), [state, api, isLiked])
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export const useLibrary = () => useContext(LibraryContext)
