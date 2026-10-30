import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { collection, deleteDoc, deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore'
import { db, onAuth, signInWithGoogle, signOut } from '../lib/firebase'
import { usePlayer } from '../player/PlayerProvider'
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

const strip = (t) => t && { id: t.id, title: t.title, artist: t.artist, duration: t.duration || 0, ...(t.cover ? { cover: t.cover } : {}) }

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
  const [myName, setMyName] = useState(() => localStorage.getItem('mono:device-name') || describeDevice().name)
  const [, setNow] = useState(0)

  const myId = useMemo(deviceId, [])
  const libRef = useRef(library)
  libRef.current = library
  const playerRef = useRef(player)
  playerRef.current = player

  const sent = useRef({ library: null, playlists: new Map() }) // last JSON synced either way
  const ready = useRef(false) // first remote snapshots applied
  const lastCommand = useRef(null)

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
          lastSeen: Date.now(),
          state: {
            track: strip(p.current) || null,
            playing: p.playing,
            position: p.getTime(),
            at: Date.now(),
            volume: p.volume,
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
    const t = setTimeout(publish, 600)
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
      const list = snap.docs.map((d) => d.data())
      setDevices(list)
      const mine = list.find((d) => d.id === myId)
      const cmd = mine?.command
      if (cmd && cmd.id !== lastCommand.current && Date.now() - cmd.at < 60_000) {
        lastCommand.current = cmd.id
        run(cmd)
        updateDoc(doc(db, 'users', user.uid, 'devices', myId), { command: deleteField() }).catch(() => {})
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
          p.playFrom(cmd.payload.tracks, cmd.payload.index || 0, cmd.payload.time || 0)
          toast(`Playing here${from}`)
        }
        break
      default:
    }
  }

  /* ── public API ─────────────────────────────────────────────────── */
  const sendCommand = useCallback(
    (targetId, type, payload) => {
      if (!user) return
      const cmd = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, at: Date.now(), from: myId, fromName: myName }
      if (payload !== undefined) cmd.payload = payload
      updateDoc(doc(db, 'users', user.uid, 'devices', targetId), { command: cmd }).catch(() => toast('That device didn’t respond.'))
    },
    [user, myId, myName, toast],
  )

  /** Move what's playing here onto another device. */
  const sendHere = useCallback(
    (target) => {
      const p = playerRef.current
      if (!p.current) return
      sendCommand(target.id, 'playFrom', {
        tracks: p.queue.slice(p.index, p.index + 50).map(strip),
        index: 0,
        time: p.getTime(),
      })
      if (p.playing) p.toggle()
      toast(`Playing on ${target.name}`)
    },
    [sendCommand, toast],
  )

  /** Take over what another device is playing. */
  const takeOver = useCallback(
    (source) => {
      const s = source.state
      if (!s?.track) return
      const elapsed = s.playing ? (Date.now() - s.at) / 1000 : 0
      const tracks = s.queue?.length ? s.queue : [s.track]
      playerRef.current.playFrom(tracks, 0, (s.position || 0) + elapsed)
      if (s.playing) sendCommand(source.id, 'pause')
      toast(`Moved here from ${source.name}`)
    },
    [sendCommand, toast],
  )

  const renameDevice = useCallback(
    (name) => {
      const clean = name.trim().slice(0, 40) || describeDevice().name
      localStorage.setItem('mono:device-name', clean)
      setMyName(clean)
    },
    [],
  )

  const now = Date.now()
  const list = devices
    .map((d) => ({ ...d, online: now - (d.lastSeen || 0) < ONLINE_MS, me: d.id === myId }))
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
    forgetDevice: (id) => user && deleteDoc(doc(db, 'users', user.uid, 'devices', id)).catch(() => {}),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useCloud = () => useContext(Ctx)
