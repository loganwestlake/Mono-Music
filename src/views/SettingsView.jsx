import { useState } from 'react'
import { Check, ExternalLink } from 'lucide-react'
import { Eyebrow, PageTitle, PillButton } from '../components/ui'
import { navigate } from '../lib/router'
import { clearAll } from '../lib/storage'
import { useLibrary } from '../store/library'
import { useToast } from '../store/toast'

export default function SettingsView() {
  const { profile, settings, updateProfile, updateSettings } = useLibrary()
  const toast = useToast()
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

  const reset = () => {
    if (!window.confirm('Erase your liked songs, playlists, history and settings on this device?')) return
    clearAll()
    window.location.hash = '/'
    window.location.reload()
  }

  return (
    <div className="max-w-2xl px-5 pt-8 pb-16 md:px-10 md:pt-12">
      <PageTitle eyebrow="Preferences">Settings</PageTitle>

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

      <Block title="Playback">
        <label className="flex cursor-pointer items-start justify-between gap-6">
          <span>
            <span className="block text-[14px] font-semibold tracking-tight">Ad-free playback</span>
            <span className="mt-1 block text-[13px] leading-relaxed text-neutral-500">
              Plays songs directly through open-source Piped / Invidious servers instead of YouTube’s player, so no
              ads. If a song isn’t available that way, it falls back to YouTube automatically.
            </span>
          </span>
          <Toggle checked={settings.adFree !== false} onChange={(v) => updateSettings({ adFree: v })} />
        </label>
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
          {[
            ['Space', 'Play / pause'],
            ['Shift + →', 'Next track'],
            ['Shift + ←', 'Previous track'],
            ['→ / ←', 'Seek 5 seconds'],
            ['↑ / ↓', 'Volume'],
            ['L', 'Like current song'],
            ['/', 'Search'],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded-md border border-black/15 bg-white px-2 py-0.5 font-sans text-[11px] font-semibold">{k}</kbd>
              </dt>
              <dd className="text-neutral-500">{v}</dd>
            </div>
          ))}
        </dl>
      </Block>

      <Block title="Data">
        <p className="text-[13px] leading-relaxed text-neutral-500">
          Your library is stored only in this browser. Nothing is uploaded anywhere.
        </p>
        <PillButton variant="outline" onClick={reset} className="mt-4">
          Erase everything
        </PillButton>
      </Block>

      <Block title="About">
        <p className="text-[13px] leading-relaxed text-neutral-500">
          Mono Music plays music via open-source Piped / Invidious servers, or YouTube’s embedded player. Lyrics from LRCLIB. Artist photos from
          Deezer. Not affiliated with any of them.
        </p>
      </Block>
    </div>
  )
}

function Block({ title, children }) {
  return (
    <section className="mt-10 border-t border-black/10 pt-6">
      <Eyebrow className="mb-4 text-[#111]">{title}</Eyebrow>
      {children}
    </section>
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
        className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
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
