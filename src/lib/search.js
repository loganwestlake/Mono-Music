import { parseIsoDuration, parseVideoTitle } from './tracks'

/**
 * Song search. Tries, in order:
 *   1. The official YouTube Data API, when the listener has pasted their own
 *      key into Settings (kept only in their browser).
 *   2. Public Piped / Invidious instances (no key, best effort; these are
 *      community servers and come and go).
 * Results are normalised to tracks: { id, title, artist, duration }.
 */

const PIPED = ['https://pipedapi.kavin.rocks', 'https://pipedapi.adminforge.de', 'https://api.piped.private.coffee']
const INVIDIOUS = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de', 'https://yewtu.be']

const cache = new Map()

export class SearchError extends Error {}

export async function searchTracks(query, { apiKey } = {}) {
  const q = query.trim()
  if (!q) return { tracks: [], source: null }
  const key = apiKey
  const cacheKey = `${key ? 'yt' : 'pub'}:${q.toLowerCase()}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  let result
  if (key) {
    result = { tracks: await searchYouTube(q, key), source: 'YouTube' }
  } else {
    result = await searchPublic(q)
  }
  cache.set(cacheKey, result)
  return result
}

/* ── YouTube Data API v3 ─────────────────────────────────────────────── */

async function searchYouTube(q, key) {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    videoCategoryId: '10', // Music
    maxResults: '25',
    q,
    key,
  })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded')
      throw new SearchError('Daily YouTube search limit reached. Try again tomorrow.')
    if (reason === 'keyInvalid' || res.status === 400)
      throw new SearchError('The YouTube API key is invalid. Check it in Settings.')
    throw new SearchError(data?.error?.message || 'YouTube search failed.')
  }

  const items = (data.items || []).filter((i) => i.id?.videoId)
  const ids = items.map((i) => i.id.videoId)
  const durations = await fetchDurations(ids, key).catch(() => ({}))

  return items.map((i) => {
    const { title, artist } = parseVideoTitle(decodeEntities(i.snippet.title), decodeEntities(i.snippet.channelTitle))
    return { id: i.id.videoId, title, artist, duration: durations[i.id.videoId] || 0 }
  })
}

async function fetchDurations(ids, key) {
  if (!ids.length) return {}
  const params = new URLSearchParams({ part: 'contentDetails', id: ids.join(','), key })
  const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`)
  if (!res.ok) return {}
  const data = await res.json()
  return Object.fromEntries((data.items || []).map((v) => [v.id, parseIsoDuration(v.contentDetails?.duration)]))
}

function decodeEntities(text = '') {
  const el = document.createElement('textarea')
  el.innerHTML = text
  return el.value
}

/* ── Public, key-less instances ─────────────────────────────────────── */

let preferred = null // remember whichever instance answered last

async function searchPublic(q) {
  const all = [
    ...PIPED.map((base) => ({ base, run: () => searchPiped(base, q) })),
    ...INVIDIOUS.map((base) => ({ base, run: () => searchInvidious(base, q) })),
  ]
  const attempts = [...all.filter((a) => a.base === preferred), ...all.filter((a) => a.base !== preferred)]

  for (const attempt of attempts) {
    try {
      const tracks = await attempt.run()
      if (tracks.length) {
        preferred = attempt.base
        return { tracks, source: new URL(attempt.base).hostname }
      }
    } catch {
      // try the next one
    }
  }
  throw new SearchError(
    'Search servers are unavailable right now. Paste a YouTube link instead, or add a YouTube API key in Settings.',
  )
}

async function getJson(url, ms = 6000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(String(res.status))
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function searchPiped(base, q) {
  const data = await getJson(`${base}/search?q=${encodeURIComponent(q)}&filter=music_songs`)
  let items = (data.items || []).filter((i) => i.type === 'stream' && i.url)
  if (!items.length) {
    const fallback = await getJson(`${base}/search?q=${encodeURIComponent(q)}&filter=videos`)
    items = (fallback.items || []).filter((i) => i.type === 'stream' && i.url)
  }
  return items.slice(0, 25).map((i) => {
    const id = new URL(i.url, 'https://youtube.com').searchParams.get('v')
    const { title, artist } = parseVideoTitle(i.title, i.uploaderName)
    return { id, title, artist, duration: i.duration > 0 ? i.duration : 0 }
  }).filter((t) => t.id)
}

async function searchInvidious(base, q) {
  const data = await getJson(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`)
  return (Array.isArray(data) ? data : [])
    .filter((i) => i.type === 'video' && i.videoId)
    .slice(0, 25)
    .map((i) => {
      const { title, artist } = parseVideoTitle(i.title, i.author)
      return { id: i.videoId, title, artist, duration: i.lengthSeconds || 0 }
    })
}
