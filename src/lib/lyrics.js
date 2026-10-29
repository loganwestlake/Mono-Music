/**
 * Lyrics from LRCLIB (https://lrclib.net) — free, no key, CORS-enabled.
 * Returns { lines: [{ at, text }], synced: boolean } or null.
 */

const cache = new Map()

export async function fetchLyrics(track) {
  if (!track || track.pending) return null
  if (cache.has(track.id)) return cache.get(track.id)

  const result = await lookup(track).catch(() => null)
  cache.set(track.id, result)
  return result
}

async function lookup({ title, artist, duration }) {
  const byFields = new URLSearchParams({ track_name: title, artist_name: artist })
  let hits = await search(byFields)
  if (!hits.length) hits = await search(new URLSearchParams({ q: `${artist} ${title}` }))
  if (!hits.length) return null

  // Prefer synced lyrics whose length matches the video.
  const score = (h) =>
    (h.syncedLyrics ? 0 : 1000) + (duration && h.duration ? Math.abs(h.duration - duration) : 0)
  const best = [...hits].filter((h) => !h.instrumental).sort((a, b) => score(a) - score(b))[0]
  if (!best) return null

  if (best.syncedLyrics) return { synced: true, lines: parseLrc(best.syncedLyrics) }
  if (best.plainLyrics) {
    return {
      synced: false,
      lines: best.plainLyrics.split('\n').map((text, i) => ({ at: i, text: text.trim() })).filter((l) => l.text),
    }
  }
  return null
}

async function search(params) {
  const res = await fetch(`https://lrclib.net/api/search?${params}`)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

export function parseLrc(lrc) {
  const lines = []
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const [, m, s] of stamps) lines.push({ at: Number(m) * 60 + Number(s), text })
  }
  return lines.filter((l) => l.text).sort((a, b) => a.at - b.at)
}
