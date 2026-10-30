import { fetchJson, invidiousInstances, pipedInstances, reportInstance } from './instances'
import { parseIsoDuration, parseVideoTitle } from './tracks'

/**
 * Song search. Tries, in order:
 *   1. The official YouTube Data API, when the listener has pasted their own
 *      key into Settings (kept only in their browser).
 *   2. Public Piped / Invidious instances (no key, best effort; these are
 *      community servers and come and go).
 * Results are normalised to tracks: { id, title, artist, duration }.
 */

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

/** Race healthy instances in small waves; first non-empty answer wins. */
export async function raceInstances(makePiped, makeInvidious, { wave = 3, waves = 3 } = {}) {
  const piped = pipedInstances()
  const inv = invidiousInstances()
  const attempts = []
  for (let i = 0; i < Math.max(piped.length, inv.length); i++) {
    if (piped[i] && makePiped) attempts.push({ base: piped[i], run: () => makePiped(piped[i]) })
    if (inv[i] && makeInvidious) attempts.push({ base: inv[i], run: () => makeInvidious(inv[i]) })
  }
  for (let w = 0; w < waves && attempts.length; w++) {
    const batch = attempts.splice(0, wave)
    try {
      return await Promise.any(
        batch.map(({ base, run }) =>
          run().then(
            (value) => {
              if (Array.isArray(value) ? !value.length : !value) throw new Error('empty')
              reportInstance(base, true)
              return { value, base }
            },
            (err) => {
              reportInstance(base, false, err)
              throw err
            },
          ),
        ),
      )
    } catch {
      // next wave
    }
  }
  throw new Error('No instance answered')
}

async function searchPublic(q) {
  try {
    const { value, base } = await raceInstances(
      (base) => searchPiped(base, q),
      (base) => searchInvidious(base, q),
    )
    return { tracks: value, source: new URL(base).hostname }
  } catch {
    throw new SearchError(
      'Search servers are unavailable right now. Paste a YouTube link instead, or add a YouTube API key in Settings.',
    )
  }
}

export const getJson = (url, ms = 6000) => fetchJson(url, ms)

async function searchPiped(base, q) {
  const data = await getJson(`${base}/search?q=${encodeURIComponent(q)}&filter=music_songs`)
  let items = (data.items || []).filter((i) => i.type === 'stream' && i.url)
  if (!items.length) {
    const fallback = await getJson(`${base}/search?q=${encodeURIComponent(q)}&filter=videos`)
    items = (fallback.items || []).filter((i) => i.type === 'stream' && i.url)
  }
  return items
    .slice(0, 25)
    .map((i) => {
      const id = new URL(i.url, 'https://youtube.com').searchParams.get('v')
      const { title, artist } = parseVideoTitle(i.title, i.uploaderName)
      return { id, title, artist, duration: i.duration > 0 ? i.duration : 0 }
    })
    .filter((t) => t.id)
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

/* ── YouTube playlists (for import) ─────────────────────────────────── */

export async function fetchYouTubePlaylist(listId) {
  const { value } = await raceInstances(
    async (base) => {
      let data = await getJson(`${base}/playlists/${listId}`, 9000)
      const name = data.name
      let items = data.relatedStreams || []
      for (let page = 0; data.nextpage && page < 20; page++) {
        data = await getJson(`${base}/nextpage/playlists/${listId}?nextpage=${encodeURIComponent(data.nextpage)}`, 9000)
        items = items.concat(data.relatedStreams || [])
      }
      return { name, tracks: items.map((i) => fromStreamItem(i)).filter((t) => t.id) }
    },
    async (base) => {
      const data = await getJson(`${base}/api/v1/playlists/${listId}`, 9000)
      return {
        name: data.title,
        tracks: (data.videos || []).map((v) => {
          const { title, artist } = parseVideoTitle(v.title, v.author)
          return { id: v.videoId, title, artist, duration: v.lengthSeconds || 0 }
        }),
      }
    },
    { wave: 3, waves: 2 },
  )
  return value
}

function fromStreamItem(i) {
  const id = new URL(i.url, 'https://youtube.com').searchParams.get('v')
  const { title, artist } = parseVideoTitle(i.title, i.uploaderName)
  return { id, title, artist, duration: i.duration > 0 ? i.duration : 0 }
}

/* ── Matching a song (title + artist) to a YouTube video ───────────── */

const norm = (s = '') => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim()

/**
 * Find the best YouTube video for a known song (imports, recommendations).
 * Prefers results whose duration is close to the original and whose title
 * mentions the song; avoids covers/live/remix unless the song is one.
 */
export async function matchTrack({ title, artist, duration }, { apiKey } = {}) {
  const { tracks } = await searchTracks(`${artist} ${title}`, { apiKey })
  if (!tracks.length) return null
  const wantTitle = norm(title)
  const avoid = /\b(cover|live|karaoke|instrumental|remix|8d|slowed|reverb|sped up|nightcore)\b/
  const score = (t) => {
    const name = norm(`${t.title} ${t.artist}`)
    let s = 0
    if (name.includes(wantTitle)) s += 5
    if (name.includes(norm(artist).split(' ')[0])) s += 3
    if (avoid.test(name) && !avoid.test(wantTitle)) s -= 6
    if (duration && t.duration) s -= Math.min(6, Math.abs(t.duration - duration) / 8)
    return s
  }
  return [...tracks].sort((a, b) => score(b) - score(a))[0]
}

/* ── Album version of a song (for exact lyric timing) ─────────────────
 * YouTube Music's auto-generated "Artist - Topic" uploads are the album
 * recordings — the exact audio lyrics are timed against, with no video
 * intro or skit. Resolves to { id, duration }, or null if there isn't one.
 */
const albumCache = new Map()

export function findAlbumVersion(track) {
  if (albumCache.has(track.id)) return albumCache.get(track.id)
  const wantTitle = norm(cleanForMatch(track.title))
  const wantArtist = norm(track.artist).split(' ')[0]
  const p = raceInstances(
    async (base) => {
      const data = await getJson(`${base}/search?q=${encodeURIComponent(`${track.artist} ${track.title}`)}&filter=music_songs`)
      const items = (data.items || []).filter((i) => i.type === 'stream' && i.url)
      const hit = items.find((i) => {
        const title = norm(cleanForMatch(i.title))
        const by = norm(i.uploaderName || '')
        return (title === wantTitle || title.startsWith(wantTitle) || wantTitle.startsWith(title)) && (!wantArtist || by.includes(wantArtist))
      })
      if (!hit) return null
      return { id: new URL(hit.url, 'https://youtube.com').searchParams.get('v'), duration: hit.duration > 0 ? hit.duration : 0 }
    },
    null,
    { wave: 3, waves: 2 },
  )
    .then(({ value }) => value)
    .catch(() => null)
  albumCache.set(track.id, p)
  return p
}

const cleanForMatch = (t = '') =>
  t
    .replace(/\s*[([][^)\]]*[)\]]/g, '')
    .replace(/\s+(feat|ft)\.?\s.+$/i, '')
    .trim()
