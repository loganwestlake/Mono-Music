import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { load, save } from '../lib/storage'

/** UI-only state shared across the shell: lyrics overlay and player view mode. */
const UiContext = createContext(null)

export function UiProvider({ children }) {
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [viewMode, setViewMode] = useState(() => load('ui', { viewMode: 'art' }).viewMode)

  useEffect(() => save('ui', { viewMode }), [viewMode])

  const value = useMemo(() => ({ lyricsOpen, setLyricsOpen, viewMode, setViewMode }), [lyricsOpen, viewMode])
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>
}

export const useUi = () => useContext(UiContext)
