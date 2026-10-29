import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, ExternalLink, FileText, Music2, SquarePlay, Upload, X } from 'lucide-react'
import {
  importCsv,
  importText,
  spotifyConnected,
  spotifyDisconnect,
  spotifyPlaylists,
  spotifyPlaylistTracks,
  spotifyRedirectUri,
  startSpotifyLogin,
  youtubePlaylistId,
} from '../lib/importers'
import { navigate } from '../lib/router'
import { fetchYouTubePlaylist } from '../lib/search'
import { useLibrary } from '../store/library'
import { useResolver } from '../store/resolver'
import { useToast } from '../store/toast'
import { IconButton, PillButton, Spinner } from './ui'

const TABS = [
  { id: 'spotify', label: 'Spotify', icon: Music2 },
  { id: 'youtube', label: 'YouTube', icon: SquarePlay },
  { id: 'file', label: 'File / Text', icon: FileText },
]

/** Bring playlists in from Spotify, YouTube, or a CSV / pasted list. */
export default function ImportDialog({ open, onClose }) {
  const [tab, setTab] = useState('spotify')
  const library = useLibrary()
  const { resolveAll } = useResolver()
  const toast = useToast()

  const finish = (name, tracks, source) => {
    if (!tracks.length) return toast('No songs found to import.')
    const id = library.createPlaylist(name, tracks, source)
    toast(`Imported “${name}” · ${tracks.length} songs`)
    resolveAll(tracks, `Matching “${name}”`)
    return id
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 backdrop-blur-[2px] sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Import playlists"
            className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-[#F2F2F2] pb-[max(env(safe-area-inset-bottom),20px)] sm:rounded-[28px]"
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-6 pt-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Bring your music</p>
                <h2 className="mt-1 text-[30px] leading-none font-black tracking-tight">
                  Import <span className="font-serif font-normal italic">playlists</span>
                </h2>
              </div>
              <IconButton icon={X} label="Close" onClick={onClose} className="-mt-2 -mr-3" />
            </div>

            <div className="mx-6 mt-5 grid grid-cols-3 gap-1 rounded-full border border-black/10 p-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex h-9 items-center justify-center gap-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition ${
                    tab === id ? 'bg-[#111] text-white' : 'text-[#111]/60 hover:text-[#111]'
                  }`}
                >
                  <Icon size={13} strokeWidth={1.5} />
                  {label}
                </button>
              ))}
            </div>

            <div className="no-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto px-6">
              {tab === 'spotify' && <SpotifyTab onImport={finish} onDone={onClose} />}
              {tab === 'youtube' && <YouTubeTab onImport={finish} onDone={onClose} />}
              {tab === 'file' && <FileTab onImport={finish} onDone={onClose} />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SpotifyTab({ onImport, onDone }) {
  const { settings, updateSettings } = useLibrary()
  const toast = useToast()
  const [clientId, setClientId] = useState(settings.spotifyClientId)
  const [connected, setConnected] = useState(spotifyConnected)
  const [lists, setLists] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [busy, setBusy] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!connected) return
    spotifyPlaylists()
      .then(setLists)
      .catch((e) => {
        toast(e.message)
        setConnected(spotifyConnected())
      })
  }, [connected, toast])

  const run = async () => {
    const chosen = lists.filter((l) => selected.has(l.id))
    let last
    for (const [n, l] of chosen.entries()) {
      setBusy(`Reading “${l.name}” (${n + 1}/${chosen.length})…`)
      try {
        const { name, tracks } = await spotifyPlaylistTracks(l, (done, total) =>
          setBusy(`Reading “${l.name}” — ${done}${total ? `/${total}` : ''} songs`),
        )
        last = onImport(name, tracks, 'spotify')
      } catch (e) {
        toast(e.message)
      }
    }
    setBusy(null)
    onDone()
    if (last) navigate(`/playlist/${last}`)
  }

  if (!settings.spotifyClientId) {
    const redirect = spotifyRedirectUri()
    return (
      <div className="space-y-4 pb-2 text-[13px] leading-relaxed text-neutral-600">
        <p>
          Spotify only lets apps read your playlists after a one-time setup (about 2 minutes, free):
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open the{' '}
            <a className="font-semibold text-[#111] underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
              Spotify Developer Dashboard <ExternalLink size={11} className="inline" />
            </a>{' '}
            and click <b>Create app</b> (choose “Web API”).
          </li>
          <li>
            Add this <b>Redirect URI</b>:
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(redirect)
                setCopied(true)
              }}
              className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-left font-mono text-[11px] text-[#111]"
            >
              <span className="truncate">{redirect}</span>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </li>
          <li>Copy the app’s <b>Client ID</b> and paste it here:</li>
        </ol>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            updateSettings({ spotifyClientId: clientId.trim() })
          }}
          className="flex gap-2"
        >
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Spotify Client ID"
            className="h-12 min-w-0 flex-1 rounded-full border border-black/10 bg-white px-5 text-[14px] outline-none focus:border-black/40"
          />
          <PillButton type="submit" disabled={!clientId.trim()}>
            Save
          </PillButton>
        </form>
        <p className="text-[12px] text-neutral-400">
          No time? Export a playlist as CSV at{' '}
          <a className="underline" href="https://exportify.app" target="_blank" rel="noreferrer">
            exportify.app
          </a>{' '}
          and use the File tab.
        </p>
      </div>
    )
  }

  if (!connected)
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <p className="max-w-xs text-[13px] text-neutral-500">
          Sign in with Spotify to pick the playlists you want. Mono only reads them — it never changes your Spotify.
        </p>
        <PillButton className="mt-6 h-14 px-8" onClick={() => startSpotifyLogin(settings.spotifyClientId)}>
          Connect Spotify
        </PillButton>
        <button
          type="button"
          onClick={() => updateSettings({ spotifyClientId: '' })}
          className="mt-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
        >
          Change Client ID
        </button>
      </div>
    )

  if (!lists)
    return (
      <div className="flex justify-center py-12 text-neutral-400">
        <Spinner />
      </div>
    )

  return (
    <div className="pb-2">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setSelected(selected.size === lists.length ? new Set() : new Set(lists.map((l) => l.id)))}
          className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
        >
          {selected.size === lists.length ? 'Select none' : 'Select all'}
        </button>
        <button
          type="button"
          onClick={() => {
            spotifyDisconnect()
            setConnected(false)
          }}
          className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
        >
          Disconnect
        </button>
      </div>
      <ul className="space-y-1">
        {lists.map((l) => {
          const on = selected.has(l.id)
          return (
            <li key={l.id}>
              <button
                type="button"
                onClick={() =>
                  setSelected((s) => {
                    const n = new Set(s)
                    n.has(l.id) ? n.delete(l.id) : n.add(l.id)
                    return n
                  })
                }
                className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition ${on ? 'bg-black/[0.07]' : 'hover:bg-black/[0.04]'}`}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#111] text-white">
                  {l.image ? <img src={l.image} alt="" className="h-full w-full object-cover grayscale" /> : <Music2 size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold tracking-tight">{l.name}</span>
                  {l.count != null && <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{l.count} songs</span>}
                </span>
                <span className={`grid h-6 w-6 place-items-center rounded-full border ${on ? 'border-[#111] bg-[#111] text-white' : 'border-black/20'}`}>
                  {on && <Check size={13} strokeWidth={2.5} />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="sticky bottom-0 bg-gradient-to-t from-[#F2F2F2] via-[#F2F2F2] pt-4">
        <PillButton className="h-14 w-full" disabled={!selected.size || !!busy} onClick={run}>
          {busy ?? `Import ${selected.size || ''} playlist${selected.size === 1 ? '' : 's'}`}
        </PillButton>
      </div>
    </div>
  )
}

function YouTubeTab({ onImport, onDone }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const listId = youtubePlaylistId(url)

  const run = async (e) => {
    e.preventDefault()
    if (!listId) return
    setBusy(true)
    try {
      const { name, tracks } = await fetchYouTubePlaylist(listId)
      const id = onImport(name || 'YouTube playlist', tracks, 'youtube')
      onDone()
      if (id) navigate(`/playlist/${id}`)
    } catch {
      toast('Couldn’t read that playlist — is it public?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={run} className="space-y-4 pb-2">
      <p className="text-[13px] leading-relaxed text-neutral-500">
        Paste a public YouTube or YouTube Music playlist link.
      </p>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://youtube.com/playlist?list=…"
        className="h-12 w-full rounded-full border border-black/10 bg-white px-5 text-[14px] outline-none focus:border-black/40"
      />
      <PillButton type="submit" className="h-14 w-full" disabled={!listId || busy}>
        {busy ? 'Importing…' : 'Import playlist'}
      </PillButton>
    </form>
  )
}

function FileTab({ onImport, onDone }) {
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const toast = useToast()

  const fromFile = async (file) => {
    if (!file) return
    const content = await file.text()
    const base = file.name.replace(/\.[^.]+$/, '')
    try {
      const result = /\.csv$/i.test(file.name) ? importCsv(content, base) : importText(content, base)
      const id = onImport(result.name, result.tracks, 'file')
      onDone()
      if (id) navigate(`/playlist/${id}`)
    } catch (e) {
      toast(e.message)
    }
  }

  const fromText = (e) => {
    e.preventDefault()
    try {
      const result = importText(text, name.trim() || 'Imported playlist')
      const id = onImport(result.name, result.tracks, 'text')
      onDone()
      if (id) navigate(`/playlist/${id}`)
    } catch (err) {
      toast(err.message)
    }
  }

  return (
    <div className="space-y-5 pb-2">
      <label className="flex cursor-pointer flex-col items-center rounded-2xl border border-dashed border-black/20 px-6 py-7 text-center transition hover:border-black/50">
        <Upload size={22} strokeWidth={1.25} />
        <span className="mt-2 text-[13px] font-semibold tracking-tight">Upload a CSV or text file</span>
        <span className="mt-1 text-[11px] text-neutral-400">Works with Exportify, TuneMyMusic and Soundiiz exports</span>
        <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => fromFile(e.target.files?.[0])} />
      </label>

      <form onSubmit={fromText} className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Or paste songs — one “Artist - Title” per line</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Playlist name"
          className="h-11 w-full rounded-full border border-black/10 bg-white px-5 text-[14px] outline-none focus:border-black/40"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={'Daft Punk - Around the World\nFrank Ocean - Nights\nRadiohead - Nude'}
          className="w-full resize-none rounded-2xl border border-black/10 bg-white px-5 py-4 text-[14px] outline-none focus:border-black/40"
        />
        <PillButton type="submit" className="h-14 w-full" disabled={!text.trim()}>
          Import list
        </PillButton>
      </form>
    </div>
  )
}
