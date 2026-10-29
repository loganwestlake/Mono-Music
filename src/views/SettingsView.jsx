import { useState } from 'react'
import { Check, Download, ExternalLink, Keyboard, Upload } from 'lucide-react'
import { SHORTCUTS } from '../components/ShortcutsDialog'
import { Eyebrow, PageTitle, PillButton } from '../components/ui'
import { navigate } from '../lib/router'
import { clearAll } from '../lib/storage'
import { useLibrary } from '../store/library'
import { useToast } from '../store/toast'
import { useUi } from '../store/ui'

export default function SettingsView() {
  const library = useLibrary()
  const { profile, settings, updateProfile, updateSettings } = library
  const toast = useToast()
  const { setShortcutsOpen, setImportOpen } = useUi()
  const [name, setName] = useState(profile.name)
  const [key, setKey] = useState(settings.apiKey)

  const saveProfile = (e) => {
    e.preventDefault()
    updateProfile({ name: name.trim() })
    toast('Saved')
  }

  const saveKey = (e) => {
    e.preventDefault()
    updateSettings({ apiKey: key.trim() })
    toast(key.trim() ? 'API key saved' : 'API key removed')
  }

  const toggleNotifications = async (on) => {
    if (on && 'Notification' in window && Notification.permission !== 'granted') {
      const result = await Notification.requestPermission()
      if (result !== 'granted') return toast('Notifications are blocked in your browser settings.')
    }
    updateSettings({ notifications: on })
  }

  const backup = () => {
    const { profile: p, liked, recent, playlists, plays, listening, searches, settings: s } = library
    const data = { app: 'mono-music', version: 1, exportedAt: new Date().toISOString(), profile: p, liked, recent, playlists, plays, listening, searches, settings: { ...s, apiKey: '' } }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `mono-music-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const restore = async (file) => {
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (data.app !== 'mono-music') throw new Error()
      if (!window.confirm('Replace your current library with this backup?')) return
      library.replaceAll({ ...data, settings: { ...data.settings, apiKey: settings.apiKey } })
      toast('Library restored')
    } catch {
      toast('That isn’t a Mono Music backup file.')
    }
  }

  const reset = () => {
    if (!window.confirm('Erase your liked songs, playlists, history and settings on this device?')) return
    clearAll()
    window.location.hash = '/'
    window.location.reload()
  }

  return (
    <div className="max-w-2xl px-5 pt-6 pb-16 md:px-10 md:pt-12">
      <PageTitle eyebrow="Preferences">
        Sett<span className="font-serif font-normal italic">ings</span>
      </PageTitle>

      <Block title="Profile">
        <form onSubmit={saveProfile} className="flex gap-2">
          <Input value={name} onChange={setName} placeholder="Your name" />
          <PillButton type="submit">Save</PillButton>
        </form>
        <button
          type="button"
          onClick={() => navigate('/welcome/artists')}
          className="mt-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
        >
          Change favourite artists →
        </button>
      </Block>

      <Block title="Appearance">
        <Row title="Dark mode" hint="Inverted monochrome. Shortcut: D">
          <Toggle checked={settings.theme === 'dark'} onChange={(v) => updateSettings({ theme: v ? 'dark' : 'light' })} />
        </Row>
      </Block>

      <Block title="Playback">
        <Row
          title="Ad-free playback"
          hint="Plays songs through open-source Piped / Invidious servers instead of YouTube’s player — no ads. Up to three servers are tried per song before falling back to YouTube."
        >
          <Toggle checked={settings.adFree !== false} onChange={(v) => updateSettings({ adFree: v })} />
        </Row>
        <Row title="Mute YouTube ads" hint="If a song has to use YouTube and an ad starts, it’s muted and counted down, with a Skip button after 5 seconds.">
          <Toggle checked={settings.muteAds !== false} onChange={(v) => updateSettings({ muteAds: v })} />
        </Row>
        <Row title="Autoplay" hint="When your queue ends, keep going with similar music.">
          <Toggle checked={settings.autoplay !== false} onChange={(v) => updateSettings({ autoplay: v })} />
        </Row>
        <Row title="Song notifications" hint="Show a notification when the song changes while Mono is in the background.">
          <Toggle checked={!!settings.notifications} onChange={toggleNotifications} />
        </Row>
      </Block>

      <Block title="Lyrics">
        <Row title="Text size" hint="For the full-screen lyrics view.">
          <Stepper
            value={`${Math.round(settings.lyricsSize * 100)}%`}
            onMinus={() => updateSettings({ lyricsSize: Math.max(0.7, +(settings.lyricsSize - 0.1).toFixed(1)) })}
            onPlus={() => updateSettings({ lyricsSize: Math.min(1.4, +(settings.lyricsSize + 0.1).toFixed(1)) })}
          />
        </Row>
        <Row title="Timing" hint="Nudge lyrics earlier or later if they’re out of sync.">
          <Stepper
            value={`${settings.lyricsOffset > 0 ? '+' : ''}${settings.lyricsOffset.toFixed(1)}s`}
            onMinus={() => updateSettings({ lyricsOffset: +(settings.lyricsOffset - 0.5).toFixed(1) })}
            onPlus={() => updateSettings({ lyricsOffset: +(settings.lyricsOffset + 0.5).toFixed(1) })}
          />
        </Row>
      </Block>

      <Block title="Import">
        <p className="text-[13px] leading-relaxed text-neutral-500">
          Bring playlists from Spotify, YouTube, or any CSV / text list.
        </p>
        <PillButton variant="outline" icon={Download} className="mt-4" onClick={() => setImportOpen(true)}>
          Import playlists
        </PillButton>
        {settings.spotifyClientId && (
          <button
            type="button"
            onClick={() => updateSettings({ spotifyClientId: '' })}
            className="mt-3 block text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
          >
            Forget Spotify Client ID
          </button>
        )}
      </Block>

      <Block title="Search source">
        <p className="text-[13px] leading-relaxed text-neutral-500">
          {settings.apiKey
            ? 'Using your YouTube Data API key.'
            : 'Using free public search servers (no key). They can be slow or offline — add a free YouTube Data API key for reliable search. It’s stored only in this browser.'}{' '}
          Pasting a YouTube link always works.
        </p>
        <form onSubmit={saveKey} className="mt-4 flex gap-2">
          <Input value={key} onChange={setKey} placeholder="YouTube Data API key (optional)" type="password" />
          <PillButton type="submit" icon={Check}>
            Save
          </PillButton>
        </form>
        <a
          href="https://developers.google.com/youtube/v3/getting-started"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
        >
          How to get a key <ExternalLink size={11} />
        </a>
      </Block>

      <Block title="Keyboard shortcuts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
          {SHORTCUTS.slice(0, 8).map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded-md border border-black/15 bg-white px-2 py-0.5 font-sans text-[11px] font-semibold whitespace-pre">{k}</kbd>
              </dt>
              <dd className="text-neutral-500">{v}</dd>
            </div>
          ))}
        </dl>
        <PillButton variant="outline" icon={Keyboard} className="mt-4" onClick={() => setShortcutsOpen(true)}>
          All shortcuts
        </PillButton>
      </Block>

      <Block title="Your data">
        <p className="text-[13px] leading-relaxed text-neutral-500">
          Your library lives only in this browser. Back it up to move it to another device.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <PillButton variant="outline" icon={Download} onClick={backup}>
            Back up
          </PillButton>
          <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-full border border-[#111]/15 px-6 text-[11px] font-semibold uppercase tracking-widest transition hover:border-[#111]/40">
            <Upload size={16} strokeWidth={1.5} /> Restore
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => restore(e.target.files?.[0])} />
          </label>
          <PillButton variant="outline" onClick={reset}>
            Erase everything
          </PillButton>
        </div>
      </Block>

      <Block title="About">
        <p className="text-[13px] leading-relaxed text-neutral-500">
          Mono Music plays music via open-source Piped / Invidious servers, or YouTube’s embedded player. Lyrics from LRCLIB.
          Artists, charts and recommendations from Deezer. Not affiliated with any of them.
        </p>
      </Block>
    </div>
  )
}

function Block({ title, children }) {
  return (
    <section className="mt-10 border-t border-black/10 pt-6">
      <Eyebrow className="mb-4 text-[#111]">{title}</Eyebrow>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function Row({ title, hint, children }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <span>
        <span className="block text-[14px] font-semibold tracking-tight">{title}</span>
        {hint && <span className="mt-1 block text-[13px] leading-relaxed text-neutral-500">{hint}</span>}
      </span>
      {children}
    </div>
  )
}

function Stepper({ value, onMinus, onPlus }) {
  const btn = 'grid h-8 w-8 place-items-center rounded-full text-[16px] font-semibold hover:bg-black/5'
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-black/10 p-0.5">
      <button type="button" onClick={onMinus} className={btn} aria-label="Decrease">
        −
      </button>
      <span className="w-14 text-center text-[12px] font-bold tabular-nums">{value}</span>
      <button type="button" onClick={onPlus} className={btn} aria-label="Increase">
        +
      </button>
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-[#111]' : 'bg-black/15'}`}
    >
      <span
        className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
      />
    </button>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      className="h-12 min-w-0 flex-1 rounded-full border border-black/10 bg-white px-5 text-[14px] outline-none placeholder:text-neutral-400 focus:border-black/40"
    />
  )
}
