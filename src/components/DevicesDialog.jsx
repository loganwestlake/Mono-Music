import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDownToLine,
  ChevronLeft,
  Laptop,
  LogIn,
  Pause,
  Pencil,
  Play,
  Radio,
  Send,
  SkipBack,
  SkipForward,
  Smartphone,
  Tablet,
  Volume2,
  X,
} from 'lucide-react'
import { formatTime } from '../lib/tracks'
import { usePlayer } from '../player/PlayerProvider'
import { useCloud } from '../store/cloud'
import { useUi } from '../store/ui'
import Artwork from './Artwork'
import { IconButton, PillButton, Spinner } from './ui'

const KIND_ICON = { phone: Smartphone, tablet: Tablet, computer: Laptop }

/**
 * Devices: every browser/phone signed in to your account. See what each is
 * playing, control it remotely, or move playback between devices.
 */
export default function DevicesDialog({ open, onClose }) {
  const cloud = useCloud()
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!open) setSelected(null)
  }, [open])

  const target = selected && cloud.devices.find((d) => d.id === selected)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[75] flex items-end justify-center bg-black/30 backdrop-blur-[2px] sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Devices"
            className="flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-[28px] bg-[#F2F2F2] pb-[max(env(safe-area-inset-bottom),20px)] sm:rounded-[28px]"
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 40 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between px-6 pt-6">
              <div className="flex items-start gap-1">
                {target && <IconButton icon={ChevronLeft} label="Back" onClick={() => setSelected(null)} className="-mt-2 -ml-3" />}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    {target ? 'Remote control' : 'Listen anywhere'}
                  </p>
                  <h2 className="mt-1 text-[30px] leading-none font-black tracking-tight">
                    {target ? (
                      <span className="line-clamp-1">{target.name}</span>
                    ) : (
                      <>
                        Your <span className="font-serif font-normal italic">devices</span>
                      </>
                    )}
                  </h2>
                </div>
              </div>
              <IconButton icon={X} label="Close" onClick={onClose} className="-mt-2 -mr-3" />
            </div>

            <div className="no-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto px-6">
              {cloud.user === undefined ? (
                <div className="flex justify-center py-10 text-neutral-400">
                  <Spinner />
                </div>
              ) : !cloud.user ? (
                <SignedOut />
              ) : target ? (
                <Remote device={target} />
              ) : (
                <DeviceList onSelect={setSelected} />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SignedOut() {
  const { signIn } = useCloud()
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <p className="max-w-xs text-[13px] leading-relaxed text-neutral-500">
        Sign in on each phone and computer you use. Your playlists, likes and history follow you everywhere — and you can
        control the music on one device from another.
      </p>
      <PillButton icon={LogIn} className="mt-6 h-14 px-8" onClick={signIn}>
        Sign in with Google
      </PillButton>
    </div>
  )
}

function DeviceList({ onSelect }) {
  const cloud = useCloud()
  const [editing, setEditing] = useState(false)
  const player = usePlayer()
  const others = cloud.devices.filter((d) => !d.me)
  const me = cloud.devices.find((d) => d.me)
  const onlineOthers = others.filter((d) => d.online)
  const anyPlaying = player.playing || onlineOthers.some((d) => d.state?.playing)

  return (
    <div className="pb-2">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">This device</p>
      <div className="flex items-center gap-3 rounded-2xl bg-[#111] p-3 text-white">
        <DeviceIcon kind={me?.kind} light />
        {editing ? (
          <form
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault()
              cloud.renameDevice(new FormData(e.currentTarget).get('name').toString())
              setEditing(false)
            }}
          >
            <input
              name="name"
              defaultValue={cloud.myName}
              autoFocus
              onBlur={(e) => e.currentTarget.form?.requestSubmit()}
              className="w-full rounded-lg bg-white/10 px-2 py-1 text-[14px] font-semibold outline-none"
            />
          </form>
        ) : (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold tracking-tight">{cloud.myName}</span>
            <span className="block truncate text-[11px] text-white/50">{cloud.user.email}</span>
          </span>
        )}
        {!editing && <IconButton icon={Pencil} label="Rename this device" tone="light" size={14} className="h-8 w-8" onClick={() => setEditing(true)} />}
      </div>
      {player.remote && (
        <PillButton icon={ArrowDownToLine} className="mt-2 h-11 w-full" onClick={() => cloud.takeOver(player.remote)}>
          Play on this device
        </PillButton>
      )}

      {onlineOthers.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <PillButton icon={Radio} className="h-12" onClick={cloud.playEverywhere} disabled={!player.current && !onlineOthers.some((d) => d.state?.track)}>
            Play everywhere
          </PillButton>
          <PillButton variant="outline" icon={Pause} className="h-12" onClick={cloud.pauseEverywhere} disabled={!anyPlaying}>
            Pause all
          </PillButton>
        </div>
      )}

      <p className="mt-6 mb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Other devices</p>
      {others.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/15 px-4 py-6 text-center text-[13px] leading-relaxed text-neutral-500">
          Open Mono Music on your phone or another computer and sign in with the same Google account — it’ll show up
          here.
        </p>
      ) : (
        <ul className="space-y-1">
          {others.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d.id)}
                className="flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition hover:bg-black/[0.05]"
              >
                <DeviceIcon kind={d.kind} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold tracking-tight">{d.name}</span>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.online ? 'bg-[#111]' : 'bg-black/20'}`} />
                  </span>
                  <span className="block truncate text-[12px] text-neutral-400">
                    {!d.online
                      ? `Offline · ${ago(d.lastSeen)}`
                      : d.state?.track
                        ? `${d.state.playing ? 'Playing' : 'Paused'} · ${d.state.track.title} — ${d.state.track.artist}`
                        : 'Online · idle'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Live remote for another device. */
function Remote({ device }) {
  const cloud = useCloud()
  const player = usePlayer()
  const s = device.state || {}
  const track = s.track
  const [, tick] = useState(0)

  // Estimate the remote position between updates.
  useEffect(() => {
    if (!s.playing) return
    const id = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [s.playing])

  const position = Math.min(track?.duration || Infinity, (s.position || 0) + (s.playing ? (Date.now() - (s.at || Date.now())) / 1000 : 0))
  const duration = track?.duration || 0
  const send = (type, payload) => cloud.sendCommand(device.id, type, payload)

  return (
    <div className="pb-2">
      {!device.online && (
        <p className="mb-4 rounded-xl bg-black/[0.05] px-3 py-2 text-[12px] text-neutral-500">
          This device looks offline (last seen {ago(device.lastSeen)}). Commands run when it’s back.
        </p>
      )}

      {track ? (
        <>
          <div className="flex items-center gap-4">
            <Artwork track={track} shape="blob-b" className="h-24 w-24 shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">{s.playing ? 'Playing' : 'Paused'}</p>
              <p className="line-clamp-2 text-[20px] leading-tight font-black tracking-tight">{track.title}</p>
              <p className="truncate font-serif text-[16px] text-neutral-500 italic">{track.artist}</p>
            </div>
          </div>

          <div className="mt-5">
            <input
              type="range"
              aria-label="Seek on device"
              min={0}
              max={duration || 1}
              step={1}
              defaultValue={position}
              key={`${track.id}-${Math.round(position / 3)}`}
              onPointerUp={(e) => send('seek', { time: Number(e.currentTarget.value) })}
              className="mono-range w-full"
              style={{ '--pct': `${duration ? (position / duration) * 100 : 0}%` }}
            />
            <div className="mt-1 flex justify-between text-[10px] font-bold tracking-widest text-neutral-400 tabular-nums">
              <span>{formatTime(position)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-center gap-6">
            <IconButton icon={SkipBack} label="Previous" onClick={() => send('prev')} size={22} />
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => send('toggle')}
              aria-label={s.playing ? 'Pause' : 'Play'}
              className="grid h-16 w-16 place-items-center rounded-full bg-[#111] text-white"
            >
              {s.playing ? <Pause size={22} fill="currentColor" strokeWidth={1} /> : <Play size={22} fill="currentColor" strokeWidth={1} className="translate-x-[1px]" />}
            </motion.button>
            <IconButton icon={SkipForward} label="Next" onClick={() => send('next')} size={22} />
          </div>

          <label className="mt-4 flex items-center gap-2">
            <Volume2 size={16} strokeWidth={1.25} />
            <input
              type="range"
              aria-label="Volume on device"
              min={0}
              max={100}
              defaultValue={s.volume ?? 80}
              onPointerUp={(e) => send('volume', { value: Number(e.currentTarget.value) })}
              className="mono-range flex-1"
              style={{ '--pct': `${s.volume ?? 80}%` }}
            />
          </label>
          <p className="mt-1 text-[11px] text-neutral-400">iPhones and iPads ignore volume from websites — use their buttons.</p>
        </>
      ) : (
        <p className="py-6 text-center text-[13px] text-neutral-500">Nothing is playing on this device.</p>
      )}

      <div className="mt-6 grid gap-2">
        {track && (
          <PillButton icon={ArrowDownToLine} className="h-12 w-full" onClick={() => cloud.takeOver(device)}>
            Play it here instead
          </PillButton>
        )}
        {player.current && !player.remote && (
          <PillButton variant="outline" icon={Send} className="h-12 w-full" onClick={() => cloud.sendHere(device)}>
            Send my music to this device
          </PillButton>
        )}
        {!device.online && (
          <button
            type="button"
            onClick={() => cloud.forgetDevice(device.id)}
            className="mt-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[#111]"
          >
            Remove this device
          </button>
        )}
      </div>
    </div>
  )
}

function DeviceIcon({ kind, light }) {
  const Icon = KIND_ICON[kind] || Laptop
  return (
    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${light ? 'bg-white/10' : 'bg-black/[0.06]'}`}>
      <Icon size={18} strokeWidth={1.5} />
    </span>
  )
}

function ago(ms) {
  if (!ms) return 'a while ago'
  const s = Math.round((Date.now() - ms) / 1000)
  if (s < 90) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}

/** Small "Playing on {device}" chip shown when music is playing elsewhere. */
export function ElsewhereChip({ className = '' }) {
  const cloud = useCloud()
  const player = usePlayer()
  const { setDevicesOpen } = useUi()
  const elsewhere = cloud?.devices.find((d) => !d.me && d.online && d.state?.playing)
  if (!elsewhere || player.playing) return null
  return (
    <button
      type="button"
      onClick={() => setDevicesOpen(true)}
      className={`flex items-center gap-2 rounded-full bg-[#111] px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white ${className}`}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      Playing on {elsewhere.name}
    </button>
  )
}
