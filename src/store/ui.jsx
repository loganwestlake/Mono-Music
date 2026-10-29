import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { load, save } from '../lib/storage'

/**
 * UI-only state shared across the shell: overlays (lyrics, import,
 * command palette, shortcuts, mobile drawer, player sheet) and view prefs.
 */
const UiContext = createContext(null)

export function UiProvider({ children }) {
  const [prefs, setPrefs] = useState(() => load('ui', { viewMode: 'art', panel: true }))
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => save('ui', prefs), [prefs])

  const value = useMemo(
    () => ({
      viewMode: prefs.viewMode,
      setViewMode: (viewMode) => setPrefs((p) => ({ ...p, viewMode })),
      panel: prefs.panel,
      togglePanel: () => setPrefs((p) => ({ ...p, panel: !p.panel })),
      lyricsOpen,
      setLyricsOpen,
      importOpen,
      setImportOpen,
      paletteOpen,
      setPaletteOpen,
      shortcutsOpen,
      setShortcutsOpen,
      drawerOpen,
      setDrawerOpen,
      sheetOpen,
      setSheetOpen,
    }),
    [prefs, lyricsOpen, importOpen, paletteOpen, shortcutsOpen, drawerOpen, sheetOpen],
  )
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>
}

export const useUi = () => useContext(UiContext)
