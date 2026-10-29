/**
 * Music metadata from Deezer's public API (charts, artists, related
 * artists, top tracks) — used for recommendations, artist pages, radio and
 * onboarding. Deezer sends no CORS headers, so this uses JSONP.
 *
 * Deezer tracks have no YouTube id yet; they become "unresolved" tracks
 * (`id: 'q:…'`) that the player matches to a YouTube video on demand.
 */
import { unresolvedId } from './tracks'

export function jsonp(url, ms = 8000) {
  return new Promise((resolve, reject) => {
    const cb = `__mono_${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')
    const cleanup = () => {
      clearTimeout(timer)
      delete window[cb]
      script.remove()
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('timeout'))
    }, ms)
    window[cb] = (data) => {
      cleanup()
      data?.error ? reject(new Error(data.error.message || 'deezer error')) : resolve(data)
    }
    script.onerror = () => {
      cleanup()
      reject(new Error('failed'))
    }
    script.src = `${url}${url.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`
    document.head.appendChild(script)
  })
}

const API = 'https://api.deezer.com'
const memo = new Map()
function cached(key, fn, ttl = 30 * 60 * 1000) {
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.promise
  const promise = fn().catch((err) => {
    memo.delete(key)
    throw err
  })
  memo.set(key, { at: Date.now(), promise })
  return promise
}

export function toTrack(t) {
  const artist = t.artist?.name ?? 'Unknown artist'
  return {
    id: unresolvedId(artist, t.title_short || t.title),
    title: t.title_short || t.title,
    artist,
    duration: t.duration || 0,
    cover: t.album?.cover_xl || t.album?.cover_big || t.album?.cover_medium || null,
  }
}

const toArtist = (a) => ({
  id: a.id,
  name: a.name,
  picture: a.picture_xl || a.picture_big || a.picture_medium || null,
  fans: a.nb_fan || 0,
})

export const chartTracks = (limit = 50) =>
  cached(`chart-tracks-${limit}`, () => jsonp(`${API}/chart/0/tracks?limit=${limit}`).then((d) => (d.data || []).map(toTrack)))

export const chartArtists = (limit = 30) =>
  cached(`chart-artists-${limit}`, () => jsonp(`${API}/chart/0/artists?limit=${limit}`).then((d) => (d.data || []).map(toArtist)))

export const findArtist = (name) =>
  cached(`artist-${name.toLowerCase()}`, () =>
    jsonp(`${API}/search/artist?q=${encodeURIComponent(name)}&limit=1`).then((d) => (d.data?.[0] ? toArtist(d.data[0]) : null)),
  )

export const artistDetails = (id) => cached(`artist-id-${id}`, () => jsonp(`${API}/artist/${id}`).then(toArtist))

export const artistTop = (id, limit = 10) =>
  cached(`top-${id}-${limit}`, () => jsonp(`${API}/artist/${id}/top?limit=${limit}`).then((d) => (d.data || []).map(toTrack)))

export const relatedArtists = (id, limit = 12) =>
  cached(`related-${id}`, () => jsonp(`${API}/artist/${id}/related?limit=${limit}`).then((d) => (d.data || []).map(toArtist)))

const key = (t) => `${t.artist}|${t.title}`.toLowerCase()

function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * "Radio" for an artist: their hits mixed with hits from similar artists.
 */
export async function artistRadio(artistName, { size = 30, exclude = [] } = {}) {
  const seed = await findArtist(artistName)
  if (!seed) return []
  const [own, related] = await Promise.all([artistTop(seed.id, 10), relatedArtists(seed.id, 10)])
  const others = await Promise.allSettled(related.slice(0, 8).map((a) => artistTop(a.id, 4)))
  const pool = [...own.slice(0, 6), ...others.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))]
  const skip = new Set(exclude.map(key))
  const seen = new Set()
  return shuffle(pool)
    .filter((t) => !skip.has(key(t)) && !seen.has(key(t)) && seen.add(key(t)))
    .slice(0, size)
}

/**
 * "You might be interested in": weighs the artists you play and like most,
 * walks to similar artists, and returns their hits you haven't heard yet.
 */
export async function recommendations({ recent = [], liked = [], plays = {}, favourites = [] }, size = 24) {
  const weight = new Map()
  const bump = (name, w) => name && weight.set(name, (weight.get(name) ?? 0) + w)
  Object.values(plays).forEach((p) => bump(p.track?.artist, Math.min(p.count, 20)))
  liked.forEach((t) => bump(t.artist, 3))
  recent.slice(0, 20).forEach((t, i) => bump(t.artist, 2 - i / 20))
  favourites.forEach((a) => bump(a.name, 2))

  const seeds = [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name]) => name)
  if (!seeds.length) return { seeds: [], tracks: (await chartTracks(30)).slice(0, size) }

  const heard = new Set([...recent, ...liked, ...Object.values(plays).map((p) => p.track)].filter(Boolean).map(key))
  const heardArtists = new Set(seeds.map((s) => s.toLowerCase()))

  const found = await Promise.allSettled(seeds.map((s) => findArtist(s)))
  const seedArtists = found.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
  const relatedLists = await Promise.allSettled(seedArtists.map((a) => relatedArtists(a.id, 8)))
  const candidates = relatedLists
    .flatMap((r) => (r.status === 'fulfilled' ? r.value.slice(0, 5) : []))
    .filter((a) => !heardArtists.has(a.name.toLowerCase()))
  const uniqueArtists = [...new Map(candidates.map((a) => [a.id, a])).values()].slice(0, 14)

  const tops = await Promise.allSettled([
    ...uniqueArtists.map((a) => artistTop(a.id, 3)),
    ...seedArtists.map((a) => artistTop(a.id, 8)),
  ])
  const pool = tops.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).filter((t) => !heard.has(key(t)))
  const seen = new Set()
  return {
    seeds,
    tracks: shuffle(pool)
      .filter((t) => !seen.has(key(t)) && seen.add(key(t)))
      .slice(0, size),
  }
}
