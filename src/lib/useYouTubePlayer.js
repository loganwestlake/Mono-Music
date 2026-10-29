import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Minimal wrapper around the YouTube IFrame Player API.
 *
 * YouTube stays a silent backend: the player renders without any of its own
 * chrome (controls=0, no annotations, no related videos) and Mono Music
 * drives playback through the returned handlers.
 */

let apiPromise
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        previous?.()
        resolve(window.YT)
      }
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(script)
    })
  }
  return apiPromise
}

const PLAYER_VARS = {
  autoplay: 0,
  controls: 0,
  disablekb: 1,
  fs: 0,
  iv_load_policy: 3, // hide annotations
  modestbranding: 1,
  playsinline: 1,
  rel: 0,
}

export function useYouTubePlayer(videoId, { onEnded } = {}) {
  const mountRef = useRef(null)
  const playerRef = useRef(null)
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded
  const playingRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // Create the player once.
  useEffect(() => {
    let cancelled = false
    loadYouTubeApi().then((YT) => {
      if (cancelled || !mountRef.current) return
      // YouTube replaces its target node with an <iframe>, so hand it a
      // child we create ourselves rather than a node React owns.
      const target = document.createElement('div')
      mountRef.current.replaceChildren(target)
      playerRef.current = new YT.Player(target, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: PLAYER_VARS,
        events: {
          onReady: (e) => {
            setReady(true)
            setDuration(e.target.getDuration() || 0)
          },
          onStateChange: (e) => {
            const isPlaying = e.data === YT.PlayerState.PLAYING
            setPlaying(isPlaying)
            // An ended track still counts as "in a listening session", so
            // the next one starts automatically.
            if (e.data !== YT.PlayerState.ENDED) playingRef.current = isPlaying
            if (e.data === YT.PlayerState.PLAYING) setDuration(e.target.getDuration() || 0)
            if (e.data === YT.PlayerState.ENDED) onEndedRef.current?.()
          },
        },
      })
    })
    return () => {
      cancelled = true
      playerRef.current?.destroy?.()
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swap tracks without rebuilding the player.
  useEffect(() => {
    const player = playerRef.current
    if (!ready || !player) return
    if (player.getVideoData?.().video_id === videoId) return
    // Keep the music going if a track was already playing.
    playingRef.current ? player.loadVideoById(videoId) : player.cueVideoById(videoId)
    setCurrentTime(0)
    setDuration(0)
  }, [videoId, ready])

  // Poll the clock while playing.
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setCurrentTime(playerRef.current?.getCurrentTime?.() || 0)
    }, 250)
    return () => clearInterval(id)
  }, [playing])

  const toggle = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    playing ? player.pauseVideo() : player.playVideo()
  }, [playing])

  const play = useCallback(() => playerRef.current?.playVideo(), [])

  const seek = useCallback((seconds) => {
    playerRef.current?.seekTo(seconds, true)
    setCurrentTime(seconds)
  }, [])

  return { mountRef, ready, playing, currentTime, duration, toggle, play, seek }
}

export function formatTime(seconds = 0) {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
