import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, onAuth, signInWithGoogle, signOut } from '../lib/firebase'
import { PlayerContext, TimeContext, usePlayer } from '../player/PlayerProvider'
import { useLibrary } from './library'
import { useToast } from './toast'

/**
 * Cloud sync + devices (Firebase).
 *
 * Data lives under users/{uid}/ — the security rules only let that user in.
 *   state/library        profile, liked, history, plays, stats, settings
 *   playlists/{id}       one document per playlist
 *   devices/{deviceId}   presence + what's playing + an inbox for commands
 *
 * Sync is last-write-wins per document with a short debounce. The first time
 * a device signs in, its local library is merged into the account instead
 * of being overwritten.
 */

const Ctx = createContext(null)
export const CloudContext = Ctx

const LOCAL_ONLY_SETTINGS = ['apiKey', 'spotifyClientId']
const ONLINE_MS = 70_000
const HEARTBEAT_MS = 15_000
const COMMAND_TTL_MS = 60_000
const ACK_MS = 5000 // a device that hasn't picked up a command by now isn't responding

/* ── shared clock ─────────────────────────────────────────────────────
 * Device clocks are often minutes apart (TVs especially). Every time that
 * crosses devices — "last seen", playback position, command age — uses the
 * Firestore server's clock, estimated from our own presence writes. */
let clockOffset = 0 // server time − local time, ms
let clockKnown = false
export const serverNow = () => Date.now() + clockOffset
const millis = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null)

/* ── helpers ────────────────────────────────────────────────────────── */

// Stable JSON (sorted keys) so the same data always compares equal,
// whatever order Firestore returns fields in.
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(',')}}`
  return JSON.stringify(value ?? null)
}

const strip = (t) =>
  t && { id: t.id, title: t.title, artist: t.artist, duration: t.duration || 0, ...(t.cover ? { cover: t.cover } : {}), ...(t.qid ? { qid: t.qid } : {}) }

function libraryPayload(lib) {
  const settings = { ...lib.settings }
  LOCAL_ONLY_SETTINGS.forEach((k) => delete settings[k])
  const plays = Object.fromEntries(
    Object.entries(lib.plays)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 300),
  )
  return {
    profile: lib.profile,
    liked: lib.liked.map(strip),
    recent: lib.recent.slice(0, 50).map(strip),
    searches: lib.searches,
    listening: lib.listening,
    plays,
    settings,
  }
}

const playlistPayload = (p) => ({
  id: p.id,
  name: p.name,
  tracks: p.tracks.map(strip),
  createdAt: p.createdAt || 0,
  ...(p.source ? { source: p.source } : {}),
})

function unionBy(a = [], b = [], key = (x) => x.id) {
  const seen = new Set()
  return [...a, ...b].filter((x) => x && !seen.has(key(x)) && seen.add(key(x)))
}

function deviceId() {
  try {
    let id = localStorage.getItem('mono:device-id')
    if (!id) {
      id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)
      localStorage.setItem('mono:device-id', id)
    }
    return id
  } catch {
    return 'device-' + Math.random().toString(36).slice(2)
  }
}

export function describeDevice() {
  const ua = navigator.userAgent
  const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const kind = /iPhone|Android.+Mobile/.test(ua) ? 'phone' : /iPad|Tablet|Android/.test(ua) || touchMac ? 'tablet' : 'computer'
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua) || touchMac
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /CrOS/.test(ua)
          ? 'Chromebook'
          : /Mac/.test(ua)
            ? 'Mac'
            : /Windows/.test(ua)
              ? 'Windows PC'
              : 'Computer'
  const browser = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser'
  return { kind, name: `${os} · ${browser}` }
}

/* ── provider ───────────────────────────────────────────────────────── */

export function CloudProvider({ children }) {
  const library = useLibrary()
  const player = usePlayer()
  const toast = useToast()

  const [user, setUser] = useState(undefined) // undefined = loading, null = signed out
  const [syncState, setSyncState] = useState('idle') // idle | syncing | synced | error
  const [devices, setDevices] = useState([])
  const devicesRef = useRef([])
  devicesRef.current = devices
  const [myName, setMyName] = useState(() => localStorage.getItem('mono:device-name') || describeDevice().name)
  const [, setNow] = useState(0)

  const myId = useMemo(deviceId, [])
  const libRef = useRef(library)
  libRef.current = library
  const playerRef = useRef(player)
  playerRef.current = player

  const sent = useRef({ library: null, playlists: new Map() }) // last JSON synced either way
  const ready = useRef(false) // first remote snapshots applied

  useEffect(() => onAuth((u) => setUser(u ?? null)), [])

  /* ── library: remote → local ────────────────────────────────────── */
  useEffect(() => {
    if (!user) return
    ready.current = false
    sent.current = { library: null, playlists: new Map() }
    setSyncState('syncing')
    const uid = user.uid
    const firstSyncKey = `mono:v1:synced:${uid}`
    const firstTime = localStorage.getItem(firstSyncKey) !== '1'
    let gotLibrary = false
    let gotPlaylists = false
    const markReady = () => {
      if (gotLibrary && gotPlaylists && !ready.current) {
        ready.current = true
        localStorage.setItem(firstSyncKey, '1')
        setSyncState('synced')
      }
    }

    const unsubLib = onSnapshot(
      doc(db, 'users', uid, 'state', 'library'),
      (snap) => {
        const lib = libRef.current
        if (!snap.exists()) {
          gotLibrary = true
          markReady() // local data uploads via the push effect
          return
        }
        const { updatedAt, device, ...remote } = snap.data()
        const json = stable(remote)
        if (json === sent.current.library) {
          gotLibrary = true
          return markReady()
        }
        sent.current.library = json
        if (firstTime && !gotLibrary) {
          // First sign-in on this device: merge, don't overwrite.
          const local = libraryPayload(lib)
          const plays = { ...remote.plays }
          Object.entries(local.plays).forEach(([id, p]) => {
            if (!plays[id] || plays[id].count < p.count) plays[id] = p
          })
          lib.applyRemote({
            profile: { ...local.profile, ...remote.profile, artists: unionBy(remote.profile?.artists, local.profile.artists, (a) => a.name) },
            liked: unionBy(remote.liked, local.liked),
            recent: unionBy(local.recent, remote.recent).slice(0, 100),
            searches: unionBy(local.searches, remote.searches, (s) => s.toLowerCase()).slice(0, 12),
            listening: {
              seconds: Math.max(local.listening.seconds, remote.listening?.seconds || 0),
              days: [...new Set([...(remote.listening?.days || []), ...local.listening.days])].sort(),
            },
            plays,
            settings: { ...local.settings, ...remote.settings },
          })
          sent.current.library = null // force upload of the merge
        } else if (device !== myId || !snap.metadata.hasPendingWrites) {
          lib.applyRemote(remote)
        }
        gotLibrary = true
        markReady()
      },
      () => setSyncState('error'),
    )

    const unsubPl = onSnapshot(
      collection(db, 'users', uid, 'playlists'),
      (snap) => {
        const lib = libRef.current
        const remote = snap.docs.map((d) => {
          const { updatedAt, device, ...p } = d.data()
          return p
        })
        const remoteJson = new Map(remote.map((p) => [p.id, stable(p)]))
        if (firstTime && !gotPlaylists) {
          const merged = unionBy(remote, lib.playlists.map(playlistPayload))
          sent.current.playlists = remoteJson
          lib.applyRemote({ playlists: merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) })
        } else {
          const changed =
            remote.length !== lib.playlists.length ||
            remote.some((p) => stable(p) !== stable(playlistPayload(lib.playlists.find((x) => x.id === p.id) || { tracks: [] })))
          sent.current.playlists = remoteJson
          if (changed && !snap.metadata.hasPendingWrites)
            lib.applyRemote({ playlists: remote.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) })
        }
        gotPlaylists = true
        markReady()
      },
      () => setSyncState('error'),
    )

    return () => {
      unsubLib()
      unsubPl()
    }
  }, [user, myId])

  /* ── library: local → remote (debounced) ─────────────────────────── */
  const libraryJson = stable(libraryPayload(library))
  const playlistsKey = stable(library.playlists.map(playlistPayload))
  useEffect(() => {
    if (!user || !ready.current) return
    const t = setTimeout(async () => {
      const uid = user.uid
      const lib = libRef.current
      try {
        const payload = libraryPayload(lib)
        const json = stable(payload)
        if (json !== sent.current.library) {
          sent.current.library = json
          await setDoc(doc(db, 'users', uid, 'state', 'library'), { ...payload, updatedAt: Date.now(), device: myId })
        }
        const local = new Map(lib.playlists.map((p) => [p.id, playlistPayload(p)]))
        for (const [id, p] of local) {
          const pj = stable(p)
          if (sent.current.playlists.get(id) !== pj) {
            sent.current.playlists.set(id, pj)
            await setDoc(doc(db, 'users', uid, 'playlists', id), { ...p, updatedAt: Date.now(), device: myId })
          }
        }
        for (const id of [...sent.current.playlists.keys()]) {
          if (!local.has(id)) {
            sent.current.playlists.delete(id)
            await deleteDoc(doc(db, 'users', uid, 'playlists', id))
          }
        }
        setSyncState('synced')
      } catch {
        setSyncState('error')
      }
    }, 1500)
    return () => clearTimeout(t)
  }, [user, libraryJson, playlistsKey, myId, syncState])

  /* ── devices: presence + what's playing ─────────────────────────── */
  const stateJson = stable({
    track: strip(player.current) || null,
    playing: player.playing,
    volume: player.volume,
    shuffle: player.shuffle,
    repeat: player.repeat,
    seeks: player.seeks, // republish right after a seek
    queue: player.queue.slice(player.index, player.index + 50).map(strip),
  })

  const publish = useCallback(
    (extra = {}) => {
      if (!user) return
      const p = playerRef.current
      const { kind } = describeDevice()
      setDoc(
        doc(db, 'users', user.uid, 'devices', myId),
        {
          id: myId,
          name: myName,
          kind,
          lastSeen: serverNow(),
          localAt: Date.now(),
          serverAt: serverTimestamp(),
          state: {
            track: strip(p.current) || null,
            playing: p.playing,
            position: p.getTime(),
            at: serverNow(),
            volume: p.volume,
            shuffle: p.shuffle,
            repeat: p.repeat,
            queue: p.queue.slice(p.index, p.index + 50).map(strip),
          },
          ...extra,
        },
        { merge: true },
      ).catch(() => {})
    },
    [user, myId, myName],
  )

  // On change of song / play state, plus a heartbeat.
  useEffect(() => {
    if (!user) return
    const t = setTimeout(publish, 250)
    return () => clearTimeout(t)
  }, [user, stateJson, publish])

  useEffect(() => {
    if (!user) return
    const id = setInterval(publish, HEARTBEAT_MS)
    const bye = () => {
      setDoc(doc(db, 'users', user.uid, 'devices', myId), { lastSeen: 0 }, { merge: true }).catch(() => {})
    }
    const onVisible = () => document.visibilityState === 'visible' && publish()
    window.addEventListener('pagehide', bye)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      window.removeEventListener('pagehide', bye)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user, myId, publish])

  // Everyone's devices, and this device's command inbox.
  useEffect(() => {
    if (!user) return setDevices([])
    return onSnapshot(collection(db, 'users', user.uid, 'devices'), (snap) => {
      const mine = snap.docs.find((d) => d.id === myId)
      const serverAt = mine && !mine.metadata.hasPendingWrites ? millis(mine.data().serverAt) : null
      if (serverAt && mine.data().localAt) {
        // The write took a moment to reach the server; that's well under a second.
        clockOffset = serverAt - mine.data().localAt
        clockKnown = true
      }
      setDevices(snap.docs.map((d) => d.data()))
    })
  }, [user, myId])

  // Command inbox: one document per command, run in order, then deleted —
  // so quick taps (pause, then skip) are never lost or overwritten.
  useEffect(() => {
    if (!user) return
    const handled = new Set()
    return onSnapshot(collection(db, 'users', user.uid, 'devices', myId, 'commands'), (snap) => {
      const fresh = snap.docs
        .map((d) => d.data({ serverTimestamps: 'estimate' }))
        .filter((c) => c?.id && !handled.has(c.id))
        .sort((a, b) => (millis(a.ts) ?? a.at) - (millis(b.ts) ?? b.at))
      for (const cmd of fresh) {
        handled.add(cmd.id)
        // Skip leftovers from long ago (e.g. this device was asleep). Age is
        // measured on the server's clock, so a wrong device clock can't drop
        // fresh commands; until we know the offset, trust the command.
        const sent = millis(cmd.ts)
        const stale = clockKnown && sent != null && serverNow() - sent > COMMAND_TTL_MS
        if (!stale) run(cmd)
        deleteDoc(doc(db, 'users', user.uid, 'devices', myId, 'commands', cmd.id)).catch(() => {})
      }
    })
  }, [user, myId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render every 10s so "online" / progress estimates stay fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [])

  function run(cmd) {
    const p = playerRef.current
    const from = cmd.fromName ? ` from ${cmd.fromName}` : ''
    switch (cmd.type) {
      case 'toggle':
        p.toggle()
        break
      case 'play':
        if (!p.playing) p.toggle()
        break
      case 'pause':
        if (p.playing) p.toggle()
        break
      case 'next':
        p.next()
        break
      case 'prev':
        p.prev()
        break
      case 'seek':
        p.seek(cmd.payload?.time ?? 0)
        break
      case 'volume':
        p.setVolume(cmd.payload?.value ?? 80)
        break
      case 'playFrom':
        if (cmd.payload?.tracks?.length) {
          // Account for the time the command spent in flight (Play everywhere).
          const late = cmd.payload.sentAt ? Math.min(10, Math.max(0, (serverNow() - cmd.payload.sentAt) / 1000)) : 0
          p.playFrom(cmd.payload.tracks, cmd.payload.index || 0, (cmd.payload.time || 0) + late)
          if (!cmd.payload.quiet) toast(`Playing here${from}`)
        }
        break
      case 'enqueue':
        if (cmd.payload?.track) p.enqueue(cmd.payload.track)
        break
      case 'playNext':
        if (cmd.payload?.track) p.playNext(cmd.payload.track)
        break
      case 'shuffle':
        p.toggleShuffle()
        break
      case 'repeat':
        p.cycleRepeat()
        break
      case 'radio':
        if (cmd.payload?.track) p.startRadio(cmd.payload.track)
        break
      default:
    }
    // Tell the other devices about the new state right away.
    setTimeout(() => publishRef.current?.(), 700)
  }
  const publishRef = useRef(null)
  publishRef.current = publish

  /* ── public API ─────────────────────────────────────────────────── */
  /**
   * Send a command to another device. Resolves true once that device has
   * picked it up (it deletes the command), false if it doesn't within ACK_MS.
   */
  const sendCommand = useCallback(
    (targetId, type, payload) => {
      if (!user) return Promise.resolve(false)
      const cmd = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        at: serverNow(),
        ts: serverTimestamp(),
        from: myId,
        fromName: myName,
      }
      if (payload !== undefined) cmd.payload = payload
      const ref = doc(db, 'users', user.uid, 'devices', targetId, 'commands', cmd.id)
      return new Promise((resolve) => {
        let seen = false
        let done = false
        let unsub = () => {}
        const finish = (ok) => {
          if (done) return
          done = true
          clearTimeout(timer)
          unsub()
          resolve(ok)
        }
        const timer = setTimeout(() => finish(false), ACK_MS)
        unsub = onSnapshot(
          ref,
          (snap) => {
            if (snap.exists()) seen = true
            else if (seen) finish(true)
          },
          () => finish(false),
        )
        setDoc(ref, cmd).catch(() => finish(false))
      })
    },
    [user, myId, myName],
  )

  /** Move what's playing here onto another device. */
  const sendHere = useCallback(
    (target) => {
      const p = playerRef.current
      if (!p.current) return
      toast(`Sending to ${target.name}…`)
      sendCommand(target.id, 'playFrom', {
        tracks: p.queue.slice(p.index, p.index + 50).map(strip),
        index: 0,
        time: p.getTime(),
      }).then((ok) => {
        if (!ok) return toast(`${target.name} isn’t responding. Kept playing here.`)
        // Hand over only once the other device has it.
        if (playerRef.current.playing) playerRef.current.toggle()
        toast(`Playing on ${target.name}`)
      })
    },
    [sendCommand, toast],
  )

  /** Take over what another device is playing. */
  const takeOver = useCallback(
    (source) => {
      const s = source.state
      if (!s?.track) return
      const elapsed = s.playing ? Math.max(0, (serverNow() - s.at) / 1000) : 0
      const tracks = s.queue?.length ? s.queue : [s.track]
      playerRef.current.playFrom(tracks, 0, (s.position || 0) + elapsed)
      if (s.playing) sendCommand(source.id, 'pause')
      toast(`Moved here from ${source.name}`)
    },
    [sendCommand, toast],
  )

  /**
   * Play everywhere: the same music, at the same moment, on every online
   * device (this one included). Source: what's playing here, else the
   * device that's playing elsewhere.
   */
  const playEverywhere = useCallback(() => {
    const p = playerRef.current
    const online = devicesRef.current.filter((d) => d.id !== myId && Math.abs(serverNow() - (d.lastSeen || 0)) < ONLINE_MS)
    let tracks
    let time
    if (p.current) {
      tracks = p.queue.slice(p.index, p.index + 50).map(strip)
      time = p.getTime()
    } else {
      const src = online.find((d) => d.state?.playing && d.state.track) || online.find((d) => d.state?.track)
      if (!src) return toast('Play something first, then press Play everywhere.')
      tracks = src.state.queue?.length ? src.state.queue : [src.state.track]
      time = (src.state.position || 0) + (src.state.playing ? Math.max(0, (serverNow() - src.state.at) / 1000) : 0)
    }
    const sentAt = serverNow()
    online.forEach((d) => sendCommand(d.id, 'playFrom', { tracks, index: 0, time, sentAt }))
    if (p.current && p.playing) {
      // Already playing here — leave it running.
    } else p.playFrom(tracks, 0, time)
    toast(`Playing on ${online.length + 1} device${online.length ? 's' : ''}`)
  }, [myId, sendCommand, toast])

  const pauseEverywhere = useCallback(() => {
    const p = playerRef.current
    devicesRef.current
      .filter((d) => d.id !== myId && d.state?.playing)
      .forEach((d) => sendCommand(d.id, 'pause'))
    if (p.playing) p.toggle()
    toast('Paused everywhere')
  }, [myId, sendCommand, toast])

  const renameDevice = useCallback(
    (name) => {
      const clean = name.trim().slice(0, 40) || describeDevice().name
      localStorage.setItem('mono:device-name', clean)
      setMyName(clean)
    },
    [],
  )

  const now = serverNow()
  const list = devices
    .map((d) => ({ ...d, online: d.id === myId || (d.lastSeen > 0 && Math.abs(now - d.lastSeen) < ONLINE_MS), me: d.id === myId }))
    .sort((a, b) => b.me - a.me || b.online - a.online || (b.lastSeen || 0) - (a.lastSeen || 0))

  const value = {
    user,
    syncState,
    signIn: () =>
      signInWithGoogle().catch((e) => {
        if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request')
          toast(e?.code === 'auth/unauthorized-domain' ? 'This website isn’t authorised in Firebase yet (see README).' : 'Sign-in failed. Try again.')
      }),
    signOut: async () => {
      if (user) await setDoc(doc(db, 'users', user.uid, 'devices', myId), { lastSeen: 0 }, { merge: true }).catch(() => {})
      await signOut()
      toast('Signed out — your library stays on this device')
    },
    myId,
    myName,
    renameDevice,
    devices: list,
    sendCommand,
    sendHere,
    takeOver,
    playEverywhere,
    pauseEverywhere,
    forgetDevice: (id) => user && deleteDoc(doc(db, 'users', user.uid, 'devices', id)).catch(() => {}),
  }

  return (
    <Ctx.Provider value={value}>
      <RemoteBridge cloud={value}>{children}</RemoteBridge>
    </Ctx.Provider>
  )
}

export const useCloud = () => useContext(Ctx)

/* ── Seamless remote ────────────────────────────────────────────────────
 * Spotify Connect–style: when another of your devices is playing (and this
 * one isn't), every screen here — mini player, full player, lyrics, queue —
 * shows that device's music as if it were playing locally, and every
 * control (including tapping a song) is sent to that device.
 * Implemented by re-providing the player contexts for the UI below.
 */
export function RemoteBridge({ cloud, children }) {
  const local = usePlayer()
  const toast = useToast()
  const [connectedId, setConnectedId] = useState(null)
  const [optimistic, setOptimistic] = useState(null) // { stateAt, playing, position, at }
  const [silent, setSilent] = useState({}) // deviceId → lastSeen when it stopped answering
  const [, tick] = useState(0)

  // A device that didn't answer is ignored until it checks in again.
  const others = cloud.devices.filter((d) => !d.me && d.online && d.state?.track && silent[d.id] !== d.lastSeen)
  const playingElsewhere = others.find((d) => d.state.playing)

  // Pick which device the UI follows.
  useEffect(() => {
    if (local.playing || local.loading) {
      if (connectedId) setConnectedId(null)
      return
    }
    if (playingElsewhere && playingElsewhere.id !== connectedId) setConnectedId(playingElsewhere.id)
    else if (!connectedId && !local.current && others[0]) setConnectedId(others[0].id)
    else if (connectedId && !others.some((d) => d.id === connectedId)) setConnectedId(null)
  }, [local.playing, local.loading, local.current, playingElsewhere?.id, connectedId, others.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const remote = connectedId ? others.find((d) => d.id === connectedId) : null
  const s = remote?.state

  // Clear optimistic UI once the device reports its new state.
  useEffect(() => setOptimistic(null), [s?.at])

  const eff = optimistic && optimistic.stateAt === s?.at ? optimistic : s
  const duration = s?.track?.duration || 0
  const timeNow = () => {
    if (!eff) return 0
    const t = (eff.position || 0) + (eff.playing ? Math.max(0, (serverNow() - (eff.at || serverNow())) / 1000) : 0)
    return Math.max(0, duration ? Math.min(duration, t) : t)
  }

  useEffect(() => {
    if (!remote || !eff?.playing) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [remote?.id, eff?.playing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!remote) return children

  // If the device doesn't pick the command up, say so (never fail silently)
  // and stop following it; `here` offers to do the same thing on this device.
  const send = (type, payload, here) =>
    cloud.sendCommand(remote.id, type, payload).then((ok) => {
      if (ok) return
      setOptimistic(null)
      setSilent((m) => ({ ...m, [remote.id]: remote.lastSeen }))
      toast(`${remote.name} isn’t responding.`, here ? { action: { label: 'Play here', run: here } } : undefined)
    })
  const queue = s.queue?.length ? s.queue : [s.track]
  const sendList = (tracks, i = 0, time = 0) =>
    send('playFrom', { tracks: tracks.slice(i, i + 50).map(strip), index: 0, time, quiet: true }, () =>
      local.playFrom(tracks, i, time),
    )
  const resumeHere = () => local.playFrom(queue, 0, timeNow())
  const optimisticSet = (patch) => setOptimistic({ stateAt: s.at, playing: eff.playing, position: timeNow(), at: serverNow(), ...patch })

  const value = {
    ...local,
    remote,
    current: s.track,
    queue,
    index: 0,
    playing: !!eff.playing,
    buffering: false,
    loading: !!eff.skipping,
    ad: null,
    error: null,
    needsTap: false,
    status: 'ready',
    duration,
    volume: s.volume ?? local.volume,
    muted: false,
    shuffle: !!s.shuffle,
    repeat: s.repeat || 'off',
    resolving: false,
    getTime: timeNow,
    toggle: () => {
      send('toggle', undefined, eff.playing ? undefined : resumeHere)
      optimisticSet({ playing: !eff.playing })
    },
    next: () => {
      send('next')
      optimisticSet({ skipping: true })
    },
    prev: () => {
      send('prev')
      optimisticSet({ skipping: true })
    },
    seek: (time) => {
      send('seek', { time })
      optimisticSet({ position: time })
    },
    setVolume: (v) => send('volume', { value: v }),
    toggleMute: () => send('volume', { value: (s.volume ?? 80) > 0 ? 0 : 60 }),
    toggleShuffle: () => send('shuffle'),
    cycleRepeat: () => send('repeat'),
    playTracks: (tracks, i = 0) => sendList(tracks, i),
    playTrack: (t) => sendList([t]),
    playFrom: (tracks, i, time) => sendList(tracks, i, time),
    jump: (i) => sendList(queue, i),
    enqueue: (t) => send('enqueue', { track: strip(t) }),
    playNext: (t) => send('playNext', { track: strip(t) }),
    startRadio: (t) => send('radio', { track: strip(t) }),
    removeAt: () => {},
    setUpcoming: () => {},
    clearUpcoming: () => {},
  }
  const timeValue = { time: timeNow(), duration, ad: null }

  return (
    <PlayerContext.Provider value={value}>
      <TimeContext.Provider value={timeValue}>{children}</TimeContext.Provider>
    </PlayerContext.Provider>
  )
}
