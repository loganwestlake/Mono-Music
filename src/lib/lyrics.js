/**
 * Lyrics from LRCLIB (https://lrclib.net) — free, no key, CORS-enabled.
 *
 * Timing matters: the same song exists in several versions (album, radio
 * edit, music video with an intro…) and synced lyrics only line up with the
 * version they were timed against. So we fetch every candidate once, then
 * pick by the *actual* length of what's playing:
 *   · synced lyrics within ±3s of the real duration → synced
 *   · within ±10s → synced but flagged "approximate" (tap-to-sync helps)
 *   · otherwise → shown unsynced rather than guessing
 */

const cache = new Map()

/** All lyric candidates for a track (cached per track). */
export function fetchCandidates(track) {
  if (!track || track.pending) return Promise.resolve([])
  if (!cache.has(track.id)) cache.set(track.id, lookup(track).catch(() => []))
  return cache.get(track.id)
}

/** Clean up YouTube-style titles: "Song (feat. X) [Remastered 2011]" → "Song". */
export function cleanSongTitle(title = '') {
  return title
    .replace(/\s*[([](feat|ft|with|prod)\.?\s[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([][^)\]]*(remaster|version|edit|mix|audio|video|lyric|visuali[sz]er|explicit|clean|hd|4k)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(\d{4}\s+)?remaster(ed)?.*$/i, '')
    .replace(/\s+(feat|ft)\.?\s.+$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const mainArtist = (artist = '') => artist.split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?|\bwith\b)\s*/i)[0].trim()

async function lookup({ title, artist }) {
  const t = cleanSongTitle(title)
  const a = mainArtist(artist)
  const queries = [
    new URLSearchParams({ track_name: t, artist_name: a }),
    new URLSearchParams({ q: `${a} ${t}` }),
    new URLSearchParams({ track_name: t }),
  ]
  const seen = new Set()
  const out = []
  for (const q of queries) {
    for (const hit of await search(q)) {
      if (seen.has(hit.id) || hit.instrumental) continue
      seen.add(hit.id)
      out.push(hit)
    }
    if (out.some((h) => h.syncedLyrics)) break
  }
  // Keep only hits whose title actually matches what we asked for.
  const want = t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  return out.filter((h) => {
    const got = cleanSongTitle(h.trackName || h.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    return got && (got.includes(want) || want.includes(got))
  })
}

async function search(params) {
  try {
    const res = await fetch(`https://lrclib.net/api/search?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** Choose the best lyrics for what's actually playing (duration in seconds, 0 if unknown). */
export function pickLyrics(candidates, duration) {
  if (!candidates.length) return null
  const synced = candidates.filter((h) => h.syncedLyrics)
  const diff = (h) => (duration && h.duration ? Math.abs(h.duration - duration) : 0)
  const best = [...synced].sort((a, b) => diff(a) - diff(b))[0]

  if (best && (!duration || diff(best) <= 10)) {
    return { synced: true, approx: !duration || diff(best) > 3, lines: parseLrc(best.syncedLyrics) }
  }
  const plain = [...candidates].filter((h) => h.plainLyrics).sort((a, b) => diff(a) - diff(b))[0]
  const text = plain?.plainLyrics || best?.plainLyrics
  if (!text) return null
  return {
    synced: false,
    approx: false,
    lines: text.split('\n').map((line, i) => ({ at: i, text: line.trim() })).filter((l) => l.text),
  }
}

export function parseLrc(lrc) {
  const lines = []
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const [, m, s] of stamps) lines.push({ at: Number(m) * 60 + Number(s), text })
  }
  // Empty timestamped lines mark instrumental breaks; keep one per break.
  return lines
    .sort((a, b) => a.at - b.at)
    .filter((l, i, all) => l.text || (i > 0 && all[i - 1].text))
}
