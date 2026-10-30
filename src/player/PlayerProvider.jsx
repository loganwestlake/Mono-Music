import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { describePlayerError, loadYouTubeApi, PLAYER_VARS } from '../lib/youtube'
import { artistRadio } from '../lib/deezer'
import { load, save } from '../lib/storage'
import { hasProxy } from '../lib/instances'
import { findAlbumVersion } from '../lib/search'
import { forgetStream, prefetchStream, resolveStream } from '../lib/streams'
import { isUnresolved, parseVideoTitle, shuffled, thumbUrl } from '../lib/tracks'
import { useLibrary } from '../store/library'
import { useResolver } from '../store/resolver'
import { useToast } from '../store/toast'
import { useUi } from '../store/ui'

// Touch devices (phones/tablets) stream audio-only by default: lighter, and
// it keeps playing with the screen locked. iOS also needs a media element to
// be "unlocked" by a tap before it may start sound on its own.
const IS_TOUCH = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

// 0.1s of silence, used to unlock media elements on the first tap (iOS).
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

/**
 * The single, app-wide player plus queue.
 *
 * Two engines share one mount point (see ScallopedPlayer → `mountRef`):
 *   stream  — a plain <video> fed by Piped/Invidious. No YouTube player,
 *             so no YouTube ads. Used when "Ad-free playback" is on; up to
 *             MAX_STREAM_TRIES different servers are tried per song.
 *   youtube — the official (youtube-nocookie) embedded player, the last
 *             resort. Ads there can't be removed from outside the iframe,
 *             but they're detected, muted and counted down.
 * Both elements are created once and never moved, so playback continues
 * while the listener browses.
 *
 * Two contexts keep the 4×/sec clock from re-rendering the whole app:
 * usePlayer() for queue/controls, usePlayerTime() for time + ad state.
 */

const PlayerContext = createContext(null)
const TimeContext = createContext({ time: 0, duration: 0, ad: null })

const YT_STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 }
const STALL_MS = 10000
const MAX_STREAM_TRIES = 3
const LISTEN_TICK = 10

const SAVED_DEFAULTS = { queue: [], index: 0, time: 0, volume: 80, shuffle: false, repeat: 'off', original: null, rate: 1 }

export function PlayerProvider({ children }) {
  const library = useLibrary()
  const { resolve } = useResolver()
  const toast = useToast()
  const { adFree, autoplay, muteAds, notifications } = library.settings
  const { viewMode } = useUi()
  const preferAudio = IS_TOUCH && viewMode !== 'video'
  // Play the album recording (YouTube Music "Topic" upload) instead of a
  // video upload when we can: it's the exact audio lyrics are timed to.
  const albumMode = library.settings.albumAudio !== false && viewMode !== 'video'
  const albumModeRef = useRef(albumMode)
  albumModeRef.current = albumMode
  /** The YouTube id actually loaded for a track. */
  const playIdOf = (t) => (albumModeRef.current && t?.playId) || t?.id
  const [saved] = useState(() => load('player', SAVED_DEFAULTS))

  const [queue, setQueue] = useState(saved.queue)
  const [index, setIndex] = useState(Math.min(saved.index, Math.max(0, saved.queue.length - 1)))
  const [original, setOriginal] = useState(saved.original) // pre-shuffle order
  const [shuffle, setShuffle] = useState(saved.shuffle)
  const [repeat, setRepeat] = useState(saved.repeat)
  const [volume, setVolumeState] = useState(saved.volume)
  const [muted, setMuted] = useState(false)
  const [rate, setRateState] = useState(saved.rate || 1)
  const [sleep, setSleepState] = useState(null) // { at: ms } | { endOfTrack: true }

  const [engine, setEngine] = useState(adFree ? 'stream' : 'youtube')
  const [hasVideo, setHasVideo] = useState(false)
  const [ytStatus, setYtStatus] = useState('idle') // idle | loading | ready | blocked
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState(null)
  const [time, setTime] = useState(saved.time || 0)
  const [duration, setDuration] = useState(0)
  const [ad, setAd] = useState(null) // { remaining, elapsed } while a YouTube ad plays
  const [needsTap, setNeedsTap] = useState(false) // iOS: YouTube wants a tap inside its player
  const [mountEl, setMountEl] = useState(null)

  const ytRef = useRef(null)
  const videoRef = useRef(null)
  const audioRef = useRef(null)
  const mediaKindRef = useRef('video') // which element the stream engine is using
  const adRetriedRef = useRef(null)
  const ytHostRef = useRef(null)
  const engineRef = useRef(engine)
  const wantPlayRef = useRef(false) // start playing as soon as the current track loads
  const loadedKeyRef = useRef(null) // `${id}|${requested engine}|${attempt}`
  const tokenRef = useRef(0)
  const triedRef = useRef([]) // stream servers that failed for the current track
  const pendingYtRef = useRef(null)
  const pendingSeekRef = useRef(0)
  const resumeAtRef = useRef(saved.time || 0)
  const streamMetaRef = useRef(null)
  const loggedIdRef = useRef(null)
  const errorStreakRef = useRef(0)
  const adMutedRef = useRef(false)
  const radioBusyRef = useRef(false)
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const rateRef = useRef(rate)
  rateRef.current = rate
  const playingRef = useRef(false)
  playingRef.current = playing

  const current = queue[index] ?? null
  const currentRef = useRef(current)
  currentRef.current = current
  const libRef = useRef(library)
  libRef.current = library

  const switchEngine = (kind) => {
    engineRef.current = kind
    setEngine(kind)
  }

  /* ── Engine-agnostic controls (read refs, so always fresh) ────────── */
  const eng = useMemo(
    () => ({
      isStream: () => engineRef.current === 'stream',
      media: () => (mediaKindRef.current === 'audio' ? audioRef.current : videoRef.current),
      play() {
        if (this.isStream()) this.media()?.play().catch(() => setPlaying(false))
        else ytRef.current?.playVideo?.()
      },
      pause() {
        if (this.isStream()) this.media()?.pause()
        else ytRef.current?.pauseVideo?.()
      },
      seek(s) {
        if (this.isStream()) {
          const m = this.media()
          if (m) m.currentTime = s
        } else ytRef.current?.seekTo?.(s, true)
      },
      time() {
        return (this.isStream() ? this.media()?.currentTime : ytRef.current?.getCurrentTime?.()) || 0
      },
      duration() {
        const d = this.isStream() ? this.media()?.duration : ytRef.current?.getDuration?.()
        return Number.isFinite(d) ? d : 0
      },
      /** Silence whatever isn't the active source. */
      stopInactive() {
        const clear = (m) => {
          if (!m || !m.getAttribute('src') || m.getAttribute('src') === SILENCE) return
          m.pause()
          m.removeAttribute('src')
          m.load()
        }
        if (this.isStream()) {
          ytRef.current?.stopVideo?.()
          clear(mediaKindRef.current === 'audio' ? videoRef.current : audioRef.current)
        } else {
          clear(videoRef.current)
          clear(audioRef.current)
        }
      },
    }),
    [],
  )

  /* ── Common reactions to engine events ────────────────────────────── */
  const handlers = useRef({})

  handlers.current.playing = () => {
    setPlaying(true)
    setBuffering(false)
    setError(null)
    wantPlayRef.current = true
    errorStreakRef.current = 0
    if (!detectAd()) setDuration(eng.duration() || current?.duration || 0)
    const track = current?.pending ? fillMetadata() : current
    if (track && loggedIdRef.current !== track.id) {
      loggedIdRef.current = track.id
      library.addRecent(track)
      library.countPlay(track)
      notify(track)
    }
  }

  handlers.current.paused = () => {
    setPlaying(false)
    setBuffering(false)
    wantPlayRef.current = false
  }

  handlers.current.ended = () => {
    setPlaying(false)
    if (adRef.current) return // an ad finished; the song follows
    if (sleepRef.current?.endOfTrack) {
      setSleepState(null)
      wantPlayRef.current = false
      toast('Sleep timer — goodnight.')
      return
    }
    if (repeat === 'one' || (repeat === 'all' && queue.length === 1)) {
      eng.seek(0)
      eng.play()
    } else if (index < queue.length - 1) {
      wantPlayRef.current = true
      setIndex(index + 1)
    } else if (repeat === 'all') {
      wantPlayRef.current = true
      setIndex(0)
    } else if (autoplay && current) {
      extendWithRadio(current, true)
    } else {
      wantPlayRef.current = false
    }
  }

  handlers.current.ytState = (state) => {
    if (engineRef.current !== 'youtube') return
    if (state === YT_STATE.PLAYING) handlers.current.playing()
    else if (state === YT_STATE.PAUSED) handlers.current.paused()
    else if (state === YT_STATE.BUFFERING) setBuffering(true)
    else if (state === YT_STATE.ENDED) handlers.current.ended()
    else if (state === YT_STATE.CUED) {
      setPlaying(false)
      setBuffering(false)
    }
  }

  handlers.current.ytError = (code) => {
    if (engineRef.current !== 'youtube') return
    setPlaying(false)
    setBuffering(false)
    const message = describePlayerError(code)
    setError(message)
    skipBroken(message)
  }

  handlers.current.streamFailed = () => {
    const track = currentRef.current
    if (engineRef.current !== 'stream' || !track) return
    forgetStream(playIdOf(track))
    const at = eng.time() || pendingSeekRef.current
    if (triedRef.current.length < MAX_STREAM_TRIES) loadStream(at)
    else fallbackToYouTube(at)
  }

  function skipBroken(message) {
    errorStreakRef.current += 1
    const canSkip = queue.length > 1 && errorStreakRef.current < queue.length
    toast(canSkip ? `${message} Skipping…` : message)
    if (canSkip) {
      wantPlayRef.current = true
      setTimeout(() => setIndex((i) => (i + 1) % queue.length), 1200)
    }
  }

  /** Pasted links start as placeholders; fill in the real title/artist. */
  function fillMetadata() {
    const raw = eng.isStream() ? streamMetaRef.current : ytRef.current?.getVideoData?.()
    if (!raw?.title) return current
    const filled = { ...current, ...parseVideoTitle(raw.title, raw.author), duration: eng.duration(), pending: false }
    setQueue((q) => q.map((t) => (t.id === filled.id ? filled : t)))
    return filled
  }

  function notify(track) {
    if (!notifications || !document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return
    try {
      new Notification(track.title, { body: track.artist, icon: track.cover || thumbUrl(track.id), silent: true })
    } catch {
      // some browsers only allow notifications from a service worker
    }
  }

  /* ── YouTube ad detection ─────────────────────────────────────────── */
  // The IFrame API doesn't expose ads, but while one plays the player
  // reports the *ad's* duration. If that's clearly shorter than the song we
  // asked for, an ad is on: mute it and show a countdown.
  const adRef = useRef(null)
  adRef.current = ad
  function detectAd() {
    const yt = ytRef.current
    const track = currentRef.current
    if (engineRef.current !== 'youtube' || !yt || !track) return false
    const expected = (albumModeRef.current && track.playId ? track.playDuration : track.duration) || 0
    const d = yt.getDuration?.() || 0
    const t = yt.getCurrentTime?.() || 0
    const isAd = expected > 30 && d > 0 && d < expected - 8 && d <= 180
    if (isAd) {
      setAd({ remaining: Math.max(0, d - t), elapsed: t })
      if (muteAds && !adMutedRef.current && !yt.isMuted?.()) {
        adMutedRef.current = true
        yt.mute?.()
      }
      // Quietly look for an ad-free copy once per song; the listener just
      // sees "please wait" and a spinner meanwhile.
      if (adFree && adRetriedRef.current !== track.id) {
        adRetriedRef.current = track.id
        handlers.current.escapeAd?.()
      }
    } else if (adRef.current) {
      setAd(null)
      if (adMutedRef.current) {
        adMutedRef.current = false
        if (!muted) yt.unMute?.()
      }
    }
    return isAd
  }

  /* ── Create both engines once a mount point exists ────────────────── */
  useEffect(() => {
    if (!mountEl) return
    let cancelled = false

    const ytHost = document.createElement('div')
    ytHost.className = 'absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full'
    const ytTarget = document.createElement('div')
    ytHost.appendChild(ytTarget)

    const video = document.createElement('video')
    video.className = 'absolute inset-0 h-full w-full bg-[#111]'
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.preload = 'auto'
    video.volume = volumeRef.current / 100

    // Audio-only streams play through <audio>: iOS keeps it going when locked.
    const audio = document.createElement('audio')
    audio.preload = 'auto'
    audio.volume = volumeRef.current / 100

    mountEl.replaceChildren(ytHost, video, audio)
    ytHostRef.current = ytHost
    videoRef.current = video
    audioRef.current = audio

    const wire = (el, kind) => {
      const on = (name, fn) => el.addEventListener(name, fn)
      // Ignore events from the silent clip used to unlock playback on iOS.
      const active = () => {
        const src = el.getAttribute('src')
        return engineRef.current === 'stream' && mediaKindRef.current === kind && !!src && src !== SILENCE
      }
      const when = (fn) => () => active() && fn()
      on('playing', when(() => handlers.current.playing()))
      on('pause', when(() => !el.ended && handlers.current.paused()))
      on('waiting', when(() => setBuffering(true)))
      on('ended', when(() => handlers.current.ended()))
      on(
        'loadedmetadata',
        when(() => {
          setDuration(el.duration || 0)
          setHasVideo(kind === 'video' && el.videoWidth > 0)
          el.playbackRate = rateRef.current
          if (pendingSeekRef.current) el.currentTime = pendingSeekRef.current
          pendingSeekRef.current = 0
        }),
      )
      on('error', when(() => el.getAttribute('src') && handlers.current.streamFailed()))
    }
    wire(video, 'video')
    wire(audio, 'audio')

    // iOS: a media element may only start sound on its own after it has
    // played once inside a tap. Prime both elements on the first taps.
    const unlock = () => {
      for (const el of [video, audio]) {
        if (el.dataset.unlocked || (el.getAttribute('src') && el.getAttribute('src') !== SILENCE)) continue
        el.src = SILENCE
        el.play()
          .then(() => {
            el.dataset.unlocked = '1'
            if (el.getAttribute('src') === SILENCE) el.pause()
          })
          .catch(() => {})
      }
      if (video.dataset.unlocked && audio.dataset.unlocked) {
        window.removeEventListener('touchend', unlock, true)
        window.removeEventListener('click', unlock, true)
      }
    }
    window.addEventListener('touchend', unlock, true)
    window.addEventListener('click', unlock, true)

    setYtStatus('loading')
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return
        ytRef.current = new YT.Player(ytTarget, {
          width: '100%',
          height: '100%',
          host: 'https://www.youtube-nocookie.com',
          playerVars: { ...PLAYER_VARS, origin: window.location.origin },
          events: {
            onReady: (e) => {
              e.target.setVolume(volumeRef.current)
              setYtStatus('ready')
            },
            onStateChange: (e) => handlers.current.ytState(e.data),
            onError: (e) => handlers.current.ytError(e.data),
          },
        })
      })
      .catch(() => !cancelled && setYtStatus('blocked'))

    return () => {
      cancelled = true
      window.removeEventListener('touchend', unlock, true)
      window.removeEventListener('click', unlock, true)
      for (const el of [video, audio]) {
        el.pause()
        el.removeAttribute('src')
        el.load()
      }
      ytRef.current?.destroy?.()
      ytRef.current = null
      videoRef.current = null
      audioRef.current = null
      loadedKeyRef.current = null
      setYtStatus('idle')
    }
  }, [mountEl])

  // Only the active engine is visible.
  useEffect(() => {
    if (ytHostRef.current) ytHostRef.current.style.visibility = engine === 'youtube' ? 'visible' : 'hidden'
    if (videoRef.current) videoRef.current.style.visibility = engine === 'stream' ? 'visible' : 'hidden'
  }, [engine, mountEl])

  /* ── Load whichever track is current ──────────────────────────────── */
  function loadYouTube(start) {
    switchEngine('youtube')
    eng.stopInactive()
    setHasVideo(true)
    const yt = ytRef.current
    if (!yt || ytStatus !== 'ready') {
      pendingYtRef.current = start
      if (ytStatus === 'blocked') reportBlocked()
      return
    }
    pendingYtRef.current = null
    const id = playIdOf(currentRef.current)
    setNeedsTap(false)
    if (wantPlayRef.current) {
      yt.loadVideoById({ videoId: id, startSeconds: start })
      // iOS won't let YouTube start without a tap inside its own player.
      if (IS_IOS) {
        const token = tokenRef.current
        setTimeout(() => {
          if (token === tokenRef.current && engineRef.current === 'youtube' && !playingRef.current) {
            setBuffering(false)
            setNeedsTap(true)
          }
        }, 2500)
      }
    } else yt.cueVideoById({ videoId: id, startSeconds: start })
    yt.setPlaybackRate?.(rateRef.current)
  }

  function reportBlocked() {
    setBuffering(false)
    setError('YouTube couldn’t load. It may be blocked on this network, by your school/work device, or by an ad-blocker.')
  }

  const tippedRef = useRef(false)
  function fallbackToYouTube(start) {
    // Public servers refuse requests from websites (CORS). One gentle tip.
    if (!hasProxy() && !tippedRef.current) {
      tippedRef.current = true
      toast('Ad-free servers are blocking browsers. Set up your free ad-free server to fix it.', {
        action: { label: 'How', run: () => (window.location.hash = '/settings') },
      })
    }
    loadYouTube(start)
  }

  function loadStream(start) {
    const track = currentRef.current
    const token = ++tokenRef.current
    switchEngine('stream')
    eng.stopInactive()
    setBuffering(wantPlayRef.current)
    resolveStream(playIdOf(track), { exclude: triedRef.current, preferAudio })
      .then((src) => {
        if (token !== tokenRef.current) return
        mediaKindRef.current = src.hasVideo ? 'video' : 'audio'
        eng.stopInactive()
        const v = eng.media()
        if (!v) return
        triedRef.current.push(src.base)
        streamMetaRef.current = src.meta
        setHasVideo(src.hasVideo)
        setNeedsTap(false)
        pendingSeekRef.current = start
        v.src = src.url
        if (wantPlayRef.current) {
          v.play().catch(() => setPlaying(false))
          // A stream that never starts is as bad as one that errors.
          setTimeout(() => {
            if (token === tokenRef.current && engineRef.current === 'stream' && !playingRef.current && wantPlayRef.current)
              handlers.current.streamFailed()
          }, STALL_MS)
        }
      })
      .catch(() => token === tokenRef.current && fallbackToYouTube(start))
  }

  useEffect(() => {
    if (!mountEl || !current) return

    // Songs from imports/recommendations need a YouTube match first.
    if (isUnresolved(current)) {
      const qid = current.id
      setResolving(true)
      setBuffering(true)
      resolve(current).then((id) => {
        setResolving(false)
        if (currentRef.current?.id !== qid) return
        if (id) setQueue((q) => q.map((t) => (t.id === qid ? { ...t, id } : t)))
        else {
          setBuffering(false)
          setError('Couldn’t find this song on YouTube.')
          skipBroken('Couldn’t find this song on YouTube.')
        }
      })
      return
    }

    // Look up the album version once per track (max ~2.5s, then carry on).
    if (albumMode && current.playId === undefined && !current.pending) {
      const id = current.id
      setBuffering(true)
      Promise.race([findAlbumVersion(current), new Promise((r) => setTimeout(() => r(null), 2500))]).then((hit) => {
        if (currentRef.current?.id !== id) return
        const usable = hit?.id && hit.id !== id ? hit : null
        setQueue((q) =>
          q.map((t) => (t.id === id ? { ...t, playId: usable ? usable.id : null, playDuration: usable?.duration || 0 } : t)),
        )
      })
      return
    }

    const mode = adFree ? 'stream' : 'youtube'
    const key = `${current.id}|${playIdOf(current)}|${mode}${mode === 'stream' && preferAudio ? '-a' : ''}`
    if (loadedKeyRef.current === key) return

    const sameTrack = loadedKeyRef.current?.startsWith(`${current.id}|`)
    const start = sameTrack ? eng.time() : resumeAtRef.current
    resumeAtRef.current = 0
    loadedKeyRef.current = key
    triedRef.current = []
    tokenRef.current++

    setError(null)
    setAd(null)
    setNeedsTap(false)
    setTime(start)
    setDuration(current.duration || 0)
    setPlaying(false)

    if (mode === 'youtube') return loadYouTube(start)
    loadStream(start)
  }, [mountEl, current, adFree, preferAudio, albumMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // A YouTube load that was waiting for the API.
  useEffect(() => {
    if (engineRef.current !== 'youtube' || !currentRef.current) return
    if (ytStatus === 'ready' && pendingYtRef.current != null) loadYouTube(pendingYtRef.current)
    if (ytStatus === 'blocked') reportBlocked()
  }, [ytStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Get the next song ready while this one plays (match + ad-free source).
  const upcoming = queue[index + 1]
  useEffect(() => {
    if (!playing || !upcoming) return
    const id = setTimeout(async () => {
      const vid = isUnresolved(upcoming) ? await resolve(upcoming) : upcoming.id
      if (vid && vid !== upcoming.id) setQueue((q) => q.map((t) => (t.id === upcoming.id ? { ...t, id: vid } : t)))
      if (!vid) return
      let play = vid
      if (albumMode && upcoming.playId === undefined) {
        const hit = await findAlbumVersion({ ...upcoming, id: vid })
        const usable = hit?.id && hit.id !== vid ? hit : null
        setQueue((q) =>
          q.map((t) => (t.id === vid ? { ...t, playId: usable ? usable.id : null, playDuration: usable?.duration || 0 } : t)),
        )
        if (usable) play = usable.id
      }
      if (adFree) prefetchStream(play, { preferAudio })
    }, 4000)
    return () => clearTimeout(id)
  }, [playing, upcoming, adFree, preferAudio, albumMode, resolve])

  /* ── Clock, ads, sleep timer, listening time ──────────────────────── */
  const sleepRef = useRef(sleep)
  sleepRef.current = sleep
  const listenRef = useRef(0)
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      if (detectAd()) return
      setTime(eng.time())
      if (sleepRef.current?.at && Date.now() >= sleepRef.current.at) {
        eng.pause()
        setSleepState(null)
        toast('Sleep timer — goodnight.')
      }
      listenRef.current += 0.25 * rateRef.current
      if (listenRef.current >= LISTEN_TICK && currentRef.current) {
        libRef.current.addListen(currentRef.current, Math.round(listenRef.current))
        listenRef.current = 0
      }
    }, 250)
    return () => clearInterval(id)
  }, [playing, eng]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Persistence ─────────────────────────────────────────────────── */
  const timeRef = useRef(time)
  timeRef.current = time
  useEffect(() => {
    const persist = () =>
      save('player', { queue: queue.slice(0, 500), index, time: timeRef.current, volume, shuffle, repeat, original, rate })
    persist()
    const id = setInterval(persist, 5000)
    window.addEventListener('pagehide', persist)
    return () => {
      clearInterval(id)
      window.removeEventListener('pagehide', persist)
    }
  }, [queue, index, volume, shuffle, repeat, original, rate])

  /* ── Radio ────────────────────────────────────────────────────────── */
  async function extendWithRadio(seed, continuePlaying) {
    if (radioBusyRef.current) return
    radioBusyRef.current = true
    try {
      const more = await artistRadio(seed.artist, { size: 20, exclude: queue })
      if (!more.length) return
      setQueue((q) => [...q, ...more])
      if (continuePlaying) {
        wantPlayRef.current = true
        setIndex((i) => i + 1)
        toast(`Autoplay: more like ${seed.artist}`)
      }
    } catch {
      wantPlayRef.current = false
    } finally {
      radioBusyRef.current = false
    }
  }

  /* ── Controls ─────────────────────────────────────────────────────── */
  const restartCurrent = useCallback(() => {
    eng.seek(0)
    eng.play()
  }, [eng])

  const playTracks = useCallback(
    (tracks, start = 0) => {
      if (!tracks.length) return
      const first = tracks[start]
      let list = tracks
      let at = start
      if (shuffle) {
        setOriginal(tracks)
        list = [first, ...shuffled(tracks.filter((_, i) => i !== start))]
        at = 0
      } else {
        setOriginal(null)
      }
      wantPlayRef.current = true
      errorStreakRef.current = 0
      setQueue(list)
      setIndex(at)
      if (loadedKeyRef.current?.startsWith(`${first.id}|`)) restartCurrent()
    },
    [shuffle, restartCurrent],
  )

  /** Start a list at a given position (used when moving playback between devices). */
  const playFrom = useCallback(
    (tracks, index = 0, time = 0) => {
      if (!tracks.length) return
      resumeAtRef.current = Math.max(0, time)
      loadedKeyRef.current = null
      wantPlayRef.current = true
      errorStreakRef.current = 0
      setOriginal(null)
      setQueue(tracks)
      setIndex(index)
    },
    [],
  )

  const playTrack = useCallback(
    (track) => {
      wantPlayRef.current = true
      errorStreakRef.current = 0
      if (current?.id === track.id) return restartCurrent()
      setQueue((q) => (q.length ? [...q.slice(0, index + 1), track, ...q.slice(index + 1)] : [track]))
      setIndex((i) => (queue.length ? i + 1 : 0))
    },
    [current, index, queue.length, restartCurrent],
  )

  const playNext = useCallback(
    (track) => {
      setQueue((q) => (q.length ? [...q.slice(0, index + 1), track, ...q.slice(index + 1)] : [track]))
      toast(`“${track.title}” plays next`)
    },
    [index, toast],
  )

  const enqueue = useCallback(
    (track) => {
      setQueue((q) => [...q, track])
      toast(`Added “${track.title}” to the queue`)
    },
    [toast],
  )

  const startRadio = useCallback(
    async (seed) => {
      toast(`Starting ${seed.artist} radio…`)
      try {
        const list = await artistRadio(seed.artist, { size: 30, exclude: [seed] })
        const tracks = seed.id ? [seed, ...list] : list
        if (!tracks.length) return toast('Couldn’t build a radio for this artist.')
        wantPlayRef.current = true
        setOriginal(null)
        setQueue(tracks)
        setIndex(0)
      } catch {
        toast('Couldn’t build a radio right now.')
      }
    },
    [toast],
  )

  const toggle = useCallback(() => {
    if (!current || adRef.current) return
    if (playing) eng.pause()
    else {
      wantPlayRef.current = true
      eng.play()
    }
  }, [playing, current, eng])

  const next = useCallback(() => {
    if (!queue.length) return
    wantPlayRef.current = true
    if (index < queue.length - 1) setIndex(index + 1)
    else if (autoplay && current && repeat !== 'all') extendWithRadio(current, true)
    else if (repeat === 'all' || queue.length > 1) setIndex(0)
    else restartCurrent()
  }, [queue, index, repeat, restartCurrent, autoplay, current]) // eslint-disable-line react-hooks/exhaustive-deps

  const prev = useCallback(() => {
    if (!queue.length) return
    wantPlayRef.current = true
    if (eng.time() > 3 || index === 0) restartCurrent()
    else setIndex(index - 1)
  }, [queue.length, index, restartCurrent, eng])

  const seek = useCallback(
    (seconds) => {
      eng.seek(seconds)
      setTime(seconds)
    },
    [eng],
  )

  const getTime = useCallback(() => eng.time() || timeRef.current, [eng])

  const setVolume = useCallback((v) => {
    setVolumeState(v)
    setMuted(v === 0)
    for (const m of [videoRef.current, audioRef.current]) {
      if (!m) continue
      m.volume = v / 100
      m.muted = v === 0
    }
    ytRef.current?.setVolume?.(v)
    if (v > 0 && !adMutedRef.current) ytRef.current?.unMute?.()
  }, [])

  const toggleMute = useCallback(() => {
    const nextMuted = !muted
    for (const m of [videoRef.current, audioRef.current]) if (m) m.muted = nextMuted
    if (nextMuted) ytRef.current?.mute?.()
    else if (!adMutedRef.current) ytRef.current?.unMute?.()
    setMuted(nextMuted)
    if (!nextMuted && volume === 0) setVolume(50)
  }, [muted, volume, setVolume])

  const setRate = useCallback((r) => {
    setRateState(r)
    for (const m of [videoRef.current, audioRef.current]) if (m) m.playbackRate = r
    ytRef.current?.setPlaybackRate?.(r)
  }, [])

  const setSleep = useCallback(
    (option) => {
      if (option == null) {
        setSleepState(null)
        return toast('Sleep timer off')
      }
      if (option === 'track') {
        setSleepState({ endOfTrack: true })
        return toast('Stopping after this song')
      }
      setSleepState({ at: Date.now() + option * 60000 })
      toast(`Sleep timer: ${option} minutes`)
    },
    [toast],
  )

  /** Try to get past a YouTube ad by switching this song to an ad-free source (silently). */
  handlers.current.escapeAd = () => {
    const track = currentRef.current
    if (!track) return
    const token = tokenRef.current
    resolveStream(playIdOf(track), { exclude: [], preferAudio })
      .then(() => {
        if (token !== tokenRef.current || currentRef.current?.id !== track.id) return
        setAd(null)
        adMutedRef.current = false
        ytRef.current?.unMute?.()
        triedRef.current = []
        loadedKeyRef.current = `${track.id}|${playIdOf(track)}|stream${preferAudio ? '-a' : ''}`
        tokenRef.current++
        loadStream(0)
      })
      .catch(() => {})
  }

  const jump = useCallback((i) => {
    wantPlayRef.current = true
    setIndex(i)
  }, [])

  const removeAt = useCallback(
    (i) => {
      if (i === index) return
      setQueue((q) => q.filter((_, n) => n !== i))
      if (i < index) setIndex(index - 1)
    },
    [index],
  )

  /** Replace everything after the current song (drag-to-reorder). */
  const setUpcoming = useCallback((list) => setQueue((q) => [...q.slice(0, index + 1), ...list]), [index])

  const clearUpcoming = useCallback(() => setQueue((q) => q.slice(0, index + 1)), [index])

  const toggleShuffle = useCallback(() => {
    if (!shuffle) {
      setOriginal(queue)
      if (current) {
        setQueue([current, ...shuffled(queue.filter((_, i) => i !== index))])
        setIndex(0)
      }
    } else if (original) {
      const at = current ? original.findIndex((t) => t.id === current.id) : -1
      if (at >= 0) {
        setQueue(original)
        setIndex(at)
      }
      setOriginal(null)
    }
    setShuffle(!shuffle)
  }, [shuffle, queue, current, index, original])

  const cycleRepeat = useCallback(() => setRepeat((r) => ({ off: 'all', all: 'one', one: 'off' })[r]), [])

  /** Native picture-in-picture for the ad-free <video> (browsers without Document PiP). */
  const videoPictureInPicture = useCallback(async () => {
    const v = videoRef.current
    if (!v || engineRef.current !== 'stream' || !document.pictureInPictureEnabled || !v.videoWidth) return false
    await v.requestPictureInPicture()
    return true
  }, [])

  /* ── OS media controls, tab title ─────────────────────────────────── */
  useEffect(() => {
    document.title = current ? `${current.title} · ${current.artist} — Mono Music` : 'Mono Music'
    if (!('mediaSession' in navigator) || !current) return
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: 'Mono Music',
      artwork: [{ src: current.cover || thumbUrl(current.id), sizes: '480x360', type: 'image/jpeg' }],
    })
  }, [current])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const set = (action, fn) => {
      try {
        navigator.mediaSession.setActionHandler(action, fn)
      } catch {
        // unsupported action
      }
    }
    set('play', toggle)
    set('pause', toggle)
    set('nexttrack', next)
    set('previoustrack', prev)
    set('seekto', (d) => d.seekTime != null && seek(d.seekTime))
  }, [toggle, next, prev, seek])

  const status = engine === 'stream' ? 'ready' : ytStatus

  const value = useMemo(
    () => ({
      mountRef: setMountEl,
      engine,
      hasVideo,
      status,
      error,
      resolving,
      queue,
      index,
      current,
      playing,
      buffering,
      shuffle,
      repeat,
      volume,
      muted,
      rate,
      sleep,
      playTracks,
      playTrack,
      playFrom,
      playNext,
      enqueue,
      startRadio,
      toggle,
      next,
      prev,
      seek,
      getTime,
      setVolume,
      toggleMute,
      setRate,
      setSleep,
      needsTap,
      duration: duration || current?.duration || 0,
      loading: !!ad || resolving || (buffering && wantPlayRef.current),
      jump,
      removeAt,
      setUpcoming,
      clearUpcoming,
      toggleShuffle,
      cycleRepeat,
      videoPictureInPicture,
    }),
    [engine, hasVideo, status, error, resolving, queue, index, current, playing, buffering, shuffle, repeat, volume,
      muted, rate, sleep, playTracks, playTrack, playFrom, playNext, enqueue, startRadio, toggle, next, prev, seek, getTime,
      setVolume, toggleMute, setRate, setSleep, needsTap, ad, duration, jump, removeAt, setUpcoming, clearUpcoming, toggleShuffle,
      cycleRepeat, videoPictureInPicture],
  )

  const timeValue = useMemo(
    () => ({ time, duration: duration || current?.duration || 0, ad }),
    [time, duration, current, ad],
  )

  return (
    <PlayerContext.Provider value={value}>
      <TimeContext.Provider value={timeValue}>{children}</TimeContext.Provider>
    </PlayerContext.Provider>
  )
}

export const usePlayer = () => useContext(PlayerContext)
export const usePlayerTime = () => useContext(TimeContext)
