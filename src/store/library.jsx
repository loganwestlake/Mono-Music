import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react'
import { load, save } from '../lib/storage'

/**
 * Everything the listener owns, persisted to localStorage:
 * profile, liked songs, recently played, playlists and settings.
 */

const INITIAL = {
  profile: { onboarded: false, name: '', artists: [] },
  liked: [],
  recent: [],
  playlists: [],
  settings: { apiKey: '', adFree: true },
}

const strip = ({ id, title, artist, duration }) => ({ id, title, artist, duration: duration || 0 })
const uid = () => Math.random().toString(36).slice(2, 10)

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
        recent: [strip(action.track), ...state.recent.filter((t) => t.id !== action.track.id)].slice(0, 50),
      }
    case 'clearRecent':
      return { ...state, recent: [] }
    case 'createPlaylist':
      return {
        ...state,
        playlists: [
          { id: action.id, name: action.name, tracks: action.tracks.map(strip), createdAt: Date.now() },
          ...state.playlists,
        ],
      }
    case 'renamePlaylist':
      return { ...state, playlists: state.playlists.map((p) => (p.id === action.id ? { ...p, name: action.name } : p)) }
    case 'deletePlaylist':
      return { ...state, playlists: state.playlists.filter((p) => p.id !== action.id) }
    case 'addToPlaylist':
      return {
        ...state,
        playlists: state.playlists.map((p) =>
          p.id === action.id && !p.tracks.some((t) => t.id === action.track.id)
            ? { ...p, tracks: [...p.tracks, strip(action.track)] }
            : p,
        ),
      }
    case 'removeFromPlaylist':
      return {
        ...state,
        playlists: state.playlists.map((p) =>
          p.id === action.id ? { ...p, tracks: p.tracks.filter((t) => t.id !== action.trackId) } : p,
        ),
      }
    case 'reset':
      return INITIAL
    default:
      return state
  }
}

const LibraryContext = createContext(null)

export function LibraryProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => load('library', INITIAL))

  useEffect(() => save('library', state), [state])

  const isLiked = useCallback((id) => state.liked.some((t) => t.id === id), [state.liked])

  const api = useMemo(
    () => ({
      updateProfile: (patch) => dispatch({ type: 'profile', patch }),
      updateSettings: (patch) => dispatch({ type: 'settings', patch }),
      toggleLike: (track) => dispatch({ type: 'toggleLike', track }),
      addRecent: (track) => dispatch({ type: 'recent', track }),
      clearRecent: () => dispatch({ type: 'clearRecent' }),
      createPlaylist: (name, tracks = []) => {
        const id = uid()
        dispatch({ type: 'createPlaylist', id, name: name.trim() || 'Untitled', tracks })
        return id
      },
      renamePlaylist: (id, name) => dispatch({ type: 'renamePlaylist', id, name }),
      deletePlaylist: (id) => dispatch({ type: 'deletePlaylist', id }),
      addToPlaylist: (id, track) => dispatch({ type: 'addToPlaylist', id, track }),
      removeFromPlaylist: (id, trackId) => dispatch({ type: 'removeFromPlaylist', id, trackId }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [],
  )

  const value = useMemo(() => ({ ...state, ...api, isLiked }), [state, api, isLiked])
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export const useLibrary = () => useContext(LibraryContext)
